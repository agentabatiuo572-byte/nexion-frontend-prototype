<template>
  <StandalonePageShell class="intro-root">
    <!-- Backdrop: radial brand glow (center above page top) -->
    <view class="intro-glow" />
    <!-- Top-blend vignette under header edge -->
    <view class="intro-vignette" />
    <!-- Lime dot grid -->
    <view class="intro-dotgrid dot-grid" />

    <!-- Floating nodes (deterministic positions) -->
    <view
      v-for="(p, i) in positions"
      :key="i"
      class="intro-node pulse-node"
      :style="{ top: p.top, left: p.left, transform: `scale(${p.scale})`, animationDelay: p.delay + 's' }"
    />

    <!-- Centerpiece -->
    <view class="intro-content">
      <!-- Language entry (top-right; opens in-place sheet — onboarding 不离开漏斗,不进 App 壳) -->
      <view
        class="intro-lang active:scale-[0.96] active:opacity-80"
        role="button"
        tabindex="0"
        :aria-label="t.language.pageTitle"
        @click="langOpen = true"

        @keydown.enter.prevent="langOpen = true" @keydown.space.prevent="langOpen = true"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <text class="intro-lang__code">{{ locale.code.toUpperCase() }}</text>
      </view>
      <view class="intro-orb-area">
        <view class="intro-orb anim-orb">
          <view class="orb-glow" />
          <svg viewBox="0 0 240 240" class="orb-svg" aria-hidden="true">
            <defs>
              <radialGradient id="orb-core" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="var(--v5-brand)" stop-opacity="0.55" />
                <stop offset="55%" stop-color="var(--v5-brand)" stop-opacity="0.12" />
                <stop offset="100%" stop-color="var(--v5-brand)" stop-opacity="0" />
              </radialGradient>
              <filter id="orb-soft" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1.2" />
              </filter>
            </defs>

            <!-- Outer dashed orbit -->
            <!-- 轨道线走 border 档:此前用 surface-2,浅色档它接近白,压在米色底上几乎看不见 -->
            <circle cx="120" cy="120" r="108" fill="none" stroke="var(--v5-border-strong)" stroke-width="1" stroke-dasharray="2 5" />

            <!-- 4 fixed satellites -->
            <g v-for="(s, i) in satellites" :key="`sat-${i}`">
              <circle :cx="s.x" :cy="s.y" r="6" fill="var(--v5-brand)" opacity="0.12" filter="url(#orb-soft)" />
              <circle :cx="s.x" :cy="s.y" r="2.4" fill="var(--v5-brand)" opacity="0.75">
                <animate attributeName="opacity" values="0.75;0.3;0.75" :dur="`${2.2 + i * 0.4}s`" repeatCount="indefinite" />
              </circle>
            </g>

            <!-- Active orbiting node + comet halo -->
            <g>
              <circle r="7" fill="var(--v5-brand)" opacity="0.25">
                <animateMotion dur="9s" repeatCount="indefinite" :path="orbitPath" rotate="auto" />
              </circle>
              <circle r="3.4" fill="var(--v5-brand)">
                <animateMotion dur="9s" repeatCount="indefinite" :path="orbitPath" rotate="auto" />
              </circle>
            </g>

            <!-- Expanding pulse rings (2× staggered) -->
            <circle cx="120" cy="120" r="36" fill="none" stroke="var(--v5-brand)" stroke-width="1.4">
              <animate attributeName="r" from="36" to="92" dur="2.6s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.55;0;0" keyTimes="0;0.75;1" dur="2.6s" repeatCount="indefinite" />
            </circle>
            <circle cx="120" cy="120" r="36" fill="none" stroke="var(--v5-brand)" stroke-width="1.4">
              <animate attributeName="r" from="36" to="92" dur="2.6s" begin="1.3s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.55;0;0" keyTimes="0;0.75;1" dur="2.6s" begin="1.3s" repeatCount="indefinite" />
            </circle>

            <!-- Middle thin ring —— 此前写死一个深灰色号,浅色档就是那圈扎眼的黑环。
                 取 border(不是 border-strong):原值在黑底上几乎看不见,是「结构线」不是「装饰线」,
                 轨道的视觉重量该留给 brand 色的卫星与脉冲环。 -->
            <circle cx="120" cy="120" r="72" fill="none" stroke="var(--v5-border)" stroke-width="1" />
            <!-- Center radial glow -->
            <circle cx="120" cy="120" r="56" fill="url(#orb-core)" />

          </svg>
          <!-- 中心品牌标(走 BrandLockup,全站 logo 的唯一出口)。
               🔴 不能放进上面的 SVG:uni 编译器会把 <image> 劫持成 uni-image 组件,落在 SVG 命名空间里
               完全不渲染(实测 0×0)。改为容器内绝对定位叠加,60/240 = 25% 居中。 -->
          <view class="orb-appicon-wrap">
            <BrandLockup variant="mark" :height="60" />
          </view>
        </view>
      </view>

      <view class="intro-hero anim-hero">
        <text class="intro-title">{{ t.intro.title1 }}</text>
        <text class="intro-sub">{{ t.intro.subtitleLine1 }}</text>

        <view class="intro-stats anim-stats">
          <view class="stat-item">
            <view class="stat-dot" />
            <text class="stat-num">{{ fmtNum(visibleDevices) }}</text>
            <text class="stat-label">{{ t.intro.statsDevices }}</text>
          </view>
          <view v-if="visiblePaid !== null" class="stat-sep" />
          <view v-if="visiblePaid !== null" class="stat-item">
            <text class="stat-num stat-num--brand">{{ visiblePaid === null ? t.intro.publicStatsUnavailable : `$${fmtNum(visiblePaid)}` }}</text>
            <text class="stat-label">{{ t.intro.statsPaidTotal }}</text>
          </view>
        </view>
      </view>

      <view class="intro-cta anim-cta">
        <view class="cta-primary active:scale-[0.98]" role="button" tabindex="0" data-system-chrome-primary @click="goRegister"  @keydown.enter.prevent="goRegister" @keydown.space.prevent="goRegister">
          <text class="cta-primary__t">{{ t.intro.getStarted }}</text>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
          </svg>
        </view>
        <view class="cta-secondary active:scale-[0.98]" role="button" tabindex="0" @click="goLogin"  @keydown.enter.prevent="goLogin" @keydown.space.prevent="goLogin">
          <text class="cta-secondary__t">{{ t.intro.signIn }}</text>
        </view>
        <view class="intro-terms">
          <text class="terms-left">{{ t.intro.termsLeft }} </text>
          <text class="terms-link active:opacity-70" role="link" tabindex="0" @click="goTerms" @keydown.enter.prevent="goTerms">{{ t.intro.termsLink }}</text>
          <text aria-hidden="true"> · </text>
          <text class="terms-link active:opacity-70" role="link" tabindex="0" @click="goPrivacy" @keydown.enter.prevent="goPrivacy">{{ t.privacy.title }}</text>
        </view>
      </view>
    </view>

    <!-- Language sheet(vcs-root 同型:dialog 角色在包裹层,遮罩是其子元素) -->
    <view v-if="langOpen" class="intro-lang-root" role="dialog" aria-modal="true" :aria-label="t.language.pageTitle">
      <view class="intro-lang-mask" role="presentation" aria-hidden="true" @click="closeLang" />
      <view class="nx-glass-sheet intro-lang-sheet">
      <view class="intro-lang-sheet__grab" />
      <text class="intro-lang-sheet__title">{{ t.language.pageTitle }}</text>
      <scroll-view scroll-y :show-scrollbar="false" class="intro-lang-list">
        <view
          v-for="l in LOCALES"
          :key="l.code"
          class="intro-lang-row active:opacity-80"
          role="button"
          tabindex="0"
          :aria-label="l.nativeName"
          @click="pick(l.code)"

          @keydown.enter.prevent="pick(l.code)" @keydown.space.prevent="pick(l.code)"
        >
          <text class="intro-lang-row__flag">{{ l.flag }}</text>
          <view class="intro-lang-row__names">
            <text class="intro-lang-row__native" :style="l.code === locale.code ? 'color: var(--v5-brand)' : ''">{{ l.nativeName }}</text>
            <text class="intro-lang-row__en">{{ l.englishName }}</text>
          </view>
          <view v-if="l.code === locale.code" class="intro-lang-row__check">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </view>
          <text v-else class="intro-lang-row__code">{{ l.code }}</text>
        </view>
      </scroll-view>
      </view>
    </view>
  </StandalonePageShell>
