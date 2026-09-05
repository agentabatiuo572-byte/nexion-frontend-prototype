<!--
  MyTokenCard — owned Genesis Node card with list / cancel flow
  (marketplace/page.tsx MyTokenCard). Reads listing state from the genesis store
  and composes listNode / cancelListing (store actions). Confirm dialogs use the
  global ui confirm/toast.
-->
<template>
  <view class="overflow-hidden" :style="cardStyle">
    <view class="flex items-center justify-center relative" :style="artStyle">
      <view v-if="isListed" class="absolute inline-flex items-center" :style="listedBadgeStyle">
        <view :style="listedBadgeDotStyle" />
        <text>{{ t.marketplace.listedBadge }}</text>
      </view>
      <view class="text-center">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" :stroke="isListed ? 'var(--v5-warning)' : 'var(--v5-brand)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z" /><path d="M5 20h14" /></svg>
        <text class="block tabular-nums" :style="tokenIdStyle">#{{ tokenId }}</text>
        <text class="block" :style="yoursStyle">{{ t.marketplace.yoursLabel }}</text>
      </view>
    </view>

    <view style="padding: 12px">
      <!-- Listed state -->
      <template v-if="isListed && existing">
        <text class="block" :style="askLabelStyle">{{ askingChipText }}</text>
        <text class="block tabular-nums" :style="askPriceStyle">${{ existing.askPriceUSDT.toLocaleString() }}</text>
        <text class="block" :style="listedAgoStyle">{{ listedAgoText }}</text>
        <view class="w-full flex items-center justify-center active:scale-[0.97]" :style="cancelBtnStyle" @click="handleCancel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          <text>{{ t.marketplace.cancelBtn }}</text>
        </view>
      </template>

      <!-- Not-listed state -->
      <template v-else>
        <text class="block" :style="listLabelStyle">{{ t.marketplace.listForSale }}</text>
        <view class="flex items-baseline" :style="inputWrapStyle">
          <text :style="dollarStyle">$</text>
          <input class="flex-1 min-w-0 tabular-nums" :style="inputStyle" type="text" inputmode="numeric" :value="String(askPrice)" @input="onAskInput" />
        </view>
        <text class="block" :style="floorHintStyle">{{ floorHintText }}</text>
        <view class="w-full flex items-center justify-center active:scale-[0.97]" :style="listBtnStyle" @click="handleList">
          <svg v-if="!listBlocked" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r=".5" fill="currentColor" /></svg>
          <text>{{ listBlocked ? (blockText ?? t.genesis.marketClosed.default) : t.marketplace.listCta }}</text>
        </view>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useGenesis } from "@/store/genesis";
import { useGenesisConfig } from "@/store/genesis-config";
import { useGenesisSaleGate } from "@/composables/use-genesis-sale-gate";
import { toast, confirm } from "@/store/ui";

const props = defineProps<{ tokenId: number }>();

const t = useT();
const genesis = useGenesis();
const cfg = useGenesisConfig();
// 二级地板价派生 marketStats 单源(FEAT-GEN09;运营 G4 可配,不缓存硬编码 — 与 marketplace 同源)。
const floor = computed(() => cfg.config.marketStats.floor);

// 🔴 挂单是规格 ② 点名要锁的两个入口之一(另一个是购买)。判定走**共用闸**,
//   不在本文件自判 —— store 侧 listNode 也已接同一个闸,双层守。
//   撤单**刻意不拦**(离场手段,理由见 store/genesis.ts 的 cancelListing 注释)。
const { secondaryBlock, blockText } = useGenesisSaleGate();
const listBlocked = computed(() => secondaryBlock.value !== null);

const askPrice = ref(floor.value);

const existing = computed(() => genesis.myListings.find((l) => l.tokenId === props.tokenId));
const isListed = computed(() => !!existing.value);

const askingChipText = computed(() =>
  existing.value ? fmt(t.value.marketplace.askingChip, { amount: existing.value.askPriceUSDT.toLocaleString() }) : "",
);
const listedAgoText = computed(() =>
  existing.value ? fmt(t.value.marketplace.listedAgo, { time: relativeTime(existing.value.listedAt) }) : "",
);
const floorHintText = computed(() => fmt(t.value.marketplace.floorShort, { k: (floor.value / 1000).toFixed(1) }));

