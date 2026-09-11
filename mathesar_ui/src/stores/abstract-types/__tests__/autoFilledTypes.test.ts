import { readable } from 'svelte/store';

import {
  abstractTypeToColumnSaveSpec,
  getAbstractTypeForDbType,
  getAutoFillChangesForTypeChange,
} from '../abstractTypeCategories';
import { DB_TYPES } from '../dbTypes';

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
