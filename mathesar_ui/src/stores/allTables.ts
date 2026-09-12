import type { RawTableWithSchemaName } from '@mathesar/api/rpc/tables';
import type { Database } from '@mathesar/models/Database';

type AllTablesStore = ReturnType<Database['constructAllTablesStore']>;

const storesByDatabase = new Map<Database['id'], AllTablesStore>();

/**
 * Every table of the database, of all its schemas, loaded once and kept, since
 * it's only used to choose among them and to name the one a column holds.
 */
export function getAllTablesStore(database: Database): AllTablesStore {
  const existingStore = storesByDatabase.get(database.id);
  if (existingStore) return existingStore;
  const store = database.constructAllTablesStore();
  storesByDatabase.set(database.id, store);
  return store;
}

const isSimpleIdentifier = (name: string) => /^[a-z_][a-z0-9_$]*$/.test(name);

/** A name as PostgreSQL writes it, quoted only where it has to be */
function quoteIdentifier(name: string): string {
  return isSimpleIdentifier(name) ? name : `"${name.replace(/"/g, '""')}"`;
}

/**
 * The name of a table as PostgreSQL gives it for a `regclass` value: qualified
 * by its schema, which PostgreSQL leaves off when the schema is in the search
 * path, so a column's value can be either.
 */
export function getQualifiedTableName(table: RawTableWithSchemaName): string {
  return `${quoteIdentifier(table.schema_name)}.${quoteIdentifier(table.name)}`;
}

export function getUnqualifiedTableName(table: RawTableWithSchemaName): string {
  return quoteIdentifier(table.name);
}

/**
 * The table a Database Table column's value names, if it's one of those given
 * and names it unambiguously: PostgreSQL writes the name unqualified when the
 * table's schema is in the search path, and two schemas can hold a table of
 * the same name.
 */
export function findTableByName(
  tables: RawTableWithSchemaName[],
  name: string,
): RawTableWithSchemaName | undefined {
  const qualified = tables.filter((t) => getQualifiedTableName(t) === name);
  if (qualified.length === 1) return qualified[0];
  const unqualified = tables.filter((t) => getUnqualifiedTableName(t) === name);
  return unqualified.length === 1 ? unqualified[0] : undefined;
}
