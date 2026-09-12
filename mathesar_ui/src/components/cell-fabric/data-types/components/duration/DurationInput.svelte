<!--
@component

A duration, typed as a time on a clock in the column's format, with a picker
below it holding the amount and the unit it's of, which is how a duration is
usually meant: 30 minutes, 3 days.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';

  import {
    type DurationFormatter,
    DurationSpecification,
  } from '@mathesar/utils/duration';
  import {
    type AmountUnit,
    allAmountUnits,
    readDurationAmount,
    writeDurationAmount,
  } from '@mathesar/utils/duration/durationAmount';
  import {
    AttachableDropdown,
    FormattedInput,
    LabeledInput,
    Select,
    StringifiedNumberInput,
  } from '@mathesar-component-library';

  export let value: string | null | undefined = undefined;
  export let formatter: DurationFormatter;
  export let specification: DurationSpecification = new DurationSpecification();
  export let disabled = false;
  /** Only a cell shows the value formatted, but both are given the same props */
  export const formatForDisplay: unknown = undefined;

  const dispatch = createEventDispatcher();

  let element: HTMLInputElement;
  let isOpen = false;

  $: labels = {
    y: $_('years'),
    mon: $_('months'),
    w: $_('weeks'),
    d: $_('days'),
    h: $_('hours'),
    m: $_('minutes'),
    s: $_('seconds'),
    ms: $_('milliseconds'),
  } as Record<AmountUnit, string>;
  /** The unit a duration of none is taken to be of: the column's largest */
  $: defaultUnit = specification.getUnitsInRange()[0] as AmountUnit;

  let amount: string | null | undefined;
  let unit: AmountUnit;
  /** The value the amount and unit were last read from or written to */
  let settledValue: string | null | undefined;

  $: if (value !== settledValue) {
    settledValue = value;
    ({ amount, unit } = readDurationAmount(value, defaultUnit));
  }

  function setDuration(duration: string | null) {
    settledValue = duration;
    value = duration;
    dispatch('artificialInput', duration);
    dispatch('artificialChange', duration);
  }

  function handlePicked() {
    // A duration of more than one of PostgreSQL's parts is no single amount,
    // and is left as it is rather than thrown away by picking at it
    if (amount === null || amount === undefined || amount === '') return;
    setDuration(writeDurationAmount(amount, unit));
  }

  function open() {
    isOpen = true;
  }

  function close() {
    isOpen = false;
  }

  function checkAndBlur() {
    // The picker is below the input, so focus in it isn't focus lost
    if (!isOpen) dispatch('blur');
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Tab') close();
  }
</script>

<FormattedInput
  {...$$restProps}
  bind:value
  bind:element
  {formatter}
  {disabled}
  placeholder={specification.getFormattingString()}
  on:focus={open}
  on:focus
  on:blur={checkAndBlur}
  on:keydown={onKeydown}
  on:keydown
  on:artificialInput
  on:artificialChange
/>

<AttachableDropdown
  class="retain-active-cell no-max-height"
  trigger={element}
  bind:isOpen
  on:close={() => dispatch('blur')}
>
  <div class="duration-picker">
    <LabeledInput label={$_('duration')} layout="stacked">
      <div class="amount">
        <StringifiedNumberInput
          {disabled}
          aria-label={$_('duration')}
          bind:value={amount}
          on:change={handlePicked}
          on:blur={handlePicked}
        />
        <Select
          options={[...allAmountUnits]}
          bind:value={unit}
          getLabel={(option) => (option && labels[option]) ?? ''}
          {disabled}
          on:change={handlePicked}
        />
      </div>
    </LabeledInput>
  </div>
</AttachableDropdown>

<style>
  .duration-picker {
    padding: var(--sm3);
    min-width: 14rem;
  }
  .amount {
    display: flex;
    align-items: center;
    gap: var(--sm4);
  }
  .amount :global(input) {
    min-width: 0;
    width: 100%;
  }
  .amount > :global(:first-child) {
    flex: 1 1 auto;
    min-width: 0;
  }
</style>
