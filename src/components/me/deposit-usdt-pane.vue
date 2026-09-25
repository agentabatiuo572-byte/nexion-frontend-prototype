<!--
  DepositUsdtPane — 充值页「USDT 链上」通道段(PAY-规格 [FEAT-PAY01] ⑤⑥)。
  三网络 chip(TRC20 主推)→ 专属地址 QR + 复制 + 费/最低额/确认数(全部由
  deposits-core 常量派生,单源)→ 常驻错网络警示 → 指引/工单入口 → 最近入金
  列表(confirming n/N 实时进度 · credited / dust_hold / returned 态)。
  4 态:骨架(匹配形状)/ 空列表 / 通道停用置灰 / 断网 inline 重试。
  数据纯展示:状态 server-canonical(mock 引擎在 deposits store),本组件零写状态。
-->
<template>
  <view class="mx-4" style="padding: 0 2px">
    <FundsSandboxBadge />
    <!-- ── 加载骨架(chip 行 / QR 区 / 入口区,匹配真实形状)── -->
    <view v-if="phase === 'loading'">
      <view class="flex" style="gap: 8px">
        <view v-for="i in 3" :key="i" class="flex-1 nx-dep-sk" style="height: 56px" />
      </view>
      <view class="nx-dep-sk" style="height: 300px; margin-top: 16px" />
      <view class="nx-dep-sk" style="height: 96px; margin-top: 16px" />
    </view>

    <!-- ── 地址拉取失败(断网)→ inline 重试 ── -->
    <view v-else-if="phase === 'error'" class="flex flex-col items-center" style="padding: 40px 0 32px">
      <view class="grid place-items-center" :style="stateIconBoxStyle">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
      </view>
      <view><text class="block text-center" style="margin-top: 10px; font-size: 12px; color: var(--v5-ink-3)">{{ t.topupChrome.addrLoadFailed }}</text></view>
      <view class="nx-dep-retry-cta grid place-items-center active:opacity-80" :style="retryBtnStyle" role="button" tabindex="0" @click="load">
        <text style="font-size: 13px; font-weight: 500; color: var(--v5-ink)">{{ t.ui.retry }}</text>
      </view>
    </view>

    <template v-else>
      <!-- ── 三网络 chip ── -->
      <view class="flex" style="gap: 8px">
        <view
          v-for="nw in NETWORKS"
          :key="nw.id"
          :class="['flex-1 flex flex-col items-center justify-center', isEnabled(nw.id) ? 'active:opacity-85' : '', `nx-dep-net-${nw.label.toLowerCase()}`]"
          :style="chipStyle(nw.id)"
          role="button" tabindex="0"
          :aria-disabled="!isEnabled(nw.id)"
          @click="pickNet(nw.id)"
        >
          <text :style="chipLabelStyle(nw.id)">{{ nw.label }}</text>
          <text v-if="nw.id === 'usdt-trc20'" :style="chipTagStyle">{{ t.topupChrome.netRecommended }}</text>
          <text v-else :style="chipSubStyle" style="white-space: nowrap">{{ fmt(t.topupChrome.netFee, { fee: CHAIN_DEPOSIT_FEE_USDT[nw.id] }) }}</text>
        </view>
      </view>

      <!-- ── 专属地址 + QR(所选网络启用时)── -->
      <view v-if="activeNet" style="margin-top: 18px">
        <view><text class="font-mono-tabular" :style="metaLabelStyle">{{ fmt(t.topupChrome.sendVia, { network: activeLabel }) }}</text></view>
        <view :style="qrBoxStyle">
          <view :style="qrGridStyle" aria-hidden>
            <view v-for="(d, i) in qrCells" :key="i" :style="d ? qrDarkCellStyle : undefined" />
          </view>
        </view>
        <view><text class="block text-center" style="margin-top: 8px; font-size: 12px; color: var(--v5-ink-3)">{{ t.topupChrome.scanOrCopy }}</text></view>
        <view class="flex items-center rounded-xl" :style="addressRowStyle">
          <view class="flex-1 min-w-0">
            <text class="font-mono" style="font-size: 12px; color: color-mix(in srgb, var(--v5-ink) 90%, transparent); white-space: nowrap">{{ shortAddr }}</text>
          </view>
          <view class="nx-dep-copy-address-cta grid place-items-center shrink-0 active:opacity-80" :style="copyBtnStyle" role="button" tabindex="0" @click="copyAddr">
            <svg v-if="copied" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
          </view>
        </view>
        <!-- 费用/最低额/确认数 — deposits-core 常量单源派生 -->
        <view class="flex items-center justify-between" style="margin-top: 12px; gap: 8px">
          <view><text :style="metaCapStyle">{{ t.topupChrome.minDeposit }} <text :style="metaValStyle">${{ MIN_DEPOSIT_USDT }}</text></text></view>
          <view><text :style="metaCapStyle">{{ t.topupChrome.fee }} <text :style="metaValStyle">{{ CHAIN_DEPOSIT_FEE_USDT[activeNet] }} USDT</text></text></view>
          <view><text :style="metaCapStyle">{{ t.topupChrome.confirmationsLabel }} <text :style="metaValStyle">{{ CHAIN_REQUIRED_CONFIRMATIONS[activeNet] }}</text></text></view>
        </view>
        <view v-if="mockFundsEnabled" class="flex items-center" :style="sandboxTopupStyle">
          <view class="flex-1 min-w-0">
            <text class="block" :style="warnTextStyle">{{ t.publicCopy.experienceMode }}</text>
            <view class="flex items-center" style="margin-top: 6px; gap: 6px">
              <input
                v-model="sandboxAmount"
                class="font-mono-tabular flex-1 min-w-0"
                :style="sandboxAmountInputStyle"
                type="text"
                inputmode="decimal"
                :disabled="sandboxSubmitting"
                :aria-label="t.bankPane.amountLabel"
              />
              <text style="font-size: 12px; color: var(--v5-ink-3)">USDT</text>
            </view>
          </view>
          <view class="grid place-items-center active:opacity-80" :style="sandboxSubmitStyle" role="button" tabindex="0" @click="simulateSandboxTopup">
            <text style="font-size: 12px; color: var(--v5-brand)">{{ sandboxSubmitting ? t.wallet.processing : t.wallet.topUp }}</text>
          </view>
        </view>
      </view>

      <!-- ── 全部网络停用 ── -->
      <view v-else class="flex flex-col items-center" style="padding: 36px 0 28px">
        <view class="grid place-items-center" :style="stateIconBoxStyle">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M10 15V9" /><path d="M14 15V9" /></svg>
        </view>
        <view><text class="block text-center" style="margin-top: 10px; font-size: 12px; color: var(--v5-ink-3); line-height: 1.45; max-width: 260px">{{ t.topupChrome.allNetworksPaused }}</text></view>
      </view>

      <!-- ── 常驻警示:专属地址恒定 + 错网络不可找回(规格 ⑦ 语义)── -->
      <view class="flex" :style="warnlineStyle">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" style="margin-top: 1px"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
        <view class="flex-1 min-w-0"><text :style="warnTextStyle">{{ t.topupChrome.depositAddrNote }}</text></view>
      </view>

      <!-- ── 指引 / 工单入口(透明 hairline 组)── -->
      <view style="margin-top: 16px">
        <view class="nx-dep-usdt-guide-link flex items-center justify-between active:opacity-70" :style="linkRowStyle" role="button" tabindex="0" @click="goGuide">
          <text :style="linkTextStyle">{{ t.topupChrome.howToGetUsdt }}</text>
          <text style="color: var(--v5-ink-4); font-size: 13px">›</text>
        </view>
        <view class="nx-dep-support-link flex items-center justify-between active:opacity-70" :style="linkRowStyle" role="button" tabindex="0" @click="goSupport">
          <text :style="linkTextStyle">{{ t.topupChrome.depositNotArrived }}</text>
          <text style="color: var(--v5-ink-4); font-size: 13px">›</text>
        </view>
      </view>

      <!-- ── 最近入金 ── -->
      <view style="margin-top: 20px">
        <view><text class="block font-mono-tabular" :style="metaLabelStyle">{{ t.topupChrome.recentDeposits }}</text></view>

        <view v-if="sortedRecords.length === 0" class="flex flex-col items-center" style="padding: 26px 0 18px">
          <view class="grid place-items-center" :style="stateIconBoxStyle">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>
          </view>
          <view><text class="block text-center" style="margin-top: 8px; font-size: 12px; color: var(--v5-ink-4)">{{ t.topupChrome.noDepositsYet }}</text></view>
        </view>

        <view v-else style="margin-top: 4px">
          <view
            v-for="r in sortedRecords"
            :key="r.depositId"
            class="nx-dep-record-row flex items-start"
            :class="recordClickable(r) ? 'active:opacity-90' : ''"
            :style="recordRowStyle"
            :role="recordClickable(r) ? 'button' : undefined"
            :tabindex="recordClickable(r) ? 0 : undefined"
            v-on="recordRowOn(r)"
          >
            <view class="grid place-items-center shrink-0" :style="depIconStyle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>
            </view>
            <view class="flex-1 min-w-0" style="margin-left: 10px">
              <view class="flex items-center justify-between" style="gap: 8px">
                <text :style="rowTitleStyle">{{ rowTitle(r) }}</text>
                <text class="tabular-nums" :style="rowAmtStyle(r)" style="white-space: nowrap">{{ rowAmount(r) }}</text>
              </view>
              <view class="flex items-center justify-between" style="gap: 8px; margin-top: 2px">
                <text class="truncate font-mono-tabular" :style="rowSubStyle">{{ netShort(r.channel) }} · {{ r.depositId }}</text>
                <text v-if="stateText(r)" :style="stateTextStyle(r)" style="white-space: nowrap">{{ stateText(r) }}</text>
              </view>
              <view v-if="isInFlight(r)" :style="progTrackStyle"><view :style="progFillStyle(r)" /></view>
              <view v-if="noteText(r)"><text class="block" :style="noteStyle">{{ noteText(r) }}</text></view>
            </view>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { navTo } from "@/lib/route";
