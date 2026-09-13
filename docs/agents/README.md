# Working in Mathesar as an agent

This is the long form of the setup instructions an AI agent is given when a person shares their
Mathesar database with it. The short prompt they pasted to you names the site, who you are, and
what is yours; this page explains the rest. Nothing here is secret, and nothing here is specific
to one installation -- where it says `<site>` or `<agent>`, use the values from your prompt.

The database has been shared with you because it holds data for the work you and that person are
doing together. Use it for that work. It is live data other people rely on, not a sandbox.

- [Your files](#your-files)
- [Installing the certificate](#installing-the-certificate)
- [The script](#the-script)
- [Finding your way around](#finding-your-way-around)
- [How to behave in there](#how-to-behave-in-there)
- [Keeping it safe, and remembering it](#keeping-it-safe-and-remembering-it)
- [When something goes wrong](#when-something-goes-wrong)

## Your files

Everything lives in one well-known place, so any session can find it without being told:

    ~/.config/mathesar/            0700
      <agent>.crt                  your certificate                  0644
      <agent>.key                  its private key -- this is you    0600
      <agent>.conf                 site=, agent=, provider=
      <agent>.session              a signed-in session, written by the script -- also you
      mathesar                     the script you call Mathesar with

Before setting anything up, check whether you already are:

    cd ~/.config/mathesar && ls <agent>.crt <agent>.key && openssl x509 -in <agent>.crt -noout -checkend 86400

`Certificate will not expire` means reuse it: do not look for a bundle and do not ask anybody for a
password. `Certificate will expire` means it runs out within a day or already has, and needs
reissuing. No such file means this is the first time.

## Installing the certificate

The person who set you going downloaded a bundle, `<agent>.p12`, and was shown its password once.
The password is deliberately not in your prompt.

**Do not ask for the password in the conversation.** Anything typed to you there is in your
context, and from there in a transcript, a log, and anything you quote back. There are two ways to
get past that.

**Best: the person unpacks it themselves**, in their own terminal, with the commands under
[Unpacking](#unpacking), and tells you when the files exist. You never see the password at all.

**Otherwise, a hidden prompt** that writes straight to a file openssl reads -- never into a
variable you print, a command line, or your own reasoning:

    umask 077
    mkdir -p ~/.config/mathesar && chmod 700 ~/.config/mathesar && cd ~/.config/mathesar
    # macOS, a real dialog with the typing hidden:
    osascript -e 'display dialog "Mathesar bundle password" default answer "" \
      with hidden answer' -e 'text returned of result' > .pw
    # Linux with zenity:
    zenity --password > .pw
    # Anywhere with a tty:
    read -rs -p "Mathesar bundle password: " p && printf %s "$p" > .pw && unset p

Never `echo` it, and never pass it as `-passin pass:...` -- that lands in the process list and in
shell history.

### Unpacking

    umask 077
    mkdir -p ~/.config/mathesar && chmod 700 ~/.config/mathesar
    mv /path/to/<agent>.p12 ~/.config/mathesar/
    cd ~/.config/mathesar

    openssl pkcs12 -in <agent>.p12 -clcerts -nokeys -out <agent>.crt -passin file:.pw
    openssl pkcs12 -in <agent>.p12 -nocerts -nodes -out <agent>.key -passin file:.pw

    rm -f .pw <agent>.p12
    chmod 600 <agent>.key
    chmod 644 <agent>.crt

Delete `.pw` even if a command failed. (A person doing this themselves can use
`-passin stdin` and type it, instead of `.pw`.) After a reissue, do the same again: the new files
replace the old ones in place and nothing else changes.

## The script

[`mathesar`](mathesar) is a small POSIX shell script. It signs you in with your certificate --
through the same single sign-on a person's browser uses, with no password or token anywhere --
keeps the session in `<agent>.session`, signs in again when that runs out, and sends one JSON-RPC
call. Read it before you run it; it is short.

Your prompt gives the exact commands to write `<agent>.conf` and fetch the script. Then:

    ~/.config/mathesar/mathesar databases.configured.list

    mathesar METHOD                      no params
    mathesar METHOD '{"name": value}'    named params
    mathesar METHOD - < params.json      params from stdin, for anything long or quoted

Every call answers `{"result": ...}` or `{"error": ...}`. Pipe through `python3 -m json.tool` or
`jq` to read it. With more than one agent set up on the same machine, pick one with
`MATHESAR_AGENT=<agent>`.

## Finding your way around

Below, `mathesar` is short for `~/.config/mathesar/mathesar`. The ids chain, so walk down:

    mathesar databases.configured.list                                  # -> id
    mathesar schemas.list '{"database_id": 1}'                          # -> oid
    mathesar tables.list '{"database_id": 1, "schema_oid": 2200}'       # -> oid
    mathesar columns.list '{"database_id": 1, "table_oid": 16384}'      # -> id, name, type

If it is not obvious which tables belong to the work you are doing, ask the person rather than
reading through everything.

A column's `id` is its attnum, and **rows are keyed by column id as a string, not by name**:
`{"1": 42, "2": "Buy milk"}`. Keep the column list to hand to translate.

    # Read, a page at a time
    mathesar records.list '{"database_id": 1, "table_oid": 16384, "limit": 50, "offset": 0}'

    # Filter and order: column 2 contains "milk", highest id first
    mathesar records.list - <<'EOF'
    {"database_id": 1, "table_oid": 16384, "limit": 50,
     "order": [{"attnum": 1, "direction": "desc"}],
     "filter": {"type": "contains_case_insensitive",
                "args": [{"type": "attnum", "value": 2}, {"type": "literal", "value": "milk"}]}}
    EOF

    # Change one row (only the columns you name), add one, delete some
    mathesar records.patch '{"database_id": 1, "table_oid": 16384, "record_id": 7, "record_def": {"3": true}}'
    mathesar records.add '{"database_id": 1, "table_oid": 16384, "record_def": {"2": "Buy bread"}}'
    mathesar records.delete '{"database_id": 1, "table_oid": 16384, "record_ids": [7]}'

`record_id` is the row's primary key value. Filter types include `equal`, `lesser`, `greater`,
`lesser_or_equal`, `greater_or_equal`, `null`, `not_null`, `contains`,
`contains_case_insensitive`, `starts_with` and `starts_with_case_insensitive`, combined with `and`,
`or` and `not`. For a quick text search there is also `records.search` with
`"search_params": [{"attnum": 2, "literal": "milk"}]`.

## How to behave in there

- You are a collaborator in your own right, not a borrowed login. What you change is recorded
  against you, and people can assign rows to you the way they assign them to each other.
- You reach exactly the databases the person who set you going can, and nothing further. An error
  saying you lack a permission means they lack it too. Report it; do not look for a way round it.
- Read before you write. Ask the person before deleting anything, or before changing more than a
  handful of rows at once, and say what you are about to change and how many rows.
- Change tables and columns themselves (adding, renaming, retyping, dropping) only when asked.

## Keeping it safe, and remembering it

`<agent>.key` has no password on it and `<agent>.session` is a signed-in session. **Anyone holding
either file is you.** Never copy them into a repository, a container image, a prompt, a pastebin,
an issue, or anywhere a backup or sync folder might pick them up, and never print their contents.
If you think one has been somewhere it should not have, say so and ask for the certificate to be
reissued -- that revokes the old one.

So that nobody has to walk you through this again, put the site, who you are, and the paths
above in whatever notes you keep between sessions. **Never write down the password, the contents
of the key or the session, or anything you had to unlock to get them.** Notes get read, synced and
shared; the paths are useless to anyone without the files, and the password would not be.

## When something goes wrong

- **`curl: (56)`, a TLS error, or a connection reset:** the certificate is not being sent or not
  being accepted. Check the files are where the script looks, with the names in `<agent>.conf`.
- **`certificate revoked or expired?`:** you got through the gate but were not signed in. If the
  `openssl ... -checkend` check says it has expired, ask for it to be reissued. Otherwise it has
  been revoked -- somebody stopped you deliberately.
- **An empty list of databases:** you are in, but the person has no database access to share yet.
  Tell them; there is nothing for you to fix.
- **`no agent set up` / `more than one agent`:** `<agent>.conf` is missing, or there are several
  and `MATHESAR_AGENT` is not set.

If you stop being let in: do not look for another way in, do not use anybody else's credentials,
do not ask anybody for their password, do not reuse a human's session cookie, and do not reuse a
certificate you were told to replace. Say what happened and stop.
