----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- PRESENTATION METADATA
--
-- How Mathesar shows a column: the currency symbol on an amount, the width of the column, the way a
-- date is written out. None of it changes what the data means, so none of it belongs in the
-- catalog, but all of it belongs with the data rather than in an application database elsewhere.
--
-- The schema is called presentation_schema by analogy with information_schema: somewhere to look
-- when you want to know how a thing is shown rather than what it is.
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS presentation_schema;


CREATE TABLE IF NOT EXISTS presentation_schema.columns (
  -- The table the column belongs to.
  --
  -- A regclass rather than a bare OID, which buys two things. It is an OID underneath, so it
  -- follows the table through a rename of either the table or its schema. And pg_dump writes it out
  -- as a qualified name, which a restore resolves afresh against the new catalog.
  "table" regclass NOT NULL,

  -- The column, by attnum. This is what binds the row while the database is live: like Postgres's
  -- own pg_description, it follows the column through a rename without anyone having to intervene.
  attnum smallint NOT NULL,

  -- The column's name, kept up to date behind the attnum.
  --
  -- Postgres has no regclass for a column -- a column is an (attrelid, attnum) pair rather than an
  -- object with an OID of its own -- so pg_dump cannot write our attnum out as a name the way it
  -- writes COMMENT ON COLUMN. This is that translation done by hand: after a restore the attnum
  -- means nothing, and the name is the only thing left to go on.
  column_name name NOT NULL,

  -- The OID this row was last written against.
  --
  -- A restore resolves "table" to a fresh OID, so a value that no longer matches is a reliable sign
  -- that the attnums may have shifted underneath us and that column_name is the one to believe. It
  -- is what keeps a restored row from landing its settings on some unrelated column.
  written_against oid NOT NULL,

  bool_input text CONSTRAINT bool_input_known
    CHECK (bool_input IN ('dropdown', 'checkbox')),
  bool_true text,
  bool_false text,
  num_min_frac_digits integer CONSTRAINT num_min_frac_digits_sane
    CHECK (num_min_frac_digits BETWEEN 0 AND 20),
  num_max_frac_digits integer CONSTRAINT num_max_frac_digits_sane
    CHECK (num_max_frac_digits BETWEEN 0 AND 20),
  num_grouping text CONSTRAINT num_grouping_known
    CHECK (num_grouping IN ('always', 'auto', 'never')),
  num_format text CONSTRAINT num_format_known
    CHECK (num_format IN ('english', 'german', 'french', 'hindi', 'swiss')),
  mon_currency_symbol text,
  mon_currency_location text CONSTRAINT mon_currency_location_known
    CHECK (mon_currency_location IN ('after-minus', 'end-with-space')),
  time_format text,
  date_format text,
  duration_min text,
  duration_max text,
  duration_format text CONSTRAINT duration_format_known
    CHECK (duration_format IN ('clock', 'words')),
  display_width integer CONSTRAINT display_width_positive
    CHECK (display_width > 0),
  file_backend text,
  user_display_field text CONSTRAINT user_display_field_known
    CHECK (user_display_field IN ('full_name', 'email', 'username')),
  array_delimiter character(1),

  -- Where the column sits when the table is shown, lowest first. Null means nobody has said, and
  -- such a column is left out of the order for the client to put wherever it likes.
  --
  -- This is the table's column order, kept a column at a time rather than as a list on the table,
  -- so that it is carried by the same three identifiers as everything else here: a reordered table
  -- comes through a rename and a restore already knowing where its columns go.
  display_position smallint,

  CONSTRAINT frac_digits_in_order
    CHECK (num_min_frac_digits <= num_max_frac_digits),

  -- Deferrable because healing a restored table moves several rows between attnums at once, and
  -- the slot one row is vacating may be the slot another is moving into.
  CONSTRAINT columns_pkey PRIMARY KEY ("table", attnum) DEFERRABLE INITIALLY IMMEDIATE
);


-- Options added after the table was first created.
--
-- A database that already has the table gets them here; one that doesn't already had them from the
-- CREATE above, and these do nothing. Adding an option to Mathesar means a line in the table and a
-- line here, and nothing else: the option list is read off the table itself.
ALTER TABLE presentation_schema.columns ADD COLUMN IF NOT EXISTS display_position smallint;


