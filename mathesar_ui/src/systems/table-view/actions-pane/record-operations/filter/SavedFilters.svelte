<script lang="ts">
  import { _ } from 'svelte-i18n';

  import type { SavedTableFilter } from '@mathesar/api/rpc/tables';
  import { iconDeleteMajor, iconSavedFilters } from '@mathesar/icons';
  import {
    Filtering,
    type TerseFiltering,
    getTabularDataStoreFromContext,
  } from '@mathesar/stores/table-data';
  import { updateTable } from '@mathesar/stores/tables';
  import { toast } from '@mathesar/stores/toast';
  import { getErrorMessage } from '@mathesar/utils/errors';
  import {
    Button,
    Dropdown,
    Icon,
    Spinner,
    TextInput,
  } from '@mathesar-component-library';

  import {
    getAppliedFilterName,
    withSavedFilter,
    withoutSavedFilter,
  } from './savedFilters';

  const tabularData = getTabularDataStoreFromContext();

  let isOpen = false;
  let newName = '';
  let isSaving = false;

  $: ({ table, meta } = $tabularData);
  $: ({ filtering } = meta);
  $: saved = table.metadata?.saved_filters ?? [];
  $: appliedName = getAppliedFilterName(saved, $filtering.terse());
  $: canSave = $filtering.appliedFilterCount > 0;
  $: isOpen, (newName = '');

  async function keep(filters: SavedTableFilter[]) {
    isSaving = true;
    try {
      await updateTable({
        schema: table.schema,
        table: { oid: table.oid, metadata: { saved_filters: filters } },
      });
    } catch (e) {
      toast.error(`${$_('unable_to_save_changes')} ${getErrorMessage(e)}`);
    } finally {
      isSaving = false;
    }
  }

  async function save() {
    const name = newName.trim();
    if (!name) return;
    await keep(withSavedFilter(saved, name, $filtering.terse()));
    newName = '';
  }

  function apply(entry: SavedTableFilter) {
    // Stored as the table view writes it; see SavedTableFilter
    filtering.set(Filtering.fromTerse(entry.filter as TerseFiltering));
    isOpen = false;
  }

  async function forget(entry: SavedTableFilter) {
    await keep(withoutSavedFilter(saved, entry.name));
  }
</script>

<Dropdown
  bind:isOpen
  showArrow={false}
  triggerAppearance="secondary"
  ariaLabel={$_('saved_filters')}
>
  <svelte:fragment slot="trigger">
    <Icon {...iconSavedFilters} />
    <span class="responsive-button-label">
      {appliedName ?? $_('saved_filters')}
    </span>
  </svelte:fragment>

  <div slot="content" class="saved-filters">
    {#if saved.length}
      <ul class="list">
        {#each saved as entry (entry.name)}
          <li class:applied={entry.name === appliedName}>
            <Button appearance="plain" on:click={() => apply(entry)}>
              {entry.name}
            </Button>
            <Button
              appearance="plain"
              aria-label={$_('remove')}
              disabled={isSaving}
              on:click={() => forget(entry)}
            >
              <Icon {...iconDeleteMajor} />
            </Button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if canSave}
      <form class="keep" on:submit|preventDefault={save}>
        <TextInput
          bind:value={newName}
          placeholder={$_('name_this_filter')}
          aria-label={$_('name_this_filter')}
        />
        <Button
          appearance="primary"
          type="submit"
          disabled={!newName.trim() || isSaving}
        >
          {#if isSaving}<Spinner />{:else}{$_('save')}{/if}
        </Button>
      </form>
    {:else}
      <div class="hint">{$_('saved_filters_help')}</div>
    {/if}
  </div>
</Dropdown>

<style lang="scss">
  .saved-filters {
    min-width: 16rem;
    padding: var(--sm4);
  }
  .list {
    list-style: none;
    margin: 0 0 var(--sm4) 0;
    padding: 0;
  }
  .list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sm5);
  }
  .list li.applied {
    font-weight: var(--font-weight-bold);
  }
  .list li > :global(button:first-child) {
    flex: 1;
    text-align: left;
  }
  .keep {
    display: flex;
    gap: var(--sm5);
  }
  .hint {
    color: var(--color-fg-token);
    max-width: 18rem;
  }
</style>
