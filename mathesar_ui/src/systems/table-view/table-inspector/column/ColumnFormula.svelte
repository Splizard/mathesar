<script lang="ts">
  import { _ } from 'svelte-i18n';

  import { iconEdit } from '@mathesar/icons';
  import {
    type ProcessedColumn,
    getTabularDataStoreFromContext,
  } from '@mathesar/stores/table-data';
  import { toast } from '@mathesar/stores/toast';
  import {
    type Formula,
    unparseFormula,
  } from '@mathesar/systems/formulas/formula';
  import FormulaInput from '@mathesar/systems/formulas/FormulaInput.svelte';
  import {
    Button,
    CancelOrProceedButtonPair,
    Icon,
  } from '@mathesar-component-library';

  export let column: ProcessedColumn;

  const tabularData = getTabularDataStoreFromContext();

  $: ({ columnsDataStore } = $tabularData);
  $: ({ columns } = columnsDataStore);
  /**
   * A formula can read the columns holding values of their own, and none of the ones being worked
   * out -- itself included. Postgres will not work one value out from another it is working out
   * in the same record.
   */
  $: readableColumns = $columns
    .filter((c) => c.formula_sql === undefined || c.formula_sql === null)
    .map((c) => ({ id: c.id, name: c.name }));
  /** Every column, for writing a formula out, which may name one no longer readable */
  $: allColumns = $columns.map((c) => ({ id: c.id, name: c.name }));
  $: asked = column.column.formula ?? undefined;
  $: expression = column.column.formula_sql ?? undefined;

  let isEditing = false;
  let formula: Formula | undefined = undefined;
  let isSaving = false;
  let input: FormulaInput | undefined = undefined;

  async function startEditing() {
    isEditing = true;
    // Once the input is there to be filled in.
    await Promise.resolve();
    input?.setFrom(asked);
  }

  function stopEditing() {
    isEditing = false;
    formula = undefined;
  }

  async function save() {
    if (!formula) return;
    isSaving = true;
    try {
      await columnsDataStore.patchFormula(column.column.id, formula);
      stopEditing();
    } catch (e) {
      toast.fromError(e);
    } finally {
      isSaving = false;
    }
  }
</script>

<div class="column-formula">
  {#if isEditing}
    <FormulaInput
      bind:this={input}
      columns={readableColumns}
      bind:formula
      disabled={isSaving}
    />
    <p class="note">{$_('formula_change_rewrites_every_record')}</p>
    <CancelOrProceedButtonPair
      onCancel={stopEditing}
      onProceed={save}
      canProceed={formula !== undefined}
      isProcessing={isSaving}
      proceedButton={{ label: $_('save') }}
      cancelButton={{ label: $_('cancel') }}
    />
  {:else if asked}
    <p class="formula">{unparseFormula(asked, allColumns)}</p>
    <Button appearance="secondary" size="small" on:click={startEditing}>
      <Icon {...iconEdit} />
      <span>{$_('change_formula')}</span>
    </Button>
  {:else}
    <!-- A generated column Mathesar did not make, so there is no formula to show back, only the
    expression Postgres holds. -->
    <p class="formula">{expression ?? ''}</p>
    <p class="note">{$_('formula_made_elsewhere')}</p>
  {/if}
</div>

<style lang="scss">
  .column-formula {
    display: flex;
    flex-direction: column;
    gap: var(--sm3);
    align-items: flex-start;
  }

  .formula {
    margin: 0;
    font-family: var(--font-family-mono);
    font-size: var(--sm1);
    word-break: break-word;
  }

  .note {
    margin: 0;
    font-size: var(--sm1);
    color: var(--color-fg-base-muted);
  }
</style>
