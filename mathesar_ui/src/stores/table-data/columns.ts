import { type Readable, derived, writable } from 'svelte/store';

import type { RequestStatus } from '@mathesar/api/rest/utils/requestUtils';
import { api } from '@mathesar/api/rpc';
import type { ColumnMetadata } from '@mathesar/api/rpc/_common/columnDisplayOptions';
import type {
  ColumnCreationSpec,
  ColumnPatchSpec,
  ColumnTypeOptions,
  RawColumnWithMetadata,
} from '@mathesar/api/rpc/columns';
import type { Database } from '@mathesar/models/Database';
import type { Table } from '@mathesar/models/Table';
import { batchRun } from '@mathesar/packages/json-rpc-client-builder';
import type { Formula } from '@mathesar/systems/formulas/formula';
import { getErrorMessage } from '@mathesar/utils/errors';
import {
  type CancellablePromise,
  EventHandler,
  WritableSet,
  isDefinedNonNullable,
} from '@mathesar-component-library';

/**
 * The display options which change what a records request comes back with, as opposed to only how
 * the client draws what it already has.
 *
 * Only `user_display_field` does: it is what makes the back end build user display values for a
 * column, in the `linked_record_summaries` of the response. A width, a date format, a currency
 * symbol and the rest are the client's business entirely.
 */
const METADATA_AFFECTING_RECORDS: (keyof ColumnMetadata)[] = [
  'user_display_field',
];

