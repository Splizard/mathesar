"""
Classes and functions exposed to the RPC endpoint for managing table metadata.
"""
from typing import Optional, TypedDict, Union

from modernrpc.core import REQUEST_KEY

from db.presentation import (
    get_table_column_orders,
    get_table_record_summary_templates,
    get_table_saved_filters_all,
    set_table_column_order,
    set_table_record_summary_template,
    set_table_saved_filters,
)
from mathesar.rpc.decorators import mathesar_rpc_method
from mathesar.rpc.utils import connect
from mathesar.utils.tables import list_tables_meta_data, set_table_meta_data


class TableMetaDataRecord(TypedDict):
    """
    Metadata for a table in a database.

    Only the `database` and `table_oid` keys are required.

    Attributes:
        id: The Django id of the TableMetaData object.
        database_id: The Django id of the database containing the table.
        table_oid: The OID of the table in the database.
        data_file_id: Specifies the DataFile model id used for the import.
        import_verified: Specifies whether a file has been successfully imported into a table.
        column_order: The order in which columns of a table are displayed.
        record_summary_template: The record summary template.
        saved_filters: Filters somebody has named and kept for the table, in the order they are
            offered, each a dict of the filter's `name` and the `filter` itself.
        mathesar_added_pkey_attnum: The attnum of the most recently-set pkey column.
        user_tracking_attnum: The attnum of the column used to auto-record the editing user.
            When set, adding or patching a record will automatically populate this column
            with the current user's ID.
    """
    id: int
    database_id: int
    table_oid: int
    data_file_id: Optional[int]
    import_verified: Optional[bool]
    column_order: Optional[list[int]]
    record_summary_template: Optional[dict[str, Union[str, list[int]]]]
    saved_filters: Optional[list[dict]]
    mathesar_added_pkey_attnum: Optional[int]
    user_tracking_attnum: Optional[int]

    @classmethod
    def from_model(
        cls, model, column_order=None, record_summary_template=None, saved_filters=None
    ):
        return cls(
            id=model.id,
            database_id=model.database.id,
            table_oid=model.table_oid,
            data_file_id=model.data_file_id,
            import_verified=model.import_verified,
            column_order=column_order,
            record_summary_template=record_summary_template,
            saved_filters=saved_filters,
            mathesar_added_pkey_attnum=model.mathesar_added_pkey_attnum,
            user_tracking_attnum=model.user_tracking_attnum,
        )

    @classmethod
    def from_presentation(
        cls, database_id, table_oid, column_order, record_summary_template, saved_filters
    ):
        """
        Build a record for a table whose metadata is all in the user's own database.

        Mathesar has nothing of its own to say about a table it didn't make, but someone may
        still have arranged its columns, summarized its records or kept a filter for it, and all
        of that lives with the data it describes.
        """
        return cls(
            id=None,
            database_id=database_id,
            table_oid=table_oid,
            data_file_id=None,
            import_verified=None,
            column_order=column_order,
            record_summary_template=record_summary_template,
            saved_filters=saved_filters,
            mathesar_added_pkey_attnum=None,
            user_tracking_attnum=None,
        )


