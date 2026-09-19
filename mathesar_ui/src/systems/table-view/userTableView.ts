/**
 * Coming back to a table as it was left.
 *
 * Each person's filter and hidden columns on each table are kept for them on the server, and a
 * table opened without a view of its own in the address -- from the list of tables, a breadcrumb,
 * a bookmark -- is opened with the one they last had. A table opened from a link that carries a
 * view, which is what a shared link and a reload are, shows that view: the address says what to
 * show, and this only fills in when it says nothing.
 *
 * Only the filter and the hidden columns, which are what somebody sets up to look at a table a
 * particular way. Where they are in it -- the page, the sort -- is left to start fresh.
 */
import { get } from 'svelte/store';

import { api } from '@mathesar/api/rpc';
import type { UserTableView } from '@mathesar/api/rpc/tables';
import {
  Filtering,
  HiddenColumns,
  Meta,
  type TerseFiltering,
} from '@mathesar/stores/table-data';

export interface TableRef {
  databaseId: number;
  tableOid: number;
}

/**
 * The serialization of the view this person last left the table with, or nothing if they have
 * never changed anything on it.
 */
export async function getRestoredSerialization({
  databaseId,
  tableOid,
}: TableRef): Promise<string | undefined> {
  const view = await api.tables.user_view
    .get({ database_id: databaseId, table_oid: tableOid })
    .run();
  if (!view) return undefined;
  return Meta.serializationOf({
    filtering: view.filtering
      ? Filtering.fromTerse(view.filtering as TerseFiltering)
      : undefined,
    hiddenColumns: view.hidden_columns
      ? new HiddenColumns(view.hidden_columns)
      : undefined,
  });
}

export function viewOfMeta(meta: Meta): UserTableView {
  return {
    filtering: get(meta.filtering).terse(),
    hidden_columns: get(meta.hiddenColumns).terse(),
  };
}

/** Keep this view as the one this person last left the table with */
export function keepUserTableView(
  { databaseId, tableOid }: TableRef,
  view: UserTableView,
): Promise<unknown> {
  return api.tables.user_view
    .set({ database_id: databaseId, table_oid: tableOid, view })
    .run();
}
