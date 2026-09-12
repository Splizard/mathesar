import type {
  RecordsSummaryListResponse,
  SummarizedRecordReference,
} from '@mathesar/api/rpc/_common/commonTypes';
import type { RawTableWithSchemaName } from '@mathesar/api/rpc/tables';
import { getQualifiedTableName } from '@mathesar/stores/allTables';
import AsyncStore from '@mathesar/stores/AsyncStore';
import type { RowSeekerRecordStore } from '@mathesar/systems/row-seeker/RowSeekerController';

export function convertTablesToRecords(
  tables: RawTableWithSchemaName[],
  searchQuery?: string,
  limit?: number,
  offset?: number,
): RecordsSummaryListResponse {
  let foundTables = tables;
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    foundTables = tables.filter((table) =>
      getQualifiedTableName(table).toLowerCase().includes(query),
    );
  }
  const start = offset ?? 0;
  const end = limit ? start + limit : foundTables.length;
  const results: SummarizedRecordReference[] = foundTables
    .slice(start, end)
    .map((table) => ({
      key: getQualifiedTableName(table),
      summary: getQualifiedTableName(table),
    }));
  return { results, count: foundTables.length };
}

/**
 * The tables of the database as the row seeker takes them, searched and paged
 * in memory, since they're all loaded at once.
 */
export function createTableRecordStore(
  tables: RawTableWithSchemaName[],
): RowSeekerRecordStore {
  return new AsyncStore<
    {
      limit?: number | null;
      offset?: number | null;
      search?: string | null;
    },
    RecordsSummaryListResponse
  >(async (params) => {
    const { limit = null, offset = null, search = null } = params;
    return convertTablesToRecords(
      tables,
      search ?? undefined,
      limit ?? undefined,
      offset ?? undefined,
    );
  });
}
