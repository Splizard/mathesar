import { concat } from 'iter-tools';
import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';

import {
  type RequestStatus,
  getMostImportantRequestStatusState,
} from '@mathesar/api/rest/utils/requestUtils';
import type { RawColumnWithMetadata } from '@mathesar/api/rpc/columns';
import type {
  Group as ApiGroup,
  GroupingResponse as ApiGroupingResponse,
  Result as ApiRecord,
} from '@mathesar/api/rpc/records';
import { RpcError } from '@mathesar/packages/json-rpc-client-builder';
import {
  ImmutableMap,
  ImmutableSet,
  type WritableMap,
} from '@mathesar-component-library';

import type { RowStatus } from './meta';
import type { RecordRow, Row } from './Row';
/** One of the values naming a record */
type KeyValue = string | number;

export type CellKey = string;
export type RowKey = Row['identifier'];

export interface ClientSideCellError {
  code: number;
  message: string;
  column: RawColumnWithMetadata;
}

export const ID_ROW_CONTROL_COLUMN = '-1';
export const ID_ADD_NEW_COLUMN = '-2';

const CELL_KEY_SEPARATOR = '::';

/**
 * ⚠️ Note: we have `cellId` and `cellKey` which are different.
 *
 * See notes in `records.ts.README.md`.
 */
export function getCellKey(rowKey: RowKey, columnId: string | number): CellKey {
  return `${String(rowKey)}${CELL_KEY_SEPARATOR}${String(columnId)}`;
}

export function extractRowKeyFromCellKey(cellKey: CellKey): RowKey {
  return cellKey
    .split(CELL_KEY_SEPARATOR)
    .slice(0, -1)
    .join(CELL_KEY_SEPARATOR);
}

export const CLIENT_VALIDATION_CANNOT_BE_NULL = 101;

function getClientSideCellErrors(
  cellValue: unknown,
  column: RawColumnWithMetadata,
): ClientSideCellError[] {
  const errors = [];
  if (cellValue === null && !column.nullable) {
    errors.push({
      code: CLIENT_VALIDATION_CANNOT_BE_NULL,
      column,
      message: get(_)('cell_cannot_be_null_for_column'),
    });
  }
  return errors;
}

export function getWholeRowErrorFromClientSideCellErrors(
  errors: ClientSideCellError[],
) {
  const wholeRowErrors = [];
  const nullValidationErrors = errors.filter(
    (err) => err.code === CLIENT_VALIDATION_CANNOT_BE_NULL,
  );
  if (nullValidationErrors) {
    wholeRowErrors.push(
      RpcError.fromAnything(
        get(_)('columns_cannot_be_null', {
          values: {
            columnNames: nullValidationErrors
              .map((e) => `'${e.column.name}'`)
              .join(', '),
          },
        }),
      ),
    );
  }
  return wholeRowErrors;
}

export function getRowStatus({
  cellClientSideErrors,
  cellModificationStatus,
  rowCreationStatus,
  rowDeletionStatus,
}: {
  cellClientSideErrors: ImmutableMap<CellKey, ClientSideCellError[]>;
  cellModificationStatus: ImmutableMap<CellKey, RequestStatus<RpcError[]>>;
  rowCreationStatus: ImmutableMap<RowKey, RequestStatus<RpcError[]>>;
  rowDeletionStatus: ImmutableMap<RowKey, RequestStatus<RpcError[]>>;
}): ImmutableMap<RowKey, RowStatus> {
  type PartialResult = ImmutableMap<RowKey, Partial<RowStatus>>;

  const rowKeysWithClientSideErrors = [
    ...cellClientSideErrors.entries(),
  ].reduce(
    (
      errorsPerRow: ImmutableMap<RowKey, ClientSideCellError[]>,
      [cellKey, clientSideCellErrors],
    ) => {
      const rowKey = extractRowKeyFromCellKey(cellKey);
      const errors = errorsPerRow.get(rowKey) ?? [];
      return errorsPerRow.with(rowKey, errors.concat(clientSideCellErrors));
    },
    new ImmutableMap<RowKey, ClientSideCellError[]>(),
  );

  const statusFromClientSideCellErrors: PartialResult = new ImmutableMap(
    [...rowKeysWithClientSideErrors.entries()].map(
      ([rowKey, clientSideCellErrors]) => [
        rowKey,
        {
          errorsFromWholeRowAndCells:
            getWholeRowErrorFromClientSideCellErrors(clientSideCellErrors),
        },
      ],
    ),
  );

  const keysOfRowsWithCellModificationErrors = [
    ...cellModificationStatus,
  ].reduce(
    (rows, [cellKey, cellStatus]) =>
      cellStatus.state === 'failure'
        ? rows.with(extractRowKeyFromCellKey(cellKey))
        : rows,
    new ImmutableSet<RowKey>(),
  );

  const ROW_HAS_CELL_ERROR_MSG = RpcError.fromAnything(
    get(_)('row_contains_cell_with_error'),
  );

  const statusFromServerSideCellErrors: PartialResult = new ImmutableMap(
    [...keysOfRowsWithCellModificationErrors].map((rowKey) => [
      rowKey,
      { errorsFromWholeRowAndCells: [ROW_HAS_CELL_ERROR_MSG] },
    ]),
  );

  const statusFromCells = statusFromClientSideCellErrors.withEntries(
    statusFromServerSideCellErrors,
  );

  const statusFromCreationAndDeletion = rowCreationStatus
    // status from deletion will supersede status from creation
    .withEntries(rowDeletionStatus)
    .mapValues((requestStatus) => ({
      wholeRowState: requestStatus.state,
      errorsFromWholeRowAndCells:
        requestStatus.state === 'failure' ? requestStatus.errors : [],
    }));

  function mergeRowStatuses(
    a: Partial<RowStatus>,
    b: Partial<RowStatus>,
  ): RowStatus {
    return {
      wholeRowState: a.wholeRowState ?? b.wholeRowState,
      errorsFromWholeRowAndCells: [
        ...(a.errorsFromWholeRowAndCells ?? []),
        ...(b.errorsFromWholeRowAndCells ?? []),
      ],
    };
  }

  function makeStatusComplete(partialStatus: Partial<RowStatus>): RowStatus {
    return {
      errorsFromWholeRowAndCells: [],
      ...partialStatus,
    };
  }

  return statusFromCells
    .withEntries(statusFromCreationAndDeletion, mergeRowStatuses)
    .mapValues(makeStatusComplete);
}

