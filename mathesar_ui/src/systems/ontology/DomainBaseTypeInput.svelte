<script lang="ts">
  import { _ } from 'svelte-i18n';

  import type { ColumnTypeOptions } from '@mathesar/api/rpc/columns';
  import type { DbType } from '@mathesar/AppTypes';
  import {
    AbstractTypeName,
    TypeModifiers,
  } from '@mathesar/components/abstract-type-control';
  import { getFormValueStore } from '@mathesar/components/abstract-type-control/utils';
  import {
    type FamilyOption,
    type KindOption,
    type TypeChoice,
    chooseKind,
    getAllowedAbstractTypesForNewColumn,
    getColumnSaveSpec,
    getDefaultTypeChoice,
    getKindOf,
    groupByFamily,
    isAbstractTypeDisabled,
    isAutoFilledAbstractType,
    withModifiers,
  } from '@mathesar/stores/abstract-types';
  import { abstractTypeCategory } from '@mathesar/stores/abstract-types/constants';
  import type { AbstractTypeDbConfig } from '@mathesar/stores/abstract-types/types';
  import {
    FormBuilder,
    LabeledInput,
    Select,
    makeForm,
  } from '@mathesar-component-library';
  import type { FormValues } from '@mathesar-component-library/types';

  import { type RuleSubject, getRuleSubject } from './domainRules';

  /** The type the domain is to be over, as a column's type is given */
  export let over: { name: string; options: ColumnTypeOptions };
  /** What rules the type can be given, which is the caller's reason to ask */
  export let subject: RuleSubject | undefined = undefined;
  /** Whether what has been picked is a type that could be asked for */
  export let isValid = true;
  export let disabled = false;

  let value: TypeChoice = getDefaultTypeChoice();

  // A domain is a type with rules on top of another type, so what it can be
  // over is what a column can be of -- barring the ones that are already a rule
  // about their values, or are filled in for the column rather than chosen.
  $: families = groupByFamily(
    getAllowedAbstractTypesForNewColumn().filter(
      (type) =>
        !isAutoFilledAbstractType(type) &&
        type.identifier !== abstractTypeCategory.Enum &&
        type.identifier !== abstractTypeCategory.Composite &&
        type.identifier !== abstractTypeCategory.File,
    ),
  );
  $: selected = getKindOf(value);
  $: selectedFamily = families.find((f) => f.family === selected.family);
  $: selectedKind = selectedFamily?.kinds.find((k) => k.kind === selected.kind);

  $: spec = getColumnSaveSpec(value);
  // The length, the precision and the like, which a domain has to be given here
  // because there is no altering them afterwards: Postgres cannot change the
  // type a domain is over, and a column of the domain would have nowhere to go.
  //
  // The form is built on its own variables' defaults rather than on a column's
  // settings, there being no column and nothing set: a domain over text is over
  // text until somebody asks for a length.
  $: dbOptionsConfig = value.abstractType.getDbConfig?.(spec.dbOptions.type);
  $: dbForm = dbOptionsConfig ? makeForm(dbOptionsConfig.form, {}) : undefined;
  $: dbFormValues = getFormValueStore(dbForm);
  // Mentioning the values is what makes this run again when one is typed, the
  // answer itself being the form's to give.
  $: isValid = ($dbFormValues, dbForm?.getValidationResult().isValid ?? true);

  // The options are taken as arguments rather than read from the enclosing
  // scope so that a length or a precision being typed is a change this sees:
  // what a reactive statement watches is what its own line mentions.
  function getOver(
    dbType: DbType,
    typeOptions: ColumnTypeOptions,
    config: AbstractTypeDbConfig | undefined,
    formValues: FormValues,
  ): { name: string; options: ColumnTypeOptions } {
    const resolved = config?.determineDbTypeAndOptions(formValues, dbType);
    return {
      name: resolved?.dbType ?? dbType,
      // The array and the range are the type rather than a setting of it, so
      // they come from the choice and not from the form of options.
      options: { ...typeOptions, ...(resolved?.typeOptions ?? {}) },
    };
  }
  $: over = getOver(
    spec.dbOptions.type,
    spec.dbOptions.typeOptions,
    dbOptionsConfig,
    $dbFormValues,
  );
  $: subject = getRuleSubject(value.abstractType.identifier, selected);

  function isKindDisabled(option?: KindOption) {
    return option ? isAbstractTypeDisabled(option.abstractType) : false;
  }

  function selectKind(option: KindOption | undefined) {
    if (!option) return;
    value = chooseKind(option, { modifiers: selected }) ?? value;
  }

  function selectFamily(option: FamilyOption | undefined) {
    if (!option || option === selectedFamily) return;
    selectKind(option.kinds.find((k) => !isKindDisabled(k)) ?? option.kinds[0]);
  }
</script>

<LabeledInput label={$_('data_type')} layout="stacked">
  <Select
    options={families}
    value={selectedFamily}
    getLabel={(option) => option?.family.name ?? ''}
    autoSelect="none"
    isOptionDisabled={(option) =>
      !!option && option.kinds.every((k) => isKindDisabled(k))}
    on:change={(e) => selectFamily(e.detail)}
    let:option
    {disabled}
  >
    {#if option}
      <AbstractTypeName
        abstractType={option.kinds[0].abstractType}
        label={option.family.name}
        icon={option.family.icon}
        showHelp={option.kinds.length === 1}
      />
    {/if}
  </Select>
</LabeledInput>

{#if selectedFamily && selectedFamily.family.kinds.length > 1}
  <LabeledInput label={$_('kind')} layout="stacked">
    <Select
      options={selectedFamily.kinds}
      value={selectedKind}
      getLabel={(option) => option?.name ?? ''}
      autoSelect="none"
      isOptionDisabled={isKindDisabled}
      on:change={(e) => selectKind(e.detail)}
      let:option
      {disabled}
    >
      {#if option}
        <AbstractTypeName
          abstractType={option.abstractType}
          label={option.name}
          icon={option.icon}
        />
      {/if}
    </Select>
  </LabeledInput>
{/if}

<TypeModifiers
  {selected}
  {disabled}
  on:change={(e) => {
    value = withModifiers(value, e.detail) ?? value;
  }}
/>

{#if dbForm}
  <div class="db-opts">
    <FormBuilder form={dbForm} {disabled} />
  </div>
{/if}

<style lang="scss">
  .db-opts {
    margin-top: var(--sm3);
  }
</style>
