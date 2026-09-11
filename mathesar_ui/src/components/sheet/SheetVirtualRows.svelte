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
</script>

<div data-sheet-element="body" tabindex="-1">
  <Resizer let:height>
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
      <slot {items} api={virtualListApi} />
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
</style>
