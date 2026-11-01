import Pagination from '@mathesar/utils/Pagination';

import { RowOrigin, combineRecordRowsWithGroupHeaders } from '../display';
import {
  DraftRecordRow,
  type GroupAddRecordRow,
  PersistedRecordRow,
  RowType,
} from '../Row';
import { type RecordGrouping, getGroupKey } from '../utils';

const grouping: RecordGrouping = {
  columnIds: [2],
  preprocIds: [null],
  groups: [
    { count: 1, eqValue: { 2: 'a' }, resultIndices: [0] },
    { count: 1, eqValue: { 2: 'b' }, resultIndices: [1] },
  ],
};

const recordRows = [
  new PersistedRecordRow({ record: { 1: 1, 2: 'a' } }),
  new PersistedRecordRow({ record: { 1: 2, 2: 'b' } }),
];

function combine(
  newRecords: DraftRecordRow[],
  newRecordGroupKeys: Map<string, string>,
  canAddToGroups = true,
) {
  return combineRecordRowsWithGroupHeaders({
    recordRows,
    newRecords,
    newRecordGroupKeys,
    grouping,
    pagination: new Pagination(),
    totalCount: 2,
    canAddToGroups,
  });
}

describe('combineRecordRowsWithGroupHeaders', () => {
  test('closes each group with a row that adds to it', () => {
    const { rows } = combine([], new Map());
    expect(rows.map((d) => d.row.type)).toEqual([
      RowType.GroupHeader,
      RowType.PersistedRecord,
      RowType.GroupAddRecord,
      RowType.GroupHeader,
      RowType.PersistedRecord,
      RowType.GroupAddRecord,
    ]);
    const addRow = rows[2].row as GroupAddRecordRow;
    expect(addRow.groupValues).toEqual({ 2: 'a' });
    expect(addRow.groupKey).toBe(getGroupKey(grouping.groups[0], grouping));
  });

  test('offers no add rows where records cannot be added to groups', () => {
    const { rows } = combine([], new Map(), false);
    expect(rows.some((d) => d.row.type === RowType.GroupAddRecord)).toBe(false);
  });

  test('shows a record added to a group within that group', () => {
    const inB = new DraftRecordRow({ record: { 2: 'b' } });
    const loose = new DraftRecordRow({ record: {} });
    const keys = new Map([
      [inB.identifier, getGroupKey(grouping.groups[1], grouping)],
    ]);
    const { rows, ungroupedNewRecords } = combine([inB, loose], keys);
    expect(rows.map((d) => d.row.identifier).slice(3)).toEqual([
      rows[3].row.identifier, // group b's header
      recordRows[1].identifier,
      inB.identifier,
      rows[6].row.identifier, // group b's add row
    ]);
    expect(rows[5].rowOrigin).toBe(RowOrigin.NewlyCreatedViaUi);
    expect(ungroupedNewRecords.map((d) => d.row)).toEqual([loose]);
  });

  test('a record whose group is not on the page goes to the bottom', () => {
    const elsewhere = new DraftRecordRow({ record: { 2: 'z' } });
    const keys = new Map([[elsewhere.identifier, 'not a group here']]);
    const { ungroupedNewRecords } = combine([elsewhere], keys);
    expect(ungroupedNewRecords.map((d) => d.row)).toEqual([elsewhere]);
  });

  test('a saved new record already fetched is shown once', () => {
    const saved = new PersistedRecordRow({
      identifier: recordRows[0].identifier,
      record: recordRows[0].record,
    });
    const keys = new Map([
      [saved.identifier, getGroupKey(grouping.groups[0], grouping)],
    ]);
    const { rows, ungroupedNewRecords } = combineRecordRowsWithGroupHeaders({
      recordRows,
      newRecords: [saved],
      newRecordGroupKeys: keys,
      grouping,
      pagination: new Pagination(),
      totalCount: 2,
      canAddToGroups: true,
    });
    const ids = rows.map((d) => d.row.identifier);
    expect(ids.filter((id) => id === saved.identifier)).toHaveLength(1);
    expect(ungroupedNewRecords).toEqual([]);
  });
});
