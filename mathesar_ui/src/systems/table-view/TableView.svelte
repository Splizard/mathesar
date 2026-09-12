<script lang="ts">
  import { map } from 'iter-tools';
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';

  import type { ColumnMetadata } from '@mathesar/api/rpc/_common/columnDisplayOptions';
  import {
    Button,
    Icon,
    ImmutableMap,
    Spinner,
    iconClose,
  } from '@mathesar/component-library';
  import { Sheet } from '@mathesar/components/sheet';
  import { SheetClipboardHandler } from '@mathesar/components/sheet/clipboard';
  import { contextMenuContext } from '@mathesar/contexts/contextMenuContext';
  import { ROW_HEADER_WIDTH_PX } from '@mathesar/geometry';
  import { iconPaste } from '@mathesar/icons';
  import type { Table } from '@mathesar/models/Table';
  import { imperativeFilterControllerContext } from '@mathesar/pages/table/ImperativeFilterController';
  import { confirm } from '@mathesar/stores/confirmation';
  import { tableInspectorVisible } from '@mathesar/stores/localStorage';
  import { modal } from '@mathesar/stores/modal';
  import {
    ID_ADD_NEW_COLUMN,
    ID_ROW_CONTROL_COLUMN,
    getTabularDataStoreFromContext,
    isJoinedColumn,
  } from '@mathesar/stores/table-data';
  import { tableInspectorTab } from '@mathesar/stores/tableInspector';
  import { currentTablesMap } from '@mathesar/stores/tables';
  import { toast } from '@mathesar/stores/toast';
  import type { TableLayout } from '@mathesar/stores/viewport';
  import CanvasView from '@mathesar/systems/canvas-view/CanvasView.svelte';
  import { shapesOnCanvas } from '@mathesar/systems/canvas-view/canvasViewMode';
  import {
    type DrawnShape,
    isShapeDbType,
    parseShape,
  } from '@mathesar/systems/canvas-view/shapes';
  import RecordStore from '@mathesar/systems/record-view/RecordStore';
  import { modalRecordViewContext } from '@mathesar/systems/record-view-modal/modalRecordViewContext';

  import Body from './Body.svelte';
  import { openTableCellContextMenu } from './context-menu/contextMenu';
  import { tableIsFullScreen } from './fullScreen';
  import Header from './header/Header.svelte';
  import { importModalContext } from './import/ImportController';
  import ImportModal from './import/ImportModal.svelte';
  import RecordSummaryList from './RecordSummaryList.svelte';
  import StatusPane from './StatusPane.svelte';
  import TableInspector from './table-inspector/TableInspector.svelte';
  import WithTableInspector from './table-inspector/WithTableInspector.svelte';
  import { getCustomizedColumnWidths } from './tableViewUtils';

  type Context = 'page' | 'widget';

  const tabularData = getTabularDataStoreFromContext();
  const importModal = modal.spawnModalController();
  importModalContext.set(importModal);
  const contextMenu = contextMenuContext.get();
  const modalRecordView = modalRecordViewContext.get();
  const imperativeFilterController = imperativeFilterControllerContext.get();

  export let context: Context = 'page';
  export let table: Table;
  export let sheetElement: HTMLElement | undefined = undefined;
  /** How much room there is, and so which of the three layouts the table has */
  export let layout: TableLayout = 'sheet';

  $: ({ currentRoleOwns } = table.currentAccess);
  $: usesVirtualList = context !== 'widget';
  $: sheetHasBorder = context === 'widget';
  $: ({
    processedColumns,
    display,
    isLoading,
    selection,
    recordsData,
    allColumns,
    displayedColumns,
    columnsDataStore,
    hasPrimaryKey,
  } = $tabularData);
  $: $tabularData, ($tableInspectorTab = 'table');
  $: clipboardHandler = new SheetClipboardHandler({
    copyingContext: {
      getRows: () =>
        new Map(
          map(([k, r]) => [k, r.record], get(recordsData.selectableRowsMap)),
        ),
      getColumns: () => get(processedColumns),
      getRecordSummaries: () => get(recordsData.linkedRecordSummaries),
    },
    pastingContext: {
      getRecordRows: () => [
        ...get(recordsData.fetchedRecordRows),
        ...get(recordsData.newRecords),
      ],
      getSheetColumns: () => [
        ...map(({ column }) => column, get(processedColumns).values()),
      ],
      bulkDml: (args) => recordsData.bulkDml(args),
      confirm: (title) =>
        confirm({
          title,
          body: [],
          proceedButton: { label: $_('paste'), icon: iconPaste },
        }),
    },
    selection,
    showToastInfo: toast.info,
    showToastError: toast.error,
  });
  $: ({ horizontalScrollOffset, scrollOffset } = display);
  $: columnOrder = (table.metadata?.column_order ?? []).map(String);
  $: hasNewColumnButton = $currentRoleOwns;
  /**
   * These are separate variables for readability and also to keep the door open
   * to more easily displaying the Table Inspector even if DDL operations are
   * not supported.
   */
  // On a screen with no room for the panes there is no room for the inspector either: it would
  // take half of what is left, and what is left is the table.
  /**
   * Which layout the table actually gets.
   *
   * A list of records needs a way to tell one record from another, and a table with no primary
   * key has none: no summary, no key, nothing to open. Most views are like that, and every view
   * in information_schema is. So a table without one gets the spreadsheet however narrow the
   * screen is -- it needs scrolling sideways, but it shows what the records say rather than a
   * column of things that cannot be told apart.
   */
  $: effectiveLayout =
    layout === 'recordList' && !$hasPrimaryKey ? 'compactSheet' : layout;
  $: supportsTableInspector = context === 'page';
  /**
   * Whether the inspector covers the table rather than sitting beside it.
   *
   * Beside it, it takes a third of the width and leaves the rest to the table. On a screen with
   * no room to divide, a third of it is too little for either, so the inspector takes the screen
   * while it is open and gives it back when it is closed.
   */
  $: inspectorIsOverlay = effectiveLayout !== 'sheet';
  /**
   * Whether the corner of the sheet offers to show the table on its own.
   *
   * Offered on a screen too small for the panes, and kept while the table is already being shown
   * that way however big the screen has become -- going full screen makes the window bigger, and
   * a window that grows past the threshold while the button that shrank it is only offered below
   * the threshold would take the way back out with it.
   */
  $: hasFullScreenToggle =
    context === 'page' &&
    (effectiveLayout === 'compactSheet' || $tableIsFullScreen);
  $: sheetColumns = (() => {
    const columns: Array<{ column: { id: string; name: string } }> = [
      { column: { id: ID_ROW_CONTROL_COLUMN, name: 'ROW_CONTROL' } },
      ...[...$displayedColumns].map(([columnId, columnFabric]) => {
        const name = isJoinedColumn(columnFabric)
          ? columnFabric.displayName
          : columnFabric.column.name;
        return {
          column: {
            id: columnId,
            name,
          },
        };
      }),
    ];
    if (hasNewColumnButton) {
      columns.push({ column: { id: ID_ADD_NEW_COLUMN, name: 'ADD_NEW' } });
    }
    return columns;
  })();

  $: columnWidths = new ImmutableMap([
    [ID_ROW_CONTROL_COLUMN, ROW_HEADER_WIDTH_PX],
    [ID_ADD_NEW_COLUMN, 32],
    ...getCustomizedColumnWidths($processedColumns.values()),
    ...[...$allColumns]
      .filter(([, col]) => isJoinedColumn(col))
      .map(([id]): [string, number] => [id, 300]),
  ]);
  $: showTableInspector = $tableInspectorVisible && supportsTableInspector;

  /** The columns holding shapes, which are the ones the canvas draws */
  $: shapeColumns = [...$processedColumns.values()].filter((c) =>
    isShapeDbType(c.column.type),
  );
  $: isDrawing =
    context === 'page' && $shapesOnCanvas && shapeColumns.length > 0;
  /**
   * Every shape in the records on this page, with the record it belongs to. Only this page's
   * records: the canvas draws what the table is showing rather than fetching a view of its own,
   * so paging through the table pages through the drawing.
   */
  $: ({ selectableRowsMap } = recordsData);
  $: drawnShapes = (() => {
    if (!isDrawing) return [] as DrawnShape[];
    const found: DrawnShape[] = [];
    $selectableRowsMap.forEach((row, recordKey) => {
      shapeColumns.forEach((column) => {
        const shape = parseShape(
          column.column.type,
          row.record[String(column.column.id)],
        );
        if (shape) {
          found.push({ shape, recordKey, columnName: column.column.name });
        }
      });
    });
    return found;
  })();

  function openRecord(recordKey: string) {
    if (!modalRecordView) return;
    const recordId = $tabularData.getRecordIdFromRowId(recordKey);
    if (recordId === undefined) return;
    const containingTable = $currentTablesMap.get(table.oid);
    if (!containingTable) return;
    modalRecordView.open(
      new RecordStore({ table: containingTable, recordPk: recordId }),
    );
  }

  function persistColumnWidths(widthsMap: [string, number | null][]): void {
    function* getChanges(): Generator<[number, ColumnMetadata | null]> {
      for (const [columnId, width] of widthsMap) {
        const column = $allColumns.get(columnId);
        if (!column) continue;
        // Joined columns do not persist width to the database
        if (isJoinedColumn(column)) continue;
        yield [parseInt(column.id, 10), { display_width: width }];
      }
    }
    void columnsDataStore.setDisplayOptions(new Map(getChanges()));
  }
