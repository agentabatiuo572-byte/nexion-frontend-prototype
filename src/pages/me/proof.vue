<!--
  Proof — ported from Nexion-prototype/app/(main)/me/proof/page.tsx.
  Proof-of-Contribution share hub: 3 card variants (Earnings / Streak / Network)
  tab-switched → a share card (brand + profile + VBadge + variant hero stat +
  secondary stats + achievement chips + referral code/QR) → native-share CTA →
  6 destination buttons → poster tip. Reads app (user/earnings/devices),
  profile (displayName), v-rank (myRank + V_RANKS), network (totalMembers),
  points (streaks). Reuses team/v-badge.vue. navigator.share → uni.share? +
  setClipboardData fallback (P-028). Gradient literals → token color-mix.
  SetPageHeader → SubPageHeader. SSR mounted-guard dropped. Wrapped in
  <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
      <view style="color: var(--v5-ink)">
        <SubPageHeader back="/pages/me/me" :title="t.proof.title" />

        <view v-if="remoteApiEnabled && remoteError" :style="remoteErrorStyle">
          <text class="block" style="font-weight: 600">{{ t.network.projectionErrorTitle }}</text>
          <text class="block" style="margin-top: 4px; font-size: 12px; color: var(--v5-ink-3)">{{ t.network.projectionErrorDesc }}</text>
          <view role="button" tabindex="0" :style="remoteRetryStyle" @click="refreshRemoteProof"><text>{{ t.network.retry }}</text></view>
        </view>

      <view :style="bodyStyle">
        <!-- Variant tabs -->
        <view>
          <text class="block font-mono-tabular" :style="variantLabelStyle">{{ t.proof.variantLabel }}</text>
          <view class="grid grid-cols-3" :style="variantTabsStyle">
            <view
              v-for="v in VARIANTS"
              :key="v"
              class="grid place-items-center active:scale-[0.97]"
              :style="variantPillStyle(v)"
              role="button"
              tabindex="0"
              :aria-label="t.proof.variants[v]"
              @click="variant = v"
            >
              <text :style="variantPillTextStyle(v)" style="pointer-events: none">{{ t.proof.variants[v] }}</text>
            </view>
          </view>
        </view>

        <!-- Share card -->
        <view v-if="!remoteApiEnabled || remoteSnapshot" class="relative overflow-hidden" :style="shareCardStyle">
          <!-- brand -->
          <view class="flex items-center" style="gap: 8px">
            <view class="grid place-items-center" :style="brandMarkStyle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--v5-on-brand)" stroke="var(--v5-on-brand)" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z" /></svg>
            </view>
            <text class="font-display" :style="brandNameStyle">NexGrid</text>
            <text style="margin-left: auto; font-size: 12px; letter-spacing: 0.18em; color: var(--v5-ink-3)">{{ t.uiChrome.proofOfContribution }}</text>
          </view>

          <!-- profile -->
          <view class="flex items-center justify-between" style="margin-top: 16px">
            <view class="min-w-0">
              <text class="block truncate" :style="profileNameStyle">{{ profileName }}</text>
              <text class="block" :style="memberSinceStyle">{{ memberSinceText }}</text>
            </view>
            <view class="shrink-0">
              <VBadge v-if="myRank !== null" :v="myRank" size="md" />
              <text v-else class="font-mono-tabular" :style="miniValueStyle">V—</text>
            </view>
          </view>

          <!-- variant hero stat -->
          <view v-if="variant === 'earnings'" style="margin-top: 16px">
            <text class="block font-mono-tabular" :style="heroKickerStyle('var(--v5-brand)')">{{ t.proof.totalEarned }}</text>
            <text class="block font-display tabular-nums" :style="heroBigStyle">${{ earningsTotalText }}</text>
            <ProofSparkline />
          </view>
          <view v-else-if="variant === 'streak'" style="margin-top: 16px">
            <text class="block font-mono-tabular" :style="heroKickerStyle('var(--v5-brand-2)')">{{ t.proof.longestStreak }}</text>
            <view class="flex items-baseline" style="margin-top: 4px; gap: 6px">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
              <text class="font-display tabular-nums" :style="heroBigInlineStyle">{{ longestOrCurrent }}</text>
              <text :style="heroUnitStyle">{{ t.proof.daysShort }}</text>
            </view>
          </view>
          <view v-else style="margin-top: 16px">
            <text class="block font-mono-tabular" :style="heroKickerStyle('var(--v5-brand-2)')">{{ t.proof.teamReach }}</text>
            <view class="flex items-baseline" style="margin-top: 4px; gap: 6px">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              <text class="font-display tabular-nums" :style="heroBigInlineStyle">{{ totalMembers === null ? "—" : totalMembers }}</text>
            </view>
          </view>

          <!-- secondary stats -->
          <view class="grid grid-cols-3" style="margin-top: 16px; gap: 8px">
            <view :style="miniStatStyle">
              <text class="block truncate" :style="miniLabelStyle">{{ t.proof.activeDays }}</text>
              <text class="block font-display tabular-nums" :style="miniValueStyle">{{ activeDays === null ? "—" : activeDays }}</text>
            </view>
            <view :style="miniStatStyle">
              <text class="block truncate" :style="miniLabelStyle">{{ t.proof.devices }}</text>
              <text class="block font-display tabular-nums" :style="miniValueStyle">{{ onlineDevices === null ? "—" : onlineDevices }}</text>
            </view>
            <view :style="miniStatStyle">
              <text class="block truncate" :style="miniLabelStyle">{{ topPctLabel }}</text>
              <text class="block font-display tabular-nums" :style="miniValueSmallStyle">{{ topPctText }}</text>
            </view>
          </view>

          <!-- achievement chips -->
          <view style="margin-top: 12px">
            <text class="block font-mono-tabular" :style="chipsLabelStyle">{{ t.proof.achievementsRow }}</text>
            <view class="flex" style="gap: 6px; flex-wrap: wrap">
              <text class="inline-block font-mono-tabular" :style="chipStyle('var(--v5-brand)')">{{ vRankChip }}</text>
              <text v-if="longestOrCurrent !== null && longestOrCurrent > 0" class="inline-block font-mono-tabular" :style="chipStyle('var(--v5-brand-2)')">{{ streakChip }}</text>
              <text v-if="onlineDevices !== null && onlineDevices > 0" class="inline-block font-mono-tabular" :style="chipStyle('var(--v5-tech-cyan)')">{{ devicesChip }}</text>
              <text class="inline-block font-mono-tabular" :style="chipStyle('var(--v5-warning)')">{{ daysActiveChip }}</text>
            </view>
          </view>

          <!-- referral block -->
          <view class="flex items-center" :style="refBlockStyle">
            <view class="flex-1 min-w-0">
              <text class="block" :style="refLabelStyle">{{ t.proof.refCodeLabel }}</text>
              <text class="block font-display" :style="refCodeStyle">{{ refCode }}</text>
              <view
                class="inline-flex items-center active:opacity-70 font-mono-tabular"
                :style="refLinkStyle"
                role="button"
                tabindex="0"
                :aria-label="t.proof.shareDestinations.copy"
                @click="copyLink"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                <text style="margin-left: 4px; pointer-events: none">{{ referralLink }}</text>
              </view>
            </view>
            <view class="grid place-items-center shrink-0" :style="qrBoxStyle">
              <view class="grid" :style="qrGridStyle">
                <view v-for="(on, i) in qrCells" :key="i" :style="qrCellStyle(on)" />
              </view>
            </view>
          </view>
        </view>

        <!-- Quick native share -->
        <view style="margin-top: 12px">
          <view
            class="flex items-center justify-center active:scale-[0.98]"
            :style="nativeBtnStyle"
            role="button"
            tabindex="0"
            :aria-label="t.proof.shareNative"
            @click="nativeShare"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" x2="15.42" y1="13.51" y2="17.49" /><line x1="15.41" x2="8.59" y1="6.51" y2="10.49" /></svg>
            <text style="margin-left: 8px; pointer-events: none" :style="nativeBtnTextStyle">{{ t.proof.shareNative }}</text>
          </view>
          <text class="block" :style="nativeHintStyle">{{ t.proof.shareNativeHint }}</text>
        </view>

        <!-- Destination grid 6 -->
        <view class="grid grid-cols-3" style="margin-top: 12px; gap: 8px">
          <view
            v-for="d in destinations"
            :key="d.label"
            class="active:scale-[0.97]"
            :style="destBtnStyle"
            role="button"
            tabindex="0"
            :aria-label="d.label"
            @click="d.onClick"
          >
            <view class="grid place-items-center" :style="destIconStyle(d.color)" style="pointer-events: none">
              <view v-html="d.icon" />
            </view>
            <text class="block" :style="destLabelStyle" style="pointer-events: none">{{ d.label }}</text>
          </view>
        </view>

        <!-- Tip -->
        <view class="flex items-start" :style="tipStyle">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-top: 2px; flex-shrink: 0"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
          <view style="margin-left: 8px">
            <text class="block" :style="tipTitleStyle">{{ t.proof.posterHintTitle }}</text>
            <text class="block" :style="tipBodyStyle">{{ t.proof.posterHint }}</text>
          </view>
        </view>

        <canvas
          canvas-id="proofPosterCanvas"
          id="proofPosterCanvas"
          :style="posterCanvasStyle"
        />
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch, type CSSProperties } from "vue";
import { onShow, onUnload } from "@dcloudio/uni-app";
import qrcode from "qrcode-generator";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import VBadge from "@/components/team/v-badge.vue";
import ProofSparkline from "@/components/me/proof-sparkline.vue";
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import { toast } from "@/store/ui";
import { useApp } from "@/store/app";
import { useProfile } from "@/store/profile";
import { buildShareLink } from "@/lib/share";
import { isDeviceOnline } from "@/lib/hashpower";
import { useVRank } from "@/store/v-rank";
import { rankTitle } from "@/lib/v-rank-copy";
import { useLocaleStore } from "@/store/locale";
import { useNetwork } from "@/store/network";
import { useNexFaucet } from "@/store/nex-faucet";
import { proofApi, remoteApiEnabled } from "@/api/runtime";
import type { ProofSnapshot } from "@/api/proof-api";
import { proofStreakFacts } from "@/lib/proof-streak";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import {
  captureCommerceSandboxRun,
  isCurrentCommerceSandboxScope,
  subscribeCurrentCommerceSandboxRun,
} from "@/api/order-api";

