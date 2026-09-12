from db.presentation import (
    drop_column_presentation,
    get_column_presentation,
    set_column_presentation,
)


def get_columns_meta_data(conn, table_oid):
    """
    Return the presentation options of a table's columns, keyed by attnum.

    Args:
        conn: a psycopg connection to the user's database
        table_oid: The OID of the table.
    """
    return get_column_presentation(conn, table_oid)


def set_columns_meta_data(conn, table_oid, column_meta_data_list):
    """
    Set presentation options on some of a table's columns.

    Each entry says which column it is about with an `attnum`; the rest of it is the options to
    set. An option left out of an entry keeps the value it had.

    Args:
        conn: a psycopg connection to the user's database
        table_oid: The OID of the table.
        column_meta_data_list: A list of dicts, each with an `attnum` and some options.
    """
    for blob in column_meta_data_list:
        options = {k: v for k, v in blob.items() if k != "attnum"}
        set_column_presentation(conn, table_oid, blob["attnum"], options)
    return get_column_presentation(conn, table_oid)


def forget_column_meta_data(conn, table_oid, attnum):
    """
    Forget a column's presentation options.

    Args:
        conn: a psycopg connection to the user's database
        table_oid: The OID of the table.
        attnum: The attnum of the column.
    """
    drop_column_presentation(conn, table_oid, attnum)


def record_money_column(conn, table_oid, attnum, symbol='$'):
    """
    Say that a numeric column holds money, by giving it a currency symbol.

    Nothing in the database distinguishes an amount from any other number, so the symbol is what
    makes the column money. A symbol already recorded is left alone, being a choice someone made.

    Args:
        conn: a psycopg connection to the user's database
        table_oid: The OID of the table.
        attnum: The attnum of the column.
        symbol: The currency symbol to record.
    """
    current = get_column_presentation(conn, table_oid).get(attnum) or {}
    if current.get("mon_currency_symbol") is None:
        set_column_presentation(conn, table_oid, attnum, {"mon_currency_symbol": symbol})
