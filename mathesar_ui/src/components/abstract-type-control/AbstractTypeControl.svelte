<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { _ } from 'svelte-i18n';

  import type { RequestStatus } from '@mathesar/api/rest/utils/requestUtils';
  import {
    getDefaultForAbstractType,
    mergeMetadataOnTypeChange,
  } from '@mathesar/stores/abstract-types';
  import { abstractTypeCategory } from '@mathesar/stores/abstract-types/constants';
  import { toast } from '@mathesar/stores/toast';
  import { columnTypeOptionsAreEqual } from '@mathesar/utils/columnUtils';
  import {
    CancelOrProceedButtonPair,
    createValidationContext,
  } from '@mathesar-component-library';

  import WarningBox from '../message-boxes/WarningBox.svelte';

  import AbstractTypeDBOptions from './AbstractTypeDBOptions.svelte';
  import AbstractTypeSelector from './AbstractTypeSelector.svelte';
  import type {
    ColumnTypeOptionsSaveArgs,
    ColumnWithAbstractType,
  } from './utils';

  const dispatch = createEventDispatcher();

  export let column: ColumnWithAbstractType;
  export let save: (options: ColumnTypeOptionsSaveArgs) => Promise<unknown>;
  export let showWarnings = true;
  export let disabled = false;
  /** Whether `save` handles `default`, which the "Created At" type needs */
  export let allowCreatedAt = false;

  let selectedAbstractType: ColumnWithAbstractType['abstractType'] =
    column.abstractType;
  let selectedDbType: ColumnWithAbstractType['type'] = column.type;
  let savedTypeOptions = column.type_options ?? {};
  let typeOptions: ColumnWithAbstractType['type_options'] = {
    ...savedTypeOptions,
  };
  let { metadata } = column;

  $: actionButtonsVisible =
    selectedAbstractType !== column.abstractType ||
    selectedDbType !== column.type ||
    !columnTypeOptionsAreEqual(savedTypeOptions, typeOptions ?? {}) ||
    JSON.stringify(metadata) !== JSON.stringify(column.metadata ?? {});

  let typeChangeState: RequestStatus;

  const validationContext = createValidationContext();
  $: ({ validationResult } = validationContext);

  onMount(() => {
    validationContext.validate();
  });

  function resetAbstractType(_column: ColumnWithAbstractType) {
    selectedAbstractType = _column.abstractType;
    selectedDbType = _column.type;
    savedTypeOptions = _column.type_options ?? {};
    typeOptions = { ...savedTypeOptions };
    metadata = _column.metadata;
  }
  $: resetAbstractType(column);

  function selectTypeAndAbstractType(typeInfo: {
    type: ColumnWithAbstractType['type'];
    abstractType: ColumnWithAbstractType['abstractType'];
  }) {
    const { type, abstractType } = typeInfo;
    selectedDbType = type;
    selectedAbstractType = abstractType;
    typeOptions = {};
    metadata = mergeMetadataOnTypeChange(selectedAbstractType, metadata);
  }

  function cancel() {
    resetAbstractType(column);
    typeChangeState = { state: 'success' };
    dispatch('cancel');
  }

  /**
   * "Created At" is a Date & Time column defaulting to the current time, so
   * changing to it sets that default and changing away from it drops it.
   */
  function getDefaultForTypeChange(): ColumnTypeOptionsSaveArgs['default'] {
    const isCreatedAt = (type: typeof selectedAbstractType) =>
      type?.identifier === abstractTypeCategory.CreatedAt;
    if (isCreatedAt(selectedAbstractType)) {
      if (isCreatedAt(column.abstractType) && selectedDbType === column.type) {
        return undefined;
      }
      return getDefaultForAbstractType(selectedAbstractType, selectedDbType);
    }
    return isCreatedAt(column.abstractType) ? null : undefined;
  }

  async function onSave() {
    typeChangeState = { state: 'processing' };
    try {
      await save({
        type: selectedDbType,
        type_options: { ...typeOptions },
        metadata,
        default: getDefaultForTypeChange(),
      });
      typeChangeState = { state: 'success' };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : $_('unable_to_change_column_type');
      toast.error(errorMessage);
      typeChangeState = { state: 'failure', errors: [errorMessage] };
    }
  }

  $: isSaveDisabled =
    !selectedAbstractType ||
    typeChangeState?.state === 'processing' ||
    !$validationResult;
</script>

<AbstractTypeSelector
  {selectedAbstractType}
  {column}
  {allowCreatedAt}
  on:change={(e) => selectTypeAndAbstractType(e.detail)}
  on:reset={() => resetAbstractType(column)}
  disabled={typeChangeState?.state === 'processing' || disabled}
/>

{#if selectedAbstractType && selectedDbType}
  {#key selectedAbstractType}
    <AbstractTypeDBOptions
      {selectedAbstractType}
      bind:selectedDbType
      bind:typeOptions
      {column}
      {disabled}
    />
  {/key}
{/if}

{#if actionButtonsVisible}
  <div class="footer">
    {#if showWarnings}
      <WarningBox>
        <span class="warning-alert">
          {$_('data_loss_warning_alert')}
        </span>
      </WarningBox>
    {/if}
    <CancelOrProceedButtonPair
      onProceed={onSave}
      onCancel={cancel}
      isProcessing={typeChangeState?.state === 'processing'}
      canProceed={!isSaveDisabled}
      proceedButton={{ label: $_('save') }}
      size="small"
    />
  </div>
{/if}

<style lang="scss">
  .footer {
    margin-top: 1rem;

    display: flex;
    flex-direction: column;

    > :global(* + *) {
      margin-top: 0.5rem;
    }

    .warning-alert {
      font-size: var(--sm1);
    }
  }
</style>
