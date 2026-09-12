import type { RawColumnWithMetadata } from '@mathesar/api/rpc/columns';
import type { DbType } from '@mathesar/AppTypes';
import { iconUiTypeBinary } from '@mathesar/icons';
import type { FormValues } from '@mathesar-component-library/types';

import { DB_TYPES } from '../dbTypes';
import type {
  AbstractTypeConfigForm,
  AbstractTypeConfiguration,
  AbstractTypeDbConfig,
} from '../types';

/** A Bits column holds as many bits as each value has, or a fixed number */
const bitsForm = (fixedLength: boolean): AbstractTypeConfigForm => ({
  variables: {
    fixedLength: {
      type: 'boolean',
      default: fixedLength,
    },
    length: {
      type: 'integer',
      default: 8,
      validation: {
        checks: ['isEmpty'],
      },
    },
  },
  layout: {
    orientation: 'vertical',
    elements: [
      {
        type: 'input',
        variable: 'fixedLength',
        label: 'Set a fixed number of bits',
      },
      {
        type: 'if',
        variable: 'fixedLength',
        condition: 'eq',
        value: true,
        elements: [
          {
            type: 'input',
            variable: 'length',
            label: 'Number of Bits',
          },
        ],
      },
    ],
  },
});

function determineDbTypeAndOptions(
  dbFormValues: FormValues,
): ReturnType<AbstractTypeDbConfig['determineDbTypeAndOptions']> {
  if (!dbFormValues.fixedLength) {
    return { dbType: DB_TYPES.BIT_VARYING, typeOptions: {} };
  }
  // A bit type's length is its typmod, which is reported as its precision
  return {
    dbType: DB_TYPES.BIT,
    typeOptions: { precision: Number(dbFormValues.length) },
  };
}

function constructDbFormValuesFromTypeOptions(
  columnType: DbType,
  typeOptions: RawColumnWithMetadata['type_options'],
): FormValues {
  if (columnType !== DB_TYPES.BIT) {
    return { fixedLength: false };
  }
  return {
    fixedLength: true,
    length: (typeOptions?.precision as number) ?? null,
  };
}

/** Only the bit types take options: how many bits a value has */
function getBinaryDbConfig(
  selectedDbType?: DbType,
): AbstractTypeDbConfig | undefined {
  if (
    selectedDbType !== DB_TYPES.BIT &&
    selectedDbType !== DB_TYPES.BIT_VARYING
  ) {
    return undefined;
  }
  return {
    form: bitsForm(selectedDbType === DB_TYPES.BIT),
    determineDbTypeAndOptions,
    constructDbFormValuesFromTypeOptions,
  };
}

const binaryType: AbstractTypeConfiguration = {
  getIcon: () => ({ ...iconUiTypeBinary, label: 'Binary' }),
  defaultDbType: DB_TYPES.BYTEA,
  cellInfo: {
    type: 'binary',
  },
  getDbConfig: getBinaryDbConfig,
};

export default binaryType;
