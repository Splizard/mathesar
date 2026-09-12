import { dataFilesApi } from '@mathesar/api/rest/dataFiles';
import type { DataFile } from '@mathesar/api/rest/types/dataFiles';
import type {
  ColumnCastOptions,
  ColumnMetadataBlob,
  ColumnPatchSpec,
  RawColumnWithMetadata,
} from '@mathesar/api/rpc/columns';
import type { ColumnPreviewSpec } from '@mathesar/api/rpc/tables';
import { getCellCap } from '@mathesar/components/cell-fabric/utils';
import type { Schema } from '@mathesar/models/Schema';
import type { Table } from '@mathesar/models/Table';
import { getAbstractTypeForDbType } from '@mathesar/stores/abstract-types';
import { DB_TYPES } from '@mathesar/stores/abstract-types/dbTypes';
import type { AbstractType } from '@mathesar/stores/abstract-types/types';
import AsyncStore from '@mathesar/stores/AsyncStore';
import { createTableFromDataFile, deleteTable } from '@mathesar/stores/tables';

/**
 * This is to improve loading experience by seeding the table with empty
 * records.
 */
export function getSkeletonRecords(): Record<string, unknown>[] {
  return [{}, {}];
}

export const RESERVED_ID_COLUMN_NAME = 'id';

export interface ProcessedPreviewColumn {
  id: number;
  column: RawColumnWithMetadata;
  abstractType: AbstractType;
  cellComponentAndProps: ReturnType<typeof getCellCap>;
}

export function processColumns(
  columns: RawColumnWithMetadata[],
): ProcessedPreviewColumn[] {
  return columns.map((column) => {
    const abstractType = getAbstractTypeForDbType(column.type, column.metadata);
    return {
      id: column.id,
      column,
      abstractType,
      cellComponentAndProps: getCellCap({
        cellInfo: abstractType.cellInfo,
        column,
      }),
    };
  });
}

export function makeHeaderUpdateRequest({
  schema,
  table,
  dataFile,
}: {
  schema: Schema;
  table: Pick<Table, 'oid'>;
  dataFile: Pick<DataFile, 'id'>;
}) {
  async function updateHeader({
    firstRowIsHeader,
    customizedTableName,
  }: {
    firstRowIsHeader: boolean;
    customizedTableName: string;
  }) {
    await Promise.all([
      deleteTable(schema, table.oid),
      dataFilesApi.update(dataFile.id, {
        header: firstRowIsHeader,
      }),
    ]);
    return createTableFromDataFile({
      schema,
      dataFile,
      name: customizedTableName,
    });
  }
  return new AsyncStore(updateHeader);
}

export interface ColumnProperties {
  selected: boolean;
  displayName: string;
  castOptions?: ColumnCastOptions;
}

function makeColumnProperties(
  column: RawColumnWithMetadata,
  castOptions?: ColumnCastOptions,
): ColumnProperties {
  return { selected: true, displayName: column.name, castOptions };
}

type ColumnPropertiesMap = Record<
  RawColumnWithMetadata['id'],
  ColumnProperties
>;

export function buildColumnPropertiesMap(
  columns: RawColumnWithMetadata[],
  castOptionsMap: Record<
    RawColumnWithMetadata['id'],
    ColumnCastOptions | undefined
  >,
): Record<RawColumnWithMetadata['id'], ColumnProperties> {
  return Object.fromEntries(
    columns.map((c) => [c.id, makeColumnProperties(c, castOptionsMap?.[c.id])]),
  );
}

export function buildColumnPreviewSpec(
  columns: RawColumnWithMetadata[],
  columnPropertiesMap: ColumnPropertiesMap,
): ColumnPreviewSpec[] {
  return columns.map((c) => ({
    ...c,
    cast_options: columnPropertiesMap[c.id]?.castOptions,
  }));
}

function finalizeColumn(
  { id, type, primary_key, type_options }: RawColumnWithMetadata,
  name: string | undefined,
  cast_options?: ColumnCastOptions,
): ColumnPatchSpec {
  return {
    id,
    name,
    cast_options,

    // For most columns we include type information so that users can modify
    // column types during import.
    //
    // But for PK columns we don't want to send these details to the backend. In
    // most cases it wouldn't matter if we sent the type details, because we
    // disable the type config form elements on the front end and it would be
    // theoretically be a no-op to send the type details that we got back from
    // the server. However in [#4372] we had a slippery bug that seemed best to
    // fix on the front end by avoiding sending type details for PK columns.
    //
    // [#4372]: https://github.com/mathesar-foundation/mathesar/issues/4372
    ...(primary_key ? {} : { type, type_options }),
  };
}

export function finalizeColumns(
  columns: RawColumnWithMetadata[],
  columnPropertiesMap: ColumnPropertiesMap,
) {
  return columns
    .filter((c) => columnPropertiesMap[c.id]?.selected)
    .map((c) =>
      finalizeColumn(
        c,
        columnPropertiesMap[c.id]?.displayName,
        columnPropertiesMap[c.id]?.castOptions,
      ),
    );
}

/**
 * The columns that came in as money, and what they should become.
 *
 * Money is stored as a plain numeric carrying a currency symbol, but an amount
 * arrives from a file still wearing that symbol, and only the money cast knows
 * how to take it off. So a column is imported as `mathesar_types.mathesar_money`
 * and converted once it is in: the domain is numeric underneath, which makes the
 * conversion free, and casting to numeric directly would either fail on the
 * symbol or, were it taught not to, silently discard it.
 */
export function getMoneyColumnsToConvert(
  columns: RawColumnWithMetadata[],
  columnPropertiesMap: ColumnPropertiesMap,
): { patches: ColumnPatchSpec[]; metadata: ColumnMetadataBlob[] } {
  const money = columns.filter(
    (c) =>
      columnPropertiesMap[c.id]?.selected &&
      c.type === DB_TYPES.MSAR__MATHESAR_MONEY,
  );
  return {
    patches: money.map((c) => ({ id: c.id, type: DB_TYPES.NUMERIC })),
    metadata: money.map((c) => {
      const castOptions = columnPropertiesMap[c.id]?.castOptions ?? {};
      const prefix = String(castOptions.curr_pref ?? '');
      const suffix = String(castOptions.curr_suff ?? '');
      return {
        attnum: c.id,
        // Whichever side it was written on is where it goes back.
        mon_currency_symbol: prefix || suffix,
        ...(suffix && !prefix
          ? { mon_currency_location: 'end-with-space' as const }
          : {}),
      };
    }),
  };
}