type Variant = "earnings" | "streak" | "network";
const VARIANTS: Variant[] = ["earnings", "streak", "network"];

const t = useT();
const app = useApp();
const profile = useProfile();
const vRank = useVRank();
const isZh = computed(() => useLocaleStore().code === "zh");
const network = useNetwork();
const faucet = useNexFaucet();

const variant = ref<Variant>("earnings");
const exportingPoster = ref(false);
const remoteSnapshot = ref<ProofSnapshot | null>(null);
const remoteError = ref(false);
let remoteRequest = 0;
let remoteMounted = true;

function clearRemoteProof(): void {
  remoteRequest += 1;
  remoteSnapshot.value = null;
  remoteError.value = false;
}

function invalidateRemoteProof(): void {
  if (!remoteMounted) return;
  remoteMounted = false;
  clearRemoteProof();
}

async function refreshRemoteProof() {
  const request = ++remoteRequest;
  remoteError.value = false;
  const expectedAccount = app.accountKey;
  const accountScope = captureAccountScope();
  const runScope = captureCommerceSandboxRun();
  const current = () => remoteMounted && request === remoteRequest
    && expectedAccount === app.accountKey
    && isCurrentAccountScope(accountScope)
    && isCurrentCommerceSandboxScope(runScope);
  try {
    const value = await proofApi.snapshot();
    if (current()) remoteSnapshot.value = value;
  } catch {
    if (current()) { remoteSnapshot.value = null; remoteError.value = true; }
  }
}

