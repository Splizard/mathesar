/**
 * @file
 *
 * Reading the shape of one table so that a new one can be given the same shape.
 */

import { api } from '@mathesar/api/rpc';
import type {
  ColumnCreationSpec,
  ColumnMetadataBlob,
  RawColumnWithMetadata,
} from '@mathesar/api/rpc/columns';
import type {
  ConstraintRecipe,
  RawConstraint,
} from '@mathesar/api/rpc/constraints';
import type { Database } from '@mathesar/models/Database';
import { batchRun } from '@mathesar/packages/json-rpc-client-builder';

import {
  getAbstractTypeForDbType,
  getRecordTimestampColumnSpecs,
} from './abstract-types';
import { abstractTypeCategory } from './abstract-types/constants';
import { currentTimeDefaultExpressions } from './abstract-types/currentTimeDefaults';
import {
  currentUserDefaultExpression,
  isCurrentUserDefault,
} from './abstract-types/currentUserDefault';

/**
 * The shape of a table, read so that another can be given the same one: its
 * columns, how each of them is shown, and the constraints among them.
 *
 * The primary key is left out. A new table has one of its own, and a copy of
 * this one's would only be a second.
 */
export interface TableStructure {
  columns: RawColumnWithMetadata[];
  constraints: RawConstraint[];
}

export function readTableStructure(
  database: Database,
  tableOid: number,
): Promise<TableStructure> {
  const props = { database_id: database.id, table_oid: tableOid };
  return batchRun([
    api.columns.list_with_metadata(props),
    api.constraints.list(props),
  ]).then(([columns, constraints]) => ({
    columns: columns.filter((column) => !column.primary_key),
    constraints,
  }));
}

/**
 * The default a copied column gets. A dynamic default is an SQL expression,
 * and only the ones Mathesar knows how to write are written again — written in
 * the spelling Mathesar uses for the column's type, since the source's may be
 * cast or capitalized differently. The rest are dropped: a default naming a
 * sequence would be the source table's sequence, which is not what a copy of
 * the table wants.
 */
function getCopiedDefault(
  column: RawColumnWithMetadata,
): ColumnCreationSpec['default'] {
  const columnDefault = column.default;
  if (!columnDefault) return undefined;
  if (!columnDefault.is_dynamic) return columnDefault;
  if (isCurrentUserDefault(columnDefault)) {
    return { is_dynamic: true, value: currentUserDefaultExpression };
  }
  const { identifier } = getAbstractTypeForDbType(
    column.type,
    column.metadata,
    column,
  );
  const expression = currentTimeDefaultExpressions[column.type];
  if (identifier === abstractTypeCategory.CreatedAt && expression) {
    return { is_dynamic: true, value: expression };
  }
  return undefined;
}

/** How a column of the copied table is made anew */
export function getCopiedColumnSpec(
  column: RawColumnWithMetadata,
): ColumnCreationSpec {
  return {
    name: column.name,
    type: column.type,
    type_options: column.type_options ?? undefined,
    nullable: column.nullable,
    default: getCopiedDefault(column),
    description: column.description ?? undefined,
    updated_at_trigger: column.updated_at_trigger,
  };
}

/**
 * The columns recording when each record was made and last changed that the
 * new table still needs. A table copying a structure that already dates its
 * records has columns for it already, and a second pair would only be in the
 * way.
 */
export function getMissingRecordTimestampSpecs(
  structure: TableStructure | undefined,
): ColumnCreationSpec[] {
  const specs = getRecordTimestampColumnSpecs();
  if (!structure) return specs;
  const identifiers = new Set(
    structure.columns.map(
      (column) =>
        getAbstractTypeForDbType(column.type, column.metadata, column)
          .identifier,
    ),
  );
  return specs.filter((spec) =>
    spec.updated_at_trigger
      ? !identifiers.has(abstractTypeCategory.UpdatedAt)
      : !identifiers.has(abstractTypeCategory.CreatedAt),
  );
}

/**
 * How each of the copied columns is shown, against the attnums the new table
 * gave them. A column with nothing said about it is left out rather than sent
 * as an empty blob.
 */
export function getCopiedColumnMetadata(
  structure: TableStructure,
  newAttnums: Map<number, number>,
): ColumnMetadataBlob[] {
  return structure.columns.flatMap((column) => {
    const attnum = newAttnums.get(column.id);
    if (attnum === undefined || !column.metadata) return [];
    return [{ ...column.metadata, attnum }];
  });
}

/**
 * The constraints to make on the new table, against the attnums it gave the
 * copied columns. Left behind are the ones over a column that wasn't copied —
 * the primary key's, and anything else resting on it — and a check constraint
 * written by someone other than Mathesar, which we can show but not write
 * again. Names are left to the database: the source's would collide were both
 * tables in one schema.
 */
export function getCopiedConstraintRecipes(
  structure: TableStructure,
  newAttnums: Map<number, number>,
): ConstraintRecipe[] {
  const mapColumns = (attnums: number[]): number[] | undefined => {
    const mapped = attnums.map((attnum) => newAttnums.get(attnum));
    return mapped.every((attnum): attnum is number => attnum !== undefined)
      ? mapped
      : undefined;
  };
  return structure.constraints.flatMap((constraint): ConstraintRecipe[] => {
    const columns = mapColumns(constraint.columns);
    if (!columns) return [];
    if (constraint.type === 'unique') {
      return [{ type: 'u', columns }];
    }
    if (constraint.type === 'foreignkey') {
      return [
        {
          type: 'f',
          columns,
          fkey_relation_id: constraint.referent_table_oid,
          fkey_columns: constraint.referent_columns,
        },
      ];
    }
    if (constraint.type === 'check' && constraint.pattern) {
      return [{ type: 'c', columns, pattern: constraint.pattern }];
    }
    return [];
  });
}

/**
 * Finish giving the new table the structure read from another. Its columns are
 * already added, in the order the structure gives them, so what is left is how
 * they are shown and the constraints among them.
 */
export async function applyCopiedTableStructure({
  database,
  tableOid,
  structure,
  newAttnums,
}: {
  database: Database;
  tableOid: number;
  structure: TableStructure;
  newAttnums: Map<number, number>;
}): Promise<void> {
  const metadata = getCopiedColumnMetadata(structure, newAttnums);
  const constraints = getCopiedConstraintRecipes(structure, newAttnums);
  const requests = [];
  if (metadata.length) {
    requests.push(
      api.columns.metadata.set({
        database_id: database.id,
        table_oid: tableOid,
        column_meta_data_list: metadata,
      }),
    );
  }
  if (constraints.length) {
    requests.push(
      api.constraints.add({
        database_id: database.id,
        table_oid: tableOid,
        constraint_def_list: constraints,
      }),
    );
  }
  if (requests.length) await batchRun(requests);
}
