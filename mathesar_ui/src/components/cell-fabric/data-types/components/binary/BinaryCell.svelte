<script lang="ts">
  import { _ } from 'svelte-i18n';

  import CellValue from '@mathesar/components/CellValue.svelte';
  import { TextInput } from '@mathesar-component-library';

  import SteppedInputCell from '../SteppedInputCell.svelte';
  import type { TextBoxCellProps } from '../typeDefinitions';

  type $$Props = TextBoxCellProps & { holdsBits?: boolean };

  export let isActive: $$Props['isActive'];
  export let value: $$Props['value'] = undefined;
  export let setValue: (newValue: $$Props['value']) => void;
  export let disabled: $$Props['disabled'];
  export let searchValue: $$Props['searchValue'] = undefined;
  export let isIndependentOfSheet: $$Props['isIndependentOfSheet'];
  export let showTruncationPopover: $$Props['showTruncationPopover'] = false;
  /** Bits are counted as they're written; bytes are written as hex */
  export let holdsBits = false;

  /** How much a value holds, which its text says nothing about at a glance */
  function getSize(v: unknown): string | undefined {
    if (typeof v !== 'string' || v === '') return undefined;
    if (holdsBits) return $_('bits_count', { values: { count: v.length } });
    if (!/^\\x[0-9a-fA-F]*$/.test(v)) return undefined;
    return $_('bytes_count', { values: { count: (v.length - 2) / 2 } });
  }

  $: size = getSize(value);
</script>

<SteppedInputCell
  {value}
  {setValue}
  {isActive}
  {disabled}
  {searchValue}
  {isIndependentOfSheet}
  {showTruncationPopover}
  let:handleInputBlur
  let:setValueInEditMode
  on:movementKeyDown
  on:mouseenter
>
  <TextInput
    focusOnMount={true}
    {disabled}
    {value}
    onValueChange={setValueInEditMode}
    on:blur={handleInputBlur}
  />
  <svelte:fragment slot="content" let:matchParts>
    <CellValue {value} {matchParts} />
    {#if size}
      <span class="size">{size}</span>
    {/if}
  </svelte:fragment>
</SteppedInputCell>

<style>
  .size {
    color: var(--color-fg-base-muted);
    margin-left: var(--sm4);
    font-size: var(--sm1);
  }
</style>
