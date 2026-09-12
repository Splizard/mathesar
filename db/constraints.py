import json

from db import connection as db_conn


def get_constraints_for_table(table_oid, conn):
    return db_conn.select_from_msar_func(conn, 'get_constraints_for_table', table_oid)


def create_constraint(table_oid, constraint_obj_list, conn):
    """
    Create a constraint using a psycopg connection.

    Args:
        constraint_obj_list: (See __msar.process_con_def_jsonb for details)
        conn: a psycopg connection

    Returns:
        Returns a list of oid(s) of constraints for a given table.
    """
    return db_conn.exec_msar_func(
        conn, 'add_constraints', table_oid, json.dumps(constraint_obj_list)
    ).fetchone()[0]


def drop_constraint_via_oid(table_oid, constraint_oid, conn):
    """
    Drop a constraint.

    Args:
        table_oid: Identity of the table to delete constraint for.
        constraint_oid: The OID of the constraint to delete.

    Returns:
        The name of the dropped constraint.
    """
    return db_conn.exec_msar_func(
        conn, 'drop_constraint', table_oid, constraint_oid
    ).fetchone()[0]


def check_pattern_violations(table_oid, column_attnum, pattern, conn):
    """
    Count the rows that would stop a check pattern being applied to a column.

    Returns:
        {"violations": int, "repairable": int}
    """
    return db_conn.exec_msar_func(
        conn, 'check_pattern_violations', table_oid, json.dumps([column_attnum]), pattern
    ).fetchone()[0]


def repair_check_pattern(table_oid, column_attnum, pattern, conn):
    """
    Put right the rows a check pattern's repair can fix, leaving the rest alone.

    Returns:
        The number of rows changed.
    """
    return db_conn.exec_msar_func(
        conn, 'repair_check_pattern', table_oid, json.dumps([column_attnum]), pattern
    ).fetchone()[0]
