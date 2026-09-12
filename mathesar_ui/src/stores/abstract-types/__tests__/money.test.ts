import { readable } from 'svelte/store';

import {
  abstractTypeToColumnSaveSpec,
  getAbstractTypeForDbType,
  mergeMetadataOnTypeChange,
} from '../abstractTypeCategories';
import { DB_TYPES } from '../dbTypes';
import { getColumnSaveSpec, getKindOf } from '../typeFamilies';

vi.mock('svelte-i18n', () => {
  const translate = (s: string) => s;
  return { _: readable(translate) };
});

const kindOf = (dbType: string, metadata: Record<string, unknown> | null) =>
  getAbstractTypeForDbType(dbType, metadata as never).identifier;

describe('money is a number carrying a currency symbol', () => {
  test('a numeric column with a symbol is money', () => {
    expect(kindOf(DB_TYPES.NUMERIC, { mon_currency_symbol: '$' })).toBe(
      'money',
    );
  });

  test('a numeric column without one is just a number', () => {
    expect(kindOf(DB_TYPES.NUMERIC, null)).toBe('number');
    expect(kindOf(DB_TYPES.NUMERIC, {})).toBe('number');
  });

  test('the symbol being empty still says money, its presence being the signal', () => {
    expect(kindOf(DB_TYPES.NUMERIC, { mon_currency_symbol: '' })).toBe('money');
  });

  test('a symbol on some other number type does not make it money', () => {
    expect(kindOf(DB_TYPES.INTEGER, { mon_currency_symbol: '$' })).toBe(
      'number',
    );
  });

  test('the old domain is still recognised, for columns that predate this', () => {
    expect(kindOf(DB_TYPES.MSAR__MATHESAR_MONEY, null)).toBe('money');
  });
});

describe('creating and converting money columns', () => {
  const money = getAbstractTypeForDbType(DB_TYPES.NUMERIC, {
    mon_currency_symbol: '$',
  } as never);
  const number = getAbstractTypeForDbType(DB_TYPES.NUMERIC, null);

  test('a new money column is numeric, and carries a symbol', () => {
    const spec = abstractTypeToColumnSaveSpec(money);
    expect(spec.dbOptions.type).toBe(DB_TYPES.NUMERIC);
    expect(spec.metadata?.mon_currency_symbol).toBeDefined();
  });

  test('a new number column carries no symbol', () => {
    expect(abstractTypeToColumnSaveSpec(number).metadata).toBeNull();
  });

  test('changing a number to money gives it a symbol', () => {
    expect(
      mergeMetadataOnTypeChange(money, null).mon_currency_symbol,
    ).toBeDefined();
  });

  test('a symbol already set is kept as it was', () => {
    expect(
      mergeMetadataOnTypeChange(money, { mon_currency_symbol: '£' } as never)
        .mon_currency_symbol,
    ).toBe('£');
  });

  test('changing money to anything else takes the symbol away', () => {
    expect(
      mergeMetadataOnTypeChange(number, { mon_currency_symbol: '£' } as never)
        .mon_currency_symbol,
    ).toBeNull();
  });
});

describe('money and decimal share a DB type without being confused', () => {
  const money = getAbstractTypeForDbType(DB_TYPES.NUMERIC, {
    mon_currency_symbol: '$',
  } as never);
  const number = getAbstractTypeForDbType(DB_TYPES.NUMERIC, null);

  test('picking Money builds a numeric column', () => {
    const spec = getColumnSaveSpec({
      abstractType: money,
      dbType: DB_TYPES.NUMERIC,
    });
    expect(spec.dbOptions.type).toBe(DB_TYPES.NUMERIC);
    expect(spec.metadata?.mon_currency_symbol).toBeDefined();
  });

  test('a numeric money column resolves to the Money kind', () => {
    expect(
      getKindOf({ abstractType: money, dbType: DB_TYPES.NUMERIC }).kind
        .identifier,
    ).toBe('money');
  });

  test('a numeric number column still resolves to Decimal', () => {
    expect(
      getKindOf({ abstractType: number, dbType: DB_TYPES.NUMERIC }).kind
        .identifier,
    ).toBe('decimal');
  });
});