import { toast } from "@/store/ui";
import { geoPolicyUserMessage } from "@/api/geo-policy-error";
import { useDeposits } from "@/store/deposits";
import { mockServerNow } from "@/store/server-time";
import {
  CHAIN_DEPOSIT_FEE_USDT,
  CHAIN_REQUIRED_CONFIRMATIONS,
  MIN_DEPOSIT_USDT,
  fnv1a,
  isChainChannel,
  mulberry32,
} from "@/store/deposits-core";
import type { ChainDepositChannel, DepositChannel, DepositRecord } from "@/store/types";
import FundsSandboxBadge from "@/components/me/funds-sandbox-badge.vue";
import { mockFundsEnabled } from "@/api/runtime";

const t = useT();
const dep = useDeposits();

// ── 网络 chip(标签为链名专有名词,非文案)──
const NETWORKS: { id: ChainDepositChannel; label: string }[] = [
  { id: "usdt-trc20", label: "TRC20" },
  { id: "usdt-bep20", label: "BEP20" },
  { id: "usdt-erc20", label: "ERC20" },
];
const CHANNEL_SHORT: Record<DepositChannel, string> = {
  "usdt-trc20": "TRC20",
  "usdt-bep20": "BEP20",
  "usdt-erc20": "ERC20",
  "bank-vietqr": "VietQR",
  "card-intl": "Card",
};
/** confirming 超过 30 分钟未走满 → 「网络拥堵」提示([FEAT-PAY01] ② 异常3)。 */
const CONFIRM_DELAY_NOTE_MS = 30 * 60 * 1000;

