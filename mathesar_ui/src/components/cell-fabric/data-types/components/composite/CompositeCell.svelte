<!--
@component

A composite value, shown as its fields, with a button to edit them in the cell
inspector, where each field has a cell of its own.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';

  import CellValue from '@mathesar/components/CellValue.svelte';
  import { showTableInspectorTab } from '@mathesar/stores/tableInspector';
  import { Button, Truncate } from '@mathesar-component-library';

  import CellWrapper from '../CellWrapper.svelte';
  import type { CellTypeProps, CellValueFormatter } from '../typeDefinitions';

  type $$Props = CellTypeProps<unknown> & {
    formatValue: CellValueFormatter<unknown>;
  };

  const dispatch = createEventDispatcher();

  export let isActive: $$Props['isActive'];
  export let value: $$Props['value'] = undefined;
  export let disabled: $$Props['disabled'];
  export let isIndependentOfSheet: $$Props['isIndependentOfSheet'];
  export let formatValue: $$Props['formatValue'];

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
  <div class="composite-cell">
    <span class="fields">
      <CellValue {value}>
        <Truncate>{formatValue(value)}</Truncate>
      </CellValue>
    </span>
    {#if isActive && !isIndependentOfSheet}
      <span class="edit">
        <Button
          appearance="secondary"
          size="small"
          {disabled}
          aria-label={$_('edit_fields')}
          tooltip={$_('edit_fields_in_inspector')}
          on:click={() => showTableInspectorTab('cell')}
        >
          <!-- eslint-disable-next-line @intlify/svelte/no-raw-text -->
          <span class="braces">{'{…}'}</span>
        </Button>
      </span>
    {/if}
  </div>
</CellWrapper>

<style lang="scss">
  .composite-cell {
    display: flex;
    align-items: center;
    gap: var(--sm4);
    overflow: hidden;
    width: 100%;
  }
  .fields {
    overflow: hidden;
  }
  .edit {
    margin-left: auto;
  }
  .braces {
    font-family: var(--font-family-mono, monospace);
  }
</style>
