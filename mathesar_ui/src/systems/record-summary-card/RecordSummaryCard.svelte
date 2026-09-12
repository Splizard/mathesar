<script lang="ts">
  import type { FilledCard } from './renderCard';

  export let card: FilledCard;

  /**
   * Whether to keep the aside on its own side. A card in a narrow space puts it under the rest
   * instead, where there is somewhere to put it.
   */
  export let asideBeside = true;
</script>

<div class="record-summary-card" class:aside-beside={asideBeside}>
  <div class="said">
    <div class="primary">{card.primary}</div>
    {#if card.secondary}
      <div class="secondary">{card.secondary}</div>
    {/if}
  </div>
  {#if card.aside}
    <div class="aside">{card.aside}</div>
  {/if}
</div>

<style lang="scss">
  .record-summary-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sm5);
    min-width: 0;
    width: 100%;
  }

  .record-summary-card.aside-beside {
    flex-direction: row;
    align-items: baseline;
    gap: var(--sm2);
  }

  .said {
    min-width: 0;
    flex: 1 1 auto;
  }

  .primary {
    color: var(--color-fg-base);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .secondary {
    font-size: var(--sm1);
    color: var(--color-fg-subtle-1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .aside {
    flex: 0 0 auto;
    font-size: var(--sm1);
    color: var(--color-fg-subtle-2);
    /* Off to the side means off to the far side, whatever the rest of the card is. */
    margin-left: auto;
    white-space: nowrap;
  }

  /* Stacked, the aside has no side to be off to. */
  .record-summary-card:not(.aside-beside) .aside {
    margin-left: 0;
  }
</style>
