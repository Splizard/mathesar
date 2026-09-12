import type { RawColumnWithMetadata } from '@mathesar/api/rpc/columns';
import {
  DurationFormatter,
  DurationSpecification,
} from '@mathesar/utils/duration';
import {
  FormattedInput,
  isDefinedNonNullable,
} from '@mathesar-component-library';
import type {
  ComponentAndProps,
  FormattedInputProps,
} from '@mathesar-component-library/types';

import DurationCell from './components/duration/DurationCell.svelte';
import DurationInput from './components/duration/DurationInput.svelte';
import type { FormattedInputCellExternalProps } from './components/typeDefinitions';
import type { CellComponentFactory } from './typeDefinitions';

function getSpecification(column: RawColumnWithMetadata) {
  const defaults = DurationSpecification.getDefaults();
  return new DurationSpecification({
    max: column.metadata?.duration_max ?? defaults.max,
    min: column.metadata?.duration_min ?? defaults.min,
  });
}

function getProps(
  column: RawColumnWithMetadata,
): FormattedInputCellExternalProps {
  const durationSpecification = getSpecification(column);
  const formatter = new DurationFormatter(durationSpecification);
  return {
    useTabularNumbers: true,
    formatter,
    placeholder: durationSpecification.getFormattingString(),
    formatForDisplay: (
      v: string | null | undefined,
    ): string | null | undefined => {
      if (!isDefinedNonNullable(v)) {
        return v;
      }
      return formatter.format(v);
    },
  };
}

/** A duration is an amount of a unit, shown as the column's formatting says */
const durationType: CellComponentFactory = {
  get: (column: RawColumnWithMetadata): ComponentAndProps => {
    const { formatter, formatForDisplay } = getProps(column);
    return {
      component: DurationCell,
      props: {
        formatter,
        formatForDisplay,
        specification: getSpecification(column),
      },
    };
  },
  getInput: (column: RawColumnWithMetadata): ComponentAndProps => {
    const { formatter, formatForDisplay } = getProps(column);
    return {
      component: DurationInput,
      props: {
        formatter,
        formatForDisplay,
        specification: getSpecification(column),
      },
    };
  },
  getSimpleInput: (
    column: RawColumnWithMetadata,
  ): ComponentAndProps<FormattedInputProps<string>> => ({
    component: FormattedInput,
    props: getProps(column),
  }),
  getDisplayFormatter(column: RawColumnWithMetadata) {
    return (v) => getProps(column).formatForDisplay(String(v));
  },
};

export default durationType;
