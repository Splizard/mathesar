<script lang="ts">
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';

  import {
    iconAddNew,
    iconRecord,
    iconShowTheRestAgain,
  } from '@mathesar/icons';
  import type { Table } from '@mathesar/models/Table';
  import { abstractTypeCategory } from '@mathesar/stores/abstract-types/constants';
  import { getTabularDataStoreFromContext } from '@mathesar/stores/table-data';
  import { currentTablesMap } from '@mathesar/stores/tables';
  import { chooseDefaultCard } from '@mathesar/systems/record-summary-card/defaultCard';
  import RecordSummaryCard from '@mathesar/systems/record-summary-card/RecordSummaryCard.svelte';
  import {
    type FilledCard,
    cardHasAnything,
    renderCard,
  } from '@mathesar/systems/record-summary-card/renderCard';
  import RecordStore from '@mathesar/systems/record-view/RecordStore';
  import { modalRecordViewContext } from '@mathesar/systems/record-view-modal/modalRecordViewContext';
  import { Button, Icon, Spinner } from '@mathesar-component-library';

  import { showTheRestAgain, tableIsFullScreen } from './fullScreen';

  export let table: Table;

  const tabularData = getTabularDataStoreFromContext();
  const modalRecordView = modalRecordViewContext.get();
  /** The abstract types the database would file under strings */
  const textualTypes = new Set<string>([
    abstractTypeCategory.Text,
    abstractTypeCategory.Email,
    abstractTypeCategory.Uri,
  ]);
  /** The types of the columns the database stamps rather than a person filling in */
  const stampTypes = new Set<string>([
    abstractTypeCategory.CreatedAt,
    abstractTypeCategory.UpdatedAt,
  ]);

  $: ({ recordsData, isLoading, canInsertRecords, processedColumns } =
    $tabularData);
  $: ({ selectableRowsMap, recordSummaries, linkedRecordSummaries } =
    recordsData);
  /** How a record of this table is shown as a card, when somebody has said */
  $: card = table.metadata?.record_summary_card ?? undefined;
  /**
   * Which columns fill a card for a table nobody has configured one for, which is most of them:
   * a card is set from the table inspector, and a phone is not where that gets done.
   */
  $: defaultCard = card
    ? undefined
    : chooseDefaultCard(
        [...$processedColumns.values()].map((c) => ({
          attnum: c.column.id,
          isPrimaryKey: c.column.primary_key,
          isTextual: textualTypes.has(c.abstractType.identifier),
          isStamp:
            stampTypes.has(c.abstractType.identifier) || c.isUserTrackingColumn,
        })),
        table.metadata?.record_summary_template,
      );

  /**
   * One of the record's own cells, written the way the spreadsheet would write it.
   *
   * A cell with nothing in it is nothing rather than the word for it: the spreadsheet has a
   * column heading above an empty cell to say what is missing, and a card has neither.
   */
  function cell(record: Record<string, unknown>, attnum: number | undefined) {
    if (attnum === undefined) return '';
    const column = $processedColumns.get(String(attnum));
    if (!column) return '';
    const value = record[String(attnum)];
    if (value === null || value === undefined) return '';
    return column.formatCellValue(value, $linkedRecordSummaries) ?? '';
  }

  /**
   * A card for a record of a table nobody has configured one for.
   *
   * The line the server writes stays where it is, and the cells around it are filled from the
   * columns it has not already said. It can still say them: the rule for which column a summary
   * shows is followed here rather than asked about, so a cell that turns out to repeat the line
   * above it is dropped instead of shown twice.
   */
  function fillDefaultCard(
    record: Record<string, unknown>,
    summary: string,
  ): FilledCard {
    const secondary = cell(record, defaultCard?.secondary);
    const aside = cell(record, defaultCard?.aside);
    return {
      primary: summary,
      secondary: secondary === summary ? '' : secondary,
      aside: aside === summary ? '' : aside,
    };
  }

  /**
   * One entry per record on the page: what it is called, and the record it stands for. A record
   * with nothing to call it is shown by its key, which is at least something to tap.
   */
  $: entries = [...$selectableRowsMap].map(([rowKey, row]) => {
    const recordId = $tabularData.getRecordIdFromRowId(rowKey);
    const key = recordId === undefined ? undefined : String(recordId);
    const summary = (key && $recordSummaries.get(key)) || key || '?';
    const filled = card
      ? renderCard(card, {
          values: row.record,
          linkedSummaries: (attnum, value) =>
            $linkedRecordSummaries.get(String(attnum))?.get(String(value)),
          format: (attnum, value) =>
            $processedColumns.get(String(attnum))?.formatCellValue(value) ?? '',
        })
      : fillDefaultCard(row.record, summary);
    return {
      rowKey,
      recordId,
      card: cardHasAnything(filled) ? filled : undefined,
      summary,
    };
  });

  function open(recordId: unknown) {
    if (!modalRecordView || recordId === undefined) return;
    const containingTable = $currentTablesMap.get(table.oid);
    if (!containingTable) return;
    modalRecordView.open(
      new RecordStore({ table: containingTable, recordPk: String(recordId) }),
    );
  }

  async function addRecord() {
    await recordsData.addEmptyRecord();
    // Opened as soon as it is there, a form being the way to fill a record in on a phone. The
    // new record is the last of them, the page's records coming before the ones just added.
    const keys = [...get(recordsData.selectableRowsMap).keys()];
    const newest = keys[keys.length - 1];
    if (newest) open($tabularData.getRecordIdFromRowId(newest));
  }