</template>

<script setup lang="ts">
import { navReset, navTo } from "@/lib/route";
import { ref, computed, onMounted, onUnmounted } from "vue";
import StandalonePageShell from "@/components/device/standalone-page-shell.vue";
import BrandLockup from "@/components/brand-lockup.vue";
import { useT } from "@/i18n/use-t";
import { LOCALES, type LocaleCode } from "@/i18n";
import { useLocaleStore } from "@/store/locale";
import { useDialogA11y } from "@/composables/use-dialog-a11y";
import { paidCumulativeNow } from "@/lib/platform-stats";
import { useConfig } from "@/store/config";
import { remoteApiEnabled } from "@/api/runtime";

const t = useT();
const locale = useLocaleStore();
const langOpen = ref(false);
function closeLang() {
  langOpen.value = false;
}
function pick(code: LocaleCode) {
  locale.setLocale(code);
  langOpen.value = false;
}
useDialogA11y(computed(() => langOpen.value), ".intro-lang-root", closeLang);
const cfg = useConfig();
const fleetNow = () => {
  return cfg.syncFailed ? null : cfg.config.verifiedStats?.onlineDevices.value ?? null;
};
// 🔴 累计支付**不跟配置走**(第二次结构反思·族B,R2 审计 C5):它是时间积分,背着历史 ——
//   拿「当前参数 × 全段 elapsed」派生,运营调低舰队它就整段回退,而「不回退」是本数字的
//   硬承诺。mock 无参数变更时点存储,沉淀段以编译期锚斜率计;PROD 由服务端累计。
//   速率类($/sec、日产、月付)跟配置走是对的 —— 它们是「现在」,不背历史。
// No public payout projection exists. Private purchase totals are not payouts;
// omit this unsupported metric rather than expose an account-dependent amount.
// 🔴 远程模式下的「累计已发放」只能是可核验的提现完成额(zentao #59):
//   此前这里是 `null`(直接隐藏),服务端也没有对应聚合。现在读 verified 聚合;
//   沙箱/旧后端没有该聚合 → 继续不显示,绝不用配置值编造一个财务事实。
const paidNow = () => {
  if (!remoteApiEnabled) return paidCumulativeNow();
  const v = cfg.syncFailed ? null : cfg.config.verifiedStats;
  return v ? Math.round(v.completedPayoutUsdt.value) : null;
};
const paid = ref(paidNow());
const visiblePaid = computed(() => remoteApiEnabled ? paidNow() : paid.value);
// Intro is public and often shown before a user session exists. Its public
// device count comes from the verified server aggregate.
const devices = ref(fleetNow());
const visibleDevices = computed(() => remoteApiEnabled ? fleetNow() : devices.value);

