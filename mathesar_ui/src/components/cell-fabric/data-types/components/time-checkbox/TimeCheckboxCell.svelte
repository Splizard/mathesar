<script lang="ts">
  import CheckboxCell from '../checkbox/CheckboxCell.svelte';
  import type { CellTypeProps } from '../typeDefinitions';

  type $$Props = Omit<CellTypeProps<string>, 'setValue'> & {
    setValue: (newValue: string | null) => void;
    /** The instant to write when the box is ticked, in the column's own form */
    stampNow: () => string;
  };

  /**
   * An instant shown as a tick. The value either side is still the instant, so
   * the column is a timestamp like any other and reads as one everywhere else;
   * only the cell is a checkbox. Ticking writes the moment it was ticked, and
   * unticking clears it.
   */
  export let value: $$Props['value'] = undefined;
  export let setValue: $$Props['setValue'];
  export let stampNow: $$Props['stampNow'];
  export let isActive: $$Props['isActive'];
  export let disabled: $$Props['disabled'];
  export let isProcessing: $$Props['isProcessing'] = false;
  export let isIndependentOfSheet: $$Props['isIndependentOfSheet'] = false;
  export let showTruncationPopover: $$Props['showTruncationPopover'] = false;
  export let canViewLinkedEntities: $$Props['canViewLinkedEntities'] = true;
  export let searchValue: $$Props['searchValue'] = undefined;

  $: checked = value === undefined ? undefined : value !== null;
</script>

<CheckboxCell
  value={checked}
  setValue={(isChecked) => setValue(isChecked ? stampNow() : null)}
  {isActive}
  {disabled}
  {isProcessing}
  {isIndependentOfSheet}
  {showTruncationPopover}
  {canViewLinkedEntities}
  {searchValue}
  on:movementKeyDown
  on:mouseenter
/>
