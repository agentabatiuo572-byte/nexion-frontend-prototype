<!--
  [FEAT-SHARE2] 邀请海报面板 — 全屏 sheet:canvas 海报(真二维码)+ 模板轮播 +
  展示用户名开关 + 被邀方奖励说明 + 渠道行(保存/复制/发链接)。
  规格: PRD/specs/FEAT-SHARE01-invite-chain.md [FEAT-SHARE2];交互骨架参考 OKX
  分享(模板缩略图 + 底部渠道行 + 自定义开关),内容按本项目功能。
  二维码 payload = lib/share.buildShareLink 单源(qrcode-generator 真码,可扫);
  海报只承载配置确认的被邀方奖励，不印邀请人奖励。
  状态机: idle → generating → ready | failed(重试);generating/failed 禁保存与分享。
  canvas 颜色说明: 海报 = 恒定深色画稿(主人 2026-07-08 拍板:浅/深模式同一张
  海报,不随 app 主题变),全部颜色为画稿常量,不读运行时 token。
-->
<template>
  <view v-if="open" class="ps-root" role="dialog" aria-modal="true" :aria-label="t.share.posterTitle">
    <view class="ps-mask" @click="emit('close')" />
    <view class="nx-glass-sheet ps-sheet">
      <view class="ps-grab" />
      <view class="ps-head">
        <text class="ps-head__t">{{ t.share.posterTitle }}</text>
        <view tabindex="0" class="ps-head__x active:opacity-70" role="button"  :aria-label="t.ui.close" @click="emit('close')"  @keydown.enter.prevent="emit('close')" @keydown.space.prevent="emit('close')">
          <LiquidGlass :radius="22" tone="control" />
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </view>
      </view>

      <view class="ps-body">
      <view class="ps-stage">
        <!-- 画布(随面板 v-if 挂载/销毁;draw 后导出预览图,自身移出视口不占布局) -->
        <canvas canvas-id="sharePosterCv" id="sharePosterCv" class="ps-canvas" />
        <view v-if="genState === 'ready'" class="ps-preview">
          <image :src="imgSrc" mode="widthFix" class="ps-preview__img" />
        </view>
        <view v-else-if="genState === 'failed'" class="ps-fail">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
          <text class="ps-fail__t">{{ t.share.genFailed }}</text>
          <view tabindex="0" class="ps-fail__btn nx-frosted-button active:opacity-80" role="button"  @click="regenerate"  @keydown.enter.prevent="regenerate" @keydown.space.prevent="regenerate">
            <text class="ps-fail__btn-t">{{ t.share.retry }}</text>
          </view>
        </view>
        <view v-else class="ps-skeleton">
          <text class="ps-skeleton__t">{{ t.share.generating }}</text>
        </view>
      </view>

      <!-- 模板轮播(yield 无设备自动隐藏,异常3) -->
      <GlassSegments :model-value="tpl" :options="templateOptions" surface="open" class="ps-thumbs" :label="t.share.posterTitle" @select="pickTpl" />

      <view class="ps-reward">
        <text class="ps-reward__t">{{ posterRewardLine }}</text>
        <text v-if="rewardEffectiveAtText" class="ps-reward__t">{{ rewardEffectiveAtText }}</text>
      </view>

      <view class="ps-toggle" role="switch" tabindex="0" :aria-checked="showUsername" :aria-label="t.share.showUsername" @click="toggleUsername">
        <text class="ps-toggle__lb">{{ t.share.showUsername }}</text>
        <view class="ps-sw active:opacity-70" :class="{ 'ps-sw--on': showUsername }" aria-hidden="true">
          <view class="ps-sw__knob" />
        </view>
      </view>

      <!-- 渠道行:保存 / 复制 + 链接渠道(与渠道面板同一 intent 实现) -->
      <view class="ps-chrow">
        <view class="ps-ch"   :aria-disabled="genState !== 'ready'" :class="{ 'ps-ch--off': genState !== 'ready' }" role="button" :tabindex="genState === 'ready' ? 0 : -1" @click="saveImage"  @keydown.enter.prevent="saveImage" @keydown.space.prevent="saveImage">
          <view class="ps-ch__ic ps-ch__ic--hl">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3" /><path d="m7 10 5 5 5-5" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /></svg>
          </view>
          <text class="ps-ch__lb">{{ t.share.saveImage }}</text><svg class="ps-ch__arrow" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>
        </view>
        <view class="ps-ch"   :aria-disabled="genState !== 'ready'" :class="{ 'ps-ch--off': genState !== 'ready' }" role="button" :tabindex="genState === 'ready' ? 0 : -1" @click="copyLinkAction"  @keydown.enter.prevent="copyLinkAction" @keydown.space.prevent="copyLinkAction">
          <view class="ps-ch__ic ps-ch__ic--hl">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
          </view>
          <text class="ps-ch__lb">{{ t.share.copyLink }}</text><svg class="ps-ch__arrow" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>
        </view>
        <view
          v-for="c in linkChannels"
          :key="c.key"
          class="ps-ch"


          :aria-disabled="genState !== 'ready'"
          :class="{ 'ps-ch--off': genState !== 'ready' }"
          role="button"
          :tabindex="genState === 'ready' ? 0 : -1"
          @click="onChannel(c)"

          @keydown.enter.prevent="onChannel(c)" @keydown.space.prevent="onChannel(c)"
        >
          <view class="ps-ch__ic">
            <view v-html="channelIcon(c.key)" />
          </view>
          <text class="ps-ch__lb">{{ channelLabel(c.key) }}</text><svg class="ps-ch__arrow" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>
        </view>
      </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/display-date";