CREATE OR REPLACE FUNCTION
msar.column_presentation_options() RETURNS SETOF name AS $$/*
Return the names of the presentation options a column can have.

Read off the table itself, so that adding an option to presentation_schema.columns is all it takes
to be able to set one.
*/
SELECT attname
FROM pg_catalog.pg_attribute
WHERE attrelid = 'presentation_schema.columns'::regclass
  AND attnum > 0
  AND NOT attisdropped
  AND attname NOT IN ('table', 'attnum', 'column_name', 'written_against', 'display_position');
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
msar.heal_column_presentation(tab_id oid) RETURNS void AS $$/*
Put a table's presentation rows back in step with the table.

Two kinds of drift are possible, and which one has happened is not a guess: a row written against
this very OID is bound by its attnum, and the cached name is what needs correcting; a row written
against some other OID came through a restore, where the attnum means nothing and the name is all
we have.

Args:
  tab_id: The OID of the table whose presentation rows we're healing.
*/
BEGIN
  -- The row's column is gone from a table that has been restored or replaced. There is nothing left
  -- to attach the settings to.
  DELETE FROM presentation_schema.columns p
  WHERE p."table" = tab_id::regclass
    AND p.written_against <> tab_id
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = tab_id AND a.attname = p.column_name
        AND a.attnum > 0 AND NOT a.attisdropped
    );

  -- Restored: find where the column has got to by name, and start trusting the attnum again.
  SET CONSTRAINTS presentation_schema.columns_pkey DEFERRED;
  UPDATE presentation_schema.columns p
  SET attnum = a.attnum, written_against = tab_id
  FROM pg_catalog.pg_attribute a
  WHERE p."table" = tab_id::regclass
    AND p.written_against <> tab_id
    AND a.attrelid = tab_id AND a.attname = p.column_name
    AND a.attnum > 0 AND NOT a.attisdropped;
  SET CONSTRAINTS presentation_schema.columns_pkey IMMEDIATE;

  -- Live: the attnum is right, so refresh the name in case the column was renamed by something
  -- other than Mathesar. It costs nothing now and is the difference between a dump that restores
  -- correctly and one that does not.
  UPDATE presentation_schema.columns p
  SET column_name = a.attname
  FROM pg_catalog.pg_attribute a
  WHERE p."table" = tab_id::regclass
    AND p.written_against = tab_id
    AND a.attrelid = tab_id AND a.attnum = p.attnum
    AND p.column_name <> a.attname;

  -- The column was dropped while the table stayed put.
  DELETE FROM presentation_schema.columns p
  WHERE p."table" = tab_id::regclass
    AND p.written_against = tab_id
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = tab_id AND a.attnum = p.attnum
        AND a.attnum > 0 AND NOT a.attisdropped
    );
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.presentation_attnum(
  tab_id oid, stored_attnum smallint, col_name name, written_against oid
) RETURNS smallint AS $$/*
Return where a stored presentation row's column is now, or null if it is gone.

The whole of the identity question in one place: while the OID the row was written against is still
the table's, the attnum is what binds; once it isn't, a restore has been through and the name is all
there is to go on.

Args:
  tab_id: The OID of the table the row belongs to.
  stored_attnum: The attnum recorded on the row.
  col_name: The column name recorded on the row.
  written_against: The OID the row was last written against.
*/
SELECT CASE WHEN written_against = tab_id THEN (
  SELECT a.attnum FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = tab_id AND a.attnum = stored_attnum AND NOT a.attisdropped
) ELSE (
  SELECT a.attnum FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = tab_id AND a.attname = col_name
    AND a.attnum > 0 AND NOT a.attisdropped
) END;
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
msar.column_presentation(tab_id oid) RETURNS jsonb AS $$/*
Return a table's presentation options, as an object keyed by the column's current attnum.

Resolving rather than healing, so that this works for someone with no privilege to write. A row
written against another OID is read through its name; if the name is gone, so is the row's meaning,
and it is left out.

Args:
  tab_id: The OID of the table whose presentation we want.
*/
SELECT COALESCE(jsonb_object_agg(live_attnum::text, options), '{}'::jsonb)
FROM (
  SELECT
    msar.presentation_attnum(tab_id, p.attnum, p.column_name, p.written_against) AS live_attnum,
    to_jsonb(p) - 'table' - 'attnum' - 'column_name' - 'written_against' - 'display_position'
      AS options
  FROM presentation_schema.columns p
  WHERE p."table" = tab_id::regclass
) AS resolved
WHERE live_attnum IS NOT NULL;
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
msar.ensure_column_presentation(tab_id oid, col_id integer) RETURNS boolean AS $$/*
Make sure a column has a presentation row, and say whether the column is there at all.

Args:
  tab_id: The OID of the table containing the column.
  col_id: The attnum of the column.
*/
DECLARE
  col_name name;
BEGIN
  SELECT a.attname INTO col_name
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = tab_id AND a.attnum = col_id AND a.attnum > 0 AND NOT a.attisdropped;

  IF col_name IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM presentation_schema.columns
    WHERE "table" = tab_id::regclass AND attnum = col_id
  ) THEN
    INSERT INTO presentation_schema.columns ("table", attnum, column_name, written_against)
    VALUES (tab_id::regclass, col_id, col_name, tab_id);
  END IF;
  RETURN true;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.set_column_presentation(tab_id oid, col_id integer, options jsonb) RETURNS void AS $$/*
Set some of a column's presentation options, leaving the rest as they were.

An option named in `options` is written, including when its value is null, which clears it. An
option left out is not touched. An option we don't know is an error rather than a thing quietly
ignored, so that a typo shows up at once.

Args:
  tab_id: The OID of the table containing the column.
  col_id: The attnum of the column.
  options: An object of presentation options to set.
*/
DECLARE
  col_name name;
  unknown text;
  assignments text;
