<script lang="ts">
  import { _ } from 'svelte-i18n';

  import { StringifiedNumberInput } from '@mathesar-component-library';

  export let value: string | null | undefined = undefined;
  export let disabled = false;
  export let onValueChange: ((value: string | null) => void) | undefined =
    undefined;
  export let focusOnMount = false;

  let x: string | null | undefined;
  let y: string | null | undefined;
  /** The value we last read from or wrote to `value`, to leave what's typed */
  let settledValue: string | null | undefined;

  /** A point as PostgreSQL writes it, `(x,y)` */
  function parsePoint(point: string | null | undefined) {
    const match = /^\(([^,]*),([^,]*)\)$/.exec(point?.trim() ?? '');
    return { x: match?.[1]?.trim(), y: match?.[2]?.trim() };
  }

  $: if (value !== settledValue) {
    settledValue = value;
    ({ x, y } = parsePoint(value));
  }

  function handleChange() {
    const hasX = x !== null && x !== undefined && x !== '';
    const hasY = y !== null && y !== undefined && y !== '';
    // A point needs both of its coordinates, so half of one is no point at all
    const point = hasX && hasY ? `(${String(x)},${String(y)})` : null;
    settledValue = point;
    value = point;
    onValueChange?.(point);
  }
</script>

<div class="point-input">
  <div class="coordinate-field">
    <span class="coordinate">{$_('x_coordinate')}</span>
    <StringifiedNumberInput
      {focusOnMount}
      {disabled}
      aria-label={$_('x_coordinate')}
      bind:value={x}
      on:change={handleChange}
      on:blur={handleChange}
    />
  </div>
  <div class="coordinate-field">
    <span class="coordinate">{$_('y_coordinate')}</span>
    <StringifiedNumberInput
      {disabled}
      aria-label={$_('y_coordinate')}
      bind:value={y}
      on:change={handleChange}
      on:blur={handleChange}
    />
  </div>
</div>

<style>
  .point-input {
    display: flex;
    align-items: center;
    gap: var(--sm4);
    width: 100%;
  }
  .coordinate-field {
    display: flex;
    align-items: center;
    gap: var(--sm5);
    min-width: 0;
    flex: 1 1 0;
  }
  .coordinate {
    color: var(--color-fg-base-muted);
  }
  .coordinate-field :global(input) {
    min-width: 0;
    width: 100%;
  }
</style>
