<script lang="ts">
  import { router } from 'tinro';

  import type { Table } from '@mathesar/models/Table';
  import { getRestoredSerialization } from '@mathesar/systems/table-view/userTableView';

  /**
   * Shows the table page only once the view it should open with is in the address.
   *
   * Where the address already says what to show, that is straight away. Where it says nothing,
   * it is after asking for the view this person last left the table with -- held back until then
   * so the table is fetched once, with it, rather than once without and again with. A failure to
   * ask opens the table as it would have opened anyway.
   */

  export let table: Table;

  const queryKey = 'q';
  let readyFor: Table | undefined;

  async function restore(t: Table) {
    if (!router.location.query.get(queryKey)) {
      try {
        const restored = await getRestoredSerialization({
          databaseId: t.schema.database.id,
          tableOid: t.oid,
        });
        if (t !== table) return;
        if (restored && !router.location.query.get(queryKey)) {
          router.location.query.set(queryKey, restored);
        }
      } catch {
        // Opened as it would have been without this
      }
    }
    if (t === table) readyFor = t;
  }

  $: if (readyFor?.oid !== table.oid) void restore(table);
</script>

{#if readyFor?.oid === table.oid}
  <slot />
{/if}
