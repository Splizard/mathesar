import { readable } from 'svelte/store';

import { DB_TYPES } from '../dbTypes';
import { getColumnNameWords, guessTypeFromColumnName } from '../typeFromName';

vi.mock('svelte-i18n', () => {
  const translate = (s: string) => s;
  return { _: readable(translate) };
});

/** Whether this installation has anywhere to put a file, which File needs */
const fileStorage: { backend?: { backend: string } } = {};
vi.mock('@mathesar/utils/preloadData', () => ({
  getDefaultFileStorageBackend: () => fileStorage.backend,
}));

const guess = (name: string) => {
  const choice = guessTypeFromColumnName(name);
  return choice && { type: choice.abstractType.identifier, db: choice.dbType };
};

describe('getColumnNameWords', () => {
  test.each([
    ['created_at', ['created', 'at']],
    ['createdAt', ['created', 'at']],
    ['Created At', ['created', 'at']],
    ['created-at', ['created', 'at']],
    ['  Unit  Price ', ['unit', 'price']],
    ['ipv4', ['ipv4']],
    ['', []],
    ['___', []],
  ])('%s', (name, words) => {
    expect(getColumnNameWords(name)).toEqual(words);
  });
});

describe('guessTypeFromColumnName', () => {
  test('a whole name the database fills in', () => {
    expect(guess('created_at')).toEqual({
      type: 'createdAt',
      db: DB_TYPES.TIMESTAMP_WITH_TZ,
    });
    expect(guess('updatedAt')).toEqual({
      type: 'updatedAt',
      db: DB_TYPES.TIMESTAMP_WITH_TZ,
    });
  });

  // Which the endings below would otherwise call a plain date and a time
  test('and not merely an instant', () => {
    expect(guess('archived_at')).toEqual({
      type: 'datetime',
      db: DB_TYPES.TIMESTAMP_WITHOUT_TZ,
    });
  });

  test.each([
    ['email', 'email'],
    ['billing_email', 'email'],
    ['website', 'uri'],
    ['profile_url', 'uri'],
    ['price', 'money'],
    ['unit_price', 'money'],
    ['total', 'money'],
    ['due_date', 'date'],
    ['start_time', 'time'],
    ['duration', 'duration'],
    ['uuid', 'uuid'],
    ['payload', 'json'],
    ['ip_address', 'network'],
  ])('%s is guessed to be %s', (name, type) => {
    expect(guess(name)?.type).toBe(type);
  });

  test('a count is a whole number and a proportion is not', () => {
    expect(guess('item_count')).toEqual({
      type: 'number',
      db: DB_TYPES.INTEGER,
    });
    expect(guess('percentage')).toEqual({
      type: 'number',
      db: DB_TYPES.NUMERIC,
    });
  });

  test.each([
    ['is_paid', 'a name that begins like a question'],
    ['has_notes', 'even when it ends on something else'],
    ['paid', 'an adjective on its own'],
    ['archived', 'including one that could have been a time'],
    ['spam_flag', 'and anything called a flag'],
  ])('%s answers yes or no: %s', (name) => {
    expect(guess(name)?.type).toBe('boolean');
  });

  test('a name that says nothing in particular is left alone', () => {
    expect(guess('')).toBeUndefined();
    expect(guess('notes')).toBeUndefined();
    expect(guess('customer')).toBeUndefined();
    expect(guess('serial_number')).toBeUndefined();
  });

  test('a name for something kept in a file', () => {
    fileStorage.backend = { backend: 'local' };
    expect(guess('avatar')?.type).toBe('file');
  });

  // Better no guess than one the column cannot be made of
  test('unless this installation has nowhere to put files', () => {
    fileStorage.backend = undefined;
    expect(guess('avatar')).toBeUndefined();
  });
});