import LiquidGlass from '@/components/liquid-glass.vue';
import { useLocaleStore } from '@/store/locale';
import { teamLogicCopy } from '@/i18n/team-logic-copy';
import { teamRedesignCopy } from '@/i18n/team-redesign';
import { formatAmount } from "@/lib/amount-display";
import { computed, getCurrentInstance, nextTick, onUnmounted, ref, watch } from "vue";
import qrcode from "qrcode-generator";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { displayNickname } from "@/lib/brand-copy";
import { remoteApiEnabled } from "@/api/runtime";
import { isActiveSlotDevice } from "@/lib/device-slot-policy";
import { useApp } from "@/store/app";
import { useConfig } from "@/store/config";
import { useProfile } from "@/store/profile";
import { toast } from "@/store/ui";
import { activateChannel, buildShareLink, copyText, currentShareReferralCode, notifyUnavailableShareLink } from "@/lib/share";
import type { ShareChannelDef, ShareChannelKey } from "@/store/config-types";
import { useDialogA11y } from "@/composables/use-dialog-a11y";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: "close"): void }>();

const t = useT();
const locale = useLocaleStore();
const logicCopy = computed(() => teamLogicCopy(locale.code));
const copy = computed(() => teamRedesignCopy(locale.code));
const app = useApp();
const cfg = useConfig();
const profile = useProfile();
const inst = getCurrentInstance();

type TplKey = "gift" | "yield" | "brand";
type GenState = "idle" | "generating" | "ready" | "failed";

const tpl = ref<TplKey>("brand");
const showUsername = ref(true);
const genState = ref<GenState>("idle");
const imgSrc = ref("");
const generatedLink = ref("");

const rewardEnabled = computed(() => cfg.config.rewards.enabled);
const giftUsdt = computed(() => rewardEnabled.value ? cfg.config.rewards.welcomeGift.usdtAmount : 0);
const giftNex = computed(() => rewardEnabled.value ? cfg.config.rewards.welcomeGift.nexAmount : 0);
const welcomeGiftAvailable = computed(() => rewardEnabled.value && (giftUsdt.value > 0 || giftNex.value > 0));
const posterRewardLine = computed(() => welcomeGiftAvailable.value
  ? fmt(t.value.share.posterRewardLine, { usd: formatAmount(giftUsdt.value), nex: formatAmount(giftNex.value) })
  : t.value.team.sharingStillAvailable);
const rewardEffectiveAtText = computed(() => {
  if (!welcomeGiftAvailable.value || !cfg.config.rewards.effectiveAt) return "";
  const date = formatDisplayDate(cfg.config.rewards.effectiveAt, locale.code);
  if (date === "—") return "";
  return fmt(t.value.share.posterRewardEffectiveAt, { date });
});

// 与 Earn 的设备位口径一致；远端设备清单未确认时不展示产出模板。
const fleetReady = computed(() => !remoteApiEnabled || app.remoteFleetStatus === "ready");
const runningDevices = computed(() => fleetReady.value
  ? app.visibleDevices.filter(isActiveSlotDevice).length : 0);
