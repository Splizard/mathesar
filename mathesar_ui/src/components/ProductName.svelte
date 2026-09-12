<script lang="ts">
  import { staticText } from '@mathesar/i18n/staticText';
</script>

<!--
  @component

  What this build calls itself, in the chrome that speaks for it. The Mathesar
  wordmark stays where the text is about the project rather than the app: the
  credit on a shared form, and the upstream releases on the update page.
-->
<span class="product-name">{staticText.PRODUCT_NAME}</span>

<style>
  .product-name {
    white-space: nowrap;
  }
</style>
