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
  import type { AgentCertificate, User } from '@mathesar/api/rpc/users';
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
  import { iconAddNew, iconDeleteMajor, iconRefresh } from '@mathesar/icons';
  import AsyncStore from '@mathesar/stores/AsyncStore';
  import { getErrorMessage } from '@mathesar/utils/errors';
  import { Button, Icon, Spinner, TextInput } from '@mathesar-component-library';

  import AgentCertificateIssued from './AgentCertificateIssued.svelte';

  const agentsRequest = new AsyncStore<void, User[]>(() =>
    api.users.agents.list().run(),
  );
  /**
   * Whether this installation can issue a certificate at all. Where it cannot -- which is
   * every installation without a certificate gate in front of it -- the button is not shown
   * rather than shown and failing.
   */
  const canIssueRequest = new AsyncStore<void, boolean>(() =>
    api.users.agents.can_issue_certificates().run(),
  );

  let actionError: string | undefined = undefined;
  let busyWith: string | undefined = undefined;
  /** The one showing of a newly issued certificate, kept only until the page moves on */
  let issued: AgentCertificate | undefined = undefined;

  void agentsRequest.run();
  void canIssueRequest.run();

  $: canIssue = $canIssueRequest.resolvedValue ?? false;

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

  /** Run one thing against one agent, showing it as busy and keeping any complaint. */
  async function against(agent: User, work: () => Promise<void>) {
    actionError = undefined;
    busyWith = agent.id;
    try {
      await work();
      await agentsRequest.run();
    } catch (error) {
      actionError = getErrorMessage(error);
    } finally {
      busyWith = undefined;
    }
  }

  function stopAgent(agent: User) {
    return against(agent, async () => {
      await api.users.agents.delete({ agent_id: agent.id }).run();
      if (issued?.agent.id === agent.id) issued = undefined;
    });
  }

  function provision(agent: User) {
    return against(agent, async () => {
      issued = await api.users.agents
        .provision_certificate({ agent_id: agent.id })
        .run();
    });
  }

  function revoke(agent: User) {
    return against(agent, async () => {
      await api.users.agents.revoke_certificate({ agent_id: agent.id }).run();
      if (issued?.agent.id === agent.id) issued = undefined;
    });
  }

  function expiry(agent: User): string {
    if (!agent.cert_expires_at) return '';
    return new Date(agent.cert_expires_at).toLocaleDateString();
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
            {#if agent.has_certificate}
              <span class="admitted">
                {$_('certificate_until', { values: { date: expiry(agent) } })}
              </span>
            {:else}
              <span class="not-admitted">{$_('not_let_in_yet')}</span>
            {/if}
          </div>
          <div class="actions">
            {#if canIssue}
              <Button
                appearance="primary"
                disabled={busyWith === agent.id}
                on:click={() => provision(agent)}
              >
                {#if busyWith === agent.id}
                  <Spinner />
                {:else}
                  <Icon {...(agent.has_certificate ? iconRefresh : iconAddNew)} />
                {/if}
                <span>
                  {agent.has_certificate
                    ? $_('reissue_certificate')
                    : $_('provision_certificate')}
                </span>
              </Button>
              {#if agent.has_certificate}
                <Button
                  appearance="secondary"
                  disabled={busyWith === agent.id}
                  on:click={() => revoke(agent)}
                >
                  <span>{$_('revoke_certificate')}</span>
                </Button>
              {/if}
            {/if}
            <Button
              appearance="secondary"
              disabled={busyWith === agent.id}
              on:click={() => stopAgent(agent)}
            >
              <Icon {...iconDeleteMajor} />
              <span>{$_('stop_agent')}</span>
            </Button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  {#if actionError}
    <ErrorBox>{actionError}</ErrorBox>
  {/if}

  {#if issued}
    <AgentCertificateIssued certificate={issued} />
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

  .actions {
    display: flex;
    gap: var(--sm3);
    flex-wrap: wrap;
  }

  .admitted,
  .not-admitted {
    font-size: var(--sm1);
    padding: 0 var(--sm4);
    border-radius: var(--border-radius-s);
  }

  .admitted {
    background: var(--color-bg-raised-2);
    color: var(--color-fg-base-muted);
  }

  .not-admitted {
    color: var(--color-fg-warning);
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
