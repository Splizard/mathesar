<!--
@component

An array whose values can't be shown as text, such as an array of booleans or
of files. It shows each of them in a cell of the type of the array's items, with
a button to edit them in the cell inspector.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';

  import type { FileManifest } from '@mathesar/api/rpc/records';
  import CellFabric from '@mathesar/components/cell-fabric/CellFabric.svelte';
  import type { CellColumnFabric } from '@mathesar/components/cell-fabric/types';
  import CellValue from '@mathesar/components/CellValue.svelte';
  import { iconMoreActions } from '@mathesar/icons';
  import { showTableInspectorTab } from '@mathesar/stores/tableInspector';
  import { Button, Icon } from '@mathesar-component-library';

  import CellWrapper from '../CellWrapper.svelte';
  import type { CellTypeProps } from '../typeDefinitions';

  type $$Props = CellTypeProps<unknown[]> & {
    itemColumnFabric: CellColumnFabric;
    getFileManifest?: (value: unknown) => FileManifest | undefined;
  };

  const dispatch = createEventDispatcher();

  export let isActive: $$Props['isActive'];
  export let value: $$Props['value'] = undefined;
  export let disabled: $$Props['disabled'];
  export let isIndependentOfSheet: $$Props['isIndependentOfSheet'];
  /** The column of one value, of the type of the array's items */
  export let itemColumnFabric: $$Props['itemColumnFabric'];
  export let getFileManifest: $$Props['getFileManifest'] = undefined;

  function handleWrapperKeyDown(e: KeyboardEvent) {
    switch (e.key) {
      case 'Tab':
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowDown':
      case 'ArrowUp':
        dispatch('movementKeyDown', {
          originalEvent: e,
          key: e.key,
        });
        break;
      default:
        break;
    }
  }
</script>

<CellWrapper
  {isActive}
  {disabled}
  {isIndependentOfSheet}
  on:mouseenter
  on:keydown={handleWrapperKeyDown}
>
  <div class="array-button-cell">
    <CellValue {value}>
      {#if Array.isArray(value)}
        <div class="values">
          {#each value as element}
            <span class="value">
              <CellFabric
                columnFabric={itemColumnFabric}
                value={element}
                disabled={true}
                fileManifest={getFileManifest?.(element)}
              />
            </span>
          {/each}
        </div>
      {/if}
    </CellValue>
    {#if isActive && !isIndependentOfSheet}
      <span class="edit">
        <Button
          appearance="secondary"
          size="small"
          {disabled}
          aria-label={$_('edit_values')}
          tooltip={$_('edit_values_in_inspector')}
          on:click={() => showTableInspectorTab('cell')}
        >
          <Icon {...iconMoreActions} rotate={90} />
        </Button>
      </span>
    {/if}
  </div>
</CellWrapper>

<style lang="scss">
  .array-button-cell {
    display: flex;
    align-items: center;
    gap: var(--sm4);
    overflow: hidden;
    width: 100%;
  }
  .values {
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    gap: var(--sm4);
    overflow: hidden;
  }
  .value {
    display: flex;
    align-items: center;
    max-width: 12em;
    padding: 0 var(--sm4);
    border-radius: var(--border-radius-m);
    border: 1px solid var(--color-border-base);
    background: var(--color-bg-base);
  }
  .edit {
    margin-left: auto;
  }
</style>
