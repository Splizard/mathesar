<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';

  import { RichText } from '@mathesar/components/rich-text';
  import { DB_TYPES } from '@mathesar/stores/abstract-types/dbTypes';
  import { confirm } from '@mathesar/stores/confirmation';
  import type {
    ColumnsDataStore,
    ConstraintsDataStore,
    ProcessedColumn,
  } from '@mathesar/stores/table-data';
  import { toast } from '@mathesar/stores/toast';
  import { getErrorMessage } from '@mathesar/utils/errors';
  import {
    Checkbox,
    Help,
    Icon,
    LabeledInput,
    iconLoading,
  } from '@mathesar-component-library';

  export let column: ProcessedColumn;
  export let columnsDataStore: ColumnsDataStore;
  export let constraintsDataStore: ConstraintsDataStore;
  export let currentRoleOwnsTable: boolean;

  let isRequestingToggleAllowNull = false;
  let isRequestingToggleAllowDuplicates = false;
  let isRequestingToggleSingleLine = false;

  const dispatch = createEventDispatcher();

  $: allowsNull = column.column.nullable;
  $: ({ uniqueColumns } = constraintsDataStore);
  $: allowsDuplicates = !(
    column.column.primary_key || $uniqueColumns.has(column.column.id)
  );
  // `character` blank-pads to its length, so it is single-line already and a
  // trim check on it would never fire: there is nothing to offer.
  $: isSingleLineApplicable =
    column.abstractType.cellInfo?.type === 'string' &&
    column.column.type !== DB_TYPES.CHARACTER;
  $: isSingleLine = $constraintsDataStore.constraints.some(
    (c) =>
      c.type === 'check' &&
      c.pattern === 'text_box' &&
      c.columns.length === 1 &&
      c.columns.includes(column.column.id),
  );

  /**
   * Trimming a value's surroundings keeps what it says, so it can be offered.
   * Removing a line break doesn't, so those rows are reported and left for
   * someone to decide about.
   */
  async function offerToRepair() {
    const columnName = column.column.name;
    const { violations, repairable } =
      await constraintsDataStore.checkPatternViolations(
        column.column,
        'text_box',
      );
    if (repairable === 0) {
      toast.error(
        $_('single_line_values_need_fixing', {
          values: { columnName, violations },
        }),
      );
      return;
    }
    const confirmed = await confirm({
      title: $_('single_line_offer_to_trim', {
        values: { columnName, violations, repairable },
      }),
      proceedButton: { label: $_('trim_and_restrict') },
    });
    if (!confirmed) return;

    const repaired = await constraintsDataStore.repairCheckPattern(
      column.column,
      'text_box',
    );
    const remaining = violations - repaired;
    if (remaining > 0) {
      toast.error(
        $_('single_line_some_need_fixing', {
          values: { columnName, repaired, remaining },
        }),
      );
      return;
    }
    await constraintsDataStore.setCheckPatternOfColumn(
      column.column,
      'text_box',
      true,
    );
    toast.success($_('column_will_be_single_line', { values: { columnName } }));
    dispatch('close');
  }

  async function toggleAllowNull() {
    isRequestingToggleAllowNull = true;
    try {
      const newAllowsNull = !allowsNull;
      await columnsDataStore.setNullabilityOfColumn(
        column.column,
        newAllowsNull,
      );
      const msg = newAllowsNull
        ? $_('column_will_allow_null', {
            values: {
              columnName: column.column.name,
            },
          })
        : $_('column_will_not_allow_null', {
            values: {
              columnName: column.column.name,
            },
          });
      toast.success(msg);
      dispatch('close');
    } catch (error) {
      const errorInfo = $_('unable_to_update_allow_null_column', {
        values: {
          columnName: column.column.name,
        },
      });
      toast.error(`${errorInfo} ${getErrorMessage(error)}.`);
    } finally {
      isRequestingToggleAllowNull = false;
    }
  }

  async function toggleSingleLine() {
    isRequestingToggleSingleLine = true;
    try {
      const newIsSingleLine = !isSingleLine;
      await constraintsDataStore.setCheckPatternOfColumn(
        column.column,
        'text_box',
        newIsSingleLine,
      );
      toast.success(
        newIsSingleLine
          ? $_('column_will_be_single_line', {
              values: { columnName: column.column.name },
            })
          : $_('column_will_not_be_single_line', {
              values: { columnName: column.column.name },
            }),
      );
      dispatch('close');
    } catch (error) {
      // A check violation means the column already holds values the constraint
      // forbids. Rather than pass the database's wording along, find out how
      // many and how much of it can be put right.
      const message = getErrorMessage(error);
      if (!/check constraint|23514/i.test(message)) {
        toast.error(
          `${$_('unable_to_update_single_line_column', {
            values: { columnName: column.column.name },
          })} ${message}.`,
        );
        return;
      }
      await offerToRepair();
    } finally {
      isRequestingToggleSingleLine = false;
    }
  }

  async function toggleAllowDuplicates() {
    isRequestingToggleAllowDuplicates = true;
    try {
      const newAllowsDuplicates = !allowsDuplicates;
      await constraintsDataStore.setUniquenessOfColumn(
        column.column,
        !newAllowsDuplicates,
      );
      const msg = newAllowsDuplicates
        ? $_('column_will_allow_duplicates', {
            values: {
              columnName: column.column.name,
            },
          })
        : $_('column_will_not_allow_duplicates', {
            values: {
              columnName: column.column.name,
            },
          });
      toast.success(msg);
      dispatch('close');
    } catch (error) {
      const errorInfo = $_('unable_to_update_allow_duplicates_column', {
        values: {
          columnName: column.column.name,
        },
      });
      toast.error(`${errorInfo} ${getErrorMessage(error)}.`);
    } finally {
      isRequestingToggleAllowDuplicates = false;
    }
  }
