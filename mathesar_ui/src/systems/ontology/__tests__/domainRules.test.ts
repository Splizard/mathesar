import { abstractTypeCategory } from '@mathesar/stores/abstract-types/constants';

import {
  type DomainRuleEntry,
  getApiRules,
  getRuleEntries,
  getRuleEntriesError,
  getRuleKindsFor,
  getRuleSubject,
  withRule,
  withRuleValue,
  withoutRule,
} from '../domainRules';

const kindsOf = (entries: ReturnType<typeof getRuleKindsFor>) =>
  entries.map((kind) => kind.rule);

describe('getRuleSubject', () => {
  test('says what the rules over a type can be about', () => {
    expect(getRuleSubject(abstractTypeCategory.Text)).toBe('text');
    expect(getRuleSubject(abstractTypeCategory.Email)).toBe('text');
    expect(getRuleSubject(abstractTypeCategory.Number)).toBe('number');
    expect(getRuleSubject(abstractTypeCategory.Date)).toBe('time');
  });

  test('leaves a type with nothing to say about it without rules', () => {
    expect(getRuleSubject(abstractTypeCategory.Boolean)).toBeUndefined();
    expect(getRuleSubject(abstractTypeCategory.Uuid)).toBeUndefined();
  });

  test('takes no rules for a column of many values', () => {
    expect(
      getRuleSubject(abstractTypeCategory.Text, { isArray: true }),
    ).toBeUndefined();
    expect(
      getRuleSubject(abstractTypeCategory.Number, { isRange: true }),
    ).toBeUndefined();
  });
});

describe('getRuleKindsFor', () => {
  test('offers the rules that suit what they are about', () => {
    expect(kindsOf(getRuleKindsFor('text'))).toEqual([
      'not_blank',
      'min_length',
      'max_length',
      'matches',
    ]);
    expect(kindsOf(getRuleKindsFor('number'))).toEqual([
      'at_least',
      'at_most',
      'positive',
      'not_negative',
    ]);
    expect(kindsOf(getRuleKindsFor('time'))).toEqual(['at_least', 'at_most']);
    expect(kindsOf(getRuleKindsFor(undefined))).toEqual([]);
  });
});

describe('the list of rules', () => {
  const existing = getRuleEntries({
    oid: 1,
    name: 'Email',
    kind: 'domain',
    description: null,
    used_by: [],
    constraints: [
      { name: 'matches', definition: "CHECK ((VALUE ~ '@'::text))" },
      { name: 'max_length', definition: 'CHECK ((length(VALUE) <= 200))' },
    ],
  });

  test('holds a rule the domain has as the database reports it', () => {
    expect(existing).toEqual([
      { key: 0, name: 'matches', definition: "CHECK ((VALUE ~ '@'::text))" },
      {
        key: 1,
        name: 'max_length',
        definition: 'CHECK ((length(VALUE) <= 200))',
      },
    ]);
  });

  test('asks for the rules kept by name and the new ones by what they say', () => {
    const entries = withRuleValue(
      withoutRule(withRule(existing, 'min_length'), 0),
      2,
      '5',
    );
    expect(getApiRules(entries)).toEqual([
      { name: 'max_length' },
      { rule: 'min_length', value: '5' },
    ]);
  });

  test('gives a new rule a key of its own, so two of a kind are two rows', () => {
    const entries = withRule(withRule(existing, 'max_length'), 'max_length');
    expect(entries.map((entry) => entry.key)).toEqual([0, 1, 2, 3]);
  });

  test('leaves a rule the domain has alone when a value is typed at its key', () => {
    expect(withRuleValue(existing, 0, 'anything')).toEqual(existing);
  });
});

describe('getRuleEntriesError', () => {
  const entry = (rule: string, value: string): DomainRuleEntry => ({
    key: 0,
    rule,
    value,
  });

  test('passes the rules that are ready to be saved', () => {
    expect(getRuleEntriesError([])).toBeUndefined();
    expect(getRuleEntriesError([entry('max_length', '50')])).toBeUndefined();
    expect(getRuleEntriesError([entry('not_blank', '')])).toBeUndefined();
    expect(getRuleEntriesError([entry('matches', '^a')])).toBeUndefined();
  });

  test('wants a value for the rules that are about one', () => {
    expect(getRuleEntriesError([entry('max_length', ' ')])).toBe(
      'rule_needs_a_value',
    );
    expect(getRuleEntriesError([entry('at_least', '')])).toBe(
      'rule_needs_a_value',
    );
  });

  test('wants a length to be a count of characters', () => {
    expect(getRuleEntriesError([entry('min_length', '2.5')])).toBe(
      'rule_needs_a_whole_number',
    );
    expect(getRuleEntriesError([entry('at_least', '2.5')])).toBeUndefined();
  });
});
