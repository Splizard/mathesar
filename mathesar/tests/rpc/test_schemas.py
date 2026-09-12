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

    def mock_list_schemas(conn, include_system=False):
        return [
            schema('msar'),
            schema('__msar'),
            schema('mathesar_types'),
            schema('presentation_schema'),
            schema('public'),
        ] + ([schema('pg_catalog'), schema('information_schema')] if include_system else [])

    monkeypatch.setattr(schemas.base, 'connect', mock_connect)
    monkeypatch.setattr(schemas.base, 'list_schemas', mock_list_schemas)
    listed = schemas.list_(database_id=database_id, request=request)
    assert [s['name'] for s in listed] == ['public']
    assert [s['internal'] for s in listed] == [False]


def test_schemas_list_shows_internal_schemas_when_asked(rf, monkeypatch):
    """
    Asking for them gets the database's own schemas as well as Mathesar's, each marked.
    """
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
        yield True

    asked = {}

    def mock_list_schemas(conn, include_system=False):
        asked['include_system'] = include_system
        return [
            schema('msar'),
            schema('presentation_schema'),
            schema('public'),
            schema('pg_catalog'),
            schema('information_schema'),
        ]

    monkeypatch.setattr(schemas.base, 'connect', mock_connect)
    monkeypatch.setattr(schemas.base, 'list_schemas', mock_list_schemas)
    listed = schemas.list_(
        database_id=database_id, include_internal=True, request=request
    )
    assert asked == {'include_system': True}
    assert [(s['name'], s['internal']) for s in listed] == [
        ('msar', True),
        ('presentation_schema', True),
        ('public', False),
        ('pg_catalog', True),
        ('information_schema', True),
    ]
