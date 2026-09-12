<script lang="ts">
  import { _ } from 'svelte-i18n';

  import CollapsibleFieldset from '@mathesar/components/CollapsibleFieldset.svelte';
  import {
    FieldLayout,
    type FilledFormValues,
    FormSubmit,
    makeForm,
    optionalField,
    requiredField,
    uniqueWith,
  } from '@mathesar/components/form';
  import Field from '@mathesar/components/form/Field.svelte';
  import {
    type NewPkColumnType,
    SelectNewPkColumnType,
  } from '@mathesar/components/select-new-pk-column-type';
  import type { Schema } from '@mathesar/models/Schema';
  import { createTable } from '@mathesar/stores/tables';
  import {
    Checkbox,
    Help,
    LabeledInput,
    portalToWindowFooter,
  } from '@mathesar-component-library';

  export let close: () => void;
  export let schema: Schema;
  export let existingTableNames: Set<string>;

  function getInitialName() {
    function makeName(i: number): string {
      const name = `${$_('table')} ${i}`;
      return existingTableNames.has(name) ? makeName(i + 1) : name;
    }
    return makeName(1);
  }

  $: name = requiredField(getInitialName(), [
    uniqueWith(existingTableNames, $_('table_name_already_exists')),
  ]);
  $: description = optionalField('');
  $: pkColumnName = requiredField('id');
  $: pkColumnType = requiredField<NewPkColumnType>('IDENTITY');
  $: form = makeForm({ name, description, pkColumnName, pkColumnType });

  /**
   * On unless turned off: a record is nearly always worth being able to date,
   * and the two columns are easier to drop afterwards than to add.
   */
  const recordTimestamps = requiredField(true);

  async function save(values: FilledFormValues<typeof form>) {
    await createTable({
      schema,
      name: values.name,
      description: values.description,
      pkColumn: {
        name: values.pkColumnName,
        type: values.pkColumnType,
      },
      recordTimestamps: $recordTimestamps,
    });
    close();
  }
</script>

<Field field={name} label={$_('name')} layout="stacked" />
<Field field={description} label={$_('description')} layout="stacked" />
<FieldLayout>
  <CollapsibleFieldset>
    <span slot="label">{$_('primary_key_column')}</span>
    <Field field={pkColumnName} label={$_('column_name')} layout="stacked" />
    <Field
      field={pkColumnType}
      layout="stacked"
      label={$_('column_type')}
      input={{ component: SelectNewPkColumnType }}
    />
  </CollapsibleFieldset>
</FieldLayout>

<FieldLayout>
  <LabeledInput layout="inline-input-first">
    <div slot="label">
      {$_('record_timestamps')}
      <Help>
        <p>{$_('record_timestamps_help')}</p>
      </Help>
    </div>
    <Checkbox bind:checked={$recordTimestamps} />
  </LabeledInput>
</FieldLayout>

<div use:portalToWindowFooter>
  <FormSubmit {form} onProceed={save} onCancel={close} />
</div>
