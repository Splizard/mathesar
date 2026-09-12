SELECT msar.drop_all_msar_objects(
  schemas_to_remove => ARRAY['msar', '__msar', 'mathesar_types', 'mathesar_inference_schema', 'msar_views'],
  remove_custom_types => false,
  strict => false
);

CREATE SCHEMA IF NOT EXISTS __msar;
CREATE SCHEMA IF NOT EXISTS msar;

----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- HELPER FUNCTIONS
--
-- Low-level utils functions used by other functions.
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------


CREATE OR REPLACE FUNCTION msar.mathesar_system_schemas() RETURNS text[] AS $$/*
Return a text array of the Mathesar System schemas.

Update this function whenever the list changes.
*/
SELECT ARRAY['msar', '__msar', 'mathesar_types', 'presentation_schema']
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION msar.extract_smallints(v jsonb) RETURNS smallint[] AS $$/*
From the supplied JSONB value, extract all top-level JSONB array elements which can be successfully
cast to PostgreSQL smallint values. Return the resulting array of smallint values.

If the supplied jsonb value is not an array, this function will return an empty array.

If any jsonb array element cannot be cast to a smallint, it will be silently ignored.

This function does not raise any exceptions. It will always return an array.

This function should not be used on large arrays. It will be slow due to the performance
limitations[1] of EXCEPTION blocks.

[1]: https://www.postgresql.org/docs/current/plpgsql-control-structures.html#PLPGSQL-ERROR-TRAPPING

Args:
  v: any JSONB value.
*/
DECLARE
  result smallint[];
  element jsonb;
BEGIN
  FOR element IN SELECT jsonb_array_elements(v)
  LOOP
    BEGIN
      result := result || (element::smallint);
    EXCEPTION
      -- Ignore any elements that can't be cast to smallint.
      WHEN others THEN
        CONTINUE;
    END;
  END LOOP;
  RETURN result;
EXCEPTION
  WHEN others THEN
    RETURN '{}'::smallint[]; -- Return an empty array if the input is not an array.
END;
$$ LANGUAGE plpgsql IMMUTABLE RETURNS NULL ON NULL INPUT PARALLEL SAFE;


CREATE OR REPLACE FUNCTION msar.get_unique_local_identifier(
  existing_identifiers text[],
  base_identifier text
) RETURNS text AS $$/*
  This function generates a unique identifier based on a given base identifier and list
  of existing identifiers.

  If the base identifier already exists in the provided array of existing identifiers,
  it appends a counter to ensure uniqueness, else it returns the base identifier.
*/
DECLARE
  unique_identifier text;
  counter integer := 0;
BEGIN
  unique_identifier := base_identifier;

  WHILE unique_identifier = ANY(existing_identifiers) LOOP
    counter := counter + 1;
    unique_identifier := format('%s %s', base_identifier, counter);
  END LOOP;

  RETURN unique_identifier;
END;
$$ LANGUAGE plpgsql IMMUTABLE RETURNS NULL ON NULL INPUT;


----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- GENERAL DDL FUNCTIONS
--
-- Functions in this section are quite general, and are the basis of the others.
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------


CREATE OR REPLACE FUNCTION
__msar.build_text_tuple(text[]) RETURNS text AS $$
SELECT '(' || string_agg(col, ', ') || ')' FROM unnest($1) x(col);
$$ LANGUAGE sql RETURNS NULL ON NULL INPUT;


----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- GENERAL DQL FUNCTIONS
--
-- Functions in this section are quite general, and are the basis of the others.
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------


CREATE OR REPLACE FUNCTION
__msar.exec_dql(command text) RETURNS jsonb AS $$/*
Execute the given command, returning a JSON object describing the records in the following form:
[
  {"id": 1, "col1_name": "value1", "col2_name": "value2"},
  {"id": 2, "col1_name": "value1", "col2_name": "value2"},
  {"id": 3, "col1_name": "value1", "col2_name": "value2"},
  ...
]

Useful for SELECTing from tables. Most useful when you're performing DQL.

Note that you must include the primary key column(`id` in case of a Mathesar table) in the
command_template if you want the returned records to be uniquely identifiable.

Args:
  command: Raw string that will be executed as a command.
*/
DECLARE
  records jsonb;
BEGIN
  EXECUTE 'WITH cte AS (' || command || ')
  SELECT jsonb_agg(row_to_json(cte.*)) FROM cte' INTO records;
  RETURN records;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
__msar.exec_dql(command_template text, arguments variadic anyarray) RETURNS jsonb AS $$/*
Execute a templated command, returning a JSON object describing the records in the following form:
[
  {"id": 1, "col1_name": "value1", "col2_name": "value2"},
  {"id": 2, "col1_name": "value1", "col2_name": "value2"},
  {"id": 3, "col1_name": "value1", "col2_name": "value2"},
  ...
]

The template is given in the first argument, and all further arguments are used to fill in the
template. Useful for SELECTing from tables. Most useful when you're performing DQL.

Note that you must include the primary key column(`id` in case of a Mathesar table) in the
command_template if you want the returned records to be uniquely identifiable.

Args:
  command_template: Raw string that will be executed as a command.
  arguments: arguments that will be used to fill in the template.
*/
DECLARE formatted_command TEXT;
BEGIN
  formatted_command := format(command_template, VARIADIC arguments);
  RETURN __msar.exec_dql(formatted_command);
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- INFO FUNCTIONS
--
-- Functions in this section get information about a given schema, table or column.
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION msar.col_description(tab_id oid, col_id integer) RETURNS text AS $$/*
Transparent wrapper for col_description. Putting it in the `msar` namespace helps route all DB calls
from Python through a single Python module.
*/
  BEGIN
    RETURN col_description(tab_id, col_id);
  END
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION msar.obj_description(obj_id oid, catalog_name text) RETURNS text AS $$/*
Transparent wrapper for obj_description. Putting it in the `msar` namespace helps route all DB calls
from Python through a single Python module.
*/
  BEGIN
    RETURN obj_description(obj_id, catalog_name);
  END
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION __msar.jsonb_key_exists(data jsonb, key text) RETURNS boolean AS $$/*
Wraps the `?` jsonb operator for improved readability.
*/
  BEGIN
    RETURN data ? key;
  END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION msar.get_schema_oid(sch_name text) RETURNS oid AS $$/*
Return the OID of a schema, or NULL if the schema does not exist.

Args :
  sch_name: The name of the schema, UNQUOTED.
*/
SELECT oid FROM pg_catalog.pg_namespace WHERE nspname=sch_name;
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.get_schema_name(sch_id oid) RETURNS TEXT AS $$/*
Return the UNQUOTED name for a given schema.

Raises an exception if the schema is not found.

Args:
  sch_id: The OID of the schema.
*/
DECLARE sch_name text;
BEGIN
  SELECT nspname INTO sch_name FROM pg_catalog.pg_namespace WHERE oid=sch_id;

  IF sch_name IS NULL THEN
    RAISE EXCEPTION 'No schema with OID % exists.', sch_id
    USING ERRCODE = '3F000'; -- invalid_schema_name
  END IF;

  RETURN sch_name;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
__msar.build_qualified_name_sql(sch_name text, obj_name text) RETURNS text AS $$/*
Return the fully-qualified, properly quoted, name for a given database object (e.g., table).

Args:
  sch_name: The schema of the object, unquoted.
  obj_name: The name of the object, unqualified and unquoted.
*/
BEGIN
  RETURN  format('%I.%I', sch_name, obj_name);
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
__msar.get_qualified_relation_name(rel_id oid) RETURNS text AS $$/*
Return the name for a given relation (e.g., table), qualified or quoted as appropriate.

In cases where the relation is already included in the search path, the returned name will not be
fully-qualified.

The relation *must* be in the pg_class table to use this function.

Args:
  rel_id: The OID of the relation.
*/
BEGIN
  RETURN rel_id::regclass::text;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
__msar.get_qualified_relation_name_or_null(rel_id oid) RETURNS text AS $$/*
Return the name for a given relation (e.g., table), qualified or quoted as appropriate.

In cases where the relation is already included in the search path, the returned name will not be
fully-qualified.

The relation *must* be in the pg_class table to use this function. This function will return NULL if
no corresponding relation can be found.

Args:
  rel_id: The OID of the relation.
*/
SELECT CASE
  WHEN EXISTS (SELECT oid FROM pg_catalog.pg_class WHERE oid=rel_id) THEN rel_id::regclass::text
END
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.get_relation_name(rel_oid oid) RETURNS TEXT AS $$/*
Return the UNQUOTED name of a given relation (e.g., table).

If the relation does not exist, an exception will be raised.

Args:
  rel_oid: The OID of the relation.
*/
DECLARE rel_name text;
BEGIN
  SELECT relname INTO rel_name FROM pg_catalog.pg_class WHERE oid=rel_oid;

  IF rel_name IS NULL THEN
    RAISE EXCEPTION 'Relation with OID % does not exist', rel_oid
    USING ERRCODE = '42P01'; -- undefined_table
  END IF;

  RETURN rel_name;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.get_relation_schema_name(rel_oid oid) RETURNS TEXT AS $$/*
Return the UNQUOTED name of the schema which contains a given relation (e.g., table).

If the relation does not exist, an exception will be raised.

Args:
  rel_oid: The OID of the relation.
*/
DECLARE sch_name text;
BEGIN
  SELECT n.nspname INTO sch_name
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE c.oid = rel_oid;

  IF sch_name IS NULL THEN
    RAISE EXCEPTION 'Relation with OID % does not exist', rel_oid
    USING ERRCODE = '42P01'; -- undefined_table
  END IF;

  RETURN sch_name;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.get_relation_namespace_oid(rel_id oid) RETURNS oid AS $$/*
Get the OID of the namespace containing the given relation.

Most useful for getting the OID of the schema of a given table.

Args:
  rel_id: The OID of the relation whose namespace we want to find.
*/
SELECT relnamespace FROM pg_catalog.pg_class WHERE oid=rel_id;
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;



