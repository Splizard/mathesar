import { get, readable } from 'svelte/store';

import { formatComposite } from '@mathesar/components/cell-fabric/data-types/components/composite/formatComposite';
import { makeForm } from '@mathesar-component-library';

import {
  canCastDbType,
  getAbstractTypeForDbType,
  getAllowedAbstractTypesForDbTypeAndItsTargetTypes,
  getAllowedAbstractTypesForNewColumn,
} from '../abstractTypeCategories';
import { DB_TYPES } from '../dbTypes';
import {
  type TypeChoice,
  chooseKind,
  getColumnSaveSpec,
  getKindOf,
  getTypeFamily,
  groupByFamily,
  typeFamilies,
  withModifiers,
} from '../typeFamilies';

vi.mock('svelte-i18n', () => {
  const translate = (s: string) => s;
  return { _: readable(translate) };
});

const familyOf = (dbType: string) =>
  getTypeFamily(getAbstractTypeForDbType(dbType, null)).name;

describe('type families', () => {
  test('hold every PostgreSQL type Mathesar knows', () => {
    const unfamilied = Object.values(DB_TYPES).filter(
      (dbType) => familyOf(dbType) === 'Other',
    );
    // PostgreSQL reports decimal columns as numeric, and arrays are of the
    // family of their items; the others are its own
    expect(unfamilied).toEqual([
      DB_TYPES.ARRAY,
      DB_TYPES.DECIMAL,
      DB_TYPES.OID,
      DB_TYPES.TSVECTOR,
    ]);
  });

  test("group the design's types", () => {
    expect(familyOf(DB_TYPES.TIMESTAMP_WITH_TZ)).toBe('Time');
    expect(familyOf(DB_TYPES.INTERVAL)).toBe('Time');
    expect(familyOf(DB_TYPES.TSTZRANGE)).toBe('Time');
    expect(familyOf(DB_TYPES.DATEMULTIRANGE)).toBe('Time');
    expect(familyOf(DB_TYPES.MONEY)).toBe('Number');
    expect(familyOf(DB_TYPES.INT4RANGE)).toBe('Number');
    expect(familyOf(DB_TYPES.MSAR__EMAIL)).toBe('Text');
    expect(familyOf(DB_TYPES.BYTEA)).toBe('Binary');
    expect(familyOf(DB_TYPES.BIT_VARYING)).toBe('Binary');
    expect(familyOf(DB_TYPES.MACADDR8)).toBe('IP');
    expect(familyOf(DB_TYPES.POLYGON)).toBe('2D');
    expect(familyOf(DB_TYPES.ENUM)).toBe('Choice');
    expect(familyOf(DB_TYPES.COMPOSITE)).toBe('Composite');
    expect(familyOf(DB_TYPES.REGCLASS)).toBe('Database Table');
    expect(familyOf(DB_TYPES.MSAR__MATHESAR_JSON_OBJECT)).toBe('JSON');
    expect(familyOf(DB_TYPES.XML)).toBe('XML');
  });

  test('have one kind for each DB type of an abstract type', () => {
    for (const abstractType of getAllowedAbstractTypesForNewColumn()) {
      for (const dbType of abstractType.dbTypes) {
        const kinds = typeFamilies
          .flatMap((f) => f.kinds)
          .filter(
            (k) =>
              k.abstractType === abstractType.identifier &&
              (!k.dbTypes || k.dbTypes.includes(dbType)),
          );
        // Ranges and arrays are of the kinds of their values
        if (
          ['numberRange', 'timeRange', 'array'].includes(
            abstractType.identifier,
          )
        ) {
          expect(kinds).toHaveLength(0);
        } else {
          expect(kinds).toHaveLength(1);
        }
      }
    }
  });

  test('are offered for new columns, with their kinds', () => {
    const groups = groupByFamily(getAllowedAbstractTypesForNewColumn());
    const names = groups.map((g) => g.family.name);
    expect(names.slice(0, 3)).toEqual(['Text', 'Number', 'Time']);
    expect(names).not.toContain('Other');
    const kindsOf = (family: string) =>
      groups.find((g) => g.family.name === family)?.kinds.map((k) => k.name);
    expect(kindsOf('Number')).toEqual(['Decimal', 'Integer', 'Float', 'Money']);
    expect(kindsOf('Time')).toEqual([
      'Date & Time',
      'Date',
      'Time of Day',
      'Duration',
      'Created At',
      'Updated At',
    ]);
    expect(kindsOf('Binary')).toEqual(['Bytes', 'Bits']);
    expect(kindsOf('IP')).toEqual(['IP Address', 'IP Network', 'MAC Address']);
    expect(kindsOf('2D')).toEqual([
      'Point',
      'Line',
      'Segment',
      'Rectangle',
      'Path',
      'Polygon',
      'Circle',
    ]);
  });

  test('give each 2D kind the icon of its shape', () => {
    const groups = groupByFamily(getAllowedAbstractTypesForNewColumn());
    const kindsOf = (family: string) =>
      groups.find((g) => g.family.name === family)?.kinds ?? [];
    const shapes = kindsOf('2D');
    expect(shapes).toHaveLength(7);
    expect(new Set(shapes.map((k) => k.icon?.data)).size).toBe(7);
    // As a column of the shape is given, wherever its type is shown
    const iconFor = (dbType: string) =>
      getAbstractTypeForDbType(dbType, null).getIcon({
        dbType,
        typeOptions: null,
        metadata: null,
      });
    expect(iconFor(DB_TYPES.BOX)).toBe(
      shapes.find((k) => k.name === 'Rectangle')?.icon,
    );
    expect(iconFor(DB_TYPES.CIRCLE)).not.toBe(iconFor(DB_TYPES.POINT));
    // Kinds of the same type share its icon, Money having one of its own
    const number = kindsOf('Number').filter(
      (k) => k.abstractType.identifier === 'number',
    );
    expect(number).toHaveLength(3);
    expect(new Set(number.map((k) => k.icon?.data)).size).toBe(1);
  });

  test('leave out kinds with none of their DB types allowed', () => {
    const groups = groupByFamily(
      getAllowedAbstractTypesForNewColumn(),
      ({ dbType, itemType }) =>
        ![DB_TYPES.DOUBLE_PRECISION, DB_TYPES.REAL].includes(
          itemType ?? dbType,
        ),
    );
    const number = groups.find((g) => g.family.name === 'Number');
    expect(number?.kinds.map((k) => k.name)).toEqual([
      'Decimal',
      'Integer',
      'Money',
    ]);
  });
});

