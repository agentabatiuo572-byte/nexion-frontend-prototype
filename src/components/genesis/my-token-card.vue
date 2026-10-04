<!--
  MyTokenCard — owned Genesis Node card with list / cancel flow
  (marketplace/page.tsx MyTokenCard). Reads listing state from the genesis store
  and composes listNode / cancelListing (store actions). Confirm dialogs use the
  global ui confirm/toast.
-->
<template>
  <view class="nx-glass-card overflow-hidden" :style="cardStyle">
    <view class="flex items-center justify-center relative" :style="artStyle">
      <GenesisArtwork context="holding" :serial="tokenId" style="position: absolute; inset: 0" />
      <view v-if="isListed" class="absolute inline-flex items-center" :style="listedBadgeStyle">
        <view :style="listedBadgeDotStyle" />
        <text>{{ t.marketplace.listedBadge }}</text>
      </view>
    </view>

    <view style="padding: 12px">
      <!-- Listed state -->
      <template v-if="isListed && existing">
        <text class="block" :style="askLabelStyle">{{ askingChipText }}</text>
        <text class="block tabular-nums" :style="askPriceStyle">${{ existing.askPriceUSDT.toLocaleString(undefined, { maximumFractionDigits: 6 }) }}</text>
        <text class="block" :style="listedAgoStyle">{{ listedAgoText }}</text>
        <view class="w-full flex items-center justify-center active:scale-[0.97]" role="button" tabindex="0" :aria-disabled="pending" :style="cancelBtnStyle" @click="handleCancel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          <text>{{ t.marketplace.cancelBtn }}</text>
        </view>
      </template>

      <!-- Not-listed state -->
      <template v-else>
        <text class="block" :style="listLabelStyle">{{ t.marketplace.listForSale }}</text>
        <view class="flex items-baseline" :style="inputWrapStyle">
          <text :style="dollarStyle">$</text>
          <input class="flex-1 min-w-0 tabular-nums" :style="inputStyle" type="text" inputmode="decimal" :aria-label="t.marketplace.listForSale" :value="askPriceText" @input="onAskInput" />
        </view>
        <text class="block" :style="floorHintStyle">{{ floorHintText }}</text>
        <view class="w-full flex items-center justify-center active:scale-[0.97]" role="button" tabindex="0" :aria-disabled="pending" :style="listBtnStyle" @click="handleList">
          <svg v-if="!listBlocked" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r=".5" fill="currentColor" /></svg>
          <text>{{ listBlocked ? (blockText ?? t.genesis.marketClosed.default) : t.marketplace.listCta }}</text>
        </view>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { displayGenesisHoldingId } from "@/lib/genesis-holding-id";
import { ref, computed, watch, getCurrentInstance, onUnmounted, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useGenesis } from "@/store/genesis";
import { useGenesisConfig } from "@/store/genesis-config";
import { useGenesisSaleGate } from "@/composables/use-genesis-sale-gate";
import { remoteApiEnabled } from "@/api/runtime";
import { genesisMarketFloor } from "@/lib/genesis-market-floor";
import { presentGenesisFloorPrice, presentGenesisRoyalty } from "@/lib/genesis-marketplace-presentation";
import { formatCommandAmount } from "@/lib/command-amount";
import { parseGenesisListingPrice } from "@/lib/genesis-listing-price";
import { canExecuteGenesisListingConfirmation, type GenesisListingSnapshot } from "@/lib/genesis-listing-confirmation";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { toast, confirm, useUI } from "@/store/ui";

const props = defineProps<{
  tokenId: string | number;
  pageScope: { readonly visible: boolean; readonly epoch: number };
}>();

const t = useT();
const genesis = useGenesis();
const cfg = useGenesisConfig();
// Remote market data remains authoritative. The mock G4 seed is only valid in
// mock mode; a missing public floor must stay unknown instead of becoming $13.4K.
const floor = computed(() => genesisMarketFloor(
  remoteApiEnabled,
  genesis.remoteMarketStats.floorUsdt,
  cfg.config.marketStats.floor,
));
const royalty = computed(() => presentGenesisRoyalty(genesis.remoteRoyaltyPct));

// 🔴 挂单是规格 ② 点名要锁的两个入口之一(另一个是购买)。判定走**共用闸**,
//   不在本文件自判 —— store 侧 listNode 也已接同一个闸,双层守。
//   撤单**刻意不拦**(离场手段,理由见 store/genesis.ts 的 cancelListing 注释)。
const { secondaryBlock, blockText } = useGenesisSaleGate();
const listBlocked = computed(() => secondaryBlock.value !== null);
let mounted = true;
const pending = ref(false);
const ui = useUI();
const confirmationOwner = `genesis-card-${getCurrentInstance()?.uid}`;
watch(() => props.pageScope.visible, (visible) => {
  if (!visible) ui.clearConfirmsBy(confirmationOwner);
}, { flush: "sync" });
onUnmounted(() => {
  mounted = false;
  ui.clearConfirmsBy(confirmationOwner);
});

function responseStillCurrent(accountScope: ReturnType<typeof captureAccountScope>, tokenId: string | number, pageEpoch: number) {
  return mounted && props.pageScope.visible && props.pageScope.epoch === pageEpoch
    && isCurrentAccountScope(accountScope) && props.tokenId === tokenId;
}

const askPriceText = ref(floor.value === null ? "" : formatCommandAmount(floor.value));
const askPrice = computed(() => parseGenesisListingPrice(askPriceText.value));
watch(floor, (next) => {
  if (!askPriceText.value.trim() && next !== null) askPriceText.value = formatCommandAmount(next);
});

const existing = computed(() => genesis.myListings.find((l) => l.tokenId === props.tokenId));
const isListed = computed(() => !!existing.value);

