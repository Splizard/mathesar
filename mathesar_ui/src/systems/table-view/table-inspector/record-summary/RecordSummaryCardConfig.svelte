<script lang="ts">
  import { _ } from 'svelte-i18n';

  import type { RecordSummaryCard } from '@mathesar/api/rpc/tables';
  import {
    FormSubmit,
    makeForm,
    optionalField,
  } from '@mathesar/components/form';
  import { iconUndo } from '@mathesar/icons';
  import type { Table } from '@mathesar/models/Table';
  import type { ProcessedColumns } from '@mathesar/stores/table-data';
  import { updateTable } from '@mathesar/stores/tables';
  import { toast } from '@mathesar/stores/toast';
  import { getErrorMessage } from '@mathesar/utils/errors';
  import {
    Checkbox,
    Help,
    Label,
    LabeledInput,
  } from '@mathesar-component-library';

  import CustomTemplate from './CustomTemplate.svelte';
  import { TemplateConfig } from './TemplateConfig';

  export let table: Table;
  export let processedColumns: ProcessedColumns;
  export let onSave: (() => void) | undefined = undefined;

  const slots = ['primary', 'secondary', 'aside'] as const;
  type Slot = (typeof slots)[number];

  const labels: Record<Slot, string> = {
    primary: 'card_primary',
    secondary: 'card_secondary',
    aside: 'card_aside',
  };

  $: stored = table?.metadata?.record_summary_card ?? undefined;

  /**
   * One editor per slot. The primary is the one a card cannot do without, so turning the card on
   * starts it off with something in it and leaves the other two to be added.
   */
  $: primary = optionalField(
    stored?.primary ? TemplateConfig.fromTemplate(stored.primary) : undefined,
  );
  $: secondary = optionalField(
    stored?.secondary
      ? TemplateConfig.fromTemplate(stored.secondary)
      : undefined,
  );
  $: aside = optionalField(
    stored?.aside ? TemplateConfig.fromTemplate(stored.aside) : undefined,
  );
  $: form = makeForm({ primary, secondary, aside });

  $: configs = { primary: $primary, secondary: $secondary, aside: $aside };
  $: isOn = $primary !== undefined;

  function setSlot(slot: Slot, config: TemplateConfig | undefined) {
    if (slot === 'primary') primary.set(config);
    if (slot === 'secondary') secondary.set(config);
    if (slot === 'aside') aside.set(config);
  }

  function toggleCard() {
    if (isOn) {
      slots.forEach((slot) => setSlot(slot, undefined));
    } else {
      primary.set(TemplateConfig.newCustom(processedColumns));
    }
  }

  function toggleSlot(slot: Slot) {
    setSlot(
      slot,
      configs[slot] ? undefined : TemplateConfig.newCustom(processedColumns),
    );
  }

  function getCard(): RecordSummaryCard | null {
    if (!$primary) return null;
    const card: RecordSummaryCard = { primary: $primary.template };
    if ($secondary) card.secondary = $secondary.template;
    if ($aside) card.aside = $aside.template;
    return card;
  }

  async function save() {
    try {
      await updateTable({
        schema: table.schema,
        table: {
          oid: table.oid,
          metadata: { record_summary_card: getCard() },
        },
      });
      onSave?.();
    } catch (e) {
      toast.error(`${$_('unable_to_save_changes')} ${getErrorMessage(e)}`);
    }
  }
</script>

<div class="record-summary-card-config">
  <LabeledInput layout="inline-input-first">
    <span slot="label">
      {$_('show_records_as_cards')}
      <Help>{$_('show_records_as_cards_help')}</Help>
    </span>
    <Checkbox checked={isOn} on:change={toggleCard} />
  </LabeledInput>

  {#if isOn}
    {#each slots as slot (slot)}
      <div class="slot">
        <Label>{$_(labels[slot])}</Label>
        {#if slot === 'primary'}
          <!-- The one a card cannot do without, so it is always there to edit. -->
          {#if $primary}
            <CustomTemplate
              bind:templateConfig={$primary}
              columns={processedColumns}
              {table}
            />
          {/if}
        {:else}
          <LabeledInput layout="inline-input-first">
            <span slot="label">{$_('include_this_part')}</span>
            <Checkbox
              checked={configs[slot] !== undefined}
              on:change={() => toggleSlot(slot)}
            />
          </LabeledInput>
          {#if slot === 'secondary' && $secondary}
            <CustomTemplate
              bind:templateConfig={$secondary}
              columns={processedColumns}
              {table}
            />
          {/if}
          {#if slot === 'aside' && $aside}
            <CustomTemplate
              bind:templateConfig={$aside}
              columns={processedColumns}
              {table}
            />
          {/if}
        {/if}
      </div>
    {/each}
  {/if}

  <FormSubmit
    {form}
    onProceed={save}
    onCancel={form.reset}
    proceedButton={{ label: $_('save') }}
    cancelButton={{ label: $_('reset'), icon: iconUndo }}
    initiallyHidden
    size="small"
  />
</div>

<style lang="scss">
  .record-summary-card-config > :global(* + *) {
    margin-top: 1rem;
  }

  .slot > :global(* + *) {
    margin-top: var(--sm3);
  }
</style>
