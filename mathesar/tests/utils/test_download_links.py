"""
Test download link utility functions.
"""
import datetime
from django.contrib.sessions.models import Session
from unittest.mock import MagicMock
import pytest
from mathesar.models.base import DownloadLink
from mathesar.utils import download_links as dl


def mock_file_link(_, url_name, hmac):
    return f'http://a-link-here/?url_name={url_name}&hmac={hmac}'


def make_request(session_key):
    request = MagicMock()
    request.session = Session.objects.create(
        session_key=session_key,
        expire_date=datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1)
    )
    return request


def make_file(link, mime, backend_key):
    return {"link": link, "mime": mime, "hmac": dl.sign_file(link, mime, backend_key)}


def expected_details(file, name, thumbnail=False):
    hmac = file["hmac"]
    return {
        "attachment": mock_file_link(None, "files_download", hmac),
        "direct": mock_file_link(None, "files_direct", hmac),
        "mimetype": file["mime"],
        "name": name,
        "thumbnail": mock_file_link(None, "files_thumbnail", hmac) if thumbnail else None,
        "uri": file["link"],
    }


BACKEND_KEY = "test_backend"


@pytest.fixture
def backends(monkeypatch):
    def mock_backends():
        return {
            BACKEND_KEY: {
                "protocol": "s3",
                "nickname": "for testing",
                "kwargs": {"bleh": "blah"},
            },
            "test_backend_google": {
                "protocol": "gs",
                "nickname": "for testing google",
                "kwargs": {"bleh": "blah"},
            },
        }

    monkeypatch.setattr(dl, "get_backends", mock_backends)
    monkeypatch.setattr(dl, "_build_file_link", mock_file_link)


def test_get_download_links(backends):
    first_session_key = 'mysupercoolsession',
    request = make_request(first_session_key)

    pic = make_file("s3://bleh/pic.jpeg", "image/jpeg", BACKEND_KEY)
    pdf = make_file("s3://bleh/document.pdf", "application/pdf", BACKEND_KEY)
    # Mathesar signed these, but not like this.
    relabelled = {**pdf, "mime": "text/html"}
    moved = {**pdf, "link": "s3://bleh/secrets.pdf"}

    results = [
        {"1": "abcde", "strcolname": 23423, "files": pic},
        {"1": "defgh", "strcolname": 23412, "files": pdf},
        {"1": "ghijk", "strcolname": 23451, "files": None},  # should not throw error; ignore
        {"1": "ghijk", "strcolname": 23451, "files": {"invalid": "blob"}},  # should not throw error; ignore
        {"1": "ghijk", "strcolname": 23451, "files": relabelled},
        {"1": "ghijk", "strcolname": 23451, "files": moved},
        {"1": "ghijk", "strcolname": 23451, "files": {**pic, "hmac": "v1-forged"}},
        # json(b) columns give strings, never files
        {"1": "ghijk", "strcolname": 23451, "files": '{"link": "a", "mime": null, "hmac": "b"}'},
    ]

    expected_output = {
        "files": {
            pdf["hmac"]: expected_details(pdf, "document.pdf"),
            pic["hmac"]: expected_details(pic, "pic.jpeg", thumbnail=True),
        },
    }

    # Since this is the first call, this should also create DownloadLinks under
    # the hood.
    assert dl.get_download_links(request, results) == expected_output

    download_links = DownloadLink.objects.all()
    assert download_links.count() == 2
    for li in download_links:
        assert li.sessions.filter(session_key=first_session_key).count() == 1
    assert DownloadLink.objects.get(hmac=pdf["hmac"]).mimetype == "application/pdf"

    second_session_key = 'mysupercoolsession2',
    request = make_request(second_session_key)

    # Test with another session.
    assert dl.get_download_links(request, results) == expected_output

    download_links = DownloadLink.objects.all()
    # Should resuse Download links.
    assert download_links.count() == 2
    # Should leave old session, and add new to each Download link.
    for li in download_links:
        assert li.sessions.filter(session_key=first_session_key).count() == 1
        assert li.sessions.filter(session_key=second_session_key).count() == 1


