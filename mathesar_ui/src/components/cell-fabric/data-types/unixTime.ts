import { getColumnMetadataValue } from '@mathesar/api/rpc/columns';
import { getUnixTimeUnit } from '@mathesar/stores/abstract-types/type-configs/number';
import {
  DateTimeSpecification,
  UnixTimeFormatter,
} from '@mathesar/utils/date-time';
import { isDefinedNonNullable } from '@mathesar-component-library';
import type { ComponentAndProps } from '@mathesar-component-library/types';

import DateTimeCell from './components/date-time/DateTimeCell.svelte';
import DateTimeInput from './components/date-time/DateTimeInput.svelte';
import type {
  CellColumnLike,
  DateTimeCellExternalProps,
} from './components/typeDefinitions';
import type { CellComponentFactory } from './typeDefinitions';

/**
 * A number column whose values count from the Unix epoch, shown as the dates
 * they name.
 *
 * The date/time cell does all the work. It never learns that the column is a
 * number one: the formatter it is handed reads and writes the count, so the
 * value going in and coming out is the integer the column stores, and only what
 * the person sees is a date.
 */
function getProps(column: CellColumnLike): DateTimeCellExternalProps {
  const specification = new DateTimeSpecification({
    type: 'timestamp',
    dateFormat: getColumnMetadataValue(column, 'date_format'),
    timeFormat: getColumnMetadataValue(column, 'time_format'),
  });
  const formatter = new UnixTimeFormatter(
    specification,
    getUnixTimeUnit(column.metadata) ?? 'seconds',
  );
  return {
    type: 'datetime',
    formattingString: specification.getFormattingString(),
    formatter,
    timeEnableSeconds: specification.hasSecondsInTime(),
    timeShow24Hr: specification.isTime24Hr(),
    formatForDisplay: (v) =>
      isDefinedNonNullable(v) ? formatter.format(v) : v,
  };
}

const unixTimeType: CellComponentFactory = {
  get: (column): ComponentAndProps<DateTimeCellExternalProps> => ({
    component: DateTimeCell,
    props: getProps(column),
  }),
  getInput: (
    column,
  ): ComponentAndProps<
    Omit<DateTimeCellExternalProps, 'formatForDisplay'>
  > => ({
    component: DateTimeInput,
    props: { ...getProps(column), allowRelativePresets: true },
  }),
  getDisplayFormatter: (column) => (v) =>
    getProps(column).formatForDisplay(String(v)),
};

export default unixTimeType;
