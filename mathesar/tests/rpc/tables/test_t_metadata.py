"""
This file tests the table metadata RPC functions.

Fixtures:
    rf(pytest-django): Provides mocked `Request` objects.
    monkeypatch(pytest): Lets you monkeypatch an object for testing.
"""
from contextlib import contextmanager

from mathesar.models.base import TableMetaData, Database, Server, DataFile
from mathesar.models.users import User
from mathesar.rpc.tables import metadata


@contextmanager
def _no_connection(*args, **kwargs):
    """Stand in for a connection to the user's database, which these tests never reach."""
    yield None


def test_tables_meta_data_list(rf, monkeypatch):
    request = rf.post('/api/rpc/v0', data={})
    request.user = User(username='alice', password='pass1234')
    database_id = 2

    def mock_list_tables_meta_data(_database_id):
        server_model = Server(id=2, host="example.com", port=5432)
        db_model = Database(id=_database_id, name="mymathesardb", server=server_model)
        return [
            TableMetaData(
                id=1,
                database=db_model,
                table_oid=1234,
                data_file=None,
                import_verified=True,
                user_tracking_attnum=None,
            ),
            TableMetaData(
                id=2,
                database=db_model,
                table_oid=4567,
                data_file=DataFile(id=11),
                import_verified=False,
                user_tracking_attnum=None,
            ),
        ]

    monkeypatch.setattr(metadata, "list_tables_meta_data", mock_list_tables_meta_data)
    monkeypatch.setattr(metadata, "connect", _no_connection)
    monkeypatch.setattr(
        metadata, "get_table_column_orders", lambda conn: {1234: [8, 9, 10]}
    )
    monkeypatch.setattr(metadata, "get_table_record_summary_templates", lambda conn: {})
    monkeypatch.setattr(metadata, "get_table_record_summary_cards", lambda conn: {})
    monkeypatch.setattr(metadata, "get_table_saved_filters_all", lambda conn: {})

    expect_metadata_list = [
        metadata.TableMetaDataRecord(
            id=1,
            database_id=database_id,
            table_oid=1234,
            data_file_id=None,
            import_verified=True,
            column_order=[8, 9, 10],
            record_summary_template=None,
            record_summary_card=None,
            saved_filters=None,
            mathesar_added_pkey_attnum=None,
            user_tracking_attnum=None,
        ),
        metadata.TableMetaDataRecord(
            id=2,
            database_id=database_id,
            table_oid=4567,
            data_file_id=11,
            import_verified=False,
            column_order=None,
            record_summary_template=None,
            record_summary_card=None,
            saved_filters=None,
            mathesar_added_pkey_attnum=None,
            user_tracking_attnum=None,
        ),
    ]
    actual_metadata_list = metadata.list_(database_id=database_id, request=request)
    assert actual_metadata_list == expect_metadata_list


def test_tables_meta_data_list_includes_order_only_tables(rf, monkeypatch):
    """
    A table Mathesar has no row of its own for can still have been arranged, or had a filter kept.

    Mathesar only makes a TableMetaData row for a table it created or imported, so a table made
    outside it has none -- but its column order, its summary and its kept filters all live in the
    user's database, and listing has to report them or they silently go missing.
    """
    request = rf.post('/api/rpc/v0', data={})
    request.user = User(username='alice', password='pass1234')

    monkeypatch.setattr(metadata, "list_tables_meta_data", lambda _database_id: [])
    monkeypatch.setattr(metadata, "connect", _no_connection)
    monkeypatch.setattr(metadata, "get_table_column_orders", lambda conn: {4567: [3, 1, 2]})
    monkeypatch.setattr(
        metadata, "get_table_record_summary_templates", lambda conn: {"4567": [[3]]}
    )
    monkeypatch.setattr(metadata, "get_table_record_summary_cards", lambda conn: {})
    monkeypatch.setattr(
        metadata,
        "get_table_saved_filters_all",
        lambda conn: {8901: [{"name": "Unpaid", "filter": ["g", "and", []]}]},
    )

    actual = metadata.list_(database_id=2, request=request)
    assert sorted(actual, key=lambda r: r["table_oid"]) == [
        metadata.TableMetaDataRecord(
            id=None,
            database_id=2,
            table_oid=4567,
            data_file_id=None,
            import_verified=None,
            column_order=[3, 1, 2],
            record_summary_template=[[3]],
            record_summary_card=None,
            saved_filters=None,
            mathesar_added_pkey_attnum=None,
            user_tracking_attnum=None,
        ),
        # Kept filters are enough on their own to report a table nobody has otherwise touched
        metadata.TableMetaDataRecord(
            id=None,
            database_id=2,
            table_oid=8901,
            data_file_id=None,
            import_verified=None,
            column_order=None,
            record_summary_template=None,
            record_summary_card=None,
            saved_filters=[{"name": "Unpaid", "filter": ["g", "and", []]}],
            mathesar_added_pkey_attnum=None,
            user_tracking_attnum=None,
        ),
    ]
