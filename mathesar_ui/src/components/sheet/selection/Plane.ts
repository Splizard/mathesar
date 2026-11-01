import { ImmutableSet } from '@mathesar-component-library';

import { makeCellId, makeCells, parseCellId } from '../cellIds';

import { Direction, getColumnOffset, getRowOffset } from './Direction';
import Series from './Series';

/**
 * This describes the different kinds of cells that can be adjacent to a given
 * cell in a particular direction.
 */
export type AdjacentCell =
  | {
      type: 'dataCell';
      cellId: string;
    }
  | {
      type: 'placeholderCell';
      cellId: string;
    }
  | {
      type: 'none';
    };

function noAdjacentCell(): AdjacentCell {
  return { type: 'none' };
}

function adjacentDataCell(cellId: string): AdjacentCell {
  return { type: 'dataCell', cellId };
}

function adjacentPlaceholderCell(cellId: string): AdjacentCell {
  return { type: 'placeholderCell', cellId };
}

/**
 * A Plane is like a coordinate system for a sheet. We can query it to find the
 * ids of cells within certain bounding rectangles.
 *
 * The Plane can also have a "placeholder row", which is a row at the bottom of
 * the sheet that provides a visual cue to the user that they can add more rows.
 * It never contains any data, but we allow the user to move the active cell
 * into the placeholder row in order to easily add more rows.
 *
 * The Plane can also track range-restricted columns. These columns
 * can only be selected individually and cannot be part of range selections.
 *
 * The term "Flexible" is used in methods to indicate that it will gracefully
 * handle ids of cells within the placeholder row.
 */
export default class Plane {
  readonly rowIds: Series<string>;

  readonly columnIds: Series<string>;

  readonly placeholderRowId: string | undefined;

  readonly rangeRestrictedColumnIds: ImmutableSet<string>;

  /**
   * Placeholder rows shown among the data rows, such as the one closing each
   * group of a grouped table. Like the placeholder row at the bottom, they
   * hold no data, and the active cell may move into them.
   */
  readonly innerPlaceholderRowIds: ImmutableSet<string>;

  /**
   * The data rows and inner placeholder rows in the order they are shown,
   * which is the order the active cell moves through them.
   */
  private readonly rowOrder: Series<string>;

  constructor(
    rowIds: Series<string> = new Series(),
    columnIds: Series<string> = new Series(),
    placeholderRowId?: string,
    rangeRestrictedColumnIds: ImmutableSet<string> = new ImmutableSet(),
    innerPlaceholders?: {
      rowIds: ImmutableSet<string>;
      /** Every data row and inner placeholder row, in the order shown */
      order: Series<string>;
    },
  ) {
    this.rowIds = rowIds;
    this.columnIds = columnIds;
    this.placeholderRowId = placeholderRowId;
    this.rangeRestrictedColumnIds = rangeRestrictedColumnIds;
    this.innerPlaceholderRowIds =
      innerPlaceholders?.rowIds ?? new ImmutableSet();
    this.rowOrder = innerPlaceholders?.order ?? rowIds;
  }

  isPlaceholderRowId(rowId: string): boolean {
    return (
      rowId === this.placeholderRowId || this.innerPlaceholderRowIds.has(rowId)
    );
  }

  /**
   * @returns the row id that should be used to represent the given row id in
   * the plane. The placeholder row at the bottom is represented by the last
   * data row, and an inner placeholder row by the nearest data row above it
   * (or below it, where there is none above). Other row ids are returned as
   * they are.
   */
  private normalizeFlexibleRowId(rowId: string): string | undefined {
    if (rowId === this.placeholderRowId) {
      return this.rowIds.last;
    }
    if (!this.innerPlaceholderRowIds.has(rowId)) {
      return rowId;
    }
    const index = this.rowOrder.getIndex(rowId);
    if (index === undefined) return this.rowIds.last;
    const isDataRow = (id: string | undefined) =>
      id !== undefined && !this.innerPlaceholderRowIds.has(id);
    for (let i = index - 1; i >= 0; i -= 1) {
      const id = this.rowOrder.at(i);
      if (isDataRow(id)) return id;
    }
    for (let i = index + 1; i < this.rowOrder.length; i += 1) {
      const id = this.rowOrder.at(i);
      if (isDataRow(id)) return id;
    }
    return undefined;
  }

  /**
   * @returns an iterable of all the data cells in the plane. This does not
   * include header cells or placeholder cells.
   */
  allDataCells(): Iterable<string> {
    return makeCells(this.rowIds, this.columnIds);
  }

