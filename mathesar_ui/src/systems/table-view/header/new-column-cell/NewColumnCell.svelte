<script lang="ts">
  import { _ } from 'svelte-i18n';

  import {
    Field,
    FormSubmit,
    makeForm,
    requiredField,
  } from '@mathesar/components/form';
  import { iconAddNew } from '@mathesar/icons';
  import {
    type TypeChoice,
    getColumnSaveSpec,
    getDefaultTypeChoice,
    guessTypeFromColumnName,
  } from '@mathesar/stores/abstract-types';
  import { getTabularDataStoreFromContext } from '@mathesar/stores/table-data';
  import type { Formula } from '@mathesar/systems/formulas/formula';
  import FormulaInput from '@mathesar/systems/formulas/FormulaInput.svelte';
  import { columnNameIsAvailable } from '@mathesar/utils/columnUtils';
  import {
    Checkbox,
    Dropdown,
    Help,
    Icon,
    LabeledInput,
    Spinner,
    focusTrap,
  } from '@mathesar-component-library';

  import {
    type ColumnChoice,
    getChoiceColumnSpec,
    getChoiceError,
  } from './columnChoice';
  import ColumnTypeSelector from './ColumnTypeSelector.svelte';

  const tabularData = getTabularDataStoreFromContext();
  $: ({ table, columnsDataStore } = $tabularData);
  $: ({ columns } = columnsDataStore);
  $: ({ name: schemaName } = table.schema);
  /**
   * The columns a formula can read: the ones holding values of their own. Postgres will not work
   * one value out from another it is working out in the same record.
   */
  $: formulaColumns = $columns
    .filter((c) => c.formula_sql === undefined || c.formula_sql === null)
    .map((c) => ({ id: c.id, name: c.name }));

  $: columnName = requiredField('', [columnNameIsAvailable($columns)]);

  const defaultType = getDefaultTypeChoice();
  const columnType = requiredField<TypeChoice>(defaultType);
  $: form = makeForm({ columnName, columnType });

  /**
   * Until the type has been chosen here, the name is the only thing to go on,
   * and a name like "price" or "created_at" says plainly enough what the column
   * is for. Once somebody has chosen a type themselves it is not ours to move,
   * even if they go back and change the name.
   */
  let hasChosenType = false;
  $: if (!hasChosenType) {
    columnType.set(guessTypeFromColumnName($columnName) ?? defaultType);
  }

  /**
   * Whether the column's values are to be worked out from the rest of the
   * record rather than typed in. A formula settles the type, so the type is not
   * asked for while there is one.
   */
  let isFormula = false;
  let formula: Formula | undefined = undefined;

  /**
   * Which choice of values the column is to hold, while Choice is its type. A
   * choice is a type of its own rather than one of a fixed set, so it is asked
   * for alongside the type rather than being settled by it.
   */
  let choice: ColumnChoice | undefined = undefined;
  $: choiceError = choice ? getChoiceError(choice) : undefined;

  /**
   * Made once, so that the selector's props keep the identity they had. A fresh
   * object each time this component updated would reach the selector as a
   * change, and the selector answering it here would be another one.
   */
  const typeSelectorProps = {
    onUserChoice: () => {
      hasChosenType = true;
    },
    onChoiceChange: (c?: ColumnChoice) => {
      choice = c;
    },
  };

  function reset() {
    hasChosenType = false;
    choice = undefined;
    isFormula = false;
    formula = undefined;
    form.reset();
  }
  $: ({ isSubmitting } = form);

  async function addColumn(closeDropdown: () => void) {
    if (isFormula) {
      // The formula is read before this can be reached, canProceed waiting on it.
      if (!formula) return;
      await columnsDataStore.addFormula({ name: $columnName, formula });
      closeDropdown();
      return;
    }
    const spec = getColumnSaveSpec($columnType);
    const { typeOptions, ...dbOptions } = spec.dbOptions;
    await columnsDataStore.addWithMetadata(
      {
        name: $columnName,
        ...dbOptions,
        type_options: typeOptions,
        ...(choice ? getChoiceColumnSpec(choice, $schemaName) : {}),
      },
      spec.metadata,
    );
    closeDropdown();
  }
</script>

<Dropdown
  closeOnInnerClick={false}
  triggerAppearance="plain"
  showArrow={false}
  ariaLabel={$_('new_column')}
  on:close={reset}
  disabled={$isSubmitting}
>
  <svelte:fragment slot="trigger">
    {#if $isSubmitting}
      <Spinner />
    {:else}
      <Icon class="opt" {...iconAddNew} size="0.9em" />
    {/if}
  </svelte:fragment>
  <div
    slot="content"
    class="new-column-dropdown"
    class:wide={isFormula}
    let:close
    use:focusTrap
  >
    <Field field={columnName} label={$_('column_name')} layout="stacked" />
    <div class="formula-toggle">
      <LabeledInput layout="inline-input-first">
        <span slot="label">
          {$_('worked_out_from_a_formula')}
          <Help>{$_('worked_out_from_a_formula_help')}</Help>
        </span>
        <Checkbox
          checked={isFormula}
          on:change={() => {
            isFormula = !isFormula;
          }}
        />
      </LabeledInput>
    </div>
    {#if isFormula}
      <FormulaInput columns={formulaColumns} bind:formula />
    {:else}
      <Field
        field={columnType}
        input={{ component: ColumnTypeSelector, props: typeSelectorProps }}
        label={$_('select_type')}
        layout="stacked"
      />
    {/if}
    <div class="submit">
      <FormSubmit
        {form}
        canProceed={isFormula
          ? formula !== undefined
          : choiceError === undefined}
        proceedButton={{ label: $_('add') }}
        onProceed={() => addColumn(close)}
        onCancel={close}
        catchErrors
      />
    </div>
  </div>
</Dropdown>

<style lang="scss">
  .new-column-dropdown {
    padding: var(--sm1);
    overflow: hidden;
    width: 16em;

    .formula-toggle {
      margin-top: var(--sm3);
      font-size: var(--sm1);
      color: var(--color-fg-subtle-1);
    }

    .submit {
      margin-top: 1em;
    }
  }

  /* A formula needs more room to read than a type does to be picked. */
  .new-column-dropdown.wide {
    width: 26em;
    max-width: 90vw;
  }
</style>
