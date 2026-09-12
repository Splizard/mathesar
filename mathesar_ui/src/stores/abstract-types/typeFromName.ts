import type { DbType } from '@mathesar/AppTypes';

import {
  getAllowedAbstractTypesForNewColumn,
  getDefaultDbType,
  isAbstractTypeDisabled,
} from './abstractTypeCategories';
import { abstractTypeCategory as t } from './constants';
import { DB_TYPES } from './dbTypes';
import type { TypeChoice } from './typeFamilies';
import type { AbstractTypeCategoryIdentifier } from './types';

interface Guess {
  type: AbstractTypeCategoryIdentifier;
  /** The DB type, where the kind wanted isn't the type's first */
  dbType?: DbType;
}

const bool: Guess = { type: t.Boolean };
const email: Guess = { type: t.Email };
const uri: Guess = { type: t.Uri };
const money: Guess = { type: t.Money };
const dateTime: Guess = { type: t.DateTime };
const date: Guess = { type: t.Date };
const time: Guess = { type: t.Time };
const duration: Guess = { type: t.Duration };
const integer: Guess = { type: t.Number, dbType: DB_TYPES.INTEGER };
const decimal: Guess = { type: t.Number, dbType: DB_TYPES.NUMERIC };
const uuid: Guess = { type: t.Uuid };
const json: Guess = { type: t.Json };
const file: Guess = { type: t.File };
const ipAddress: Guess = { type: t.Network, dbType: DB_TYPES.INET };
const macAddress: Guess = { type: t.Network, dbType: DB_TYPES.MACADDR };

/**
 * Names that say outright what the column holds, whole.
 *
 * The times a record was made and last changed are here rather than among the
 * endings below, so that `created_at` is the column the database fills in and
 * not merely a date and a time.
 */
const byWholeName: Record<string, Guess> = {
  created_at: { type: t.CreatedAt },
  created_on: { type: t.CreatedAt },
  created: { type: t.CreatedAt },
  inserted_at: { type: t.CreatedAt },
  date_created: { type: t.CreatedAt },
  updated_at: { type: t.UpdatedAt },
  updated_on: { type: t.UpdatedAt },
  updated: { type: t.UpdatedAt },
  modified_at: { type: t.UpdatedAt },
  last_modified: { type: t.UpdatedAt },
  date_modified: { type: t.UpdatedAt },
  ip: ipAddress,
  ip_address: ipAddress,
  ipv4: ipAddress,
  ipv6: ipAddress,
  mac: macAddress,
  mac_address: macAddress,
  // An adjective on its own names a state a record is either in or it isn't.
  // With a time in it -- archived_at -- it is an instant instead, which the
  // endings below catch, and which can be shown as a tick anyway.
  active: bool,
  inactive: bool,
  enabled: bool,
  disabled: bool,
  paid: bool,
  unpaid: bool,
  done: bool,
  complete: bool,
  completed: bool,
  archived: bool,
  deleted: bool,
  published: bool,
  verified: bool,
  visible: bool,
  hidden: bool,
  public: bool,
  private: bool,
  draft: bool,
  approved: bool,
  cancelled: bool,
  canceled: bool,
  locked: bool,
  featured: bool,
  default: bool,
};

/** The word a name ends on, which is what a name is usually about */
const byLastWord: Record<string, Guess> = {
  email,
  emails: email,
  url: uri,
  urls: uri,
  uri,
  link: uri,
  website: uri,
  homepage: uri,
  href: uri,
  price: money,
  cost: money,
  amount: money,
  total: money,
  subtotal: money,
  fee: money,
  salary: money,
  balance: money,
  revenue: money,
  budget: money,
  at: dateTime,
  timestamp: dateTime,
  datetime: dateTime,
  date,
  birthday: date,
  birthdate: date,
  dob: date,
  time,
  duration,
  elapsed: duration,
  runtime: duration,
  count: integer,
  quantity: integer,
  qty: integer,
  age: integer,
  year: integer,
  rank: integer,
  position: integer,
  priority: integer,
  percent: decimal,
  percentage: decimal,
  ratio: decimal,
  latitude: decimal,
  longitude: decimal,
  lat: decimal,
  lng: decimal,
  lon: decimal,
  weight: decimal,
  height: decimal,
  width: decimal,
  length: decimal,
  uuid,
  guid: uuid,
  json,
  jsonb: json,
  payload: json,
  flag: bool,
  file,
  attachment: file,
  photo: file,
  image: file,
  avatar: file,
  document: file,
  thumbnail: file,
  picture: file,
  logo: file,
};

/** A name that begins like a question has a yes or a no for an answer */
const byFirstWord: Record<string, Guess> = {
  is: bool,
  are: bool,
  has: bool,
  have: bool,
  can: bool,
  should: bool,
  was: bool,
  were: bool,
  did: bool,
  does: bool,
  will: bool,
  must: bool,
  allow: bool,
  allows: bool,
};

/**
 * The words of a column name, however it was written: snake_case, kebab-case,
 * camelCase, or words with spaces between them.
 */
export function getColumnNameWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '');
}

function resolve(guess: Guess): TypeChoice | undefined {
  const abstractType = getAllowedAbstractTypesForNewColumn().find(
    (candidate) => candidate.identifier === guess.type,
  );
  // A type this installation can't offer -- a file column with nowhere to put
  // the files -- is no guess at all
  if (!abstractType || isAbstractTypeDisabled(abstractType)) return undefined;
  const dbType = guess.dbType ?? getDefaultDbType(abstractType);
  return dbType ? { abstractType, dbType } : undefined;
}

/**
 * The type a column of this name most likely wants, where the name says so
 * plainly enough to be worth guessing from.
 *
 * A wrong guess costs more than no guess: it has to be noticed before it is
 * undone. So this covers only names whose meaning is not really in doubt, and
 * says nothing about the rest. Text is never guessed, being what a column is
 * anyway when nothing else is said.
 */
export function guessTypeFromColumnName(
  name: string,
): TypeChoice | undefined {
  const words = getColumnNameWords(name);
  if (words.length === 0) return undefined;
  const guess =
    byWholeName[words.join('_')] ??
    (words.length > 1 ? byFirstWord[words[0]] : undefined) ??
    byLastWord[words[words.length - 1]];
  return guess ? resolve(guess) : undefined;
}
