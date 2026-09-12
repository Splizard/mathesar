<script lang="ts">
  import { _ } from 'svelte-i18n';

  import { api } from '@mathesar/api/rpc';
  import type { ColumnTypeOptions } from '@mathesar/api/rpc/columns';
  import type { RawSchemaType } from '@mathesar/api/rpc/schemas';
  import {
    Field,
    FieldLayout,
    FormSubmit,
    makeForm,
    optionalField,
    requiredField,
  } from '@mathesar/components/form';
  import type { Schema } from '@mathesar/models/Schema';
  import {
    Checkbox,
    ControlledModal,
    Help,
    Label,
    LabeledInput,
    type ModalController,
    TextArea,
    portalToWindowFooter,
  } from '@mathesar-component-library';

  import DomainBaseTypeInput from './DomainBaseTypeInput.svelte';
  import {
    type DomainRuleEntry,
    type RuleSubject,
    getApiRules,
    getRuleEntries,
    getRuleEntriesError,
    getRuleSubjectOf,
  } from './domainRules';
  import DomainRulesInput from './DomainRulesInput.svelte';

  export let controller: ModalController;
  export let schema: Schema;
  /** The domain being changed, or undefined for one being made */
  export let type: RawSchemaType | undefined = undefined;
  export let onSaved: () => void;

  const name = requiredField('');
  const description = optionalField('');
  const notNull = requiredField(false);
  const defaultValue = optionalField('');
  const form = makeForm({ name, description, notNull, defaultValue });

  let rules: DomainRuleEntry[] = [];
  /** The type a domain being made is to be over, which the input picks */
  let over: { name: string; options: ColumnTypeOptions } = {
    name: 'text',
    options: {},
  };
  /** What rules the type it is over can be given */
  let subject: RuleSubject | undefined = undefined;

  function reset(_type: RawSchemaType | undefined) {
    // The whole form, so that what the database said about the last attempt goes
    // with the values it was said about.
    form.reset();
    name.set(_type?.name ?? '');
    description.set(_type?.description ?? '');
    notNull.set(_type?.not_null ?? false);
    defaultValue.set(_type?.default_value ?? '');
    rules = getRuleEntries(_type);
  }

  // The modal is the same whether a domain is being made or changed, so what it
  // holds is set from the domain each time it is opened rather than once.
  $: reset(type);

  // A domain being changed keeps the type it is over: Postgres cannot change it,
  // and a column of the domain would have nowhere to go while it did. So which
  // rules it can be given is settled by the type it was made over, and the
  // input for that type is only shown while there is one to pick.
  $: if (type) subject = getRuleSubjectOf(type);

  /**
   * A default which is an expression rather than a value is left alone: it is
   * not something this form can hold, so saying nothing about it is the only
   * honest thing to do.
   */
  $: defaultIsExpression = !!type?.default && type.default_value === null;

  function getPatchedDefault(): string | null | undefined {
    if (defaultIsExpression) return undefined;
    return $defaultValue === '' ? null : $defaultValue;
  }

  async function save() {
    if (type) {
      await api.types
        .patch_domain({
          database_id: schema.database.id,
          type_oid: type.oid,
          patch: {
            name: $name,
            description: $description || null,
            not_null: $notNull,
            default: getPatchedDefault(),
            rules: getApiRules(rules),
          },
        })
        .run();
    } else {
      await api.types
        .add_domain({
          database_id: schema.database.id,
          schema_oid: schema.oid,
          name: $name,
          spec: {
            over,
            not_null: $notNull,
            default: $defaultValue || null,
            rules: getApiRules(rules),
            description: $description || null,
          },
        })
        .run();
    }
    onSaved();
    controller.close();
  }
</script>

<ControlledModal {controller} on:close={() => reset(type)}>
  <span slot="title">
    {type ? $_('edit_domain') : $_('new_domain')}
  </span>
  <div>
    <Field label={$_('name')} layout="stacked" field={name} />
    <Field
      label={$_('description')}
      layout="stacked"
      field={description}
      input={{ component: TextArea }}
    />
    <FieldLayout>
      {#if type}
        <Label>{$_('domain_over')}</Label>
        <p class="over">{type.over}</p>
        <p class="help">{$_('domain_over_is_fixed')}</p>
      {:else}
        <DomainBaseTypeInput bind:over bind:subject />
      {/if}
    </FieldLayout>
    <FieldLayout>
      <LabeledInput layout="inline-input-first">
        <span slot="label">
          {$_('ontology_not_null')}
          <Help>{$_('domain_not_null_help')}</Help>
        </span>
        <Checkbox checked={$notNull} on:change={() => notNull.set(!$notNull)} />
      </LabeledInput>
    </FieldLayout>
    {#if defaultIsExpression}
      <FieldLayout>
        <Label>{$_('default_value')}</Label>
        <p class="over">{type?.default}</p>
        <p class="help">{$_('domain_default_is_expression')}</p>
      </FieldLayout>
    {:else}
      <Field
        label={$_('default_value')}
        layout="stacked"
        field={defaultValue}
        help={$_('domain_default_help')}
      />
    {/if}
    <FieldLayout>
      <Label>{$_('domain_rules')}</Label>
      <DomainRulesInput bind:entries={rules} {subject} />
    </FieldLayout>
  </div>

  <div use:portalToWindowFooter>
    <FormSubmit
      {form}
      catchErrors
      canProceed={getRuleEntriesError(rules) === undefined}
      onCancel={() => {
        reset(type);
        controller.close();
      }}
      onProceed={save}
      proceedButton={{ label: type ? $_('save') : $_('create_domain') }}
      cancelButton={{ label: $_('cancel') }}
    />
  </div>
</ControlledModal>

<style lang="scss">
  .over {
    margin: var(--sm4) 0 0 0;
    font-family: var(--font-family-mono);
    font-size: var(--sm1);
  }
  .help {
    margin: var(--sm4) 0 0 0;
    font-size: var(--sm1);
    color: var(--color-fg-base-muted);
  }
</style>
