"""
This file tests the column metadata RPC functions.

Fixtures:
    rf(pytest-django): Provides mocked `Request` objects.
    monkeypatch(pytest): Lets you monkeypatch an object for testing.
"""
from contextlib import contextmanager

from mathesar.models.users import User
from mathesar.rpc.columns import metadata


@contextmanager
def _no_connection(*args, **kwargs):
    """Stand in for a connection to the user's database, which these tests never reach."""
    yield None


def test_columns_meta_data_list(rf, monkeypatch):
    request = rf.post('/api/rpc/v0', data={})
    request.user = User(username='alice', password='pass1234')
    database_id = 2
    table_oid = 123456

    def mock_get_columns_meta_data(_conn, _table_oid):
        return {
            2: dict(
                bool_input="dropdown", bool_true="TRUE", bool_false="FALSE",
                num_min_frac_digits=5, num_max_frac_digits=10, num_grouping="force-yes",
                mon_currency_symbol="EUR", mon_currency_location="end-with-space",
                time_format=None, date_format=None,
                duration_min=None, duration_max=None, duration_format=None,
                num_format="english",
                display_width=None,
                file_backend='local_test1',
                user_display_field=None,
                array_delimiter=None,
            ),
            8: dict(
                bool_input="checkbox", bool_true="true", bool_false="false",
                num_min_frac_digits=2, num_max_frac_digits=8, num_grouping="force-no",
                mon_currency_symbol="$", mon_currency_location="after-minus",
                time_format=None, date_format=None,
                duration_min=None, duration_max=None, duration_format=None,
                num_format="german",
                display_width=300,
                file_backend='s3_test2',
                user_display_field=None,
                array_delimiter=';',
            ),
        }

    monkeypatch.setattr(metadata, "get_columns_meta_data", mock_get_columns_meta_data)
    monkeypatch.setattr(metadata, "connect", _no_connection)

    expect_metadata_list = [
        metadata.ColumnMetaDataRecord(
            database_id=database_id, table_oid=table_oid, attnum=2,
            bool_input="dropdown", bool_true="TRUE", bool_false="FALSE",
            num_min_frac_digits=5, num_max_frac_digits=10, num_grouping="force-yes",
            mon_currency_symbol="EUR", mon_currency_location="end-with-space",
            time_format=None, date_format=None,
            duration_min=None, duration_max=None, duration_format=None,
            num_format="english",
            display_width=None,
            file_backend='local_test1',
            user_display_field=None,
            array_delimiter=None,
        ),
        metadata.ColumnMetaDataRecord(
            database_id=database_id, table_oid=table_oid, attnum=8,
            bool_input="checkbox", bool_true="true", bool_false="false",
            num_min_frac_digits=2, num_max_frac_digits=8, num_grouping="force-no",
            mon_currency_symbol="$", mon_currency_location="after-minus",
            time_format=None, date_format=None,
            duration_min=None, duration_max=None, duration_format=None,
            num_format="german",
            display_width=300,
            file_backend='s3_test2',
            user_display_field=None,
            array_delimiter=';',
        ),
    ]
    actual_metadata_list = metadata.list_(table_oid=table_oid, database_id=database_id, request=request)
    assert actual_metadata_list == expect_metadata_list


def test_columns_meta_data_set(rf, monkeypatch):
    """The attnum says which column; the rest is what to set on it."""
    request = rf.post('/api/rpc/v0', data={})
    request.user = User(username='alice', password='pass1234')
    recorded = {}

    def mock_set_columns_meta_data(_conn, table_oid, column_meta_data_list):
        recorded['table_oid'] = table_oid
        recorded['list'] = column_meta_data_list

    monkeypatch.setattr(metadata, "set_columns_meta_data", mock_set_columns_meta_data)
    monkeypatch.setattr(metadata, "connect", _no_connection)

    metadata.set_(
        column_meta_data_list=[{"attnum": 3, "display_width": 120}],
        table_oid=123456, database_id=2, request=request,
    )
    assert recorded == {'table_oid': 123456, 'list': [{"attnum": 3, "display_width": 120}]}
