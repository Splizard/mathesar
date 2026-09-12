----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- SAYING WHAT CHANGED
--
-- Postgres will carry a message to whoever is listening for it, and that is how everybody looking
-- at a table finds out that somebody else has changed it.
--
-- Said by Mathesar as it makes the change rather than by a trigger on the user's tables. Every
-- edit Mathesar makes goes through one of three functions, so those three are the whole of it: no
-- DDL on anybody's data, nothing to turn on per table, and nothing left behind on a table that
-- Mathesar stops looking after. The cost of that is honest -- a change made by something other
-- than Mathesar, in SQL or by another application, says nothing, and a trigger would be what it
-- took to hear about those.
--
-- The message is carried inside the transaction that made the change, so it arrives only if the
-- change is committed, and it arrives after. Nobody is told about work that was rolled back.
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION msar.change_channel() RETURNS text AS $$/*
The name of the channel changes are announced on.

One channel for the whole database rather than one per table: a listener says which tables it
cares about and ignores the rest, which is cheaper than it sounds and saves holding a LISTEN per
table somebody happens to be looking at.
*/
SELECT 'mathesar_changes';
$$ LANGUAGE SQL IMMUTABLE PARALLEL SAFE;


CREATE OR REPLACE FUNCTION msar.keys_as_text(keys jsonb) RETURNS jsonb AS $$/*
Write a list of primary key values out as text, whatever they are stored as.

A key reaches here as a number from one place and as a string from another, depending on which
statement it came back from, and a listener matching what it is showing against what changed
should not have to know which. One shape, and text is the one every key has.

Args:
  keys: The primary key values, as a JSON array.
*/
SELECT CASE WHEN keys IS NULL THEN '[]'::jsonb ELSE (
  SELECT COALESCE(jsonb_agg(to_jsonb(key #>> '{}') ORDER BY ordinality), '[]'::jsonb)
  FROM jsonb_array_elements(keys) WITH ORDINALITY AS k(key, ordinality)
) END;
$$ LANGUAGE SQL IMMUTABLE;


CREATE OR REPLACE FUNCTION msar.change_message(tab_id oid, op text, keys jsonb)
  RETURNS text AS $$/*
The message saying that records of a table have been added, changed or taken away.

It says which table, what happened to it, and which records, and nothing else. Not the values: a
listener is being told that what it is showing is out of date, and what it does about that is go
and ask. Values in here would be a second way for the same fact to travel, and the one nobody
checked the privileges on.

Postgres will not carry a message longer than 8000 bytes, so a change to more records than will
fit says how many there were and names none of them. A listener told that much knows to ask again
about the whole table, which is the right thing to do with a change that large anyway.

Written apart from the saying of it so that what gets said can be tested. A notification only
reaches anybody on commit, and a test that rolls back is never a listener.

Args:
  tab_id: The OID of the table whose records changed.
  op: What happened: 'insert', 'update' or 'delete'.
  keys: The primary key values of the records, as a JSON array.
*/
WITH said AS (SELECT msar.keys_as_text(keys) AS as_text)
SELECT CASE
  WHEN octet_length(full_message) > 7000 THEN jsonb_build_object(
    'table', tab_id::bigint, 'op', op, 'keys', '[]'::jsonb,
    'count', jsonb_array_length(as_text)
  )::text
  ELSE full_message
END
FROM said, LATERAL (
  SELECT jsonb_build_object(
    'table', tab_id::bigint, 'op', op, 'keys', as_text,
    'count', jsonb_array_length(as_text)
  )::text AS full_message
) AS built;
$$ LANGUAGE SQL IMMUTABLE;


CREATE OR REPLACE FUNCTION msar.announce_change(tab_id oid, op text, keys jsonb)
  RETURNS void AS $$/*
Say that records of a table have been added, changed or taken away.

Args:
  tab_id: The OID of the table whose records changed.
  op: What happened: 'insert', 'update' or 'delete'.
  keys: The primary key values of the records, as a JSON array.
*/
SELECT pg_notify(msar.change_channel(), msar.change_message(tab_id, op, keys));
$$ LANGUAGE SQL;
