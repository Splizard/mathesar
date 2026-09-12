import { readable } from 'svelte/store';

import {
  getAbstractTypeForDbType,
  mergeMetadataOnTypeChange,
} from '../abstractTypeCategories';
import { DB_TYPES } from '../dbTypes';

vi.mock('svelte-i18n', () => {
  const translate = (s: string) => s;
  return { _: readable(translate) };
});

const unixTimeMetadata = { num_unix_time: 'milliseconds' as const };
const number = getAbstractTypeForDbType(DB_TYPES.BIGINT, null);

/** The variables an element of a form layout reads, however nested */
function variablesIn(elements: unknown[]): string[] {
  return elements.flatMap((element) => {
    const e = element as { variable?: string; elements?: unknown[] };
    return [
      ...(e.variable ? [e.variable] : []),
      ...variablesIn(e.elements ?? []),
    ];
  });
}

describe('Unix time columns', () => {
  test('are number columns shown as dates', () => {
    const type = getAbstractTypeForDbType(DB_TYPES.BIGINT, unixTimeMetadata);
    expect(type.identifier).toBe('number');
    const iconArgs = { typeOptions: null, dbType: DB_TYPES.BIGINT };
    expect(
      type.getIcon({ ...iconArgs, metadata: unixTimeMetadata }),
    ).toMatchObject({ label: 'Unix Time' });
    expect(type.getIcon({ ...iconArgs, metadata: null })).toMatchObject({
      label: 'Number',
    });
  });

  test('are offered for whole numbers only', () => {
    const offeredFor = (dbType: string) =>
      variablesIn(
        number.getDisplayConfig?.(dbType)?.form.layout.elements ?? [],
      );
    for (const dbType of [
      DB_TYPES.SMALLINT,
      DB_TYPES.INTEGER,
      DB_TYPES.BIGINT,
    ]) {
      expect(offeredFor(dbType)).toContain('showAs');
    }
    for (const dbType of [
      DB_TYPES.NUMERIC,
      DB_TYPES.DECIMAL,
      DB_TYPES.REAL,
      DB_TYPES.DOUBLE_PRECISION,
    ]) {
      expect(offeredFor(dbType)).not.toContain('showAs');
      expect(offeredFor(dbType)).toContain('decimalPlaces');
    }
  });

  test('say which unit they count in, and how to write the date out', () => {
    const config = number.getDisplayConfig?.(DB_TYPES.BIGINT);
    expect(
      config?.determineDisplayOptions({
        showAs: 'unixTime',
        unixTimeUnit: 'nanoseconds',
        dateFormat: 'iso',
        timeFormat: '24hrLong',
      }),
    ).toEqual({
      num_unix_time: 'nanoseconds',
      date_format: 'iso',
      time_format: '24hrLong',
    });
    expect(
      config?.constructDisplayFormValuesFromDisplayOptions(unixTimeMetadata),
    ).toMatchObject({ showAs: 'unixTime', unixTimeUnit: 'milliseconds' });
  });

  test('become plain numbers again when shown as numbers', () => {
    const options = number
      .getDisplayConfig?.(DB_TYPES.BIGINT)
      ?.determineDisplayOptions({ showAs: 'number', useGrouping: 'auto' });
    expect(options).toMatchObject({ num_unix_time: null });
  });

  /**
   * The option is only offered on a whole number column, so a column that left
   * the Integer kind still carrying it would be shown as a date with no way
   * left to say otherwise.
   */
  test('stop being times when the column can no longer hold one', () => {
    const decimal = getAbstractTypeForDbType(DB_TYPES.NUMERIC, null);
    expect(
      mergeMetadataOnTypeChange(number, unixTimeMetadata, DB_TYPES.INTEGER),
    ).toMatchObject(unixTimeMetadata);
    expect(
      mergeMetadataOnTypeChange(number, unixTimeMetadata, DB_TYPES.NUMERIC),
    ).toMatchObject({ num_unix_time: null });
    expect(
      mergeMetadataOnTypeChange(decimal, unixTimeMetadata, DB_TYPES.NUMERIC),
    ).toMatchObject({ num_unix_time: null });
    expect(
      mergeMetadataOnTypeChange(
        getAbstractTypeForDbType(DB_TYPES.TEXT, null),
        unixTimeMetadata,
        DB_TYPES.TEXT,
      ),
    ).toMatchObject({ num_unix_time: null });
  });
});