const askingChipText = computed(() =>
  existing.value ? fmt(t.value.marketplace.askingChip, { amount: existing.value.askPriceUSDT.toLocaleString(undefined, { maximumFractionDigits: 6 }) }) : "",
);
const listedAgoText = computed(() =>
  existing.value ? fmt(t.value.marketplace.listedAgo, { time: relativeTime(existing.value.listedAt) }) : "",
);
const floorHintText = computed(() => floor.value === null
  ? "—"
  : fmt(t.value.marketplace.floorShort, { k: (floor.value / 1000).toFixed(1) }));
const floorConfirmationText = computed(() => presentGenesisFloorPrice(floor.value));

function listingSnapshot(): GenesisListingSnapshot | null {
  return existing.value ? {
    askPriceUSDT: existing.value.askPriceUSDT,
    listedAt: existing.value.listedAt,
  } : null;
}

function confirmationStillCurrent(
  accountScope: ReturnType<typeof captureAccountScope>,
  tokenId: string | number,
  frozenListing: GenesisListingSnapshot | null,
): boolean {
  return canExecuteGenesisListingConfirmation({
    mounted,
    accountScopeCurrent: isCurrentAccountScope(accountScope),
    frozenTokenId: tokenId,
    currentTokenId: props.tokenId,
    frozenListing,
    currentListing: listingSnapshot(),
  });
}

function relativeTime(ts: number): string {
  const ms = Date.now() - ts;
  if (ms < 60_000) return "<1m";
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

function onAskInput(e: Event) {
  const raw = (e as unknown as { detail: { value: string } }).detail.value;
  askPriceText.value = raw;
}

async function handleList() {
  if (pending.value || !mounted || !props.pageScope.visible) return;
  // 🔴 阻断态给说明,不静默(规格 ⑥「禁静默无反馈」)。放在 confirm **之前** ——
  //   没必要让用户先确认一件注定失败的事。
  if (listBlocked.value) {
    toast.info(blockText.value ?? t.value.genesis.marketClosed.default, t.value.marketplace.listBlockedDesc);
    return;
  }
  if (askPrice.value === null) {
    toast.error(t.value.marketplace.listingPriceInvalid, t.value.marketplace.listingPriceInvalidDesc);
    return;
  }
  const price = askPrice.value;
  const accountScope = captureAccountScope();
  const tokenId = props.tokenId;
  const frozenListing = listingSnapshot();
  const pageEpoch = props.pageScope.epoch;
  pending.value = true;
  try {
    const ok = await confirm({
      owner: confirmationOwner,
      title: fmt(t.value.marketplace.confirmListTitle, { id: props.tokenId }),
      message: royalty.value === null
        ? fmt(t.value.marketplace.confirmListMsgRoyaltyUnavailable, {
            amount: formatCommandAmount(price),
            floor: floorConfirmationText.value,
          })
        : fmt(t.value.marketplace.confirmListMsg, {
            amount: formatCommandAmount(price),
            floor: floorConfirmationText.value,
            royalty: royalty.value,
          }),
      confirmLabel: t.value.marketplace.confirmListCta,
      icon: "info",
    });
    if (!ok || !responseStillCurrent(accountScope, tokenId, pageEpoch)
      || !confirmationStillCurrent(accountScope, tokenId, frozenListing)) return;
    const success = await genesis.listNode(tokenId, price);
    if (!responseStillCurrent(accountScope, tokenId, pageEpoch)) return;
    if (success === "recovered" || success === "local-retirement-pending") {
      toast.info(success === "recovered" ? t.value.marketplace.commandRecovered : t.value.marketplace.commandLocalPending,
        t.value.marketplace.commandRecoveryHint);
    } else if (success === true) {
      toast.success(
        fmt(t.value.marketplace.listedToast, { id: props.tokenId }),
        fmt(t.value.marketplace.listedDesc, { amount: formatCommandAmount(price) }),
      );
    } else {
      toast.error(t.value.marketplace.listingFailed, t.value.marketplace.listingFailedDesc);
    }
    } finally {
    pending.value = false;
  }
}

async function handleCancel() {
  if (pending.value || !mounted || !props.pageScope.visible || !existing.value) return;
  const accountScope = captureAccountScope();
  const tokenId = props.tokenId;
  const frozenListing = listingSnapshot();
  const pageEpoch = props.pageScope.epoch;
  pending.value = true;
  try {
    const ok = await confirm({
      owner: confirmationOwner,
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
    if (!ok || !responseStillCurrent(accountScope, tokenId, pageEpoch)
      || !confirmationStillCurrent(accountScope, tokenId, frozenListing)) return;
    const success = await genesis.cancelListing(tokenId);
    if (!responseStillCurrent(accountScope, tokenId, pageEpoch)) return;
    if (success === "recovered" || success === "local-retirement-pending") {
      toast.info(success === "recovered" ? t.value.marketplace.commandRecovered : t.value.marketplace.commandLocalPending,
        t.value.marketplace.commandRecoveryHint);
    } else if (success === true) {
      toast.info(
        fmt(t.value.marketplace.cancelledToast, { id: props.tokenId }),
        t.value.marketplace.cancelledDesc,
      );
    } else {
      toast.error(t.value.marketplace.listingFailed, t.value.marketplace.listingFailedDesc);
    }
    } finally {
    pending.value = false;
  }
}

// Collectible tile — filled surface, no border (single visual difference); the
// listed state is signaled by the badge + warning-tinted art + "yours" label.
const cardStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  borderRadius: "var(--nx-glass-radius)",
  background: "var(--nx-glass-fill)",
};
const artStyle: CSSProperties = {
  aspectRatio: "1 / 1",
};
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

import GenesisArtwork from "@/components/genesis/genesis-artwork.vue";
</script>
