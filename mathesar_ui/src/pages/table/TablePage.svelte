<script lang="ts">
  import { tick } from 'svelte';
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
  import WithModalRecordView from '@mathesar/systems/record-view-modal/WithModalRecordView.svelte';
  import ActionsPane from '@mathesar/systems/table-view/actions-pane/ActionsPane.svelte';
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
  /**
   * Whether to show the panes above and below the table, which are taken away when the screen
   * has no room to spare for them and put back together by the button in the corner of the
   * sheet. Together, because everything either of them offers has to stay reachable.
   */
  let showPanes = false;

  $: ({ query } = $router);
  $: meta = Meta.fromSerialization(query[metaSerializationQueryKey] ?? '');
  $: ({ currentRolePrivileges } = table.currentAccess);
  /**
   * A list of records is shown by what each record is called, so the summaries have to be asked
   * for. Only where one will be shown: on a screen with room for the spreadsheet they would be a
   * query per page for something nothing displays.
   */
  $: needsRecordSummaries = $tableLayout !== 'sheet';
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

  function handleMetaSerializationChange(s: string) {
    router.location.query.set(metaSerializationQueryKey, s);
  }
  $: metaSerialization = tabularData.meta.serialization;
  $: handleMetaSerializationChange($metaSerialization);
</script>

<svelte:head><title>{makeSimplePageTitle(table.name)}</title></svelte:head>

<LayoutWithHeader fitViewport restrictWidth={false}>
  <div
    class="table-page"
    class:compact={$tableLayout !== 'sheet' && !showPanes}
  >
    {#if $tableLayout === 'sheet' || showPanes}
      <ActionsPane />
    {/if}
    {#if $currentRolePrivileges.has('SELECT')}
      <WithModalRecordView>
        <div class="table-view-area">
          <TableView
            {table}
            bind:sheetElement
            layout={$tableLayout}
            bind:showPanes
          />
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
  /* With the pane gone there is one row, and the table takes all of it. */
  .table-page.compact {
    grid-template: 1fr / 1fr;
  }
  .table-page.compact :global(.table-view-area) {
    padding: 0;
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
