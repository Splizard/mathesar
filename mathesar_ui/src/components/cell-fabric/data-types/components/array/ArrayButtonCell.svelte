<!--
@component

An array whose values can't be shown as text, such as an array of booleans or
of files. It shows them, with a button to edit them in the cell inspector.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';

  import CellValue from '@mathesar/components/CellValue.svelte';
  import Null from '@mathesar/components/Null.svelte';
  import { iconMoreActions } from '@mathesar/icons';
  import { showTableInspectorTab } from '@mathesar/stores/tableInspector';
  import {
    Button,
    Icon,
    Truncate,
    isDefinedNonNullable,
  } from '@mathesar-component-library';

  import CellWrapper from '../CellWrapper.svelte';
  import type { CellTypeProps, CellValueFormatter } from '../typeDefinitions';

  type $$Props = CellTypeProps<unknown[]> & {
    formatElementForDisplay: CellValueFormatter<unknown>;
  };

  const dispatch = createEventDispatcher();

  export let isActive: $$Props['isActive'];
  export let value: $$Props['value'] = undefined;
  export let disabled: $$Props['disabled'];
  export let isIndependentOfSheet: $$Props['isIndependentOfSheet'];
  export let formatElementForDisplay: $$Props['formatElementForDisplay'];

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
      {#if isDefinedNonNullable(value)}
        <div class="values">
          {#each value as entry}
            <span class="token">
              {#if entry === null}
                <Null />
              {:else}
                <Truncate>
                  {formatElementForDisplay(entry)}
                </Truncate>
              {/if}
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
    gap: var(--sm4);
    overflow: hidden;
  }
  .token {
    padding: 0 var(--sm3);
    border-radius: var(--border-radius-l);
    white-space: nowrap;
    color: var(--color-fg-base);
    background-color: var(--color-bg-token);
    border: 1px solid var(--color-border-token);
  }
  .edit {
    margin-left: auto;
  }
</style>
