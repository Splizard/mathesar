<script lang="ts">
  import type { FileManifest } from '@mathesar/api/rpc/records';
  import CellBackground from '@mathesar/components/CellBackground.svelte';
  import CellValue from '@mathesar/components/CellValue.svelte';
  import { parseFileReference } from '@mathesar/components/file-attachments/fileUtils';
  import LinkedRecord from '@mathesar/components/LinkedRecord.svelte';
  import { SheetRowHeaderCell } from '@mathesar/components/sheet';
  import { getSheetContext } from '@mathesar/components/sheet/utils';
  import { iconAddNew } from '@mathesar/icons';
  import type { AssociatedCellValuesForSheet } from '@mathesar/stores/AssociatedCellData';
  import {
    type GroupAddRecordRow,
    ID_ROW_CONTROL_COLUMN,
    type JoinedColumn,
    type ProcessedColumn,
  } from '@mathesar/stores/table-data';
  import type { RecordSummariesForSheet } from '@mathesar/stores/table-data/record-summaries/recordSummaryUtils';
  import { Icon } from '@mathesar-component-library';

  /**
   * Looks like the empty row at the bottom of the table, with the group's
   * values already in their columns. Clicking it adds the record.
   */
  export let row: GroupAddRecordRow;
  export let columns: [string, ProcessedColumn | JoinedColumn][];
  export let canUpdateRecords: boolean;
  export let recordSummaries: RecordSummariesForSheet;
  export let fileManifests: AssociatedCellValuesForSheet<FileManifest>;
  /** Adds the record, then selects the given column's cell where it can */
  export let onAdd: (columnId: string | undefined) => Promise<void>;

  const { columnStyleMap } = getSheetContext().stores;

  let isAdding = false;

  async function add(e: MouseEvent, columnId?: string) {
    if (e.button !== 0) return;
    // Neither a selection nor focus should start from this row
    e.preventDefault();
    e.stopPropagation();
    if (isAdding) return;
    isAdding = true;
    try {
      await onAdd(columnId);
    } finally {
      isAdding = false;
    }
  }

  function getFileUri(columnId: string, value: unknown) {
    const reference = parseFileReference(value);
    if (!reference) return undefined;
    return fileManifests.get(columnId)?.get(reference.hmac)?.uri;
  }
</script>

<SheetRowHeaderCell
  rowSelectionId={row.identifier}
  columnIdentifierKey={ID_ROW_CONTROL_COLUMN}
  isWithinPlaceholderRow
  onMouseDown={(e) => add(e)}
>
  <CellBackground color="var(--cell-bg-color-header)" />
  <Icon {...iconAddNew} />
</SheetRowHeaderCell>

{#each columns as [columnId, columnFabric] (columnId)}
  {@const hasValue = columnId in row.groupValues}
  {@const value = row.groupValues[columnId]}
  {@const recordSummary = hasValue
    ? recordSummaries.get(columnId)?.get(String(value))
    : undefined}
  {@const fileUri = hasValue ? getFileUri(columnId, value) : undefined}
  <div
    class="group-add-cell"
    class:disabled={!(canUpdateRecords && columnFabric.isEditable)}
    class:adding={isAdding}
    style={$columnStyleMap.get(columnFabric.id)?.styleString}
    on:mousedown={(e) => add(e, columnId)}
  >
    {#if hasValue}
      {#if recordSummary}
        <LinkedRecord
          {recordSummary}
          recordId={String(value)}
          tableId={'linkFk' in columnFabric
            ? columnFabric.linkFk?.referent_table_oid
            : undefined}
        />
      {:else if fileUri}
        {fileUri}
      {:else}
        <CellValue {value} />
      {/if}
    {/if}
  </div>
{/each}

<style lang="scss">
  // Mirrors the idle appearance of a cell, as `.plain-cell` in Row.svelte does
  .group-add-cell {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    display: flex;
    align-items: center;
    padding: var(--sm4);
    border-bottom: var(--cell-border-horizontal);
    border-right: var(--cell-border-vertical);
    background: var(--cell-bg-color-base);
    color: var(--color-fg-base-muted);
    line-height: 1.2;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;

    &.disabled {
      background: var(--cell-bg-color-disabled);
    }
    &.adding {
      cursor: progress;
    }
  }
</style>
