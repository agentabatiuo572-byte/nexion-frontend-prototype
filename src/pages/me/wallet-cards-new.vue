<!--
  Bind new bank card — ported from
  Nexion-prototype/app/(main)/me/wallet/cards/new/page.tsx.
  Form: PAN (auto-formatted + brand detect) / expiry / CVV / holder + "set as
  default" toggle. On submit: validate, derive brand + last4, persist via
  useCards.add() (PAN/CVV NEVER stored), navigate back to the cards list.

  Development cards only exercise the server-owned bind/default/unbind lifecycle;
  they are not offered as a checkout rail. The free trial remains cardless.
  useSearchParams → onLoad(query). safeReturnTo → inline relative-path guard
  (open-redirect defense). <input type=checkbox> → custom tap toggle (uni).
  router.push(returnTo) → uni.redirectTo. Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <BankAccountBinding v-if="!cardBindingAvailable" :active="bankFormVisible" :return-to="returnTo" />
    <view v-else style="color: var(--v5-ink)">
      <SubPageHeader :back="cardBindingAvailable ? '/pages/me/wallet-cards' : '/pages/me/wallet'" :title="t.cards.newTitle" />
      <CardSimulationBadge />

      <view :style="bodyStyle">
        <!-- Form card -->
        <view :style="formCardStyle">
          <view class="flex items-center" :style="formHeadStyle">
            <view class="grid place-items-center shrink-0" :style="formHeadIconStyle">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2" /><path d="M2 10h20" /></svg>
            </view>
            <view class="flex-1 min-w-0">
              <text class="block" :style="formHeadTitleStyle">{{ t.cards.formCardType }}</text>
              <view class="flex items-center" :style="formHeadNoteStyle">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                <text style="margin-left: 6px">{{ cardBindingAvailable ? t.cards.formSecurityNote : t.cards.bindingEntryNote }}</text>
              </view>
            </view>
            <text v-if="brand !== 'unknown'" class="font-mono-tabular shrink-0" :style="brandChipStyle">{{ brandLabel(brand) }}</text>
          </view>

          <!-- 开发态卡号/有效期/CVV 归 <HostedCardVault> 页面内存管理；
               持卡人姓名是展示信息，照旧由本页收。 -->
          <HostedCardVault ref="vaultRef" @change="onCardChange">
          <view :style="formFieldsStyle">
            <view>
              <text class="block" :style="labelStyle">{{ t.cards.formPanLabel }}</text>
              <HostedCardField kind="pan" class="font-mono-tabular tabular-nums" :input-style="[inputStyle, { letterSpacing: '0.05em' }]" placeholder="1234 5678 9012 3456" :aria-label="t.cards.formPanLabel" />
            </view>
            <view class="grid grid-cols-2" style="gap: 8px">
              <view>
                <text class="block" :style="labelStyle">{{ t.cards.formExpiryLabel }}</text>
                <HostedCardField kind="expiry" class="font-mono-tabular tabular-nums w-full" :input-style="inputStyle" placeholder="MM/YY" :aria-label="t.cards.formExpiryLabel" />
              </view>
              <view>
                <text class="block" :style="labelStyle">{{ t.cards.formCvvLabel }}</text>
                <HostedCardField kind="cvv" class="font-mono-tabular tabular-nums w-full" :input-style="inputStyle" placeholder="123" :aria-label="t.cards.formCvvLabel" />
              </view>
            </view>
            <view>
              <text class="block" :style="labelStyle">{{ t.cards.formHolderLabel }}</text>
              <input class="w-full" :style="[inputStyle, { textTransform: 'uppercase' }]" type="text" :value="holder" :placeholder="t.cards.formHolderPlaceholder" :aria-label="t.cards.formHolderLabel" @input="onHolder" />
            </view>

            <checkbox-group @change="onDefaultGroupChange">
              <label
                class="flex items-center active:opacity-70"
                style="margin-top: 4px; gap: 8px; min-height: 44px"
                role="switch"
                tabindex="0"
                :aria-label="t.cards.formDefaultCheckbox"
                :aria-checked="setAsDefault ? 'true' : 'false'"
              >
                <checkbox value="default" :checked="setAsDefault" color="var(--v5-brand)" style="transform: scale(0.82); transform-origin: left center" />
                <text :style="checkboxLabelStyle">{{ t.cards.formDefaultCheckbox }}</text>
                <text class="font-mono-tabular" :style="checkboxStateStyle">{{ defaultStateLabel }}</text>
              </label>
            </checkbox-group>
          </view>
          </HostedCardVault>
        </view>

        <!-- Submit -->
        <!-- 字段没填全时点了没用 → 显式 aria-disabled(《05》§6.1),别只靠「没有按下反馈」暗示 -->
        <view class="grid place-items-center" :class="{ 'active:scale-[0.98]': canSubmit }" :style="submitStyle" role="button" tabindex="0" data-testid="card-bind-submit" :aria-disabled="canSubmit ? 'false' : 'true'" :aria-label="canSubmit ? t.cards.formSubmit : t.cards.formSubmitDisabled" @click.stop="handleBind" @keydown.enter.prevent="handleBind" @keydown.space.prevent="handleBind">
          <text :style="submitTextStyle">{{ canSubmit ? t.cards.formSubmit : t.cards.formSubmitDisabled }}</text>
        </view>

        <text class="block" :style="disclaimerStyle">{{ cardBindingAvailable ? t.cards.formDisclaimer : t.cards.bindingEntryDisclaimer }}</text>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from "vue";
