<script lang="ts">
  import { _ } from 'svelte-i18n';

  import type { RawSchemaType } from '@mathesar/api/rpc/schemas';
  import NameWithIcon from '@mathesar/components/NameWithIcon.svelte';
  import {
    iconUiTypeComposite,
    iconUiTypeEnum,
    iconUiTypeText,
  } from '@mathesar/icons';
  import type { Schema } from '@mathesar/models/Schema';
  import { Help } from '@mathesar-component-library';

  import SchemaOverviewSideSection from './SchemaOverviewSideSection.svelte';

  export let schema: Schema;

  $: typesFetch = schema.constructTypesStore();
  $: void typesFetch.runConservatively();
  $: types = $typesFetch.resolvedValue ?? [];

  const icons = {
    enum: iconUiTypeEnum,
    composite: iconUiTypeComposite,
    domain: iconUiTypeText,
  };

  function kindLabel(type: RawSchemaType) {
    if (type.kind === 'enum') return $_('ontology_choice');
    if (type.kind === 'composite') return $_('ontology_composite');
    return $_('ontology_domain_of', { values: { type: type.over } });
  }
</script>

<SchemaOverviewSideSection
  isLoading={$typesFetch.isLoading}
  hasError={!!$typesFetch.error}
>
  <svelte:fragment slot="header">
    {$_('ontology')}
    <Help>{$_('ontology_help')}</Help>
  </svelte:fragment>
  <svelte:fragment slot="errors">
    <p>{$typesFetch.error}</p>
  </svelte:fragment>
  <svelte:fragment slot="content">
    {#if types.length === 0}
      <p class="empty">{$_('ontology_empty')}</p>
    {:else}
      <ul class="types">
        {#each types as type (type.oid)}
          <li>
            <div class="title">
              <NameWithIcon icon={icons[type.kind]}>{type.name}</NameWithIcon>
              <span class="kind">{kindLabel(type)}</span>
            </div>
            {#if type.description}
              <p class="description">{type.description}</p>
            {/if}
            {#if type.values}
              <div class="chips">
                {#each type.values as value}
                  <span class="chip">{value}</span>
                {/each}
              </div>
            {/if}
            {#if type.fields}
              <ul class="details">
                {#each type.fields as field}
                  <li><span class="name">{field.name}</span> {field.type}</li>
                {/each}
              </ul>
            {/if}
            {#if type.kind === 'domain'}
              <ul class="details">
                {#if type.over !== type.base_type}
                  <li>
                    {$_('ontology_stored_as', {
                      values: { type: type.base_type },
                    })}
                  </li>
                {/if}
                {#if type.not_null}
                  <li>{$_('ontology_not_null')}</li>
                {/if}
                {#if type.default}
                  <li>
                    {$_('ontology_default', {
                      values: { value: type.default },
                    })}
                  </li>
                {/if}
                {#each type.constraints ?? [] as constraint}
                  <li><code>{constraint.definition}</code></li>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </svelte:fragment>
</SchemaOverviewSideSection>

<style lang="scss">
  .empty {
    color: var(--color-fg-base-muted);
    margin: 0;
  }
  .types {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--sm1);

    > li {
      padding: var(--sm2) var(--sm1);
      border: 1px solid var(--color-border-section);
      border-radius: var(--border-radius-m);
      background: var(--color-bg-raised-1);
    }
  }
  .title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sm1);
    font-weight: var(--font-weight-medium);
  }
  .kind {
    font-size: var(--sm1);
    font-weight: normal;
    color: var(--color-fg-base-muted);
  }
  .description {
    margin: var(--sm4) 0 0 0;
    font-size: var(--sm1);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sm4);
    margin-top: var(--sm3);
  }
  .chip {
    font-size: var(--sm1);
    padding: 0 var(--sm3);
    border-radius: var(--border-radius-xl);
    background: var(--color-bg-raised-3);
  }
  .details {
    margin: var(--sm3) 0 0 0;
    padding-left: var(--lg1);
    font-size: var(--sm1);

    .name {
      font-weight: var(--font-weight-medium);
    }
    code {
      font-size: var(--sm2);
      word-break: break-word;
    }
  }
</style>
