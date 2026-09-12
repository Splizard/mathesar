import { rpcMethodTypeContainer } from '@mathesar/packages/json-rpc-client-builder';

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