BEGIN
  SELECT a.attname INTO col_name
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = tab_id AND a.attnum = col_id AND a.attnum > 0 AND NOT a.attisdropped;

  IF col_name IS NULL THEN
    RAISE EXCEPTION 'Column % of table % does not exist', col_id, tab_id::regclass;
  END IF;

  SELECT string_agg(key, ', ' ORDER BY key) INTO unknown
  FROM jsonb_object_keys(options) AS key
  WHERE key NOT IN (SELECT msar.column_presentation_options());

  IF unknown IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown presentation options: %', unknown
    USING HINT = 'See presentation_schema.columns for the options a column can have.';
  END IF;

  PERFORM msar.heal_column_presentation(tab_id);

  PERFORM msar.ensure_column_presentation(tab_id, col_id);

  SELECT string_agg(format('%I = %L', key, value), ', ') INTO assignments
  FROM jsonb_each_text(options);

  IF assignments IS NOT NULL THEN
    EXECUTE format(
      'UPDATE presentation_schema.columns SET %s WHERE "table" = $1 AND attnum = $2', assignments
    ) USING tab_id::regclass, col_id;
  END IF;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.drop_column_presentation(tab_id oid, col_id integer) RETURNS void AS $$/*
Forget a column's presentation options.

Args:
  tab_id: The OID of the table containing the column.
  col_id: The attnum of the column.
*/
DELETE FROM presentation_schema.columns
WHERE "table" = tab_id::regclass AND attnum = col_id;
$$ LANGUAGE SQL;


CREATE OR REPLACE FUNCTION
msar.table_column_order(tab_id oid) RETURNS jsonb AS $$/*
Return the attnums of a table's columns in the order they should be shown, or null if nobody has
said what that order is.

A column nobody has placed is left out rather than put at one end, which is what lets a column added
after the ordering was set be shown wherever the client thinks best.

Args:
  tab_id: The OID of the table.
*/
SELECT jsonb_agg(attnum ORDER BY display_position, attnum)
FROM (
  SELECT
    msar.presentation_attnum(tab_id, p.attnum, p.column_name, p.written_against) AS attnum,
    p.display_position
  FROM presentation_schema.columns p
  WHERE p."table" = tab_id::regclass AND p.display_position IS NOT NULL
) AS placed
WHERE attnum IS NOT NULL;
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
msar.table_column_orders() RETURNS jsonb AS $$/*
Return every table's column order in the database, keyed by table OID.

For listing a schema's tables, where asking table by table would be a query apiece.
*/
SELECT COALESCE(jsonb_object_agg(tab_id, ordering), '{}'::jsonb)
FROM (
  SELECT
    p."table"::oid::bigint::text AS tab_id,
    msar.table_column_order(p."table"::oid) AS ordering
  FROM presentation_schema.columns p
  WHERE p.display_position IS NOT NULL
  GROUP BY p."table"
) AS ordered
WHERE ordering IS NOT NULL;
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
msar.set_table_column_order(tab_id oid, col_ids jsonb) RETURNS void AS $$/*
Say what order a table's columns should be shown in.

A column left out of `col_ids` is unplaced, and one named in it that no longer exists is passed
over: the order is a record of what someone dragged where, and a client is expected to cope with it
naming a column that has since gone.

Args:
  tab_id: The OID of the table.
  col_ids: An array of attnums, in the order the columns should be shown, or null to say nothing.
*/
DECLARE
  placement record;
BEGIN
  PERFORM msar.heal_column_presentation(tab_id);

  UPDATE presentation_schema.columns
  SET display_position = NULL
  WHERE "table" = tab_id::regclass AND display_position IS NOT NULL;

  IF col_ids IS NOT NULL AND jsonb_typeof(col_ids) = 'array' THEN
    FOR placement IN
      SELECT value::integer AS col_id, ordinality AS position
      FROM jsonb_array_elements_text(col_ids) WITH ORDINALITY
    LOOP
      IF msar.ensure_column_presentation(tab_id, placement.col_id) THEN
        UPDATE presentation_schema.columns
        SET display_position = placement.position
        WHERE "table" = tab_id::regclass AND attnum = placement.col_id;
      END IF;
    END LOOP;
  END IF;

  -- A row that exists only to hold a placement that has since been cleared is just clutter.
  DELETE FROM presentation_schema.columns p
  WHERE p."table" = tab_id::regclass
    AND p.display_position IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_each(to_jsonb(p)) AS o(key, value)
      WHERE o.key IN (SELECT msar.column_presentation_options()) AND o.value <> 'null'::jsonb
    );
END;
$$ LANGUAGE plpgsql;
