import type { DbType } from '@mathesar/AppTypes';
import {
  iconFile,
  iconUiTypeBinary,
  iconUiTypeBoolean,
  iconUiTypeComposite,
  iconUiTypeDatabaseTable,
  iconUiTypeDateTime,
  iconUiTypeEnum,
  iconUiTypeGeometry,
  iconUiTypeJson,
  iconUiTypeNetwork,
  iconUiTypeNumber,
  iconUiTypeText,
  iconUiTypeUnknown,
  iconUiTypeUuid,
  iconUiTypeXml,
} from '@mathesar/icons';
import type { IconProps } from '@mathesar-component-library/types';

import {
  abstractTypeToColumnSaveSpec,
  defaultAbstractType,
  getAbstractTypeForDbType,
  getDbTypesForAbstractType,
  getDefaultDbType,
} from './abstractTypeCategories';
import { abstractTypeCategory as t } from './constants';
import { DB_TYPES } from './dbTypes';
import { getRangeTypesOf, getRangeTypesOfValues } from './ranges';
import type { AbstractType, AbstractTypeCategoryIdentifier } from './types';

/**
 * A kind of a type family, chosen among in the inspector once the family is:
 * the columns of an abstract type, or of some of its DB types (e.g., Integer is
 * the Number columns of the integer DB types).
 */
export interface TypeKind {
  identifier: string;
  /** The kind's name, when it's not its abstract type's */
  name?: string;
  abstractType: AbstractTypeCategoryIdentifier;
  /**
   * The DB types of the kind when it has only some of its abstract type's, the
   * first being the one a new column of the kind gets
   */
  dbTypes?: DbType[];
  /** Whether a column of the kind can hold ranges of its values instead */
  hasRanges?: boolean;
  /** Whether a column of the kind can't hold arrays of its values instead */
  withoutArrays?: boolean;
}

/**
 * A family of data types, which is what Mathesar offers people to choose,
 * followed by one of its kinds (e.g., Time's kinds are Date & Time, Date,
 * Duration, Created At, and so on), and whether a column holds ranges of the
 * kind's values, arrays of them, or both (multiranges).
 */
export interface TypeFamily {
  identifier: string;
  name: string;
  icon: IconProps;
  /** Its kinds, in the order they're offered, the first being a new column's */
  kinds: TypeKind[];
  /** The abstract type of the ranges of its kinds' values, if they have any */
  rangeAbstractType?: AbstractTypeCategoryIdentifier;
}

const kind = (abstractType: AbstractTypeCategoryIdentifier): TypeKind => ({
  identifier: abstractType,
  abstractType,
});

