import {
  type EnumValueEntry,
  getApiValues,
  getDroppedValues,
  getEntries,
  getEntriesError,
  needsRewrite,
  withEntry,
  withEntryMoved,
  withEntryValue,
  withoutEntry,
} from '../enumValues';

const values = ['happy', 'cross', 'sad'];

/** The values of a list of entries, as a line, with a new one marked */
function read(entries: EnumValueEntry[]) {
  return entries
    .map((entry) => (entry.was === undefined ? `+${entry.value}` : entry.value))
    .join(' ');
}

describe('editing the values of a choice', () => {
  test('a choice starts as the values it has', () => {
    expect(read(getEntries(values))).toBe('happy cross sad');
    expect(read(getEntries(undefined))).toBe('');
  });

  test('a value added says it is new, and one removed goes', () => {
    expect(read(withEntry(getEntries(values), 'numb'))).toBe(
      'happy cross sad +numb',
    );
    expect(read(withoutEntry(getEntries(values), 1))).toBe('happy sad');
  });

  test('a value renamed keeps hold of the value it was', () => {
    const renamed = withEntryValue(getEntries(values), 0, 'glad');
    expect(read(renamed)).toBe('glad cross sad');
    expect(getApiValues(renamed)[0]).toEqual({ value: 'glad', was: 'happy' });
  });

  test('a value keeps its key as the list is edited, so its input stays put', () => {
    const edited = withoutEntry(withEntry(getEntries(values)), 0);
    expect(edited.map((entry) => entry.key)).toEqual([1, 2, 3]);
  });

  test('moving a value past the end leaves the list alone', () => {
    const entries = getEntries(values);
    expect(read(withEntryMoved(entries, 1, -1))).toBe('cross happy sad');
    expect(read(withEntryMoved(entries, 2, 1))).toBe('happy cross sad');
    expect(read(withEntryMoved(entries, 0, -1))).toBe('happy cross sad');
  });

  test('a value is written out without the space around it', () => {
    expect(getApiValues(withEntry(getEntries([]), '  numb '))).toEqual([
      { value: 'numb', was: undefined },
    ]);
  });
});

describe('whether the values could be saved', () => {
  test('a choice of nothing is no choice', () => {
    expect(getEntriesError([])).toBe('choice_needs_a_value');
  });

  test('a value has to be something', () => {
    expect(getEntriesError(withEntry(getEntries(values), '   '))).toBe(
      'choice_value_is_empty',
    );
  });

  test('the same value cannot be offered twice, however it is spaced', () => {
    expect(getEntriesError(withEntry(getEntries(values), ' sad'))).toBe(
      'choice_value_repeated',
    );
  });

  test('the values as they stand are fine', () => {
    expect(getEntriesError(getEntries(values))).toBeUndefined();
  });
});

describe('what saving the values would cost', () => {
  test('adding a value leaves every record where it is', () => {
    const added = withEntry(getEntries(values), 'numb');
    expect(needsRewrite(added, values)).toBe(false);
    expect(getDroppedValues(added, values)).toEqual([]);
  });

  test('so does renaming one, wherever it sits', () => {
    const renamed = withEntryValue(getEntries(values), 1, 'furious');
    expect(needsRewrite(renamed, values)).toBe(false);
    expect(getDroppedValues(renamed, values)).toEqual([]);
  });

  test('adding a value in the middle is still only an addition', () => {
    const added = withEntryMoved(withEntry(getEntries(values), 'numb'), 3, -2);
    expect(read(added)).toBe('happy +numb cross sad');
    expect(needsRewrite(added, values)).toBe(false);
  });

  test('dropping a value means rewriting, and says which value', () => {
    const dropped = withoutEntry(getEntries(values), 1);
    expect(needsRewrite(dropped, values)).toBe(true);
    expect(getDroppedValues(dropped, values)).toEqual(['cross']);
  });

  test('so does putting the values in a different order, dropping none', () => {
    const reordered = withEntryMoved(getEntries(values), 2, -2);
    expect(read(reordered)).toBe('sad happy cross');
    expect(needsRewrite(reordered, values)).toBe(true);
    expect(getDroppedValues(reordered, values)).toEqual([]);
  });
});