import { onLoad, onShow, onHide, onUnload } from "@dcloudio/uni-app";
import { navReplace, navBack } from "@/lib/route";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import BankAccountBinding from "@/components/me/bank-account-binding.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { toast } from "@/store/ui";
import { useCards, brandLabel } from "@/store/cards";
import CardSimulationBadge from "@/components/me/card-simulation-badge.vue";
import type { CardBrand } from "@/store/cards-core";
import HostedCardVault from "@/components/me/hosted-card-vault.vue";
import HostedCardField from "@/components/me/hosted-card-field.vue";
import { useQuest } from "@/store/quest";
import { postMoneyBillsOnce, type ReceiptDraft } from "@/lib/money-receipt";
import { paymentMethodApi, remoteApiEnabled, developmentPaymentEnabled } from "@/api/runtime";
import { useApp } from "@/store/app";
import { subscribeRuntimeRevision } from "@/api/order-api";

const t = useT();
const cardsStore = useCards();
const app = useApp();
const cardBindingAvailable = computed(() => !remoteApiEnabled || developmentPaymentEnabled);
const bankFormVisible = ref(true);
// Native App sends page onHide when opening the SMS app. Preserve the in-memory
// challenge and pending request then; actual page navigation still clears them.
let appInBackground = false;
const bankAppHide = () => { appInBackground = true; };
const bankAppShow = () => { appInBackground = false; };
uni.onAppHide(bankAppHide);
uni.onAppShow(bankAppShow);
onShow(() => { bankFormVisible.value = true; });
onHide(() => { if (!appInBackground) bankFormVisible.value = false; });

// Query (onLoad — page-level): ?returnTo=<relative path> for post-bind
// navigation (open-redirect guarded). Initialize from the H5 URL hash query
// FIRST (covers direct deep-link / refresh, and the case where onLoad doesn't
// re-fire on a hash-only change to an already-mounted page instance). onLoad
// then overrides for the uni.navigateTo path (App + in-SPA nav). (P-044)
const initialQ = parseHashQuery();
const returnTo = ref(safeReturnTo(initialQ.returnTo, "/pages/me/wallet-cards"));
onLoad((q) => {
  if (q?.returnTo !== undefined) returnTo.value = safeReturnTo(q.returnTo, "/pages/me/wallet-cards");
});

// H5-only hash query parser (App has no window; try/catch returns {}).
function parseHashQuery(): Record<string, string> {
  try {
    const h = (typeof window !== "undefined" && window.location?.hash) || "";
    const qi = h.indexOf("?");
    if (qi < 0) return {};
    const out: Record<string, string> = {};
    new URLSearchParams(h.slice(qi + 1)).forEach((v, k) => { out[k] = v; });
    return out;
  } catch {
    return {};
  }
}
// Open-redirect defense: only accept relative app paths starting with `/pages/`.
function safeReturnTo(raw: string | undefined, fallback: string): string {
  if (raw && raw.startsWith("/pages/")) return raw;
  return fallback;
}

// 开发态卡号 / CVV 只在 <HostedCardVault> 的页面内存中用于生成模拟 token，
// 本页只收到 ready 与 brand；绑定命令仅发送 token、后四位与有效期等非明文字段。
const vaultRef = ref<InstanceType<typeof HostedCardVault> | null>(null);
const cardReady = ref(false);
const brand = ref<CardBrand>("unknown");
function onCardChange(e: { ready: boolean; brand: CardBrand }) {
  cardReady.value = e.ready;
  brand.value = e.brand;
}
const holder = ref("");
const setAsDefault = ref(true);
const isBinding = ref(false);

