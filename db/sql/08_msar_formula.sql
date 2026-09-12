----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- FORMULA COLUMNS
--
-- A column whose values Postgres works out from the rest of the record, which is a generated
-- column, and a formula is the expression it works them out from.
--
-- The formula arrives as a tree and never as SQL. A column is the attnum Postgres holds it at, a
-- value is a value, and an operator or a function is named from a list of the ones allowed. So
-- nothing a caller writes reaches the statement as they wrote it: an attnum is looked up and
-- quoted as the name it belongs to, a value is quoted as a value, and an operator or function is
-- only ever one of the names on the list. There is no way through here for SQL somebody wrote
-- themselves, which is the whole reason the formula is a tree.
--
-- Postgres will only generate a column from an expression it can be sure of: immutable functions,
-- this record's own columns, and no subqueries. That is its rule rather than ours, and it is a
-- good one -- the value is stored, so anything that could answer differently later would leave the
-- table saying something that was true once. The lists below are the operations worth offering
-- among the ones it allows.
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------


CREATE OR REPLACE FUNCTION msar.formula_operators() RETURNS text[] AS $$/*
The operators a formula can use, spelled as they are written into the statement.

Each is a whole token and none is built from what a caller said, so putting one into a statement
adds nothing a caller chose.
*/
SELECT ARRAY[
  -- Arithmetic
  '+', '-', '*', '/', '%', '^',
  -- Text
  '||',
  -- Comparison
  '=', '<>', '<', '<=', '>', '>=',
  -- Truth
  'AND', 'OR', 'NOT',
  -- Emptiness
  'IS NULL', 'IS NOT NULL'
];
$$ LANGUAGE SQL IMMUTABLE PARALLEL SAFE;


CREATE OR REPLACE FUNCTION msar.formula_functions() RETURNS text[] AS $$/*
The functions a formula can use, each of them one of Postgres's own and immutable.

Written into the statement qualified with pg_catalog, so that a function somebody has defined
under the same name in a schema earlier on the search path is not the one that gets called.

Left out on purpose: concat, concat_ws and to_char, which are only stable -- they read how the
session is set up -- and so cannot generate a column at all. Text is joined with || instead.
*/
SELECT ARRAY[
  -- Text
  'upper', 'lower', 'initcap', 'btrim', 'ltrim', 'rtrim', 'lpad', 'rpad', 'replace', 'translate',
  'substr', 'left', 'right', 'reverse', 'repeat', 'split_part', 'starts_with', 'strpos',
  'length', 'char_length', 'md5', 'ascii', 'chr',
  -- Numbers
  'abs', 'ceil', 'ceiling', 'floor', 'round', 'trunc', 'sign', 'mod', 'div',
  'power', 'sqrt', 'exp', 'ln', 'log', 'width_bucket',
  -- Dates and times, which are immutable only for a value that carries no time zone
  'date_part'
];
$$ LANGUAGE SQL IMMUTABLE PARALLEL SAFE;


CREATE OR REPLACE FUNCTION msar.formula_forms() RETURNS text[] AS $$/*
The function-shaped pieces of SQL's own grammar a formula can use.

These are not functions and cannot be qualified, being spelled out in the grammar itself, which is
also why nothing can shadow them.
*/
SELECT ARRAY['coalesce', 'nullif', 'greatest', 'least'];
$$ LANGUAGE SQL IMMUTABLE PARALLEL SAFE;


CREATE OR REPLACE FUNCTION msar.build_formula_sql(tab_id oid, formula jsonb) RETURNS text AS $$/*
Build the SQL expression a formula describes.

A formula is an object saying one of:
  {"column": <attnum>}                  a column of this table
  {"value": <value>}                    a number, a string, a boolean, or null
  {"op": <operator>, "of": [...]}       an operator applied to formulas
  {"fn": <function>, "of": [...]}       a function applied to formulas
  {"if": <formula>, "then": <formula>, "else": <formula>}   a choice between two formulas

Args:
  tab_id: The OID of the table whose columns the formula is about.
  formula: The formula.
*/
DECLARE
  name_ text;
  parts text[] := ARRAY[]::text[];
  part jsonb;
  col_id smallint;
  col_name text;
