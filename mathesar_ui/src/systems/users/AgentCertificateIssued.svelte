<!--
  What comes back the one time an agent is issued a certificate.

  Three things, and the order is the point: the bundle to download, the password that opens
  it, and the instructions to hand to the agent. The password is shown here and nowhere else
  ever again -- nothing on the appliance keeps a copy -- so this panel says so plainly rather
  than letting somebody close it and find out later.

  The password is deliberately absent from the instructions. Those get pasted into an agent's
  context, and from there into a transcript and a log; a password that has been through one
  is spent. So the person carries it across themselves, once.
-->
<script lang="ts">
  import { _ } from 'svelte-i18n';

  import type { AgentCertificate } from '@mathesar/api/rpc/users';
  import WarningBox from '@mathesar/components/message-boxes/WarningBox.svelte';
  import { iconCopyMajor, iconDownload } from '@mathesar/icons';
  import { Button, Icon } from '@mathesar-component-library';

  export let certificate: AgentCertificate;

  let copied: string | undefined = undefined;

  /** The base64 the server sent, as something the browser will save to disk. */
  function bundleHref(base64: string): string {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(
      new Blob([bytes], { type: 'application/x-pkcs12' }),
    );
  }

  async function copy(what: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = what;
      setTimeout(() => {
        if (copied === what) copied = undefined;
      }, 2000);
    } catch {
      // Clipboard refused, which some browsers do outside a trusted gesture. The text is
      // on screen and selectable, so there is nothing to recover from.
    }
  }

  $: href = bundleHref(certificate.bundle);
</script>

<div class="issued">
  <WarningBox>{$_('certificate_shown_once')}</WarningBox>

  <section>
    <h3>{$_('certificate_step_download')}</h3>
    <a class="download" {href} download={certificate.filename}>
      <Icon {...iconDownload} />
      <span>{certificate.filename}</span>
    </a>
  </section>

  <section>
    <h3>{$_('certificate_step_password')}</h3>
    <p class="note">{$_('certificate_password_help')}</p>
    <div class="secret">
      <code>{certificate.password}</code>
      <Button
        appearance="secondary"
        on:click={() => copy('password', certificate.password)}
      >
        <Icon {...iconCopyMajor} />
        <span>
          {copied === 'password' ? $_('copied') : $_('copy')}
        </span>
      </Button>
    </div>
  </section>

  <section>
    <h3>{$_('certificate_step_prompt')}</h3>
    <p class="note">{$_('certificate_prompt_help')}</p>
    <div class="prompt">
      <pre>{certificate.prompt}</pre>
    </div>
    <Button
      appearance="primary"
      on:click={() => copy('prompt', certificate.prompt)}
    >
      <Icon {...iconCopyMajor} />
      <span>
        {copied === 'prompt' ? $_('copied') : $_('copy_setup_instructions')}
      </span>
    </Button>
  </section>
</div>

<style lang="scss">
  .issued {
    display: flex;
    flex-direction: column;
    gap: var(--lg1);
    padding: var(--lg1);
    border: 1px solid var(--color-border-base);
    border-radius: var(--border-radius-m);
    background: var(--color-bg-raised-1);
  }

  section {
    display: flex;
    flex-direction: column;
    gap: var(--sm3);
    align-items: flex-start;
  }

  h3 {
    margin: 0;
    font-size: var(--sm1);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-fg-base-muted);
  }

  .note {
    margin: 0;
    color: var(--color-fg-base-muted);
  }

  .download {
    display: inline-flex;
    align-items: center;
    gap: var(--sm3);
    padding: var(--sm3) var(--sm1);
    border: 1px solid var(--color-border-base);
    border-radius: var(--border-radius-m);
    background: var(--color-bg-base);
    text-decoration: none;
    color: var(--color-fg-base);
  }

  .secret {
    display: flex;
    align-items: center;
    gap: var(--sm2);
    flex-wrap: wrap;
  }

  .secret code {
    padding: var(--sm4) var(--sm2);
    border-radius: var(--border-radius-s);
    background: var(--color-bg-raised-2);
    font-size: 1rem;
    user-select: all;
    overflow-wrap: anywhere;
  }

  .prompt {
    width: 100%;
    max-height: 18rem;
    overflow: auto;
    border: 1px solid var(--color-border-base);
    border-radius: var(--border-radius-m);
    background: var(--color-bg-base);
  }

  .prompt pre {
    margin: 0;
    padding: var(--sm1);
    font-size: var(--sm1);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
