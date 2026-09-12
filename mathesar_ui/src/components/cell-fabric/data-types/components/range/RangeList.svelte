<!--
@component

The ranges of a multirange, each edited by its bounds, to change, remove, or
add to. PostgreSQL puts them in order and merges any that meet, so what's
saved can come back as fewer ranges than were given.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';

  import type { CellColumnFabric } from '@mathesar/components/cell-fabric/types';
  import { iconDeleteMajor } from '@mathesar/icons';
  import {
    type RangeValue,
    formatMultirange,
    formatRange,
    parseMultirange,
    unboundedRange,
  } from '@mathesar/utils/rangeValue';
  import { Button, Icon } from '@mathesar-component-library';

  import RangeBounds from './RangeBounds.svelte';

  export let columnFabric: CellColumnFabric;
  export let value: unknown = undefined;
  export let disabled = false;

  const dispatch = createEventDispatcher();

  $: ranges =
    (typeof value === 'string' ? parseMultirange(value) : undefined) ?? [];

  function setRanges(newRanges: RangeValue[]) {
    const newValue = formatMultirange(newRanges);
    value = newValue;
    dispatch('artificialInput', newValue);
    dispatch('artificialChange', newValue);
  }

  function setRange(index: number, rangeText: unknown) {
    const parsed =
      typeof rangeText === 'string' ? parseMultirange(`{${rangeText}}`) : [];
    setRanges(
      ranges.map((range, i) => (i === index ? parsed?.[0] ?? range : range)),
    );
  }

  function removeRange(index: number) {
    setRanges(ranges.filter((_range, i) => i !== index));
  }

  function addRange() {
    setRanges([...ranges, { ...unboundedRange }]);
  }
</script>

<div class="range-list">
  {#each ranges as range, index (index)}
    <div class="range">
      <span class="position">{index + 1}</span>
      <div class="bounds">
        <RangeBounds
          {columnFabric}
          {disabled}
          value={formatRange(range)}
          on:artificialChange={(e) => setRange(index, e.detail)}
        />
      </div>
      {#if !disabled}
        <Button
          appearance="secondary"
          size="small"
          aria-label={$_('remove_range')}
          on:click={() => removeRange(index)}
        >
          <Icon {...iconDeleteMajor} />
        </Button>
      {/if}
    </div>
  {/each}
  {#if !disabled}
    <Button appearance="secondary" on:click={addRange}>
      {$_('add_range')}
    </Button>
  {/if}
</div>

<style lang="scss">
  .range-list {
    display: flex;
    flex-direction: column;
    gap: var(--sm3);
  }
  .range {
    display: flex;
    align-items: flex-start;
    gap: var(--sm4);
  }
  .bounds {
    flex: 1 1 auto;
    min-width: 0;
  }
  .position {
    color: var(--color-fg-base-muted);
    font-size: var(--sm1);
    padding-top: var(--sm5);
  }
</style>
