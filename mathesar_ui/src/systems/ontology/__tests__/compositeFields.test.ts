import type { RawSchemaType } from '@mathesar/api/rpc/schemas';

import {
  type CompositeFieldEntry,
  getApiFields,
  getDroppedFields,
  getFieldEntries,
  getFieldEntriesError,
  withField,
  withFieldName,
  withoutField,
} from '../compositeFields';

const addr: RawSchemaType = {
  oid: 1,
  name: 'Address',
  kind: 'composite',
  description: null,
  used_by: [],
  fields: [
    { name: 'street', type: 'text' },
    { name: 'postcode', type: 'character varying(10)' },
  ],
};

describe('getFieldEntries', () => {
  test('holds each field as the one it stands for', () => {
    expect(getFieldEntries(addr)).toEqual([
      {
        key: 0,
        name: 'street',
        was: 'street',
        held: 'text',
        type: { name: 'text', options: {} },
        typeIsValid: true,
      },
      {
        key: 1,
        name: 'postcode',
        was: 'postcode',
        held: 'character varying(10)',
        type: { name: 'text', options: {} },
        typeIsValid: true,
      },
    ]);
  });

  test('gives a type being made no fields to start from', () => {
    expect(getFieldEntries(undefined)).toEqual([]);
  });
});

describe('editing the entries', () => {
  test('a field added is text until something says otherwise', () => {
    expect(withField([])).toEqual([
      {
        key: 0,
        name: '',
        type: { name: 'text', options: {} },
        typeIsValid: true,
      },
    ]);
  });

  test('a field added takes a key no other field has', () => {
    const entries = withField(withField(getFieldEntries(addr)));
    expect(entries.map((entry) => entry.key)).toEqual([0, 1, 2, 3]);
  });

  test('a name is typed into the field it belongs to', () => {
    const entries = withFieldName(getFieldEntries(addr), 1, 'zip');
    expect(entries.map((entry) => entry.name)).toEqual(['street', 'zip']);
    expect(entries[1].was).toBe('postcode');
  });

  test('a field taken off leaves the rest alone', () => {
    expect(withoutField(getFieldEntries(addr), 0).map((e) => e.name)).toEqual([
      'postcode',
    ]);
  });
});

describe('getApiFields', () => {
  test('says which field each kept one was, and the type of each new one', () => {
    const entries = withField(
      withFieldName(withoutField(getFieldEntries(addr), 1), 0, 'road'),
    );
    expect(getApiFields(withFieldName(entries, 1, ' country '))).toEqual([
      { name: 'road', was: 'street' },
      { name: 'country', type: { name: 'text', options: {} } },
    ]);
  });
});

describe('getDroppedFields', () => {
  test('names the fields the entries no longer have', () => {
    expect(
      getDroppedFields(withoutField(getFieldEntries(addr), 0), addr),
    ).toEqual(['street']);
  });

  test('counts a renamed field as kept', () => {
    const entries = withFieldName(getFieldEntries(addr), 0, 'road');
    expect(getDroppedFields(entries, addr)).toEqual([]);
  });
});

describe('getFieldEntriesError', () => {
  const entry = (over: Partial<CompositeFieldEntry>): CompositeFieldEntry => ({
    key: 0,
    name: 'street',
    type: { name: 'text', options: {} },
    typeIsValid: true,
    ...over,
  });

  test('accepts fields with names and finished types', () => {
    expect(getFieldEntriesError(getFieldEntries(addr))).toBe(undefined);
  });

  test('wants at least one field, a record of nothing being no use', () => {
    expect(getFieldEntriesError([])).toBe('composite_needs_a_field');
  });

  test('wants a name for every field', () => {
    expect(getFieldEntriesError([entry({ name: '  ' })])).toBe(
      'field_needs_a_name',
    );
  });

  test('refuses two fields of the same name', () => {
    expect(
      getFieldEntriesError([entry({}), entry({ key: 1, name: 'street' })]),
    ).toBe('field_name_repeated');
  });

  test('waits for a type still being asked about', () => {
    expect(getFieldEntriesError([entry({ typeIsValid: false })])).toBe(
      'field_type_is_unfinished',
    );
  });
});
