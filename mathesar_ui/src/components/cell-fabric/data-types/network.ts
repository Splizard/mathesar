import type { RawColumnWithMetadata } from '@mathesar/api/rpc/columns';
import { DB_TYPES } from '@mathesar/stores/abstract-types/dbTypes';
import type { ComponentAndProps } from '@mathesar-component-library/types';

import NetworkCell from './components/network/NetworkCell.svelte';
import NetworkInput from './components/network/NetworkInput.svelte';
import type { CellComponentFactory } from './typeDefinitions';

const holdsMacAddress = (column: RawColumnWithMetadata) =>
  column.type === DB_TYPES.MACADDR || column.type === DB_TYPES.MACADDR8;

/**
 * An IP column, whose values are checked as they're typed, and which offers
 * the address the person is coming from.
 */
const networkType: CellComponentFactory = {
  initialInputValue: '',
  get: (column: RawColumnWithMetadata): ComponentAndProps => ({
    component: NetworkCell,
    props: { holdsMacAddress: holdsMacAddress(column) },
  }),
  getInput: (column: RawColumnWithMetadata): ComponentAndProps => ({
    component: NetworkInput,
    props: { holdsMacAddress: holdsMacAddress(column) },
  }),
  getDisplayFormatter: () => String,
};

export default networkType;
