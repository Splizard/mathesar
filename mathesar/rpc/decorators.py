import datetime
from functools import wraps
import threading
from django.conf import settings
from django.contrib.sessions.models import Session
from django.core.cache import cache
from modernrpc.core import rpc_method, REQUEST_KEY
from modernrpc.auth.basic import (
    http_basic_auth_login_required,
    http_basic_auth_superuser_required,
)
from db.constants import schema_is_internal
from mathesar.analytics import wire_analytics
from mathesar.models import base as models, exceptions
from mathesar.rpc.exceptions.handlers import handle_rpc_exceptions
from mathesar.rpc.utils import connect
from mathesar.utils.download_links import maintain_download_links

MAINTENANCE_DONE = "maintenance_done"
CACHE_TIMEOUT = 1800


def mathesar_rpc_method(*, name, auth="superuser", writes=False):
    """
    Construct a decorator to add RPC functionality to functions.

    Args:
        name: the name of the function that exposed at the RPC endpoint.
        auth: the authorization wrapper for the function.
            - "superuser" (default): only superusers can call it.
            - "login": any logged in user can call it.
            - "anonymous": any user can call it, no login required.
        writes: whether calling it changes the schema it is about, in which case it is refused
            for the schemas the database and Mathesar keep for themselves. Those are explorable
            but never writable; see refuse_internal_schemas.
    """
    authorization_wrap = lambda x: x # noqa
    if auth == "login":
        auth_wrap = http_basic_auth_login_required
        authorization_ignore_list = [
            'analytics.upload_feedback',
            'databases.configured.list',
            'servers.configured.list',
            'users.current_ip_address',
            'users.patch_self',
            'users.password.replace_own',
            # An agent is about the caller rather than about a database.
            'users.agents.add',
            'users.agents.list',
            'users.agents.delete',
            'users.agents.can_issue_certificates',
            'users.agents.provision_certificate',
            'users.agents.revoke_certificate',
        ]
        if name not in authorization_ignore_list:
            authorization_wrap = ensure_db_authorization
    elif auth == "superuser":
        auth_wrap = http_basic_auth_superuser_required
    elif auth == "anonymous":
        auth_wrap = lambda x: x # noqa
    else:
        raise Exception("`auth` must be 'superuser', 'login' or 'anonymous'")

    writes_wrap = refuse_internal_schemas if writes else lambda x: x # noqa

    def combo_decorator(f):
        return rpc_method(name=name)(
            auth_wrap(maintain_models(wire_analytics(handle_rpc_exceptions(
                authorization_wrap(writes_wrap(f))
            ))))
        )
    return combo_decorator


# How to ask the database which schema each kind of thing a call can be about belongs to. A call
# names at most one of these, which is the thing it is about.
SCHEMA_OF_TARGET = {
    'schema_oid': "SELECT %s::oid::regnamespace::text",
    'schema_oids': "SELECT unnest(%s::oid[])::regnamespace::text",
    'table_oid': (
        "SELECT relnamespace::regnamespace::text FROM pg_catalog.pg_class WHERE oid = %s"
    ),
    'type_oid': (
        "SELECT typnamespace::regnamespace::text FROM pg_catalog.pg_type WHERE oid = %s"
    ),
}


def refuse_internal_schemas(f):
    """
    Refuse a call that would write to a schema the database or Mathesar keeps for itself.

    Those schemas describe the user's tables rather than being among them, so Mathesar shows them
    to be read and never to be changed. Hiding the controls would be enough for the pages, but the
    RPC is reachable on its own, so the refusal belongs here where every caller meets it.

    Which schema a call is about has to be asked of the database, an OID saying nothing by itself,
    which costs a query on top of the write it is guarding. That is cheap against a statement that
    changes a table, and these are not the calls anything does in a hurry.
    """
    @wraps(f)
    def wrapper(*args, **kwargs):
        for key, sql in SCHEMA_OF_TARGET.items():
            target = kwargs.get(key)
            if target is None:
                continue
            user = kwargs.get(REQUEST_KEY).user
            with connect(kwargs['database_id'], user) as conn:
                names = [row[0] for row in conn.execute(sql, (target,))]
            internal = sorted({n for n in names if n is not None and schema_is_internal(n)})
            if internal:
                raise exceptions.SchemaIsInternal(
                    f"{', '.join(internal)} belongs to the database rather than to you, and can"
                    " be read but not changed."
                )
            break
        return f(*args, **kwargs)
    return wrapper


def maintain_models(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        if settings.TEST is False and cache.add(MAINTENANCE_DONE, True, CACHE_TIMEOUT):
            threading.Thread(target=run_model_maintenance).start()
        return f(*args, **kwargs)
    return wrapped


def run_model_maintenance():
    Session.objects.filter(
        expire_date__lt=datetime.datetime.now(datetime.timezone.utc)
    ).delete()
    maintain_download_links()


def ensure_db_authorization(f):
    # This is needed for endpoints with "login" auth that don't call connect()
    @wraps(f)
    def wrapper(*args, **kwargs):
        DATABASE_ID_KEY = 'database_id'
        user = kwargs.get(REQUEST_KEY).user
        # An agent reaches a database exactly as far as the person who set it going, so it
        # is that person's reach being asked about here.
        principal = user.database_principal
        if principal.is_superuser:
            return f(*args, **kwargs)
        database_id = kwargs[DATABASE_ID_KEY]
        for candidate in [user, principal]:
            try:
                models.UserDatabaseRoleMap.objects.get(
                    database__id=database_id, user=candidate
                )
            except models.UserDatabaseRoleMap.DoesNotExist:
                continue
            return f(*args, **kwargs)
        raise exceptions.NoConnectionAvailable
    return wrapper
