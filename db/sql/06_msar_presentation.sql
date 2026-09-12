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

  -- The unit of a whole number counting from the Unix epoch, when that is what the column holds.
  --
  -- Null, and it is shown as a number. Set, and it is an instant, shown as a date and a time like
  -- any other, using this column's date_format and time_format.
  num_unix_time text CONSTRAINT num_unix_time_known
    CHECK (num_unix_time IN ('seconds', 'milliseconds', 'microseconds', 'nanoseconds')),

  mon_currency_symbol text,
  mon_currency_location text CONSTRAINT mon_currency_location_known
    CHECK (mon_currency_location IN ('after-minus', 'end-with-space')),
  time_format text,
  date_format text,

  -- Whether an instant is shown as a tick rather than as a date and a time.
  --
  -- The value is still the instant, and null is still null: what the tick says is whether there is
  -- one. Ticking a column like this writes the moment it was ticked, and unticking clears it, which
  -- is how a column named for something that happened -- archived_at, completed_at, verified_at --
  -- is usually wanted: the convenience of a checkbox without throwing away when it happened.
  time_checkbox boolean,

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

ALTER TABLE presentation_schema.columns ADD COLUMN IF NOT EXISTS num_unix_time text
  CONSTRAINT num_unix_time_known
  CHECK (num_unix_time IN ('seconds', 'milliseconds', 'microseconds', 'nanoseconds'));

ALTER TABLE presentation_schema.columns ADD COLUMN IF NOT EXISTS time_checkbox boolean;


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


----------------------------------------------------------------------------------------------------
-- A TABLE'S OWN PRESENTATION
----------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS presentation_schema.tables (
  -- The table, held the same way presentation_schema.columns holds it.
  "table" regclass PRIMARY KEY,

  -- The OID this row was last written against, so a restore is something we can tell has happened.
  written_against oid NOT NULL,

  -- How a record of this table is written out in a sentence: an array whose string parts are
  -- literal text and whose array parts are references to a column, given as a chain of attnums.
  -- All but the last attnum in a chain is a single-column foreign key to follow; the last is the
  -- column to read once the chain has been walked.
  record_summary_template jsonb,

  -- The same references written as column names, which is what survives a restore.
  --
  -- The attnums above are meaningless in a restored database, and unlike a column's attnum they
  -- are buried inside a JSON document, so there is nothing for the row's own identity to fix. This
  -- is the same chain walked by name at each hop instead, kept up to date behind the attnums.
  record_summary_names jsonb,

  -- Filters somebody has named and kept, in the order they are offered: an array of objects of the
  -- filter's own name and the filter itself, in the form the client writes a filter in, where a
  -- column is named by its attnum as a string.
  --
  -- A filter is a question asked of the table often enough to be worth keeping -- the unpaid
  -- invoices, this year's, mine -- and like everything else here it says how the table is looked at
  -- rather than what it holds.
  saved_filters jsonb,

  -- The same filters with each column written as a name, for the same reason as above.
  saved_filters_by_column_name jsonb
);


-- Added after the table was first created; see the note above presentation_schema.columns.
ALTER TABLE presentation_schema.tables ADD COLUMN IF NOT EXISTS saved_filters jsonb;
ALTER TABLE presentation_schema.tables
  ADD COLUMN IF NOT EXISTS saved_filters_by_column_name jsonb;


CREATE OR REPLACE FUNCTION
msar.record_summary_chain_names(tab_id oid, chain jsonb) RETURNS jsonb AS $$/*
Write one column reference chain out as names, or null if it leads nowhere.

Args:
  tab_id: The OID of the table the chain starts from.
  chain: An array of attnums, all but the last being single-column foreign keys to follow.
*/
DECLARE
  names jsonb := '[]'::jsonb;
  ctx_tab_id oid := tab_id;
  hops integer := jsonb_array_length(chain);
  hop integer;
  col_id smallint;
  col_name name;
  ref_tab_id oid;
