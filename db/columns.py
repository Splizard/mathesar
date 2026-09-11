import json

from db import connection as db_conn
from db.deprecated.types.base import PostgresType


DEFAULT = "default"
DESCRIPTION = "description"
NAME = "name"
NULLABLE = "nullable"
CAST_OPTIONS = "cast_options"


def get_column_info_for_table(table, conn):
    """
    Return a list of dictionaries describing the columns of the table.

    The `table` can be given as either a "qualified name", or an OID.
    The OID is the preferred identifier, since it's much more robust.

    The returned list contains dictionaries of the following form:

        {
            "id": <int>,
            "name": <str>,
            "type": <str>,
            "type_options": {
                "precision": <int>,
                "scale": <int>,
                "fields": <str>,
                "length": <int>,
                "item_type": <str>,
            },
            "nullable": <bool>,
            "primary_key": <bool>,
            "default": {"value": <str>, "is_dynamic": <bool>},
            "has_dependents": <bool>,
            "current_role_priv": [<str>, <str>, ...],
            "description": <str>
        }

    The fields of the "type_options" dictionary are all optional,
    depending on the "type" value.

    Args:
        table: The table for which we want column info.
    """
    return db_conn.exec_msar_func(conn, 'get_column_info', table).fetchone()[0]


def alter_columns_in_table(table_oid, column_data_list, conn):
    """
    Alter columns of the given table in bulk.

    For a description of column_data_list, see _transform_column_alter_dict

    Args:
        table_oid: The OID of the table whose columns we'll alter.
        column_data_list: a list of dicts describing the alterations to make.
    """
    transformed_column_data = [
        _transform_column_alter_dict(column) for column in column_data_list
    ]
    db_conn.exec_msar_func(
        conn, 'alter_columns', table_oid, json.dumps(transformed_column_data)
    )
    return len(column_data_list)


# TODO This function wouldn't be needed if we had the same form in the DB
# as the RPC API function.
def _transform_column_alter_dict(data):
    """
    Transform the data dict into the form needed for the DB functions.

    Input data form:
    {
        "id": <int>,
        "name": <str>,
        "type": <str>,
        "cast_options": <dict>,
        "type_options": <dict>,
        "nullable": <bool>,
        "default": {"value": <any>, "is_dynamic": <bool>}
        "description": <str>,
        "updated_at_trigger": <bool>
    }

    Output form:
    {
        "attnum": <int>,
        "type": {"name": <str>, "options": <dict>},
        "cast_options": {"curr_pref": <str>, "curr_suff": <str>, "decimal_p": <str>, "group_sep": <str>, "mathesar_casting": <bool>},
        "name": <str>,
        "not_null": <bool>,
        "default": <any>,
        "default_is_dynamic": <bool>,
        "description": <str>,
        "updated_at_trigger": <bool>
    }

    Note that keys with empty values will be dropped, except "default"
    and "description". Explicitly setting these to None requests dropping
    the associated property of the underlying column.
    """
    type_ = {"name": data.get('type'), "options": data.get('type_options')}
    new_type = {k: v for k, v in type_.items() if v} or None
    cast_options = data.get(CAST_OPTIONS)
    nullable = data.get(NULLABLE)
    not_null = not nullable if nullable is not None else None
    column_name = (data.get(NAME) or '').strip() or None
    raw_alter_def = {
        "attnum": data["id"],
        "type": new_type,
        "cast_options": cast_options,
        "not_null": not_null,
        "name": column_name,
        "description": data.get("description"),
        "updated_at_trigger": data.get("updated_at_trigger"),
    }
    alter_def = {k: v for k, v in raw_alter_def.items() if v is not None}

    default_dict = data.get("default", {})
    if default_dict is None:
        alter_def.update(default=None)
    elif "value" in default_dict:
        alter_def.update(default=default_dict["value"])
        if default_dict.get("is_dynamic"):
            alter_def.update(default_is_dynamic=True)

    return alter_def


def add_pkey_column_to_table(
        table_oid, pkey_type, conn, drop_old_pkey_column=False, name="id"
):
    """
    Add a primary key column to a table.

    See the `msar.add_pkey_column` function for info on the arguments.
    """
    return db_conn.exec_msar_func(
        conn, 'add_pkey_column',
        table_oid, pkey_type, drop_old_pkey_column, name
    ).fetchone()[0]


