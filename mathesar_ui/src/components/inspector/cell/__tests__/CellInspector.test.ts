import '@testing-library/jest-dom';
import { fireEvent, render } from '@testing-library/svelte';

import { getCellInfo } from '@mathesar/components/cell-fabric/data-types/utils';
import { getCellCap } from '@mathesar/components/cell-fabric/utils';

import CellInspector from '../CellInspector.svelte';

// Loading the cell fabric pulls in the database-table cell, which reads the
// page's preloaded data at import time.
vi.mock('@mathesar/utils/preloadData', async () => ({
  ...(await vi.importActual<object>('@mathesar/utils/preloadData')),
  preloadCommonData: () => ({ databases: [], servers: [] }),
}));

const column = { type: 'character varying', type_options: null, metadata: null };

const selectedCellData = {
  activeCellData: {
    column: {
      id: 'note',
      column,
      cellComponentAndProps: getCellCap({
        cellInfo: getCellInfo(column.type, null) ?? { type: 'string' },
        column,
      }),
    },
    value: 'as written',
  },
  selectionData: { cellCount: 1 },
} as never;

/**
 * The Cell tab used to show the value behind glass. It is the same cell as the
 * one in the sheet, so it is edited the same way — except where the values are
 * a query's, as in the Data Explorer, and nobody's to change.
 */
describe('the inspector‘s cell', () => {
  test('is only shown when it cannot be saved', () => {
    const { container } = render(CellInspector, { props: { selectedCellData } });
    expect(container).toHaveTextContent('as written');
    expect(container.querySelector('input, textarea')).toBeNull();
  });

  test('is edited in place when it can, the way the sheet edits it', async () => {
    const setValue = vi.fn();
    const { container } = render(CellInspector, {
      props: { selectedCellData, setValue },
    });
    const cell = container.querySelector('.cell-wrapper') as HTMLElement;
    expect(cell).not.toBeNull();
    await fireEvent.dblClick(cell);

    const field = container.querySelector('input, textarea');
    expect(field).not.toBeNull();
    await fireEvent.input(field as HTMLTextAreaElement, {
      target: { value: 'written here instead' },
    });
    await fireEvent.blur(field as HTMLTextAreaElement);
    expect(setValue).toHaveBeenCalledWith('written here instead');
  });

  test('opens no editor at all when it is only shown', async () => {
    const { container } = render(CellInspector, { props: { selectedCellData } });
    await fireEvent.dblClick(
      container.querySelector('.cell-wrapper') as HTMLElement,
    );
    expect(container.querySelector('input, textarea')).toBeNull();
  });
});
