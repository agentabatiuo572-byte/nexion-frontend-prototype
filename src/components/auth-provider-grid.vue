<template>
  <view class="auth-provider-grid" :aria-label="t.authOtp.alternativeSignInMethods">
    <view class="auth-provider" data-provider="Passkey" role="button" tabindex="0" :aria-label="ariaLabel('Passkey')" :aria-disabled="busy" @click="activate('Passkey')" @keydown.enter.prevent="activate('Passkey')" @keydown.space.prevent="activate('Passkey')">
      <view class="auth-provider__icon auth-provider__icon--ink">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="10" r="5" /><path d="M13 10h8M17 10v4M20 10v3" /></svg>
      </view>
      <text class="auth-provider__label">Passkey</text>
    </view>

    <view class="auth-provider" data-provider="Google" role="button" tabindex="0" :aria-label="ariaLabel('Google')" :aria-disabled="busy" @click="activate('Google')" @keydown.enter.prevent="activate('Google')" @keydown.space.prevent="activate('Google')">
      <view class="auth-provider__icon">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" /><path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z" /><path fill="#FBBC05" d="M6.39 13.93A6 6 0 0 1 6.08 12c0-.67.11-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.62.39 3.15 1.04 4.55l3.35-2.62Z" /><path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z" /></svg>
      </view>
      <text class="auth-provider__label">Google</text>
    </view>

    <view class="auth-provider" data-provider="Apple" role="button" tabindex="0" :aria-label="ariaLabel('Apple')" :aria-disabled="busy" @click="activate('Apple')" @keydown.enter.prevent="activate('Apple')" @keydown.space.prevent="activate('Apple')">
      <view class="auth-provider__icon auth-provider__icon--ink">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M17.06 12.43c0-2.6 2.13-3.85 2.23-3.91-1.22-1.78-3.11-2.02-3.78-2.04-1.61-.16-3.14.95-3.96.95-.82 0-2.08-.93-3.42-.9-1.76.02-3.38 1.02-4.29 2.6-1.83 3.18-.47 7.88 1.31 10.46.87 1.27 1.91 2.69 3.27 2.64 1.32-.05 1.81-.85 3.41-.85 1.59 0 2.04.85 3.42.82 1.41-.02 2.31-1.29 3.18-2.56 1-1.47 1.41-2.9 1.43-2.97-.03-.02-2.75-1.06-2.79-4.24ZM14.5 4.74c.73-.88 1.21-2.11 1.08-3.33-1.04.04-2.31.69-3.06 1.57-.67.77-1.26 2.02-1.1 3.22 1.16.09 2.34-.59 3.08-1.46Z" /></svg>
      </view>
      <text class="auth-provider__label">Apple</text>
    </view>

    <view class="auth-provider" data-provider="Telegram" role="button" tabindex="0" :aria-label="ariaLabel('Telegram')" :aria-disabled="busy" @click="activate('Telegram')" @keydown.enter.prevent="activate('Telegram')" @keydown.space.prevent="activate('Telegram')">
      <view class="auth-provider__icon">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#229ED9" d="m9.78 16.32-.33 3.68c.48 0 .69-.2.94-.45l2.27-2.17 4.7 3.44c.86.48 1.48.23 1.7-.79l3.08-14.43c.3-1.34-.48-1.87-1.32-1.56L1.6 9.5c-1.3.5-1.29 1.24-.22 1.57L6 12.51l10.73-6.77c.5-.31.97-.14.59.21L9.78 16.32Z" /></svg>
      </view>
      <text class="auth-provider__label">Telegram</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { fmt } from "@/i18n/format";
import { useT } from "@/i18n/use-t";

type AuthProviderLabel = "Passkey" | "Google" | "Apple" | "Telegram";

const t = useT();
const props = withDefaults(defineProps<{ busy?: boolean; development?: boolean }>(), {
  busy: false,
  development: false,
});
const emit = defineEmits<{ (event: "select", provider: AuthProviderLabel): void }>();

function ariaLabel(provider: AuthProviderLabel): string {
  return props.development ? fmt(t.value.authOtp.developmentProviderLabel, { provider }) : provider;
}

function activate(provider: AuthProviderLabel) {
  if (!props.busy) emit("select", provider);
}
</script>

<style scoped>
.auth-provider-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.auth-provider { min-width: 0; height: 64px; border-radius: 16px; background: var(--v5-surface); color: var(--v5-ink-2); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; box-sizing: border-box; transition: transform 0.15s, opacity 0.15s, background-color 0.2s; }
.auth-provider:active { transform: scale(0.98); opacity: 0.8; }
.auth-provider:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; }
.auth-provider[aria-disabled="true"] { opacity: 0.5; }
.auth-provider__icon { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; flex: 0 0 20px; }
.auth-provider__icon--ink { color: var(--v5-ink-2); }
.auth-provider__label { max-width: 100%; padding: 0 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; line-height: 14px; font-weight: 500; color: var(--v5-ink-3); }
</style>
