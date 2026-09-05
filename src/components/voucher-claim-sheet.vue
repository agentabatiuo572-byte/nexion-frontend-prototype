<!--
  VoucherClaimSheet — chassis-level bottom sheet for claiming 代金券. Surfaced by
  Home auto-push (voucher-claim-sheet store) + manual entry from VoucherBanner.
  Lists claimable + already-claimed-unused vouchers; each card's CTA flips from
  「领取」(claim) to「马上去使用」(use → routes to the SKU detail for a single-SKU
  voucher, else the mall). Mirrors trial-claim-sheet.vue's backdrop + slide-up.
  Zero card chrome on the protected tab pages — this is a chassis overlay.
-->
<template>
  <view v-if="sheet.open" class="vcs-root" role="dialog" aria-modal="true">
    <view class="vcs-backdrop" @click="hide" />

    <view class="vcs-panel" @click.stop>
      <!-- header -->
      <view class="vcs-head">
        <view class="vcs-head-l">
          <view class="vcs-tk-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M13 5v2" /><path d="M13 17v2" /><path d="M13 11v2" /></svg>
          </view>
          <view class="vcs-head-meta">
            <text class="vcs-cap">{{ t.voucher.popupCap }}</text>
            <text class="vcs-title">{{ t.voucher.popupTitle }}</text>
          </view>
        </view>
        <view class="vcs-close" role="button" tabindex="0" :aria-label="t.voucher.closeAria" @click="hide">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </view>
      </view>

      <text class="vcs-sub">{{ t.voucher.popupSubtitle }}</text>

      <!-- voucher cards -->
      <view class="vcs-list">
        <view v-for="v in vouchers" :key="v.id" class="vcs-card">
          <view class="vcs-card-l">
            <text class="vcs-val">{{ valueText(v) }}</text>
            <text v-if="condText(v)" class="vcs-cond">{{ condText(v) }}</text>
          </view>
          <view class="vcs-card-r">
            <text class="vcs-name">{{ v.name }}</text>
            <text class="vcs-scope">{{ scopeText(v) }}</text>
            <text class="vcs-expiry">{{ expiryText(v) }}</text>
            <view
              class="vcs-cta"
              :class="voucher.isClaimed(v.id) ? 'vcs-cta-use' : 'vcs-cta-claim'"
              role="button"
              tabindex="0"
              :aria-label="voucher.isClaimed(v.id) ? t.voucher.useCta : t.voucher.claimCta"
              @click.stop="voucher.isClaimed(v.id) ? onUse(v) : onClaim(v)"
            >
              <text class="vcs-cta-t">{{ voucher.isClaimed(v.id) ? t.voucher.useCta : t.voucher.claimCta }}</text>
              <svg v-if="voucher.isClaimed(v.id)" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
            </view>
          </view>
        </view>
      </view>

      <view class="vcs-dismiss" role="button" tabindex="0" :aria-label="t.voucher.dismissCta" @click="hide">
        <text class="vcs-dismiss-t">{{ t.voucher.dismissCta }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useVoucherClaimSheet } from "@/store/voucher-claim-sheet";
import { useVoucher } from "@/store/voucher";
import { getProduct } from "@/mock/products";
import { isSingleSkuVoucher, listVouchers, type VoucherDef } from "@/mock/vouchers";
import { toast } from "@/store/ui";
import { useT } from "@/i18n/use-t";
import { remoteApiEnabled } from "@/api/runtime";
import { fmt } from "@/i18n/format";
import { navTo } from "@/lib/route";
import { useDialogA11y } from "@/composables/use-dialog-a11y";

const sheet = useVoucherClaimSheet();
const voucher = useVoucher();
const t = useT();

// Showable = claimable (unclaimed) ∪ claimed-unused (ready to use), in stable
// catalog order so a card never jumps position when its CTA flips claim→use.
const vouchers = computed<VoucherDef[]>(() => {
  const showable = new Set<string>([
    ...voucher.claimableVouchers.map((v) => v.id),
    ...voucher.claimedUnused.map((v) => v.id),
  ]);
  return (remoteApiEnabled ? voucher.catalog : listVouchers()).filter((v) => showable.has(v.id));
});

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function valueText(v: VoucherDef): string {
  return v.type === "fixed"
    ? fmt(t.value.voucher.offFixed, { amount: v.amountUSD ?? 0 })
    : fmt(t.value.voucher.offPercent, { percent: v.percent ?? 0 });
}
function condText(v: VoucherDef): string {
  if (v.type === "fixed" && (v.minPurchaseUSD ?? 0) > 0) {
    return fmt(t.value.voucher.condMin, { min: v.minPurchaseUSD ?? 0 });
  }
  if (v.type === "percent" && (v.maxDiscountUSD ?? 0) > 0) {
    return fmt(t.value.voucher.condCap, { cap: v.maxDiscountUSD ?? 0 });
  }
  return "";
}
function scopeText(v: VoucherDef): string {
  if (isSingleSkuVoucher(v)) {
    const name = getProduct(v.applicableSkus[0])?.name ?? v.applicableSkus[0];
    return fmt(t.value.voucher.scopeSingle, { name });
  }
  return t.value.voucher.scopeAll;
}
function expiryText(v: VoucherDef): string {
  return v.endAt === 0 ? t.value.voucher.noExpiry : fmt(t.value.voucher.expiryLabel, { date: formatDate(v.endAt) });
}