CREATE OR REPLACE FUNCTION
msar.get_column_name(rel_id oid, col_id integer) RETURNS text AS $$/*
Return the UNQUOTED name for a given column in a given relation (e.g., table).

More precisely, this function returns the name of attributes that are not dropped, for any relation appearing in the
pg_class catalog table (so you could find attributes of indices with this function).

Args:
  rel_id:  The OID of the relation.
  col_id:  The attnum of the column in the relation.
*/
SELECT attname::text FROM pg_catalog.pg_attribute WHERE attrelid=rel_id AND attnum=col_id AND NOT attisdropped;
$$ LANGUAGE sql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.get_column_name(rel_id oid, col_name text) RETURNS text AS $$/*
Return the UNQUOTED name for a given column in a given relation (e.g., table).

More precisely, this function returns the unquoted name of attributes that are not dropped, for any relation appearing in the
pg_class catalog table (so you could find attributes of indices with this function). If the given
col_name is not in the relation, we return null.

This has the effect of both quoting and preparing the given col_name, and also validating that it
exists.

Args:
  rel_id:  The OID of the relation.
  col_name:  The unquoted name of the column in the relation.
*/
SELECT attname::text FROM pg_catalog.pg_attribute WHERE attrelid=rel_id AND attname=col_name AND NOT attisdropped;
$$ LANGUAGE sql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.get_column_names(rel_id oid, columns jsonb) RETURNS text[] AS $$/*
Return the QUOTED names for given columns in a given relation (e.g., table).

- If the rel_id is given as 0, the assumption is that this is a new table, so we just apply normal
quoting rules to a column without validating anything further.
- If the rel_id is given as nonzero, and a column is given as text, then we validate that
  the column name exists in the table, and use that.
- If the rel_id is given as nonzero, and the column is given as a number, then we look the column up
  by attnum and use that name.

The columns jsonb can have a mix of numerical IDs and column names. The reason for this is that we
may be adding a column algorithmically, and this saves having to modify the column adding logic
based on the IDs passed by the user for given columns.

Args:
  rel_id:  The OID of the relation.
  columns:  A JSONB array of the unquoted names or IDs (can be mixed) of the columns.
*/
SELECT array_agg(
  CASE
    WHEN rel_id=0 THEN quote_ident(col #>> '{}')
    WHEN jsonb_typeof(col)='number' THEN quote_ident(msar.get_column_name(rel_id, col::integer))
    WHEN jsonb_typeof(col)='string' THEN quote_ident(msar.get_column_name(rel_id, col #>> '{}'))
  END
)
FROM jsonb_array_elements(columns) AS x(col);
$$ LANGUAGE sql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.get_attnum(rel_id oid, att_name text) RETURNS smallint AS $$/*
Get the attnum for a given attribute in the relation. Returns null if no such attribute exists.

Usually, this will be used to get the attnum for a column of a table.

Args:
  rel_id: The relation where we'll look for the attribute.
  att_name: The name of the attribute, unquoted.
*/
SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid=rel_id AND attname=att_name;
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.is_pkey_col(rel_id oid, col_id integer) RETURNS boolean AS $$/*
Return whether the given column is in the primary key of the given relation (e.g., table).

Args:
  rel_id:  The OID of the relation.
  col_id:  The attnum of the column in the relation.
*/
SELECT EXISTS (
  SELECT 1 FROM pg_catalog.pg_constraint WHERE
    ARRAY[col_id::smallint] <@ conkey AND conrelid=rel_id AND contype='p'
);
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.get_selectable_pkey_attnum(rel_id regclass) RETURNS smallint AS $$/*
Get the attnum of the single-column primary key for a relation if it has one. If not, return null.

The attnum will only be returned if the current user has SELECT on that column.

TODO: resolve potential code duplication between this function and `get_pk_column`.

Args:
  rel_id:  The OID of the relation.
*/
SELECT conkey[1] FROM pg_catalog.pg_constraint
WHERE
  conrelid = rel_id
  AND cardinality(conkey) = 1
  AND contype='p'
  AND has_column_privilege(rel_id, conkey[1], 'SELECT');
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.is_default_possibly_dynamic(tab_id oid, col_id integer) RETURNS boolean AS $$/*
Determine whether the default value for the given column is an expression or constant.

If the column default is an expression, then we return 'True', since that could be dynamic. If the
column default is a simple constant, we return 'False'. The check is not very sophisticated, and
errs on the side of returning 'True'. We simply pull apart the pg_node_tree representation of the
expression, and check whether the root node is a known function call type. Note that we do *not*
search any deeper in the tree than the root node. This means we won't notice that some expressions
are actually constant (or at least static), if they have a function call or operator as their root
node.

For example, the following would return 'True', even though they're not dynamic:
  3 + 5
  msar.cast_to_integer('8')

Args:
  tab_id: The OID of the table with the column.
  col_id: The attnum of the column in the table.
*/
SELECT
  -- This is a typical dynamic default like NOW() or CURRENT_DATE
  (split_part(substring(adbin, 2), ' ', 1) IN (('SQLVALUEFUNCTION'), ('FUNCEXPR')))
  OR
  -- This is an identity column `GENERATED {ALWAYS | DEFAULT} AS IDENTITY`
  (attidentity <> '')
  OR
  -- Other generated columns show up here.
  (attgenerated <> '')
FROM pg_catalog.pg_attribute LEFT JOIN pg_catalog.pg_attrdef ON attrelid=adrelid AND attnum=adnum
WHERE attrelid=tab_id AND attnum=col_id;
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.is_mathesar_id_column(tab_id oid, col_id integer) RETURNS boolean AS $$/*
Determine whether the given column is our default Mathesar ID column.

The column in question is always attnum 1, and is created with the string

  id integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY

Args:
  tab_id: The OID of the table whose column we'll check
  col_id: The attnum of the column in question
*/
SELECT col_id=1 AND attname='id' AND atttypid='integer'::regtype::oid AND attidentity <> ''
FROM pg_catalog.pg_attribute WHERE attrelid=tab_id AND attnum=col_id;
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.get_cast_function_name(target_type regtype) RETURNS text AS $$/*
Return a string giving the appropriate name of the casting function for the target_type.

Currently set up to duplicate the logic in our python casting function builder. This will be
changed. Given a qualified, potentially capitalized type name, we
- Remove the namespace (schema),
- Replace any white space in the type name with underscores,
- Replace double quotes in the type name (e.g., the "char" type) with '_double_quote_'
- Use the prepped type name in the name `msar.cast_to_%s`.

Args:
  target_type: This should be a type that exists.
*/
DECLARE target_type_prepped text;
BEGIN
  -- TODO: Come up with a way to build these names that is more robust against collisions.
  WITH unqualifier AS (
    SELECT x[array_upper(x, 1)] unqualified_type
    FROM regexp_split_to_array(target_type::text, '\.') x
  ), unspacer AS(
    SELECT replace(unqualified_type, ' ', '_') unspaced_type
    FROM unqualifier
  )
  SELECT replace(unspaced_type, '"', '_double_quote_')
  FROM unspacer
  INTO target_type_prepped;
  RETURN format('msar.cast_to_%s', target_type_prepped);
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.get_database_name(dat_id oid) RETURNS TEXT AS $$/*
Return the UNQUOTED name of a given database.

If the database does not exist, an exception will be raised.

Args:
  dat_id: The OID of the role.
*/
DECLARE dat_name text;
BEGIN
  SELECT datname INTO dat_name FROM pg_catalog.pg_database WHERE oid=dat_id;

  IF dat_name IS NULL THEN
    RAISE EXCEPTION 'Database with OID % does not exist', dat_id
    USING ERRCODE = '42704'; -- undefined_object
  END IF;

  RETURN dat_name;
END;
$$ LANGUAGE plpgsql STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.get_role_name(rol_oid oid) RETURNS TEXT AS $$/*
Return the UNQUOTED name of a given role.

If the role does not exist, an exception will be raised.

Args:
  rol_oid: The OID of the role.
*/
DECLARE rol_name text;
BEGIN
  SELECT rolname INTO rol_name FROM pg_catalog.pg_roles WHERE oid=rol_oid;

  IF rol_name IS NULL THEN
    RAISE EXCEPTION 'Role with OID % does not exist', rol_oid
    USING ERRCODE = '42704'; -- undefined_object
  END IF;

  RETURN rol_name;
END;
$$ LANGUAGE plpgsql STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.get_constraint_type_api_code(contype char) RETURNS TEXT AS $$/*
This function returns a string that represents the constraint type code used to describe
constraints when listing them within the Mathesar API.

PostgreSQL constraint types are documented by the `contype` field here:
https://www.postgresql.org/docs/current/catalog-pg-constraint.html

Notably, we don't include 't' (trigger) because triggers a bit different structurally and we don't
support working with them (yet?) in Mathesar.
*/
SELECT CASE contype
  WHEN 'c' THEN 'check'
  WHEN 'f' THEN 'foreignkey'
  WHEN 'p' THEN 'primary'
  WHEN 'u' THEN 'unique'
  WHEN 'x' THEN 'exclude'
END;
$$ LANGUAGE SQL;


CREATE OR REPLACE FUNCTION msar.check_patterns() RETURNS text[] AS $$/*
The check constraint patterns Mathesar knows how to write and recognize.
*/
SELECT ARRAY['text_box'];
$$ LANGUAGE SQL IMMUTABLE;


CREATE OR REPLACE FUNCTION msar.normalize_check_expression(expression text) RETURNS text AS $$/*
Reduce a check constraint's expression to a form that can be compared.

PostgreSQL renders an expression back from its parse tree rather than storing what was typed, so
what comes out has every operand parenthesized and every cast spelled out: the text_box pattern
comes back as ((c = btrim(c)) AND (c !~ '[\r\n]'::text)), and on a varchar column as
(((c)::text = btrim((c)::text)) AND ...). Dropping casts and parentheses and collapsing whitespace
leaves both of those, and the expression we wrote in the first place, looking the same.

This is deliberately loose, and two expressions that differ only in ways it discards would be
treated as one. That is safe only because matching decides how to *present* a column and never what
to do to it: an expression Mathesar doesn't recognize is left alone, not rewritten.

Note that it also reaches inside string literals, so a pattern whose literal contains parentheses
would need a cleverer comparison than this.
*/
SELECT btrim(
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(expression, '::character varying', '', 'g'),
        '::[a-z_]+(\[\])?', '', 'g'
      ),
      '[()]', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  )
);
$$ LANGUAGE SQL IMMUTABLE;


CREATE OR REPLACE FUNCTION
msar.build_check_expression(tab_id oid, pattern text, columns jsonb) RETURNS text AS $$/*
Build the boolean expression of a CHECK constraint from a named pattern.

Mathesar recognizes a column's type by the constraint on it, so the expressions it writes have to be
drawn from a fixed set rather than composed by the caller: this function is that set. Callers name a
pattern and the columns to apply it to, and never supply SQL. Keeping the registry here means the
column names are quoted by msar.get_column_names, which also validates that they exist.

The patterns:
  'text_box': the value is trimmed of surrounding whitespace and holds no line break.

Args:
  tab_id: The OID of the table the constraint is for.
  pattern: The name of the pattern to build.
  columns: A JSONB array of the names or attnums of the columns to apply it to.
*/
DECLARE
  col text;
BEGIN
  col := (msar.get_column_names(tab_id, columns))[1];
  IF col IS NULL THEN
    RAISE EXCEPTION 'Check constraint pattern % needs a column', pattern
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN __msar.build_check_expression_for(pattern, col, __msar.column_is_array(tab_id, col));
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION __msar.column_is_array(tab_id oid, col text) RETURNS boolean AS $$/*
Whether the named column of the given table holds an array.

Args:
  tab_id: The OID of the table.
  col: The column's name, quoted as msar.get_column_names returns it.
*/
SELECT EXISTS (
  SELECT 1
  FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
  WHERE a.attrelid = tab_id AND quote_ident(a.attname) = col AND t.typcategory = 'A'
);
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
__msar.build_check_expression_for(pattern text, val text, is_array boolean) RETURNS text AS $$/*
The check patterns themselves, written against an arbitrary value expression.

Taking the value as an expression rather than a column name lets the same definition serve both the
constraint on a column and the question of whether a repaired value would satisfy it, so the two
can't disagree about what the pattern means.

An array is tested element by element, which a CHECK constraint can hold neither a subquery nor a
set-returning function to do. Joining the elements and matching the join against an anchored
pattern does it with nothing but built-ins. That relies on the separator not appearing inside an
element, which for a text box is the very thing being forbidden, so the elements are also
concatenated with no separator at all and that checked for line breaks: joining alone would read a
single element holding a break as two blameless ones.

Elements that are null are skipped by array_to_string, and so pass, as a null value does.

Args:
  pattern: The name of the pattern.
  val: A SQL expression for the value to test, already quoted or parenthesized as needed.
  is_array: Whether the value is an array of the pattern's type rather than one of them.
*/
DECLARE
  -- One element: no space at either end, and nothing of a line break within.
  text_box_element constant text := '([^[:space:]]([^\n\r]*[^[:space:]])?)?';
  expression text;
BEGIN
  expression := CASE
    WHEN pattern = 'text_box' AND is_array THEN format(
      'array_to_string(%1$s, '''') !~ ''[\r\n]'''
      ' AND array_to_string(%1$s, chr(10)) ~ ''^(%2$s(\n%2$s)*)?$''',
      val, text_box_element
    )
    WHEN pattern = 'text_box' THEN format('%1$s = btrim(%1$s) AND %1$s !~ ''[\r\n]''', val)
  END;
  IF expression IS NULL THEN
    RAISE EXCEPTION 'Unknown check constraint pattern: %', pattern
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN expression;
END;
$$ LANGUAGE plpgsql IMMUTABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.build_check_repair(pattern text, val text, is_array boolean) RETURNS text AS $$/*
An expression for the nearest value that satisfies the pattern, where there is one worth having.

Only changes that keep the meaning of the value belong here. Trimming a text box's surroundings
does; deleting the line breaks that also disqualify it does not, so a value with one is left for
someone to decide about rather than silently rewritten. Null where a pattern has no such repair.

Unlike the constraint, this is never evaluated inside a CHECK, so an array can be taken apart and
put back together with a subquery. The ordinality keeps the elements in the order they were in.

Args:
  pattern: The name of the pattern.
  val: A SQL expression for the value to repair.
  is_array: Whether the value is an array of the pattern's type rather than one of them.
*/
SELECT CASE
  WHEN pattern = 'text_box' AND is_array THEN format(
    '(SELECT array_agg(btrim(msar_e) ORDER BY msar_o)'
    ' FROM unnest(%s) WITH ORDINALITY AS msar_u(msar_e, msar_o))',
    val
  )
  WHEN pattern = 'text_box' THEN format('btrim(%s)', val)
END;
$$ LANGUAGE SQL IMMUTABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.check_pattern_violations(tab_id oid, columns jsonb, pattern text) RETURNS jsonb AS $$/*
Count the rows that would stop a check pattern being applied to a column.

Returns {"violations": <int>, "repairable": <int>}, where repairable counts those that
msar.build_check_repair could put right without changing what they say. A caller can use the two
to decide between offering to fix the column and telling someone they have to.

Rows where the value is null are not counted: a check constraint passes on null, as this does.

Args:
  tab_id: The OID of the table.
  columns: A JSONB array holding the one column the pattern would go on.
  pattern: The name of the pattern.
*/
DECLARE
  col text;
  is_array boolean;
  expression text;
  repair text;
  repaired_expression text;
  result jsonb;
BEGIN
  col := (msar.get_column_names(tab_id, columns))[1];
  IF col IS NULL THEN
    RAISE EXCEPTION 'Check constraint pattern % needs a column', pattern
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  is_array := __msar.column_is_array(tab_id, col);
  expression := __msar.build_check_expression_for(pattern, col, is_array);
  repair := msar.build_check_repair(pattern, col, is_array);
  repaired_expression := CASE
    WHEN repair IS NULL THEN 'false'
    ELSE __msar.build_check_expression_for(pattern, format('(%s)', repair), is_array)
  END;
  EXECUTE format(
    $q$SELECT jsonb_build_object(
      'violations', count(*) FILTER (WHERE NOT (%2$s)),
      'repairable', count(*) FILTER (WHERE NOT (%2$s) AND (%3$s))
    ) FROM %1$s$q$,
    __msar.get_qualified_relation_name(tab_id), expression, repaired_expression
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.repair_check_pattern(tab_id oid, columns jsonb, pattern text) RETURNS integer AS $$/*
Put right the rows that a check pattern's repair can fix, and return how many were changed.

Only touches rows that both break the pattern and would satisfy it afterwards, so a value the
repair can't salvage is left exactly as it was for someone to look at.

Args:
  tab_id: The OID of the table.
  columns: A JSONB array holding the one column to repair.
  pattern: The name of the pattern.
*/
DECLARE
  col text;
  is_array boolean;
  expression text;
  repair text;
  repaired_expression text;
  changed integer;
BEGIN
  col := (msar.get_column_names(tab_id, columns))[1];
  IF col IS NULL THEN
    RAISE EXCEPTION 'Check constraint pattern % needs a column', pattern
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  is_array := __msar.column_is_array(tab_id, col);
  expression := __msar.build_check_expression_for(pattern, col, is_array);
  repair := msar.build_check_repair(pattern, col, is_array);
  IF repair IS NULL THEN
    RETURN 0;
  END IF;
  repaired_expression := __msar.build_check_expression_for(
    pattern, format('(%s)', repair), is_array
  );
  EXECUTE format(
    'UPDATE %1$s SET %2$s = %3$s WHERE NOT (%4$s) AND (%5$s)',
    __msar.get_qualified_relation_name(tab_id), col, repair, expression, repaired_expression
  );
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.match_check_pattern(tab_id oid, columns smallint[], expression text) RETURNS text AS $$/*
Return the name of the check pattern the given expression is, or null if it isn't one of ours.

Args:
  tab_id: The OID of the table the constraint is on.
  columns: The attnums the constraint covers, from pg_constraint.conkey.
  expression: The constraint's expression, as PostgreSQL renders it.
*/
DECLARE
  pattern text;
BEGIN
  IF expression IS NULL OR columns IS NULL OR array_length(columns, 1) <> 1 THEN
    RETURN NULL;
  END IF;
  FOREACH pattern IN ARRAY msar.check_patterns() LOOP
    IF msar.normalize_check_expression(expression)
       = msar.normalize_check_expression(
           msar.build_check_expression(tab_id, pattern, to_jsonb(columns))
         )
    THEN
      RETURN pattern;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;


CREATE OR REPLACE FUNCTION msar.get_constraints_for_table(tab_id oid) RETURNS TABLE
(
  oid oid,
  name text,
  type text,
  columns smallint[],
  referent_table_oid oid,
  referent_columns smallint[],
  expression text,
  validated boolean,
  pattern text
)
AS $$/*
Return data describing the constraints set on a given table.

Args:
  tab_id: The OID of the table.

`expression` is the boolean expression of a CHECK constraint, as PostgreSQL renders it back to us,
and is null for every other type. Note that the rendering normalizes whitespace, parentheses,
identifier case and schema qualification, but preserves the order of an operator's operands and
spells out casts, so two expressions that mean the same thing don't necessarily render alike.

`validated` is false for a constraint added with NOT VALID, whose existing rows were never checked.

`pattern` names the check pattern the expression turns out to be, where Mathesar recognizes it, so
that a caller can tell a column's type from its constraint without having to read SQL. It is null
for a check constraint written by someone else, which Mathesar shows but never rewrites.
*/
WITH constraints AS (
  SELECT
    oid,
    conname AS name,
    msar.get_constraint_type_api_code(contype::char) AS type,
    conkey AS columns,
    confrelid AS referent_table_oid,
    confkey AS referent_columns,
    CASE WHEN contype = 'c' THEN pg_catalog.pg_get_expr(conbin, conrelid) END AS expression,
    convalidated AS validated,
    CASE WHEN contype = 'c' THEN msar.match_check_pattern(
      conrelid, conkey, pg_catalog.pg_get_expr(conbin, conrelid)
    ) END AS pattern
  FROM pg_catalog.pg_constraint
  WHERE conrelid = tab_id
)
SELECT *
FROM constraints
-- Only return constraints with types that we're able to classify
WHERE type IS NOT NULL
$$ LANGUAGE SQL;


CREATE OR REPLACE FUNCTION
msar.get_constraint_name(con_id oid) RETURNS text AS $$/*
Return the UNQUOTED constraint name of the corresponding constraint oid.

Args:
  con_id: The OID of the constraint.
*/
BEGIN
  RETURN conname::text FROM pg_catalog.pg_constraint WHERE pg_constraint.oid = con_id;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.get_schema_objects_table(sch_ids regnamespace[])
RETURNS TABLE (obj_id oid, obj_schema text, obj_name text, obj_kind text) AS $$ /*
Return a table with information about most objects in the given schemas.
*/
WITH obj_cte AS (
  (
    SELECT
      oid AS obj_id,
      msar.get_schema_name(pronamespace) AS obj_schema,
      proname AS obj_name,
      CASE prokind
        WHEN 'a' THEN 'AGGREGATE'
        WHEN 'p' THEN 'PROCEDURE'
        ELSE 'FUNCTION'
      END AS obj_kind
    FROM pg_catalog.pg_proc
    WHERE pronamespace=ANY(sch_ids)
  ) UNION (
    SELECT
      oid AS obj_id,
      msar.get_schema_name(typnamespace) AS obj_schema,
      typname AS obj_name,
      'TYPE' AS obj_kind
    FROM pg_catalog.pg_type
    WHERE typnamespace=ANY(sch_ids)
  ) UNION (
    SELECT
      oid AS obj_id,
      msar.get_schema_name(relnamespace) AS obj_schema,
      relname AS obj_name,
      CASE relkind
        WHEN 'r' THEN 'TABLE'
        WHEN 'p' THEN 'TABLE'
        WHEN 'i' THEN 'INDEX'
        WHEN 'I' THEN 'INDEX'
        WHEN 'S' THEN 'SEQUENCE'
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED VIEW'
        WHEN 'c' THEN 'TYPE'
        WHEN 'f' THEN 'FOREIGN TABLE'
      END AS obj_kind
    FROM pg_catalog.pg_class
    WHERE relnamespace=ANY(sch_ids)
  )
) SELECT DISTINCT obj_id, obj_schema, obj_name, obj_kind FROM obj_cte WHERE obj_kind IS NOT NULL;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.get_pk_column(rel_id oid) RETURNS smallint AS $$/*
Return the first column attnum in the primary key of a given relation (e.g., table).

TODO: resolve potential code duplication between this function and `get_selectable_pkey_attnum`.

Args:
  rel_id: The OID of the relation.
*/
SELECT CASE WHEN array_length(conkey, 1) = 1 THEN conkey[1] END
FROM pg_catalog.pg_constraint
WHERE contype='p'
AND conrelid=rel_id;
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.get_column_type(rel_id oid, col_id smallint) RETURNS text AS $$/*
Return the type of a given column in a relation.

Args:
  rel_id: The OID of the relation.
  col_id: The attnum of the column in the relation.
*/
SELECT atttypid::regtype
FROM pg_catalog.pg_attribute
WHERE attnum = col_id
AND attrelid = rel_id;
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.get_interval_fields(typ_mod integer) RETURNS text AS $$/*
Return the string giving the fields for an interval typmod integer.

This logic is ported from the relevant PostgreSQL source code, reimplemented in SQL. See the
`intervaltypmodout` function at
https://doxygen.postgresql.org/backend_2utils_2adt_2timestamp_8c.html

Args:
  typ_mod: The atttypmod from the pg_attribute table. Should be valid for the interval type.
*/
SELECT CASE (typ_mod >> 16 & 32767)
  WHEN 1 << 2 THEN 'year'
  WHEN 1 << 1 THEN 'month'
  WHEN 1 << 3 THEN 'day'
  WHEN 1 << 10 THEN 'hour'
  WHEN 1 << 11 THEN 'minute'
  WHEN 1 << 12 THEN 'second'
  WHEN (1 << 2) | (1 << 1) THEN 'year to month'
  WHEN (1 << 3) | (1 << 10) THEN 'day to hour'
  WHEN (1 << 3) | (1 << 10) | (1 << 11) THEN 'day to minute'
  WHEN (1 << 3) | (1 << 10) | (1 << 11) | (1 << 12) THEN 'day to second'
  WHEN (1 << 10) | (1 << 11) THEN 'hour to minute'
  WHEN (1 << 10) | (1 << 11) | (1 << 12) THEN 'hour to second'
  WHEN (1 << 11) | (1 << 12) THEN 'minute to second'
END;
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.get_type_options(typ_id regtype, typ_mod integer, typ_ndims integer) RETURNS jsonb AS $$/*
Return the type options calculated from a type, typmod pair.

This function uses a number of hard-coded constants. The form of the returned object is determined
by the input type, but the keys will be a subset of:
  precision: the precision of a numeric or interval type. See PostgreSQL docs for details.
  scale: the scale of a numeric type
  fields: See PostgreSQL documentation of the `interval` type.
  length: Applies to "text" types where the user can specify the length.
  item_type: Gives the type of array members for array-types.
  original_type: The actual PostgreSQL type name for enum types.
  enum_values: An ordered list of valid enum labels for enum types.

Args:
  typ_id: an OID or valid type representing string will work here.
  typ_mod: The integer corresponding to the type options; see pg_attribute catalog table.
  typ_ndims: Used to determine whether the type is actually an array without an extra join.
*/
SELECT nullif(
  CASE
    WHEN typ_id = ANY('{numeric, _numeric}'::regtype[]) THEN
      jsonb_build_object(
        -- This calculation is modified from the relevant PostgreSQL source code. See the function
        -- numeric_typmod_precision(int32) at
        -- https://doxygen.postgresql.org/backend_2utils_2adt_2numeric_8c.html
        'precision', ((nullif(typ_mod, -1) - 4) >> 16) & 65535,
        -- This calculation is from numeric_typmod_scale(int32) at the same location
        'scale', (((nullif(typ_mod, -1) - 4) & 2047) # 1024) - 1024
      )
    WHEN typ_id = ANY('{interval, _interval}'::regtype[]) THEN
      jsonb_build_object(
        'precision', nullif(typ_mod & 65535, 65535),
        'fields', msar.get_interval_fields(typ_mod)
      )
    WHEN typ_id = ANY('{bpchar, _bpchar, varchar, _varchar}'::regtype[]) THEN
      -- For char and varchar types, the typemod is equal to 4 more than the set length.
      jsonb_build_object('length', nullif(typ_mod, -1) - 4)
    WHEN typ_id = ANY(
      '{bit, varbit, time, timetz, timestamp, timestamptz}'::regtype[]
      || '{_bit, _varbit, _time, _timetz, _timestamp, _timestamptz}'::regtype[]
    ) THEN
      -- For all these types, the typmod is equal to the precision.
      jsonb_build_object(
        'precision', nullif(typ_mod, -1)
      )
    WHEN (SELECT typtype FROM pg_catalog.pg_type WHERE oid = typ_id) = 'e' THEN
      jsonb_build_object(
        'original_type', typ_id::regtype::text,
        'enum_values',
        (SELECT jsonb_agg(enumlabel ORDER BY enumsortorder)
         FROM pg_catalog.pg_enum WHERE enumtypid = typ_id)
      )
    ELSE jsonb_build_object()
  END
  || CASE
    WHEN typ_ndims>0 THEN
      jsonb_build_object(
        'item_type',
        COALESCE(
          (
            SELECT CASE
              WHEN elem.typtype = 'e' THEN '_enum'
              WHEN elem.typtype = 'c'
                AND elem.typnamespace <> 'mathesar_types'::regnamespace THEN '_composite'
            END
            FROM pg_catalog.pg_type arr
              JOIN pg_catalog.pg_type elem ON elem.oid = arr.typelem
            WHERE arr.oid = typ_id
          ),
          -- This string wrangling is debatably dubious, but avoids a slow join.
          rtrim(typ_id::regtype::text, '[]')
        )
      )
    ELSE '{}'
  END,
  '{}'
)
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.get_composite_fields(typ_id regtype) RETURNS jsonb AS $$/*
Return the fields of the given composite type, in order, with the type of each.

Args:
  typ_id: The type, which gives no fields unless it's a composite one.
*/
SELECT jsonb_agg(
  jsonb_build_object('name', f.attname, 'type', format_type(f.atttypid, f.atttypmod))
  ORDER BY f.attnum
)
FROM pg_catalog.pg_type t
  JOIN pg_catalog.pg_attribute f ON f.attrelid = t.typrelid
WHERE t.oid = typ_id AND t.typtype = 'c' AND f.attnum > 0 AND NOT f.attisdropped;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.has_dependents(rel_id oid, att_id smallint) RETURNS boolean AS $$/*
Return a boolean according to whether the column identified by the given oid, attnum pair is
referenced (i.e., would dropping that column require CASCADE?).

Args:
  rel_id: The relation of the attribute.
  att_id: The attnum of the attribute in the relation.
*/
SELECT EXISTS (
  SELECT 1 FROM pg_catalog.pg_depend WHERE refobjid=rel_id AND refobjsubid=att_id AND deptype='n'
);
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.get_fkey_map_table(tab_id oid)
  RETURNS TABLE (target_oid oid, conkey smallint, confkey smallint)
AS $$/*
Generate a table mapping foreign key values from refererrer to referent tables.

Given an input table (identified by OID), we return a table with each row representing a foreign key
constraint on that table. We return only single-column foreign keys, and only one per foreign key
column.

Args:
  tab_id: The OID of the table containing the foreign key columns to map.
*/
SELECT DISTINCT ON (conkey) pgc.confrelid AS target_oid, x.conkey AS conkey, y.confkey AS confkey
FROM pg_catalog.pg_constraint pgc, LATERAL unnest(conkey) x(conkey), LATERAL unnest(confkey) y(confkey)
WHERE
  pgc.conrelid = tab_id
  AND pgc.contype='f'
  AND cardinality(pgc.confkey) = 1
  AND has_column_privilege(tab_id, x.conkey, 'SELECT')
  AND has_column_privilege(pgc.confrelid, y.confkey, 'SELECT')
ORDER BY conkey, target_oid, confkey;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.list_column_privileges_for_current_role(tab_id regclass, attnum smallint) RETURNS jsonb AS $$/*
Return a JSONB array of all privileges current_user holds on the passed table.
*/
SELECT coalesce(jsonb_agg(privilege), '[]'::jsonb)
FROM
  unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) AS x(privilege),
  pg_catalog.has_column_privilege(tab_id, attnum, privilege) as has_privilege
WHERE has_privilege;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.describe_column_default(tab_id regclass, col_id smallint) RETURNS jsonb AS $$/*
Return a JSONB object describing the default (if any) of the given column in the given table.

The returned JSON will have the form:
  {
    "value": <any>,
    "is_dynamic": <bool>,
  }

If the default is possibly dynamic, i.e., if "is_dynamic" is true, then "value" will be a text SQL
expression that generates the default value if evaluated. If it is not dynamic, then "value" is the
actual default value.
*/
DECLARE
  def_expr text;
  def_json jsonb;
BEGIN
def_expr = CASE
  WHEN attidentity='' THEN pg_catalog.pg_get_expr(adbin, tab_id)
  ELSE 'identity'
END
FROM pg_catalog.pg_attribute LEFT JOIN pg_catalog.pg_attrdef ON attrelid=adrelid AND attnum=adnum
WHERE attrelid=tab_id AND attnum=col_id;
IF def_expr IS NULL THEN
  RETURN NULL;
ELSIF msar.is_default_possibly_dynamic(tab_id, col_id) THEN
  EXECUTE format(
    'SELECT jsonb_build_object(''value'', %L, ''is_dynamic'', true)', def_expr
  ) INTO def_json;
ELSE
  EXECUTE format(
    'SELECT jsonb_build_object(''value'', msar.format_data(%s), ''is_dynamic'', false)', def_expr
  ) INTO def_json;
END IF;
RETURN def_json;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION mathesar_types.current_mathesar_user() RETURNS uuid AS $$/*
Return the UUID of the Mathesar user on whose behalf the current transaction runs, or NULL if it
doesn't run on behalf of one (it doesn't come from Mathesar, or comes from an anonymous form).

Mathesar puts the UUID in the transaction-local 'mathesar.user' setting. "Created By" columns have
this as their default, and mathesar_types.stamp_updated_at keeps "Updated By" columns at it.

This lives in mathesar_types rather than msar since column defaults depend on it: reinstalling
Mathesar's SQL drops and recreates the msar functions, but keeps this one.
*/
SELECT NULLIF(current_setting('mathesar.user', true), '')::uuid;
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION mathesar_types.stamp_updated_at() RETURNS trigger AS $$/*
Keep an "Updated At" column at the time its record was last changed, or an "Updated By" column (one
of type uuid) at the Mathesar user who last changed it (see mathesar_types.current_mathesar_user).

For a BEFORE INSERT OR UPDATE row trigger whose argument is the attnum of the column (see
msar.set_updated_at_column), the attnum rather than the name so that renaming the column doesn't
break it. On insert, the column is set to the current time (or user). On update, it's set to the
current time (or user) if the value of any other column changed, and otherwise kept as it was. It's
also kept as it was while the 'mathesar.keep_updated_at' setting is 'on', which Mathesar's own
structural changes (e.g., extracting columns into a new table) use. Values written to the column
itself are always replaced.

This lives in mathesar_types rather than msar since triggers depend on it: reinstalling Mathesar's
SQL drops and recreates the msar functions, but keeps this one.
*/
DECLARE
  col_name text;
  col_type regtype;
BEGIN
  SELECT attname, atttypid INTO col_name, col_type FROM pg_catalog.pg_attribute
  WHERE attrelid = TG_RELID AND attnum = TG_ARGV[0]::smallint AND NOT attisdropped;
  IF col_name IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND (
    current_setting('mathesar.keep_updated_at', true) = 'on'
    -- Comparing as JSON works for every type, even those without an equality operator.
    OR to_jsonb(NEW) - col_name = to_jsonb(OLD) - col_name
  ) THEN
    RETURN jsonb_populate_record(NEW, jsonb_build_object(col_name, to_jsonb(OLD) -> col_name));
  END IF;
  RETURN jsonb_populate_record(NEW, jsonb_build_object(col_name, CASE
    WHEN col_type = 'uuid'::regtype THEN to_jsonb(mathesar_types.current_mathesar_user())
    ELSE to_jsonb(now())
  END));
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.get_updated_at_triggers(tab_id regclass, col_id smallint) RETURNS SETOF name AS $$/*
Return the names of the (enabled) triggers keeping the given column at the time its record was last
changed, i.e., running mathesar_types.stamp_updated_at for it.

Args:
  tab_id: The OID of the table containing the column.
  col_id: The attnum of the column.
*/
SELECT tgname FROM pg_catalog.pg_trigger
WHERE
  tgrelid = tab_id
  AND tgfoid = 'mathesar_types.stamp_updated_at()'::regprocedure
  AND tgenabled <> 'D'
  AND tgargs = (col_id::text || '\000')::bytea;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.set_updated_at_column(tab_id regclass, col_id smallint, updated_at boolean) RETURNS void AS $$/*
Make the given column an "Updated At" column (or, if it's of type uuid, an "Updated By" column), or
stop it being one.

An "Updated At" column is kept at the time its record was last changed by a trigger, and an "Updated
By" column at the Mathesar user who last changed it; see mathesar_types.stamp_updated_at. Existing
values are left as they are.

Args:
  tab_id: The OID of the table containing the column.
  col_id: The attnum of the column.
  updated_at: Whether the column should be an "Updated At" column.
*/
DECLARE
  trigger_name name;
BEGIN
  FOR trigger_name IN SELECT msar.get_updated_at_triggers(tab_id, col_id) LOOP
    EXECUTE format(
      'DROP TRIGGER %I ON %I.%I',
      trigger_name,
      msar.get_relation_schema_name(tab_id),
      msar.get_relation_name(tab_id)
    );
  END LOOP;
  IF updated_at THEN
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I.%I'
      ' FOR EACH ROW EXECUTE FUNCTION mathesar_types.stamp_updated_at(%L)',
      'mathesar_updated_at_' || col_id,
      msar.get_relation_schema_name(tab_id),
      msar.get_relation_name(tab_id),
      col_id
    );
  END IF;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.get_column_base_type(typ_id regtype, typ_mod integer) RETURNS TABLE (typ regtype, typmod integer)
AS $$/*
Return the type Mathesar treats a column of the given type as: the type itself, or for a domain
(other than Mathesar's own), the type it's defined over, following domains over domains. Also return
the type modifier applying to it: the column's own, or else the one the nearest domain gives.

Args:
  typ_id: The type of the column.
  typ_mod: The type modifier of the column (-1 for none).
*/
WITH RECURSIVE bases(typ, typmod, depth) AS (
  SELECT typ_id::oid, typ_mod, 0
  UNION ALL
  SELECT
    pgt.typbasetype,
    CASE WHEN bases.typmod = -1 THEN pgt.typtypmod ELSE bases.typmod END,
    bases.depth + 1
  FROM bases JOIN pg_catalog.pg_type pgt ON pgt.oid = bases.typ
  WHERE pgt.typtype = 'd' AND pgt.typnamespace <> 'mathesar_types'::regnamespace
)
SELECT typ::regtype, typmod FROM bases ORDER BY depth DESC LIMIT 1;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.column_info_table(tab_id regclass) RETURNS TABLE
(
  id smallint, -- The OID of the column.
  name name, -- Name of the column.
  type text, -- The type of the column for the table.
  type_options jsonb, -- type_options for the column(if any).
  nullable boolean, -- is the column nullable.
  primary_key boolean, -- whether the column has primary key constraint.
  "default" jsonb, -- the default for the column(if any).
  updated_at_trigger boolean, -- whether a trigger keeps the column at its record's update time/user.
  has_dependents boolean, -- is the column referenced by others.
  description text, -- The description of the column on the database.
  current_role_priv jsonb -- Privileges of the current role on the column.
) AS $$
SELECT
  attnum AS id,
  attname AS name,
  CASE WHEN attndims>0 THEN '_array'
    WHEN pgt.typtype = 'e' THEN '_enum'
    WHEN pgt.typtype = 'c' AND pgt.typnamespace <> 'mathesar_types'::regnamespace THEN '_composite'
    ELSE base.typ::text END AS type,
  nullif(
    coalesce(msar.get_type_options(base.typ, base.typmod, attndims), '{}')
    || CASE WHEN base.typ <> atttypid AND attndims = 0 THEN
      jsonb_build_object('domain', atttypid::regtype::text)
    ELSE '{}' END
    || CASE WHEN elem.typtype = 'c' AND elem.typnamespace <> 'mathesar_types'::regnamespace THEN
      -- A column of an array of composites describes the composite its items are
      jsonb_build_object(
        'original_type', elem.oid::regtype::text,
        'composite_fields', msar.get_composite_fields(elem.oid)
      )
    ELSE '{}' END
    || CASE WHEN pgt.typtype = 'c' AND pgt.typnamespace <> 'mathesar_types'::regnamespace THEN
      jsonb_build_object(
        'original_type', base.typ::text,
        'composite_fields', msar.get_composite_fields(base.typ)
      )
    ELSE '{}' END,
    '{}'
  ) AS type_options,
  NOT attnotnull AS nullable,
  COALESCE(pgi.indisprimary, false) AS primary_key,
  msar.describe_column_default(tab_id, attnum) AS default,
  EXISTS (SELECT msar.get_updated_at_triggers(tab_id, attnum)) AS updated_at_trigger,
  msar.has_dependents(tab_id, attnum) AS has_dependents,
  msar.col_description(tab_id, attnum) AS description,
  msar.list_column_privileges_for_current_role(tab_id, attnum) AS current_role_priv
FROM pg_catalog.pg_attribute pga
  LEFT JOIN pg_catalog.pg_index pgi ON pga.attrelid=pgi.indrelid
    AND pga.attnum=ANY(pgi.indkey) AND pgi.indisprimary
  CROSS JOIN LATERAL msar.get_column_base_type(pga.atttypid, pga.atttypmod) AS base
  LEFT JOIN pg_catalog.pg_type pgt ON base.typ=pgt.oid
  LEFT JOIN pg_catalog.pg_type elem ON pgt.typelem=elem.oid AND pga.attndims>0
WHERE pga.attrelid=tab_id AND pga.attnum > 0 and NOT attisdropped;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.get_column_info(tab_id regclass) RETURNS jsonb AS $$/*
Given a table identifier, return an array of objects describing the columns of the table.

Each returned JSON object in the array will have the form:
  {
    "id": <int>,
    "name": <str>,
    "type": <str>,
    "type_options": <obj>,
    "nullable": <bool>,
    "primary_key": <bool>,
    "default": {"value": <str>, "is_dynamic": <bool>},
    "updated_at_trigger": <bool>,
    "has_dependents": <bool>,
    "description": <str>,
    "current_role_priv": [<str>, <str>, ...]
  }

The `type_options` object is described in the docstring of `msar.get_type_options`. The `default`
object has the keys:
  value: A string giving the value (as an SQL expression) of the default.
  is_dynamic: A boolean giving whether the default is (likely to be) dynamic.
`updated_at_trigger` gives whether a trigger keeps the column at the time its record was last
changed (or, for a uuid column, at the Mathesar user who last changed it); see
msar.set_updated_at_column.
*/
SELECT coalesce(jsonb_agg(column_data ORDER BY column_data.id ASC), '[]'::jsonb)
FROM msar.column_info_table(tab_id) AS column_data;
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.list_table_privileges_for_current_role(tab_id regclass) RETURNS jsonb AS $$/*
Return a JSONB array of all privileges current_user holds on the passed table.
*/
SELECT coalesce(jsonb_agg(privilege), '[]'::jsonb)
FROM
  unnest(
    ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
  ) AS x(privilege),
  pg_catalog.has_table_privilege(tab_id, privilege) as has_privilege
WHERE has_privilege;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.table_info_table() RETURNS TABLE
(
  oid bigint, -- The OID of the table.
  name name, -- Name of the table.
  schema bigint, -- The OID of the schema for the table.
  description text, -- The description of the table on the database.
  owner_oid bigint, -- The owner of the table.
  current_role_priv jsonb, -- Privileges of the current role on the table.
  current_role_owns boolean, -- Whether the current role owns the table.
  type text -- The type of the object: 'table', 'view', or 'materialized_view'.
) AS $$
SELECT
  oid::bigint AS oid,
  relname AS name,
  relnamespace::bigint AS schema,
  msar.obj_description(oid, 'pg_class') AS description,
  relowner::bigint AS owner_oid,
  msar.list_table_privileges_for_current_role(oid) AS current_role_priv,
  pg_catalog.pg_has_role(relowner, 'USAGE') AS current_role_owns,
  CASE relkind
    WHEN 'r' THEN 'table'
    WHEN 'v' THEN 'view'
    WHEN 'm' THEN 'materialized_view'
  END::text AS type
FROM pg_catalog.pg_class
WHERE relkind = 'r' OR relkind = 'v' OR relkind = 'm';
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION msar.get_table(tab_id regclass) RETURNS jsonb AS $$/*
Given a table identifier, return a JSON object describing the table.

Each returned JSON object will have the form:
  {
    "oid": <int>,
    "name": <str>,
    "schema": <int>,
    "description": <str>,
    "owner_oid": <int>,
    "current_role_priv": [<str>],
    "current_role_owns": <bool>,
    "type": <str>
  }

The "type" field will be one of: "table", "view", or "materialized_view".

Args:
  tab_id: The OID or name of the table.
*/
SELECT to_jsonb(table_data)
FROM msar.table_info_table() AS table_data
WHERE table_data.oid = tab_id;
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.get_table_info(sch_id regnamespace) RETURNS jsonb AS $$/*
Given a schema identifier, return an array of objects describing the tables of the schema.

Each returned JSON object in the array will have the form:
  {
    "oid": <int>,
    "name": <str>,
    "schema": <int>,
    "description": <str>,
    "owner_oid": <int>,
    "current_role_priv": [<str>],
    "current_role_owns": <bool>,
    "type": <str>
  }

The "type" field will be one of: "table", "view", or "materialized_view".

Args:
  sch_id: The OID or name of the schema.
*/
SELECT coalesce(jsonb_agg(table_data),'[]'::jsonb)
FROM msar.table_info_table() AS table_data
WHERE table_data.schema = sch_id;
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.get_all_table_info() RETURNS jsonb AS $$/*
Return an array of objects describing every table of the database's user-defined schemas, in the
form msar.get_table_info gives them, each with the name of its schema.

The schemas are the ones a user sees: not information_schema, not PostgreSQL's own, and not
Mathesar's, which hold how the database is presented rather than anything it is about.
*/
SELECT coalesce(
  jsonb_agg(to_jsonb(table_data) || jsonb_build_object('schema_name', nsp.nspname)), '[]'::jsonb
)
FROM msar.table_info_table() AS table_data
  JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = table_data.schema
WHERE nsp.nspname <> 'information_schema'
  AND NOT (nsp.nspname = ANY(msar.mathesar_system_schemas()))
  AND nsp.nspname NOT LIKE 'pg_%';
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
msar.list_schema_privileges_for_current_role(sch_id regnamespace) RETURNS jsonb AS $$/*
Return a JSONB array of all privileges current_user holds on the passed schema.
*/
SELECT coalesce(jsonb_agg(privilege), '[]'::jsonb)
FROM
  unnest(
    ARRAY['USAGE', 'CREATE']
  ) AS x(privilege),
  pg_catalog.has_schema_privilege(sch_id, privilege) as has_privilege
WHERE has_privilege;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.get_object_counts() RETURNS jsonb AS $$/*
Return a JSON object with counts of some objects in the database.

We exclude the mathesar-system schemas.

The objects counted are:
- total schemas, excluding Mathesar internal schemas
- total tables in the included schemas
- total rows of tables included
*/
SELECT jsonb_build_object(
  'schema_count', COUNT(DISTINCT pgn.oid),
  'table_count', COUNT(pgc.oid),
  'record_count', SUM(pgc.reltuples)
)
FROM pg_catalog.pg_namespace pgn
LEFT JOIN pg_catalog.pg_class pgc ON pgc.relnamespace = pgn.oid AND pgc.relkind = 'r'
WHERE pgn.nspname <> 'information_schema'
AND NOT (pgn.nspname = ANY(msar.mathesar_system_schemas()))
AND pgn.nspname NOT LIKE 'pg_%';
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION msar.schema_info_table() RETURNS TABLE
(
  oid bigint, -- The OID of the schema.
  name name, -- Name of the role.
  description text, -- The description of the schema on the database.
  owner_oid bigint, -- The owner of the schema.
  current_role_priv jsonb, -- Privileges of the current role on the schema.
  current_role_owns boolean, -- Whether the current role owns the schema.
  table_count integer -- The number of tables in the schema.
) AS $$
SELECT
  s.oid::bigint AS oid,
  s.nspname AS name,
  pg_catalog.obj_description(s.oid) AS description,
  s.nspowner::bigint AS owner_oid,
  msar.list_schema_privileges_for_current_role(s.oid) AS current_role_priv,
  pg_catalog.pg_has_role(s.nspowner, 'USAGE') AS current_role_owns,
  COALESCE(count(c.oid), 0) AS table_count
FROM pg_catalog.pg_namespace s
LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = s.oid AND c.relkind = 'r'
GROUP BY
  s.oid,
  s.nspname,
  s.nspowner
ORDER BY s.nspname;
-- Filter on relkind so that we only count tables. This must be done in the ON clause so that
-- we still get a row for schemas with no tables.
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION msar.list_schema_types(sch_id regnamespace) RETURNS jsonb AS $$/*
Return the enums, composite types, and domains defined in a schema, ordered by name.

Each is described by a JSON object of the form:
  {
    "oid": <int>,
    "name": <str>,
    "kind": "enum" | "composite" | "domain",
    "description": <str or null>,
    "values": [<str>, ...],  -- enums: their labels, in order
    "used_by": [  -- the columns holding its values, or arrays of them
      {"table": <int>, "table_name": <str>, "attnum": <int>, "column_name": <str>}, ...
    ],
    "fields": [{"name": <str>, "type": <str>}, ...],  -- composite types: their fields, in order
    "base_type": <str>,  -- domains: the type they're ultimately defined over, with its modifiers
    "over": <str>,  -- domains: the type they're directly defined over (maybe another domain)
    "not_null": <bool>,  -- domains: whether they disallow NULL
    "default": <str or null>,  -- domains: their default, as an SQL expression
    "constraints": [{"name": <str>, "definition": <str>}, ...]  -- domains: their CHECK constraints
  }
leaving out the keys that don't apply to the kind. The row types of tables, views, etc. aren't
included, nor are arrays of types.

Args:
  sch_id: The OID of the schema.
*/
SELECT coalesce(jsonb_agg(type_info ORDER BY type_info ->> 'name'), '[]'::jsonb)
FROM (
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'oid', t.oid::bigint,
    'name', t.typname,
    'kind', CASE t.typtype WHEN 'e' THEN 'enum' WHEN 'c' THEN 'composite' ELSE 'domain' END,
    'values', CASE WHEN t.typtype = 'e' THEN (
      SELECT jsonb_agg(enumlabel ORDER BY enumsortorder) FROM pg_catalog.pg_enum WHERE enumtypid = t.oid
    ) END,
    'used_by', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'table', att.attrelid::bigint,
          'table_name', cls.relname,
          'attnum', att.attnum,
          'column_name', att.attname
        ) ORDER BY cls.relname, att.attnum
      ), '[]'::jsonb)
      FROM pg_catalog.pg_attribute AS att JOIN pg_catalog.pg_class AS cls ON cls.oid = att.attrelid
      WHERE att.atttypid IN (t.oid, t.typarray) AND att.attnum > 0 AND NOT att.attisdropped
        AND cls.relkind = ANY('{r,p,f}')
    ),
    'fields', CASE WHEN t.typtype = 'c' THEN (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object('name', attname, 'type', format_type(atttypid, atttypmod)) ORDER BY attnum
      ), '[]'::jsonb)
      FROM pg_catalog.pg_attribute WHERE attrelid = t.typrelid AND attnum > 0 AND NOT attisdropped
    ) END,
    'base_type', CASE WHEN t.typtype = 'd' THEN (
      SELECT format_type(base.typ, base.typmod) FROM msar.get_column_base_type(t.oid::regtype, -1) AS base
    ) END,
    'over', CASE WHEN t.typtype = 'd' THEN format_type(t.typbasetype, t.typtypmod) END,
    'not_null', CASE WHEN t.typtype = 'd' THEN t.typnotnull END,
    'constraints', CASE WHEN t.typtype = 'd' THEN (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object('name', conname, 'definition', pg_get_constraintdef(oid)) ORDER BY conname
      ), '[]'::jsonb)
      FROM pg_catalog.pg_constraint WHERE contypid = t.oid AND contype = 'c'
    ) END
  ))
  -- jsonb_strip_nulls would drop a NULL description or default, which do apply
  || jsonb_build_object('description', obj_description(t.oid, 'pg_type'))
  || CASE WHEN t.typtype = 'd' THEN jsonb_build_object('default', t.typdefault) ELSE '{}' END
  AS type_info
  FROM pg_catalog.pg_type t
  LEFT JOIN pg_catalog.pg_class c ON c.oid = t.typrelid
  WHERE t.typnamespace = sch_id
    AND t.typtype IN ('e', 'c', 'd')
    AND (t.typtype <> 'c' OR c.relkind = 'c')
) AS types;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.list_schemas() RETURNS jsonb AS $$/*
Return a json array of objects describing the user-defined schemas in the database.

PostgreSQL system schemas are ignored.

Internal Mathesar-specifc schemas are INCLUDED. These should be filtered out by the caller. This
behavior is to avoid tight coupling between this function and other SQL files that might need to
define additional Mathesar-specific schemas as our codebase grows.

Each returned JSON object in the array will have the form:
  {
    "oid": <int>
    "name": <str>
    "description": <str|null>
    "owner_oid": <int>,
    "current_role_priv": [<str>],
    "current_role_owns": <bool>,
    "table_count": <int>
  }
*/
SELECT jsonb_agg(schema_data)
FROM msar.schema_info_table() AS schema_data
WHERE schema_data.name <> 'information_schema'
AND schema_data.name NOT LIKE 'pg_%';
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION msar.get_schema(sch_id regnamespace) RETURNS jsonb AS $$/*
Return a json object describing the user-defined schema in the database.

Each returned JSON object will have the form:
  {
    "oid": <int>
    "name": <str>
    "description": <str|null>
    "owner_oid": <int>,
    "current_role_priv": [<str>],
    "current_role_owns": <bool>,
    "table_count": <int>
  }
*/
SELECT to_jsonb(schema_data)
FROM msar.schema_info_table() AS schema_data
WHERE schema_data.oid = sch_id;
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION msar.list_schema_privileges(sch_id regnamespace) RETURNS jsonb AS $$/*
Given a schema, returns a json array of objects with direct, non-default schema privileges

Each returned JSON object in the array has the form:
  {
    "role_oid": <int>,
    "direct" [<str>]
  }
*/
WITH priv_cte AS (
  SELECT
    jsonb_build_object(
      'role_oid', pgr.oid::bigint,
      'direct',  jsonb_agg(acl.privilege_type)
    ) AS p
  FROM
    pg_catalog.pg_roles AS pgr,
    pg_catalog.pg_namespace AS pgn,
    aclexplode(COALESCE(pgn.nspacl, acldefault('n', pgn.nspowner))) AS acl
  WHERE pgn.oid = sch_id AND pgr.oid = acl.grantee AND pgr.rolname NOT LIKE 'pg_%'
  GROUP BY pgr.oid, pgn.oid
)
SELECT COALESCE(jsonb_agg(priv_cte.p), '[]'::jsonb) FROM priv_cte;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.role_info_table() RETURNS TABLE
(
  oid bigint, -- The OID of the role.
  name name, -- Name of the role.
  super boolean, -- Whether the role has SUPERUSER status.
  inherits boolean, -- Whether the role has INHERIT attribute.
  create_role boolean, -- Whether the role has CREATEROLE attribute.
  create_db boolean, -- Whether the role has CREATEDB attribute.
  login boolean, -- Whether the role has LOGIN attribute.
  description text, -- A description of the role
  members jsonb -- The member roles that *directly* inherit the role.
) AS $$/*
Returns a table describing all the roles present on the database server.
*/
WITH rolemembers as (
  SELECT
    pgr.oid AS oid,
    jsonb_agg(
      jsonb_build_object(
        'oid', pgm.member::bigint,
        'admin', pgm.admin_option
      )
    ) AS members
    FROM pg_catalog.pg_roles pgr
      INNER JOIN pg_catalog.pg_auth_members pgm ON pgr.oid=pgm.roleid
    GROUP BY pgr.oid
)
SELECT
  r.oid::bigint AS oid,
  r.rolname AS name,
  r.rolsuper AS super,
  r.rolinherit AS inherits,
  r.rolcreaterole AS create_role,
  r.rolcreatedb AS create_db,
  r.rolcanlogin AS login,
  pg_catalog.shobj_description(r.oid, 'pg_authid') AS description,
  rolemembers.members AS members
