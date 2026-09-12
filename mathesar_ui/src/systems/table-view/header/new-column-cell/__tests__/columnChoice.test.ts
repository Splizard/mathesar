import type { RawSchemaType } from '@mathesar/api/rpc/schemas';
import { getEntries, withEntry } from '@mathesar/systems/ontology/enumValues';

import { getChoiceColumnSpec, getChoiceError } from '../columnChoice';

const priority: RawSchemaType = {
  oid: 1,
  name: 'priority',
  kind: 'enum',
  description: null,
  values: ['low', 'high'],
  used_by: [],
};

describe('asking for a column of a choice', () => {
  test('a choice the schema has is named, with nothing else to say', () => {
    expect(getChoiceColumnSpec({ schemaType: priority }, 'public')).toEqual({
      type: '"public"."priority"',
      type_options: {},
    });
  });

  test('a name is quoted, whatever is in it', () => {
    expect(
      getChoiceColumnSpec(
        { schemaType: { ...priority, name: 'the "big" one' } },
        'Hidden Strings',
      ).type,
    ).toBe('"Hidden Strings"."the ""big"" one"');
  });

  test('a new choice is asked for by its values', () => {
    expect(
      getChoiceColumnSpec(
        { entries: withEntry(getEntries([]), 'low') },
        'public',
      ),
    ).toEqual({
      type: '_enum',
      type_options: { enum_values: [{ value: 'low', was: undefined }] },
    });
  });
});

describe('whether a column could be added for the choice', () => {
  test('a choice the schema has always could', () => {
    expect(getChoiceError({ schemaType: priority })).toBeUndefined();
  });

  test('a new choice has to offer something', () => {
    expect(getChoiceError({ entries: [] })).toBe('choice_needs_a_value');
    expect(getChoiceError({ entries: withEntry(getEntries([]), ' ') })).toBe(
      'choice_value_is_empty',
    );
    expect(
      getChoiceError({ entries: withEntry(getEntries([]), 'low') }),
    ).toBeUndefined();
  });
});
