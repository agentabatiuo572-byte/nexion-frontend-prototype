<!--
  Referral landing (ported from Nexion-prototype/app/ref/[code]/page.tsx).
  Public full-screen entry for users arriving via a shared /ref link. Establishes
  sponsor social proof and the server-authorized offer, then pushes into register
  with the ref code preserved. No chassis (full-bleed, like onboarding). Reads the
  code from `?code=` (the source's dynamic [code] segment). Literal dark hex from
  source mapped to v5 tokens.
-->
<template>
  <StandalonePageShell class="ref-root" :style="rootStyle">
    <view :style="cornerGlowStyle" />

    <view class="relative" style="padding: 16px">
      <!-- Brand -->
      <view class="flex items-center" style="gap: 8px; margin-bottom: 16px">
        <BrandLockup :height="40" />
        <text v-if="hasCode" :style="refChipStyle">REF/{{ codeUpper }}</text>
      </view>

      <!-- [FEAT-SHARE4] 异常2:本机已登录 → 提示条 + CTA 变「进入」,不重复领礼 -->
      <view v-if="authed" :style="alreadyBarStyle">
        <text>{{ rewardEnabled ? t.ref.alreadyBar : t.ref.alreadyBarNoReward }}</text>
      </view>

      <!-- Sponsor hero([FEAT-SHARE4] 异常1:无码/非法码 → 整块隐藏;已登录也隐藏,
           避免「你已注册礼包仅一次」提示条与「X 邀请了你领礼」同屏互相矛盾(审计 P1) -->
      <view v-if="hasCode && !authed" class="nx-glass-card" :style="sponsorCardStyle">
        <view class="flex items-center" style="gap: 12px">
          <view class="grid place-items-center" :style="avatarStyle">
            <text :style="avatarTextStyle">{{ initial }}</text>
          </view>
          <view class="min-w-0" style="flex: 1">
            <view>
              <text :style="sponsorNameStyle">{{ sponsor?.name }} </text>
              <text :style="sponsorTagStyle">· {{ t.ref.invitedYou }}</text>
            </view>
            <view class="flex items-center" style="gap: 6px; margin-top: 4px; flex-wrap: wrap">
              <text :style="vRankChipStyle">V{{ sponsor?.vRank }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- Gift hero: remote promotion is rendered only after the server preview succeeds. -->
      <view v-if="rewardEnabled" class="nx-glass-card text-center relative overflow-hidden" :style="giftCardStyle">
        <text class="block" :style="giftLabelStyle">{{ t.ref.welcomeGift }}</text>
        <view class="flex items-baseline justify-center" style="gap: 6px; margin-top: 8px">
          <text :style="giftAmountStyle">${{ giftUsdt }}</text>
          <text :style="giftNexStyle">+ {{ giftNex }} NEX</text>
        </view>
        <text class="block" :style="giftSubStyle">{{ t.ref.welcomeGiftSub }}</text>
      </view>

      <!-- What you get -->
      <view v-if="!remoteApiEnabled || remotePreview" class="nx-glass-card" :style="perksCardStyle">
        <view v-for="(p, i) in perks" :key="p.key" class="flex items-center" :style="perkRowStyle(i !== perks.length - 1)">
          <view class="grid place-items-center shrink-0" :style="perkIconBoxStyle(p.tint)">
            <view v-html="p.icon" />
          </view>
          <text :style="perkTextStyle" style="flex: 1">{{ perkLabel(p.key) }}</text>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0"><path d="M20 6 9 17l-5-5" /></svg>
        </view>
      </view>

      <!-- CTA(已登录 → 进入 UVEL,隐藏注册入口;异常2) -->
      <view v-if="!authed && referralCta === 'referral'" class="ref-cta w-full flex items-center justify-center active:scale-[0.98]" :style="ctaStyle" role="button" tabindex="0" data-system-chrome-primary @click="goRegister"  @keydown.enter.prevent="goRegister" @keydown.space.prevent="goRegister">
        <svg v-if="rewardEnabled" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" /></svg>
        <text style="margin: 0 8px">{{ rewardEnabled ? fmt(t.ref.claimCta, { usd: giftUsdt, nex: giftNex }) : t.ref.joinCta }}</text>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
      </view>
      <view v-else-if="!authed && referralCta === 'ordinary'" class="ref-cta w-full flex items-center justify-center active:scale-[0.98]" :style="ctaStyle" role="button" tabindex="0" data-system-chrome-primary @click="goRegister"  @keydown.enter.prevent="goRegister" @keydown.space.prevent="goRegister">
        <text style="margin: 0 8px">{{ t.register.create }}</text>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
      </view>
      <view v-if="remoteApiEnabled && remotePreviewState === 'unavailable'" class="text-center" style="padding: 28px 12px">
        <text style="font-size: 13px; color: var(--v5-ink-3)">{{ t.ref.previewUnavailable }}</text>
      </view>
      <view v-if="authed" class="ref-cta w-full flex items-center justify-center active:scale-[0.98]" :style="ctaStyle" role="button" tabindex="0" data-system-chrome-primary @click="enterApp"  @keydown.enter.prevent="enterApp" @keydown.space.prevent="enterApp">
        <text style="margin: 0 8px">{{ t.ref.enterApp }}</text>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
      </view>

      <view v-if="!authed" class="text-center" style="margin-top: 8px">
        <text :style="signinStyle">{{ t.ref.signinInstead }} </text>
        <text
          :style="signinLinkStyle"
          role="button"
          tabindex="0"
          :data-system-chrome-primary="remoteApiEnabled && !remotePreview ? '' : undefined"
          @click="goLogin"

          @keydown.enter.prevent="goLogin" @keydown.space.prevent="goLogin"
        >{{ t.ref.continue }}</text>
      </view>

      <!-- Network social proof -->
      <view class="nx-glass-card" :style="proofCardStyle">
        <view class="flex items-center" :style="proofHeadStyle">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="M16 7h6v6" /><path d="m22 7-8.5 8.5-5-5L2 17" /></svg>
          <text>{{ t.ref.platformTotals }}</text>
        </view>
        <view class="grid grid-cols-2 text-center" style="gap: 8px">
          <Stat :label="t.ref.newJoiners" :value="joinersText" tint="var(--v5-brand)" />
          <Stat :label="t.ref.paidOut" :value="paidOutText" tint="var(--v5-warning)" />
        </view>
        <!-- BUG #59: these two figures are operator-published platform aggregates, not a
             measured month-to-date feed. Without the scope label the card reads as a live
             fact and the numbers carry no timestamp, basis, or source. -->
        <text class="block" :style="proofScopeStyle">{{ verifiedScopeText }}</text>
      </view>

      <!-- Footer -->
      <!-- Footer — all three legal destinations are real keyboard-activatable links.
           role="link" takes Enter only (Space stays with page scrolling); the shared
           activation layer supplies the key handling, so no keydown is hand-written. -->
      <view class="text-center" :style="footerStyle">
        <text>{{ t.ref.legalLine }} </text>
        <text class="nx-ref-footer-link" :style="footerLinkStyle" role="link" tabindex="0" :aria-label="t.ref.terms" @click="goTerms">{{ t.ref.terms }}</text>
        <text aria-hidden="true"> · </text>
        <text class="nx-ref-footer-link" :style="footerLinkStyle" role="link" tabindex="0" :aria-label="t.ref.privacy" @click="goPrivacy">{{ t.ref.privacy }}</text>
        <text aria-hidden="true"> · </text>
        <text class="nx-ref-footer-link" :style="footerLinkStyle" role="link" tabindex="0" :aria-label="t.ref.trustCenter" @click="goTrust">{{ t.ref.trustCenter }}</text>
      </view>
    </view>
  </StandalonePageShell>
</template>

<script setup lang="ts">
import { privacyPolicyHref } from "@/lib/privacy-return";
import { navReset, navTo } from "@/lib/route";
import { computed, onUnmounted, ref, type CSSProperties } from "vue";
import { onLoad, onUnload } from "@dcloudio/uni-app";
import StandalonePageShell from "@/components/device/standalone-page-shell.vue";
import BrandLockup from "@/components/brand-lockup.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import Stat from "@/components/trust/trust-stat.vue";
import { pickSponsor } from "@/mock/sponsors";
import { apiClient, remoteApiEnabled } from "@/api/runtime";
import { createPublicSponsorPreviewApi, type PublicSponsorPreview } from "@/api/public-sponsor-preview-api";
import { normalizeRegistrationSponsorCode } from "@/auth/registration-sponsor";
import { useConfig } from "@/store/config";
import { useAuth } from "@/store/auth";
import { normalizeRefCode, useSponsorship } from "@/store/sponsorship";
import { visibleReferralGift } from "@/lib/referral-reward-gate";
import { referralCtaMode, resolveReferralAttributionCode, type ReferralPreviewState } from "@/lib/referral-preview-state";

const PARTNER_LOGOS = ["NVIDIA", "Intel", "AMD", "OpenRouter", "OPPO", "TechCrunch"];
const t = useT();
const code = ref("");
const cfg = useConfig();
const publicSponsorPreviewApi = createPublicSponsorPreviewApi(apiClient);
const remotePreview = ref<PublicSponsorPreview | null>(null);
const remotePreviewState = ref<ReferralPreviewState>("idle");
const proofScopeStyle: CSSProperties = { marginTop: "8px", fontSize: "12px", lineHeight: 1.4, color: "var(--v5-ink-4)" };
// 🔴 对外财务事实只能来自可核验聚合(zentao #59)。
//   此前「已付」= 运营配置的设备数 × 公布档位 × 30,「本月新增」= 配置基数 × 配置增速 ——
//   两者都是把人工配置当实测对外发布。现在:
//     · 有 verified 聚合时,读真实提现完成额与真实注册账号数,并标注来源与统计时刻;
//     · 没有(沙箱/旧后端)时显示「—」,不再用配置值编造一个看起来像事实的数字。
const verified = computed(() => cfg.syncFailed ? null : cfg.config.verifiedStats);
const paidOutText = computed(() => {
  const v = verified.value;
  if (cfg.syncFailed || !v) return "—";
  const amount = v.completedPayoutUsdt.value;
  return amount >= 1_000_000
    ? `${(amount / 1_000_000).toFixed(2)}M`
    : `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
});
const joinersText = computed(() => {
  const v = verified.value;
  if (cfg.syncFailed || !v) return "—";
  return v.registeredAccounts.value.toLocaleString("en-US");
});
/** 可核验聚合的统计时刻与口径,附在卡片底部;没有聚合时不显示任何「已核对」表述。 */
const verifiedScopeText = computed(() => {
  const v = verified.value;
  if (!v) return t.value.ref.unavailableScope;
  return fmt(t.value.ref.verifiedScope, { at: v.capturedAt.slice(0, 16).replace("T", " ") });
});
const auth = useAuth();
const sponsorship = remoteApiEnabled ? null : useSponsorship();
const rewardEnabled = computed(() => remoteApiEnabled
  ? !!remotePreview.value && remotePreview.value.gift.status !== "DISABLED"
  : cfg.config.rewards.enabled);
const localGift = computed(() => visibleReferralGift(cfg.config.rewards));
// 礼包金额单源派生自服务端预览或已过 H8 闸门的 platform config。
const giftUsdt = computed(() => remoteApiEnabled
  ? (rewardEnabled.value ? remotePreview.value?.gift.usdtAmount ?? 0 : 0)
  : localGift.value.usdtAmount);
const giftNex = computed(() => remoteApiEnabled
  ? (rewardEnabled.value ? remotePreview.value?.gift.nexAmount ?? 0 : 0)
  : localGift.value.nexAmount);
const referralCta = computed(() => referralCtaMode(remoteApiEnabled, remotePreviewState.value));
const referralAttribution = computed(() => resolveReferralAttributionCode(
  remoteApiEnabled,
  remotePreviewState.value,
  code.value,
));
let referralLoadVersion = 0;
let referralMounted = true;
const isCurrentReferralLoad = (version: number) => referralMounted && version === referralLoadVersion;

// [FEAT-SHARE4] 仅服务端预览确认的码才展示 sponsor / 写归因;非法、失败 = 普通注册。
onLoad(async (options) => {
  privacyHref.value = privacyPolicyHref("/pages/ref/code", options?.code);
  referralMounted = true;
  const loadVersion = ++referralLoadVersion;
  if (remoteApiEnabled) {
    code.value = "";
    remotePreview.value = null;
    remotePreviewState.value = "idle";
    const rawCode = String(options?.code ?? "").trim();
    const norm = normalizeRegistrationSponsorCode(rawCode, true);
    if (!norm) {
      remotePreviewState.value = rawCode ? "unavailable" : "idle";
      return;
    }
    remotePreviewState.value = "loading";
    try {
      const preview = await publicSponsorPreviewApi.preview(norm);
      if (!isCurrentReferralLoad(loadVersion)) return;
      remotePreview.value = preview;
      code.value = preview.code;
      remotePreviewState.value = "ready";
    } catch {
      if (!isCurrentReferralLoad(loadVersion)) return;
      code.value = "";
      remotePreview.value = null;
      remotePreviewState.value = "unavailable";
    }
    return;
  }
  const norm = normalizeRefCode(options?.code ?? "");
  code.value = norm ?? "";
  if (norm) sponsorship?.capturePending(norm);
});
function cleanupReferralLoad() {
  referralMounted = false;
  referralLoadVersion += 1;
}
onUnload(cleanupReferralLoad);
onUnmounted(cleanupReferralLoad);
const hasCode = computed(() => remoteApiEnabled ? !!remotePreview.value : !!code.value);
const authed = computed(() => auth.isAuthenticated);

const codeUpper = computed(() => code.value.toUpperCase());
const sponsor = computed(() => {
  if (remoteApiEnabled) {
    const value = remotePreview.value?.sponsor;
    return value ? { name: value.displayName, vRank: value.vRank.replace(/^V/i, "") } : null;
  }
  return code.value ? pickSponsor(code.value) : null;
});
const initial = computed(() => sponsor.value?.name[0] ?? "N");

const GIFT_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" /></svg>`;
const SPARK_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" /></svg>`;
const ZAP_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" /></svg>`;
const USERS_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>`;

type PerkKey = "gift" | "day1" | "always" | "sponsor";
const ALL_PERKS: { key: PerkKey; icon: string; tint: string }[] = [
  { key: "gift", icon: GIFT_SVG, tint: "var(--v5-brand)" },
  { key: "day1", icon: SPARK_SVG, tint: "var(--v5-tech-cyan)" },
  { key: "always", icon: ZAP_SVG, tint: "var(--v5-warning)" },
  { key: "sponsor", icon: USERS_SVG, tint: "var(--v5-tech-cyan)" },
];
const perks = computed(() => ALL_PERKS.filter((perk) => rewardEnabled.value || perk.key !== "gift"));
function perkLabel(k: PerkKey): string {
  const s = t.value.ref.perks[k];
  return k === "gift" ? fmt(s, { usd: giftUsdt.value, nex: giftNex.value }) : s;
}

function goRegister() {
  const q = referralAttribution.value ? `?ref=${encodeURIComponent(referralAttribution.value)}` : "";
  navTo(`/pages/register/register${q}`);
}
function goLogin() {
  const q = referralAttribution.value ? `?ref=${encodeURIComponent(referralAttribution.value)}` : "";
  navTo(`/pages/login/login${q}`);
}
function enterApp() {
  navReset({ url: "/pages/index/index", fail: () => {} });
}
function goTrust() {
  navTo("/pages/trust/trust");
}
const privacyHref = ref(privacyPolicyHref("/pages/ref/code"));
function goPrivacy() { navTo(privacyHref.value); }
function goTerms() {
  navTo("/pages/onboarding/terms");
}

const rootStyle: CSSProperties = { position: "relative", minHeight: "100vh", background: "var(--v5-bg)" };
const cornerGlowStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  top: 0,
  height: "260px",
  pointerEvents: "none",
  // Source glow is lemon-purple (rgba(124,92,255) + rgba(198,255,58)). In v5
  // dark the purple accent token is --v5-tech-cyan (#8E72FF), not --brand-2
  // (orange) — fixed the prior orange drift so the glow reads purple as in the
  // prototype.
  background:
    "radial-gradient(60% 100% at 50% 0%, color-mix(in srgb, var(--v5-tech-cyan) 22%, transparent) 0%, transparent 70%), radial-gradient(80% 60% at 50% 100%, color-mix(in srgb, var(--v5-brand) 10%, transparent) 0%, transparent 70%)",
};
const refChipStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  letterSpacing: "0.05em",
  padding: "2px 6px",
  borderRadius: "4px",
  background: "color-mix(in srgb, var(--v5-ink) 4%, transparent)",
};
const sponsorCardStyle: CSSProperties = { padding: "16px", marginBottom: "12px" };
const alreadyBarStyle: CSSProperties = {
  borderRadius: "12px",
  padding: "10px 12px",
  marginBottom: "12px",
  background: "color-mix(in srgb, var(--v5-warning) 10%, transparent)",
  fontSize: "12px",
  color: "var(--v5-ink-2)",
  lineHeight: 1.55,
};
const avatarStyle: CSSProperties = {
  width: "56px",
  height: "56px",
  borderRadius: "999px",
  background: "linear-gradient(135deg, var(--v5-brand) 0%, var(--v5-tech-cyan) 100%)",
};
const avatarTextStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontWeight: 600, fontSize: "26px", color: "var(--v5-on-brand)" };
const sponsorNameStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontSize: "20px", fontWeight: 600, color: "var(--v5-ink)", lineHeight: 1.25 };
const sponsorTagStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
const vRankChipStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  letterSpacing: "0.05em",
  padding: "2px 6px",
  borderRadius: "4px",
  background: "color-mix(in srgb, var(--v5-brand) 15%, transparent)",
  color: "var(--v5-brand)",
  fontWeight: 600,
};
const giftCardStyle: CSSProperties = {
  padding: "20px",
  marginBottom: "12px",
};
const giftLabelStyle: CSSProperties = { fontFamily: "var(--font-jet-mono), ui-monospace, monospace", fontSize: "12px", letterSpacing: "0.16em", color: "var(--v5-brand)" };
const giftAmountStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontSize: "56px", fontWeight: 600, lineHeight: 1, color: "var(--v5-ink)" };
const giftNexStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontSize: "20px", color: "var(--v5-nex)", fontWeight: 600, lineHeight: 1 };
const giftSubStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "8px", lineHeight: 1.625 };
const perksCardStyle: CSSProperties = { marginBottom: "12px", overflow: "hidden" };
function perkRowStyle(divider: boolean): CSSProperties {
  return { gap: "12px", padding: "12px 16px", borderBottom: divider ? "1px solid color-mix(in srgb, var(--v5-border) 70%, transparent)" : "none" };
}
function perkIconBoxStyle(tint: string): CSSProperties {
  return { width: "36px", height: "36px", borderRadius: "12px", background: `color-mix(in srgb, ${tint} 18%, transparent)` };
}
const perkTextStyle: CSSProperties = { fontSize: "13px", color: "color-mix(in srgb, var(--v5-ink) 90%, transparent)", lineHeight: 1.375 };
const ctaStyle: CSSProperties = {
  width: "100%",
  height: "56px",
  borderRadius: "999px",
  background: "linear-gradient(90deg, var(--v5-brand), color-mix(in srgb, var(--v5-brand) 80%, var(--v5-warning)))",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "15px",
  boxShadow: "var(--v5-spotlight-brand)",
};
const signinStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
const signinLinkStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-brand)" };
const proofCardStyle: CSSProperties = { marginTop: "20px", padding: "16px" };
const proofHeadStyle: CSSProperties = {
  marginBottom: "12px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  letterSpacing: "0.16em",
  color: "var(--v5-ink-3)",
};
const partnerCardStyle: CSSProperties = { marginTop: "12px", borderRadius: "16px", padding: "16px", background: "var(--v5-surface)" };
const partnerHeadStyle: CSSProperties = {
  marginBottom: "10px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  letterSpacing: "0.16em",
  color: "var(--v5-ink-3)",
};
const partnerChipStyle: CSSProperties = {
  padding: "4px 8px",
  borderRadius: "999px",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  fontWeight: 600,
  background: "color-mix(in srgb, var(--v5-ink) 4%, transparent)",
  color: "color-mix(in srgb, var(--v5-ink) 85%, transparent)",
};
const badgeRowStyle: CSSProperties = { marginTop: "12px", flexWrap: "wrap", gap: "4px 12px", fontSize: "12px", color: "var(--v5-ink-3)" };
const footerStyle: CSSProperties = { marginTop: "24px", fontSize: "12px", color: "var(--v5-ink-4)", lineHeight: 1.625, padding: "0 16px" };
// inline 目标吃 WCAG 2.5.8 豁免,纵向 padding 只扩热区不撑行高(原 61×14)
const footerLinkStyle: CSSProperties = { color: "var(--v5-ink-3)", padding: "15px 10px", margin: "0 -10px" };


</script>

<style scoped>
/* 《08》§2:footer 的两个法务链接是 inline style 对象驱动的,加不了 :active,故走 class。
   纵向 padding 已在 footerLinkStyle 里扩过热区(inline 元素纵向 padding 不撑行高)。 */
.nx-ref-footer-link {
  transition: opacity 0.15s;
}
.nx-ref-footer-link:active {
  opacity: 0.6;
}
/* All three footer links are focusable now — the ring must be visible or keyboard
   users cannot tell which legal document Enter will open. */
.nx-ref-footer-link:focus-visible {
  outline: 2px solid var(--v5-brand);
  outline-offset: 2px;
  border-radius: 4px;
}
</style>
