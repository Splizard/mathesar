"""
Presentation metadata: how a column is shown, as opposed to what it holds.

It lives in the user's database, in presentation_schema, rather than in Mathesar's own, so that it
travels with the data it describes. See db/sql/06_msar_presentation.sql for how a row keeps hold of
its column through a rename and through a dump and restore.
"""
import json

from db import connection as db_conn


def get_column_presentation(conn, table_oid):
    """
    Return the presentation options of a table's columns, keyed by attnum.

    Args:
        conn: a psycopg connection to the user's database
        table_oid: The OID of the table.
    """
    options = db_conn.exec_msar_func(
        conn, 'column_presentation', table_oid
    ).fetchone()[0]
    # The keys come back as strings, JSON objects having no other kind.
    return {int(attnum): blob for attnum, blob in options.items()}


def set_column_presentation(conn, table_oid, attnum, options):
    """
    Set some of a column's presentation options, leaving the rest as they were.

    An option given as None is cleared. An option left out of `options` is untouched.

    Args:
        conn: a psycopg connection to the user's database
        table_oid: The OID of the table containing the column.
        attnum: The attnum of the column.
        options: A dict of presentation options to set.
    """
    db_conn.exec_msar_func(
        conn, 'set_column_presentation', table_oid, attnum, json.dumps(options)
    )


def drop_column_presentation(conn, table_oid, attnum):
    """
    Forget a column's presentation options.

    Args:
        conn: a psycopg connection to the user's database
        table_oid: The OID of the table containing the column.
        attnum: The attnum of the column.
    """
    db_conn.exec_msar_func(conn, 'drop_column_presentation', table_oid, attnum)
