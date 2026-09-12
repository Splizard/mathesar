<!--
@component

The fields of a composite value, each in a cell of the field's type, as the
table has them, to change.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  import type { FileManifest } from '@mathesar/api/rpc/records';
  import CellFabric from '@mathesar/components/cell-fabric/CellFabric.svelte';
  import type { CellColumnFabric } from '@mathesar/components/cell-fabric/types';

  /** The fields of the composite type, in order, each with its own cell */
  export let fields: { name: string; columnFabric: CellColumnFabric }[] = [];
  export let value: unknown = undefined;
  export let disabled = false;
  /** The file a field refers to, for fields holding files */
  export let getFileManifest:
    | ((value: unknown) => FileManifest | undefined)
    | undefined = undefined;
  export let setFileManifest:
    | ((hmac: string, manifest: FileManifest) => void)
    | undefined = undefined;

  const dispatch = createEventDispatcher();

  /** The field being edited, as a table has one active cell */
  let activeField: string | undefined = undefined;

  $: fieldValues = (value ?? {}) as Record<string, unknown>;

  function setField(name: string, fieldValue: unknown) {
    value = { ...fieldValues, [name]: fieldValue };
    dispatch('artificialInput', value);
    dispatch('artificialChange', value);
  }
</script>

<div class="composite-fields">
  {#each fields as field (field.name)}
    <div class="field">
      <span class="name">{field.name}</span>
      <span
        class="cell"
        class:active={activeField === field.name}
        on:click={() => {
          activeField = field.name;
        }}
      >
        <CellFabric
          columnFabric={field.columnFabric}
          {disabled}
          isActive={activeField === field.name}
          value={fieldValues[field.name]}
          setValue={(fieldValue) => setField(field.name, fieldValue)}
          fileManifest={getFileManifest?.(fieldValues[field.name])}
          {setFileManifest}
        />
      </span>
    </div>
  {/each}
</div>

<style lang="scss">
  .composite-fields {
    display: flex;
    flex-direction: column;
    gap: var(--sm4);
  }
  .field {
    display: flex;
    align-items: center;
    gap: var(--sm4);
  }
  .name {
    color: var(--color-fg-base-muted);
    font-size: var(--sm1);
    min-width: 6em;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
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
