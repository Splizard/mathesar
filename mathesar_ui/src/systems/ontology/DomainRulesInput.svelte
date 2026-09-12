<script lang="ts">
  import { _ } from 'svelte-i18n';

  import { iconAddNew, iconDeleteMajor } from '@mathesar/icons';
  import {
    Button,
    ButtonMenuItem,
    DropdownMenu,
    Icon,
    TextInput,
  } from '@mathesar-component-library';

  import {
    type DomainRuleEntry,
    type RuleSubject,
    domainRuleKinds,
    getRuleEntriesError,
    getRuleKindsFor,
    isRuleTheDomainHas,
    withRule,
    withRuleValue,
    withoutRule,
  } from './domainRules';

  export let entries: DomainRuleEntry[];
  /** What the rules can be about, which follows from the type it is over */
  export let subject: RuleSubject | undefined = undefined;
  export let disabled = false;

  $: kinds = getRuleKindsFor(subject);
  $: error = getRuleEntriesError(entries);

  function takesAValue(rule: string) {
    return !!domainRuleKinds.find((kind) => kind.rule === rule)?.takes;
  }

  function add(rule: string) {
    entries = withRule(entries, rule);
  }
</script>

<div class="rules">
  {#each entries as entry (entry.key)}
    <div class="rule">
      {#if isRuleTheDomainHas(entry)}
        <!-- A rule the domain already has is what the database says it is, down
        to the wording, since a rule somebody else wrote is theirs and one of
        ours is already exactly what was asked for. -->
        <code>{entry.definition}</code>
      {:else}
        <span class="name">{$_(`domain_rule_${entry.rule}`)}</span>
        {#if takesAValue(entry.rule)}
          <TextInput
            value={entry.value}
            onValueChange={(value) => {
              entries = withRuleValue(entries, entry.key, value);
            }}
            aria-label={$_(`domain_rule_${entry.rule}`)}
            {disabled}
          />
        {/if}
      {/if}
      <Button
        appearance="plain"
        size="small"
        {disabled}
        aria-label={$_('remove')}
        on:click={() => {
          entries = withoutRule(entries, entry.key);
        }}
      >
        <Icon {...iconDeleteMajor} />
      </Button>
    </div>
  {/each}
  {#if kinds.length > 0}
    <div class="add">
      <DropdownMenu
        label={$_('add_domain_rule')}
        triggerAppearance="secondary"
        closeOnInnerClick={true}
        {disabled}
      >
        <div slot="trigger">
          <Icon {...iconAddNew} />
          {$_('add_domain_rule')}
        </div>
        {#each kinds as kind (kind.rule)}
          <ButtonMenuItem on:click={() => add(kind.rule)}>
            {$_(`domain_rule_${kind.rule}`)}
          </ButtonMenuItem>
        {/each}
      </DropdownMenu>
    </div>
  {:else if entries.length === 0}
    <p class="none">{$_('domain_takes_no_rules')}</p>
  {/if}
  {#if error}
    <p class="error">{$_(error)}</p>
  {/if}
</div>

<style lang="scss">
  .rules {
    display: grid;
    gap: var(--sm4);
  }
  .rule {
    display: flex;
    align-items: center;
    gap: var(--sm4);
  }
  .rule > :global(.input-element) {
    flex: 1 1 auto;
    min-width: 0;
  }
  code {
    flex: 1 1 auto;
    min-width: 0;
    font-size: var(--sm2);
    word-break: break-word;
  }
  .name {
    font-size: var(--sm1);
    white-space: nowrap;
  }
  .add {
    justify-self: start;
  }
  .none,
  .error {
    margin: 0;
    font-size: var(--sm1);
  }
  .none {
    color: var(--color-fg-base-muted);
  }
  .error {
    color: var(--color-fg-error);
  }
</style>
