/**
 * Filling a record summary card in from a record the browser already has.
 *
 * A summary written out in a sentence is built by the server, because it may walk a chain of
 * foreign keys to reach a value the browser has never seen. A card is filled in here instead,
 * for the records of the table being looked at: their values are already on the page, so there
 * is nothing to ask for.
 *
 * The reach of that is honest rather than complete. A reference to one of the table's own
 * columns is read straight off the record. A reference through a foreign key is shown as the
 * summary of the linked record, which the browser is given alongside the records; a longer chain
 * than that is beyond what is on the page, and a slot which needs one is left empty rather than
 * filled in with something that only looks right.
 */
import type {
  RecordSummaryCard,
  RecordSummaryTemplate,
} from '@mathesar/api/rpc/tables';

/** What the browser has been given about one record */
export interface CardSource {
  /** The record's values, keyed by column attnum as a string */
  values: Record<string, unknown>;
  /**
   * The summaries of the records this one links to, keyed by the attnum of the column holding
   * the link and then by the value in it.
   */
  linkedSummaries?: (attnum: number, value: unknown) => string | undefined;
  /** How a column's value is written out, for a column whose type is shown its own way */
  format?: (attnum: number, value: unknown) => string;
}

export interface FilledCard {
  primary: string;
  secondary: string;
  aside: string;
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  // An object is a composite, an array, or something else there is no one line for.
  return JSON.stringify(value);
}

/**
 * Fill one slot of a card in, or answer nothing if it cannot be filled from what is on the page.
 *
 * A slot whose references all lead nowhere is nothing rather than the literal text around them:
 * "by " on its own says less than an empty line does.
 */
export function renderTemplate(
  template: RecordSummaryTemplate | undefined,
  source: CardSource,
): string {
  if (!template || template.length === 0) return '';
  let anyReferenceFilled = false;
  let anyReferenceAsked = false;
  const parts = template.map((part) => {
    if (!Array.isArray(part)) return part;
    anyReferenceAsked = true;
    if (part.length === 0) return '';
    if (part.length === 1) {
      const attnum = part[0];
      const value = source.values[String(attnum)];
      const written = source.format?.(attnum, value) ?? renderValue(value);
      if (written !== '') anyReferenceFilled = true;
      return written;
    }
    if (part.length === 2) {
      // Through one foreign key, which is as far as what the page holds goes: the summary of the
      // record the first column links to.
      const [linkAttnum] = part;
      const summary = source.linkedSummaries?.(
        linkAttnum,
        source.values[String(linkAttnum)],
      );
      if (summary) anyReferenceFilled = true;
      return summary ?? '';
    }
    // A longer chain than the page holds.
    return '';
  });
  if (anyReferenceAsked && !anyReferenceFilled) return '';
  return parts.join('');
}

/** Fill a whole card in. A slot the card leaves out is empty, and shows as nothing. */
export function renderCard(
  card: RecordSummaryCard | null | undefined,
  source: CardSource,
): FilledCard | undefined {
  if (!card) return undefined;
  return {
    primary: renderTemplate(card.primary, source),
    secondary: renderTemplate(card.secondary, source),
    aside: renderTemplate(card.aside, source),
  };
}

/** Whether a card has anything in it worth showing */
export function cardHasAnything(filled: FilledCard | undefined): boolean {
  if (!filled) return false;
  return (
    filled.primary !== '' || filled.secondary !== '' || filled.aside !== ''
  );
}