// Opening the original form does not enable the legacy development payment rail.
// Sensitive draft fields live only in this page and clear on leave/account/runtime change.
function clearForm() {
  vaultRef.value?.clear(); holder.value = ""; cardReady.value = false; brand.value = "unknown";
  setAsDefault.value = true; isBinding.value = false;
}
watch(() => [app.accountKey, app.accountBindingEpoch] as const, clearForm);
const stopCardRuntime = subscribeRuntimeRevision(clearForm);
onHide(clearForm);
onUnload(() => {
  uni.offAppHide(bankAppHide); uni.offAppShow(bankAppShow);
  stopCardRuntime(); clearForm();
});

// uni input event → e.detail.value (typed Event; mirrors topup-card-form).
function detailVal(e: Event): string {
  return (e as unknown as { detail: { value: string } }).detail.value;
}
function onHolder(e: Event) {
  holder.value = detailVal(e);
}
function onDefaultGroupChange(e: Event) {
  const value = (e as unknown as { detail: { value: string[] } }).detail.value;
  setAsDefault.value = value.includes("default");
}

function returnFromUnavailable() {
  navBack(returnTo.value);
}

const validHolder = computed(() => holder.value.trim().length >= 2);
const valid = computed(() => cardReady.value && validHolder.value);
const canSubmit = computed(() => valid.value && !isBinding.value);
const defaultStateLabel = computed(() => (setAsDefault.value ? t.value.cards.formDefaultOn : t.value.cards.formDefaultOff));

async function handleBind() {
  if (!canSubmit.value) return;
  if (!cardBindingAvailable.value) {
    toast.error(t.value.cards.bindingConnectionPending);
    return;
  }
  // 当前开发态由 <HostedCardVault> 在浏览器内存中生成模拟 token；没有真实 PSP。
  // 本页拿到 token / 后四位 / 卡组织 / 有效期，再加持卡人姓名发送给 Java。
  // 卡号与 CVV 不在请求或 SavedCard 模型中，不会发送到后端或写入数据库。
  const card = vaultRef.value?.tokenize();
  if (!card) return;
  isBinding.value = true;
  if (remoteApiEnabled) {
    // The remote binder returns a server receipt; the local cards store only
    // projects the subsequent authoritative GET and never persists this card.
    try {
      const bound = await paymentMethodApi.bind({ providerToken: card.token, source: card.source, brand: card.brand, last4: card.last4,
        expiry: card.expiry, holder: holder.value.trim().toUpperCase(), makeDefault: setAsDefault.value,
        idempotencyKey: `h3-card-bind:${card.token}` });
      if (!await cardsStore.refreshRemote()) throw new Error("CARD_BIND_READBACK_FAILED");
      const readBack = cardsStore.cards.find((item) => item.tokenId === bound.tokenId
        && item.brand === bound.brand && item.last4 === bound.last4);
      if (bound.status !== "BOUND" || readBack?.status !== "BOUND") throw new Error("CARD_BIND_READBACK_MISMATCH");
    } catch {
      isBinding.value = false;
      toast.error(t.value.authOtp.errorServiceUnavailable);
      return;
    }
    toast.success(fmt(t.value.cards.bindToast, { brand: brandLabel(card.brand), last4: card.last4 }));
    navReplace({
      url: returnTo.value,
      fail: () => { isBinding.value = false; navBack(returnTo.value); },
    });
    return;
  }
  const questStore = useQuest();
  const tokenId = cardsStore.add({
    tokenId: card.token,
    brand: card.brand,
    last4: card.last4,
    expiry: card.expiry,
    holder: holder.value.trim().toUpperCase(),
  }, { makeDefault: setAsDefault.value });
  if (setAsDefault.value) cardsStore.setDefault(tokenId);
  // 首日任务 bind_bank_card(server-canonical `card.bound`):quest 只记完成,
  // 入账 + 账单 + toast 在调用层组合(对齐 quest.ts 头注约定,模式同 lib/share.ts)。
  // 幂等 — 非首次绑卡 firstTime=false,只出常规绑卡 toast,不重复发奖。
  // 🔴 与领奖族同一套顺序:先发钱(幂等)→ 后消费资格(2026-08-04 独立验收指出 quest 族
  // 三处漏改)。原来先 markComplete 消费掉,发钱失败奖就归零且再也拿不到。
  const task = questStore.QUEST_TASKS.find((tk) => tk.id === "bind_bank_card");
  if (task && !questStore.isComplete("bind_bank_card")) {
    const billRef = `QST-bind_bank_card`; // 稳定 ref:任务一次性,带时间戳 = 判重永不命中
    // 同一次任务完成的两腿一次落盘,入账由收据的 amount/symbol 派生(模式同 lib/share.ts)。
    const drafts: ReceiptDraft[] = [];
    if (task.usdtReward) drafts.push({ type: "bonus", symbol: "USDT", amount: task.usdtReward, status: "posted", memo: t.value.quest.bindCardMemo, ref: billRef });
    if (task.nexReward) drafts.push({ type: "bonus", symbol: "NEX", amount: task.nexReward, status: "posted", memo: t.value.quest.bindCardMemo, ref: billRef });
    // 发奖失败已弹错并还原;绑卡本身已成立,照常回上一页,不把用户卡在表单里。
    if (!drafts.length || postMoneyBillsOnce(drafts) === "ok") {
      questStore.markComplete("bind_bank_card"); // 消费失败:重试命中同 ref 不会再发
      toast.success(fmt(t.value.quest.routeToast, { n: task.nexReward }));
    }
  } else {
    toast.success(fmt(t.value.cards.bindToast, { brand: brandLabel(card.brand), last4: card.last4 }));
  }
  navReplace({
    url: returnTo.value,
    fail: () => { isBinding.value = false; navBack(returnTo.value); },
  });
}

