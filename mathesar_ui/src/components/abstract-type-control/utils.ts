import { readable } from 'svelte/store';

import type { RawColumnWithMetadata } from '@mathesar/api/rpc/columns';
import type { DbType } from '@mathesar/AppTypes';
import type {
  AbstractType,
  AbstractTypeDbConfig,
  AbstractTypeDisplayConfig,
} from '@mathesar/stores/abstract-types/types';
import { makeForm } from '@mathesar-component-library';
import type { FormBuildConfiguration } from '@mathesar-component-library/types';

import DurationConfiguration from './config-components/DurationConfiguration.svelte';

export interface ColumnWithAbstractType
  extends Pick<
    RawColumnWithMetadata,
    'id' | 'type' | 'type_options' | 'metadata'
  > {
  abstractType: AbstractType;
  /** Needed to recognise, and change to or from, the "Created At" type */
  default?: RawColumnWithMetadata['default'];
}

export type ColumnTypeOptionsSaveArgs = Pick<
  ColumnWithAbstractType,
  'type' | 'type_options' | 'metadata'
> & {
  /**
   * A new default for the column, when the type change needs one: `null`
   * drops the default, `undefined` leaves it alone.
   */
  default?: RawColumnWithMetadata['default'];
};

export function getFormValueStore(
  form: FormBuildConfiguration | undefined,
): FormBuildConfiguration['values'] {
  if (form) {
    return form.values;
  }
  return readable({});
}

export function constructDbForm(
  selectedAbstractType: AbstractType,
  selectedDbType: DbType,
  column: ColumnWithAbstractType,
): {
  dbOptionsConfig?: AbstractTypeDbConfig;
  dbForm?: FormBuildConfiguration;
  dbFormValues: FormBuildConfiguration['values'];
} {
  const dbOptionsConfig = selectedAbstractType.getDbConfig?.() ?? undefined;
  let dbForm;
  if (dbOptionsConfig) {
    const dbFormValues =
      column.type === selectedDbType
        ? dbOptionsConfig.constructDbFormValuesFromTypeOptions(
            column.type,
            column.type_options,
          )
        : {};
    dbForm = makeForm(dbOptionsConfig.form, dbFormValues);
  }
  const dbFormValues = getFormValueStore(dbForm);
  return {
    dbOptionsConfig,
    dbForm,
    dbFormValues,
  };
}

export function constructDisplayForm(
  selectedAbstractType: AbstractType,
  selectedDbType: DbType,
  column: ColumnWithAbstractType,
): {
  displayOptionsConfig?: AbstractTypeDisplayConfig;
  displayForm?: FormBuildConfiguration;
  displayFormValues: FormBuildConfiguration['values'];
} {
  const displayOptionsConfig =
    selectedAbstractType.getDisplayConfig?.() ?? undefined;
  let displayForm;
  if (displayOptionsConfig) {
    const displayFormValues =
      column.type === selectedDbType
        ? displayOptionsConfig.constructDisplayFormValuesFromDisplayOptions(
            column.metadata,
          )
        : {};
    displayForm = makeForm(displayOptionsConfig.form, displayFormValues, {
      'duration-config-menu': DurationConfiguration,
    });
  }
  const displayFormValues = getFormValueStore(displayForm);
  return {
    displayOptionsConfig,
    displayForm,
    displayFormValues,
  };
}