const choiceOf = (dbType: string, itemType?: string) => ({
  abstractType: getAbstractTypeForDbType(dbType, null),
  dbType,
  itemType,
});

const kindOf = (dbType: string, itemType?: string) => {
  const { kind, isRange, isArray } = getKindOf(choiceOf(dbType, itemType));
  return [kind.identifier, isRange && 'range', isArray && 'array']
    .filter(Boolean)
    .join(' ');
};

const modified = (dbType: string, isRange: boolean, isArray: boolean) =>
  withModifiers(choiceOf(dbType), { isRange, isArray });

describe('kinds', () => {
  test('are of DB types, with ranges and arrays of them', () => {
    expect(kindOf(DB_TYPES.NUMERIC)).toBe('decimal');
    expect(kindOf(DB_TYPES.SMALLINT)).toBe('integer');
    expect(kindOf(DB_TYPES.BIGINT)).toBe('integer');
    expect(kindOf(DB_TYPES.REAL)).toBe('float');
    expect(kindOf(DB_TYPES.MONEY)).toBe('money');
    expect(kindOf(DB_TYPES.NUMRANGE)).toBe('decimal range');
    expect(kindOf(DB_TYPES.INT8MULTIRANGE)).toBe('integer range array');
    expect(kindOf(DB_TYPES.TSTZRANGE)).toBe('datetime range');
    expect(kindOf(DB_TYPES.DATEMULTIRANGE)).toBe('date range array');
    expect(kindOf(DB_TYPES.ARRAY, DB_TYPES.INTEGER)).toBe('integer array');
    expect(kindOf(DB_TYPES.ARRAY, DB_TYPES.CHARACTER_VARYING)).toBe(
      'text array',
    );
    expect(kindOf(DB_TYPES.ARRAY, DB_TYPES.INT4RANGE)).toBe('other');
    expect(kindOf(DB_TYPES.TEXT)).toBe('text');
    expect(kindOf(DB_TYPES.TSVECTOR)).toBe('other');
    expect(kindOf(DB_TYPES.BYTEA)).toBe('bytes');
    expect(kindOf(DB_TYPES.BIT)).toBe('bits');
    expect(kindOf(DB_TYPES.BIT_VARYING)).toBe('bits');
    expect(kindOf(DB_TYPES.ARRAY, DB_TYPES.INET)).toBe('ipAddress array');
    expect(kindOf(DB_TYPES.CIDR)).toBe('ipNetwork');
    expect(kindOf(DB_TYPES.MACADDR8)).toBe('macAddress');
    expect(kindOf(DB_TYPES.LSEG)).toBe('segment');
    expect(kindOf(DB_TYPES.BOX)).toBe('rectangle');
  });

  test('can hold ranges of their values, arrays of them, or both', () => {
    expect(modified(DB_TYPES.INTEGER, true, false)).toMatchObject({
      dbType: DB_TYPES.INT4RANGE,
      abstractType: { identifier: 'numberRange' },
    });
    expect(modified(DB_TYPES.SMALLINT, true, false)?.dbType).toBe(
      DB_TYPES.INT4RANGE,
    );
    expect(modified(DB_TYPES.BIGINT, true, true)?.dbType).toBe(
      DB_TYPES.INT8MULTIRANGE,
    );
    expect(modified(DB_TYPES.NUMERIC, true, false)?.dbType).toBe(
      DB_TYPES.NUMRANGE,
    );
    expect(modified(DB_TYPES.DATE, true, true)).toMatchObject({
      dbType: DB_TYPES.DATEMULTIRANGE,
      abstractType: { identifier: 'timeRange' },
    });
    expect(modified(DB_TYPES.REAL, false, true)).toMatchObject({
      dbType: DB_TYPES.ARRAY,
      itemType: DB_TYPES.REAL,
      abstractType: { identifier: 'array' },
    });
    expect(modified(DB_TYPES.REAL, true, false)).toBeUndefined();
    expect(modified(DB_TYPES.TEXT, true, false)).toBeUndefined();

    expect(modified(DB_TYPES.INT8MULTIRANGE, false, false)).toMatchObject({
      dbType: DB_TYPES.BIGINT,
      abstractType: { identifier: 'number' },
    });
    expect(modified(DB_TYPES.INT8MULTIRANGE, true, false)?.dbType).toBe(
      DB_TYPES.INT8RANGE,
    );
    expect(modified(DB_TYPES.TSRANGE, false, false)).toMatchObject({
      dbType: DB_TYPES.TIMESTAMP_WITHOUT_TZ,
      abstractType: { identifier: 'datetime' },
    });
    expect(
      withModifiers(choiceOf(DB_TYPES.ARRAY, DB_TYPES.INTEGER), {
        isRange: true,
        isArray: true,
      })?.dbType,
    ).toBe(DB_TYPES.INT4MULTIRANGE);
  });

  test('are chosen with their first allowed or preferred DB type', () => {
    const number = groupByFamily(getAllowedAbstractTypesForNewColumn()).find(
      (g) => g.family.name === 'Number',
    );
    const integer = number?.kinds.find((k) => k.name === 'Integer');
    const float = number?.kinds.find((k) => k.name === 'Float');
    if (!integer || !float) throw new Error('No Integer or Float kind');
    const range = { isRange: true, isArray: false };
    const array = { isRange: false, isArray: true };
    expect(chooseKind(integer)?.dbType).toBe(DB_TYPES.INTEGER);
    expect(chooseKind(integer, { modifiers: range })?.dbType).toBe(
      DB_TYPES.INT4RANGE,
    );
    expect(chooseKind(integer, { modifiers: array })).toMatchObject({
      dbType: DB_TYPES.ARRAY,
      itemType: DB_TYPES.INTEGER,
    });
    // Keeping only the modifiers the kind has
    expect(
      chooseKind(float, { modifiers: { isRange: true, isArray: true } }),
    ).toMatchObject({
      dbType: DB_TYPES.ARRAY,
      itemType: DB_TYPES.DOUBLE_PRECISION,
    });
    expect(
      chooseKind(integer, {
        preferredDbTypes: [DB_TYPES.TEXT, DB_TYPES.BIGINT],
      })?.dbType,
    ).toBe(DB_TYPES.BIGINT);
    expect(
      chooseKind(integer, {
        isChoiceAllowed: ({ dbType }) => dbType === DB_TYPES.SMALLINT,
      })?.dbType,
    ).toBe(DB_TYPES.SMALLINT);
    // Without the modifiers when they're not allowed
    expect(
      chooseKind(integer, {
        modifiers: range,
        isChoiceAllowed: ({ dbType }) => dbType === DB_TYPES.INTEGER,
      })?.dbType,
    ).toBe(DB_TYPES.INTEGER);
  });

  test('are offered for ranges and arrays of their values', () => {
    const offered = (dbType: string, itemType?: string) => {
      const isChoiceAllowed = (choice: TypeChoice) =>
        choice.dbType === DB_TYPES.ARRAY
          ? dbType === DB_TYPES.ARRAY && choice.itemType === itemType
          : canCastDbType(dbType, choice.dbType);
      const groups = groupByFamily(
        getAllowedAbstractTypesForDbTypeAndItsTargetTypes(dbType, null),
        isChoiceAllowed,
      );
      return { groups, isChoiceAllowed };
    };
    const { groups, isChoiceAllowed } = offered(DB_TYPES.INT4MULTIRANGE);
    const number = groups.find((g) => g.family.name === 'Number');
    expect(number?.kinds.map((k) => k.name)).toEqual(['Decimal', 'Integer']);
    const decimal = number?.kinds[0];
    if (!decimal) throw new Error('No Decimal kind');
    expect(
      chooseKind(decimal, {
        modifiers: { isRange: true, isArray: true },
        isChoiceAllowed,
      }),
    ).toMatchObject({
      dbType: DB_TYPES.NUMMULTIRANGE,
      abstractType: { identifier: 'numberRange' },
    });

    const arrays = offered(DB_TYPES.ARRAY, DB_TYPES.INTEGER).groups;
    expect(
      arrays.find((g) => g.family.name === 'Number')?.kinds.map((k) => k.name),
    ).toEqual(['Integer']);
  });

  test('can change to and between ranges', () => {
    expect(canCastDbType(DB_TYPES.INTEGER, DB_TYPES.INT4RANGE)).toBe(true);
    expect(canCastDbType(DB_TYPES.SMALLINT, DB_TYPES.INT4RANGE)).toBe(true);
    // As the options of their kind's ranges can choose
    expect(canCastDbType(DB_TYPES.INTEGER, DB_TYPES.INT8MULTIRANGE)).toBe(true);
    expect(canCastDbType(DB_TYPES.TIMESTAMP_WITH_TZ, DB_TYPES.TSRANGE)).toBe(
      true,
    );
    expect(canCastDbType(DB_TYPES.DATE, DB_TYPES.TSRANGE)).toBe(false);
    expect(canCastDbType(DB_TYPES.INT4RANGE, DB_TYPES.INT8MULTIRANGE)).toBe(
      true,
    );
    expect(canCastDbType(DB_TYPES.NUMMULTIRANGE, DB_TYPES.INT4RANGE)).toBe(
      true,
    );
    expect(canCastDbType(DB_TYPES.TSRANGE, DB_TYPES.DATERANGE)).toBe(true);
    expect(canCastDbType(DB_TYPES.INT4RANGE, DB_TYPES.TEXT)).toBe(true);
    expect(canCastDbType(DB_TYPES.INT4RANGE, DB_TYPES.INTEGER)).toBe(false);
    expect(canCastDbType(DB_TYPES.NUMERIC, DB_TYPES.INT4RANGE)).toBe(false);
    expect(canCastDbType(DB_TYPES.INT4RANGE, DB_TYPES.DATERANGE)).toBe(false);
  });

  test('can change between the kinds of their family that PostgreSQL converts', () => {
    expect(canCastDbType(DB_TYPES.INET, DB_TYPES.CIDR)).toBe(true);
    expect(canCastDbType(DB_TYPES.CIDR, DB_TYPES.INET)).toBe(true);
    expect(canCastDbType(DB_TYPES.MACADDR, DB_TYPES.MACADDR8)).toBe(true);
    expect(canCastDbType(DB_TYPES.INET, DB_TYPES.MACADDR)).toBe(false);
    expect(canCastDbType(DB_TYPES.BIT, DB_TYPES.BIT_VARYING)).toBe(true);
    expect(canCastDbType(DB_TYPES.BYTEA, DB_TYPES.BIT)).toBe(false);
    expect(canCastDbType(DB_TYPES.POINT, DB_TYPES.BOX)).toBe(true);
    expect(canCastDbType(DB_TYPES.POLYGON, DB_TYPES.CIRCLE)).toBe(true);
    expect(canCastDbType(DB_TYPES.BOX, DB_TYPES.LSEG)).toBe(true);
    expect(canCastDbType(DB_TYPES.POINT, DB_TYPES.LINE)).toBe(false);
    // Only the kinds it can change to are offered
    const groups = groupByFamily(
      getAllowedAbstractTypesForDbTypeAndItsTargetTypes(DB_TYPES.BOX, null),
      ({ dbType }) => canCastDbType(DB_TYPES.BOX, dbType),
    );
    expect(
      groups.find((g) => g.family.name === '2D')?.kinds.map((k) => k.name),
    ).toEqual(['Point', 'Segment', 'Rectangle', 'Polygon', 'Circle']);
  });

  test('make new columns of arrays', () => {
    expect(
      getColumnSaveSpec(choiceOf(DB_TYPES.ARRAY, DB_TYPES.UUID)).dbOptions,
    ).toMatchObject({ type: DB_TYPES.UUID, typeOptions: { array: true } });
    expect(
      getColumnSaveSpec(choiceOf(DB_TYPES.INT4MULTIRANGE)).dbOptions,
    ).toMatchObject({ type: DB_TYPES.INT4MULTIRANGE, typeOptions: {} });
  });
});

