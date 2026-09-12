import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';

import {
  type ColumnMetadata,
  defaultColumnMetadata,
  getMetadataValue,
} from '@mathesar/api/rpc/_common/columnDisplayOptions';
import type {
  ColumnCreationSpec,
  ColumnTypeOptions,
  RawColumnWithMetadata,
} from '@mathesar/api/rpc/columns';
import type { DbType } from '@mathesar/AppTypes';
import {
  iconUiTypeArray,
  iconUiTypeComposite,
  iconUiTypeJsonArray,
  iconUiTypeJsonObject,
  iconUiTypeXml,
} from '@mathesar/icons';
import { getDefaultFileStorageBackend } from '@mathesar/utils/preloadData';

import { abstractTypeCategory } from './constants';
import {
  currentTimeDefaultExpressions,
  isCurrentTimeDefault,
} from './currentTimeDefaults';
import { DB_TYPES } from './dbTypes';
import Binary from './type-configs/binary';
import Boolean from './type-configs/boolean';
import CreatedAt from './type-configs/createdAt';
import DatabaseTable from './type-configs/databaseTable';
import Date from './type-configs/date';
import DateTime from './type-configs/datetime';
import Duration from './type-configs/duration';
import Email from './type-configs/email';
import Enum from './type-configs/enum';
import Fallback from './type-configs/fallback';
// eslint-disable-next-line import/no-cycle
import File from './type-configs/file/file';
import Geometry from './type-configs/geometry';
import Json from './type-configs/json';
import Money from './type-configs/money';
import Network from './type-configs/network';
import Number, { canHoldUnixTime } from './type-configs/number';
import { plainType } from './type-configs/plain';
import { numberRangeType, timeRangeType } from './type-configs/range';
import Text from './type-configs/text';
import Time from './type-configs/time';
import UpdatedAt from './type-configs/updatedAt';
import Uri from './type-configs/uri';
import Uuid from './type-configs/uuid';
import { typeCastMap } from './typeCastMap';
import type {
  AbstractType,
  AbstractTypeCategoryIdentifier,
  AbstractTypeConfigForm,
  AbstractTypeConfigurationFactory,
  AbstractTypeConfigurationPartialMap,
  AbstractTypeResponse,
  AbstractTypesMap,
} from './types';

const unknownAbstractType: AbstractType = {
  name: 'Other',
  identifier: 'other',
  ...Fallback,
  dbTypes: new Set([]),
};

/**
 * This is meant to be serializable and replaced by an API
 * at a later point
 */
const simpleAbstractTypeCategories: AbstractTypeConfigurationPartialMap = {
  [abstractTypeCategory.Text]: Text,
  [abstractTypeCategory.Money]: Money,
  [abstractTypeCategory.Email]: Email,
  [abstractTypeCategory.Number]: Number,
  [abstractTypeCategory.Boolean]: Boolean,
  [abstractTypeCategory.Uri]: Uri,
  [abstractTypeCategory.Duration]: Duration,
  [abstractTypeCategory.Date]: Date,
  [abstractTypeCategory.Time]: Time,
  [abstractTypeCategory.DateTime]: DateTime,
  [abstractTypeCategory.Uuid]: Uuid,
  [abstractTypeCategory.Json]: Json,
  [abstractTypeCategory.File]: File,
  [abstractTypeCategory.Enum]: Enum,
  [abstractTypeCategory.Binary]: Binary,
  [abstractTypeCategory.Network]: Network,
  [abstractTypeCategory.Geometry]: Geometry,
  [abstractTypeCategory.Xml]: plainType(iconUiTypeXml, 'XML', DB_TYPES.XML),
  [abstractTypeCategory.Composite]: {
    getIcon: () => ({ ...iconUiTypeComposite, label: 'Composite' }),
    cellInfo: { type: 'composite' },
  },
  [abstractTypeCategory.DatabaseTable]: DatabaseTable,
  [abstractTypeCategory.NumberRange]: numberRangeType,
  [abstractTypeCategory.TimeRange]: timeRangeType,
};

