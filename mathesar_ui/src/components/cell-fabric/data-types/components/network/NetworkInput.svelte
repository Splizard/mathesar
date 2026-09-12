<script lang="ts">
  import { _ } from 'svelte-i18n';

  import { api } from '@mathesar/api/rpc';
  import { iconAddNew } from '@mathesar/icons';
  import { isIpAddress, isMacAddress } from '@mathesar/utils/ipAddress';
  import {
    Button,
    Icon,
    TextInput,
    Tooltip,
  } from '@mathesar-component-library';

  export let value: string | null | undefined = undefined;
  export let disabled = false;
  export let onValueChange: ((value: string) => void) | undefined = undefined;
  /** MAC addresses are written differently, and aren't the caller's own */
  export let holdsMacAddress = false;
  export let focusOnMount = false;

  let isFetchingOwnAddress = false;

  $: isValid =
    value === null ||
    value === undefined ||
    value === '' ||
    (holdsMacAddress ? isMacAddress(value) : isIpAddress(value));

  async function useOwnAddress() {
    isFetchingOwnAddress = true;
    try {
      const address = await api.users.current_ip_address().run();
      if (address) {
        value = address;
        onValueChange?.(address);
      }
    } catch {
      // The address isn't known, so there's nothing to fill in
    } finally {
      isFetchingOwnAddress = false;
    }
  }
</script>

<div class="network-input">
  <TextInput
    {focusOnMount}
    {disabled}
    {value}
    {onValueChange}
    hasError={!isValid}
    aria-invalid={!isValid}
    on:blur
    on:focus
    on:input
    on:change
    on:keydown
  />
  {#if !holdsMacAddress && !disabled}
    <Tooltip>
      <div slot="trigger">
        <Button
          appearance="secondary"
          size="small"
          disabled={isFetchingOwnAddress}
          on:click={useOwnAddress}
        >
          <Icon {...iconAddNew} />
          <span>{$_('my_ip_address')}</span>
        </Button>
      </div>
      <span slot="content">{$_('my_ip_address_help')}</span>
    </Tooltip>
  {/if}
</div>
{#if !isValid}
  <div class="invalid">
    {holdsMacAddress ? $_('invalid_mac_address') : $_('invalid_ip_address')}
  </div>
{/if}

<style>
  .network-input {
    display: flex;
    align-items: center;
    gap: var(--sm4);
    width: 100%;
  }
  .network-input :global(input) {
    flex: 1 1 auto;
    min-width: 0;
  }
  .invalid {
    color: var(--color-fg-error);
    font-size: var(--sm1);
    padding: var(--sm5) 0 0 0;
  }
</style>
