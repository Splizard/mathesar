import type { CellColumnFabric } from '@mathesar/components/cell-fabric/types';
import { DB_TYPES } from '@mathesar/stores/abstract-types/dbTypes';
import {
  getRangeTypesOf,
  isMultirangeType,
} from '@mathesar/stores/abstract-types/ranges';
import type { ComponentAndProps } from '@mathesar-component-library/types';

import RangeBounds from './components/range/RangeBounds.svelte';
import RangeCell from './components/range/RangeCell.svelte';
import RangeList from './components/range/RangeList.svelte';
import type {
  CellColumnLike,
  CellComponentFactory,
  SimpleCellDataTypes,
} from './typeDefinitions';
import { getCellConfiguration, getCellInfo } from './utils';

type ComponentFactoryMap = Record<SimpleCellDataTypes, CellComponentFactory>;

/**
 * Cells of ranges, whose bounds are edited one by one, each in a cell of the
 * type of the range's values.
 */
export default function rangeType(
  componentFactoryMap: ComponentFactoryMap,
): CellComponentFactory {
  /** The column of a bound, of the type of the range's values */
  function getBoundColumnFabric(column: CellColumnLike): CellColumnFabric {
    const valueType = getRangeTypesOf(column.type)?.value ?? DB_TYPES.TEXT;
    const boundColumn = {
      type: valueType,
      type_options: null,
      metadata: column.metadata,
    };
    const cellInfo = getCellInfo(valueType, column.metadata);
    const dataType = cellInfo?.type ?? 'string';
    const factory =
      componentFactoryMap[dataType as SimpleCellDataTypes] ??
      componentFactoryMap.string;
    return {
      id: 'bound',
      column: boundColumn,
      cellComponentAndProps: factory.get(
        boundColumn,
        getCellConfiguration(valueType, cellInfo),
      ),
    };
  }

  return {
    initialInputValue: null,
    get: (): ComponentAndProps => ({ component: RangeCell, props: {} }),
    getInput: (column: CellColumnLike): ComponentAndProps => ({
      // A multirange holds any number of ranges, each with bounds of its own
      component: isMultirangeType(column.type) ? RangeList : RangeBounds,
      props: { columnFabric: getBoundColumnFabric(column) },
    }),
    getDisplayFormatter: () => String,
  };
}