BEGIN
  IF hops IS NULL OR hops = 0 THEN
    RETURN NULL;
  END IF;
  FOR hop IN 0..hops - 1 LOOP
    col_id := (chain ->> hop)::smallint;
    SELECT attname INTO col_name
    FROM pg_catalog.pg_attribute
    WHERE attrelid = ctx_tab_id AND attnum = col_id AND attnum > 0 AND NOT attisdropped;
    IF col_name IS NULL THEN
      RETURN NULL;
    END IF;
    names := names || to_jsonb(col_name::text);
    IF hop < hops - 1 THEN
      SELECT confrelid INTO ref_tab_id
      FROM pg_catalog.pg_constraint
      WHERE contype = 'f' AND conrelid = ctx_tab_id AND conkey = ARRAY[col_id];
      IF ref_tab_id IS NULL THEN
        RETURN NULL;
      END IF;
      ctx_tab_id := ref_tab_id;
    END IF;
  END LOOP;
  RETURN names;
END;
$$ LANGUAGE plpgsql STABLE;


CREATE OR REPLACE FUNCTION
msar.record_summary_chain_attnums(tab_id oid, names jsonb) RETURNS jsonb AS $$/*
Read one column reference chain back from names, or null if it leads nowhere.

The same walk as msar.record_summary_chain_names, the other way about: each name is looked up on
the table the chain has reached so far, and all but the last must be a single-column foreign key.

Args:
  tab_id: The OID of the table the chain starts from.
  names: An array of column names.
*/
DECLARE
  chain jsonb := '[]'::jsonb;
  ctx_tab_id oid := tab_id;
  hops integer := jsonb_array_length(names);
  hop integer;
  col_name text;
  col_id smallint;
  ref_tab_id oid;
BEGIN
  IF hops IS NULL OR hops = 0 THEN
    RETURN NULL;
  END IF;
  FOR hop IN 0..hops - 1 LOOP
    col_name := names ->> hop;
    SELECT attnum INTO col_id
    FROM pg_catalog.pg_attribute
    WHERE attrelid = ctx_tab_id AND attname = col_name AND attnum > 0 AND NOT attisdropped;
    IF col_id IS NULL THEN
      RETURN NULL;
    END IF;
    chain := chain || to_jsonb(col_id::integer);
    IF hop < hops - 1 THEN
      SELECT confrelid INTO ref_tab_id
      FROM pg_catalog.pg_constraint
      WHERE contype = 'f' AND conrelid = ctx_tab_id AND conkey = ARRAY[col_id];
      IF ref_tab_id IS NULL THEN
        RETURN NULL;
      END IF;
      ctx_tab_id := ref_tab_id;
    END IF;
  END LOOP;
  RETURN chain;
END;
$$ LANGUAGE plpgsql STABLE;


CREATE OR REPLACE FUNCTION
msar.record_summary_template_as(tab_id oid, template jsonb, to_names boolean) RETURNS jsonb AS $$/*
Rewrite a record summary template's column references, either to names or back to attnums.

Literal text is passed through untouched. A reference that leads nowhere becomes null, keeping its
place in the template: the query builder ignores a part that is neither text nor a reference, which
is how it already copes with a column that has been deleted.

Args:
  tab_id: The OID of the table the template belongs to.
  template: The template to rewrite.
  to_names: Whether to rewrite references to names, rather than back to attnums.
*/
SELECT CASE WHEN template IS NULL THEN NULL ELSE (
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN jsonb_typeof(part) = 'array' AND to_names
        THEN COALESCE(msar.record_summary_chain_names(tab_id, part), 'null'::jsonb)
      WHEN jsonb_typeof(part) = 'array'
        THEN COALESCE(msar.record_summary_chain_attnums(tab_id, part), 'null'::jsonb)
      ELSE part
    END
    ORDER BY ordinality
  ), '[]'::jsonb)
  FROM jsonb_array_elements(template) WITH ORDINALITY AS t(part, ordinality)
) END;
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
msar.table_record_summary_template(tab_id oid) RETURNS jsonb AS $$/*
Return how a record of this table should be written out, in attnums, or null if nobody has said.

Which of the two stored forms to believe is the same question as for a column, answered the same
way: while the OID the row was written against is still the table's, the attnums are right and the
names are only a cache; once it isn't, a restore has moved the attnums and the names are what is
left to go on.

Args:
  tab_id: The OID of the table.
*/
SELECT CASE
  WHEN t.written_against = tab_id THEN t.record_summary_template
  ELSE msar.record_summary_template_as(tab_id, t.record_summary_names, false)
