import CompositeInput from './components/composite/CompositeInput.svelte';
import { formatComposite } from './components/composite/formatComposite';
import SteppedInputCell from './components/SteppedInputCell.svelte';
import type { CellColumnLike, CellComponentFactory } from './typeDefinitions';

function formatterFor(column: CellColumnLike) {
  const fieldOrder = column.type_options?.composite_fields?.map((f) => f.name);
  return (value: unknown) => formatComposite(value, fieldOrder);
}

/**
 * A composite value shown as its fields, without editing them, for where the
 * cells of its fields can't be: within an array, for one.
 */
const compositeReadOnlyType: CellComponentFactory = {
  initialInputValue: null,
  get: (column) => ({
    component: SteppedInputCell,
    props: { formatValue: formatterFor(column) },
  }),
  getInput: (column) => ({
    component: CompositeInput,
    props: { formatValue: formatterFor(column) },
  }),
  getDisplayFormatter: (column) => formatterFor(column),
};

export default compositeReadOnlyType;
