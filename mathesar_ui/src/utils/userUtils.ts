import type { User } from '@mathesar/api/rpc/users';

export type UserDisplayField = 'full_name' | 'email' | 'username';

/** Whether a user is an agent somebody set going rather than a person */
export function isAgent(user: User): boolean {
  return user.owner !== null;
}

/**
 * Get a display label for a user based on the specified display field.
 *
 * An agent is always shown by the name the server composed for it, which carries its
 * owner -- "Quentin's Claude" -- because an agent's own name is only unique among its
 * owner's agents and any single field would name two different agents on a Mathesar that
 * two people share.
 *
 * @param user - The user object
 * @param displayField - Which field to display ('full_name', 'email', or 'username')
 * @returns The formatted user label, or the user ID as a string if the field is empty
 *
 * @example
 * ```ts
 * const label = getUserLabel(user, 'full_name');
 * // Returns "John Doe" if full_name exists, otherwise "123" (user.id)
 * ```
 */
export function getUserLabel(
  user: User,
  displayField: UserDisplayField = 'full_name',
): string {
  if (isAgent(user)) {
    return user.display_name || String(user.id);
  }
  const fieldValue = user[displayField];
  if (fieldValue && typeof fieldValue === 'string' && fieldValue.trim() !== '') {
    return fieldValue;
  }
  return String(user.id);
}

/**
 * The label for a user in a picker, where the person choosing is known.
 *
 * Your own agent is just its name: "Quentin's Claude" in your own list is noise, the way
 * an app says "you" rather than your name. Somebody else's keeps the possessive, because
 * that is the whole of what tells two agents called "Claude" apart.
 *
 * A stored cell keeps the long form either way -- a table should read the same to
 * everybody it is shown to, and only a picker knows who is looking.
 */
export function getUserPickerLabel(
  user: User,
  displayField: UserDisplayField = 'full_name',
  viewerId?: string,
): string {
  if (isAgent(user) && user.owner === viewerId) {
    return user.full_name || user.display_name || String(user.id);
  }
  return getUserLabel(user, displayField);
}

/**
 * Users in the order a picker should offer them: each person, then the agents they set
 * going, so that an agent is read next to whoever is answerable for it.
 */
export function byOwnerThenName(users: User[]): User[] {
  const personOf = (user: User) =>
    isAgent(user) ? users.find((u) => u.id === user.owner) : user;
  return [...users].sort((a, b) => {
    const personA = personOf(a)?.username ?? a.owner ?? '';
    const personB = personOf(b)?.username ?? b.owner ?? '';
    if (personA !== personB) return personA.localeCompare(personB);
    // The person themselves comes before the agents they set going.
    if (isAgent(a) !== isAgent(b)) return isAgent(a) ? 1 : -1;
    return (a.full_name ?? '').localeCompare(b.full_name ?? '');
  });
}
