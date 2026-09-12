<script lang="ts">
  import { _ } from 'svelte-i18n';

  import type { RequestStatus } from '@mathesar/api/rest/utils/requestUtils';
  import ArrayElements from '@mathesar/components/cell-fabric/data-types/components/array/ArrayElements.svelte';
  import CompositeFields from '@mathesar/components/cell-fabric/data-types/components/composite/CompositeFields.svelte';
  import { getCellInfo } from '@mathesar/components/cell-fabric/data-types/utils';
  import { getCellCap } from '@mathesar/components/cell-fabric/utils';
  import { parseFileReference } from '@mathesar/components/file-attachments/fileUtils';
  import CellInspector from '@mathesar/components/inspector/cell/CellInspector.svelte';
  import { parseCellId } from '@mathesar/components/sheet/cellIds';
  import { DB_TYPES } from '@mathesar/stores/abstract-types/dbTypes';
  import {
    getTabularDataStoreFromContext,
    isPlaceholderRecordRow,
  } from '@mathesar/stores/table-data';
  import { toast } from '@mathesar/stores/toast';
  import { CancelOrProceedButtonPair } from '@mathesar-component-library';

  const tabularData = getTabularDataStoreFromContext();

  $: ({
    selectedCellData,
    selection,
    recordsData,
    processedColumns,
    canUpdateRecords,
  } = $tabularData);
  $: ({ selectableRowsMap, fileManifests } = recordsData);

  /**
   * The cell the inspector edits value by value: an array's values, or a
   * composite's fields
   */
  $: activePartedCell = (() => {
    const { activeCellId } = $selection;
    if (!activeCellId) return undefined;
    const { rowId, columnId } = parseCellId(activeCellId);
    const row = $selectableRowsMap.get(rowId);
    const column = $processedColumns.get(columnId);
    const type = column?.column.type;
    if (!row || !column) return undefined;
    if (type !== DB_TYPES.ARRAY && type !== DB_TYPES.COMPOSITE) {
      return undefined;
    }
    return {
      row,
      column,
      columnId,
      value: row.record[columnId],
      isArray: type === DB_TYPES.ARRAY,
    };
  })();

  $: metadata = activePartedCell?.column.column.metadata ?? null;

  /** The column of a value of the array, or of a field, for its cell to show */
  function getPartColumnFabric(id: string, type: string) {
    const column = { type, type_options: null, metadata };
    return {
      id,
      column,
      cellComponentAndProps: getCellCap({
        cellInfo: getCellInfo(type, metadata) ?? { type: 'string' },
        column,
      }),
    };
  }

  $: itemColumnFabric = getPartColumnFabric(
    `${activePartedCell?.columnId ?? ''}-item`,
    activePartedCell?.column.column.type_options?.item_type ?? 'string',
  );
  $: fields = (
    activePartedCell?.column.column.type_options?.composite_fields ?? []
  ).map((field) => ({
    name: field.name,
    columnFabric: getPartColumnFabric(field.name, field.type),
  }));

  /** Arrays of files show each file, as a file column's cells do */
  function getFileManifest(columnId: string, value: unknown) {
    const fileReference = parseFileReference(value);
    if (!fileReference) return undefined;
    return $fileManifests.get(columnId)?.get(fileReference.hmac);
  }

  /** The value being edited, of the array's values or the composite's fields */
  let value: unknown = null;
  let savedValue: unknown = null;
  let saveState: RequestStatus;

  function reset(cell: typeof activePartedCell) {
    savedValue = cell?.value ?? null;
    value = savedValue;
  }
  $: reset(activePartedCell);

  $: hasChanges = JSON.stringify(value) !== JSON.stringify(savedValue);
  $: isEditable = !!activePartedCell?.column.isEditable && $canUpdateRecords;

  async function save() {
    if (!activePartedCell) return;
    const { row, columnId } = activePartedCell;
    const cells = [{ columnId, value }];
    saveState = { state: 'processing' };
    try {
      await recordsData.bulkDml(
        isPlaceholderRecordRow(row)
          ? { modificationRecipes: [], additionRecipes: [{ cells }] }
          : { modificationRecipes: [{ row, cells }], additionRecipes: [] },
      );
      saveState = { state: 'success' };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : $_('unable_to_save_cell');
      toast.error(message);
      saveState = { state: 'failure', errors: [message] };
    }
  }
</script>

{#if activePartedCell}
  {@const cell = activePartedCell}
  {@const isProcessing = saveState?.state === 'processing'}
  <div class="parted-cell">
    <header class="header">
      {cell.isArray ? $_('values') : $_('fields')}
    </header>
    {#if cell.isArray}
      <ArrayElements
        {itemColumnFabric}
        bind:value
        disabled={!isEditable || isProcessing}
        getFileManifest={(fileValue) =>
          getFileManifest(cell.columnId, fileValue)}
        setFileManifest={(hmac, manifest) =>
          fileManifests.addBespokeValue({
            columnId: cell.columnId,
            key: hmac,
            value: manifest,
          })}
      />
    {:else}
      <CompositeFields
        {fields}
        bind:value
        disabled={!isEditable || isProcessing}
        getFileManifest={(fileValue) =>
          getFileManifest(cell.columnId, fileValue)}
        setFileManifest={(hmac, manifest) =>
          fileManifests.addBespokeValue({
            columnId: cell.columnId,
            key: hmac,
            value: manifest,
          })}
      />
    {/if}
    {#if hasChanges}
      <div class="footer">
        <CancelOrProceedButtonPair
          onProceed={save}
          onCancel={() => reset(activePartedCell)}
          isProcessing={saveState?.state === 'processing'}
          proceedButton={{ label: $_('save') }}
          size="small"
        />
      </div>
    {/if}
  </div>
{:else}
  <CellInspector selectedCellData={$selectedCellData} />
{/if}

<style lang="scss">
  .parted-cell {
    padding: var(--sm1);
  }
  .header {
    font-weight: 500;
    margin-bottom: var(--sm2);
  }
  .footer {
    margin-top: 1rem;
  }
</style>
