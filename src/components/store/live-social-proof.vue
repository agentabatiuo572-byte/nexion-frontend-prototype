<!--
  LiveSocialProof — live-activity danmaku overlay anchored to the product image
  bottom-left (parent must be position:relative). Ported from
  Nexion-prototype/app/components/live-social-proof.tsx.

  Rows (deterministic from product.id seed, then jitter every 12s):
    1. {viewing} viewing right now
    2. {sold24h} sold · 24h
    3. {sold30m} sold · 30m
    4. only {stock} left  (only if product.stock < 50)

  3 visible rows; the list is duplicated and scrolled with @keyframes dnk-scroll
  (in tokens.css) so translateY(-50%) wraps seamlessly. Top/bottom fade mask
  softens entering/exiting rows.
-->
<template>
  <view v-if="remoteApiEnabled && remoteProof" class="absolute" :style="rootStyle" :aria-label="remoteProof.productName">
    <view>
      <view v-for="(r, i) in remoteRows" :key="i" class="flex items-baseline" :style="rowStyle">
        <view aria-hidden class="shrink-0" :style="dotStyle(r.color)" />
        <text class="shrink-0 tabular-nums" :style="numStyle(r.color)">{{ r.n.toLocaleString() }}</text>
        <text class="truncate" :style="labelStyle">{{ r.label }}</text>
      </view>
    </view>
  </view>
  <view v-else-if="!remoteApiEnabled" class="absolute" :style="rootStyle" :aria-label="`${w.label} · ${MOCK_STOREFRONT_SOCIAL_PROOF_FIXTURE_ID}`">
    <view :style="listStyle">
      <view v-for="(r, i) in doubled" :key="i" class="flex items-baseline" :style="rowStyle">
        <view aria-hidden class="shrink-0" :style="dotStyle(r.color)" />
        <text class="shrink-0 tabular-nums" :style="numStyle(r.color)">{{ r.n.toLocaleString() }}</text>
        <text class="truncate" :style="labelStyle">{{ r.label }}</text>
        <text v-if="r.hot" class="shrink-0" style="color: var(--v5-brand-2); font-size: 12px; margin-left: 1px">⚡</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, type CSSProperties } from "vue";
import type { Product } from "@/mock/products";
import { useT } from "@/i18n/use-t";
import { remoteApiEnabled, storefrontActivityApi } from "@/api/runtime";
import type { StorefrontSocialProof } from "@/api/storefront-activity-api";
import { useApp } from "@/store/app";
import { createRemoteAccountEpoch } from "@/lib/remote-account-epoch";
import { MOCK_STOREFRONT_SOCIAL_PROOF_FIXTURE_ID, fixtureSocialProofValue } from "@/mock/storefront-social-proof";

const props = defineProps<{ product: Product }>();
const t = useT();
const app = useApp();
const w = computed(() => t.value.store.liveProof);
const remoteProof = ref<StorefrontSocialProof | null>(null);
const remoteEpoch = createRemoteAccountEpoch(app.accountKey);

function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t2 = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t2 = (t2 + Math.imul(t2 ^ (t2 >>> 7), 61 | t2)) ^ t2;
    return ((t2 ^ (t2 >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const rng = seeded(hashId(props.product.id));
const baseViewing = 24 + Math.floor(rng() * 92); // 24-115
const baseSold24h = Math.max(8, Math.floor(props.product.sold * 0.024));
const baseSold30m = Math.max(1, Math.floor(baseSold24h * 0.022));

const viewing = ref(baseViewing);
const sold24h = ref(baseSold24h);
const sold30m = ref(baseSold30m);
const fixtureTick = ref(0);
const mounted = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;

function clearRemoteProof(): void {
  remoteProof.value = null;
}

function loadRemoteProof(request = remoteEpoch.snapshot()): void {
  void storefrontActivityApi.socialProof(props.product.id, 30).then((snapshot) => {
    if (remoteEpoch.isCurrent(request)) remoteProof.value = snapshot;
  }).catch(() => {
    if (remoteEpoch.isCurrent(request)) clearRemoteProof();
  });
}

onMounted(() => {
  if (remoteApiEnabled) {
    remoteEpoch.bind(app.accountKey);
    clearRemoteProof();
    loadRemoteProof();
    return;
  }
  mounted.value = true;
  timer = setInterval(() => {
    fixtureTick.value += 1;
    viewing.value = fixtureSocialProofValue(baseViewing, fixtureTick.value, 9, 1);
    sold24h.value = baseSold24h + Math.floor(fixtureTick.value / 3);
    sold30m.value = baseSold30m + Math.floor(fixtureTick.value / 17);
  }, 12_000);
});
watch(() => app.accountKey, (accountKey) => {
  if (!remoteApiEnabled) return;
  remoteEpoch.bind(accountKey);
  clearRemoteProof();
  loadRemoteProof();
});
watch(() => props.product.id, () => {
  if (!remoteApiEnabled) return;
  remoteEpoch.bind(app.accountKey);
  clearRemoteProof();
  loadRemoteProof();
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

type FlatRow = { n: number; label: string; color: string; hot?: boolean };
const remoteRows = computed<FlatRow[]>(() => {
  const proof = remoteProof.value;
  if (!proof) return [];
  const rows: FlatRow[] = [
    { n: proof.windowSales, label: `${t.value.store.soldLabel} · ${proof.windowDays}d`, color: "var(--v5-brand)" },
    { n: proof.cumulativeSales, label: t.value.store.soldLabel, color: "var(--v5-success-ink)" },
  ];
  const stock = props.product.stock;
  if (stock !== undefined && stock < 50) {
    rows.push({ n: stock, label: w.value.stockShortLabel, color: "var(--v5-brand-2)" });
  }
  return rows;
});
const flat = computed<FlatRow[]>(() => {
  const rows: FlatRow[] = [
    { n: viewing.value, label: w.value.viewingLabel, color: "var(--v5-tech-cyan)" },
    { n: sold24h.value, label: w.value.sold24hLabel, color: "var(--v5-brand)" },
    { n: sold30m.value, label: w.value.sold30mLabel, color: "var(--v5-brand-2)", hot: sold30m.value > 0 },
  ];
  const stock = props.product.stock;
  if (stock !== undefined && stock < 50) {
    rows.push({ n: stock, label: w.value.stockShortLabel, color: "var(--v5-brand-2)", hot: true });
  }
  return rows;
});
const doubled = computed(() => [...flat.value, ...flat.value]);
const duration = computed(() => flat.value.length * 2);

const rootStyle: CSSProperties = {
  left: "4px",
  bottom: "12px",
  width: "156px",
  height: "66px", // 3 rows × 22px
  overflow: "hidden",
  maskImage: "linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)",
  WebkitMaskImage: "linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)",
  pointerEvents: "none",
  zIndex: 5,
};
const listStyle = computed<CSSProperties>(() => ({
  animation: mounted.value ? `dnk-scroll ${duration.value}s linear infinite` : "none",
}));
const rowStyle: CSSProperties = {
  gap: "5px",
  height: "22px",
  lineHeight: "22px",
  whiteSpace: "nowrap",
  overflow: "hidden",
};
function dotStyle(color: string): CSSProperties {
  return {
    width: "5px",
    height: "5px",
    borderRadius: "50%",
    background: color,
    marginRight: "1px",
    alignSelf: "center",
  };
}
function numStyle(color: string): CSSProperties {
  return {
    fontFamily: "var(--font-v5)",
    fontWeight: 600,
    fontSize: "13px",
    color,
    letterSpacing: "-0.005em",
  };
}
const labelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
</script>
