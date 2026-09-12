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


def get_table_column_order(conn, table_oid):
    """
    Return the attnums of a table's columns in the order they should be shown, or None if nobody
    has said what that order is.

    A column nobody has placed is left out, for the client to show where it thinks best.

    Args:
        conn: a psycopg connection to the user's database
        table_oid: The OID of the table.
    """
    return db_conn.exec_msar_func(
        conn, 'table_column_order', table_oid
    ).fetchone()[0]


def get_table_column_orders(conn):
    """
    Return the column order of every table that has one, keyed by table OID.

    For listing a schema's tables, where asking table by table would be a query apiece.

    Args:
        conn: a psycopg connection to the user's database
    """
    orders = db_conn.exec_msar_func(conn, 'table_column_orders').fetchone()[0]
    return {int(table_oid): order for table_oid, order in orders.items()}


def set_table_column_order(conn, table_oid, column_order):
    """
    Say what order a table's columns should be shown in.

    Args:
        conn: a psycopg connection to the user's database
        table_oid: The OID of the table.
        column_order: A list of attnums in display order, or None to say nothing about it.
    """
    db_conn.exec_msar_func(
        conn, 'set_table_column_order', table_oid,
        json.dumps(column_order) if column_order is not None else None
    )


def get_table_record_summary_template(conn, table_oid):
    """
    Return how a record of this table should be written out, or None if nobody has said.

    Column references come back as chains of attnums, whatever form they are stored in.

    Args:
        conn: a psycopg connection to the user's database
        table_oid: The OID of the table.
    """
    return db_conn.exec_msar_func(
        conn, 'table_record_summary_template', table_oid
    ).fetchone()[0]


def get_table_record_summary_templates(conn):
    """
    Return every table's record summary template in the database, keyed by table OID as a string.

    Keyed by string because that is how the templates are handed to the query builder, and how a
    client supplying its own templates addresses them.

    Args:
        conn: a psycopg connection to the user's database
    """
    return db_conn.exec_msar_func(conn, 'table_record_summary_templates').fetchone()[0]


def set_table_record_summary_template(conn, table_oid, template):
    """
    Say how a record of this table should be written out.

    Args:
        conn: a psycopg connection to the user's database
        table_oid: The OID of the table.
        template: The template, with column references as chains of attnums, or None to say
            nothing about it.
    """
    db_conn.exec_msar_func(
        conn, 'set_table_record_summary_template', table_oid,
        json.dumps(template) if template is not None else None
    )
