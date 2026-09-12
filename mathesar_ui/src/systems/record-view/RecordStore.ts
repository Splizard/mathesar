import { type Writable, get, writable } from 'svelte/store';
import { _ } from 'svelte-i18n';

import type { RequestStatus } from '@mathesar/api/rest/utils/requestUtils';
import { api } from '@mathesar/api/rpc';
import type { FileManifest, RecordsResponse } from '@mathesar/api/rpc/records';
import { WritableMap } from '@mathesar/component-library';
import type { Table } from '@mathesar/models/Table';
import { getRecordPageUrl } from '@mathesar/routes/urls';
import AssociatedCellData from '@mathesar/stores/AssociatedCellData';
import { TableStructure } from '@mathesar/stores/table-data';
import { getErrorMessage } from '@mathesar/utils/errors';
import {
  type RecordName,
  canonicalRecordNameKey,
  recordNameToText,
} from '@mathesar/utils/recordName';

export default class RecordStore {
  tableStructure: TableStructure;

  fetchRequest = writable<RequestStatus | undefined>(undefined);

  /** Keys are column ids (as strings) */
  fieldValues = new WritableMap<string, unknown>();

  recordSummaries = new AssociatedCellData<string>();

  fileManifests = new AssociatedCellData<FileManifest>();

  summary: Writable<string>;

  table: Table;

  /**
   * What this record is called: one value, or the key's values where the key is made of more than
   * one column. Sent to the server as it is.
   */
  recordPk: RecordName;

  /** The same name written out, which is how a URL holds it and how a summary is keyed by it */
  recordPkText: string;

  recordPageUrl: string;

  constructor({ table, recordPk }: { table: Table; recordPk: RecordName }) {
    const { schema } = table;
    this.tableStructure = new TableStructure({ schema, oid: table.oid });
    this.table = table;
    this.recordPk = recordPk;
    this.recordPkText = recordNameToText(recordPk);
    this.summary = writable('');
    this.recordPageUrl = getRecordPageUrl(
      table.schema.database.id,
      table.schema.oid,
      table.oid,
      recordPk,
    );
    void this.fetch();
  }

  private updateSelfWithApiResponseData(response: RecordsResponse): void {
    const result = response.results[0];
    this.fieldValues.reconstruct(
      Object.entries(result).map(([k, v]) => [k, v]),
    );
    // Keyed by the name the server writes, which for a name of several values is spaced its own
    // way; read through the one form both ends agree on.
    const summaries = Object.entries(response.record_summaries ?? {}).find(
      ([key]) => canonicalRecordNameKey(key) === this.recordPkText,
    );
    this.summary.set(summaries?.[1] ?? '');
    if (response.linked_record_summaries) {
      this.recordSummaries.setFetchedValuesFromPrimitive(
        response.linked_record_summaries,
      );
    }
    if (response.download_links) {
      this.fileManifests.setFetchedValuesFromPrimitive(response.download_links);
    }
  }

  async fetch(): Promise<void> {
    this.fetchRequest.set({ state: 'processing' });
    const databaseId = this.table.schema.database.id;
    try {
      const response = await api.records
        .get({
          database_id: databaseId,
          table_oid: this.table.oid,
          record_id: this.recordPk,
          return_record_summaries: true,
        })
        .run();
      if (response.count === 0) {
        throw new Error(
          get(_)('record_not_found', { values: { id: this.recordPkText } }),
        );
      }
      this.updateSelfWithApiResponseData(response);
      this.fetchRequest.set({ state: 'success' });
    } catch (error) {
      this.fetchRequest.set({
        state: 'failure',
        errors: [getErrorMessage(error)],
      });
    }
  }

  async patch(payload: Record<string, unknown>) {
    const databaseId = this.table.schema.database.id;
    const response = await api.records
      .patch({
        database_id: databaseId,
        table_oid: this.table.oid,
        record_id: this.recordPk,
        record_def: payload,
        return_record_summaries: true,
      })
      .run();
    this.updateSelfWithApiResponseData(response);
  }
}