FROM pg_catalog.pg_roles r
LEFT OUTER JOIN rolemembers ON r.oid = rolemembers.oid;
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION msar.list_roles() RETURNS jsonb AS $$/*
Return a json array of objects with the list of roles in a database server,
excluding pg system roles.

Each returned JSON object in the array has the form:
  {
    "oid": <int>
    "name": <str>
    "super": <bool>
    "inherits": <bool>
    "create_role": <bool>
    "create_db": <bool>
    "login": <bool>
    "description": <str|null>
    "members": <[
        { "oid": <int>, "admin": <bool> }
      ]|null>
  }
*/
SELECT jsonb_agg(role_data)
FROM msar.role_info_table() AS role_data
WHERE role_data.name NOT LIKE 'pg_%';
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION msar.get_role(rolename text) RETURNS jsonb AS $$/*
Given a rolename, return a JSON object describing the role in a database server.

The returned JSON object has the form:
  {
    "oid": <int>
    "name": <str>
    "super": <bool>
    "inherits": <bool>
    "create_role": <bool>
    "create_db": <bool>
    "login": <bool>
    "description": <str|null>
    "members": <[
        { "oid": <int>, "admin": <bool> }
      ]|null>
  }
*/
SELECT to_jsonb(role_data)
FROM msar.role_info_table() AS role_data
WHERE role_data.name = rolename;
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
msar.build_grant_membership_expr(parent_rol_id regrole, g_roles oid[]) RETURNS TEXT AS $$
SELECT string_agg(
  format(
    'GRANT %1$I TO %2$I',
    msar.get_role_name(parent_rol_id),
    msar.get_role_name(rol_id)
  ),
  E';\n'
) || E';\n'
FROM unnest(g_roles) as x(rol_id);
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.build_revoke_membership_expr(parent_rol_id regrole, r_roles oid[]) RETURNS TEXT AS $$
SELECT string_agg(
  format(
    'REVOKE %1$I FROM %2$I',
    msar.get_role_name(parent_rol_id),
    msar.get_role_name(rol_id)
  ),
  E';\n'
) || E';\n'
FROM unnest(r_roles) as x(rol_id);
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.set_members_to_role(parent_rol_id regrole, members oid[]) RETURNS jsonb AS $$/*
Grant/Revoke direct membership to/from roles.

Returns a json object describing the updated information of the parent role.

  {
    "oid": <int>
    "name": <str>
    "super": <bool>
    "inherits": <bool>
    "create_role": <bool>
    "create_db": <bool>
    "login": <bool>
    "description": <str|null>
    "members": <[
        { "oid": <int>, "admin": <bool> }
      ]|null>
  }

Args:
  parent_rol_id: The OID of role whose membership will be granted/revoked to/from other roles.
  members: An array of role OID(s) whom we want to grant direct membership of the parent role.
           Only the OID(s) present in the array will be granted membership of parent role,
           Membership will be revoked for existing members not present in this array.
*/
DECLARE
  parent_role_name text := msar.get_role_name(parent_rol_id);
  parent_role_info jsonb := msar.get_role(parent_role_name);
  all_members_array bigint[];
  revoke_members_array bigint[];
  set_members_expr text;
BEGIN
  -- Get all the members of parent_role.
  SELECT array_agg(x.oid)
    FROM jsonb_to_recordset(
      CASE WHEN parent_role_info ->> 'members' IS NOT NULL
      THEN parent_role_info -> 'members'
      ELSE NULL END
    ) AS x(oid oid, admin boolean)
  INTO all_members_array;
  -- Find all the roles whose membership we want to revoke.
  SELECT ARRAY(
    SELECT unnest(all_members_array)
    EXCEPT
    SELECT unnest(members)
  ) INTO revoke_members_array;
  -- REVOKE/GRANT membership for parent_role.
  set_members_expr := concat_ws(
    E'\n',
    msar.build_revoke_membership_expr(parent_rol_id, revoke_members_array),
    msar.build_grant_membership_expr(parent_rol_id, members)
  );
  EXECUTE set_members_expr;
  -- Return the updated parent_role info including membership details.
  RETURN msar.get_role(parent_role_name);
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.get_current_role() RETURNS jsonb AS $$/*
Returns a JSON object describing the current_role and the parent role(s) whose
privileges are immediately available to current_role without doing SET ROLE.
*/
SELECT jsonb_build_object(
  'current_role', msar.get_role(current_role),
  'parent_roles', COALESCE(array_remove(
    array_agg(
      CASE WHEN pg_catalog.pg_has_role(current_role, role_data.name, 'USAGE')
      THEN msar.get_role(role_data.name) END
    ), NULL
  ), ARRAY[]::jsonb[])
)
FROM msar.role_info_table() AS role_data
WHERE role_data.name NOT LIKE 'pg_%'
AND role_data.name != current_role;
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION msar.list_db_priv() RETURNS jsonb AS $$/*
Given a database name, returns a json array of objects with database privileges for non-inherited roles.

Each returned JSON object in the array has the form:
  {
    "role_oid": <int>,
    "direct" [<str>]
  }
*/
WITH priv_cte AS (
  SELECT
    jsonb_build_object(
      'role_oid', pgr.oid::bigint,
      'direct',  jsonb_agg(acl.privilege_type)
    ) AS p
  FROM
    pg_catalog.pg_roles AS pgr,
    pg_catalog.pg_database AS pgd,
    aclexplode(COALESCE(pgd.datacl, acldefault('d', pgd.datdba))) AS acl
  WHERE pgd.datname = pg_catalog.current_database()
    AND pgr.oid = acl.grantee AND pgr.rolname NOT LIKE 'pg_%'
  GROUP BY pgr.oid, pgd.oid
)
SELECT COALESCE(jsonb_agg(priv_cte.p), '[]'::jsonb) FROM priv_cte;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.list_database_privileges_for_current_role(dat_id oid) RETURNS jsonb AS $$/*
Return a JSONB array of all privileges current_user holds on the passed database.
*/
SELECT coalesce(jsonb_agg(privilege), '[]'::jsonb)
FROM
  unnest(
    ARRAY['CONNECT', 'CREATE', 'TEMPORARY']
  ) AS x(privilege),
  pg_catalog.has_database_privilege(dat_id, privilege) as has_privilege
WHERE has_privilege;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.get_current_database_info() RETURNS jsonb AS $$/*
Return information about the current database.

The returned JSON object has the form:
  {
    "oid": <bigint>,
    "name": <str>,
    "owner_oid": <bigint>,
    "current_role_priv": [<str>],
    "current_role_owner": <bool>
  }
*/
SELECT jsonb_build_object(
  'oid', pgd.oid::bigint,
  'name', pgd.datname,
  'owner_oid', pgd.datdba::bigint,
  'current_role_priv', msar.list_database_privileges_for_current_role(pgd.oid),
  'current_role_owns', pg_catalog.pg_has_role(pgd.datdba, 'USAGE')
) FROM pg_catalog.pg_database AS pgd
WHERE pgd.datname = pg_catalog.current_database();
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.list_table_privileges(tab_id regclass) RETURNS jsonb AS $$/*
Given a table, returns a json array of objects with direct, non-default table privileges.

Each returned JSON object in the array has the form:
  {
    "role_oid": <int>,
    "direct" [<str>]
  }
*/
WITH priv_cte AS (
  SELECT
    jsonb_build_object(
      'role_oid', pgr.oid::bigint,
      'direct',  jsonb_agg(acl.privilege_type)
    ) AS p
  FROM
    pg_catalog.pg_roles AS pgr,
    pg_catalog.pg_class AS pgc,
    aclexplode(COALESCE(pgc.relacl, acldefault('r', pgc.relowner))) AS acl
  WHERE pgc.oid = tab_id AND pgr.oid = acl.grantee AND pgr.rolname NOT LIKE 'pg_%'
  GROUP BY pgr.oid, pgc.oid
)
SELECT COALESCE(jsonb_agg(priv_cte.p), '[]'::jsonb) FROM priv_cte;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- ROLE MANIPULATION FUNCTIONS
--
-- Functions in this section should always involve creating, granting, or revoking privileges or
-- roles
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------


CREATE OR REPLACE FUNCTION
msar.create_role(rolename text, password_ text, login_ boolean) RETURNS jsonb AS $$/*
Creates a login/non-login role, depending on whether the login_ flag is set.
Only the rolename field is required, the password field is required only if login_ is set to true.

Returns a JSON object describing the created role in the form:
  {
    "oid": <int>
    "name": <str>
    "super": <bool>
    "inherits": <bool>
    "create_role": <bool>
    "create_db": <bool>
    "login": <bool>
    "description": <str|null>
    "members": <[
        { "oid": <int>, "admin": <bool> }
      ]|null>
  }

Args:
  rolename: The name of the role to be created, unquoted.
  password_: The password for the rolename to set, unquoted.
  login_: Specify whether the role to be created could login.
*/
BEGIN
  CASE WHEN login_ THEN
    EXECUTE format('CREATE USER %I WITH PASSWORD %L', rolename, password_);
  ELSE
    EXECUTE format('CREATE ROLE %I', rolename);
  END CASE;
  RETURN msar.get_role(rolename);
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.drop_role(rol_id regrole) RETURNS void AS $$/*
Drop a role.

Note:
- To drop a superuser role, you must be a superuser yourself.
- To drop non-superuser roles, you must have CREATEROLE privilege and have been granted ADMIN OPTION on the role.

Args:
  rol_id: The OID of the role to drop on the database.
*/
BEGIN
  EXECUTE format('DROP ROLE %I', msar.get_role_name(rol_id));
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.build_database_privilege_replace_expr(rol_id regrole, privileges_ jsonb) RETURNS TEXT AS $$
SELECT string_agg(
  format(
    concat(
      CASE WHEN privileges_ ? val THEN 'GRANT' ELSE 'REVOKE' END,
      ' %1$s ON DATABASE %2$I ',
      CASE WHEN privileges_ ? val THEN 'TO' ELSE 'FROM' END,
      ' %3$I'
    ),
    val,
    pg_catalog.current_database(),
    msar.get_role_name(rol_id)
  ),
  E';\n'
) || E';\n'
FROM unnest(ARRAY['CONNECT', 'CREATE', 'TEMPORARY']) as x(val);
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.replace_database_privileges_for_roles(priv_spec jsonb) RETURNS jsonb AS $$/*
Grant/Revoke privileges for a set of roles on the current database.

Args:
  priv_spec: An array defining the privileges to grant or revoke for each role.

Each object in the priv_spec should have the form:
{role_oid: <int>, privileges: SET<"CONNECT"|"CREATE"|"TEMPORARY">}

Any privilege that exists in the privileges subarray will be granted. Any which is missing will be
revoked.
*/
BEGIN
EXECUTE string_agg(
  msar.build_database_privilege_replace_expr(role_oid, direct),
  E';\n'
) || ';'
FROM jsonb_to_recordset(priv_spec) AS x(role_oid regrole, direct jsonb);
RETURN msar.list_db_priv();
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.build_schema_privilege_replace_expr(sch_id regnamespace, rol_id regrole, privileges_ jsonb)
  RETURNS TEXT AS $$
SELECT string_agg(
  format(
    concat(
      CASE WHEN privileges_ ? val THEN 'GRANT' ELSE 'REVOKE' END,
      ' %1$s ON SCHEMA %2$I ',
      CASE WHEN privileges_ ? val THEN 'TO' ELSE 'FROM' END,
      ' %3$I'
    ),
    val,
    msar.get_schema_name(sch_id),
    msar.get_role_name(rol_id)
  ),
  E';\n'
) || E';\n'
FROM unnest(ARRAY['USAGE', 'CREATE']) as x(val);
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.replace_schema_privileges_for_roles(sch_id regnamespace, priv_spec jsonb) RETURNS jsonb AS $$/*
Grant/Revoke privileges for a set of roles on the given schema.

Args:
  sch_id The OID of the schema for which we're setting privileges for roles.
  priv_spec: An array defining the privileges to grant or revoke for each role.

Each object in the priv_spec should have the form:
{role_oid: <int>, privileges: SET<"USAGE"|"CREATE">}

Any privilege that exists in the privileges subarray will be granted. Any which is missing will be
revoked.
*/
BEGIN
EXECUTE string_agg(
  msar.build_schema_privilege_replace_expr(sch_id, role_oid, direct),
  E';\n'
) || ';'
FROM jsonb_to_recordset(priv_spec) AS x(role_oid regrole, direct jsonb);
RETURN msar.list_schema_privileges(sch_id);
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.build_table_privilege_replace_expr(tab_id regclass, rol_id regrole, privileges_ jsonb)
  RETURNS TEXT AS $$
SELECT string_agg(
  format(
    concat(
      CASE WHEN privileges_ ? val THEN 'GRANT' ELSE 'REVOKE' END,
      ' %1$s ON TABLE %2$I.%3$I ',
      CASE WHEN privileges_ ? val THEN 'TO' ELSE 'FROM' END,
      ' %4$I'
    ),
    val,
    msar.get_relation_schema_name(tab_id),
    msar.get_relation_name(tab_id),
    msar.get_role_name(rol_id)
  ),
  E';\n'
) || E';\n'
FROM unnest(ARRAY['INSERT', 'SELECT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as x(val);
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.replace_table_privileges_for_roles(tab_id regclass, priv_spec jsonb) RETURNS jsonb AS $$/*
Grant/Revoke privileges for a set of roles on the given table.

Args:
  tab_id The OID of the table for which we're setting privileges for roles.
  priv_spec: An array defining the privileges to grant or revoke for each role.

Each object in the priv_spec should have the form:
{role_oid: <int>, privileges: SET<"INSERT"|"SELECT"|"UPDATE"|"DELETE"|"TRUNCATE"|"REFERENCES"|"TRIGGER">}

Any privilege that exists in the privileges subarray will be granted. Any which is missing will be
revoked.
*/
BEGIN
EXECUTE string_agg(
  msar.build_table_privilege_replace_expr(tab_id, role_oid, direct),
  E';\n'
) || ';'
FROM jsonb_to_recordset(priv_spec) AS x(role_oid regrole, direct jsonb);
RETURN msar.list_table_privileges(tab_id);
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.transfer_database_ownership(new_owner_oid regrole) RETURNS jsonb AS $$/*
Transfers ownership of the current database to a new owner.

Args:
  new_owner_oid: The OID of the role whom we want to be the new owner of the current database.

NOTE: To successfully transfer ownership of a database to a new owner the current user must:
  - Be a Superuser/Owner of the current database.
  - Be a `MEMBER` of the new owning role. i.e. The current role should be able to `SET ROLE`
    to the new owning role.
  - Have `CREATEDB` privilege.
*/
BEGIN
  EXECUTE format(
    'ALTER DATABASE %I OWNER TO %I',
    pg_catalog.current_database(),
    msar.get_role_name(new_owner_oid)
  );
  RETURN msar.get_current_database_info();
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.transfer_schema_ownership(sch_id regnamespace, new_owner_oid regrole) RETURNS jsonb AS $$/*
Transfers ownership of a given schema to a new owner.

Args:
  sch_id: The OID of the schema to transfer.
  new_owner_oid: The OID of the role whom we want to be the new owner of the schema.

NOTE: To successfully transfer ownership of a schema to a new owner the current user must:
  - Be a Superuser/Owner of the schema.
  - Be a `MEMBER` of the new owning role. i.e. The current role should be able to `SET ROLE`
    to the new owning role.
  - Have `CREATE` privilege for the database.
*/
BEGIN
  EXECUTE format(
    'ALTER SCHEMA %I OWNER TO %I',
    msar.get_schema_name(sch_id),
    msar.get_role_name(new_owner_oid)
  );
  RETURN msar.get_schema(sch_id);
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.transfer_table_ownership(tab_id regclass, new_owner_oid regrole) RETURNS jsonb AS $$/*
Transfers ownership of a given table to a new owner.

Args:
  tab_id: The OID of the table to transfer.
  new_owner_oid: The OID of the role whom we want to be the new owner of the table.

NOTE: To successfully transfer ownership of a table to a new owner the current user must:
  - Be a Superuser/Owner of the table.
  - Be a `MEMBER` of the new owning role. i.e. The current role should be able to `SET ROLE`
    to the new owning role.
  - Have `CREATE` privilege on the table's schema.
*/
BEGIN
  EXECUTE format(
    'ALTER TABLE %I.%I OWNER TO %I',
    msar.get_relation_schema_name(tab_id),
    msar.get_relation_name(tab_id),
    msar.get_role_name(new_owner_oid)
  );
  RETURN msar.get_table(tab_id);
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- ALTER SCHEMA FUNCTIONS
--
-- Functions in this section should always involve 'ALTER SCHEMA'.
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION msar.rename_schema(sch_id oid, new_sch_name text) RETURNS void AS $$/*
Change a schema's name

Args:
  sch_id: The OID of the schema to rename
  new_sch_name: A new for the schema, UNQUOTED
*/
DECLARE
  old_sch_name text := msar.get_schema_name(sch_id);
BEGIN
  IF old_sch_name = new_sch_name THEN
    -- Return early if the names are the same. This avoids an error from Postgres.
    RETURN;
  END IF;
  EXECUTE format('ALTER SCHEMA %I RENAME TO %I', old_sch_name, new_sch_name);
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.set_schema_description(
  sch_id oid,
  description text
) RETURNS void AS $$/*
Set the PostgreSQL description (aka COMMENT) of a schema.

Descriptions are removed by passing an empty string or NULL.

Args:
  sch_id: The OID of the schema.
  description: The new description, UNQUOTED
*/
BEGIN
  EXECUTE format('COMMENT ON SCHEMA %I IS %L', msar.get_schema_name(sch_id), description);
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION msar.patch_schema(sch_id oid, patch jsonb) RETURNS jsonb AS $$/*
Modify a schema according to the given patch.

Args:
  sch_id: The OID of the schema.
  patch: A JSONB object with the following keys:
    - name: (optional) The new name of the schema
    - description: (optional) The new description of the schema. To remove a description, pass an
      empty string or NULL.

Returns:
  A json object describing the user-defined schema in the database.
*/
BEGIN
  PERFORM msar.rename_schema(sch_id, patch->>'name');
  PERFORM CASE WHEN patch ? 'description'
  THEN msar.set_schema_description(sch_id, patch->>'description') END;
  RETURN msar.get_schema(sch_id);
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- CREATE SCHEMA FUNCTIONS
--
-- Create a schema.
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------


CREATE OR REPLACE FUNCTION msar.create_schema(
  sch_name text,
  own_id regrole,
  description text DEFAULT ''
) RETURNS jsonb AS $$/*
Create a schema, possibly with a description.

If a schema with the given name already exists, an exception will be raised.

Args:
  sch_name: The name of the schema to be created, UNQUOTED.
  own_id:      (optional) The OID of the role who will own the new schema.
  description: (optional) A description for the schema, UNQUOTED.

Returns:
  A json object describing the user-defined schema in the database.

Note:
  - This function does not support IF NOT EXISTS because it's simpler that way. I originally tried
    to support descriptions and if_not_exists in the same function, but as I discovered more edge cases
    and inconsistencies, it got too complex, and I didn't think we'd have a good enough use case for it.
  - If own_id is NULL, the current role will be the owner of the new schema.
*/
DECLARE schema_oid oid;
BEGIN
  EXECUTE 'CREATE SCHEMA ' || quote_ident(sch_name);
  schema_oid := msar.get_schema_oid(sch_name);
  PERFORM msar.set_schema_description(schema_oid, description);
  IF own_id IS NOT NULL THEN
    PERFORM msar.transfer_schema_ownership(schema_oid, own_id);
  END IF;
  RETURN msar.get_schema(schema_oid);
END;
$$ LANGUAGE plpgsql;


----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- DROP DATABASE FUNCTIONS
--
-- Drop a database.
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------


CREATE OR REPLACE FUNCTION
msar.drop_database_query(dat_id oid) RETURNS text AS $$/*
Return the SQL query to drop a database.

If no database exists with the given oid, an exception will be raised.

Args:
  dat_id: The OID of the role to drop.
*/
BEGIN
  RETURN format('DROP DATABASE %I', msar.get_database_name(dat_id));
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- DROP SCHEMA FUNCTIONS
--
-- Drop a schema.
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------


CREATE OR REPLACE FUNCTION
msar.drop_schemas(sch_ids regnamespace[]) RETURNS void AS $$/*
Safely drop all objects in each schema, then the schemas themselves.

Does not work on the msar schema.

If any passed schema doesn't exist, an exception will be raised. If any object exists in a schema
which isn't passed, but which depends on an object in a passed schema, an exception will be raised.

Args:
  sch_ids: The OIDs of the schemas to drop.
*/
DECLARE
  obj RECORD;
  message text;
  detail text;
  sch regnamespace;
  sch_name text;
  undropped_objects text[];
  drop_success boolean := false;
  drop_failed boolean := false;
BEGIN
  SET client_min_messages = WARNING;
  FOR obj IN
    SELECT obj_id, obj_schema, obj_name, obj_kind
    FROM msar.get_schema_objects_table(sch_ids)
    ORDER BY obj_id DESC  -- Objects more often depend on others of lower OID.
  LOOP
    BEGIN
      EXECUTE format('DROP %s IF EXISTS %I.%I', obj.obj_kind, obj.obj_schema, obj.obj_name);
      drop_success = true;
    EXCEPTION
      WHEN dependent_objects_still_exist THEN
        GET STACKED DIAGNOSTICS
          message = MESSAGE_TEXT,
          detail = PG_EXCEPTION_DETAIL;
        undropped_objects = undropped_objects || message;
        IF detail <> '' THEN
           undropped_objects = undropped_objects || concat('    ', detail);
        END IF;
      drop_failed =  true;
    END;
  END LOOP;
  SET client_min_messages = NOTICE;
  IF drop_failed IS false THEN
    -- We dropped every object that existed in the schemas.
    RAISE NOTICE E'All objects dropped successfully!\n\nDropping schemas...\n\n';
    FOREACH sch IN ARRAY sch_ids
      LOOP
        sch_name = msar.get_schema_name(sch);
        RAISE NOTICE 'Dropping Schema %', sch_name;
        EXECUTE(format('DROP SCHEMA IF EXISTS %I', sch_name));
      END LOOP;
  ELSIF drop_success IS false THEN
    -- We failed to drop anything in the schemas (and failed to drop at least one object).
    RAISE EXCEPTION USING
      MESSAGE = 'Nothing was dropped in this call due to dependent objects.',
      DETAIL = array_to_string(array_remove(undropped_objects, ''), E'\n         '),
      HINT = 'All changes will be reverted.',
      ERRCODE = 'dependent_objects_still_exist';
  ELSE
    -- We did drop some objects, but failed to drop at least one (due to dependencies). Recurse.
    PERFORM msar.drop_schemas(sch_ids);
  END IF;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- ALTER TABLE FUNCTIONS
--
-- Functions in this section should always involve 'ALTER TABLE'.
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------


-- Rename table ------------------------------------------------------------------------------------


CREATE OR REPLACE FUNCTION
msar.rename_table(tab_id oid, new_tab_name text) RETURNS void AS $$/*
Change a table's name.

Args:
  tab_id: the OID of the table whose name we want to change
  new_tab_name: unquoted, unqualified table name
*/
DECLARE
  old_tab_name text := msar.get_relation_name(tab_id);
BEGIN
  IF old_tab_name <> new_tab_name THEN
    EXECUTE format(
      'ALTER TABLE %I.%I RENAME TO %I',
      msar.get_relation_schema_name(tab_id),
      old_tab_name,
      new_tab_name
    );
  END IF;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


-- Comment on table --------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION
msar.comment_on_table(tab_id oid, comment_ text) RETURNS VOID AS $$/*
Change the description of a table.

Args:
  tab_id: The OID of the table whose comment we will change.
  comment_: The new comment.
*/
BEGIN
  EXECUTE format(
    'COMMENT ON TABLE %I.%I IS %L',
    msar.get_relation_schema_name(tab_id),
    msar.get_relation_name(tab_id),
    comment_
  );
END;
$$ LANGUAGE plpgsql;


-- Alter table -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION
msar.alter_table(tab_id oid, tab_alters jsonb) RETURNS text AS $$/*
Alter the name, description, or columns of a table, returning name of the altered table.

Args:
  tab_id: The OID of the table whose columns we'll alter.
  tab_alters: a JSONB describing the alterations to make.

  The tab_alters should have the form:
  {
    "name": <str>,
    "description": <str>
    "columns": <col_alters>,
  }
*/
DECLARE
  new_tab_name text;
  col_alters jsonb;
BEGIN
  new_tab_name := tab_alters->>'name';
  col_alters := tab_alters->'columns';
  PERFORM msar.rename_table(tab_id, new_tab_name);
  PERFORM CASE WHEN tab_alters ? 'description'
  THEN msar.comment_on_table(tab_id, tab_alters->>'description') END;
  PERFORM msar.alter_columns(tab_id, col_alters);
  RETURN __msar.get_qualified_relation_name_or_null(tab_id);
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- ALTER TABLE FUNCTIONS: Column operations
--
-- Functions in this section should always involve 'ALTER TABLE', and one or more columns
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------


-- Drop columns from table -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION
msar.drop_columns(tab_id oid, col_ids variadic integer[]) RETURNS void AS $$/*
Drop the given columns from the given table.

Args:
  tab_id: OID of the table whose columns we'll drop.
  col_ids: The attnums of the columns to drop.
*/
BEGIN
  col_ids := array_remove(col_ids, null);
  IF array_length(col_ids, 1) IS NOT NULL THEN
    -- Triggers survive dropping their column, so drop any keeping it at its record's update time.
    PERFORM msar.set_updated_at_column(tab_id, col_id::smallint, false)
    FROM unnest(col_ids) AS x(col_id);
    EXECUTE format(
      'ALTER TABLE %I.%I %s',
      msar.get_relation_schema_name(tab_id),
      msar.get_relation_name(tab_id),
      string_agg(format('DROP COLUMN %I', attname), ', ')
    )
    FROM pg_catalog.pg_attribute AS pga INNER JOIN unnest(col_ids) AS x(col) ON pga.attnum=x.col
    WHERE attrelid=tab_id AND NOT attisdropped;
  END IF;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


-- Column creation definition type -----------------------------------------------------------------

CREATE TYPE msar.pkey_kind AS ENUM ('UUIDv4', 'IDENTITY');


CREATE TYPE __msar.col_def AS (
  name_ text, -- The name of the column to create, quoted.
  type_ text, -- The type of the column to create, fully specced with arguments.
  not_null boolean, -- A boolean to describe whether the column is nullable or not.
  default_ text, -- Text SQL giving the default value for the column.
  pkey_type msar.pkey_kind, -- An enum specifing the type of the pkey column.
  description text -- A text that will become a comment for the column
);


CREATE OR REPLACE FUNCTION
msar.build_unique_column_name(tab_id regclass, base text, idx integer) RETURNS text AS $$/*
This function creates a version of the given `base` column name which is unique in a table.

Given an original column name 'abc', the resulting copies will be named 'abc <n>', where <n> is
minimal (at least 1) subject to the restriction that 'abc <n>' is not already a column of the table
given. The given idx is attempted as a suffix to make the column name unique. If the result isn't
unique after all, it's incremented by further calls.

Args:
  tab_id: the table for which we'll generate a column name.
  base: the original column name we'll use to build a unique name.
  idx: an integer to use as a suffix for making the name unique.
*/
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_attribute pga
      WHERE attrelid=tab_id AND attname=concat(base, ' ', idx)
    ) THEN concat(base, ' ', idx)
    ELSE msar.build_unique_column_name(tab_id, base, idx + 1)
  END;
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.build_unique_column_name(tab_id regclass, base text) RETURNS text AS $$ /*
This function creates a version of the given `base` column name which is unique in a table.

Given an original column name 'abc', the resulting copies will be named 'abc <n>', where <n> is
minimal (at least 1) subject to the restriction that 'abc <n>' is not already a column of the table
given.

Args:
  tab_id: the table for which we'll generate a column name.
  base: the original column name we'll use to build a unique name.
*/
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_attribute pga WHERE attrelid=tab_id AND attname=base
    ) THEN base
    ELSE msar.build_unique_column_name(tab_id, base, 1)
  END;
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.build_unique_column_name(tab_id oid, col_id smallint) RETURNS text AS $$/*
This function generates a name to be used for a duplicated column.

Given an original column name 'abc', the resulting copies will be named 'abc <n>', where <n> is
minimal (at least 1) subject to the restriction that 'abc <n>' is not already a column of the table
given.

Args:
  tab_id: the table for which we'll generate a column name.
  col_id: the original column whose name we'll use as the prefix in our copied column name.
*/
  SELECT msar.build_unique_column_name(tab_id, attname)
  FROM pg_catalog.pg_attribute pga
  WHERE attrelid=tab_id AND attnum=col_id;
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.build_unique_fkey_column_name(tab_id oid, fk_col_name text, frel_name text)
  RETURNS text AS $$/*
Create a unique name for a foreign key column.

Args:
  tab_id: The OID of the table where the column name should be unique.
  fk_col_name: The base name for the foreign key column.
  frel_name: The name of the referent table. Used for creating fk_col_name if not given.

Note that frel_name will be used to build the foreign key column name if it's not given. The result
will be of the form: <frel_name>_id. Then, we apply some logic to ensure the result is unique.
*/
BEGIN
  fk_col_name := COALESCE(fk_col_name, format('%s_id', frel_name));
  RETURN msar.build_unique_column_name(tab_id, fk_col_name);
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.get_extracted_col_def_jsonb(tab_id oid, col_ids integer[]) RETURNS jsonb AS $$/*
Get a JSON array of column definitions from given columns for creation of an extracted table.

See the __msar.process_col_def_jsonb for a description of the JSON.

Args:
  tab_id: The OID of the table containing the columns whose definitions we want.
  col_ids: The attnum of the columns whose definitions we want.
*/

SELECT jsonb_agg(
  jsonb_build_object(
    'name', attname,
    'type', jsonb_build_object('id', atttypid, 'modifier', atttypmod),
    'not_null', attnotnull,
    'default',
    -- We only copy non-dynamic default expressions to new table to avoid double-use of sequences.
    -- Sequences are owned by a specific column, and can't be reused without error.
    CASE WHEN NOT msar.is_default_possibly_dynamic(tab_id, col_id) THEN
      pg_catalog.pg_get_expr(adbin, tab_id)
    END
  )
)
FROM pg_catalog.pg_attribute AS pg_columns
  JOIN unnest(col_ids) AS columns_to_copy(col_id)
    ON pg_columns.attnum=columns_to_copy.col_id
  LEFT JOIN pg_catalog.pg_attrdef AS pg_column_defaults
    ON pg_column_defaults.adnum=pg_columns.attnum AND pg_columns.attrelid=pg_column_defaults.adrelid
WHERE pg_columns.attrelid=tab_id AND NOT msar.is_pkey_col(tab_id, col_id);
$$ LANGUAGE sql RETURNS NULL ON NULL INPUT;


-- Add columns to table ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION
__msar.prepare_fields_arg(fields text) RETURNS text AS $$/*
Convert the `fields` argument into an integer for use with the integertypmodin system function.

Args:
  fields: A string corresponding to the documented options from the doumentation at
          https://www.postgresql.org/docs/13/datatype-datetime.html

In order to construct the argument for intervaltypmodin, needed for constructing the typmod value
for INTERVAL types with arguments, we need to apply a transformation to the correct integer. This
transformation is quite arcane, and is lifted straight from the PostgreSQL C code. Given a non-null
fields argument, the steps are:
- Assign each substring of valid `fields` arguments the correct integer (from the Postgres src).
- Apply a bitshift mapping each integer to the according power of 2.
- Sum the results to get an integer signifying the fields argument.
*/
SELECT COALESCE(
  sum(1<<code)::text,
  '32767'  -- 0x7FFF in decimal; This represents no field argument.
)
FROM (
  VALUES
    ('MONTH', 1),
    ('YEAR', 2),
    ('DAY', 3),
    ('HOUR', 10),
    ('MINUTE', 11),
    ('SECOND', 12)
) AS field_map(field, code)
WHERE fields ILIKE '%' || field || '%';
$$ LANGUAGE SQL;


