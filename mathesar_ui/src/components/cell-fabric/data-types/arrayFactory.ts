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
  FormattedInputProps,
  InputFormatter,
  ParseResult,
} from '@mathesar-component-library/types';

import { formatArray, parseArray } from './components/array/arrayCsv';
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
  } | null;
  metadata: ColumnMetadata | null;
}

type ComponentFactoryMap = Record<SimpleCellDataTypes, CellComponentFactory>;

function makeDisplayFormatter(
  componentFactoryMap: ComponentFactoryMap,
  column: ArrayLikeColumn,
) {
  const itemDbType = column.type_options?.item_type ?? 'string';
  const cellInfo = getCellInfo(itemDbType, column.metadata);
  const config = getCellConfiguration(itemDbType, cellInfo);
  const elementDataType =
    !cellInfo || cellInfo.type === 'array' ? 'string' : cellInfo.type;
  const elementCellFactory = componentFactoryMap[elementDataType];
  return (cellValue: unknown): string => {
    if (!isDefinedNonNullable(cellValue)) {
      return String(cellValue);
    }
    if (elementCellFactory.getDisplayFormatter) {
      return String(
        elementCellFactory.getDisplayFormatter(
          {
            type: itemDbType,
            type_options: null,
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
    get: (
      column: ArrayLikeColumn,
    ): ComponentAndProps<FormattedInputCellExternalProps<unknown[]>> => ({
      component: FormattedInputCell,
      props: getProps(column),
    }),
    getInput: (
      column: ArrayLikeColumn,
    ): ComponentAndProps<FormattedInputProps<unknown[]>> => ({
      component: FormattedInput,
      props: getProps(column),
    }),
    getDisplayFormatter: (column: ArrayLikeColumn) => {
      const { formatForDisplay } = getProps(column);
      return (value: unknown) =>
        Array.isArray(value) ? formatForDisplay(value) : String(value);
    },
  };
}
