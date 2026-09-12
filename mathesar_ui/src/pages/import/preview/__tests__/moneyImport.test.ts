import { readable } from 'svelte/store';

import type { RawColumnWithMetadata } from '@mathesar/api/rpc/columns';
import { DB_TYPES } from '@mathesar/stores/abstract-types/dbTypes';

import { getMoneyColumnsToConvert } from '../importPreviewPageUtils';

vi.mock('svelte-i18n', () => {
  const translate = (s: string) => s;
  return { _: readable(translate) };
});

// The import utilities pull in the cell fabric, which reads the app data the
// server injects into the page. None of it matters for deciding what to convert.
vi.mock('@mathesar/utils/preloadData', () => ({
  preloadCommonData: () => ({
    databases: [],
    servers: [],
    file_backends: [],
    system_schemas: [],
    current_release_tag_name: '',
  }),
  preloadRouteData: () => undefined,
  getDefaultFileStorageBackend: () => null,
}));

const column = (id: number, type: string): RawColumnWithMetadata => ({
  id,
  name: `c${id}`,
  description: null,
  type,
  type_options: null,
  nullable: true,
  primary_key: false,
  default: null,
  has_dependents: false,
  current_role_priv: ['SELECT'],
  metadata: null,
});

const props = (
  id: number,
  castOptions: Record<string, unknown>,
  selected = true,
) => ({ [id]: { selected, displayName: `c${id}`, castOptions } });

describe('money columns are converted after import', () => {
  test('a money column becomes numeric, keeping its symbol', () => {
    const { patches, metadata } = getMoneyColumnsToConvert(
      [column(2, DB_TYPES.MSAR__MATHESAR_MONEY)],
      props(2, { curr_pref: '$', curr_suff: '' }) as never,
    );
    expect(patches).toEqual([{ id: 2, type: DB_TYPES.NUMERIC }]);
    expect(metadata).toEqual([{ attnum: 2, mon_currency_symbol: '$' }]);
  });

  test('a symbol written after the amount is remembered as such', () => {
    const { metadata } = getMoneyColumnsToConvert(
      [column(2, DB_TYPES.MSAR__MATHESAR_MONEY)],
      props(2, { curr_pref: '', curr_suff: '€' }) as never,
    );
    expect(metadata).toEqual([
      {
        attnum: 2,
        mon_currency_symbol: '€',
        mon_currency_location: 'end-with-space',
      },
    ]);
  });

  test('columns of other types are left alone', () => {
    const { patches } = getMoneyColumnsToConvert(
      [column(2, DB_TYPES.NUMERIC), column(3, DB_TYPES.TEXT)],
      { ...props(2, {}), ...props(3, {}) } as never,
    );
    expect(patches).toEqual([]);
  });

  test('a column the user deselected is not converted', () => {
    const { patches } = getMoneyColumnsToConvert(
      [column(2, DB_TYPES.MSAR__MATHESAR_MONEY)],
      props(2, { curr_pref: '$' }, false) as never,
    );
    expect(patches).toEqual([]);
  });
});
