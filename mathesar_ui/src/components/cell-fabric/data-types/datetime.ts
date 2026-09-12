import {
  type RawColumnWithMetadata,
  getColumnMetadataValue,
} from '@mathesar/api/rpc/columns';
import {
  DateTimeFormatter,
  DateTimeSpecification,
} from '@mathesar/utils/date-time';
import { isDefinedNonNullable } from '@mathesar-component-library';
import type { ComponentAndProps } from '@mathesar-component-library/types';

import DateTimeCell from './components/date-time/DateTimeCell.svelte';
import DateTimeInput from './components/date-time/DateTimeInput.svelte';
import TimeCheckboxCell from './components/time-checkbox/TimeCheckboxCell.svelte';
import type { DateTimeCellExternalProps } from './components/typeDefinitions';
import type { CellComponentFactory } from './typeDefinitions';

/** Whether the column says its instants are shown as a tick */
export function isTimeCheckboxColumn(
  metadata: RawColumnWithMetadata['metadata'],
): boolean {
  return getColumnMetadataValue({ metadata }, 'time_checkbox');
}

/**
 * The props of a checkbox standing for an instant: what the box says, and what
 * to write when it is ticked, in the form the column's own type reads back.
 */
function getCheckboxProps(supportTimeZone: boolean) {
  const specification = new DateTimeSpecification({
    type: supportTimeZone ? 'timestampWithTZ' : 'timestamp',
  });
  return { stampNow: () => specification.getCanonicalString(new Date()) };
}

function getProps(
  column: RawColumnWithMetadata,
  supportTimeZone: boolean,
): DateTimeCellExternalProps {
  const dateFormat = getColumnMetadataValue(column, 'date_format');
  const timeFormat = getColumnMetadataValue(column, 'time_format');
  const specification = new DateTimeSpecification({
    type: supportTimeZone ? 'timestampWithTZ' : 'timestamp',
    dateFormat,
    timeFormat,
  });
  const formatter = new DateTimeFormatter(specification);
  return {
    type: 'datetime',
    formattingString: specification.getFormattingString(),
    formatter,
    timeEnableSeconds: specification.hasSecondsInTime(),
    timeShow24Hr: specification.isTime24Hr(),
    formatForDisplay: (
      v: string | null | undefined,
    ): string | null | undefined => {
      if (!isDefinedNonNullable(v)) {
        return v;
      }
      return formatter.parseAndFormat(v);
    },
  };
}

const datetimeType: CellComponentFactory = {
  get: (
    column: RawColumnWithMetadata,
    config?: { supportTimeZone?: boolean },
  ): ComponentAndProps => {
    const supportTimeZone = config?.supportTimeZone ?? false;
    if (isTimeCheckboxColumn(column.metadata)) {
      return {
        component: TimeCheckboxCell,
        props: getCheckboxProps(supportTimeZone),
      };
    }
    return {
      component: DateTimeCell,
      props: getProps(column, supportTimeZone),
    };
  },
  getInput: (
    column: RawColumnWithMetadata,
    config?: { supportTimeZone?: boolean },
  ): ComponentAndProps<
    Omit<DateTimeCellExternalProps, 'formatForDisplay'>
  > => ({
    component: DateTimeInput,
    props: {
      ...getProps(column, config?.supportTimeZone ?? false),
      allowRelativePresets: true,
    },
  }),
  getDisplayFormatter(
    column: RawColumnWithMetadata,
    config?: { supportTimeZone?: boolean },
  ) {
    return (v) =>
      getProps(column, config?.supportTimeZone ?? false).formatForDisplay(
        String(v),
      );
  },
};

export default datetimeType;