/** Arrays are shown and edited as their values separated by a delimiter */
const getArrayDisplayForm = (): AbstractTypeConfigForm => ({
  variables: {
    delimiter: {
      type: 'string',
      default: defaultColumnMetadata.array_delimiter,
      validation: { checks: ['isEmpty'] },
    },
  },
  layout: {
    orientation: 'vertical',
    elements: [
      {
        type: 'input',
        variable: 'delimiter',
        label: get(_)('delimiter'),
        text: { help: get(_)('array_delimiter_help') },
      },
    ],
  },
});

export const arrayFactory: AbstractTypeConfigurationFactory = () => ({
  getDisplayConfig: () => ({
    form: getArrayDisplayForm(),
    determineDisplayOptions: (formValues) => ({
      array_delimiter:
        String(formValues.delimiter ?? '').slice(0, 1) ||
        defaultColumnMetadata.array_delimiter,
    }),
    constructDisplayFormValuesFromDisplayOptions: (metadata) => ({
      delimiter: getMetadataValue(metadata ?? {}, 'array_delimiter'),
    }),
  }),
  getIcon: (args) => {
    const arrayIcon = { ...iconUiTypeArray, label: 'Array' };
    const itemType = args?.typeOptions?.item_type ?? undefined;
    if (!itemType) return arrayIcon;
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const innerAbstractType = getAbstractTypeForDbType(
      itemType,
      args?.metadata ?? null,
    );
    const innerIcon = innerAbstractType.getIcon();
    const innerIcons = Array.isArray(innerIcon) ? innerIcon : [innerIcon];
    return [arrayIcon, ...innerIcons];
  },
  cellInfo: {
    type: 'array',
  },
});

const jsonArrayFactory: AbstractTypeConfigurationFactory = () => ({
  getIcon: () => iconUiTypeJsonArray,
  defaultDbType: 'mathesar_types.mathesar_json_array',
  cellInfo: {
    type: 'string',
  },
});

const jsonObjectFactory: AbstractTypeConfigurationFactory = () => ({
  getIcon: () => iconUiTypeJsonObject,
  defaultDbType: 'mathesar_types.mathesar_json_object',
  cellInfo: {
    type: 'string',
  },
});

const comboAbstractTypeCategories: Partial<
  Record<AbstractTypeCategoryIdentifier, AbstractTypeConfigurationFactory>
> = {
  [abstractTypeCategory.Array]: arrayFactory,
  [abstractTypeCategory.JsonArray]: jsonArrayFactory,
  [abstractTypeCategory.JsonObject]: jsonObjectFactory,
};

function constructAbstractTypeMapFromResponse(
  abstractTypesResponse: AbstractTypeResponse[],
): AbstractTypesMap {
  const simpleAbstractTypesMap: Map<AbstractType['identifier'], AbstractType> =
    new Map();
  const complexAbstractTypeFactories: (Pick<
    AbstractType,
    'identifier' | 'name' | 'dbTypes'
  > & { factory: AbstractTypeConfigurationFactory })[] = [];

  abstractTypesResponse.forEach((entry) => {
    const partialAbstractType = {
      identifier: entry.identifier,
      name: entry.name,
      dbTypes: new Set(entry.db_types),
    };

    const simpleAbstractTypeCategory =
      simpleAbstractTypeCategories[entry.identifier];
    if (simpleAbstractTypeCategory) {
      simpleAbstractTypesMap.set(entry.identifier, {
        ...partialAbstractType,
        ...simpleAbstractTypeCategory,
      });
      return;
    }

    const complexAbstractTypeFactory =
      comboAbstractTypeCategories[entry.identifier];
    if (complexAbstractTypeFactory) {
      complexAbstractTypeFactories.push({
        ...partialAbstractType,
        factory: complexAbstractTypeFactory,
      });
      return;
    }

    simpleAbstractTypesMap.set(entry.identifier, {
      ...partialAbstractType,
      ...Fallback,
    });
  });

  const result: AbstractTypesMap = new Map(simpleAbstractTypesMap);

  complexAbstractTypeFactories.forEach((entry) => {
    result.set(entry.identifier, {
      identifier: entry.identifier,
      name: entry.name,
      dbTypes: entry.dbTypes,
      ...entry.factory(),
    });
  });
  return result;
}

