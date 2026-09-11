<script lang="ts">
  import { ROW_HEIGHT_PX } from '@mathesar/geometry';

  import { getSheetContext } from './utils';
  import type { Props as VirtualListProps } from './virtual-list/listUtils';
  import Resizer from './virtual-list/Resizer.svelte';
  import VirtualList from './virtual-list/VirtualList.svelte';

  const { stores, api } = getSheetContext();
  const { rowWidth, horizontalScrollOffset, scrollOffset } = stores;

  export let itemCount: VirtualListProps['itemCount'];
  export let itemSize: VirtualListProps['itemSize'];
  export let paddingBottom = 0;
  export let itemKey: VirtualListProps['itemKey'] | undefined = undefined;
  /**
   * Extra rows to render above and below the viewport, in viewport heights.
   * The browser scrolls ahead of rendering, so this is how far a fast scroll
   * can go before reaching rows that haven't been rendered yet. Cheap only
   * when rows are reused while scrolling (as the table view does).
   */
  export let overscanScreens = 0;
  /**
   * When set, an empty grid (cell backgrounds and borders) is drawn behind the
   * rows, so that when a fast scroll outpaces rendering, the not-yet-rendered
   * area looks like the sheet instead of blank space. Only valid when all rows
   * have the same height.
   */
  export let emptyRowsGrid:
    | { rowHeight: number; rowCount: number; rowHeaderColumnId?: string }
    | undefined = undefined;

  const { columnStyleMap } = stores;

  /** A 1px vertical line ending at each of the given x positions */
  function columnLines(edges: number[]): string {
    const color = 'var(--color-border-grid)';
    let previous = 0;
    const stops = edges.map((edge) => {
      const stop = `transparent ${previous}px ${edge - 1}px, ${color} ${
        edge - 1
      }px ${edge}px`;
      previous = edge;
      return stop;
    });
    return `linear-gradient(to right, ${stops.join(
      ', ',
    )}, transparent ${previous}px)`;
  }

  function getGridStyles(
    grid: NonNullable<typeof emptyRowsGrid>,
    columns: typeof $columnStyleMap,
  ) {
    const height = grid.rowCount * grid.rowHeight;
    const rowLines = (color: string) =>
      `repeating-linear-gradient(to bottom, transparent 0 ${
        grid.rowHeight - 1
      }px, ${color} ${grid.rowHeight - 1}px ${grid.rowHeight}px)`;
    const header = grid.rowHeaderColumnId
      ? columns.get(grid.rowHeaderColumnId)
      : undefined;
    const columnEdges = [...columns]
      .filter(([id]) => id !== grid.rowHeaderColumnId)
      .map(([, { left, width }]) => left + width);
    const width = Math.max(0, ...columnEdges);
    return {
      cells:
        `width:${width}px;height:${height}px;` +
        `background-image:${columnLines(columnEdges)},` +
        `${rowLines('var(--color-border-grid)')};`,
      rowHeader: header
        ? `width:${header.width}px;height:${height}px;` +
          'background-image:linear-gradient(to left, ' +
          'var(--color-border-header) 1px, transparent 1px),' +
          `${rowLines('var(--color-border-header)')};`
        : undefined,
    };
  }

  $: gridStyles = emptyRowsGrid
    ? getGridStyles(emptyRowsGrid, $columnStyleMap)
    : undefined;
</script>

<div data-sheet-element="body" tabindex="-1">
  <Resizer let:height let:width>
    <VirtualList
      horizontalScrollOffset={$horizontalScrollOffset}
      scrollOffset={$scrollOffset}
      {height}
      width={$rowWidth}
      {itemCount}
      {paddingBottom}
      {itemSize}
      estimatedItemSize={ROW_HEIGHT_PX}
      overscanCount={Math.max(
        5,
        Math.ceil((overscanScreens * height) / ROW_HEIGHT_PX),
      )}
      {itemKey}
      let:items
      let:api={virtualListApi}
      on:scroll={(e) => {
        api.setScrollOffset(e.detail);
      }}
      on:h-scroll={(e) => {
        api.setHorizontalScrollOffset(e.detail);
      }}
    >
      {#if gridStyles}
        <div
          class="empty-rows-grid"
          style={gridStyles.cells}
          aria-hidden="true"
        />
        {#if gridStyles.rowHeader}
          <div
            class="empty-rows-grid-row-header"
            style={gridStyles.rowHeader}
            aria-hidden="true"
          />
        {/if}
      {/if}
      <slot {items} api={virtualListApi} viewportWidth={width} />
    </VirtualList>
  </Resizer>
</div>

<style lang="scss">
  [data-sheet-element='body'] {
    position: relative;
    flex-shrink: 0;
    flex-grow: 1;
    overflow: hidden;
  }

  // Painted before (under) the rows, which are absolutely positioned after it.
  .empty-rows-grid {
    position: absolute;
    top: 0;
    left: 0;
    background-color: var(--cell-bg-color-base);
    pointer-events: none;
  }
  .empty-rows-grid-row-header {
    position: sticky;
    left: 0;
    background-color: var(--cell-bg-color-header);
    pointer-events: none;
  }
</style>
