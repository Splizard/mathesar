<script lang="ts">
  import AppendBreadcrumb from '@mathesar/components/breadcrumb/AppendBreadcrumb.svelte';
  import type { Table } from '@mathesar/models/Table';
  import RecordPage from '@mathesar/pages/record/RecordPage.svelte';
  import RecordStore from '@mathesar/systems/record-view/RecordStore';
  import { recordNameFromUrl } from '@mathesar/utils/recordName';

  export let table: Table;
  /** As the URL holds it: one value, or a JSON array where the key is made of several columns */
  export let recordPk: string;

  $: record = new RecordStore({ table, recordPk: recordNameFromUrl(recordPk) });
  $: schema = table.schema;
  $: database = schema.database;
  $: ({ summary, fetchRequest } = record);
</script>

{#if $fetchRequest?.state === 'success'}
  <AppendBreadcrumb
    item={{
      type: 'record',
      database,
      schema,
      table,
      record: {
        pk: recordPk,
        summary: $summary,
      },
    }}
  />
{/if}
<RecordPage {record} />
