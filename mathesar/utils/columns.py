from mathesar.models.base import ColumnMetaData, Database


def get_columns_meta_data(table_oid, database_id):
    return ColumnMetaData.objects.filter(
        database__id=database_id, table_oid=table_oid
    )


def set_columns_meta_data(column_meta_data_list, table_oid, database_id):
    db_model = Database.objects.get(id=database_id)
    for meta_data_dict in column_meta_data_list:
        # TODO decide if this is worth the trouble of doing in bulk.
        ColumnMetaData.objects.update_or_create(
            database=db_model,
            table_oid=table_oid,
            attnum=meta_data_dict["attnum"],
            defaults=meta_data_dict
        )
    return get_columns_meta_data(table_oid, database_id)


def record_money_column(database, table_oid, attnum, symbol='$'):
    """
    Say that a numeric column holds money, by giving it a currency symbol.

    Nothing in the database distinguishes an amount from any other number, so the symbol in the
    metadata is what makes the column money. A symbol already recorded is left alone, being a
    choice someone made.
    """
    metadata, _ = ColumnMetaData.objects.get_or_create(
        database=database, table_oid=table_oid, attnum=attnum
    )
    if metadata.mon_currency_symbol is None:
        metadata.mon_currency_symbol = symbol
        metadata.save(update_fields=['mon_currency_symbol'])
    return metadata