const yieldTodayUsdt = computed(() => {
  if (!remoteApiEnabled) return app.earnings.today;
  if (app.homeTruthStatus !== "ready") return null;
  const period = app.homeTruth?.earnings.today;
  if (!period) return null;
  if (period.usdt === null && period.nex === null && period.jobCount === null) return 0;
  return period.usdt ?? app.remoteRealizedToday?.usdt ?? null;
});
const yieldAuthorityReady = computed(() => fleetReady.value
  && (!remoteApiEnabled || app.homeTruthStatus === "ready"));
const yieldExportReady = computed(() => yieldAuthorityReady.value
  && runningDevices.value > 0 && yieldTodayUsdt.value !== null);

// yield 模板依赖用户真设备数据；gift 模板仅在 H8 奖励开启时可用。
const availableTpls = computed(() => {
  const list: { key: TplKey; label: string; tint: string }[] = [];
  if (welcomeGiftAvailable.value) list.push({ key: "gift", label: t.value.share.tplGift, tint: "var(--v5-brand)" });
  // A refresh can suspend the facts without revoking this account's selection.
  if (yieldExportReady.value || (tpl.value === "yield" && !yieldAuthorityReady.value)) list.push({ key: "yield", label: t.value.share.tplYield, tint: "var(--v5-tech-cyan)" });
  list.push({ key: "brand", label: t.value.share.tplBrand, tint: "var(--v5-warning)" });
  return list;
});

// 渠道行的链接渠道 = 配置里 web/scheme 型(与渠道面板同一 intent 实现)。
const linkChannels = computed<ShareChannelDef[]>(() =>
  cfg.config.share.channels.filter((c) => c.enabled && (c.intentType === "web" || c.intentType === "scheme")).slice(0, 4),
);
function channelLabel(key: ShareChannelKey): string {
  if (key === "sms") return t.value.share.smsLabel;
  return { zalo: "Zalo", telegram: "Telegram", whatsapp: "WhatsApp", messenger: "Messenger", x: "X" }[key as string] ?? key;
}
function channelIcon(key: ShareChannelKey): string {
  const wrap = (p: string) =>
    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  switch (key) {
    case "telegram":
      return wrap('<path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />');
    case "whatsapp":
      return wrap('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /><path d="M8.5 9.5c.5 2.5 3 5 5.5 5.5l1.5-1.5 2.5 1c-.5 1.5-2 2.5-3.5 2-3.5-1-6.5-4-7.5-7.5-.5-1.5.5-3 2-3.5l1 2.5z" />');
    case "sms":
      return wrap('<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" /><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />');
    case "x":
      return wrap('<path d="M4 4l16 16" /><path d="M20 4 4 20" />');
    case "messenger":
      return wrap('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /><path d="m8 12 3-3 2 2 3-3" />');
    default:
      return wrap('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /><path d="M9 10h6l-6 4h6" />');
  }
}

function pickTpl(k: TplKey) {
  if (tpl.value === k) return;
  tpl.value = k;
}
function toggleUsername() {
  showUsername.value = !showUsername.value;
}

// ── canvas 绘制 ─────────────────────────────────────────────────────────
const W = 345;
const H = 460;

// 海报 = 恒定深色画稿:全部颜色为画稿常量,不读运行时主题 token
// (主人 2026-07-08 拍板浅/深模式同一张海报;canvas 本就不解析 CSS var)。
const BRAND_ON_DARK = "#9EDC1D";

// 海报是深底,取品牌包的深底横版(与 App 内 BrandLockup 同一份资产)。
// canvas 画不了 <image> 组件,只能 drawImage;路径要先过 getImageInfo 拿本地 path(跨端一致做法),
// 拿到后**模块级缓存**,免得每次生成海报都重来一遍。
const BRAND_LOGO_SRC = "/static/img/brand/header-logo-dark.png";
let brandLogoPath = "";

/** 确保标已就绪。拿不到就 resolve —— 海报照出,品牌行走文字兜底,不因为一张图卡死。 */
function ensureBrandLogo(): Promise<void> {
  if (brandLogoPath) return Promise.resolve();
  return new Promise((resolve) => {
    uni.getImageInfo({
      src: BRAND_LOGO_SRC,
      success: (r) => { brandLogoPath = r.path; resolve(); },
      fail: () => resolve(),
    });
  });
}
const INK_ON_DARK = "#F5F7FA";
const MUTED_ON_DARK = "#A2A4A8";
const FAINT_ON_DARK = "#777A80";
const INVITE_ART_SRC = "/static/img/team-20261025/team-art-atlas.png";
let inviteArtPath = "";
function ensureInviteArt(): Promise<void> {
  if (inviteArtPath) return Promise.resolve();
  return new Promise(resolve => uni.getImageInfo({
    src: INVITE_ART_SRC,
    success: result => { inviteArtPath = result.path; resolve(); },
    fail: () => resolve(),
  }));
}

