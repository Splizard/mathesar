import { ImmutableSet } from '@mathesar-component-library';

import { Direction } from '../Direction';
import Plane from '../Plane';
import Series from '../Series';

test('Plane with placeholder row', () => {
  const p = new Plane(
    new Series(['r1', 'r2', 'r3', 'r4']),
    new Series(['c1', 'c2', 'c3', 'c4']),
    'PH',
    new ImmutableSet(),
  );

  expect([...p.allDataCells()]).toEqual([
    '["r1","c1"]',
    '["r1","c2"]',
    '["r1","c3"]',
    '["r1","c4"]',
    '["r2","c1"]',
    '["r2","c2"]',
    '["r2","c3"]',
    '["r2","c4"]',
    '["r3","c1"]',
    '["r3","c2"]',
    '["r3","c3"]',
    '["r3","c4"]',
    '["r4","c1"]',
    '["r4","c2"]',
    '["r4","c3"]',
    '["r4","c4"]',
  ]);

  expect([...p.dataCellsInFlexibleRowRange('r1', 'r2')].length).toBe(8);
  expect([...p.dataCellsInFlexibleRowRange('r1', 'r3')].length).toBe(12);
  expect([...p.dataCellsInFlexibleRowRange('r3', 'r4')].length).toBe(8);
  expect([...p.dataCellsInFlexibleRowRange('r3', 'PH')].length).toBe(8);
  expect([...p.dataCellsInFlexibleRowRange('PH', 'PH')]).toEqual([
    '["r4","c1"]',
    '["r4","c2"]',
    '["r4","c3"]',
    '["r4","c4"]',
  ]);

  expect([...p.dataCellsInColumnRange('c1', 'c2')].length).toBe(8);
  expect([...p.dataCellsInColumnRange('c1', 'c3')].length).toBe(12);

  expect(p.getAdjacentCell('["r4","c4"]', Direction.Up)).toEqual({
    type: 'dataCell',
    cellId: '["r3","c4"]',
  });
  expect(p.getAdjacentCell('["r4","c4"]', Direction.Right)).toEqual({
    type: 'none',
  });
  expect(p.getAdjacentCell('["r4","c4"]', Direction.Down)).toEqual({
    type: 'placeholderCell',
    cellId: '["PH","c4"]',
  });
  expect(p.getAdjacentCell('["r4","c4"]', Direction.Left)).toEqual({
    type: 'dataCell',
    cellId: '["r4","c3"]',
  });
});

test('Plane with a placeholder row closing each group', () => {
  // g1: r1 r2 P1, g2: r3 P2, then the bottom placeholder PH
  const p = new Plane(
    new Series(['r1', 'r2', 'r3']),
    new Series(['c1', 'c2']),
    'PH',
    new ImmutableSet(),
    {
      rowIds: new ImmutableSet(['P1', 'P2']),
      order: new Series(['r1', 'r2', 'P1', 'r3', 'P2']),
    },
  );
  const cell = (r: string, c: string) => JSON.stringify([r, c]);

  expect(p.isPlaceholderRowId('P1')).toBe(true);
  expect(p.isPlaceholderRowId('PH')).toBe(true);
  expect(p.isPlaceholderRowId('r1')).toBe(false);

  // Down from a group's last row goes into its placeholder row, then on into
  // the next group
  expect(p.getAdjacentCell(cell('r2', 'c1'), Direction.Down)).toEqual({
    type: 'placeholderCell',
    cellId: cell('P1', 'c1'),
  });
  expect(p.getAdjacentCell(cell('P1', 'c1'), Direction.Down)).toEqual({
    type: 'dataCell',
    cellId: cell('r3', 'c1'),
  });
  expect(p.getAdjacentCell(cell('P1', 'c1'), Direction.Up)).toEqual({
    type: 'dataCell',
    cellId: cell('r2', 'c1'),
  });
  expect(p.getAdjacentCell(cell('P1', 'c1'), Direction.Right)).toEqual({
    type: 'placeholderCell',
    cellId: cell('P1', 'c2'),
  });
  expect(p.getAdjacentCell(cell('P2', 'c1'), Direction.Down)).toEqual({
    type: 'placeholderCell',
    cellId: cell('PH', 'c1'),
  });
  expect(p.getAdjacentCell(cell('PH', 'c1'), Direction.Up)).toEqual({
    type: 'placeholderCell',
    cellId: cell('P2', 'c1'),
  });

  // A range reaching into a group's placeholder row stops at the row above it
  expect([...p.dataCellsInFlexibleRowRange('r1', 'P1')]).toHaveLength(4);
  expect([...p.dataCellsInFlexibleRowRange('P2', 'P2')]).toEqual([
    cell('r3', 'c1'),
    cell('r3', 'c2'),
  ]);
});
