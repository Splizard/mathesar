<script lang="ts">
  import { _ } from 'svelte-i18n';

  import { TextArea } from '@mathesar-component-library';

  import {
    type Formula,
    type FormulaTableColumn,
    formulaFunctions,
    parseFormula,
    unparseFormula,
  } from './formula';

  /** The columns the formula can be about */
  export let columns: FormulaTableColumn[];
  /** The formula as it reads now, or undefined while what is typed cannot be read */
  export let formula: Formula | undefined = undefined;
  export let disabled = false;
  /** Whether to say what is wrong, which is unwelcome before anything has been typed */
  export let showProblem = true;

  let text = '';

  /**
   * Set the box from a formula, for one that already exists. Not reactive on the formula: the
   * formula is what this component answers with, so watching it would have the box rewriting
   * itself from its own reading as somebody typed.
   */
  export function setFrom(existing: Formula | undefined) {
    text = existing ? unparseFormula(existing, columns) : '';
  }

  $: reading = parseFormula(text, columns);
  $: formula = reading.ok ? reading.formula : undefined;
  $: problem = reading.ok ? undefined : reading.problem;
  // Nothing typed yet is not a mistake worth pointing at.
  $: problemToShow =
    showProblem && problem && problem.code !== 'formula_is_empty'
      ? problem
      : undefined;
</script>

<div class="formula-input">
  <TextArea bind:value={text} {disabled} class="formula-text" rows={2} />

  {#if problemToShow}
    <p class="problem">
      {#if problemToShow.code === 'formula_has_no_such_column'}
        {$_('formula_has_no_such_column', {
          values: { name: problemToShow.name },
        })}
      {:else if problemToShow.code === 'formula_has_no_such_function'}
        {$_('formula_has_no_such_function', {
          values: { name: problemToShow.name },
        })}
      {:else if problemToShow.code === 'formula_does_not_understand'}
        {$_('formula_does_not_understand', {
          values: { text: problemToShow.text },
        })}
      {:else}
        {$_(problemToShow.code)}
      {/if}
    </p>
  {:else}
    <p class="help">
      {$_('formula_help')}
    </p>
  {/if}

  <details>
    <summary>{$_('formula_functions_available')}</summary>
    <p class="functions">{formulaFunctions.join(', ')}</p>
  </details>
</div>

<style lang="scss">
  .formula-input {
    :global(.formula-text) {
      font-family: var(--font-family-mono);
      font-size: var(--sm1);
      width: 100%;
    }
  }

  .problem {
    margin: var(--sm4) 0 0 0;
    font-size: var(--sm1);
    color: var(--color-error);
  }

  .help {
    margin: var(--sm4) 0 0 0;
    font-size: var(--sm1);
    color: var(--color-fg-base-muted);
  }

  details {
    margin-top: var(--sm3);
    font-size: var(--sm1);
    color: var(--color-fg-subtle-1);
  }

  summary {
    cursor: pointer;
  }

  .functions {
    margin: var(--sm4) 0 0 0;
    font-family: var(--font-family-mono);
    font-size: var(--sm2);
    line-height: 1.5;
    word-break: break-word;
  }
</style>
