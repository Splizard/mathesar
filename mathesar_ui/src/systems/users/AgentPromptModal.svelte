<!--
  Hands one of your agents the table you are looking at.

  Nothing is issued here: the prompt tells an agent to reuse the certificate already in its
  place, so this is only for agents that have one. An agent without one is sent to the profile
  page, which is the one place a certificate and its password are shown.
-->
<script lang="ts">
  import { _ } from 'svelte-i18n';

  import type { Table } from '@mathesar/models/Table';
  import {
    ControlledModal,
    type ModalController,
  } from '@mathesar-component-library';

  import AgentPrompt from './AgentPrompt.svelte';

  export let controller: ModalController;
  export let table: Table;
</script>

<ControlledModal {controller} size="large">
  <span slot="title">{$_('add_your_agent')}</span>
  <AgentPrompt {table} />
</ControlledModal>
