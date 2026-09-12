<script lang="ts">
  import { tick } from 'svelte';
  import { _ } from 'svelte-i18n';

  import WarningBox from '@mathesar/components/message-boxes/WarningBox.svelte';
  import {
    iconAddNew,
    iconDeleteMajor,
    iconMoveDown,
    iconMoveUp,
  } from '@mathesar/icons';
  import { Button, Icon, TextInput } from '@mathesar-component-library';

  import {
    type EnumValueEntry,
    getDroppedValues,
    getEntriesError,
    needsRewrite,
    withEntry,
    withEntryMoved,
    withEntryValue,
    withoutEntry,
  } from './enumValues';

  export let entries: EnumValueEntry[];
  /** The values the choice offers now, to say what a change to them would cost */
  export let values: string[] | undefined = undefined;
  export let disabled = false;

  /** The inputs, so that a value just added can be typed into straight away */
  const inputs: Record<number, HTMLInputElement | undefined> = {};

  $: error = getEntriesError(entries);
  $: dropped = getDroppedValues(entries, values);
  $: rewriting = needsRewrite(entries, values);

  async function add() {
    entries = withEntry(entries);
    const { key } = entries[entries.length - 1];
    await tick();
    inputs[key]?.focus();
  }
</script>

<div class="values">
  {#each entries as entry, index (entry.key)}
    <div class="value">
      <TextInput
        bind:element={inputs[entry.key]}
        value={entry.value}
        onValueChange={(value) => {
          entries = withEntryValue(entries, entry.key, value);
        }}
        aria-label={$_('choice_value')}
        {disabled}
      />
      <!-- The order the values come in is the order they are offered in and
      sorted by, so it is part of the choice rather than a view of it. -->
      <Button
        appearance="plain"
        size="small"
        disabled={disabled || index === 0}
        aria-label={$_('move_up')}
        on:click={() => {
          entries = withEntryMoved(entries, index, -1);
        }}
      >
        <Icon {...iconMoveUp} />
      </Button>
      <Button
        appearance="plain"
        size="small"
        disabled={disabled || index === entries.length - 1}
        aria-label={$_('move_down')}
        on:click={() => {
          entries = withEntryMoved(entries, index, 1);
        }}
      >
        <Icon {...iconMoveDown} />
      </Button>
      <Button
        appearance="plain"
        size="small"
        {disabled}
        aria-label={$_('remove')}
        on:click={() => {
          entries = withoutEntry(entries, entry.key);
        }}
      >
        <Icon {...iconDeleteMajor} />
      </Button>
    </div>
  {/each}
  <div class="add">
    <Button appearance="secondary" size="small" {disabled} on:click={add}>
      <Icon {...iconAddNew} />
      <span>{$_('add_choice_value')}</span>
    </Button>
  </div>
  {#if error}
    <p class="error">{$_(error)}</p>
  {:else if rewriting}
    <WarningBox>
      {#if dropped.length > 0}
        {$_('choice_values_dropped_warning', {
          values: { values: dropped.join(', ') },
        })}
      {:else}
        {$_('choice_values_reordered_warning')}
      {/if}
    </WarningBox>
  {/if}
</div>

<style lang="scss">
  .values {
    display: grid;
    gap: var(--sm4);
  }
  .value {
    display: flex;
    align-items: center;
    gap: var(--sm5);
  }
  .value > :global(:first-child) {
    flex: 1 1 auto;
    min-width: 0;
  }
  .add {
    justify-self: start;
  }
  .error {
    margin: 0;
    font-size: var(--sm1);
    color: var(--color-fg-error);
  }
</style>