// ── 加载态(ponytail: mock 地址/通道配置拉取。PROD 换 GET /api/deposits/address
// + /api/config/deposit-channels;拉取失败禁回退写死值,error 态只给重试)──
const phase = ref<"loading" | "error" | "ready">("loading");
let loadTimer: ReturnType<typeof setTimeout> | undefined;
function load() {
  phase.value = "loading";
  if (loadTimer) clearTimeout(loadTimer);
  loadTimer = setTimeout(() => {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    phase.value = offline ? "error" : "ready";
  }, 650);
}
onMounted(load);
onUnmounted(() => {
  if (loadTimer) clearTimeout(loadTimer);
});

// ── 网络选择(停用 chip 不可选;所选被停用时回落到首个启用网络)──
const net = ref<ChainDepositChannel>("usdt-trc20");
function isEnabled(id: ChainDepositChannel): boolean {
  if (mockFundsEnabled) return id === "usdt-bep20";
  return dep.chainChannelEnabled[id] === true;
}
const activeNet = computed<ChainDepositChannel | null>(() => {
  if (isEnabled(net.value)) return net.value;
  const fallback = NETWORKS.find((n) => isEnabled(n.id));
  return fallback ? fallback.id : null;
});
const activeLabel = computed(() => (activeNet.value ? CHANNEL_SHORT[activeNet.value] : ""));
function pickNet(id: ChainDepositChannel) {
  if (!isEnabled(id)) {
    toast.info(t.value.topupChrome.channelPaused);
    return;
  }
  net.value = id;
}