export class ColumnsDataStore extends EventHandler<{
  columnRenamed: void;
  columnAdded: void;
  columnDeleted: RawColumnWithMetadata['id'];
  columnPatched: void;
}> {
  private apiContext: {
    database_id: number;
    table_oid: Table['oid'];
  };

  private promise: CancellablePromise<RawColumnWithMetadata[]> | undefined;

  private fetchedColumns = writable<RawColumnWithMetadata[]>([]);

  fetchStatus = writable<RequestStatus | undefined>(undefined);

  hiddenColumns: WritableSet<number>;

  /** Will only show visible columns */
  columns: Readable<RawColumnWithMetadata[]>;

  pkColumn: Readable<RawColumnWithMetadata | undefined>;

  /**
   * Every column the primary key is made of, lowest attnum first, which is the order a record's
   * name is written in. Empty where there is no key.
   */
  pkColumns: Readable<RawColumnWithMetadata[]>;

  constructor({
    database,
    table,
    hiddenColumns,
  }: {
    database: Pick<Database, 'id'>;
    table: Pick<Table, 'oid'>;
    /** Values are column ids */
    hiddenColumns?: Iterable<number>;
  }) {
    super();
    this.apiContext = { database_id: database.id, table_oid: table.oid };
    this.hiddenColumns = new WritableSet(hiddenColumns);
    this.columns = derived(
      [this.fetchedColumns, this.hiddenColumns],
      ([fetched, hidden]) => fetched.filter((column) => !hidden.has(column.id)),
    );
    this.pkColumn = derived(this.fetchedColumns, (fetched) =>
      fetched.find((c) => c.primary_key),
    );
    this.pkColumns = derived(this.fetchedColumns, (fetched) =>
      fetched.filter((c) => c.primary_key).sort((a, b) => a.id - b.id),
    );
    void this.fetch();
  }

  async fetch(): Promise<RawColumnWithMetadata[] | undefined> {
    try {
      this.fetchStatus.set({ state: 'processing' });
      this.promise?.cancel();
      this.promise = api.columns
        .list_with_metadata({ ...this.apiContext })
        .run();
      const columns = await this.promise;
      this.fetchedColumns.set(columns);
      this.fetchStatus.set({ state: 'success' });
      return columns;
    } catch (e) {
      this.fetchStatus.set({ state: 'failure', errors: [getErrorMessage(e)] });
      return undefined;
    } finally {
      this.promise = undefined;
    }
  }

  async add(columnDetails: ColumnCreationSpec): Promise<void> {
    await api.columns
      .add({ ...this.apiContext, column_data_list: [columnDetails] })
      .run();
    await this.dispatch('columnAdded');
    await this.fetch();
  }

  /**
   * Add a column whose values Postgres works out from the rest of the record.
   *
   * The type is left to the formula unless one is given: there is no need to ask what kind of
   * thing an amount times a rate is.
   */
  async addFormula(columnDetails: {
    name: string;
    formula: Formula;
    description?: string | null;
  }): Promise<void> {
    await api.columns
      .add_formula({ ...this.apiContext, ...columnDetails })
      .run();
    await this.dispatch('columnAdded');
    await this.fetch();
  }

  /** Change the formula a column's values are worked out from, working every record out again */
  async patchFormula(columnAttnum: number, formula: Formula): Promise<void> {
    await api.columns
      .patch_formula({
        ...this.apiContext,
        column_attnum: columnAttnum,
        formula,
      })
      .run();
    await this.fetch();
  }

  async addWithMetadata(
    columnDetails: ColumnCreationSpec,
    metadata: ColumnMetadata | null,
  ): Promise<void> {
    const result = await api.columns
      .add({ ...this.apiContext, column_data_list: [columnDetails] })
      .run();
    const [columnId] = result;
    if (columnId && isDefinedNonNullable(metadata)) {
      await api.columns.metadata
        .set({
          ...this.apiContext,
          column_meta_data_list: [{ attnum: columnId, ...metadata }],
        })
        .run();
    }
    await this.dispatch('columnAdded');
    await this.fetch();
  }

  async rename(id: RawColumnWithMetadata['id'], name: string): Promise<void> {
    await api.columns
      .patch({ ...this.apiContext, column_data_list: [{ id, name }] })
      .run();
    await this.dispatch('columnRenamed');
  }

  async updateDescription(
    id: RawColumnWithMetadata['id'],
    description: string | null,
  ): Promise<void> {
    await api.columns
      .patch({ ...this.apiContext, column_data_list: [{ id, description }] })
      .run();
    this.fetchedColumns.update((columns) =>
      columns.map((c) => (c.id === id ? { ...c, description } : c)),
    );
  }

  async setNullabilityOfColumn(
    column: RawColumnWithMetadata,
    nullable: boolean,
  ): Promise<void> {
    if (column.primary_key) {
      throw new Error(
        `Column "${column.name}" cannot allow NULL because it is a primary key.`,
      );
    }
    await api.columns
      .patch({
        ...this.apiContext,
        column_data_list: [{ id: column.id, nullable }],
      })
      .run();
    await this.fetch();
  }

  async patch(patchSpec: ColumnPatchSpec): Promise<void> {
    await api.columns
      .patch({
        ...this.apiContext,
        column_data_list: [patchSpec],
      })
      .run();
    await this.fetch();
    await this.dispatch('columnPatched');
  }

  async setDisplayOptions(
    /** Key is column id, value is display options */
    changes: Map<number, ColumnMetadata | null>,
  ): Promise<void> {
    if (!changes.size) {
      return;
    }

    const { apiContext } = this;
    function* getApiRequests() {
      for (const [columnId, displayOptions] of changes.entries()) {
        yield api.columns.metadata.set({
          ...apiContext,
          column_meta_data_list: [{ attnum: columnId, ...displayOptions }],
        });
      }
    }
    await batchRun([...getApiRequests()]);

    this.fetchedColumns.update((columns) =>
      columns.map((column) => {
        const metadata = changes.get(column.id);
        if (metadata === undefined) return column;
        /**
         * Merged, not replaced, so that our copy says what the request said. Each request sets
         * only the options it names and leaves the column's others alone; replacing here would
         * drop them, so resizing a money column would stop it showing its currency symbol until
         * the page was loaded again.
         */
        return { ...column, metadata: { ...column.metadata, ...metadata } };
      }),
    );

    /**
     * Nothing to fetch unless an option changed that the records response depends on. Dragging a
     * column border changes a width, which no record knows anything about, and re-fetching every
     * record for it is what made resizing flicker.
     */
    const affectsRecords = [...changes.values()].some(
      (metadata) =>
        metadata !== null &&
        METADATA_AFFECTING_RECORDS.some((option) => option in metadata),
    );
    if (affectsRecords) {
      await this.dispatch('columnPatched');
    }
  }

  async changeType(spec: {
    id: RawColumnWithMetadata['id'];
    type: ColumnCreationSpec['type'];
    type_options: ColumnTypeOptions | null;
    metadata: ColumnMetadata | null;
    /** `null` drops the default, `undefined` leaves it alone */
    default?: RawColumnWithMetadata['default'];
    /** Adds or drops an "Updated At" trigger; `undefined` leaves it alone */
    updated_at_trigger?: boolean;
  }): Promise<void> {
    await api.columns
      .patch({
        ...this.apiContext,
        column_data_list: [
          {
            id: spec.id,
            type: spec.type,
            type_options: spec.type_options,
            ...(spec.default !== undefined ? { default: spec.default } : {}),
            ...(spec.updated_at_trigger !== undefined
              ? { updated_at_trigger: spec.updated_at_trigger }
              : {}),
          },
        ],
      })
      .run();
    await api.columns.metadata
      .set({
        ...this.apiContext,
        column_meta_data_list: [{ attnum: spec.id, ...spec.metadata }],
      })
      .run();
    await this.fetch();
    await this.dispatch('columnPatched');
  }

  destroy(): void {
    this.promise?.cancel();
    this.promise = undefined;
    super.destroy();
  }

  async deleteColumn(columnId: RawColumnWithMetadata['id']): Promise<void> {
    await api.columns
      .delete({ ...this.apiContext, column_attnums: [columnId] })
      .run();
    await this.dispatch('columnDeleted', columnId);
    await this.fetch();
  }
}
