import { execPipe, find, map } from 'iter-tools';
import type { Readable } from 'svelte/store';

import type {
  ColumnPrivilege,
  RawColumnWithMetadata,
} from '@mathesar/api/rpc/columns';
import type {
  FkConstraint,
  RawConstraint,
} from '@mathesar/api/rpc/constraints';
import type { CellColumnFabric } from '@mathesar/components/cell-fabric/types';
import {
  getCellCap,
  getDbTypeBasedInputCap,
  getDbTypeBasedSimpleInputCap,
  getDisplayFormatter,
  getInitialInputValue,
  getLinkedRecordInputCap,
} from '@mathesar/components/cell-fabric/utils';
import type { Table } from '@mathesar/models/Table';
import {
  getAbstractTypeForDbType,
  getEqualityFiltersForAbstractType,
  getFiltersForAbstractType,
  getPreprocFunctionsForAbstractType,
  isAutoFilledAbstractType,
} from '@mathesar/stores/abstract-types';
import { isCurrentUserDefault } from '@mathesar/stores/abstract-types/currentUserDefault';
import { isUserColumn } from '@mathesar/stores/abstract-types/type-configs/uuid';
import type {
  AbstractType,
  AbstractTypePreprocFunctionDefinition,
} from '@mathesar/stores/abstract-types/types';
import { makeRecordSelectorOrchestratorFactory } from '@mathesar/systems/record-selector/recordSelectorOrchestrator';
import type { ComponentAndProps } from '@mathesar-component-library/types';

import {
  findFkConstraintsForColumn,
  hasCheckPattern,
} from './constraintsUtils';
import type { RecordSummariesForSheet } from './record-summaries/recordSummaryUtils';

/**
 * Prefer properties over functions in this class since we use these properties in
 * each cell and the class is immutable.
 */
export class ProcessedColumn implements CellColumnFabric {
  /**
   * This property is also available via `column.id`, but it's duplicated at a
   * higher level for brevity's sake because it's used so frequently.
   *
   * Note: This is a stringified version of the column's attnum (RawColumn.id).
   * The RawColumn.id remains a number for API compatibility.
   */
  readonly id: string;

  readonly column: RawColumnWithMetadata;

  readonly columnIndex: number;

  readonly tableOid: Table['oid'];

  /** All constriants relevant to this column */
  readonly relevantConstraints: RawConstraint[];

  /** Constraints whose columns include only this column */
  readonly exclusiveConstraints: RawConstraint[];

  /** Constraints whose columns include this column and other columns too */
  readonly sharedConstraints: RawConstraint[];

  readonly abstractType: AbstractType;

  readonly initialInputValue: unknown;

  readonly linkFk?: FkConstraint;

  readonly hasEnhancedPrimaryKeyCell: boolean;

  readonly cellComponentAndProps: ComponentAndProps;

  readonly inputComponentAndProps: ComponentAndProps;

  readonly simpleInputComponentAndProps: ComponentAndProps;

  readonly allowedFiltersMap: ReturnType<typeof getFiltersForAbstractType>;

  readonly preprocFunctions: AbstractTypePreprocFunctionDefinition[];

  formatCellValue: (
    cellValue: unknown,
    recordSummaries?: RecordSummariesForSheet,
  ) => string | null | undefined;

  readonly currentRolePrivileges: Set<ColumnPrivilege>;

  readonly isEditable: boolean;

  readonly isUserTrackingColumn: boolean;

  /** The abstract type's cellInfo, narrowed by what this column's constraints say. */
  readonly cellInfo: AbstractType['cellInfo'];

  readonly userTrackingAttnum: number | null | undefined;

