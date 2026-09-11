import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';

import { iconUiTypeCreatedAt } from '@mathesar/icons';

import { DB_TYPES } from '../dbTypes';
import type { AbstractTypeConfiguration } from '../types';

import DateTime, { getDateTimeDbConfig } from './datetime';

/**
 * A Date & Time column whose default is the current time, so that it records
 * when each record was created. It's recognised by its default rather than by
 * metadata, and supports time zones unless told otherwise.
 */
const createdAtType: AbstractTypeConfiguration = {
  ...DateTime,
  getIcon: () => ({ ...iconUiTypeCreatedAt, label: 'Created At' }),
  defaultDbType: DB_TYPES.TIMESTAMP_WITH_TZ,
  getDbConfig: () => getDateTimeDbConfig(true),
  getHelpInfo: () => get(_)('created_at_type_help'),
};

export default createdAtType;
