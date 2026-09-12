# Telling pages what changed

Mathesar says what it changed as it changes it, Postgres carries the message, and a websocket
hands it on to the pages watching that table. Three pieces:

- `db/sql/09_msar_realtime.sql` — `msar.announce_change`, called by the three functions that add,
  change and delete records. The message says which table, what happened, and which records. Never
  the values.
- `mathesar/realtime/changes.py` — the websocket, at `/ws/changes`. One per open page, holding one
  `LISTEN` on the page's own database connection, passing on the changes to the tables that page
  asked about.
- `mathesar_ui/src/systems/realtime/changes.ts` — the page's end of it, which asks the records
  again when it hears that they changed.

There is no message broker and nothing shared between processes. Postgres is already what every
Mathesar process is connected to, and it already knows how to carry a message to whoever is
listening.

## What it needs to run

**An ASGI server.** A websocket is not something WSGI can serve, so `config/wsgi.py` cannot serve
this. `config/asgi.py` routes a websocket to the handler, answers the server's lifespan messages,
and gives everything else to Django. It is served with:

```
uvicorn config.asgi:application --host 127.0.0.1 --port 8000 --workers 2
```

`uvicorn[standard]` is in `requirements.txt` — the `[standard]` extra is what brings the websocket
implementation, without which uvicorn refuses the connection. Running it under gunicorn as a
worker class is the older arrangement and no longer supported: `uvicorn.workers` was removed, and
the replacement is a separate `uvicorn-worker` package. Nothing here needs gunicorn's process
management, launchd already supervising the one process.

Run under WSGI instead, every page works exactly as it did and the socket simply never connects.
The browser gives up after a few attempts rather than knocking at a door that was never going to
open, so nothing is wasted and nothing is broken; you just don't get the live updates.

**A session-pooled connection.** `LISTEN` belongs to a session, so a connection pooler in
transaction pooling mode will break it — PgBouncer's default `pool_mode = transaction` among them.
The websocket needs either a direct connection or `pool_mode = session`. (On the Mac mini this is
moot: Mathesar connects to PostgreSQL on 5432 directly, and PgBouncer's `[databases]` is empty.)

**A connection per open page.** Each socket holds one. That is the number to watch if this is ever
serving a great many pages at once, and the point at which a shared listener fanning out to many
sockets starts to be worth its complexity.

## What it does not do

- **Changes made outside Mathesar say nothing.** The announcement is made by the functions
  Mathesar writes records through, so an `UPDATE` typed into psql, or another application writing
  to the same table, is not heard. Triggers on the user's tables would be what it took to hear
  those, at the cost of DDL on everybody's data and something to turn on per table.
- **Nothing is buffered.** A page that was asleep when a change happened is out of date until the
  next one. A page should ask again when it reconnects rather than trusting what it holds.
- **Our own edits come back to us.** A page is told about the change it just made and asks again
  like anybody would. Telling them apart would mean the message saying who made the change.
