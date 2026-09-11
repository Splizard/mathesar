import base64
import cairosvg
import datetime
import hashlib
import io
import json
import mimetypes
import os
import posixpath
from django.conf import settings
from django.contrib.sessions.models import Session
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils.crypto import constant_time_compare, salted_hmac
import fsspec
from PIL import Image, UnidentifiedImageError
import yaml

from mathesar.models import DownloadLink

BACKEND_CONF_ENV = "FILE_STORAGE_DICT"
BACKEND_CONF_YAML = settings.BASE_DIR.joinpath('file_storage.yml')
DEFAULT_BACKEND_KEY = "default"
PUBLIC_FORM_ACCESS_KEY = "public_form_access"
# Prefixes every file HMAC, naming the way it was made, so that a later way can tell its own
# HMACs from these.
FILE_HMAC_VERSION = "v1"


def maintain_download_links():
    DownloadLink.objects.filter(sessions__isnull=True).delete()


def get_link_contents(session_key, download_link_hmac):
    link = get_object_or_404(
        DownloadLink,
        hmac=download_link_hmac,
        sessions=session_key,
    )
    content_type = link.mimetype
    of = fsspec.open(link.uri, "rb", **link.fsspec_kwargs)
    filename = _get_filename_for_uri(link.uri)

    def stream_file():
        with of as f:
            while scoop := f.read(512):
                yield scoop

    return stream_file, filename, content_type


def get_link_thumbnail(session_key, download_link_hmac, width=500, height=500):
    link = get_object_or_404(
        DownloadLink,
        hmac=download_link_hmac,
        sessions=session_key,
    )
    content_type = "image/avif"
    size = width, height
    key = f"{size[0]}x{size[1]}"

    if (thumb_64 := link.thumbnail.get(key)) is None:
        of = fsspec.open(link.uri, "rb", **link.fsspec_kwargs)
        thumbnail = _build_thumbnail_bytes(of, size)
        link.thumbnail[key] = base64.b64encode(thumbnail).decode("utf-8")
        link.save()
    else:
        thumbnail = base64.b64decode(bytes(thumb_64, "utf-8"))

    return thumbnail, content_type


def _build_thumbnail_bytes(of, size, format="AVIF", quality=50):
    img_byte_arr = io.BytesIO()
    with of as f:
        try:
            img = Image.open(f)
        except UnidentifiedImageError:
            f.seek(0)
            interm_bytes = io.BytesIO()
            cairosvg.svg2png(file_obj=f, write_to=interm_bytes)
            img = Image.open(interm_bytes)
        img.thumbnail(size)
        img.save(img_byte_arr, format=format, quality=quality)
    return img_byte_arr.getvalue()


def sign_file(link, mime, backend_key=DEFAULT_BACKEND_KEY):
    """
    Return the HMAC by which Mathesar later knows it stored a file itself.

    It covers the file's link, its media type (which Mathesar serves it as), and
    the backend holding it (whose credentials Mathesar opens it with).
    """
    return _sign_file(link, mime, backend_key, settings.SECRET_KEY)


def _sign_file(link, mime, backend_key, secret):
    digest = salted_hmac(
        "mathesar.utils.download_links.sign_file",
        json.dumps([backend_key, link, mime]),
        secret=secret,
        algorithm="sha256",
    ).hexdigest()
    return f"{FILE_HMAC_VERSION}-{digest}"


def _secrets():
    """Secrets a file may have been signed with, so rotating the key needn't break files."""
    return [settings.SECRET_KEY, *settings.SECRET_KEY_FALLBACKS]


def is_file_value(value):
    """Whether the value is a file as records hold them (a mathesar_types.file)."""
    return (
        isinstance(value, dict)
        and isinstance(value.get("link"), str)
        and isinstance(value.get("hmac"), str)
        and (value.get("mime") is None or isinstance(value.get("mime"), str))
    )


def _verified_backend_key(file, backends):
    """Return the key of the backend the file was signed for, or None if it wasn't signed."""
    if not is_file_value(file):
        return None
    for backend_key in backends:
        for secret in _secrets():
            expected = _sign_file(file["link"], file["mime"], backend_key, secret)
            if constant_time_compare(expected, file["hmac"]):
                return backend_key
    return None


def _get_filename_for_uri(uri):
    return posixpath.split(uri)[-1]


def get_download_links(request, results):
    """
    Return links to the files in the results, keyed by column and then by HMAC.

    Files are recognised by their values alone, which only mathesar_types.file
    columns produce, whether the column holds one file or an array of them.
    """
    files_by_column = {}
    for result in results:
        for column, value in result.items():
            # A column of an array of files holds them in a list
            values = value if isinstance(value, list) else [value]
            for file in filter(is_file_value, values):
                files_by_column.setdefault(column, []).append(file)
    return {
        column: get_links_details(
            request, sync_links(request.session.session_key, files)
        )
        for column, files in files_by_column.items()
    }


