<!--
  Preferences (ported from Nexion-prototype/app/(main)/me/preferences/page.tsx).
  Two toggle blocks: sound + haptics, and per-kind notification mute filters.
  State persists via the preferences store. Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <view style="padding-bottom: 24px">
      <SubPageHeader back="/pages/me/me" />

      <!-- Sound + haptics -->
      <view class="mx-4">
        <text class="block" :style="headingStyle">{{ w.feedbackHeading }}</text>
        <view :style="cardStyle">
          <ToggleRow :label="w.soundLabel" :hint="w.soundHint" :value="prefs.soundEnabled" @toggle="prefs.toggleSound">
            <template #icon>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" /><path d="M16 9a5 5 0 0 1 0 6" /><path d="M19.364 18.364a9 9 0 0 0 0-12.728" /></svg>
            </template>
          </ToggleRow>
          <ToggleRow :label="w.hapticsLabel" :hint="w.hapticsHint" :value="prefs.hapticsEnabled" last @toggle="prefs.toggleHaptics">
            <template #icon>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 8 2 2-2 2 2 2-2 2" /><path d="m22 8-2 2 2 2-2 2 2 2" /><rect width="8" height="14" x="8" y="5" rx="1" /></svg>
            </template>
          </ToggleRow>
        </view>
      </view>

      <!-- Notification kinds -->
      <view class="mx-4" style="margin-top: 20px">
        <text class="block" :style="headingStyle">{{ w.notifHeading }}</text>
        <view :style="cardStyle">
          <ToggleRow
            v-for="(k, i) in notifKinds"
            :key="k"
            :label="w.notifKinds[k]"
            :value="prefs.notifPrefs[k]"
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
import { computed, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import ToggleRow from "@/components/me/preference-toggle-row.vue";
import { useT } from "@/i18n/use-t";
import { usePreferences, type NotifKind } from "@/store/preferences";

const t = useT();
const w = computed(() => t.value.preferences);
const prefs = usePreferences();

const notifKinds: NotifKind[] = ["commission", "team", "staking", "market", "genesis", "system"];
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
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "-0.012em",
  color: "var(--v5-ink)",
  marginBottom: "12px",
  paddingLeft: "2px",
};
// Settings group (form b): single surface container, no border — the toggle rows
// carry their own internal hairline dividers (PreferenceToggleRow `last` prop).
const cardStyle: CSSProperties = {
  borderRadius: "16px",
  background: "var(--v5-surface)",
  overflow: "hidden",
};
const footerStyle: CSSProperties = {
  marginTop: "8px",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
  lineHeight: 1.625,
};
</script>