function fmtNum(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("en-US");
}

// Deterministic PRNG (SSR-safe in the prototype; here just keeps positions stable).
function mulberry32(seed: number) {
  return function () {
    let x = (seed += 0x6d2b79f5);
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const positions = Array.from({ length: 18 }).map((_, i) => {
  const rng = mulberry32(i + 1);
  return {
    top: `${(5 + rng() * 70).toFixed(2)}%`,
    left: `${(rng() * 95).toFixed(2)}%`,
    delay: +(rng() * 2.5).toFixed(2),
    scale: +(0.6 + rng() * 1.2).toFixed(2),
  };
});

// ComputeOrb geometry (cx=cy=120, orbitR=108)
const satellites = [
  { x: 120, y: 12 },
  { x: 228, y: 120 },
  { x: 120, y: 228 },
  { x: 12, y: 120 },
];
const orbitPath = "M 120 12 A 108 108 0 1 1 119.999 12 Z";

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  timer = setInterval(() => {
    // Recompute from the time anchor (~$14/1.8s) instead of accumulating random
    // steps, so a reload can never show a smaller total than a longer session.
    paid.value = paidNow();
    // BUG #59: the published fleet figure is an operator-owned aggregate, not a
    // live measurement. It must not drift while the page is open — a wobbling
    // number reads as a real-time feed. Display the configured value verbatim.
    devices.value = fleetNow();
  }, 1800);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

function goRegister() {
  navReset({ url: "/pages/register/register", fail: () => {} });
}
function goLogin() {
  navReset({ url: "/pages/login/login", fail: () => {} });
}
function goTerms() {
  navTo("/pages/onboarding/terms");
}
function goPrivacy() {
  navTo("/pages/onboarding/privacy?return=%2Fpages%2Fonboarding%2Fintro");
}


</script>

<style scoped>
.intro-root {
  position: fixed;
  inset: 0;
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--v5-bg);
}
/* 🔴 本页三层背景此前全是**为纯黑底调的写死值**(遗留品牌绿 + 纯黑渐变),浅色主题下
   分别表现为:顶部一条突兀的黑色渐变、柠檬绿雾霭糊在米色上。主人 2026-08-18 拍板
   本页浅色不再豁免,故三层一律改走 token,由主题决定色。暗色侧取值与原写死值等价
   (--v5-bg 就是 #000),观感不变。 */
.intro-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(120% 70% at 50% -10%, color-mix(in srgb, var(--v5-brand) 18%, transparent), transparent 60%);
}
.intro-vignette {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 180px;
  pointer-events: none;
  /* 作用是把页顶融进状态栏边缘,所以要跟的是**页面底色**而不是黑色 */
  background: linear-gradient(
    180deg,
    var(--v5-bg) 0%,
    color-mix(in srgb, var(--v5-bg) 85%, transparent) 25%,
    color-mix(in srgb, var(--v5-bg) 45%, transparent) 60%,
    transparent 100%
  );
}
.intro-dotgrid {
  position: absolute;
  inset: 0;
  opacity: 0.5;
  /* 覆盖全局 .dot-grid 的遗留柠檬绿 —— 那个全局类还被商品实拍图衬底用着,
     而那处按基线**必须**跟图不跟主题(见 THEME-CONSTANT-BASELINE),所以只在本页覆盖。 */
  background-image:
    radial-gradient(circle at center, color-mix(in srgb, var(--v5-brand) 14%, transparent) 1px, transparent 1.5px);
}
.intro-node {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 9999px;
  background: var(--v5-brand);
}