watch(() => String(app.accountKey), () => {
  if (!remoteApiEnabled || !remoteMounted) return;
  remoteRequest += 1;
  remoteSnapshot.value = null;
  remoteError.value = false;
  void refreshRemoteProof();
});
const unsubscribeProofRun = subscribeCurrentCommerceSandboxRun(() => {
  if (!remoteApiEnabled || !remoteMounted) return;
  clearRemoteProof();
  void refreshRemoteProof();
});
onUnload(invalidateRemoteProof);
onUnmounted(invalidateRemoteProof);
onUnmounted(unsubscribeProofRun);
onShow(() => {
  if (remoteApiEnabled) {
    void refreshRemoteProof();
    void vRank.refreshCanonicalVRank();
  }
});

const earningsTotal = computed<number | null>(() => remoteApiEnabled ? remoteSnapshot.value?.earningsTotalUsdt ?? null : app.earnings.total);
const earningsTotalText = computed(() => earningsTotal.value === null ? "—" : earningsTotal.value.toFixed(2));
const onlineDevices = computed(
  () => remoteApiEnabled ? remoteSnapshot.value?.onlineDevices ?? null
    : app.visibleDevices.filter((d) => d.activatedAt !== null && isDeviceOnline(d, Date.now())).length,
);
const profileName = computed(() => profile.displayName);
const myRank = computed(() => remoteApiEnabled && vRank.ladder.length === 0 ? null : vRank.myRank);
const totalMembers = computed<number | null>(() => remoteApiEnabled ? remoteSnapshot.value?.team.totalMembers ?? null : network.totalMembers);
const streakFacts = computed(() => proofStreakFacts(
  remoteApiEnabled,
  remoteSnapshot.value,
  faucet.signInStreak,
  faucet.longestStreak,
));
const streak = computed<number | null>(() => streakFacts.value.current);
const longestStreak = computed<number | null>(() => streakFacts.value.longest);
const longestOrCurrent = computed<number | null>(() => streakFacts.value.display);

