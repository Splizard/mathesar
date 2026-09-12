"""
Classes and functions exposed to the RPC endpoint for managing the types a database defines for
itself: its enums, its domains, its composite types.

Listing them is `schemas.list_types`, since a type belongs to a schema.
"""
from typing import Optional, TypedDict, Union

from modernrpc.core import REQUEST_KEY

from db.ontology import alter_enum_type, create_enum_type, drop_type
from mathesar.rpc.decorators import mathesar_rpc_method
from mathesar.rpc.utils import connect


class EnumValue(TypedDict):
    """
    A value of an enum, and the value of the enum it used to be.

    Saying which value each one used to be is the only way to tell a value being renamed from one
    being dropped and another added, which are different things to do to a column holding it: a
    rename leaves every record saying what it said, and a drop takes a record's answer away.

    Attributes:
        value: The value.
        was: The value this one is a renaming of, or null for a value being added.
    """
    value: str
    was: Optional[str]


class EnumPatch(TypedDict):
    """
    The parts of an enum which can be changed.

    Attributes:
        name: A new name for the type.
        description: A new description, or null to take the description off.
        values: The values it is to offer, in the order it is to offer them. Every value must
            either say which of the type's values it was, or be a new one.
    """
    name: Optional[str]
    description: Optional[str]
    values: Optional[list[Union[EnumValue, str]]]


@mathesar_rpc_method(name="types.add_enum", auth="login")
def add_enum(
    *,
    schema_oid: int,
    name: str,
    values: list[Union[EnumValue, str]],
    description: Optional[str] = None,
    database_id: int,
    **kwargs,
) -> int:
    """
    Add an enum type to a schema: a choice of values, and nothing else allowed.

    Args:
        schema_oid: The OID of the schema to add it to.
        name: The name to give it, which no other type in the schema may have.
        values: Its values, in the order it is to offer them.
        description: A description of the type.
        database_id: The Django id of the database containing the schema.

    Returns:
        The OID of the new type.
    """
    user = kwargs.get(REQUEST_KEY).user
    with connect(database_id, user) as conn:
        return create_enum_type(conn, schema_oid, name, values, description)


@mathesar_rpc_method(name="types.patch_enum", auth="login")
def patch_enum(
    *, type_oid: int, patch: EnumPatch, database_id: int, **kwargs
) -> int:
    """
    Change an enum's name, its description, or the values it offers.

    Adding a value and renaming one leave every column of the type where it is. Dropping a value or
    putting the values in a different order do not: they are written into every record holding one,
    so the type is built again and each column is moved across, which needs every record's value to
    still be one the type offers.

    Args:
        type_oid: The OID of the enum type.
        patch: The parts of it to change.
        database_id: The Django id of the database containing the type.

    Returns:
        The OID of the type, which is a new one if its values had to be rewritten.
    """
    user = kwargs.get(REQUEST_KEY).user
    with connect(database_id, user) as conn:
        return alter_enum_type(conn, type_oid, patch)


@mathesar_rpc_method(name="types.delete", auth="login")
def delete(
    *, type_oid: int, cascade: bool = False, database_id: int, **kwargs
) -> str:
    """
    Drop a type the database defines for itself, returning its qualified name.

    Args:
        type_oid: The OID of the type.
        cascade: Whether to drop what depends on it, the columns of it included.
        database_id: The Django id of the database containing the type.
    """
    user = kwargs.get(REQUEST_KEY).user
    with connect(database_id, user) as conn:
        return drop_type(conn, type_oid, cascade)
