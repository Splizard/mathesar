<!--
@component

The values of an array, each in a cell of the type of the array's items, as the
table has them: to change, remove, and add to. Used where showing the values as
text wouldn't let them be edited, such as arrays of booleans or of files.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';

  import type { FileManifest } from '@mathesar/api/rpc/records';
  import CellFabric from '@mathesar/components/cell-fabric/CellFabric.svelte';
  import type { CellColumnFabric } from '@mathesar/components/cell-fabric/types';
  import { iconAddNew, iconDeleteMajor } from '@mathesar/icons';
  import { Button, Icon } from '@mathesar-component-library';

  /** The column of one value, of the type of the array's items */
  export let itemColumnFabric: CellColumnFabric;
  export let value: unknown[] | null = null;
  export let disabled = false;
  /** The file a value refers to, for arrays of files */
  export let getFileManifest:
    | ((value: unknown) => FileManifest | undefined)
    | undefined = undefined;
  export let setFileManifest:
    | ((hmac: string, manifest: FileManifest) => void)
    | undefined = undefined;

  const dispatch = createEventDispatcher();

  /** The values being edited, which are the given ones until they're changed */
  let elements: unknown[] = [];
  let lastValue: unknown[] | null | undefined;
  $: if (value !== lastValue) {
    lastValue = value;
    elements = value ? [...value] : [];
  }
  /** The value being edited, as a table has one active cell */
  let activeIndex: number | undefined = undefined;

  $: positions = elements.map((element, index) => index);

  function commit() {
    value = [...elements];
    lastValue = value;
    dispatch('artificialInput', value);
    dispatch('artificialChange', value);
  }

  function setValue(index: number, newValue: unknown) {
    elements = elements.map((element, i) => (i === index ? newValue : element));
    commit();
  }

  function addValue() {
    // A value starts out NULL, as a new record's cells do
    elements = [...elements, null];
    activeIndex = elements.length - 1;
    commit();
  }

  function removeValue(index: number) {
    elements = elements.filter((element, i) => i !== index);
    activeIndex = undefined;
    commit();
  }
</script>

<div class="array-elements">
  {#each positions as index (index)}
    <div class="element">
      <span class="position">{index + 1}</span>
      <span
        class="cell"
        class:active={activeIndex === index}
        on:click={() => {
          activeIndex = index;
        }}
      >
        <CellFabric
          columnFabric={itemColumnFabric}
          {disabled}
          isActive={activeIndex === index}
          value={elements[index]}
          setValue={(newValue) => setValue(index, newValue)}
          fileManifest={getFileManifest?.(elements[index])}
          {setFileManifest}
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
  .add {
    margin-top: var(--sm3);
  }
</style>
