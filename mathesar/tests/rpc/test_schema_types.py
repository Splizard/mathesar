"""
Test the schemas.list_types RPC method.
"""
from contextlib import contextmanager

from mathesar.rpc import schemas
from mathesar.models.users import User


def test_schemas_list_types(rf, monkeypatch):
    request = rf.post('/api/rpc/v0/', data={})
    request.user = User(username='alice', password='pass1234')
    schema_oid, database_id = 2200, 11
    types = [{"oid": 1, "name": "mood", "kind": "enum", "description": None, "values": ["happy"]}]

    @contextmanager
    def mock_connect(_database_id, user):
        if _database_id == database_id and user.username == 'alice':
            yield True
        else:
            raise AssertionError('incorrect parameters passed')

    def mock_list_schema_types(_schema_oid, conn):
        if _schema_oid != schema_oid:
            raise AssertionError('incorrect parameters passed')
        return types

    monkeypatch.setattr(schemas.base, 'connect', mock_connect)
    monkeypatch.setattr(schemas.base, 'list_schema_types', mock_list_schema_types)
    assert schemas.list_types(schema_oid=schema_oid, database_id=database_id, request=request) == types
