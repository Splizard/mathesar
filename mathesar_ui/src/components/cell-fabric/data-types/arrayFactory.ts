import {
  type ColumnMetadata,
  getMetadataValue,
} from '@mathesar/api/rpc/_common/columnDisplayOptions';
import type { DbType } from '@mathesar/AppTypes';
import {
  FormattedInput,
  isDefinedNonNullable,
} from '@mathesar-component-library';
import type {
  ComponentAndProps,
  InputFormatter,
  ParseResult,
} from '@mathesar-component-library/types';

import ArrayButtonCell from './components/array/ArrayButtonCell.svelte';
import { formatArray, parseArray } from './components/array/arrayCsv';
import ArrayElements from './components/array/ArrayElements.svelte';
import FormattedInputCell from './components/formatted-input/FormattedInputCell.svelte';
import type { FormattedInputCellExternalProps } from './components/typeDefinitions';
import type {
  CellColumnLike,
  CellComponentFactory,
  SimpleCellDataTypes,
} from './typeDefinitions';
import { getCellConfiguration, getCellInfo } from './utils';

export interface ArrayLikeColumn extends CellColumnLike {
  type_options: {
    item_type: DbType;
    /** The fields of the items of an array of composites */
    composite_fields?: { name: string; type: DbType }[] | null;
  } | null;
  metadata: ColumnMetadata | null;
}

type ComponentFactoryMap = Record<SimpleCellDataTypes, CellComponentFactory>;

/**
 * The types whose values can't be written as text, so are shown and edited one
 * by one, rather than as the values of the array separated by its delimiter.
 */
const typesShownOneByOne: SimpleCellDataTypes[] = [
  'boolean',
  'composite',
  'enum',
  'file',
];

function getItemDataType(column: ArrayLikeColumn): SimpleCellDataTypes {
  const cellInfo = getCellInfo(
    column.type_options?.item_type ?? 'string',
    column.metadata,
  );
  const dataType = cellInfo?.type ?? 'string';
  return dataType === 'array' ? 'string' : dataType;
}

export function hasValuesShownOneByOne(column: ArrayLikeColumn): boolean {
  return typesShownOneByOne.includes(getItemDataType(column));
}

/** The column of one of the array's values, for a cell of it to show */
function getItemColumnFabric(
  componentFactoryMap: ComponentFactoryMap,
  column: ArrayLikeColumn,
) {
  const itemDbType = column.type_options?.item_type ?? 'string';
  const itemColumn = {
    type: itemDbType,
    type_options: {
      composite_fields: column.type_options?.composite_fields ?? null,
    },
    metadata: column.metadata,
  };
  const cellInfo = getCellInfo(itemDbType, column.metadata);
  return {
    id: `${itemDbType}-item`,
    column: itemColumn,
    cellComponentAndProps: componentFactoryMap[getItemDataType(column)].get(
      itemColumn,
      getCellConfiguration(itemDbType, cellInfo),
    ),
  };
}

function makeDisplayFormatter(
  componentFactoryMap: ComponentFactoryMap,
  column: ArrayLikeColumn,
) {
  const itemDbType = column.type_options?.item_type ?? 'string';
  const cellInfo = getCellInfo(itemDbType, column.metadata);
  const config = getCellConfiguration(itemDbType, cellInfo);
  const elementCellFactory = componentFactoryMap[getItemDataType(column)];
  return (cellValue: unknown): string => {
    if (!isDefinedNonNullable(cellValue)) {
      return String(cellValue);
    }
    if (elementCellFactory.getDisplayFormatter) {
      return String(
        elementCellFactory.getDisplayFormatter(
          {
            type: itemDbType,
            type_options: {
              composite_fields: column.type_options?.composite_fields ?? null,
            },
            metadata: column.metadata,
          },
          config,
        )(cellValue),
      );
    }
    return String(cellValue);
  };
}

/**
 * Arrays are shown and edited as their values separated by the column's
 * delimiter, as they're stored while editing, and as the column shows them
 * otherwise.
 */
class ArrayFormatter implements InputFormatter<unknown[]> {
  private delimiter: string;

  constructor(delimiter: string) {
    this.delimiter = delimiter;
  }

  format(values: unknown[]): string {
    return formatArray(values, this.delimiter);
  }

  parse(input: string): ParseResult<unknown[]> {
    return {
      value: input === '' ? null : parseArray(input, this.delimiter),
      intermediateDisplay: input,
    };
  }
}

export default function arrayType(
  componentFactoryMap: ComponentFactoryMap,
): CellComponentFactory {
  function getProps(
    column: ArrayLikeColumn,
  ): FormattedInputCellExternalProps<unknown[]> {
    const delimiter = getMetadataValue(
      column.metadata ?? {},
      'array_delimiter',
    );
    const formatItemForDisplay = makeDisplayFormatter(
      componentFactoryMap,
      column,
    );
    return {
      formatter: new ArrayFormatter(delimiter),
      formatForDisplay: (values) =>
        isDefinedNonNullable(values)
          ? formatArray(values, delimiter, formatItemForDisplay)
          : values,
    };
  }

  return {
    get: (column: ArrayLikeColumn): ComponentAndProps => {
      if (hasValuesShownOneByOne(column)) {
        return {
          component: ArrayButtonCell,
          props: {
            itemColumnFabric: getItemColumnFabric(componentFactoryMap, column),
          },
        };
      }
      return { component: FormattedInputCell, props: getProps(column) };
    },
    getInput: (column: ArrayLikeColumn): ComponentAndProps => {
      if (hasValuesShownOneByOne(column)) {
        return {
          component: ArrayElements,
          props: {
            itemColumnFabric: getItemColumnFabric(componentFactoryMap, column),
          },
        };
      }
      return { component: FormattedInput, props: getProps(column) };
    },
    getDisplayFormatter: (column: ArrayLikeColumn) => {
      const { formatForDisplay } = getProps(column);
      return (value: unknown) =>
        Array.isArray(value) ? formatForDisplay(value) : String(value);
    },
  };
}
