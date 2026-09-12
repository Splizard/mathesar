"""
Test the types.* RPC methods.
"""
from contextlib import contextmanager

from mathesar.rpc import types
from mathesar.models.users import User


def _request(rf):
    request = rf.post('/api/rpc/v0/', data={})
    request.user = User(username='alice', password='pass1234')
    return request


@contextmanager
def _mock_connect(_database_id, user):
    if _database_id == 11 and user.username == 'alice':
        yield 'conn'
    else:
        raise AssertionError('incorrect parameters passed')


def test_types_add_enum(rf, monkeypatch):
    call = {}

    def mock_create_enum_type(conn, schema_oid, name, values, description):
        call.update(
            conn=conn, schema_oid=schema_oid, name=name,
            values=values, description=description
        )
        return 4242

    monkeypatch.setattr(types, 'connect', _mock_connect)
    monkeypatch.setattr(types, 'create_enum_type', mock_create_enum_type)
    assert types.add_enum(
        schema_oid=2200,
        name='mood',
        values=['happy', 'sad'],
        description='How it went',
        database_id=11,
        request=_request(rf),
    ) == 4242
    assert call == {
        'conn': 'conn', 'schema_oid': 2200, 'name': 'mood',
        'values': ['happy', 'sad'], 'description': 'How it went',
    }


def test_types_add_enum_without_a_description(rf, monkeypatch):
    call = {}

    def mock_create_enum_type(conn, schema_oid, name, values, description):
        call.update(description=description)
        return 4242

    monkeypatch.setattr(types, 'connect', _mock_connect)
    monkeypatch.setattr(types, 'create_enum_type', mock_create_enum_type)
    types.add_enum(
        schema_oid=2200, name='mood', values=['happy'], database_id=11, request=_request(rf)
    )
    assert call == {'description': None}


def test_types_patch_enum(rf, monkeypatch):
    call = {}
    patch = {
        'name': 'temper',
        'values': [{'value': 'glad', 'was': 'happy'}, {'value': 'sad', 'was': 'sad'}],
    }

    def mock_alter_enum_type(conn, type_oid, _patch):
        call.update(conn=conn, type_oid=type_oid, patch=_patch)
        # The OID changes when the values have to be rewritten.
        return 4343

    monkeypatch.setattr(types, 'connect', _mock_connect)
    monkeypatch.setattr(types, 'alter_enum_type', mock_alter_enum_type)
    assert types.patch_enum(
        type_oid=4242, patch=patch, database_id=11, request=_request(rf)
    ) == 4343
    assert call == {'conn': 'conn', 'type_oid': 4242, 'patch': patch}


def test_types_delete(rf, monkeypatch):
    call = {}

    def mock_drop_type(conn, type_oid, cascade):
        call.update(conn=conn, type_oid=type_oid, cascade=cascade)
        return 'onto.mood'

    monkeypatch.setattr(types, 'connect', _mock_connect)
    monkeypatch.setattr(types, 'drop_type', mock_drop_type)
    assert types.delete(
        type_oid=4242, database_id=11, request=_request(rf)
    ) == 'onto.mood'
    assert call == {'conn': 'conn', 'type_oid': 4242, 'cascade': False}
    types.delete(type_oid=4242, cascade=True, database_id=11, request=_request(rf))
    assert call['cascade'] is True
