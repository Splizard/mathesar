import { type Readable, type Writable, derived, writable } from 'svelte/store';

import type { Result as ApiRecord } from '@mathesar/api/rpc/records';
import type Pagination from '@mathesar/utils/Pagination';
import { assertExhaustive } from '@mathesar-component-library';

import type { Meta } from './meta';
import type { ProcessedColumns } from './processedColumns';
import type { RecordsData } from './records';
import {
  type DraftRecordRow,
  GroupHeaderRow,
  GroupPlaceholderRecordRow,
  HelpTextRow,
  type PersistedRecordRow,
  PlaceholderRecordRow,
} from './Row';
import { type RecordGrouping, getGroupKey } from './utils';

export interface ColumnPlacement {
  /** CSS value in px */
  width: number;
  /** CSS value in px */
  left: number;
}

function cellStyle(placement: ColumnPlacement, leftOffset: number): string {
  return `width: ${placement.width}px; left: ${leftOffset + placement.left}px;`;
}

export function getCellStyle(
  placements: Map<string, ColumnPlacement>,
  columnId: string,
  leftOffset = 0,
): string {
  const placement = placements.get(columnId) ?? { width: 0, left: 0 };
  return cellStyle(placement, leftOffset);
}

export enum RowOrigin {
  FetchedFromDb = 'fetchedFromDb',
  NewlyCreatedViaUi = 'newlyCreatedViaUi',
  StaticUiElement = 'staticlyPresentInUi',
}

export interface DisplayRecordRowDescriptor {
  row: PersistedRecordRow | DraftRecordRow;
  rowNumber: number;
  rowOrigin: RowOrigin.FetchedFromDb | RowOrigin.NewlyCreatedViaUi;
}

export interface DisplayUiRowDescriptor {
  row: HelpTextRow | GroupHeaderRow | PlaceholderRecordRow;
  rowOrigin: RowOrigin.StaticUiElement;
}

export type DisplayRowDescriptor =
  | DisplayRecordRowDescriptor
  | DisplayUiRowDescriptor;

export function getRowNumber(rowDescriptor: DisplayRowDescriptor): number {
  if (rowDescriptor.rowOrigin === RowOrigin.FetchedFromDb) {
    return rowDescriptor.rowNumber;
  }
  if (rowDescriptor.rowOrigin === RowOrigin.NewlyCreatedViaUi) {
    return rowDescriptor.rowNumber;
  }
  if (rowDescriptor.rowOrigin === RowOrigin.StaticUiElement) {
    return 0;
  }
  return assertExhaustive(rowDescriptor.rowOrigin);
}

/**
 * A record can be added to a group only where every value the group is made of
 * can be written as it is into the new record: not where a column is grouped by
 * something worked out from it (such as a date's month), nor where the column
 * takes no value from the user.
 */
function canAddRecordsToGroups(
  grouping: RecordGrouping,
  processedColumns: ProcessedColumns,
): boolean {
  return grouping.columnIds.every((columnId, index) => {
    if (grouping.preprocIds[index]) return false;
    return processedColumns.get(String(columnId))?.isEditable ?? false;
  });
}

