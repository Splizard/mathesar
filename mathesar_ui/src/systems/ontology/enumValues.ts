import type { EnumValue } from '@mathesar/api/rpc/types';

/**
 * A value of a choice, while somebody is editing the list of them.
 *
 * The key is what the list is drawn against, since a value being typed is too
 * changeable to identify a row by, and two rows may briefly read the same.
 */
export interface EnumValueEntry {
  key: number;
  value: string;
  /** The value of the choice this one stands for, absent for one being added */
  was?: string;
}

/** The entries for a choice as it stands, ready to be edited */
export function getEntries(values: string[] | undefined): EnumValueEntry[] {
  return (values ?? []).map((value, key) => ({ key, value, was: value }));
}

/** A key no entry in the list has, for one about to join it */
export function getNextKey(entries: EnumValueEntry[]): number {
  return entries.reduce((highest, entry) => Math.max(highest, entry.key), -1) + 1;
}

export function withEntry(entries: EnumValueEntry[], value = ''): EnumValueEntry[] {
  return [...entries, { key: getNextKey(entries), value }];
}

export function withoutEntry(
  entries: EnumValueEntry[],
  key: number,
): EnumValueEntry[] {
  return entries.filter((entry) => entry.key !== key);
}

export function withEntryValue(
  entries: EnumValueEntry[],
  key: number,
  value: string,
): EnumValueEntry[] {
  return entries.map((entry) => (entry.key === key ? { ...entry, value } : entry));
}

/**
 * The entries with the one at the given index moved by the given number of
 * places, or the entries as they are when that would take it off the end.
 */
export function withEntryMoved(
  entries: EnumValueEntry[],
  index: number,
  by: number,
): EnumValueEntry[] {
  const to = index + by;
  if (to < 0 || to >= entries.length) return entries;
  const moved = [...entries];
  moved.splice(to, 0, ...moved.splice(index, 1));
  return moved;
}

/** The values the entries say the choice should offer, in the order given */
export function getApiValues(entries: EnumValueEntry[]): EnumValue[] {
  return entries.map(({ value, was }) => ({ value: value.trim(), was }));
}

/**
 * Why the entries aren't a choice that could be saved, as something to say, or
 * undefined when they are.
 */
export function getEntriesError(
  entries: EnumValueEntry[],
): 'choice_needs_a_value' | 'choice_value_is_empty' | 'choice_value_repeated' | undefined {
  const values = entries.map((entry) => entry.value.trim());
  if (values.length === 0) return 'choice_needs_a_value';
  if (values.some((value) => value === '')) return 'choice_value_is_empty';
  if (new Set(values).size !== values.length) return 'choice_value_repeated';
  return undefined;
}

/** The choice's values that the entries no longer offer */
export function getDroppedValues(
  entries: EnumValueEntry[],
  values: string[] | undefined,
): string[] {
  const kept = new Set(entries.map((entry) => entry.was));
  return (values ?? []).filter((value) => !kept.has(value));
}

/**
 * Whether saving the entries means writing every record holding one of the
 * values, rather than leaving them where they are.
 *
 * Postgres can add a value to a choice and rename one without touching the
 * records. Dropping a value and changing the order they come in are written
 * into each record, so both mean rewriting the columns of the choice, and every
 * record has to still hold a value the choice offers afterwards.
 */
export function needsRewrite(
  entries: EnumValueEntry[],
  values: string[] | undefined,
): boolean {
  const kept = entries
    .map((entry) => entry.was)
    .filter((was): was is string => was !== undefined);
  return (
    kept.length !== (values ?? []).length ||
    kept.some((was, index) => was !== values?.[index])
  );
}