/**
 * This is called "Response" because we originally designed the types
 * architecture to be client-server oriented. But later we decided to hard-code
 * this data in the front end.
 */
const typesResponse: AbstractTypeResponse[] = [
  {
    identifier: 'boolean',
    name: 'Boolean',
    db_types: [DB_TYPES.BOOLEAN],
  },
  {
    identifier: 'date',
    name: 'Date',
    db_types: [DB_TYPES.DATE],
  },
  {
    identifier: 'time',
    name: 'Time of Day',
    db_types: [DB_TYPES.TIME_WITH_TZ, DB_TYPES.TIME_WITHOUT_TZ],
  },
  {
    identifier: 'datetime',
    name: 'Date & Time',
    db_types: [DB_TYPES.TIMESTAMP_WITH_TZ, DB_TYPES.TIMESTAMP_WITHOUT_TZ],
  },
  {
    identifier: 'duration',
    name: 'Duration',
    db_types: [DB_TYPES.INTERVAL],
  },
  {
    identifier: 'email',
    name: 'Email',
    db_types: [DB_TYPES.MSAR__EMAIL],
  },
  {
    identifier: 'enum',
    name: 'Choice',
    db_types: [DB_TYPES.ENUM],
  },
  {
    identifier: 'money',
    name: 'Money',
    db_types: [
      DB_TYPES.MONEY,
      DB_TYPES.MSAR__MATHESAR_MONEY,
      DB_TYPES.MSAR__MULTICURRENCY_MONEY,
      // Where money is stored now. The others are still read, for columns that
      // predate this or were made outside Mathesar.
      DB_TYPES.NUMERIC,
    ],
  },
  {
    identifier: 'number',
    name: 'Number',
    db_types: [
      DB_TYPES.DOUBLE_PRECISION,
      DB_TYPES.REAL,
      DB_TYPES.SMALLINT,
      DB_TYPES.BIGINT,
      DB_TYPES.INTEGER,
      DB_TYPES.NUMERIC,
    ],
  },
  {
    identifier: 'text',
    name: 'Text',
    db_types: [
      DB_TYPES.CHAR,
      DB_TYPES.CHARACTER_VARYING,
      DB_TYPES.CHARACTER,
      DB_TYPES.NAME,
      DB_TYPES.TEXT,
    ],
  },
  {
    identifier: 'uri',
    name: 'URI',
    db_types: [DB_TYPES.MSAR__URI],
  },
  {
    identifier: 'uuid',
    name: 'UUID',
    db_types: [DB_TYPES.UUID],
  },
  {
    identifier: 'jsonlist',
    name: 'JSON List',
    db_types: [DB_TYPES.MSAR__MATHESAR_JSON_ARRAY],
  },
  {
    identifier: 'map',
    name: 'Map',
    db_types: [DB_TYPES.MSAR__MATHESAR_JSON_OBJECT],
  },
  {
    identifier: 'json',
    name: 'JSON',
    db_types: [DB_TYPES.JSON, DB_TYPES.JSONB],
  },
  {
    identifier: 'array',
    name: 'Array',
    db_types: [DB_TYPES.ARRAY],
  },
  {
    identifier: abstractTypeCategory.Binary,
    name: 'Binary',
    db_types: [DB_TYPES.BYTEA, DB_TYPES.BIT, DB_TYPES.BIT_VARYING],
  },
  {
    identifier: abstractTypeCategory.Network,
    name: 'IP',
    db_types: [
      DB_TYPES.INET,
      DB_TYPES.CIDR,
      DB_TYPES.MACADDR,
      DB_TYPES.MACADDR8,
    ],
  },
  {
    identifier: abstractTypeCategory.Geometry,
    name: '2D',
    db_types: [
      DB_TYPES.POINT,
      DB_TYPES.LINE,
      DB_TYPES.LSEG,
      DB_TYPES.BOX,
      DB_TYPES.PATH,
      DB_TYPES.POLYGON,
      DB_TYPES.CIRCLE,
    ],
  },
  {
    identifier: abstractTypeCategory.Xml,
    name: 'XML',
    db_types: [DB_TYPES.XML],
  },
  {
    identifier: abstractTypeCategory.Composite,
    name: 'Composite',
    db_types: [DB_TYPES.COMPOSITE],
  },
  {
    identifier: abstractTypeCategory.DatabaseTable,
    name: 'Database Table',
    db_types: [DB_TYPES.REGCLASS],
  },
  {
    identifier: abstractTypeCategory.NumberRange,
    name: 'Number Range',
    db_types: [
      DB_TYPES.NUMRANGE,
      DB_TYPES.INT4RANGE,
      DB_TYPES.INT8RANGE,
      DB_TYPES.NUMMULTIRANGE,
      DB_TYPES.INT4MULTIRANGE,
      DB_TYPES.INT8MULTIRANGE,
    ],
  },
  {
    identifier: abstractTypeCategory.TimeRange,
    name: 'Time Range',
    db_types: [
      DB_TYPES.TSTZRANGE,
      DB_TYPES.TSRANGE,
      DB_TYPES.DATERANGE,
      DB_TYPES.TSTZMULTIRANGE,
      DB_TYPES.TSMULTIRANGE,
      DB_TYPES.DATEMULTIRANGE,
    ],
  },
];

