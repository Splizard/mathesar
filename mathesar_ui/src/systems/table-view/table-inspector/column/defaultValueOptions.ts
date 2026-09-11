import {
  currentTimeDefaultExpressions,
  isCurrentTimeDefault,
} from '@mathesar/stores/abstract-types/currentTimeDefaults';
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

/** The label of the current_time option for each date/time type */
const currentTimeLabels: Record<string, string> = {
  [DB_TYPES.DATE]: 'default_value_current_date',
  [DB_TYPES.TIME_WITH_TZ]: 'default_value_current_time',
  [DB_TYPES.TIME_WITHOUT_TZ]: 'default_value_current_time',
  [DB_TYPES.TIMESTAMP_WITH_TZ]: 'default_value_current_date_time',
  [DB_TYPES.TIMESTAMP_WITHOUT_TZ]: 'default_value_current_date_time',
};

/**
 * Whether the column's default can be viewed and changed from the inspector.
 * Dynamic defaults can't, except for the current date and/or time on date/time
 * columns, which the inspector knows how to set.
 */
export function canSetDefaultValue(column: ProcessedColumn): boolean {
  // The trigger of an "Updated At" column overrides any default
  if (column.column.updated_at_trigger) return false;
  if (!column.column.default?.is_dynamic) return true;
  return (
    column.column.type in currentTimeLabels &&
    isCurrentTimeDefault(column.column.default)
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

  const currentTimeLabel = currentTimeLabels[column.column.type];
  if (currentTimeLabel) {
    const initialMode = (() => {
      if (initialIsDefaultNull) return 'none';
      if (isCurrentTimeDefault(column.column.default)) return 'current_time';
      return 'custom';
    })();
    return {
      availableModes: ['none', 'current_time', 'custom'],
      initialMode,
      customValueLabel: 'custom_default',
      currentTimeLabel,
      currentTimeExpression: currentTimeDefaultExpressions[column.column.type],
    };
  }

  // For non-user types, use the standard options
  return {
    availableModes: ['none', 'custom'],
    initialMode: initialIsDefaultNull ? 'none' : 'custom',
    customValueLabel: 'custom_default',
  };
}