def test_get_download_links_without_mime(backends):
    request = make_request('nomimesession')
    file = make_file("s3://bleh/README", None, BACKEND_KEY)
    assert dl.get_download_links(request, [{"files": file}]) == {
        "files": {file["hmac"]: expected_details(file, "README")},
    }


def test_get_download_links_signed_with_old_key(backends, settings):
    request = make_request('oldkeysession')
    file = make_file("s3://bleh/pic.jpeg", "image/jpeg", BACKEND_KEY)
    old_key = settings.SECRET_KEY
    settings.SECRET_KEY = "a-new-secret-key"
    assert dl.get_download_links(request, [{"files": file}]) == {"files": {}}
    settings.SECRET_KEY_FALLBACKS = [old_key]
    assert dl.get_download_links(request, [{"files": file}]) == {
        "files": {file["hmac"]: expected_details(file, "pic.jpeg", thumbnail=True)},
    }


def test_sign_file_is_versioned():
    assert dl.sign_file("s3://bleh/pic.jpeg", "image/jpeg").startswith("v1-")


def test_sign_file_covers_backend():
    assert (
        dl.sign_file("s3://bleh/pic.jpeg", "image/jpeg", "a")
        != dl.sign_file("s3://bleh/pic.jpeg", "image/jpeg", "b")
    )


def test_get_download_links_azure(monkeypatch):
    """The link/hmac flow is protocol-agnostic and must work for `az://`."""
    request = make_request('azuresession')
    monkeypatch.setattr(dl, "_build_file_link", mock_file_link)

    AZURE_BACKEND_KEY = "azure_backend"

    def mock_backends():
        return {
            AZURE_BACKEND_KEY: {
                "protocol": "az",
                "nickname": "for testing azure",
                "kwargs": {"account_name": "mystorageacct"},
            },
        }

    monkeypatch.setattr(dl, "get_backends", mock_backends)

    pic = make_file(
        "az://mathesar-file-attachments/admin/20250919-192215167015/pic.jpeg", "image/jpeg", AZURE_BACKEND_KEY
    )
    pdf = make_file(
        "az://mathesar-file-attachments/admin/20250919-192215167016/document.pdf",
        "application/pdf",
        AZURE_BACKEND_KEY,
    )

    results = [{"files": pic}, {"files": pdf}]

    assert dl.get_download_links(request, results) == {
        "files": {
            pdf["hmac"]: expected_details(pdf, "document.pdf"),
            pic["hmac"]: expected_details(pic, "pic.jpeg", thumbnail=True),
        },
    }

    for li in DownloadLink.objects.all():
        assert li.fsspec_kwargs == {"account_name": "mystorageacct"}


def test_sign_legacy_file_refs(backends, settings):
    def mash(uri, backend_key, secret=settings.SECRET_KEY):
        return dl._legacy_mash(uri, backend_key, secret)

    old_key = "an-old-secret-key"
    settings.SECRET_KEY_FALLBACKS = [old_key]
    refs = [
        {"uri": "s3://bleh/pic.jpeg", "mash": mash("s3://bleh/pic.jpeg", BACKEND_KEY)},
        {"uri": "gs://bleh/doc.pdf", "mash": mash("gs://bleh/doc.pdf", "test_backend_google")},
        {"uri": "s3://bleh/old.png", "mash": mash("s3://bleh/old.png", BACKEND_KEY, old_key)},
        {"uri": "s3://bleh/forged.png", "mash": "forged"},
        {"uri": "s3://bleh/unsigned.png", "mash": None},
        {"uri": "s3://bleh/gone.png", "mash": mash("s3://bleh/gone.png", "no_longer_configured")},
    ]
    assert dl.sign_legacy_file_refs(refs) == {
        "s3://bleh/pic.jpeg": {
            "mime": "image/jpeg",
            "hmac": dl.sign_file("s3://bleh/pic.jpeg", "image/jpeg", BACKEND_KEY),
        },
        "gs://bleh/doc.pdf": {
            "mime": "application/pdf",
            "hmac": dl.sign_file("gs://bleh/doc.pdf", "application/pdf", "test_backend_google"),
        },
        "s3://bleh/old.png": {
            "mime": "image/png",
            "hmac": dl.sign_file("s3://bleh/old.png", "image/png", BACKEND_KEY),
        },
    }