const fileAbstractType: AbstractType = {
  identifier: 'file',
  name: 'File',
  dbTypes: new Set([DB_TYPES.MSAR__FILE]),
  ...File,
};

const createdAtAbstractType: AbstractType = {
  identifier: abstractTypeCategory.CreatedAt,
  name: 'Created At',
  dbTypes: new Set([DB_TYPES.TIMESTAMP_WITH_TZ, DB_TYPES.TIMESTAMP_WITHOUT_TZ]),
  ...CreatedAt,
};

const updatedAtAbstractType: AbstractType = {
  identifier: abstractTypeCategory.UpdatedAt,
  name: 'Updated At',
  dbTypes: new Set([DB_TYPES.TIMESTAMP_WITH_TZ, DB_TYPES.TIMESTAMP_WITHOUT_TZ]),
  ...UpdatedAt,
};

/**
 * What the database fills in for a column, which is how the "Created At" and
 * "Updated At" types are recognised.
 */
export type ColumnAutoFillInfo = Partial<
  Pick<RawColumnWithMetadata, 'default' | 'updated_at_trigger'>
>;

const abstractTypesMap = constructAbstractTypeMapFromResponse(typesResponse);

export const defaultAbstractType = (() => {
  const textType = abstractTypesMap.get('text');
  if (!textType) {
    throw new Error('Text UI type not found. This should never happen');
  }
  return textType;
})();

export function isFileTypeSupported() {
  return !!getDefaultFileStorageBackend();
}

function identifyAutoFilledAbstractType(
  dbType: DbType,
  autoFill: ColumnAutoFillInfo | undefined,
): AbstractType | undefined {
  if (!createdAtAbstractType.dbTypes.has(dbType)) {
    return undefined;
  }
  if (autoFill?.updated_at_trigger) {
    return updatedAtAbstractType;
  }
  if (isCurrentTimeDefault(autoFill?.default)) {
    return createdAtAbstractType;
  }
  return undefined;
}

/**
 * Whether a column holds money, which is a plain `numeric` carrying a currency
 * symbol rather than a type of its own.
 *
 * The symbol is what says so. Money has no predicate a constraint could check —
 * any number is a valid amount — so unlike a text box there is nothing in the
 * database to read it from, and the metadata has to carry it. The presence of
 * the key is the signal, not its value: a column whose currency symbol has been
 * emptied is still money.
 */
function isMoneyColumn(dbType: DbType, metadata: ColumnMetadata | null) {
  return dbType === DB_TYPES.NUMERIC && metadata?.mon_currency_symbol != null;
}

