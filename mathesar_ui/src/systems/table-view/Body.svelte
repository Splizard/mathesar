<script lang="ts">
  import { SheetVirtualRows } from '@mathesar/components/sheet';
  import { parseCellId } from '@mathesar/components/sheet/cellIds';
  import {
    GROUP_HEADER_ROW_HEIGHT_PX,
    HELP_TEXT_ROW_HEIGHT_PX,
    ROW_HEIGHT_PX,
  } from '@mathesar/geometry';
  import {
    type DisplayRowDescriptor,
    ID_ROW_CONTROL_COLUMN,
    type Row as RowType,
    getTabularDataStoreFromContext,
    isGroupHeaderRow,
    isHelpTextRow,
    isPlaceholderRecordRow,
  } from '@mathesar/stores/table-data';

  import Row from './row/Row.svelte';
  import RowSlotAllocator from './RowSlotAllocator';
  import ScrollAndRowHeightHandler from './ScrollAndRowHeightHandler.svelte';

  const tabularData = getTabularDataStoreFromContext();

  export let usesVirtualList = false;

  $: ({ table, display, canInsertRecords, selection } = $tabularData);
  $: ({ oid } = table);
  $: ({ displayRowDescriptors } = display);

  // Reuse row components while scrolling instead of recreating them. The row
  // with the active cell may hold edit state, so its component is never reused
  // for another row.
  const rowSlots = new RowSlotAllocator();

  function getActiveRowId(activeCellId: string | undefined) {
    if (!activeCellId) return undefined;
    try {
      return parseCellId(activeCellId).rowId;
    } catch {
      return undefined;
    }
  }

  $: activeRowId = getActiveRowId($selection.activeCellId);
  $: isStatefulRow = (key: string | number) => key === activeRowId;

  function getItemSizeFromRow(row: RowType) {
    if (isHelpTextRow(row)) {
      return HELP_TEXT_ROW_HEIGHT_PX;
    }
    if (isGroupHeaderRow(row)) {
      return GROUP_HEADER_ROW_HEIGHT_PX;
    }
    return ROW_HEIGHT_PX;
  }

  /** See notes in `records.ts.README.md` about different row identifiers */
  function getIterationKey(
    index: number,
    rowDescriptor: DisplayRowDescriptor | undefined,
  ): string {
    if (rowDescriptor) {
      return rowDescriptor.row.identifier;
    }
    return `__index_${index}`;
  }

  function getItemSizeFromIndex(index: number) {
    const row = $displayRowDescriptors?.[index].row;
    return row ? getItemSizeFromRow(row) : ROW_HEIGHT_PX;
  }

  /**
   * The empty grid drawn behind the rows assumes uniform row heights, so it's
   * only used without grouping or other rows of a different height.
   */
  function getEmptyRowsGrid(
    rowDescriptors: DisplayRowDescriptor[],
    canInsert: boolean,
  ) {
    let rowCount = 0;
    for (const { row } of rowDescriptors) {
      if (getItemSizeFromRow(row) !== ROW_HEIGHT_PX) return undefined;
      if (!isPlaceholderRecordRow(row) || canInsert) rowCount += 1;
    }
    return {
      rowHeight: ROW_HEIGHT_PX,
      rowCount,
      rowHeaderColumnId: ID_ROW_CONTROL_COLUMN,
    };
  }

  $: emptyRowsGrid = getEmptyRowsGrid(
    $displayRowDescriptors,
    $canInsertRecords,
  );
</script>

{#key oid}
  {#if usesVirtualList}
    <SheetVirtualRows
      itemCount={$displayRowDescriptors.length}
      paddingBottom={30}
      overscanScreens={1}
      {emptyRowsGrid}
      itemSize={getItemSizeFromIndex}
      itemKey={(index) => getIterationKey(index, $displayRowDescriptors[index])}
      let:items
      let:api
    >
      <ScrollAndRowHeightHandler {api} />
      {#each rowSlots.assign(items, isStatefulRow) as item (item.slotKey)}
        {@const shouldRender = !(
          isPlaceholderRecordRow($displayRowDescriptors[item.index].row) &&
          !$canInsertRecords
        )}
        {#if $displayRowDescriptors[item.index] && shouldRender}
          <Row
            style={item.style}
            row={$displayRowDescriptors[item.index].row}
            rowDescriptor={$displayRowDescriptors[item.index]}
          />
        {/if}
      {/each}
    </SheetVirtualRows>
  {:else}
    {#each $displayRowDescriptors as displayRowDescriptor (displayRowDescriptor)}
      <Row
        style={{
          position: 'relative',
          height: getItemSizeFromRow(displayRowDescriptor.row),
        }}
        row={displayRowDescriptor.row}
        rowDescriptor={displayRowDescriptor}
      />
    {/each}
  {/if}
{/key}
