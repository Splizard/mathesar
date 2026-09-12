import {
  byCanonicalRecordName,
  canonicalRecordNameKey,
  isCompositeName,
  recordNameFromText,
  recordNameFromUrl,
  recordNameToText,
} from '../recordName';

describe('what a record is called', () => {
  test('a name of one value is written the way it always was', () => {
    expect(recordNameToText(3)).toBe('3');
    expect(recordNameToText('abc')).toBe('abc');
    expect(isCompositeName(3)).toBe(false);
  });

  test('a name of several values is written as JSON', () => {
    expect(recordNameToText(['lotus', 'lp'])).toBe('["lotus","lp"]');
    expect(isCompositeName(['lotus', 'lp'])).toBe(true);
  });

  test('and read back as the values it was written from', () => {
    expect(recordNameFromText('["lotus","lp"]')).toEqual(['lotus', 'lp']);
    expect(recordNameFromText('["lotus", "lp"]')).toEqual(['lotus', 'lp']);
    expect(recordNameFromText('[1,2]')).toEqual([1, 2]);
  });

  test('anything that is not a JSON array is the string it is', () => {
    // A record's name has always arrived from a URL as a string, and still does.
    expect(recordNameFromText('3')).toBe('3');
    expect(recordNameFromText('abc')).toBe('abc');
    // Text that starts like an array and is not one is not mangled into one.
    expect(recordNameFromText('[not json')).toBe('[not json');
    expect(recordNameFromText('[1, 2')).toBe('[1, 2');
  });

  test('a name written at either end keys the same thing', () => {
    // Postgres writes the spaces; the browser does not.
    expect(canonicalRecordNameKey('["lotus", "lp"]')).toBe('["lotus","lp"]');
    expect(canonicalRecordNameKey('["lotus","lp"]')).toBe('["lotus","lp"]');
    expect(canonicalRecordNameKey('["lotus", "lp"]')).toBe(
      recordNameToText(['lotus', 'lp']),
    );
  });

  test('a name of one value keys itself, whatever it looks like', () => {
    expect(canonicalRecordNameKey('3')).toBe('3');
    expect(canonicalRecordNameKey('abc')).toBe('abc');
    expect(canonicalRecordNameKey('[unclosed')).toBe('[unclosed');
  });

  test('a whole map of them is keyed the same way', () => {
    expect(
      byCanonicalRecordName([
        ['["a", "b"]', 'first'],
        ['7', 'second'],
      ]),
    ).toEqual([
      ['["a","b"]', 'first'],
      ['7', 'second'],
    ]);
  });
});

describe('reading a name out of a URL', () => {
  test('the escaping the link put there is undone', () => {
    expect(recordNameFromUrl('%5B%22abc%22%2C%22LP%22%5D')).toEqual([
      'abc',
      'LP',
    ]);
  });

  test('an ordinary id comes through as it always did', () => {
    expect(recordNameFromUrl('3')).toBe('3');
    expect(recordNameFromUrl('a%20b')).toBe('a b');
  });

  test('a segment escaped wrongly is taken at face value', () => {
    expect(recordNameFromUrl('100%')).toBe('100%');
  });
});
