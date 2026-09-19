"""
Classes and functions exposed to the RPC endpoint for how one person last left one table.
"""
import json
from typing import Optional, TypedDict

from modernrpc.core import REQUEST_KEY

from mathesar.models.base import UserTableView
from mathesar.rpc.decorators import mathesar_rpc_method

# Far more than any filter a person builds by hand, and little enough that nobody's row can grow
# without bound: this is kept for them on every change they make.
_MAX_VIEW_BYTES = 64 * 1024


class UserTableViewBlob(TypedDict):
    """
    How one person last left one table.

    Both are held as the table view writes them and handed back untouched.

    Attributes:
        filtering: The filter they had on, in the table view's terse form. Null for none.
        hidden_columns: The ids of the columns they had hidden, as strings. Null for none.
    """
    filtering: Optional[list]
    hidden_columns: Optional[list[str]]

    @classmethod
    def from_model(cls, model):
        return cls(filtering=model.filtering, hidden_columns=model.hidden_columns)


@mathesar_rpc_method(name="tables.user_view.get", auth="login")
def get(*, table_oid: int, database_id: int, **kwargs) -> Optional[UserTableViewBlob]:
    """
    Get how the caller last left a table.

    Args:
        table_oid: The PostgreSQL OID of the table.
        database_id: The Django id of the database containing the table.

    Returns:
        What they had on, or null if they have never changed anything on it.
    """
    user = kwargs.get(REQUEST_KEY).user
    model = UserTableView.objects.filter(
        user=user, database_id=database_id, table_oid=table_oid
    ).first()
    return UserTableViewBlob.from_model(model) if model else None


@mathesar_rpc_method(name="tables.user_view.set", auth="login")
def set_(
    *, table_oid: int, view: UserTableViewBlob, database_id: int, **kwargs
) -> None:
    """
    Keep how the caller has just left a table, in place of whatever was kept before.

    Only ever the caller's own: there is no way to read or write anybody else's.

    Args:
        table_oid: The PostgreSQL OID of the table.
        view: What they have on; see UserTableViewBlob.
        database_id: The Django id of the database containing the table.
    """
    filtering = view.get("filtering")
    hidden_columns = view.get("hidden_columns")
    if filtering is not None and not isinstance(filtering, list):
        raise ValueError("filtering must be a list or null")
    if hidden_columns is not None and not (
        isinstance(hidden_columns, list) and all(isinstance(c, str) for c in hidden_columns)
    ):
        raise ValueError("hidden_columns must be a list of strings or null")
    if len(json.dumps([filtering, hidden_columns])) > _MAX_VIEW_BYTES:
        raise ValueError("That is too much to keep for one table")
    user = kwargs.get(REQUEST_KEY).user
    UserTableView.objects.update_or_create(
        user=user,
        database_id=database_id,
        table_oid=table_oid,
        defaults={"filtering": filtering, "hidden_columns": hidden_columns},
    )
