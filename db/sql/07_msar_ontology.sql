----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- THE ONTOLOGY
--
-- The types a database defines for itself: the enums, the domains, the composite types. They say
-- what the values in a column are allowed to be, which is a question about the data rather than
-- about how it is shown, so all of it lives in the catalog where Postgres keeps it.
--
-- This file is about changing them. Reading them is msar.list_schema_types, next to the rest of the
-- catalog reading.
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------


----------------------------------------------------------------------------------------------------
-- ENUMS
----------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION
msar.enum_values_given(vals jsonb) RETURNS TABLE (ord integer, value_ text, was text) AS $$/*
Read a list of enum values as it is given to us, in the order given.

Each element is either a bare string, which is a value with nothing to say about where it came from,
or an object of the form

  {"value": <str>, "was": <str or null>}

where "was" names the value this one is a renaming of. A value with no "was" is one being added, and
a value the list leaves out altogether is one being dropped: saying which value each one used to be
is the only way to tell a rename from a drop and an add, which are different things to do to a
column holding the values.

Args:
  vals: The list of values.
*/
SELECT
  ord::integer,
  CASE jsonb_typeof(entry) WHEN 'string' THEN entry #>> '{}' ELSE entry ->> 'value' END,
  CASE jsonb_typeof(entry) WHEN 'string' THEN null ELSE entry ->> 'was' END
FROM jsonb_array_elements(vals) WITH ORDINALITY AS x(entry, ord);
$$ LANGUAGE SQL IMMUTABLE STRICT;


CREATE OR REPLACE FUNCTION msar.enum_labels(typ_id oid) RETURNS text[] AS $$/*
Return an enum's values, in their own order.

Args:
  typ_id: The OID of the enum type.
*/
SELECT array_agg(enumlabel::text ORDER BY enumsortorder)
FROM pg_catalog.pg_enum WHERE enumtypid = typ_id;
$$ LANGUAGE SQL STABLE STRICT;


CREATE OR REPLACE FUNCTION
msar.check_enum_values(typ_id oid, vals jsonb) RETURNS void AS $$/*
Raise unless the given list of enum values is one we could set.

The checks are the ones whose failure Postgres would otherwise report a statement or two into the
work, where the message would be about the statement rather than about what was asked for.

Args:
  typ_id: The OID of the enum type the values are for, or null for a type not yet created, whose
          values can say what they were without there being anything to check them against.
  vals: The list of values, as described in msar.enum_values_given.
*/
DECLARE
  labels text[] := COALESCE(msar.enum_labels(typ_id), '{}');
  offender text;
BEGIN
  IF vals IS NULL OR jsonb_typeof(vals) <> 'array' THEN
    RAISE EXCEPTION 'A choice of values must be given as a list.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM msar.enum_values_given(vals)) THEN
    RAISE EXCEPTION 'A choice must offer at least one value.';
  END IF;
  IF EXISTS (SELECT 1 FROM msar.enum_values_given(vals) WHERE COALESCE(value_, '') = '') THEN
    RAISE EXCEPTION 'A value of a choice cannot be empty.';
  END IF;
  SELECT value_ INTO offender
    FROM msar.enum_values_given(vals) GROUP BY value_ HAVING count(*) > 1 LIMIT 1;
  IF offender IS NOT NULL THEN
    RAISE EXCEPTION 'The value % is offered twice.', quote_literal(offender);
  END IF;
  SELECT was INTO offender
    FROM msar.enum_values_given(vals) WHERE was IS NOT NULL
    GROUP BY was HAVING count(*) > 1 LIMIT 1;
  IF offender IS NOT NULL THEN
    RAISE EXCEPTION 'The value % is renamed twice.', quote_literal(offender);
  END IF;
  SELECT was INTO offender
    FROM msar.enum_values_given(vals) WHERE was IS NOT NULL AND NOT (was = ANY(labels)) LIMIT 1;
  IF typ_id IS NOT NULL AND offender IS NOT NULL THEN
    RAISE EXCEPTION 'The value % is not one of the choice''s values.', quote_literal(offender);
  END IF;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION msar.enum_values_sql(vals jsonb) RETURNS text AS $$/*
Return the given enum values as the list of literals a CREATE TYPE takes, in the order given.

Args:
  vals: The list of values, as described in msar.enum_values_given.
*/
SELECT string_agg(quote_literal(value_), ', ' ORDER BY ord) FROM msar.enum_values_given(vals);
$$ LANGUAGE SQL IMMUTABLE STRICT;


