<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';

  import type {
    KindOfChoice,
    Modifiers,
  } from '@mathesar/stores/abstract-types/typeFamilies';
  import { Checkbox, LabeledInput } from '@mathesar-component-library';

  const dispatch = createEventDispatcher<{ change: Modifiers }>();

  /** The kind chosen, and whether it's of ranges or arrays of its values */
  export let selected: KindOfChoice;
  /** Whether each modifier can be changed, the others staying as they are */
  export let canChange: Record<keyof Modifiers, boolean> = {
    isRange: true,
    isArray: true,
  };
  export let disabled = false;

  /** Modifiers that can't be changed are only shown where the column has them */
  $: shown = {
    isRange:
      !!selected.kind.hasRanges && (selected.isRange || canChange.isRange),
    isArray:
      !selected.kind.withoutArrays && (selected.isArray || canChange.isArray),
  };

  function toggle(modifier: keyof Modifiers) {
    dispatch('change', {
      isRange: selected.isRange,
      isArray: selected.isArray,
      [modifier]: !selected[modifier],
    });
  }
</script>

{#if shown.isRange || shown.isArray}
  <div class="type-modifiers">
    {#if shown.isRange}
      <LabeledInput
        label={$_('range')}
        help={$_('range_help')}
        helpType="tooltip"
        layout="inline-input-first"
      >
        <Checkbox
          checked={selected.isRange}
          disabled={disabled || !canChange.isRange}
          on:change={() => toggle('isRange')}
        />
      </LabeledInput>
    {/if}
    {#if shown.isArray}
      <LabeledInput
        label={$_('array')}
        help={$_('array_help')}
        helpType="tooltip"
        layout="inline-input-first"
      >
        <Checkbox
          checked={selected.isArray}
          disabled={disabled || !canChange.isArray}
          on:change={() => toggle('isArray')}
        />
      </LabeledInput>
    {/if}
  </div>
{/if}

<style lang="scss">
  .type-modifiers {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sm3) var(--lg1);
  }
</style>