export const typeFamilies: TypeFamily[] = [
  {
    identifier: 'text',
    name: 'Text',
    icon: iconUiTypeText,
    kinds: [kind(t.Text), kind(t.Email), kind(t.Uri)],
  },
  {
    identifier: 'number',
    name: 'Number',
    icon: iconUiTypeNumber,
    kinds: [
      {
        identifier: 'decimal',
        name: 'Decimal',
        abstractType: t.Number,
        dbTypes: [DB_TYPES.NUMERIC],
        hasRanges: true,
      },
      {
        identifier: 'integer',
        name: 'Integer',
        abstractType: t.Number,
        dbTypes: [DB_TYPES.INTEGER, DB_TYPES.BIGINT, DB_TYPES.SMALLINT],
        hasRanges: true,
      },
      {
        identifier: 'float',
        name: 'Float',
        abstractType: t.Number,
        dbTypes: [DB_TYPES.DOUBLE_PRECISION, DB_TYPES.REAL],
      },
      kind(t.Money),
    ],
    rangeAbstractType: t.NumberRange,
  },
  {
    identifier: 'time',
    name: 'Time',
    icon: iconUiTypeDateTime,
    kinds: [
      { ...kind(t.DateTime), hasRanges: true },
      { ...kind(t.Date), hasRanges: true },
      kind(t.Time),
      kind(t.Duration),
      { ...kind(t.CreatedAt), withoutArrays: true },
      { ...kind(t.UpdatedAt), withoutArrays: true },
    ],
    rangeAbstractType: t.TimeRange,
  },
  {
    identifier: 'boolean',
    name: 'Boolean',
    icon: iconUiTypeBoolean,
    kinds: [kind(t.Boolean)],
  },
  {
    identifier: 'uuid',
    name: 'UUID',
    icon: iconUiTypeUuid,
    kinds: [kind(t.Uuid)],
  },
  {
    identifier: 'file',
    name: 'File',
    icon: iconFile,
    kinds: [{ ...kind(t.File), withoutArrays: true }],
  },
  {
    identifier: 'choice',
    name: 'Choice',
    icon: iconUiTypeEnum,
    kinds: [kind(t.Enum)],
  },
  {
    identifier: 'composite',
    name: 'Composite',
    icon: iconUiTypeComposite,
    kinds: [kind(t.Composite)],
  },
  {
    identifier: 'json',
    name: 'JSON',
    icon: iconUiTypeJson,
    kinds: [kind(t.Json), kind(t.JsonArray), kind(t.JsonObject)],
  },
  { identifier: 'xml', name: 'XML', icon: iconUiTypeXml, kinds: [kind(t.Xml)] },
  {
    identifier: 'binary',
    name: 'Binary',
    icon: iconUiTypeBinary,
    kinds: [
      {
        identifier: 'bytes',
        name: 'Bytes',
        abstractType: t.Binary,
        dbTypes: [DB_TYPES.BYTEA],
      },
      {
        identifier: 'bits',
        name: 'Bits',
        abstractType: t.Binary,
        dbTypes: [DB_TYPES.BIT_VARYING, DB_TYPES.BIT],
      },
    ],
  },
  {
    identifier: 'network',
    name: 'IP',
    icon: iconUiTypeNetwork,
    kinds: [
      {
        identifier: 'ipAddress',
        name: 'IP Address',
        abstractType: t.Network,
        dbTypes: [DB_TYPES.INET],
      },
      {
        identifier: 'ipNetwork',
        name: 'IP Network',
        abstractType: t.Network,
        dbTypes: [DB_TYPES.CIDR],
      },
      {
        identifier: 'macAddress',
        name: 'MAC Address',
        abstractType: t.Network,
        dbTypes: [DB_TYPES.MACADDR, DB_TYPES.MACADDR8],
      },
    ],
  },
  {
    identifier: 'geometry',
    name: '2D',
    icon: iconUiTypeGeometry,
    kinds: [
      {
        identifier: 'point',
        name: 'Point',
        abstractType: t.Geometry,
        dbTypes: [DB_TYPES.POINT],
      },
      {
        identifier: 'line',
        name: 'Line',
        abstractType: t.Geometry,
        dbTypes: [DB_TYPES.LINE],
      },
      {
        identifier: 'segment',
        name: 'Segment',
        abstractType: t.Geometry,
        dbTypes: [DB_TYPES.LSEG],
      },
      {
        identifier: 'rectangle',
        name: 'Rectangle',
        abstractType: t.Geometry,
        dbTypes: [DB_TYPES.BOX],
      },
      {
        identifier: 'path',
        name: 'Path',
        abstractType: t.Geometry,
        dbTypes: [DB_TYPES.PATH],
      },
      {
        identifier: 'polygon',
        name: 'Polygon',
        abstractType: t.Geometry,
        dbTypes: [DB_TYPES.POLYGON],
      },
      {
        identifier: 'circle',
        name: 'Circle',
        abstractType: t.Geometry,
        dbTypes: [DB_TYPES.CIRCLE],
      },
    ],
  },
  {
    identifier: 'databaseTable',
    name: 'Database Table',
    icon: iconUiTypeDatabaseTable,
    kinds: [kind(t.DatabaseTable)],
  },
  {
    identifier: 'other',
    name: 'Other',
    icon: iconUiTypeUnknown,
    kinds: [{ ...kind(t.Other), withoutArrays: true }],
  },
];

const otherFamily = typeFamilies[typeFamilies.length - 1];

/** A type as a column has it, or would once chosen */
export interface TypeChoice {
  abstractType: AbstractType;
  dbType: DbType;
  /** The type of the items of an array */
  itemType?: DbType;
}

/** The type a new column is of until something says otherwise */
export function getDefaultTypeChoice(): TypeChoice {
  return {
    abstractType: defaultAbstractType,
    dbType: getDefaultDbType(defaultAbstractType) ?? DB_TYPES.TEXT,
  };
}

export interface Modifiers {
  /** Whether the column holds ranges of the kind's values */
  isRange: boolean;
  /**
   * Whether the column holds arrays of the kind's values, or of ranges of them
   * (multiranges, which are arrays of ranges that don't overlap)
   */
  isArray: boolean;
}

export interface KindOfChoice extends Modifiers {
  family: TypeFamily;
  kind: TypeKind;
}