function paintInviteArt(ctx: UniApp.CanvasContext, x: number, y: number, size: number) {
  if (!inviteArtPath) return;
  // The invite artwork occupies the top-left tile of the approved 3×3 atlas.
  // Clip a scaled atlas using the common five-argument drawImage path on APP/H5.
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, size, size); ctx.clip();
  ctx.drawImage(inviteArtPath, x, y, size * 3, size * 3);
  ctx.restore();
}

function textWidth(ctx: UniApp.CanvasContext, value: string, size: number): number {
  const measured = ctx.measureText(value)?.width;
  return typeof measured === "number" && Number.isFinite(measured) ? measured
    : Array.from(value).reduce((width, char) => width + (char.charCodeAt(0) > 255 ? size : size * .58), 0);
}
function fitText(ctx: UniApp.CanvasContext, value: string, x: number, y: number, width: number, size: number, color: string) {
  ctx.setFillStyle(color); ctx.setFontSize(size);
  const measured = textWidth(ctx, value, size);
  if (measured > width) ctx.setFontSize(size * width / measured);
  ctx.fillText(value, x, y);
}
function wrapText(ctx: UniApp.CanvasContext, value: string, x: number, y: number, width: number, size: number, lineHeight: number, color: string) {
  const linesAtSize = (fontSize: number) => {
    ctx.setFontSize(fontSize);
    const lines: string[] = []; let line = "";
    const append = (token: string) => {
      if (line && textWidth(ctx, line + token, fontSize) > width) {
        lines.push(line.trim()); line = token.trimStart();
      } else line += token;
    };
    for (const token of value.split(/(\s+|[\u3400-\u9fff])/u).filter(Boolean)) {
      if (textWidth(ctx, token, fontSize) > width) Array.from(token).forEach(append);
      else append(token);
    }
    if (line) lines.push(line.trim());
    return lines;
  };
  let fontSize = size, lines = linesAtSize(fontSize);
  // The printed footer has a fixed two-line region. Fit the full localized text.
  while (lines.length > 2 && fontSize > 1) { fontSize *= .9; lines = linesAtSize(fontSize); }
  ctx.setFillStyle(color); ctx.setFontSize(fontSize);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
}

function paintQr(ctx: UniApp.CanvasContext, x: number, y: number, size: number, payload: string) {
  const qr = qrcode(0, "M");
  qr.addData(payload); qr.make();
  const n = qr.getModuleCount(), cell = size / (n + 8);
  // A complete four-module quiet zone stays separate from decoration and text.
  ctx.setFillStyle("#FFFFFF"); ctx.fillRect(x, y, size, size);
  ctx.setFillStyle("#000000");
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (qr.isDark(r, c)) ctx.fillRect(x + (c + 4) * cell, y + (r + 4) * cell, cell, cell);
  }
}

function ts(): string {
  return formatDisplayDateTime(Date.now(), locale.code);
}

