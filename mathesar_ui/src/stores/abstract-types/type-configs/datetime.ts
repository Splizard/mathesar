import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';

import type {
  DateFormat,
  TimeFormat,
} from '@mathesar/api/rpc/_common/columnDisplayOptions';
import {
  type RawColumnWithMetadata,
  getColumnMetadataValue,
} from '@mathesar/api/rpc/columns';
import { iconUiTypeDateTime } from '@mathesar/icons';
import type { FormValues } from '@mathesar-component-library/types';

import { DB_TYPES } from '../dbTypes';
import type {
  AbstractTypeConfigForm,
  AbstractTypeConfiguration,
  AbstractTypeDbConfig,
  AbstractTypeDisplayConfig,
} from '../types';

import { getDateFormatOptions, getTimeFormatOptions } from './utils';

const getDbForm = (
  supportTimeZonesByDefault = false,
): AbstractTypeConfigForm => ({
  variables: {
    supportTimeZones: {
      type: 'boolean',
      default: supportTimeZonesByDefault,
    },
  },
  layout: {
    orientation: 'vertical',
    elements: [
      {
        type: 'input',
        variable: 'supportTimeZones',
        label: get(_)('support_time_zones'),
        text: {
          help: get(_)('support_time_zone_helper'),
        },
      },
    ],
  },
});

function determineDbTypeAndOptions(
  dbFormValues: FormValues,
): ReturnType<AbstractTypeDbConfig['determineDbTypeAndOptions']> {
  const dbType = dbFormValues.supportTimeZones
    ? DB_TYPES.TIMESTAMP_WITH_TZ
    : DB_TYPES.TIMESTAMP_WITHOUT_TZ;
  return {
    dbType,
    typeOptions: {},
  };
}

function constructDbFormValuesFromTypeOptions(
  columnType: RawColumnWithMetadata['type'],
): FormValues {
  return {
    supportTimeZones: columnType === DB_TYPES.TIMESTAMP_WITH_TZ,
  };
}

const dateTimeElements: AbstractTypeConfigForm['layout']['elements'] = [
  {
    type: 'input',
    variable: 'dateFormat',
    label: 'Date Format',
    options: getDateFormatOptions(),
  },
  {
    type: 'input',
    variable: 'timeFormat',
    label: 'Time Format',
    options: getTimeFormatOptions(),
  },
];

const dateTimeVariables: AbstractTypeConfigForm['variables'] = {
  dateFormat: {
    type: 'string',
    enum: ['none', 'us', 'eu', 'friendly', 'iso'],
    default: 'none',
  },
  timeFormat: {
    type: 'string',
    enum: ['24hr', '24hrLong', '12hr', '12hrLong'],
    default: '24hr',
  },
};

const displayForm: AbstractTypeConfigForm = {
  variables: {
    showAs: {
      type: 'string',
      enum: ['dateTime', 'checkbox'],
      default: 'dateTime',
    },
    ...dateTimeVariables,
  },
  layout: {
    orientation: 'vertical',
    elements: [
      {
        type: 'input',
        variable: 'showAs',
        label: 'Show as',
        options: {
          dateTime: { label: 'Date & Time' },
          checkbox: { label: 'Checkbox' },
        },
      },
      {
        type: 'if',
        variable: 'showAs',
        condition: 'eq',
        value: 'dateTime',
        elements: dateTimeElements,
      },
    ],
  },
};

function determineDisplayOptions(
  dispFormValues: FormValues,
): RawColumnWithMetadata['metadata'] {
  if (dispFormValues.showAs === 'checkbox') {
    return { time_checkbox: true };
  }
  return {
    // False rather than left out: this is what turns a column of ticks back
    // into one of dates, and the options we send are the options we set.
    time_checkbox: false,
    date_format: dispFormValues.dateFormat as DateFormat,
    time_format: dispFormValues.timeFormat as TimeFormat,
  };
}

function constructDisplayFormValuesFromDisplayOptions(
  metadata: RawColumnWithMetadata['metadata'],
): FormValues {
  const column = { metadata };
  const formValues: FormValues = {
    showAs: getColumnMetadataValue(column, 'time_checkbox')
      ? 'checkbox'
      : 'dateTime',
    dateFormat: getColumnMetadataValue(column, 'date_format'),
    timeFormat: getColumnMetadataValue(column, 'time_format'),
  };
  return formValues;
}

/**
 * The same options without the "Show as". A column that records when a record
 * was made or last changed always holds an instant, so there is nothing for a
 * tick to say about it.
 */
export const dateTimeOnlyDisplayConfig: AbstractTypeDisplayConfig = {
  form: {
    variables: dateTimeVariables,
    layout: { orientation: 'vertical', elements: dateTimeElements },
  },
  determineDisplayOptions,
  constructDisplayFormValuesFromDisplayOptions,
};

export function getDateTimeDbConfig(
  supportTimeZonesByDefault = false,
): AbstractTypeDbConfig {
  return {
    form: getDbForm(supportTimeZonesByDefault),
    determineDbTypeAndOptions,
    constructDbFormValuesFromTypeOptions,
  };
}

const dateTimeType: AbstractTypeConfiguration = {
  getIcon: () => ({ ...iconUiTypeDateTime, label: 'Date & Time' }),
  defaultDbType: DB_TYPES.TIMESTAMP_WITHOUT_TZ,
  cellInfo: {
    type: 'datetime',
    conditionalConfig: {
      [DB_TYPES.TIMESTAMP_WITH_TZ]: {
        supportTimeZone: true,
      },
      [DB_TYPES.TIMESTAMP_WITHOUT_TZ]: {
        supportTimeZone: false,
      },
    },
  },
  getDbConfig: () => getDateTimeDbConfig(),
  getDisplayConfig: () => ({
    form: displayForm,
    determineDisplayOptions,
    constructDisplayFormValuesFromDisplayOptions,
  }),
};

export default dateTimeType;
