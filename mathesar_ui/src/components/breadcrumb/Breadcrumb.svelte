<script lang="ts">
  import LogoAndNameWithLink from '@mathesar/components/LogoAndNameWithLink.svelte';
  import SchemaName from '@mathesar/components/SchemaName.svelte';
  import type { Schema } from '@mathesar/models/Schema';
  import { getSchemaPageUrl } from '@mathesar/routes/urls';

  import BreadcrumbItemUi from './BreadcrumbItem.svelte';
  import BreadcrumbLink from './BreadcrumbLink.svelte';
  import type { BreadcrumbItem } from './breadcrumbTypes';
  import DatabaseSelector from './DatabaseSelector.svelte';

  export let items: BreadcrumbItem[];
  /**
   * The schema the page is in, said where the product's name would be. The page names its own
   * table, so the trail after it need only say which database it is.
   */
  export let schema: Schema | undefined = undefined;
  export let compactLayout = false;
</script>

<div class="breadcrumb">
  {#if schema}
    <LogoAndNameWithLink href="/" compactLayout />
    <div class="schema">
      <BreadcrumbLink href={getSchemaPageUrl(schema.database.id, schema.oid)}>
        <SchemaName {schema} />
      </BreadcrumbLink>
    </div>
  {:else}
    <LogoAndNameWithLink href="/" {compactLayout} />
  {/if}
  <DatabaseSelector />
  {#each items as item}
    <BreadcrumbItemUi {item} />
  {/each}
</div>

<style lang="scss">
  .breadcrumb {
    --breadcrumb-spacing: var(--sm6);
    display: flex;
    overflow: hidden;
    align-items: center;
  }

  .schema {
    display: flex;
    align-items: center;
    min-width: 0;
    overflow: hidden;
    font-size: var(--lg2);
  }

  /* It stands where the product's name did, so it is set the way that was. */
  .breadcrumb .schema :global(.breadcrumb-link a) {
    color: var(--color-fg-base);
    font-weight: var(--font-weight-extra-bold);
  }
</style>
