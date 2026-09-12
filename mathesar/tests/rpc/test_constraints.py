"""
This file tests the constraint RPC functions.

Fixtures:
    monkeypatch(pytest): Lets you monkeypatch an object for testing.
    mocked_select_from_msar_func(mathesar/tests/conftest.py): Lets you patch the select_from_msar_func() for testing.
    mocked_exec_msar_func(mathesar/tests/conftest.py): Lets you patch the exec_msar_func() for testing.
"""
import json
from contextlib import contextmanager

import pytest
from modernrpc.exceptions import RPCException

from mathesar.rpc import constraints
from mathesar.models.users import User


def test_constraints_list(rf, monkeypatch, mocked_select_from_msar_func):
    request = rf.post('/api/rpc/v0', data={})
    request.user = User(username='alice', password='pass1234')
    table_oid = 2254444
    database_id = 11

    @contextmanager
    def mock_connect(_database_id, user):
        if _database_id == database_id and user.username == 'alice':
            try:
                yield True
            finally:
                pass
        else:
            raise AssertionError('incorrect parameters passed')

    monkeypatch.setattr(constraints, 'connect', mock_connect)
    expect_constraints_list = [
        {
            'oid': 2254567,
            'name': 'Movie Cast Map_Cast Member_fkey',
            'type': 'foreignkey',
            'columns': [4],
            'referent_table_oid': 2254492,
            'referent_columns': [1],
            'expression': None,
            'validated': True,
            'pattern': None
        },
        {
            'oid': 2254572,
            'name': 'Movie Cast Map_Movie_fkey',
            'type': 'foreignkey',
            'columns': [3],
            'referent_table_oid': 2254483,
            'referent_columns': [1],
            'expression': None,
            'validated': True,
            'pattern': None
        },
        {
            'oid': 2254544,
            'name': 'Movie Cast Map_pkey',
            'type': 'primary',
            'columns': [1],
            'referent_table_oid': 0,
            'referent_columns': None,
            'expression': None,
            'validated': True,
            'pattern': None
        },
        {
            'oid': 2254588,
            'name': 'Movie Cast Map_Role_check',
            'type': 'check',
            'columns': [5],
            'referent_table_oid': 0,
            'referent_columns': None,
            'expression': '("Role" = btrim("Role"))',
            'validated': False,
            'pattern': None
        }
    ]
    mocked_select_from_msar_func.return_value = expect_constraints_list
    actual_constraint_list = constraints.list_(table_oid=table_oid, database_id=11, request=request)
    call_args = mocked_select_from_msar_func.call_args_list[0][0]
    assert actual_constraint_list == expect_constraints_list
    assert call_args[2] == table_oid


def test_constraints_drop(rf, monkeypatch, mocked_exec_msar_func):
    request = rf.post('/api/rpc/v0', data={})
    request.user = User(username='alice', password='pass1234')
    table_oid = 2254444
    constraint_oid = 2254567
    database_id = 11

    @contextmanager
    def mock_connect(_database_id, user):
        if _database_id == database_id and user.username == 'alice':
            try:
                yield True
            finally:
                pass
        else:
            raise AssertionError('incorrect parameters passed')

    monkeypatch.setattr(constraints, 'connect', mock_connect)
    mocked_exec_msar_func.fetchone.return_value = ['Movie Cast Map_Cast Member_fkey']
    constraint_name = constraints.delete(
        table_oid=table_oid, constraint_oid=constraint_oid, database_id=11, request=request
    )
    call_args = mocked_exec_msar_func.call_args_list[0][0]
    assert constraint_name == mocked_exec_msar_func.fetchone.return_value[0]
    assert call_args[2] == table_oid
    assert call_args[3] == constraint_oid


