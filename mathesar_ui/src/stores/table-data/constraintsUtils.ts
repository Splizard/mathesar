import type { RawColumnWithMetadata } from '@mathesar/api/rpc/columns';
import type {
  CheckPattern,
  FkConstraint,
  RawConstraint,
} from '@mathesar/api/rpc/constraints';

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
