import json
from db import connection as db_conn


def create_enum_type(conn, schema_oid, name, values, description=None):
    """
    Create an enum type: a choice of values, and nothing else allowed.

    Args:
        conn: a psycopg connection
        schema_oid: The OID of the schema to create the type in.
        name: The name to give it.
        values: Its values, in order; see msar.enum_values_given.
        description: A comment to put on the type.

    Returns:
        The OID of the new type.
    """
    return db_conn.exec_msar_func(
        conn, 'create_enum_type', schema_oid, name, json.dumps(values), description
    ).fetchone()[0]


def alter_enum_type(conn, type_oid, patch):
    """
    Change an enum's name, its description, or its values.

    Args:
        conn: a psycopg connection
        type_oid: The OID of the enum type.
        patch: A dict of the fields to change; see msar.alter_enum_type.

    Returns:
        The OID of the type, which is a new one if the values had to be rewritten.
    """
    return db_conn.exec_msar_func(
        conn, 'alter_enum_type', type_oid, json.dumps(patch)
    ).fetchone()[0]


def create_domain_type(conn, schema_oid, name, spec):
    """
    Create a domain: a type with rules of its own on top of another type.

    Args:
        conn: a psycopg connection
        schema_oid: The OID of the schema to create the type in.
        name: The name to give it.
        spec: What it is over, and the rules it holds its values to; see msar.create_domain_type.

    Returns:
        The OID of the new type.
    """
    return db_conn.exec_msar_func(
        conn, 'create_domain_type', schema_oid, name, json.dumps(spec)
    ).fetchone()[0]


def alter_domain_type(conn, type_oid, patch):
    """
    Change a domain's name, its description, its default, its nullability, or its rules.

    Args:
        conn: a psycopg connection
        type_oid: The OID of the domain.
        patch: A dict of the fields to change; see msar.alter_domain_type.

    Returns:
        The OID of the domain.
    """
    return db_conn.exec_msar_func(
        conn, 'alter_domain_type', type_oid, json.dumps(patch)
    ).fetchone()[0]


def drop_type(conn, type_oid, cascade=False):
    """
    Drop a type the database defines for itself, returning its qualified name.

    Args:
        conn: a psycopg connection
        type_oid: The OID of the type.
        cascade: Whether to drop what depends on it, the columns of it included.
    """
    return db_conn.exec_msar_func(conn, 'drop_type', type_oid, cascade).fetchone()[0]
