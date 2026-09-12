"""
Tests for the websocket that says what changed.

An ASGI application is a function taking a scope and a pair of channels, so it can be driven
directly. No server is started here and no socket is opened: the point of these is what the
handler does with what it is given.
"""
import asyncio
import json
import threading

import pytest

from mathesar.realtime import changes


def scope_with_cookie(cookie=b'sessionid=abc123', path='/ws/changes'):
    return {'type': 'websocket', 'path': path, 'headers': [(b'cookie', cookie)]}


class Channels:
    """Stands in for the pair of channels an ASGI server gives the application."""

    def __init__(self, incoming):
        self.incoming = list(incoming)
        self.sent = []
        self.exhausted = asyncio.Event()

    async def receive(self):
        if self.incoming:
            return self.incoming.pop(0)
        # Nothing more to say, which for a socket means waiting rather than ending.
        self.exhausted.set()
        await asyncio.sleep(3600)
        raise AssertionError('unreachable')

    async def send(self, message):
        self.sent.append(message)


def run(app_coro, timeout=5):
    return asyncio.run(asyncio.wait_for(app_coro, timeout))


def test_the_session_cookie_is_found_among_the_headers():
    assert changes._session_key_from_scope(
        {'headers': [(b'host', b'x'), (b'cookie', b'other=1; sessionid=wanted; a=2')]}
    ) == 'wanted'


def test_no_cookie_at_all():
    assert changes._session_key_from_scope({'headers': []}) is None
    assert changes._session_key_from_scope({}) is None


def test_a_cookie_without_a_session():
    assert changes._session_key_from_scope(
        {'headers': [(b'cookie', b'theme=dark')]}
    ) is None


@pytest.mark.parametrize("tables, table, expected", [
    ({16385}, 16385, True),
    ({16385}, 99999, False),
    ({16385, 16390}, 16390, True),
    # A page that named no table is watching the database rather than a table of it.
    (set(), 16385, True),
])
def test_which_changes_a_page_asked_about(tables, table, expected):
    payload = json.dumps({'table': table, 'op': 'update', 'keys': ['1'], 'count': 1})
    assert changes._watches(payload, tables) is expected


def test_a_change_that_is_not_a_change_is_not_passed_on():
    assert changes._watches('not json at all', {16385}) is False
    assert changes._watches('[]', {16385}) is False


def test_a_socket_that_cannot_say_who_it_is_is_closed(monkeypatch):
    monkeypatch.setattr(changes, '_user_from_session', lambda key: None)
    channels = Channels([{'type': 'websocket.connect'}])
    run(changes.changes_socket(scope_with_cookie(), channels.receive, channels.send))
    assert channels.sent == [
        {'type': 'websocket.accept'},
        {'type': 'websocket.close', 'code': 4401},
    ]


def test_a_socket_asking_for_nothing_in_particular_is_closed(monkeypatch):
    monkeypatch.setattr(changes, '_user_from_session', lambda key: 'alice')
    channels = Channels([
        {'type': 'websocket.connect'},
        {'type': 'websocket.receive', 'text': 'not json'},
    ])
    run(changes.changes_socket(scope_with_cookie(), channels.receive, channels.send))
    assert channels.sent[-1] == {'type': 'websocket.close', 'code': 4400}


def test_a_socket_asking_about_a_database_it_cannot_reach_is_closed(monkeypatch):
    monkeypatch.setattr(changes, '_user_from_session', lambda key: 'alice')
    monkeypatch.setattr(changes, '_may_watch', lambda database_id, user: False)
    channels = Channels([
        {'type': 'websocket.connect'},
        {'type': 'websocket.receive', 'text': json.dumps({'database_id': 3})},
    ])
    run(changes.changes_socket(scope_with_cookie(), channels.receive, channels.send))
    assert channels.sent[-1] == {'type': 'websocket.close', 'code': 4403}


def test_a_change_to_a_watched_table_reaches_the_page(monkeypatch):
    """
    The whole of it: a page says what it watches, a change is heard, and the page is told.

    The listening is stubbed out at the one function that touches Postgres, so this is about what
    the socket does with a change rather than about Postgres carrying one. That it carries one is
    checked against a real database, not here.
    """
    monkeypatch.setattr(changes, '_user_from_session', lambda key: 'alice')
    monkeypatch.setattr(changes, '_may_watch', lambda database_id, user: True)

    watched = json.dumps({'table': 16385, 'op': 'update', 'keys': ['7'], 'count': 1})
    ignored = json.dumps({'table': 99999, 'op': 'insert', 'keys': ['1'], 'count': 1})
    listening = threading.Event()

    def fake_listen(database_id, user, put, stop):
        assert database_id == 3
        listening.set()
        put(ignored)
        put(watched)
        stop.wait(5)

    monkeypatch.setattr(changes, '_listen', fake_listen)

    channels = Channels([
        {'type': 'websocket.connect'},
        {'type': 'websocket.receive', 'text': json.dumps(
            {'database_id': 3, 'tables': [16385]}
        )},
    ])

    async def drive():
        task = asyncio.ensure_future(
            changes.changes_socket(scope_with_cookie(), channels.receive, channels.send)
        )
        # Once the socket has run out of things to receive it is waiting for the page to go away,
        # which means the listening thread has started and anything it said has arrived.
        await asyncio.wait_for(channels.exhausted.wait(), 5)
        for _ in range(50):
            if any(m['type'] == 'websocket.send' for m in channels.sent):
                break
            await asyncio.sleep(0.05)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    asyncio.run(asyncio.wait_for(drive(), 10))
    assert listening.is_set()
    sent = [m['text'] for m in channels.sent if m['type'] == 'websocket.send']
    assert sent == [watched], sent


def test_a_socket_opened_somewhere_else_is_refused():
    channels = Channels([{'type': 'websocket.connect'}])
    run(changes.changes_socket(
        scope_with_cookie(path='/ws/something-else'), channels.receive, channels.send
    ))
    assert channels.sent == [{'type': 'websocket.close', 'code': 4404}]