// ── 专属地址(同账号同网络恒定;中段省略防溢出,复制取全量)──
const address = computed(() => (activeNet.value ? dep.depositAddress(activeNet.value) : ""));
const shortAddr = computed(() => {
  const a = address.value;
  return a.length > 24 ? `${a.slice(0, 12)}…${a.slice(-8)}` : a;
});
const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | undefined;
function copyAddr() {
  if (!address.value) return;
  uni.setClipboardData({
    data: address.value,
    showToast: false, // 关掉 uni 系统 toast(恒中文「内容已复制」),只留应用内三语 toast
    success: () => {
      uni.hideToast(); // 双保险:个别平台忽略 showToast:false 仍弹系统条
      copied.value = true;
      toast.success(t.value.topupChrome.addrCopied);
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copied.value = false), 1500);
    },
    fail: () => {},
  });
}

const sandboxSubmitting = ref(false);
const sandboxAmount = ref("25");
async function simulateSandboxTopup() {
  if (!mockFundsEnabled || sandboxSubmitting.value) return;
  const amount = Number(sandboxAmount.value.trim());
  if (!Number.isFinite(amount) || amount < MIN_DEPOSIT_USDT) {
    toast.info(`${t.value.topupChrome.minDeposit} ${MIN_DEPOSIT_USDT} USDT`);
    return;
  }
  sandboxSubmitting.value = true;
  try {
    const record = await dep.createSandboxTopup("CREGIS_USDT_BEP20", amount, dep.currentAccountKey());
    if (record) toast.success(fmt(t.value.publicCopy.experienceDepositCredited, { amount: amount.toFixed(2) }));
  } catch (cause) {
    toast.info(geoPolicyUserMessage(cause, t.value.geoPolicy) ?? t.value.topupChrome.topupNotCreditedYet);
  } finally {
    sandboxSubmitting.value = false;
  }
}

// ── QR 点阵:21×21 确定性伪随机 + 三角定位块,seed = 专属地址 → 切网络图案随之变。
// ponytail: 装饰性拟真非真 QR 编码;PROD 接真地址后换 QR 库渲染,本段删除。
const QR_N = 21;
/** 标准定位块图形:7×7 外环暗 + 中环亮 + 3×3 内心暗(dx/dy ∈ [0,7))。 */
function finderDark(dx: number, dy: number): boolean {
  const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
  return ring === 3 || ring <= 1;
}
const qrCells = computed<boolean[]>(() => {
  const rnd = mulberry32(fnv1a(address.value || "nexgrid"));
  const cells: boolean[] = [];
  for (let cy = 0; cy < QR_N; cy++) {
    for (let cx = 0; cx < QR_N; cx++) {
      const inTL = cx < 7 && cy < 7;
      const inTR = cx >= QR_N - 7 && cy < 7;
      const inBL = cx < 7 && cy >= QR_N - 7;
      if (inTL) cells.push(finderDark(cx, cy));
      else if (inTR) cells.push(finderDark(cx - (QR_N - 7), cy));
      else if (inBL) cells.push(finderDark(cx, cy - (QR_N - 7)));
      else cells.push(rnd() > 0.52);
    }
  }
  return cells;
});

// ── 入口 ──
function goGuide() {
  navTo("/pages/me/usdt-guide");
}
function goSupport() {
  // cat=deposit:从充值场景进工单,预选「充值」分类(上下文随入口带过去)
  navTo("/pages/me/support-tickets?mode=create&cat=deposit");
}

// ── 最近入金(纯展示;状态由 store mock 引擎推进,server-canonical)──
const sortedRecords = computed(() => [...dep.records].sort((a, b) => b.createdAt - a.createdAt));
/** 法币轨(VietQR / 银行卡)入账后与链上记录同列此区,标题按通道分流。
 *  全键 Record 而非三元表达式:新增通道时 TS 强制补齐,不会静默落进 USDT 文案 ——
 *  卡轨接入本列表时正是先踩了这个(旧写法「非银行轨即 USDT」会把卡入金标成 USDT 充值)。 */
