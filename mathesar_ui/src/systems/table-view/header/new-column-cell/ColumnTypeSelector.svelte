<script lang="ts">
  import { _ } from 'svelte-i18n';

  import { AbstractTypeName } from '@mathesar/components/abstract-type-control';
  import {
    defaultAbstractType,
    getAllowedAbstractTypesForNewColumn,
    getTypeFamily,
    groupByFamily,
    isAbstractTypeDisabled,
  } from '@mathesar/stores/abstract-types';
  import type { AbstractType } from '@mathesar/stores/abstract-types/types';
  import { Select, SelectionList } from '@mathesar-component-library';

  export let value: AbstractType;
  export let disabled = false;

  // Families are offered, then the kinds of the chosen one
  type Group = ReturnType<typeof groupByFamily>[number];
  $: groups = groupByFamily(getAllowedAbstractTypesForNewColumn());
  $: selectedGroup = groups.find(
    (group) => group.family === getTypeFamily(value),
  );

  function selectGroup(group: Group | undefined) {
    if (!group) {
      value = defaultAbstractType;
      return;
    }
    if (group === selectedGroup) return;
    value =
      group.members.find((m) => !isAbstractTypeDisabled(m)) ?? group.members[0];
  }
</script>

<!--
  This sits in a label, where clicking would also click the first button in it,
  the kind select's, opening its menu.
-->
<div on:click|preventDefault>
  <SelectionList
    options={groups}
    getLabel={(group) => group?.family.name ?? ''}
    value={selectedGroup}
    on:change={(e) => selectGroup(e.detail)}
    valuesAreEqual={(a, b) => a?.family === b?.family}
    offsetOnFocus={2}
    isOptionDisabled={(group) =>
      group.members.every((m) => isAbstractTypeDisabled(m))}
    {disabled}
    let:option
  >
    <AbstractTypeName
      abstractType={option.members[0]}
      label={option.family.name}
      icon={option.family.icon}
      showHelp={option.members.length === 1}
    />
  </SelectionList>
</div>

{#if selectedGroup && selectedGroup.members.length > 1}
  <div class="kind">
    <Select
      options={selectedGroup.members}
      {value}
      getLabel={(entry) => entry?.name ?? ''}
      autoSelect="none"
      isOptionDisabled={(t) => (t ? isAbstractTypeDisabled(t) : false)}
      on:change={(e) => {
        value = e.detail ?? value;
      }}
      triggerAppearance="default"
      ariaLabel={$_('kind')}
      let:option
      {disabled}
    >
      {#if option}
        <AbstractTypeName abstractType={option} />
      {/if}
    </Select>
  </div>
{/if}

<style lang="scss">
  .kind {
    margin-top: var(--sm3);
  }
</style>
