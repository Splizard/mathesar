<script lang="ts">
  import { first } from 'iter-tools';
  import { _ } from 'svelte-i18n';

  import {
    SheetCellResizer,
    SheetColumnCreationCell,
    SheetColumnHeaderCell,
    SheetHeader,
  } from '@mathesar/components/sheet';
  import SheetOriginCell from '@mathesar/components/sheet/cells/SheetOriginCell.svelte';
  import { iconShowOnlyTheTable, iconShowTheRestAgain } from '@mathesar/icons';
  import type { Table } from '@mathesar/models/Table';
  import {
    ID_ADD_NEW_COLUMN,
    ID_ROW_CONTROL_COLUMN,
    type ProcessedColumn,
    getTabularDataStoreFromContext,
    isJoinedColumn,
  } from '@mathesar/stores/table-data';
  import { updateTable } from '@mathesar/stores/tables';
  import { Icon } from '@mathesar-component-library';

  import {
    showOnlyTheTable,
    showTheRestAgain,
    tableIsFullScreen,
  } from '../fullScreen';

  import { Draggable, Droppable } from './drag-and-drop';
  import HeaderCell from './header-cell/HeaderCell.svelte';
  import NewColumnCell from './new-column-cell/NewColumnCell.svelte';

  const tabularData = getTabularDataStoreFromContext();

  export let hasNewColumnButton = false;
  export let columnOrder: string[];
  export let table: Table;
  /** Whether the corner of the sheet is where the table is put on the screen by itself */
  export let hasFullScreenToggle = false;

  $: columnOrder = columnOrder ?? [];
  $: ({ selection, processedColumns, displayedColumns } = $tabularData);

  let locationOfFirstDraggedColumn: number | undefined = undefined;
  let selectedColumnIdsOrdered: string[] = [];
  let newColumnOrder: string[] = [];

  function dragColumn() {
    // Keep only IDs for which the column exists
    for (const columnId of $processedColumns.keys()) {
      columnOrder = [...new Set(columnOrder)];
      if (!columnOrder.includes(columnId)) {
        columnOrder = [...columnOrder, columnId];
      }
    }
    columnOrder = columnOrder;
    // Remove selected column IDs and keep their order
    for (const id of columnOrder) {
      if ($selection.columnIds.has(id)) {
        selectedColumnIdsOrdered.push(id);
        if (!locationOfFirstDraggedColumn) {
          locationOfFirstDraggedColumn = columnOrder.indexOf(id);
        }
      } else {
        newColumnOrder.push(id);
      }
    }
  }

  function dropColumn(columnDroppedOn?: ProcessedColumn) {
    // Early exit if a column is dropped in the same place.
    // Should only be done for single column if non-continuous selection is allowed.
    if (
      columnDroppedOn &&
      first($selection.columnIds) === String(columnDroppedOn.id)
    ) {
      // Reset drag information
      locationOfFirstDraggedColumn = undefined;
      selectedColumnIdsOrdered = [];
      newColumnOrder = [];
      return;
    }

    // Insert selected column IDs after the column where they are dropped
    // if that column is to the right, else insert it before
    if (columnDroppedOn) {
      newColumnOrder.splice(
        columnOrder.indexOf(columnDroppedOn.id),
        0,
        ...selectedColumnIdsOrdered,
      );
    } else {
      // If the column is dropped on the ID column, columnDroppedOn is undefined and we can insert at the beginning.
      newColumnOrder.splice(0, 0, ...selectedColumnIdsOrdered);
    }

    void updateTable({
      schema: table.schema,
      table: {
        oid: table.oid,
        metadata: { column_order: newColumnOrder.map(Number) },
      },
    });

    // Reset drag information
    locationOfFirstDraggedColumn = undefined;
    selectedColumnIdsOrdered = [];
    newColumnOrder = [];
  }
</script>

<SheetHeader>
  <SheetOriginCell columnIdentifierKey={ID_ROW_CONTROL_COLUMN}>
    <Droppable
      on:drop={() => dropColumn()}
      on:dragover={(e) => e.preventDefault()}
      locationOfFirstDraggedColumn={0}
      columnLocation={-1}
    />
    {#if hasFullScreenToggle}
      <!-- The corner of the sheet is otherwise empty, and on a screen with nothing to spare it is
      where the table is put on the screen by itself. Over the droppable, which is for dragging a
      column to the front and has nothing to drop onto it on a screen this size. -->
      <button
        type="button"
        class="full-screen-toggle"
        aria-label={$tableIsFullScreen
          ? $_('show_the_rest_again')
          : $_('show_only_the_table')}
        aria-pressed={$tableIsFullScreen}
        on:click={() =>
          void ($tableIsFullScreen ? showTheRestAgain() : showOnlyTheTable())}
      >
        <Icon
          {...$tableIsFullScreen ? iconShowTheRestAgain : iconShowOnlyTheTable}
        />
      </button>
    {/if}
  </SheetOriginCell>

  {#each [...$displayedColumns] as [columnId, columnFabric] (columnId)}
    {@const isSelected = $selection.columnIds.has(columnId)}
    {@const isJoined = isJoinedColumn(columnFabric)}
    <SheetColumnHeaderCell
      columnIdentifierKey={columnId}
      isRangeRestricted={isJoined}
    >
      {#if isJoined}
        <HeaderCell {columnFabric} {isSelected} />
      {:else}
        <Draggable
          on:dragstart={() => dragColumn()}
          column={columnFabric}
          {selection}
        >
          <Droppable
            on:drop={() => dropColumn(columnFabric)}
            on:dragover={(e) => e.preventDefault()}
            {locationOfFirstDraggedColumn}
            columnLocation={columnOrder.indexOf(columnId)}
            {isSelected}
          >
            <HeaderCell {columnFabric} {isSelected} />
          </Droppable>
        </Draggable>
      {/if}
      <SheetCellResizer {columnId} />
    </SheetColumnHeaderCell>
  {/each}

  {#if hasNewColumnButton}
    <SheetColumnCreationCell columnIdentifierKey={ID_ADD_NEW_COLUMN}>
      <NewColumnCell />
    </SheetColumnCreationCell>
  {/if}
</SheetHeader>

<style lang="scss">
  .full-screen-toggle {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--color-fg-subtle-1);
    cursor: pointer;
    /* Over the droppable, which has nothing to drop onto it on a screen this size. */
    z-index: 1;
  }

  .full-screen-toggle[aria-pressed='true'] {
    color: var(--color-fg-base);
  }
</style>