const joined = computed(() => {
  const raw = remoteApiEnabled ? remoteSnapshot.value?.joinedAt : app.user.joinedAt;
  if (!raw) return "—";
  const ts = typeof raw === "string" ? Date.parse(raw) : raw;
  return Number.isFinite(ts) ? new Date(ts).toLocaleDateString(dateLocale(), { month: "short", year: "numeric" }) : "—";
});
const activeDays = computed<number | null>(() => remoteApiEnabled ? remoteSnapshot.value?.activeDays ?? null
  : Math.max(1, Math.floor((Date.now() - app.user.joinedAt) / (24 * 3600 * 1000))));

// [FEAT-SHARE1] 链接单源收编:构造走 lib/share(禁自拼 nexgrid.ai/ref/)。
const refCode = computed(() => remoteApiEnabled ? remoteSnapshot.value?.referralCode ?? "—" : app.user.referralCode);
const referralLink = computed(() => refCode.value === "—" ? "" : buildShareLink(refCode.value));

const topPct = computed(() => remoteApiEnabled ? remoteSnapshot.value?.topPercentile ?? null : null);
const topPctText = computed(() => topPct.value === null ? "Top —" : `Top ${topPct.value}%`);

const shareText = computed(() => {
  if (variant.value === "streak")
    return `🔥 ${longestOrCurrent.value ?? "—"}-day streak on NexGrid. Daily check-ins = passive NEX. Join me: ${referralLink.value}`;
  if (variant.value === "network")
    return `🌐 My NexGrid network is ${totalMembers.value ?? "—"} strong across 7 layers. Compound earnings from each. Join: ${referralLink.value}`;
  return `💸 Earned $${earningsTotalText.value} on NexGrid in ${activeDays.value ?? "—"} days. Join my network: ${referralLink.value}`;
});

// ── derived labels ──
const memberSinceText = computed(() => fmt(t.value.proof.memberSince, { m: joined.value }));
const topPctLabel = computed(() => topPct.value === null ? t.value.proof.topPct.replace("{n}", "—") : t.value.proof.topPct.replace("{n}", String(topPct.value)));
const vRankChip = computed(() => myRank.value === null ? "V—" : fmt(t.value.proof.badges.vRank, { n: String(myRank.value), title: rankTitle(myRank.value, isZh.value, vRank.ladder) }));
const streakChip = computed(() => fmt(t.value.proof.badges.streak, { n: String(longestOrCurrent.value ?? "—") }));
const devicesChip = computed(() => fmt(t.value.proof.badges.devices, { n: String(onlineDevices.value ?? "—") }));
const daysActiveChip = computed(() => fmt(t.value.proof.badges.daysActive, { n: String(activeDays.value ?? "—") }));

