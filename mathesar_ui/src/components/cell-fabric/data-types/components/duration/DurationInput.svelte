<!--
@component

A duration as an amount of a unit, such as 30 minutes, which is how one is
usually meant, rather than as a time on a clock. The units offered are those
the column's formatting allows.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';

  import type { DurationUnit } from '@mathesar/api/rpc/_common/columnDisplayOptions';
  import { DurationSpecification } from '@mathesar/utils/duration';
  import {
    readDurationAmount,
    writeDurationAmount,
  } from '@mathesar/utils/duration/durationAmount';
  import { Select, StringifiedNumberInput } from '@mathesar-component-library';

  export let value: string | null | undefined = undefined;
  export let specification: DurationSpecification = new DurationSpecification();
  export let disabled = false;
  export let onValueChange: ((value: string | null) => void) | undefined =
    undefined;
  export let focusOnMount = false;

  const dispatch = createEventDispatcher();

  $: units = specification.getUnitsInRange();
  $: labels = {
    d: $_('days'),
    h: $_('hours'),
    m: $_('minutes'),
    s: $_('seconds'),
    ms: $_('milliseconds'),
  } as Record<DurationUnit, string>;

  let amount: string | null | undefined;
  let unit: DurationUnit;
  /** The value we last read from or wrote to `value`, to leave what's typed */
  let settledValue: string | null | undefined;

  $: if (value !== settledValue) {
    settledValue = value;
    ({ amount, unit } = readDurationAmount(
      value,
      specification.getUnitsInRange(),
    ));
  }

  function handleChange() {
    const duration = writeDurationAmount(amount, unit);
    settledValue = duration;
    value = duration;
    onValueChange?.(duration);
    dispatch('artificialInput', duration);
    dispatch('artificialChange', duration);
  }
</script>

<div class="duration-input">
  <StringifiedNumberInput
    {focusOnMount}
    {disabled}
    aria-label={$_('duration')}
    bind:value={amount}
    on:change={handleChange}
    on:blur={handleChange}
    on:blur
  />
  <Select
    options={units}
    bind:value={unit}
    getLabel={(option) => (option && labels[option]) ?? ''}
    {disabled}
    on:change={handleChange}
  />
</div>

<style>
  .duration-input {
    display: flex;
    align-items: center;
    gap: var(--sm4);
    width: 100%;
  }
  .duration-input :global(input) {
    min-width: 0;
    width: 100%;
  }
  .duration-input > :global(:first-child) {
    flex: 1 1 auto;
    min-width: 0;
  }
</style>
