import type { DbType } from '@mathesar/AppTypes';
import { iconUiTypeNetwork } from '@mathesar/icons';
import type { FormValues } from '@mathesar-component-library/types';

import { DB_TYPES } from '../dbTypes';
import type { AbstractTypeConfiguration, AbstractTypeDbConfig } from '../types';

type MacAddressSize = 'macAddr48' | 'eui64';

function determineDbTypeAndOptions(
  dbFormValues: FormValues,
): ReturnType<AbstractTypeDbConfig['determineDbTypeAndOptions']> {
  return {
    dbType:
      dbFormValues.macAddressSize === 'eui64'
        ? DB_TYPES.MACADDR8
        : DB_TYPES.MACADDR,
    typeOptions: {},
  };
}

function constructDbFormValuesFromTypeOptions(columnType: DbType): FormValues {
  const macAddressSize: MacAddressSize =
    columnType === DB_TYPES.MACADDR8 ? 'eui64' : 'macAddr48';
  return { macAddressSize };
}

/** Only MAC addresses take options: whether they're MAC-48 or EUI-64 ones */
function getNetworkDbConfig(
  selectedDbType?: DbType,
): AbstractTypeDbConfig | undefined {
  if (
    selectedDbType !== DB_TYPES.MACADDR &&
    selectedDbType !== DB_TYPES.MACADDR8
  ) {
    return undefined;
  }
  return {
    form: {
      variables: {
        macAddressSize: {
          type: 'string',
          enum: ['macAddr48', 'eui64'],
          default: constructDbFormValuesFromTypeOptions(selectedDbType)
            .macAddressSize as MacAddressSize,
        },
      },
      layout: {
        orientation: 'vertical',
        elements: [
          {
            type: 'input',
            variable: 'macAddressSize',
            label: 'MAC Address Size',
            interfaceType: 'select',
            options: {
              macAddr48: { label: 'MAC-48 (6 bytes)' },
              eui64: { label: 'EUI-64 (8 bytes)' },
            },
          },
        ],
      },
    },
    determineDbTypeAndOptions,
    constructDbFormValuesFromTypeOptions,
  };
}

const networkType: AbstractTypeConfiguration = {
  getIcon: () => ({ ...iconUiTypeNetwork, label: 'IP' }),
  defaultDbType: DB_TYPES.INET,
  cellInfo: {
    type: 'network',
  },
  getDbConfig: getNetworkDbConfig,
};

export default networkType;