// ── share actions (P-028: uni.share? + setClipboardData fallback) ──
function nativeShare() {
  const share = (uni as { share?: (o: unknown) => void }).share;
  if (typeof share === "function") {
    share({
      provider: "weixin",
      type: 0,
      href: referralLink.value,
      title: "NexGrid · Proof of Contribution",
      summary: shareText.value,
      success: () => {},
      fail: () => copyText(shareText.value, t.value.proof.sharedToast),
    });
  } else {
    copyText(shareText.value, t.value.proof.sharedToast);
  }
}
function copyLink() {
  copyText(referralLink.value, t.value.proof.copiedToast);
}
function copyShareText(networkName: string) {
  copyText(shareText.value, t.value.proof.sharedToast, `Open ${networkName} and paste`);
}
const POSTER_WIDTH = 1080;
const POSTER_HEIGHT = 1350;

async function downloadPng() {
  if (exportingPoster.value) return;
  exportingPoster.value = true;
  try {
    await drawProofPoster();
    const tempFilePath = await exportProofCanvas();
    if (typeof document !== "undefined") downloadProofOnH5(tempFilePath);
    else await saveProofToAlbum(tempFilePath);
    toast.success(t.value.proof.downloadToast, "");
  } catch {
    toast.error(t.value.proof.downloadErrorToast);
  } finally {
    exportingPoster.value = false;
  }
}
function copyText(data: string, title: string, desc = "") {
  uni.setClipboardData({ data, showToast: false, fail: () => {} });
  toast.success(title, desc);
}

// ── QR payload is the exact referral URL shown beside it. ──
const qrCode = computed(() => {
  const code = qrcode(0, "M");
  code.addData(referralLink.value, "Byte");
  code.make();
  return code;
});
const qrModuleCount = computed(() => qrCode.value.getModuleCount());
const qrCells = computed<boolean[]>(() => {
  const modules: boolean[] = [];
  for (let row = 0; row < qrModuleCount.value; row += 1) {
    for (let col = 0; col < qrModuleCount.value; col += 1) modules.push(qrCode.value.isDark(row, col));
  }
  return modules;
});

function drawProofPoster(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const ctx = uni.createCanvasContext("proofPosterCanvas");
      ctx.setFillStyle("#07101f");
      ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
      ctx.setFillStyle("#b7ff3c");
      ctx.fillRect(72, 72, 18, 76);
      ctx.setFillStyle("#f7fbff");
      ctx.setFontSize(54);
      ctx.fillText("NexGrid", 116, 128);
      ctx.setFillStyle("#9cabbd");
      ctx.setFontSize(24);
      ctx.fillText("PROOF OF CONTRIBUTION", 72, 204);

      ctx.setFillStyle("#111d30");
      ctx.fillRect(72, 254, 936, 948);
      ctx.setFillStyle("#f7fbff");
      ctx.setFontSize(46);
      ctx.fillText(profileName.value.slice(0, 24), 124, 342);
      ctx.setFillStyle("#9cabbd");
      ctx.setFontSize(25);
      ctx.fillText(memberSinceText.value, 124, 388);

      ctx.setFillStyle("#b7ff3c");
      ctx.setFontSize(26);
      ctx.fillText(posterMetricLabel(), 124, 490);
      ctx.setFillStyle("#f7fbff");
      ctx.setFontSize(72);
      ctx.fillText(posterMetricValue(), 124, 580);

      ctx.setFillStyle("#9cabbd");
      ctx.setFontSize(24);
      ctx.fillText(`${t.value.proof.activeDays}: ${activeDays.value}`, 124, 660);
      ctx.fillText(`${t.value.proof.devices}: ${onlineDevices.value}`, 124, 706);
      ctx.fillText(`${t.value.proof.teamMembers}: ${totalMembers.value}`, 124, 752);

      drawPosterQr(ctx, 634, 438, 300);
      ctx.setFillStyle("#b7ff3c");
      ctx.setFontSize(24);
      ctx.fillText(t.value.proof.refCodeLabel, 124, 874);
      ctx.setFillStyle("#f7fbff");
      ctx.setFontSize(44);
      ctx.fillText(refCode.value.slice(0, 32), 124, 930);
      ctx.setFillStyle("#9cabbd");
      ctx.setFontSize(22);
      ctx.fillText(referralLink.value.slice(0, 68), 124, 986);
      ctx.setFillStyle("#d9e4f2");
      ctx.setFontSize(24);
      ctx.fillText(t.value.proof.qrHint, 124, 1106);
      ctx.draw(false, () => resolve());
    } catch (error) {
      reject(error);
    }
  });
}