function getKindDbTypes(typeKind: TypeKind): DbType[] {
  return (
    typeKind.dbTypes ?? [...getDbTypesForAbstractType(typeKind.abstractType)]
  );
}

function findKind(
  isOfKind: (typeKind: TypeKind, family: TypeFamily) => boolean,
): Pick<KindOfChoice, 'family' | 'kind'> {
  for (const family of typeFamilies) {
    const typeKind = family.kinds.find((k) => isOfKind(k, family));
    if (typeKind) return { family, kind: typeKind };
  }
  return { family: otherFamily, kind: otherFamily.kinds[0] };
}

const unmodified: Modifiers = { isRange: false, isArray: false };

export function getKindOf(
  choice: Pick<TypeChoice, 'dbType' | 'itemType'> & {
    abstractType: Pick<AbstractType, 'identifier'>;
  },
): KindOfChoice {
  if (choice.dbType === DB_TYPES.ARRAY) {
    const itemKind =
      choice.itemType &&
      getKindOf({
        abstractType: getAbstractTypeForDbType(choice.itemType, null),
        dbType: choice.itemType,
      });
    // Arrays of ranges would look like multiranges, so aren't of a kind
    if (itemKind && !itemKind.isRange && !itemKind.kind.withoutArrays) {
      return { ...itemKind, isArray: true };
    }
    return { ...findKind(() => false), ...unmodified };
  }
  const { identifier } = choice.abstractType;
  const rangeTypes = getRangeTypesOf(choice.dbType);
  if (rangeTypes) {
    const rangeKind = findKind(
      (k, family) =>
        family.rangeAbstractType === identifier &&
        !!k.hasRanges &&
        getKindDbTypes(k).includes(rangeTypes.value),
    );
    return {
      ...rangeKind,
      isRange: true,
      isArray: rangeTypes.multirange === choice.dbType,
    };
  }
  return {
    ...findKind(
      (k) =>
        k.abstractType === identifier &&
        (!k.dbTypes || k.dbTypes.includes(choice.dbType)),
    ),
    ...unmodified,
  };
}

export function getTypeFamily(abstractType: Pick<AbstractType, 'identifier'>) {
  return (
    typeFamilies.find(
      (family) =>
        family.rangeAbstractType === abstractType.identifier ||
        family.kinds.some((k) => k.abstractType === abstractType.identifier),
    ) ?? otherFamily
  );
}

/**
 * The same kind holding its values, ranges of them, arrays of them, or
 * multiranges of them, if it can.
 */
export function withModifiers(
  choice: TypeChoice,
  { isRange, isArray }: Modifiers,
): TypeChoice | undefined {
  const { kind: typeKind } = getKindOf(choice);
  if ((isRange && !typeKind.hasRanges) || (isArray && typeKind.withoutArrays)) {
    return undefined;
  }
  const valueType =
    choice.dbType === DB_TYPES.ARRAY
      ? choice.itemType
      : getRangeTypesOf(choice.dbType)?.value ?? choice.dbType;
  if (!valueType) return undefined;
  if (isRange) {
    const rangeTypes =
      getRangeTypesOfValues(valueType) ??
      getRangeTypesOfValues(getKindDbTypes(typeKind)[0]);
    const dbType = rangeTypes?.[isArray ? 'multirange' : 'range'];
    return dbType
      ? { abstractType: getAbstractTypeForDbType(dbType, null), dbType }
      : undefined;
  }
  if (isArray) {
    return {
      abstractType: getAbstractTypeForDbType(DB_TYPES.ARRAY, null),
      dbType: DB_TYPES.ARRAY,
      itemType: valueType,
    };
  }
  return valueType === choice.dbType
    ? choice
    : {
        abstractType: getAbstractTypeForDbType(valueType, null),
        dbType: valueType,
      };
}

export interface KindOption {
  kind: TypeKind;
  name: string;
  /** The abstract type of the kind's values */
  abstractType: AbstractType;
  /** The icon of the kind's own DB type, where its type has one for it */
  icon?: IconProps;
}

export interface FamilyOption {
  family: TypeFamily;
  kinds: KindOption[];
}

const allModifiers: Modifiers[] = [
  { isRange: true, isArray: false },
  { isRange: false, isArray: true },
  { isRange: true, isArray: true },
];

/**
 * The families and kinds of the given abstract types, in the families' order
 * and each family's order of its kinds, leaving out kinds with none of their DB
 * types allowed. A kind is also offered when ranges or arrays of its values
 * are allowed.
 */