END
FROM presentation_schema.tables t
WHERE t."table" = tab_id::regclass;
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
msar.table_record_summary_templates() RETURNS jsonb AS $$/*
Return every table's record summary template in the database, keyed by table OID.
*/
SELECT COALESCE(jsonb_object_agg(tab_id, template), '{}'::jsonb)
FROM (
  SELECT
    t."table"::oid::bigint::text AS tab_id,
    msar.table_record_summary_template(t."table"::oid) AS template
  FROM presentation_schema.tables t
  WHERE t.record_summary_template IS NOT NULL
) AS templates
WHERE template IS NOT NULL;
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
msar.set_table_record_summary_template(tab_id oid, template jsonb) RETURNS void AS $$/*
Say how a record of this table should be written out.

Both forms are written at once: the attnums to bind by while the database is live, and the names to
fall back on once a restore has been through.

Args:
  tab_id: The OID of the table.
  template: The template, with column references as chains of attnums, or null to say nothing.
*/
BEGIN
  IF template IS NULL THEN
    UPDATE presentation_schema.tables
    SET record_summary_template = NULL, record_summary_names = NULL
    WHERE "table" = tab_id::regclass;
    PERFORM msar.forget_empty_table_presentation(tab_id);
    RETURN;
  END IF;

  INSERT INTO presentation_schema.tables
    ("table", written_against, record_summary_template, record_summary_names)
  VALUES (
    tab_id::regclass, tab_id, template, msar.record_summary_template_as(tab_id, template, true)
  )
  ON CONFLICT ("table") DO UPDATE SET
    written_against = EXCLUDED.written_against,
    record_summary_template = EXCLUDED.record_summary_template,
    record_summary_names = EXCLUDED.record_summary_names;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.refresh_record_summary_names() RETURNS void AS $$/*
Bring every stored template's name form back into step with the attnums it is shadowing.

A column rename can reach a template on any table, since a reference may walk a chain of foreign
keys to get there, and following that back to just the templates affected would cost more than
rewriting the lot. There is one row per table anybody has written a summary for, and renaming is
not something that happens in a loop.
*/
UPDATE presentation_schema.tables
SET record_summary_names = msar.record_summary_template_as(
  "table"::oid, record_summary_template, true
)
WHERE written_against = "table"::oid AND record_summary_template IS NOT NULL;
$$ LANGUAGE SQL;


CREATE OR REPLACE FUNCTION
msar.filter_columns_as(tab_id oid, filter_ jsonb, to_names boolean) RETURNS jsonb AS $$/*
Rewrite a filter's column references, either to names or back to attnums.

A filter is written as nested arrays: a group is ['g', operator, [args]] and a condition on one
column is ['i', column, condition, value]. Only the column changes here, and it is a string either
way, so the shape a client reads is the same in both forms.

A condition whose column leads nowhere is dropped, leaving the rest of the group as it was, which is
what the client already does with a filter on a column that has been deleted. A group is never
dropped: an empty one filters nothing, which is what a question with nothing left to ask means.

Args:
  tab_id: The OID of the table the filter is over.
  filter_: The filter to rewrite.
  to_names: Whether to rewrite columns to names, rather than back to attnums.
*/
SELECT CASE
  WHEN filter_ ->> 0 = 'g' THEN jsonb_build_array('g', filter_ -> 1, (
    SELECT COALESCE(jsonb_agg(rewritten ORDER BY ordinality), '[]'::jsonb)
    FROM jsonb_array_elements(filter_ -> 2) WITH ORDINALITY AS args(arg, ordinality),
      LATERAL msar.filter_columns_as(tab_id, arg, to_names) AS rewritten
    WHERE rewritten IS NOT NULL
  ))
  WHEN filter_ ->> 0 = 'i' THEN (
    SELECT jsonb_build_array('i', to_jsonb(col.name), filter_ -> 2, filter_ -> 3)
    FROM (
      SELECT CASE WHEN to_names THEN (
        SELECT a.attname::text FROM pg_catalog.pg_attribute a
        WHERE a.attrelid = tab_id AND a.attnum = (filter_ ->> 1)::smallint AND NOT a.attisdropped
      ) ELSE (
        SELECT a.attnum::text FROM pg_catalog.pg_attribute a
        WHERE a.attrelid = tab_id AND a.attname = (filter_ ->> 1)
          AND a.attnum > 0 AND NOT a.attisdropped
      ) END AS name
    ) AS col
    WHERE col.name IS NOT NULL
  )
  ELSE NULL
