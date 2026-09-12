import type { RawColumnWithMetadata } from '@mathesar/api/rpc/columns';
import type {
  CheckPattern,
  FkConstraint,
  RawConstraint,
} from '@mathesar/api/rpc/constraints';
import { getAbstractTypeForDbType } from '@mathesar/stores/abstract-types';
import { DB_TYPES } from '@mathesar/stores/abstract-types/dbTypes';
import type { AbstractType } from '@mathesar/stores/abstract-types/types';

export function constraintIsFk(c: RawConstraint): c is FkConstraint {
  return c.type === 'foreignkey';
}

/**
 * Return all the single-column foreign key constraints which are set for the
 * given column.
 *
 * Theoretically, there can be multiple foreign key constraints set for one
 * column, so we return an array, but in practice that would unexpected -- so
 * it's up to the caller of this function to decide what to do in that case.
 */
export function findFkConstraintsForColumn(
  constraints: RawConstraint[],
  columnId: RawColumnWithMetadata['id'],
): FkConstraint[] {
  return constraints.filter(constraintIsFk).filter(
    (constraint) =>
      constraint.columns.length === 1 && // only single-column foreign keys
      constraint.columns.includes(columnId),
  );
}

/**
 * Whether the given column carries one of Mathesar's own check patterns.
 *
 * This is how a column's type is told from the constraint on it rather than
 * from a domain of our own invention: the database reports which pattern an
 * expression turns out to be, and a constraint written by someone else reports
 * none, so it can be shown without being claimed.
 */
export function hasCheckPattern(
  constraints: RawConstraint[],
  columnId: RawColumnWithMetadata['id'],
  pattern: CheckPattern,
): boolean {
  return constraints.some(
    (c) =>
      c.type === 'check' &&
      c.pattern === pattern &&
      c.columns.length === 1 &&
      c.columns.includes(columnId),
  );
}

/** The kinds whose values are text a `text_box` constraint could speak about. */
const singleLineKinds = new Set(['text', 'email', 'uri']);

function dbTypeCanBeSingleLine(dbType: string): boolean {
  // `character` blank-pads to its length, so it is single-line already and a
  // trim check on it could never fire: there is nothing to offer.
  if (dbType === DB_TYPES.CHARACTER) return false;
  return singleLineKinds.has(getAbstractTypeForDbType(dbType, null).identifier);
}

/**
 * Whether a column could be restricted to a single line, i.e. take the
 * `text_box` check pattern, either directly or over each of its elements.
 *
 * Being shown as a string isn't enough to qualify: a JSON column is one of
 * those too, and is jsonb underneath, which btrim has nothing to say about.
 */
export function canTakeTextBoxPattern(
  column: RawColumnWithMetadata,
  abstractType: AbstractType,
): boolean {
  if (abstractType.cellInfo?.type === 'array') {
    const itemType = column.type_options?.item_type;
    return typeof itemType === 'string' && dbTypeCanBeSingleLine(itemType);
  }
  return dbTypeCanBeSingleLine(column.type);
}
