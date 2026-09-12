<script lang="ts">
  import { onMount } from 'svelte';

  import { getSheetContext } from './utils';

  const { stores, api } = getSheetContext();
  const { horizontalScrollOffset } = stores;
  const { rowWidth } = stores;
  const { verticalScrollbarWidth } = stores;

  // The body reserves a gutter for its vertical scrollbar, so its viewport is
  // narrower than the header's by that much. Both scroll the same `rowWidth` of
  // content, so without matching the gutter here the header would run out of
  // scroll before the body did, and the headings would sit up to a scrollbar's
  // width to the right of their columns at the far right of the sheet.
  $: headerWidth = $rowWidth + $verticalScrollbarWidth;

  export let inheritFontStyle = false;
  let headerRef: HTMLElement;

  function onHScrollOffsetChange(_hscrollOffset: number) {
    if (headerRef) {
      headerRef.scrollLeft = _hscrollOffset;
    }
  }

  $: onHScrollOffsetChange($horizontalScrollOffset);

  function onHeaderScroll(scrollLeft: number) {
    if ($horizontalScrollOffset !== scrollLeft) {
      api.setHorizontalScrollOffset(scrollLeft);
    }
  }

  onMount(() => {
    onHScrollOffsetChange($horizontalScrollOffset);

    const scrollListener = (event: Event) => {
      const { scrollLeft } = event.target as HTMLElement;
      onHeaderScroll(scrollLeft);
    };

    headerRef.addEventListener('scroll', scrollListener);

    return () => {
      headerRef.removeEventListener('scroll', scrollListener);
    };
  });
</script>

<div
  bind:this={headerRef}
  data-sheet-element="header-row"
  class:inherit-font-style={inheritFontStyle}
>
  <div style:width="{headerWidth}px">
    <slot />
  </div>
</div>

<style lang="scss">
  [data-sheet-element='header-row'] {
    min-width: 100%;
    position: relative;
    flex-grow: 0;
    flex-shrink: 0;
    background-color: var(--color-bg-header);
    border-bottom: 1px solid var(--color-border-header);
    box-shadow: 0 2px 4px var(--color-shadow);
    user-select: none;
    -webkit-user-select: none; /* Safari */
    overflow: hidden;

    > div {
      position: relative;
      height: var(--sheet-header-height, 32px);
      color: var(--color-fg-base);
    }

    &.inherit-font-style {
      :global([data-sheet-element='column-header-cell']) {
        font-size: inherit;
        font-weight: inherit;
      }
    }
  }
</style>
