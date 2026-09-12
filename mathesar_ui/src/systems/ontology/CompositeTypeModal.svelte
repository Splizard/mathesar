<script lang="ts">
  import { _ } from 'svelte-i18n';

  import { api } from '@mathesar/api/rpc';
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
    ControlledModal,
    Help,
    Label,
    type ModalController,
    TextArea,
    portalToWindowFooter,
  } from '@mathesar-component-library';

  import {
    type CompositeFieldEntry,
    getApiFields,
    getFieldEntries,
    getFieldEntriesError,
  } from './compositeFields';
  import CompositeFieldsInput from './CompositeFieldsInput.svelte';

  export let controller: ModalController;
  export let schema: Schema;
  /** The composite type being changed, or undefined for one being made */
  export let type: RawSchemaType | undefined = undefined;
  export let onSaved: () => void;

  const name = requiredField('');
  const description = optionalField('');
  const form = makeForm({ name, description });

  let entries: CompositeFieldEntry[] = [];

  function reset(_type: RawSchemaType | undefined) {
    // The whole form, so that what the database said about the last attempt goes
    // with the values it was said about.
    form.reset();
    name.set(_type?.name ?? '');
    description.set(_type?.description ?? '');
    entries = getFieldEntries(_type);
  }

  // The modal is the same whether a type is being made or changed, so what it
  // holds is set from the type each time it is opened rather than once.
  $: reset(type);

  async function save() {
    const fields = getApiFields(entries);
    if (type) {
      await api.types
        .patch_composite({
          database_id: schema.database.id,
          type_oid: type.oid,
          patch: { name: $name, description: $description || null, fields },
        })
        .run();
    } else {
      await api.types
        .add_composite({
          database_id: schema.database.id,
          schema_oid: schema.oid,
          name: $name,
          fields,
          description: $description || null,
        })
        .run();
    }
    onSaved();
    controller.close();
  }
</script>

<ControlledModal {controller} on:close={() => reset(type)}>
  <span slot="title">
    {type ? $_('edit_composite') : $_('new_composite')}
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
      <Label>
        {$_('composite_fields')}
        <Help>{$_('composite_fields_help')}</Help>
      </Label>
      <CompositeFieldsInput bind:entries {type} />
    </FieldLayout>
  </div>

  <div use:portalToWindowFooter>
    <FormSubmit
      {form}
      catchErrors
      canProceed={getFieldEntriesError(entries) === undefined}
      onCancel={() => {
        reset(type);
        controller.close();
      }}
      onProceed={save}
      proceedButton={{ label: type ? $_('save') : $_('create_composite') }}
      cancelButton={{ label: $_('cancel') }}
    />
  </div>
</ControlledModal>
