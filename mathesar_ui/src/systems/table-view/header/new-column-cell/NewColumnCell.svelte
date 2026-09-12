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
  import { columnNameIsAvailable } from '@mathesar/utils/columnUtils';
  import {
    Dropdown,
    Icon,
    Spinner,
    focusTrap,
  } from '@mathesar-component-library';

  import ColumnTypeSelector from './ColumnTypeSelector.svelte';

  const tabularData = getTabularDataStoreFromContext();
  $: ({ columnsDataStore } = $tabularData);
  $: ({ columns } = columnsDataStore);

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

  function reset() {
    hasChosenType = false;
    form.reset();
  }
  $: ({ isSubmitting } = form);

  async function addColumn(closeDropdown: () => void) {
    const spec = getColumnSaveSpec($columnType);
    const { typeOptions, ...dbOptions } = spec.dbOptions;
    await columnsDataStore.addWithMetadata(
      {
        name: $columnName,
        ...dbOptions,
        type_options: typeOptions,
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
  <div slot="content" class="new-column-dropdown" let:close use:focusTrap>
    <Field field={columnName} label={$_('column_name')} layout="stacked" />
    <Field
      field={columnType}
      input={{
        component: ColumnTypeSelector,
        props: { onUserChoice: () => { hasChosenType = true; } },
      }}
      label={$_('select_type')}
      layout="stacked"
    />
    <div class="submit">
      <FormSubmit
        {form}
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

    .submit {
      margin-top: 1em;
    }
  }
</style>
