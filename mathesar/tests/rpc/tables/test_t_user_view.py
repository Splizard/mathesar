"""
This file tests how one person last left a table.

Fixtures:
    rf(pytest-django): Provides mocked `Request` objects.
"""
import pytest

from mathesar.models.base import Database, Server, UserTableView
from mathesar.models.users import User
from mathesar.rpc.tables import user_view


@pytest.fixture
def people_and_database(db):
    server = Server.objects.create(host="example.com", port=5432)
    database = Database.objects.create(name="mydb", server=server)
    alice = User.objects.create(username="alice", is_superuser=True)
    bob = User.objects.create(username="bob", is_superuser=True)
    return alice, bob, database


def _request(rf, user):
    request = rf.post('/api/rpc/v0', data={})
    request.user = user
    return request


def test_nothing_kept_until_something_is_changed(rf, people_and_database):
    alice, _, database = people_and_database
    assert user_view.get(
        table_oid=1234, database_id=database.id, request=_request(rf, alice)
    ) is None


def test_what_is_kept_comes_back_and_is_replaced(rf, people_and_database):
    alice, _, database = people_and_database
    filtering = ['g', 'and', [['i', '2', 'contains', 'cat']]]
    user_view.set_(
        table_oid=1234,
        database_id=database.id,
        view={'filtering': filtering, 'hidden_columns': ['3', '4']},
        request=_request(rf, alice),
    )
    assert user_view.get(
        table_oid=1234, database_id=database.id, request=_request(rf, alice)
    ) == {'filtering': filtering, 'hidden_columns': ['3', '4']}

    user_view.set_(
        table_oid=1234,
        database_id=database.id,
        view={'filtering': None, 'hidden_columns': []},
        request=_request(rf, alice),
    )
    assert user_view.get(
        table_oid=1234, database_id=database.id, request=_request(rf, alice)
    ) == {'filtering': None, 'hidden_columns': []}
    assert UserTableView.objects.count() == 1


def test_each_person_has_their_own(rf, people_and_database):
    alice, bob, database = people_and_database
    user_view.set_(
        table_oid=1234,
        database_id=database.id,
        view={'filtering': None, 'hidden_columns': ['3']},
        request=_request(rf, alice),
    )
    assert user_view.get(
        table_oid=1234, database_id=database.id, request=_request(rf, bob)
    ) is None
    assert user_view.get(
        table_oid=5678, database_id=database.id, request=_request(rf, alice)
    ) is None


@pytest.mark.parametrize('view', [
    {'filtering': 'not a list', 'hidden_columns': None},
    {'filtering': None, 'hidden_columns': [3]},
    {'filtering': None, 'hidden_columns': ['x' * 70000]},
])
def test_refuses_what_is_not_a_view(rf, people_and_database, view):
    alice, _, database = people_and_database
    with pytest.raises(Exception):
        user_view.set_(
            table_oid=1234, database_id=database.id, view=view, request=_request(rf, alice)
        )
    assert UserTableView.objects.count() == 0
