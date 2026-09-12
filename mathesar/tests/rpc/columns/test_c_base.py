"""
This file tests the column RPC functions.

Fixtures:
    rf(pytest-django): Provides mocked `Request` objects.
    monkeypatch(pytest): Lets you monkeypatch an object for testing.
    mocked_exec_msar_func(mathesar/tests/conftest.py): Lets you patch the exec_msar_func() for testing.
"""
import json
from contextlib import contextmanager

from mathesar.rpc import columns
from mathesar.models.users import User


def test_columns_list(rf, monkeypatch, mocked_exec_msar_func):
    request = rf.post('/api/rpc/v0/', data={})
    request.user = User(username='alice', password='pass1234')
    table_oid = 23457
    database_id = 2

    @contextmanager
    def mock_connect(_database_id, user):
        if _database_id == database_id and user.username == 'alice':
            try:
                yield True
            finally:
                pass
        else:
            raise AssertionError('incorrect parameters passed')

    monkeypatch.setattr(columns.base, 'connect', mock_connect)
    expect_col_list = [
        {
            'id': 1, 'name': 'id', 'type': 'integer',
            'default': {'value': 'identity', 'is_dynamic': True},
            'nullable': False, 'description': None, 'primary_key': True,
            'type_options': None,
            'has_dependents': True,
            'updated_at_trigger': False,
            'current_role_priv': ['SELECT', 'INSERT', 'UPDATE']
        }, {
            'id': 2, 'name': 'numcol', 'type': 'numeric',
            'default': {'value': "'8'::numeric", 'is_dynamic': False},
            'nullable': True,
            'description': 'My super numeric column',
            'primary_key': False,
            'type_options': None,
            'has_dependents': False,
            'updated_at_trigger': False,
            'current_role_priv': ['SELECT', 'INSERT', 'UPDATE']
        }, {
            'id': 4, 'name': 'numcolmod', 'type': 'numeric',
            'default': None,
            'nullable': True, 'description': None, 'primary_key': False,
            'type_options': {'scale': 3, 'precision': 5},
            'has_dependents': False,
            'updated_at_trigger': False,
            'current_role_priv': ['SELECT', 'INSERT', 'UPDATE']
        }, {
            'id': 8, 'name': 'ivlcolmod', 'type': 'interval',
            'default': None,
            'nullable': True, 'description': None, 'primary_key': False,
            'type_options': {'fields': 'day to second'},
            'has_dependents': False,
            'updated_at_trigger': False,
            'current_role_priv': ['SELECT', 'INSERT', 'UPDATE']
        }, {
            'id': 10, 'name': 'arrcol', 'type': '_array',
            'default': None,
            'nullable': True, 'description': None, 'primary_key': False,
            'type_options': {'item_type': 'character varying', 'length': 3},
            'has_dependents': False,
            'updated_at_trigger': False,
            'current_role_priv': ['SELECT', 'INSERT', 'UPDATE']
        }
    ]
    mocked_exec_msar_func.fetchone.return_value = [expect_col_list]
    actual_col_list = columns.list_(table_oid=23457, database_id=database_id, request=request)
    call_args = mocked_exec_msar_func.call_args_list[0][0]
    assert actual_col_list == expect_col_list
    assert call_args[2] == table_oid


def test_columns_patch(rf, monkeypatch, mocked_exec_msar_func):
    request = rf.post('/api/rpc/v0/', data={})
    request.user = User(username='alice', password='pass1234')
    table_oid = 23457
    database_id = 2
    column_data_list = [{"id": 3, "name": "newname"}]

    @contextmanager
    def mock_connect(_database_id, user):
        if _database_id == 2 and user.username == 'alice':
            try:
                yield True
            finally:
                pass
        else:
            raise AssertionError('incorrect parameters passed')

    monkeypatch.setattr(columns.base, 'connect', mock_connect)
    mocked_exec_msar_func.fetchone.return_value = [1]
    actual_result = columns.patch(
        column_data_list=column_data_list,
        table_oid=table_oid,
        database_id=database_id,
        request=request
    )
    call_args = mocked_exec_msar_func.call_args_list[0][0]
    transformed_column_data = [{'attnum': 3, 'name': 'newname'}]
    assert actual_result == 1
    assert call_args[2] == table_oid
    assert call_args[3] == json.dumps(transformed_column_data)