CREATE OR REPLACE FUNCTION __msar.build_typmodin_arg(
  typ_options jsonb, timespan_flag boolean
) RETURNS cstring[] AS $$/*
Build an array to be used as the argument for a typmodin function.

Timespans have to be handled slightly differently since they have a tricky `fields` argument that
requires special processing. See __msar.prepare_fields_arg for more details.

Args:
  typ_options: JSONB giving options fields as per the description in msar.build_type_text.
  timespan_flag: true if the associated type is a timespan, false otherwise.
*/
SELECT array_remove(
  ARRAY[
    typ_options ->> 'length',
    CASE WHEN timespan_flag THEN __msar.prepare_fields_arg(typ_options ->> 'fields') END,
    typ_options ->> 'precision',
    typ_options ->> 'scale'
  ],
  null
)::cstring[]
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
__msar.get_formatted_base_type(typ_name text, typ_options jsonb) RETURNS text AS $$ /*
Build the appropriate type definition string, without Array brackets.

This function uses some PostgreSQL internal functions to do its work. In particular, for any type
that takes options, This function uses the typmodin (read "type modification input") system
functions to convert the given options into a typmod integer. The typ_name given is converted into
the OID of the named type. These two pieces let us call `format_type` to get a canonical string
representation of the definition of the type, with its options.

Args:
  typ_name: This should be qualified and quoted as needed.
  typ_options: These should be in the form described in msar.build_type_text.
*/
DECLARE
  typ_id oid;
  timespan_flag boolean;
  typmodin_func text;
  typmod integer;
BEGIN
  -- Here we just get the OID of the type.
  typ_id := typ_name::regtype::oid;
  -- This is a lookup of the function name for the typmodin function associated with the type, if
  -- one exists.
  typmodin_func := typmodin::text FROM pg_catalog.pg_type WHERE oid=typ_id AND typmodin<>0;
  -- This flag is needed since timespan types need special handling when converting the options into
  -- the form needed to call the typmodin function.
  timespan_flag := typcategory='T' FROM pg_catalog.pg_type WHERE oid=typ_id;
  IF (
    jsonb_typeof(typ_options) = 'null'  -- The caller passed no type options
    OR typ_options IS NULL -- The caller didn't even pass the type options key
    OR typ_options='{}'::jsonb  -- The caller passed an empty type options object
    OR typmodin_func IS NULL  -- The type doesn't actually accept type options
    -- The caller passed only options that aren't the type's, such as "array"
    OR cardinality(__msar.build_typmodin_arg(typ_options, timespan_flag)) = 0
  ) THEN
    typmod := NULL;
  ELSE
    -- Here, we actually run the typmod function to get the output for use in the format_type call.
    EXECUTE format(
      'SELECT %I(%L)',
      typmodin_func,
      __msar.build_typmodin_arg(typ_options, timespan_flag)
    ) INTO typmod;
  END IF;
  RETURN format_type(typ_id::integer, typmod::integer);
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.build_type_text(typ_jsonb jsonb) RETURNS text AS $$/*
Turns the given type-describing JSON into a proper string defining a type with arguments

The input JSON should be of the form
  {
    "id": <integer>
    "schema": <str>,
    "name": <str>,
    "modifier": <integer>,
    "options": {
      "length": <integer>,
      "precision": <integer>,
      "scale": <integer>
      "fields": <str>,
      "array": <boolean>
    }
  }

All fields are optional, and a null value as input returns 'text'
*/
SELECT COALESCE(
  -- First choice is the type specified by numeric IDs, since they're most reliable.
  format_type(
    (typ_jsonb ->> 'id')::integer,
    (typ_jsonb ->> 'modifier')::integer
  ),
  -- Second choice is the type specified by string IDs.
  __msar.get_formatted_base_type(
    COALESCE(
      __msar.build_qualified_name_sql(typ_jsonb ->> 'schema', typ_jsonb ->> 'name'),
      typ_jsonb ->> 'name',
      'text'  -- We fall back to 'text' when input is null or empty.
    ),
    typ_jsonb -> 'options'
  ) || CASE
    WHEN (typ_jsonb -> 'options' ->> 'array')::boolean THEN
      '[]'
    ELSE ''
  END
)
$$ LANGUAGE SQL;


CREATE OR REPLACE FUNCTION
msar.build_type_text_complete(typ_jsonb jsonb, old_type text) RETURNS text AS $$/*
Build the text name of a type, using the old type as a base if only options are given.

The main use for this is to allow for altering only the options of the type of a column.

Args:
  typ_jsonb: This is a jsonb denoting the new type.
  old_type: This is the old type name, with no options.

The typ_jsonb should be in the form:
{
  "name": <str> (optional),
  "options": <obj> (optional)
}

*/
SELECT msar.build_type_text(
  jsonb_strip_nulls(
    jsonb_build_object(
      'name', COALESCE(typ_jsonb ->> 'name', old_type),
      'options', typ_jsonb -> 'options'
    )
  )
);
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION __msar.build_col_def_text(col __msar.col_def) RETURNS text AS $$/*
Build appropriate text defining the given column for table creation or alteration.
*/
SELECT format(
  '%s %s %s %s %s',
  col.name_,
  col.type_,
  CASE WHEN col.not_null THEN 'NOT NULL' END,
  'DEFAULT ' || col.default_,
  -- This can be used to define our default Mathesar primary key column.
  -- TODO: We should really consider doing GENERATED *ALWAYS* (rather than BY DEFAULT), but this
  -- breaks some other assumptions.
  CASE col.pkey_type
    WHEN 'IDENTITY' THEN 'GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY'
    WHEN 'UUIDv4' THEN 'PRIMARY KEY DEFAULT gen_random_uuid()'
  END
);
$$ LANGUAGE SQL;


CREATE OR REPLACE FUNCTION
__msar.process_pk_col_def(
  col_name text DEFAULT 'id',
  pkey_type msar.pkey_kind DEFAULT 'IDENTITY'
) RETURNS __msar.col_def[] AS $$
  -- The below tuple(s) defines a default 'id' column for Mathesar. It can have a given name, type
  -- integer or uuid, it's not null, it uses the 'identity' or 'gen_random_uuid()' functionality to
  -- generate default values, has a default comment.
  SELECT CASE pkey_type
    WHEN 'IDENTITY' THEN
      ARRAY[
        (col_name, 'integer', true, null, pkey_type, 'Mathesar default integer ID column')
      ]::__msar.col_def[]
    WHEN 'UUIDv4' THEN
      ARRAY[
        (col_name, 'uuid', true, null, pkey_type, 'Mathesar default uuid ID column')
      ]::__msar.col_def[]
  END;
$$ LANGUAGE SQL;


CREATE OR REPLACE FUNCTION
__msar.process_col_def_jsonb(
  tab_id oid,
  col_defs jsonb,
  raw_default boolean
) RETURNS __msar.col_def[] AS $$/*
Create an __msar.col_def from a JSON array of column creation defining JSON blobs.

Args:
  tab_id: The OID of the table where we'll create the columns
  col_defs: A jsonb array defining a column creation (must have "type" key; "name",
                  "not_null", and "default" keys optional).
  raw_default: This boolean tells us whether we chould reproduce the default with or without quoting
               and escaping. True means we don't quote or escape, but just use the raw value.

The col_defs should have the form:
[
  {
    "name": <str> (optional),
    "type": {
      "name": <str> (optional),
      "options": <obj> (optional),
    },
    "not_null": <bool> (optional; default false),
    "default": <any> (optional),
    "description": <str> (optional)
  },
  {
    ...
  }
]

For more info on the type.options object, see the msar.build_type_text function. All pieces are
optional. If an empty object {} is given, the resulting column will have a default name like
'Column <n>' and type TEXT. It will allow nulls and have a null default value.
*/
WITH attnum_cte AS (
  SELECT MAX(attnum) AS m_attnum FROM pg_catalog.pg_attribute WHERE attrelid=tab_id
), col_create_cte AS (
  SELECT (
    -- build a name for the column
    COALESCE(
      quote_ident(col_def_obj ->> 'name'),
      quote_ident('Column ' || (attnum_cte.m_attnum + ROW_NUMBER() OVER ())),
      quote_ident('Column ' || (ROW_NUMBER() OVER ()))
    ),
    -- build the column type
    msar.build_type_text(col_def_obj -> 'type'),
    -- set the not_null value for the column
    col_def_obj ->> 'not_null',
    -- set the default value for the column
    CASE
      WHEN col_def_obj ->> 'default' IS NULL THEN
        NULL
      WHEN raw_default THEN
        col_def_obj ->> 'default'
      ELSE
        format('%L', col_def_obj ->> 'default')
    END,
    -- We don't allow setting the primary key column manually
    null,
    -- Set the description for the column
    quote_literal(col_def_obj ->> 'description')
  )::__msar.col_def AS col_defs
  FROM attnum_cte, jsonb_array_elements(col_defs) AS col_def_obj
  WHERE (col_def_obj ->> 'name' IS NULL OR col_def_obj ->> 'name' <> 'id')
)
SELECT array_agg(col_defs)
FROM col_create_cte;
$$ LANGUAGE SQL;


CREATE OR REPLACE FUNCTION
msar.add_column(tab_id regclass, col_def jsonb, raw_default boolean DEFAULT false)
  RETURNS smallint AS $$/*
Add a column to a table.

Args:
  tab_id: The OID of the table where we'll create the columns.
  col_def: An object defining the new column. See below for details.
  raw_default: This boolean tells us whether we chould reproduce the default with or without quoting
               and escaping. True means we don't quote or escape, but just use the raw value.

Returns:
  The attnum of the newly created column.


col_def should have the form:
  {
    "name": <str> (optional),
    "type": {
      "name": <str> (optional),
      "options": <obj> (optional),
    },
    "not_null": <bool> (optional; default false),
    "default": <any> (optional),
    "description": <str> (optional)
  }
*/
DECLARE
  unique_col_name text;
  sanitized_default text;
  created_attnum smallint;
BEGIN
  unique_col_name = msar.build_unique_column_name(tab_id, coalesce(col_def ->> 'name', 'Column'));
  sanitized_default = CASE
    WHEN col_def ->> 'default' IS NULL THEN null
    WHEN raw_default THEN col_def ->> 'default'
    ELSE format('%L', col_def ->> 'default')
  END;
  EXECUTE format(
    'ALTER TABLE %1$I.%2$I ADD COLUMN %3$I %4$s %5$s %6$s',
    msar.get_relation_schema_name(tab_id),
    msar.get_relation_name(tab_id),
    unique_col_name,
    msar.build_type_text(col_def -> 'type'),
    CASE WHEN (col_def -> 'not_null')::boolean THEN 'NOT NULL' END,
    'DEFAULT ' || sanitized_default
  );
  created_attnum = attnum
    FROM pg_catalog.pg_attribute
    WHERE attrelid = tab_id AND attname = unique_col_name;
  IF col_def ? 'description' THEN
    PERFORM msar.comment_on_column(tab_id, created_attnum, col_def ->> 'description');
  END IF;
  RETURN created_attnum;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.add_pkey_column(
  tab_id regclass,
  pkey_type msar.pkey_kind,
  drop_old_pkey_col boolean DEFAULT false,
  col_name text DEFAULT 'id'
) RETURNS integer AS $$/*
Add a primary key column with a predefined default to a table.

Any name collisions for the column are resolved automatically, with this column's name deferring to
the original column names in the table.

Args:
  tab_id: This is the OID or name of the table to which we'll add the primary key column.
  pkey_type: The "type" of the pkey column. 'UUIDv4' means a `uuid` column using the
             `gen_random_uuid()` function for its default values. 'IDENTITY' means an `integer`
             using `GENERATED BY DEFAULT AS IDENTITY` for default values.
  drop_old_pkey_col: Whether we should drop the current primary key column during this operation.
  col_name: This optional value will set the name of the column.
*/
BEGIN
  IF drop_old_pkey_col THEN
    PERFORM msar.drop_columns(tab_id, msar.get_pk_column(tab_id));
  END IF;
  PERFORM msar.drop_constraint(tab_id, oid)
    FROM pg_catalog.pg_constraint WHERE conrelid=tab_id AND contype='p';
  EXECUTE format(
    'ALTER TABLE %I.%I ADD COLUMN %I %s;',
    msar.get_relation_schema_name(tab_id),
    msar.get_relation_name(tab_id),
    msar.build_unique_column_name(tab_id, col_name),
    CASE pkey_type
      WHEN 'IDENTITY' THEN 'integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY'
      WHEN 'UUIDv4' THEN 'uuid PRIMARY KEY DEFAULT gen_random_uuid()'
    END
  );
  RETURN msar.get_pk_column(tab_id);
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.set_pkey_column(
  tab_id regclass,
  col_id integer,
  default_type msar.pkey_kind DEFAULT null,
  drop_old_pkey_col boolean DEFAULT false
) RETURNS void AS $$/*
Set a primary key column with an optional predefined default on a table.

Args:
  tab_id: This is the OID or name of the table for which we'll set the primary key column.
  col_id: This is the attnum of the column we'll set as the primary key column.
  pkey_type: The "type" of the pkey column. 'UUIDv4' means a `uuid` column using the
             `gen_random_uuid()` function for its default values. 'IDENTITY' means an `integer`
             using `GENERATED BY DEFAULT AS IDENTITY` for default values. If `null` is passed, we
             do not set any default, or change the column type.
  drop_old_pkey_col: Whether we should drop the current primary key column during this operation.
*/
BEGIN
  IF drop_old_pkey_col THEN
    PERFORM msar.drop_columns(tab_id, msar.get_pk_column(tab_id));
  END IF;
  PERFORM msar.drop_constraint(tab_id, oid)
    FROM pg_catalog.pg_constraint WHERE conrelid=tab_id AND contype='p';
  PERFORM msar.add_constraints(
    tab_id,
    jsonb_build_array(jsonb_build_object('type', 'p', 'columns', jsonb_build_array(col_id)))
  );
  IF default_type IS NOT NULL THEN
    EXECUTE format(
      CASE WHEN default_type = 'IDENTITY' AND attidentity = '' THEN
        $s$
        ALTER TABLE %1$I.%2$I
          ALTER COLUMN %3$I TYPE integer USING msar.cast_to_integer(%3$I),
          ALTER COLUMN %3$I ADD GENERATED BY DEFAULT AS IDENTITY;
        SELECT setval(pg_catalog.pg_get_serial_sequence('%1$I.%2$I', '%3$s'), max(%3$I)) FROM %1$I.%2$I;
        $s$
      WHEN default_type = 'UUIDv4' THEN
        'ALTER TABLE %1$I.%2$I ALTER COLUMN %3$I SET DEFAULT gen_random_uuid();'
      ELSE
        ''
      END,
      msar.get_relation_schema_name(tab_id),
      msar.get_relation_name(tab_id),
      msar.get_column_name(tab_id, col_id)
    ) FROM pg_catalog.pg_attribute WHERE attrelid=tab_id AND attnum=col_id;
  END IF;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.add_columns(tab_id oid, col_defs jsonb, raw_default boolean DEFAULT false)
  RETURNS smallint[] AS $$/*
Add columns to a table.

Args:
  tab_id: The OID of the table to which we'll add columns.
  col_defs: a JSONB array defining columns to add. See __msar.process_col_def_jsonb for details.
  raw_default: Whether to treat defaults as raw SQL. DANGER!
*/
  WITH perf_cte AS (
    SELECT msar.add_column(tab_id, col_def, raw_default) AS attnum
    FROM jsonb_array_elements(col_defs) AS col_def
  )
  SELECT array_agg(attnum) FROM perf_cte;
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- MATHESAR ADD CONSTRAINTS FUNCTIONS
--
-- Add constraints to tables and (for NOT NULL) columns.
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------


-- Constraint creation definition type -------------------------------------------------------------

CREATE TYPE __msar.con_def AS (
/*
This should be used in the context of a single ALTER TABLE command. So, no need to reference the
constrained table's OID.
*/
  name_ text, -- The name of the constraint to create, qualified and quoted.
  type_ "char", -- The type of constraint to create, as a "char". See pg_constraint.contype
  col_names text[], -- The columns for the constraint, quoted.
  deferrable_ boolean, -- Whether or not the constraint is deferrable.
  fk_rel_name text, -- The foreign table for an fkey, qualified and quoted.
  fk_col_names text[], -- The foreign table's columns for an fkey, quoted.
  fk_upd_action "char", -- Action taken when fk referent is updated. See pg_constraint.confupdtype.
  fk_del_action "char", -- Action taken when fk referent is deleted. See pg_constraint.confdeltype.
  fk_match_type "char", -- The match type of the fk constraint. See pg_constraint.confmatchtype.
  expression text -- Text SQL giving the expression for the constraint (if applicable).
);


CREATE OR REPLACE FUNCTION msar.get_fkey_action_from_char("char") RETURNS text AS $$/*
Map the "char" from pg_constraint to the update or delete action string.
*/
SELECT CASE
  WHEN $1 = 'a' THEN 'NO ACTION'
  WHEN $1 = 'r' THEN 'RESTRICT'
  WHEN $1 = 'c' THEN 'CASCADE'
  WHEN $1 = 'n' THEN 'SET NULL'
  WHEN $1 = 'd' THEN 'SET DEFAULT'
END;
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.get_fkey_match_type_from_char("char") RETURNS text AS $$/*
Convert a char to its proper string describing the match type.

NOTE: Since 'PARTIAL' is not implemented (and throws an error), we don't use it here.
*/
SELECT CASE
  WHEN $1 = 'f' THEN 'FULL'
  WHEN $1 = 's' THEN 'SIMPLE'
END;
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION __msar.build_con_def_text(con __msar.con_def) RETURNS text AS $$/*
Build appropriate text defining the given constraint for table creation or alteration.

If the given con.name_ is null, the syntax changes slightly (we don't add 'CONSTRAINT'). The FOREIGN
KEY constraint has a number of extra strings that may or may not be appended.  The best
documentation for this is the FOREIGN KEY section of the CREATE TABLE docs:
https://www.postgresql.org/docs/current/sql-createtable.html

One helpful note is that this function makes use heavy of the || operator. This operator returns
null if either side is null, and thus

  'CONSTRAINT ' || con.name_ || ' '

is 'CONSTRAINT <name> ' when con.name_ is not null, and simply null if con.name_ is null.
*/
SELECT CASE
    WHEN con.type_ = 'u' THEN  -- It's a UNIQUE constraint
      format(
        '%sUNIQUE %s',
        'CONSTRAINT ' || con.name_ || ' ',
        __msar.build_text_tuple(con.col_names)
      )
    WHEN con.type_ = 'p' THEN  -- It's a PRIMARY KEY constraint
      format(
        '%sPRIMARY KEY %s',
        'CONSTRAINT ' || con.name_ || ' ',
        __msar.build_text_tuple(con.col_names)
      )
    WHEN con.type_ = 'f' THEN  -- It's a FOREIGN KEY constraint
      format(
        '%sFOREIGN KEY %s REFERENCES %s%s%s%s%s',
        'CONSTRAINT ' || con.name_ || ' ',
        __msar.build_text_tuple(con.col_names),
        con.fk_rel_name,
        __msar.build_text_tuple(con.fk_col_names),
        ' MATCH ' || msar.get_fkey_match_type_from_char(con.fk_match_type),
        ' ON DELETE ' || msar.get_fkey_action_from_char(con.fk_del_action),
        ' ON UPDATE ' || msar.get_fkey_action_from_char(con.fk_upd_action)
      )
    WHEN con.type_ = 'c' THEN  -- It's a CHECK constraint
      -- The expression is raw SQL, interpolated as given: there's no way to
      -- parameterize an arbitrary boolean expression. See msar.add_constraints.
      format(
        '%sCHECK (%s)',
        'CONSTRAINT ' || con.name_ || ' ',
        con.expression
      )
    ELSE
      NULL
  END
  || CASE WHEN con.deferrable_ THEN 'DEFERRABLE' ELSE '' END;
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
__msar.process_con_def_jsonb(tab_id oid, con_create_arr jsonb)
  RETURNS __msar.con_def[] AS $$/*
Create an array of  __msar.con_def from a JSON array of constraint creation defining JSON.

Args:
  tab_id: The OID of the table where we'll create the constraints.
  con_create_arr: A jsonb array defining a constraint creation (must have "type" key; "name",
                  "not_null", and "default" keys optional).


The con_create_arr should have the form:
[
  {
    "name": <str> (optional),
    "type": <str>,
    "columns": [<int:str>, <int:str>, ...],
    "deferrable": <bool> (optional),
    "fkey_relation_id": <int> (optional),
    "fkey_columns": [<int>, <int>, ...] (optional),
    "fkey_update_action": <str> (optional),
    "fkey_delete_action": <str> (optional),
    "fkey_match_type": <str> (optional),
    "pattern": <str> (optional),
    "expression": <str> (optional),
  },
  {
    ...
  }
]
If the constraint type is "f", then we require fkey_relation_id.
If the constraint type is "c", then we require either "pattern" (preferred: a named pattern from
msar.build_check_expression, which composes the SQL itself) or "expression" (raw SQL, for internal
callers that have already composed it).

Numeric IDs are preferred over textual ones where both are accepted.
*/
SELECT array_agg(
  (
    -- build the name for the constraint, properly quoted.
    quote_ident(con_create_obj ->> 'name'),
    -- set the constraint type as a single char. See __msar.build_con_def_text for details.
    con_create_obj ->> 'type',
    -- Set the column names associated with the constraint.
    msar.get_column_names(tab_id, con_create_obj -> 'columns'),
    -- Set whether the constraint is deferrable or not (boolean).
    con_create_obj ->> 'deferrable',
    __msar.get_qualified_relation_name((con_create_obj -> 'fkey_relation_id')::integer::oid),
    -- Build the array of foreign columns for an fkey constraint.
    msar.get_column_names(
      -- We validate that the given OID (if any) is correct.
      (con_create_obj -> 'fkey_relation_id')::bigint::oid,
      con_create_obj -> 'fkey_columns'
    ),
    -- The below are passed directly. They define some parameters for FOREIGN KEY constraints.
    con_create_obj ->> 'fkey_update_action',
    con_create_obj ->> 'fkey_delete_action',
    con_create_obj ->> 'fkey_match_type',
    -- The boolean expression for a CHECK constraint. Built from a named pattern where one is
    -- given, so that callers above this layer need never compose SQL.
    CASE
      WHEN con_create_obj ? 'pattern' THEN msar.build_check_expression(
        tab_id, con_create_obj ->> 'pattern', con_create_obj -> 'columns'
      )
      ELSE con_create_obj ->> 'expression'
    END
  )::__msar.con_def
) FROM jsonb_array_elements(con_create_arr) AS x(con_create_obj);
$$ LANGUAGE SQL;


CREATE OR REPLACE FUNCTION
__msar.add_constraints(tab_name text, con_defs variadic __msar.con_def[])
  RETURNS TEXT AS $$/*
Add the given constraints to the given table.

Args:
  tab_name: Fully-qualified, quoted table name.
  con_defs: The constraints to be added.
*/
DECLARE
  add_con_sql text;
BEGIN
  WITH con_cte AS (
    SELECT string_agg('ADD ' || __msar.build_con_def_text(con), ', ') as con_additions
    FROM unnest(con_defs) as con
  )
  SELECT format('ALTER TABLE %s %s', tab_name, con_additions) INTO add_con_sql FROM con_cte;
  EXECUTE add_con_sql;
  RETURN add_con_sql;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.add_constraints(tab_id oid, con_defs jsonb) RETURNS oid[] AS $$/*
Add constraints to a table.

Args:
  tab_id: The OID of the table to which we'll add constraints.
  col_defs: a JSONB array defining constraints to add. See __msar.process_con_def_jsonb for details.
*/
DECLARE
  con_create_defs __msar.con_def[];
BEGIN
  con_create_defs := __msar.process_con_def_jsonb(tab_id, con_defs);
  PERFORM __msar.add_constraints(
    __msar.get_qualified_relation_name(tab_id),
    variadic con_create_defs
  );
  RETURN array_agg(oid) FROM pg_catalog.pg_constraint WHERE conrelid=tab_id;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE TYPE __msar.not_null_def AS (
  col_name text, -- The column to be modified, quoted.
  not_null boolean -- The value to set for null or not null.
);


CREATE OR REPLACE FUNCTION
msar.copy_constraint(con_id oid, from_col_id smallint, to_col_id smallint)
  RETURNS oid[] AS $$/*
Copy a single constraint associated with a column.

Given a column with attnum 3 involved in the original constraint, and a column with attnum 4 to be
involved in the constraint copy, and other columns 1 and 2 involved in the constraint, suppose the
original constraint had conkey [1, 2, 3]. The copy constraint should then have conkey [1, 2, 4].

For now, this is only implemented for unique constraints.

Args:
  con_id: The oid of the constraint we'll copy.
  from_col_id: The column ID to be removed from the original's conkey in the copy.
  to_col_id: The column ID to be added to the original's conkey in the copy.
*/
WITH
  con_cte AS (SELECT * FROM pg_catalog.pg_constraint WHERE oid=con_id AND contype='u'),
  con_def_cte AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'name', null,
        'type', con_cte.contype,
        'columns', array_replace(con_cte.conkey, from_col_id, to_col_id)
      )
    ) AS con_def FROM con_cte
  )
SELECT msar.add_constraints(con_cte.conrelid, con_def_cte.con_def) FROM con_cte, con_def_cte;
$$ LANGUAGE sql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.copy_column(
  tab_id oid, col_id smallint, copy_name text, copy_data boolean, copy_constraints boolean
) RETURNS smallint AS $$/*
Copy a column of a table
*/
DECLARE
  col_defs __msar.col_def[];
  tab_name text;
  col_name text;
  created_col_id smallint;
BEGIN
  created_col_id = msar.add_column(
    tab_id,
    jsonb_build_object(
      'name', coalesce(copy_name, msar.build_unique_column_name(tab_id, col_id)),
      'type', jsonb_build_object('id', atttypid, 'modifier', atttypmod),
      'not_null', false,  -- Required since the column will initially be empty.
      'default', CASE WHEN copy_data THEN pg_catalog.pg_get_expr(adbin, tab_id) END,
      'description', msar.col_description(tab_id, attnum)
    ),
    raw_default => true
  )
    FROM pg_catalog.pg_attribute LEFT JOIN pg_catalog.pg_attrdef
      ON adnum=attnum AND adrelid=attrelid
    WHERE attrelid=tab_id AND attnum=col_id;

  IF copy_data THEN
    -- Copying a column doesn't change the records; see mathesar_types.stamp_updated_at.
    PERFORM set_config('mathesar.keep_updated_at', 'on', true);
    EXECUTE format(
      'UPDATE %I.%I SET %I=%I',
      msar.get_relation_schema_name(tab_id),
      msar.get_relation_name(tab_id),
      msar.get_column_name(tab_id, created_col_id),
      msar.get_column_name(tab_id, col_id)
    );
    PERFORM set_config('mathesar.keep_updated_at', 'off', true);
  END IF;
  IF copy_constraints THEN
    PERFORM msar.copy_constraint(oid, col_id, created_col_id)
    FROM pg_catalog.pg_constraint
    WHERE conrelid=tab_id AND ARRAY[col_id] <@ conkey;
    PERFORM msar.set_not_null(
      tab_id, created_col_id, attnotnull
    )
    FROM pg_catalog.pg_attribute WHERE attrelid=tab_id AND attnum=col_id;
  END IF;
  RETURN created_col_id;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.get_extracted_con_def_jsonb(tab_id oid, col_ids integer[]) RETURNS jsonb AS $$/*
Get a JSON array of constraint definitions from given columns for creation of an extracted table.

See the __msar.process_con_def_jsonb for a description of the JSON.

Args:
  tab_id: The OID of the table containing the constraints whose definitions we want.
  col_ids: The attnum of columns with the constraints whose definitions we want.
*/

SELECT jsonb_agg(
  jsonb_build_object(
    'type', contype,
    'columns', ARRAY[attname],
    'deferrable', condeferrable,
    'fkey_relation_id', confrelid::bigint,
    'fkey_columns', coalesce(confkey, ARRAY[]::smallint[]),
    'fkey_update_action', confupdtype,
    'fkey_delete_action', confdeltype,
    'fkey_match_type', confmatchtype
  )
)
FROM pg_catalog.pg_constraint
  JOIN unnest(col_ids) AS columns_to_copy(col_id) ON pg_constraint.conkey[1]=columns_to_copy.col_id
  JOIN pg_catalog.pg_attribute
    ON pg_attribute.attnum=columns_to_copy.col_id AND pg_attribute.attrelid=pg_constraint.conrelid
WHERE pg_constraint.conrelid=tab_id AND (pg_constraint.contype='f' OR pg_constraint.contype='u');
$$ LANGUAGE sql RETURNS NULL ON NULL INPUT;


----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- MATHESAR DROP TABLE FUNCTIONS
--
-- Drop a table.
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------

-- Drop table --------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION
msar.drop_table(tab_id oid, cascade_ boolean) RETURNS text AS $$/*
Drop a table, returning the fully qualified name of the dropped table.

Args:
  tab_id: The OID of the table to drop
  cascade_: Whether to drop dependent objects.
*/
DECLARE
  relation_name text;
BEGIN
  relation_name := format(
    '%I.%I',
    msar.get_relation_schema_name(tab_id),
    msar.get_relation_name(tab_id)
  );
  EXECUTE format(
    'DROP TABLE %s %s',
    relation_name,
    CASE WHEN cascade_ THEN 'CASCADE' ELSE '' END
  );
  RETURN relation_name;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- MATHESAR DROP CONSTRAINT FUNCTIONS
--
-- Drop a constraint.
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION
msar.drop_constraint(sch_name text, tab_name text, con_name text) RETURNS TEXT AS $$/*
Drop a constraint

Args:
  sch_name: The name of the schema where the table with constraint to be dropped resides, unquoted.
  tab_name: The name of the table that has the constraint to be dropped, unquoted.
  con_name: Name of the constraint to drop, unquoted.
*/
BEGIN
  EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', sch_name, tab_name, con_name);
  RETURN con_name;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.drop_constraint(tab_id oid, con_id oid) RETURNS TEXT AS $$/*
Drop a constraint

Args:
  tab_id: OID of the table that has the constraint to be dropped.
  con_id: OID of the constraint to be dropped.
*/
BEGIN
  RETURN msar.drop_constraint(
    msar.get_relation_schema_name(tab_id),
    msar.get_relation_name(tab_id),
    msar.get_constraint_name(con_id)
  );
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


-- Create Mathesar table function

CREATE OR REPLACE FUNCTION
__msar.add_table(tab_name text, col_defs __msar.col_def[], con_defs __msar.con_def[])
  RETURNS text AS $$/*
Add a table, returning the command executed.

Args:
  tab_name: A qualified & quoted name for the table to be added.
  col_defs: An array of __msar.col_def defining the column set of the new table.
  con_defs (optional): An array of __msar.con_def defining the constraints for the new table.

Note: Even if con_defs is null, there can be some column-level constraints set in col_defs.
*/
DECLARE
  add_tab_sql text;
BEGIN
  WITH col_cte AS (
    SELECT string_agg(__msar.build_col_def_text(col), ', ') AS table_columns
    FROM unnest(col_defs) AS col
  ), con_cte AS (
    SELECT string_agg(__msar.build_con_def_text(con), ', ') AS table_constraints
    FROM unnest(con_defs) as con
  )
  SELECT format(
    'CREATE TABLE %s (%s)',
    tab_name,
    concat_ws(', ', table_columns, table_constraints)
  ) INTO add_tab_sql
  FROM col_cte, con_cte;
  EXECUTE add_tab_sql;
  RETURN add_tab_sql;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.add_mathesar_table(
  sch_id oid,
  tab_name text,
  pk_col_def jsonb,
  col_defs jsonb,
  con_defs jsonb,
  own_id regrole,
  comment_ text
) RETURNS jsonb AS $$/*
Add a table, with a default id column, returning the OID & name of the created table.

Args:
  sch_id: The OID of the schema where the table will be created.
  tab_name (optional): The unquoted name for the new table.
  pk_col_defs (optional): The primary key column for the new table.
  col_defs (optional): The columns for the new table, in order.
  con_defs (optional): The constraints for the new table.
  own_id   (optional): The OID of the role who will own the new table.
  comment_ (optional): The comment for the new table.

Note:
  - If tab_name is NULL, the table will be created with a name in the format 'Table <n>'.
  - If col_defs is NULL, the table will still be created with a default 'id' column.
  - If an 'id' column is provided, it will be renamed to an auto-generated name.
  - There would always be an 'id' column which would be created by Mathesar.
  - If own_id is NULL, the current role will be the owner of the new table.
*/
DECLARE
  schema_name text;
  table_count integer;
  prefix text;
  uq_table_name text;
  fq_table_name text;
  created_table_id oid;
  column_defs __msar.col_def[];
  constraint_defs __msar.con_def[];
  id_col_name text;
  existing_col_names text[];
  renamed_columns jsonb := '{}'::jsonb;