function paint(link: string, myToken: number) {
  const ctx = uni.createCanvasContext("sharePosterCv", inst?.proxy);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#242629"); bg.addColorStop(1, "#101113");
  ctx.setFillStyle(bg); ctx.fillRect(0, 0, W, H);
  if (brandLogoPath) ctx.drawImage(brandLogoPath, 16, 10, 144, 144 * 246 / 712);
  else fitText(ctx, "UVEL", 20, 37, 120, 15, INK_ON_DARK);
  ctx.setTextAlign("right"); fitText(ctx, ts(), W - 20, 34, 150, 9, FAINT_ON_DARK); ctx.setTextAlign("left");

  const usd = formatAmount(giftUsdt.value), nex = formatAmount(giftNex.value);
  if (tpl.value === "gift") {
    fitText(ctx, t.value.share.posterGiftCap, 20, 76, W - 40, 11, MUTED_ON_DARK);
    fitText(ctx, fmt(t.value.share.posterGiftAmount, { usd, nex }), 20, 112, W - 40, 28, INK_ON_DARK);
    paintInviteArt(ctx, 85, 124, 174);
    wrapText(ctx, posterRewardLine.value, 20, 311, W - 40, 11, 15, MUTED_ON_DARK);
  } else if (tpl.value === "yield") {
    const today = yieldTodayUsdt.value;
    if (today === null) throw new Error("yield authority unavailable");
    fitText(ctx, logicCopy.value.posterYieldCap, 20, 76, W - 40, 11, MUTED_ON_DARK);
    fitText(ctx, `+${formatAmount(today)}`, 20, 117, W - 100, 36, INK_ON_DARK);
    fitText(ctx, "USDT", W - 65, 117, 45, 12, MUTED_ON_DARK);
    paintInviteArt(ctx, 85, 128, 164);
    fitText(ctx, fmt(t.value.share.posterYieldUnit, { n: runningDevices.value }), 20, 309, W - 40, 12, INK_ON_DARK);
    wrapText(ctx, welcomeGiftAvailable.value ? posterRewardLine.value : t.value.share.posterBrandSubNoReward,
      20, 328, W - 40, 10, 14, MUTED_ON_DARK);
  } else {
    fitText(ctx, copy.value.inviteFriends, 20, 89, W - 40, 28, INK_ON_DARK);
    paintInviteArt(ctx, 69, 108, 206);
    wrapText(ctx, welcomeGiftAvailable.value ? posterRewardLine.value : t.value.share.posterBrandSubNoReward,
      20, 325, W - 40, 11, 15, MUTED_ON_DARK);
  }

  ctx.setFillStyle("rgba(255,255,255,.12)"); ctx.fillRect(20, 352, W - 40, 1);
  if (showUsername.value && profile.displayName) {
    fitText(ctx, displayNickname(profile.displayName), 20, 379, 188, 12, INK_ON_DARK);
  }
  fitText(ctx, currentShareReferralCode(), 20, 401, 188, 12, BRAND_ON_DARK);
  wrapText(ctx, t.value.share.scanTipNoReward, 20, 422, 188, 9, 12, MUTED_ON_DARK);
  paintQr(ctx, W - 116, 358, 96, link);

  ctx.draw(false, () => {
    uni.canvasToTempFilePath(
      {
        canvasId: "sharePosterCv",
        destWidth: 750,
        destHeight: 1000,
        fileType: "png",
        success: (res) => {
          if (myToken !== genToken || !props.open || link !== buildShareLink()
              || (tpl.value === "yield" && !yieldExportReady.value)) return;
          imgSrc.value = res.tempFilePath;
          generatedLink.value = link;
          genState.value = "ready";
        },
        fail: () => {
          if (myToken !== genToken) return;
          genState.value = "failed";
        },
      },
      inst?.proxy,
    );
  });
}

// 生成序号守卫:快速切模板/开关/关面板时,只有最后一次生成有权写状态,
// 防过期 canvasToTempFilePath 回调覆盖当前海报(审计 P2 竞态)。
let genToken = 0;
function regenerate() {
  const link = buildShareLink();
  if (!link) {
    notifyUnavailableShareLink();
    emit("close");
    return;
  }
  const myToken = ++genToken;
  genState.value = "generating";
  imgSrc.value = "";
  generatedLink.value = "";
  if (tpl.value === "yield" && !yieldExportReady.value) {
    if (app.remoteFleetStatus === "error" || app.homeTruthStatus === "error") genState.value = "failed";
    return;
  }
  void nextTick(() => {
    // canvas 挂载/尺寸就绪缓冲;绘制异常一律落 failed(异常1,不白屏)。
    setTimeout(() => {
      if (myToken !== genToken || !props.open) return;
      // 标先备好再画:paint 是同步的,中途插异步会打乱绘制顺序。
      // 异步回来要重新核 token —— 这期间用户可能已经切模板/关面板(沿用既有防竞态口径)。
      void Promise.all([ensureBrandLogo(), ensureInviteArt()]).then(() => {
        if (myToken !== genToken || !props.open || link !== buildShareLink()) return;
        try {
          paint(link, myToken);
        } catch {
          if (myToken === genToken) genState.value = "failed";
        }
      });
    }, 80);
  });
}

