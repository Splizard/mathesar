import type { ColumnTypeOptions } from '@mathesar/api/rpc/columns';
import type { RawSchemaType } from '@mathesar/api/rpc/schemas';
import type { CompositeField } from '@mathesar/api/rpc/types';

/** A type as a field of a composite type is given it, the way a column's is */
export interface FieldType {
  name: string;
  options: ColumnTypeOptions;
}

/**
 * A field of a composite type, while somebody is editing the list of them.
 *
 * One the type already has says which field it stands for and what type
 * Postgres holds it as, neither of which is ours to change. One being added
 * carries the type picked for it instead, along with whether that type is one
 * which could be asked for -- a length still being typed is not.
 *
 * The key is what the list is drawn against, since a name being typed is too
 * changeable to identify a row by, and two rows may briefly read the same.
 */
export interface CompositeFieldEntry {
  key: number;
  name: string;
  /** The field of the type this one stands for, absent for one being added */
  was?: string;
  /** The type that field holds, as Postgres writes it, for one it already has */
  held?: string;
  /**
   * The type picked for a field being added. A field the type already has holds
   * one too, so that the input can be bound to it either way, and never sends
   * it: Postgres would not take it.
   */
  type: FieldType;
  /** Whether the type picked is one which could be asked for */
  typeIsValid: boolean;
}

/** The type a field being added is of until something says otherwise */
function getDefaultFieldType(): FieldType {
  return { name: 'text', options: {} };
}

export function isFieldTheTypeHas(
  entry: CompositeFieldEntry,
): entry is CompositeFieldEntry & { was: string } {
  return entry.was !== undefined;
}

/** The entries for a composite type's fields as they stand, ready to be edited */
export function getFieldEntries(
  type: RawSchemaType | undefined,
): CompositeFieldEntry[] {
  return (type?.fields ?? []).map((field, key) => ({
    key,
    name: field.name,
    was: field.name,
    held: field.type,
    type: getDefaultFieldType(),
    typeIsValid: true,
  }));
}

/** A key no entry in the list has, for one about to join it */
export function getNextFieldKey(entries: CompositeFieldEntry[]): number {
  return (
    entries.reduce((highest, entry) => Math.max(highest, entry.key), -1) + 1
  );
}

export function withField(
  entries: CompositeFieldEntry[],
): CompositeFieldEntry[] {
  return [
    ...entries,
    {
      key: getNextFieldKey(entries),
      name: '',
      type: getDefaultFieldType(),
      typeIsValid: true,
    },
  ];
}

export function withoutField(
  entries: CompositeFieldEntry[],
  key: number,
): CompositeFieldEntry[] {
  return entries.filter((entry) => entry.key !== key);
}

export function withFieldName(
  entries: CompositeFieldEntry[],
  key: number,
  name: string,
): CompositeFieldEntry[] {
  return entries.map((entry) =>
    entry.key === key ? { ...entry, name } : entry,
  );
}

/** The fields the entries say the composite type should have, in the order given */
export function getApiFields(entries: CompositeFieldEntry[]): CompositeField[] {
  return entries.map((entry) => {
    const name = entry.name.trim();
    return isFieldTheTypeHas(entry)
      ? { name, was: entry.was }
      : { name, type: entry.type };
  });
}

/** The fields of the composite type that the entries no longer have */
export function getDroppedFields(
  entries: CompositeFieldEntry[],
  type: RawSchemaType | undefined,
): string[] {
  const kept = new Set(entries.map((entry) => entry.was));
  return (type?.fields ?? [])
    .map((field) => field.name)
    .filter((name) => !kept.has(name));
}

/**
 * Why the entries aren't fields that could be saved, as something to say, or
 * undefined when they are.
 */
export function getFieldEntriesError(
  entries: CompositeFieldEntry[],
):
  | 'composite_needs_a_field'
  | 'field_needs_a_name'
  | 'field_name_repeated'
  | 'field_type_is_unfinished'
  | undefined {
  const names = entries.map((entry) => entry.name.trim());
  if (names.length === 0) return 'composite_needs_a_field';
  if (names.some((name) => name === '')) return 'field_needs_a_name';
  if (new Set(names).size !== names.length) return 'field_name_repeated';
  if (
    entries.some((entry) => !isFieldTheTypeHas(entry) && !entry.typeIsValid)
  ) {
    return 'field_type_is_unfinished';
  }
  return undefined;
}
