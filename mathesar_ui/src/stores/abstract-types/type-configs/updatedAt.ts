import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';

import { iconUiTypeUpdatedAt } from '@mathesar/icons';

import { DB_TYPES } from '../dbTypes';
import type { AbstractTypeConfiguration } from '../types';

import DateTime, {
  dateTimeOnlyDisplayConfig,
  getDateTimeDbConfig,
} from './datetime';

/**
 * A Date & Time column that a trigger keeps at the time its record was last
 * changed. It's recognised by that trigger rather than by metadata, and
 * supports time zones unless told otherwise.
 */
const updatedAtType: AbstractTypeConfiguration = {
  ...DateTime,
  getIcon: () => ({ ...iconUiTypeUpdatedAt, label: 'Updated At' }),
  defaultDbType: DB_TYPES.TIMESTAMP_WITH_TZ,
  getDbConfig: () => getDateTimeDbConfig(true),
  getDisplayConfig: () => dateTimeOnlyDisplayConfig,
  getHelpInfo: () => get(_)('updated_at_type_help'),
};

export default updatedAtType;