  /**
   * @returns an iterable of all the data cells in the plane that are in or
   * between the two given rows. This does not include header cells.
   *
   * If either of the provided rows are placeholder rows, then the last data row
   * will be used in their place. This ensures that the selection is made only
   * of data rows, and will never include the placeholder row, even if a user
   * drags to select it.
   */
  dataCellsInFlexibleRowRange(
    rowIdA: string,
    rowIdB: string,
  ): Iterable<string> {
    const a = this.normalizeFlexibleRowId(rowIdA);
    if (a === undefined) {
      return [];
    }
    const b = this.normalizeFlexibleRowId(rowIdB);
    if (b === undefined) {
      return [];
    }
    return makeCells(this.rowIds.range(a, b), this.columnIds);
  }

  /**
   * @returns an iterable of all the data cells in the plane that are in or
   * between the two given columns. This does not include header cells or
   * placeholder cells.
   */
  dataCellsInColumnRange(
    columnIdA: string,
    columnIdB: string,
  ): Iterable<string> {
    return makeCells(this.rowIds, this.columnIds.range(columnIdA, columnIdB));
  }

  /**
   * @returns an iterable of all the data cells in the plane that are in or
   * between the two given cell. This does not include header cells.
   *
   * If either of the provided cells are placeholder cells, then cells in the
   * last row and last column will be used in their place. This ensures that the
   * selection is made only of data cells, and will never include the
   * placeholder cell, even if a user drags to select it.
   */
  dataCellsInFlexibleCellRange(
    cellIdA: string,
    cellIdB: string,
  ): Iterable<string> {
    const cellA = parseCellId(cellIdA);
    const cellB = parseCellId(cellIdB);
    return this.dataCellsInFlexibleRowColumnRange(
      cellA.rowId,
      cellB.rowId,
      cellA.columnId,
      cellB.columnId,
    );
  }

  /**
   * @returns an iterable of all the data cells in the plane that are within the
   * rectangle bounded by the given rows and columns. This does not include
   * header cells.
   *
   * If either of the provided rowIds are placeholder cells, then cells in the
   * last row and last column will be used in their place. This ensures that the
   * selection is made only of data cells, and will never include the
   * placeholder cell, even if a user drags to select it.
   */
  dataCellsInFlexibleRowColumnRange(
    flexibleRowIdA: string,
    flexibleRowIdB: string,
    columnIdA: string,
    columnIdB: string,
  ): Iterable<string> {
    const rowIdA = this.normalizeFlexibleRowId(flexibleRowIdA);
    if (rowIdA === undefined) {
      return [];
    }
    const rowIdB = this.normalizeFlexibleRowId(flexibleRowIdB);
    if (rowIdB === undefined) {
      return [];
    }
    const rowIds = this.rowIds.range(rowIdA, rowIdB);
    const columnIds = this.columnIds.range(columnIdA, columnIdB);
    return makeCells(rowIds, columnIds);
  }

  getAdjacentCell(cellId: string, direction: Direction): AdjacentCell {
    const cell = parseCellId(cellId);

    const columnOffset = getColumnOffset(direction);
    const newColumnId = this.columnIds.offset(cell.columnId, columnOffset);
    if (newColumnId === undefined) {
      return noAdjacentCell();
    }

    const cellIn = (rowId: string): AdjacentCell => {
      const newCellId = makeCellId(rowId, newColumnId);
      return this.isPlaceholderRowId(rowId)
        ? adjacentPlaceholderCell(newCellId)
        : adjacentDataCell(newCellId);
    };

    const rowOffset = getRowOffset(direction);
    if (rowOffset === 0) {
      // Move laterally within the row
      return cellIn(cell.rowId);
    }

    if (cell.rowId === this.placeholderRowId) {
      if (direction === Direction.Down) {
        // Can't go down from the placeholder row
        return noAdjacentCell();
      }
      // Move up from the placeholder row into the last row above it
      const lastRowId = this.rowOrder.last;
      return lastRowId === undefined ? noAdjacentCell() : cellIn(lastRowId);
    }

    const newRowId = this.rowOrder.offset(cell.rowId, rowOffset);
    if (newRowId === undefined) {
      if (direction === Direction.Down && this.placeholderRowId !== undefined) {
        // Move down from the last row into the placeholder row
        return cellIn(this.placeholderRowId);
      }
      return noAdjacentCell();
    }
    return cellIn(newRowId);
  }

  get hasResultRows(): boolean {
    return this.rowIds.length > 0;
  }

  get hasPlaceholder(): boolean {
    return this.placeholderRowId !== undefined;
  }
}
