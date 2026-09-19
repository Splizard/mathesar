import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { UserTableView } from '@mathesar/api/rpc/tables';

import UserTableViewKeeper from '../UserTableViewKeeper';

const pets = { databaseId: 1, tableOid: 100 };
const plants = { databaseId: 1, tableOid: 200 };
const nothing: UserTableView = {
  filtering: ['g', 'and', []],
  hidden_columns: [],
};
const cats: UserTableView = {
  filtering: ['g', 'and', [['i', '2', 'contains', 'cat']]],
  hidden_columns: [],
};
const catsNoPhoto: UserTableView = { ...cats, hidden_columns: ['3'] };

describe('UserTableViewKeeper', () => {
  let kept: [typeof pets, UserTableView][];
  let keeper: UserTableViewKeeper;

  beforeEach(() => {
    vi.useFakeTimers();
    kept = [];
    keeper = new UserTableViewKeeper(async (table, view) => {
      kept.push([table, view]);
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('what a table was opened with is not kept', () => {
    keeper.note(pets, cats);
    vi.runAllTimers();
    expect(kept).toEqual([]);
  });

  test('a change is kept once it has settled, and only the last of several', () => {
    keeper.note(pets, nothing);
    keeper.note(pets, cats);
    vi.advanceTimersByTime(500);
    keeper.note(pets, catsNoPhoto);
    vi.advanceTimersByTime(500);
    expect(kept).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(kept).toEqual([[pets, catsNoPhoto]]);
  });

  test('noting the same view again is not a change', () => {
    keeper.note(pets, cats);
    keeper.note(pets, { ...cats });
    vi.runAllTimers();
    expect(kept).toEqual([]);
  });

  test('leaving keeps a change still waiting', () => {
    keeper.note(pets, nothing);
    keeper.note(pets, cats);
    keeper.flush();
    expect(kept).toEqual([[pets, cats]]);
    vi.runAllTimers();
    expect(kept).toHaveLength(1);
  });

  test('moving to another table keeps the first one change and starts afresh', () => {
    keeper.note(pets, nothing);
    keeper.note(pets, cats);
    keeper.note(plants, catsNoPhoto);
    expect(kept).toEqual([[pets, cats]]);
    vi.runAllTimers();
    expect(kept).toHaveLength(1);
  });
});
