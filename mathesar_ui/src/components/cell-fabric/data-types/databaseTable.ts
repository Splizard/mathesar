import type { ComponentAndProps } from '@mathesar-component-library/types';

import DatabaseTableCell from './components/database-table/DatabaseTableCell.svelte';
import DatabaseTableInput from './components/database-table/DatabaseTableInput.svelte';
import type { CellComponentFactory } from './typeDefinitions';

/** A column holding a table of the database, chosen among them by name */
const databaseTableType: CellComponentFactory = {
  initialInputValue: null,
  get: (): ComponentAndProps => ({ component: DatabaseTableCell, props: {} }),
  getInput: (): ComponentAndProps => ({
    component: DatabaseTableInput,
    props: {},
  }),
  getDisplayFormatter: () => String,
};

export default databaseTableType;
