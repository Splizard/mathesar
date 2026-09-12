<script lang="ts">
  import SteppedInputCell from '../SteppedInputCell.svelte';
  import type { TextBoxCellProps } from '../typeDefinitions';

  import PointInput from './PointInput.svelte';

  type $$Props = TextBoxCellProps;

  export let isActive: $$Props['isActive'];
  export let value: $$Props['value'] = undefined;
  export let setValue: (newValue: $$Props['value']) => void;
  export let disabled: $$Props['disabled'];
  export let searchValue: $$Props['searchValue'] = undefined;
  export let isIndependentOfSheet: $$Props['isIndependentOfSheet'];
</script>

<SteppedInputCell
  {value}
  {setValue}
  {isActive}
  {disabled}
  {searchValue}
  {isIndependentOfSheet}
  let:handleInputBlur
  let:setValueInEditMode
  on:movementKeyDown
  on:mouseenter
>
  <PointInput
    focusOnMount={true}
    {disabled}
    value={typeof value === 'string' ? value : undefined}
    onValueChange={setValueInEditMode}
    on:blur={handleInputBlur}
  />
</SteppedInputCell>
