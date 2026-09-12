import type { RawSchemaType } from '@mathesar/api/rpc/schemas';
import type { DomainRule } from '@mathesar/api/rpc/types';
import { getAbstractTypeForDbType } from '@mathesar/stores/abstract-types';
import { abstractTypeCategory } from '@mathesar/stores/abstract-types/constants';
import type { AbstractTypeCategoryIdentifier } from '@mathesar/stores/abstract-types/types';

/**
 * What a rule can be about, which is what the type the domain is over is like:
 * text has a length, a number has a size, and neither has the other's.
 */
export type RuleSubject = 'text' | 'number' | 'time';

/** What a rule takes a value of, for the rules that take one */
export type RuleValueKind = 'whole_number' | 'value' | 'pattern';

/** A rule a domain can hold its values to */
export interface DomainRuleKind {
  /** The name the rule goes by, here and in the database */
  rule: string;
  subject: RuleSubject[];
  takes?: RuleValueKind;
}

/**
 * The rules, matching the set msar.domain_rule_expression writes. Kept here for
 * their names and what each takes; the database has the last word on whether a
 * rule suits the type, and writes the expression itself.
 */
export const domainRuleKinds: DomainRuleKind[] = [
  { rule: 'not_blank', subject: ['text'] },
  { rule: 'min_length', subject: ['text'], takes: 'whole_number' },
  { rule: 'max_length', subject: ['text'], takes: 'whole_number' },
  { rule: 'matches', subject: ['text'], takes: 'pattern' },
  { rule: 'at_least', subject: ['number', 'time'], takes: 'value' },
  { rule: 'at_most', subject: ['number', 'time'], takes: 'value' },
  { rule: 'positive', subject: ['number'] },
  { rule: 'not_negative', subject: ['number'] },
];

const subjectsByCategory: Partial<
  Record<AbstractTypeCategoryIdentifier, RuleSubject>
> = {
  [abstractTypeCategory.Text]: 'text',
  [abstractTypeCategory.Email]: 'text',
  [abstractTypeCategory.Uri]: 'text',
  [abstractTypeCategory.Number]: 'number',
  [abstractTypeCategory.Money]: 'number',
  [abstractTypeCategory.Date]: 'time',
  [abstractTypeCategory.Time]: 'time',
  [abstractTypeCategory.DateTime]: 'time',
  [abstractTypeCategory.Duration]: 'time',
};

/**
 * What rules the type the domain is over can be given, or undefined for a type
 * that can be given none.
 *
 * A column of arrays or of ranges holds many values rather than one, and a rule
 * is about a value, so neither takes any.
 */
export function getRuleSubject(
  abstractType: AbstractTypeCategoryIdentifier,
  modifiers: { isArray?: boolean; isRange?: boolean } = {},
): RuleSubject | undefined {
  if (modifiers.isArray || modifiers.isRange) return undefined;
  return subjectsByCategory[abstractType];
}

/**
 * What rules a domain the schema already has can be given.
 *
 * The type it is over cannot be changed, so this is settled once, when it is
 * made. Which type that is comes from the one it is ultimately over -- a domain
 * over a domain has the rules of whatever is underneath both -- read as
 * Mathesar reads a column of it, so the rules on offer are the ones the
 * column's own type would take.
 */
export function getRuleSubjectOf(type: RawSchemaType): RuleSubject | undefined {
  const base = type.base_type ?? '';
  if (base.endsWith('[]')) return undefined;
  const dbType = base.replace(/\(.*\)$/, '');
  return getRuleSubject(getAbstractTypeForDbType(dbType, null).identifier);
}

export function getRuleKindsFor(
  subject: RuleSubject | undefined,
): DomainRuleKind[] {
  return subject === undefined
    ? []
    : domainRuleKinds.filter((kind) => kind.subject.includes(subject));
}

/**
 * A rule of a domain while somebody is editing the list of them.
 *
 * One the domain already has is held as the constraint the database reports:
 * its name and the definition to show, neither of which is ours to change. One
 * being added names a rule and the value it is about.
 *
 * The key is what the list is drawn against, since two rules of the same kind
 * being added are otherwise alike.
 */
export type DomainRuleEntry = { key: number } & (
  | { name: string; definition: string }
  | { rule: string; value: string }
);

export function isRuleTheDomainHas(
  entry: DomainRuleEntry,
): entry is { key: number; name: string; definition: string } {
  return 'name' in entry;
}

/** The entries for a domain's rules as they stand, ready to be edited */
export function getRuleEntries(
  type: RawSchemaType | undefined,
): DomainRuleEntry[] {
  return (type?.constraints ?? []).map((constraint, key) => ({
    key,
    ...constraint,
  }));
}

/** A key no entry in the list has, for one about to join it */
export function getNextRuleKey(entries: DomainRuleEntry[]): number {
  return (
    entries.reduce((highest, entry) => Math.max(highest, entry.key), -1) + 1
  );
}

export function withRule(
  entries: DomainRuleEntry[],
  rule: string,
): DomainRuleEntry[] {
  return [...entries, { key: getNextRuleKey(entries), rule, value: '' }];
}

export function withoutRule(
  entries: DomainRuleEntry[],
  key: number,
): DomainRuleEntry[] {
  return entries.filter((entry) => entry.key !== key);
}

export function withRuleValue(
  entries: DomainRuleEntry[],
  key: number,
  value: string,
): DomainRuleEntry[] {
  return entries.map((entry) =>
    entry.key === key && !isRuleTheDomainHas(entry)
      ? { ...entry, value }
      : entry,
  );
}

/** The rules the entries say the domain should hold its values to */
export function getApiRules(entries: DomainRuleEntry[]): DomainRule[] {
  return entries.map((entry) =>
    isRuleTheDomainHas(entry)
      ? { name: entry.name }
      : { rule: entry.rule, value: entry.value.trim() || undefined },
  );
}

/**
 * Why the entries aren't rules that could be saved, as something to say, or
 * undefined when they are.
 */
export function getRuleEntriesError(
  entries: DomainRuleEntry[],
): 'rule_needs_a_value' | 'rule_needs_a_whole_number' | undefined {
  for (const entry of entries) {
    if (isRuleTheDomainHas(entry)) continue;
    const takes = domainRuleKinds.find((kind) => kind.rule === entry.rule)
      ?.takes;
    if (!takes) continue;
    const value = entry.value.trim();
    if (value === '') return 'rule_needs_a_value';
    if (takes === 'whole_number' && !/^\d+$/.test(value)) {
      return 'rule_needs_a_whole_number';
    }
  }
  return undefined;
}
