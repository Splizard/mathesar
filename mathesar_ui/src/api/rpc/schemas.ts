import { rpcMethodTypeContainer } from '@mathesar/packages/json-rpc-client-builder';

import type { RawDatabase } from './databases';
import type { RawRole } from './roles';

export const allSchemaPrivileges = ['USAGE', 'CREATE'] as const;
export type SchemaPrivilege = (typeof allSchemaPrivileges)[number];

export interface RawSchema {
  oid: number;
  name: string;
  description: string | null;
  table_count: number;
  owner_oid: RawRole['oid'];
  current_role_priv: SchemaPrivilege[];
  current_role_owns: boolean;
  /**
   * Whether it is a schema the database or Mathesar keeps for itself, which
   * describes the user's tables rather than being among them. Those can be
   * read but never written to.
   */
  internal: boolean;
}

/** A column holding values of a type */
export interface RawSchemaTypeUser {
  table: number;
  table_name: string;
  attnum: number;
  column_name: string;
}

/** A type defined in a schema: an enum, a composite type, or a domain */
export interface RawSchemaType {
  oid: number;
  name: string;
  kind: 'enum' | 'composite' | 'domain';
  description: string | null;
  /** Enums: their labels, in order */
  values?: string[];
  /** The columns holding the type's values, or arrays of them */
  used_by: RawSchemaTypeUser[];
  /** Composite types: their fields, in order */
  fields?: { name: string; type: string }[];
  /** Domains: the type they're ultimately defined over */
  base_type?: string;
  /** Domains: the type they're directly defined over (maybe another domain) */
  over?: string;
  /** Domains: whether they disallow NULL */
  not_null?: boolean;
  /** Domains: their default, as SQL */
  default?: string | null;
  /**
   * Domains: their default as a value, when the default is nothing but one. A
   * default which is an expression has none.
   */
  default_value?: string | null;
  /** Domains: their CHECK constraints */
  constraints?: { name: string; definition: string }[];
}

export interface RawSchemaPrivilegesForRole {
  role_oid: RawRole['oid'];
  direct: SchemaPrivilege[];
}

export const schemas = {
  list: rpcMethodTypeContainer<
    {
      database_id: number;
      /** Whether to include the schemas the database and Mathesar keep for
       * themselves, which are left out unless asked for */
      include_internal?: boolean;
    },
    RawSchema[]
  >(),

  add: rpcMethodTypeContainer<
    {
      database_id: number;
      name: RawSchema['name'];
      description?: RawSchema['description'];
    },
    RawSchema
  >(),

  patch: rpcMethodTypeContainer<
    {
      database_id: number;
      schema_oid: number;
      patch: {
        name?: RawSchema['name'];
        description?: RawSchema['description'];
      };
    },
    RawSchema
  >(),

  delete: rpcMethodTypeContainer<
    {
      database_id: number;
      schema_oids: number[];
    },
    void
  >(),

  list_types: rpcMethodTypeContainer<
    {
      database_id: number;
      schema_oid: number;
    },
    RawSchemaType[]
  >(),

  privileges: {
    list_direct: rpcMethodTypeContainer<
      {
        database_id: RawDatabase['id'];
        schema_oid: RawSchema['oid'];
      },
      Array<RawSchemaPrivilegesForRole>
    >(),

    replace_for_roles: rpcMethodTypeContainer<
      {
        database_id: RawDatabase['id'];
        schema_oid: RawSchema['oid'];
        privileges: Array<RawSchemaPrivilegesForRole>;
      },
      Array<RawSchemaPrivilegesForRole>
    >(),

    transfer_ownership: rpcMethodTypeContainer<
      {
        database_id: RawDatabase['id'];
        schema_oid: RawSchema['oid'];
        new_owner_oid: RawRole['oid'];
      },
      RawSchema
    >(),
  },
};
