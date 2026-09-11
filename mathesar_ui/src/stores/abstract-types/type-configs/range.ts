import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';

import type { DbType } from '@mathesar/AppTypes';
import { iconUiTypeRange } from '@mathesar/icons';
import type { FormValues } from '@mathesar-component-library/types';

import { DB_TYPES } from '../dbTypes';
import {
  type RangeTypes,
  getRangeTypesOf,
  getRangeTypesOfValues,
  isMultirangeType,
} from '../ranges';
import type {
  AbstractTypeConfigForm,
  AbstractTypeConfiguration,
  AbstractTypeDbConfig,
} from '../types';

type FormElements = AbstractTypeConfigForm['layout']['elements'];

/**
 * The options of a range column, those of the type of its values that choose
 * the type of its ranges, which stay multiranges if they are.
 */
function rangeDbConfig(
  selectedDbType: DbType,
  valueType: DbType,
  options: {
    variables: AbstractTypeConfigForm['variables'];
    elements: FormElements;
    getValueType: (values: FormValues) => DbType;
    getValues: (valueType: DbType) => FormValues;
  },
): AbstractTypeDbConfig {
  const isMultirange = isMultirangeType(selectedDbType);
  return {
    form: {
      variables: options.variables,
      layout: { orientation: 'vertical', elements: options.elements },
    },
    determineDbTypeAndOptions: (values) => {
      const rangeTypes = getRangeTypesOfValues(
        options.getValueType(values),
      ) as RangeTypes;
      return {
        dbType: isMultirange ? rangeTypes.multirange : rangeTypes.range,
        typeOptions: {},
      };
    },
    constructDbFormValuesFromTypeOptions: (type) =>
      options.getValues(getRangeTypesOf(type)?.value ?? valueType),
  };
}

function numberRangeDbConfig(
  selectedDbType: DbType = DB_TYPES.NUMRANGE,
): AbstractTypeDbConfig {
  const valueType = getRangeTypesOf(selectedDbType)?.value ?? DB_TYPES.NUMERIC;
  const isDecimal = valueType === DB_TYPES.NUMERIC;
  const getValues = (type: DbType) => ({
    integerDataSize: type === DB_TYPES.BIGINT ? 'bigInt' : 'default',
  });
  return rangeDbConfig(selectedDbType, valueType, {
    variables: {
      integerDataSize: {
        type: 'string',
        enum: ['default', 'bigInt'],
        default: getValues(valueType).integerDataSize,
      },
    },
    elements: isDecimal
      ? []
      : [
          {
            type: 'input',
            variable: 'integerDataSize',
            label: 'Integer Data Size',
            interfaceType: 'select',
            options: {
              default: { label: 'Default (4 bytes)' },
              bigInt: { label: 'Big Integer (8 bytes)' },
            },
          },
        ],
    getValueType: (values) => {
      if (isDecimal) return DB_TYPES.NUMERIC;
      return values.integerDataSize === 'bigInt'
        ? DB_TYPES.BIGINT
        : DB_TYPES.INTEGER;
    },
    getValues,
  });
}

function timeRangeDbConfig(
  selectedDbType: DbType = DB_TYPES.TSTZRANGE,
): AbstractTypeDbConfig {
  const valueType =
    getRangeTypesOf(selectedDbType)?.value ?? DB_TYPES.TIMESTAMP_WITH_TZ;
  const isDate = valueType === DB_TYPES.DATE;
  const getValues = (type: DbType) => ({
    supportTimeZones: type === DB_TYPES.TIMESTAMP_WITH_TZ,
  });
  return rangeDbConfig(selectedDbType, valueType, {
    variables: {
      supportTimeZones: {
        type: 'boolean',
        default: getValues(valueType).supportTimeZones,
      },
    },
    elements: isDate
      ? []
      : [
          {
            type: 'input',
            variable: 'supportTimeZones',
            label: get(_)('support_time_zones'),
            text: { help: get(_)('support_time_zone_helper') },
          },
        ],
    getValueType: (values) => {
      if (isDate) return DB_TYPES.DATE;
      return values.supportTimeZones
        ? DB_TYPES.TIMESTAMP_WITH_TZ
        : DB_TYPES.TIMESTAMP_WITHOUT_TZ;
    },
    getValues,
  });
}

function rangeType(
  label: string,
  defaultDbType: DbType,
  getDbConfig: (selectedDbType?: DbType) => AbstractTypeDbConfig,
): AbstractTypeConfiguration {
  return {
    getIcon: () => ({ ...iconUiTypeRange, label }),
    defaultDbType,
    cellInfo: {
      type: 'string',
    },
    getDbConfig,
  };
}

export const numberRangeType = rangeType(
  'Number Range',
  DB_TYPES.NUMRANGE,
  numberRangeDbConfig,
);

export const timeRangeType = rangeType(
  'Time Range',
  DB_TYPES.TSTZRANGE,
  timeRangeDbConfig,
);
