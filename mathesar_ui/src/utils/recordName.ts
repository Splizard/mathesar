/**
 * What a record is called.
 *
 * A record is named by its primary key. Where that is one column the name is the value in it,
 * which is what it has always been; where the key is made of several columns the name is their
 * values, lowest attnum first -- the same order `msar.get_selectable_pkey_attnums` puts them in,
 * so that both ends arrive at it from the columns alone without either having to say.
 *
 * The name has to survive two round trips it did not used to: through a URL, and through the keys
 * of the object of record summaries the server sends. Both of those are text, so the text form is
 * defined here once and used by everything that needs it.
 */

import type { RecordName } from '@mathesar/api/rpc/records';

export type { RecordName };

/** Whether a name is made of several values rather than one */
export function isCompositeName(name: unknown): boolean {
  return Array.isArray(name);
}

/**
 * The name written as text, for a URL or for looking a summary up.
 *
 * A name of one value is written the way it always was, so that the links people have kept on
 * working. A name of several is written as JSON, which is what the server writes it as too.
 */
export function recordNameToText(name: unknown): string {
  return isCompositeName(name) ? JSON.stringify(name) : String(name);
}

/**
 * Read a name back from text.
 *
 * Only text that is a JSON array is read as several values. Everything else is left as the string
 * it is -- including a lone number, which the server compares against the column's own type
 * anyway, exactly as it did when a record's name always arrived from a URL as a string.
 */
export function recordNameFromText(text: string): RecordName {
  if (!text.startsWith('[')) return text;
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : text;
  } catch {
    return text;
  }
}

/**
 * Read a name out of the piece of URL holding it.
 *
 * The router hands over the path segment as it stands in the address bar, so the escaping
 * `getRecordPageUrl` put there is undone here. A segment that cannot be unescaped is taken at
 * face value rather than thrown away.
 */
export function recordNameFromUrl(segment: string): RecordName {
  let text = segment;
  try {
    text = decodeURIComponent(segment);
  } catch {
    // Not escaped, or escaped wrongly by whoever typed the address. Use what is there.
  }
  return recordNameFromText(text);
}

/**
 * The form a name takes as a key, whichever end wrote it.
 *
 * Postgres writes a JSON array with a space after each comma and the browser writes it without
 * one, and both are the same name. Everything that keys records by name is passed through here so
 * that the two agree. A name that is not a JSON array is its own text and is left alone.
 */
export function canonicalRecordNameKey(key: string): string {
  if (!key.startsWith('[')) return key;
  try {
    const parsed: unknown = JSON.parse(key);
    return Array.isArray(parsed) ? JSON.stringify(parsed) : key;
  } catch {
    return key;
  }
}

/** The same, for a whole map of things keyed by a record's name */
export function byCanonicalRecordName<T>(
  entries: Iterable<[string, T]>,
): [string, T][] {
  return [...entries].map(([key, value]) => [
    canonicalRecordNameKey(key),
    value,
  ]);
}