END;
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
msar.saved_filters_as(tab_id oid, filters jsonb, to_names boolean) RETURNS jsonb AS $$/*
Rewrite every saved filter's column references, either to names or back to attnums.

Args:
  tab_id: The OID of the table the filters are over.
  filters: An array of objects of a filter's name and the filter itself.
  to_names: Whether to rewrite columns to names, rather than back to attnums.
*/
SELECT CASE WHEN filters IS NULL THEN NULL ELSE (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('name', saved.entry -> 'name', 'filter', rewritten) ORDER BY saved.ordinality
  ), '[]'::jsonb)
  FROM jsonb_array_elements(filters) WITH ORDINALITY AS saved(entry, ordinality),
    LATERAL msar.filter_columns_as(tab_id, saved.entry -> 'filter', to_names) AS rewritten
  WHERE rewritten IS NOT NULL
) END;
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
msar.table_saved_filters(tab_id oid) RETURNS jsonb AS $$/*
Return the filters kept for this table, in attnums, or null if nobody has kept any.

Which of the two stored forms to believe is the same question as for a record summary, answered the
same way: while the OID the row was written against is still the table's, the attnums are right and
the names are only a cache; once it isn't, a restore has moved the attnums and the names are what is
left to go on.

Args:
  tab_id: The OID of the table.
*/
SELECT CASE
  WHEN t.written_against = tab_id THEN t.saved_filters
  ELSE msar.saved_filters_as(tab_id, t.saved_filters_by_column_name, false)
END
FROM presentation_schema.tables t
WHERE t."table" = tab_id::regclass;
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
msar.table_saved_filters_all() RETURNS jsonb AS $$/*
Return the kept filters of every table that has any, keyed by table OID.
*/
SELECT COALESCE(jsonb_object_agg(tab_id, filters), '{}'::jsonb)
FROM (
  SELECT
    t."table"::oid::bigint::text AS tab_id,
    msar.table_saved_filters(t."table"::oid) AS filters
  FROM presentation_schema.tables t
  WHERE t.saved_filters IS NOT NULL
) AS kept
WHERE filters IS NOT NULL;
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
msar.set_table_saved_filters(tab_id oid, filters jsonb) RETURNS void AS $$/*
Say which filters are kept for this table, replacing whatever was kept before.

Both forms are written at once: the attnums to bind by while the database is live, and the names to
fall back on once a restore has been through.

Args:
  tab_id: The OID of the table.
  filters: An array of objects of a filter's name and the filter itself, with columns given by
           attnum, or null to keep none.
*/
BEGIN
  IF filters IS NULL OR jsonb_array_length(filters) = 0 THEN
    UPDATE presentation_schema.tables
    SET saved_filters = NULL, saved_filters_by_column_name = NULL
    WHERE "table" = tab_id::regclass;
    PERFORM msar.forget_empty_table_presentation(tab_id);
    RETURN;
  END IF;

  INSERT INTO presentation_schema.tables
    ("table", written_against, saved_filters, saved_filters_by_column_name)
  VALUES (
    tab_id::regclass, tab_id, filters, msar.saved_filters_as(tab_id, filters, true)
  )
  ON CONFLICT ("table") DO UPDATE SET
    written_against = EXCLUDED.written_against,
    saved_filters = EXCLUDED.saved_filters,
    saved_filters_by_column_name = EXCLUDED.saved_filters_by_column_name;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.forget_empty_table_presentation(tab_id oid) RETURNS void AS $$/*
Drop a table's presentation row once there is nothing left on it to say.

The row holds several unrelated things, so clearing one of them is not on its own a reason to
forget the table.

Args:
  tab_id: The OID of the table.
*/
DELETE FROM presentation_schema.tables
WHERE "table" = tab_id::regclass
  AND record_summary_template IS NULL
  AND saved_filters IS NULL;
$$ LANGUAGE SQL;


CREATE OR REPLACE FUNCTION
msar.refresh_saved_filter_columns(tab_id oid) RETURNS void AS $$/*
Bring a table's kept filters' name form back into step with the attnums it is shadowing.

Unlike a record summary, a filter only ever asks about its own table's columns, so a rename reaches
no further than the one row.

Args:
  tab_id: The OID of the table whose columns have moved or been renamed.
*/
UPDATE presentation_schema.tables
SET saved_filters_by_column_name = msar.saved_filters_as("table"::oid, saved_filters, true)
WHERE "table" = tab_id::regclass AND written_against = "table"::oid AND saved_filters IS NOT NULL;
$$ LANGUAGE SQL;
