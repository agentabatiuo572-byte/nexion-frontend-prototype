<!--
  [FEAT-SHARE2] 邀请海报面板 — 全屏 sheet:canvas 海报(真二维码)+ 模板轮播 +
  展示用户名开关 + 被邀方奖励说明 + 渠道行(保存/复制/发链接)。
  规格: PRD/specs/FEAT-SHARE01-invite-chain.md [FEAT-SHARE2];交互骨架参考 OKX
  分享(模板缩略图 + 底部渠道行 + 自定义开关),内容按本项目功能。
  二维码 payload = lib/share.buildShareLink 单源(qrcode-generator 真码,可扫);
  海报只承载被邀方向价值($5+20NEX,config 派生),禁印邀请人向数字(⑦)。
  状态机: idle → generating → ready | failed(重试);generating/failed 禁保存与分享。
  canvas 颜色说明: 海报 = 恒定深色画稿(主人 2026-07-08 拍板:浅/深模式同一张
  海报,不随 app 主题变),全部颜色为画稿常量,不读运行时 token。
-->
<template>
  <view v-if="open">
    <view class="ps-mask" @click="emit('close')" />
    <view class="ps-sheet">
      <view class="ps-grab" />
      <view class="ps-head">
        <text class="ps-head__t">{{ t.share.posterTitle }}</text>
        <view class="ps-head__x active:opacity-70" @click="emit('close')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </view>
      </view>

      <view class="ps-stage">
        <!-- 画布(随面板 v-if 挂载/销毁;draw 后导出预览图,自身移出视口不占布局) -->
        <canvas canvas-id="sharePosterCv" id="sharePosterCv" class="ps-canvas" />
        <view v-if="genState === 'ready'" class="ps-preview">
          <image :src="imgSrc" mode="widthFix" class="ps-preview__img" />
        </view>
        <view v-else-if="genState === 'failed'" class="ps-fail">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
          <text class="ps-fail__t">{{ t.share.genFailed }}</text>
          <view class="ps-fail__btn active:opacity-80" @click="regenerate">
            <text class="ps-fail__btn-t">{{ t.share.retry }}</text>
          </view>
        </view>
        <view v-else class="ps-skeleton">
          <text class="ps-skeleton__t">{{ t.share.generating }}</text>
        </view>
      </view>

      <!-- 模板轮播(yield 无设备自动隐藏,异常3) -->
      <view class="ps-thumbs">
        <view
          v-for="tp in availableTpls"
          :key="tp.key"
          class="ps-thumb active:scale-95"
          :class="{ 'ps-thumb--on': tpl === tp.key }"
          @click="pickTpl(tp.key)"
        >
          <view class="ps-thumb__dot" :style="{ background: tp.tint }" />
          <text class="ps-thumb__t">{{ tp.label }}</text>
        </view>
      </view>

      <view class="ps-reward">
        <text class="ps-reward__t">{{ posterRewardLine }}</text>
      </view>

      <view class="ps-toggle">
        <text class="ps-toggle__lb">{{ t.share.showUsername }}</text>
        <view class="ps-sw active:opacity-70" :class="{ 'ps-sw--on': showUsername }" @click="toggleUsername">
          <view class="ps-sw__knob" />
        </view>
      </view>

      <!-- 渠道行:保存 / 复制 + 链接渠道(与渠道面板同一 intent 实现) -->
      <view class="ps-chrow">
        <view class="ps-ch active:scale-95" :class="{ 'ps-ch--off': genState !== 'ready' }" @click="saveImage">
          <view class="ps-ch__ic ps-ch__ic--hl">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3" /><path d="m7 10 5 5 5-5" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /></svg>
          </view>
          <text class="ps-ch__lb">{{ t.share.saveImage }}</text>
        </view>
        <view class="ps-ch active:scale-95" :class="{ 'ps-ch--off': genState !== 'ready' }" @click="copyLinkAction">
          <view class="ps-ch__ic ps-ch__ic--hl">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
          </view>
          <text class="ps-ch__lb">{{ t.share.copyLink }}</text>
        </view>
        <view
          v-for="c in linkChannels"
          :key="c.key"
          class="ps-ch active:scale-95"
          :class="{ 'ps-ch--off': genState !== 'ready' }"
          @click="onChannel(c)"
        >
          <view class="ps-ch__ic">
            <view v-html="channelIcon(c.key)" />
          </view>
          <text class="ps-ch__lb">{{ channelLabel(c.key) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, ref, watch } from "vue";
import qrcode from "qrcode-generator";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useApp } from "@/store/app";
import { useConfig } from "@/store/config";
import { useProfile } from "@/store/profile";
import { toast } from "@/store/ui";
import { activateChannel, buildShareLink, copyText, currentShareReferralCode, recordShareEvent } from "@/lib/share";
import type { ShareChannelDef, ShareChannelKey } from "@/store/config-types";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: "close"): void }>();

