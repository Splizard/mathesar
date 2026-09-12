import { rpcMethodTypeContainer } from '@mathesar/packages/json-rpc-client-builder';

import type { ColumnTypeOptions } from './columns';
import type { RawDatabase } from './databases';
import type { RawSchema, RawSchemaType } from './schemas';

/**
 * A value of an enum, and the value of the enum it used to be.
 *
 * Saying which value each one was is the only way to tell a value being renamed
 * from one being dropped and another added, which are different things to do to
 * a column holding it: a rename leaves every record saying what it said, and a
 * drop takes a record's answer away.
 */
export interface EnumValue {
  value: string;
  /** The value this one is a renaming of, or undefined for one being added */
  was?: string;
}

/** The value a choice offers, however it is written */
export function getEnumValueName(value: string | EnumValue): string {
  return typeof value === 'string' ? value : value.value;
}

/**
 * A rule a domain holds its values to, or one it already holds them to.
 *
 * A rule is a CHECK constraint, which is what Postgres has written down, so a
 * rule already on the domain is given by the constraint's name and left exactly
 * as it is -- including one somebody else wrote, which can be taken off but
 * never edited. A rule being added names which rule it is and the value it is
 * about, and is never SQL.
 */
export type DomainRule =
  /** A rule the domain already has, which is to stay as it is */
  | { name: string }
  /** A rule it is being given, and the value that rule is about */
  | { rule: string; value?: string };

/** What a domain is: another type, and the rules its values are held to */
export interface DomainSpec {
  /** The type it is over, as a column's type is given */
  over: { name: string; options?: ColumnTypeOptions };
  not_null?: boolean;
  /** The value a column of it takes when nothing is given. Never an expression */
  default?: string | null;
  rules?: DomainRule[];
  description?: string | null;
}

export const types = {
  add_enum: rpcMethodTypeContainer<
    {
      database_id: RawDatabase['id'];
      schema_oid: RawSchema['oid'];
      name: RawSchemaType['name'];
      values: EnumValue[];
      description?: RawSchemaType['description'];
    },
    RawSchemaType['oid']
  >(),

  patch_enum: rpcMethodTypeContainer<
    {
      database_id: RawDatabase['id'];
      type_oid: RawSchemaType['oid'];
      patch: {
        name?: RawSchemaType['name'];
        description?: RawSchemaType['description'];
        values?: EnumValue[];
      };
    },
    /** The OID of the type, which is a new one if its values were rewritten */
    RawSchemaType['oid']
  >(),

  add_domain: rpcMethodTypeContainer<
    {
      database_id: RawDatabase['id'];
      schema_oid: RawSchema['oid'];
      name: RawSchemaType['name'];
      spec: DomainSpec;
    },
    RawSchemaType['oid']
  >(),

  patch_domain: rpcMethodTypeContainer<
    {
      database_id: RawDatabase['id'];
      type_oid: RawSchemaType['oid'];
      patch: {
        name?: RawSchemaType['name'];
        description?: RawSchemaType['description'];
        not_null?: boolean;
        default?: string | null;
        rules?: DomainRule[];
      };
    },
    RawSchemaType['oid']
  >(),

  delete: rpcMethodTypeContainer<
    {
      database_id: RawDatabase['id'];
      type_oid: RawSchemaType['oid'];
      cascade?: boolean;
    },
    /** The qualified name of the type dropped */
    string
  >(),
};
