import type {
  ColumnMetadata,
  DateFormat,
  NumberFormat,
  NumberGrouping,
  TimeFormat,
} from '@mathesar/api/rpc/_common/columnDisplayOptions';
import {
  type RawColumnWithMetadata,
  getColumnMetadataValue,
} from '@mathesar/api/rpc/columns';
import type { DbType } from '@mathesar/AppTypes';
import { iconUiTypeDateTime, iconUiTypeNumber } from '@mathesar/icons';
import type { UnixTimeUnit } from '@mathesar/utils/date-time/types';
import type { FormValues } from '@mathesar-component-library/types';

import { DB_TYPES } from '../dbTypes';
import type {
  AbstractTypeConfigForm,
  AbstractTypeConfiguration,
  AbstractTypeDbConfig,
  AbstractTypeDisplayConfig,
} from '../types';

import { getDateFormatOptions, getTimeFormatOptions } from './utils';

type NumberType = 'Integer' | 'Decimal' | 'Float';

const numberTypeElements: Record<
  NumberType,
  AbstractTypeConfigForm['layout']['elements']
> = {
  Integer: [
    {
      type: 'input',
      variable: 'integerDataSize',
      label: 'Integer Data Size',
      interfaceType: 'select',
      options: {
        default: { label: 'Default (4 bytes)' },
        bigInt: { label: 'Big Integer (8 bytes)' },
        smallInt: { label: 'Small Integer (2 bytes)' },
      },
    },
  ],
  Decimal: [
    {
      type: 'layout',
      orientation: 'horizontal',
      elements: [
        {
          type: 'input',
          variable: 'decimalPlaces',
          label: 'Decimal Places',
        },
        {
          type: 'input',
          variable: 'maxDigits',
          label: 'Max Digits',
        },
      ],
    },
  ],
  Float: [
    {
      type: 'input',
      variable: 'floatingPointType',
      label: 'Floating Point Type',
      interfaceType: 'select',
      options: {
        real: { label: 'Real (6 digits)' },
        doublePrecision: {
          label: 'Double Precision (15 digits)',
        },
      },
    },
  ],
};

function determineDbType(dbFormValues: FormValues, columnType: DbType): DbType {
  switch (dbFormValues.numberType) {
    case 'Integer':
      switch (dbFormValues.integerDataSize) {
        case 'smallInt':
          return DB_TYPES.SMALLINT;
        case 'bigInt':
          return DB_TYPES.BIGINT;
        default:
          return DB_TYPES.INTEGER;
      }
    case 'Float':
      switch (dbFormValues.floatingPointType) {
        case 'real':
          return DB_TYPES.REAL;
        case 'doublePrecision':
        default:
          return DB_TYPES.DOUBLE_PRECISION;
      }
    case 'Decimal':
    default:
      return columnType === DB_TYPES.DECIMAL
        ? DB_TYPES.DECIMAL
        : DB_TYPES.NUMERIC;
  }
}

function determineDbTypeAndOptions(
  dbFormValues: FormValues,
  columnType: DbType,
): ReturnType<AbstractTypeDbConfig['determineDbTypeAndOptions']> {
  const dbType = determineDbType(dbFormValues, columnType);
  const typeOptions: RawColumnWithMetadata['type_options'] = {};

  if (dbType === DB_TYPES.DECIMAL || dbType === DB_TYPES.NUMERIC) {
    if (dbFormValues.maxDigits !== null) {
      typeOptions.precision = Number(dbFormValues.maxDigits);
    }
    if (dbFormValues.decimalPlaces !== null) {
      typeOptions.scale = Number(dbFormValues.decimalPlaces);
    }
  }

  return {
    dbType,
    typeOptions,
  };
}

function constructDbFormValuesFromTypeOptions(
  columnType: DbType,
  typeOptions: RawColumnWithMetadata['type_options'],
): FormValues {
  switch (columnType) {
    case DB_TYPES.SMALLINT:
      return {
        numberType: 'Integer',
        integerDataSize: 'smallInt',
      };
    case DB_TYPES.BIGINT:
      return {
        numberType: 'Integer',
        integerDataSize: 'bigInt',
      };
    case DB_TYPES.REAL:
      return {
        numberType: 'Float',
        floatingPointType: 'real',
      };
    case DB_TYPES.DOUBLE_PRECISION:
      return {
        numberType: 'Float',
        floatingPointType: 'doublePrecision',
      };
    case DB_TYPES.INTEGER:
      return {
        numberType: 'Integer',
        integerDataSize: 'default',
      };
    case DB_TYPES.DECIMAL:
    case DB_TYPES.NUMERIC:
    default:
      return {
        numberType: 'Decimal',
        maxDigits: (typeOptions?.precision as number) ?? null,
        decimalPlaces: (typeOptions?.scale as number) ?? null,
      };
  }
}