function identifyAbstractTypeForDbType(
  dbType: DbType,
  metadata: ColumnMetadata | null,
  autoFill?: ColumnAutoFillInfo,
): AbstractType | undefined {
  if (fileAbstractType.dbTypes.has(dbType)) {
    return fileAbstractType;
  }
  if (isMoneyColumn(dbType, metadata)) {
    // `mathesar_types.mathesar_money` is still recognised by the map below, for
    // any column that predates this or was made outside Mathesar.
    const money = abstractTypesMap.get(abstractTypeCategory.Money);
    if (money) return money;
  }
  const autoFilledAbstractType = identifyAutoFilledAbstractType(
    dbType,
    autoFill,
  );
  if (autoFilledAbstractType) {
    return autoFilledAbstractType;
  }
  let abstractTypeOfDbType;
  for (const [, abstractType] of abstractTypesMap) {
    // A numeric column is money only when its metadata says so, which was
    // settled above: left to this loop it would claim every numeric column.
    if (
      abstractType.identifier === abstractTypeCategory.Money &&
      dbType === DB_TYPES.NUMERIC
    ) {
      continue;
    }
    if (abstractType.dbTypes.has(dbType)) {
      abstractTypeOfDbType = abstractType;
      break;
    }
  }
  return abstractTypeOfDbType;
}

function identifyAllPossibleAbstractTypesForDbType(
  dbType: DbType,
): Set<AbstractType> {
  const allPossibleAbstractTypes: Set<AbstractType> = new Set();
  if (fileAbstractType.dbTypes.has(dbType)) {
    allPossibleAbstractTypes.add(fileAbstractType);
  }
  if (createdAtAbstractType.dbTypes.has(dbType)) {
    allPossibleAbstractTypes.add(createdAtAbstractType);
    allPossibleAbstractTypes.add(updatedAtAbstractType);
  }
  // Money lives on `numeric`, so a numeric column can become one or stop being
  // one without its type changing at all.
  if (dbType === DB_TYPES.NUMERIC) {
    const money = abstractTypesMap.get(abstractTypeCategory.Money);
    if (money) allPossibleAbstractTypes.add(money);
  }
  for (const [, abstractType] of abstractTypesMap) {
    if (abstractType.dbTypes.has(dbType)) {
      allPossibleAbstractTypes.add(abstractType);
    }
  }
  return allPossibleAbstractTypes;
}

/**
 * Pass what the database fills in for the column where known: the "Created
 * At" and "Updated At" types are recognised by it, and without it such columns
 * are taken to be Date & Time ones.
 */
export function getAbstractTypeForDbType(
  dbType: DbType,
  metadata: ColumnMetadata | null,
  autoFill?: ColumnAutoFillInfo,
): AbstractType {
  let abstractTypeOfDbType = identifyAbstractTypeForDbType(
    dbType,
    metadata,
    autoFill,
  );
  if (!abstractTypeOfDbType) {
    abstractTypeOfDbType = unknownAbstractType;
  }
  return abstractTypeOfDbType;
}

export function getAllowedAbstractTypesForDbTypeAndItsTargetTypes(
  dbType: DbType,
  metadata: ColumnMetadata | null,
  autoFill?: ColumnAutoFillInfo,
): AbstractType[] {
  const abstractTypeSet: Set<AbstractType> = new Set();

  const abstractTypeOfDbType = identifyAbstractTypeForDbType(
    dbType,
    metadata,
    autoFill,
  );
  if (abstractTypeOfDbType) {
    abstractTypeSet.add(abstractTypeOfDbType);
  }

  const targetDbTypes = typeCastMap[dbType] ?? [];
  targetDbTypes.forEach((targetDbType) => {
    const abstractTypes =
      identifyAllPossibleAbstractTypesForDbType(targetDbType);
    [...abstractTypes].forEach((absType) => abstractTypeSet.add(absType));
  });
  const abstractTypeList = [...abstractTypeSet].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  if (!abstractTypeOfDbType) {
    abstractTypeList.push(unknownAbstractType);
  }
  return abstractTypeList;
}