export function groupByFamily(
  abstractTypes: AbstractType[],
  isChoiceAllowed: (choice: TypeChoice) => boolean = () => true,
): FamilyOption[] {
  const findAbstractType = (identifier?: string) =>
    abstractTypes.find((a) => a.identifier === identifier);
  return typeFamilies
    .map((family) => ({
      family,
      kinds: family.kinds.flatMap((typeKind) => {
        const kindDbTypes = getKindDbTypes(typeKind);
        const abstractType =
          findAbstractType(typeKind.abstractType) ??
          (kindDbTypes.length > 0
            ? getAbstractTypeForDbType(kindDbTypes[0], null)
            : undefined);
        if (!abstractType) return [];
        const values = kindDbTypes.map((dbType) => ({
          abstractType,
          dbType,
        }));
        const valuesAllowed =
          !!findAbstractType(typeKind.abstractType) &&
          (!typeKind.dbTypes || values.some(isChoiceAllowed));
        const modifiedAllowed = allModifiers.some((modifiers) =>
          values.some((value) => {
            const modified = withModifiers(value, modifiers);
            return (
              !!modified &&
              !!findAbstractType(modified.abstractType.identifier) &&
              isChoiceAllowed(modified)
            );
          }),
        );
        if (!valuesAllowed && !modifiedAllowed) return [];
        // A type gives each of its DB types an icon where they differ, as 2D
        // does its shapes
        const icon = kindDbTypes[0]
          ? abstractType.getIcon({
              dbType: kindDbTypes[0],
              typeOptions: null,
              metadata: null,
            })
          : undefined;
        return [
          {
            kind: typeKind,
            name: typeKind.name ?? abstractType.name,
            abstractType,
            icon: Array.isArray(icon) ? icon[0] : icon,
          },
        ];
      }),
    }))
    .filter(({ kinds }) => kinds.length > 0);
}

/**
 * The type chosen by choosing a kind with those of the given modifiers it has:
 * of the first of the preferred DB types the kind has, or else its first
 * allowed one. Without the modifiers if they're not allowed.
 */
export function chooseKind(
  option: KindOption,
  {
    modifiers = unmodified,
    preferredDbTypes = [],
    isChoiceAllowed = () => true,
  }: {
    modifiers?: Modifiers;
    preferredDbTypes?: DbType[];
    isChoiceAllowed?: (choice: TypeChoice) => boolean;
  } = {},
): TypeChoice | undefined {
  const { kind: typeKind, abstractType } = option;
  const kindDbTypes = getKindDbTypes(typeKind);
  const preferred = preferredDbTypes.filter((d) => kindDbTypes.includes(d));
  const defaultDbType = getDefaultDbType(abstractType);
  // Keeping those of the modifiers the kind has
  const wanted = {
    isRange: modifiers.isRange && !!typeKind.hasRanges,
    isArray: modifiers.isArray && !typeKind.withoutArrays,
  };
  if (wanted.isRange || wanted.isArray) {
    const valueTypes = [
      ...preferred,
      ...(typeKind.dbTypes ?? (defaultDbType ? [defaultDbType] : [])),
    ];
    for (const dbType of valueTypes) {
      const modified = withModifiers({ abstractType, dbType }, wanted);
      if (modified && isChoiceAllowed(modified)) return modified;
    }
  }
  const dbType =
    preferred[0] ??
    (typeKind.dbTypes
      ? typeKind.dbTypes.find((d) =>
          isChoiceAllowed({ abstractType, dbType: d }),
        )
      : defaultDbType);
  return dbType ? { abstractType, dbType } : undefined;
}

/** What a new column needs in order to be of the chosen type */
export function getColumnSaveSpec(
  choice: TypeChoice,
): ReturnType<typeof abstractTypeToColumnSaveSpec> {
  if (choice.dbType !== DB_TYPES.ARRAY || !choice.itemType) {
    return abstractTypeToColumnSaveSpec(choice.abstractType, choice.dbType);
  }
  const spec = abstractTypeToColumnSaveSpec(
    getAbstractTypeForDbType(choice.itemType, null),
    choice.itemType,
  );
  return {
    ...spec,
    dbOptions: {
      // Only the type carries over from the item: an autofilled default or
      // nullability describes one value of it, not an array of them, and a
      // scalar default wouldn't even be castable to the array type.
      type: spec.dbOptions.type,
      typeOptions: { ...spec.dbOptions.typeOptions, array: true },
    },
  };
}
