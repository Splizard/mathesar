<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  import LinkedRecordInput from '@mathesar/components/cell-fabric/data-types/components/linked-record/LinkedRecordInput.svelte';
  import {
    findTableByName,
    getAllTablesStore,
    getQualifiedTableName,
  } from '@mathesar/stores/allTables';
  import { databasesStore } from '@mathesar/stores/databases';
  import { makeRowSeekerOrchestratorFactory } from '@mathesar/systems/row-seeker/rowSeekerOrchestrator';
  import { Spinner } from '@mathesar-component-library';

  import { createTableRecordStore } from './tableRecordUtils';

  export let value: string | undefined = undefined;
  export let disabled = false;
  export let placeholder: string | undefined = undefined;

  const dispatch = createEventDispatcher();
  const { currentDatabase } = databasesStore;

  $: database = $currentDatabase;
  $: tablesApiStore = database ? getAllTablesStore(database) : undefined;
  $: void tablesApiStore?.runConservatively();
  $: tables = $tablesApiStore?.resolvedValue ?? [];
  $: isLoading = $tablesApiStore?.isLoading ?? false;
  $: error = $tablesApiStore?.error;
  $: table = value ? findTableByName(tables, value) : undefined;
  $: recordSummary = table ? getQualifiedTableName(table) : undefined;

  const recordSelectionOrchestratorFactory = makeRowSeekerOrchestratorFactory({
    constructRecordStore: () => createTableRecordStore(tables),
  });

  // The summary is the table's own name, so there's nothing to record
  const setRecordSummary: (
    recordId: string,
    summary: string,
  ) => void = () => {};
</script>

{#if isLoading}
  <div class="input-element database-table-input"><Spinner /></div>
{:else if error}
  <div class="input-element database-table-input">
    <div class="error">{error.message}</div>
  </div>
{:else}
  <LinkedRecordInput
    bind:value
    {recordSelectionOrchestratorFactory}
    {recordSummary}
    {setRecordSummary}
    {disabled}
    {placeholder}
    on:artificialChange={(e) => dispatch('artificialChange', e.detail)}
    on:artificialInput={(e) => dispatch('artificialInput', e.detail)}
  />
{/if}

<style>
  .database-table-input {
    width: 100%;
  }
  .error {
    color: var(--color-fg-error);
    padding: var(--sm4);
  }
</style>