</script>

<div class="column-options">
  <LabeledInput layout="inline-input-first">
    <span slot="label">
      {$_('restrict_to_unique')}
      <Help>
        {$_('restrict_to_unique_help')}
      </Help>
    </span>

    {#if isRequestingToggleAllowDuplicates}
      <Icon class="opt" {...iconLoading} />
    {:else}
      <Checkbox
        disabled={isRequestingToggleAllowDuplicates || !currentRoleOwnsTable}
        checked={!allowsDuplicates}
        on:change={toggleAllowDuplicates}
      />
    {/if}
  </LabeledInput>

  {#if isSingleLineApplicable}
    <LabeledInput layout="inline-input-first">
      <span slot="label">
        {$_('restrict_to_single_line')}
        <Help>
          {$_('restrict_to_single_line_help')}
        </Help>
      </span>

      {#if isRequestingToggleSingleLine}
        <Icon class="opt" {...iconLoading} />
      {:else}
        <Checkbox
          disabled={isRequestingToggleSingleLine || !currentRoleOwnsTable}
          checked={isSingleLine}
          on:change={toggleSingleLine}
        />
      {/if}
    </LabeledInput>
  {/if}

  <LabeledInput layout="inline-input-first">
    <span slot="label">
      <RichText text={$_('disallow_null_values')} let:slotName>
        {#if slotName === 'null'}
          <span class="null">NULL</span>
        {/if}
      </RichText>
      <Help>
        {$_('disallow_null_values_help')}
      </Help>
    </span>
    {#if isRequestingToggleAllowNull}
      <Icon class="opt" {...iconLoading} />
    {:else}
      <Checkbox
        disabled={isRequestingToggleAllowNull || !currentRoleOwnsTable}
        checked={!allowsNull}
        on:change={toggleAllowNull}
      />
    {/if}
  </LabeledInput>
</div>

<style lang="scss">
  .column-options {
    padding: 0.5rem 0;
    display: flex;
    flex-direction: column;

    > :global(* + *) {
      margin-top: 0.5rem;
    }

    .null {
      font-style: italic;
      color: var(--color-fg-base-muted);
    }
  }
</style>
