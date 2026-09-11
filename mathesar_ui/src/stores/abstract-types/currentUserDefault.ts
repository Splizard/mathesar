import type { RawColumnWithMetadata } from '@mathesar/api/rpc/columns';

/**
 * The SQL expression giving the current Mathesar user, as the default of a
 * user column that records who created each record ("Created By").
 */
export const currentUserDefaultExpression =
  'mathesar_types.current_mathesar_user()';

/** Whether a column default is the current Mathesar user */
export function isCurrentUserDefault(
  columnDefault: RawColumnWithMetadata['default'] | undefined,
): boolean {
  return (
    !!columnDefault?.is_dynamic &&
    columnDefault.value.trim().toLowerCase() === currentUserDefaultExpression
  );
}
