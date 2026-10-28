<!--
  NovaBubble — the "nova 浮标" floating advisor entry. Ported from
  Nexion-prototype/app/components/nova/nova-bubble.tsx (+ a focused port of
  nova-triggers / nova-triggers-v3 so the unread badge actually populates).

  The chassis mounts one shortcut on home/earn/team, above its navigation pill.
  Human support stays available with or without unread replies. Route gating
  lives in the chassis; its measured navigation height includes the safe area.

  Timers are module-light: started in onMounted, cleared in onUnmounted (uni
  components don't fire onUnload — P-021). Cooldown gating lives in the Pinia
  nova store (an app-singleton across in-SPA navigations), so re-mounting the
  chassis per navigation can't double-fire welcome / spam the channels.
-->
<template>
    <view v-if="visible" class="nx-nova-bubble" :class="{ 'nx-nova-bubble--dimmed': dimmed, 'nx-nova-bubble--light': theme.resolved === 'light' }" role="button" :tabindex="dimmed ? -1 : 0" :aria-hidden="dimmed || undefined" :aria-label="t.coreReview.novaHelp" @click="open" @keydown.enter.prevent="!dimmed && open()" @keydown.space.prevent="!dimmed && open()">
      <view class="nx-nova-btn nx-nova-motion">
        <NovaAvatar :size="36" :pulse="showUnreadBadge && !dimmed" :appearance="theme.resolved" class="nx-nova-avatar" />
        <view v-if="showUnreadBadge" :key="totalUnread" class="nx-nova-badge"><text class="nx-nova-badge-t">{{ unreadLabel }}</text></view>
      </view>
    </view>
</template>

<script setup lang="ts">
import { runPassiveTabRead } from "@/lib/passive-tab-read";
import { formatAmount } from "@/lib/amount-display";
import { computed, onMounted, onUnmounted } from "vue";
import { useNova } from "@/store/nova";
import { useConversations } from "@/store/conversations";
import { useNotifications, type NotifKind } from "@/store/notifications";
import { remoteApiEnabled } from "@/api/runtime";
import { welcomeMessage } from "@/mock/nova-templates";
import { useGenesisConfig } from "@/store/genesis-config";
import { useConfig } from "@/store/config";
import { useGenesisSaleGate } from "@/composables/use-genesis-sale-gate";
import { useMessageDrawer } from "@/store/message-drawer";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import NovaAvatar from "./nova-avatar.vue";
import { NOVA_SUPPORT_VISIBLE } from "@/lib/nova-visibility";
import { formatUnreadBadge } from "@/lib/unread-badge";
import { useTheme } from "@/store/theme";

defineProps<{ dimmed?: boolean }>();

const t = useT();
const theme = useTheme();
const nova = useNova();
const config = useConfig();
const conversations = useConversations();
const messageCenter = useMessageDrawer();
const notifications = useNotifications();
// 创世闸(P1-2):推送前判紧迫感是否被允许;声明见 stakingEventMessage 内注释。
const genesisCfg = useGenesisConfig();
const genesisUrgencyOk = remoteApiEnabled ? computed(() => false) : useGenesisSaleGate().showUrgency;

// The floating shortcut retains only unread human advisor/support replies.
// Notification and ticket counts belong to the unified message center.
const humanUnread = computed(() =>
  [...conversations.byType("advisor"), ...conversations.byType("support")]
    .reduce((sum, row) => sum + row.unread, 0),
);
const totalUnread = computed(() => humanUnread.value);
const visible = computed(() => !NOVA_SUPPORT_VISIBLE || remoteApiEnabled || totalUnread.value > 0);
const showUnreadBadge = computed(() => totalUnread.value > 0);
const unreadLabel = computed(() => formatUnreadBadge(totalUnread.value));

// Human support uses the same full-page center as the bell, opening Service.
function open() {
  messageCenter.show("service");
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
  { product: "UVELBox S1", price: 299, l1: 29.9 },
  { product: "UVELBox Pro", price: 899, l1: 89.9 },
  { product: "UVELRack P1", price: 3499, l1: 349.9 },
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
    const nexPart = formatAmount(Math.floor(order.price * 50));
    return { text: fmt(p.teamBought, { buyer, product: order.product, l1: formatAmount(order.l1), nex: nexPart }), ctaLabel: p.teamBoughtCta, ctaHref: "/team/commissions" };
  }
  if (r < 0.75) {
    const n = 1 + Math.floor(Math.random() * 3);
    const sponsor = TEAM_NAMES[0];
    return { text: n > 1 ? fmt(p.teamPlacedMany, { sponsor, n }) : fmt(p.teamPlacedOne, { sponsor }), ctaLabel: p.teamPlacedCta, ctaHref: "/team/binary" };
  }
  if (r < 0.9) {
    const remain = 200 + Math.floor(Math.random() * 1800);
    return { text: fmt(p.teamRankGap, { remain: formatAmount(remain) }), ctaLabel: p.teamRankGapCta, ctaHref: "/team/rank" };
  }
  const peerAmt = 50 + Math.floor(Math.random() * 350);
  return { text: fmt(p.teamPeerBonus, { buyer, peer: formatAmount(peerAmt * 20), amt: formatAmount(peerAmt) }), ctaLabel: p.teamPeerBonusCta, ctaHref: "/team/commissions" };
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
    void runPassiveTabRead("conversations", () => conversations.refresh(), { owner: conversations.scopeInvalidated }, () => !conversations.loading && !conversations.error).catch(() => undefined);
    return;
  }
  if (!NOVA_SUPPORT_VISIBLE) return;
  timers.push(setTimeout(() => {
    nova.push(welcomeMessage(t.value), { cooldownKey: "welcome", cooldownMs: WELCOME_COOLDOWN });
  }, WELCOME_DELAY));

  // 在回调内部读 t.value(而非外层捕获快照)→ 切语言后新推送即用新语言。
  const teamFire = () => fireChannel("team", "team", teamEventMessage(t.value.nova.push), TEAM_COOLDOWN_MS);
  timers.push(setTimeout(teamFire, FIRST_TEAM));
  intervals.push(setInterval(teamFire, TEAM_TICK_MS));

  const stakingFire = () => {
    if (config.isEnabled("stakingVisible")) fireChannel("staking", "staking", stakingEventMessage(t.value.nova.push), STAKING_COOLDOWN_MS);
  };
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
  position: absolute;
  right: 16px;
  bottom: calc(100% + 12px);
  z-index: 1;
  color: var(--v5-ink);
  transition: opacity 150ms, transform 120ms cubic-bezier(.2,.8,.2,1);
  /* Rounded hit area returns transparent corners to the underlying content. */
  border-radius: 999px;
}
.nx-nova-bubble--dimmed { opacity: 0; pointer-events: none; }
.nx-nova-bubble--dimmed .nx-nova-motion { animation-play-state: paused; }
.nx-nova-bubble--light .nx-nova-btn {
  background: linear-gradient(155deg, #fff, #eef2e5);
  box-shadow: 0 3px 12px rgba(42, 53, 24, .14), inset 0 0 0 1px #dde4d3;
}
/* Press belongs to the outer hit target; idle float belongs to the inner visual. */
.nx-nova-bubble:active {
  transform: scale(.94);
}
.nx-nova-btn {
  position: relative;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: var(--v5-surface);
}
/* Float the avatar and badge together while keeping the outer hit target stationary. */
.nx-nova-motion { position: relative; z-index: 1; animation: nx-nova-float 3.4s ease-in-out infinite; }
@keyframes nx-nova-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
.nx-nova-badge {
  position: absolute;
  z-index: 2;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--ui-unread-badge);
  display: grid;
  place-items: center;
  border: 1px solid var(--v5-bg);
  animation: nx-nova-unread 420ms cubic-bezier(.2,1.5,.3,1) both;
}
@keyframes nx-nova-unread { from { transform: scale(.65); } to { transform: scale(1); } }
.nx-nova-badge-t {
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-v5);
  color: var(--ui-unread-badge-ink);
  line-height: 1;
}
.nx-nova-avatar { position: relative; z-index: 1; }
.nx-nova-bubble:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  .nx-nova-bubble { transition: none; }
  .nx-nova-bubble:active { transform: none; }
  .nx-nova-motion, .nx-nova-badge { animation: none; }
}
</style>
