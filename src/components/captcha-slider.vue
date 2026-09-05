<template>
  <view class="cs-layer" role="dialog" aria-modal="true">
    <!-- 遮罩是**独立兄弟层**,不是卡片的父级:uni-app H5 把事件规范化成
         `{target:{id,dataset,...}}` 普通对象,`target`/`currentTarget` 是两个新对象,
         `@click.self` 的 `target === currentTarget` 恒不成立 → 点遮罩永远关不掉。
         同理 `e.target.closest()` 也不存在。改用全站既有写法(country-code-sheet /
         slot-action-sheet / purchase-sheet):遮罩单独一层,点卡片根本到不了它。 -->
    <view class="cs-mask" @click="onCancel" />
    <view class="cs-card">
      <view class="cs-head">
        <view class="cs-head__txt">
          <text class="cs-title">{{ t.authOtp.captchaTitle }}</text>
          <text class="cs-sub">{{ t.authOtp.captchaHint }}</text>
        </view>
        <view class="cs-x" role="button" tabindex="0" :aria-label="t.ui.cancel" @click="onCancel">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </view>
      </view>

      <!-- 拼图区:challenge 未就绪 = 骨架占位(⑤ 空状态,禁白块;>300ms 才出,防闪烁) -->
      <view id="cs-puzzle" class="cs-puzzle" :class="{ 'cs-puzzle--skeleton': skeletonOn }">
        <template v-if="challenge">
          <view class="cs-slot" :style="{ left: slotLeft }" />
          <view class="cs-piece" :style="{ left: pieceLeft }" />
          <view class="cs-refresh" role="button" tabindex="0" :aria-label="t.authOtp.captchaRetry" @click="reloadChallenge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
          </view>
        </template>
        <!-- ⑤ 报错/极限态:题面加载或校验网络失败 → 层内失败态 + 重试,不静默关闭 -->
        <view v-else-if="loadFailed" class="cs-fail">
          <text class="cs-fail__t">{{ t.authOtp.captchaLoadFailed }}</text>
          <view class="cs-fail__btn" role="button" tabindex="0" @click="onRetry"><text class="cs-fail__btn-t">{{ t.authOtp.captchaRetry }}</text></view>
        </view>
      </view>

      <!-- 滑轨 -->
      <view id="cs-track" class="cs-track" :class="trackCls">
        <view class="cs-fill" :style="{ width: curX + 24 + 'px' }" />
        <view v-if="showHint" class="cs-hintwrap"><text class="cs-hint">{{ t.authOtp.captchaTrackHint }}</text></view>
        <!-- 🔴 滑柄此前只绑触摸与鼠标 —— 纯键盘用户拖不动它,而滑块是登录 / 注册 /
             改提现地址三条路的必经关卡,等于这三件事键盘用户都做不了。
             方向键移动 + Enter/Space 提交,走的是与拖拽**同一条**提交路径(onUp),
             不另开一条分支,免得两条路的风控/失败态各走各的。 -->
        <view
          class="cs-handle"
          role="slider"
          tabindex="0"
          :aria-label="t.authOtp.captchaTrackHint"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="handlePercent"
          :style="{ left: curX + 2 + 'px' }"
          @touchstart.prevent="onDown"
          @touchmove.prevent="onMove"
          @touchend="onUp"
          @touchcancel="onUp"
          @mousedown="onDown"
          @keydown="onHandleKeydown"
        >
          <view v-if="busy" class="cs-spin" />
          <text v-else class="cs-handle__t">{{ verified ? "✓" : "→" }}</text>
        </view>
      </view>

      <view class="cs-meta">
        <text class="cs-meta__fail">{{ failText }}</text>
        <text v-if="hintText" class="cs-meta__hint" :class="{ 'cs-meta__hint--err': hintIsError }">{{ hintText }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, getCurrentInstance } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { toast } from "@/store/ui";
import { captchaChallenge, captchaVerify, MAX_CAPTCHA_FAILS, type CaptchaChallenge, type CaptchaVerifyResult } from "@/store/auth-otp";
import { useDialogA11y } from "@/composables/use-dialog-a11y";