CREATE OR REPLACE FUNCTION
msar.build_unique_type_name(sch_id regnamespace, base text, idx integer DEFAULT 0) RETURNS text AS $$/*
Return a version of the given type name that no type in the schema has.

The name itself is tried first, then the name with '_1', '_2' and so on after it. The base is cut
short if it needs to be: a type name is an identifier like any other, and the array type Postgres
makes alongside it needs a character to spare.

Args:
  sch_id: The OID of the schema the type will be in.
  base: The name we would like to give it.
  idx: The number to try as a suffix, 0 meaning the bare name.
*/
WITH candidate_cte AS (
  SELECT CASE WHEN idx = 0 THEN left(base, 55) ELSE left(base, 55) || '_' || idx END AS candidate
)
SELECT CASE
  WHEN NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_type
    WHERE typnamespace = sch_id AND typname = candidate_cte.candidate
  ) THEN candidate_cte.candidate
  ELSE msar.build_unique_type_name(sch_id, base, idx + 1)
END
FROM candidate_cte;
$$ LANGUAGE SQL STABLE STRICT;


CREATE OR REPLACE FUNCTION
msar.type_column_users(typ_id oid) RETURNS TABLE (tab_id oid, attnum smallint, is_array boolean) AS $$/*
Return the table columns holding values of the given type, or arrays of them.

Args:
  typ_id: The OID of the type.
*/
SELECT att.attrelid, att.attnum, att.atttypid <> typ_id
FROM pg_catalog.pg_attribute AS att
  JOIN pg_catalog.pg_class AS cls ON cls.oid = att.attrelid
  JOIN pg_catalog.pg_type AS typ ON typ.oid = typ_id
WHERE att.attnum > 0 AND NOT att.attisdropped
  AND att.atttypid IN (typ_id, typ.typarray)
  AND cls.relkind = ANY('{r,p,f}')
ORDER BY att.attrelid, att.attnum;
$$ LANGUAGE SQL STABLE STRICT;


CREATE OR REPLACE FUNCTION msar.type_users(typ_id oid) RETURNS jsonb AS $$/*
Return the columns holding values of the given type, for saying who a change would reach.

Each is described by a JSON object of the form
  {
    "table": <int>,
    "table_name": <str>,
    "schema_name": <str>,
    "attnum": <int>,
    "column_name": <str>,
    "is_array": <bool>
  }

Args:
  typ_id: The OID of the type.
*/
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'table', user_.tab_id::bigint,
  'table_name', msar.get_relation_name(user_.tab_id),
  'schema_name', msar.get_relation_schema_name(user_.tab_id),
  'attnum', user_.attnum,
  'column_name', msar.get_column_name(user_.tab_id, user_.attnum),
  'is_array', user_.is_array
)), '[]'::jsonb)
FROM msar.type_column_users(typ_id) AS user_;
$$ LANGUAGE SQL STABLE STRICT;


CREATE OR REPLACE FUNCTION
msar.create_enum_type(sch_id regnamespace, typ_name text, vals jsonb, description text DEFAULT null)
  RETURNS oid AS $$/*
Create an enum type: a choice of values, and nothing else allowed.

The name is used as given. A name already taken is an error rather than something to work around,
since somebody asking for a type by name wants that name.

Args:
  sch_id: The OID of the schema to create the type in.
  typ_name: The name to give it.
  vals: Its values, in order, as described in msar.enum_values_given.
  description: A comment to put on the type.
*/
DECLARE
  sch_name text := sch_id::regnamespace::text;
  typ_id oid;
BEGIN
  PERFORM msar.check_enum_values(null, vals);
  EXECUTE format(
    'CREATE TYPE %s.%I AS ENUM (%s)', sch_name, typ_name, msar.enum_values_sql(vals)
  );
  typ_id := (
    SELECT oid FROM pg_catalog.pg_type WHERE typnamespace = sch_id AND typname = typ_name
  );
  IF description IS NOT NULL THEN
    EXECUTE format('COMMENT ON TYPE %s.%I IS %L', sch_name, typ_name, description);
  END IF;
  RETURN typ_id;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION msar.check_enum_rewritable(typ_id oid) RETURNS void AS $$/*
Raise unless everything depending on the given enum is something we know how to carry over.

Dropping a value from an enum, or putting its values in a different order, means building the type
again and moving every column across; see msar.rebuild_enum_type. A column we can move, along with
its default and its constraints, but anything else that mentions the type -- a view, a domain over
it, a composite type with a field of it -- would have to be taken apart and put back together, and
its owner is better placed to decide how.

Args:
  typ_id: The OID of the enum type.
*/
DECLARE
  blockers text;
