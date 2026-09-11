<script lang="ts">
  import { TextInput } from '@mathesar-component-library';

  export let value: unknown = undefined;
  export let formatValue: (value: unknown) => string;
</script>

<!-- Composite values can't be edited yet -->
<TextInput value={formatValue(value)} disabled />
