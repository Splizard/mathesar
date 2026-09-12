from django.http import HttpResponse, JsonResponse
from django.contrib.auth.views import redirect_to_login
from functools import wraps
from mathesar.models.base import Form
import functools

from mathesar.utils.columns import get_columns_meta_data
from mathesar.utils.download_links import get_public_form_conf_for_file_backend


# Auth checks are currently not centralized. Refer https://github.com/mathesar-foundation/mathesar/issues/4846.

def any_of(*guards):
    def _g(request):
        return any(g(request) for g in guards)
    return _g


def all_of(*guards):
    def _g(request):
        return all(g(request) for g in guards)
    return _g


def require(guard, *, unauthorized_response: str = "redirect_to_login"):
    """
    Decorator: allow if `guard(request)` is True, else 401.

    `unauthorized_response` can be:
        - `redirect_to_login` (default)
        - `http_status`
        - `json`
    """
    def decorator(view_func):
        @wraps(view_func)
        def wrapped(request, *args, **kwargs):
            if guard(request) is True:
                return view_func(request, *args, **kwargs)
            return _unauthorized_response(request, unauthorized_response)
        return wrapped
    return decorator


def _unauthorized_response(request, response_mode):
    if response_mode == "json":
        return JsonResponse({"detail": "Unauthorized"}, status=401)

    if response_mode == "http_status":
        return HttpResponse("Unauthorized", status=401)

    return redirect_to_login(request.get_full_path())


def user_is_logged_in(request):
    """Checks if user is authenticated"""
    return request.user.is_authenticated


def has_shared_form(request):
    """
    Checks if a valid shared form token is present in the request
    query params via `?form_token=...`
    """
    return _get_publicly_shared_form_from_request(request) is not None


def user_has_file_backend_access(request):
    if user_is_logged_in(request):
        return True

    if has_shared_form(request):
        public_form_conf_for_file_backend = get_public_form_conf_for_file_backend()
        return public_form_conf_for_file_backend.get("enabled", True) is True

    return False


# A file column is one of type mathesar_types.file, but rather than connect to the
# user's database to check the column's type, this checks for the "file_backend"
# (where its uploads go) that Mathesar sets in the metadata of every file column.
def shared_form_field_column_has_file_backend(request):
    """
    Checks if a field with a file backend is present in a valid shared form detected
    by the query params `?form_token=...&form_field_key=...`
    """
    form_model = _get_publicly_shared_form_from_request(request)
    if not form_model:
        return False

    field_key = request.GET.get("form_field_key")
    if not field_key:
        return False

    form_field = form_model.fields.get(key=field_key)
    if not (form_field and form_field.column_attnum):
        return False

    table_oid = form_field.parent_field.related_table_oid if form_field.parent_field else form_model.base_table_oid
    with form_model.connection as conn:
        column_metadata = get_columns_meta_data(conn, table_oid).get(form_field.column_attnum)
    return column_metadata is not None and column_metadata.get("file_backend") is not None


# Note: This function is memoized on the request object to cache results only
# for the duration of a single request lifecycle.
# If the function parameters change, it should no longer be memoized, and the
# result should be cached ad-hoc.
@functools.cache
def _get_publicly_shared_form_from_request(request):
    """
    Retrieves a shared form instance, returns a cached value when available.

    The form is identified via the `form_token` query parameter and is only
    returned if it is valid and shared publicly.
    """
    try:
        token = request.GET["form_token"]
        return Form.objects.filter(token=token, publish_public=True).first()
    except KeyError:
        return None


# Mathesar specific guards

FILE_ACCESS_VIA_LOGIN_OR_SHARED_FORM_FIELD = (
    any_of(
        user_is_logged_in,
        all_of(
            user_has_file_backend_access,
            shared_form_field_column_has_file_backend
        ),
    )
)
