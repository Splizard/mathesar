<script lang="ts">
  import SteppedInputCell from '../SteppedInputCell.svelte';
  import type { TextBoxCellProps } from '../typeDefinitions';

  import NetworkInput from './NetworkInput.svelte';

  type $$Props = TextBoxCellProps & { holdsMacAddress?: boolean };

  export let isActive: $$Props['isActive'];
  export let value: $$Props['value'] = undefined;
  export let setValue: (newValue: $$Props['value']) => void;
  export let disabled: $$Props['disabled'];
  export let searchValue: $$Props['searchValue'] = undefined;
  export let isIndependentOfSheet: $$Props['isIndependentOfSheet'];
  export let showTruncationPopover: $$Props['showTruncationPopover'] = false;
  export let holdsMacAddress = false;
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
  <NetworkInput
    focusOnMount={true}
    {disabled}
    {holdsMacAddress}
    value={typeof value === 'string' ? value : undefined}
    onValueChange={setValueInEditMode}
    on:blur={handleInputBlur}
  />
</SteppedInputCell>
