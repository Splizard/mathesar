<!--
@component

The values of an array, each in an input of the type of the array's items, to
add to, remove from, and change. Used where showing them as text wouldn't let
them be edited, such as arrays of booleans or of files.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';

  import DynamicInput from '@mathesar/components/cell-fabric/DynamicInput.svelte';
  import { iconAddNew, iconDeleteMajor } from '@mathesar/icons';
  import { Button, Icon } from '@mathesar-component-library';
  import type { ComponentAndProps } from '@mathesar-component-library/types';

  /** The input for one value, of the type of the array's items */
  export let componentAndProps: ComponentAndProps;
  /** What a value added to the array holds until it's given one */
  export let initialValue: unknown = null;
  export let value: unknown[] | null = null;
  export let disabled = false;

  const dispatch = createEventDispatcher();

  /** The values being edited, which are the given ones until they're changed */
  let elements: unknown[] = [];
  let lastValue: unknown[] | null | undefined;
  $: if (value !== lastValue) {
    lastValue = value;
    elements = value ? [...value] : [];
  }

  function commit() {
    value = [...elements];
    lastValue = value;
    dispatch('artificialInput', value);
    dispatch('artificialChange', value);
  }

  function addValue() {
    elements = [...elements, initialValue ?? null];
    commit();
  }

  function removeValue(index: number) {
    elements = elements.filter((element, i) => i !== index);
    commit();
  }

  $: positions = elements.map((element, index) => index);
</script>

<div class="array-elements">
  {#each positions as index (index)}
    <div class="element">
      <span class="position">{index + 1}</span>
      <span class="input">
        <DynamicInput
          {componentAndProps}
          {disabled}
          bind:value={elements[index]}
          on:artificialChange={commit}
          on:change={commit}
          on:blur={commit}
        />
      </span>
      <Button
        appearance="plain"
        size="small"
        {disabled}
        aria-label={$_('remove_value')}
        on:click={() => removeValue(index)}
      >
        <Icon {...iconDeleteMajor} />
      </Button>
    </div>
  {/each}
  <div class="add">
    <Button appearance="secondary" size="small" {disabled} on:click={addValue}>
      <Icon {...iconAddNew} />
      <span>{$_('add_value')}</span>
    </Button>
  </div>
</div>

<style lang="scss">
  .array-elements {
    display: flex;
    flex-direction: column;
    gap: var(--sm4);
  }
  .element {
    display: flex;
    align-items: center;
    gap: var(--sm4);
  }
  .position {
    color: var(--color-fg-base-muted);
    font-size: var(--sm1);
    min-width: 1.5em;
    text-align: right;
  }
  .input {
    flex: 1 1 auto;
    min-width: 0;
  }
  .add {
    margin-top: var(--sm3);
  }
</style>