BEGIN
  schema_name := msar.get_schema_name(sch_id);
  IF NULLIF(tab_name, '') IS NOT NULL AND NOT EXISTS(
      SELECT oid FROM pg_catalog.pg_class WHERE relname = tab_name AND relnamespace = sch_id
    )
  THEN
    fq_table_name := format('%I.%I', schema_name, tab_name);
  ELSE
    -- determine what prefix to use for table name generation
    IF NULLIF(tab_name, '') IS NOT NULL THEN
      prefix := tab_name || ' ';
    ELSE
      prefix := 'Table ';
    END IF;
    -- generate a table name if one doesn't exist
    SELECT COUNT(*) + 1 INTO table_count
    FROM pg_catalog.pg_class
    WHERE relkind = 'r' AND relnamespace = sch_id;
    uq_table_name := prefix || table_count;
    -- avoid name collisions
    WHILE EXISTS (
      SELECT oid FROM pg_catalog.pg_class WHERE relname = uq_table_name AND relnamespace = sch_id
    ) LOOP
      table_count := table_count + 1;
      uq_table_name := prefix || table_count;
    END LOOP;
    fq_table_name := format('%I.%I', schema_name, uq_table_name);
  END IF;

  IF jsonb_path_exists(col_defs, '$[*] ? (@.name == "id")') THEN
    -- rename 'id'
    SELECT array_agg(col_def->>'name') INTO existing_col_names FROM jsonb_array_elements(col_defs) col_def;
    id_col_name := msar.get_unique_local_identifier(existing_col_names, 'id');

    col_defs := (
      SELECT jsonb_agg(
        CASE WHEN col_def->>'name' = 'id' THEN jsonb_set(col_def, '{name}', to_jsonb(id_col_name))
          ELSE col_def END
    ) FROM jsonb_array_elements(col_defs) col_def);

    renamed_columns := jsonb_build_object('id', id_col_name);
  END IF;
  column_defs := array_cat(
    __msar.process_pk_col_def(
      COALESCE(pk_col_def->>'name', 'id'),
      COALESCE(pk_col_def->>'type', 'IDENTITY')::msar.pkey_kind
    ), __msar.process_col_def_jsonb(0, col_defs, false)
  );
  constraint_defs := __msar.process_con_def_jsonb(0, con_defs);
  PERFORM __msar.add_table(fq_table_name, column_defs, constraint_defs);
  created_table_id := fq_table_name::regclass::oid;
  PERFORM msar.comment_on_table(created_table_id, comment_);
  IF own_id IS NOT NULL THEN
    PERFORM msar.transfer_table_ownership(created_table_id, own_id);
  END IF;

  RETURN jsonb_build_object(
    'oid', created_table_id::bigint,
    'name', relname,
    'renamed_columns', renamed_columns::jsonb,
    'pkey_column_attnum', msar.get_pk_column(created_table_id)
  ) FROM pg_catalog.pg_class WHERE oid = created_table_id;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.copy_table_structure(src_id oid, tgt_id oid) RETURNS void AS $$/*
Give a table the shape of another one: its columns, the constraints among them, the triggers that
fill them in, and how they are shown.

Records are never copied, and neither are indexes that aren't constraints, which say how a table is
read rather than what it holds.

The target has a primary key of its own, so the source's is not copied as one. A key the database
makes up as it goes -- an identity column, or one drawing from a sequence -- is left behind with it,
along with every constraint resting on it: the number a record happens to have been given is the
source table's business. A key made of the table's own values is as much a part of its shape as any
other column, so it is copied, and what it said -- that those values identify a record -- is kept as
a unique constraint. So is a column whose name the target already has, which is the one it keeps.

Defaults are copied as the expressions they are -- PostgreSQL's own rendering of the source's, not
anything a caller wrote, which is why they can go in as the SQL they are. The exception is a default
drawing from a sequence, which is dropped: it would be the source table's sequence rather than one
of the target's own. An identity column is copied as an identity column, which does get its own.

The target is expected to be empty, as a table just created is: a copied column that is NOT NULL and
has no default cannot be added to a table with records in it.

Args:
  src_id: The OID of the table to copy the shape of.
  tgt_id: The OID of the table to give that shape to, which keeps the columns it has.
*/
DECLARE
  sch_name text := msar.get_relation_schema_name(tgt_id);
  tab_name text := msar.get_relation_name(tgt_id);
  pkey_cols smallint[];
  skipped_cols smallint[];
  col RECORD;
  con RECORD;
  add_sql text;
BEGIN
  SELECT COALESCE(conkey, '{}') INTO pkey_cols
  FROM pg_catalog.pg_constraint WHERE conrelid = src_id AND contype = 'p';
  pkey_cols := COALESCE(pkey_cols, '{}');

  SELECT COALESCE(array_agg(att.attnum), '{}') INTO skipped_cols
  FROM pg_catalog.pg_attribute AS att
    LEFT JOIN pg_catalog.pg_attrdef AS def
      ON def.adrelid = att.attrelid AND def.adnum = att.attnum
  WHERE att.attrelid = src_id AND att.attnum > 0 AND NOT att.attisdropped
    AND (
      (
        att.attnum = ANY(pkey_cols)
        AND (
          att.attidentity <> ''
          OR pg_catalog.pg_get_expr(def.adbin, def.adrelid) LIKE '%nextval(%'
        )
      )
      OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute AS tgt_att
        WHERE tgt_att.attrelid = tgt_id AND tgt_att.attname = att.attname
          AND tgt_att.attnum > 0 AND NOT tgt_att.attisdropped
      )
    );

  FOR col IN
    SELECT
      att.attname,
      pg_catalog.format_type(att.atttypid, att.atttypmod) AS type_name,
      att.attnotnull,
      att.attidentity,
      att.attgenerated,
      pg_catalog.pg_get_expr(def.adbin, def.adrelid) AS default_expr,
      pg_catalog.col_description(src_id, att.attnum) AS comment_
    FROM pg_catalog.pg_attribute AS att
      LEFT JOIN pg_catalog.pg_attrdef AS def
        ON def.adrelid = att.attrelid AND def.adnum = att.attnum
    WHERE att.attrelid = src_id AND att.attnum > 0 AND NOT att.attisdropped
      AND NOT att.attnum = ANY(skipped_cols)
    ORDER BY att.attnum
  LOOP
    add_sql := format('ALTER TABLE %I.%I ADD COLUMN %I %s', sch_name, tab_name, col.attname,
      col.type_name);
    IF col.attgenerated <> '' THEN
      add_sql := add_sql || format(' GENERATED ALWAYS AS (%s) STORED', col.default_expr);
    ELSIF col.attidentity <> '' THEN
      add_sql := add_sql || format(' GENERATED %s AS IDENTITY',
        CASE col.attidentity WHEN 'a' THEN 'ALWAYS' ELSE 'BY DEFAULT' END);
    ELSIF col.default_expr IS NOT NULL AND col.default_expr NOT LIKE '%nextval(%' THEN
      add_sql := add_sql || format(' DEFAULT %s', col.default_expr);
    END IF;
    IF col.attnotnull THEN
      add_sql := add_sql || ' NOT NULL';
    END IF;
    EXECUTE add_sql;
    IF col.comment_ IS NOT NULL THEN
      EXECUTE format('COMMENT ON COLUMN %I.%I.%I IS %L', sch_name, tab_name, col.attname,
        col.comment_);
    END IF;
  END LOOP;

  -- Names are left to PostgreSQL: the source's would collide were both tables in one schema.
  FOR con IN
    SELECT pg_catalog.pg_get_constraintdef(oid) AS def
    FROM pg_catalog.pg_constraint
    WHERE conrelid = src_id AND contype = ANY('{c,u,f,x}')
      AND COALESCE(NOT (conkey && skipped_cols), true)
    ORDER BY oid
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ADD %s', sch_name, tab_name, con.def);
  END LOOP;

  IF pkey_cols <> '{}' AND NOT (pkey_cols && skipped_cols) THEN
    EXECUTE format('ALTER TABLE %I.%I ADD UNIQUE (%s)', sch_name, tab_name, (
      SELECT string_agg(quote_ident(att.attname), ', ' ORDER BY key_col.ord)
      FROM unnest(pkey_cols) WITH ORDINALITY AS key_col(attnum, ord)
        JOIN pg_catalog.pg_attribute AS att
          ON att.attrelid = src_id AND att.attnum = key_col.attnum
    ));
  END IF;

  -- A trigger names the column it fills in by attnum, so it is made anew rather than copied.
  FOR col IN
    SELECT tgt_att.attnum
    FROM pg_catalog.pg_attribute AS src_att
      JOIN pg_catalog.pg_attribute AS tgt_att
        ON tgt_att.attrelid = tgt_id AND tgt_att.attname = src_att.attname
          AND NOT tgt_att.attisdropped
    WHERE src_att.attrelid = src_id AND src_att.attnum > 0 AND NOT src_att.attisdropped
      AND EXISTS (SELECT msar.get_updated_at_triggers(src_id, src_att.attnum))
  LOOP
    PERFORM msar.set_updated_at_column(tgt_id, col.attnum, true);
  END LOOP;

  -- How a column is shown is as much a part of its shape as its type is.
  FOR col IN
    SELECT tgt_att.attnum, pres.value AS options
    FROM jsonb_each(msar.column_presentation(src_id)) AS pres
      JOIN pg_catalog.pg_attribute AS src_att
        ON src_att.attrelid = src_id AND src_att.attnum = pres.key::smallint
      JOIN pg_catalog.pg_attribute AS tgt_att
        ON tgt_att.attrelid = tgt_id AND tgt_att.attname = src_att.attname
          AND NOT tgt_att.attisdropped
  LOOP
    PERFORM msar.set_column_presentation(tgt_id, col.attnum, col.options);
  END LOOP;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.prepare_table_for_import(
  sch_id oid,
  tab_name text,
  col_names text[],
  comment_ text
) RETURNS jsonb AS $$/*
Add a table, with a default id column, returning a JSON object containing a properly formatted SQL
statement to carry out `COPY FROM`, table_oid & table_name of the created table.

Each returned JSON object will have the form:
  {
    "copy_sql": <str>,
    "table_oid": <int>,
    "table_name": <str>,
    "renamed_columns": <arr>
  }

Args:
  sch_id: The OID of the schema where the table will be created.
  tab_name (optional): The unquoted name for the new table.
  col_defs: The columns for the new table, in order.
  comment_ (optional): The comment for the new table.
*/
DECLARE
  sch_name text;
  rel_name text;
  col_defs jsonb;
  mathesar_table json;
  rel_id oid;
  col_names_sql text;
  copy_sql text;
BEGIN
  -- Build column definition jsonb
  col_defs := jsonb_agg(jsonb_build_object('name', n)) FROM unnest(col_names) AS x(n);
  -- Create string table
  mathesar_table := msar.add_mathesar_table(sch_id, tab_name, NULL, col_defs, NULL, NULL, comment_);
  rel_id := mathesar_table ->> 'oid';
  -- Get unquoted schema and table name for the created table
  SELECT nspname, relname INTO sch_name, rel_name
  FROM pg_catalog.pg_class AS pgc
  LEFT JOIN pg_catalog.pg_namespace AS pgn
  ON pgc.relnamespace = pgn.oid
  WHERE pgc.oid = rel_id;
  -- Aggregate TEXT type column names of the created table
  SELECT string_agg(quote_ident(attname), ', ') INTO col_names_sql
  FROM pg_catalog.pg_attribute
  WHERE attrelid = rel_id AND atttypid = 'TEXT'::regtype::oid;
  -- Create a properly formatted COPY SQL string
  copy_sql := format('COPY %I.%I (%s) FROM STDIN', sch_name, rel_name, col_names_sql);
  RETURN jsonb_build_object(
    'copy_sql', copy_sql,
    'table_oid', rel_id::bigint,
    'table_name', relname,
    'renamed_columns', mathesar_table -> 'renamed_columns',
    'pkey_column_attnum', mathesar_table -> 'pkey_column_attnum'
  ) FROM pg_catalog.pg_class WHERE oid = rel_id;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.prepare_temp_table_for_import(
  tab_name text,
  col_names text[]
) RETURNS jsonb AS $$/*
Add a temp table, returning a JSON object containing a properly formatted SQL
statement to carry out `COPY FROM`, table_oid of the created temp table.

Each returned JSON object will have the form:
  {
    "copy_sql": <str>,
    "table_oid": <int>
  }

Args:
  tab_name (optional): The unquoted name for the new temp table.
  col_defs: The columns for the new table, in order.
*/
DECLARE
  col_defs jsonb;
  column_defs __msar.col_def[];
  prefix text;
  table_count integer := 1;
  uq_tab_name text;
  sch_name text;
  rel_id bigint;
  col_names_sql text;
  copy_sql text;
BEGIN
  -- Passing 'id' as column name gets filtered out by __msar.process_col_def_jsonb,
  -- pass NULL when 'id' is encountered.
  col_defs := jsonb_agg(jsonb_build_object('name', NULLIF(n, 'id'))) FROM unnest(col_names) AS x(n);

  IF NULLIF(tab_name, '') IS NOT NULL AND NOT EXISTS(
      SELECT oid FROM pg_catalog.pg_class WHERE relname = tab_name AND relpersistence = 't'
    )
  THEN
    uq_tab_name := tab_name;
  ELSE
    prefix := 'Temp Table ';
    uq_tab_name := prefix || table_count;
    -- avoid name collisions
    WHILE EXISTS (
      SELECT oid FROM pg_catalog.pg_class WHERE relname = uq_tab_name AND relpersistence = 't'
    ) LOOP
      table_count := table_count + 1;
      uq_tab_name := prefix || table_count;
    END LOOP;
  END IF;
  column_defs := __msar.process_col_def_jsonb(0, col_defs, false);
  PERFORM msar.add_temp_table(uq_tab_name, column_defs);

  SELECT nspname, pgc.oid INTO sch_name, rel_id
  FROM pg_catalog.pg_class AS pgc
  LEFT JOIN pg_catalog.pg_namespace AS pgn
  ON pgc.relnamespace = pgn.oid
  WHERE pgc.relname = uq_tab_name AND pgc.relpersistence = 't';

  -- Aggregate TEXT type column names of the created table
  SELECT string_agg(quote_ident(attname), ', ') INTO col_names_sql
  FROM pg_catalog.pg_attribute
  WHERE attrelid = rel_id AND atttypid = 'TEXT'::regtype::oid;

  -- Create a properly formatted COPY SQL string
  copy_sql := format('COPY %I.%I(%s) FROM STDIN', sch_name, uq_tab_name, col_names_sql);

  RETURN jsonb_build_object(
    'copy_sql', copy_sql,
    'table_oid', rel_id::bigint
  ) FROM pg_catalog.pg_class WHERE oid = rel_id;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.add_temp_table(tab_name text, col_defs __msar.col_def[])
RETURNS text AS $$/*
Add a temporary table, returning the command executed.

Args:
  tab_name: An unqualified name for the table to be added.
  col_defs: An array of __msar.col_def defining the column set of the new table.
*/
DECLARE
  tmp_tab_sql text;
BEGIN
  WITH col_cte AS (
    SELECT string_agg(__msar.build_col_def_text(col), ', ') AS table_columns
    FROM unnest(col_defs) AS col
  )
  SELECT format(
    'CREATE TEMPORARY TABLE %I (%s)',
    tab_name,
    table_columns
  ) INTO tmp_tab_sql
  FROM col_cte;
  EXECUTE tmp_tab_sql;
  RETURN tmp_tab_sql;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.insert_from_select(
  src_tab_id regclass,
  dst_tab_id regclass,
  mappings jsonb
) RETURNS bigint AS $$/*
Insert records from a given source table to a destination/target table,
returning the number of records inserted.

Args:
  src_tab_id: The OID of the source table.(OID if temp table if inserting into existing table).
  dst_tab_id: The OID of the destination/target table.
  mappings: The column mappings b/w src and dst tables based on which data will be inserted.

mappings should have the following form:
[
  {"src_table_attnum": 1, "dst_table_attnum": 2},
  {"src_table_attnum": 3, "dst_table_attnum": 3},
  {...}
]
*/
DECLARE
  src_table_cols text;
  dst_table_cols text;
  insert_count bigint;
BEGIN
  SELECT
    string_agg(
      msar.build_cast_expr(
        quote_ident(src.attname),
        dst.atttypid::regclass::text,
        '{}'::jsonb
      ), ', '
    ),
    string_agg(quote_ident(dst.attname), ', ')
  INTO src_table_cols, dst_table_cols
  FROM jsonb_to_recordset(mappings) AS mapping(
    src_table_attnum smallint,
    dst_table_attnum smallint
  )
  LEFT JOIN pg_catalog.pg_attribute AS src ON
    src.attnum = mapping.src_table_attnum
    AND src.attrelid = src_tab_id
    AND NOT src.attisdropped
  LEFT JOIN pg_catalog.pg_attribute AS dst ON
    dst.attnum = mapping.dst_table_attnum
    AND dst.attrelid = dst_tab_id
    AND NOT dst.attisdropped;

  EXECUTE format(
    'INSERT INTO %I.%I(%s) SELECT %s FROM %I.%I',
    msar.get_relation_schema_name(dst_tab_id),
    msar.get_relation_name(dst_tab_id),
    dst_table_cols,
    src_table_cols,
    msar.get_relation_schema_name(src_tab_id),
    msar.get_relation_name(src_tab_id)
  );
  GET DIAGNOSTICS insert_count = ROW_COUNT;
  RETURN insert_count;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.get_preview(
  tab_id oid,
  col_cast_def jsonb,
  rec_limit integer
) RETURNS jsonb AS $$/*
Preview a table, applying different type casts and options to the underlying columns before import,
returning a JSON object describing the records of the table.

Note that these casts are temporary and do not alter the data in the underlying table,
if you wish to alter these settings permanantly for the columns see msar.alter_columns.

Args:
  tab_id: The OID of the table to preview.
  col_cast_def: A JSON object describing the column settings to apply.
  rec_limit (optional): The upper limit for the number of records to return.

The col_cast_def JSONB should have the form:
[
  {
    "attnum": <int>,
    "type": {
      "name": <str>,
      "options": {
        "length": <integer>,
        "precision": <integer>,
        "scale": <integer>
        "fields": <str>,
        "array": <boolean>
      }
    },
  },
  {
    ...
  },
  ...
]
*/
DECLARE
  tab_name text;
  sel_query text;
  records jsonb;
BEGIN
  tab_name := __msar.get_qualified_relation_name(tab_id);
  sel_query := 'SELECT %s FROM %s LIMIT %L';
  WITH preview_cte AS (
    SELECT string_agg(
      'CAST(' ||
      msar.build_cast_expr(
        quote_ident(msar.get_column_name(tab_id, (col_cast ->> 'attnum')::integer)),
        col_cast -> 'type' ->> 'name',
        coalesce(col_cast -> 'cast_options', '{}'::jsonb)
      ) ||
      ' AS ' ||
      msar.build_type_text(col_cast -> 'type') ||
      ')'|| ' AS ' || quote_ident(msar.get_column_name(tab_id, (col_cast ->> 'attnum')::integer)),
      ', '
    ) AS cast_expr
    FROM jsonb_array_elements(col_cast_def) AS col_cast
  )
  SELECT
    __msar.exec_dql(sel_query, cast_expr, tab_name, rec_limit::text)
  INTO records FROM preview_cte;
  RETURN records;
END;
$$ LANGUAGE plpgsql;


----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- COLUMN ALTERATION FUNCTIONS
--
-- Functions in this section should be related to altering columns' names, types, and constraints.
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------


-- Rename columns ----------------------------------------------------------------------------------


CREATE OR REPLACE FUNCTION
msar.rename_column(tab_id oid, col_id integer, new_col_name text) RETURNS smallint AS $$/*
Change a column name, returning the command executed

Args:
  tab_id: The OID of the table whose column we're renaming
  col_id: The ID of the column to rename
  new_col_name: The unquoted new name for the column.
*/
DECLARE
  old_col_name text;
BEGIN
  old_col_name := msar.get_column_name(tab_id, col_id);
  IF old_col_name <> new_col_name THEN
    EXECUTE format(
      'ALTER TABLE %I.%I RENAME COLUMN %I TO %I',
      msar.get_relation_schema_name(tab_id),
      msar.get_relation_name(tab_id),
      old_col_name,
      new_col_name
    );
    -- Keep the name cached alongside the presentation options up to date. The attnum still binds
    -- the row, so nothing here is load-bearing while the database is live; it is what makes the
    -- row restore onto the right column once the attnum stops meaning anything.
    UPDATE presentation_schema.columns
    SET column_name = new_col_name
    WHERE "table" = tab_id::regclass AND attnum = col_id;
    -- A record summary on any table may walk a chain of foreign keys into this column, so its
    -- name has to be caught up everywhere rather than just here. A kept filter only ever asks
    -- about its own table, so that one row is all there is to catch up.
    PERFORM msar.refresh_record_summary_names();
    PERFORM msar.refresh_saved_filter_columns(tab_id);
    RETURN col_id;
  ELSE
    RETURN null;
  END IF;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.build_cast_expr(
  val text,
  type_ text,
  cast_options jsonb
) RETURNS text AS $$/*
Build an expression for casting a column in Mathesar, returning the text of that expression.

A value is cast to a domain (other than Mathesar's own) by casting it to the type the domain is
defined over, and then to the domain, which checks the domain's constraints.

A value is cast to an enum by way of its text, which is all an enum's values are. Whether the text
is one of them is Postgres's to say, and it says so in a message naming the value and the type.

Args:
  val: This is quite general, and isn't sanitized in any way. It can be either a literal or a column
       identifier, since we want to be able to produce a casting expression in either case.
  type_: This type name string must cast properly to a regtype.
  cast_options: Suggestions to be used while type casting.
*/
SELECT CASE
WHEN (SELECT typtype = 'e' FROM pg_catalog.pg_type WHERE oid = type_::regtype) THEN
  format('(%s)::text::%s', val, type_::regtype)
WHEN base.typ <> type_::regtype THEN
  format('(%s)::%s', msar.build_cast_expr(val, base.typ::text, cast_options), type_::regtype)
ELSE
msar.get_cast_function_name(type_::regtype) || '(' ||
CONCAT_WS(', ',
  val,
  CASE WHEN NULLIF(cast_options, '{}'::jsonb) IS NOT NULL THEN
    CASE type_::regtype
      WHEN 'numeric'::regtype THEN
        CONCAT_WS(', ',
          'group_sep =>' || quote_literal(cast_options ->> 'group_sep') || '::"char"',
          'decimal_p =>' || quote_literal(cast_options ->> 'decimal_p') || '::"char"'
        )
      WHEN 'mathesar_types.mathesar_money'::regtype THEN
        CONCAT_WS(', ',
          'group_sep =>' || quote_literal(cast_options ->> 'group_sep') || '::"char"',
          'decimal_p =>' || quote_literal(cast_options ->> 'decimal_p') || '::"char"',
          'curr_pref =>' || quote_literal(COALESCE(cast_options ->> 'curr_pref', '')) || '::text',
          'curr_suff =>' || quote_literal(COALESCE(cast_options ->> 'curr_suff', '')) || '::text'
        )
    END
  END
) || ')'
END
FROM msar.get_column_base_type(type_::regtype, -1) AS base;
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.build_cast_expr(tab_id regclass, col_id smallint, typ_id regtype) RETURNS text AS $$/*
Build an expression for casting a column in Mathesar, returning the text of that expression.

We throw an error in cases where the casting function doesn't exist. This is assumed to be an error
the user should know about.

Args:
  tab_id: The OID of the table whose column we're casting.
  col_id: The attnum of the column in the table.
  typ_id: The OID of the type we will cast to.
*/
SELECT msar.get_cast_function_name(typ_id)
  || '('
  || format('%I', msar.get_column_name(tab_id, col_id))
  || ')';
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.set_not_null(tab_id regclass, col_id smallint, not_null boolean) RETURNS text AS $$/*
Alter a column's NOT NULL setting, returning the text of the expression executed.

Args:
  tab_id: The OID of the table containing the column whose nullability we'll alter.
  col_id: The attnum of the column whose nullability we'll alter.
  not_null: If true, we 'SET NOT NULL'. If false, we 'DROP NOT NULL' if null, we do nothing.
*/
DECLARE
  not_null_sql text;
BEGIN
  SELECT format(
    'ALTER TABLE %I.%I ALTER COLUMN %I %s NOT NULL',
    msar.get_relation_schema_name(tab_id),
    msar.get_relation_name(tab_id),
    msar.get_column_name(tab_id, col_id),
    CASE WHEN not_null THEN 'SET' ELSE 'DROP' END
  ) INTO not_null_sql;
  EXECUTE not_null_sql;
  RETURN not_null_sql;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.drop_col_default(tab_id regclass, col_id smallint) RETURNS text AS $$/*
Drop a column's default value, returning the text of the expression executed.

Args:
  tab_id: The OID of the table where the column with the default to be dropped lives.
  col_id: The attnum of the column with the undesired default.
*/
DECLARE
  drop_col_default_sql text;
BEGIN
  SELECT format(
    'ALTER TABLE %I.%I ALTER COLUMN %I DROP DEFAULT',
    msar.get_relation_schema_name(tab_id),
    msar.get_relation_name(tab_id),
    msar.get_column_name(tab_id, col_id)
  ) INTO drop_col_default_sql;
  EXECUTE drop_col_default_sql;
  RETURN drop_col_default_sql;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.set_col_default(tab_id regclass, col_id smallint, default_ text) RETURNS text AS $$/*
Sets the default for a given column, returning the text of the expression executed.

Args:
  tab_id: The OID of the table containing the column whose default we'll alter.
  col_id: The attnum of the column whose default we'll alter.
  default_: The desired default.
*/
DECLARE
  col_default_sql text;
BEGIN
  SELECT format(
    'ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT %L',
    msar.get_relation_schema_name(tab_id),
    msar.get_relation_name(tab_id),
    msar.get_column_name(tab_id, col_id),
    default_
  ) INTO col_default_sql;
  EXECUTE col_default_sql;
  RETURN col_default_sql;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.set_col_dynamic_default(tab_id regclass, col_id smallint, default_ text) RETURNS text AS $$/*
Sets a dynamic default for a given column, returning the text of the expression executed.

The default is written into the column definition as an SQL expression rather than a literal, so
only the expressions giving the current date and/or time are accepted (case-insensitively): now(),
CURRENT_TIMESTAMP, LOCALTIMESTAMP, CURRENT_DATE, CURRENT_TIME, and LOCALTIME, and the one giving the
current Mathesar user, mathesar_types.current_mathesar_user(), which "Created By" columns have.

Args:
  tab_id: The OID of the table containing the column whose default we'll alter.
  col_id: The attnum of the column whose default we'll alter.
  default_: The desired default expression.
*/
DECLARE
  default_expr text;
  col_default_sql text;
BEGIN
  default_expr := CASE lower(btrim(default_))
    WHEN 'now()' THEN 'now()'
    WHEN 'current_timestamp' THEN 'CURRENT_TIMESTAMP'
    WHEN 'localtimestamp' THEN 'LOCALTIMESTAMP'
    WHEN 'current_date' THEN 'CURRENT_DATE'
    WHEN 'current_time' THEN 'CURRENT_TIME'
    WHEN 'localtime' THEN 'LOCALTIME'
    WHEN 'mathesar_types.current_mathesar_user()' THEN 'mathesar_types.current_mathesar_user()'
  END;
  IF default_expr IS NULL THEN
    RAISE EXCEPTION 'Unsupported dynamic default: %', default_;
  END IF;
  SELECT format(
    'ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT %s',
    msar.get_relation_schema_name(tab_id),
    msar.get_relation_name(tab_id),
    msar.get_column_name(tab_id, col_id),
    default_expr
  ) INTO col_default_sql;
  EXECUTE col_default_sql;
  RETURN col_default_sql;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.set_old_col_default(
  tab_id regclass,
  col_id smallint,
  old_default text,
  new_type text,
  is_default_dynamic boolean,
  cast_options jsonb DEFAULT '{}'::jsonb
) RETURNS text AS $$/*
Sets the old default for a given column, returning the text of the expression executed.

Args:
  tab_id: The OID of the table containing the column whose default we'll alter.
  col_id: The attnum of the column whose default we'll alter.
  old_default: The current default. In some cases in the context of the caller, we want to reset the
               original default, but cast to a new type.
  new_type: The target type to which we'll cast the new default.
  is_default_dynamic: Whether the current default is dynamic, can be obtained with msar.is_default_possibly_dynamic.
  cast_options: Suggestions to be used while type casting.
*/
DECLARE
  default_ text;
  default_expr text;
BEGIN
  IF is_default_dynamic THEN
    default_ := format('%s::%s', old_default, new_type);
  ELSE
    EXECUTE format('SELECT %s', msar.build_cast_expr(old_default, new_type, cast_options)) INTO default_;
    default_ := quote_literal(default_);
  END IF;

  default_expr := format(
    'ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT %s',
    msar.get_relation_schema_name(tab_id),
    msar.get_relation_name(tab_id),
    msar.get_column_name(tab_id, col_id),
    default_
  );
  EXECUTE default_expr;
  RETURN default_expr;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.retype_column(tab_id regclass, col_id smallint, new_type text, cast_options jsonb) RETURNS text AS $$/*
Alter a column's type, returning the text of the expression executed.

Args:
  tab_id: The OID of the table containing the column whose type we'll alter.
  col_id: The attnum of the column whose type we'll alter.
  new_type: The target type to which we'll alter the column.
  cast_options: Suggestions to be used while type casting.
*/
DECLARE
  retype_col_sql text;
BEGIN
  SELECT format(
    'ALTER TABLE %I.%I ALTER COLUMN %I TYPE %s USING %s',
    msar.get_relation_schema_name(tab_id),
    msar.get_relation_name(tab_id),
    msar.get_column_name(tab_id, col_id),
    new_type,
    msar.build_cast_expr(quote_ident(msar.get_column_name(tab_id, col_id)), new_type, cast_options)
  ) INTO retype_col_sql;
  EXECUTE retype_col_sql;
  RETURN retype_col_sql;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.alter_columns(tab_id oid, col_alters jsonb) RETURNS integer[] AS $$/*
Alter columns of the given table in bulk, returning the IDs of the columns so altered.

Args:
  tab_id: The OID of the table whose columns we'll alter.
  col_alters: a JSONB describing the alterations to make.

The col_alters JSONB should have the form:
[
  {
    "attnum": <int>,
    "type": <obj> (optional),
    "default": <any> (optional),
    "default_is_dynamic": <bool> (optional),
    "updated_at_trigger": <bool> (optional),
    "not_null": <bool> (optional),
    "delete": <bool> (optional),
    "name": <str> (optional),
  },
  {
    ...
  },
  ...
]

If "default_is_dynamic" is true, "default" is an SQL expression rather than a literal value; see
msar.set_col_dynamic_default for the accepted expressions. "updated_at_trigger" makes the column an
"Updated At" column, or stops it being one; see msar.set_updated_at_column.

Note that for all alterations, we create and execute separate SQL queries rather than combining them
into a giant SQL statement. This has the benefit of providing better error messages(for users)
and better code readability(for us) at the cost of a minor performance hit.
*/
DECLARE
  col RECORD;
  return_attnum_arr integer[];
  is_default_dynamic boolean;
  new_type text;
