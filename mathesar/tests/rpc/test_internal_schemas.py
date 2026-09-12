"""
Tests for keeping the schemas the database and Mathesar keep for themselves read-only.

They are explorable, so every reading endpoint reaches them; the guard on the writing ones is
what stops them being changed. See mathesar.rpc.decorators.refuse_internal_schemas.
"""
from unittest.mock import MagicMock, patch

import pytest

from db.constants import schema_is_internal
from mathesar.models.exceptions import SchemaIsInternal
from mathesar.rpc.decorators import refuse_internal_schemas


@pytest.mark.parametrize("name", [
    'pg_catalog',
    'pg_toast',
    'pg_temp_1',
    'information_schema',
    'msar',
    '__msar',
    'mathesar_types',
    'presentation_schema',
])
def test_schema_is_internal(name):
    assert schema_is_internal(name) is True


@pytest.mark.parametrize("name", ['public', 'Hidden Strings', 'postgres_notes', 'pgcrypto_stuff'])
def test_schema_is_not_internal(name):
    assert schema_is_internal(name) is False


def answering(*names):
    """A connection which says the thing asked about belongs to each of the given schemas."""
    conn = MagicMock()
    conn.__enter__ = MagicMock(return_value=conn)
    conn.__exit__ = MagicMock(return_value=False)
    conn.execute = MagicMock(return_value=[(name,) for name in names])
    return conn


def guarded():
    """A writing endpoint, and a record of the calls that reached it."""
    reached = []

    def endpoint(**kwargs):
        reached.append(kwargs)
        return 'done'

    return refuse_internal_schemas(endpoint), reached


def call(wrapped, **kwargs):
    request = MagicMock()
    return wrapped(database_id=11, request=request, **kwargs)


@pytest.mark.parametrize("key, target", [
    ('schema_oid', 2200),
    ('table_oid', 1259),
    ('type_oid', 16),
])
def test_writing_to_an_internal_schema_is_refused(key, target):
    wrapped, reached = guarded()
    with patch('mathesar.rpc.decorators.connect', return_value=answering('pg_catalog')):
        with pytest.raises(SchemaIsInternal) as excinfo:
            call(wrapped, **{key: target})
    assert 'pg_catalog' in str(excinfo.value)
    assert reached == []


@pytest.mark.parametrize("key, target", [
    ('schema_oid', 2200),
    ('table_oid', 1259),
    ('type_oid', 16),
])
def test_writing_to_the_users_own_schema_goes_through(key, target):
    wrapped, reached = guarded()
    with patch('mathesar.rpc.decorators.connect', return_value=answering('Hidden Strings')):
        assert call(wrapped, **{key: target}) == 'done'
    assert [c[key] for c in reached] == [target]


def test_one_internal_schema_among_several_refuses_them_all():
    """
    Deleting schemas takes a list, and a list with one of these in it is not a thing to do part of.
    """
    wrapped, reached = guarded()
    with patch(
        'mathesar.rpc.decorators.connect',
        return_value=answering('public', 'presentation_schema', 'msar'),
    ):
        with pytest.raises(SchemaIsInternal) as excinfo:
            call(wrapped, schema_oids=[2200, 1234, 5678])
    # Named in a settled order, and only the ones the caller cannot have.
    assert 'msar, presentation_schema' in str(excinfo.value)
    assert 'public' not in str(excinfo.value)
    assert reached == []


def test_a_call_about_nothing_in_particular_is_left_alone():
    """
    A writing endpoint which names no schema, table or type has nothing to check and no reason to
    ask the database anything.
    """
    wrapped, reached = guarded()
    connect = MagicMock()
    with patch('mathesar.rpc.decorators.connect', connect):
        assert call(wrapped, name='a new schema') == 'done'
    assert connect.call_count == 0
    assert len(reached) == 1
