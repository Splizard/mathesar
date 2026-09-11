import { formatArray, parseArray } from '../arrayCsv';

describe('arrays as text', () => {
  test('are their values, separated by the delimiter', () => {
    expect(formatArray(['a', 'b'], ',')).toBe('a,b');
    expect(formatArray([1, 2.5], ',')).toBe('1,2.5');
    expect(formatArray(['a', 'b'], ';')).toBe('a;b');
    expect(formatArray([], ',')).toBe('');
    expect(parseArray('a,b', ',')).toEqual(['a', 'b']);
    expect(parseArray('a;b', ';')).toEqual(['a', 'b']);
    expect(parseArray('', ',')).toEqual([]);
    expect(parseArray('a', ',')).toEqual(['a']);
    // Values are kept as they're written, spaces and all
    expect(parseArray('a, b ,', ',')).toEqual(['a', ' b ', '']);
  });

  test('escape the delimiter and the backslash within a value', () => {
    expect(formatArray(['a,b', 'c'], ',')).toBe('a\\,b,c');
    expect(formatArray(['a;b'], ',')).toBe('a;b');
    expect(formatArray(['a;b'], ';')).toBe('a\\;b');
    expect(formatArray(['back\\slash'], ',')).toBe('back\\\\slash');
    expect(parseArray('a\\,b,c', ',')).toEqual(['a,b', 'c']);
    expect(parseArray('back\\\\slash', ',')).toEqual(['back\\slash']);
    // A backslash before anything else is just that character
    expect(parseArray('a\\b', ',')).toEqual(['ab']);
    expect(parseArray('trailing\\', ',')).toEqual(['trailing\\']);
  });

  test('write NULL values as a backslash and N', () => {
    expect(formatArray(['a', null, 'b'], ',')).toBe('a,\\N,b');
    expect(parseArray('a,\\N,b', ',')).toEqual(['a', null, 'b']);
    expect(parseArray('\\N', ',')).toEqual([null]);
    // The text of it is escaped, and stays text
    expect(formatArray(['\\N'], ',')).toBe('\\\\N');
    expect(parseArray('\\\\N', ',')).toEqual(['\\N']);
    expect(parseArray('N', ',')).toEqual(['N']);
  });

  test('are written and read back as they were', () => {
    const values = ['a,b', '\\N', null, '', 'plain', 'back\\slash', ';'];
    for (const delimiter of [',', ';', '|']) {
      expect(parseArray(formatArray(values, delimiter), delimiter)).toEqual(
        values,
      );
    }
  });

  test('show their values as the column does', () => {
    expect(formatArray([1000, 2000], ',', (v) => `${Number(v) / 1000}k`)).toBe(
      '1k,2k',
    );
  });
});
