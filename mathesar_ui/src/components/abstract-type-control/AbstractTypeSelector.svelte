<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';

  import type { DbType } from '@mathesar/AppTypes';
  import {
    type FamilyOption,
    type KindOption,
    type Modifiers,
    type TypeChoice,
    canCastDbType,
    chooseKind,
    getAllowedAbstractTypesForDbTypeAndItsTargetTypes,
    getKindOf,
    groupByFamily,
    isAbstractTypeDisabled,
    isAutoFilledAbstractType,
    withModifiers,
  } from '@mathesar/stores/abstract-types';
  import { DB_TYPES } from '@mathesar/stores/abstract-types/dbTypes';
  import { getRangeTypesOf } from '@mathesar/stores/abstract-types/ranges';
  import type { AbstractType } from '@mathesar/stores/abstract-types/types';
  import { LabeledInput, Select } from '@mathesar-component-library';

  import AbstractTypeName from './AbstractTypeName.svelte';
  import TypeModifiers from './TypeModifiers.svelte';
  import type { ColumnWithAbstractType } from './utils';

  const dispatch = createEventDispatcher<{
    reset: undefined;
    change: {
      type: ColumnWithAbstractType['type'];
      abstractType: ColumnWithAbstractType['abstractType'];
    };
  }>();

  export let column: ColumnWithAbstractType;
  export let selectedAbstractType: AbstractType;
  export let selectedDbType: DbType;
  export let disabled = false;
  /**
   * "Created At" and "Updated At" are set up through the column's default and
   * a trigger, so need support for those
   */
  export let allowAutoFilledTypes = false;

  $: allowedTypeConversions = getAllowedAbstractTypesForDbTypeAndItsTargetTypes(
    column.type,
    column.metadata,
    column,
  ).filter(
    (item) =>
      !['jsonlist', 'map'].includes(item.identifier) &&
      (allowAutoFilledTypes || !isAutoFilledAbstractType(item)),
  );
  $: columnItemType = column.type_options?.item_type ?? undefined;
  // Mathesar can't change columns to or from arrays, or between them
  $: isChoiceAllowed = (choice?: TypeChoice) =>
    !!choice &&
    (choice.dbType === DB_TYPES.ARRAY
      ? column.type === DB_TYPES.ARRAY && choice.itemType === columnItemType
      : canCastDbType(column.type, choice.dbType));

  // Families are offered, then the kinds of the chosen one
  $: families = groupByFamily(allowedTypeConversions, isChoiceAllowed);
  $: columnKind = getKindOf({
    abstractType: column.abstractType,
    dbType: column.type,
    itemType: columnItemType,
  });
  $: selectedChoice = {
    abstractType: selectedAbstractType,
    dbType: selectedDbType,
    itemType: selectedDbType === DB_TYPES.ARRAY ? columnItemType : undefined,
  };
  $: selected = getKindOf(selectedChoice);
  $: selectedFamily = families.find((f) => f.family === selected.family);
  $: selectedKind = selectedFamily?.kinds.find((k) => k.kind === selected.kind);
  // A column of ranges or arrays has the kind of its values
  $: preferredDbTypes = [
    column.type,
    getRangeTypesOf(column.type)?.value,
    columnItemType,
  ].filter((t): t is DbType => !!t);

  function getCanChange(
    choice: TypeChoice,
    { isRange, isArray }: Modifiers,
    isAllowed: typeof isChoiceAllowed,
  ): Record<keyof Modifiers, boolean> {
    return {
      isRange: isAllowed(withModifiers(choice, { isRange: !isRange, isArray })),
      isArray: isAllowed(withModifiers(choice, { isRange, isArray: !isArray })),
    };
  }
  $: canChange = getCanChange(selectedChoice, selected, isChoiceAllowed);

  function select(choice: TypeChoice | undefined) {
    if (!choice) return;
    const kind = getKindOf(choice);
    if (
      kind.kind === columnKind.kind &&
      kind.isRange === columnKind.isRange &&
      kind.isArray === columnKind.isArray
    ) {
      dispatch('reset');
    } else {
      dispatch('change', {
        type: choice.dbType,
        abstractType: choice.abstractType,
      });
    }
  }

  function isKindDisabled(option?: KindOption) {
    return option ? isAbstractTypeDisabled(option.abstractType) : false;
  }

  function selectKind(option: KindOption | undefined) {
    if (!option || option.kind === selected.kind) return;
    select(
      chooseKind(option, {
        modifiers: selected,
        preferredDbTypes,
        isChoiceAllowed,
      }),
    );
  }

  function selectFamily(option: FamilyOption | undefined) {
    if (!option || option.family === selected.family) return;
    // Back to the column's own type if it's of the family
    if (option.family === columnKind.family) {
      dispatch('reset');
      return;
    }
    selectKind(option.kinds.find((k) => !isKindDisabled(k)));
  }
</script>

<LabeledInput label={$_('data_type')} layout={'stacked'}>
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
  <LabeledInput label={$_('kind')} layout={'stacked'}>
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

{#if selectedFamily}
  <TypeModifiers
    {selected}
    {canChange}
    {disabled}
    on:change={(e) => select(withModifiers(selectedChoice, e.detail))}
  />
{/if}
