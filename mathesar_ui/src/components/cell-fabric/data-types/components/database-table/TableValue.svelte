<script lang="ts">
  import { _ } from 'svelte-i18n';

  import { getTablePageUrl } from '@mathesar/routes/urls';
  import {
    findTableByName,
    getAllTablesStore,
    getQualifiedTableName,
  } from '@mathesar/stores/allTables';
  import { databasesStore } from '@mathesar/stores/databases';
  import {
    Icon,
    Spinner,
    Tooltip,
    compareWholeValues,
    iconWarning,
  } from '@mathesar-component-library';

  /**
   * A `regclass` value, which PostgreSQL writes as the name of the table it
   * holds, shown as a link to that table. Used wherever such a value is
   * displayed: in a Database Table cell, and in a primary key cell of one.
   */
  export let value: unknown;
  export let searchValue: unknown = undefined;

  const { currentDatabase } = databasesStore;

  $: database = $currentDatabase;
  $: tablesApiStore = database ? getAllTablesStore(database) : undefined;
  $: void tablesApiStore?.runConservatively();
  $: tables = $tablesApiStore?.resolvedValue ?? [];
  $: table = findTableByName(tables, String(value));
  $: valueComparisonOutcome = compareWholeValues(searchValue, value);
  // A column can name a table that's been dropped, or one of two schemas
  $: isUnknownTable = !!$tablesApiStore?.hasSettled && !table;
  $: href =
    table && database
      ? getTablePageUrl(database.id, table.schema, table.oid)
      : undefined;
</script>

{#if $tablesApiStore?.isLoading}
  <Spinner />
{:else if isUnknownTable}
  <span class="unknown">
    <Tooltip aria-label={$_('table_not_found_in_database')}>
      <Icon slot="trigger" {...iconWarning} />
      <span slot="content">{$_('table_not_found_in_database')}</span>
    </Tooltip>
    <span class="unknown-value">{value}</span>
  </span>
{:else if table}
  <span
    class="table-link"
    class:exact-match={valueComparisonOutcome === 'exactMatch'}
    class:no-match={valueComparisonOutcome === 'noMatch'}
  >
    <a {href} tabindex="-1" on:click|stopPropagation>
      {getQualifiedTableName(table)}
    </a>
    <span class="background" />
  </span>
{/if}

<style>
  .table-link {
    max-width: max-content;
    display: block;
    position: relative;
    isolation: isolate;
  }
  .table-link a {
    position: relative;
    z-index: 1;
    display: block;
    padding: 0.1rem 0.4rem;
    color: inherit;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .table-link .background {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: var(--color-record-fk-20);
    border: 1px solid var(--color-record-fk-25);
    border-radius: 0.25rem;
    z-index: 0;
  }
  .table-link:has(a:hover) .background {
    --border-width: 0.2rem;
    left: calc(-1 * var(--border-width));
    top: calc(-1 * var(--border-width));
    box-sizing: content-box;
    border: solid var(--border-width) var(--color-record-fk-40);
  }
  .exact-match .background {
    background: var(--color-bg-highlight);
  }
  .no-match {
    text-decoration: line-through;
  }
  .unknown {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--color-fg-base-disabled);
  }
  .unknown-value {
    text-decoration: line-through;
  }
</style>
