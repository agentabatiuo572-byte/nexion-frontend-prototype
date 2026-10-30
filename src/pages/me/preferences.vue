<!--
  Preferences (ported from Nexion-prototype/app/(main)/me/preferences/page.tsx).
  Two toggle blocks: interface sound, and per-kind notification mute filters.
  State persists via the preferences store. Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <view class="message-family" style="padding-bottom: 24px">
      <SubPageHeader back="/pages/me/me" />
      <!-- #ifdef APP-PLUS -->
      <view class="mx-4" style="margin-bottom: 20px" data-testid="system-notifications">
        <text class="block" :style="headingStyle">{{ pushCopy.title }}</text>
        <view class="nx-glass-card" :style="cardStyle">
          <view class="push-settings-row" role="button" tabindex="0" :aria-label="nativePushPermission === 'unknown' ? pushCopy.enable : pushCopy.settings" @click="managePushPermission" @keydown.enter.prevent="managePushPermission" @keydown.space.prevent="managePushPermission">
            <view class="push-settings-icon" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
            </view>
            <text class="push-settings-status">{{ pushCopy[nativePushPermission] }}</text>
            <text class="push-settings-action">{{ nativePushPermission === 'unknown' ? pushCopy.enable : pushCopy.settings }}</text>
            <text class="push-settings-chevron" aria-hidden="true">›</text>
          </view>
        </view>
        <text v-if="pushSettingsFailed" class="block mx-1" :style="footerStyle" role="alert">{{ pushCopy.settingsFailed }}</text>
        <view v-if="nativePushRegistrationUnavailable" class="mx-1" role="status" aria-live="polite">
          <text class="block" :style="footerStyle">{{ pushCopy.connectionUnavailable }}</text>
          <view class="family-control family-control--text" role="button" tabindex="0" :aria-label="t.ui.retry" @click="refreshNativePush" @keydown.enter.prevent="refreshNativePush" @keydown.space.prevent="refreshNativePush"><text>{{ t.ui.retry }}</text></view>
        </view>
      </view>
      <!-- #endif -->
      <view v-if="prefs.error" class="mx-4 nx-inline-recovery" style="margin-bottom: 12px; color: var(--v5-danger);" data-testid="notification-preferences-error">
        <text class="nx-inline-recovery__copy">{{ preferenceError }}</text>
        <view class="family-control family-control--text nx-inline-recovery__action" role="button" tabindex="0" :aria-label="t.ui.retry" @click="prefs.refreshRemote()">
          <text>{{ t.ui.retry }}</text>
        </view>
      </view>

      <!-- Sound -->
      <view class="mx-4">
        <text class="block" :style="headingStyle">{{ w.feedbackHeading }}</text>
        <view class="nx-glass-card" :style="cardStyle">
          <ToggleRow :label="w.soundLabel" :hint="w.soundHint" :value="prefs.soundEnabled" last @toggle="prefs.toggleSound">
            <template #icon>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" /><path d="M16 9a5 5 0 0 1 0 6" /><path d="M19.364 18.364a9 9 0 0 0 0-12.728" /></svg>
            </template>
          </ToggleRow>
        </view>
      </view>

      <!-- Notification kinds -->
      <view class="mx-4" style="margin-top: 20px">
        <text class="block" :style="headingStyle">{{ w.notifHeading }}</text>
        <text v-if="!prefs.remoteReady && !prefs.error" class="block" role="status" aria-live="polite">{{ w.loading }}</text>
        <view class="nx-glass-card" :style="cardStyle">
          <ToggleRow
            v-for="(k, i) in notifKinds"
            :key="k"
            :label="w.notifKinds[k]"
            :value="prefs.remoteReady ? prefs.notifPrefs[k] : null"
            :unknown-label="t.uiChrome.unavailable"
            :last="i === notifKinds.length - 1"
            @toggle="prefs.toggleNotifKind(k)"
          >
            <template #icon>
              <view :style="dotStyle(k)" />
            </template>
          </ToggleRow>
        </view>
        <text class="block mx-1" :style="footerStyle">{{ w.notifFooter }}</text>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import ToggleRow from "@/components/me/preference-toggle-row.vue";
import { useT } from "@/i18n/use-t";
import { isMandatoryNotifKind, usePreferences, type NotifKind } from "@/store/preferences";
// #ifdef APP-PLUS
import { onShow } from "@dcloudio/uni-app";
import { nativePushPermission, nativePushRegistrationUnavailable, openNativePushSettings, requestNativePushPermission, refreshNativePush } from "@/services/native-push";
import { nativePushCopy } from "@/i18n/native-push";
import { useLocaleStore } from "@/store/locale";
const pushLocale = useLocaleStore();
const pushSettingsFailed = ref(false);
const pushCopy = computed(() => nativePushCopy[pushLocale.code === 'zh' || pushLocale.code === 'vi' ? pushLocale.code : 'en']);
function managePushPermission() {
  pushSettingsFailed.value = false;
  if (nativePushPermission.value === 'unknown') void requestNativePushPermission();
  else openNativePushSettings(() => { pushSettingsFailed.value = true; });
}
// #endif

const t = useT();
const w = computed(() => t.value.preferences);
const prefs = usePreferences();
// #ifdef APP-PLUS
onShow(() => refreshNativePush());
// #endif
const preferenceError = computed(() => {
  const labels = t.value.preferences as typeof t.value.preferences & Record<"updateFailed" | "unavailable", string>;
  return prefs.error === "updateFailed" ? labels.updateFailed : labels.unavailable;
});

// Mandatory kinds cannot be switched off, so they are not listed.
const notifKinds = (["commission", "team", "market", "genesis", "system"] as NotifKind[]).filter(k => !isMandatoryNotifKind(k));
const NOTIF_COLOR: Record<NotifKind, string> = {
  commission: "var(--v5-brand)",
  team: "var(--v5-tech-cyan)",
  staking: "var(--v5-brand)",
  market: "var(--v5-warning)",
  genesis: "var(--v5-brand-2)",
  system: "var(--v5-tech-cyan)",
};

function dotStyle(k: NotifKind): CSSProperties {
  return { width: "8px", height: "8px", borderRadius: "999px", background: NOTIF_COLOR[k] };
}

// Section label (de-card spec): 15/600/ink, sentence-case, sits above the group.
const headingStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "var(--ui-type-section)",
  fontWeight: 600,
  letterSpacing: "-0.012em",
  color: "var(--v5-ink)",
  marginBottom: "12px",
  paddingLeft: "2px",
};
// Settings group (form b): single surface container, no border — the toggle rows
// carry their own internal hairline dividers (PreferenceToggleRow `last` prop).
const cardStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  borderRadius: "var(--nx-glass-radius)",
  background: "var(--nx-glass-fill)",
  overflow: "hidden",
};
const footerStyle: CSSProperties = {
  marginTop: "8px",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
  lineHeight: 1.625,
};


</script>

<style src="@/styles/message-family.css"></style>

<style scoped>
.push-settings-row { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 12px 14px; cursor: pointer; }
.push-settings-row:active { opacity: .75; }
.push-settings-icon { display: grid; place-items: center; flex-shrink: 0; width: 28px; height: 28px; border-radius: 6px; background: var(--v5-surface-2); color: var(--v5-brand); }
.push-settings-status { flex: 1; min-width: 0; font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-3); }
.push-settings-action { max-width: 48%; font-size: var(--ui-type-list-subtitle); color: var(--v5-brand); text-align: right; }
.push-settings-chevron { flex-shrink: 0; color: var(--v5-ink-4); }
</style>