  constructor(props: {
    tableOid: Table['oid'];
    column: RawColumnWithMetadata;
    columnIndex: number;
    constraints: RawConstraint[];
    hasEnhancedPrimaryKeyCell?: boolean;
    userTrackingAttnum?: number | null;
  }) {
    this.id = String(props.column.id);
    this.column = props.column;
    this.columnIndex = props.columnIndex;
    this.tableOid = props.tableOid;
    this.hasEnhancedPrimaryKeyCell = props.hasEnhancedPrimaryKeyCell ?? true;
    this.userTrackingAttnum = props.userTrackingAttnum;

    this.relevantConstraints = props.constraints.filter((c) =>
      c.columns.includes(this.column.id),
    );
    this.exclusiveConstraints = this.relevantConstraints.filter(
      (c) => c.columns.length === 1,
    );
    this.sharedConstraints = this.relevantConstraints.filter(
      (c) => c.columns.length !== 1,
    );

    this.abstractType = getAbstractTypeForDbType(
      this.column.type,
      this.column.metadata,
      this.column,
    );

    // A text column constrained to trimmed, single-line values is shown as a
    // text box rather than a text area. Without a constraint saying so, the
    // fall-back is what the DB type implies: only `character` is single-line.
    this.cellInfo = (() => {
      const { cellInfo } = this.abstractType;
      if (
        cellInfo?.type !== 'string' ||
        !hasCheckPattern(this.exclusiveConstraints, this.column.id, 'text_box')
      ) {
        return cellInfo;
      }
      return { ...cellInfo, config: { ...cellInfo.config, multiLine: false } };
    })();

    this.initialInputValue = getInitialInputValue(
      this.column,
      undefined,
      this.cellInfo,
    );

    [this.linkFk] = findFkConstraintsForColumn(
      this.exclusiveConstraints,
      this.column.id,
    );

    const displayEnhancedPkCell =
      this.hasEnhancedPrimaryKeyCell && this.column.primary_key;
    const fkTargetTableId = this.linkFk
      ? this.linkFk.referent_table_oid
      : undefined;

    this.cellComponentAndProps = getCellCap({
      cellInfo: this.cellInfo,
      column: this.column,
      fkTargetTableId,
      pkTargetTableId: displayEnhancedPkCell ? this.tableOid : undefined,
    });

    this.inputComponentAndProps = fkTargetTableId
      ? getLinkedRecordInputCap({
          recordSelectionOrchestratorFactory:
            makeRecordSelectorOrchestratorFactory({
              tableOid: fkTargetTableId,
            }),
          targetTableId: fkTargetTableId,
        })
      : getDbTypeBasedInputCap(this.column, this.cellInfo);

    this.simpleInputComponentAndProps =
      getDbTypeBasedSimpleInputCap(this.column, this.cellInfo) ??
      this.inputComponentAndProps;

    this.allowedFiltersMap = (() =>
      this.linkFk !== undefined
        ? getEqualityFiltersForAbstractType(this.abstractType.identifier)
        : getFiltersForAbstractType(this.abstractType.identifier))();

    this.preprocFunctions = getPreprocFunctionsForAbstractType(
      this.abstractType.identifier,
    );

    this.formatCellValue = getDisplayFormatter(this.column, this.column.id);

    this.currentRolePrivileges = new Set(this.column.current_role_priv);

    this.isEditable = (() => {
      const currRoleHasEditPrivileges =
        this.currentRolePrivileges.has('UPDATE');
      if (!currRoleHasEditPrivileges) {
        return false;
      }
      const hasDynamicDefault = !!this.column.default?.is_dynamic;
      const isPk = !!this.column.primary_key;
      if (isPk) {
        return !this.hasEnhancedPrimaryKeyCell && !hasDynamicDefault;
      }
      // Disable editing for the user-tracking column
      if (
        props.userTrackingAttnum != null &&
        this.column.id === props.userTrackingAttnum
      ) {
        return false;
      }
      // Their values record when the record was created or last changed
      if (isAutoFilledAbstractType(this.abstractType)) {
        return false;
      }
      // Theirs record who created the record or last changed it
      if (
        isUserColumn(this.column.metadata) &&
        (this.column.updated_at_trigger ||
          isCurrentUserDefault(this.column.default))
      ) {
        return false;
      }
      return true;
    })();
    this.isUserTrackingColumn =
      props.userTrackingAttnum != null &&
      this.column.id === props.userTrackingAttnum;
  }

  withoutEnhancedPkCell() {
    return new ProcessedColumn({
      tableOid: this.tableOid,
      column: this.column,
      columnIndex: this.columnIndex,
      constraints: this.relevantConstraints,
      hasEnhancedPrimaryKeyCell: false,
      userTrackingAttnum: this.userTrackingAttnum,
    });
  }
}

export function getFirstEditableColumn(
  columns: Iterable<ProcessedColumn>,
): ProcessedColumn | undefined {
  return execPipe(
    columns,
    map((c) => c.withoutEnhancedPkCell()),
    find((c) => c.isEditable),
  );
}

/** Maps column ids (as strings) to processed columns */
export type ProcessedColumns = Map<string, ProcessedColumn>;
export type ProcessedColumnsStore = Readable<ProcessedColumns>;