BEGIN
  FOR col IN
    SELECT
      (col_alter_obj ->> 'attnum')::smallint AS attnum,
      (col_alter_obj -> 'not_null')::boolean AS not_null,
      (col_alter_obj ->> 'name')::text AS new_name,
      (col_alter_obj -> 'delete')::boolean AS delete_,
      col_alter_obj -> 'type' AS type_def,
      format_type(pga.atttypid, null) AS old_type,
      COALESCE((col_alter_obj -> 'cast_options')::jsonb, '{}'::jsonb) AS cast_options,
      pg_catalog.pg_get_expr(adbin, tab_id) AS old_default,
      col_alter_obj -> 'default' AS new_default,
      COALESCE((col_alter_obj -> 'default_is_dynamic')::boolean, false) AS new_default_is_dynamic,
      (col_alter_obj -> 'updated_at_trigger')::boolean AS updated_at_trigger,

      col_alter_obj->>'description' AS comment_,
      __msar.jsonb_key_exists(col_alter_obj, 'description') AS has_comment

    FROM jsonb_array_elements(col_alters) AS x(col_alter_obj)
      INNER JOIN pg_catalog.pg_attribute AS pga ON pga.attnum=(x.col_alter_obj ->> 'attnum')::smallint AND pga.attrelid=tab_id
      LEFT JOIN pg_catalog.pg_attrdef AS pgat ON pgat.adnum=(x.col_alter_obj ->> 'attnum')::smallint AND pgat.adrelid=tab_id
    WHERE NOT msar.is_mathesar_id_column(tab_id, (x.col_alter_obj ->> 'attnum')::integer)
  LOOP
    PERFORM msar.set_not_null(tab_id, col.attnum, col.not_null);
    PERFORM msar.rename_column(tab_id, col.attnum, col.new_name);

    IF col.delete_ THEN
      PERFORM msar.drop_columns(tab_id, col.attnum);
    END IF;

    IF col.has_comment THEN
      PERFORM msar.comment_on_column(tab_id, col.attnum, col.comment_);
    END IF;

    -- is_default_possibly_dynamic check must happen before we drop the default.
    is_default_dynamic := msar.is_default_possibly_dynamic(tab_id, col.attnum);

    IF col.type_def ->> 'name' = '_enum' THEN
      -- '_enum' is how an enum is named on the way out, in msar.get_column_info, where the name of
      -- the type itself is of no interest to somebody choosing between a choice of values and a
      -- date. On the way in it means the same thing: the values are what was asked for, and the
      -- column gets them under a type of its own. A column that already has one keeps it, so its
      -- type doesn't change and there is nothing here to retype.
      new_type := msar.set_column_enum(
        tab_id, col.attnum, col.type_def -> 'options' -> 'enum_values'
      );
    ELSE
      new_type := msar.build_type_text_complete(col.type_def, col.old_type);
    END IF;

    IF new_type IS NOT NULL OR jsonb_typeof(col.new_default)='null' THEN
      PERFORM msar.drop_col_default(tab_id, col.attnum);
    END IF;
    PERFORM msar.retype_column(tab_id, col.attnum, new_type, col.cast_options);
    IF col.new_default #>> '{}' IS NOT NULL THEN
      -- set new default
      IF col.new_default_is_dynamic THEN
        PERFORM msar.set_col_dynamic_default(tab_id, col.attnum, col.new_default #>> '{}');
      ELSE
        PERFORM msar.set_col_default(tab_id, col.attnum, col.new_default #>> '{}');
      END IF;
    ELSEIF (col.new_default IS NULL OR jsonb_typeof(col.new_default)<>'null') AND new_type IS NOT NULL THEN
      -- preserve old default
      -- when a new_default is absent and col is retyped with a new_type.
      -- Note: We don't want to preserve old default for jsonb_typeof(col.new_default)='null'
      -- as we consider it as an intent to drop the default.
      PERFORM msar.set_old_col_default(tab_id, col.attnum, col.old_default, new_type, is_default_dynamic, col.cast_options);
    END IF;
    IF col.updated_at_trigger IS NOT NULL THEN
      PERFORM msar.set_updated_at_column(tab_id, col.attnum, col.updated_at_trigger);
    END IF;

    -- PG13 doesn't allow concat b/w integer[] and smallint need to typecast
    return_attnum_arr := return_attnum_arr || col.attnum::integer;
  END LOOP;
  RETURN return_attnum_arr; -- do we really need this??
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


-- Comment on column -------------------------------------------------------------------------------


CREATE OR REPLACE FUNCTION
msar.comment_on_column(
  tab_id oid,
  col_id integer,
  comment_ text
) RETURNS text AS $$/*
Change the description of a column, returning command executed.

Args:
  tab_id: The OID of the table containg the column whose comment we will change.
  col_id: The ATTNUM of the column whose comment we will change.
  comment_: The new comment.
*/
DECLARE
  comment_sql text;
BEGIN
  SELECT format(
    'COMMENT ON COLUMN %I.%I.%I IS %L',
    msar.get_relation_schema_name(tab_id),
    msar.get_relation_name(tab_id),
    msar.get_column_name(tab_id, col_id),
    comment_
  ) INTO comment_sql;
  EXECUTE comment_sql;
  RETURN comment_sql;
END;
$$ LANGUAGE plpgsql;


----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- MATHESAR LINK FUNCTIONS
--
-- Add a link to the table.
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------

-- Create a Many-to-One or a One-to-One link -------------------------------------------------------


CREATE OR REPLACE FUNCTION
msar.add_foreign_key_column(
  col_name text,
  rel_id oid,
  frel_id oid,
  unique_link boolean DEFAULT false
) RETURNS smallint AS $$/*
Create a many-to-one or a one-to-one link between tables, returning the attnum of the newly created
column, returning the attnum of the added column.

Args:
  col_name: Name of the new column to be created in the referrer table, unquoted.
  rel_id: The OID of the referrer table, named for conrelid in the pg_attribute table.
  frel_id: The OID of the referent table, named for confrelid in the pg_attribute table.
  unique_link: Whether to make the link one-to-one instead of many-to-one.
*/
DECLARE
  pk_col_id smallint;
  col_defs jsonb;
  added_col_ids smallint[];
  con_defs jsonb;
BEGIN
  pk_col_id := msar.get_pk_column(frel_id);
  col_defs := jsonb_build_array(
    jsonb_build_object(
      'name', col_name,
      'type', jsonb_build_object('name', msar.get_column_type(frel_id, pk_col_id))
    )
  );
  added_col_ids := msar.add_columns(rel_id , col_defs , false);
  con_defs := jsonb_build_array(
    jsonb_build_object(
      'name', null,
      'type', 'f',
      'columns', added_col_ids,
      'deferrable', false,
      'fkey_relation_id', frel_id::integer,
      'fkey_columns', jsonb_build_array(pk_col_id)
    )
  );
  IF unique_link THEN
    con_defs := jsonb_build_array(
      jsonb_build_object(
        'name', null,
        'type', 'u',
        'columns', added_col_ids)
    ) || con_defs;
  END IF;
  PERFORM msar.add_constraints(rel_id , con_defs);
  RETURN added_col_ids[1];
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;

-- Create a Many-to-Many link ----------------------------------------------------------------------


CREATE OR REPLACE FUNCTION
msar.add_mapping_table(
  sch_id oid,
  tab_name text,
  mapping_columns jsonb
) RETURNS oid AS $$/*
Create a many-to-many link between tables, returning the oid of the newly created table.

Args:
  sch_id: The OID of the schema in which new referrer table is to be created.
  tab_name: Name of the referrer table to be created.
  mapping_columns: An array of objects giving the foreign key columns for the new table.

The elements of the mapping_columns array must have the form
  {"column_name": <str>, "referent_table_oid": <int>}

*/
DECLARE
  added_table_id oid;
BEGIN
  added_table_id := msar.add_mathesar_table(sch_id, tab_name, NULL, NULL, NULL, NULL, NULL) ->> 'oid';
  PERFORM msar.add_foreign_key_column(column_name, added_table_id, referent_table_oid)
  FROM jsonb_to_recordset(mapping_columns) AS x(column_name text, referent_table_oid oid);
  RETURN added_table_id;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- TABLE SPLITTING FUNCTIONS
--
-- Functions to extract columns from a table
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------


CREATE OR REPLACE FUNCTION
msar.extract_columns_from_table(
  tab_id oid, col_ids integer[], new_tab_name text, fk_col_name text
) RETURNS jsonb AS $f$/*
Extract columns from a table to create a new table, linked by a foreign key.

Args:
  tab_id: The OID of the table whose columns we'll extract
  col_ids: An array of the attnums of the columns to extract
  new_tab_name: The name of the new table to be made from the extracted columns, unquoted
  fk_col_name: The name to give the new foreign key column in the remainder table (optional)

The extraction takes a set of columns from the table, and creates a new table from the set of
*distinct* tuples those columns comprise. We also add a new foreign key column to the original
 (remainder) table that links it to the new extracted table so they can be easily rejoined. The
 extracted columns are removed from the remainder table.
*/
DECLARE
  extracted_col_defs CONSTANT jsonb := msar.get_extracted_col_def_jsonb(tab_id, col_ids);
  extracted_con_defs CONSTANT jsonb := msar.get_extracted_con_def_jsonb(tab_id, col_ids);
  fkey_name CONSTANT text := msar.build_unique_fkey_column_name(tab_id, fk_col_name, new_tab_name);
  extracted_table_id integer;
  fkey_attnum integer;
BEGIN
  -- Begin by creating a new table with column definitions matching the extracted columns.
  extracted_table_id := msar.add_mathesar_table(
    msar.get_relation_namespace_oid(tab_id),
    new_tab_name,
    NULL,
    extracted_col_defs,
    extracted_con_defs,
    NULL, -- own_id is set to NULL so the current role would be the owner of the extracted table.
    format('Extracted from %s', __msar.get_qualified_relation_name(tab_id))
  ) ->> 'oid';
  -- Create a new fkey column and foreign key linking the original table to the extracted one.
  fkey_attnum := msar.add_foreign_key_column(fkey_name, tab_id, extracted_table_id);
  -- Insert the data from the original table's columns into the extracted columns, and add
  -- appropriate fkey values to the new fkey column in the original table to give the proper
  -- mapping. That doesn't change the records; see mathesar_types.stamp_updated_at.
  PERFORM set_config('mathesar.keep_updated_at', 'on', true);
  EXECUTE format($t$
    WITH fkey_cte AS (
      SELECT id, %1$s, dense_rank() OVER (ORDER BY %1$s) AS __msar_tmp_id
      FROM %2$s
    ), ins_cte AS (
      INSERT INTO %3$s (%1$s)
      SELECT DISTINCT %1$s FROM fkey_cte ORDER BY %1$s
    )
    UPDATE %2$s SET %4$I=__msar_tmp_id FROM fkey_cte WHERE
    %2$s.id=fkey_cte.id
    $t$,
    -- %1$s  This is a comma separated string of the extracted column names
    string_agg(quote_ident(col_def ->> 'name'), ', '),
    -- %2$s  This is the name of the original (remainder) table
    __msar.get_qualified_relation_name(tab_id),
    -- %3$s  This is the new extracted table name
    __msar.get_qualified_relation_name(extracted_table_id),
    -- %4$I  This is the name of the fkey column in the remainder table.
    fkey_name
  ) FROM jsonb_array_elements(extracted_col_defs) AS col_def;
  PERFORM set_config('mathesar.keep_updated_at', 'off', true);
  -- Drop the original versions of the extracted columns from the original table.
  PERFORM msar.drop_columns(tab_id, variadic col_ids);
  -- In case the user wanted to give a name to the fkey column matching one of the extracted
  -- columns, perform that operation now (since the original will now be dropped from the original
  -- table)
  IF fk_col_name IS NOT NULL AND fk_col_name IN (
    SELECT col_def ->> 'name'
    FROM jsonb_array_elements(extracted_col_defs) AS col_def
  ) THEN
    PERFORM msar.rename_column(tab_id, fkey_attnum, fk_col_name);
  END IF;
  RETURN jsonb_build_array(extracted_table_id, fkey_attnum);
END;
$f$ LANGUAGE plpgsql;


----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- COLUMN MOVING FUNCTIONS
--
-- Functions to move columns between linked tables
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION
msar.build_all_columns_expr(tab_id regclass) RETURNS text AS $$/*
*/
SELECT string_agg(
  format(
    '%1$I.%2$I.%3$I AS %3$I',
    msar.get_relation_schema_name(tab_id),
    msar.get_relation_name(tab_id),
    attname
  ), ', '
)
FROM pg_catalog.pg_attribute
WHERE
  attrelid = tab_id
  AND attnum > 0
  AND NOT attisdropped;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.build_columns_expr(tab_id regclass, col_ids smallint[]) RETURNS text AS $$/*
*/
SELECT string_agg(
  format(
    '%1$I.%2$I.%3$I AS %3$I',
    msar.get_relation_schema_name(tab_id),
    msar.get_relation_name(tab_id),
    attname
  ), ', '
)
FROM pg_catalog.pg_attribute JOIN unnest(col_ids) x(a) ON attnum = x.a
WHERE
  attrelid = tab_id;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.build_unqualified_columns_expr(tab_id regclass, col_ids smallint[]) RETURNS text AS $$/*
*/
SELECT string_agg(format('%I', attname), ', ')
FROM pg_catalog.pg_attribute JOIN unnest(col_ids) x(a) ON attnum = x.a
WHERE
  attrelid = tab_id;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.get_other_column_ids(tab_id regclass, col_ids smallint[]) RETURNS smallint[] AS $$
SELECT array_agg(attnum)
FROM pg_catalog.pg_attribute
WHERE
  attrelid = tab_id
  AND attnum > 0
  AND NOT attisdropped
  AND attnum <> all(col_ids);
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.build_source_update_move_cols_equal_expr(
  source_tab_id regclass,
  move_col_ids smallint[],
  cte_name text
) RETURNS text AS $$
SELECT string_agg(
  format(
    -- TODO should be IS NOT DISTINCT FROM
    '%1$I.%2$I.%3$I = %4$I.%3$I',
    msar.get_relation_schema_name(source_tab_id),
    msar.get_relation_name(source_tab_id),
    attname,
    cte_name
  ), ' AND '
)
FROM pg_catalog.pg_attribute JOIN unnest(move_col_ids) x(a) ON attnum = x.a
WHERE
  attrelid = source_tab_id;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.build_source_update_cte_join_condition_expr(
  target_tab_id regclass,
  target_join_col_id smallint,
  added_col_ids smallint[],
  update_target_cte_name text,
  insert_cte_name text
) RETURNS text AS $$
SELECT 'ON ' || string_agg(
  format(
    '%1$I.%3$I IS NOT DISTINCT FROM %2$I.%3$I',
    update_target_cte_name,
    insert_cte_name,
    attname
  ), ' AND '
)
FROM
  pg_catalog.pg_attribute
  JOIN unnest(msar.get_other_column_ids(target_tab_id, added_col_ids || target_join_col_id)) x(a)
  ON attnum = x.a
WHERE
  attrelid = target_tab_id;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.move_columns_to_referenced_table(
  source_tab_id regclass,
  target_tab_id regclass,
  move_col_ids smallint[]
) RETURNS void AS $$
DECLARE
  source_join_col_id smallint;
  target_join_col_id smallint;
  preexisting_col_expr CONSTANT text := msar.build_all_columns_expr(target_tab_id);
  move_col_expr CONSTANT text := msar.build_columns_expr(source_tab_id, move_col_ids);
  move_col_defs CONSTANT jsonb := msar.get_extracted_col_def_jsonb(source_tab_id, move_col_ids);
  move_con_defs CONSTANT jsonb := msar.get_extracted_con_def_jsonb(source_tab_id, move_col_ids);
  added_col_ids smallint[];
BEGIN
  -- TODO Add a custom validator that throws pretty errors in these scenario:
    -- test to make sure no multi-col fkeys reference the moved columns
    -- just throw error if _any_ multicol constraint references the moved columns.
    -- check behavior if one of the moving columns is referenced by another table (should raise)
  SELECT conkey, confkey INTO source_join_col_id, target_join_col_id
    FROM msar.get_fkey_map_table(source_tab_id)
    WHERE target_oid = target_tab_id;
  IF move_col_ids @> ARRAY[source_join_col_id] THEN
    RAISE EXCEPTION 'The joining column cannot be moved.';
  END IF;
  added_col_ids := msar.add_columns(target_tab_id, move_col_defs, true);
  -- Moving columns doesn't change the records; see mathesar_types.stamp_updated_at.
  PERFORM set_config('mathesar.keep_updated_at', 'on', true);
  EXECUTE format(
    $q$WITH merged_cte AS (
      SELECT DISTINCT %1$s, %2$s
      FROM %3$I.%4$I JOIN %6$I.%7$I ON %3$I.%4$I.%5$I = %6$I.%7$I.%8$I
    ), row_numbered_cte AS (
      SELECT *, row_number() OVER (PARTITION BY %8$I ORDER BY %9$s) AS __msar_row_number
      FROM merged_cte
    ), update_target_cte AS (
      UPDATE %6$I.%7$I SET (%9$s) = (
        SELECT %9$s
        FROM row_numbered_cte
        WHERE row_numbered_cte.%8$I=%6$I.%7$I.%8$I
        AND __msar_row_number = 1
      )
      RETURNING *
    ), insert_cte AS (
      INSERT INTO %6$I.%7$I (%10$s)
      SELECT %10$s FROM row_numbered_cte
      WHERE __msar_row_number <> 1
      RETURNING *
    )
    UPDATE %3$I.%4$I SET %5$I = insert_cte.%8$I
    FROM update_target_cte JOIN insert_cte %11$s
    WHERE %3$I.%4$I.%5$I = update_target_cte.%8$I AND %12$s
    $q$,
    preexisting_col_expr,
    move_col_expr,
    msar.get_relation_schema_name(source_tab_id),
    msar.get_relation_name(source_tab_id),
    msar.get_column_name(source_tab_id, source_join_col_id),
    msar.get_relation_schema_name(target_tab_id),
    msar.get_relation_name(target_tab_id),
    msar.get_column_name(target_tab_id, target_join_col_id),
    msar.build_unqualified_columns_expr(source_tab_id, move_col_ids),
    msar.build_unqualified_columns_expr(
      target_tab_id, msar.get_other_column_ids(target_tab_id, ARRAY[target_join_col_id])
    ),
    msar.build_source_update_cte_join_condition_expr(
      target_tab_id, target_join_col_id, added_col_ids, 'update_target_cte', 'insert_cte'
    ),
    msar.build_source_update_move_cols_equal_expr(source_tab_id, move_col_ids, 'insert_cte')
  );
  PERFORM set_config('mathesar.keep_updated_at', 'off', true);
  PERFORM msar.add_constraints(target_tab_id, move_con_defs);
  PERFORM msar.drop_columns(source_tab_id, variadic move_col_ids);
END;
$$ LANGUAGE plpgsql;


----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------
-- DQL FUNCTIONS
--
-- This set of functions is for getting records from python.
----------------------------------------------------------------------------------------------------
----------------------------------------------------------------------------------------------------

-- Data type formatting functions


CREATE OR REPLACE FUNCTION msar.format_data(val date) RETURNS text AS $$
SELECT to_char(val, 'YYYY-MM-DD AD');
$$ LANGUAGE SQL IMMUTABLE RETURNS NULL ON NULL INPUT PARALLEL SAFE;


CREATE OR REPLACE FUNCTION msar.format_data(val time without time zone) RETURNS text AS $$
SELECT concat(to_char(val, 'HH24:MI'), ':', to_char(date_part('seconds', val), 'FM00.0999999999'));
$$ LANGUAGE SQL IMMUTABLE RETURNS NULL ON NULL INPUT PARALLEL SAFE;


CREATE OR REPLACE FUNCTION msar.format_data(val time with time zone) RETURNS text AS $$
SELECT CASE
  WHEN date_part('timezone_hour', val) = 0 AND date_part('timezone_minute', val) = 0
    THEN concat(
      to_char(date_part('hour', val), 'FM00'), ':', to_char(date_part('minute', val), 'FM00'),
      ':', to_char(date_part('seconds', val), 'FM00.0999999999'), 'Z'
    )
  ELSE
    concat(
      to_char(date_part('hour', val), 'FM00'), ':', to_char(date_part('minute', val), 'FM00'),
      ':', to_char(date_part('seconds', val), 'FM00.0999999999'),
      to_char(date_part('timezone_hour', val), 'S00'), ':',
      ltrim(to_char(date_part('timezone_minute', val), '00'), '+- ')
    )
END;
$$ LANGUAGE SQL IMMUTABLE RETURNS NULL ON NULL INPUT PARALLEL SAFE;


CREATE OR REPLACE FUNCTION msar.format_data(val timestamp without time zone) RETURNS text AS $$
SELECT
  concat(
    to_char(val, 'YYYY-MM-DD"T"HH24:MI'),
    ':', to_char(date_part('seconds', val), 'FM00.0999999999'),
    to_char(val, ' BC')
  );
$$ LANGUAGE SQL IMMUTABLE RETURNS NULL ON NULL INPUT PARALLEL SAFE;


CREATE OR REPLACE FUNCTION msar.format_data(val timestamp with time zone) RETURNS text AS $$
SELECT CASE
  WHEN date_part('timezone_hour', val) = 0 AND date_part('timezone_minute', val) = 0
    THEN concat(
      to_char(val, 'YYYY-MM-DD"T"HH24:MI'),
      ':', to_char(date_part('seconds', val), 'FM00.0999999999'), 'Z', to_char(val, ' BC')
    )
  ELSE
    concat(
      to_char(val, 'YYYY-MM-DD"T"HH24:MI'),
      ':', to_char(date_part('seconds', val), 'FM00.0999999999'),
      to_char(date_part('timezone_hour', val), 'S00'),
      ':', ltrim(to_char(date_part('timezone_minute', val), '00'), '+- '), to_char(val, ' BC')
    )
END;
$$ LANGUAGE SQL IMMUTABLE RETURNS NULL ON NULL INPUT PARALLEL SAFE;


CREATE OR REPLACE FUNCTION msar.format_data(val interval) returns text AS $$
SELECT concat(
  to_char(val, 'PFMYYYY"Y"FMMM"M"FMDD"D""T"FMHH24"H"FMMI"M"'), date_part('seconds', val), 'S'
);
$$ LANGUAGE SQL IMMUTABLE RETURNS NULL ON NULL INPUT PARALLEL SAFE;


CREATE OR REPLACE FUNCTION msar.format_data(val jsonb) returns text AS $$
SELECT val::text;
$$ LANGUAGE SQL IMMUTABLE RETURNS NULL ON NULL INPUT PARALLEL SAFE;


CREATE OR REPLACE FUNCTION msar.format_data(val jsonb[]) returns text[] AS $$
SELECT val::text[];
$$ LANGUAGE SQL IMMUTABLE RETURNS NULL ON NULL INPUT PARALLEL SAFE;


CREATE OR REPLACE FUNCTION msar.format_data(val json) returns text AS $$
SELECT val::text;
$$ LANGUAGE SQL IMMUTABLE RETURNS NULL ON NULL INPUT PARALLEL SAFE;


CREATE OR REPLACE FUNCTION msar.format_data(val json[]) returns text[] AS $$
SELECT val::text[];
$$ LANGUAGE SQL IMMUTABLE RETURNS NULL ON NULL INPUT PARALLEL SAFE;


CREATE OR REPLACE FUNCTION msar.format_data(val anyelement) returns anyelement AS $$
SELECT val;
$$ LANGUAGE SQL IMMUTABLE RETURNS NULL ON NULL INPUT PARALLEL SAFE;


CREATE TABLE msar.expr_templates (expr_key text PRIMARY KEY, expr_template text);
INSERT INTO msar.expr_templates VALUES
  -- basic logical operators
  ('and', '(%s) AND (%s)'),
  ('or', '(%s) OR (%s)'),
  ('not', 'NOT (%s)'),
  -- general comparison operators
  ('equal', '(%s) = (%s)'),
  ('lesser', '(%s) < (%s)'),
  ('greater', '(%s) > (%s)'),
  ('lesser_or_equal', '(%s) <= (%s)'),
  ('greater_or_equal', '(%s) >= (%s)'),
  ('null', '(%s) IS NULL'),
  ('not_null', '(%s) IS NOT NULL'),
  -- string specific filters
  ('contains_case_insensitive', 'strpos(lower(%s), lower(%s))::boolean'),
  ('starts_with_case_insensitive', 'starts_with(lower(%s), lower(%s))'),
  ('contains', 'strpos((%s), (%s))::boolean'),
  ('starts_with', 'starts_with((%s), (%s))'),
  -- IP specific filters
  ('in_network', '(%s) <<= (%s)::inet'),
  -- json(b) filters and expressions
  ('json_array_length', 'jsonb_array_length((%s)::jsonb)'),
  ('json_array_contains', '(%s)::jsonb @> (%s)::jsonb'),
  ('element_in_json_array_untyped', '(%s)::text IN (SELECT jsonb_array_elements_text(%s))'),
  ('convert_to_json', 'to_jsonb(%s)'),
  -- date part extractors
  ('truncate_to_year', 'to_char((%s)::date, ''YYYY AD'')'),
  ('truncate_to_month', 'to_char((%s)::date, ''YYYY-MM AD'')'),
  ('truncate_to_day', 'to_char((%s)::date, ''YYYY-MM-DD AD'')'),
  -- URI part getters
  ('uri_scheme', 'msar.uri_scheme(%s)'),
  ('uri_authority', 'msar.uri_authority(%s)'),
  -- Email part getters
  ('email_domain', 'msar.email_domain_name(%s)'),
  -- Data formatter which is sometimes useful in comparison
  ('format_data', 'msar.format_data(%s)')
;

CREATE OR REPLACE FUNCTION msar.build_expr(rel_id oid, tree jsonb) RETURNS text AS $$
SELECT CASE tree ->> 'type'
  WHEN 'literal' THEN format('%L', tree ->> 'value')
  WHEN 'attnum' THEN format('%I.%I', msar.get_relation_name(rel_id), msar.get_column_name(rel_id, (tree ->> 'value')::smallint))
  ELSE
    format(max(expr_template), VARIADIC array_agg(msar.build_expr(rel_id, inner_tree)))
END
FROM jsonb_array_elements(tree -> 'args') inner_tree, msar.expr_templates
WHERE tree ->> 'type' = expr_key
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.build_where_clause(rel_id oid, tree jsonb) RETURNS text AS $$
SELECT 'WHERE ' || msar.build_expr(rel_id, tree);
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.sanitize_direction(direction text) RETURNS text AS $$/*
*/
SELECT CASE lower(direction)
  WHEN 'asc' THEN 'ASC'
  WHEN 'desc' THEN 'DESC'
END;
$$ LANGUAGE SQL IMMUTABLE RETURNS NULL ON NULL INPUT PARALLEL SAFE;


CREATE OR REPLACE FUNCTION msar.get_pkey_order(tab_id oid) RETURNS jsonb AS $$
SELECT jsonb_agg(jsonb_build_object('attnum', attnum, 'direction', 'asc'))
FROM pg_catalog.pg_constraint, LATERAL unnest(conkey) attnum
WHERE contype='p' AND conrelid=tab_id AND has_column_privilege(tab_id, attnum, 'SELECT');
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.get_total_order(tab_id oid) RETURNS jsonb AS $$
WITH orderable_cte AS (
  SELECT DISTINCT attnum
  FROM pg_catalog.pg_attribute
    INNER JOIN pg_catalog.pg_type ON atttypid = pg_type.oid
    INNER JOIN pg_catalog.pg_opclass ON (
      pg_type.oid = opcintype
      OR pg_type.oid = opckeytype
      OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_cast
        WHERE castsource = pg_type.oid
          AND casttarget = opcintype
          AND castmethod = 'b'
      )
    )
    INNER JOIN pg_catalog.pg_am ON opcmethod = pg_am.oid
  WHERE
    attrelid = tab_id
    AND attnum > 0
    AND NOT attisdropped
    AND amname = 'btree'
    AND opcdefault = true
    AND has_column_privilege(tab_id, attnum, 'SELECT')
  ORDER BY attnum
)
SELECT COALESCE(jsonb_agg(jsonb_build_object('attnum', attnum, 'direction', 'asc') ORDER BY attnum), '[]'::jsonb)
FROM orderable_cte
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.build_total_order_expr(tab_id oid, order_ jsonb) RETURNS text AS $$/*
Build a deterministic order expression for the given table and order JSON.
Args:
  tab_id: The OID of the table whose columns we'll order by.
  order_: A JSONB array defining any desired ordering of columns.
*/
SELECT string_agg(format('%I %s', attnum, msar.sanitize_direction(direction)), ', ')
FROM jsonb_to_recordset(
    COALESCE(
      COALESCE(order_, '[]'::jsonb) || msar.get_pkey_order(tab_id),
      COALESCE(order_, '[]'::jsonb) || msar.get_total_order(tab_id)
    )
)
  AS x(attnum smallint, direction text)
WHERE has_column_privilege(tab_id, attnum, 'SELECT');
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
msar.build_order_by_expr(tab_id oid, order_ jsonb) RETURNS text AS $$/*
Build an ORDER BY expression for the given table and order JSON.

The ORDER BY expression will refer to columns by their attnum. This is designed to work together
with `msar.build_selectable_column_expr`. It will only use the columns to which the user has access.
Finally, this function will append either a primary key, or all columns to the produced ORDER BY so
the resulting ordering is totally defined (i.e., deterministic).

Args:
  tab_id: The OID of the table whose columns we'll order by.
  order_: A JSONB array defining any desired ordering of columns.
*/
SELECT 'ORDER BY ' || msar.build_total_order_expr(tab_id, order_)
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
msar.build_grouping_columns_expr(tab_id oid, group_ jsonb) RETURNS TEXT AS $$/*
Build a column expression for use in grouping window functions.

Args:
  tab_id: The OID of the table whose records we're grouping
  group_ A grouping definition.

The group_ object should have the form
    {
      "columns": [<int>, <int>, ...]
      "preproc": [<str>, <str>, ...]
    }

The items in the preproc array should be keys appearing in the
`expr_templates` table. The corresponding column will be wrapped
in the preproc function before grouping.
*/
SELECT string_agg(
  COALESCE(
    format(
      expr_template,
      quote_ident(msar.get_relation_name(tab_id))
      || '.' ||
      quote_ident(msar.get_column_name(tab_id, col_id::smallint))
    ),
    quote_ident(msar.get_relation_name(tab_id))
    || '.' ||
    quote_ident(msar.get_column_name(tab_id, col_id::smallint))
  ), ', ' ORDER BY ordinality
)
FROM msar.expr_templates RIGHT JOIN ROWS FROM(
  jsonb_array_elements_text(group_ -> 'columns'),
  jsonb_array_elements_text(group_ -> 'preproc')
) WITH ORDINALITY AS x(col_id, preproc) ON expr_key = preproc
WHERE has_column_privilege(tab_id, col_id::smallint, 'SELECT');
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.build_group_id_expr(tab_id oid, group_ jsonb) RETURNS TEXT AS $$/*
Build an expression to define an id value for each group.
*/
SELECT 'dense_rank() OVER (ORDER BY ' || msar.build_grouping_columns_expr(tab_id, group_) || ')';
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.build_group_count_expr(tab_id oid, group_ jsonb) RETURNS TEXT AS $$/*
Build an expression that adds a column with a count for each group.
*/
SELECT 'count(1) OVER (PARTITION BY ' || msar.build_grouping_columns_expr(tab_id, group_) || ')';
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.build_grouping_expr(tab_id oid, group_ jsonb) RETURNS TEXT AS $$/*
Build an expression composed of an id and count for each group.

A group is defined by distinct combinations of the (potentially transformed by preproc functions)
columns passed in `group_`.
*/
SELECT concat(
  COALESCE(msar.build_group_id_expr(tab_id, group_), 'NULL'), ' AS __mathesar_gid, ',
  COALESCE(msar.build_group_count_expr(tab_id, group_), 'NULL'), ' AS __mathesar_gcount'
);
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
msar.build_results_jsonb_array_expr(
  cte_name text,
  order_by_expr text
) RETURNS TEXT AS $$/*
Build an SQL expresson string that, when added to the record listing query, produces a JSON array
with the records resulting from the request.
*/
SELECT format(
  $j$
    COALESCE(
      jsonb_agg(
        to_jsonb(%2$I) - %3$L - %4$L %1$s
      ), jsonb_build_array()
    )
  $j$,
  /* %1 */ order_by_expr,
  /* %2 */ cte_name,
  /* %3 */ '__mathesar_gid',
  /* %4 */ '__mathesar_gcount'
);
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
msar.build_results_setof_jsonb_expr(
  cte_name text
) RETURNS TEXT AS $$/*
Build an SQL expresson string that, when added to the record listing query, produces a setof jsonb
results with the records resulting from the request.
*/
SELECT format(
  'to_jsonb(%1$I) - %2$L - %3$L',
  /* %1 */ cte_name,
  /* %2 */ '__mathesar_gid',
  /* %3 */ '__mathesar_gcount'
);
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
msar.build_results_eq_cte_expr(tab_id oid, cte_name text, group_ jsonb) RETURNS TEXT AS $$
SELECT string_agg(
  format(
    '%1$s AS %2$I',
    COALESCE(
      format(expr_template, quote_ident(cte_name) || '.' || quote_ident(col_id)),
      quote_ident(cte_name) || '.' || quote_ident(col_id)
    ),
    col_id
  ),
  ', ' ORDER BY ordinality
) || ', __mathesar_gid FROM ' || quote_ident(cte_name)
|| ' GROUP BY __mathesar_gid, '
|| string_agg(
  format(
    '%1$I',
    col_id
  ),
  ', ' ORDER BY ordinality
)
FROM msar.expr_templates RIGHT JOIN ROWS FROM(
  jsonb_array_elements_text(group_ -> 'columns'),
  jsonb_array_elements_text(group_ -> 'preproc')
) WITH ORDINALITY AS x(col_id, preproc) ON expr_key = preproc
WHERE has_column_privilege(tab_id, col_id::smallint, 'SELECT');
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.build_groups_cte_expr(tab_id oid, eq_cte_name text, ranked_cte_name text, group_ jsonb) RETURNS TEXT AS $$/*
*/
SELECT format(
  $gj$
    %1$I.__mathesar_gid AS id,
    __mathesar_gcount AS count,
    to_jsonb(%1$I) - '__mathesar_gid' AS results_eq,
    jsonb_agg( DISTINCT __mathesar_result_idx) AS result_indices
  FROM %1$I LEFT JOIN %2$I AS rcn ON %1$I.__mathesar_gid = rcn.__mathesar_gid
  GROUP BY id, count, results_eq
  $gj$,
  eq_cte_name,
  ranked_cte_name
);
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.build_grouping_results_jsonb_expr(tab_id oid, cte_name text, group_ jsonb) RETURNS TEXT AS $$/*
Build an SQL expresson string that, when added to the record listing query, produces a JSON array
with the groups resulting from the request.
*/
SELECT format(
  $gj$
  jsonb_build_object(
    'columns', %2$L::jsonb,
    'preproc', %3$L::jsonb,
    'groups', jsonb_agg(
      DISTINCT jsonb_build_object(
        'id', %1$I.id,
        'count', %1$I.count,
        'results_eq', %1$I.results_eq,
        'result_indices', %1$I.result_indices
      )
    )
  )
  $gj$,
  cte_name,
  group_ ->> 'columns',
  group_ ->> 'preproc'
)
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.get_selectable_columns(tab_id oid) RETURNS jsonb AS $$/*
Returns a jsonb object with the columns to which the user has access.

Given columns with attnums 2, 3, and 4, and assuming the user has access only to columns 2 and 4,
this function will return a jsonb as follows:

{ "2": <name of column with oid 2>, "4": <name of column with oid 4> }

Args:
  tab_id: The OID of the table containing the columns to select.
*/
SELECT coalesce(jsonb_object_agg(attnum, attname), '{}'::jsonb)
FROM pg_catalog.pg_attribute
WHERE
  attrelid = tab_id
  AND attnum > 0
  AND NOT attisdropped
  AND has_column_privilege(attrelid, attnum, 'SELECT');
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.build_column_expr(tab_name text, columns jsonb) RETURNS text AS $$/*
Build an SQL select-target expression of columns from the argument.
This is meant to work together with output of functions like msar.get_selectable_columns.

Returns an expr in the form: msar.format_data("<column name>") as "<oid>", ...

Args:
  tab_name: The unqoted name of the table for namespacing.
  columns: The columns to build the expr for, in the following jsonb sample format:
           { "2": <name of column with oid 2>, "4": <name of column with oid 4> }

*/
SELECT string_agg(
  format(
    'msar.format_data(%I.%I) AS %I',
    tab_name,
    sel_column.value,
    sel_column.key
  ),
  ', '
)
FROM jsonb_each_text(columns) as sel_column;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.build_selectable_column_expr(tab_id oid) RETURNS text AS $$/*
Build an SQL select-target expression of only columns to which the user has access.

Given columns with attnums 2, 3, and 4, and assuming the user has access only to columns 2 and 4,
this function will return an expression of the form:

msar.format_data("column_name") AS "2", msar.format_data("another_column_name") AS "4"

Args:
  tab_id: The OID of the table containing the columns to select.
*/
SELECT msar.build_column_expr(msar.get_relation_name(tab_id), msar.get_selectable_columns(tab_id));
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.get_default_summary_column(tab_id oid) RETURNS smallint AS $$/*
Choose a column to use for summarizing rows of a table.

If a string type column exists, we choose the one with a minimal attnum. If no such column exists,
we just return the column (of any type) with minimum attnum.

Only columns to which the user has access are returned.

Args:
  tab_id: The OID of the table for which we're finding a good summary column
*/
SELECT attnum
FROM pg_catalog.pg_attribute pga JOIN pg_catalog.pg_type pgt ON pga.atttypid = pgt.oid
WHERE pga.attrelid = tab_id
  AND pga.attnum > 0
  AND NOT pga.attisdropped
  AND has_column_privilege(pga.attrelid, pga.attnum, 'SELECT')
ORDER BY (CASE WHEN pgt.typcategory='S' THEN 0 ELSE 1 END), pga.attnum
LIMIT 1;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.build_empty_record_summary_query() RETURNS TEXT AS $$/*
  Returns a stringified query structured consistently with a record summary query but which will
  yield no record summaries when run.
*/
  SELECT $q$ SELECT NULL AS key, NULL AS summary WHERE FALSE $q$;
$$ LANGUAGE SQL IMMUTABLE PARALLEL SAFE;


CREATE OR REPLACE FUNCTION msar.build_record_summary_query_from_template(
  tab_id oid,
  key_col_id smallint,
  template jsonb
) RETURNS text AS $$/*
  Given a table OID and a record summary template, this function returns a query that can be used to
  generate record summaries for the table.

  Args:
    tab_id: The OID of the table for which to generate a record summary query.
    template: A JSON array that represents the record summary template (described in detail below).

  Example template:

    [
      "#",
      [1],
      " - ",
      [2, 5],
      " - ",
      [2, 5, 10]
    ]

  A string entry in the template represents static text to be included in the record summary
  verbatim.

  An array entry in the template represents a reference to data. Each element in the array is a
  column attnum. The first column attnum refers to a column in the base table. If the array
  contains more than one column reference, it represents a chain of FK columns starting from
  the base table and ending with a non-FK column. This function follows the foreign keys to
  produce the joins. Multi-column FK constraints are not supported.

  Return value: a stringified query which produces a result set matching the structure described
    in the return value of msar.get_record_summaries_via_query.
*/
DECLARE
  base_alias CONSTANT text := 'base';
  expr_parts text[] := ARRAY[]::text[];
  expr text;
  base_sch_name text := msar.get_relation_schema_name(tab_id);
  base_tab_name text := msar.get_relation_name(tab_id);
  base_key_col_name text := msar.get_column_name(tab_id, key_col_id);
  template_part jsonb;
  join_clauses text[] := ARRAY[]::text[];
  join_section text;
BEGIN
  IF key_col_id IS NULL THEN
    -- If we don't have a key column, then we can't generate a record summary query.
    RETURN msar.build_empty_record_summary_query();
  END IF;

  IF NOT pg_catalog.has_column_privilege(tab_id, key_col_id, 'SELECT') THEN
    -- If we don't have permission to select the key column, then we can't generate a record
    RETURN msar.build_empty_record_summary_query();
  END IF;

  IF jsonb_typeof(template) <> 'array' THEN
    RAISE EXCEPTION 'Record summary template must be a JSON array.';
  END IF;

  <<template_parts_loop>>
  FOR template_part IN SELECT jsonb_array_elements(template) LOOP
    DECLARE
      ref_chain smallint[] := msar.extract_smallints(template_part);
      ref_chain_length integer := array_length(ref_chain, 1);
      fk_col_id smallint;
      contextual_tab_id oid := tab_id;
      prev_alias text := base_alias;
      ref_col_id smallint;
      ref_col_name text;
    BEGIN
      -- Column reference template parts
      IF ref_chain_length > 0 THEN
        -- Except for the final ref_chain element, process all array elements as attnums of FK
        -- columns.
        FOREACH fk_col_id IN ARRAY ref_chain[1:ref_chain_length-1] LOOP
          DECLARE
            fk_col_name text;
            ref_tab_id oid;
            ref_sch_name text;
            ref_tab_name text;
            alias text;
            join_clause text;
          BEGIN
            IF NOT pg_catalog.has_column_privilege(contextual_tab_id, fk_col_id, 'SELECT') THEN
              -- Silently ignore FK columns that we don't have permissions to select.
              CONTINUE template_parts_loop;
            END IF;

            fk_col_name := msar.get_column_name(contextual_tab_id, fk_col_id);

            IF fk_col_name IS NULL THEN
              -- Silently ignore references to non-existing FK columns. This can happen if a column
              -- has been deleted.
              CONTINUE template_parts_loop;
            END IF;

            SELECT confrelid, confkey[1] INTO ref_tab_id, ref_col_id
            FROM pg_catalog.pg_constraint
            WHERE contype = 'f' AND conrelid = contextual_tab_id AND conkey = array[fk_col_id];

            IF ref_tab_id IS NULL THEN
              -- Silently ignore references to non-FK columns. This can happen if the constraint
              -- has been dropped.
              CONTINUE template_parts_loop;
            END IF;

            IF NOT pg_catalog.has_column_privilege(ref_tab_id, ref_col_id, 'SELECT') THEN
              -- Silently ignore FK columns which point to columns that we don't have permission to
              -- select.
              CONTINUE template_parts_loop;
            END IF;

            ref_tab_name := msar.get_relation_name(ref_tab_id);
            ref_sch_name := msar.get_relation_schema_name(ref_tab_id);
            ref_col_name := msar.get_column_name(ref_tab_id, ref_col_id);
            alias := concat(prev_alias, '_', fk_col_id);
            join_clause := concat(
              'LEFT JOIN ',
              quote_ident(ref_sch_name), '.', quote_ident(ref_tab_name),
              ' AS ', alias,
              ' ON ',
              alias, '.', quote_ident(ref_col_name),
              ' = ',
              prev_alias, '.', quote_ident(fk_col_name)
            );

            IF NOT join_clauses @> ARRAY[join_clause] THEN
              join_clauses := array_append(join_clauses, join_clause);
            END IF;
            prev_alias := alias;
            contextual_tab_id := ref_tab_id;
          END;
        END LOOP;

        ref_col_id := ref_chain[ref_chain_length];

        IF NOT pg_catalog.has_column_privilege(contextual_tab_id, ref_col_id, 'SELECT') THEN
          -- Silently ignore the final column reference if we don't have permission to select it.
          CONTINUE template_parts_loop;
        END IF;

        ref_col_name := msar.get_column_name(contextual_tab_id, ref_col_id);
        IF ref_col_name IS NOT NULL THEN
          expr_parts := array_append(
            expr_parts,
            concat(
              'COALESCE(msar.format_data(',
              prev_alias, '.', quote_ident(ref_col_name),
              E')::text, \'\')'
            )
          );
        END IF;

      -- String literal template parts
      ELSIF jsonb_typeof(template_part) = 'string' THEN
        expr_parts := array_append(expr_parts, quote_literal(template_part #>> '{}'));
      END IF;
    END;
  END LOOP;

  IF cardinality(expr_parts) = 0 THEN
    -- If the template didn't give us anything to render, then we show '?' as a fallback. This can
    -- happen if (e.g.) the template only contains a reference which is no longer valid due to a
    -- column being deleted.
    expr_parts := array_append(expr_parts, quote_literal('?'));
  END IF;

  join_section := CASE
    WHEN array_length(join_clauses, 1) = 0 THEN ''
    ELSE E'\n' || array_to_string(join_clauses, E'\n')
  END;

  expr := array_to_string(expr_parts, E'\n    || ');

  RETURN concat(
    E'SELECT \n',
    '  ', base_alias, '.', quote_ident(base_key_col_name), E' AS key, \n',
    '  ', expr, E' AS summary \n',
    'FROM ',
    quote_ident(base_sch_name), '.', quote_ident(base_tab_name),
    ' AS ', base_alias,
    join_section
  );
END;
$$ LANGUAGE plpgsql STABLE;


CREATE OR REPLACE FUNCTION
msar.auto_generate_record_summary_template(
  tab_id oid
) RETURNS jsonb AS $$/*
  Given a table OID, this function generates a record summary template for the table. The template
  is generated by picking the best column to use for the record summary and wrapping it in an array.

  Args:
    tab_id: The OID of the table for which to generate a record summary template.

  Return value:
    A JSON array that represents the record summary template as described in
      msar.build_record_summary_query_from_template. The array contains a single element which is an
      array of column attnums. The column attnum is the best column to use for the record summary.
*/
SELECT jsonb_build_array(jsonb_build_array(msar.get_default_summary_column(tab_id)));
$$ LANGUAGE sql STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.build_record_summary_query_for_table(
  tab_id oid,
  key_col_id smallint DEFAULT NULL,
  table_record_summary_templates jsonb DEFAULT '{}'::jsonb
) RETURNS TEXT AS $$/*
Return text for an SQL query that will summarize records from a table.

Args:
  tab_id: the OID of the table for which we're getting summaries.
  key_col_id: (optional) This is a column attnum in the table. When given, this column will be used
    as the key in the summary. If not given, the table's PK column will be used.
  table_record_summary_templates: (optional) A JSON object that maps table OIDs to record summary
    templates.
*/
SELECT msar.build_record_summary_query_from_template(
  tab_id,
  COALESCE(key_col_id, msar.get_selectable_pkey_attnum(tab_id)),
  COALESCE(
    NULLIF(table_record_summary_templates -> tab_id::text, 'null'::jsonb),
    msar.auto_generate_record_summary_template(tab_id)
  )
);
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION msar.build_linked_record_summaries_ctes(
  tab_id oid,
  table_record_summary_templates jsonb DEFAULT NULL
) RETURNS TEXT AS $$/*
Build an SQL text expression defining a sequence of CTEs that give summaries for linked records.

Args:
  tab_id: The table for whose fkey values' linked records we'll get summaries.
*/
SELECT
  ', ' ||
  NULLIF(
    string_agg(
      format(
        $q$summary_cte_%1$s AS (%2$s)$q$,
        conkey,
        msar.build_record_summary_query_for_table(
          target_oid,
          confkey,
          table_record_summary_templates
        )
      ),
      ', '
    ),
    ''
  )
FROM msar.get_fkey_map_table(tab_id)
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION msar.build_joined_columns_summaries_ctes(
  results_cte_name text,
  joined_columns jsonb,
  table_record_summary_templates jsonb DEFAULT NULL
) RETURNS TEXT AS $$/*
Build an SQL text expression defining a sequence of CTEs that give summaries for joined columns.

Args:
  results_cte_name: The name of the results cte.
  joined_columns: A jsonb list defining columns joined via a simple many-to-many linkage.
    See msar.get_joined_columns_expr_json for more details.
  table_record_summary_templates: (optional) A JSON object that maps table OIDs to record summary
    templates.
*/
SELECT
  ', ' ||
  NULLIF(
    string_agg(
      format(
        $q$ %1$I AS (
          %3$s
          RIGHT JOIN %4$I ON to_jsonb(base.id) <@ (%4$I.%2$I->'result')
        )$q$, /* This join helps us filter distinct record summaries based on the result
        of aggregated records of the joined columns */
        alias || '_cte',
        alias,
        msar.build_record_summary_query_for_table(
          (join_path->-1->-1->>0)::oid,
          (join_path->-1->-1->>1)::smallint,
          table_record_summary_templates
        ),
        results_cte_name
      ),
      ', '
    ),
    ''
  )
FROM jsonb_to_recordset(joined_columns) AS (
  alias text,
  join_path jsonb
)
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION msar.build_joined_columns_summaries_expr(
  joined_columns jsonb
) RETURNS TEXT AS $$/*
Returns a SELECT SQL expr for aggregating record summaries
from the ctes generated via msar.build_joined_columns_summaries_ctes.

Args:
  joined_columns: A jsonb list defining columns joined via a simple many-to-many linkage.
    See msar.get_joined_columns_expr_json for more details.
*/
SELECT 'SELECT '
|| string_agg(
  format(
    $j$
      COALESCE(
        jsonb_object_agg(
          %1$I.key, %1$I.summary
        ) FILTER (WHERE %1$I.key IS NOT NULL), '{}'::jsonb
      ) AS %2$I
    $j$,
    alias || '_cte',
    alias
  ), ', '
)
|| ' FROM ' || string_agg(format('%I', alias || '_cte'), ', ')
FROM jsonb_to_recordset(joined_columns) AS (
  alias text,
  join_path jsonb
)
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
msar.build_summary_join_expr_for_table(tab_id oid, cte_name text) RETURNS TEXT AS $$/*
Build an SQL expression to join the summary CTEs to the main CTE along fkey values.

Args:
  tab_oid: The table defining the columns of the main CTE.
  cte_name: The name of the main CTE we'll join the summary CTEs to.
*/
WITH fkey_map_cte AS (SELECT * FROM msar.get_fkey_map_table(tab_id))
SELECT concat(
  format(E'\nLEFT JOIN summary_cte_self ON %1$I.', cte_name)
  || quote_ident(msar.get_selectable_pkey_attnum(tab_id)::text)
  || ' = summary_cte_self.key' ,
  string_agg(
    format(
      $j$
      LEFT JOIN summary_cte_%1$s ON %2$I.%1$I = summary_cte_%1$s.key$j$,
      conkey,
      cte_name
    ), ' '
  )
)
FROM fkey_map_cte;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.build_summary_json_expr_for_table(tab_id oid) RETURNS TEXT AS $$/*
Build a JSON object with the results of summarizing linked records.

Args:
  tab_oid: The OID of the table for which we're getting linked record summaries.
*/
WITH fkey_map_cte AS (SELECT * FROM msar.get_fkey_map_table(tab_id))
SELECT string_agg(
  format(
    $j$
      COALESCE(
        jsonb_object_agg(
          summary_cte_%1$s.key, summary_cte_%1$s.summary
        ) FILTER (WHERE summary_cte_%1$s.key IS NOT NULL), '{}'::jsonb
      ) AS %1$I
    $j$,
    conkey
  ), ', '
)
FROM fkey_map_cte;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.build_self_summary_json_expr(tab_id oid) RETURNS TEXT AS $$/*
*/
SELECT CASE WHEN quote_ident(msar.get_selectable_pkey_attnum(tab_id)::text) IS NOT NULL THEN
  $j$
  COALESCE(
    jsonb_object_agg(
      summary_cte_self.key, summary_cte_self.summary
    ) FILTER (WHERE summary_cte_self.key IS NOT NULL), '{}'::jsonb
  ) AS summary_self
  $j$
END;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.build_record_list_query_components_with_ctes(
  tab_id oid,
  limit_ integer,
  offset_ integer,
  order_ jsonb,
  filter_ jsonb,
  group_ jsonb,
  joined_columns jsonb
) RETURNS jsonb AS $$/*
  Constructs the components necessary for generating enriched query results,
  including expressions, clauses, selectable_column list, and CTEs, for a table.

  Args:
    tab_id: The OID of the table whose records we'll get
    limit_: The maximum number of rows we'll return
    offset_: The number of rows to skip before returning records from following rows
    order_: An array of ordering definition objects
    filter_: An array of filter definition objects
    group_: An array of group definition objects
    joined_columns: (optional) A jsonb list defining columns joined via a simple many-to-many linkage.
      See msar.get_joined_columns_expr_json for more details.

  Behavior:
    Fetches metadata about the table (selectable_column list, schema name, table name etc.,)
    Constructs expressions and SQL snippets (SELECT, WHERE, GROUP BY, etc.,)
    Generates two SQL queries:
      1. A query for paginated results (`results_cte_query`).
      2. A query to count the total matching rows (`count_cte_query`).
    Returns a jsonb object combining metadata, the expressions, and the generated SQL queries.
*/
DECLARE
  expr_object jsonb;
  joinable_expr_object jsonb;
  results_cte_query text;
  count_cte_query text;
BEGIN
  SELECT jsonb_build_object(
    'relation_name', msar.get_relation_name(tab_id),
    'relation_schema_name', msar.get_relation_schema_name(tab_id),
    'selectable_columns_expr', msar.build_selectable_column_expr(tab_id),
    'grouping_expr', msar.build_grouping_expr(tab_id, group_),
    'order_by_expr', msar.build_order_by_expr(tab_id, order_),
    'where_clause', msar.build_where_clause(tab_id, filter_)
  ) INTO expr_object;

  joinable_expr_object :=
    CASE
      WHEN joined_columns IS NOT NULL THEN
        msar.get_joined_columns_expr_json(joined_columns)
      ELSE NULL
    END;

  SELECT format(
    $q$SELECT %1$s, %2$s FROM %3$I.%4$I %5$s %6$s %7$s %8$s LIMIT %9$L OFFSET %10$L$q$,
    /* %1 */ CONCAT_WS(
               ', ',
               COALESCE(expr_object ->> 'selectable_columns_expr', 'NULL'),
               joinable_expr_object ->> 'selectable_joined_columns_expr'
             ),
    /* %2 */ COALESCE(expr_object ->> 'grouping_expr', 'NULL'),
    /* %3 */ expr_object ->> 'relation_schema_name',
    /* %4 */ expr_object ->> 'relation_name',
    /* %5 */ joinable_expr_object ->> 'join_sql_expr',
    /* %6 */ expr_object ->> 'where_clause',
    /* %7 */ joinable_expr_object ->> 'join_group_by_expr',
    /* %8 */ expr_object ->> 'order_by_expr',
    /* %9 */ limit_,
    /* %10 */ offset_
  ) INTO results_cte_query;

  SELECT format(
    $q$SELECT count(1) AS count FROM %1$I.%2$I %3$s$q$,
    expr_object ->> 'relation_schema_name',
    expr_object ->> 'relation_name',
    expr_object ->> 'where_clause'
  ) INTO count_cte_query;

  RETURN expr_object || jsonb_build_object(
    'results_cte_query', results_cte_query,
    'count_cte_query', count_cte_query
  );
END
$$ LANGUAGE plpgsql STABLE;


CREATE OR REPLACE FUNCTION
msar.list_records_from_table(
  tab_id oid,
  limit_ integer,
  offset_ integer,
  order_ jsonb,
  filter_ jsonb,
  group_ jsonb,
  joined_columns jsonb DEFAULT NULL,
  return_record_summaries boolean DEFAULT false,
  table_record_summary_templates jsonb DEFAULT NULL
) RETURNS jsonb AS $$/*
Get records from a table. Only columns to which the user has access are returned.

Args:
  tab_id: The OID of the table whose records we'll get
  limit_: The maximum number of rows we'll return
  offset_: The number of rows to skip before returning records from following rows.
  order_: An array of ordering definition objects.
  filter_: An array of filter definition objects.
  group_: An array of group definition objects.
  joined_columns: (optional) A jsonb list defining columns joined via a simple many-to-many linkage.
    See msar.get_joined_columns_expr_json for more details.
  return_record_summaries : Whether to return a summary for each record listed.
  table_record_summary_templates: (optional) A JSON object that maps table OIDs to record summary
    templates.

The order definition objects should have the form
  {"attnum": <int>, "direction": <text>}
*/
DECLARE
  expr_and_ctes jsonb;
  records jsonb;
BEGIN
  SELECT msar.build_record_list_query_components_with_ctes(
    tab_id,
    limit_,
    offset_,
    order_,
    filter_,
    group_,
    joined_columns
  ) INTO expr_and_ctes;

  EXECUTE format(
    $q$
    WITH
    count_cte AS ( %1$s ),
    enriched_results_cte AS ( %2$s ),
    results_ranked_cte AS (
      SELECT *, row_number() OVER (%3$s) - 1 AS __mathesar_result_idx FROM enriched_results_cte
    ),
    results_eq_cte AS (
      SELECT %11$s
    ),
    groups_cte AS ( SELECT %6$s ),
    summary_cte_self AS (%7$s)
    %8$s,
    summary_cte AS ( SELECT %10$s FROM enriched_results_cte %9$s )
    %12$s,
    joined_columns_summary_cte AS (%13$s),
    summaries_json_cte AS ( 
      SELECT
        jsonb_build_object(
          'linked_record_summaries',
          NULLIF(
            to_jsonb(summary_cte) - 'summary_self' - 'count_hack',
            '{}'::jsonb
          ),
          'record_summaries',
          NULLIF(
            to_jsonb(summary_cte) - 'count_hack' -> 'summary_self',
            '{}'::jsonb
          ),
          'joined_record_summaries', NULLIF(
            to_jsonb(joined_columns_summary_cte) - 'count_hack',
            '{}'::jsonb
          )
        )
      AS sj
      FROM summary_cte, joined_columns_summary_cte
    ),
    records_json_cte AS ( SELECT jsonb_build_object(
      'results', %4$s,
      'count', coalesce(max(count_cte.count), 0),
      'grouping', %5$s
    ) AS rj
    FROM enriched_results_cte
      LEFT JOIN groups_cte ON enriched_results_cte.__mathesar_gid = groups_cte.id
      CROSS JOIN count_cte
    )
    SELECT records_json_cte.rj || summaries_json_cte.sj
    FROM records_json_cte, summaries_json_cte;
    $q$,
    /* %1 */ expr_and_ctes ->> 'count_cte_query',
    /* %2 */ expr_and_ctes ->> 'results_cte_query',
    /* %3 */ expr_and_ctes ->> 'order_by_expr',
    /* %4 */ COALESCE(
      msar.build_results_jsonb_array_expr(
        'enriched_results_cte',
        expr_and_ctes ->> 'order_by_expr'
      ),
      'NULL'
    ),
    /* %5 */ COALESCE(
      msar.build_grouping_results_jsonb_expr(tab_id, 'groups_cte', group_),
      'NULL'
    ),
    /* %6 */ COALESCE(
      msar.build_groups_cte_expr(tab_id, 'results_eq_cte', 'results_ranked_cte', group_),
      'NULL AS id'
    ),
    /* %7 */ msar.build_record_summary_query_for_table(
      tab_id,
      null,
      table_record_summary_templates
    ),
    /* %8 */ msar.build_linked_record_summaries_ctes(
      tab_id,
      table_record_summary_templates
    ),
    /* %9 */ msar.build_summary_join_expr_for_table(tab_id, 'enriched_results_cte'),
    /* %10 */ COALESCE(
      NULLIF(
        concat_ws(', ',
          msar.build_summary_json_expr_for_table(tab_id),
          CASE WHEN return_record_summaries
          THEN msar.build_self_summary_json_expr(tab_id)
          END
        ), ''
      ), 'COUNT(1) AS count_hack'
      -- count_hack ensures that summary_cte is not empty,
      -- which in turn helps to generate summaries_json_cte
    ),
    /* %11 */ msar.build_results_eq_cte_expr(tab_id, 'results_ranked_cte', group_),
    /* %12 */ msar.build_joined_columns_summaries_ctes(
      'enriched_results_cte',
      joined_columns,
      table_record_summary_templates
    ),
    /* %13 */ COALESCE(
      NULLIF(msar.build_joined_columns_summaries_expr(joined_columns), ''),
      'SELECT COUNT(1) AS count_hack'
    )
  ) INTO records;
  RETURN records;
END;
$$ LANGUAGE plpgsql STABLE;


CREATE OR REPLACE FUNCTION
msar.get_table_columns_and_records(
  tab_id oid,
  limit_ integer,
  offset_ integer,
  order_ jsonb,
  filter_ jsonb
) RETURNS SETOF jsonb AS $$
DECLARE
  expr_and_ctes jsonb;
BEGIN
  SELECT msar.build_record_list_query_components_with_ctes(
    tab_id,
    limit_,
    offset_,
    order_,
    filter_,
    null,
    null
  ) INTO expr_and_ctes;

  RETURN QUERY SELECT msar.get_selectable_columns(tab_id);
  RETURN QUERY EXECUTE format(
    $q$
    WITH results_cte AS ( %1$s )
    SELECT %2$s AS records FROM results_cte;
    $q$,
    expr_and_ctes ->> 'results_cte_query',
    COALESCE(
      msar.build_results_setof_jsonb_expr('results_cte'),
      'NULL'
    )
  );
END;
$$ LANGUAGE plpgsql STABLE;


CREATE OR REPLACE FUNCTION
msar.get_score_expr(tab_id oid, parameters_ jsonb) RETURNS text AS $$
SELECT string_agg(
  CASE WHEN pgt.typcategory = 'S' OR pgt.typname = 'uuid' THEN
    format(
      $s$(CASE
        WHEN %1$I::text ILIKE %2$L THEN 4
        WHEN %1$I::text ILIKE %2$L || '%%' THEN 3
        WHEN %1$I::text ILIKE '%%' || %2$L || '%%' THEN 2
        ELSE 0
      END)$s$,
      pga.attname,
      x.literal
    )
  ELSE
    format('(CASE WHEN %1$I = %2$L THEN 4 ELSE 0 END)', pga.attname, x.literal)
  END,
  ' + '
)
FROM jsonb_to_recordset(parameters_) AS x(attnum smallint, literal text)
  INNER JOIN pg_catalog.pg_attribute AS pga ON x.attnum = pga.attnum
  INNER JOIN pg_catalog.pg_type AS pgt ON pga.atttypid = pgt.oid
WHERE
  pga.attrelid = tab_id
  AND NOT pga.attisdropped
  AND has_column_privilege(tab_id, x.attnum, 'SELECT')
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.search_records_from_table(
  tab_id oid,
  search_ jsonb,
  limit_ integer,
  offset_ integer DEFAULT 0,
  return_record_summaries boolean DEFAULT false,
  table_record_summary_templates jsonb DEFAULT NULL
) RETURNS jsonb AS $$/*
Get records from a table, filtering and sorting according to a search specification.

Only columns to which the user has access are returned.

Args:
  tab_id: The OID of the table whose records we'll get
  search_: An array of search definition objects.
  limit_: The maximum number of rows we'll return.
  offset_: The number of rows to skip before returning records from following rows

The search definition objects should have the form
  {"attnum": <int>, "literal": <any>}
*/
DECLARE
  records jsonb;
BEGIN
  EXECUTE format(
    $q$
    WITH
    count_cte AS (
      SELECT count(1) AS count FROM %2$I.%3$I %4$s
    ),
    results_cte AS (
      SELECT %1$s FROM %2$I.%3$I %4$s %7$s LIMIT %5$L OFFSET %6$L
    ),
    summary_cte_self AS (%8$s)
    %9$s,
    summary_cte AS ( SELECT %11$s FROM results_cte %10$s ),
    summaries_json_cte AS (
      SELECT
        jsonb_build_object(
          'linked_record_summaries',
          NULLIF(
            to_jsonb(summary_cte) - 'summary_self' - 'count_hack',
            '{}'::jsonb
          ),
          'record_summaries',
          NULLIF(
            to_jsonb(summary_cte) - 'count_hack' -> 'summary_self',
            '{}'::jsonb
          )
        )
      AS sj
      FROM summary_cte
    ),
    results_json_cte AS (
      SELECT jsonb_build_object(
        'results', coalesce(jsonb_agg(row_to_json(results_cte.*)), jsonb_build_array()),
        'count', coalesce(max(count_cte.count), 0)
      ) AS rj
      FROM results_cte CROSS JOIN count_cte
    )
    SELECT results_json_cte.rj || summaries_json_cte.sj
    FROM results_json_cte, summaries_json_cte;
    $q$,
    /* %1 */ COALESCE(msar.build_selectable_column_expr(tab_id), 'NULL'),
    /* %2 */ msar.get_relation_schema_name(tab_id),
    /* %3 */ msar.get_relation_name(tab_id),
    /* %4 */ 'WHERE ' || msar.get_score_expr(tab_id, search_) || ' > 0',
    /* %5 */ limit_,
    /* %6 */ offset_,
    /* %7 */ 'ORDER BY ' || NULLIF(
      concat(
        msar.get_score_expr(tab_id, search_) || ' DESC, ',
        msar.build_total_order_expr(tab_id, null)
      ),
      ''
    ),
    /* %8 */ msar.build_record_summary_query_for_table(
      tab_id,
      msar.get_selectable_pkey_attnum(tab_id),
      table_record_summary_templates
    ),
    /* %9 */ msar.build_linked_record_summaries_ctes(tab_id),
    /* %10 */ msar.build_summary_join_expr_for_table(tab_id, 'results_cte'),
    /* %11 */ COALESCE(
      NULLIF(
        concat_ws(', ',
          msar.build_summary_json_expr_for_table(tab_id),
          CASE WHEN return_record_summaries
          THEN msar.build_self_summary_json_expr(tab_id)
          END
        ), ''
      ), 'COUNT(1) AS count_hack'
      -- count_hack ensures that summary_cte is not empty,
      -- which in turn helps to generate summaries_json_cte
    )
  ) INTO records;
  RETURN records;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION msar.get_record_from_table(
  tab_id oid,
  rec_id anycompatible,
  joined_columns jsonb DEFAULT NULL,
  return_record_summaries boolean DEFAULT false,
  table_record_summary_templates jsonb DEFAULT NULL
) RETURNS jsonb AS $$/*
Get single record from a table. Only columns to which the user has access are returned.

Args:
  tab_id: The OID of the table whose record we'll get.
  rec_id: The id value of the record.
  joined_columns: (optional) A jsonb list defining columns joined via a simple many-to-many linkage.
    See msar.get_joined_columns_expr_json for more details.
  return_record_summaries : Whether to return a summary for the record listed.
  table_record_summary_templates: A JSON object that maps table OIDs to record summary
    templates.

The table must have a single primary key column.
*/
SELECT msar.list_records_from_table(
  tab_id,
  null,
  null,
  null,
  jsonb_build_object(
    'type', 'equal',
    'args', jsonb_build_array(
      jsonb_build_object('type', 'attnum', 'value', msar.get_pk_column(tab_id)),
      jsonb_build_object('type', 'literal', 'value', rec_id)
    )
  ),
  null,
  joined_columns,
  return_record_summaries,
  table_record_summary_templates
)
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
  msar.delete_records_from_table(tab_id oid, rec_ids jsonb) RETURNS jsonb AS $$/*
Delete records from table by id.

Args:
  tab_id: The OID of the table whose record we'll delete.
  rec_ids: An array of primary key values

The table must have a single primary key column.
*/
DECLARE
  pk_id integer;
  ids_deleted jsonb;
BEGIN
  SELECT msar.get_pk_column(tab_id) INTO pk_id;
  EXECUTE format(
    $d$
    WITH delete_cte AS (DELETE FROM %1$I.%2$I %3$s RETURNING *)
    SELECT coalesce(json_agg(%4$I), '[]') FROM delete_cte
    $d$,
    msar.get_relation_schema_name(tab_id),
    msar.get_relation_name(tab_id),
    msar.build_where_clause(
      tab_id, jsonb_build_object(
        'type', 'element_in_json_array_untyped', 'args', jsonb_build_array(
          jsonb_build_object(
            'type', 'format_data', 'args', jsonb_build_array(
              jsonb_build_object('type', 'attnum', 'value', pk_id)
            )
          ),
          jsonb_build_object('type', 'literal', 'value', rec_ids)
        )
      )
    ),
    msar.get_column_name(tab_id, pk_id)
  ) INTO ids_deleted;
  RETURN ids_deleted;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.build_value_expr(typ_id regtype, val jsonb) RETURNS text AS $$/*
Return an SQL expression giving a JSON value to write to a column of the given type.

A JSON object written to a column of a composite type fills the fields named by its keys, and a
JSON array written to a column of an array type holds its values, each of them written as one of
the array's items. Any other value is given as its text (a JSON string without its quotes), which
Postgres then casts to the column's type.

Args:
  typ_id: The type of the column the value is for.
  val: The value.
*/
SELECT CASE
  WHEN jsonb_typeof(val) = 'object' AND (SELECT typtype FROM pg_catalog.pg_type WHERE oid = typ_id) = 'c'
    THEN format('jsonb_populate_record(NULL::%s, %L)', typ_id, val)
  WHEN jsonb_typeof(val) = 'array' AND (SELECT typcategory FROM pg_catalog.pg_type WHERE oid = typ_id) = 'A'
    THEN format(
      'ARRAY[%s]::%s',
      COALESCE(
        (
          SELECT string_agg(msar.build_value_expr(item_typ_id, item), ', ' ORDER BY position)
          FROM jsonb_array_elements(val) WITH ORDINALITY AS items(item, position),
            LATERAL (SELECT typelem FROM pg_catalog.pg_type WHERE oid = typ_id) AS item_typ(item_typ_id)
        ),
        ''
      ),
      typ_id
    )
  ELSE quote_nullable(val #>> '{}')
END;
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION
msar.build_single_insert_expr(tab_id oid, rec_def jsonb) RETURNS TEXT AS $$
SELECT CASE WHEN NULLIF(rec_def, '{}'::jsonb) IS NOT NULL THEN
  (
    SELECT
      format(
        'INSERT INTO %I.%I (%s) VALUES (%s)',
        msar.get_relation_schema_name(tab_id),
        msar.get_relation_name(tab_id),
        string_agg(format('%I', msar.get_column_name(tab_id, key::smallint)), ', '),
        string_agg(msar.build_value_expr(atttypid, value), ', ')
      )
    FROM jsonb_each(rec_def)
      LEFT JOIN pg_catalog.pg_attribute ON attrelid = tab_id AND attnum = key::smallint
  )
ELSE
  format(
    'INSERT INTO %I.%I DEFAULT VALUES',
    msar.get_relation_schema_name(tab_id),
    msar.get_relation_name(tab_id)
  )
END;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.add_record_to_table(
  tab_id oid,
  rec_def jsonb,
  return_record_summaries boolean DEFAULT false,
  table_record_summary_templates jsonb DEFAULT NULL
) RETURNS jsonb AS $$/*
Add a record to a table.

Args:
  tab_id: The OID of the table whose record we'll delete.
  rec_def: A JSON object defining the record.

The `rec_def` object's form is defined by the record being inserted.  It should have keys
corresponding to the attnums of desired columns and values corresponding to values we should
insert.

*/
DECLARE
  rec_created_id text;
  rec_created jsonb;
BEGIN
  EXECUTE format(
    $q$
    WITH insert_cte AS (%1$s RETURNING %2$I)
    SELECT *
    FROM insert_cte
    $q$,
    /* %1 */ msar.build_single_insert_expr(tab_id, rec_def),
    /* %2 */ msar.get_column_name(tab_id, msar.get_pk_column(tab_id))
  ) INTO rec_created_id;
  rec_created := msar.get_record_from_table(
    tab_id,
    rec_created_id,
    null,
    return_record_summaries,
    table_record_summary_templates
  );
  RETURN jsonb_build_object(
    'results', rec_created -> 'results',
    'record_summaries', rec_created -> 'record_summaries',
    'linked_record_summaries', rec_created -> 'linked_record_summaries'
  );
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION
msar.build_update_expr(tab_id oid, rec_def jsonb) RETURNS TEXT AS $$
SELECT
  format(
    'UPDATE %I.%I SET (%s) = ROW(%s)',
    msar.get_relation_schema_name(tab_id),
    msar.get_relation_name(tab_id),
    string_agg(format('%I', msar.get_column_name(tab_id, key::smallint)), ', '),
    string_agg(msar.build_value_expr(atttypid, value), ', ')
  )
FROM jsonb_each(rec_def)
  LEFT JOIN pg_catalog.pg_attribute ON attrelid = tab_id AND attnum = key::smallint;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.patch_record_in_table(
  tab_id oid,
  rec_id anycompatible,
  rec_def jsonb,
  return_record_summaries boolean DEFAULT false,
  table_record_summary_templates jsonb DEFAULT NULL
) RETURNS jsonb AS $$/*
Modify (update/patch) a record in a table.

Args:
  tab_id: The OID of the table whose record we'll delete.
  rec_id: The primary key value of the record we'll modify.
  rec_patch: A JSON object defining the parts of the record to patch.

Only tables with a single primary key column are supported.

The `rec_def` object's form is defined by the record being updated.  It should have keys
corresponding to the attnums of desired columns and values corresponding to values we should set.
*/
DECLARE
  rec_modified jsonb;
  num_updated bigint;
BEGIN
  EXECUTE format(
    $p$ %1$s %2$s $p$,
    msar.build_update_expr(tab_id, rec_def),
    msar.build_where_clause(
      tab_id, jsonb_build_object(
        'type', 'equal', 'args', jsonb_build_array(
          jsonb_build_object('type', 'literal', 'value', rec_id),
          jsonb_build_object('type', 'attnum', 'value', msar.get_pk_column(tab_id))
        )
      )
    )
  );
  GET DIAGNOSTICS num_updated = ROW_COUNT;
  IF num_updated = 0 THEN
    RAISE EXCEPTION 'No rows updated';
  END IF;
  rec_modified := msar.get_record_from_table(
    tab_id,
    rec_id,
    null,
    return_record_summaries,
    table_record_summary_templates
  );
  RETURN jsonb_build_object(
    'results', rec_modified -> 'results',
    'record_summaries', rec_modified -> 'record_summaries',
    'linked_record_summaries', rec_modified -> 'linked_record_summaries'
  );
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION msar.get_simple_mapping_regclass(join_path jsonb) RETURNS regclass AS $$
  SELECT (join_path -> 0 -> 1 ->> 0)::bigint;
$$ LANGUAGE SQL;


CREATE OR REPLACE FUNCTION msar.get_simple_mapping_join_cte(
  join_path jsonb,
  record_pkey text
) RETURNS text AS $$
DECLARE
  mapping_rel regclass;
  filter_col_attnum smallint;
  join_col_attnum smallint;
BEGIN
  IF jsonb_array_length(join_path) <> 2 THEN
    RAISE EXCEPTION 'Join path wrong length';
  ELSIF join_path -> 0 -> 1 -> 0 <> join_path -> 1 -> 0 -> 0 THEN
    RAISE EXCEPTION 'Inconsistent mapping table OID';
  ELSIF join_path IS NULL OR record_pkey IS NULL THEN
    RETURN 'SELECT NULL AS join_key, NULL AS mapping_keys';
  ELSE
    mapping_rel := msar.get_simple_mapping_regclass(join_path);
    filter_col_attnum := join_path -> 0 -> 1 ->> 1;
    join_col_attnum := join_path -> 1 -> 0 ->> 1;
    RETURN format(
      $c$
        SELECT %1$I AS join_key, jsonb_agg(%2$I) AS mapping_keys
        FROM %3$I.%4$I WHERE %5$I = %6$L GROUP BY join_key
      $c$,
      /* 1 */ msar.get_column_name(mapping_rel, join_col_attnum),
      /* 2 */ msar.get_column_name(mapping_rel, msar.get_selectable_pkey_attnum(mapping_rel)),
      /* 3 */ msar.get_relation_schema_name(mapping_rel),
      /* 4 */ msar.get_relation_name(mapping_rel),
      /* 5 */ msar.get_column_name(mapping_rel, filter_col_attnum),
      /* 6 */ record_pkey
    );
  END IF;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION msar.list_by_record_summaries(
  tab_id oid,
  limit_ integer,
  offset_ integer,
  search_ text DEFAULT NULL,
  table_record_summary_templates jsonb DEFAULT NULL,
  linked_record_path jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$/*
Get record summaries from a table, optionally filtering by a search term. Results are sorted by
the summary text.

Args:
  tab_id: The OID of the table whose record summaries we'll get.
  limit_: The maximum number of record summaries to return.
  offset_: The number of record summaries to skip before returning results.
  search_: A search term to filter the summaries by. If provided, only summaries containing this
    term (case insensitive) in their text will be returned.
  table_record_summary_templates: (optional) A JSON object that maps table OIDs to record summary
    templates.
  linked_record_path: (optional) A JSON object that represents linkages via a simple many-to-many
    mapping to a record in another table. This can be used to determine whether the listed
    summaries are derived from records which are linked from the other table.

*/
DECLARE
  search_where_clause text := '';
  mapping_join_path jsonb;
  mapped_record_pkey text;
  final_sql text;
  result_json jsonb;
BEGIN
  IF search_ IS NOT NULL AND search_ <> '' THEN
    search_where_clause := format(' WHERE summary ILIKE %L', '%'||search_||'%');
  END IF;

  mapping_join_path := linked_record_path -> 'join_path';
  mapped_record_pkey := linked_record_path ->> 'record_pkey';

  final_sql := format(
    $q$
    WITH
      all_record_summaries AS ( %1$s ),
      filtered AS ( SELECT * FROM all_record_summaries %2$s ),
      sorted AS ( SELECT * FROM filtered ORDER BY summary LIMIT %3$s OFFSET %4$s ),
      results AS ( SELECT coalesce(jsonb_agg(sorted), '[]') AS results FROM sorted ),
      count_all_results AS ( SELECT count(*) AS num FROM filtered ),
      mapping_cte AS (%5$s),
      agg_mapping_cte AS (
        SELECT NULLIF(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'join_table', %6$L::bigint,
          'joined_values', pg_catalog.jsonb_object_agg(m.join_key, m.mapping_keys)
        )), '{}'::jsonb) AS mapping
        FROM mapping_cte m INNER JOIN sorted s ON m.join_key::text = s.key::text
      )
    SELECT
      jsonb_build_object(
        'count', count_all_results.num,
        'results', results.results,
        'mapping', agg_mapping_cte.mapping
      )
    FROM count_all_results, results, agg_mapping_cte
    $q$,
    /* 1 */ msar.build_record_summary_query_for_table(tab_id, NULL, table_record_summary_templates),
    /* 2 */ search_where_clause,
    /* 3 */ limit_,
    /* 4 */ offset_,
    /* 5 */ msar.get_simple_mapping_join_cte(mapping_join_path, mapped_record_pkey::text),
    /* 6 */ msar.get_simple_mapping_regclass(mapping_join_path)::oid
  );

  EXECUTE final_sql INTO result_json;
  RETURN result_json;
END;
$$;


CREATE OR REPLACE FUNCTION
msar.get_tab_col_info_map(tab_col_map jsonb)
RETURNS jsonb AS $$/*
Returns table_info and column_info for a given tab_col_map.

tab_col_map should have the following form:
{
  "table_oid_1": [col_attnum_1, col_attnum_2, col_attnum_3],
  "table_oid_2": [col_attnum_4, col_attnum_5]
}

Returns:
{
  "table_oid_1": {
    "table_info": table_info(),
    "columns": {"col_attnum_1": col_info(), "col_attnum_2": col_info(), "col_attnum_3": col_info()
  },
  "table_oid2": {
    "table_info": table_info(),
    "columns": {"col_attnum_4": col_info(), "col_attnum_5": col_info()}
  }
}
*/
  WITH cte AS (
    SELECT
      tab_id::oid,
      ARRAY(SELECT jsonb_array_elements_text(attnums))::int[] AS attnums
    FROM jsonb_each(coalesce(tab_col_map, '{}'::jsonb)) AS x(tab_id, attnums)
  ),
  tab_info_cte AS (
    SELECT tab_id, jsonb_agg(tab_info) AS tab_info_json FROM cte
    LEFT JOIN msar.table_info_table() AS tab_info ON tab_info.oid=cte.tab_id
    GROUP BY tab_id
  ),
  col_info_cte AS (
    SELECT cte.tab_id AS tab_id,
    jsonb_object_agg(
      column_info.id, column_info
    ) AS col_info_json FROM cte
    LEFT JOIN pg_catalog.pg_attribute pga ON cte.tab_id = pga.attrelid
    LEFT JOIN msar.column_info_table(cte.tab_id) AS column_info ON pga.attnum = column_info.id
    WHERE column_info.id = ANY(cte.attnums)
    GROUP BY cte.tab_id
  )
  SELECT coalesce(
    jsonb_object_agg(
      tic.tab_id, jsonb_build_object(
      'table_info', coalesce(tic.tab_info_json,'{}'::jsonb),
      'columns', coalesce(cic.col_info_json, '{}'::jsonb)
    )
  ), '{}'::jsonb)
  FROM tab_info_cte AS tic
  LEFT JOIN col_info_cte AS cic ON tic.tab_id = cic.tab_id
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.raise_exception(err_msg text)
RETURNS void AS $$/*
Utility function to raise an exceptions with an error message.

Having this utility function allows us to raise exceptions within SQL functions
where raising exceptions isn't otherwise possible.
*/
BEGIN
  RAISE EXCEPTION '%', err_msg;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.convert_to_user_column(tab_id regclass, col_id smallint, users jsonb)
RETURNS void AS $$/*
Change a column holding the ids of Mathesar users, as "User" columns did before users had UUIDs, to
type uuid, holding their UUIDs instead.

Ids missing from `users` become NULL. A constant default is changed to the UUID it maps to (or
dropped if it maps to none), and any other default is dropped.

Args:
  tab_id: The OID of the table containing the column.
  col_id: The attnum of the integer column.
  users: The UUID of each user, of the form {<id>: <uuid>, ...}.
*/
DECLARE
  col_name text := msar.get_column_name(tab_id, col_id);
  col_type regtype;
  old_default text;
  new_default uuid;
BEGIN
  SELECT atttypid, pg_catalog.pg_get_expr(adbin, adrelid) INTO col_type, old_default
  FROM pg_catalog.pg_attribute LEFT JOIN pg_catalog.pg_attrdef ON attrelid = adrelid AND attnum = adnum
  WHERE attrelid = tab_id AND attnum = col_id;
  IF col_type NOT IN ('smallint'::regtype, 'integer'::regtype, 'bigint'::regtype) THEN
    RAISE EXCEPTION 'Column % of % is of type %, not an integer type', col_name, tab_id, col_type;
  END IF;
  IF old_default IS NOT NULL AND NOT msar.is_default_possibly_dynamic(tab_id, col_id) THEN
    EXECUTE format('SELECT (%L::jsonb ->> (%s)::text)::uuid', users, old_default) INTO new_default;
  END IF;
  EXECUTE format(
    $a$
      ALTER TABLE %1$I.%2$I
        ALTER COLUMN %3$I DROP DEFAULT,
        ALTER COLUMN %3$I TYPE uuid USING (%4$L::jsonb ->> %3$I::text)::uuid
    $a$,
    msar.get_relation_schema_name(tab_id),
    msar.get_relation_name(tab_id),
    col_name,
    users
  );
  IF new_default IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT %L::uuid',
      msar.get_relation_schema_name(tab_id),
      msar.get_relation_name(tab_id),
      col_name,
      new_default
    );
  END IF;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.get_legacy_file_refs(tab_id regclass, col_id smallint)
RETURNS jsonb AS $$/*
Return the distinct files referenced by a column holding files the way Mathesar stored them
before they had a type of their own (mathesar_types.file): as JSON objects of the form
{"uri": <link>, "mash": <signature>}.

Returns a JSON array of {"uri": <link>, "mash": <signature or null>} objects. Values without a
"uri" string are left out, as they reference no file.

Args:
  tab_id: The OID of the table containing the column.
  col_id: The attnum of the json or jsonb column.
*/
DECLARE
  refs jsonb;
BEGIN
  EXECUTE format(
    $q$
      SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('uri', v ->> 'uri', 'mash', v ->> 'mash')), '[]')
      FROM (SELECT %3$I::jsonb AS v FROM %1$I.%2$I) AS vals
      WHERE jsonb_typeof(v -> 'uri') = 'string'
    $q$,
    msar.get_relation_schema_name(tab_id),
    msar.get_relation_name(tab_id),
    msar.get_column_name(tab_id, col_id)
  ) INTO refs;
  RETURN refs;