const props = defineProps<{ phone: string }>();
const emit = defineEmits<{ (e: "success", ticket: string): void; (e: "close"): void }>();

const t = useT();

const challenge = ref<CaptchaChallenge | null>(null);
const loadFailed = ref(false);
const skeletonOn = ref(false);
const curX = ref(0);
const dragging = ref(false);
const busy = ref(false);
const verified = ref(false);
const shaking = ref(false);
const fails = ref(0);
const hintText = ref("");
const hintIsError = ref(false);
const trackW = ref(0);

let startPX = 0;

const maxHandle = computed(() => Math.max(1, trackW.value - 48));
// slot/piece 用 calc 定位:left = ratio × (拼图区宽 − 拼块 44px − 边距 8px)。
const slotLeft = computed(() => `calc((100% - 52px) * ${challenge.value?.targetRatio ?? 0})`);
const pieceLeft = computed(() => `calc((100% - 52px) * ${curX.value / maxHandle.value})`);
const showHint = computed(() => !dragging.value && curX.value === 0 && !busy.value && !verified.value && !loadFailed.value);
const trackCls = computed(() => ({ "cs-track--err": shaking.value, "cs-track--ok": verified.value, "cs-track--busy": busy.value }));
const failText = computed(() => fmt(t.value.authOtp.captchaFailCount, { n: fails.value, max: MAX_CAPTCHA_FAILS }));

const instance = getCurrentInstance();

function measureTrack() {
  uni
    .createSelectorQuery()
    .in(instance)
    .select("#cs-track")
    .boundingClientRect((rect) => {
      const r = rect as UniApp.NodeInfo | null;
      if (r?.width) trackW.value = r.width;
    })
    .exec();
}

// ⑤ 加载态:< 300ms 不展示骨架(防闪烁);到点仍未就绪才亮。
const SKELETON_DELAY_MS = 300;
let skeletonTimer: ReturnType<typeof setTimeout> | null = null;
function clearSkeleton() {
  if (skeletonTimer) { clearTimeout(skeletonTimer); skeletonTimer = null; }
  skeletonOn.value = false;
}
// 题面加载单入口:成功 → 渲染拼图;失败 → 层内失败态 + 重试(⑤ 断网不静默关闭)。
// mock 的 captchaChallenge 不会 reject,此分支为 PROD 真滑块 SDK 的网络失败预留。
async function loadChallenge() {
  if (busy.value) return;
  challenge.value = null;
  loadFailed.value = false;
  clearSkeleton();
  skeletonTimer = setTimeout(() => { skeletonOn.value = true; }, SKELETON_DELAY_MS);
  try {
    challenge.value = await captchaChallenge(props.phone);
    measureTrack();
  } catch {
    loadFailed.value = true;
  } finally {
    clearSkeleton();
  }
}
async function reloadChallenge() {
  if (busy.value) return;
  resetHandle();
  await loadChallenge();
}
function onRetry() {
  void loadChallenge();
}

function resetHandle() {
  curX.value = 0;
  dragging.value = false;
  hintText.value = "";
  hintIsError.value = false;
}

