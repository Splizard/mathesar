<script lang="ts">
  import { _ } from 'svelte-i18n';

  import type { RawSchemaType } from '@mathesar/api/rpc/schemas';
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
    getDefaultTypeChoice,
    getKindOf,
    groupByFamily,
    isAbstractTypeDisabled,
    withModifiers,
  } from '@mathesar/stores/abstract-types';
  import { abstractTypeCategory } from '@mathesar/stores/abstract-types/constants';
  import { getTabularDataStoreFromContext } from '@mathesar/stores/table-data';
  import {
    type EnumValueEntry,
    getEntries,
  } from '@mathesar/systems/ontology/enumValues';
  import EnumValuesInput from '@mathesar/systems/ontology/EnumValuesInput.svelte';
  import { Select, SelectionList } from '@mathesar-component-library';

  import type { ColumnChoice } from './columnChoice';

  export let value: TypeChoice = getDefaultTypeChoice();
  export let disabled = false;
  /**
   * Called when the type is chosen here rather than set from outside, so that
   * whoever is guessing at it can stop.
   */
  export let onUserChoice: (() => void) | undefined = undefined;
  /**
   * Told which choice of values the column is to hold while Choice is its
   * family, and told nothing whenever it isn't.
   */
  export let onChoiceChange: ((choice?: ColumnChoice) => void) | undefined =
    undefined;

  const tabularData = getTabularDataStoreFromContext();
  $: ({ table } = $tabularData);

  // Families are offered, then the kinds of the chosen one, which can hold
  // ranges or arrays of their values
  $: families = groupByFamily(getAllowedAbstractTypesForNewColumn());
  $: selected = getKindOf(value);
  $: selectedFamily = families.find((f) => f.family === selected.family);
  $: selectedKind = selectedFamily?.kinds.find((k) => k.kind === selected.kind);

  // A choice of values is a type in its own right rather than one of a fixed
  // set, so the kinds of the Choice family are the choices this schema has,
  // along with the offer to make another.
  $: isChoice = value.abstractType.identifier === abstractTypeCategory.Enum;
  $: typesFetch = table.schema.constructTypesStore();
  $: if (isChoice) void typesFetch.runConservatively();
  $: schemaChoices = ($typesFetch.resolvedValue ?? []).filter(
    (type) => type.kind === 'enum',
  );
  /** The choice the column is to hold, or null for one to be made for it */
  let schemaChoice: RawSchemaType | null = null;
  let newChoiceEntries: EnumValueEntry[] = [];

  // The schema's choices arrive after the family is picked, so the first of them
  // is taken up whenever there is one to take and nothing has been picked yet.
  let hasPickedChoice = false;
  $: if (!isChoice) hasPickedChoice = false;
  $: if (isChoice && !hasPickedChoice) {
    schemaChoice = schemaChoices[0] ?? null;
  }

  function getChoice(
    forChoice: boolean,
    fromSchema: RawSchemaType | null,
    entries: EnumValueEntry[],
  ): ColumnChoice | undefined {
    if (!forChoice) return undefined;
    return fromSchema ? { schemaType: fromSchema } : { entries };
  }
  $: onChoiceChange?.(getChoice(isChoice, schemaChoice, newChoiceEntries));

  function isKindDisabled(option?: KindOption) {
    return option ? isAbstractTypeDisabled(option.abstractType) : false;
  }

  function selectKind(option: KindOption | undefined) {
    if (!option) return;
    value = chooseKind(option, { modifiers: selected }) ?? value;
    onUserChoice?.();
  }

  function selectFamily(option: FamilyOption | undefined) {
    if (!option || option === selectedFamily) return;
    hasPickedChoice = false;
    newChoiceEntries = getEntries(undefined);
    selectKind(option.kinds.find((k) => !isKindDisabled(k)) ?? option.kinds[0]);
  }

  function selectSchemaChoice(option: RawSchemaType | null) {
    hasPickedChoice = true;
    schemaChoice = option;
    onUserChoice?.();
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

{#if isChoice}
  <div class="kind">
    <Select
      options={[...schemaChoices, null]}
      value={schemaChoice}
      getLabel={(option) => option?.name ?? $_('new_choice')}
      valuesAreEqual={(a, b) => (a?.oid ?? null) === (b?.oid ?? null)}
      autoSelect="none"
      on:change={(e) => selectSchemaChoice(e.detail ?? null)}
      triggerAppearance="default"
      ariaLabel={$_('kind')}
      {disabled}
    />
  </div>
  {#if schemaChoice}
    <!-- What the choice offers, so that picking it by name is not picking blind -->
    <div class="chips">
      {#each schemaChoice.values ?? [] as choiceValue}
        <span class="chip">{choiceValue}</span>
      {/each}
    </div>
  {:else}
    <div class="values">
      <EnumValuesInput bind:entries={newChoiceEntries} {disabled} />
    </div>
  {/if}
{:else if selectedFamily && selectedFamily.family.kinds.length > 1}
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
          icon={option.icon}
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
      onUserChoice?.();
    }}
  />
</div>

<style lang="scss">
  .kind,
  .values,
  .chips,
  .modifiers:not(:empty) {
    margin-top: var(--sm3);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sm4);
  }
  .chip {
    font-size: var(--sm1);
    padding: 0 var(--sm3);
    border-radius: var(--border-radius-xl);
    background: var(--color-bg-raised-3);
  }
</style>
