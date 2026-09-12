<script lang="ts">
  import { getEnumValueName } from '@mathesar/api/rpc/types';
  import type { DbType } from '@mathesar/AppTypes';
  import { abstractTypeCategory } from '@mathesar/stores/abstract-types/constants';
  import type {
    AbstractType,
    AbstractTypeDbConfig,
  } from '@mathesar/stores/abstract-types/types';
  import {
    type EnumValueEntry,
    getApiValues,
    getEntries,
    getEntriesError,
  } from '@mathesar/systems/ontology/enumValues';
  import EnumValuesInput from '@mathesar/systems/ontology/EnumValuesInput.svelte';
  import {
    FormBuilder,
    getValidationContext,
  } from '@mathesar-component-library';
  import type { FormValues } from '@mathesar-component-library/types';

  import DbTypeIndicator from './DbTypeIndicator.svelte';
  import { type ColumnWithAbstractType, constructDbForm } from './utils';

  export let selectedAbstractType: AbstractType;
  export let selectedDbType: DbType;
  export let typeOptions: ColumnWithAbstractType['type_options'];
  export let column: ColumnWithAbstractType;
  export let disabled = false;

  $: ({ dbOptionsConfig, dbForm, dbFormValues } = constructDbForm(
    selectedAbstractType,
    selectedDbType,
    column,
  ));

  // A choice of values is not a setting of a type but the whole of one, so it
  // is asked for here rather than through a form of options.
  $: isChoice = selectedAbstractType.identifier === abstractTypeCategory.Enum;
  /** The values the column's choice offers now, if a choice is what it holds */
  $: savedValues =
    selectedDbType === column.type
      ? column.type_options?.enum_values?.map(getEnumValueName)
      : undefined;
  let choiceEntries: EnumValueEntry[] = [];
  function resetChoiceEntries(values: string[] | undefined) {
    choiceEntries = getEntries(values);
  }
  $: resetChoiceEntries(savedValues);
  $: if (isChoice) {
    typeOptions = {
      enum_values: getApiValues(choiceEntries),
      // Carried rather than set: which type holds the values is the column's
      // own business, and saying it here is how the values it has now are told
      // from the ones being asked for.
      original_type: savedValues ? column.type_options?.original_type : undefined,
    };
  }

  const validationContext = getValidationContext();
  validationContext.addValidator('AbstractTypeConfigValidator', () => {
    let isValid = true;
    if (dbForm) {
      const isDbFormValid = dbForm.getValidationResult().isValid;
      isValid = isValid && isDbFormValid;
    }
    if (isChoice) {
      isValid = isValid && getEntriesError(choiceEntries) === undefined;
    }
    return isValid;
  });
  $: choiceEntries, validationContext.validate();

  function onDbFormValuesChange(
    dbFormValueSubstance: FormValues,
    _dbOptionsConfig: AbstractTypeDbConfig | undefined,
  ) {
    if (_dbOptionsConfig) {
      const determinedResult = _dbOptionsConfig.determineDbTypeAndOptions(
        dbFormValueSubstance,
        column.type,
      );
      typeOptions = determinedResult.typeOptions ?? {};
      selectedDbType = determinedResult.dbType;
      validationContext.validate();
    }
  }

  $: onDbFormValuesChange($dbFormValues, dbOptionsConfig);

  // The column's domain, while its type stays the one the domain is over
  $: indicatorTypeOptions =
    selectedDbType === column.type && column.type_options?.domain
      ? { ...typeOptions, domain: column.type_options.domain }
      : typeOptions;
</script>

{#if dbForm || isChoice}
  <div class="type-options">
    <DbTypeIndicator type={selectedDbType} typeOptions={indicatorTypeOptions} />
    {#if dbForm}
      <div class="option-form db-opts">
        <div class="content">
          <FormBuilder form={dbForm} {disabled} />
        </div>
      </div>
    {/if}
    {#if isChoice}
      <div class="option-form">
        <div class="content">
          <EnumValuesInput
            bind:entries={choiceEntries}
            values={savedValues}
            {disabled}
          />
        </div>
      </div>
    {/if}
  </div>
{:else}
  <DbTypeIndicator type={selectedDbType} typeOptions={indicatorTypeOptions} />
{/if}

<style lang="scss">
  .type-options {
    .option-form {
      margin-top: 0.5rem;

      .content {
        padding-top: 0.75rem;
      }
    }
  }
</style>