def test_constraints_create(rf, monkeypatch, mocked_exec_msar_func):
    request = rf.post('/api/rpc/v0', data={})
    request.user = User(username='alice', password='pass1234')
    table_oid = 2254444
    constraint_def_list = [
        {
            'name': 'Movie Cast Map_Movie_fkey',
            'type': 'f',
            'columns': [3],
            'fkey_relation_id': 2254483,
            'fkey_columns': [1],
            'fkey_update_actions': 'a',
            'fkey_delete_action': 'a',
            'fkey_match_type': 's'
        }
    ]
    database_id = 11

    @contextmanager
    def mock_connect(_database_id, user):
        if _database_id == database_id and user.username == 'alice':
            try:
                yield True
            finally:
                pass
        else:
            raise AssertionError('incorrect parameters passed')

    monkeypatch.setattr(constraints, 'connect', mock_connect)
    mocked_exec_msar_func.fetchone.return_value = [[2254833, 2254567, 2254544]]
    constraint_oids = constraints.add(
        table_oid=table_oid, constraint_def_list=constraint_def_list, database_id=11, request=request
    )
    call_args = mocked_exec_msar_func.call_args_list[0][0]
    assert constraint_oids == mocked_exec_msar_func.fetchone.return_value[0]
    assert call_args[2] == table_oid
    assert call_args[3] == json.dumps(constraint_def_list)


def test_constraints_create_check_by_pattern(rf, monkeypatch, mocked_exec_msar_func):
    """A check constraint names a pattern, and the definition reaches the database unchanged."""
    request = rf.post('/api/rpc/v0', data={})
    request.user = User(username='alice', password='pass1234')
    table_oid = 2254444
    constraint_def_list = [
        {'name': 'trimmed', 'type': 'c', 'pattern': 'text_box', 'columns': [2]}
    ]

    @contextmanager
    def mock_connect(_database_id, user):
        yield True

    monkeypatch.setattr(constraints, 'connect', mock_connect)
    mocked_exec_msar_func.fetchone.return_value = [[2254833]]
    constraint_oids = constraints.add(
        table_oid=table_oid, constraint_def_list=constraint_def_list, database_id=11, request=request
    )
    call_args = mocked_exec_msar_func.call_args_list[0][0]
    assert constraint_oids == mocked_exec_msar_func.fetchone.return_value[0]
    assert call_args[3] == json.dumps(constraint_def_list)


def test_constraints_create_check_refuses_raw_expression(rf, monkeypatch, mocked_exec_msar_func):
    """
    The endpoint must not accept SQL. TypedDicts don't validate at runtime, so this is the only
    thing standing between a logged-in caller and an arbitrary ALTER TABLE.
    """
    request = rf.post('/api/rpc/v0', data={})
    request.user = User(username='alice', password='pass1234')

    @contextmanager
    def mock_connect(_database_id, user):
        yield True

    monkeypatch.setattr(constraints, 'connect', mock_connect)

    for bad_def in (
        {'type': 'c', 'expression': "true) --", 'columns': [2]},
        {'type': 'c', 'pattern': 'text_box', 'expression': "true) --", 'columns': [2]},
        {'type': 'c', 'pattern': 'no_such_pattern', 'columns': [2]},
        {'type': 'c', 'columns': [2]},
    ):
        # The RPC layer wraps the ValueError the guard raises.
        with pytest.raises(RPCException, match='pattern'):
            constraints.add(
                table_oid=2254444, constraint_def_list=[bad_def], database_id=11, request=request
            )
    assert not mocked_exec_msar_func.call_args_list


def test_constraints_create_non_check_unaffected(rf, monkeypatch, mocked_exec_msar_func):
    """The guard leaves other kinds of constraint alone, including their unrelated keys."""
    request = rf.post('/api/rpc/v0', data={})
    request.user = User(username='alice', password='pass1234')
    constraint_def_list = [{'type': 'u', 'columns': [2], 'name': 'uniq'}]

    @contextmanager
    def mock_connect(_database_id, user):
        yield True

    monkeypatch.setattr(constraints, 'connect', mock_connect)
    mocked_exec_msar_func.fetchone.return_value = [[1]]
    constraints.add(
        table_oid=2254444, constraint_def_list=constraint_def_list, database_id=11, request=request
    )
    assert mocked_exec_msar_func.call_args_list[0][0][3] == json.dumps(constraint_def_list)
