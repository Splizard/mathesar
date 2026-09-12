import type { ComponentAndProps } from '@mathesar-component-library/types';

import CompositeCell from './components/composite/CompositeCell.svelte';
import CompositeFields from './components/composite/CompositeFields.svelte';
import { formatComposite } from './components/composite/formatComposite';
import type {
  CellColumnLike,
  CellComponentFactory,
  SimpleCellDataTypes,
} from './typeDefinitions';
import { getCellConfiguration, getCellInfo } from './utils';

type ComponentFactoryMap = Record<SimpleCellDataTypes, CellComponentFactory>;

function formatterFor(column: CellColumnLike) {
  const fieldOrder = column.type_options?.composite_fields?.map((f) => f.name);
  return (value: unknown) => formatComposite(value, fieldOrder);
}

/** Cells of composite types, whose fields are shown and edited one by one */
export default function compositeType(
  componentFactoryMap: ComponentFactoryMap,
): CellComponentFactory {
  /** The column of each field of the composite type, for a cell of it to show */
  function getFields(column: CellColumnLike) {
    return (column.type_options?.composite_fields ?? []).map((field) => {
      const fieldColumn = {
        type: field.type,
        type_options: null,
        metadata: column.metadata,
      };
      const cellInfo = getCellInfo(field.type, column.metadata);
      const dataType = cellInfo?.type ?? 'string';
      const factory =
        componentFactoryMap[
          dataType === 'array' ? 'string' : (dataType as SimpleCellDataTypes)
        ];
      return {
        name: field.name,
        columnFabric: {
          id: field.name,
          column: fieldColumn,
          cellComponentAndProps: factory.get(
            fieldColumn,
            getCellConfiguration(field.type, cellInfo),
          ),
        },
      };
    });
  }

  return {
    initialInputValue: null,
    get: (column: CellColumnLike): ComponentAndProps => ({
      component: CompositeCell,
      props: { formatValue: formatterFor(column) },
    }),
    getInput: (column: CellColumnLike): ComponentAndProps => ({
      component: CompositeFields,
      props: { fields: getFields(column) },
    }),
    getDisplayFormatter: (column: CellColumnLike) => formatterFor(column),
  };
}