BEGIN
  IF formula IS NULL OR jsonb_typeof(formula) <> 'object' THEN
    RAISE EXCEPTION 'A formula says what to work out, and % does not.', COALESCE(formula::text, 'nothing')
    USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- A column of the table, by the attnum Postgres holds it at, which is what makes a rename of
  -- the column nothing to do with the formula.
  IF formula ? 'column' THEN
    col_id := (formula ->> 'column')::smallint;
    col_name := msar.get_column_name(tab_id, col_id);
    IF col_name IS NULL THEN
      RAISE EXCEPTION 'The table has no column %.', col_id USING ERRCODE = 'undefined_column';
    END IF;
    RETURN quote_ident(col_name);
  END IF;

  -- A value written into the formula. A number or a boolean is written out as itself, which is
  -- safe for the same reason it is simple: JSON has already had to parse it as one, so there is
  -- nothing in it but the digits or the word.
  IF formula ? 'value' THEN
    RETURN CASE jsonb_typeof(formula -> 'value')
      WHEN 'null' THEN 'NULL'
      WHEN 'number' THEN formula ->> 'value'
      WHEN 'boolean' THEN formula ->> 'value'
      WHEN 'string' THEN quote_literal(formula ->> 'value')
      ELSE NULL
    END;
  END IF;

  -- A choice between two formulas, which is the one bit of branching offered.
  IF formula ? 'if' THEN
    RETURN format(
      '(CASE WHEN %s THEN %s ELSE %s END)',
      msar.build_formula_sql(tab_id, formula -> 'if'),
      msar.build_formula_sql(tab_id, formula -> 'then'),
      CASE
        WHEN formula ? 'else' THEN msar.build_formula_sql(tab_id, formula -> 'else')
        ELSE 'NULL'
      END
    );
  END IF;

  IF formula ? 'op' OR formula ? 'fn' THEN
    IF jsonb_typeof(formula -> 'of') <> 'array' THEN
      RAISE EXCEPTION 'A formula applying something says what to apply it to.'
      USING ERRCODE = 'invalid_parameter_value';
    END IF;
    FOR part IN SELECT jsonb_array_elements(formula -> 'of') LOOP
      parts := array_append(parts, msar.build_formula_sql(tab_id, part));
    END LOOP;
    IF cardinality(parts) = 0 THEN
      RAISE EXCEPTION 'A formula applying something says what to apply it to.'
      USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END IF;

  IF formula ? 'op' THEN
    name_ := upper(btrim(formula ->> 'op'));
    IF NOT name_ = ANY(msar.formula_operators()) THEN
      RAISE EXCEPTION '% is not an operator a formula can use.', formula ->> 'op'
      USING ERRCODE = 'invalid_parameter_value',
        HINT = 'See msar.formula_operators for the ones it can.';
    END IF;
    RETURN CASE
      -- The ones that take a single formula, whichever side they are written on.
      WHEN name_ = 'NOT' THEN format('(NOT %s)', parts[1])
      WHEN name_ IN ('IS NULL', 'IS NOT NULL') THEN format('(%s %s)', parts[1], name_)
      WHEN name_ = '-' AND cardinality(parts) = 1 THEN format('(- %s)', parts[1])
      WHEN cardinality(parts) = 1 THEN NULL
      -- Everything else goes between, and between each of them if there are more than two.
      ELSE format('(%s)', array_to_string(parts, format(' %s ', name_)))
    END;
  END IF;

  IF formula ? 'fn' THEN
    name_ := lower(btrim(formula ->> 'fn'));
    IF name_ = ANY(msar.formula_functions()) THEN
      RETURN format('pg_catalog.%I(%s)', name_, array_to_string(parts, ', '));
    END IF;
    IF name_ = ANY(msar.formula_forms()) THEN
      RETURN format('%s(%s)', upper(name_), array_to_string(parts, ', '));
    END IF;
    RAISE EXCEPTION '% is not a function a formula can use.', formula ->> 'fn'
    USING ERRCODE = 'invalid_parameter_value',
      HINT = 'See msar.formula_functions and msar.formula_forms for the ones it can.';
  END IF;

  RAISE EXCEPTION 'A formula says what to work out, and % does not.', formula
  USING ERRCODE = 'invalid_parameter_value';
END;
$$ LANGUAGE plpgsql STABLE;


CREATE OR REPLACE FUNCTION msar.formula_as(tab_id oid, formula jsonb, to_names boolean)
  RETURNS jsonb AS $$/*
Rewrite a formula's column references, either to names or back to attnums.

Kept for the same reason a record summary template is: the attnums bind the formula while the
database is live and mean nothing once a restore has moved them, and a reference buried in a JSON
document has nothing of its own for the catalogue to fix. A reference that leads nowhere becomes
null, which keeps the shape of the formula and is refused as soon as anything tries to build it.

Args:
  tab_id: The OID of the table the formula is about.
  formula: The formula to rewrite.
  to_names: Whether to rewrite references to names, rather than back to attnums.
*/
DECLARE
  rewritten jsonb;
  key text;
  value jsonb;