function posterMetricLabel(): string {
  if (variant.value === "streak") return t.value.proof.longestStreak;
  if (variant.value === "network") return t.value.proof.teamReach;
  return t.value.proof.totalEarned;
}

function posterMetricValue(): string {
  if (variant.value === "streak") return `${longestOrCurrent.value} ${t.value.proof.daysShort}`;
  if (variant.value === "network") return String(totalMembers.value);
  return `$${earningsTotalText.value}`;
}

function drawPosterQr(ctx: UniApp.CanvasContext, x: number, y: number, size: number) {
  const quietModules = 4;
  const count = qrModuleCount.value;
  const moduleSize = Math.floor(size / (count + quietModules * 2));
  const renderedSize = moduleSize * (count + quietModules * 2);
  ctx.setFillStyle("#ffffff");
  ctx.fillRect(x, y, renderedSize, renderedSize);
  ctx.setFillStyle("#07101f");
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qrCode.value.isDark(row, col)) {
        ctx.fillRect(x + (col + quietModules) * moduleSize, y + (row + quietModules) * moduleSize, moduleSize, moduleSize);
      }
    }
  }
}

function exportProofCanvas(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.canvasToTempFilePath({
      canvasId: "proofPosterCanvas",
      width: POSTER_WIDTH,
      height: POSTER_HEIGHT,
      destWidth: POSTER_WIDTH,
      destHeight: POSTER_HEIGHT,
      fileType: "png",
      quality: 1,
      success: (result) => resolve(result.tempFilePath),
      fail: reject,
    });
  });
}

function downloadProofOnH5(tempFilePath: string) {
  const anchor = document.createElement("a");
  anchor.href = tempFilePath;
  anchor.download = `nexgrid-proof-${refCode.value || "member"}.png`;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function saveProofToAlbum(tempFilePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const save = (uni as typeof uni & {
      saveImageToPhotosAlbum?: (options: { filePath: string; success: () => void; fail: (error: unknown) => void }) => void;
    }).saveImageToPhotosAlbum;
    if (!save) {
      reject(new Error("PROOF_IMAGE_SAVE_UNAVAILABLE"));
      return;
    }
    save({ filePath: tempFilePath, success: resolve, fail: reject });
  });
}

// ── destination icon SVG strings (lucide replacements, stroke=currentColor) ──
const ICON = {
  send: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></svg>',
  msg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
  image: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
  copy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
  download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
};
const destinations = computed(() => [
  { label: t.value.proof.shareDestinations.twitter, color: "#3DA9FF", icon: tint(ICON.send, "#3DA9FF"), onClick: () => copyShareText("Twitter") },
  { label: t.value.proof.shareDestinations.telegram, color: "var(--v5-tech-cyan)", icon: tint(ICON.msg, "var(--v5-tech-cyan)"), onClick: () => copyShareText("Telegram") },
  { label: t.value.proof.shareDestinations.whatsapp, color: "#25D366", icon: tint(ICON.msg, "#25D366"), onClick: () => copyShareText("WhatsApp") },
  { label: t.value.proof.shareDestinations.instagram, color: "#E4405F", icon: tint(ICON.image, "#E4405F"), onClick: () => copyShareText("Instagram") },
  { label: t.value.proof.shareDestinations.copy, color: "var(--v5-brand)", icon: tint(ICON.copy, "var(--v5-brand)"), onClick: copyLink },
  { label: t.value.proof.shareDestinations.download, color: "var(--v5-warning)", icon: tint(ICON.download, "var(--v5-warning)"), onClick: downloadPng },
]);
function tint(svg: string, color: string): string {
  return svg.replace('stroke="currentColor"', `stroke="${color}"`);
}

