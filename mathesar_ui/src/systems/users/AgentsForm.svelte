<!--
  The agents a person has set going.

  An agent is a user with an owner, so this page does nothing clever: it names one, says
  which model is behind it, and lets it go again. What it deliberately does say out loud is
  that making one does not let it in -- an agent arrives through whatever gate the
  installation puts in front of Mathesar, and somebody still has to open that gate for it.
-->
<script lang="ts">
  import { _ } from 'svelte-i18n';

  import { api } from '@mathesar/api/rpc';
  import type { User } from '@mathesar/api/rpc/users';
  import {
    FormSubmit,
    makeForm,
    optionalField,
    requiredField,
  } from '@mathesar/components/form';
  import Field from '@mathesar/components/form/Field.svelte';
  import { GridForm, GridFormLabelRow } from '@mathesar/components/grid-form';
  import ErrorBox from '@mathesar/components/message-boxes/ErrorBox.svelte';
  import WarningBox from '@mathesar/components/message-boxes/WarningBox.svelte';
  import { iconAddNew, iconDeleteMajor } from '@mathesar/icons';
  import AsyncStore from '@mathesar/stores/AsyncStore';
  import { getErrorMessage } from '@mathesar/utils/errors';
  import { Button, Icon, Spinner, TextInput } from '@mathesar-component-library';

  const agentsRequest = new AsyncStore<void, User[]>(() =>
    api.users.agents.list().run(),
  );

  let deleteError: string | undefined = undefined;
  let busyWith: string | undefined = undefined;

  void agentsRequest.run();

  $: agents = $agentsRequest.resolvedValue ?? [];

  const name = requiredField('');
  const agentModel = optionalField('');
  const email = optionalField('');
  $: form = makeForm({ name, agentModel, email });

  async function addAgent() {
    await api.users.agents
      .add({
        name: $name,
        agent_model: $agentModel,
        email: $email || undefined,
      })
      .run();
    form.reset();
    await agentsRequest.run();
  }

  async function stopAgent(agent: User) {
    deleteError = undefined;
    busyWith = agent.id;
    try {
      await api.users.agents.delete({ agent_id: agent.id }).run();
      await agentsRequest.run();
    } catch (error) {
      deleteError = getErrorMessage(error);
    } finally {
      busyWith = undefined;
    }
  }
</script>

<div class="agents">
  <p class="explanation">{$_('agents_help')}</p>

  {#if $agentsRequest.isLoading}
    <Spinner />
  {:else if $agentsRequest.error}
    <ErrorBox>{$agentsRequest.error}</ErrorBox>
  {:else if agents.length === 0}
    <p class="none">{$_('no_agents_yet')}</p>
  {:else}
    <ul class="agent-list">
      {#each agents as agent (agent.id)}
        <li>
          <div class="identity">
            <span class="name">{agent.display_name}</span>
            {#if agent.agent_model}
              <span class="model">{agent.agent_model}</span>
            {/if}
            <span class="email">{agent.email}</span>
          </div>
          <Button
            appearance="secondary"
            disabled={busyWith === agent.id}
            on:click={() => stopAgent(agent)}
          >
            {#if busyWith === agent.id}
              <Spinner />
            {:else}
              <Icon {...iconDeleteMajor} />
            {/if}
            <span>{$_('stop_agent')}</span>
          </Button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if deleteError}
    <ErrorBox>{deleteError}</ErrorBox>
  {/if}

  <GridForm>
    <GridFormLabelRow label={$_('agent_name')}>
      <Field
        field={name}
        input={{ component: TextInput, props: { placeholder: 'Claude' } }}
        help={$_('agent_name_help')}
      />
    </GridFormLabelRow>
    <GridFormLabelRow label={$_('agent_model')}>
      <Field
        field={agentModel}
        input={{ component: TextInput, props: { placeholder: 'claude' } }}
        help={$_('agent_model_help')}
      />
    </GridFormLabelRow>
    <GridFormLabelRow label={$_('agent_email')}>
      <Field
        field={email}
        input={{ component: TextInput }}
        help={$_('agent_email_help')}
      />
    </GridFormLabelRow>
  </GridForm>

  <WarningBox>{$_('agent_needs_letting_in')}</WarningBox>

  <FormSubmit
    {form}
    catchErrors
    onProceed={addAgent}
    proceedButton={{ label: $_('set_an_agent_going'), icon: iconAddNew }}
    cancelButton={{ label: $_('clear') }}
  />
</div>

<style lang="scss">
  .agents {
    display: flex;
    flex-direction: column;
    gap: var(--lg1);
  }

  .explanation,
  .none {
    margin: 0;
    color: var(--color-fg-base-muted);
  }

  .agent-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sm2);
  }

  .agent-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sm2);
    flex-wrap: wrap;
    padding: var(--sm2) var(--sm1);
    border: 1px solid var(--color-border-base);
    border-radius: var(--border-radius-m);
    background: var(--color-bg-raised-1);
  }

  .identity {
    display: flex;
    align-items: baseline;
    gap: var(--sm3);
    flex-wrap: wrap;
    min-width: 0;
  }

  .name {
    font-weight: 500;
  }

  .model {
    font-size: var(--sm1);
    padding: 0 var(--sm4);
    border-radius: var(--border-radius-s);
    background: var(--color-bg-raised-2);
    color: var(--color-fg-base-muted);
  }

  .email {
    font-size: var(--sm1);
    color: var(--color-fg-base-muted);
    overflow-wrap: anywhere;
  }
</style>