type AutoFillSpec = Pick<
  ColumnCreationSpec,
  'default' | 'updated_at_trigger' | 'nullable'
>;

export function isAutoFilledAbstractType(abstractType: AbstractType) {
  return (
    abstractType.identifier === abstractTypeCategory.CreatedAt ||
    abstractType.identifier === abstractTypeCategory.UpdatedAt
  );
}

/**
 * What a new column needs in order to be of the given abstract type: "Created
 * At" defaults to the current time, "Updated At" has a trigger, and a boolean
 * is false rather than null until someone says otherwise — a checkbox that is
 * neither checked nor unchecked is rarely what's wanted, and it's easier to
 * allow nulls later than to remove them from a column already holding some.
 *
 * This applies when creating a column, not when changing an existing one to
 * the type: see `getAutoFillChangesForTypeChange`.
 */
function getAutoFillSpecForAbstractType(
  abstractType: AbstractType,
  dbType: DbType,
): AutoFillSpec {
  if (abstractType.identifier === abstractTypeCategory.UpdatedAt) {
    return { updated_at_trigger: true };
  }
  if (abstractType.identifier === abstractTypeCategory.Boolean) {
    return { nullable: false, default: { is_dynamic: false, value: 'false' } };
  }
  const expression = currentTimeDefaultExpressions[dbType];
  if (
    abstractType.identifier === abstractTypeCategory.CreatedAt &&
    expression
  ) {
    return { default: { is_dynamic: true, value: expression } };
  }
  return {};
}

/**
 * The changes to a column's default and trigger that changing its abstract
 * type needs, if any: setting up "Created At" or "Updated At" when changing to
 * them, and undoing that when changing away. Keys left out are left alone.
 */
export function getAutoFillChangesForTypeChange(
  from: { abstractType: AbstractType; dbType: DbType },
  to: { abstractType: AbstractType; dbType: DbType },
): {
  default?: ColumnCreationSpec['default'] | null;
  updated_at_trigger?: boolean;
} {
  const isFrom = (identifier: string) =>
    from.abstractType.identifier === identifier;
  const isTo = (identifier: string) =>
    to.abstractType.identifier === identifier;
  const createdAt = abstractTypeCategory.CreatedAt;
  const updatedAt = abstractTypeCategory.UpdatedAt;
  return {
    ...(isFrom(createdAt) && !isTo(createdAt) ? { default: null } : {}),
    ...(isTo(createdAt) && (!isFrom(createdAt) || from.dbType !== to.dbType)
      ? getAutoFillSpecForAbstractType(to.abstractType, to.dbType)
      : {}),
    ...(isFrom(updatedAt) && !isTo(updatedAt)
      ? { updated_at_trigger: false }
      : {}),
    ...(isTo(updatedAt) && !isFrom(updatedAt)
      ? { updated_at_trigger: true }
      : {}),
  };
}

/** The DB type a new column of the abstract type gets, if it has one */
export function getDefaultDbType(
  abstractType: AbstractType,
): DbType | undefined {
  return abstractType.defaultDbType ?? [...abstractType.dbTypes][0];
}

/**
 * Whether Mathesar can change a column of the one DB type to the other.
 */
export function canCastDbType(from: DbType, to: DbType): boolean {
  return from === to || (typeCastMap[from] ?? []).includes(to);
}

export function abstractTypeToColumnSaveSpec(
  abstractType: AbstractType,
  type: DbType = getDefaultDbType(abstractType) ?? DB_TYPES.TEXT,
): {
  dbOptions: {
    type: DbType;
    typeOptions: ColumnTypeOptions;
  } & AutoFillSpec;
  metadata: ColumnMetadata | null;
} {
  const metadata: ColumnMetadata | null = (() => {
    if (abstractType.identifier === 'file') {
      return {
        file_backend: getDefaultFileStorageBackend()?.backend,
      };
    }
    // Without the symbol the column would just be a number, there being nothing
    // else to tell it apart from one.
    if (abstractType.identifier === abstractTypeCategory.Money) {
      return { mon_currency_symbol: defaultColumnMetadata.mon_currency_symbol };
    }
    return null;
  })();

  return {
    dbOptions: {
      type,
      typeOptions: {},
      ...getAutoFillSpecForAbstractType(abstractType, type),
    },
    metadata,
  };
}