def get_links_details(request, links):
    return {
        link.hmac: _get_single_link_details(request, link)
        for link in links
    }


def sync_links(session_key, files):
    """
    Given an iterable of files:
      - keep those Mathesar signed, working out which backend holds each
      - build missing DownloadLinks
      - gather preexisting DownloadLinks
      - Add user's session to all
    """
    links = DownloadLink.objects.bulk_create(
        build_links(files), ignore_conflicts=True
    )
    session = Session.objects.get(session_key=session_key)
    session.downloadlink_set.add(*links)
    return links


def build_links(files):
    """
    Create DownloadLinks for those of the given files Mathesar signed, each able
    to open its file with the credentials of the backend it was signed for.
    """
    backends = get_backends()
    return [
        DownloadLink(
            hmac=file["hmac"],
            uri=file["link"],
            mimetype=file["mime"],
            fsspec_kwargs=backends[backend_key]["kwargs"]
        )
        for (file, backend_key)
        in ((f, _verified_backend_key(f, backends)) for f in files)
        if backend_key is not None
    ]


def save_file(f, request, backend_key=DEFAULT_BACKEND_KEY):
    backend = get_backends()[backend_key]
    now = datetime.datetime.now().strftime('%Y%m%d-%H%M%S%f')
    uri = f"{backend['protocol']}://{backend['prefix']}/{request.user}/{now}/{f.name}"
    of = fsspec.open(uri, mode='xb', **backend["kwargs"])
    with of as destination:
        for chunk in f.chunks():
            destination.write(chunk)

    mime = _mimetype(uri)
    result = {"link": uri, "mime": mime, "hmac": sign_file(uri, mime, backend_key)}
    link = sync_links(request.session.session_key, [result])[0]
    return {
        "result": result,
        "download_link": _get_single_link_details(request, link)
    }


def _get_single_link_details(request, link):

    def _link(url_name):
        return _build_file_link(request, url_name, link.hmac)

    return {
        "uri": link.uri,
        "name": _get_filename_for_uri(link.uri),
        "mimetype": link.mimetype,
        "thumbnail": _link("files_thumbnail") if _is_image(link.mimetype) else None,
        "attachment": _link("files_download"),
        "direct": _link("files_direct"),
    }


def _mimetype(path):
    return mimetypes.guess_type(path or "", strict=False)[0]


def _build_file_link(request, url_name, hmac):
    link_kwargs = {"download_link_hmac": hmac}
    return request.build_absolute_uri(reverse(url_name, kwargs=link_kwargs))


def _is_image(mimetype):
    return (mimetype or "").split("/")[0] == "image"


def get_backends(public_info=False):
    try:
        with open(BACKEND_CONF_YAML, 'r') as f:
            backend_dict = yaml.full_load(f)
    except FileNotFoundError:
        backend_dict = {} or json.loads(os.getenv(BACKEND_CONF_ENV, "{}"))
    if public_info is True:
        return [
            {
                "backend": key,
                "anonymous_access": value.get(PUBLIC_FORM_ACCESS_KEY, {}).get("enabled", True)
            }
            for key, value in backend_dict.items()
        ]
    else:
        return backend_dict


def _legacy_mash(uri, backend_key, secret):
    """How Mathesar signed files before they had a type of their own."""
    return hashlib.sha256(
        secret.encode('utf-8') + backend_key.encode('utf-8') + uri.encode('utf-8')
    ).hexdigest()


def sign_legacy_file_refs(refs):
    """
    Sign the files Mathesar stored before they had a type of their own.

    Only files whose old signature ("mash") verifies are signed: re-signing
    others would vouch for links anyone able to write to the column made up.

    Args:
      refs: The files, as {"uri": <link>, "mash": <signature>} dicts.

    Returns:
      The files to sign, as {<link>: {"mime": <media type>, "hmac": <hmac>}}.
    """
    backends = get_backends()
    signed = {}
    for ref in refs:
        uri, mash = ref.get("uri"), ref.get("mash")
        if not isinstance(uri, str) or not isinstance(mash, str) or uri in signed:
            continue
        for backend_key in backends:
            if any(constant_time_compare(_legacy_mash(uri, backend_key, secret), mash) for secret in _secrets()):
                mime = _mimetype(uri)
                signed[uri] = {"mime": mime, "hmac": sign_file(uri, mime, backend_key)}
                break
    return signed


def get_public_form_conf_for_file_backend(backend_key=DEFAULT_BACKEND_KEY):
    backend = get_backends().get(backend_key, {})
    return backend.get(PUBLIC_FORM_ACCESS_KEY, {})
