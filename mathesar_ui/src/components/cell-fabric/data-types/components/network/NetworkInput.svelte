<script lang="ts">
  import { _ } from 'svelte-i18n';

  import { api } from '@mathesar/api/rpc';
  import { iconOwnIpAddress } from '@mathesar/icons';
  import { isIpAddress, isMacAddress } from '@mathesar/utils/ipAddress';
  import { Icon, TextInput } from '@mathesar-component-library';

  export let value: string | null | undefined = undefined;
  export let disabled = false;
  export let onValueChange: ((value: string) => void) | undefined = undefined;
  /** MAC addresses are written differently, and aren't the caller's own */
  export let holdsMacAddress = false;
  export let focusOnMount = false;
  /** Whether there's room to say what's wrong, as there is outside a cell */
  export let showMessage = false;

  let isFetchingOwnAddress = false;

  $: isValid =
    value === null ||
    value === undefined ||
    value === '' ||
    (holdsMacAddress ? isMacAddress(value) : isIpAddress(value));
  $: message = holdsMacAddress
    ? $_('invalid_mac_address')
    : $_('invalid_ip_address');

  async function useOwnAddress() {
    if (disabled || isFetchingOwnAddress) return;
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
    title={isValid ? undefined : message}
    on:blur
    on:focus
    on:input
    on:change
    on:keydown
  />
  {#if !holdsMacAddress && !disabled}
    <!--
      The button keeps the focus where it is, so that a cell's input isn't
      blurred out of edit mode before the click lands.
    -->
    <button
      type="button"
      class="own-address passthrough"
      disabled={isFetchingOwnAddress}
      aria-label={$_('my_ip_address')}
      title={$_('my_ip_address_help')}
      on:mousedown|preventDefault
      on:click|stopPropagation={useOwnAddress}
    >
      <Icon {...iconOwnIpAddress} />
    </button>
  {/if}
</div>
{#if !isValid && showMessage}
  <div class="invalid">{message}</div>
{/if}

<style>
  .network-input {
    display: flex;
    align-items: center;
    width: 100%;
    min-width: 0;
  }
  .network-input :global(input) {
    flex: 1 1 auto;
    min-width: 0;
  }
  .own-address {
    flex: 0 0 auto;
    cursor: pointer;
    display: flex;
    align-items: center;
    padding: 0 var(--sm4);
    margin-left: calc(-1 * var(--sm3));
    background: none;
    border: none;
    color: var(--color-fg-base-disabled);
  }
  .own-address:hover {
    color: var(--color-fg-base);
  }
  .invalid {
    color: var(--color-fg-error);
    font-size: var(--sm1);
    padding-top: var(--sm5);
  }
</style>
