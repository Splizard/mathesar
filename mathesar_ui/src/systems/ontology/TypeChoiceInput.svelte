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
    type Modifiers,
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
  import type {
    AbstractTypeCategoryIdentifier,
    AbstractTypeDbConfig,
  } from '@mathesar/stores/abstract-types/types';
  import {
    FormBuilder,
    LabeledInput,
    Select,
    makeForm,
  } from '@mathesar-component-library';
  import type { FormValues } from '@mathesar-component-library/types';

  /** The type that has been picked, as a column's type is given */
  export let value: { name: string; options: ColumnTypeOptions };
  /** What kind of values it holds, for a caller that cares what they are like */
  export let abstractType: AbstractTypeCategoryIdentifier =
    getDefaultTypeChoice().abstractType.identifier;
  /** Whether it holds ranges of those values, arrays of them, or both */
  export let modifiers: Modifiers = { isRange: false, isArray: false };
  /** Whether what has been picked is a type that could be asked for */
  export let isValid = true;
  export let disabled = false;

  let choice: TypeChoice = getDefaultTypeChoice();

  // A type the database is being asked to define is over, or made of, what a
  // column can be of -- barring the ones that are themselves a rule about their
  // values, which would have to be picked and not just named, and the ones
  // filled in for a column rather than chosen.
  $: families = groupByFamily(
    getAllowedAbstractTypesForNewColumn().filter(
      (type) =>
        !isAutoFilledAbstractType(type) &&
        type.identifier !== abstractTypeCategory.Enum &&
        type.identifier !== abstractTypeCategory.Composite &&
        type.identifier !== abstractTypeCategory.File,
    ),
  );
  $: selected = getKindOf(choice);
  $: selectedFamily = families.find((f) => f.family === selected.family);
  $: selectedKind = selectedFamily?.kinds.find((k) => k.kind === selected.kind);

  $: spec = getColumnSaveSpec(choice);
  // The length, the precision and the like, which have to be settled here
  // because there is no altering them afterwards: Postgres will not change what
  // a domain is over, nor the type of a field of a composite type while
  // anything holds one.
  //
  // The form is built on its own variables' defaults rather than on a column's
  // settings, there being no column and nothing set: text is text until
  // somebody asks for a length.
  $: dbOptionsConfig = choice.abstractType.getDbConfig?.(spec.dbOptions.type);
  $: dbForm = dbOptionsConfig ? makeForm(dbOptionsConfig.form, {}) : undefined;
  $: dbFormValues = getFormValueStore(dbForm);
  // Mentioning the values is what makes this run again when one is typed, the
  // answer itself being the form's to give.
  $: isValid = ($dbFormValues, dbForm?.getValidationResult().isValid ?? true);

  // The options are taken as arguments rather than read from the enclosing
  // scope so that a length or a precision being typed is a change this sees:
  // what a reactive statement watches is what its own line mentions.
  function getValue(
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
  $: value = getValue(
    spec.dbOptions.type,
    spec.dbOptions.typeOptions,
    dbOptionsConfig,
    $dbFormValues,
  );
  $: abstractType = choice.abstractType.identifier;
  $: modifiers = selected;

  function isKindDisabled(option?: KindOption) {
    return option ? isAbstractTypeDisabled(option.abstractType) : false;
  }

  function selectKind(option: KindOption | undefined) {
    if (!option) return;
    choice = chooseKind(option, { modifiers: selected }) ?? choice;
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
    choice = withModifiers(choice, e.detail) ?? choice;
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
