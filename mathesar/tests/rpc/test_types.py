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


def test_types_add_domain(rf, monkeypatch):
    call = {}
    spec = {
        'over': {'name': 'text'},
        'not_null': True,
        'default': 'nobody@example.com',
        'rules': [{'rule': 'matches', 'value': '^[^@]+@[^@]+$'}],
        'description': 'An address to write to',
    }

    def mock_create_domain_type(conn, schema_oid, name, _spec):
        call.update(conn=conn, schema_oid=schema_oid, name=name, spec=_spec)
        return 4242

    monkeypatch.setattr(types, 'connect', _mock_connect)
    monkeypatch.setattr(types, 'create_domain_type', mock_create_domain_type)
    assert types.add_domain(
        schema_oid=2200, name='Email', spec=spec, database_id=11, request=_request(rf)
    ) == 4242
    assert call == {'conn': 'conn', 'schema_oid': 2200, 'name': 'Email', 'spec': spec}


def test_types_patch_domain(rf, monkeypatch):
    call = {}
    patch = {
        'name': 'Address',
        'default': None,
        'rules': [{'name': 'matches'}, {'rule': 'max_length', 'value': '200'}],
    }

    def mock_alter_domain_type(conn, type_oid, _patch):
        call.update(conn=conn, type_oid=type_oid, patch=_patch)
        # Changing a domain never replaces it, so the OID is the one asked about.
        return 4242

    monkeypatch.setattr(types, 'connect', _mock_connect)
    monkeypatch.setattr(types, 'alter_domain_type', mock_alter_domain_type)
    assert types.patch_domain(
        type_oid=4242, patch=patch, database_id=11, request=_request(rf)
    ) == 4242
    assert call == {'conn': 'conn', 'type_oid': 4242, 'patch': patch}


def test_types_add_composite(rf, monkeypatch):
    call = {}
    fields = [
        {'name': 'street', 'type': {'name': 'text'}},
        {'name': 'postcode', 'type': {'name': 'character varying', 'options': {'length': 10}}},
    ]

    def mock_create_composite_type(conn, schema_oid, name, _fields, description):
        call.update(
            conn=conn, schema_oid=schema_oid, name=name,
            fields=_fields, description=description
        )
        return 4242

    monkeypatch.setattr(types, 'connect', _mock_connect)
    monkeypatch.setattr(types, 'create_composite_type', mock_create_composite_type)
    assert types.add_composite(
        schema_oid=2200,
        name='Address',
        fields=fields,
        description='Where to send it',
        database_id=11,
        request=_request(rf),
    ) == 4242
    assert call == {
        'conn': 'conn', 'schema_oid': 2200, 'name': 'Address',
        'fields': fields, 'description': 'Where to send it',
    }


def test_types_add_composite_without_a_description(rf, monkeypatch):
    call = {}

    def mock_create_composite_type(conn, schema_oid, name, fields, description):
        call.update(description=description)
        return 4242

    monkeypatch.setattr(types, 'connect', _mock_connect)
    monkeypatch.setattr(types, 'create_composite_type', mock_create_composite_type)
    types.add_composite(
        schema_oid=2200,
        name='Address',
        fields=[{'name': 'street', 'type': {'name': 'text'}}],
        database_id=11,
        request=_request(rf),
    )
    assert call == {'description': None}


def test_types_patch_composite(rf, monkeypatch):
    call = {}
    patch = {
        'name': 'Home',
        'fields': [
            {'name': 'road', 'was': 'street'},
            {'name': 'country', 'type': {'name': 'text'}},
        ],
    }

    def mock_alter_composite_type(conn, type_oid, _patch):
        call.update(conn=conn, type_oid=type_oid, patch=_patch)
        # Changing a composite type never replaces it, so the OID is the one asked about.
        return 4242

    monkeypatch.setattr(types, 'connect', _mock_connect)
    monkeypatch.setattr(types, 'alter_composite_type', mock_alter_composite_type)
    assert types.patch_composite(
        type_oid=4242, patch=patch, database_id=11, request=_request(rf)
    ) == 4242
    assert call == {'conn': 'conn', 'type_oid': 4242, 'patch': patch}
