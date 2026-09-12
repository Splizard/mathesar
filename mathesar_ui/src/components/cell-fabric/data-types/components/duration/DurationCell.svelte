<script lang="ts">
  import type {
    DurationFormatter,
    DurationSpecification,
  } from '@mathesar/utils/duration';

  import SteppedInputCell from '../SteppedInputCell.svelte';
  import type { TextBoxCellProps } from '../typeDefinitions';

  import DurationInput from './DurationInput.svelte';

  type $$Props = TextBoxCellProps & {
    formatter: DurationFormatter;
    specification: DurationSpecification;
    formatValue?: (
      value: string | null | undefined,
    ) => string | null | undefined;
  };

  export let isActive: $$Props['isActive'];
  export let value: $$Props['value'] = undefined;
  export let setValue: (newValue: $$Props['value']) => void;
  export let disabled: $$Props['disabled'];
  export let searchValue: $$Props['searchValue'] = undefined;
  export let isIndependentOfSheet: $$Props['isIndependentOfSheet'];
  export let showTruncationPopover: $$Props['showTruncationPopover'] = false;
  export let formatter: $$Props['formatter'];
  export let specification: $$Props['specification'];
  export let formatValue: $$Props['formatValue'] = undefined;
</script>

<SteppedInputCell
  {value}
  {setValue}
  {isActive}
  {disabled}
  {searchValue}
  {isIndependentOfSheet}
  {showTruncationPopover}
  {formatValue}
  highlightSubstringMatches={false}
  useTabularNumbers={true}
  let:handleInputBlur
  let:setValueInEditMode
  on:movementKeyDown
  on:mouseenter
>
  <DurationInput
    focusOnMount={true}
    {disabled}
    {formatter}
    {specification}
    value={typeof value === 'string' ? value : undefined}
    on:blur={handleInputBlur}
    on:artificialInput={({ detail }) => setValueInEditMode(detail)}
  />
</SteppedInputCell>