const t = useT();
const app = useApp();
const cfg = useConfig();
const profile = useProfile();
const inst = getCurrentInstance();

type TplKey = "gift" | "yield" | "brand";
type GenState = "idle" | "generating" | "ready" | "failed";

const tpl = ref<TplKey>("gift");
const showUsername = ref(true);
const genState = ref<GenState>("idle");
const imgSrc = ref("");

const giftUsdt = computed(() => cfg.config.rewards.welcomeGift.usdtAmount);
const giftNex = computed(() => cfg.config.rewards.welcomeGift.nexAmount);
const posterRewardLine = computed(() => fmt(t.value.share.posterRewardLine, { usd: giftUsdt.value, nex: giftNex.value }));

// yield 模板依赖用户真设备数据;无设备自动隐藏(异常3),gift/brand 恒可用。
const availableTpls = computed(() => {
  const list: { key: TplKey; label: string; tint: string }[] = [
    { key: "gift", label: t.value.share.tplGift, tint: "var(--v5-brand)" },
  ];
  if (app.devices.length > 0) list.push({ key: "yield", label: t.value.share.tplYield, tint: "var(--v5-tech-cyan)" });
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
const ON_BRAND_DARK = "#0A0A0A";
const CYAN_ON_DARK = "#8E72FF";
const INK_ON_DARK = "#F5F7FA";
const MUTED_ON_DARK = "#9AA3B2";
const FAINT_ON_DARK = "#6B7280";

function roundRect(ctx: UniApp.CanvasContext, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 画稿贴纸常量:金币(金色系)/ 钞票(美钞绿,brand 同族偏深),营销画面固有色。
const COIN_FACE = "#F0C558";
const COIN_RIM = "#C9992F";
const COIN_MARK = "#8F6B1D";
const NOTE_FACE = "#79B94E";
const NOTE_TRIM = "#3F6B2A";
const NOTE_MARK = "#DFF0CC";

function paintCoin(ctx: UniApp.CanvasContext, cx: number, cy: number, r: number, alpha: number) {
  ctx.save();
  ctx.setGlobalAlpha(alpha);
  ctx.setFillStyle(COIN_FACE);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.setStrokeStyle(COIN_RIM);
  ctx.setLineWidth(Math.max(1.5, r * 0.11));
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.74, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setFillStyle(COIN_MARK);
  ctx.setFontSize(r * 0.92);
  ctx.setTextAlign("center");
  ctx.fillText("$", cx, cy + r * 0.33);
  ctx.restore();
  ctx.setTextAlign("left");
}

function paintBanknote(ctx: UniApp.CanvasContext, cx: number, cy: number, w: number, h: number, rot: number, alpha: number) {
  ctx.save();
  ctx.setGlobalAlpha(alpha);
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.setFillStyle(NOTE_FACE);
  roundRect(ctx, -w / 2, -h / 2, w, h, 5);
  ctx.fill();
  ctx.setStrokeStyle(NOTE_TRIM);
  ctx.setLineWidth(1.2);
  roundRect(ctx, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 3);
  ctx.stroke();
  ctx.setFillStyle(NOTE_TRIM);
  ctx.beginPath();
  ctx.arc(0, 0, h * 0.27, 0, Math.PI * 2);
  ctx.fill();
  ctx.setFillStyle(NOTE_MARK);
  ctx.setFontSize(h * 0.4);
  ctx.setTextAlign("center");
  ctx.fillText("$", 0, h * 0.14);
  ctx.restore();
  ctx.setTextAlign("left");
}

function paintQr(ctx: UniApp.CanvasContext, x: number, y: number, size: number, payload: string) {
  const qr = qrcode(0, "M");
  qr.addData(payload);
  qr.make();
  const n = qr.getModuleCount();
  ctx.setFillStyle("#FFFFFF");
  roundRect(ctx, x - 6, y - 6, size + 12, size + 12, 8);
  ctx.fill();
  const cell = size / n;
  ctx.setFillStyle("#000000");
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(x + c * cell, y + r * cell, cell + 0.4, cell + 0.4);
    }
  }
}

function ts(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function paint(link: string, myToken: number) {
  const ctx = uni.createCanvasContext("sharePosterCv", inst?.proxy);
  const brand = BRAND_ON_DARK;
  const onBrand = ON_BRAND_DARK;
  const cyan = CYAN_ON_DARK;

  // 底:暗色画稿渐变
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#101510");
  bg.addColorStop(0.55, "#0B0B10");
  bg.addColorStop(1, "#12101A");
  ctx.setFillStyle(bg);
  ctx.fillRect(0, 0, W, H);

  // 背景质感层(内容之下):brand/紫双光晕 + 细点阵 + 金币/钞票贴纸 + 底栏 hairline。
  // 光晕 rgba = BRAND_ON_DARK/CYAN_ON_DARK 的十进制展开,改常量时须同步这两处。
  const auroraTop = ctx.createCircularGradient(W - 44, 52, 190);
  auroraTop.addColorStop(0, "rgba(158, 220, 29, 0.16)");
  auroraTop.addColorStop(1, "rgba(158, 220, 29, 0)");
  ctx.setFillStyle(auroraTop);
  ctx.fillRect(0, 0, W, H);
  const auroraBot = ctx.createCircularGradient(34, H - 92, 170);
  auroraBot.addColorStop(0, "rgba(142, 114, 255, 0.13)");
  auroraBot.addColorStop(1, "rgba(142, 114, 255, 0)");
  ctx.setFillStyle(auroraBot);
  ctx.fillRect(0, 0, W, H);
  ctx.setFillStyle("rgba(245, 247, 250, 0.045)");
  for (let gy = 24; gy < H - 18; gy += 22) {
    for (let gx = 18; gx < W - 12; gx += 22) {
      ctx.fillRect(gx, gy, 1.2, 1.2);
    }
  }
  paintCoin(ctx, W - 24, H * 0.4, 44, 0.16);
  paintCoin(ctx, W - 82, H * 0.29, 19, 0.13);
  paintBanknote(ctx, W - 58, H * 0.53, 96, 50, -0.3, 0.15);
  ctx.setFillStyle("rgba(245, 247, 250, 0.08)");
  ctx.fillRect(16, H - 112, W - 32, 1);

  // 品牌行
  ctx.setFillStyle(brand);
  roundRect(ctx, 16, 14, 20, 20, 6);
  ctx.fill();
  ctx.setFillStyle(onBrand);
  ctx.setFontSize(11);
  ctx.setTextAlign("center");
  ctx.fillText("N", 26, 28);
  ctx.setTextAlign("left");
  ctx.setFillStyle(INK_ON_DARK);
  ctx.setFontSize(13);
  ctx.fillText("NexGrid", 42, 28);
  ctx.setFillStyle(FAINT_ON_DARK);
  ctx.setFontSize(9);
  ctx.setTextAlign("right");
  ctx.fillText(ts(), W - 16, 27);
  ctx.setTextAlign("left");

  // 模板中段
  const usd = giftUsdt.value;
  const nex = giftNex.value;
  if (tpl.value === "gift") {
    ctx.setFillStyle(brand);
    ctx.setFontSize(10);
    ctx.fillText(t.value.share.posterGiftCap, 20, 168);
    ctx.setFillStyle(INK_ON_DARK);
    ctx.setFontSize(26);
    ctx.fillText(fmt(t.value.share.posterGiftTitle, { usd, nex }), 20, 206);
    ctx.setFillStyle(brand);
    ctx.setFontSize(28);
    ctx.fillText(fmt(t.value.share.posterGiftAmount, { usd, nex }), 20, 244);
    ctx.setFillStyle(MUTED_ON_DARK);
    ctx.setFontSize(11);
    ctx.fillText(t.value.share.posterGiftSub1, 20, 272);
    ctx.fillText(t.value.share.posterGiftSub2, 20, 290);
  } else if (tpl.value === "yield") {
    ctx.setFillStyle(brand);
    ctx.setFontSize(10);
    ctx.fillText(t.value.share.posterYieldCap, 20, 158);
    ctx.setFillStyle(MUTED_ON_DARK);
    ctx.setFontSize(12);
    ctx.fillText(t.value.share.posterYieldSub, 20, 184);
    ctx.setFillStyle(brand);
    ctx.setFontSize(38);
    ctx.fillText(`+$${app.earnings.today.toFixed(2)}`, 20, 232);
    ctx.setFillStyle(FAINT_ON_DARK);
    ctx.setFontSize(9.5);
    ctx.fillText(t.value.share.posterYieldDevices, 20, 262);
    ctx.fillText(t.value.share.posterYieldYou, 110, 262);
    ctx.setFillStyle(INK_ON_DARK);
    ctx.setFontSize(12.5);
    ctx.fillText(fmt(t.value.share.posterYieldUnit, { n: app.devices.length }), 20, 280);
    ctx.setFillStyle(brand);
    ctx.fillText(`$${usd} + ${nex} NEX`, 110, 280);
  } else {
    ctx.setFillStyle(cyan);
    ctx.setFontSize(10);
    ctx.fillText(t.value.share.posterBrandCap, 20, 168);
    ctx.setFillStyle(INK_ON_DARK);
    ctx.setFontSize(26);
    ctx.fillText(t.value.share.posterBrandTitle1, 20, 206);
    ctx.fillText(t.value.share.posterBrandTitle2, 20, 240);
    ctx.setFillStyle(MUTED_ON_DARK);
    ctx.setFontSize(11);
    ctx.fillText(fmt(t.value.share.posterBrandSub, { usd, nex }), 20, 270);
  }

  // 底栏:用户名(可关)+ 邀请码 + 扫码提示 + 真二维码
  const footY = H - 96;
  if (showUsername.value && profile.displayName) {
    ctx.setFillStyle(INK_ON_DARK);
    ctx.setFontSize(12);
    // 18 = 词库昵称最长组合("Quantum Circuit 99");QR 前可用宽 ~250px,12 号字放得下,仅防异常超长。
    const name = profile.displayName.length > 18 ? `${profile.displayName.slice(0, 18)}…` : profile.displayName;
    ctx.fillText(name, 20, footY + 18);
  }
  ctx.setFillStyle(BRAND_ON_DARK);
  ctx.setFontSize(11);
  ctx.fillText(currentShareReferralCode(), 20, footY + 40);
  ctx.setFillStyle(FAINT_ON_DARK);
  ctx.setFontSize(8.5);
  ctx.fillText(t.value.share.scanTip, 20, footY + 58);
  paintQr(ctx, W - 94, footY - 2, 74, link);

  ctx.draw(false, () => {
    uni.canvasToTempFilePath(
      {
        canvasId: "sharePosterCv",
        destWidth: 750,
        destHeight: 1000,
        fileType: "png",
        success: (res) => {
          if (myToken !== genToken) return;
          imgSrc.value = res.tempFilePath;
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
    toast.info(t.value.share.noCodeYet);
    emit("close");
    return;
  }
  const myToken = ++genToken;
  genState.value = "generating";
  void nextTick(() => {
    // canvas 挂载/尺寸就绪缓冲;绘制异常一律落 failed(异常1,不白屏)。
    setTimeout(() => {
      if (myToken !== genToken || !props.open) return;
      try {
        paint(link, myToken);
      } catch {
        if (myToken === genToken) genState.value = "failed";
      }
    }, 80);
  });
}

watch(
  () => [props.open, tpl.value, showUsername.value] as const,
  ([open]) => {
    if (open) {
      regenerate();
    } else {
      // 关面板即作废在途生成,防复开时旧回调闪写。
      genToken++;
      genState.value = "idle";
    }
  },
);
// 打开时若 yield 模板已不可用(设备清空),回落 gift。
watch(availableTpls, (list) => {
  if (!list.some((x) => x.key === tpl.value)) tpl.value = "gift";
});

// ── 动作 ────────────────────────────────────────────────────────────────
let saving = false;
function saveImage() {
  if (genState.value !== "ready" || saving) return;
  saving = true;
  setTimeout(() => (saving = false), 900);
  // #ifdef H5
  void (async () => {
    try {
      const blob = await (await fetch(imgSrc.value)).blob();
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = `nexgrid-invite-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
      toast.success(t.value.share.saved);
      recordShareEvent("poster", "poster_sheet");
    } catch {
      // 异常2:下载受限 → 长按引导
      toast.info(t.value.share.saveLongPress);
    }
  })();
  // #endif
  // #ifndef H5
  uni.saveImageToPhotosAlbum({
    filePath: imgSrc.value,
    success: () => {
      toast.success(t.value.share.saved);
      recordShareEvent("poster", "poster_sheet");
    },
    fail: () => toast.info(t.value.share.saveLongPress),
  });
  // #endif
}

async function copyLinkAction() {
  if (genState.value !== "ready") return;
  const ok = await copyText(buildShareLink());
  if (ok) {
    toast.success(t.value.team.inviteLinkCopied);
    recordShareEvent("copy", "poster_sheet");
  } else {
    toast.info(t.value.share.copyFailed);
  }
}

async function onChannel(c: ShareChannelDef) {
  if (genState.value !== "ready") return;
  await activateChannel(c, "poster_sheet", channelLabel(c.key));
}
</script>

<style scoped>
.ps-mask { position: fixed; inset: 0; background: var(--v5-bg-color-mask); backdrop-filter: blur(3px); z-index: 8000; }
.ps-sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 8001; background: var(--v5-surface); border-top: 1px solid var(--v5-border-strong); border-radius: 22px 22px 0 0; max-height: 92vh; overflow-y: auto; padding-bottom: calc(env(safe-area-inset-bottom) + 38px); animation: ps-up 0.28s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes ps-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
.ps-grab { width: 40px; height: 4px; border-radius: 9999px; background: var(--v5-surface-3); margin: 10px auto 0; }
.ps-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px 0; }
.ps-head__t { font-family: var(--font-v5); font-size: 15px; font-weight: 600; color: var(--v5-ink); }
/* 44×44 点按区(移动端最小触控标准,对齐 tradein-ladder-sheet 既有修法)。 */
.ps-head__x { width: 44px; height: 44px; border-radius: 9999px; background: var(--v5-surface-2); display: flex; align-items: center; justify-content: center; }
.ps-stage { position: relative; margin: 12px 16px 0; }
/* 离屏画布:保持渲染供 draw/导出,视觉上移出视口 */
.ps-canvas { position: absolute; left: -9999px; top: 0; width: 345px; height: 460px; }
/* 海报卡恒定深色画稿:边框/投影用固定色不随主题,把卡从 sheet 底上抬起(主人 2026-07-08)。 */
.ps-preview { border-radius: 16px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.14); box-shadow: 0 14px 36px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.3); }
.ps-preview__img { width: 100%; display: block; }
.ps-skeleton { aspect-ratio: 3 / 4; border-radius: 16px; background: var(--v5-surface-2); display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
.ps-skeleton::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--v5-ink) 5%, transparent), transparent); animation: ps-shim 1.1s infinite; }
@keyframes ps-shim { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
.ps-skeleton__t { font-size: 12px; color: var(--v5-ink-4); }
.ps-fail { aspect-ratio: 3 / 4; border-radius: 16px; background: var(--v5-surface-2); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
.ps-fail__t { font-size: 13px; color: var(--v5-ink-3); }
.ps-fail__btn { min-height: 36px; padding: 0 18px; border-radius: 9999px; background: var(--v5-surface-3); display: flex; align-items: center; }
.ps-fail__btn-t { font-size: 13px; color: var(--v5-ink); }
.ps-thumbs { display: flex; justify-content: center; gap: 8px; margin-top: 12px; padding: 0 16px; }
.ps-thumb { display: flex; align-items: center; gap: 6px; min-height: 32px; padding: 6px 12px; border-radius: 9999px; background: var(--v5-surface-2); opacity: 0.6; }
.ps-thumb--on { opacity: 1; outline: 2px solid var(--v5-brand); outline-offset: 1px; }
.ps-thumb__dot { width: 8px; height: 8px; border-radius: 9999px; }
.ps-thumb__t { font-size: 12px; color: var(--v5-ink-2); }
.ps-reward { margin-top: 10px; text-align: center; padding: 0 16px; }
.ps-reward__t { font-size: 12px; color: var(--v5-ink-3); text-wrap: pretty; }
.ps-toggle { display: flex; align-items: center; justify-content: space-between; margin: 10px 18px 0; min-height: 32px; }
.ps-toggle__lb { font-size: 13px; color: var(--v5-ink-2); }
.ps-sw { width: 44px; height: 26px; border-radius: 9999px; background: var(--v5-surface-3); position: relative; transition: background 0.18s; }
.ps-sw--on { background: var(--v5-brand); }
.ps-sw__knob { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 9999px; background: var(--v5-surface); transition: left 0.18s; }
.ps-sw--on .ps-sw__knob { left: 21px; }
.ps-chrow { display: flex; gap: 14px; overflow-x: auto; padding: 14px 16px 2px; }
.ps-ch { display: flex; flex-direction: column; align-items: center; gap: 6px; flex-shrink: 0; width: 56px; min-height: 44px; }
.ps-ch--off { opacity: 0.4; pointer-events: none; }
.ps-ch__ic { width: 48px; height: 48px; border-radius: 9999px; background: var(--v5-surface-2); color: var(--v5-ink-2); display: flex; align-items: center; justify-content: center; }
.ps-ch__ic--hl { background: color-mix(in srgb, var(--v5-brand) 14%, transparent); color: var(--v5-brand); }
.ps-ch__lb { font-size: 12px; color: var(--v5-ink-3); max-width: 60px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
