import { rpcMethodTypeContainer } from '@mathesar/packages/json-rpc-client-builder';

/**
 * The check patterns the API accepts. Mathesar recognizes a column's type by the
 * constraint on it, so the expression is composed in the database from one of a
 * fixed set of patterns rather than written by the caller.
 */
export type CheckPattern = 'text_box';

interface BaseConstraint {
  oid: number;
  name: string;
  /** Each number is a column attnum */
  columns: number[];
  /**
   * False for a constraint added with NOT VALID, whose pre-existing rows were
   * never checked against it.
   */
  validated: boolean;
}

export interface PkConstraint extends BaseConstraint {
  type: 'primary';
}

export interface UniqueConstraint extends BaseConstraint {
  type: 'unique';
}

export interface FkConstraint extends BaseConstraint {
  type: 'foreignkey';
  /** The ids of the columns in the table which this FK references */
  referent_columns: number[];
  /** The id of the table which this FK references */
  referent_table_oid: number;
}

export interface CheckConstraint extends BaseConstraint {
  type: 'check';
  /**
   * The check pattern the expression turns out to be, where Mathesar recognizes
   * it, and null for a check constraint written by someone else — which we show
   * but never rewrite.
   */
  pattern: CheckPattern | null;
  /**
   * The boolean expression the constraint checks, as PostgreSQL renders it back
   * to us. The rendering normalizes whitespace, parentheses, identifier case and
   * schema qualification, but preserves the order of an operator's operands and
   * spells out casts, so two expressions meaning the same thing don't
   * necessarily render alike.
   */
  expression: string;
}

export interface ExcludeConstraint extends BaseConstraint {
  type: 'exclude';
}

export type RawConstraint =
  | PkConstraint
  | UniqueConstraint
  | FkConstraint
  | CheckConstraint
  | ExcludeConstraint;

export type ConstraintType = RawConstraint['type'];

export interface UniqueConstraintRecipe {
  type: 'u';
  name?: string | null;
  /** Values are column attnums */
  columns: number[];
}

export interface FkConstraintRecipe {
  type: 'f';
  name?: string | null;
  columns: number[];
  fkey_relation_id: number;
  fkey_columns: number[];
}

export interface CheckConstraintRecipe {
  type: 'c';
  name?: string | null;
  pattern: CheckPattern;
  /** Values are column attnums */
  columns: number[];
}

export type ConstraintRecipe =
  | UniqueConstraintRecipe
  | FkConstraintRecipe
  | CheckConstraintRecipe;

export const constraints = {
  list: rpcMethodTypeContainer<
    {
      database_id: number;
      table_oid: number;
    },
    RawConstraint[]
  >(),

  check_pattern_violations: rpcMethodTypeContainer<
    {
      database_id: number;
      table_oid: number;
      column_attnum: number;
      pattern: CheckPattern;
    },
    { violations: number; repairable: number }
  >(),

  repair_check_pattern: rpcMethodTypeContainer<
    {
      database_id: number;
      table_oid: number;
      column_attnum: number;
      pattern: CheckPattern;
    },
    /** The number of rows changed */
    number
  >(),

  add: rpcMethodTypeContainer<
    {
      database_id: number;
      table_oid: number;
      constraint_def_list: ConstraintRecipe[];
    },
    void
  >(),

  delete: rpcMethodTypeContainer<
    {
      database_id: number;
      table_oid: number;
      constraint_oid: number;
    },
    void
  >(),
};