watch(
  [
    () => props.open, () => tpl.value, () => showUsername.value, () => buildShareLink(),
    () => showUsername.value ? profile.displayName : null,
    // Only the yield drawing depends on fleet/earnings authority. Compare source
    // values individually so a poll retaining the same link cannot clear ready art.
    () => tpl.value === "yield" ? runningDevices.value : null,
    () => tpl.value === "yield" ? yieldTodayUsdt.value : null,
    () => tpl.value === "yield" ? app.remoteFleetStatus : null,
    () => tpl.value === "yield" ? app.homeTruthStatus : null,
    () => giftUsdt.value, () => giftNex.value, () => rewardEnabled.value, () => locale.code,
  ],
  ([open]) => {
    if (open) {
      regenerate();
    } else {
      // 关面板即作废在途生成,防复开时旧回调闪写。
      genToken++;
      genState.value = "idle";
      generatedLink.value = "";
    }
  },
);
watch(() => props.open, (open) => {
  if (!open || !remoteApiEnabled) return;
  void app.refreshRemoteFleet(undefined, { coalesce: true });
  void app.refreshHomeTruth();
});
// 当前模板失效时回落到仍可用的首个模板。
watch(availableTpls, (list) => {
  if (!list.some((x) => x.key === tpl.value)) tpl.value = list[0]?.key ?? "brand";
});
function invalidatePoster() {
  genToken++;
  genState.value = "idle";
  imgSrc.value = "";
  generatedLink.value = "";
}
watch(() => [app.accountKey, app.accountBindingEpoch] as const, () => {
  invalidatePoster();
  tpl.value = "brand";
  if (props.open) emit("close");
}, { flush: "sync" });
onUnmounted(invalidatePoster);

