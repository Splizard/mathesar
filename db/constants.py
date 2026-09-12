COLUMN_NAME_TEMPLATE = 'Column '  # auto generated column name 'Column 1' (no undescore)

MATHESAR_PREFIX = "mathesar_"
MSAR_PUBLIC_SCHEMA = 'msar'
MSAR_PRIVATE_SCHEMA = f"__{MSAR_PUBLIC_SCHEMA}"
TYPES_SCHEMA = f"{MATHESAR_PREFIX}types"
# Where each database keeps how its columns are to be presented. Named by analogy with
# information_schema, and hidden for the same reason: it describes the user's tables rather
# than being one of them.
PRESENTATION_SCHEMA = 'presentation_schema'

INTERNAL_SCHEMAS = {
    TYPES_SCHEMA,
    MSAR_PUBLIC_SCHEMA,
    MSAR_PRIVATE_SCHEMA,
    PRESENTATION_SCHEMA,
}


def schema_is_internal(name):
    """
    Whether a schema is one the database or Mathesar keeps for itself.

    These describe the user's tables rather than being among them: PostgreSQL's own catalogue in
    pg_catalog and information_schema, and the schemas Mathesar installs to do its work. They are
    worth reading and never worth changing, so they are hidden unless asked for, and refused when
    something asks to write to one.

    Args:
        name: The name of the schema.
    """
    return (
        name in INTERNAL_SCHEMAS
        or name == 'information_schema'
        or name.startswith('pg_')
    )