/* 中心 App 图标:双主题成对切换(html[data-theme] 由主题层维护,与 app-chassis header logo 同机制) */
.orb-appicon-wrap {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

/* Language entry + in-place sheet(bg 填充零 border;字号取 9 档;tap ≥44) */
.intro-lang {
  position: absolute;
  top: 10px;
  right: 16px;
  z-index: 5;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 9999px;
  background: var(--v5-surface-2);
}
.intro-lang__code {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--v5-ink-2);
}
.intro-lang-root {
  position: fixed;
  inset: 0;
  z-index: 790;
}
.intro-lang-mask {
  position: absolute;
  inset: 0;
  background: var(--v5-bg-color-mask);
}
.intro-lang-sheet { border-radius: var(--nx-glass-radius) var(--nx-glass-radius) 0 0;
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 800;
  background: var(--nx-glass-fill); box-shadow: var(--nx-glass-edge);

  padding: 10px 16px calc(env(safe-area-inset-bottom, 0px) + 38px);
  display: flex;
  flex-direction: column;
}
.intro-lang-sheet__grab {
  width: 36px;
  height: 4px;
  border-radius: 9999px;
  background: var(--v5-surface-3);
  margin: 2px auto 10px;
}
.intro-lang-sheet__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-ink);
  padding: 0 4px 10px;
}
.intro-lang-list {
  max-height: 56vh;
}
.intro-lang-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 0 4px;
}
.intro-lang-row__flag {
  font-size: 20px;
}
.intro-lang-row__names {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.intro-lang-row__native {
  font-size: 15px;
  font-weight: 550;
  color: var(--v5-ink);
}
.intro-lang-row__en {
  font-size: 12px;
  color: var(--v5-ink-3);
}
.intro-lang-row__code {
  font-size: 12px;
  color: var(--v5-ink-4);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.intro-lang-row__check {
  width: 22px;
  height: 22px;
  border-radius: 9999px;
  background: var(--v5-brand);
  display: grid;
  place-items: center;
}

.intro-content {
  position: relative;
  min-height: 100%;
  padding: 0 24px;
  display: flex;
  flex-direction: column;
}
.intro-orb-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 40px;
}
.intro-orb {
  position: relative;
  width: 240px;
  height: 240px;
}
.orb-glow {
  position: absolute;
  left: 50%;
  bottom: 8px;
  transform: translateX(-50%);
  width: 170px;
  height: 34px;
  border-radius: 9999px;
  background: color-mix(in oklab, var(--v5-brand) 20%, transparent);
  filter: blur(28px);
}
.orb-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.intro-hero {
  text-align: center;
  padding-bottom: 8px;
  text-wrap: pretty;
}
.intro-title {
  display: block;
  font-family: var(--font-v5);
  font-size: 34px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.025em;
  color: var(--v5-ink);
}
.intro-sub {
  display: block;
  margin-top: 12px;
  font-size: 15px;
  line-height: 1.625;
  color: var(--v5-ink-3);
  padding: 0 16px;
}
.intro-stats {
  margin-top: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding: 6px 14px;
  border-radius: 9999px;
  /* 🔴 此前写死 rgba(15,15,15,0.8) —— 浅色主题下是**深色药丸**,而里面的数字走
     --v5-ink(浅色档=近黑),等于深底压深字,主人实测「人眼根本看不清」。
     改走 surface 档:浅色是白药丸配近黑字,暗色是深色药丸配浅字,两边都读得出。
     不加 border:《03》§3 要求带填充的容器零描边,层级靠 surface 微差色 ——
     --v5-surface 压在 --v5-bg 上本身就是一档可读色差。(我加过一次 border,被 zero-border 门当场逮住)
     🔴 注释里也别写色号:verify 那道「no hardcoded hex」哨兵扫**全文**(含注释),
     我就是在这行写了页面底色的十六进制被它逮住。描述颜色一律用 token 名 ——
     被点名的只是若干个有 token 对应的色号,但写 token 名本来就更准(值会变,角色不变)。 */
  background: color-mix(in srgb, var(--v5-surface) 80%, transparent);
  backdrop-filter: blur(12px);
}
.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.stat-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: var(--v5-brand);
  animation: intro-pulse 1.6s ease-in-out infinite;
}
.stat-num {
  font-family: var(--font-v5);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  font-weight: 600;
  color: var(--v5-ink);
}
.stat-num--brand {
  color: var(--v5-brand);
}
.stat-label {
  font-size: 12px;
  color: var(--v5-ink-3);
}
.stat-sep {
  width: 2px;
  height: 2px;
  border-radius: 9999px;
  background: var(--v5-surface-3);
}