def test_columns_add(rf, monkeypatch, mocked_exec_msar_func):
    request = rf.post('/api/rpc/v0/', data={})
    request.user = User(username='alice', password='pass1234')
    table_oid = 23457
    database_id = 2
    column_data_list = [{"id": 3, "name": "newname"}]

    @contextmanager
    def mock_connect(_database_id, user):
        if _database_id == 2 and user.username == 'alice':
            try:
                yield True
            finally:
                pass
        else:
            raise AssertionError('incorrect parameters passed')

    monkeypatch.setattr(columns.base, 'connect', mock_connect)
    mocked_exec_msar_func.fetchone.return_value = [[3, 4]]
    actual_result = columns.add(
        column_data_list=column_data_list,
        table_oid=table_oid,
        database_id=database_id,
        request=request
    )
    call_args = mocked_exec_msar_func.call_args_list[0][0]
    transformed_column_data = [
        {
            'name': 'newname', 'type': {'name': 'character varying', 'options': {}},
            'not_null': False, 'default': None, 'description': None
        }
    ]
    assert actual_result == [3, 4]
    assert call_args[2] == table_oid
    assert call_args[3] == json.dumps(transformed_column_data)
    assert call_args[4] is False


def test_columns_delete(rf, monkeypatch, mocked_exec_msar_func):
    request = rf.post('/api/rpc/v0/', data={})
    request.user = User(username='alice', password='pass1234')
    table_oid = 23457
    database_id = 2
    column_attnums = [2, 3, 8]

    @contextmanager
    def mock_connect(_database_id, user):
        if _database_id == 2 and user.username == 'alice':
            try:
                yield True
            finally:
                pass
        else:
            raise AssertionError('incorrect parameters passed')

    monkeypatch.setattr(columns.base, 'connect', mock_connect)
    mocked_exec_msar_func.fetchone.return_value = [3]
    actual_result = columns.delete(
        column_attnums=column_attnums,
        table_oid=table_oid,
        database_id=database_id,
        request=request
    )
    call_args = mocked_exec_msar_func.call_args_list[0][0]
    assert actual_result == 3
    assert call_args[2] == table_oid
    assert call_args[3:6] == tuple(column_attnums)


def test_add_primary_key_column(rf, monkeypatch, mocked_exec_msar_func):
    request = rf.post('/api/rpc/v0/', data={})
    request.user = User(username='alice', password='pass1234')
    table_oid = 23457
    database_id = 2

    @contextmanager
    def mock_connect(_database_id, user):
        if _database_id == 2 and user.username == 'alice':
            try:
                yield True
            finally:
                pass
        else:
            raise AssertionError('incorrect parameters passed')

    def mock_set_meta_data(table_oid, metadata, _database_id):
        assert table_oid == 23457
        assert metadata == {"mathesar_added_pkey_attnum": 3}
        assert _database_id == 2

    monkeypatch.setattr(columns.base, 'connect', mock_connect)
    monkeypatch.setattr(columns.base, 'set_table_meta_data', mock_set_meta_data)
    mocked_exec_msar_func.fetchone.return_value = [3]
    columns.add_primary_key_column(
        pkey_type="IDENTITY",
        table_oid=table_oid,
        database_id=database_id,
        request=request
    )
    call_args = mocked_exec_msar_func.call_args_list[0][0]
    assert call_args[2] == table_oid
    assert call_args[3] == "IDENTITY"
    assert call_args[4] is False  # This should be the default
    assert call_args[5] == 'id'  # This should be the default

    columns.add_primary_key_column(
        pkey_type="IDENTITY",
        table_oid=table_oid,
        database_id=database_id,
        drop_existing_pkey_column=True,
        name="Identity",
        request=request
    )
    call_args = mocked_exec_msar_func.call_args_list[1][0]
    assert call_args[2] == table_oid
    assert call_args[3] == "IDENTITY"
    assert call_args[4] is True
    assert call_args[5] == 'Identity'


