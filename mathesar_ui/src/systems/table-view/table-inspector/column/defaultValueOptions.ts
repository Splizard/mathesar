import { DB_TYPES } from '@mathesar/stores/abstract-types/dbTypes';
import type { ProcessedColumn } from '@mathesar/stores/table-data';

export type DefaultValueMode =
  | 'none'
  | 'set_default_user'
  | 'current_time'
  | 'custom';

export interface DefaultValueOptions {
  /** Available modes for this column type */
  availableModes: DefaultValueMode[];
  /** The initial mode based on column state */
  initialMode: DefaultValueMode;
  /** Label for the custom/default value option */
  customValueLabel: string;
  /** Label for the current_time option, when available */
  currentTimeLabel?: string;
  /** The SQL expression saved as the default for the current_time option */
  currentTimeExpression?: string;
}

/**
 * The SQL expression giving the current date and/or time for each date/time
 * type, along with the label of the option that sets it as the default.
 */
const currentTimeDefaults: Record<
  string,
  { expression: string; label: string }
> = {
  [DB_TYPES.DATE]: {
    expression: 'CURRENT_DATE',
    label: 'default_value_current_date',
  },
  [DB_TYPES.TIME_WITH_TZ]: {
    expression: 'CURRENT_TIME',
    label: 'default_value_current_time',
  },
  [DB_TYPES.TIME_WITHOUT_TZ]: {
    expression: 'LOCALTIME',
    label: 'default_value_current_time',
  },
  [DB_TYPES.TIMESTAMP_WITH_TZ]: {
    expression: 'now()',
    label: 'default_value_current_date_time',
  },
  [DB_TYPES.TIMESTAMP_WITHOUT_TZ]: {
    expression: 'LOCALTIMESTAMP',
    label: 'default_value_current_date_time',
  },
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
 * Whether the column's default is one of the expressions giving the current
 * date and/or time, possibly cast to the column's type, e.g. `(now())::date`.
 */
function hasCurrentTimeDefault(column: ProcessedColumn): boolean {
  const columnDefault = column.column.default;
  if (!columnDefault?.is_dynamic) return false;
  const expression = columnDefault.value
    .trim()
    .toLowerCase()
    .replace(/::[a-z ]+$/, '')
    .replace(/^\((.*)\)$/, '$1');
  return currentTimeExpressions.has(expression);
}

/**
 * Whether the column's default can be viewed and changed from the inspector.
 * Dynamic defaults can't, except for the current date and/or time on date/time
 * columns, which the inspector knows how to set.
 */
export function canSetDefaultValue(column: ProcessedColumn): boolean {
  if (!column.column.default?.is_dynamic) return true;
  return (
    column.column.type in currentTimeDefaults && hasCurrentTimeDefault(column)
  );
}

/**
 * Get default value options for a column based on its type.
 * This allows type-specific logic to be handled separately from the generic component.
 */
export function getDefaultValueOptions(
  column: ProcessedColumn,
): DefaultValueOptions {
  const initialIsDefaultNull = column.column.default === null;

  const isUserColumn =
    column.column.type === DB_TYPES.INTEGER &&
    column.column.metadata?.user_display_field != null;

  if (isUserColumn) {
    return {
      availableModes: ['none', 'set_default_user'],
      initialMode: initialIsDefaultNull ? 'none' : 'set_default_user',
      customValueLabel: 'default_value_set_default_user',
    };
  }

  const currentTimeDefault = currentTimeDefaults[column.column.type];
  if (currentTimeDefault) {
    const initialMode = (() => {
      if (initialIsDefaultNull) return 'none';
      if (hasCurrentTimeDefault(column)) return 'current_time';
      return 'custom';
    })();
    return {
      availableModes: ['none', 'current_time', 'custom'],
      initialMode,
      customValueLabel: 'custom_default',
      currentTimeLabel: currentTimeDefault.label,
      currentTimeExpression: currentTimeDefault.expression,
    };
  }

  // For non-user types, use the standard options
  return {
    availableModes: ['none', 'custom'],
    initialMode: initialIsDefaultNull ? 'none' : 'custom',
    customValueLabel: 'custom_default',
  };
}