// ── 动作 ────────────────────────────────────────────────────────────────
function posterLinkReady(): boolean {
  if (!props.open || genState.value !== "ready"
      || (tpl.value === "yield" && !yieldExportReady.value)) return false;
  const link = buildShareLink();
  if (!link) {
    notifyUnavailableShareLink();
    return false;
  }
  if (link !== generatedLink.value) {
    regenerate();
    return false;
  }
  return true;
}
let saving = false;
function saveImage() {
  if (!posterLinkReady() || saving) return;
  const operation = { token: genToken, accountKey: app.accountKey, epoch: app.accountBindingEpoch,
    link: generatedLink.value, image: imgSrc.value };
  const isCurrentSave = () => operation.token === genToken && operation.accountKey === app.accountKey
    && operation.epoch === app.accountBindingEpoch && operation.link === generatedLink.value
    && operation.image === imgSrc.value && posterLinkReady();
  saving = true;
  setTimeout(() => (saving = false), 900);
  // #ifdef H5
  void (async () => {
    try {
      const blob = await (await fetch(operation.image)).blob();
      if (!isCurrentSave()) return;
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = `nexgrid-invite-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
      toast.success(t.value.share.saved);
    } catch {
      // 异常2:下载受限 → 长按引导
      if (isCurrentSave()) toast.info(t.value.share.saveLongPress);
    }
  })();
  // #endif
  // #ifndef H5
  uni.saveImageToPhotosAlbum({
    filePath: operation.image,
    success: () => {
      if (isCurrentSave()) toast.success(t.value.share.saved);
    },
    fail: () => { if (isCurrentSave()) toast.info(t.value.share.saveLongPress); },
  });
  // #endif
}

async function copyLinkAction() {
  if (!posterLinkReady()) return;
  const operation = genToken, link = generatedLink.value;
  const ok = await copyText(link);
  if (operation !== genToken || link !== generatedLink.value || !posterLinkReady()) return;
  if (ok) {
    toast.success(t.value.team.inviteLinkCopied);
  } else {
    toast.info(t.value.share.copyFailed);
  }
}

async function onChannel(c: ShareChannelDef) {
  if (!posterLinkReady()) return;
  await activateChannel(c, "poster_sheet", channelLabel(c.key));
}

useDialogA11y(computed(() => props.open), ".ps-root", () => emit("close"));

import GlassSegments from "@/components/glass-segments.vue";
const templateOptions = computed(() => availableTpls.value.map(item => ({ value: item.key, label: item.label, className: "ps-thumb" })));
</script>

<style scoped>
.ps-mask { position: fixed; inset: 0; background: var(--v5-bg-color-mask); backdrop-filter: blur(3px); z-index: 8000; }
.ps-sheet { border-radius: var(--nx-glass-radius) var(--nx-glass-radius) 0 0; box-shadow: var(--nx-glass-edge); position: fixed; left: 0; right: 0; bottom: 0; z-index: 8001; background: var(--nx-glass-fill); border: none; display: flex; flex-direction: column; max-height: min(92vh, calc(100vh - var(--nx-overlay-top))); overflow: hidden; box-sizing: border-box; padding-bottom: var(--nx-overlay-safe-bottom); animation: ps-up 0.28s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes ps-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
.ps-grab { flex-shrink: 0; width: 40px; height: 4px; border-radius: 9999px; background: var(--v5-surface-3); margin: var(--ui-space-row-y) auto 0; }
.ps-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--ui-space-row-y) 20px; }
.ps-body { min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; padding-bottom: 8px; }
.ps-head__t { font-family: var(--font-v5); font-size: 20px; font-weight: 600; color: var(--v5-ink); }
/* 44×44 点按区(移动端最小触控标准,对齐 tradein-ladder-sheet 既有修法)。 */
.ps-head__x { position: relative; isolation: isolate; flex: none; width: 44px; height: 44px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; }
.ps-head__x svg { position: relative; }
.ps-stage { position: relative; width: calc(100% - 40px); max-width: 345px; margin: var(--ui-space-row-y) auto 0; }
/* 离屏画布:保持渲染供 draw/导出,视觉上移出视口 */
.ps-canvas { position: absolute; left: -9999px; top: 0; width: 345px; height: 460px; }
/* 海报卡恒定深色画稿:边框/投影用固定色不随主题,把卡从 sheet 底上抬起(主人 2026-07-08)。 */
.ps-preview { border-radius: 16px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.14); box-shadow: 0 10px 28px rgba(0, 0, 0, .25); }
.ps-preview__img { width: 100%; display: block; }
.ps-skeleton { aspect-ratio: 3 / 4; border-radius: 16px; background: var(--v5-surface-2); display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
.ps-skeleton::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--v5-ink) 5%, transparent), transparent); animation: ps-shim 1.1s infinite; }
@keyframes ps-shim { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
.ps-skeleton__t { font-size: 12px; color: var(--v5-ink-4); }
.ps-fail { aspect-ratio: 3 / 4; border-radius: 16px; background: var(--v5-surface-2); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--ui-space-row-y); }
.ps-fail__t { font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-3); }
.ps-fail__btn { position: relative; isolation: isolate; min-height: 44px; padding: 0 18px; border-radius: 9999px; display: flex; align-items: center; }
.ps-fail__btn-t { position: relative; font: 600 13px/20px var(--font-v5); color: var(--v5-ink); }
.ps-thumbs { margin: var(--ui-space-inline) 16px 0; }
.ps-reward { margin-top: var(--ui-space-row-y); text-align: center; padding: 0 16px; }
.ps-reward__t { display: block; line-height: 1.6; overflow-wrap: anywhere; font-size: 12px; color: var(--v5-ink-3); text-wrap: pretty; }
.ps-toggle { display: flex; align-items: center; justify-content: space-between; margin: var(--ui-space-row-y) 18px 0; min-height: 44px; }
.ps-toggle__lb { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-2); }
.ps-sw { flex: none; width: 44px; height: 26px; border-radius: 9999px; background: var(--v5-surface-3); position: relative; transition: background 0.18s; }
.ps-sw--on { background: var(--v5-brand); }
.ps-sw__knob { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 9999px; background: var(--v5-surface); transition: left 0.18s; }
.ps-sw--on .ps-sw__knob { left: 21px; }
.ps-chrow { margin: var(--ui-space-inset) 20px 10px; }
.ps-ch { display: flex; align-items: center; gap: var(--ui-space-inline); min-height: 58px; padding: var(--ui-space-row-y) 0; border-top: 1px solid var(--v5-border); color: var(--v5-ink); }
.ps-ch--off { opacity: .4; cursor: default; }
.ps-ch__ic,.ps-ch__arrow { flex: none; display: flex; align-items: center; justify-content: center; }
.ps-ch__lb { flex: 1; min-width: 0; font: 500 14px/1.5 var(--font-v5); color: var(--v5-ink); overflow-wrap: anywhere; }
.ps-sheet [tabindex="0"]:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .ps-sheet,.ps-skeleton::after { animation: none; } .ps-sw,.ps-sw__knob { transition: none; } }
</style>