</script>

<div class="record-summary-list">
  {#if $isLoading && entries.length === 0}
    <div class="loading"><Spinner /></div>
  {:else if entries.length === 0}
    <p class="nothing">{$_('no_records_found')}</p>
  {:else}
    <ul>
      {#each entries as entry (entry.rowKey)}
        <li>
          <button type="button" on:click={() => open(entry.recordId)}>
            <Icon {...iconRecord} />
            {#if entry.card}
              <RecordSummaryCard card={entry.card} />
            {:else}
              <span class="summary">{entry.summary}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="floating">
    {#if $tableIsFullScreen}
      <!-- Only reachable by turning the phone while the table was being shown on its own: the
      way back out lives in the corner of a sheet, and there is no sheet here. -->
      <Button
        appearance="secondary"
        aria-label={$_('show_the_rest_again')}
        on:click={() => void showTheRestAgain()}
      >
        <Icon {...iconShowTheRestAgain} />
      </Button>
    {/if}
    {#if $canInsertRecords}
      <Button
        appearance="primary"
        aria-label={$_('new_record')}
        on:click={addRecord}
      >
        <Icon {...iconAddNew} />
      </Button>
    {/if}
  </div>
</div>

<style lang="scss">
  .record-summary-list {
    position: relative;
    height: 100%;
    overflow-y: auto;
    /* Nothing here is wider than the screen, and a summary that would be is cut short. */
    overflow-x: hidden;
    background: var(--color-bg-base);
  }

  ul {
    list-style: none;
    margin: 0;
    /* Room at the bottom for the button that floats over it. */
    padding: 0 0 5rem 0;
  }

  li + li {
    border-top: 1px solid var(--card-border-color);
  }

  button {
    display: flex;
    align-items: center;
    gap: var(--sm2);
    width: 100%;
    /* Big enough to hit with a thumb. */
    min-height: 3rem;
    padding: var(--sm2) var(--sm1);
    border: none;
    background: transparent;
    text-align: left;
    font-size: 1rem;
    color: var(--color-fg-base);
    cursor: pointer;
  }

  button:active {
    background: var(--color-bg-base-active, var(--card-background));
  }

  .summary {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .floating {
    position: sticky;
    bottom: var(--lg1);
    display: flex;
    justify-content: flex-end;
    gap: var(--sm2);
    padding-right: var(--lg1);
    /* Nothing of its own to sit on, so that the list shows through beside it. */
    pointer-events: none;
  }

  .floating > :global(*) {
    pointer-events: auto;
    border-radius: 50%;
    width: 3.5rem;
    height: 3.5rem;
    box-shadow: var(--card-hover-box-shadow);
  }

  .loading,
  .nothing {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--lg4);
    color: var(--color-fg-base-muted);
  }
</style>
