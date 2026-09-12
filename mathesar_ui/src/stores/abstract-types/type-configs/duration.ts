import type {
  ColumnMetadata,
  DurationFormat,
  DurationUnit,
} from '@mathesar/api/rpc/_common/columnDisplayOptions';
import {
  type RawColumnWithMetadata,
  getColumnMetadataValue,
} from '@mathesar/api/rpc/columns';
import { iconUiTypeDuration } from '@mathesar/icons';
import { DurationSpecification } from '@mathesar/utils/duration';
import type { FormValues } from '@mathesar-component-library/types';

import type {
  AbstractTypeConfigForm,
  AbstractTypeConfiguration,
} from '../types';

const durationDefaults = DurationSpecification.getDefaults();

const displayForm: AbstractTypeConfigForm = {
  variables: {
    /**
     * For the sake of time, use a custom component
     * for duration config.
     *
     * TODO: Make this serializable instead of the
     * custom component.
     */
    durationConfig: {
      type: 'custom',
      default: {
        duration_max: durationDefaults.max,
        duration_min: durationDefaults.min,
        duration_format: durationDefaults.format,
      },
    },
  },
  layout: {
    orientation: 'vertical',
    elements: [
      {
        type: 'static',
        variable: 'durationConfig',
        componentId: 'duration-config-menu',
      },
    ],
  },
};

function determineDisplayOptions(formValues: FormValues): ColumnMetadata {
  const durationConfig = formValues.durationConfig as {
    max: DurationUnit;
    min: DurationUnit;
    format?: DurationFormat;
  };
  const displayOptions: RawColumnWithMetadata['metadata'] = {
    duration_max: durationConfig.max,
    duration_min: durationConfig.min,
    duration_format: durationConfig.format ?? durationDefaults.format,
  };
  return displayOptions;
}

function constructDisplayFormValuesFromDisplayOptions(
  metadata: RawColumnWithMetadata['metadata'],
): FormValues {
  const column = { metadata };
  const formValues: FormValues = {
    durationConfig: {
      max: getColumnMetadataValue(column, 'duration_max'),
      min: getColumnMetadataValue(column, 'duration_min'),
      format: getColumnMetadataValue(column, 'duration_format'),
    },
  };
  return formValues;
}

const durationType: AbstractTypeConfiguration = {
  getIcon: () => ({ ...iconUiTypeDuration, label: 'Duration' }),
  cellInfo: {
    type: 'duration',
  },
  getDisplayConfig: () => ({
    form: displayForm,
    determineDisplayOptions,
    constructDisplayFormValuesFromDisplayOptions,
  }),
};

export default durationType;
