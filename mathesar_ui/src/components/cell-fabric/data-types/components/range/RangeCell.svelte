<!--
@component

A range, shown as PostgreSQL writes it, with a button to edit its bounds in the
cell inspector.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';

  import CellValue from '@mathesar/components/CellValue.svelte';
  import { iconMoreActions } from '@mathesar/icons';
  import { showTableInspectorTab } from '@mathesar/stores/tableInspector';
  import { Button, Icon } from '@mathesar-component-library';

  import CellWrapper from '../CellWrapper.svelte';
  import type { CellTypeProps } from '../typeDefinitions';

  type $$Props = CellTypeProps<string>;

  const dispatch = createEventDispatcher();

  export let isActive: $$Props['isActive'];
  export let value: $$Props['value'] = undefined;
  export let disabled: $$Props['disabled'];
  export let isIndependentOfSheet: $$Props['isIndependentOfSheet'];

  function handleWrapperKeyDown(e: KeyboardEvent) {
    switch (e.key) {
      case 'Tab':
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowDown':
      case 'ArrowUp':
        dispatch('movementKeyDown', { originalEvent: e, key: e.key });
        break;
      default:
        break;
    }
  }
</script>

<CellWrapper
  {isActive}
  {disabled}
  {isIndependentOfSheet}
  on:mouseenter
  on:keydown={handleWrapperKeyDown}
>
  <div class="range-cell">
    <CellValue {value} />
    {#if isActive && !isIndependentOfSheet}
      <span class="edit">
        <Button
          appearance="secondary"
          size="small"
          {disabled}
          aria-label={$_('edit_bounds')}
          tooltip={$_('edit_bounds_in_inspector')}
          on:click={() => showTableInspectorTab('cell')}
        >
          <Icon {...iconMoreActions} rotate={90} />
        </Button>
      </span>
    {/if}
  </div>
</CellWrapper>

<style lang="scss">
  .range-cell {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sm4);
    overflow: hidden;
    width: 100%;
  }
  .edit {
    flex: 0 0 auto;
  }
</style>
