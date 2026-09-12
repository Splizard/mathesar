<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { _ } from 'svelte-i18n';

  import type { RequestStatus } from '@mathesar/api/rest/utils/requestUtils';
  import {
    getAutoFillChangesForTypeChange,
    getKindOf,
    mergeMetadataOnTypeChange,
  } from '@mathesar/stores/abstract-types';
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
  /**
   * Whether `save` handles `default` and `updated_at_trigger`, which the
   * "Created At" and "Updated At" types need
   */
  export let allowAutoFilledTypes = false;

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
    JSON.stringify(metadata ?? {}) !== JSON.stringify(column.metadata ?? {});

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
    metadata = mergeMetadataOnTypeChange(
      selectedAbstractType,
      metadata,
      selectedDbType,
    );
  }

  function cancel() {
    resetAbstractType(column);
    typeChangeState = { state: 'success' };
    dispatch('cancel');
  }

  async function onSave() {
    typeChangeState = { state: 'processing' };
    try {
      await save({
        type: selectedDbType,
        type_options: { ...typeOptions },
        metadata,
        ...getAutoFillChangesForTypeChange(
          { abstractType: column.abstractType, dbType: column.type },
          { abstractType: selectedAbstractType, dbType: selectedDbType },
        ),
      });
      typeChangeState = { state: 'success' };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : $_('unable_to_change_column_type');
      toast.error(errorMessage);
      typeChangeState = { state: 'failure', errors: [errorMessage] };
    }
  }

  // The options offered are those of the kind, whichever of its DB types
  $: selectedKind = getKindOf({
    abstractType: selectedAbstractType,
    dbType: selectedDbType,
    itemType: column.type_options?.item_type ?? undefined,
  });
  $: selectedKindKey = [
    selectedKind.kind.identifier,
    selectedKind.isRange,
    selectedKind.isArray,
  ].join(':');

  $: isSaveDisabled =
    !selectedAbstractType ||
    typeChangeState?.state === 'processing' ||
    !$validationResult;
</script>

<AbstractTypeSelector
  {selectedAbstractType}
  {selectedDbType}
  {column}
  {allowAutoFilledTypes}
  on:change={(e) => selectTypeAndAbstractType(e.detail)}
  on:reset={() => resetAbstractType(column)}
  disabled={typeChangeState?.state === 'processing' || disabled}
/>

{#if selectedAbstractType && selectedDbType}
  {#key selectedKindKey}
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