/**
 * The options of a number column of the selected DB type's number type
 * (Integer, Decimal, or Float), which is chosen as the column's kind.
 */
function getNumberDbConfig(
  selectedDbType: DbType = DB_TYPES.NUMERIC,
): AbstractTypeDbConfig {
  const defaults = constructDbFormValuesFromTypeOptions(selectedDbType, {});
  const numberType = defaults.numberType as NumberType;
  return {
    form: {
      variables: {
        integerDataSize: {
          type: 'string',
          enum: ['default', 'bigInt', 'smallInt'],
          default: defaults.integerDataSize ?? 'default',
        },
        decimalPlaces: {
          type: 'integer',
          default: null,
        },
        maxDigits: {
          type: 'integer',
          default: null,
        },
        floatingPointType: {
          type: 'string',
          enum: ['real', 'doublePrecision'],
          default: defaults.floatingPointType ?? 'doublePrecision',
        },
      },
      layout: {
        orientation: 'vertical',
        elements: numberTypeElements[numberType],
      },
    },
    determineDbTypeAndOptions: (dbFormValues, columnType) =>
      determineDbTypeAndOptions({ ...dbFormValues, numberType }, columnType),
    constructDbFormValuesFromTypeOptions,
  };
}

/**
 * The unit a whole number counts from the Unix epoch in, when the column holds
 * Unix times rather than plain numbers, which its metadata says by naming the
 * unit. Null when the column is a plain number.
 */
export function getUnixTimeUnit(
  metadata: ColumnMetadata | null | undefined,
): UnixTimeUnit | null {
  return metadata?.num_unix_time ?? null;
}

export function isUnixTimeColumn(metadata: ColumnMetadata | null | undefined) {
  return getUnixTimeUnit(metadata) !== null;
}

/**
 * The DB types a Unix time can be held in: the whole numbers.
 *
 * A count of seconds with a fraction is a real thing, but the offer is kept to
 * the Integer kind, which is where anyone storing an epoch value puts it, and
 * where "Nanoseconds" is a choice that means something.
 */
const wholeNumberDbTypes: DbType[] = [
  DB_TYPES.SMALLINT,
  DB_TYPES.INTEGER,
  DB_TYPES.BIGINT,
];

export function canHoldUnixTime(dbType: DbType): boolean {
  return wholeNumberDbTypes.includes(dbType);
}

const numberElements: AbstractTypeConfigForm['layout']['elements'] = [
  {
    type: 'input',
    variable: 'decimalPlaces',
    label: 'Decimal Places',
  },
  {
    type: 'input',
    variable: 'useGrouping',
    label: 'Digit Grouping',
    options: {
      auto: { label: 'Auto' },
      always: { label: 'Always' },
      never: { label: 'Never' },
    },
  },
  {
    type: 'input',
    variable: 'numberFormat',
    label: 'Format',
    options: {
      none: { label: 'Use browser locale' },
      english: { label: '1,234,567.89' },
      german: { label: '1.234.567,89' },
      french: { label: '1 234 567,89' },
      hindi: { label: '12,34,567.89' },
      swiss: { label: "1'234'567.89" },
    },
  },
];

