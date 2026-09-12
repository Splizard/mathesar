import type { RawColumnWithMetadata } from '@mathesar/api/rpc/columns';
import { DB_TYPES } from '@mathesar/stores/abstract-types/dbTypes';
import { TextInput } from '@mathesar-component-library';
import type { ComponentAndProps } from '@mathesar-component-library/types';

import PointCell from './components/geometry/PointCell.svelte';
import PointInput from './components/geometry/PointInput.svelte';
import TextBoxCell from './components/textbox/TextBoxCell.svelte';
import type { CellComponentFactory } from './typeDefinitions';

const holdsPoint = (column: RawColumnWithMetadata) =>
  column.type === DB_TYPES.POINT;

/** A 2D column, whose points are edited as their coordinates */
const geometryType: CellComponentFactory = {
  initialInputValue: '',
  get: (column: RawColumnWithMetadata): ComponentAndProps =>
    holdsPoint(column)
      ? { component: PointCell, props: {} }
      : { component: TextBoxCell, props: {} },
  getInput: (column: RawColumnWithMetadata): ComponentAndProps =>
    holdsPoint(column)
      ? { component: PointInput, props: {} }
      : { component: TextInput, props: {} },
  getDisplayFormatter: () => String,
};

export default geometryType;