export function combineRecordRowsWithGroupHeaders({
  recordRows,
  newRecords,
  newRecordGroupKeys,
  grouping,
  pagination,
  totalCount,
  canAddToGroups,
  emptyRecord = {},
}: {
  recordRows: PersistedRecordRow[];
  newRecords: (PersistedRecordRow | DraftRecordRow)[];
  newRecordGroupKeys: Map<string, string>;
  grouping?: RecordGrouping;
  pagination: Pagination;
  totalCount: number;
  canAddToGroups: boolean;
  /** What a new record starts as, before the group's values */
  emptyRecord?: ApiRecord;
}): {
  rows: DisplayRowDescriptor[];
  /** New records not shown within a group */
  ungroupedNewRecords: DisplayRecordRowDescriptor[];
} {
  const groupingColumnIds = grouping?.columnIds ?? [];
  const isResultGrouped = groupingColumnIds.length > 0;

  function makeRowNumber(index: number) {
    return index + pagination.offset + 1;
  }

  // A live refresh brings a saved new record among the fetched rows a moment
  // before it leaves `newRecords`; it is shown once, where it was fetched.
  const fetchedIds = new Set(recordRows.map((row) => row.identifier));
  const newRecordDescriptors = newRecords
    .map(
      (row, index): DisplayRecordRowDescriptor => ({
        row,
        rowNumber: pagination.offset + totalCount + index + 1,
        rowOrigin: RowOrigin.NewlyCreatedViaUi,
      }),
    )
    .filter((descriptor) => !fetchedIds.has(descriptor.row.identifier));

  if (isResultGrouped && grouping) {
    const combinedRows: DisplayRowDescriptor[] = [];
    let persistedRecordRowIndex = 0;
    const shownNewRecordIds = new Set<string>();

    grouping.groups.forEach((group) => {
      const groupValues: ApiRecord = {};
      grouping.columnIds.forEach((columnId) => {
        groupValues[String(columnId)] = group.eqValue[columnId];
      });
      combinedRows.push({
        row: new GroupHeaderRow({
          group,
          groupValues,
        }),
        rowOrigin: RowOrigin.StaticUiElement,
      });
      group.resultIndices.forEach((resultIndex) => {
        const recordRow = recordRows[resultIndex];
        if (!recordRow) {
          // ⚠️ This is a weird case. It _does_ actually occur. Returning is a
          // bit of a hack. Fixing this properly will require some refactoring
          // of stores. See comments in:
          // https://github.com/mathesar-foundation/mathesar/issues/4594 and/or
          // the related PR
          return;
        }
        combinedRows.push({
          row: recordRow,
          rowOrigin: RowOrigin.FetchedFromDb,
          rowNumber: makeRowNumber(persistedRecordRowIndex),
        });
        persistedRecordRowIndex += 1;
      });

      const groupKey = getGroupKey(group, grouping);
      newRecordDescriptors.forEach((descriptor) => {
        const { identifier } = descriptor.row;
        if (newRecordGroupKeys.get(identifier) !== groupKey) return;
        combinedRows.push(descriptor);
        shownNewRecordIds.add(identifier);
      });
      if (canAddToGroups) {
        combinedRows.push({
          row: new GroupPlaceholderRecordRow({
            groupKey,
            groupValues,
            record: { ...emptyRecord, ...groupValues },
          }),
          rowOrigin: RowOrigin.StaticUiElement,
        });
      }
    });
    return {
      rows: combinedRows,
      ungroupedNewRecords: newRecordDescriptors.filter(
        (descriptor) => !shownNewRecordIds.has(descriptor.row.identifier),
      ),
    };
  }

  return {
    rows: recordRows.map((row, index) => ({
      row,
      rowOrigin: RowOrigin.FetchedFromDb,
      rowNumber: makeRowNumber(index),
    })),
    ungroupedNewRecords: newRecordDescriptors,
  };
}

export class Display {
  scrollOffset: Writable<number>;

  horizontalScrollOffset: Writable<number>;

  displayRowDescriptors: Readable<DisplayRowDescriptor[]>;

  placeholderRowId: Readable<string>;

  constructor({
    meta,
    recordsData,
    processedColumns,
    canInsertRecords,
  }: {
    meta: Meta;
    recordsData: RecordsData;
    processedColumns: Readable<ProcessedColumns>;
    canInsertRecords: Readable<boolean>;
  }) {
    this.horizontalScrollOffset = writable(0);
    this.scrollOffset = writable(0);

    const placeholderRowId = writable('');
    this.placeholderRowId = placeholderRowId;

    this.displayRowDescriptors = derived(
      [
        recordsData.fetchedRecordRows,
        recordsData.newRecords,
        recordsData.totalCount,
        recordsData.grouping,
        meta.pagination,
        processedColumns,
        canInsertRecords,
      ],
      ([
        fetchedRecordRows,
        newRecords,
        totalCount,
        grouping,
        pagination,
        $processedColumns,
        canInsert,
      ]) => {
        const { rows, ungroupedNewRecords } = combineRecordRowsWithGroupHeaders(
          {
            recordRows: fetchedRecordRows,
            newRecords,
            newRecordGroupKeys: recordsData.newRecordGroupKeys,
            grouping,
            pagination,
            totalCount: totalCount ?? 0,
            canAddToGroups:
              canInsert &&
              !!grouping &&
              canAddRecordsToGroups(grouping, $processedColumns),
          },
        );
        let displayRowDescriptors = rows;

        if (ungroupedNewRecords.length > 0) {
          displayRowDescriptors = displayRowDescriptors
            .concat({
              row: new HelpTextRow(),
              rowOrigin: RowOrigin.StaticUiElement,
            })
            .concat(ungroupedNewRecords);
        }

        const placeholderRow = new PlaceholderRecordRow({
          record: recordsData.getEmptyApiRecord(),
        });

        // This is really hacky! We have a side effect (mutating state) within a
        // derived store, which I don't like. I put this here during a large
        // refactor of the cell selection code because the Plane needs to know
        // the id of the placeholder row since cell selection behaves
        // differently in the placeholder row. I think we have some major
        // refactoring to do across all the code that handles "rows" and
        // "records" and things like that. There is a ton of mess there and I
        // didn't want to lump any of that refactoring into an already-large
        // refactor.
        placeholderRowId.set(placeholderRow.identifier);

        displayRowDescriptors = displayRowDescriptors.concat({
          row: placeholderRow,
          rowOrigin: RowOrigin.StaticUiElement,
        });
        return displayRowDescriptors;
      },
    );
  }
}