BEGIN
  SELECT string_agg(DISTINCT pg_catalog.pg_describe_object(classid, objid, 0), ', ') INTO blockers
  FROM pg_catalog.pg_depend AS dep
    JOIN pg_catalog.pg_type AS typ ON typ.oid = typ_id
  WHERE dep.refobjid IN (typ_id, typ.typarray)
    AND dep.classid NOT IN (
      -- The values themselves.
      'pg_catalog.pg_enum'::regclass,
      -- A column's default and its constraints, which we take off and put back.
      'pg_catalog.pg_attrdef'::regclass, 'pg_catalog.pg_constraint'::regclass
    )
    -- The array type Postgres makes alongside the type, which goes with it.
    AND NOT (dep.classid = 'pg_catalog.pg_type'::regclass AND dep.objid = typ.typarray)
    -- A column of the type, which is what we move across.
    AND NOT (dep.classid = 'pg_catalog.pg_class'::regclass AND dep.objsubid > 0);
  IF blockers IS NOT NULL THEN
    RAISE EXCEPTION 'The values cannot be dropped or reordered while % depends on the choice.',
      blockers
      USING HINT = 'Adding values and renaming them can be done without rewriting the columns.';
  END IF;
END;
$$ LANGUAGE plpgsql STRICT;


CREATE OR REPLACE FUNCTION msar.alter_enum_in_place(typ_id oid, vals jsonb) RETURNS void AS $$/*
Add and rename an enum's values where they are.

Every value the type has is kept, in the order it already has, so no column holding the values has
to be touched: Postgres can add a value to an enum and rename one without rewriting anything.

Renaming goes through a name nothing can already have, so that swapping two values round, or handing
a name along from one value to the next, doesn't collide with itself halfway through.

Args:
  typ_id: The OID of the enum type.
  vals: Its values, in order, as described in msar.enum_values_given.
*/
DECLARE
  typ text := typ_id::regtype::text;
  prefix text := '__msar';
  entry RECORD;
  last_label text := null;
  first_kept text;
BEGIN
  WHILE EXISTS (
    SELECT 1 FROM unnest(msar.enum_labels(typ_id)) AS label WHERE label LIKE prefix || '%'
  ) OR EXISTS (
    SELECT 1 FROM msar.enum_values_given(vals) WHERE value_ LIKE prefix || '%'
  ) LOOP
    prefix := prefix || '_';
  END LOOP;
  FOR entry IN
    SELECT * FROM msar.enum_values_given(vals) WHERE was IS NOT NULL AND was <> value_ ORDER BY ord
  LOOP
    EXECUTE format(
      'ALTER TYPE %s RENAME VALUE %L TO %L', typ, entry.was, prefix || entry.ord
    );
  END LOOP;
  FOR entry IN
    SELECT * FROM msar.enum_values_given(vals) WHERE was IS NOT NULL AND was <> value_ ORDER BY ord
  LOOP
    EXECUTE format(
      'ALTER TYPE %s RENAME VALUE %L TO %L', typ, prefix || entry.ord, entry.value_
    );
  END LOOP;
  first_kept := (
    SELECT value_ FROM msar.enum_values_given(vals) WHERE was IS NOT NULL ORDER BY ord LIMIT 1
  );
  FOR entry IN SELECT * FROM msar.enum_values_given(vals) ORDER BY ord LOOP
    IF entry.was IS NULL THEN
      IF last_label IS NULL THEN
        EXECUTE format(
          'ALTER TYPE %s ADD VALUE %L BEFORE %L', typ, entry.value_, first_kept
        );
      ELSE
        EXECUTE format(
          'ALTER TYPE %s ADD VALUE %L AFTER %L', typ, entry.value_, last_label
        );
      END IF;
    END IF;
    last_label := entry.value_;
  END LOOP;
END;
$$ LANGUAGE plpgsql STRICT;


CREATE OR REPLACE FUNCTION
msar.check_enum_values_unused(typ_id oid, vals jsonb) RETURNS void AS $$/*
Raise if a column still holds one of the values the given list leaves out.

Dropping a value nobody has used is housekeeping. Dropping one a record holds is throwing away what
that record said, which is not for a type editor to do quietly, so we say which record's column
would lose it and leave the decision where it belongs.

Args:
  typ_id: The OID of the enum type.
  vals: The values it is to be left with, as described in msar.enum_values_given.
*/
DECLARE
  dropped text[];
  col RECORD;
  col_name text;
  offender text;
