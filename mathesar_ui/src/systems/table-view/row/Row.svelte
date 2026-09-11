<script lang="ts">
  import { States } from '@mathesar/api/rest/utils/requestUtils';
  import { SheetRow, SheetRowHeaderCell } from '@mathesar/components/sheet';
  import { makeCellId } from '@mathesar/components/sheet/cellIds';
  import { getSheetContext } from '@mathesar/components/sheet/utils';
  import { ROW_HEIGHT_PX } from '@mathesar/geometry';
  import { iconModalRecordView } from '@mathesar/icons';
  import { getRecordPageUrlByTable } from '@mathesar/routes/urls';
  import {
    type DisplayRowDescriptor,
    ID_ROW_CONTROL_COLUMN,
    type Row,
    getCellKey,
    getRowSelectionId,
    getTabularDataStoreFromContext,
    isGroupHeaderRow,
    isHelpTextRow,
    isPersistedRecordRow,
    isPlaceholderRecordRow,
    isRecordRow,
  } from '@mathesar/stores/table-data';
  import { getFirstEditableColumn } from '@mathesar/stores/table-data/processedColumns';
  import RecordStore from '@mathesar/systems/record-view/RecordStore';
  import { modalRecordViewContext } from '@mathesar/systems/record-view-modal/modalRecordViewContext';
  import { Icon } from '@mathesar-component-library';

  import GroupHeader from './GroupHeader.svelte';
  import NewRecordMessage from './NewRecordMessage.svelte';
  import { getPlainCell } from './plainCell';
  import RowCell from './RowCell.svelte';
  import RowControl from './RowControl.svelte';

  const { columnStyleMap } = getSheetContext().stores;
  const modalRecordView = modalRecordViewContext.get();

  export let row: Row;
  export let rowDescriptor: DisplayRowDescriptor;
  export let style: { [key: string]: string | number };
  /** Columns to render cells for; all when undefined */
  export let renderedColumnIds: ReadonlySet<string> | undefined = undefined;

  const tabularData = getTabularDataStoreFromContext();

  $: ({
    table,
    recordsData,
    meta,
    processedColumns,
    selection,
    canUpdateRecords,
    displayedColumns,
  } = $tabularData);
  $: ({
    rowStatus,
    rowCreationStatus,
    cellModificationStatus,
    cellClientSideErrors,
  } = meta);
  $: ({
    grouping,
    linkedRecordSummaries,
    fileManifests,
    state: recordsDataState,
  } = recordsData);
  $: isPlaceholderRow = isPlaceholderRecordRow(row);
  $: rowSelectionId = getRowSelectionId(row);
  $: creationStatus = $rowCreationStatus.get(row.identifier)?.state;
  $: status = $rowStatus.get(row.identifier);
  $: wholeRowState = status?.wholeRowState;
  $: isSelected = $selection.rowIds.has(getRowSelectionId(row));
  $: hasWholeRowErrors = wholeRowState === 'failure';
  /** Including whole row errors and individual cell errors */
  $: hasAnyErrors = !!status?.errorsFromWholeRowAndCells?.length;
  /**
   * Idle cells of saved records render as plain elements (see `plainCell.ts`).
   * Anything with its own state (drafts, saving, errors, loading skeletons,
   * selected or active cells) uses the full `RowCell`.
   */
  $: columnsToRender = [...$displayedColumns].filter(
    ([, columnFabric]) =>
      !renderedColumnIds || renderedColumnIds.has(columnFabric.id),
  );
  $: record = isRecordRow(row) ? row.record : undefined;
  $: usesPlainCells =
    isPersistedRecordRow(row) &&
    !hasWholeRowErrors &&
    wholeRowState !== 'processing' &&
    $recordsDataState !== States.Loading;

  /** Same as `RecordHyperlink` */
  function handleRecordLinkClick(e: MouseEvent, recordId: unknown) {
    if (!modalRecordView) return;
    if (recordId === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    const recordStore = new RecordStore({ table, recordPk: String(recordId) });
    modalRecordView.open(recordStore);
  }

  async function handleRowHeaderMouseDown(e: MouseEvent) {
    if (!isPlaceholderRecordRow(row)) return;

    e.stopPropagation(); // Prevents cell selection from starting

    await $tabularData.addNewRecord();

    // Select the first editable cell in the newly added row.
    const columns = $processedColumns.values();
    const columnId = getFirstEditableColumn(columns)?.id.toString();
    if (!columnId) return;
    selection.update((s) => s.ofNewRecordDataEntryCell(columnId));
  }
</script>

<SheetRow {style} let:htmlAttributes let:styleString>
  <div
    class="row"
    class:selected={isSelected}
    class:processing={wholeRowState === 'processing'}
    class:failed={hasWholeRowErrors}
    class:created={creationStatus === 'success'}
    class:is-group-header={isGroupHeaderRow(row)}
    class:is-add-placeholder={isPlaceholderRecordRow(row)}
    {...htmlAttributes}
    style="--cell-height:{ROW_HEIGHT_PX - 1}px;{styleString}"
  >
    {#if isRecordRow(row)}
      <SheetRowHeaderCell
        {rowSelectionId}
        columnIdentifierKey={ID_ROW_CONTROL_COLUMN}
        isWithinPlaceholderRow={isPlaceholderRow}
        onMouseDown={handleRowHeaderMouseDown}
      >
        <RowControl
          {row}
          {rowDescriptor}
          {meta}
          {isSelected}
          hasErrors={hasAnyErrors}
        />
      </SheetRowHeaderCell>
    {/if}

    {#if isGroupHeaderRow(row) && $grouping}
      <GroupHeader
        {row}
        grouping={$grouping}
        group={row.group}
        processedColumnsMap={$processedColumns}
        recordSummariesForSheet={$linkedRecordSummaries}
        fileManifestsForSheet={$fileManifests}
      />
    {:else if isRecordRow(row)}
      {#each columnsToRender as [columnId, columnFabric] (columnId)}
        {@const key = getCellKey(row.identifier, columnId)}
        {@const cellId = makeCellId(rowSelectionId, columnFabric.id)}
        {@const plain =
          usesPlainCells &&
          !$selection.cellIds.has(cellId) &&
          !$cellModificationStatus.get(key) &&
          !$cellClientSideErrors.get(key)?.length
            ? getPlainCell(
                columnFabric,
                record?.[columnId],
                $canUpdateRecords,
                table.oid,
              )
            : undefined}
        {#if plain}
          <div
            class="plain-cell"
            class:align-right={plain.alignRight}
            class:tabular={plain.tabular}
            class:record-key={plain.recordLink}
            class:disabled={plain.disabled}
            data-sheet-element="data-cell"
            data-sheet-row-type="data"
            data-cell-selection-id={cellId}
            style={$columnStyleMap.get(columnFabric.id)?.styleString}
          >
            {#if plain.recordLink}
              <span class="value">
                {#if plain.display === undefined}
                  <span class="postgres-keyword">DEFAULT</span>
                {:else}
                  {plain.display}
                {/if}
              </span>
              <a
                class="record-link"
                href={getRecordPageUrlByTable(table, record?.[columnId])}
                on:click={(e) => handleRecordLinkClick(e, record?.[columnId])}
                on:contextmenu|stopPropagation
              >
                <Icon {...iconModalRecordView} />
              </a>
            {:else if plain.display === null}
              <span class="postgres-keyword">NULL</span>
            {:else if plain.display === undefined}
              <span class="postgres-keyword">DEFAULT</span>
            {:else}
              {plain.display}
            {/if}
          </div>
        {:else}
          <RowCell
            {selection}
            {row}
            rowHasErrors={hasWholeRowErrors}
            {key}
            modificationStatusMap={cellModificationStatus}
            clientSideErrorMap={cellClientSideErrors}
            value={row.record[columnId]}
            {columnFabric}
            {recordsData}
            canUpdateRecords={$canUpdateRecords}
          />
        {/if}
      {/each}
    {:else if isHelpTextRow(row)}
      <NewRecordMessage columnCount={$processedColumns.size} />
    {/if}
  </div>
</SheetRow>

<style lang="scss">
  .row {
    user-select: none;
    -webkit-user-select: none;

    &.processing {
      pointer-events: none;
    }

    &:not(:hover) :global(.cell-bg-row-hover) {
      display: none;
    }

    &:hover .plain-cell::after {
      display: block;
    }

    &.is-add-placeholder {
      // Hide the display of cell values like `NULL` and `DEFAULT` in the
      // placeholder row. (There is probably a cleaner way to do this via props
      // instead of global CSS, but oh well).
      :global(
          [data-sheet-element='data-cell']
            .cell-fabric
            .cell-wrapper:not(.is-edit-mode)
            > *
        ) {
        visibility: hidden;
      }
    }
  }

  // Mirrors the idle appearance of SheetDataCell > CellFabric > CellWrapper.
  .plain-cell {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    padding: var(--sm4);
    border-bottom: var(--cell-border-horizontal);
    border-right: var(--cell-border-vertical);
    background: var(--cell-bg-color-base);
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    user-select: none;
    -webkit-user-select: none;
    // A stacking context, so the background layers below (z-index: -1) paint
    // above the cell's background but under its text.
    z-index: 0;

    &.align-right {
      text-align: right;
    }
    &.tabular {
      font-variant-numeric: tabular-nums;
    }

    // Background layers, blended like `CellBackground`: column (disabled) and
    // row hover.
    &::before,
    &::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      display: none;
      pointer-events: none;
      mix-blend-mode: var(--cell-bg-mix-blend-mode);
    }
    &.disabled::before {
      display: block;
      background-color: var(--cell-bg-color-disabled);
    }
    &::after {
      background-color: var(
        --cell-bg-color-row-hover,
        var(--cell-bg-color-base)
      );
    }

    // Mirrors `PrimaryKeyCell` (in a `CellWrapper` without padding)
    &.record-key {
      display: grid;
      grid-template: auto / 1fr auto;
      padding: 0;

      .value {
        display: flex;
        align-items: center;
        padding-left: var(--sm4);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .record-link {
        display: inline-grid;
        align-items: center;
        justify-content: center;
        padding: 0 var(--sm4);
        color: var(--color-fg-link);
      }
      .record-link:hover {
        color: var(--color-fg-link-hover);
      }
    }

    // Same as `.cell-wrapper .postgres-keyword` in App.svelte
    .postgres-keyword {
      color: var(--color-fg-faint);
      font-weight: 300;
      background: transparent;
    }
  }
</style>