def add_columns_to_table(table_oid, column_data_list, conn):
    """
    Add columns to the given table.

    For a description of the members of column_data_list, see
    _transform_column_create_dict

    Args:
        table_oid: The OID of the table whose columns we'll alter.
        column_data_list: A list of dicts describing columns to add.
        conn: A psycopg connection.
    """
    transformed_column_data = [
        _transform_column_create_dict(col) for col in column_data_list
    ]
    result = db_conn.exec_msar_func(
        conn,
        'add_columns',
        table_oid,
        json.dumps(transformed_column_data),
        # Whether to treat defaults as raw SQL. DANGER!
        False,

    ).fetchone()[0]
    # Dynamic defaults (e.g., the current time) are SQL expressions, which
    # msar.add_columns only takes unchecked, and "Updated At" triggers need the
    # column to exist, so set both once the columns exist. Existing rows are
    # left empty rather than getting the default.
    later_alters = [
        _get_alter_def_for_added_column(attnum, col)
        for attnum, col in zip(result, column_data_list)
    ]
    later_alters = [alter_def for alter_def in later_alters if len(alter_def) > 1]
    if later_alters:
        db_conn.exec_msar_func(
            conn, 'alter_columns', table_oid, json.dumps(later_alters)
        )
    return result


def _has_dynamic_default(data):
    return bool((data.get(DEFAULT) or {}).get("is_dynamic"))


def _get_alter_def_for_added_column(attnum, data):
    alter_def = {"attnum": attnum}
    if _has_dynamic_default(data):
        alter_def.update(default=data[DEFAULT]["value"], default_is_dynamic=True)
    if data.get("updated_at_trigger"):
        alter_def.update(updated_at_trigger=True)
    return alter_def


# TODO This function wouldn't be needed if we had the same form in the DB
# as the RPC API function.
def _transform_column_create_dict(data):
    """
    Transform the data dict into the form needed for the DB functions.

    Input data form:
    {
        "name": <str>,
        "type": <str>,
        "type_options": <dict>,
        "nullable": <bool>,
        "default": {"value": <any>, "is_dynamic": <bool>}
        "description": <str>
    }

    Output form:
    {
        "type": {"name": <str>, "options": <dict>},
        "name": <str>,
        "not_null": <bool>,
        "default": <any>,
        "description": <str>
    }

    A dynamic default and the "Updated At" trigger are left out, to be set
    after the column is added.
    """
    return {
        "name": (data.get(NAME) or '').strip() or None,
        "type": {
            "name": data.get("type") or PostgresType.CHARACTER_VARYING.id,
            "options": data.get("type_options", {})
        },
        "not_null": not data.get(NULLABLE, True),
        "default": None if _has_dynamic_default(data) else (data.get(DEFAULT) or {}).get('value'),
        "description": data.get(DESCRIPTION),
    }


def drop_columns_from_table(table_oid, column_attnums, conn):
    """
    Drop the given columns from the given table.

    Args:
        table_oid: OID of the table whose columns we'll drop.
        column_attnums: The attnums of the columns to drop.
        conn: A psycopg connection to the relevant database.
    """
    return db_conn.exec_msar_func(
        conn, 'drop_columns', table_oid, *column_attnums
    ).fetchone()[0]


def get_legacy_file_refs(table_oid, column_attnum, conn):
    """
    Return the files in a column holding them as json(b), the way Mathesar
    stored them before they had a type of their own.

    Args:
        table_oid: The OID of the table containing the column.
        column_attnum: The attnum of the column.
        conn: A psycopg connection to the relevant database.

    Returns:
        A list of {"uri": <link>, "mash": <signature>} dicts.
    """
    return db_conn.exec_msar_func(
        conn, 'get_legacy_file_refs', table_oid, column_attnum
    ).fetchone()[0]


def convert_to_file_column(table_oid, column_attnum, files, conn):
    """
    Change a column holding files as json(b) to the file type, signing the
    given files and no others.

    Args:
        table_oid: The OID of the table containing the column.
        column_attnum: The attnum of the column.
        files: The files to sign, as {<link>: {"mime": <mime>, "hmac": <hmac>}}.
        conn: A psycopg connection to the relevant database.
    """
    db_conn.exec_msar_func(
        conn, 'convert_to_file_column', table_oid, column_attnum, json.dumps(files)
    )


def convert_to_user_column(table_oid, column_attnum, users, conn):
    """
    Change an integer column holding users' old ids to a uuid column holding
    their ids.

    Args:
        table_oid: The OID of the table containing the column.
        column_attnum: The attnum of the column.
        users: The id of each user, as {<old id>: <uuid>}.
        conn: A psycopg connection to the relevant database.
    """
    db_conn.exec_msar_func(
        conn, 'convert_to_user_column', table_oid, column_attnum, json.dumps(users)
    )