function rowTitle(r: DepositRecord): string {
  const tc = t.value.topupChrome;
  const titles: Record<DepositChannel, string> = {
    "usdt-trc20": tc.usdtDeposit,
    "usdt-bep20": tc.usdtDeposit,
    "usdt-erc20": tc.usdtDeposit,
    "bank-vietqr": t.value.bankPane.bankDeposit,
    "card-intl": tc.cardDeposit,
  };
  return titles[r.channel];
}
function rowAmount(r: DepositRecord): string {
  return (r.creditedUsdt > 0 ? r.creditedUsdt : r.grossAmountUsdt).toFixed(2);
}
function netShort(c: DepositChannel): string {
  return CHANNEL_SHORT[c];
}
function isInFlight(r: DepositRecord): boolean {
  return r.status === "detected" || r.status === "confirming";
}
function stateText(r: DepositRecord): string {
  const tc = t.value.topupChrome;
  if (r.status === "credited") return tc.depositCredited;
  if (r.status === "returned") return tc.depositReturned;
  if (isInFlight(r)) {
    const total = r.requiredConfirmations ?? 1;
    return fmt(tc.confirmingProgress, { n: Math.min(r.confirmations ?? 0, total), total });
  }
  return ""; // dust_hold:右侧留空,整句人工处理说明走 note 行
}
function noteText(r: DepositRecord): string {
  const tc = t.value.topupChrome;
  if (r.status === "dust_hold") return tc.dustHoldNote;
  if (r.status === "confirming" && mockServerNow() - r.createdAt > CONFIRM_DELAY_NOTE_MS) return tc.confirmDelayed;
  return "";
}
/** 法币轨恒可点(跳账单页);链上轨只有已入账(credited)有交易详情可看(与 goRecord 同判据)。 */
function recordClickable(r: DepositRecord): boolean {
  return !isChainChannel(r.channel) || r.status === "credited";
}
/** 不可点记录行不注册 click 监听(同 wallet-bills.billRowOn:防 tap-feedback 门判死控件)。 */
function recordRowOn(r: DepositRecord) {
  return recordClickable(r) ? { click: () => goRecord(r) } : {};
}
function goRecord(r: DepositRecord) {
  // 法币轨(银行转账 / 银行卡)无链上哈希,tx 浏览器框架页语义不符 → 跳账单页
  // (银行轨成功态的「查看账单」同口径;卡轨成功态回钱包,此处统一到账单页)。
  // 判据取自 deposits-core 单源,新增法币轨自动排除。
  if (!isChainChannel(r.channel)) {
    navTo("/pages/me/wallet-bills");
    return;
  }
  // 🔴 在途/灰尘/退回的链上记录不进 tx 页:tx 页状态区恒渲「已确认」,对未到账记录是编造
  // (账单深链 P0 的入金侧同类,证伪报告 R1);行内已展示确认进度与说明,无更多详情可看。
  if (r.status !== "credited") return;
  // 带真实参数进交易详情:金额=链上转账额(gross,与费率行 gross−fee=credited 闭环)、
  // 网络、确认数、专属收款地址、发生时间——tx 页入参优先,防种子假数据与本笔矛盾。
  const p = new URLSearchParams({
    hash: r.txHash ?? r.depositId,
    amount: r.grossAmountUsdt.toFixed(2),
    net: CHANNEL_SHORT[r.channel],
    confs: String(r.confirmations ?? 0),
    age: String(Math.max(1, Math.round((mockServerNow() - r.createdAt) / 60_000))),
  });
  if (r.address) p.set("to", r.address);
  navTo(`/pages/tx/hash?${p.toString()}`);
}

