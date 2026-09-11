<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';

  import {
    getAllowedAbstractTypesForDbTypeAndItsTargetTypes,
    getKindName,
    getTypeFamily,
    groupByFamily,
    isAbstractTypeDisabled,
    isAutoFilledAbstractType,
  } from '@mathesar/stores/abstract-types';
  import type { AbstractType } from '@mathesar/stores/abstract-types/types';
  import { LabeledInput, Select } from '@mathesar-component-library';

  import AbstractTypeName from './AbstractTypeName.svelte';
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

  function selectAbstractType(
    newAbstractType: ColumnWithAbstractType['abstractType'] | undefined,
  ) {
    if (!newAbstractType) {
      console.error('This should never occur. AbstractType is undefined');
      return;
    }
    if (selectedAbstractType !== newAbstractType) {
      if (newAbstractType.identifier === column.abstractType.identifier) {
        dispatch('reset');
      } else if (
        isAutoFilledAbstractType(column.abstractType) &&
        newAbstractType.dbTypes.has(column.type)
      ) {
        // E.g. from Created At to Date & Time, keeping time zone support
        dispatch('change', {
          type: column.type,
          abstractType: newAbstractType,
        });
      } else if (newAbstractType.defaultDbType) {
        dispatch('change', {
          type: newAbstractType.defaultDbType,
          abstractType: newAbstractType,
        });
      } else if (newAbstractType.dbTypes.size > 0) {
        const [selectedDbType] = newAbstractType.dbTypes;
        dispatch('change', {
          type: selectedDbType,
          abstractType: newAbstractType,
        });
      }
      selectedAbstractType = newAbstractType;
    }
  }

  function isOptionDisabled(type?: AbstractType) {
    return type ? isAbstractTypeDisabled(type) : false;
  }

  // Families are offered, then the kinds of the chosen one
  type Group = ReturnType<typeof groupByFamily>[number];
  $: groups = groupByFamily(allowedTypeConversions);
  $: selectedGroup = groups.find(
    (group) => group.family === getTypeFamily(selectedAbstractType),
  );

  function selectGroup(group: Group | undefined) {
    if (!group || group === selectedGroup) return;
    // Back to the column's own type if it's of the family
    const member = group.members.includes(column.abstractType)
      ? column.abstractType
      : group.members.find((m) => !isOptionDisabled(m));
    selectAbstractType(member);
  }
</script>

<LabeledInput label={$_('data_type')} layout={'stacked'}>
  <Select
    options={groups}
    value={selectedGroup}
    getLabel={(group) => group?.family.name ?? ''}
    autoSelect="none"
    isOptionDisabled={(group) =>
      !!group && group.members.every((m) => isOptionDisabled(m))}
    on:change={(e) => selectGroup(e.detail)}
    let:option
    {disabled}
  >
    {#if option}
      <AbstractTypeName
        abstractType={option.members[0]}
        label={option.family.name}
        icon={option.family.icon}
        showHelp={option.members.length === 1}
      />
    {/if}
  </Select>
</LabeledInput>

{#if selectedGroup && selectedGroup.members.length > 1}
  <LabeledInput label={$_('kind')} layout={'stacked'}>
    <Select
      options={selectedGroup.members}
      value={selectedAbstractType}
      getLabel={(entry) => (entry ? getKindName(entry) : '')}
      autoSelect="none"
      isOptionDisabled={(t) => isOptionDisabled(t)}
      on:change={(e) => selectAbstractType(e.detail)}
      let:option
      {disabled}
    >
      {#if option}
        <AbstractTypeName abstractType={option} label={getKindName(option)} />
      {/if}
    </Select>
  </LabeledInput>
{/if}
