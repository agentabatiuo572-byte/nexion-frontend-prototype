<template>
  <AppChassis active="me">
    <SubPageHeader back="/pages/me/wallet" :title="t.bankWithdrawal.chooseMethod" />
    <view class="withdraw-methods">
      <text class="intro">{{ t.bankWithdrawal.chooseMethodHint }}</text>
      <view class="method" role="button" tabindex="0" data-testid="withdraw-method-usdt" :aria-disabled="!canOpenUsdt" @click="openUsdt" @keydown.enter.prevent="openUsdt" @keydown.space.prevent="openUsdt">
        <view class="method-icon" aria-hidden="true"><text>₮</text></view>
        <view class="method-copy"><text class="method-title">USDT</text><text class="method-note">{{ pending ? t.bankWithdrawal.resumeUsdt : t.bankWithdrawal.usdtMethodHint }}</text></view>
        <text aria-hidden="true">›</text>
      </view>
      <view class="method" role="button" tabindex="0" data-testid="withdraw-method-bank" :aria-disabled="!canOpenBank" @click="openBank" @keydown.enter.prevent="openBank" @keydown.space.prevent="openBank">
        <view class="method-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m3 9 9-6 9 6H3Zm2 0v10m7-10v10m7-10v10M3 21h18" /></svg></view>
        <view class="method-copy"><text class="method-title">{{ t.bankWithdrawal.bankMethod }}</text><text class="method-note">{{ bankIntent ? t.bankWithdrawal.resumeBank : bankUnavailable ? t.bankWithdrawal.unavailable : t.bankWithdrawal.bankMethodHint }}</text></view>
        <text v-if="canOpenBank" aria-hidden="true">›</text>
      </view>
      <text v-if="pending" class="intro" role="status">{{ t.bankWithdrawal.resumeUsdt }}</text>
      <text v-else-if="checking" class="intro" role="status">{{ t.bankWithdrawal.loading }}</text>
      <text v-else-if="!recoveryKnown" class="intro" role="status">{{ t.bankWithdrawal.recoveryUnavailable }}</text>
      <text v-else-if="bankIntent" class="intro" role="status">{{ t.bankWithdrawal.resumeBank }}</text>
      <view v-if="!checking && !recoveryKnown" class="method" role="button" tabindex="0" @click="load" @keydown.enter.prevent="load" @keydown.space.prevent="load"><text>{{ t.bankWithdrawal.reload }}</text></view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { onShow, onHide, onUnload } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { useApp } from "@/store/app";
import { readWithdrawAttempt } from "@/lib/withdraw-attempt";
import { navTo } from "@/lib/route";
import { apiClient } from "@/api/runtime";
import { createBankWithdrawalApi } from "@/api/bank-withdrawal-api";
import { captureRuntimeRevision, isCurrentRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";

const t = useT(), app = useApp();
const pending = ref(readWithdrawAttempt(app.accountKey));
const checking = ref(false), recoveryKnown = ref(false), bankIntent = ref(false);
const bankEnabled = ref(false);
let revision = 0, visible = false;
const canOpenUsdt = computed(() => !!pending.value || (!checking.value && recoveryKnown.value && !bankIntent.value));
const bankUnavailable = computed(() => recoveryKnown.value && !bankIntent.value && !bankEnabled.value);
const canOpenBank = computed(() => !pending.value && !checking.value && !bankUnavailable.value);
async function load() {
  const currentRevision = ++revision, account = app.accountKey, epoch = app.accountBindingEpoch, runtime = captureRuntimeRevision();
  const current = () => visible && currentRevision === revision && account === app.accountKey && epoch === app.accountBindingEpoch && isCurrentRuntimeRevision(runtime);
  pending.value = readWithdrawAttempt(account); checking.value = true; recoveryKnown.value = false; bankIntent.value = false; bankEnabled.value = false;
  try {
    const config = await createBankWithdrawalApi(apiClient).config(); if (!current()) return;
    recoveryKnown.value = config.unresolvedIntent !== undefined; bankIntent.value = !!config.unresolvedIntent; bankEnabled.value = config.enabled;
  } catch { /* Keep new withdrawals closed; original bank requests remain reachable. */ }
  finally { if (current()) checking.value = false; }
}
function reset() { revision++; recoveryKnown.value = false; bankIntent.value = false; pending.value = readWithdrawAttempt(app.accountKey); if (visible) void load(); }
watch(() => [app.accountKey, app.accountBindingEpoch] as const, reset);
const stopRuntime = subscribeRuntimeRevision(reset);
onShow(() => { visible = true; void load(); });
onHide(() => { visible = false; revision++; });
onUnload(() => { visible = false; revision++; stopRuntime(); });
function openUsdt() { if (canOpenUsdt.value) navTo("/pages/me/wallet-withdraw"); }
function openBank() {
  pending.value = readWithdrawAttempt(app.accountKey);
  if (canOpenBank.value) navTo("/pages/me/wallet-withdraw-bank");
}
</script>

<style scoped>
.withdraw-methods { padding: 0 20px 32px; color: var(--v5-ink); }
.intro { display: block; margin-bottom: 20px; color: var(--v5-ink-3); font-size: 13px; line-height: 1.6; }
.method { display: flex; align-items: center; gap: 14px; min-height: 80px; padding: 16px 0; border-bottom: 1px solid var(--v5-border); cursor: pointer; }
.method-icon { display: grid; place-items: center; width: 44px; height: 44px; flex-shrink: 0; border-radius: 12px; color: var(--v5-brand); background: color-mix(in srgb, var(--v5-brand) 10%, transparent); font-size: 26px; }
.method-copy { flex: 1; min-width: 0; }
.method-title { display: block; font-size: 15px; font-weight: 600; }
.method-note { display: block; margin-top: 5px; color: var(--v5-ink-3); font-size: 13px; line-height: 1.5; }
.method[aria-disabled="true"] { opacity: .5; cursor: default; }
.method:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
</style>
