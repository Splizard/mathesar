# Agents working rows

A proposal for row 2 of the feature-idea table: *"Assign AI agents rows somehow
(user?), so they can work on them, need some way to easily prompt your agent to
connect to the DB."*

**Step 2 is now built** -- agents are users with owners, and the sections below marked
*Built* describe what is there rather than what is proposed. The rest still stands as a
case for a shape.

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

### An agent belongs to a user (*Built*)

The fork already has a user column type: a column whose values are Mathesar
users, with a picker, and a trigger that records who last changed a record.

An agent is a Mathesar user with an **owner** — not a flag, and emphatically not
a model. "Claude" is not a collaborator; *your* Claude is. The principal is the
pair, a person and the agent they set going, and the model is a property of that
agent rather than its name. Two people both running Claude then have two agent
users that happen to carry the same `agent_model` label, the same way two people
both using Firefox are still two people.

Making the owner a real foreign key rather than a flag does a surprising amount
of work at once:

- **Naming.** An agent's name only has to be unique *among its owner's agents*,
  so you and a colleague can each have a "Claude" without either being made to
  pick again. What tells them apart on the page is the owner: "Quentin's Claude",
  "Bligh's Agent". The globally unique handle underneath (`quentin__claude`,
  which doubles as a Postgres role name) is derived and never shown.
- **Attribution.** The user-tracking trigger records the agent, and the agent
  records its owner, so "who did this" is answerable at either grain.
- **Privileges.** An agent reaches a database exactly as far as its owner and no
  further: with no role of its own it borrows its owner's. This is most of the
  answer to the containment question below.
- **The picker.** A user column offers each person followed by the agents they
  set going, so an agent is read beside whoever is answerable for it.

Three rules fall out and are enforced:

- **One level only.** An agent cannot own an agent. Sub-agents are real — an
  agent spawning its own is routine — but they act *as* their parent rather than
  being Mathesar users, or the tree of principals is unbounded and privilege
  derivation becomes a chain to walk.
- **An agent is never a superuser.** It borrows its owner's reach into the
  databases, but administering Mathesar is not a thing to be delegated.
- **An agent has no password.** It arrives through whatever gate the installation
  puts in front of Mathesar; a password on it would be a second way in that
  nobody is watching.

#### The possessive is applied when shown, not stored

A cell holding an agent always reads the long way round — "Quentin's Claude" —
because a table should mean the same thing to everybody it is shown to, and a
screenshot has no idea who is looking at it. The *picker* is where it shortens to
"Claude" for the person whose agent it is, the way an app says "you" rather than
your own name, because a picker is personal and a stored value is not.

Because it is composed rather than stored, renaming a person renames their agents
with them, and there is nothing to migrate.

#### An agent needs its own way in (*Built*)

This is the part that is easy to miss. Where Mathesar sits behind a gate that
works out who is knocking — SSO merging accounts by email, or this fork's
appliance deriving an identity from the email in a client certificate — **the
address is the identity**. An agent therefore gets one of its own: sharing its
owner's would make the two of them the same person to everything upstream of
Mathesar, which is exactly the telling-apart that owning an agent is for.

But it is **not a mailbox**, and it would be wrong to invent one on somebody's
real domain — that implies a mailbox that does not exist, might collide with one
that does, and would quietly start delivering the day that domain grew a
catch-all. So it is built on a domain nobody can register: RFC 2606 reserves
`.invalid` for precisely this, which makes `quentin-claude@agents.invalid` read,
to anyone who sees it, as the identifier it is. `AGENT_EMAIL_DOMAIN` points it at
a real domain for an identity provider that insists on one.

#### Provisioning is a button (*Built*)

Three manual steps and an ssh session is not "set an agent going", it is sysadmin
homework, so the profile page issues the certificate itself. Pressing **Provision
certificate** returns three things once: the PKCS#12 bundle, its password, and a
setup prompt written to be handed to the agent.

Mathesar holds no signing key. A small root-owned helper (`certmint`) holds the
CA and listens on a unix socket only root and Mathesar's group can open, and the
only thing Mathesar may ask it for is a certificate for an agent it owns. So
anything that got into Mathesar could obtain access for an agent somebody already
has — no worse than the database it would already be holding — but could not mint
a person's identity, and loses all of it the moment the agent is stopped.

Two consequences worth stating plainly:

- **The gate moved.** Caddy's shared mTLS snippet now trusts the client CA rather
  than pinning each leaf, because a button that provisions certificates would
  otherwise rewrite the file that gates everybody's access on every click. Control
  moved to the identity service's allow-list, which `certmint` writes and which
  certid now re-reads **on every sign-in** — so revoking takes effect on the
  agent's next request rather than at the next restart. The two narrow per-person
  gates still pin leaves, deliberately: an agent has no business reaching those.
- **The password is never in the prompt.** The prompt goes into an agent's
  context and from there into a transcript and a log; a password that has been
  through one is spent. The person carries it across themselves, once, and nothing
  on the appliance keeps a copy — a lost bundle is reissued rather than recovered.

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

The ask is "some way to easily prompt your agent to connect to the DB". Half of
it is answered: the agent is handed a certificate and instructions that get it as
far as a working JSON-RPC call, which it can already drive.

The other half is **an MCP server shipped with Mathesar**, because MCP is what
agents already speak. Note that the token this section used to assume is no
longer needed — the client certificate *is* the credential, and the MCP server
presents it the way curl does.

Given one URL and its certificate it would:

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
2. ~~**Agent users.**~~ **Done.** An owner on the user model, the naming and
   display rules above, owner-derived database reach, and the refusal of both a
   password and superuser. The user column already worked.
3. **The MCP server.** A thin adapter over the existing RPC, plus a subscription
   to the agent's own assignments. No token to design: the certificate an agent is
   now issued is what it authenticates with.
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
  person who set it going — and now has no token at all, only a certificate that
  expires and can be pulled.

## Open questions, honestly

- **Assignment is not containment.** Deriving an agent's reach from its owner's
  settles the worst of this: an agent can never become a way to get privileges
  the person who set it going does not have, which is what you would otherwise
  fear from a pool of agents on a shared database. What it does not settle is the
  row: giving an agent the privilege to write the rows assigned to it means
  giving it the privilege to write the table. Postgres can grant by column but not
  by row without policies, and Mathesar's role model is per-table. So assigning a
  *row* to an agent remains an expression of trust rather than a boundary. If it
  needs to be a boundary, that is row-level security and a much bigger piece of
  work — worth deciding before, not after.
- **The certificate is the credential.** Where identity comes from a client
  certificate, whoever holds an agent's certificate is that agent. Issue one per
  agent, to the machine it runs on, and revoke it rather than trying to detect
  misuse. Two agents handed the same certificate are one agent, the same way two
  people sharing a login are one user, and nothing should try to tell them apart.
- **Runaway work.** An agent woken on every change to a large table can spend a
  lot of money quickly. Whatever the answer is — a rate limit, a budget, a human
  confirmation — it belongs in the first version rather than the third.
- **What "in progress" means.** The feature-idea table has `resolved` and
  nothing between "not started" and "done". Adding a status column is the
  obvious answer, but it is the user's table and the choice is theirs.
