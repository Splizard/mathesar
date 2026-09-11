<script lang="ts">
  /**
   * Ported from "react-virtualized-auto-sizer@1.0.5"
   * https://github.com/bvaughn/react-virtualized-auto-sizer
   * MIT © bvaughn
   *
   * This fork contains the following changes:
   * 1. Ported to Svelte, TS
   * 2. Stripped down to essentials
   * 3. Sizes only the height; width is always 100% (but is measured too)
   */

  import { onMount } from 'svelte';

  import {
    type ElementResizeDetector,
    createDetectElementResize,
  } from './detectElementResize';

  let classes = 'default';
  export { classes as class };
  $: outerClass = ['virtual-list', 'resizer', classes].join(' ');

  let wrapperRef: HTMLElement;
  let parentNode: HTMLElement;

  let bailoutOnSlot = false;
  let height = 0;
  let width = 0;

  function onResize() {
    if (parentNode) {
      if (width !== parentNode.offsetWidth) {
        width = parentNode.offsetWidth;
      }
      const parentOffsetHeight = parentNode.offsetHeight || 0;
      const style =
        window.getComputedStyle(parentNode) || ({} as CSSStyleDeclaration);
      const paddingTop = parseInt(style.paddingTop, 10) || 0;
      const paddingBottom = parseInt(style.paddingBottom, 10) || 0;
      const newHeight = parentOffsetHeight - paddingTop - paddingBottom;
      if (height !== newHeight) {
        height = parentOffsetHeight - paddingTop - paddingBottom;
      }
    }
  }

  onMount(() => {
    let detectElementResize: ElementResizeDetector;

    if (wrapperRef?.parentNode) {
      parentNode = wrapperRef.parentNode as HTMLElement;
      detectElementResize = createDetectElementResize();
      detectElementResize.addResizeListener(parentNode, onResize);
      onResize();
    }

    return () => {
      if (detectElementResize && parentNode) {
        detectElementResize.removeResizeListener(parentNode, onResize);
      }
    };
  });

  function onHeightChange(_height: number) {
    bailoutOnSlot = _height === 0;
  }

  $: onHeightChange(height);
</script>

<div class={outerClass} bind:this={wrapperRef}>
  {#if !bailoutOnSlot}
    <slot {height} {width} />
  {/if}
</div>