class TableMetaDataBlob(TypedDict):
    """
    The metadata fields which can be set on a table

    Attributes:
        data_file_id: Specifies the DataFile model id used for the import.
        import_verified: Specifies whether a file has been successfully imported into a table.
        column_order: The order in which columns of a table are displayed.
        record_summary_template: The record summary template
        saved_filters: Filters somebody has named and kept for the table, in the order they are
            offered, each a dict of the filter's `name` and the `filter` itself. The list given
            replaces whatever was kept before; an empty list or null keeps none.
        mathesar_added_pkey_attnum: The attnum of the most recently-set pkey column.
        user_tracking_attnum: The attnum of the column used to auto-record the editing user.
    """
    data_file_id: Optional[int]
    import_verified: Optional[bool]
    column_order: Optional[list[int]]
    record_summary_template: Optional[dict[str, Union[str, list[int]]]]
    saved_filters: Optional[list[dict]]
    mathesar_added_pkey_attnum: Optional[int]
    user_tracking_attnum: Optional[int]

    @classmethod
    def from_model(
        cls, model, column_order=None, record_summary_template=None, saved_filters=None
    ):
        return cls(
            data_file_id=model.data_file_id,
            import_verified=model.import_verified,
            column_order=column_order,
            record_summary_template=record_summary_template,
            saved_filters=saved_filters,
            mathesar_added_pkey_attnum=model.mathesar_added_pkey_attnum,
            user_tracking_attnum=model.user_tracking_attnum,
        )

    @classmethod
    def from_presentation(cls, column_order, record_summary_template, saved_filters=None):
        """
        Build a blob for a table whose metadata is all in the user's own database.

        Mathesar has nothing of its own to say about a table it didn't make, but someone may
        still have arranged its columns, summarized its records or kept a filter for it, and all
        of that lives with the data it describes.
        """
        return cls(
            data_file_id=None,
            import_verified=None,
            column_order=column_order,
            record_summary_template=record_summary_template,
            saved_filters=saved_filters,
            mathesar_added_pkey_attnum=None,
            user_tracking_attnum=None,
        )


@mathesar_rpc_method(name="tables.metadata.list", auth="login")
def list_(*, database_id: int, **kwargs) -> list[TableMetaDataRecord]:
    """
    List metadata associated with tables for a database.

    Args:
        database_id: The Django id of the database containing the table.

    Returns:
        A list of metadata objects for tables in the database.
    """
    user = kwargs.get(REQUEST_KEY).user
    with connect(database_id, user) as conn:
        column_orders = get_table_column_orders(conn)
        summaries = {
            int(table_oid): template
            for table_oid, template in get_table_record_summary_templates(conn).items()
        }
        saved_filters = get_table_saved_filters_all(conn)
    table_meta_data = list_tables_meta_data(database_id)
    records = [
        TableMetaDataRecord.from_model(
            model,
            column_orders.pop(model.table_oid, None),
            summaries.pop(model.table_oid, None),
            saved_filters.pop(model.table_oid, None),
        )
        for model in table_meta_data
    ]
    # A table Mathesar has no row of its own for may still have been arranged, given a summary, or
    # had a filter kept for it.
    return records + [
        TableMetaDataRecord.from_presentation(
            database_id,
            table_oid,
            column_orders.get(table_oid),
            summaries.get(table_oid),
            saved_filters.get(table_oid),
        )
        for table_oid in column_orders.keys() | summaries.keys() | saved_filters.keys()
    ]


@mathesar_rpc_method(name="tables.metadata.set", auth="login")
def set_(
    *, table_oid: int, metadata: TableMetaDataBlob, database_id: int, **kwargs
) -> None:
    """
    Set metadata for a table.

    Args:
        table_oid: The PostgreSQL OID of the table.
        metadata: A TableMetaDataBlob object describing desired table metadata to set.
        database_id: The Django id of the database containing the table.
    """
    metadata = dict(metadata)
    # The order lives with the columns it orders, the summary with the columns it reads and a kept
    # filter with the columns it asks about, all in the user's database; the rest is Mathesar's own
    # bookkeeping and stays here.
    in_user_database = {"column_order", "record_summary_template", "saved_filters"}
    if in_user_database & metadata.keys():
        user = kwargs.get(REQUEST_KEY).user
        with connect(database_id, user) as conn:
            if "column_order" in metadata:
                set_table_column_order(conn, table_oid, metadata.pop("column_order"))
            if "record_summary_template" in metadata:
                set_table_record_summary_template(
                    conn, table_oid, metadata.pop("record_summary_template")
                )
            if "saved_filters" in metadata:
                set_table_saved_filters(conn, table_oid, metadata.pop("saved_filters"))
    if metadata:
        set_table_meta_data(table_oid, metadata, database_id)