</script>

<div class="table-view">
  <WithTableInspector
    {context}
    {table}
    showTableInspector={showTableInspector && !inspectorIsOverlay}
    bind:activeTabId={$tableInspectorTab}
  >
    <div class="sheet-area">
      {#if effectiveLayout === 'recordList'}
        <!-- Too narrow for a spreadsheet to be read, so the records are listed to pick one
        from, and picking one opens it. -->
        <RecordSummaryList {table} />
      {:else if isDrawing}
        <CanvasView shapes={drawnShapes} onRecordClick={openRecord} />
      {:else if $processedColumns.size}
        <Sheet
          {clipboardHandler}
          {columnWidths}
          {selection}
          {usesVirtualList}
          {persistColumnWidths}
          onCellSelectionStart={(cell) => {
            if (cell.type === 'column-header-cell') {
              $tableInspectorTab = 'column';
            }
            if (cell.type === 'row-header-cell') {
              $tableInspectorTab = 'record';
            }
          }}
          onCellContextMenu={({
            targetCell,
            position,
            beginSelectingCellRange,
          }) => {
            if (!contextMenu) return 'empty';
            return openTableCellContextMenu({
              targetCell,
              position,
              contextMenu,
              modalRecordView,
              tabularData: $tabularData,
              imperativeFilterController,
              clipboardHandler,
              beginSelectingCellRange,
            });
          }}
          bind:horizontalScrollOffset={$horizontalScrollOffset}
          bind:scrollOffset={$scrollOffset}
          columns={sheetColumns}
          getColumnIdentifier={(entry) => entry.column.id}
          hasBorder={sheetHasBorder}
          hasPaddingRight
          restrictWidthToRowWidth={!usesVirtualList}
          bind:sheetElement
        >
          <Header
            {hasNewColumnButton}
            {columnOrder}
            {table}
            {hasFullScreenToggle}
          />
          <Body {usesVirtualList} />
        </Sheet>
      {:else if $isLoading}
        <div class="loading-sheet">
          <Spinner />
        </div>
      {/if}
    </div>
  </WithTableInspector>
  {#if effectiveLayout === 'sheet' && !$tableIsFullScreen}
    <StatusPane {context} />
  {/if}
  {#if showTableInspector && inspectorIsOverlay}
    <div class="inspector-over-table">
      <div class="bar">
        <span class="what">{table.name}</span>
        <Button
          appearance="secondary"
          aria-label={$_('close')}
          on:click={() => tableInspectorVisible.set(false)}
        >
          <Icon {...iconClose} />
        </Button>
      </div>
      <TableInspector {table} bind:activeTabId={$tableInspectorTab} />
    </div>
  {/if}
</div>

<ImportModal
  controller={importModal}
  {table}
  tableColumns={$processedColumns}
  onFinish={() => {
    void recordsData.fetch();
  }}
/>

<style>
  .table-view {
    --status-bar-padding: 0;
    position: relative;
    height: 100%;
    display: grid;
    /* minmax(0, ...) rather than 1fr: a column of records holds lines that are not allowed to
    wrap, so a long one asks for a track as wide as the sentence and the whole page follows it
    off the side of the screen. The table is as wide as the room there is, and what will not fit
    is cut short inside it. */
    grid-template: 1fr auto / minmax(0, 1fr);
    gap: var(--sm3);
    overflow: hidden;
  }
  .sheet-area {
    position: relative;
    height: 100%;
    min-width: 0;
    overflow-x: auto;
  }
  .loading-sheet {
    text-align: center;
    font-size: 2rem;
    padding: 2rem;
  }
  /* Over the table rather than beside it, there being no room beside it. */
  .inspector-over-table {
    position: absolute;
    inset: 0;
    z-index: 3;
    background: var(--color-bg-base);
    display: grid;
    grid-template: auto 1fr / 1fr;
    overflow: hidden;
  }
  /* A line of its own for the way out, rather than a button laid over the tabs. */
  .inspector-over-table .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sm3);
    padding: var(--sm4) var(--sm3);
  }
  .inspector-over-table .what {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: var(--font-weight-bold);
  }
</style>
