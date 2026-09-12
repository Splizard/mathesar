import {
  formatMultirange,
  formatRange,
  parseMultirange,
  parseRange,
} from '../rangeValue';

describe('ranges', () => {
  test('are read from the text PostgreSQL writes', () => {
    expect(parseRange('[1,10)')).toEqual({
      lower: '1',
      upper: '10',
      lowerInclusive: true,
      upperInclusive: false,
      isEmpty: false,
    });
    expect(parseRange('(1,10]')).toMatchObject({
      lowerInclusive: false,
      upperInclusive: true,
    });
    expect(parseRange('empty')).toMatchObject({ isEmpty: true });
    expect(parseRange('[1,)')).toMatchObject({ lower: '1', upper: undefined });
    expect(parseRange('(,5)')).toMatchObject({ lower: undefined, upper: '5' });
    expect(parseRange('(,)')).toMatchObject({
      lower: undefined,
      upper: undefined,
    });
    expect(
      parseRange('["2024-01-01 00:00:00","2024-02-01 00:00:00")'),
    ).toMatchObject({
      lower: '2024-01-01 00:00:00',
      upper: '2024-02-01 00:00:00',
    });
    // Quotes within a bound are doubled or escaped
    expect(parseRange('["a,b","c""d")')).toMatchObject({
      lower: 'a,b',
      upper: 'c"d',
    });
    expect(parseRange('["a\\"b","c")')).toMatchObject({ lower: 'a"b' });
  });

  test('are not read from anything else', () => {
    expect(parseRange('1,10')).toBeUndefined();
    expect(parseRange('[1,10')).toBeUndefined();
    expect(parseRange('[1;10)')).toBeUndefined();
    expect(parseRange('[1,10)x')).toBeUndefined();
    expect(parseRange('')).toBeUndefined();
  });

  test('are written as PostgreSQL takes them', () => {
    const range = {
      lower: '1',
      upper: '10',
      lowerInclusive: true,
      upperInclusive: false,
      isEmpty: false,
    };
    expect(formatRange(range)).toBe('[1,10)');
    expect(formatRange({ ...range, upperInclusive: true })).toBe('[1,10]');
    expect(formatRange({ ...range, isEmpty: true })).toBe('empty');
    expect(formatRange({ ...range, upper: undefined })).toBe('[1,)');
    expect(formatRange({ ...range, lower: undefined, upper: undefined })).toBe(
      '[,)',
    );
    expect(formatRange({ ...range, lower: 'a,b' })).toBe('["a,b",10)');
    expect(formatRange({ ...range, lower: 'a"b' })).toBe('["a\\"b",10)');
    expect(formatRange({ ...range, lower: 'empty' })).toBe('["empty",10)');
  });

  test('round-trip through their text', () => {
    for (const text of [
      '[1,10)',
      '(1,10]',
      '[1,)',
      '(,5)',
      'empty',
      '["a,b",c]',
    ]) {
      const range = parseRange(text);
      expect(range && formatRange(range)).toBe(text);
    }
  });
});

describe('multiranges', () => {
  test('are the ranges between their braces', () => {
    expect(parseMultirange('{}')).toEqual([]);
    expect(parseMultirange('{[1,3)}')).toHaveLength(1);
    const ranges = parseMultirange('{[1,3),[10,20)}');
    expect(ranges).toHaveLength(2);
    expect(ranges?.[1]).toMatchObject({ lower: '10', upper: '20' });
    // A comma within a bound doesn't separate ranges
    expect(parseMultirange('{["a,b","c,d")}')).toHaveLength(1);
    expect(
      parseMultirange('{["2024-01-01 00:00:00","2024-02-01 00:00:00")}'),
    ).toHaveLength(1);
    expect(parseMultirange('[1,3)')).toBeUndefined();
    expect(parseMultirange('{[1,3}')).toBeUndefined();
  });

  test('are written without the ranges holding nothing', () => {
    const ranges = parseMultirange('{[1,3),[10,20)}') ?? [];
    expect(formatMultirange(ranges)).toBe('{[1,3),[10,20)}');
    expect(formatMultirange([])).toBe('{}');
    expect(
      formatMultirange([
        ...ranges,
        {
          lowerInclusive: true,
          upperInclusive: false,
          isEmpty: true,
        },
      ]),
    ).toBe('{[1,3),[10,20)}');
  });
});
