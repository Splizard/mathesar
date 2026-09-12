<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { _ } from 'svelte-i18n';

  import focusTrap from '@mathesar/component-library/common/actions/focusTrap';
  import portal from '@mathesar/component-library/common/actions/portal';
  import { Button, Icon, iconClose } from '@mathesar-component-library';

  import BreadcrumbItemUi from './BreadcrumbItem.svelte';
  import type { BreadcrumbItem } from './breadcrumbTypes';
  import DatabaseSelector from './DatabaseSelector.svelte';

  export let isOpen = false;
  export let items: BreadcrumbItem[];

  function close() {
    isOpen = false;
  }

  /**
   * Shut the drawer once somebody has gone somewhere.
   *
   * Listened for here rather than put on each link, because the links are inside the breadcrumb's
   * own components. A click on anything else -- the button that opens a list of tables, say --
   * leaves the drawer alone, that list having nowhere to appear if its drawer closes under it.
   */
  function closeOnceSomewhereElse(node: HTMLElement, onLeave: () => void) {
    const handle = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('a')) onLeave();
    };
    node.addEventListener('click', handle);
    return { destroy: () => node.removeEventListener('click', handle) };
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && isOpen) close();
  }
</script>

<svelte:window on:keydown={onKeydown} />

{#if isOpen}
  <div class="navigation-drawer" use:portal>
    <div
      class="scrim"
      on:click={close}
      in:fade={{ duration: 150 }}
      out:fade|local={{ duration: 150 }}
    />
    <aside
      class="panel"
      use:focusTrap
      in:fly={{ x: -320, duration: 200 }}
      out:fly|local={{ x: -320, duration: 200 }}
    >
      <div class="top">
        <span class="heading">{$_('navigation')}</span>
        <Button
          appearance="plain"
          aria-label={$_('close_navigation')}
          on:click={close}
        >
          <Icon {...iconClose} />
        </Button>
      </div>
      <nav use:closeOnceSomewhereElse={close}>
        <div class="row">
          <span class="what">{$_('databases')}</span>
          <DatabaseSelector />
        </div>
        {#each items as item}
          <div class="row"><BreadcrumbItemUi {item} /></div>
        {/each}
      </nav>
    </aside>
  </div>
{/if}

<style lang="scss">
  .navigation-drawer {
    position: fixed;
    inset: 0;
    /* The same layer a modal is on, so that the lists these rows open -- which are put on the
    page from elsewhere, and cannot be told what is in front of them -- come out in front. */
    z-index: var(--modal-z-index, 2);
  }

  .scrim {
    position: absolute;
    inset: 0;
    background: color-mix(in srgb, var(--color-shadow), transparent 40%);
  }

  .panel {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: min(20rem, 85vw);
    display: grid;
    grid-template: auto 1fr / 1fr;
    background: var(--color-bg-base);
    border-right: 1px solid var(--color-border-base);
    box-shadow: var(--color-shadow) 2px 0 12px 0;
    color: var(--color-fg-base);
    overflow: hidden;
  }

  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sm2);
    padding: var(--sm2) var(--sm1);
    border-bottom: 1px solid var(--color-border-base);
  }

  .heading {
    font-weight: var(--font-weight-bold);
  }

  nav {
    --breadcrumb-spacing: var(--sm3);
    overflow-y: auto;
    padding: var(--sm2) 0;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sm2);
    padding: var(--sm2) var(--sm1);
    min-width: 0;
  }

  .row + .row {
    border-top: 1px solid var(--color-border-base);
  }

  .what {
    color: var(--color-fg-base-muted);
    font-size: var(--sm1);
  }
</style>
