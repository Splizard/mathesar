<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { router } from 'tinro';

  import WarningBox from '@mathesar/components/message-boxes/WarningBox.svelte';
  import { focusActiveCell } from '@mathesar/components/sheet/utils';
  import LayoutWithHeader from '@mathesar/layouts/LayoutWithHeader.svelte';
  import type { Table } from '@mathesar/models/Table';
  import { makeSimplePageTitle } from '@mathesar/pages/pageTitleUtils';
  import {
    Meta,
    TabularData,
    setTabularDataStoreInContext,
  } from '@mathesar/stores/table-data';
  import { tableLayout } from '@mathesar/stores/viewport';
  import { watchChanges } from '@mathesar/systems/realtime/changes';
  import WithModalRecordView from '@mathesar/systems/record-view-modal/WithModalRecordView.svelte';
  import ActionsPane from '@mathesar/systems/table-view/actions-pane/ActionsPane.svelte';
  import CompactToolbar from '@mathesar/systems/table-view/CompactToolbar.svelte';
  import {
    showTheRestAgain,
    tableIsFullScreen,
  } from '@mathesar/systems/table-view/fullScreen';
  import { compactPageHeaderVisible } from '@mathesar/systems/table-view/pageHeader';
  import TableView from '@mathesar/systems/table-view/TableView.svelte';

  import {
    ImperativeFilterController,
    imperativeFilterControllerContext,
  } from './ImperativeFilterController';

  const metaSerializationQueryKey = 'q';

  const tabularDataStore = setTabularDataStoreInContext(
    // Sacrifice type safety here since the value is initialized reactively
    // below.
    undefined as unknown as TabularData,
  );

  const imperativeFilterController = new ImperativeFilterController();
  imperativeFilterControllerContext.set(imperativeFilterController);

  export let table: Table;

  let sheetElement: HTMLElement;

  $: ({ query } = $router);
  $: meta = Meta.fromSerialization(query[metaSerializationQueryKey] ?? '');
  $: ({ currentRolePrivileges } = table.currentAccess);
  // Opening a table is opening it with the room given to the table, whatever was asked for the
  // last time somebody wanted to see where they were.
  $: table.oid, compactPageHeaderVisible.set(false);
  /**
   * A list of records is shown by what each record is called, so the summaries have to be asked
   * for. Only where one will be shown: on a screen with room for the spreadsheet they would be a
   * query per page for something nothing displays.
   */
  $: needsRecordSummaries = $tableLayout === 'recordList';
  $: tabularData = new TabularData({
    database: table.schema.database,
    table,
    meta,
    loadIntrinsicRecordSummaries: needsRecordSummaries,
  });
  $: ({ isLoading, selection } = tabularData);
  $: tabularDataStore.set(tabularData);

  async function activateFirstDataCell() {
    selection.updateWithoutFocus((s) => s.ofFirstDataCell());
    // Don't steal focus if the user has already focused on another UI element
    // while the table data is loading.
    if (document.activeElement === document.body) {
      await tick();
      focusActiveCell(sheetElement);
    }
  }
  let hasInitialized = false;
  $: if (!hasInitialized && !$isLoading) {
    hasInitialized = true;
    void activateFirstDataCell();
  }

  /**
   * Ask again when somebody else changes this table.
   *
   * The change says which records, not what they now hold, so the answer is to ask -- which is
   * also the only way to ask with this user's privileges rather than the privileges of whoever
   * made the change. Held off for a moment so that a handful of changes arriving together, which
   * is what a paste or a bulk delete looks like from here, is one request rather than a dozen.
   *
   * Our own edits come back to us too, and are asked about again like anybody's. Telling them
   * apart would mean the message saying who made the change, which is not something it says.
   */
  let askAgainSoon: ReturnType<typeof setTimeout> | undefined;
  let stopWatching: (() => void) | undefined;

  function onChanged() {
    if (askAgainSoon) clearTimeout(askAgainSoon);
    askAgainSoon = setTimeout(() => {
      void tabularData.recordsData.fetch();
    }, 300);
  }

  $: {
    stopWatching?.();
    stopWatching = watchChanges({
      databaseId: table.schema.database.id,
      tables: [table.oid],
      onChange: onChanged,
    });
  }

  onDestroy(() => {
    stopWatching?.();
    if (askAgainSoon) clearTimeout(askAgainSoon);
    // Leaving the table is leaving what was being shown on its own.
    void showTheRestAgain();
  });

  function handleMetaSerializationChange(s: string) {
    router.location.query.set(metaSerializationQueryKey, s);
  }
  $: metaSerialization = tabularData.meta.serialization;
  $: handleMetaSerializationChange($metaSerialization);
</script>

<svelte:head><title>{makeSimplePageTitle(table.name)}</title></svelte:head>

<LayoutWithHeader
  fitViewport
  restrictWidth={false}
  hideHeader={$tableIsFullScreen ||
    ($tableLayout === 'compactSheet' && !$compactPageHeaderVisible)}
>
  <div
    class="table-page"
    class:compact={$tableLayout !== 'sheet' || $tableIsFullScreen}
    class:only-table={$tableIsFullScreen}
  >
    {#if $tableIsFullScreen}
      <!-- Only the table, which is what was asked for. -->
    {:else if $tableLayout === 'sheet'}
      <ActionsPane />
    {:else}
      <!-- Everything the two panes offer, in the one row a small screen can spare. -->
      <CompactToolbar />
    {/if}
    {#if $currentRolePrivileges.has('SELECT')}
      <WithModalRecordView>
        <div class="table-view-area">
          <TableView {table} bind:sheetElement layout={$tableLayout} />
        </div>
      </WithModalRecordView>
    {:else}
      <div class="warning">
        <WarningBox fullWidth>
          {$_('no_privileges_view_table')}
        </WarningBox>
      </div>
    {/if}
  </div>
</LayoutWithHeader>

<style>
  .table-page {
    display: grid;
    grid-template: auto 1fr / 1fr;
    height: 100%;
  }
  /* With the panes gone the table takes every pixel it can, right to the edges. */
  .table-page.compact :global(.table-view-area) {
    padding: 0;
  }
  /* Nothing above the table means one row, and the table is all of it. Without this the row is
  the `auto` one, which sizes itself to a table that is sizing itself to the row. */
  .table-page.only-table {
    grid-template: 1fr / 1fr;
  }
  .warning {
    padding: 1rem;
  }
  .table-view-area {
    padding: 0 var(--sm3) var(--sm3) var(--sm3);
    height: 100%;
    display: grid;
  }
</style>
