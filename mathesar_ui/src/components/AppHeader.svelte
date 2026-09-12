<script lang="ts">
  import { _ } from 'svelte-i18n';

  import {
    iconCommunityChat,
    iconDatabase,
    iconDocumentation,
    iconDonation,
    iconLogout,
    iconNavigation,
    iconSettingsMajor,
    iconUser,
  } from '@mathesar/icons';
  import {
    ADMIN_URL,
    LOGOUT_URL,
    USER_PROFILE_URL,
    getDatabasePageUrl,
    getDocsLink,
    getMarketingLink,
  } from '@mathesar/routes/urls';
  import { databasesStore } from '@mathesar/stores/databases';
  import { getReleaseDataStoreFromContext } from '@mathesar/stores/releases';
  import { getUserProfileStoreFromContext } from '@mathesar/stores/userProfile';
  import { navigationIsCompact } from '@mathesar/stores/viewport';
  import Feedback from '@mathesar/systems/feedback/Feedback.svelte';
  import { preloadCommonData } from '@mathesar/utils/preloadData';
  import {
    Button,
    DropdownMenu,
    Icon,
    LinkMenuItem,
    MenuDivider,
    MenuHeading,
  } from '@mathesar-component-library';

  import Breadcrumb from './breadcrumb/Breadcrumb.svelte';
  import { getBreadcrumbItemsFromContext } from './breadcrumb/breadcrumbUtils';
  import NavigationDrawer from './breadcrumb/NavigationDrawer.svelte';
  import LogoAndNameWithLink from './LogoAndNameWithLink.svelte';
  import UiThemeSelect from './UiThemeSelect.svelte';

  const commonData = preloadCommonData();
  const userProfile = getUserProfileStoreFromContext();
  const releaseDataStore = getReleaseDataStoreFromContext();
  const breadcrumbItems = getBreadcrumbItemsFromContext();
  const { currentDatabase } = databasesStore;

  function getCompactLayoutThreshold(breadcrumbItemCount: number): number {
    switch (breadcrumbItemCount) {
      case 0:
        return 350;
      case 1:
        return 500;
      case 2:
        return 700;
      case 3:
        return 800;
      default:
        return 900;
    }
  }

  let width = 0;
  let drawerIsOpen = false;

  $: database = $currentDatabase;
  $: upgradable = $releaseDataStore?.value?.upgradeStatus === 'upgradable';
  $: isNormalRoutingContext = commonData.routing_context === 'normal';
  $: compactLayout = width < getCompactLayoutThreshold($breadcrumbItems.length);
</script>

<header class="app-header" bind:clientWidth={width}>
  <div class="left">
    {#if $navigationIsCompact}
      <!-- A trail of names needs room to be read, and a phone held upright has none. The page
      keeps its own name, and the trail is behind the button beside it. -->
      <Button
        appearance="plain"
        class="padding-compact"
        aria-label={$_('open_navigation')}
        aria-expanded={drawerIsOpen}
        on:click={() => {
          drawerIsOpen = true;
        }}
      >
        <Icon {...iconNavigation} />
      </Button>
      <LogoAndNameWithLink href="/" />
    {:else}
      <Breadcrumb items={$breadcrumbItems} {compactLayout} />
    {/if}
  </div>

  {#if isNormalRoutingContext}
    <div class="right">
      <Feedback {compactLayout} />

      {#if $userProfile}
        <DropdownMenu
          triggerAppearance="secondary"
          triggerClass="padding-compact"
          size="small"
          closeOnInnerClick={false}
        >
          <div class="user-switcher" slot="trigger">
            <Icon
              {...iconSettingsMajor}
              hasNotificationDot={upgradable}
              size="1.2rem"
            />
          </div>
          {#if database}
            <MenuHeading>{$_('database')}</MenuHeading>
            <LinkMenuItem
              icon={iconDatabase}
              href={getDatabasePageUrl(database.id)}
            >
              {database.displayName}
            </LinkMenuItem>
            <MenuDivider />
          {/if}

          <MenuHeading>{$_('signed_in_as')}</MenuHeading>
          <LinkMenuItem icon={iconUser} href={USER_PROFILE_URL}>
            {$userProfile.getDisplayName()}
          </LinkMenuItem>

          {#if $userProfile.isMathesarAdmin}
            <LinkMenuItem
              icon={iconSettingsMajor}
              href={ADMIN_URL}
              hasNotificationDot={upgradable}
            >
              {$_('administration')}
            </LinkMenuItem>
          {/if}
          <MenuDivider />

          <MenuHeading>{$_('theme')}</MenuHeading>
          <div class="theme-switcher">
            <UiThemeSelect />
          </div>
          <MenuDivider />

          <MenuHeading>{$_('resources')}</MenuHeading>
          <LinkMenuItem
            icon={iconDocumentation}
            href={getDocsLink('userGuide')}
            tinro-ignore
            target="_blank"
          >
            {$_('user_guide')}
          </LinkMenuItem>
          <LinkMenuItem
            icon={iconCommunityChat}
            href={getMarketingLink('community')}
            tinro-ignore
            target="_blank"
          >
            {$_('community')}
          </LinkMenuItem>
          <LinkMenuItem
            icon={iconDonation}
            href={getMarketingLink('donate')}
            tinro-ignore
            target="_blank"
            --icon-fill-color="var(--color-brand)"
          >
            {$_('donate_to_mathesar')}
          </LinkMenuItem>

          <MenuDivider />

          <LinkMenuItem icon={iconLogout} href={LOGOUT_URL} tinro-ignore>
            {$_('log_out')}
          </LinkMenuItem>
        </DropdownMenu>
      {/if}
    </div>
  {/if}
</header>

<NavigationDrawer bind:isOpen={drawerIsOpen} items={$breadcrumbItems} />

<style lang="scss">
  .app-header {
    display: flex;
    gap: var(--sm4);
    justify-content: space-between;
    padding: 0 0.5rem;
    height: var(--header-height);
    background: linear-gradient(
      to bottom right,
      var(--color-bg-base),
      var(--color-bg-raised-2)
    );
    border-bottom: 1px solid var(--color-border-base);
    box-shadow: var(--color-shadow) 0 1px 3px 0;
    overflow: hidden;
    color: var(--color-fg-base);
    font-size: 1rem;
  }

  .left {
    display: flex;
    align-items: center;
    gap: var(--sm4);
    overflow: hidden;
  }

  .right {
    display: flex;
    align-items: center;
    gap: var(--sm3);
  }

  .theme-switcher {
    padding: 0.5rem;
    margin-top: -0.5rem;
  }

  .user-switcher {
    color: var(--color-fg-base);
    border-radius: var(--border-radius-m);
    display: flex;
    align-items: center;
  }
</style>
