<script lang="ts">
  import { _ } from 'svelte-i18n';

  import type { RawSchemaType } from '@mathesar/api/rpc/schemas';
  import WarningBox from '@mathesar/components/message-boxes/WarningBox.svelte';
  import { iconAddNew, iconDeleteMajor } from '@mathesar/icons';
  import { Button, Icon, TextInput } from '@mathesar-component-library';

  import {
    type CompositeFieldEntry,
    getDroppedFields,
    getFieldEntriesError,
    isFieldTheTypeHas,
    withField,
    withFieldName,
    withoutField,
  } from './compositeFields';
  import TypeChoiceInput from './TypeChoiceInput.svelte';

  export let entries: CompositeFieldEntry[];
  /** The type as it stands, to say what a change to its fields would cost */
  export let type: RawSchemaType | undefined = undefined;
  export let disabled = false;

  $: error = getFieldEntriesError(entries);
  $: dropped = getDroppedFields(entries, type);
</script>

<div class="fields">
  {#each entries as entry (entry.key)}
    <div class="field" class:being-added={!isFieldTheTypeHas(entry)}>
      <div class="line">
        <TextInput
          value={entry.name}
          onValueChange={(name) => {
            entries = withFieldName(entries, entry.key, name);
          }}
          aria-label={$_('field_name')}
          {disabled}
        />
        {#if isFieldTheTypeHas(entry)}
          <!-- The type of a field the composite type already has is the type
          Postgres holds it as, which is not ours to change: it will not change
          one while anything holds the type, and a field of another type is a
          field taken off and another put on. -->
          <code title={entry.held}>{entry.held}</code>
        {/if}
        <Button
          appearance="plain"
          size="small"
          {disabled}
          aria-label={$_('remove')}
          on:click={() => {
            entries = withoutField(entries, entry.key);
          }}
        >
          <Icon {...iconDeleteMajor} />
        </Button>
      </div>
      {#if !isFieldTheTypeHas(entry)}
        <div class="type">
          <TypeChoiceInput
            bind:value={entry.type}
            bind:isValid={entry.typeIsValid}
            {disabled}
          />
        </div>
      {/if}
    </div>
  {/each}
  <div class="add">
    <Button
      appearance="secondary"
      size="small"
      {disabled}
      on:click={() => {
        entries = withField(entries);
      }}
    >
      <Icon {...iconAddNew} />
      <span>{$_('add_composite_field')}</span>
    </Button>
  </div>
  {#if dropped.length > 0}
    <WarningBox>
      {$_('composite_fields_dropped', {
        values: { fields: dropped.join(', ') },
      })}
    </WarningBox>
  {/if}
  {#if error}
    <p class="error">{$_(error)}</p>
  {/if}
</div>

<style lang="scss">
  .fields {
    display: grid;
    gap: var(--sm3);
  }
  .field.being-added {
    padding: var(--sm3);
    border: 1px solid var(--color-border-section);
    border-radius: var(--border-radius-m);
    background: var(--color-bg-raised-1);
  }
  .line {
    display: flex;
    align-items: center;
    gap: var(--sm4);
  }
  /* The name takes what the type leaves, rather than the other way around: a
  type is as long as it is, and a name being typed can do with what is left. */
  .line > :global(.input-element) {
    flex: 1 1 0;
    min-width: 0;
  }
  code {
    flex: 0 0 auto;
    max-width: 50%;
    font-size: var(--sm2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .type {
    margin-top: var(--sm3);
    display: grid;
    gap: var(--sm3);
  }
  .add {
    justify-self: start;
  }
  .error {
    margin: 0;
    font-size: var(--sm1);
    color: var(--color-fg-error);
  }
</style>
