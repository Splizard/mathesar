<script lang="ts">
  import {
    Icon,
    Truncate,
    makeStyleStringFromCssVariables,
  } from '@mathesar-component-library';
  import type {
    CssVariablesObj,
    IconProps,
  } from '@mathesar-component-library/types';

  export let title:
    | {
        icon: IconProps;
        name: string;
        description?: string;
      }
    | undefined = undefined;
  export let cssVariables: CssVariablesObj | undefined = undefined;

  $: style = cssVariables
    ? makeStyleStringFromCssVariables(cssVariables)
    : undefined;
</script>

<div class="entity-page-header" {style}>
  {#if title}
    <div class="heading">
      <div class="icon">
        <Icon {...title.icon} class="block" />
      </div>
      <div class="text">
        <h1 class="name">
          <Truncate>{title.name}</Truncate>
        </h1>
        {#if title.description}
          <div class="description">
            <Truncate>{title.description}</Truncate>
          </div>
        {/if}
      </div>
    </div>
  {/if}
  <div class="actions" class:has-right-actions={$$slots['actions-right']}>
    {#if $$slots.default}
      <div class="actions-left">
        <slot />
      </div>
    {/if}
    {#if $$slots['actions-right']}
      <div class="actions-right">
        <slot name="actions-right" />
      </div>
    {/if}
  </div>
</div>

<style lang="scss">
  .entity-page-header {
    position: relative;
    display: flex;
    align-items: center;
    min-height: var(--lg4);
    overflow: hidden;

    .heading {
      display: flex;
      align-items: center;
      overflow: hidden;
      min-width: 10rem;
      max-width: 50%;
      flex-grow: 0;
      flex-shrink: 1;
      min-height: 100%;
      padding: var(--sm2);

      .icon {
        font-size: var(--lg2);
        padding: var(--sm4);
        background: var(--icon-fill-color);
        border-radius: var(--border-radius-l);
        margin-right: var(--sm2);
        color: var(--icon-stroke-color);
      }
      .text {
        overflow: hidden;
      }
      .name {
        font-size: var(--lg3);
        margin: 0;
        font-weight: var(--font-weight-bold);
        overflow: hidden;
        color: var(--color-fg-base);
      }
      .description {
        font-size: var(--sm1);
        color: var(--color-fg-subtle-1);
        overflow: hidden;
      }
    }

    .actions {
      padding: var(--sm3);
      display: flex;
      align-items: center;
      flex-grow: 1;
      margin-left: 0.5rem;

      .actions-left {
        display: flex;
        flex-shrink: 0;

        > :global(* + *) {
          margin-left: var(--sm3);
        }
      }

      &.has-right-actions {
        .actions-left {
          margin-right: var(--lg2);
        }
      }

      &:not(.has-right-actions) {
        .actions-left {
          flex-grow: 1;
        }
      }

      .actions-right {
        margin-left: auto;
        display: grid;
        grid-auto-flow: column;
        align-items: center;
        gap: var(--sm3);
      }
    }

    @media (max-width: 42rem) {
      & :global(.responsive-button-label) {
        display: none;
      }
    }

    /* Where there is not room for the name and every action on one line, squeezing them onto one
    leaves too little room for either: the name gets a third of a narrow screen and the actions
    are crammed into what is left. They get a line each instead.

    The width is the one at which a table stops showing the panes around it, so that a header
    which is still being shown at that size is one that has been asked for.

    .heading has min-height: 100% for the case where it is the only thing on its line and should
    fill the header. Once it is a line of its own that reads as "as tall as both lines", which
    inflates it to the whole header and pushes the actions out of the bottom of it -- so it is
    relaxed here, where the heading's line is its own height and nothing else's. */
    @media (max-width: 820px) {
      flex-wrap: wrap;

      .heading {
        max-width: 100%;
        flex-basis: 100%;
        min-height: 0;
      }

      .actions {
        margin-left: 0;
        min-width: 0;
        /* Rather than be compressed into nothing, on the narrowest screens. */
        overflow-x: auto;
      }

      .actions-left {
        min-width: 0;
      }
    }
  }
</style>