END;
$$ LANGUAGE plpgsql STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.convert_to_file_column(tab_id regclass, col_id smallint, files jsonb)
RETURNS void AS $$/*
Change a column holding files the way Mathesar stored them before they had a type of their own
(see msar.get_legacy_file_refs) to that type, mathesar_types.file.

Only Mathesar can sign files, so the caller works out which links it vouches for and passes the
media type and HMAC for each of them. Links it doesn't vouch for keep their link but get no HMAC,
so Mathesar won't serve them. Values that reference no file become NULL, as does any default.

Args:
  tab_id: The OID of the table containing the column.
  col_id: The attnum of the json or jsonb column.
  files: The files to sign, of the form {<link>: {"mime": <media type>, "hmac": <hmac>}, ...}.
*/
DECLARE
  col_name text := msar.get_column_name(tab_id, col_id);
  col_type regtype;
BEGIN
  SELECT atttypid INTO col_type FROM pg_catalog.pg_attribute WHERE attrelid = tab_id AND attnum = col_id;
  IF col_type NOT IN ('json'::regtype, 'jsonb'::regtype) THEN
    RAISE EXCEPTION 'Column % of % is of type %, not json or jsonb', col_name, tab_id, col_type;
  END IF;
  EXECUTE format(
    $a$
      ALTER TABLE %1$I.%2$I
        ALTER COLUMN %3$I DROP DEFAULT,
        ALTER COLUMN %3$I TYPE mathesar_types.file USING CASE
          WHEN jsonb_typeof(%3$I::jsonb -> 'uri') = 'string' THEN ROW(
            %3$I::jsonb ->> 'uri',
            %4$L::jsonb -> (%3$I::jsonb ->> 'uri') ->> 'mime',
            %4$L::jsonb -> (%3$I::jsonb ->> 'uri') ->> 'hmac'
          )::mathesar_types.file
        END
    $a$,
    msar.get_relation_schema_name(tab_id),
    msar.get_relation_name(tab_id),
    col_name,
    files
  );
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.build_insert_lookup_table(field_info_list jsonb, values_ jsonb) RETURNS TABLE
(
  table_name text,
  column_names text,
  values_ text,
  cte_name text,
  from_cte_name text
) AS $$/*
Returns a lookup table for given field_info_list and values_

Example: Inserting into Items while creating a new book entry, adding a new Title,
creating a new entry for Author, picking a Publisher.
           table_name           |                  column_names                   |                values_                 | cte_name | from_cte_name
--------------------------------+-------------------------------------------------+----------------------------------------+----------+---------------
 "Library Management"."Authors" | "First Name", "Last Name"                       | 'Jerome K.', 'Jerome                   | k1_cte   |
 "Library Management"."Books"   | "Title", "Author", "Publisher"                  | 'Three men in a Boat', k1_cte.id, '12' | k0_cte   | k1_cte
 "Library Management"."Items"   | "Acquisition Date", "Acquisition Price", "Book" | '2025-10-09', '69.69', k0_cte.id       |          | k0_cte

Calling msar.form_insert() on this table would generate the following SQL:

WITH k1_cte AS (
  INSERT INTO "Library Management"."Authors"("First Name", "Last Name") SELECT 'Jerome K.', 'Jerome' RETURNING *
), k0_cte AS (
  INSERT INTO "Library Management"."Books"("Title", "Author", "Publisher") SELECT 'Three men in a Boat', k1_cte.id, '12' FROM k1_cte RETURNING *
) INSERT INTO "Library Management"."Items"("Acquisition Date", "Acquisition Price", "Book") SELECT '2025-10-09', '69.69', k0_cte.id FROM k0_cte RETURNING *
*/
WITH cte AS (
  SELECT
    pga.attname::name AS column_name,
    fields.table_oid::bigint AS table_oid,
    fields.depth::integer AS depth,
    CASE
      WHEN vals.value::jsonb->>'type' = 'create' THEN concat(quote_ident(concat(fields.key::text, '_cte')), '.', quote_ident(ref_attr.attname))
      WHEN vals.value::jsonb->>'type' = 'pick' THEN quote_nullable(vals.value::jsonb->>'value')
      ELSE msar.build_value_expr(pga.atttypid, vals.value::jsonb)
    END AS value,
    CASE
      WHEN fields.parent_key IS NOT NULL THEN quote_ident(concat(fields.parent_key::text, '_cte'))
      ELSE NULL
    END AS cte_name,
    CASE
      WHEN vals.value::jsonb->>'type' = 'create' THEN quote_ident(concat(fields.key::text, '_cte'))
      ELSE NULL
    END AS from_cte_name
  FROM jsonb_to_recordset(field_info_list) AS fields(
    key text,
    parent_key text,
    column_attnum smallint,
    table_oid bigint,
    depth integer)
  INNER JOIN jsonb_each(values_) AS vals ON vals.key = fields.key
  LEFT JOIN pg_catalog.pg_attribute pga ON pga.attnum = fields.column_attnum AND pga.attrelid = fields.table_oid

  LEFT JOIN pg_catalog.pg_constraint pgc
    ON fields.column_attnum = ANY(pgc.conkey)
    AND pgc.conrelid = fields.table_oid
    AND pgc.contype = 'f'
  LEFT JOIN unnest(pgc.conkey) WITH ORDINALITY AS ck(attnum, ord) ON ck.attnum = fields.column_attnum
  LEFT JOIN unnest(pgc.confkey) WITH ORDINALITY AS fk(attnum, ord) ON fk.ord = ck.ord
  LEFT JOIN pg_catalog.pg_attribute ref_attr ON ref_attr.attrelid = pgc.confrelid AND ref_attr.attnum = fk.attnum
), multi_fks_cte AS (
  SELECT msar.raise_exception(
    'Inserting into a column with foreign key constraints referencing multiple columns is currently unsupported.'
  )
  FROM cte GROUP BY column_name, from_cte_name HAVING count(*) > 1
)
SELECT
  __msar.get_qualified_relation_name(table_oid) AS table_name,
  string_agg(quote_ident(column_name), ', ') AS column_names,
  string_agg(value, ', ') AS values_,
  cte_name,
  string_agg(from_cte_name, ', ') AS from_cte_name