def test_columns_add_formula(rf, monkeypatch, mocked_exec_msar_func):
    """
    A formula goes to the database as the tree it was given, for the database to build the
    expression from: nothing the caller wrote is passed along as SQL.
    """
    request = rf.post('/api/rpc/v0/', data={})
    request.user = User(username='alice', password='pass1234')
    table_oid = 23457
    database_id = 2
    formula = {
        'op': '*',
        'of': [{'column': 3}, {'column': 4}],
    }

    @contextmanager
    def mock_connect(_database_id, user):
        if _database_id == database_id and user.username == 'alice':
            yield True
        else:
            raise AssertionError('incorrect parameters passed')

    monkeypatch.setattr(columns.base, 'connect', mock_connect)
    mocked_exec_msar_func.fetchone.return_value = [5]
    actual_result = columns.add_formula(
        table_oid=table_oid,
        name='total',
        formula=formula,
        database_id=database_id,
        request=request
    )
    call_args = mocked_exec_msar_func.call_args_list[0][0]
    assert actual_result == 5
    assert call_args[1] == 'add_formula_column'
    assert call_args[2] == table_oid
    assert call_args[3] == 'total'
    assert call_args[4] == json.dumps(formula)
    assert call_args[5] is None
    assert call_args[6] is None


def test_columns_add_formula_with_a_type_and_a_description(
    rf, monkeypatch, mocked_exec_msar_func
):
    request = rf.post('/api/rpc/v0/', data={})
    request.user = User(username='alice', password='pass1234')
    formula = {'fn': 'upper', 'of': [{'column': 2}]}
    type_ = {'name': 'character varying', 'options': {'length': 20}}

    @contextmanager
    def mock_connect(_database_id, user):
        yield True

    monkeypatch.setattr(columns.base, 'connect', mock_connect)
    mocked_exec_msar_func.fetchone.return_value = [6]
    columns.add_formula(
        table_oid=23457,
        name='shouted',
        formula=formula,
        type_=type_,
        description='The item, shouted',
        database_id=2,
        request=request
    )
    call_args = mocked_exec_msar_func.call_args_list[0][0]
    assert call_args[4] == json.dumps(formula)
    assert call_args[5] == json.dumps(type_)
    assert call_args[6] == 'The item, shouted'


def test_columns_patch_formula(rf, monkeypatch, mocked_exec_msar_func):
    request = rf.post('/api/rpc/v0/', data={})
    request.user = User(username='alice', password='pass1234')
    formula = {'op': '+', 'of': [{'column': 3}, {'value': 1}]}

    @contextmanager
    def mock_connect(_database_id, user):
        yield True

    monkeypatch.setattr(columns.base, 'connect', mock_connect)
    actual_result = columns.patch_formula(
        table_oid=23457,
        column_attnum=5,
        formula=formula,
        database_id=2,
        request=request
    )
    call_args = mocked_exec_msar_func.call_args_list[0][0]
    assert actual_result is None
    assert call_args[1] == 'set_column_formula'
    assert call_args[2] == 23457
    assert call_args[3] == 5
    assert call_args[4] == json.dumps(formula)


def test_columns_list_tells_which_columns_are_worked_out(
    rf, monkeypatch, mocked_exec_msar_func
):
    """
    A column worked out from a formula says so, and one holding values of its own says nothing
    about formulas at all rather than saying there is none.
    """
    request = rf.post('/api/rpc/v0/', data={})
    request.user = User(username='alice', password='pass1234')

    @contextmanager
    def mock_connect(_database_id, user):
        yield True

    monkeypatch.setattr(columns.base, 'connect', mock_connect)
    common = {
        'default': None, 'nullable': True, 'description': None, 'primary_key': False,
        'type_options': None, 'has_dependents': False, 'updated_at_trigger': False,
        'current_role_priv': ['SELECT'],
    }
    monkeypatch.setattr(
        columns.base, 'get_column_info_for_table',
        lambda table_oid, conn: [
            dict(common, id=1, name='price', type='numeric'),
            dict(
                common, id=2, name='total', type='numeric',
                formula={'op': '*', 'of': [{'column': 1}, {'value': 2}]},
                formula_sql='(price * 2)',
            ),
        ]
    )
    listed = columns.list_(table_oid=23457, database_id=2, request=request)
    assert 'formula' not in listed[0]
    assert 'formula_sql' not in listed[0]
    assert listed[1]['formula'] == {'op': '*', 'of': [{'column': 1}, {'value': 2}]}
    assert listed[1]['formula_sql'] == '(price * 2)'
