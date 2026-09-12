<script lang="ts">
  import { _ } from 'svelte-i18n';

  import type { RawTableWithSchemaName } from '@mathesar/api/rpc/tables';
  import TableName from '@mathesar/components/TableName.svelte';
  import type { Database } from '@mathesar/models/Database';
  import { getAllTablesStore } from '@mathesar/stores/allTables';
  import {
    SelectionList,
    Spinner,
    TextInputWithPrefix,
    filterViaTextQuery,
    iconSearch,
  } from '@mathesar-component-library';

  export let database: Database;
  export let value: RawTableWithSchemaName | undefined = undefined;

  let query = '';

  // Every table of the database, not only this schema's: a shape worth copying
  // is as likely to be kept next door.
  $: tablesApiStore = getAllTablesStore(database);
  $: void tablesApiStore.runConservatively();
  $: tables = $tablesApiStore.resolvedValue ?? [];
  $: matches = [
    ...filterViaTextQuery(tables, query, (table) => [
      table.name,
      table.schema_name,
    ]),
  ];
</script>

<TextInputWithPrefix
  bind:value={query}
  prefixIcon={iconSearch}
  placeholder={$_('search_tables')}
  aria-label={$_('search_tables')}
/>

<div class="matches">
  {#if $tablesApiStore.isLoading}
    <div class="message"><Spinner /></div>
  {:else if !matches.length}
    <div class="message">{$_('no_tables_found')}</div>
  {:else}
    <SelectionList
      options={matches}
      autoSelect="none"
      bind:value
      valuesAreEqual={(a, b) => a?.oid === b?.oid}
      getLabel={(table) => table?.name ?? ''}
      let:option
    >
      <span class="match">
        <TableName table={option} />
        <span class="schema">{option.schema_name}</span>
      </span>
    </SelectionList>
  {/if}
</div>

<style>
  .matches {
    margin-top: var(--sm3);
    max-height: 12rem;
    overflow-y: auto;
  }
  .message {
    padding: var(--sm3);
    color: var(--color-fg-token);
  }
  .match {
    display: flex;
    align-items: baseline;
    gap: var(--sm4);
    justify-content: space-between;
  }
  .schema {
    font-size: var(--sm1);
    opacity: 0.7;
  }
</style>
