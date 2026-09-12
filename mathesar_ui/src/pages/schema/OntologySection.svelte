<script lang="ts">
  import { _ } from 'svelte-i18n';

  import { api } from '@mathesar/api/rpc';
  import type { RawSchemaType } from '@mathesar/api/rpc/schemas';
  import NameWithIcon from '@mathesar/components/NameWithIcon.svelte';
  import {
    iconAddNew,
    iconDeleteMajor,
    iconEdit,
    iconUiTypeComposite,
    iconUiTypeEnum,
    iconUiTypeText,
  } from '@mathesar/icons';
  import type { Schema } from '@mathesar/models/Schema';
  import { confirmDelete } from '@mathesar/stores/confirmation';
  import { modal } from '@mathesar/stores/modal';
  import { toast } from '@mathesar/stores/toast';
  import CompositeTypeModal from '@mathesar/systems/ontology/CompositeTypeModal.svelte';
  import DomainTypeModal from '@mathesar/systems/ontology/DomainTypeModal.svelte';
  import EnumTypeModal from '@mathesar/systems/ontology/EnumTypeModal.svelte';
  import {
    Button,
    ButtonMenuItem,
    DropdownMenu,
    Help,
    Icon,
    type ModalController,
  } from '@mathesar-component-library';

  import SchemaOverviewSideSection from './SchemaOverviewSideSection.svelte';

  export let schema: Schema;

  $: typesFetch = schema.constructTypesStore();
  $: void typesFetch.runConservatively();
  $: types = $typesFetch.resolvedValue ?? [];
  $: ({ canBeAddedTo } = schema);
  $: canEdit = $canBeAddedTo;

  const enumModal = modal.spawnModalController();
  const domainModal = modal.spawnModalController();
  const compositeModal = modal.spawnModalController();
  /** The type the modal is open on, or undefined for one being made */
  let editing: RawSchemaType | undefined = undefined;

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

  /** Which modal makes and changes a type of the kind, for the kinds that have one */
  const modals: Partial<Record<RawSchemaType['kind'], ModalController>> = {
    enum: enumModal,
    domain: domainModal,
    composite: compositeModal,
  };

  function edit(kind: RawSchemaType['kind'], type: RawSchemaType | undefined) {
    editing = type;
    modals[kind]?.open();
  }

  function reload() {
    void typesFetch.run();
  }

  function remove(type: RawSchemaType) {
    void confirmDelete({
      identifierType: kindLabel(type),
      identifierName: type.name,
      body: [$_('are_you_sure_to_proceed')],
      onProceed: async () => {
        try {
          await api.types
            .delete({
              database_id: schema.database.id,
              type_oid: type.oid,
            })
            .run();
          reload();
        } catch (e) {
          toast.fromError(e);
        }
      },
    });
  }
</script>

<SchemaOverviewSideSection
  isLoading={$typesFetch.isLoading}
  hasError={!!$typesFetch.error}
>
  <svelte:fragment slot="header">
    {$_('ontology')}
    <Help>{$_('ontology_help')}</Help>
    {#if canEdit}
      <DropdownMenu
        showArrow={false}
        triggerAppearance="plain"
        closeOnInnerClick={true}
        label={$_('new_type')}
        size="small"
      >
        <div slot="trigger">
          <Icon {...iconAddNew} />
        </div>
        <ButtonMenuItem on:click={() => edit('enum', undefined)}>
          {$_('new_choice')}
        </ButtonMenuItem>
        <ButtonMenuItem on:click={() => edit('domain', undefined)}>
          {$_('new_domain')}
        </ButtonMenuItem>
        <ButtonMenuItem on:click={() => edit('composite', undefined)}>
          {$_('new_composite')}
        </ButtonMenuItem>
      </DropdownMenu>
    {/if}
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
              {#if canEdit}
                <span class="actions">
                  <Button
                    appearance="plain"
                    size="small"
                    tooltip={$_('edit_type')}
                    on:click={() => edit(type.kind, type)}
                  >
                    <Icon {...iconEdit} />
                  </Button>
                  <!-- A type a column holds cannot be dropped, and the card
                  says which column holds it. -->
                  {#if type.used_by.length === 0}
                    <Button
                      appearance="plain"
                      size="small"
                      tooltip={$_('delete_type')}
                      on:click={() => remove(type)}
                    >
                      <Icon {...iconDeleteMajor} />
                    </Button>
                  {/if}
                </span>
              {/if}
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
            {#if type.fields?.length}
              <ul class="details">
                {#each type.fields as field}
                  <li><span class="name">{field.name}</span> {field.type}</li>
                {/each}
              </ul>
            {/if}
            <p class="description used-by">
              {#if type.used_by.length === 0}
                {$_('type_used_by_nothing')}
              {:else}
                {$_('type_used_by', {
                  values: {
                    columns: type.used_by
                      .map((user) => `${user.table_name}.${user.column_name}`)
                      .join(', '),
                  },
                })}
              {/if}
            </p>
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
                    <!-- The value itself when that is all the default is, and
                    the expression Postgres wrote down when it is more. -->
                    {$_('ontology_default', {
                      values: { value: type.default_value ?? type.default },
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

<EnumTypeModal
  controller={enumModal}
  {schema}
  type={editing?.kind === 'enum' ? editing : undefined}
  onSaved={reload}
/>

<DomainTypeModal
  controller={domainModal}
  {schema}
  type={editing?.kind === 'domain' ? editing : undefined}
  onSaved={reload}
/>

<CompositeTypeModal
  controller={compositeModal}
  {schema}
  type={editing?.kind === 'composite' ? editing : undefined}
  onSaved={reload}
/>

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
    gap: var(--sm1);
    font-weight: var(--font-weight-medium);
  }
  .kind {
    margin-left: auto;
    font-size: var(--sm1);
    font-weight: normal;
    color: var(--color-fg-base-muted);
  }
  .actions {
    display: flex;
    align-self: center;
  }
  .used-by {
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