function relativeTime(ts: number): string {
  const ms = Date.now() - ts;
  if (ms < 60_000) return "<1m";
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

function onAskInput(e: Event) {
  const raw = (e as unknown as { detail: { value: string } }).detail.value;
  askPrice.value = Math.max(0, parseInt(raw.replace(/\D/g, "")) || 0);
}

async function handleList() {
  // 🔴 阻断态给说明,不静默(规格 ⑥「禁静默无反馈」)。放在 confirm **之前** ——
  //   没必要让用户先确认一件注定失败的事。
  if (listBlocked.value) {
    toast.info(blockText.value ?? t.value.genesis.marketClosed.default, t.value.marketplace.listBlockedDesc);
    return;
  }
  const ok = await confirm({
    title: fmt(t.value.marketplace.confirmListTitle, { id: props.tokenId }),
    message: fmt(t.value.marketplace.confirmListMsg, {
      amount: askPrice.value.toLocaleString(),
      floor: (floor.value / 1000).toFixed(1),
    }),
    confirmLabel: t.value.marketplace.confirmListCta,
    icon: "info",
  });
  if (!ok) return;
  if (await genesis.listNode(props.tokenId, askPrice.value)) {
    toast.success(
      fmt(t.value.marketplace.listedToast, { id: props.tokenId }),
      fmt(t.value.marketplace.listedDesc, { amount: askPrice.value.toLocaleString() }),
    );
  }
}

async function handleCancel() {
  if (!existing.value) return;
  const ok = await confirm({
    title: fmt(t.value.marketplace.confirmCancelTitle, { id: props.tokenId }),
    // 🔴 关闭态下不许承诺「之后可以重新设价上架」—— 撤完就再也挂不上,直到运营重开。
    //   这句矛盾是**给 listNode 接闸后新产生的**(独立验收 P1):撤单本身该放行(离场手段),
    //   但确认框仍在用开放态的措辞,等于诱导用户做一个单向操作。
    //   🔴 用整句独立键,不拼两串(2026-08-05 独立验收 P2):拼来的后半句原本是
    //   **挂单被拒**场景的安抚语(「你已持有的席位不受影响」),放进撤单框里归因就错了;
    //   且英/越两面靠值末尾的空格接缝,任何 trim 类格式化都会让它变成 "…(not listed).Seats…"。
    message: listBlocked.value
      ? t.value.marketplace.confirmCancelMsgBlocked
      : t.value.marketplace.confirmCancelMsg,
    confirmLabel: t.value.marketplace.confirmCancelCta,
    danger: true,
    icon: "warn",
  });
  if (!ok) return;
  if (await genesis.cancelListing(props.tokenId)) {
    toast.info(
      fmt(t.value.marketplace.cancelledToast, { id: props.tokenId }),
      t.value.marketplace.cancelledDesc,
    );
  }
}

// Collectible tile — filled surface, no border (single visual difference); the
// listed state is signaled by the badge + warning-tinted art + "yours" label.
const cardStyle: CSSProperties = {
  borderRadius: "16px",
  background: "var(--v5-surface)",
};
const artStyle = computed<CSSProperties>(() => ({
  aspectRatio: "1 / 1",
  background: isListed.value
    ? "radial-gradient(80% 80% at 50% 30%, rgba(255,200,61,0.18) 0%, transparent 65%), linear-gradient(135deg, #1A1408 0%, var(--v5-on-brand) 100%)"
    : "radial-gradient(80% 80% at 50% 30%, rgba(198,255,58,0.18) 0%, transparent 65%), linear-gradient(135deg, #14160F 0%, var(--v5-on-brand) 100%)",
}));
const listedBadgeStyle: CSSProperties = {
  top: "8px",
  right: "8px",
  gap: "4px",
  padding: "2px 7px",
  borderRadius: "6px",
  background: "rgba(196,131,22,0.22)",
  color: "var(--v5-warning)",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.06em",
};
const listedBadgeDotStyle: CSSProperties = {
  width: "4px",
  height: "4px",
  borderRadius: "999px",
  background: "var(--v5-warning)",
};
const tokenIdStyle: CSSProperties = {
  marginTop: "4px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "20px",
  letterSpacing: "-0.014em",
  color: "var(--v5-ink)",
  lineHeight: 1,
};
const yoursStyle = computed<CSSProperties>(() => ({
  marginTop: "4px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.06em",
  color: isListed.value ? "var(--v5-warning)" : "var(--v5-brand)",
}));
const askLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-warning)",
  letterSpacing: "0.04em",
};
const askPriceStyle: CSSProperties = {
  marginTop: "2px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "20px",
  letterSpacing: "-0.014em",
  color: "var(--v5-warning)",
  lineHeight: 1,
};
const listedAgoStyle: CSSProperties = {
  marginTop: "4px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const cancelBtnStyle: CSSProperties = {
  marginTop: "10px",
  height: "44px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
  border: "1px solid var(--v5-brand-2-border)",
  color: "var(--v5-brand-2)",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "13px",
  letterSpacing: "-0.005em",
};
const listLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.04em",
};
const inputWrapStyle: CSSProperties = {
  marginTop: "4px",
  gap: "4px",
  padding: "8px 10px",
  borderRadius: "10px",
  background: "var(--v5-surface-2)",
};
const dollarStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "20px",
  color: "var(--v5-ink-3)",
  flexShrink: 0,
};
const inputStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "15px",
  color: "var(--v5-ink)",
  letterSpacing: "-0.014em",
  background: "transparent",
};
const floorHintStyle: CSSProperties = {
  marginTop: "4px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
// 🔴 阻断/可用两态**分成两个样式块**,不写三元:on-brand 哨兵按「同一块里 brand 底 +
//   ink 字」判违例,三元分支的相关性静态看不出来 —— 拆块后各块语义自明,也更好读。
const listBtnBase: CSSProperties = {
  marginTop: "10px",
  height: "44px",
  borderRadius: "999px",
  fontFamily: "var(--font-v5)",
  fontWeight: 550,
  fontSize: "13px",
  letterSpacing: "-0.005em",
};
// 迷你表单提交(输入挂单价→挂单):全宽实心柠檬绿合理;仅去光晕(网格多卡,光晕铁律仅限主 CTA)。
const listBtnActiveStyle: CSSProperties = { ...listBtnBase, background: "var(--v5-brand)", color: "var(--v5-on-brand)" };
// 阻断态退中性面。字用 ink-3 不用更暗档:阻断说明是用户此刻最需要读到的一行,
// 不能渲染成看不见(独立验收 P1-1:通用 disabled 配方实测对比度 2.23,不达 AA 的 4.5)。
const listBtnBlockedStyle: CSSProperties = { ...listBtnBase, background: "var(--v5-surface-2)", color: "var(--v5-ink-3)" };
const listBtnStyle = computed<CSSProperties>(() => (listBlocked.value ? listBtnBlockedStyle : listBtnActiveStyle));
</script>
