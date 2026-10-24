<template>
  <AppChassis active="home"><view class="raffle-page">
    <SubPageHeader back="/pages/events/events?source=legacy" :title="copy.title" />
    <text class="raffle-copy">{{ copy.intro }}</text>
    <text v-if="loading" class="raffle-copy" role="status">{{ copy.loading }}</text>
    <view v-else-if="error" class="nx-glass-card raffle-card" role="alert"><text>{{ copy.error }}</text><view class="raffle-link" role="button" tabindex="0" @click="load" @keydown.enter.prevent="activate($event, load)" @keydown.space.prevent="activate($event, load)"><text>{{ copy.retry }}</text></view></view>
    <template v-else-if="snapshot">
      <view class="raffle-row"><text>{{ copy.available }}</text><text class="raffle-number">{{ snapshot.availableTickets }}</text></view>
      <text v-if="!snapshot.draws.length" class="raffle-copy">{{ copy.empty }}</text>
      <view v-for="draw in snapshot.draws" :key="draw.id" class="nx-glass-card raffle-card">
        <text class="raffle-title">{{ localizedTitle(draw) }}</text>
        <view class="raffle-row"><text>{{ copy.start }}</text><text>{{ displayDeadline(draw.startsAt, language) }}</text></view>
        <view class="raffle-row"><text>{{ copy.draw }}</text><text>{{ displayDeadline(draw.drawAt, language) }}</text></view>
        <text class="raffle-heading">{{ copy.prizes }}</text>
        <view v-for="prize in draw.prizes" :key="prize.id" class="raffle-prize"><text>{{ localizedName(prize) }}</text><text>{{ copy.each }} {{ rewardText(prize) }} · {{ copy.places }} {{ prize.quantity }}</text></view>
        <view class="raffle-row"><text>{{ copy.mine }}</text><text>{{ draw.myEntries }}</text></view>
        <view class="raffle-row"><text>{{ copy.total }}</text><text>{{ draw.totalEntries }}</text></view>
        <template v-if="draw.status === 'DRAWN' || draw.status === 'PROCESSING'">
          <text v-if="draw.status === 'PROCESSING'" class="raffle-copy">{{ copy.processing }}</text>
          <text class="raffle-heading">{{ copy.results }}</text>
          <text v-if="!draw.myResults.length" class="raffle-copy">{{ draw.myEntries ? copy.noPrize : copy.notEntered }}</text>
          <text v-for="result in draw.myResults" :key="result.receiptId" class="raffle-copy">{{ rewardText(result) }} · {{ result.status === 'PAID' ? copy.paid : copy.rewardPending }}</text>
        </template>
        <text v-else-if="now < Date.parse(draw.startsAt)" class="raffle-copy">{{ copy.upcoming }}</text>
        <text v-else-if="now >= Date.parse(draw.drawAt)" class="raffle-copy">{{ copy.settling }}</text>
        <template v-if="entryOpen(draw) || pending[draw.id]">
          <text v-if="pending[draw.id]" class="raffle-copy" role="status">{{ copy.pending }}</text>
          <text v-else class="raffle-copy">{{ copy.spendHint }}</text>
          <view class="raffle-row"><text>{{ copy.tickets }}</text><input class="raffle-input" type="number" :aria-label="copy.tickets + ' · ' + localizedTitle(draw)" :disabled="!!busy || !!pending[draw.id]" :value="pending[draw.id]?.tickets ?? tickets[draw.id] ?? 1" @input="setTickets(draw.id, $event)" /></view>
          <text v-if="!pending[draw.id] && snapshot.availableTickets === 0" class="raffle-copy">{{ copy.noTickets }}</text>
          <view class="raffle-primary" role="button" :tabindex="canEnter(draw) ? 0 : -1" :aria-disabled="!canEnter(draw)" @click="enter(draw)" @keydown.enter.prevent="activate($event, () => enter(draw))" @keydown.space.prevent="activate($event, () => enter(draw))"><text>{{ busy === draw.id ? copy.busy : pending[draw.id] ? copy.retryEntry : copy.enter }}</text></view>
        </template>
        <text v-if="notice[draw.id]" class="raffle-copy" role="status">{{ copy[notice[draw.id]] }}</text>
      </view>
      <view class="raffle-link" role="button" :tabindex="busy ? -1 : 0" :aria-disabled="!!busy" @click="!busy && load()" @keydown.enter.prevent="!busy && activate($event, load)" @keydown.space.prevent="!busy && activate($event, load)"><text>{{ copy.refresh }}</text></view>
    </template>
  </view></AppChassis>
