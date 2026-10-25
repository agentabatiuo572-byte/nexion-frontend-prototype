<template>
  <view class="invite-scan" :class="{ 'invite-scan--shortcut': shortcut }">
    <view class="invite-scan__button" role="button" tabindex="0" :aria-disabled="busy || disabled" :aria-label="label || t.inviteScan.open" :aria-busy="busy" @click="scan" @keydown.enter.prevent="scan" @keydown.space.prevent="scan">
      <slot :busy="busy"><text>{{ busy ? t.inviteScan.scanning : (label || t.inviteScan.open) }}</text></slot>
    </view>
    <text v-if="error && !shortcut" class="invite-scan__error" role="alert">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from "vue";
import { onUnload } from "@/composables/use-tab-page-lifecycle";
import { useT } from "@/i18n/use-t";
import { useAuth } from "@/store/auth";
import { useConfig } from "@/store/config";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { buildShareLink } from "@/lib/share";
import { scannedInvitationCode } from "@/lib/invite-scan";
import { navTo } from "@/lib/route";
import { toast } from "@/store/ui";

const props = defineProps<{ disabled?: boolean; shortcut?: boolean; label?: string }>();
const t = useT(), auth = useAuth(), config = useConfig();
const busy = ref(false), error = ref("");
watch(error, value => { if (props.shortcut && value) toast.error(value); });
let alive = true;
function dispose() { alive = false; }
onUnmounted(dispose);
onUnload(dispose);

async function scan() {
  if (!alive || busy.value || props.disabled) return;
  const pages = getCurrentPages(), page = pages[pages.length - 1];
  if (!page) { error.value = t.value.inviteScan.failed; return; }
  const account = captureAccountScope(), accountId = auth.accountId, authenticated = auth.isAuthenticated;
  const current = () => {
    const pages = getCurrentPages();
    return alive && !props.disabled && isCurrentAccountScope(account)
      && accountId === auth.accountId && authenticated === auth.isAuthenticated && pages[pages.length - 1] === page;
  };
  busy.value = true;
  error.value = "";
  try {
    await config.ensureLoaded();
    if (!current()) return;
    if (config.configStatus !== "ready" || !buildShareLink("INVITE")) {
      error.value = t.value.inviteScan.unavailable;
      return;
    }
    const result = await new Promise<string>((resolve, reject) => {
      // #ifdef APP-PLUS
      uni.scanCode({ scanType: ["qrCode"], success: value => resolve(value.result), fail: reject });
      // #endif
    });
    if (!current()) return;
    // Returning from the native camera may refresh public config in App.onShow.
    await config.ensureLoaded();
    if (!current()) return;
    if (config.configStatus !== "ready") { error.value = t.value.inviteScan.unavailable; return; }
    const code = scannedInvitationCode(result, config.config.share.baseUrl);
    if (!code || buildShareLink(code) !== result.trim()) {
      error.value = t.value.inviteScan.invalid;
      return;
    }
    if (!await navTo(`/pages/ref/code?code=${encodeURIComponent(code)}`) && current()) error.value = t.value.inviteScan.failed;
  } catch (failure) {
    if (!current()) return;
    const message = String((failure as { errMsg?: string })?.errMsg ?? "");
    if (/permission|auth.*deny|denied|权限|未授权/i.test(message)) error.value = t.value.inviteScan.permission;
    else if (!/cancel|取消/i.test(message)) error.value = t.value.inviteScan.failed;
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.invite-scan { display: flex; flex-direction: column; gap: 8px; }
.invite-scan__button { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 44px; padding: 10px 16px; border: 1px solid var(--v5-border); border-radius: 12px; background: var(--v5-surface); color: var(--v5-ink); font-size: 15px; line-height: 24px; }
.invite-scan__button[aria-disabled="true"] { opacity: .5; color: var(--v5-ink-3); }
.invite-scan__error { color: var(--v5-ink-2); font-size: 13px; line-height: 20px; }
.invite-scan--shortcut .invite-scan__button { flex-direction: column; justify-content: flex-start; gap: var(--v5-space-2); min-height: 80px; padding: 0; border: 0; background: transparent; }
</style>