export function getSheetState(props: {
  cellModificationStatus: ImmutableMap<CellKey, RequestStatus<RpcError[]>>;
  rowCreationStatus: ImmutableMap<RowKey, RequestStatus<RpcError[]>>;
  rowDeletionStatus: ImmutableMap<RowKey, RequestStatus<RpcError[]>>;
}): RequestStatus['state'] | undefined {
  const allStatuses = concat(
    props.cellModificationStatus.values(),
    props.rowCreationStatus.values(),
    props.rowDeletionStatus.values(),
  );
  return getMostImportantRequestStatusState(allStatuses);
}

function validateCell({
  cellValue,
  column,
  cellKey,
  cellClientSideErrors,
}: {
  cellValue: unknown;
  column: RawColumnWithMetadata;
  cellKey: CellKey;
  cellClientSideErrors: WritableMap<CellKey, ClientSideCellError[]>;
}): void {
  const errors = getClientSideCellErrors(cellValue, column);
  if (errors.length) {
    cellClientSideErrors.set(cellKey, errors);
  } else {
    cellClientSideErrors.delete(cellKey);
  }
}

export function validateRow({
  row,
  columns,
  cellClientSideErrors,
}: {
  row: RecordRow;
  columns: RawColumnWithMetadata[];
  cellClientSideErrors: WritableMap<CellKey, ClientSideCellError[]>;
}): void {
  columns.forEach((column) => {
    validateCell({
      cellValue: row.record[String(column.id)],
      column,
      cellKey: getCellKey(row.identifier, column.id),
      cellClientSideErrors,
    });
  });
}

/** See `records.ts.README.md` for more info */
export function getRowSelectionId(row: Row): string {
  return row.identifier;
}

export interface RecordGroup {
  count: number;
  eqValue: ApiGroup['results_eq'];
  resultIndices: number[];
}

export interface RecordGrouping {
  columnIds: number[];
  preprocIds: (string | null)[];
  groups: RecordGroup[];
}

function buildGroup(apiGroup: ApiGroup): RecordGroup {
  return {
    count: apiGroup.count,
    eqValue: apiGroup.results_eq,
    resultIndices: apiGroup.result_indices,
  };
}

export function buildGrouping(
  apiGrouping: ApiGroupingResponse,
): RecordGrouping {
  return {
    columnIds: apiGrouping.columns,
    preprocIds: apiGrouping.preproc ?? [],
    groups: (apiGrouping.groups ?? []).map(buildGroup),
  };
}

/**
 * Extracts the primary key value from a record.
 * @throws Error if no primary key column is found or the value is of an invalid type.
 * See `records.ts.README.md` for more info
 */
/**
 * What a record is called: the value of its primary key, or the values of the key's columns in
 * attnum order where the key is made of more than one.
 */
export function extractPrimaryKeyValue(
  record: ApiRecord,
  columns: RawColumnWithMetadata[],
): KeyValue | KeyValue[] {
  const pkColumns = columns
    .filter((c) => c.primary_key)
    .sort((a, b) => a.id - b.id);
  if (pkColumns.length === 0) {
    throw new Error('No primary key column found.');
  }
  const values = pkColumns.map((column) => {
    const value = record[column.id];
    if (!(typeof value === 'string' || typeof value === 'number')) {
      throw new Error('Primary key value is not a string or number.');
    }
    return value;
  });
  return pkColumns.length === 1 ? values[0] : values;
}

/**
 * The one value naming a record, for the places that can hold only one.
 *
 * A foreign key in Mathesar is a single column, so a cell holding one can only point at a record
 * of a table whose key is a single column too. Asked for here rather than assumed, so that a
 * table it cannot point at says so rather than being pointed at wrongly.
 */
export function extractSingleKeyValue(
  record: ApiRecord,
  columns: RawColumnWithMetadata[],
): KeyValue {
  const name = extractPrimaryKeyValue(record, columns);
  if (Array.isArray(name)) {
    throw new Error('This record is named by more than one value.');
  }
  return name;
}