</template>
<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { onShow, onHide } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { apiClient, apiRuntimeConfig } from "@/api/runtime";
import { captureRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";
import { isAmbiguousEnvelopeOutcome } from "@/api/errors";
import { createGenesisRaffleApi, type GenesisRaffleState, type GenesisRaffleDraw, type GenesisRafflePrize } from "@/api/genesis-raffle-api";
import { acquireRaffleEntry, finishRaffleEntry, pendingRaffleEntry, type PendingRaffleEntry } from "@/lib/genesis-raffle-entry";
import { genesisRaffleCopy } from "@/i18n/genesis-raffle";
import { useApp } from "@/store/app";
import { useLocaleStore } from "@/store/locale";
import { displayDeadline } from "@/lib/promotion-display";
import { formatAmount } from "@/lib/amount-display";
const app = useApp(), locale = useLocaleStore(), api = createGenesisRaffleApi(apiClient);
const language = computed(() => locale.code === "zh" || locale.code === "vi" ? locale.code : "en");
const copy = computed(() => genesisRaffleCopy[language.value]);
const snapshot = ref<GenesisRaffleState | null>(null), loading = ref(true), error = ref(false), busy = ref("");
const pending = ref<Record<string, PendingRaffleEntry | null>>({}), tickets = ref<Record<string, string>>({});
const notice = ref<Record<string, "success" | "error" | "pending">>({}), now = ref(Date.now());
let visible = false, generation = 0;
const accountScope = () => `${apiRuntimeConfig.baseUrl}:${app.accountKey}`;
const identity = () => `${accountScope()}:${app.accountBindingEpoch}:${language.value}:${captureRuntimeRevision().epoch}`;
function reset() { generation += 1; snapshot.value = null; pending.value = {}; tickets.value = {}; notice.value = {}; busy.value = ""; }
async function load() {
  if (!visible) return;
  const request = ++generation, scope = identity(), account = accountScope();
  loading.value = true; error.value = false; snapshot.value = null;
  const current = () => visible && request === generation && scope === identity();
  try {
    const value = await api.state();
    if (!current()) return;
    const entries = Object.fromEntries(value.draws.map(draw => [draw.id, pendingRaffleEntry(account, draw.id)]));
    snapshot.value = value; pending.value = entries; now.value = Date.now();
  } catch { if (current()) error.value = true; }
  finally { if (current()) loading.value = false; }
}
function localizedTitle(draw: GenesisRaffleDraw) { return language.value === "zh" ? draw.titleZh : language.value === "vi" ? draw.titleVi : draw.titleEn; }
function localizedName(prize: GenesisRafflePrize) { return language.value === "zh" ? prize.nameZh : language.value === "vi" ? prize.nameVi : prize.nameEn; }
function rewardText(prize: Pick<GenesisRafflePrize, "rewardType" | "amount">) { return `${formatAmount(prize.amount)} ${prize.rewardType === "NEX" ? "UVT" : prize.rewardType === "DEVICE" ? copy.value.device : "USDT"}`; }
function entryOpen(draw: GenesisRaffleDraw) { return draw.status === "OPEN" && now.value >= Date.parse(draw.startsAt) && now.value < Date.parse(draw.drawAt); }
function canEnter(draw: GenesisRaffleDraw) {
  if (busy.value || loading.value || !snapshot.value) return false;
  if (pending.value[draw.id]) return true;
  const count = Number(tickets.value[draw.id] ?? 1);
  return entryOpen(draw) && Number.isSafeInteger(count) && count > 0 && count <= snapshot.value.availableTickets;
}
function setTickets(id: string, event: unknown) {
  const input = event as { detail?: { value?: string }; target?: { value?: string } };
  tickets.value[id] = input.detail?.value ?? input.target?.value ?? "";
}
async function enter(draw: GenesisRaffleDraw) {
  if (!canEnter(draw)) return;
  const scope = identity(), request = generation, account = accountScope();
  const current = () => visible && scope === identity() && request === generation;
  busy.value = draw.id;
  let attempt: PendingRaffleEntry | null = null;
  try {
    attempt = acquireRaffleEntry(account, draw.id, Number(tickets.value[draw.id] ?? 1));
    pending.value[draw.id] = attempt;
    await api.enter(draw.id, attempt.tickets, attempt.key);
    finishRaffleEntry(account, draw.id, attempt.key);
    if (current()) { notice.value[draw.id] = "success"; busy.value = ""; await load(); }
  } catch (cause) {
    const uncertain = isAmbiguousEnvelopeOutcome(cause);
    if (attempt && !uncertain) {
      try { finishRaffleEntry(account, draw.id, attempt.key); }
      catch { /* Keep the persisted attempt for an idempotent retry. */ }
    }
    if (current()) { notice.value[draw.id] = uncertain && attempt ? "pending" : "error"; busy.value = ""; await load(); }
  }
}
function activate(event: KeyboardEvent, action: () => unknown) { if (!event.repeat) void action(); }
onShow(() => { visible = true; void load(); });
onHide(() => { visible = false; reset(); });
watch(() => [app.accountKey, app.accountBindingEpoch, language.value], () => { reset(); void load(); });
const unsubscribe = subscribeRuntimeRevision(() => { reset(); void load(); });
onUnmounted(() => { visible = false; reset(); unsubscribe(); });
</script>
<style scoped>
.raffle-page { padding:0 16px 28px; color:var(--v5-ink); }
.raffle-card { margin-top:14px; padding:16px; border-radius:var(--nx-glass-radius); background:var(--nx-glass-fill); box-shadow:var(--nx-glass-edge); }
.raffle-title { display:block; font-size:18px; font-weight:600; overflow-wrap:anywhere; }
.raffle-copy { display:block; margin-top:10px; font-size:12px; color:var(--v5-ink-3); line-height:1.6; }
.raffle-row, .raffle-prize { display:flex; justify-content:space-between; flex-wrap:wrap; align-items:center; gap:6px 12px; margin-top:12px; font-size:12px; line-height:1.5; }
.raffle-prize { padding:10px 0; border-bottom:1px solid var(--v5-border); }
.raffle-heading { display:block; margin-top:18px; font-size:14px; font-weight:600; }
.raffle-number { font-size:20px; font-weight:600; color:var(--v5-brand); }
.raffle-input { width:92px; padding:7px 10px; border:1px solid var(--v5-border); border-radius:8px; color:var(--v5-ink); }
.raffle-primary, .raffle-link { display:flex; justify-content:center; margin-top:16px; padding:13px; border-radius:24px; font-size:13px; font-weight:600; color:var(--v5-brand); }
.raffle-primary { background:var(--v5-brand); color:var(--v5-on-brand); }
.raffle-primary[aria-disabled="true"] { opacity:0.5; }
</style>
