"""
Classes and functions exposed to the RPC endpoint for managing the types a database defines for
itself: its enums, its domains, its composite types.

Listing them is `schemas.list_types`, since a type belongs to a schema.
"""
from typing import Optional, TypedDict, Union

from modernrpc.core import REQUEST_KEY

from db.ontology import (
    alter_composite_type,
    alter_domain_type,
    alter_enum_type,
    create_composite_type,
    create_domain_type,
    create_enum_type,
    drop_type,
)
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


@mathesar_rpc_method(name="types.add_enum", auth="login", writes=True)
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


@mathesar_rpc_method(name="types.patch_enum", auth="login", writes=True)
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


class DomainRule(TypedDict):
    """
    A rule a domain holds its values to, or one it already holds them to.

    A rule is a CHECK constraint, which is what Postgres has written down, so a rule already on the
    domain is given by the constraint's name and left exactly as it is -- including one somebody
    else wrote, which can be taken off but never edited. A rule being added names which rule it is
    and the value it is about, and is never SQL.

    The rules, and what each takes a value of:
        `not_blank`: there is something other than whitespace in it. No value.
        `min_length`: it is at least this many characters long. A whole number.
        `max_length`: it is at most this many characters long. A whole number.
        `matches`: it matches this regular expression. A pattern.
        `at_least`: it is this value or more. A number, a date, or a time.
        `at_most`: it is this value or less. A number, a date, or a time.
        `positive`: it is more than zero. No value.
        `not_negative`: it is zero or more. No value.

    Which of them a domain can be given follows from the type it is over: text has a length, a
    number has a size, and neither has the other's.

    Attributes:
        name: The name of a rule the domain already has, which is to stay as it is.
        rule: Which rule to add.
        value: The value that rule is about, or null for the rules that take none.
    """
    name: Optional[str]
    rule: Optional[str]
    value: Optional[str]


class DomainSpec(TypedDict):
    """
    What a domain is: another type, and the rules its values are held to.

    Attributes:
        over: The type it is defined over, as a column's type is given: an object with a `name` and
            the `options` that go with it, such as a length or a precision.
        not_null: Whether it disallows NULL.
        default: The value a column of it takes when nothing is given, or null for none. A value,
            never an expression.
        rules: The rules it holds its values to.
        description: A description of the type.
    """
    over: dict
    not_null: Optional[bool]
    default: Optional[str]
    rules: Optional[list[DomainRule]]
    description: Optional[str]


class DomainPatch(TypedDict):
    """
    The parts of a domain which can be changed.

    The type it is defined over is not among them: Postgres cannot change it, and a column of the
    domain would have to be moved to a type that doesn't exist yet. A domain over a different type
    is a new domain, which a column can be moved onto by being given it.

    Attributes:
        name: A new name for the type.
        description: A new description, or null to take the description off.
        not_null: Whether it disallows NULL. Turning it on needs every record in a column of the
            domain to have a value.
        default: A new default value, or null to take the default off.
        rules: The rules it is to hold its values to: the ones it keeps, named, along with the ones
            it is being given. Any rule left out is taken off. Adding a rule needs every record
            already in a column of the domain to satisfy it.
    """
    name: Optional[str]
    description: Optional[str]
    not_null: Optional[bool]
    default: Optional[str]
    rules: Optional[list[DomainRule]]


@mathesar_rpc_method(name="types.add_domain", auth="login", writes=True)
def add_domain(
    *,
    schema_oid: int,
    name: str,
    spec: DomainSpec,
    database_id: int,
    **kwargs,
) -> int:
    """
    Add a domain to a schema: a type with rules of its own on top of another type.

    Args:
        schema_oid: The OID of the schema to add it to.
        name: The name to give it, which no other type in the schema may have.
        spec: The type it is over, and the rules it holds its values to.
        database_id: The Django id of the database containing the schema.

    Returns:
        The OID of the new type.
    """
    user = kwargs.get(REQUEST_KEY).user
    with connect(database_id, user) as conn:
        return create_domain_type(conn, schema_oid, name, spec)


@mathesar_rpc_method(name="types.patch_domain", auth="login", writes=True)
def patch_domain(
    *, type_oid: int, patch: DomainPatch, database_id: int, **kwargs
) -> int:
    """
    Change a domain's name, its description, its default, whether it can be empty, or its rules.

    Args:
        type_oid: The OID of the domain.
        patch: The parts of it to change.
        database_id: The Django id of the database containing the type.

    Returns:
        The OID of the domain, which changing it never replaces.
    """
    user = kwargs.get(REQUEST_KEY).user
    with connect(database_id, user) as conn:
        return alter_domain_type(conn, type_oid, patch)


class CompositeField(TypedDict):
    """
    A field of a composite type, either one it already has or one it is being given.

    Saying which field each one was is the only way to tell a field being renamed from one being
    dropped and another added, which are different things to do to the records holding the type's
    values: a rename leaves every record saying what it said, and a drop takes that part of a
    record away.

    The type of a field the composite type already has is not among what can be changed. Postgres
    refuses to change one while any column anywhere holds the type, because the values are written
    into each of those records and it will not rewrite them; where it would be allowed there is no
    record to lose, and dropping the field and adding one of the type wanted comes to the same
    thing.

    Attributes:
        name: The name the field is to have.
        was: The name of the field this one stands for, or null for a field being added.
        type: The type of its values, as a column's type is given: an object with a `name` and the
            `options` that go with it, such as a length or a precision. Only for a field being
            added.
    """
    name: str
    was: Optional[str]
    type: Optional[dict]


class CompositePatch(TypedDict):
    """
    The parts of a composite type which can be changed.

    Attributes:
        name: A new name for the type.
        description: A new description, or null to take the description off.
        fields: The fields it is to have: the ones it keeps, each saying which field it was, along
            with the ones it is being given. Any field left out is dropped, along with that part of
            every record holding the type's values. A field is added at the end, Postgres having no
            way to put one anywhere else.
    """
    name: Optional[str]
    description: Optional[str]
    fields: Optional[list[CompositeField]]


@mathesar_rpc_method(name="types.add_composite", auth="login", writes=True)
def add_composite(
    *,
    schema_oid: int,
    name: str,
    fields: list[CompositeField],
    description: Optional[str] = None,
    database_id: int,
    **kwargs,
) -> int:
    """
    Add a composite type to a schema: a type whose values are a record of named fields.

    Args:
        schema_oid: The OID of the schema to add it to.
        name: The name to give it, which no other type in the schema may have.
        fields: Its fields, in order, each giving the type of its values.
        description: A description of the type.
        database_id: The Django id of the database containing the schema.

    Returns:
        The OID of the new type.
    """
    user = kwargs.get(REQUEST_KEY).user
    with connect(database_id, user) as conn:
        return create_composite_type(conn, schema_oid, name, fields, description)


@mathesar_rpc_method(name="types.patch_composite", auth="login", writes=True)
def patch_composite(
    *, type_oid: int, patch: CompositePatch, database_id: int, **kwargs
) -> int:
    """
    Change a composite type's name, its description, or its fields.

    Renaming a field and adding one leave every record holding the type's values where it is.
    Dropping a field takes its part of each of those records away.

    Args:
        type_oid: The OID of the composite type.
        patch: The parts of it to change.
        database_id: The Django id of the database containing the type.

    Returns:
        The OID of the type, which changing it never replaces.
    """
    user = kwargs.get(REQUEST_KEY).user
    with connect(database_id, user) as conn:
        return alter_composite_type(conn, type_oid, patch)


@mathesar_rpc_method(name="types.delete", auth="login", writes=True)
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
