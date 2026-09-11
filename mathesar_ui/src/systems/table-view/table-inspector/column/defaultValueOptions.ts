import {
  currentTimeDefaultExpressions,
  isCurrentTimeDefault,
} from '@mathesar/stores/abstract-types/currentTimeDefaults';
import { isCurrentUserDefault } from '@mathesar/stores/abstract-types/currentUserDefault';
import { DB_TYPES } from '@mathesar/stores/abstract-types/dbTypes';
import { isUserColumn } from '@mathesar/stores/abstract-types/type-configs/uuid';
import type { ProcessedColumn } from '@mathesar/stores/table-data';

export type DefaultValueMode =
  | 'none'
  | 'set_default_user'
  /** The user who creates the record ("Created By") */
  | 'current_user'
  /** The user who last changes the record ("Updated By"), kept by a trigger */
  | 'last_editor'
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
 * Whether a UUID column is offered the ways of filling in users: when it holds
 * users, or when it's still filled in by one of them (so that it can be undone).
 */
function isUserOfColumn(column: ProcessedColumn): boolean {
  return (
    column.column.type === DB_TYPES.UUID &&
    (isUserColumn(column.column.metadata) ||
      !!column.column.updated_at_trigger ||
      isCurrentUserDefault(column.column.default))
  );
}

/**
 * Whether the column's default can be viewed and changed from the inspector.
 * Dynamic defaults can't, except for the current date and/or time on date/time
 * columns, which the inspector knows how to set.
 */
export function canSetDefaultValue(column: ProcessedColumn): boolean {
  // Users are filled in by these options, including by a trigger
  if (isUserOfColumn(column)) return true;
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

  if (isUserOfColumn(column)) {
    const initialMode = (() => {
      if (column.column.updated_at_trigger) return 'last_editor';
      if (isCurrentUserDefault(column.column.default)) return 'current_user';
      if (initialIsDefaultNull) return 'none';
      return 'set_default_user';
    })();
    return {
      availableModes: [
        'none',
        'set_default_user',
        'current_user',
        'last_editor',
      ],
      initialMode,
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
