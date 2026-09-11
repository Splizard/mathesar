import DateTimeCell from '@mathesar/components/cell-fabric/data-types/components/date-time/DateTimeCell.svelte';
import MoneyCell from '@mathesar/components/cell-fabric/data-types/components/money/MoneyCell.svelte';
import NumberCell from '@mathesar/components/cell-fabric/data-types/components/number/NumberCell.svelte';
import PrimaryKeyCell from '@mathesar/components/cell-fabric/data-types/components/primary-key/PrimaryKeyCell.svelte';
import TextAreaCell from '@mathesar/components/cell-fabric/data-types/components/textarea/TextAreaCell.svelte';
import TextBoxCell from '@mathesar/components/cell-fabric/data-types/components/textbox/TextBoxCell.svelte';
import {
  type JoinedColumn,
  type ProcessedColumn,
  isJoinedColumn,
} from '@mathesar/stores/table-data';

interface PlainCellKind {
  alignRight: boolean;
  tabular: boolean;
  /** Followed by a link to the record, like `PrimaryKeyCell` */
  recordLink?: boolean;
}

/**
 * Cell types whose idle display is just their (formatted) value, and how that
 * value is aligned. Other types (checkboxes, links, linked records, files, …)
 * always render their full cell component.
 */
const plainCellKinds = new Map<unknown, PlainCellKind>([
  [TextBoxCell, { alignRight: false, tabular: false }],
  [TextAreaCell, { alignRight: false, tabular: false }],
  [NumberCell, { alignRight: true, tabular: true }],
  [MoneyCell, { alignRight: true, tabular: true }],
  [DateTimeCell, { alignRight: false, tabular: true }],
  [PrimaryKeyCell, { alignRight: false, tabular: false, recordLink: true }],
]);

export interface PlainCell {
  /** `null` renders as NULL and `undefined` as DEFAULT, like `CellValue` */
  display: unknown;
  alignRight: boolean;
  tabular: boolean;
  recordLink: boolean;
  disabled: boolean;
}

/**
 * Most cells in the table are idle: not active, selected, being edited, saving
 * or showing errors. Those render as a single plain element with the same
 * appearance as the full cell component, which is far cheaper to create and
 * update. That matters when scrolling quickly through wide tables.
 *
 * Returns `undefined` when the column's cells need the full component.
 */
export function getPlainCell(
  columnFabric: ProcessedColumn | JoinedColumn,
  value: unknown,
  canUpdateRecords: boolean,
  tableOid: number,
): PlainCell | undefined {
  if (isJoinedColumn(columnFabric)) return undefined;
  const { component, props } = columnFabric.cellComponentAndProps;
  const kind = plainCellKinds.get(component);
  if (!kind) return undefined;
  const { formatForDisplay, tableId } = props as {
    formatForDisplay?: (v: unknown) => unknown;
    tableId?: number;
  };
  // Record links are only rendered for records of the table being shown
  if (kind.recordLink && tableId !== tableOid) return undefined;
  // Same as `SteppedInputCell`: `formatValue?.(value) ?? value`
  const display = formatForDisplay?.(value) ?? value;
  return {
    display,
    recordLink: false,
    ...kind,
    disabled: !(canUpdateRecords && columnFabric.isEditable),
  };
}
