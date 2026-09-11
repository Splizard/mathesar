import DateTimeCell from '@mathesar/components/cell-fabric/data-types/components/date-time/DateTimeCell.svelte';
import MoneyCell from '@mathesar/components/cell-fabric/data-types/components/money/MoneyCell.svelte';
import NumberCell from '@mathesar/components/cell-fabric/data-types/components/number/NumberCell.svelte';
import TextAreaCell from '@mathesar/components/cell-fabric/data-types/components/textarea/TextAreaCell.svelte';
import TextBoxCell from '@mathesar/components/cell-fabric/data-types/components/textbox/TextBoxCell.svelte';
import {
  type JoinedColumn,
  type ProcessedColumn,
  isJoinedColumn,
} from '@mathesar/stores/table-data';

/**
 * Cell types whose idle display is just their (formatted) value, and how that
 * value is aligned. Other types (checkboxes, links, linked records, files,
 * primary keys, …) always render their full cell component.
 */
const plainCellKinds = new Map<
  unknown,
  { alignRight: boolean; tabular: boolean }
>([
  [TextBoxCell, { alignRight: false, tabular: false }],
  [TextAreaCell, { alignRight: false, tabular: false }],
  [NumberCell, { alignRight: true, tabular: true }],
  [MoneyCell, { alignRight: true, tabular: true }],
  [DateTimeCell, { alignRight: false, tabular: true }],
]);

export interface PlainCell {
  /** `null` renders as NULL and `undefined` as DEFAULT, like `CellValue` */
  display: unknown;
  alignRight: boolean;
  tabular: boolean;
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
): PlainCell | undefined {
  if (isJoinedColumn(columnFabric)) return undefined;
  const { component, props } = columnFabric.cellComponentAndProps;
  const kind = plainCellKinds.get(component);
  if (!kind) return undefined;
  const { formatForDisplay } = props as {
    formatForDisplay?: (v: unknown) => unknown;
  };
  // Same as `SteppedInputCell`: `formatValue?.(value) ?? value`
  const display = formatForDisplay?.(value) ?? value;
  return {
    display,
    ...kind,
    disabled: !(canUpdateRecords && columnFabric.isEditable),
  };
}