.intro-cta {
  padding-top: 40px;
  padding-bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.cta-primary {
  width: 100%;
  height: 54px;
  border-radius: 9999px;
  background: var(--v5-brand);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform 0.15s ease;
}
.cta-primary__t {
  font-size: 15px;
  font-weight: 500;
  color: var(--v5-on-brand);
}
.cta-secondary {
  width: 100%;
  height: 54px;
  border-radius: 9999px;
  background: var(--v5-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease;
}
.cta-secondary__t {
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-ink);
}
.intro-terms {
  text-align: center;
  padding-top: 8px;
  font-size: 12px;
  color: var(--v5-ink-4);
}
.terms-link {
  color: var(--v5-ink-3);
  text-decoration: underline;
  text-underline-offset: 2px;
  /* inline 目标吃 WCAG 2.5.8 豁免,纵向 padding 只扩热区不撑行高(原 34×17) */
  padding: 14px 0;
}

/* framer-motion → CSS entrance animations */
.anim-orb {
  animation: intro-scale-in 0.9s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.anim-hero {
  animation: intro-fade-up 0.6s ease 0.5s both;
}
.anim-stats {
  animation: intro-fade-in 0.6s ease 0.9s both;
}
.anim-cta {
  animation: intro-fade-up 0.6s ease 1.2s both;
}
@keyframes intro-scale-in {
  from { transform: scale(0.85); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
@keyframes intro-fade-up {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes intro-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes intro-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
