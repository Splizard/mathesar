import type { SavedTableFilter } from '@mathesar/api/rpc/tables';
import type { TerseFiltering } from '@mathesar/stores/table-data';

import {
  getAppliedFilterName,
  withSavedFilter,
  withoutSavedFilter,
} from '../savedFilters';

const unpaid: TerseFiltering = ['g', 'and', [['i', '4', 'equal', false]]];
const big: TerseFiltering = ['g', 'and', [['i', '3', 'greater', 100]]];
const saved: SavedTableFilter[] = [
  { name: 'Unpaid', filter: unpaid },
  { name: 'Big', filter: big },
];

describe('getAppliedFilterName', () => {
  test('names the filter now applied when it is one that was kept', () => {
    expect(getAppliedFilterName(saved, big)).toBe('Big');
  });

  test('and names nothing when it is not', () => {
    const other: TerseFiltering = ['g', 'and', [['i', '3', 'greater', 5]]];
    expect(getAppliedFilterName(saved, other)).toBeUndefined();
    expect(getAppliedFilterName(saved, ['g', 'and', []])).toBeUndefined();
  });

  // The same conditions asked in the other order is a different filter written
  // down, and telling them apart is better than claiming they are the same.
  test('by what was asked rather than by what it matches', () => {
    const reversed: TerseFiltering = [
      'g',
      'and',
      [
        ['i', '3', 'greater', 100],
        ['i', '4', 'equal', false],
      ],
    ];
    expect(getAppliedFilterName(saved, reversed)).toBeUndefined();
  });
});

describe('withSavedFilter', () => {
  test('keeps a new filter after the ones already kept', () => {
    expect(withSavedFilter(saved, 'Mine', big).map((e) => e.name)).toEqual([
      'Unpaid',
      'Big',
      'Mine',
    ]);
  });

  test('and saving over a name replaces it in its place', () => {
    const result = withSavedFilter(saved, 'Unpaid', big);
    expect(result.map((e) => e.name)).toEqual(['Unpaid', 'Big']);
    expect(result[0].filter).toEqual(big);
  });
});

describe('withoutSavedFilter', () => {
  test('drops the one of that name and leaves the rest', () => {
    expect(withoutSavedFilter(saved, 'Unpaid')).toEqual([
      { name: 'Big', filter: big },
    ]);
    expect(withoutSavedFilter(saved, 'Nothing')).toEqual(saved);
  });
});
