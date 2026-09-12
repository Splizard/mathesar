import { rpcMethodTypeContainer } from '@mathesar/packages/json-rpc-client-builder';
import type { Formula } from '@mathesar/systems/formulas/formula';

import {
  type ColumnMetadata,
  type RequiredColumnMetadata,
  getMetadataValue,
} from './_common/columnDisplayOptions';
import type { EnumValue } from './types';

/**
 * See the [Postgres docs][1] for an explanation of `scale` and `precision`.
 *
 * [1]: https://www.postgresql.org/docs/current/datatype-numeric.html
 */
export interface ColumnTypeOptions {
  /**
   * For numeric types, the number of significant digits. For date/time types,
   * the number of fractional digits.
   */
  precision?: number | null;

  /** For numeric types, the number of fractional digits. */
  scale?: number | null;

  /** Which time fields are stored. See Postgres docs. */
  fields?: string | null;

  /** The maximum length of a character-type field. */
  length?: number | null;

  /** The member type for arrays.  */
  item_type?: string | null;

  /** When creating or changing a column, whether it holds arrays of the type */
  array?: boolean | null;

  /** The actual PostgreSQL type name for enum and composite types. */
  original_type?: string | null;

  /**
   * An ordered list of the values an enum offers.
   *
   * Read back as the values themselves. Written as those, or as objects saying
   * which of the enum's values each one was, which is how a value being renamed
   * is told apart from one being dropped and another added.
   */
  enum_values?: (string | EnumValue)[] | null;

  /** The fields of a composite type, in order. */
  composite_fields?: { name: string; type: string }[] | null;

  /**
   * The domain a column is of, when it's of one (other than Mathesar's own),
   * in which case the column's type is the one the domain is defined over.
   */
  domain?: string | null;
}

interface ColumnDefault {
  value: string;
  is_dynamic: boolean;
}

export const allColumnPrivileges = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'REFERENCES',
] as const;
export type ColumnPrivilege = (typeof allColumnPrivileges)[number];

/** The raw column data, from the user database only */
interface RawColumn {
  /** The PostgreSQL attnum of the column */
  id: number;
  name: string;
  description: string | null;
  /** The PostgreSQL data type */
  type: string;
  type_options: ColumnTypeOptions | null;
  nullable: boolean;
  primary_key: boolean;
  default: ColumnDefault | null;
  /**
   * Whether a trigger keeps the column at the time its record was last
   * changed, i.e. it's an "Updated At" column.
   */
  updated_at_trigger?: boolean;
  has_dependents: boolean;
  current_role_priv: ColumnPrivilege[];
  /**
   * The formula the column's values are worked out from, for a column that is
   * worked out and that Mathesar made. Null for one made elsewhere, and absent
   * altogether on a column holding values of its own.
   */
  formula?: Formula | null;
  /**
   * The expression Postgres works the values out from, for any column that is
   * worked out, whoever made it.
   */
  formula_sql?: string | null;
}

/**
 * This is true when it's safe to insert values into a column.
 *
 * This is false in cases where PostgreSQL would allow us to insert into the
 * column but it would mess things up, e.g. with sequences.
 *
 * The logic here is somewhat crude, but it works okay in most circumstances.
 * Ideally the front end should have an easy (and opaque) way to determine
 * whether it's appropriate to INSERT into a column. For example, if the column
 * has a dynamic value set to be the result of a sequence, then we don't want to
 * manually supply a value when inserting because it will mess up the sequence.
 * But even non-PK column can have sequence-based default. And PK column can
 * also have non-sequence dynamic defaults where inserting would theoretically
 * be safe (e.g. UUID). It would be nice to improve this logic at some point via
 * some accompanying backend work.
 */
export function columnDefaultAllowsInsertion(column: RawColumn): boolean {
  if (!column.default) return true;
  if (!column.primary_key) return true;
  return !column.default.is_dynamic;
}

/**
 * The raw column data from the user database combined with Mathesar's metadata
 */
export interface RawColumnWithMetadata extends RawColumn {
  metadata: ColumnMetadata | null;
}

/**
 * Gets a metadata value from a column, if present. Otherwise returns the
 * default value for that metadata value.
 */
export function getColumnMetadataValue<
  Key extends keyof RequiredColumnMetadata,
>(column: Pick<RawColumnWithMetadata, 'metadata'>, k: Key) {
  return getMetadataValue(column.metadata ?? {}, k);
}

/**
 * The ColumnCastOptions are returned when getting column type suggestions. They
 * are not inspected or used directly by the front end, but instead passed back
 * to the tables.get_import_preview and/or columns.patch endpoints as needed if
 * the user accepts Mathesar's type suggestions.
 */
export type ColumnCastOptions = Record<string, unknown>;

export interface ColumnCreationSpec {
  name?: string;
  type?: string;
  description?: string;
  type_options?: ColumnTypeOptions;
  nullable?: boolean;
  default?: ColumnDefault;
  updated_at_trigger?: boolean;
}

export interface ColumnPatchSpec {
  id: number;
  name?: string;
  type?: string | null;
  description?: string | null;
  type_options?: ColumnTypeOptions | null;
  cast_options?: ColumnCastOptions;
  nullable?: boolean;
  default?: ColumnDefault | null;
  updated_at_trigger?: boolean;
}

export type ColumnMetadataBlob = ColumnMetadata & { attnum: number };

export const columns = {
  list: rpcMethodTypeContainer<
    {
      database_id: number;
      table_oid: number;
    },
    RawColumn[]
  >(),

  list_with_metadata: rpcMethodTypeContainer<
    {
      database_id: number;
      table_oid: number;
    },
    RawColumnWithMetadata[]
  >(),

  /** Returns an array of the attnums of the newly-added columns */
  add: rpcMethodTypeContainer<
    {
      database_id: number;
      table_oid: number;
      column_data_list: ColumnCreationSpec[];
    },
    number[]
  >(),

  /**
   * Add a column whose values Postgres works out from the rest of the record.
   *
   * The formula goes over the wire as a tree and never as SQL; the server
   * builds the expression from it. The type is worked out from the formula
   * unless one is given.
   */
  add_formula: rpcMethodTypeContainer<
    {
      database_id: number;
      table_oid: number;
      name: string;
      formula: Formula;
      type_?: { name: string; options?: ColumnTypeOptions } | null;
      description?: string | null;
    },
    number
  >(),

  patch: rpcMethodTypeContainer<
    {
      database_id: number;
      table_oid: number;
      column_data_list: ColumnPatchSpec[];
    },
    void
  >(),

  /**
   * Change the formula a column's values are worked out from, which works every
   * record out again. Needs PostgreSQL 17 or later.
   */
  patch_formula: rpcMethodTypeContainer<
    {
      database_id: number;
      table_oid: number;
      column_attnum: number;
      formula: Formula;
    },
    void
  >(),

  delete: rpcMethodTypeContainer<
    {
      database_id: number;
      table_oid: number;
      column_attnums: number[];
    },
    void
  >(),

  metadata: {
    set: rpcMethodTypeContainer<
      {
        database_id: number;
        table_oid: number;
        column_meta_data_list: ColumnMetadataBlob[];
      },
      void
    >(),
  },

  add_primary_key_column: rpcMethodTypeContainer<
    {
      database_id: number;
      table_oid: number;
      pkey_type: 'IDENTITY' | 'UUIDv4';
      drop_existing_pkey_column?: boolean;
      name?: string;
    },
    void
  >(),
};
