import type { RawColumnWithMetadata } from '@mathesar/api/rpc/columns';

import { DB_TYPES } from './dbTypes';

/**
 * The SQL expression giving the current date and/or time, for each date/time
 * type, to use as a column default.
 */
export const currentTimeDefaultExpressions: Record<string, string> = {
  [DB_TYPES.DATE]: 'CURRENT_DATE',
  [DB_TYPES.TIME_WITH_TZ]: 'CURRENT_TIME',
  [DB_TYPES.TIME_WITHOUT_TZ]: 'LOCALTIME',
  [DB_TYPES.TIMESTAMP_WITH_TZ]: 'now()',
  [DB_TYPES.TIMESTAMP_WITHOUT_TZ]: 'LOCALTIMESTAMP',
};

const currentTimeExpressions = new Set([
  'now()',
  'current_timestamp',
  'localtimestamp',
  'current_date',
  'current_time',
  'localtime',
]);

/**
 * Whether a column default is one of the expressions giving the current date
 * and/or time, possibly cast to the column's type, e.g. `(now())::date`.
 */
export function isCurrentTimeDefault(
  columnDefault: RawColumnWithMetadata['default'] | undefined,
): boolean {
  if (!columnDefault?.is_dynamic) return false;
  const expression = columnDefault.value
    .trim()
    .toLowerCase()
    .replace(/::[a-z ]+$/, '')
    .replace(/^\((.*)\)$/, '$1');
  return currentTimeExpressions.has(expression);
}
