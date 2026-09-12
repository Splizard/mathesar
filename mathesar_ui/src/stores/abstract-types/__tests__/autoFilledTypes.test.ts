import { readable } from 'svelte/store';

import {
  abstractTypeToColumnSaveSpec,
  getAbstractTypeForDbType,
  getAutoFillChangesForTypeChange,
} from '../abstractTypeCategories';
import { DB_TYPES } from '../dbTypes';
import { getColumnSaveSpec } from '../typeFamilies';

vi.mock('svelte-i18n', () => {
  const translate = (s: string) => s;
  return { _: readable(translate) };
});

const TZ = DB_TYPES.TIMESTAMP_WITH_TZ;
const NO_TZ = DB_TYPES.TIMESTAMP_WITHOUT_TZ;
const now = { is_dynamic: true, value: 'now()' };

const dateTime = getAbstractTypeForDbType(TZ, null);
const createdAt = getAbstractTypeForDbType(TZ, null, { default: now });
const updatedAt = getAbstractTypeForDbType(TZ, null, {
  updated_at_trigger: true,
});
const text = getAbstractTypeForDbType(DB_TYPES.TEXT, null);
const boolean = getAbstractTypeForDbType(DB_TYPES.BOOLEAN, null);
const isFalse = { is_dynamic: false, value: 'false' };

describe('recognising Created At and Updated At', () => {
  test('from what the database fills in', () => {
    expect(dateTime.identifier).toBe('datetime');
    expect(createdAt.identifier).toBe('createdAt');
    expect(updatedAt.identifier).toBe('updatedAt');
    expect(
      getAbstractTypeForDbType(NO_TZ, null, {
        default: { is_dynamic: true, value: 'LOCALTIMESTAMP' },
      }).identifier,
    ).toBe('createdAt');
  });

  test('the trigger wins over a current time default', () => {
    expect(
      getAbstractTypeForDbType(TZ, null, {
        default: now,
        updated_at_trigger: true,
      }).identifier,
    ).toBe('updatedAt');
  });

  test('only for timestamps', () => {
    expect(
      getAbstractTypeForDbType(DB_TYPES.DATE, null, {
        default: { is_dynamic: true, value: 'CURRENT_DATE' },
      }).identifier,
    ).toBe('date');
  });
});

describe('abstractTypeToColumnSaveSpec', () => {
  test('sets up new columns', () => {
    expect(abstractTypeToColumnSaveSpec(createdAt).dbOptions).toMatchObject({
      type: TZ,
      default: now,
    });
    expect(abstractTypeToColumnSaveSpec(updatedAt).dbOptions).toMatchObject({
      type: TZ,
      updated_at_trigger: true,
    });
    expect(abstractTypeToColumnSaveSpec(dateTime).dbOptions).not.toHaveProperty(
      'default',
    );
  });

  test('a new boolean column is false rather than null', () => {
    expect(abstractTypeToColumnSaveSpec(boolean).dbOptions).toMatchObject({
      type: DB_TYPES.BOOLEAN,
      nullable: false,
      default: isFalse,
    });
  });

  test('other types are left nullable and without a default', () => {
    const { dbOptions } = abstractTypeToColumnSaveSpec(text);
    expect(dbOptions).not.toHaveProperty('nullable');
    expect(dbOptions).not.toHaveProperty('default');
  });
});

describe('getColumnSaveSpec', () => {
  test('a boolean column is NOT NULL DEFAULT FALSE', () => {
    expect(
      getColumnSaveSpec({ abstractType: boolean, dbType: DB_TYPES.BOOLEAN })
        .dbOptions,
    ).toMatchObject({ nullable: false, default: isFalse });
  });

  // `false` is not castable to boolean[], so carrying the item type's default
  // over to the array would make the column impossible to create.
  test('an array of booleans takes neither the default nor the nullability', () => {
    const { dbOptions } = getColumnSaveSpec({
      abstractType: boolean,
      dbType: DB_TYPES.ARRAY,
      itemType: DB_TYPES.BOOLEAN,
    });
    expect(dbOptions.typeOptions).toMatchObject({ array: true });
    expect(dbOptions).not.toHaveProperty('nullable');
    expect(dbOptions).not.toHaveProperty('default');
  });
});

describe('getAutoFillChangesForTypeChange', () => {
  const change = (
    from: [typeof dateTime, string],
    to: [typeof dateTime, string],
  ) =>
    getAutoFillChangesForTypeChange(
      { abstractType: from[0], dbType: from[1] },
      { abstractType: to[0], dbType: to[1] },
    );

  test.each([
    [
      'Date & Time to Created At',
      [dateTime, NO_TZ],
      [createdAt, TZ],
      { default: now },
    ],
    [
      'Created At to Date & Time',
      [createdAt, TZ],
      [dateTime, TZ],
      { default: null },
    ],
    [
      'Created At without time zones',
      [createdAt, TZ],
      [createdAt, NO_TZ],
      { default: { is_dynamic: true, value: 'LOCALTIMESTAMP' } },
    ],
    ['Created At unchanged', [createdAt, TZ], [createdAt, TZ], {}],
    [
      'Text to Updated At',
      [text, DB_TYPES.TEXT],
      [updatedAt, TZ],
      { updated_at_trigger: true },
    ],
    [
      'Updated At to Text',
      [updatedAt, TZ],
      [text, DB_TYPES.TEXT],
      { updated_at_trigger: false },
    ],
    ['Updated At without time zones', [updatedAt, TZ], [updatedAt, NO_TZ], {}],
    [
      'Created At to Updated At',
      [createdAt, TZ],
      [updatedAt, TZ],
      { default: null, updated_at_trigger: true },
    ],
    [
      'Updated At to Created At',
      [updatedAt, TZ],
      [createdAt, TZ],
      { default: now, updated_at_trigger: false },
    ],
    ['Date & Time to Text', [dateTime, TZ], [text, DB_TYPES.TEXT], {}],
  ] as const)('%s', (_label, from, to, expected) => {
    expect(change([...from], [...to])).toEqual(expected);
  });
});
