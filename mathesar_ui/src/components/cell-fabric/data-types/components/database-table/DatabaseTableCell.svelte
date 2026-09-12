<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';

  import Default from '@mathesar/components/Default.svelte';
  import Null from '@mathesar/components/Null.svelte';
  import {
    findTableByName,
    getAllTablesStore,
    getQualifiedTableName,
  } from '@mathesar/stores/allTables';
  import { databasesStore } from '@mathesar/stores/databases';
  import { rowSeekerContext } from '@mathesar/systems/row-seeker/AttachableRowSeekerController';
  import { Icon, iconExpandDown } from '@mathesar-component-library';

  import CellWrapper from '../CellWrapper.svelte';
  import type { CellExternalProps } from '../typeDefinitions';

  import { createTableRecordStore } from './tableRecordUtils';
  import TableValue from './TableValue.svelte';

  const dispatch = createEventDispatcher();
  const rowSeekerController = rowSeekerContext.get();
  const { currentDatabase } = databasesStore;

  export let isActive: CellExternalProps['isActive'];
  export let value: CellExternalProps['value'] = undefined;
  export let setValue: (newValue: CellExternalProps['value']) => void;
  export let searchValue: CellExternalProps['searchValue'] = undefined;
  export let disabled: CellExternalProps['disabled'];
  export let isIndependentOfSheet: CellExternalProps['isIndependentOfSheet'];

  let cellWrapperElement: HTMLElement;
  let wasActiveBeforeClick = false;

  $: database = $currentDatabase;
  $: tablesApiStore = database ? getAllTablesStore(database) : undefined;
  $: void tablesApiStore?.runConservatively();
  $: tables = $tablesApiStore?.resolvedValue ?? [];
  $: hasValue = value !== undefined && value !== null;

  async function launchRowSeeker(event?: MouseEvent) {
    if (disabled || !rowSeekerController) return;
    event?.stopPropagation();
    if ($tablesApiStore?.isRejected) await tablesApiStore?.run();
    const table = hasValue ? findTableByName(tables, String(value)) : undefined;
    try {
      const selection = await rowSeekerController.acquireUserSelection({
        triggerElement: cellWrapperElement,
        previousValue: table
          ? {
              key: getQualifiedTableName(table),
              summary: getQualifiedTableName(table),
            }
          : undefined,
        constructRecordStore: () => createTableRecordStore(tables),
      });
      setValue(selection ? (selection.key as string) : null);
    } catch {
      // The choice was cancelled
    }
    cellWrapperElement?.focus();
  }

  function handleWrapperKeyDown(e: KeyboardEvent) {
    if (['Tab', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      dispatch('movementKeyDown', { originalEvent: e, key: e.key });
      return;
    }
    switch (e.key) {
      case 'Enter':
        if (isActive && !disabled) void launchRowSeeker();
        break;
      case 'ArrowDown':
      case 'ArrowUp':
        dispatch('movementKeyDown', { originalEvent: e, key: e.key });
        break;
      default:
        break;
    }
  }

  function handleMouseDown() {
    wasActiveBeforeClick = isActive;
    dispatch('activate');
  }

  function handleClick() {
    if (wasActiveBeforeClick && !disabled) void launchRowSeeker();
  }
</script>

<CellWrapper
  bind:element={cellWrapperElement}
  {isActive}
  {disabled}
  {isIndependentOfSheet}
  on:mouseenter
  on:keydown={handleWrapperKeyDown}
  on:mousedown={handleMouseDown}
  on:click={handleClick}
  on:dblclick={launchRowSeeker}
  hasPadding={false}
>
  <div class="database-table-cell" class:disabled>
    <div class="value">
      {#if hasValue}
        <TableValue {value} {searchValue} />
      {:else if value === undefined}
        <Default />
      {:else}
        <Null />
      {/if}
    </div>
    {#if !disabled && isActive}
      <button
        class="dropdown-button passthrough"
        on:click|stopPropagation={launchRowSeeker}
        aria-label={$_('select_table')}
        title={$_('select_table')}
        type="button"
      >
        <Icon {...iconExpandDown} />
      </button>
    {/if}
  </div>
</CellWrapper>

<style>
  .database-table-cell {
    flex: 1 0 auto;
    display: flex;
    justify-content: space-between;
  }
  .value {
    padding: var(--cell-padding);
    align-self: center;
    overflow: hidden;
    width: max-content;
    max-width: 100%;
    color: var(--color-fg-base);
  }
  .dropdown-button {
    cursor: pointer;
    padding: 0 var(--cell-padding);
    display: flex;
    align-items: center;
    color: var(--color-fg-base-disabled);
    background: none;
    border: none;
  }
  .dropdown-button:hover {
    color: var(--color-fg-base);
  }
</style>