function pointerX(e: TouchEvent | MouseEvent): number {
  const te = e as TouchEvent;
  return te.touches && te.touches.length ? te.touches[0].clientX : (e as MouseEvent).clientX;
}
function onDown(e: TouchEvent | MouseEvent) {
  if (busy.value || verified.value || !challenge.value) return;
  dragging.value = true;
  startPX = pointerX(e) - curX.value;
}
function onMove(e: TouchEvent | MouseEvent) {
  if (!dragging.value) return;
  curX.value = Math.min(maxHandle.value, Math.max(0, pointerX(e) - startPX));
}
async function onUp() {
  if (!dragging.value || busy.value || !challenge.value) return;
  dragging.value = false;
  if (curX.value <= 0) return; // 未拖动,忽略
  busy.value = true;
  let res: CaptchaVerifyResult;
  try {
    res = await captchaVerify(props.phone, {
      challengeId: challenge.value.challengeId,
      offsetRatio: curX.value / maxHandle.value,
    });
  } catch {
    // ⑤ 校验网络失败:转层内失败态可重试;busy 由 finally 兜底复位,关闭出口不被锁死。
    resetHandle();
    challenge.value = null;
    loadFailed.value = true;
    return;
  } finally {
    busy.value = false;
  }
  if (res.ok) {
    const ticket = res.ticket; // let+闭包丢失 narrowing,先取值再进 setTimeout
    verified.value = true;
    hintText.value = t.value.authOtp.captchaVerified;
    hintIsError.value = false;
    setTimeout(() => emit("success", ticket), 300);
    return;
  }
  if (res.error === "captcha_throttled") {
    toast.info(t.value.authOtp.captchaThrottled, "");
    emit("close");
    return;
  }
  fails.value = res.failCount;
  hintText.value = t.value.authOtp.captchaFail;
  hintIsError.value = true;
  shaking.value = true;
  setTimeout(() => {
    shaking.value = false;
    curX.value = 0;
    void loadChallenge(); // 重随机题面;网络失败同样落层内失败态
  }, 380);
}
/** 读屏要报"拖到百分之多少",给它一个 0-100 的整数。 */
const handlePercent = computed(() => Math.round((curX.value / maxHandle.value) * 100));

// 本组件由父级 v-if 挂载,自身没有开关 → 恒 open(composable 的 immediate 让它生效)。
// Esc 取消,与点遮罩、点 × 同义。
useDialogA11y(computed(() => true), ".cs-layer", onCancel);

/**
 * 滑柄的键盘操作。方向键移动、Home/End 到两端、Enter/Space 提交当前位置。
 * 提交刻意复用 onUp:拖拽与键盘走同一条校验、失败态与风控路径,不另立分支。
 */
function onHandleKeydown(e: KeyboardEvent) {
  if (busy.value || verified.value || !challenge.value) return;
  const step = e.shiftKey ? 24 : 6;   // 按住 Shift 走大步,不然要按几十下
  let next = curX.value;
  switch (e.key) {
    case "ArrowRight": next += step; break;
    case "ArrowLeft": next -= step; break;
    case "Home": next = 0; break;
    case "End": next = maxHandle.value; break;
    case "Enter":
    case " ":
      e.preventDefault();
      if (curX.value <= 0) return;    // 没移动过就提交没有意义(与拖拽版同判据)
      dragging.value = true;          // onUp 以 dragging 为门,键盘路径要显式置位
      void onUp();
      return;
    default:
      return;
  }
  e.preventDefault();                 // 方向键默认会滚动页面
  curX.value = Math.min(maxHandle.value, Math.max(0, next));
}

function onCancel() {
  if (busy.value) return;
  emit("close");
}

// H5:鼠标拖出把手仍要跟踪 → window 级 move/up(touch 序列自锁定元素,不需要)。
function winMove(e: MouseEvent) { onMove(e); }
function winUp() { void onUp(); }

onMounted(() => {
  if (typeof window !== "undefined") {
    window.addEventListener("mousemove", winMove);
    window.addEventListener("mouseup", winUp);
  }
  void loadChallenge();
});
onUnmounted(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("mousemove", winMove);
    window.removeEventListener("mouseup", winUp);
  }
  if (skeletonTimer) clearTimeout(skeletonTimer);
});
</script>

