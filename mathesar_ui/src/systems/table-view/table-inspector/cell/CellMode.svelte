<script lang="ts">
  import { _ } from 'svelte-i18n';

  import type { RequestStatus } from '@mathesar/api/rest/utils/requestUtils';
  import ArrayElements from '@mathesar/components/cell-fabric/data-types/components/array/ArrayElements.svelte';
  import {
    getDbTypeBasedInputCap,
    getInitialInputValue,
  } from '@mathesar/components/cell-fabric/utils';
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
  $: ({ selectableRowsMap } = recordsData);

  /** The array cell the inspector edits, whose values are shown one by one */
  $: activeArrayCell = (() => {
    const { activeCellId } = $selection;
    if (!activeCellId) return undefined;
    const { rowId, columnId } = parseCellId(activeCellId);
    const row = $selectableRowsMap.get(rowId);
    const column = $processedColumns.get(columnId);
    if (!row || !column || column.column.type !== DB_TYPES.ARRAY) {
      return undefined;
    }
    return { row, column, columnId, value: row.record[columnId] };
  })();

  /** The column of one of the array's values, for the input to show it */
  $: itemColumn = {
    type: activeArrayCell?.column.column.type_options?.item_type ?? 'string',
    type_options: null,
    metadata: activeArrayCell?.column.column.metadata ?? null,
  };

  let values: unknown[] | null = null;
  let savedValues: unknown[] | null = null;
  let saveState: RequestStatus;

  function reset(cell: typeof activeArrayCell) {
    savedValues = Array.isArray(cell?.value)
      ? (cell?.value as unknown[])
      : null;
    values = savedValues;
  }
  $: reset(activeArrayCell);

  $: hasChanges = JSON.stringify(values) !== JSON.stringify(savedValues);
  $: isEditable = !!activeArrayCell?.column.isEditable && $canUpdateRecords;

  async function save() {
    if (!activeArrayCell) return;
    const { row, columnId } = activeArrayCell;
    const cells = [{ columnId, value: values }];
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

{#if activeArrayCell}
  <div class="array-cell">
    <header class="header">{$_('values')}</header>
    <ArrayElements
      componentAndProps={getDbTypeBasedInputCap(itemColumn)}
      initialValue={getInitialInputValue(itemColumn)}
      bind:value={values}
      disabled={!isEditable || saveState?.state === 'processing'}
    />
    {#if hasChanges}
      <div class="footer">
        <CancelOrProceedButtonPair
          onProceed={save}
          onCancel={() => reset(activeArrayCell)}
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
  .array-cell {
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
