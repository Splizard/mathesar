<!--
  Pick one of your agents and copy the prompt that hands it this table.
-->
<script lang="ts">
  import { _ } from 'svelte-i18n';

  import { api } from '@mathesar/api/rpc';
  import type { User } from '@mathesar/api/rpc/users';
  import ErrorBox from '@mathesar/components/message-boxes/ErrorBox.svelte';
  import WarningBox from '@mathesar/components/message-boxes/WarningBox.svelte';
  import { iconCopyMajor } from '@mathesar/icons';
  import type { Table } from '@mathesar/models/Table';
  import { USER_PROFILE_URL } from '@mathesar/routes/urls';
  import { getErrorMessage } from '@mathesar/utils/errors';
  import { Button, Icon, Select, Spinner } from '@mathesar-component-library';

  export let table: Table;

  let agents: User[] | undefined = undefined;
  let loadError: string | undefined = undefined;
  let chosen: User | undefined = undefined;
  let prompt: string | undefined = undefined;
  let promptError: string | undefined = undefined;
  let copied = false;
  /** Which request is the latest, so a slow answer for an agent no longer chosen is dropped */
  let asking = 0;

  $: schemaName = table.schema.name;

  async function loadAgents() {
    try {
      agents = await api.users.agents.list().run();
      chosen = agents.find((agent) => agent.has_certificate) ?? agents[0];
    } catch (error) {
      loadError = getErrorMessage(error);
    }
  }

  async function makePrompt(agent: User | undefined, schema: string) {
    asking += 1;
    const mine = asking;
    prompt = undefined;
    promptError = undefined;
    copied = false;
    if (!agent?.has_certificate) return;
    try {
      const text = await api.users.agents
        .prompt({
          agent_id: agent.id,
          table: {
            database_id: table.schema.database.id,
            database_name: table.schema.database.name,
            schema_name: schema,
            table_oid: table.oid,
            table_name: table.name,
          },
        })
        .run();
      if (mine === asking) prompt = text;
    } catch (error) {
      if (mine === asking) promptError = getErrorMessage(error);
    }
  }

  async function copy() {
    if (prompt === undefined) return;
    try {
      await navigator.clipboard.writeText(prompt);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch {
      // Clipboard refused, which some browsers do outside a trusted gesture. The text is on
      // screen and selectable, so there is nothing to recover from.
    }
  }

  void loadAgents();
  $: void makePrompt(chosen, $schemaName);
</script>

<div class="agent-prompt">
  <p class="note">{$_('add_your_agent_help')}</p>

  {#if loadError}
    <ErrorBox>{loadError}</ErrorBox>
  {:else if agents === undefined}
    <Spinner />
  {:else if agents.length === 0}
    <p>{$_('no_agents_yet')}</p>
    <a href={USER_PROFILE_URL}>{$_('open_profile_page')}</a>
  {:else}
    {#if agents.length > 1}
      <Select
        options={agents}
        bind:value={chosen}
        getLabel={(agent) => agent?.display_name ?? ''}
      />
    {/if}

    {#if chosen && !chosen.has_certificate}
      <WarningBox>
        {$_('agent_needs_certificate', {
          values: { agent: chosen.display_name },
        })}
        <a href={USER_PROFILE_URL}>{$_('open_profile_page')}</a>
      </WarningBox>
    {:else if promptError}
      <ErrorBox>{promptError}</ErrorBox>
    {:else if prompt === undefined}
      <Spinner />
    {:else}
      <div class="prompt">
        <pre>{prompt}</pre>
      </div>
      <Button appearance="primary" on:click={copy}>
        <Icon {...iconCopyMajor} />
        <span>{copied ? $_('copied') : $_('copy_prompt')}</span>
      </Button>
    {/if}
  {/if}
</div>

<style lang="scss">
  .agent-prompt {
    display: flex;
    flex-direction: column;
    gap: var(--sm1);
    align-items: flex-start;
  }

  .note {
    margin: 0;
    color: var(--color-fg-base-muted);
  }

  .prompt {
    width: 100%;
    max-height: 24rem;
    overflow: auto;
    border: 1px solid var(--color-border-base);
    border-radius: var(--border-radius-m);
    background: var(--color-bg-base);
  }

  .prompt pre {
    margin: 0;
    padding: var(--sm1);
    font-size: var(--sm1);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