<style scoped>
/* 🔴 全站层级秩序表(单源;机器门 scripts/zindex-order.mjs 逐条断言,改一处就红)
   ── 低 ──────────────────────────────────────────────────────────── 高 ──
     0–50   页内装饰 / 页面 chrome(aurora · refresher 5 · tabbar 30 · stickyCTA 35 · sub-page header 50)
    90–100  底盘 chrome(.nx-top-chrome 90 · .nx-header/.nx-navheader 100)
       110  底盘之上的常驻件(模拟设备状态栏)
       780  里程碑庆祝 —— 必须在业务 UI 之下(2026-08-03 定,2026-08-16 兑现,见 milestone-celebration.vue)
   790/800  业务半屏(trial-claim · slot-action · lucky-spin · voucher-claim · tradein · trial
            · 消息抽屉 · opensea 外链弹窗 · PC 设备卡长按菜单
            · device-deactivate · fx-rate-line · wallet-withdraw 费用说明)
            └ 前三者 2026-08-17 从 110/120/200 迁入,原登记在 zindex-order.mjs 的
              SCRIM_EXEMPT 欠账清单里,迁入后清单已清空(为空 = 目标状态,不是「门没在管」)。
            └ 后三者同日从 79/80 迁入 —— 是「比 790/800 少一位数」那个老笔误的残留同族。
              2026-08-16 修的是写在 <style> 块里的三张付款半屏,这三张写成 **JS 样式对象**
              (`position:"fixed"` + `zIndex`),机器门当时只扫 <style>,所以它们连红都没红过。
              🔴 同一个「全屏遮罩」形态在本仓有**四种写法**,判据四种都要扫:<style> 规则 /
              内联 style / JS 样式对象 / 原子类定位(`class="fixed inset-0"` + style 给 z)。
              少扫一种,那一种就是缺陷的藏身处(已实证:第二、三种各藏过真违例;第四种
              藏着 900 说明半屏,眼下值是对的,但补轴前把它改成 90 也不会红)。
       900  说明型半屏(capacity-explainer · tradein-ladder)
 8000/8001  分享半屏(share-channel · share-poster)
 9000/9001  瞬时层 / 选择器(toast host · 国家区号半屏)
      9100  阻断式弹窗(confirm / netError 的 .nx-mask)
 >>> 9500   本层:滑块人机验证 <<<
     10050  模拟设备 chrome(状态栏 / Home Indicator,standalone-page-shell)

   为什么滑块排在业务面最顶(9500):它是**阻断式安全控件**——弹出时发码流程正停在
   这里等它解开。别的浮层被盖住只是「晚点再看」,它被盖住是**死锁**:用户看不见也点
   不到,而流程不会自己往下走。原值 90(自 2026-07-06 建档起就是 90,c778889 遮罩重构
   只是把它从 .cs-mask 原样搬到 .cs-layer,不是重构带入)输给了 toast/确认弹窗/区号半屏
   /庆祝层等几乎所有浮层 —— 实测(register 键盘打开区号半屏)三个操作点全部 elementFromPoint
   命中 .cc-row,把手拖不动。
   为什么不排到最顶(< 10050):10050 是模拟硬件 chrome(顶部状态条 + Home Indicator,
   后者 pointer-events:none),它模拟的是手机自身的系统层,且与垂直居中的滑块卡片零几何
   重叠,压在滑块上不影响任何操作。 */
.cs-layer { position: fixed; inset: 0; z-index: 9500; display: flex; align-items: center; justify-content: center; padding: 16px; }
.cs-mask { position: absolute; inset: 0; background: var(--v5-bg-color-mask); backdrop-filter: blur(4px); }
.cs-card { position: relative; width: 100%; max-width: 340px; background: var(--v5-surface); border: 1px solid var(--v5-surface-2); border-radius: 20px; padding: 18px; }
.cs-head { display: flex; align-items: flex-start; justify-content: space-between; }
.cs-head__txt { display: flex; flex-direction: column; gap: 3px; }
.cs-title { font-family: var(--font-v5); font-size: 15px; font-weight: 600; color: var(--v5-ink); }
.cs-sub { font-size: 13px; color: var(--v5-ink-3); text-wrap: pretty; }
.cs-x { width: 44px; height: 44px; margin: -12px -12px 0 0; border-radius: 9999px; display: flex; align-items: center; justify-content: center; }
.cs-x:active { opacity: 0.7; }