describe('kind options', () => {
  // As the inspector does, through the form's values, which are only those of
  // its inputs
  const dbTypeFor = (dbType: string, values: Record<string, unknown>) => {
    const config = getAbstractTypeForDbType(dbType, null).getDbConfig?.(dbType);
    if (!config) throw new Error(`No options for ${dbType}`);
    const form = makeForm(config.form, values);
    return config.determineDbTypeAndOptions(get(form.values), dbType).dbType;
  };

  test("are those of the chosen number kind's", () => {
    expect(dbTypeFor(DB_TYPES.BIGINT, {})).toBe(DB_TYPES.BIGINT);
    expect(dbTypeFor(DB_TYPES.REAL, {})).toBe(DB_TYPES.REAL);
    expect(dbTypeFor(DB_TYPES.DOUBLE_PRECISION, {})).toBe(
      DB_TYPES.DOUBLE_PRECISION,
    );
    expect(dbTypeFor(DB_TYPES.NUMERIC, {})).toBe(DB_TYPES.NUMERIC);
    expect(dbTypeFor(DB_TYPES.INTEGER, { integerDataSize: 'bigInt' })).toBe(
      DB_TYPES.BIGINT,
    );
  });

  test('say how many bits and how big a MAC address is', () => {
    expect(dbTypeFor(DB_TYPES.BIT_VARYING, {})).toBe(DB_TYPES.BIT_VARYING);
    expect(
      dbTypeFor(DB_TYPES.BIT_VARYING, { fixedLength: true, length: 8 }),
    ).toBe(DB_TYPES.BIT);
    expect(dbTypeFor(DB_TYPES.BIT, {})).toBe(DB_TYPES.BIT);
    expect(dbTypeFor(DB_TYPES.BIT, { fixedLength: false })).toBe(
      DB_TYPES.BIT_VARYING,
    );
    expect(dbTypeFor(DB_TYPES.MACADDR, {})).toBe(DB_TYPES.MACADDR);
    expect(dbTypeFor(DB_TYPES.MACADDR8, {})).toBe(DB_TYPES.MACADDR8);
    expect(dbTypeFor(DB_TYPES.MACADDR, { macAddressSize: 'eui64' })).toBe(
      DB_TYPES.MACADDR8,
    );
    // The kinds without options have none
    for (const dbType of [DB_TYPES.BYTEA, DB_TYPES.INET, DB_TYPES.POINT]) {
      expect(
        getAbstractTypeForDbType(dbType, null).getDbConfig?.(dbType),
      ).toBeUndefined();
    }
  });

  test('choose the type of ranges, keeping multiranges', () => {
    expect(dbTypeFor(DB_TYPES.INT4RANGE, {})).toBe(DB_TYPES.INT4RANGE);
    expect(dbTypeFor(DB_TYPES.INT4RANGE, { integerDataSize: 'bigInt' })).toBe(
      DB_TYPES.INT8RANGE,
    );
    expect(
      dbTypeFor(DB_TYPES.INT8MULTIRANGE, { integerDataSize: 'default' }),
    ).toBe(DB_TYPES.INT4MULTIRANGE);
    expect(dbTypeFor(DB_TYPES.NUMMULTIRANGE, {})).toBe(DB_TYPES.NUMMULTIRANGE);
    expect(dbTypeFor(DB_TYPES.TSRANGE, { supportTimeZones: true })).toBe(
      DB_TYPES.TSTZRANGE,
    );
    expect(dbTypeFor(DB_TYPES.DATEMULTIRANGE, {})).toBe(
      DB_TYPES.DATEMULTIRANGE,
    );
  });
});

describe('formatComposite', () => {
  test("shows fields in the type's order", () => {
    const value = { city: 'Wellington', street: '1 Main St', zip: null };
    expect(formatComposite(value, ['street', 'city', 'zip'])).toBe(
      'street: 1 Main St, city: Wellington, zip: NULL',
    );
    expect(formatComposite(value)).toBe(
      'city: Wellington, street: 1 Main St, zip: NULL',
    );
    expect(formatComposite(null)).toBe('');
  });
});
