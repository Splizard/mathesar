import { readable } from 'svelte/store';

import { formatComposite } from '@mathesar/components/cell-fabric/data-types/components/composite/formatComposite';

import {
  getAbstractTypeForDbType,
  getAllowedAbstractTypesForNewColumn,
} from '../abstractTypeCategories';
import { DB_TYPES } from '../dbTypes';
import {
  getKindName,
  getTypeFamily,
  groupByFamily,
  typeFamilies,
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
    // PostgreSQL reports decimal columns as numeric; the others are its own
    expect(unfamilied).toEqual([
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

  test('each type is in at most one family', () => {
    const members = typeFamilies.flatMap((f) => f.members);
    expect(new Set(members).size).toBe(members.length);
  });

  test('are offered for new columns, with their kinds', () => {
    const groups = groupByFamily(getAllowedAbstractTypesForNewColumn());
    const names = groups.map((g) => g.family.name);
    expect(names.slice(0, 3)).toEqual(['Text', 'Number', 'Time']);
    expect(names).not.toContain('Other');
    const time = groups.find((g) => g.family.name === 'Time');
    expect(time?.members.map(getKindName)).toEqual([
      'Date & Time',
      'Date',
      'Time of Day',
      'Duration',
      'Created At',
      'Updated At',
      'Time Range',
    ]);
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