.cs-puzzle { position: relative; margin-top: 12px; height: 150px; border-radius: 14px; overflow: hidden; background:
    radial-gradient(120px 80px at 20% 30%, color-mix(in srgb, var(--v5-brand) 22%, transparent), transparent 70%),
    radial-gradient(140px 90px at 75% 65%, color-mix(in srgb, var(--v5-brand-2) 16%, transparent), transparent 70%),
    radial-gradient(90px 70px at 55% 20%, color-mix(in srgb, var(--v5-tech-cyan) 14%, transparent), transparent 70%),
    var(--v5-surface-2);
}
.cs-puzzle--skeleton::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.05), transparent); animation: cs-shimmer 1.2s infinite; }
@keyframes cs-shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
.cs-slot { position: absolute; top: 53px; width: 44px; height: 44px; border-radius: 10px; border: 2px dashed rgba(255, 255, 255, 0.5); background: rgba(0, 0, 0, 0.35); box-sizing: border-box; }
.cs-piece { position: absolute; top: 53px; width: 44px; height: 44px; border-radius: 10px; background: linear-gradient(135deg, color-mix(in srgb, var(--v5-brand) 90%, transparent), color-mix(in srgb, var(--v5-brand) 65%, transparent)); border: 1px solid rgba(255, 255, 255, 0.25); box-sizing: border-box; }
.cs-refresh { position: absolute; right: 4px; top: 4px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; }
.cs-refresh:active { opacity: 0.7; }
/* ⑤ 网络失败态:soft tint 重试 pill(零 border,tap ≥44,rest 态自带 affordance) */
.cs-fail { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 12px; }
.cs-fail__t { font-size: 13px; color: var(--v5-ink-2); text-align: center; text-wrap: pretty; }
.cs-fail__btn { min-height: 44px; padding: 0 24px; display: flex; align-items: center; justify-content: center; border-radius: 9999px; background: color-mix(in srgb, var(--v5-brand) 16%, transparent); }
.cs-fail__btn:active { opacity: 0.8; transform: scale(0.98); }
.cs-fail__btn-t { font-size: 13px; font-weight: 600; color: var(--v5-brand); }

/* 🔴 零-border 扫荡请勿删这条 border:它是**状态通道**,不是卡片描边 ——
   下面 .cs-track--err / --ok 靠改 border-color 传达验证成功/失败反馈,
   删掉等于删掉验证码的结果反馈(P0 可用性)。《03》§3 末条:交互控件边界归《无障碍规范》。 */
.cs-track { position: relative; margin-top: 12px; height: 48px; border-radius: 9999px; background: color-mix(in srgb, var(--v5-surface-2) 55%, transparent); border: 1px solid var(--v5-surface-2); overflow: hidden; }
.cs-fill { position: absolute; left: 0; top: 0; bottom: 0; background: color-mix(in srgb, var(--v5-brand) 18%, transparent); }
.cs-hintwrap { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.cs-hint { font-size: 13px; color: var(--v5-ink-4); }
.cs-handle { position: absolute; top: 2px; width: 44px; height: 44px; border-radius: 9999px; background: var(--v5-brand); display: flex; align-items: center; justify-content: center; touch-action: none; }
.cs-handle:active { transform: scale(0.98); }
.cs-handle__t { font-size: 15px; font-weight: 600; color: var(--v5-on-brand); }
.cs-track--err { border-color: color-mix(in srgb, var(--v5-brand-2) 55%, transparent); animation: cs-shake 0.35s; }
.cs-track--err .cs-handle { background: var(--v5-brand-2); }
.cs-track--ok { border-color: color-mix(in srgb, var(--v5-brand) 60%, transparent); }
.cs-track--ok .cs-fill { background: color-mix(in srgb, var(--v5-brand) 30%, transparent); }
@keyframes cs-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 50% { transform: translateX(5px); } 75% { transform: translateX(-3px); } }
.cs-spin { width: 16px; height: 16px; border: 2px solid color-mix(in srgb, var(--v5-on-brand) 35%, transparent); border-top-color: var(--v5-on-brand); border-radius: 9999px; animation: cs-rot 0.7s linear infinite; }
@keyframes cs-rot { to { transform: rotate(360deg); } }

.cs-meta { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; min-height: 16px; }
.cs-meta__fail { font-size: 12px; color: var(--v5-ink-4); font-variant-numeric: tabular-nums; }
.cs-meta__hint { font-size: 12px; color: var(--v5-ink-3); }
.cs-meta__hint--err { color: var(--v5-brand-2); }
</style>
