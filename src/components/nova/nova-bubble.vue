<!--
  NovaBubble — the "nova 浮标" floating advisor entry. Ported from
  Nexion-prototype/app/components/nova/nova-bubble.tsx (+ a focused port of
  nova-triggers / nova-triggers-v3 so the unread badge actually populates).

  Visibility: the chassis mounts this ONLY on tab routes (home/earn/store/team/
  me), so route-gating lives in the chassis. The floating button itself shows
  only when unread > 0 — but the COMPONENT mounts unconditionally on tab routes
  so its push triggers run (the button appears once the first push lands).

  Position: fixed, bottom-right, above the floating-pill TabBar (~100px) — the
  chassis is position:fixed inset:0 on uni so fixed == device viewport.

  Timers are module-light: started in onMounted, cleared in onUnmounted (uni
  components don't fire onUnload — P-021). Cooldown gating lives in the Pinia
  nova store (an app-singleton across in-SPA navigations), so re-mounting the
  chassis per navigation can't double-fire welcome / spam the channels.
-->
<template>
  <view>
    <view v-if="visible" class="nx-nova-bubble nova-float" :class="{ 'nx-nova-bubble--dimmed': dimmed }" @click="open">
      <view class="nx-nova-btn nova-pulse">
        <NovaAvatar :size="36" pulse />
        <view v-if="showUnreadBadge" class="nx-nova-badge"><text class="nx-nova-badge-t">{{ unreadLabel }}</text></view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { useNova } from "@/store/nova";
import { useConversations } from "@/store/conversations";
import { useNotifications, type NotifKind } from "@/store/notifications";
import { remoteApiEnabled } from "@/api/runtime";
import { welcomeMessage } from "@/mock/nova-templates";
import { useGenesisConfig } from "@/store/genesis-config";
import { useGenesisSaleGate } from "@/composables/use-genesis-sale-gate";
import { navTo } from "@/lib/route";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import NovaAvatar from "./nova-avatar.vue";

// dimmed:chassis 在页面滚动期间置真 —— 浮标横在内容上,滚动时先让路(淡出 +
// 不吃点击),停下由 chassis 复位再淡回。不传 = 旧行为(undefined 即 falsy)。
// 🔴 不要写成 `const { dimmed } = defineProps(...)`:响应式解构是 Vue 3.5 特性,
//    本仓锁 3.4.21,那样写会静默丢响应性(浮标从此永不淡出)。模板直接用 prop 名。
defineProps<{ dimmed?: boolean }>();

const t = useT();
const nova = useNova();
const conversations = useConversations();
const notifications = useNotifications();
// 创世闸(P1-2):推送前判紧迫感是否被允许;声明见 stakingEventMessage 内注释。
const genesisCfg = useGenesisConfig();
const { showUrgency: genesisUrgencyOk } = useGenesisSaleGate();

// Bubble badge reflects ALL unread — Nova pushes + human-category conversations
// (the advisor's proactive seed shows immediately as a conversion hook). Tapping
// opens the unified conversation center; unread clears per-thread on open there.
const totalUnread = computed(() =>
  remoteApiEnabled ? nova.unread : nova.unread + conversations.totalUnread,
);
const visible = computed(() => remoteApiEnabled || totalUnread.value > 0);
const showUnreadBadge = computed(() => totalUnread.value > 0);
const unreadLabel = computed(() => (totalUnread.value > 9 ? "9+" : String(totalUnread.value)));

function open() {
  navTo("/pages/support/messages");
}

// ── focused trigger port (nova-triggers welcome + nova-triggers-v3 channels)
// Each channel pushes a Nova message (cooldown-gated) AND, when it fires, a
// matching notification — so the bell badge + nova badge populate in tandem,
// exactly like the prototype. First delays are short so both badges appear
// within ~10s of landing on a tab route (the prototype shows them populated).

const TEAM_TICK_MS = 90_000, TEAM_COOLDOWN_MS = 70_000, FIRST_TEAM = 2_500;
const STAKING_TICK_MS = 240_000, STAKING_COOLDOWN_MS = 300_000, FIRST_STAKING = 6_000;
const MARKET_TICK_MS = 360_000, MARKET_COOLDOWN_MS = 420_000, FIRST_MARKET = 9_000;
const WELCOME_DELAY = 1_200, WELCOME_COOLDOWN = 24 * 60 * 60 * 1000;

const TEAM_NAMES = ["Sarah K.", "Tom Wang", "Lisa Park", "Carlos R.", "Yuki H.", "Mehmet A.", "Diego P.", "Mila V."];
const TEAM_ORDERS = [
  { product: "NexGridBox S1", price: 299, l1: 29.9 },
  { product: "NexGridBox Pro", price: 899, l1: 89.9 },
  { product: "NexGridRack P1", price: 3499, l1: 349.9 },
];

interface ChannelMsg { text: string; ctaLabel: string; ctaHref: string; }

// 推送文案全部走 i18n(nova.push.*)。此前这三个函数内联英文串,zh/vi 用户
// 也只看到英文;插值用 fmt,复数走 One/Many 两个 key(不在代码里拼英文词尾)。
type NovaPush = ReturnType<typeof useT>["value"]["nova"]["push"];

function teamEventMessage(p: NovaPush): ChannelMsg {
  const r = Math.random();
  const buyer = TEAM_NAMES[Math.floor(Math.random() * TEAM_NAMES.length)];
  if (r < 0.5) {
    const order = TEAM_ORDERS[Math.floor(Math.random() * TEAM_ORDERS.length)];
    const nexPart = Math.floor(order.price * 50).toLocaleString();
    return { text: fmt(p.teamBought, { buyer, product: order.product, l1: order.l1.toFixed(2), nex: nexPart }), ctaLabel: p.teamBoughtCta, ctaHref: "/team/commissions" };
  }
  if (r < 0.75) {
    const n = 1 + Math.floor(Math.random() * 3);
    const sponsor = TEAM_NAMES[0];
    return { text: n > 1 ? fmt(p.teamPlacedMany, { sponsor, n }) : fmt(p.teamPlacedOne, { sponsor }), ctaLabel: p.teamPlacedCta, ctaHref: "/team/binary" };
  }
  if (r < 0.9) {
    const remain = 200 + Math.floor(Math.random() * 1800);
    return { text: fmt(p.teamRankGap, { remain: remain.toLocaleString() }), ctaLabel: p.teamRankGapCta, ctaHref: "/team/rank" };
  }
  const peerAmt = 50 + Math.floor(Math.random() * 350);
  return { text: fmt(p.teamPeerBonus, { buyer, peer: (peerAmt * 20).toLocaleString(), amt: peerAmt }), ctaLabel: p.teamPeerBonusCta, ctaHref: "/team/commissions" };
}

function stakingEventMessage(p: NovaPush): ChannelMsg {
  const r = Math.random();
  if (r < 0.4) return { text: p.stakingApyUp, ctaLabel: p.stakingApyUpCta, ctaHref: "/staking" };
  // 不编具体余席数(与 live remaining 矛盾会自曝;数字可信铁律)。
  if (r < 0.7) {
    // 🔴 「席位不多了」是名额紧迫文案,必须受创世闸(独立验收 P1-2:此前本文件对闸
    //   零引用,市场关闭期间照推「抢席位」,用户点进去按钮是灰的 —— 规格 ④ 明令禁止
    //   对不可购买的东西制造紧迫感)。判定走 useGenesisSaleGate 唯一消费入口,不自判。
    //   推送在定时器里触发、可能距挂载已久 → 判定前先重读配置源(refresh 写共享 store,
    //   computed 同步失效,紧接着读到的就是新值),不吃 hydrate-once 的旧快照。
    genesisCfg.refresh();
    if (genesisUrgencyOk.value) {
      return { text: p.stakingGenesisLow, ctaLabel: p.stakingGenesisLowCta, ctaHref: "/genesis" };
    }
    // 闸住 → 落到质押位文案,不发创世紧迫感(推送频道照常活跃,只换内容)。
    return { text: p.stakingLockNow, ctaLabel: p.stakingLockNowCta, ctaHref: "/staking" };
  }
  if (r < 0.9) return { text: p.stakingLockNow, ctaLabel: p.stakingLockNowCta, ctaHref: "/staking" };
  return { text: p.stakingMatures, ctaLabel: p.stakingMaturesCta, ctaHref: "/staking" };
}

function marketEventMessage(p: NovaPush): ChannelMsg {
  const r = Math.random();
  if (r < 0.45) { const price = (0.16 + Math.random() * 0.04).toFixed(3); const change = (5 + Math.random() * 18).toFixed(1); return { text: fmt(p.marketPriceBreak, { price, change }), ctaLabel: p.marketPriceBreakCta, ctaHref: "/me/wallet/exchange" }; }
  if (r < 0.8) { const tvl = (840 + Math.random() * 60).toFixed(0); return { text: fmt(p.marketTvl, { tvl }), ctaLabel: p.marketTvlCta, ctaHref: "/team/leadership-pool" }; }
  // 具名第三方战略合作声明(旧文案「× OPPO ... signed」)已移除:对真实公司作
  // 完成时合作断言 = 法务高危虚假宣传(nexion-design 踩坑表点名项)。换成不
  // 具名的市场流动性事件,同样服务市场频道且无第三方主体。
  return { text: p.marketLiquidity, ctaLabel: p.marketLiquidityCta, ctaHref: "/trust" };
}

function fireChannel(prefix: "team" | "staking" | "market", kind: NotifKind, m: ChannelMsg, cooldownMs: number) {
  const cooldownKey = `${prefix}_${m.ctaHref}`;
  const fired = nova.push(
    { kind: "market-event", text: m.text, ctaLabel: m.ctaLabel, ctaHref: m.ctaHref },
    { cooldownKey, cooldownMs },
  );
  if (fired) {
    notifications.push({ id: `${cooldownKey}-${Date.now()}`, kind, title: m.text, ctaLabel: m.ctaLabel, ctaHref: m.ctaHref });
  }
}

const timers: ReturnType<typeof setTimeout>[] = [];
const intervals: ReturnType<typeof setInterval>[] = [];

onMounted(() => {
  if (remoteApiEnabled) {
    void notifications.refreshRemote();
    return;
  }
  timers.push(setTimeout(() => {
    nova.push(welcomeMessage(t.value), { cooldownKey: "welcome", cooldownMs: WELCOME_COOLDOWN });
  }, WELCOME_DELAY));

  // 在回调内部读 t.value(而非外层捕获快照)→ 切语言后新推送即用新语言。
  const teamFire = () => fireChannel("team", "team", teamEventMessage(t.value.nova.push), TEAM_COOLDOWN_MS);
  timers.push(setTimeout(teamFire, FIRST_TEAM));
  intervals.push(setInterval(teamFire, TEAM_TICK_MS));

  const stakingFire = () => fireChannel("staking", "staking", stakingEventMessage(t.value.nova.push), STAKING_COOLDOWN_MS);
  timers.push(setTimeout(stakingFire, FIRST_STAKING));
  intervals.push(setInterval(stakingFire, STAKING_TICK_MS));

  const marketFire = () => fireChannel("market", "market", marketEventMessage(t.value.nova.push), MARKET_COOLDOWN_MS);
  timers.push(setTimeout(marketFire, FIRST_MARKET));
  intervals.push(setInterval(marketFire, MARKET_TICK_MS));
});

onUnmounted(() => {
  timers.forEach(clearTimeout);
  intervals.forEach(clearInterval);
});
</script>

<style scoped>
.nx-nova-bubble {
  position: fixed;
  right: 16px;
  bottom: 100px;
  z-index: 40;
  transition: opacity 0.15s;
  /* 命中区跟着视觉走。这层是 48×48 的**方框**,而看得见的球是内切圆 —— 四角那
     22% 面积是透明的却照样截走点击(实测 144 点网格:144 点全被吃,只有 112 点
     在圆内)。实付:赚取页「添加设备」按钮左上角约 1/4 面积点下去开的是 Nova。
     border-radius 参与命中测试,加上它四角就还给页面了;圆内与溢出在外的未读
     角标都不受影响(角标是子元素,不被父级圆角裁剪)。 */
  border-radius: 999px;
}
/* 《08》§2 按下反馈。全站五个 tab 都能看到这个球,原先按下去毫无变化。
   只动 opacity 不动 transform —— .nova-float 的 animation 一直在写 transform,
   普通声明压不过 animation,写了也不会生效。 */
.nx-nova-bubble:active {
  opacity: 0.7;
}
/* 滚动让路态。注意它压不过上面的 :active(带伪类,特异性更高)—— 靠的是
   pointer-events:none 让 :active 根本无从成立,不是靠选择器权重或书写顺序。
   淡出淡入沿用上面那条 0.15s 过渡,不新造时长档。opacity 归零而非
   visibility/display:后两者没有过渡帧,会闪。 */
.nx-nova-bubble--dimmed {
  opacity: 0;
  pointer-events: none;
}
.nx-nova-btn {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: var(--v5-bg);
  border: 1px solid color-mix(in srgb, var(--v5-brand) 45%, transparent);
}
.nx-nova-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--v5-brand-2);
  display: grid;
  place-items: center;
  border: 1px solid var(--v5-bg);
}
.nx-nova-badge-t {
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-v5);
  color: var(--v5-on-brand-2);
  line-height: 1;
}
</style>