// ── styles ──
const bodyStyle: CSSProperties = { padding: "0 16px 32px" };
const remoteErrorStyle: CSSProperties = { margin: "0 16px 12px", padding: "12px", borderRadius: "12px", background: "color-mix(in srgb, var(--v5-warning) 10%, transparent)" };
const remoteRetryStyle: CSSProperties = { minHeight: "44px", display: "grid", placeItems: "center", marginTop: "6px", color: "var(--v5-warning)" };
const variantLabelStyle: CSSProperties = {
  marginBottom: "6px",
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.06em",
  color: "var(--v5-ink-3)",
};
// Segmented control — filled L1 surface container, no border (active pill is brand).
const variantTabsStyle: CSSProperties = {
  gap: "4px",
  padding: "4px",
  borderRadius: "16px",
  // 轨道贴页面底:surface-2 与页面底同色不可辨(亮色 ΔE 2.2),改 L1 surface;选中 pill 是 brand 实底,不撞色
  background: "var(--v5-surface)",
};
function variantPillStyle(v: Variant): CSSProperties {
  const on = variant.value === v;
  return { height: "44px", borderRadius: "12px", background: on ? "var(--v5-brand)" : "transparent" };
}
function variantPillTextStyle(v: Variant): CSSProperties {
  const on = variant.value === v;
  return { fontSize: "12px", fontWeight: 600, color: on ? "var(--v5-on-brand)" : "var(--v5-ink-3)" };
}
const shareCardStyle = computed<CSSProperties>(() => {
  // Proof "certificate" — single container (form b): the gradient fill is the
  // poster look; the accent border is dropped (filled = no border). Gradient
  // literals → token color-mix (lemon brand / tech-cyan / brand-2 / warning over
  // a near-black surface; matches source intent, token-disciplined).
  const grad: Record<Variant, string> = {
    earnings:
      "linear-gradient(135deg, color-mix(in srgb, var(--v5-brand) 18%, transparent) 0%, color-mix(in srgb, var(--v5-on-brand) 95%, transparent) 60%, color-mix(in srgb, var(--v5-tech-cyan) 16%, transparent) 100%)",
    streak:
      "linear-gradient(135deg, color-mix(in srgb, var(--v5-brand-2) 20%, transparent) 0%, color-mix(in srgb, var(--v5-on-brand) 95%, transparent) 60%, color-mix(in srgb, var(--v5-warning) 18%, transparent) 100%)",
    network:
      "linear-gradient(135deg, color-mix(in srgb, var(--v5-tech-cyan) 20%, transparent) 0%, color-mix(in srgb, var(--v5-on-brand) 95%, transparent) 60%, color-mix(in srgb, var(--v5-brand) 16%, transparent) 100%)",
  };
  return { marginTop: "12px", borderRadius: "16px", padding: "20px", background: grad[variant.value] };
});
const brandMarkStyle: CSSProperties = { width: "28px", height: "28px", borderRadius: "6px", background: "var(--v5-brand)" };
const brandNameStyle: CSSProperties = { fontSize: "20px", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--v5-ink)" };
const profileNameStyle: CSSProperties = { fontSize: "20px", fontWeight: 600, color: "var(--v5-ink)" };
const memberSinceStyle: CSSProperties = { marginTop: "2px", fontSize: "12px", color: "var(--v5-ink-3)" };
function heroKickerStyle(color: string): CSSProperties {
  return { fontSize: "12px", letterSpacing: "0.16em", color };
}
const heroBigStyle: CSSProperties = {
  marginTop: "4px",
  fontSize: "34px",
  fontWeight: 600,
  color: "var(--v5-ink)",
  lineHeight: 1,
};
const heroBigInlineStyle: CSSProperties = { fontSize: "34px", fontWeight: 600, color: "var(--v5-ink)", lineHeight: 1 };
const heroUnitStyle: CSSProperties = { fontSize: "15px", fontWeight: 500, color: "var(--v5-ink-3)" };
// Nested tint blocks inside the share card — soft surface-2 fill, no border.
const miniStatStyle: CSSProperties = {
  background: "color-mix(in srgb, var(--v5-surface-2) 60%, transparent)",
  borderRadius: "8px",
  padding: "8px",
  textAlign: "center",
};
const miniLabelStyle: CSSProperties = { fontSize: "12px", letterSpacing: "0.16em", color: "var(--v5-ink-3)" };
const miniValueStyle: CSSProperties = { marginTop: "2px", fontSize: "15px", fontWeight: 600, color: "var(--v5-ink)" };
const miniValueSmallStyle: CSSProperties = { marginTop: "2px", fontSize: "12px", fontWeight: 600, color: "var(--v5-ink)" };
const chipsLabelStyle: CSSProperties = {
  marginBottom: "6px",
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.06em",
  color: "var(--v5-ink-3)",
};
function chipStyle(tintColor: string): CSSProperties {
  // Source Chip bg is `${tint}22` — an 8-digit hex alpha suffix (0x22/255 ≈ 13%),
  // not 22% opacity. Match the literal source intent. (mirrors destIconStyle's
  // `${color}1F` → 12% translation already done correctly).
  return {
    padding: "2px 8px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 600,
    background: `color-mix(in srgb, ${tintColor} 13%, transparent)`,
    color: tintColor,
  };
}
const refBlockStyle: CSSProperties = {
  marginTop: "16px",
  padding: "12px",
  borderRadius: "12px",
  gap: "12px",
  background: "color-mix(in srgb, var(--v5-surface-2) 70%, transparent)",
};
const refLabelStyle: CSSProperties = { fontSize: "12px", letterSpacing: "0.18em", color: "var(--v5-brand)" };
const refCodeStyle: CSSProperties = {
  marginTop: "2px",
  fontSize: "20px",
  fontWeight: 600,
  letterSpacing: "0.05em",
  color: "var(--v5-ink)",
};
const refLinkStyle: CSSProperties = {
  marginTop: "4px",
  minHeight: "44px",
  marginLeft: "-4px",
  padding: "0 4px",
  borderRadius: "6px",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const qrBoxStyle: CSSProperties = { width: "56px", height: "56px", borderRadius: "8px", background: "#ffffff" };
const qrGridStyle = computed<CSSProperties>(() => ({
  width: "48px",
  height: "48px",
  gridTemplateColumns: `repeat(${qrModuleCount.value}, 1fr)`,
  gridTemplateRows: `repeat(${qrModuleCount.value}, 1fr)`,
  padding: "4px",
}));
function qrCellStyle(on: boolean): CSSProperties {
  return { width: "100%", height: "100%", background: on ? "var(--v5-on-brand)" : "transparent" };
}
const posterCanvasStyle: CSSProperties = {
  position: "fixed",
  left: "-12000px",
  top: "0",
  width: `${POSTER_WIDTH}px`,
  height: `${POSTER_HEIGHT}px`,
  pointerEvents: "none",
};
const nativeBtnStyle: CSSProperties = { height: "48px", borderRadius: "999px", background: "var(--v5-brand)" };
const nativeBtnTextStyle: CSSProperties = { fontSize: "15px", fontWeight: 600, color: "var(--v5-on-brand)" };
const nativeHintStyle: CSSProperties = { marginTop: "6px", textAlign: "center", fontSize: "12px", color: "var(--v5-ink-3)" };
// Share-destination icon grid (form b) — filled surface tiles, no border.
const destBtnStyle: CSSProperties = {
  background: "var(--v5-surface)",
  borderRadius: "16px",
  padding: "12px",
  textAlign: "center",
};
function destIconStyle(color: string): CSSProperties {
  return { width: "36px", height: "36px", margin: "0 auto", borderRadius: "8px", background: `color-mix(in srgb, ${color} 12%, transparent)`, color };
}
const destLabelStyle: CSSProperties = { marginTop: "6px", fontSize: "12px", color: "var(--v5-ink-2)", lineHeight: 1.25 };
const tipStyle: CSSProperties = {
  margin: "16px 0 8px",
  padding: "12px",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--v5-warning) 8%, transparent)",
};
const tipTitleStyle: CSSProperties = { fontSize: "12px", fontWeight: 600, color: "var(--v5-warning)" };
const tipBodyStyle: CSSProperties = {
  marginTop: "2px",
  fontSize: "12px",
  color: "color-mix(in srgb, var(--v5-warning) 85%, transparent)",
  lineHeight: 1.625,
};
</script>