BEGIN
  IF formula IS NULL OR jsonb_typeof(formula) <> 'object' THEN
    RETURN formula;
  END IF;

  IF formula ? 'column' THEN
    RETURN jsonb_build_object('column', CASE
      WHEN to_names THEN to_jsonb(msar.get_column_name(tab_id, (formula ->> 'column')::smallint))
      ELSE to_jsonb((
        SELECT a.attnum FROM pg_catalog.pg_attribute a
        WHERE a.attrelid = tab_id AND a.attname = formula ->> 'column'
          AND a.attnum > 0 AND NOT a.attisdropped
      ))
    END);
  END IF;

  rewritten := '{}'::jsonb;
  FOR key, value IN SELECT * FROM jsonb_each(formula) LOOP
    rewritten := rewritten || jsonb_build_object(key, CASE jsonb_typeof(value)
      WHEN 'object' THEN msar.formula_as(tab_id, value, to_names)
      WHEN 'array' THEN (
        SELECT COALESCE(jsonb_agg(
          msar.formula_as(tab_id, item, to_names) ORDER BY ordinality
        ), '[]'::jsonb)
        FROM jsonb_array_elements(value) WITH ORDINALITY AS x(item, ordinality)
      )
      ELSE value
    END);
  END LOOP;
  RETURN rewritten;
END;
$$ LANGUAGE plpgsql STABLE;


CREATE OR REPLACE FUNCTION msar.column_formula(tab_id oid, col_id smallint) RETURNS jsonb AS $$/*
Return the formula a column's values are worked out from, in attnums, or null if it has none.

Which of the two stored forms to believe is the same question as for the rest of a column's
presentation, answered the same way: while the OID the row was written against is still the
table's, the attnums are right and the names are a cache; once it isn't, a restore has moved the
attnums and the names are what is left to go on.

Args:
  tab_id: The OID of the table containing the column.
  col_id: The attnum of the column.
*/
SELECT CASE
  WHEN c.written_against = tab_id THEN c.formula
  ELSE msar.formula_as(tab_id, c.formula_names, false)
END
FROM presentation_schema.columns c
WHERE c."table" = tab_id::regclass AND c.attnum = col_id;
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION msar.set_column_formula_record(tab_id oid, col_id smallint, formula jsonb)
  RETURNS void AS $$/*
Keep what a column's formula was asked for as, so that it can be shown and changed as it was.

Postgres holds the expression it built from the formula, which is the truth about what the column
holds, but it holds it as an expression and not as the formula somebody wrote. Both forms of the
formula are written at once for the same reason they are for a record summary: the attnums to bind
by while the database is live, and the names to fall back on once a restore has been through.

Args:
  tab_id: The OID of the table containing the column.
  col_id: The attnum of the column.
  formula: The formula, with column references as attnums, or null to keep none.
*/
BEGIN
  PERFORM msar.heal_column_presentation(tab_id);
  IF NOT msar.ensure_column_presentation(tab_id, col_id) THEN
    RAISE EXCEPTION 'Column % of table % does not exist', col_id, tab_id::regclass
    USING ERRCODE = 'undefined_column';
  END IF;
  UPDATE presentation_schema.columns
  SET formula = set_column_formula_record.formula,
    formula_names = msar.formula_as(tab_id, set_column_formula_record.formula, true)
  WHERE "table" = tab_id::regclass AND attnum = col_id;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION msar.formula_type(tab_id oid, expr text) RETURNS text AS $$/*
Return the type of the values an expression works out, as Postgres writes the type.

Asked of Postgres rather than worked out here, by having it describe a column of the expression
over none of the table's records. Nothing is read: the query is over an empty set, and it is the
shape of the answer we are after rather than any answer.

Args:
  tab_id: The OID of the table the expression is about.
  expr: The expression, as msar.build_formula_sql builds it.
*/
DECLARE
  typ text;
BEGIN
  DROP TABLE IF EXISTS pg_temp.msar_formula_shape;
  EXECUTE format(
    'CREATE TEMP TABLE msar_formula_shape AS SELECT (%s) AS worked_out FROM %s WHERE false',
    expr, tab_id::regclass
  );
  SELECT pg_catalog.format_type(a.atttypid, a.atttypmod) INTO typ
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'pg_temp.msar_formula_shape'::regclass AND a.attname = 'worked_out';
  DROP TABLE pg_temp.msar_formula_shape;
  RETURN typ;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION msar.add_formula_column(
  tab_id oid,
  col_name text,
  formula jsonb,
  typ jsonb DEFAULT null,
  description text DEFAULT null
) RETURNS smallint AS $$/*
Add a column whose values Postgres works out from the rest of the record.

The type is worked out from the formula unless one is given, there being no need to ask somebody
what kind of thing an amount times a rate is.

Args:
  tab_id: The OID of the table to add the column to.
  col_name: The name to give it.
  formula: The formula its values are worked out from; see msar.build_formula_sql.
  typ: The type to hold them as, as a column's type is given, or null to work it out.
  description: A comment to put on the column.
*/
DECLARE
  expr text := msar.build_formula_sql(tab_id, formula);
  -- Asked of the formula when none is given. Not COALESCE on build_type_text, which answers
  -- 'text' rather than nothing when given nothing.
  type_text text := CASE
    WHEN typ IS NULL THEN msar.formula_type(tab_id, expr)
    ELSE msar.build_type_text(typ)
  END;
  col_id smallint;
