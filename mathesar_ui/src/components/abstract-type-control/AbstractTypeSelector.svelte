<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';

  import {
    getAllowedAbstractTypesForDbTypeAndItsTargetTypes,
    isAbstractTypeDisabled,
  } from '@mathesar/stores/abstract-types';
  import { abstractTypeCategory } from '@mathesar/stores/abstract-types/constants';
  import type { AbstractType } from '@mathesar/stores/abstract-types/types';
  import { LabeledInput, Select } from '@mathesar-component-library';

  import AbstractTypeName from './AbstractTypeName.svelte';
  import type { ColumnWithAbstractType } from './utils';

  const dispatch = createEventDispatcher<{
    reset: undefined;
    change: {
      type: ColumnWithAbstractType['type'];
      abstractType: ColumnWithAbstractType['abstractType'];
    };
  }>();

  export let column: ColumnWithAbstractType;
  export let selectedAbstractType: AbstractType;
  export let disabled = false;
  /** "Created At" is set up through the column's default, so needs support */
  export let allowCreatedAt = false;

  $: excludedTypes = [
    'jsonlist',
    'map',
    ...(allowCreatedAt ? [] : [abstractTypeCategory.CreatedAt]),
  ];
  $: allowedTypeConversions = getAllowedAbstractTypesForDbTypeAndItsTargetTypes(
    column.type,
    column.metadata,
    column.default,
  ).filter((item) => !excludedTypes.includes(item.identifier));

  function selectAbstractType(
    newAbstractType: ColumnWithAbstractType['abstractType'] | undefined,
  ) {
    if (!newAbstractType) {
      console.error('This should never occur. AbstractType is undefined');
      return;
    }
    if (selectedAbstractType !== newAbstractType) {
      if (newAbstractType.identifier === column.abstractType.identifier) {
        dispatch('reset');
      } else if (
        column.abstractType.identifier === abstractTypeCategory.CreatedAt &&
        newAbstractType.dbTypes.has(column.type)
      ) {
        // From Created At to Date & Time, keeping time zone support as it is
        dispatch('change', {
          type: column.type,
          abstractType: newAbstractType,
        });
      } else if (newAbstractType.defaultDbType) {
        dispatch('change', {
          type: newAbstractType.defaultDbType,
          abstractType: newAbstractType,
        });
      } else if (newAbstractType.dbTypes.size > 0) {
        const [selectedDbType] = newAbstractType.dbTypes;
        dispatch('change', {
          type: selectedDbType,
          abstractType: newAbstractType,
        });
      }
      selectedAbstractType = newAbstractType;
    }
  }

  function isOptionDisabled(type?: AbstractType) {
    return type ? isAbstractTypeDisabled(type) : false;
  }
</script>

<LabeledInput label={$_('data_type')} layout={'stacked'}>
  <Select
    options={allowedTypeConversions}
    value={selectedAbstractType}
    getLabel={(entry) => entry?.name ?? ''}
    autoSelect="none"
    isOptionDisabled={(t) => isOptionDisabled(t)}
    on:change={(e) => selectAbstractType(e.detail)}
    let:option
    {disabled}
  >
    <AbstractTypeName abstractType={option} />
  </Select>
</LabeledInput>
