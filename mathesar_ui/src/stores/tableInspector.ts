import { writable } from 'svelte/store';

import { tableInspectorVisible } from './localStorage';

export type TableInspectorTabId = 'table' | 'column' | 'record' | 'cell';

/** Which tab of the table inspector is shown */
export const tableInspectorTab = writable<TableInspectorTabId>('table');

/** Show the given tab of the table inspector, opening it if it's closed */
export function showTableInspectorTab(tab: TableInspectorTabId): void {
  tableInspectorTab.set(tab);
  tableInspectorVisible.set(true);
}
