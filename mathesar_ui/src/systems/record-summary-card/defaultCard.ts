/**
 * What a record's card shows when nobody has said.
 *
 * A card is configured in the table inspector, and until somebody does there is nothing to show a
 * record by except the one line the server writes out -- which on a list of records is a column of
 * one value each, and says less about a record than a glance at the spreadsheet would.
 *
 * So a card nobody has configured is worked out here instead. The line the server writes stays as
 * the card's first cell, and the two cells under and beside it are filled from the first columns
 * the summary has not already said. That is a guess, and it is meant to be replaced: the moment a
 * card is configured for the table it is used instead of this.
 */
import type { RecordSummaryTemplate } from '@mathesar/api/rpc/tables';

/** What choosing needs to know about one of the table's columns */
export interface CardColumn {
  attnum: number;
  isPrimaryKey: boolean;
  /**
   * Whether the database would file this column's type under strings, which is what the server
   * looks for when it picks a column to summarize a record by.
   */
  isTextual: boolean;
  /**
   * Whether the database fills this column in rather than a person: when the record was made or
   * last touched, and by whom. True of a column and it is a record of the record, not of the
   * thing the record is about.
   */
  isStamp?: boolean;
}

/** Which cells a card that nobody configured has, beyond the summary in its first */
export interface DefaultCardColumns {
  secondary?: number;
  aside?: number;
}

/**
 * Which of the table's own columns the summary is already showing.
 *
 * With a template, that is the first column of every chain it walks: the rest of a chain belongs
 * to the tables it walks into. With no template the server picks one column, and it picks the
 * lowest-numbered string column, or failing that the lowest-numbered column of any type -- the
 * same rule as `msar.get_default_summary_column`, worked out here so that a card does not repeat
 * a value the line above it already holds.
 */
export function columnsShownBySummary(
  columns: CardColumn[],
  template: RecordSummaryTemplate | null | undefined,
): Set<number> {
  if (template) {
    const shown = new Set<number>();
    template.forEach((part) => {
      if (Array.isArray(part) && part.length > 0) shown.add(part[0]);
    });
    return shown;
  }
  const byAttnum = [...columns].sort((a, b) => a.attnum - b.attnum);
  const chosen = byAttnum.find((c) => c.isTextual) ?? byAttnum[0];
  return chosen ? new Set([chosen.attnum]) : new Set();
}

/**
 * Which two columns fill out a card nobody has configured.
 *
 * The columns are taken in the order the table shows them, so that the card reads the way the
 * spreadsheet does. A key is left out -- it is what the record is, not anything about it -- and so
 * is whatever the summary is already saying.
 *
 * What the database stamps on a record goes to the back of the queue rather than out of it. Two
 * lines saying when a record was made and when it was last touched are a poor way to tell one
 * record from another, but they beat a blank card on a table that holds nothing else.
 */
export function chooseDefaultCard(
  columns: CardColumn[],
  template: RecordSummaryTemplate | null | undefined,
): DefaultCardColumns {
  const alreadyShown = columnsShownBySummary(columns, template);
  const candidates = columns.filter(
    (c) => !c.isPrimaryKey && !alreadyShown.has(c.attnum),
  );
  const preferred = [
    ...candidates.filter((c) => !c.isStamp),
    ...candidates.filter((c) => c.isStamp),
  ];
  return { secondary: preferred[0]?.attnum, aside: preferred[1]?.attnum };
}