const unixTimeElements: AbstractTypeConfigForm['layout']['elements'] = [
  {
    type: 'input',
    variable: 'unixTimeUnit',
    label: 'Counted In',
    options: {
      seconds: { label: 'Seconds' },
      milliseconds: { label: 'Milliseconds' },
      microseconds: { label: 'Microseconds' },
      nanoseconds: { label: 'Nanoseconds' },
    },
  },
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

function getDisplayForm(selectedDbType?: DbType): AbstractTypeConfigForm {
  const variables: AbstractTypeConfigForm['variables'] = {
    showAs: {
      type: 'string',
      enum: ['number', 'unixTime'],
      default: 'number',
    },
    unixTimeUnit: {
      type: 'string',
      enum: ['seconds', 'milliseconds', 'microseconds', 'nanoseconds'],
      default: 'seconds',
    },
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
    decimalPlaces: {
      type: 'integer',
      default: null,
    },
    useGrouping: {
      type: 'string',
      enum: ['auto', 'always', 'never'],
      default: 'auto',
    },
    numberFormat: {
      type: 'string',
      enum: ['none', 'english', 'german', 'french', 'hindi', 'swiss'],
      default: 'none',
    },
  };
  const elements: AbstractTypeConfigForm['layout']['elements'] =
    selectedDbType && canHoldUnixTime(selectedDbType)
      ? [
          {
            type: 'input',
            variable: 'showAs',
            label: 'Show as',
            options: {
              number: { label: 'Number' },
              unixTime: { label: 'Unix Time' },
            },
          },
          {
            type: 'if',
            variable: 'showAs',
            condition: 'eq',
            value: 'unixTime',
            elements: unixTimeElements,
          },
          {
            type: 'if',
            variable: 'showAs',
            condition: 'eq',
            value: 'number',
            elements: numberElements,
          },
        ]
      : numberElements;
  return { variables, layout: { orientation: 'vertical', elements } };
}

function determineDisplayOptions(
  formValues: FormValues,
): RawColumnWithMetadata['metadata'] {
  if (formValues.showAs === 'unixTime') {
    return {
      num_unix_time: (formValues.unixTimeUnit as UnixTimeUnit) ?? 'seconds',
      date_format: formValues.dateFormat as DateFormat,
      time_format: formValues.timeFormat as TimeFormat,
    };
  }
  const decimalPlaces = formValues.decimalPlaces as number | null;
  const opts: Partial<RawColumnWithMetadata['metadata']> = {
    // Null rather than left out: this is what turns a Unix time column back
    // into a plain number one, and the options we send are the options we set.
    num_unix_time: null,
    num_format:
      formValues.numberFormat === 'none'
        ? undefined
        : (formValues.numberFormat as NumberFormat),
    num_grouping:
      (formValues.useGrouping as NumberGrouping | undefined) ?? 'auto',
    num_min_frac_digits: decimalPlaces ?? undefined,
    num_max_frac_digits: decimalPlaces ?? undefined,
  };
  return opts;
}

export function getDecimalPlaces(
  minimumFractionDigits: number | null,
  maximumFractionDigits: number | null,
): number | null {
  if (minimumFractionDigits === null && maximumFractionDigits === null) {
    return null;
  }
  if (minimumFractionDigits === null) {
    return maximumFractionDigits;
  }
  if (maximumFractionDigits === null) {
    return minimumFractionDigits;
  }
  return Math.max(minimumFractionDigits, maximumFractionDigits);
}

function constructDisplayFormValuesFromDisplayOptions(
  metadata: RawColumnWithMetadata['metadata'],
): FormValues {
  const column = { metadata };
  const decimalPlaces = getDecimalPlaces(
    metadata?.num_min_frac_digits ?? null,
    metadata?.num_max_frac_digits ?? null,
  );
  const formValues: FormValues = {
    showAs: isUnixTimeColumn(metadata) ? 'unixTime' : 'number',
    unixTimeUnit: getUnixTimeUnit(metadata) ?? 'seconds',
    dateFormat: getColumnMetadataValue(column, 'date_format'),
    timeFormat: getColumnMetadataValue(column, 'time_format'),
    numberFormat: getColumnMetadataValue(column, 'num_format'),
    useGrouping: getColumnMetadataValue(column, 'num_grouping'),
    decimalPlaces,
  };
  return formValues;
}

const numberType: AbstractTypeConfiguration = {
  getIcon: (args) =>
    isUnixTimeColumn(args?.metadata)
      ? { ...iconUiTypeDateTime, label: 'Unix Time' }
      : { ...iconUiTypeNumber, label: 'Number' },
  cellInfo: {
    type: 'number',
    conditionalConfig: {
      [DB_TYPES.DECIMAL]: { floatAllowanceStrategy: 'scale-based' },
      [DB_TYPES.NUMERIC]: { floatAllowanceStrategy: 'scale-based' },
      [DB_TYPES.INTEGER]: { floatAllowanceStrategy: 'never' },
      [DB_TYPES.SMALLINT]: { floatAllowanceStrategy: 'never' },
      [DB_TYPES.BIGINT]: { floatAllowanceStrategy: 'never' },
      [DB_TYPES.REAL]: { floatAllowanceStrategy: 'always' },
      [DB_TYPES.DOUBLE_PRECISION]: { floatAllowanceStrategy: 'always' },
    },
  },
  defaultDbType: DB_TYPES.NUMERIC,
  getDbConfig: getNumberDbConfig,
  getDisplayConfig: (selectedDbType): AbstractTypeDisplayConfig => ({
    form: getDisplayForm(selectedDbType),
    determineDisplayOptions,
    constructDisplayFormValuesFromDisplayOptions,
  }),
};

export default numberType;