// ── styles ──
const metaLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
};
function chipStyle(id: ChainDepositChannel): CSSProperties {
  const on = activeNet.value === id;
  return {
    minHeight: "56px",
    minWidth: 0,
    borderRadius: "16px",
    gap: "2px",
    padding: "8px 6px",
    background: on ? "var(--v5-brand-soft)" : "var(--v5-surface)",
    opacity: isEnabled(id) ? 1 : 0.45,
  };
}
function chipLabelStyle(id: ChainDepositChannel): CSSProperties {
  return {
    fontSize: "13px",
    fontWeight: 600,
    color: activeNet.value === id ? "var(--v5-brand)" : "var(--v5-ink-2)",
  };
}
const chipTagStyle: CSSProperties = {
  display: "block",
  width: "100%",
  fontSize: "11px",
  fontWeight: 600,
  whiteSpace: "nowrap",
  color: "var(--v5-brand)",
  textAlign: "center",
  lineHeight: 1.3,
};
const chipSubStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};
const qrBoxStyle: CSSProperties = {
  width: "160px",
  height: "160px",
  margin: "16px auto 0",
  borderRadius: "16px",
  background: "#ffffff",
  padding: "8px",
  display: "grid",
  placeItems: "center",
};
const qrGridStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "grid",
  gridTemplateColumns: `repeat(${QR_N}, 1fr)`,
  gridTemplateRows: `repeat(${QR_N}, 1fr)`,
};
const qrDarkCellStyle: CSSProperties = {
  background: "rgba(0,0,0,0.85)", // QR 物理黑,白卡内固定色(同旧点阵先例)
  borderRadius: "1px",
};
const addressRowStyle: CSSProperties = {
  marginTop: "16px",
  padding: "12px",
  gap: "8px",
  background: "var(--v5-surface-2)",
};
const copyBtnStyle: CSSProperties = {
  width: "44px",
  height: "44px",
  borderRadius: "10px",
  background: "var(--v5-surface-3)",
};
const metaCapStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  whiteSpace: "nowrap",
};
const metaValStyle: CSSProperties = {
  color: "var(--v5-ink-2)",
  fontWeight: 600,
};
const warnlineStyle: CSSProperties = {
  marginTop: "16px",
  padding: "10px 12px",
  gap: "8px",
  borderRadius: "12px",
  background: "var(--v5-warning-soft)",
};
const warnTextStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-warning)",
  lineHeight: 1.45,
};
const sandboxTopupStyle: CSSProperties = {
  ...warnlineStyle,
  gap: "12px",
};
const sandboxAmountInputStyle: CSSProperties = {
  height: "34px",
  padding: "0 10px",
  borderRadius: "8px",
  background: "var(--v5-surface)",
  color: "var(--v5-ink)",
  fontSize: "13px",
};
const sandboxSubmitStyle: CSSProperties = {
  minWidth: "64px",
  height: "44px",
  padding: "0 10px",
  borderRadius: "10px",
  background: "var(--v5-surface-3)",
};
const linkRowStyle: CSSProperties = {
  minHeight: "48px",
  padding: "0 2px",
  borderTop: "1px solid var(--v5-border)",
};
const linkTextStyle: CSSProperties = {
  fontSize: "13px",
  color: "var(--v5-ink-2)",
};
const recordRowStyle: CSSProperties = {
  padding: "12px 0",
  borderTop: "1px solid var(--v5-border)",
};
const depIconStyle: CSSProperties = {
  width: "38px",
  height: "38px",
  borderRadius: "12px",
  background: "var(--v5-brand-soft)",
};
const rowTitleStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--v5-ink)",
};
function rowAmtStyle(r: DepositRecord): CSSProperties {
  return {
    fontFamily: "var(--font-v5)",
    fontSize: "13px",
    fontWeight: 600,
    color: r.status === "credited" ? "var(--v5-brand)" : "var(--v5-ink)",
  };
}
const rowSubStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};
function stateTextStyle(r: DepositRecord): CSSProperties {
  return {
    fontSize: "12px",
    color: r.status === "credited" ? "var(--v5-brand)" : r.status === "returned" ? "var(--v5-ink-4)" : "var(--v5-ink-3)",
  };
}
const progTrackStyle: CSSProperties = {
  height: "4px",
  marginTop: "8px",
  borderRadius: "999px",
  background: "var(--v5-surface-3)",
  overflow: "hidden",
};
function progFillStyle(r: DepositRecord): CSSProperties {
  const total = Math.max(1, r.requiredConfirmations ?? 1);
  const pct = Math.max(4, Math.round(((r.confirmations ?? 0) / total) * 100));
  return {
    height: "100%",
    width: `${Math.min(100, pct)}%`,
    borderRadius: "999px",
    background: "var(--v5-brand)",
    transition: "width 0.4s ease",
  };
}
const noteStyle: CSSProperties = {
  marginTop: "4px",
  fontSize: "12px",
  color: "var(--v5-warning)",
  lineHeight: 1.4,
};
const stateIconBoxStyle: CSSProperties = {
  width: "44px",
  height: "44px",
  borderRadius: "14px",
  // 图标框直接坐在页面底上,原 surface-2 与页面底同色不可辨,改 L1 surface。
  background: "var(--v5-surface)",
};
const retryBtnStyle: CSSProperties = {
  marginTop: "14px",
  minHeight: "44px",
  padding: "0 26px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
};
</script>

<style scoped>
/* 骨架 shimmer(匹配形状占位;通用 spinner 禁用) */
.nx-dep-sk {
  border-radius: 16px;
  background: linear-gradient(90deg, var(--v5-surface-2) 25%, var(--v5-surface-3) 50%, var(--v5-surface-2) 75%);
  background-size: 200% 100%;
  animation: nx-dep-sk-sweep 1.2s linear infinite;
}
@keyframes nx-dep-sk-sweep {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}
</style>
