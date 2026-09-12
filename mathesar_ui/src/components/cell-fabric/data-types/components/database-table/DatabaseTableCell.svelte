<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';

  import Default from '@mathesar/components/Default.svelte';
  import Null from '@mathesar/components/Null.svelte';
  import { getTablePageUrl } from '@mathesar/routes/urls';
  import {
    findTableByName,
    getAllTablesStore,
    getQualifiedTableName,
  } from '@mathesar/stores/allTables';
  import { databasesStore } from '@mathesar/stores/databases';
  import { rowSeekerContext } from '@mathesar/systems/row-seeker/AttachableRowSeekerController';
  import {
    Icon,
    Spinner,
    Tooltip,
    compareWholeValues,
    iconExpandDown,
    iconWarning,
  } from '@mathesar-component-library';

  import CellWrapper from '../CellWrapper.svelte';
  import type { CellExternalProps } from '../typeDefinitions';

  import { createTableRecordStore } from './tableRecordUtils';

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
  $: table = hasValue ? findTableByName(tables, String(value)) : undefined;
  $: valueComparisonOutcome = compareWholeValues(searchValue, value);
  // A column can name a table that's been dropped, or one of two schemas
  $: isUnknownTable = hasValue && !!$tablesApiStore?.hasSettled && !table;
  $: href =
    table && database
      ? getTablePageUrl(database.id, table.schema, table.oid)
      : undefined;

  async function launchRowSeeker(event?: MouseEvent) {
    if (disabled || !rowSeekerController) return;
    event?.stopPropagation();
    if ($tablesApiStore?.isRejected) await tablesApiStore?.run();
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
      {#if $tablesApiStore?.isLoading && hasValue}
        <Spinner />
      {:else if isUnknownTable}
        <span class="unknown">
          <Tooltip aria-label={$_('table_not_found_in_database')}>
            <Icon slot="trigger" {...iconWarning} />
            <span slot="content">{$_('table_not_found_in_database')}</span>
          </Tooltip>
          <span class="unknown-value">{value}</span>
        </span>
      {:else if table}
        <span
          class="table-link"
          class:exact-match={valueComparisonOutcome === 'exactMatch'}
          class:no-match={valueComparisonOutcome === 'noMatch'}
        >
          <a {href} tabindex="-1" on:click|stopPropagation>
            {getQualifiedTableName(table)}
          </a>
          <span class="background" />
        </span>
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
  .table-link {
    max-width: max-content;
    display: block;
    position: relative;
    isolation: isolate;
  }
  .table-link a {
    position: relative;
    z-index: 1;
    display: block;
    padding: 0.1rem 0.4rem;
    color: inherit;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .table-link .background {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: var(--color-record-fk-20);
    border: 1px solid var(--color-record-fk-25);
    border-radius: 0.25rem;
    z-index: 0;
  }
  .table-link:has(a:hover) .background {
    --border-width: 0.2rem;
    left: calc(-1 * var(--border-width));
    top: calc(-1 * var(--border-width));
    box-sizing: content-box;
    border: solid var(--border-width) var(--color-record-fk-40);
  }
  .exact-match .background {
    background: var(--color-bg-highlight);
  }
  .no-match {
    text-decoration: line-through;
  }
  .unknown {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--color-fg-base-disabled);
  }
  .unknown-value {
    text-decoration: line-through;
  }
</style>
