import type { RawColumnWithMetadata } from '@mathesar/api/rpc/columns';
import { DB_TYPES } from '@mathesar/stores/abstract-types/dbTypes';
import { TextInput } from '@mathesar-component-library';
import type { ComponentAndProps } from '@mathesar-component-library/types';

import BinaryCell from './components/binary/BinaryCell.svelte';
import type { CellComponentFactory } from './typeDefinitions';

const holdsBits = (column: RawColumnWithMetadata) =>
  column.type === DB_TYPES.BIT || column.type === DB_TYPES.BIT_VARYING;

/** A Binary column, whose cells say how much each value holds */
const binaryType: CellComponentFactory = {
  initialInputValue: '',
  get: (column: RawColumnWithMetadata): ComponentAndProps => ({
    component: BinaryCell,
    props: { holdsBits: holdsBits(column) },
  }),
  getInput: (): ComponentAndProps => ({ component: TextInput, props: {} }),
  getDisplayFormatter: () => String,
};

export default binaryType;
