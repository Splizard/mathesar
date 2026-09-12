<script lang="ts">
  import { _ } from 'svelte-i18n';

  import InspectorButton from '@mathesar/components/InspectorButton.svelte';
  import ModificationStatus from '@mathesar/components/ModificationStatus.svelte';
  import {
    iconHidePageHeader,
    iconRequiresAttention,
    iconRevealPageHeader,
    iconTableActions,
  } from '@mathesar/icons';
  import { tableInspectorVisible } from '@mathesar/stores/localStorage';
  import { getTabularDataStoreFromContext } from '@mathesar/stores/table-data';
  import { tableLayout } from '@mathesar/stores/viewport';
  import { isTableView } from '@mathesar/utils/tables';
  import { Dropdown, Icon, Tooltip } from '@mathesar-component-library';

  import SavedFilters from './actions-pane/record-operations/filter/SavedFilters.svelte';
  import TableFilter from './actions-pane/record-operations/filter/TableFilter.svelte';
  import GroupDropdown from './actions-pane/record-operations/group/GroupDropdown.svelte';
  import HideColumnsDropdown from './actions-pane/record-operations/hide/HideColumnsDropdown.svelte';
  import JoinDropdown from './actions-pane/record-operations/join/JoinDropdown.svelte';
  import SortDropdown from './actions-pane/record-operations/sort/SortDropdown.svelte';
  import { compactPageHeaderVisible } from './pageHeader';
  import StatusPane from './StatusPane.svelte';

  const tabularData = getTabularDataStoreFromContext();

  $: ({ table, meta, isLoading, hasPrimaryKey } = $tabularData);
  $: ({ currentRolePrivileges } = table.currentAccess);
  $: ({ sorting, grouping, hiddenColumns, sheetState } = meta);
  $: isSelectable = $currentRolePrivileges.has('SELECT');
  $: isView = isTableView(table);
  /**
   * Whether this row is where the breadcrumb is fetched from.
   *
   * Only on a screen held sideways. Upright, the bar at the top of the page keeps the name and a
   * button of its own for going elsewhere, so there is nothing here to fetch.
   */
  $: hasHeaderToggle = $tableLayout === 'compactSheet';

  function toggleTableInspector() {
    tableInspectorVisible.update((v) => !v);
  }
</script>

<!--
  One row of controls for a screen with no room for the two panes a table usually has.

  The panes hold the table's name, which the breadcrumb above is already showing, and a row of
  buttons, and a row of counts and pages. Together they are about a fifth of a phone's landscape
  screen, spent mostly on saying what the page already says. So the buttons are kept, at the size
  they take when nothing is written on them, and everything the lower pane holds is put behind the
  one button on the right -- which is where somebody looks for it.
-->
<div class="compact-toolbar">
  {#if hasHeaderToggle}
    <!-- The table's name, and the way to the breadcrumb it came from, which is kept out of the
    way until it is wanted. Naming the table here is the other half of that: the breadcrumb is
    what otherwise says which table this is. -->
    <button
      type="button"
      class="reveal"
      aria-label={table.name}
      aria-expanded={$compactPageHeaderVisible}
      on:click={() => compactPageHeaderVisible.update((v) => !v)}
    >
      <span class="name">{table.name}</span>
      <Icon
        {...$compactPageHeaderVisible
          ? iconHidePageHeader
          : iconRevealPageHeader}
        size="0.8em"
      />
    </button>
  {/if}

  {#if isSelectable}
    <div class="operations">
      <TableFilter />
      <SavedFilters />
      <SortDropdown {sorting} />
      <GroupDropdown {grouping} />
      <HideColumnsDropdown {hiddenColumns} />
      {#if !isView}
        <JoinDropdown />
      {/if}
    </div>
  {/if}

  <div class="right">
    <ModificationStatus requestState={$sheetState} />

    {#if !$isLoading && !$hasPrimaryKey}
      <div class="no-pk-warning">
        <Tooltip allowHover>
          <div slot="trigger">
            <Icon size="1.1em" {...iconRequiresAttention} />
          </div>
          <span slot="content">
            {#if isView}
              {$_('no_support_editing_views')}
            {:else}
              {$_('no_row_op_support_table_without_pk')}
            {/if}
          </span>
        </Tooltip>
      </div>
    {/if}

    {#if isSelectable}
      <InspectorButton
        disabled={$isLoading}
        active={$tableInspectorVisible}
        toggle={toggleTableInspector}
      />
    {/if}

    <Dropdown
      showArrow={false}
      triggerAppearance="secondary"
      size="medium"
      ariaLabel={$_('table_actions')}
    >
      <svelte:fragment slot="trigger">
        <Icon {...iconTableActions} />
      </svelte:fragment>
      <div class="more" slot="content">
        <StatusPane />
      </div>
    </Dropdown>
  </div>
</div>

<style lang="scss">
  .compact-toolbar {
    --badge-font-size: var(--sm1);
    display: flex;
    align-items: center;
    gap: var(--sm3);
    padding: var(--sm4) var(--sm3);
    border-bottom: 1px solid var(--color-border-base);
    /* Nothing here is worth a second line, and there is no second line to give it. */
    overflow: hidden;
  }

  .reveal {
    display: flex;
    align-items: center;
    gap: var(--sm5);
    flex: 0 1 auto;
    min-width: 0;
    padding: var(--sm5) var(--sm4);
    border: none;
    border-radius: var(--border-radius-m);
    background: transparent;
    color: var(--color-fg-base);
    font-size: var(--sm1);
    font-weight: var(--font-weight-bold);
    cursor: pointer;
  }

  .reveal .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Where the row is narrow enough that a name would crowd the buttons out, the arrow says
  enough on its own. */
  @media (max-width: 560px) {
    .reveal .name {
      display: none;
    }
  }

  .operations {
    display: flex;
    align-items: center;
    gap: var(--sm3);
    min-width: 0;
    /* Rather than be squeezed into nothing where there are more buttons than there is room. */
    overflow-x: auto;
  }

  .right {
    display: flex;
    align-items: center;
    gap: var(--sm3);
    margin-left: auto;
    flex-shrink: 0;
  }

  .no-pk-warning {
    display: flex;
    align-items: center;
    color: var(--color-fg-warning);
  }

  /* The buttons write their own names beside them where the window is wide. This row is used
  where the window is short rather than where it is narrow, so it says no to them itself. */
  .compact-toolbar :global(.responsive-button-label) {
    display: none;
  }

  .more {
    /* Wide enough for the counts and the pages to read as the row they are. */
    min-width: 18rem;
    max-width: min(28rem, 90vw);
    padding: var(--sm3);
    --status-bar-padding: 0;
  }
</style>
