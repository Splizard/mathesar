<!--
@component

The bounds of a range, each in a cell of the type of the range's values, with
whether each bound is one of the values the range holds.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';

  import CellFabric from '@mathesar/components/cell-fabric/CellFabric.svelte';
  import type { CellColumnFabric } from '@mathesar/components/cell-fabric/types';
  import {
    type RangeValue,
    formatRange,
    parseRange,
    unboundedRange,
  } from '@mathesar/utils/rangeValue';
  import { Checkbox, LabeledInput } from '@mathesar-component-library';

  /** The column of the range's values, for its bounds to be cells of */
  export let columnFabric: CellColumnFabric;
  export let value: unknown = undefined;
  export let disabled = false;

  const dispatch = createEventDispatcher();

  /** The bound being edited, as a table has one active cell */
  let activeBound: 'lower' | 'upper' | undefined = undefined;

  $: range = (typeof value === 'string' ? parseRange(value) : undefined) ?? {
    ...unboundedRange,
  };

  function set(changes: Partial<RangeValue>) {
    const newValue = formatRange({ ...range, ...changes });
    value = newValue;
    dispatch('artificialInput', newValue);
    dispatch('artificialChange', newValue);
  }

  function setBound(bound: 'lower' | 'upper', boundValue: unknown) {
    const text =
      boundValue === null || boundValue === undefined || boundValue === ''
        ? undefined
        : String(boundValue);
    // A bound left out is unbounded, so an empty range needs bounds again
    set({ [bound]: text, isEmpty: false });
  }
</script>

<div class="range-bounds" class:disabled>
  <div class="bound">
    <span class="name">{$_('range_from')}</span>
    <span
      class="cell"
      class:active={activeBound === 'lower'}
      on:click={() => {
        activeBound = 'lower';
      }}
    >
      <CellFabric
        {columnFabric}
        {disabled}
        isActive={activeBound === 'lower'}
        value={range.lower ?? null}
        setValue={(boundValue) => setBound('lower', boundValue)}
      />
    </span>
    <LabeledInput label={$_('range_including')} layout="inline-input-first">
      <Checkbox
        checked={range.lowerInclusive}
        {disabled}
        on:change={(e) => set({ lowerInclusive: e.detail })}
      />
    </LabeledInput>
  </div>
  <div class="bound">
    <span class="name">{$_('range_to')}</span>
    <span
      class="cell"
      class:active={activeBound === 'upper'}
      on:click={() => {
        activeBound = 'upper';
      }}
    >
      <CellFabric
        {columnFabric}
        {disabled}
        isActive={activeBound === 'upper'}
        value={range.upper ?? null}
        setValue={(boundValue) => setBound('upper', boundValue)}
      />
    </span>
    <LabeledInput label={$_('range_including')} layout="inline-input-first">
      <Checkbox
        checked={range.upperInclusive}
        {disabled}
        on:change={(e) => set({ upperInclusive: e.detail })}
      />
    </LabeledInput>
  </div>
  <LabeledInput label={$_('range_empty')} layout="inline-input-first">
    <Checkbox
      checked={range.isEmpty}
      {disabled}
      on:change={(e) => set({ isEmpty: e.detail })}
    />
  </LabeledInput>
</div>

<style lang="scss">
  .range-bounds {
    display: flex;
    flex-direction: column;
    gap: var(--sm4);
  }
  .bound {
    display: flex;
    align-items: center;
    gap: var(--sm4);
  }
  .name {
    color: var(--color-fg-base-muted);
    font-size: var(--sm1);
    min-width: 3em;
    text-align: right;
  }
  .cell {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    background: var(--color-bg-input);
    border: 1px solid var(--color-border-base);
    border-radius: var(--border-radius-m);

    &.active {
      border-color: var(--color-fg-accent);
    }
  }
</style>
