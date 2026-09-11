<script lang="ts">
  import NameWithIcon from '@mathesar/components/NameWithIcon.svelte';
  import type { AbstractType } from '@mathesar/stores/abstract-types/types';
  import { Help, Render } from '@mathesar-component-library';
  import type { IconProps } from '@mathesar-component-library/types';

  export let abstractType: AbstractType;
  /** Shown instead of the type's name, e.g. its family's or its kind's */
  export let label: string | undefined = undefined;
  /** Shown instead of the type's icon, e.g. its family's */
  export let icon: IconProps | undefined = undefined;
  /** Whether to show the type's help, which a family standing for several types doesn't */
  export let showHelp = true;

  $: enabledStateInfo = abstractType.getEnabledState?.();
  $: isDisabled = enabledStateInfo ? !enabledStateInfo.enabled : false;
  $: generalHelp = showHelp ? abstractType.getHelpInfo?.() : undefined;
  $: disabledHelp =
    showHelp && enabledStateInfo && !enabledStateInfo.enabled
      ? enabledStateInfo.cause
      : undefined;
</script>

<div class="abstract-type" class:disabled={isDisabled}>
  <NameWithIcon icon={icon ?? abstractType.getIcon()}>
    {label ?? abstractType.name}
  </NameWithIcon>
  {#if generalHelp}
    <span class="help">
      <Help>
        <Render arg={generalHelp} />
      </Help>
    </span>
  {/if}
  {#if disabledHelp}
    <span class="help">
      <Help>
        <Render arg={disabledHelp} />
      </Help>
    </span>
  {/if}
</div>

<style lang="scss">
  .abstract-type {
    display: flex;
    align-items: center;

    .help {
      margin-left: var(--sm5);
    }
  }
</style>