BEGIN
  EXECUTE format(
    'ALTER TABLE %s ADD COLUMN %I %s GENERATED ALWAYS AS (%s) STORED',
    tab_id::regclass, col_name, type_text, expr
  );
  SELECT a.attnum INTO col_id
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = tab_id AND a.attname = col_name AND NOT a.attisdropped;

  PERFORM msar.set_column_formula_record(tab_id, col_id, formula);
  IF description IS NOT NULL THEN
    EXECUTE format('COMMENT ON COLUMN %s.%I IS %L', tab_id::regclass, col_name, description);
  END IF;
  RETURN col_id;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION msar.set_column_formula(tab_id oid, col_id smallint, formula jsonb)
  RETURNS void AS $$/*
Change the formula a column's values are worked out from.

Every record is worked out again, the values being stored, so this rewrites the table. Postgres
has only been able to change a generation expression since 17; before that the column has to be
dropped and added again, which is not something to do quietly to a column other things may point
at, so it is refused and said so.

Args:
  tab_id: The OID of the table containing the column.
  col_id: The attnum of the column.
  formula: The formula its values are to be worked out from.
*/
DECLARE
  expr text := msar.build_formula_sql(tab_id, formula);
BEGIN
  IF current_setting('server_version_num')::integer < 170000 THEN
    RAISE EXCEPTION 'Changing a formula needs PostgreSQL 17 or later.'
    USING ERRCODE = 'feature_not_supported',
      HINT = 'Drop the column and add it again with the formula wanted.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = tab_id AND a.attnum = col_id AND a.attgenerated <> ''
  ) THEN
    RAISE EXCEPTION 'Column % of table % is not worked out from a formula.', col_id, tab_id::regclass
    USING ERRCODE = 'invalid_column_definition',
      HINT = 'A column already holding values of its own cannot start being worked out from them.';
  END IF;
  EXECUTE format(
    'ALTER TABLE %s ALTER COLUMN %I SET EXPRESSION AS (%s)',
    tab_id::regclass, msar.get_column_name(tab_id, col_id), expr
  );
  PERFORM msar.set_column_formula_record(tab_id, col_id, formula);
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION msar.column_formula_info(tab_id oid, col_id smallint)
  RETURNS jsonb AS $$/*
What there is to say about a column being worked out from a formula, for the column's description.

Two things, and they answer different questions. `formula` is the formula it was asked for as,
which is what can be shown back and changed, and is null for a generated column Mathesar did not
make. `formula_sql` is the expression Postgres actually works the values out from, which is there
for any generated column at all, so one written in SQL still says what it does.

A column holding values of its own says neither, rather than saying both are nothing: it is not a
column there is a formula question to ask about.

Args:
  tab_id: The OID of the table containing the column.
  col_id: The attnum of the column.
*/
SELECT CASE WHEN a.attgenerated = '' THEN '{}'::jsonb ELSE
  jsonb_build_object(
    'formula', msar.column_formula(tab_id, col_id),
    'formula_sql', pg_catalog.pg_get_expr(d.adbin, d.adrelid)
  )
END
FROM pg_catalog.pg_attribute a
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE a.attrelid = tab_id AND a.attnum = col_id;
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION msar.get_column_info(tab_id regclass) RETURNS jsonb AS $$/*
Given a table identifier, return an array of objects describing the columns of the table.

Defined again here, on top of the one in 05_msar.sql, to add what there is to say about a column
worked out from a formula. It cannot be said there: that file is read before the table the formulas
are kept in exists, and a SQL function is checked as it is defined rather than as it is called.

See msar.column_info_table for the rest of what a column says about itself, and
msar.column_formula_info for the two keys added here.
*/
SELECT coalesce(jsonb_agg(
  to_jsonb(column_data) || msar.column_formula_info(tab_id, column_data.id)
  ORDER BY column_data.id ASC
), '[]'::jsonb)
FROM msar.column_info_table(tab_id) AS column_data;
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;