FROM cte
CROSS JOIN (SELECT COUNT(*) FROM multi_fks_cte) AS force_multi_fks_cte_execution
GROUP BY table_oid, cte_name, depth ORDER BY depth DESC;
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION
msar.form_insert(field_info_list jsonb, values_ jsonb) RETURNS VOID AS $$/*
Given field_info_list and values_, generates a lookup table for insert, builds and executes an insert statement.

field_info_list should have the folowing form:
[
  {"key": "k1", "parent_key":null, "column_attnum":5, "table_oid":1234, "depth":0},
  {"key": "k3", "parent_key":"k1", "column_attnum":3, "table_oid":4321, "depth":1},
  {"key": "k2", "parent_key":"k1", "column_attnum":2, "table_oid":4321, "depth":1},
]

values_ should be in the form:
{
  "k1": {"type": "create"},
  "k2": "Jane",
  "k3": "Doe"
}

Example of the SQL generated while Inserting into Items table while creating
a new book entry, adding a new Title, creating a new entry for Author, picking a Publisher.

WITH k1_cte AS (
  INSERT INTO "Library Management"."Authors"("First Name", "Last Name") SELECT 'Jerome K.', 'Jerome' RETURNING *
), k0_cte AS (
  INSERT INTO "Library Management"."Books"("Title", "Author", "Publisher") SELECT 'Three men in a Boat', k1_cte.id, '12' FROM k1_cte RETURNING *
) INSERT INTO "Library Management"."Items"("Acquisition Date", "Acquisition Price", "Book") SELECT '2025-10-09', '69.69', k0_cte.id FROM k0_cte RETURNING *
*/
DECLARE
  ins RECORD;
  insert_str text := '';
  insert_stub text;
  insert_count integer;
BEGIN
  SELECT COUNT(*) INTO insert_count FROM msar.build_insert_lookup_table(field_info_list, values_);

  FOR ins IN SELECT * FROM msar.build_insert_lookup_table(field_info_list, values_) LOOP
    insert_stub := 'INSERT INTO ' ||
      ins.table_name || '(' || ins.column_names || ') SELECT ' || ins.values_ ||
      CASE
        WHEN ins.from_cte_name IS NOT NULL THEN CONCAT(' FROM ', ins.from_cte_name)
        ELSE '' END || ' RETURNING *';
    CASE
      WHEN insert_count > 1 AND ins.cte_name IS NOT NULL THEN
        insert_str := CONCAT_WS(',', NULLIF(insert_str, ''), ins.cte_name || ' AS (' || insert_stub || ')');
      WHEN ins.cte_name IS NULL THEN
        insert_str :=  insert_str || insert_stub;
    END CASE;
  END LOOP;

  CASE
    WHEN insert_count > 1 THEN
      insert_str := 'WITH ' || insert_str;
    ELSE NULL;
  END CASE;
  EXECUTE insert_str;
END;
$$ LANGUAGE plpgsql RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.build_join_expr(join_path jsonb) RETURNS TEXT AS $$/* 
Returns a left join sql expr for a given join path.

Note: This doesn't handle aliasing.
  So, join_paths containing the same table to be joined more than once would through errors.
*/
  WITH cte AS (
    SELECT
      msar.get_relation_name((joins->0->>0)::oid) AS left_tab_name,
      msar.get_column_name((joins->0->>0)::oid, (joins->0->>1)::int) AS left_col_name,
      msar.get_relation_schema_name((joins->1->>0)::oid) AS right_tab_sch_name,
      msar.get_relation_name((joins->1->>0)::oid) AS right_tab_name,
      msar.get_column_name((joins->1->>0)::oid, (joins->1->>1)::int) AS right_col_name
    FROM jsonb_array_elements(join_path) AS joins
  ), join_expr_cte AS (
    SELECT format(
      'LEFT JOIN %I.%I ON %I.%I = %I.%I',
      cte.right_tab_sch_name,
      cte.right_tab_name,
      cte.left_tab_name,
      cte.left_col_name,
      cte.right_tab_name,
      cte.right_col_name
    ) AS join_expr FROM cte
  ) SELECT string_agg(join_expr_cte.join_expr , E'\n') FROM join_expr_cte
$$ LANGUAGE SQL RETURNS NULL ON NULL INPUT;


CREATE OR REPLACE FUNCTION msar.get_joined_columns_expr_json(joined_columns jsonb)
RETURNS jsonb AS $$/*
Returns a json object containing SQL exprs essential for listing aggregates of pk-ids for a table
which is connect via a simple many-to-many relation.

joined_columns should have the folowing form:
[
  {"alias": "column_alias_1", "join_path": [[[17837, 1],[17842, 2]], [[17842, 3],[17820, 1]]]},
  {"alias": "column_alias_2", "join_path": [[[17837, 1], [17847, 2]], [[17847, 3], [17874, 1]]]},
]

Args:
  joined_columns: A list of JSON object that include an "alias" and "join_path" where,
    "join_path" represents linkages via a simple many-to-many mapping to a column in another table.
*/
  WITH cte AS (
    SELECT
      t.alias AS alias,
      msar.get_relation_name((t.join_path->0->0->>0)::oid) AS base_tab_name,
      msar.get_column_name((t.join_path->0->0->>0)::oid, (t.join_path->0->0->>1)::int) AS base_tab_col_name,
      msar.get_relation_name((t.join_path->-1->-1->>0)::oid) AS target_tab_name,
      msar.get_column_name((t.join_path->-1->-1->>0)::oid, (t.join_path->-1->-1->>1)::int) AS target_tab_col_name,
      msar.build_join_expr(t.join_path) AS join_expr
    FROM ROWS FROM (
      jsonb_to_recordset(joined_columns) AS (
        alias text,
        join_path jsonb
      )
    ) WITH ORDINALITY AS t(alias, join_path)
    ORDER BY ordinality
  ) SELECT jsonb_build_object(
      'selectable_joined_columns_expr', string_agg(
        format(
          $q$
          jsonb_build_object(
            'count', COUNT(DISTINCT %1$I.%2$I),
            'result', jsonb_path_query_array(
              COALESCE(
                NULLIF(
                  jsonb_agg(DISTINCT %1$I.%2$I),
                  '[null]'::jsonb
                ),
                '[]'::jsonb
              ), '$[0 to 24]'
            ) -- limit results to 25
          ) AS %3$I
          $q$,
          cte.target_tab_name,
          cte.target_tab_col_name,
          cte.alias
        ),
        ', '
      ),
      'join_sql_expr', string_agg(
        cte.join_expr,
        E'\n'
      ),
      'join_group_by_expr', 'GROUP BY ' || string_agg(
        DISTINCT format(
          '%I.%I',
          base_tab_name,
          base_tab_col_name
        ),
        ', '
      )
  ) FROM cte
$$ LANGUAGE SQL STABLE RETURNS NULL ON NULL INPUT;
