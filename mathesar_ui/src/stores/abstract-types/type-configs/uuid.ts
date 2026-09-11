import type { ColumnMetadata } from '@mathesar/api/rpc/_common/columnDisplayOptions';
import {
  type RawColumnWithMetadata,
  getColumnMetadataValue,
} from '@mathesar/api/rpc/columns';
import { iconUiTypeUuid, iconUser } from '@mathesar/icons';
import type { FormValues } from '@mathesar-component-library/types';

import { DB_TYPES } from '../dbTypes';
import type {
  AbstractTypeConfigForm,
  AbstractTypeConfiguration,
  AbstractTypeDisplayConfig,
} from '../types';

type UserDisplayField = 'full_name' | 'email' | 'username';

/**
 * Whether a UUID column's values are Mathesar users (their ids), which its
 * metadata says by naming the field that represents each of them.
 */
export function isUserColumn(metadata: ColumnMetadata | null | undefined) {
  return metadata?.user_display_field != null;
}

const displayForm: AbstractTypeConfigForm = {
  variables: {
    showAs: {
      type: 'string',
      enum: ['uuid', 'user'],
      default: 'uuid',
    },
    displayField: {
      type: 'string',
      enum: ['full_name', 'email', 'username'],
      default: 'username',
    },
  },
  layout: {
    orientation: 'vertical',
    elements: [
      {
        type: 'input',
        variable: 'showAs',
        label: 'Show as',
        options: {
          uuid: { label: 'UUID' },
          user: { label: 'User' },
        },
      },
      {
        type: 'if',
        variable: 'showAs',
        condition: 'eq',
        value: 'user',
        elements: [
          {
            type: 'input',
            variable: 'displayField',
            label: 'Field to represent each user',
            options: {
              full_name: { label: 'Display Name' },
              email: { label: 'Email' },
              username: { label: 'Username' },
            },
          },
        ],
      },
    ],
  },
};

function determineDisplayOptions(
  formValues: FormValues,
): RawColumnWithMetadata['metadata'] {
  return {
    user_display_field:
      formValues.showAs === 'user'
        ? (formValues.displayField as UserDisplayField) ?? 'username'
        : null,
  };
}

function constructDisplayFormValuesFromDisplayOptions(
  metadata: RawColumnWithMetadata['metadata'],
): FormValues {
  const column = { metadata };
  return {
    showAs: isUserColumn(metadata) ? 'user' : 'uuid',
    displayField:
      getColumnMetadataValue(column, 'user_display_field') ?? 'username',
  };
}

const uuidType: AbstractTypeConfiguration = {
  getIcon: (args) =>
    isUserColumn(args?.metadata)
      ? { ...iconUser, label: 'User' }
      : { ...iconUiTypeUuid, label: 'UUID' },
  defaultDbType: DB_TYPES.UUID,
  cellInfo: {
    type: 'uuid',
  },
  getDisplayConfig: (): AbstractTypeDisplayConfig => ({
    form: displayForm,
    determineDisplayOptions,
    constructDisplayFormValuesFromDisplayOptions,
  }),
};

export default uuidType;
