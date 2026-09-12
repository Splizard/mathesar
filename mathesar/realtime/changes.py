"""
Telling everybody looking at a table that somebody else has changed it.

Postgres carries the message: Mathesar says what it changed as it changes it (see
09_msar_realtime.sql), and a listener hears it on the `mathesar_changes` channel of the database
it was said in. This is the other end of that -- a websocket, one per open page, holding one
LISTEN and passing on the changes to the tables that page is showing.

There is no message broker and nothing shared between processes. Postgres is already the thing
every Mathesar process is connected to, and it already knows how to carry a message to whoever is
listening; putting a second one in front of it would only give the same fact two ways to travel.
The cost is a database connection per open page, which is the thing to watch if this is ever
serving a great many of them.
"""
import asyncio
import json
import logging
import threading

from asgiref.sync import sync_to_async
from django.contrib.auth import get_user_model
from django.contrib.sessions.backends.db import SessionStore
from django.db import connections as django_connections

from mathesar.models.base import Database
from mathesar.rpc.utils import connect

logger = logging.getLogger(__name__)

CHANGE_CHANNEL = 'mathesar_changes'
"""The channel msar.change_channel names. Kept in step with it by hand, being one word."""

CHANGES_PATHS = frozenset({'/ws/changes', '/ws/changes/'})
"""Where a page connects to hear about changes."""

# How long the listening thread waits before looking at whether it has been asked to stop.
LISTEN_TICK_SECONDS = 1.0

# How long a page has to say what it wants to watch before being let go.
SUBSCRIBE_TIMEOUT_SECONDS = 30.0


def _user_from_session(session_key):
    """
    The user a session belongs to, or None.

    The websocket carries the same session cookie the pages do, so somebody watching a table is
    the same somebody who was allowed to open it. A socket that cannot say who it is gets no
    connection to the database, and so hears nothing.
    """
    if not session_key:
        return None
    session = SessionStore(session_key=session_key)
    user_id = session.get('_auth_user_id')
    if not user_id:
        return None
    return get_user_model().objects.filter(pk=user_id).first()


def _session_key_from_scope(scope):
    """The session cookie out of the headers, the scope having no parsed cookies of its own."""
    for name, value in scope.get('headers') or []:
        if name != b'cookie':
            continue
        for part in value.decode('latin-1').split(';'):
            key, _, val = part.strip().partition('=')
            if key == 'sessionid':
                return val
    return None


def _listen(database_id, user, put, stop):
    """
    Hold a LISTEN on the user's database and hand each change to the socket.

    Run in a thread rather than on the event loop: the connection is the same one the rest of
    Mathesar uses, which is a blocking one, and borrowing it is better than keeping a second way
    to connect that nobody else exercises.
    """
    try:
        with connect(database_id, user) as conn:
            conn.autocommit = True
            conn.execute(f'LISTEN {CHANGE_CHANNEL}')
            while not stop.is_set():
                notifies = conn.notifies(timeout=LISTEN_TICK_SECONDS, stop_after=1)
                for note in notifies:
                    put(note.payload)
                    if stop.is_set():
                        break
    except Exception:
        logger.exception('Listening for changes on database %s stopped', database_id)
    finally:
        # The thread had a Django connection of its own to find the database with.
        django_connections.close_all()


def _watches(payload, tables):
    """
    Whether a change is one this page asked about.

    A page watching nothing is watching everything: it has said it wants the database's changes
    without naming a table, which is what a page showing more than one table would ask for.
    """
    if not tables:
        return True
    try:
        return json.loads(payload).get('table') in tables
    except (ValueError, AttributeError):
        return False


async def changes_socket(scope, receive, send):
    """
    A websocket handing on the changes to the tables a page is showing.

    The page sends one message saying which database and which tables it cares about:

        {"database_id": 3, "tables": [16385, 16390]}

    and is then sent each change as it happens:

        {"table": 16385, "op": "update", "keys": ["7"], "count": 1}

    A change says what happened and to which records, never the values. The page is being told
    that what it is showing is out of date; what it does about that is ask again, through the same
    RPC and the same privileges as before.
    """
    message = await receive()
    if message.get('type') != 'websocket.connect':
        return
    # One path, so that a socket opened at any other is refused rather than quietly accepted and
    # then found to do nothing.
    if scope.get('path') not in CHANGES_PATHS:
        await send({'type': 'websocket.close', 'code': 4404})
        return
    await send({'type': 'websocket.accept'})

    user = await sync_to_async(_user_from_session)(_session_key_from_scope(scope))
    if user is None:
        await send({'type': 'websocket.close', 'code': 4401})
        return

    try:
        asked = await asyncio.wait_for(receive(), timeout=SUBSCRIBE_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        await send({'type': 'websocket.close', 'code': 4408})
        return
    if asked.get('type') == 'websocket.disconnect':
        return
    try:
        wanted = json.loads(asked.get('text') or '{}')
        database_id = int(wanted['database_id'])
        tables = {int(oid) for oid in wanted.get('tables') or []}
    except (ValueError, KeyError, TypeError):
        await send({'type': 'websocket.close', 'code': 4400})
        return

    if not await sync_to_async(_may_watch)(database_id, user):
        await send({'type': 'websocket.close', 'code': 4403})
        return

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()
    stop = threading.Event()
    thread = threading.Thread(
        target=_listen,
        args=(
            database_id,
            user,
            lambda payload: loop.call_soon_threadsafe(queue.put_nowait, payload),
            stop,
        ),
        daemon=True,
    )
    thread.start()

    async def hang_up():
        """Wait for the page to go away, so that the listening stops when it does."""
        while True:
            event = await receive()
            if event.get('type') == 'websocket.disconnect':
                return

    hanging_up = asyncio.ensure_future(hang_up())
    try:
        while not hanging_up.done():
            waiting = asyncio.ensure_future(queue.get())
            done, _ = await asyncio.wait(
                {waiting, hanging_up}, return_when=asyncio.FIRST_COMPLETED
            )
            if waiting in done:
                payload = waiting.result()
                if _watches(payload, tables):
                    await send({'type': 'websocket.send', 'text': payload})
            else:
                waiting.cancel()
    finally:
        stop.set()
        hanging_up.cancel()


def _may_watch(database_id, user):
    """
    Whether the user has a connection to this database to listen on at all.

    Asked before the thread starts so that a socket which was never going to hear anything is
    told so rather than left open.
    """
    try:
        Database.objects.get(id=database_id).connect_user(user).close()
        return True
    except Exception:
        return False
