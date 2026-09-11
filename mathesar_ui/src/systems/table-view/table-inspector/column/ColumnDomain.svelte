<script lang="ts">
  import { _ } from 'svelte-i18n';

  import type { RawSchemaType } from '@mathesar/api/rpc/schemas';
  import type { Table } from '@mathesar/models/Table';
  import {
    type ProcessedColumn,
    getTabularDataStoreFromContext,
  } from '@mathesar/stores/table-data';
  import { toast } from '@mathesar/stores/toast';
  import {
    CancelOrProceedButtonPair,
    LabeledInput,
    Select,
  } from '@mathesar-component-library';

  export let column: ProcessedColumn;
  export let table: Table;
  export let disabled = false;

  const tabularData = getTabularDataStoreFromContext();
  $: ({ columnsDataStore } = $tabularData);

  $: typesFetch = table.schema.constructTypesStore();
  $: ({ name: schemaName } = table.schema);
  $: void typesFetch.runConservatively();

  function quoteIdent(name: string) {
    return /^[a-z_][a-z0-9_]*$/.test(name)
      ? name
      : `"${name.replace(/"/g, '""')}"`;
  }

  /** A domain's type without modifiers, as column types are given */
  function unmodified(type: string | undefined) {
    return (type ?? '').replace(/\(.*\)$/, '');
  }

  $: currentDomain = column.column.type_options?.domain ?? null;
  // The schema's domains over the column's type, which it can be made one of
  $: domains = ($typesFetch.resolvedValue ?? []).filter(
    (t): t is RawSchemaType =>
      t.kind === 'domain' && unmodified(t.base_type) === column.column.type,
  );

  function qualified(domain: RawSchemaType) {
    return `${quoteIdent($schemaName)}.${quoteIdent(domain.name)}`;
  }
  function isCurrent(domain: RawSchemaType) {
    return currentDomain === domain.name || currentDomain === qualified(domain);
  }

  $: options = [null, ...domains];
  $: savedOption = domains.find(isCurrent) ?? null;
  let selected: RawSchemaType | null = null;
  function resetSelection(option: RawSchemaType | null) {
    selected = option;
  }
  $: resetSelection(savedOption);

  let isSaving = false;
  async function save() {
    isSaving = true;
    try {
      if (selected) {
        await columnsDataStore.patch({
          id: column.column.id,
          type: qualified(selected),
        });
      } else {
        const { precision, scale, length, fields } =
          column.column.type_options ?? {};
        await columnsDataStore.patch({
          id: column.column.id,
          type: column.column.type,
          type_options: { precision, scale, length, fields },
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      resetSelection(savedOption);
    } finally {
      isSaving = false;
    }
  }
</script>

{#if domains.length > 0 || currentDomain}
  <div class="domain">
    <LabeledInput label={$_('domain')} layout="stacked">
      <Select
        {options}
        value={selected}
        getLabel={(o) => (o ? o.name : $_('no_domain'))}
        valuesAreEqual={(a, b) => (a?.oid ?? null) === (b?.oid ?? null)}
        on:change={(e) => {
          selected = e.detail ?? null;
        }}
        disabled={disabled || isSaving}
      />
    </LabeledInput>
    {#if !currentDomain || savedOption}
      {#if selected?.description}
        <p class="help">{selected.description}</p>
      {/if}
    {:else}
      <p class="help">
        {$_('column_of_other_schema_domain', {
          values: { domain: currentDomain },
        })}
      </p>
    {/if}
    {#if (selected?.oid ?? null) !== (savedOption?.oid ?? null)}
      <CancelOrProceedButtonPair
        onProceed={save}
        onCancel={() => resetSelection(savedOption)}
        isProcessing={isSaving}
        proceedButton={{ label: $_('save') }}
        size="small"
      />
    {/if}
  </div>
{/if}

<style lang="scss">
  .domain {
    margin-top: var(--sm1);
    display: grid;
    gap: var(--sm3);
  }
  .help {
    margin: 0;
    font-size: var(--sm1);
    color: var(--color-fg-base-muted);
  }
</style>