BEGIN
  dropped := ARRAY(
    SELECT label FROM unnest(msar.enum_labels(typ_id)) AS label
    WHERE NOT EXISTS (SELECT 1 FROM msar.enum_values_given(vals) WHERE was = label)
  );
  IF dropped = '{}' THEN
    RETURN;
  END IF;
  FOR col IN SELECT * FROM msar.type_column_users(typ_id) LOOP
    col_name := quote_ident(msar.get_column_name(col.tab_id, col.attnum));
    EXECUTE format(
      CASE WHEN col.is_array
        THEN 'SELECT label FROM %2$I.%3$I, unnest(%1$s::text[]) AS x(label)'
          || ' WHERE x.label = ANY($1) LIMIT 1'
        ELSE 'SELECT %1$s::text FROM %2$I.%3$I WHERE %1$s::text = ANY($1) LIMIT 1'
      END,
      col_name,
      msar.get_relation_schema_name(col.tab_id),
      msar.get_relation_name(col.tab_id)
    ) USING dropped INTO offender;
    IF offender IS NOT NULL THEN
      RAISE EXCEPTION 'The value % cannot be dropped while the column % of %.% holds it.',
        quote_literal(offender),
        quote_literal(msar.get_column_name(col.tab_id, col.attnum)),
        quote_ident(msar.get_relation_schema_name(col.tab_id)),
        quote_ident(msar.get_relation_name(col.tab_id));
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql STRICT;


CREATE OR REPLACE FUNCTION
msar.map_enum_labels(labels text[], mapping jsonb) RETURNS text[] AS $$/*
Return the given labels with each one the mapping names replaced by what it maps to.

This is for moving a column of an enum's values over to a rebuilt type, where a value that was
renamed has to be written out as its new name. A single value needs no function -- the mapping can
be read in the expression itself -- but an array does, because the USING of an ALTER COLUMN cannot
hold a subquery, and taking an array apart and putting it back together needs one. An array of no
values comes back as one, an array of no values being a different thing from no array.

Args:
  labels: The labels to map.
  mapping: An object of each old label and the label it is now.
*/
SELECT COALESCE(array_agg(COALESCE(mapping ->> label, label) ORDER BY ord), '{}'::text[])
FROM unnest(labels) WITH ORDINALITY AS x(label, ord);
$$ LANGUAGE SQL IMMUTABLE STRICT;


CREATE OR REPLACE FUNCTION msar.rebuild_enum_type(typ_id oid, vals jsonb) RETURNS oid AS $$/*
Build an enum again with the given values, moving every column of it across.

Postgres can add a value to an enum and rename one, but it cannot drop a value or change the order
they come in, both of which are written into every row holding one. So the type is made afresh
alongside the old one, each column is moved over, and the new type takes the old one's name.

A column holding a value that the new list leaves out cannot be moved, and Postgres says so: the
value isn't one of the new type's. The values a record holds are the record's business, and dropping
a value nobody has used is a different thing from dropping one somebody has.

Args:
  typ_id: The OID of the enum type.
  vals: Its values, in order, as described in msar.enum_values_given.

Returns:
  The OID of the type, which is a new one.
*/
DECLARE
  sch_id oid := (SELECT typnamespace FROM pg_catalog.pg_type WHERE oid = typ_id);
  sch_name text := (SELECT typnamespace::regnamespace::text FROM pg_catalog.pg_type WHERE oid = typ_id);
  old_name text := (SELECT typname FROM pg_catalog.pg_type WHERE oid = typ_id);
  new_name text := msar.build_unique_type_name(sch_id::regnamespace, old_name);
  new_typ text := format('%s.%I', sch_name, new_name);
  description text := pg_catalog.obj_description(typ_id, 'pg_type');
  renames jsonb;
  col RECORD;
  col_name text;
  col_default text;
  defaults jsonb := '{}'::jsonb;
  mapped text;
