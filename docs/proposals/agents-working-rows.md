# Agents working rows

A proposal for row 2 of the feature-idea table: *"Assign AI agents rows somehow
(user?), so they can work on them, need some way to easily prompt your agent to
connect to the DB."*

Not built. This is the case for a shape, so that the decision can be made before
the code is.

## What we do now

The table of feature ideas is the work queue. A human reads it, picks a row,
tells an agent what to do, watches it work, and ticks the row afterwards. The
agent reaches the database through whatever was to hand: an SSH session, a
Django shell, environment variables copied out of a config file.

Everything that matters about the work is outside Mathesar. Which row is being
worked lives in the conversation. Who is working it lives in the human's head.
Whether it was finished lives in a boolean somebody remembers to tick. Two
agents pointed at the same table would both take the same row and neither would
know. And an agent cannot start: it has to be told, every time, by someone who
is awake.

## What "streamlined" should mean

Four things, in the order they matter:

1. An agent is a **collaborator Mathesar knows about**, with an identity and
   privileges, rather than an anonymous process holding someone's credentials.
2. **Assignment is a fact in the user's own table**, not in a side channel.
3. An agent **waits to be given work** rather than being told to look.
4. **Connecting is one step**: one URL, one token, and the agent finds the rest.

## The shape

### An agent is a user

The fork already has a user column type: a column whose values are Mathesar
users, with a picker, and a trigger that records who last changed a record.

An agent should be a Mathesar user with a flag saying it is one. Nothing else is
needed to answer "who":

- it appears in a user column's picker like anybody else;
- it connects as a Postgres role, so the database decides what it may touch;
- its writes are attributed by the machinery that already attributes writes.

The flag earns its keep in the interface — an agent is worth showing differently
from a person, and worth filtering by — and in refusing it a password login.

### Assignment is a column

You assign work by setting a user column to an agent. That is the whole
mechanism.

A table becomes a work queue for agents by having a user column and whatever it
already has to say a row is finished. Mathesar should not impose a schema for
this; it should **notice** one. The feature-idea table already has `resolved`
and `Priority`; it needs one more column, of a type that already exists.

This is the part that makes the rest small. There is no task system to build, no
second place for work to live, and no synchronising between the table somebody
reads and the queue an agent drains. The table somebody reads *is* the queue.

### Waiting, not polling

An agent should be woken when a row becomes its own, not go looking every
minute.

This is row 1's plumbing — `NOTIFY`/`LISTEN` behind a websocket — and it is the
reason **row 1 should be built before row 2**. An agent opens a websocket, says
which tables it cares about, and is woken when a record assigned to it changes.
Row 2 is then mostly a consumer of row 1 rather than a thing of its own.

Two details that will bite if they are left until later:

- An agent must not be woken by its own writes, or it will wake itself forever.
- Being woken is not the same as being told to spend money. A wake-up should
  hand the agent a row, and it should be possible to require a human's word
  before it acts on one.

### Connecting in one step

The ask is "some way to easily prompt your agent to connect to the DB". The
smallest thing that answers it properly is **an MCP server shipped with
Mathesar**, because MCP is what agents already speak.

Given one URL and one token it would:

- discover the databases, schemas and tables that token can see;
- expose the RPC methods that already exist as tools — `tables.list`,
  `records.list`, `records.patch`, `columns.list` and their neighbours;
- subscribe to the agent's own assignments over the websocket.

This is a thin adapter over the JSON-RPC API rather than new capability. Almost
every tool is one existing method. That is the point: the work is in making the
surface reachable, not in inventing a surface.

### Claiming, for more than one agent

Assignment alone is enough while a human assigns. For a pool of agents drawing
their own work, add one method:

```
records.claim_next(table_oid, assignee_column, agent)
```

implemented as a single `UPDATE ... WHERE <assignee> IS NULL ... LIMIT 1
RETURNING ...`. Atomic because it is one statement, so there is no lock to hold
and no race to lose. Nothing else about the design changes.

### What the agent writes back

Nothing new. It patches the record: sets the assignee to itself, writes progress
into whatever column the table has for it, ticks the row when it is done. A
record's history is already the record.

## What to build, in order

1. **Row 1's transport.** Websockets over `NOTIFY`/`LISTEN`. Row 2 waits on it.
2. **Agent users.** A flag on the user model, and the refusal of a password
   login for one. The user column already works.
3. **The MCP server.** A thin adapter over the existing RPC, plus a subscription
   to the agent's own assignments.
4. **`records.claim_next`.** Only when there is more than one agent.

Each of these is useful on its own, which is the test of whether the order is
right. The transport is worth having for human collaborators. Agent users are
worth having for attribution. The MCP server is worth having even if nothing is
ever assigned, because it is how an agent reads the database at all.

## What not to build

- **A task table.** The user's own table is the queue. A second one would have
  to be kept in step with the first.
- **A bespoke agent protocol.** MCP exists and agents speak it.
- **Prompts stored in Mathesar.** A row says what the work is; how to ask for it
  is the agent's business, and putting prompts in the database makes the database
  responsible for them.
- **Long-lived superuser tokens.** An agent should be no more privileged than the
  person who set it going.

## Open questions, honestly

- **Assignment is not containment.** Giving an agent the privilege to write the
  rows assigned to it means giving it the privilege to write the table.
  Postgres can grant by column but not by row without policies, and Mathesar's
  role model is per-table. So assigning a row to an agent is an expression of
  trust, not a boundary. If it needs to be a boundary, that is row-level security
  and a much bigger piece of work — worth deciding before, not after.
- **Runaway work.** An agent woken on every change to a large table can spend a
  lot of money quickly. Whatever the answer is — a rate limit, a budget, a human
  confirmation — it belongs in the first version rather than the third.
- **What "in progress" means.** The feature-idea table has `resolved` and
  nothing between "not started" and "done". Adding a status column is the
  obvious answer, but it is the user's table and the choice is theirs.
