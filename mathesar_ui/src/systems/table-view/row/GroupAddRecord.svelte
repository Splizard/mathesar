<script lang="ts">
  import { _ } from 'svelte-i18n';

  import { SheetPositionableCell } from '@mathesar/components/sheet';
  import { iconAddNew } from '@mathesar/icons';
  import { Icon } from '@mathesar-component-library';

  export let columnCount: number;
  export let onAdd: () => Promise<void>;

  let isAdding = false;

  async function add() {
    if (isAdding) return;
    isAdding = true;
    try {
      await onAdd();
    } finally {
      isAdding = false;
    }
  }
</script>

<SheetPositionableCell index={0} columnSpan={columnCount + 1}>
  <div class="group-add-record">
    <button
      type="button"
      class="add"
      disabled={isAdding}
      on:mousedown|stopPropagation
      on:click={add}
    >
      <Icon {...iconAddNew} />
      <span>{$_('new_record')}</span>
    </button>
  </div>
</SheetPositionableCell>

<style lang="scss">
  .group-add-record {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--color-border-grid);
    background: var(--cell-bg-color-base);
  }
  .add {
    position: sticky;
    left: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--sm4);
    height: 100%;
    padding: 0 var(--sm2);
    border: none;
    background: none;
    color: var(--color-fg-subtle-1);
    font-size: var(--sm1);
    cursor: pointer;

    &:hover:not(:disabled),
    &:focus-visible {
      color: var(--color-fg-link);
    }
    &:disabled {
      cursor: progress;
      opacity: 0.6;
    }
  }
</style>