// ── styles ──
const bodyStyle: CSSProperties = { padding: "0 16px" };
const providerHoldTitleStyle: CSSProperties = { fontSize: "15px", fontWeight: 600, color: "var(--v5-ink)" };
const providerHoldBodyStyle: CSSProperties = { marginTop: "8px", fontSize: "12px", lineHeight: 1.5, color: "var(--v5-ink-3)" };
const providerHoldCtaStyle: CSSProperties = { minHeight: "44px", marginTop: "16px", borderRadius: "999px", background: "var(--v5-surface-2)" };
const providerHoldCtaTextStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-ink-2)" };

// De-carded form wrapper — the head + recessed input fields sit on the page
// floor. Input controls (PAN/expiry/CVV/holder) are untouched; only the
// packaging card drops (owner: form page keeps input structure intact).
const formCardStyle: CSSProperties = {
  marginBottom: "12px",
};
const formHeadStyle: CSSProperties = {
  padding: "0 2px 14px",
  borderBottom: "1px solid color-mix(in srgb, var(--v5-border) 70%, transparent)",
  gap: "12px",
};
const formHeadIconStyle: CSSProperties = {
  width: "36px",
  height: "36px",
  borderRadius: "8px",
  background: "color-mix(in srgb, var(--v5-brand-2) 15%, transparent)",
};
const formHeadTitleStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-ink)" };
const formHeadNoteStyle: CSSProperties = { marginTop: "2px", fontSize: "12px", color: "var(--v5-ink-3)" };
const brandChipStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-ink-2)",
  background: "var(--v5-surface-2)",
  borderRadius: "6px",
  padding: "4px 8px",
};
const formFieldsStyle: CSSProperties = { padding: "16px 2px 0" };
const labelStyle: CSSProperties = { marginBottom: "4px", fontSize: "12px", color: "var(--v5-ink-3)" };
const inputStyle: CSSProperties = {
  // uni <input> renders taller than a native one — pin a fixed 40px box (=
  // prototype px-3 py-2.5 ≈ 40px) with horizontal-only padding + vertical
  // centering so all four fields align to the prototype exactly.
  width: "100%",
  height: "40px",
  background: "var(--v5-surface-2)",
  border: "1px solid var(--v5-border)",
  borderRadius: "8px",
  padding: "0 12px",
  marginBottom: "12px",
  fontSize: "13px",
  color: "var(--v5-ink)",
};
const checkboxLabelStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)" };
const checkboxStateStyle = computed<CSSProperties>(() => ({
  marginLeft: "auto",
  fontSize: "12px",
  fontWeight: 600,
  color: setAsDefault.value ? "var(--v5-brand)" : "var(--v5-ink-4)",
}));

const submitStyle = computed<CSSProperties>(() => ({
  height: "48px",
  borderRadius: "999px",
  background: canSubmit.value ? "var(--v5-brand)" : "var(--v5-surface-2)",
}));
const submitTextStyle = computed<CSSProperties>(() => ({
  fontSize: "13px",
  fontWeight: 600,
  color: canSubmit.value ? "var(--v5-on-brand)" : "var(--v5-ink-4)",
}));
const disclaimerStyle: CSSProperties = { marginTop: "12px", padding: "0 4px", fontSize: "12px", color: "var(--v5-ink-4)", lineHeight: 1.625 };
</script>
