import '@testing-library/jest-dom';
import { render } from '@testing-library/svelte';
import { readable } from 'svelte/store';

import type { RawColumnWithMetadata } from '@mathesar/api/rpc/columns';
import { getCellCap } from '@mathesar/components/cell-fabric/utils';
import type { ProcessedColumn } from '@mathesar/stores/table-data';
import { getPlainCell } from '@mathesar/systems/table-view/row/plainCell';

import PrimaryKeyCell from '../components/primary-key/PrimaryKeyCell.svelte';
import { getCellInfo } from '../utils';

const table = {
  oid: 19310,
  name: 'card_prices',
  schema: 2200,
  schema_name: 'public',
};

// Loading the cell fabric pulls in the database-table cell, which reads the
// page's preloaded data at import time.
vi.mock('@mathesar/utils/preloadData', async () => ({
  ...(await vi.importActual<object>('@mathesar/utils/preloadData')),
  preloadCommonData: () => ({ databases: [], servers: [] }),
}));

vi.mock('@mathesar/stores/databases', () => ({
  databasesStore: { currentDatabase: readable({ id: 4 }) },
}));

vi.mock('@mathesar/stores/allTables', async () => ({
  ...(await vi.importActual<object>('@mathesar/stores/allTables')),
  getAllTablesStore: () => ({
    ...readable({
      isLoading: false,
      hasSettled: true,
      resolvedValue: [table],
    }),
    runConservatively: () => Promise.resolve(),
  }),
}));

function column(type: string): RawColumnWithMetadata {
  return {
    id: 1,
    name: 'table',
    type,
    type_options: null,
    metadata: null,
  } as unknown as RawColumnWithMetadata;
}

const namesATable = column('regclass');
const doesNot = column('bigint');

function cap(col: RawColumnWithMetadata) {
  return getCellCap({
    cellInfo: getCellInfo(col.type, col.metadata ?? null),
    column: col,
    pkTargetTableId: 42,
  });
}

/**
 * A `regclass` column is shown as a link to the table it names. Being the
 * table's primary key is no reason to lose that.
 */
describe('a primary key column of tables', () => {
  test('is marked as naming one, where an ordinary key is not', () => {
    expect(cap(namesATable).component).toBe(PrimaryKeyCell);
    expect(cap(namesATable).props).toMatchObject({ namesTable: true });
    expect(cap(doesNot).props).toMatchObject({ namesTable: false });
  });

  test('links to the table it names', () => {
    const { component, props } = cap(namesATable);
    const { container } = render(component, {
      props: {
        ...(props as Record<string, unknown>),
        isActive: false,
        disabled: false,
        isIndependentOfSheet: true,
        canViewLinkedEntities: false,
        value: 'public.card_prices',
      },
    });
    const link = container.querySelector('a');
    expect(link).toHaveTextContent('public.card_prices');
    expect(link?.getAttribute('href')).toContain(String(table.oid));
  });

  test('is not flattened to plain text, which would drop the link', () => {
    const plainCellOf = (col: RawColumnWithMetadata) =>
      getPlainCell(
        {
          cellComponentAndProps: cap(col),
          isEditable: true,
        } as ProcessedColumn,
        'public.card_prices',
        true,
        42,
      );
    expect(plainCellOf(namesATable)).toBeUndefined();
    expect(plainCellOf(doesNot)).toBeDefined();
  });
});
