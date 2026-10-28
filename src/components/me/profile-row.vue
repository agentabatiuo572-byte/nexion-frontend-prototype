<!--
  ProfileRow — ported from me/page.tsx ProfileRow.
  Strict port of styles-v4.css .profile-row: avatar (56 circle, brand solid) +
  name + account UID with an independent copy action + Joined Nd chip.
  Taps through to /me/profile.
-->
<template>
  <view class="relative">
  <view class="flex items-center active:opacity-90" style="gap: 14px; padding: 4px 0" data-me-action="profile" role="button" tabindex="0" :aria-label="t.me.profile" @click="goProfile" @keydown.enter.prevent="goProfile" @keydown.space.prevent="goProfile">
    <view class="grid place-items-center shrink-0 overflow-hidden" :style="avatarStyle">
      <image v-if="profile.avatarUrl && !avatarFailed" :key="profile.avatarRevision" :src="profile.avatarUrl" mode="aspectFill" style="width: 56px; height: 56px" aria-hidden="true" @error="avatarFailed = true" />
      <text v-else :style="avatarTextStyle">{{ initial }}</text>
    </view>
    <view class="flex-1 min-w-0">
      <text class="block truncate" :style="nameStyle">{{ name }}</text>
      <view style="height: 44px" />
      <view v-if="!remoteApiEnabled" class="flex items-center" style="gap: 6px; margin-top: 6px">
        <view class="inline-flex items-center" :style="joinedChipStyle">
          <text>{{ joinedLabel }}</text>
        </view>
      </view>
    </view>
    <svg class="shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
  </view>
    <ProfileUid style="position: absolute; left: 70px; right: 28px; top: calc(var(--ui-type-profile-lh) + 4px)" />
  </view>
</template>

<script setup lang="ts">
import { navTo } from "@/lib/route";
import { computed, ref, watch, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useApp } from "@/store/app";
import { useProfile } from "@/store/profile";
import { remoteApiEnabled } from "@/api/runtime";
import { displayNickname } from "@/lib/brand-copy";
import ProfileUid from "./profile-uid.vue";

const ONE_DAY_MS = 86400 * 1000;

const t = useT();
const app = useApp();
const profile = useProfile();
const avatarFailed = ref(false);
watch(() => [profile.avatarUrl, profile.avatarRevision], () => { avatarFailed.value = false; });

const name = computed(() => displayNickname(profile.displayName));
// Server mode deliberately never turns its internal user:<id> account key
// into a visible identity. The auth response projects name/phone above; when
// it is unavailable this remains a neutral empty-state avatar.
const initial = computed(() => {
  const source = name.value || (remoteApiEnabled ? profile.phoneE164.replace(/\D/g, "") : app.user.email);
  return source.trim()[0]?.toUpperCase() || "S";
});
const daysJoined = computed(() => Math.max(1, Math.floor((Date.now() - app.user.joinedAt) / ONE_DAY_MS)));
const joinedLabel = computed(() => fmt(t.value.me.profileJoinedDay, { n: daysJoined.value }));

function goProfile() {
  navTo("/pages/me/profile");
}

const avatarStyle: CSSProperties = {
  width: "56px",
  height: "56px",
  borderRadius: "50%",
  background: "var(--v5-brand)",
};
const avatarTextStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "20px",
  color: "var(--v5-on-brand)",
};
const nameStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "var(--ui-type-profile)",
  lineHeight: "var(--ui-type-profile-lh)",
  fontWeight: 600,
  letterSpacing: "-0.018em",
  color: "var(--v5-ink)",
  whiteSpace: "nowrap",
};
const codeTagBase: CSSProperties = {
  gap: "4px",
  padding: "2px 8px",
  borderRadius: "4px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  lineHeight: 1.5,
};
const joinedChipStyle: CSSProperties = {
  ...codeTagBase,
  // 原 surface-2 与页面底同色不可辨(亮色 ΔE 2.2),此 chip 直接坐在页面底上 → 改 L1
  background: "var(--v5-surface)",
  color: "var(--v5-ink-2)",
};
</script>
