<!--
  Session-ended screen. Shown when this carrier's session was signed out,
  deleted, or ops-revoked. SPEC-4 multi-carrier login does not kick just because
  another device signs in. In-flight tasks were already voided + rolled back by
  App.vue's checkSession() before routing here.
-->
<template>
  <StandalonePageShell class="ks-root">
    <view class="ks-card">
      <view class="ks-ic">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect width="14" height="20" x="5" y="2" rx="2" />
          <path d="M12 18h.01" />
          <path d="m2 2 20 20" />
        </svg>
      </view>
      <text class="ks-title">{{ t.session.kickedTitle }}</text>
      <text class="ks-body">{{ bodyText }}</text>

      <view class="ks-note">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          <path d="m9 11 3 3L22 4" />
        </svg>
        <text class="ks-note__t">{{ t.session.kickedTaskNote }}</text>
      </view>
    </view>

    <view class="ks-cta active:scale-[0.98]" role="button" tabindex="0" data-system-chrome-primary @click="reLogin" @keydown.enter.prevent="reLogin" @keydown.space.prevent="reLogin">
      <text class="ks-cta__t">{{ t.session.kickedCta }}</text>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
    </view>
  </StandalonePageShell>
</template>

<script setup lang="ts">
import { computed } from "vue";
import StandalonePageShell from "@/components/device/standalone-page-shell.vue";
import { useT } from "@/i18n/use-t";
import { useSession } from "@/store/session";

const t = useT();
const session = useSession();

const bodyText = computed(() =>
  session.kickedReason === "logged-out"
    ? t.value.session.kickedBodyLoggedOut
    : t.value.session.kickedBodyKicked,
);

function reLogin() {
  // Route to login; a successful sign-in creates a fresh session for this carrier
  // (and resumes mining via App.vue's checkSession).
  uni.reLaunch({ url: "/pages/login/login", fail: () => {} });
}
</script>

<style scoped>
.ks-root {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 24px;
  background: var(--v5-bg);
}
.ks-card {
  border-radius: 20px;
  padding: 28px 22px;
  text-align: center;
  background: var(--v5-surface);
  box-shadow: var(--v5-card-shadow-lift-strong);
}
.ks-ic {
  width: 56px;
  height: 56px;
  margin: 0 auto 16px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in oklab, var(--v5-warning) 14%, transparent);
}
.ks-title {
  display: block;
  font-family: var(--font-v5);
  font-size: 20px;
  font-weight: 600;
  color: var(--v5-ink);
  line-height: 1.25;
}
.ks-body {
  display: block;
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--v5-ink-2);
}
.ks-note {
  margin-top: 18px;
  padding: 12px 14px;
  border-radius: 12px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  text-align: left;
  background: var(--v5-surface-2);
}
.ks-note__t {
  flex: 1;
  font-size: 12px;
  line-height: 1.4;
  color: var(--v5-ink-3);
}
.ks-cta {
  margin-top: 24px;
  height: 52px;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--v5-brand);
  transition: transform 0.15s ease;
}
.ks-cta__t {
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-on-brand);
}
</style>
