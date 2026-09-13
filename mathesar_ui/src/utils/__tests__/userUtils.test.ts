import type { User } from '@mathesar/api/rpc/users';

import {
  byOwnerThenName,
  getUserLabel,
  getUserPickerLabel,
  isAgent,
} from '../userUtils';

function person(username: string, fullName?: string): User {
  return {
    id: `id-${username}`,
    username,
    full_name: fullName ?? null,
    email: `${username}@example.com`,
    display_language: 'en',
    is_superuser: false,
    owner: null,
    agent_model: '',
    display_name: fullName ?? username,
    has_certificate: false,
    cert_expires_at: null,
  };
}

function agent(owner: User, name: string): User {
  const ownerLabel = owner.full_name ?? owner.username;
  return {
    id: `id-${owner.username}-${name}`,
    username: `${owner.username}__${name.toLowerCase()}`,
    full_name: name,
    email: `${owner.username}+${name.toLowerCase()}@example.com`,
    display_language: 'en',
    is_superuser: false,
    owner: owner.id,
    agent_model: 'claude',
    display_name: `${ownerLabel}'s ${name}`,
    has_certificate: false,
    cert_expires_at: null,
  };
}

const quentin = person('quentin', 'Quentin');
const bligh = person('bligh', 'Bligh');

describe('isAgent', () => {
  test('a person is not one', () => {
    expect(isAgent(quentin)).toBe(false);
  });

  test('a user with an owner is one', () => {
    expect(isAgent(agent(quentin, 'Claude'))).toBe(true);
  });
});

describe('getUserLabel', () => {
  test('a person is shown by the field asked for', () => {
    expect(getUserLabel(quentin, 'full_name')).toBe('Quentin');
    expect(getUserLabel(quentin, 'username')).toBe('quentin');
    expect(getUserLabel(quentin, 'email')).toBe('quentin@example.com');
  });

  test('a person with no name falls back to their id', () => {
    expect(getUserLabel(person('nobody'), 'full_name')).toBe('id-nobody');
  });

  test('an agent carries its owner whatever field was asked for', () => {
    const claude = agent(quentin, 'Claude');
    expect(getUserLabel(claude, 'full_name')).toBe("Quentin's Claude");
    expect(getUserLabel(claude, 'username')).toBe("Quentin's Claude");
  });

  test('two agents of the same name are told apart', () => {
    expect(getUserLabel(agent(quentin, 'Claude'))).toBe("Quentin's Claude");
    expect(getUserLabel(agent(bligh, 'Claude'))).toBe("Bligh's Claude");
  });
});

describe('getUserPickerLabel', () => {
  test('your own agent drops the possessive', () => {
    const claude = agent(quentin, 'Claude');
    expect(getUserPickerLabel(claude, 'full_name', quentin.id)).toBe('Claude');
  });

  test('somebody else keeps theirs', () => {
    const claude = agent(bligh, 'Claude');
    expect(getUserPickerLabel(claude, 'full_name', quentin.id)).toBe(
      "Bligh's Claude",
    );
  });

  test('a person is unaffected by who is looking', () => {
    expect(getUserPickerLabel(bligh, 'full_name', quentin.id)).toBe('Bligh');
    expect(getUserPickerLabel(bligh, 'full_name', undefined)).toBe('Bligh');
  });

  test('with no viewer, every agent keeps its possessive', () => {
    const claude = agent(quentin, 'Claude');
    expect(getUserPickerLabel(claude, 'full_name')).toBe("Quentin's Claude");
  });
});

describe('byOwnerThenName', () => {
  test('each person is followed by the agents they set going', () => {
    const ordered = byOwnerThenName([
      agent(quentin, 'Zeta'),
      bligh,
      agent(bligh, 'Codex'),
      quentin,
      agent(quentin, 'Alpha'),
    ]);
    expect(ordered.map((u) => u.display_name)).toEqual([
      'Bligh',
      "Bligh's Codex",
      'Quentin',
      "Quentin's Alpha",
      "Quentin's Zeta",
    ]);
  });

  test('it leaves the list it was given alone', () => {
    const given = [agent(quentin, 'Claude'), quentin];
    byOwnerThenName(given);
    expect(given[0].full_name).toBe('Claude');
  });

  test('an agent whose owner is not in the list still sorts', () => {
    const orphan = agent(bligh, 'Stray');
    const ordered = byOwnerThenName([orphan, quentin]);
    expect(ordered).toHaveLength(2);
  });
});
