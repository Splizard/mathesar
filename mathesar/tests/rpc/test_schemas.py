"""
Test the schemas.list RPC method.
"""
from contextlib import contextmanager

from mathesar.rpc import schemas
from mathesar.models.users import User


def test_schemas_list_hides_internal_schemas(rf, monkeypatch):
    request = rf.post('/api/rpc/v0/', data={})
    request.user = User(username='alice', password='pass1234')
    database_id = 11

    def schema(name):
        return {
            "oid": 1234, "name": name, "description": None, "owner_oid": 10,
            "current_role_priv": ["USAGE", "CREATE"], "current_role_owns": True,
            "table_count": 1,
        }

    @contextmanager
    def mock_connect(_database_id, user):
        if _database_id == database_id and user.username == 'alice':
            yield True
        else:
            raise AssertionError('incorrect parameters passed')

    def mock_list_schemas(conn):
        return [
            schema('msar'),
            schema('__msar'),
            schema('mathesar_types'),
            schema('presentation_schema'),
            schema('public'),
        ]

    monkeypatch.setattr(schemas.base, 'connect', mock_connect)
    monkeypatch.setattr(schemas.base, 'list_schemas', mock_list_schemas)
    listed = schemas.list_(database_id=database_id, request=request)
    assert [s['name'] for s in listed] == ['public']