export function mergeMetadataOnTypeChange(
  newAbstractType: AbstractType,
  metadata: ColumnMetadata | null,
  newDbType?: DbType,
) {
  let result = metadata ?? {};

  // Handle file type metadata
  if (newAbstractType.identifier === 'file') {
    result = {
      ...result,
      file_backend: getDefaultFileStorageBackend()?.backend,
    };
  } else if (metadata && metadata.file_backend) {
    result = {
      ...result,
      file_backend: null,
    };
  }

  // Only array columns have a delimiter between their values
  if (
    newAbstractType.identifier !== abstractTypeCategory.Array &&
    metadata?.array_delimiter != null
  ) {
    result = {
      ...result,
      array_delimiter: null,
    };
  }

  // Only UUID columns can hold users
  if (
    newAbstractType.identifier !== abstractTypeCategory.Uuid &&
    metadata?.user_display_field != null
  ) {
    result = {
      ...result,
      user_display_field: null,
    };
  }

  // Only a whole number counts from the Unix epoch. Without this, a column
  // changed from Integer to Decimal would go on being shown as a date with no
  // way left to say otherwise: the option is only offered where it applies.
  if (
    metadata?.num_unix_time != null &&
    !(
      newAbstractType.identifier === abstractTypeCategory.Number &&
      (newDbType === undefined || canHoldUnixTime(newDbType))
    )
  ) {
    result = {
      ...result,
      num_unix_time: null,
    };
  }

  // Only an instant is shown as a tick, and only one the user keeps themselves:
  // a Created At or Updated At column always has one, so there is nothing for a
  // tick to say. Without this, a column changed away from Date & Time would go
  // on being drawn as a checkbox with no way left to say otherwise.
  if (
    metadata?.time_checkbox &&
    newAbstractType.identifier !== abstractTypeCategory.DateTime
  ) {
    result = {
      ...result,
      time_checkbox: false,
    };
  }

  // The currency symbol is what makes a number money, so changing to or from
  // Money is a change of metadata rather than of type.
  if (newAbstractType.identifier === abstractTypeCategory.Money) {
    if (metadata?.mon_currency_symbol == null) {
      result = {
        ...result,
        mon_currency_symbol: defaultColumnMetadata.mon_currency_symbol,
      };
    }
  } else if (metadata?.mon_currency_symbol != null) {
    result = {
      ...result,
      mon_currency_symbol: null,
    };
  }

  return result;
}

export function getAllowedAbstractTypesForNewColumn() {
  // Arrays are made by choosing to hold arrays of another type's values
  const typesDisallowedForNewColumnCreation = new Set<string>([
    abstractTypeCategory.JsonArray,
    abstractTypeCategory.JsonObject,
    abstractTypeCategory.Enum,
  ]);

  return [
    ...abstractTypesMap.values(),
    fileAbstractType,
    createdAtAbstractType,
    updatedAtAbstractType,
  ]
    .filter((type) => !typesDisallowedForNewColumnCreation.has(type.identifier))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getDbTypesForAbstractType(
  abstractTypeIdentifier: AbstractType['identifier'],
): Set<DbType> {
  if (abstractTypeIdentifier === 'file') {
    return fileAbstractType.dbTypes;
  }
  if (abstractTypeIdentifier === abstractTypeCategory.CreatedAt) {
    return createdAtAbstractType.dbTypes;
  }
  if (abstractTypeIdentifier === abstractTypeCategory.UpdatedAt) {
    return updatedAtAbstractType.dbTypes;
  }
  return abstractTypesMap.get(abstractTypeIdentifier)?.dbTypes ?? new Set();
}

export function isAbstractTypeDisabled(type: AbstractType) {
  if (type.getEnabledState) {
    return !type.getEnabledState().enabled;
  }
  return false;
}
