import type { SavedTableFilter } from '@mathesar/api/rpc/tables';
import type { TerseFiltering } from '@mathesar/stores/table-data';

/**
 * Two filters are the same filter when they are written the same way. The terse
 * form is what is stored and what the table view produces, so comparing the
 * text of it is comparing what was asked, without having to know what any part
 * of it means.
 */
function isSameFilter(a: unknown, b: TerseFiltering): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The name the filter now applied was kept under, if it was kept at all */
export function getAppliedFilterName(
  saved: SavedTableFilter[],
  applied: TerseFiltering,
): string | undefined {
  return saved.find((entry) => isSameFilter(entry.filter, applied))?.name;
}

/**
 * The kept filters with this one among them, in place of any already kept under
 * the same name.
 *
 * Saving over a name is how a kept filter is corrected; the alternative is two
 * filters called the same thing, which is no way to tell them apart. The one
 * replaced keeps its place in the order.
 */
export function withSavedFilter(
  saved: SavedTableFilter[],
  name: string,
  filter: TerseFiltering,
): SavedTableFilter[] {
  const entry = { name, filter };
  if (saved.some((e) => e.name === name)) {
    return saved.map((e) => (e.name === name ? entry : e));
  }
  return [...saved, entry];
}

/** The kept filters without the one of this name */
export function withoutSavedFilter(
  saved: SavedTableFilter[],
  name: string,
): SavedTableFilter[] {
  return saved.filter((entry) => entry.name !== name);
}
