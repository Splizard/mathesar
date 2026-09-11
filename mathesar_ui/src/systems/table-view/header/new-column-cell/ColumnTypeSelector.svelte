<script lang="ts">
  import { _ } from 'svelte-i18n';

  import {
    AbstractTypeName,
    TypeModifiers,
  } from '@mathesar/components/abstract-type-control';
  import {
    type FamilyOption,
    type KindOption,
    type TypeChoice,
    chooseKind,
    getAllowedAbstractTypesForNewColumn,
    getKindOf,
    groupByFamily,
    isAbstractTypeDisabled,
    withModifiers,
  } from '@mathesar/stores/abstract-types';
  import { Select, SelectionList } from '@mathesar-component-library';

  export let value: TypeChoice;
  export let disabled = false;

  // Families are offered, then the kinds of the chosen one, which can hold
  // ranges or arrays of their values
  $: families = groupByFamily(getAllowedAbstractTypesForNewColumn());
  $: selected = getKindOf(value);
  $: selectedFamily = families.find((f) => f.family === selected.family);
  $: selectedKind = selectedFamily?.kinds.find((k) => k.kind === selected.kind);

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

<!--
  This sits in a label, where clicking would also click the first button in it,
  the kind select's, opening its menu.
-->
<div on:click|preventDefault>
  <SelectionList
    options={families}
    getLabel={(option) => option?.family.name ?? ''}
    value={selectedFamily}
    on:change={(e) => selectFamily(e.detail)}
    valuesAreEqual={(a, b) => a?.family === b?.family}
    offsetOnFocus={2}
    isOptionDisabled={(option) => option.kinds.every((k) => isKindDisabled(k))}
    {disabled}
    let:option
  >
    <AbstractTypeName
      abstractType={option.kinds[0].abstractType}
      label={option.family.name}
      icon={option.family.icon}
      showHelp={option.kinds.length === 1}
    />
  </SelectionList>
</div>

{#if selectedFamily && selectedFamily.family.kinds.length > 1}
  <div class="kind">
    <Select
      options={selectedFamily.kinds}
      value={selectedKind}
      getLabel={(option) => option?.name ?? ''}
      autoSelect="none"
      isOptionDisabled={isKindDisabled}
      on:change={(e) => selectKind(e.detail)}
      triggerAppearance="default"
      ariaLabel={$_('kind')}
      let:option
      {disabled}
    >
      {#if option}
        <AbstractTypeName
          abstractType={option.abstractType}
          label={option.name}
        />
      {/if}
    </Select>
  </div>
{/if}

<div class="modifiers">
  <TypeModifiers
    {selected}
    {disabled}
    on:change={(e) => {
      value = withModifiers(value, e.detail) ?? value;
    }}
  />
</div>

<style lang="scss">
  .kind,
  .modifiers:not(:empty) {
    margin-top: var(--sm3);
  }
</style>