BEGIN
  PERFORM msar.check_enum_values(typ_id, vals);
  PERFORM msar.check_enum_rewritable(typ_id);
  PERFORM msar.check_enum_values_unused(typ_id, vals);
  EXECUTE format('CREATE TYPE %s AS ENUM (%s)', new_typ, msar.enum_values_sql(vals));
  IF description IS NOT NULL THEN
    EXECUTE format('COMMENT ON TYPE %s IS %L', new_typ, description);
  END IF;
  -- A value that was renamed has to be written out as its new name on the way across. Everything
  -- else goes over as the text it is, and the cast to the new type is what says whether the new
  -- list still has a place for it.
  renames := COALESCE((
    SELECT jsonb_object_agg(was, value_)
    FROM msar.enum_values_given(vals) WHERE was IS NOT NULL AND was <> value_
  ), '{}'::jsonb);
  FOR col IN SELECT * FROM msar.type_column_users(typ_id) LOOP
    col_name := quote_ident(msar.get_column_name(col.tab_id, col.attnum));
    col_default := (
      SELECT pg_catalog.pg_get_expr(adbin, adrelid)
      FROM pg_catalog.pg_attrdef WHERE adrelid = col.tab_id AND adnum = col.attnum
    );
    IF col_default IS NOT NULL THEN
      IF col.is_array OR left(col_default, 1) <> '''' THEN
        RAISE EXCEPTION 'The default of the column % cannot be carried over.',
          quote_literal(msar.get_column_name(col.tab_id, col.attnum))
          USING HINT = 'Drop the default, change the values, then set the default again.';
      END IF;
      EXECUTE format('SELECT (%s)::text', col_default) INTO col_default;
      defaults := defaults || jsonb_build_object(
        col.tab_id || ':' || col.attnum,
        COALESCE((SELECT value_ FROM msar.enum_values_given(vals) WHERE was = col_default), col_default)
      );
      EXECUTE format(
        'ALTER TABLE %I.%I ALTER COLUMN %s DROP DEFAULT',
        msar.get_relation_schema_name(col.tab_id), msar.get_relation_name(col.tab_id), col_name
      );
    END IF;
    mapped := CASE
      WHEN col.is_array THEN format(
        'msar.map_enum_labels(%s::text[], %L)::%s[]', col_name, renames, new_typ
      )
      ELSE format(
        'COALESCE(%2$L::jsonb ->> %1$s::text, %1$s::text)::%3$s', col_name, renames, new_typ
      )
    END;
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %s TYPE %s USING %s',
      msar.get_relation_schema_name(col.tab_id),
      msar.get_relation_name(col.tab_id),
      col_name,
      new_typ || CASE WHEN col.is_array THEN '[]' ELSE '' END,
      mapped
    );
  END LOOP;
  EXECUTE format('DROP TYPE %s.%I', sch_name, old_name);
  EXECUTE format('ALTER TYPE %s RENAME TO %I', new_typ, old_name);
  FOR col IN SELECT * FROM msar.type_column_users(
    (SELECT oid FROM pg_catalog.pg_type WHERE typnamespace = sch_id AND typname = old_name)
  ) LOOP
    col_default := defaults ->> (col.tab_id || ':' || col.attnum);
    IF col_default IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT %L::%s.%I',
        msar.get_relation_schema_name(col.tab_id),
        msar.get_relation_name(col.tab_id),
        msar.get_column_name(col.tab_id, col.attnum),
        col_default,
        sch_name,
        old_name
      );
    END IF;
  END LOOP;
  RETURN (SELECT oid FROM pg_catalog.pg_type WHERE typnamespace = sch_id AND typname = old_name);
END;
$$ LANGUAGE plpgsql STRICT;


CREATE OR REPLACE FUNCTION msar.set_enum_values(typ_id oid, vals jsonb) RETURNS oid AS $$/*
Give an enum the values listed, in the order listed.

Args:
  typ_id: The OID of the enum type.
  vals: Its values, in order, as described in msar.enum_values_given.

Returns:
  The OID of the type, which is a new one if the values had to be rewritten.
*/
DECLARE
  kept text[];
BEGIN
  PERFORM msar.check_enum_values(typ_id, vals);
  SELECT array_agg(was ORDER BY ord) INTO kept
  FROM msar.enum_values_given(vals) WHERE was IS NOT NULL;
  -- Every value kept, in the order it already has: the columns holding them don't have to know.
  IF kept = msar.enum_labels(typ_id) THEN
    PERFORM msar.alter_enum_in_place(typ_id, vals);
    RETURN typ_id;
  END IF;
  RETURN msar.rebuild_enum_type(typ_id, vals);
END;
$$ LANGUAGE plpgsql STRICT;


CREATE OR REPLACE FUNCTION msar.alter_enum_type(typ_id oid, patch jsonb) RETURNS oid AS $$/*
Change an enum's name, its description, or its values.

Args:
  typ_id: The OID of the enum type.
  patch: An object of the form
    {
      "name": <str>,
      "description": <str or null>,
      "values": [<value>, ...]
    }
  where every key is optional. The values are as described in msar.enum_values_given, and a
  description of null takes the comment off.

Returns:
  The OID of the type, which is a new one if the values had to be rewritten.
*/
DECLARE
  new_id oid := typ_id;
BEGIN
  IF patch ? 'values' THEN
    new_id := msar.set_enum_values(typ_id, patch -> 'values');
  END IF;
  IF patch ->> 'name' IS NOT NULL AND patch ->> 'name' <> (
    SELECT typname FROM pg_catalog.pg_type WHERE oid = new_id
  ) THEN
    EXECUTE format('ALTER TYPE %s RENAME TO %I', new_id::regtype::text, patch ->> 'name');
  END IF;
  IF patch ? 'description' THEN
    EXECUTE format(
      'COMMENT ON TYPE %s IS %s',
      new_id::regtype::text,
      COALESCE(quote_literal(patch ->> 'description'), 'NULL')
    );
  END IF;
  RETURN new_id;
END;
$$ LANGUAGE plpgsql STRICT;


CREATE OR REPLACE FUNCTION
msar.drop_type(typ_id oid, cascade_ boolean DEFAULT false) RETURNS text AS $$/*
Drop a type the database defines for itself, returning its qualified name.

Args:
  typ_id: The OID of the type.
  cascade_: Whether to drop what depends on it, the columns of it included.
*/
DECLARE
  typ_name text := typ_id::regtype::text;
BEGIN
  EXECUTE format('DROP TYPE %s %s', typ_name, CASE WHEN cascade_ THEN 'CASCADE' ELSE '' END);
  RETURN typ_name;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.set_column_enum(tab_id oid, col_id smallint, vals jsonb) RETURNS text AS $$/*
Give a column a choice of values, making it a type of its own if it hasn't got one.

A column can be given a choice without anybody having to name a type for it: the type is made in the
table's schema, named after the table and the column, and from then on it is the column's own. Its
values can be changed from the column, because nothing else holds them.

A type more than one column holds is a different matter. The values in it are as much the other
columns' as they are this one's, so changing them from here would be changing somebody else's
column; the column is given a type of its own instead, holding the values asked for, and the shared
one is left as it is. Changing a shared type is done to the type, not to a column of it.

Args:
  tab_id: The OID of the table.
  col_id: The attnum of the column.
  vals: The values it may hold, in order, as described in msar.enum_values_given.

Returns:
  The name of the type to give the column, or null when the column already has it.
*/
DECLARE
  typ_id oid := (
    SELECT atttypid FROM pg_catalog.pg_attribute WHERE attrelid = tab_id AND attnum = col_id
  );
  sch_id regnamespace := (SELECT relnamespace FROM pg_catalog.pg_class WHERE oid = tab_id);
  was_enum boolean := (SELECT typtype = 'e' FROM pg_catalog.pg_type WHERE oid = typ_id);
  renames jsonb;
  new_name text;
BEGIN
  IF was_enum AND NOT EXISTS (
    SELECT 1 FROM msar.type_column_users(typ_id) AS user_
    WHERE user_.tab_id <> set_column_enum.tab_id OR user_.attnum <> col_id
  ) THEN
    PERFORM msar.set_enum_values(typ_id, vals);
    RETURN null;
  END IF;
  new_name := msar.build_unique_type_name(
    sch_id,
    msar.get_relation_name(tab_id) || '_' || msar.get_column_name(tab_id, col_id)
  );
  PERFORM msar.create_enum_type(sch_id, new_name, vals);
  renames := COALESCE((
    SELECT jsonb_object_agg(was, value_)
    FROM msar.enum_values_given(vals) WHERE was IS NOT NULL AND was <> value_
  ), '{}'::jsonb);
  IF was_enum AND renames <> '{}'::jsonb THEN
    -- What the column holds is about to be read as the text of a value of the new type, so a value
    -- being renamed on the way has to be written out under its new name first. The column goes to
    -- text to do it, and the retype that follows takes it the rest of the way.
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I TYPE text USING COALESCE(%L::jsonb ->> %I::text, %I::text)',
      msar.get_relation_schema_name(tab_id),
      msar.get_relation_name(tab_id),
      msar.get_column_name(tab_id, col_id),
      renames,
      msar.get_column_name(tab_id, col_id),
      msar.get_column_name(tab_id, col_id)
    );
  END IF;
  RETURN format('%s.%I', sch_id::text, new_name);
END;
$$ LANGUAGE plpgsql STRICT;