function hide() {
  sheet.hide();
}
async function onClaim(v: VoucherDef) {
  if (remoteApiEnabled) {
    if (await voucher.claimRemote(v.id)) toast.success(t.value.voucher.claimedToast);
    else toast.error(t.value.authOtp.errorServiceUnavailable);
    return;
  }
  const r = voucher.claim(v.id);
  if (r.ok) {
    toast.success(t.value.voucher.claimedToast);
  } else if (r.conflict) {
    // 这张券在别处(另一标签页 / 另一端)已经领过,store 已把最新券包刷回来 —— 说清楚,
    // 不能让用户点了没反应。
    toast.warn(t.value.errors.staleTitle, t.value.errors.staleMsg);
  }
}
function onUse(v: VoucherDef) {
  sheet.hide();
  if (isSingleSkuVoucher(v)) {
    // navTo() per project convention (maps /store/detail → /pages/store/detail).
    navTo(`/store/detail?id=${v.applicableSkus[0]}`);
  } else {
    navTo("/store");
  }
}

// 遮罩只拦指针不拦键盘:不接这一层,弹层打开后 Tab 会直接走到背景(那里有花钱的按钮)。
useDialogA11y(computed(() => sheet.open), ".vcs-root", hide);
</script>

<style scoped>
.vcs-root {
  position: fixed;
  inset: 0;
  z-index: 790;
}
.vcs-backdrop {
  position: absolute;
  inset: 0;
  background: var(--v5-bg-color-mask);
  backdrop-filter: blur(8px) saturate(150%);
  -webkit-backdrop-filter: blur(8px) saturate(150%);
  animation: vcs-fade 0.24s ease-out;
}
.vcs-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 800;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  background: var(--v5-surface);
  border-top: 1px solid var(--v5-border);
  padding: 20px 16px;
  padding-bottom: calc(env(safe-area-inset-bottom) + 38px);
  animation: vcs-slide-up 0.36s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes vcs-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes vcs-slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
.vcs-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.vcs-head-l {
  display: flex;
  align-items: center;
  gap: 10px;
}
.vcs-tk-box {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--v5-brand) 14%, transparent);
}
.vcs-head-meta {
  display: flex;
  flex-direction: column;
}
.vcs-cap {
  font-size: 12px;
  font-family: var(--font-jet-mono), monospace;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--v5-brand);
}
.vcs-title {
  font-family: var(--font-v5);
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-ink);
  margin-top: 2px;
  line-height: 1.25;
}
.vcs-close {
  /* 《07》tap≥44 —— 与本弹层主/次 CTA 同批修(原 36 漏改) */
  width: 44px;
  height: 44px;
  border-radius: 999px;
  background: var(--v5-surface-2);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition: background 0.12s ease;
}
.vcs-close:active {
  background: var(--v5-surface-3);
}
.vcs-sub {
  display: block;
  margin-top: 10px;
  font-size: 13px;
  color: var(--v5-ink-3);
  line-height: 1.5;
}
.vcs-list {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.vcs-card {
  display: flex;
  align-items: stretch;
  gap: 14px;
  border-radius: 16px;
  padding: 14px;
  background: color-mix(in srgb, var(--v5-brand) 6%, var(--v5-surface-2));
}
.vcs-card-l {
  flex-shrink: 0;
  width: 104px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
  border-right: 1px dashed color-mix(in srgb, var(--v5-brand) 32%, transparent);
  padding-right: 12px;
}
.vcs-val {
  font-family: var(--font-v5);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.1;
  color: var(--v5-brand);
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.vcs-cond {
  font-size: 12px;
  color: var(--v5-ink-4);
  text-align: center;
  line-height: 1.3;
}
.vcs-card-r {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.vcs-name {
  font-family: var(--font-v5);
  font-size: 13px;
  font-weight: 600;
  color: var(--v5-ink);
  line-height: 1.3;
}
.vcs-scope {
  font-size: 12px;
  color: var(--v5-ink-3);
  margin-top: 3px;
  line-height: 1.35;
}
.vcs-expiry {
  font-size: 12px;
  font-family: var(--font-jet-mono), monospace;
  color: var(--v5-ink-4);
  margin-top: 2px;
}
.vcs-cta {
  /* 主人 2026-08-16:CTA 落卡片右下角,与上方文字块拉开,不挤在一起 */
  margin-top: 14px;
  align-self: flex-end;
  /* 《07》tap≥44 + 转化场景主 CTA 权重必须压过 dismiss(原 34px 比满宽 40px
     的 dismiss 还矮,视觉权重倒挂) */
  min-height: 44px;
  padding: 0 16px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.12s ease, opacity 0.12s ease;
}
.vcs-cta:active {
  transform: scale(0.97);
  opacity: 0.92;
}
.vcs-cta-claim {
  background: var(--v5-brand);
}
.vcs-cta-use {
  background: var(--v5-brand);
  box-shadow: 0 0 20px color-mix(in srgb, var(--v5-brand) 22%, transparent);
}
.vcs-cta-t {
  font-family: var(--font-v5);
  /* 《02》§2 button.m 15/20/600 */
  font-size: 15px;
  line-height: 20px;
  font-weight: 600;
  color: var(--v5-on-brand);
}
.vcs-dismiss {
  margin-top: 16px;
  width: 100%;
  /* tap≥44;弱化靠 ghost 文字(无填充 + 400 + ink-3),不靠缩小热区 */
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.12s ease;
}
.vcs-dismiss:active {
  opacity: 0.7;
}
.vcs-dismiss-t {
  /* 《02》§4:用户需读懂才能决策 → body.s 13 而非 caption 12 */
  font-size: 13px;
  line-height: 18px;
  font-weight: 400;
  color: var(--v5-ink-3);
}
</style>
