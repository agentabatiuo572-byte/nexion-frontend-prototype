import { computed, ref, watch } from "vue";
import { formatAmount } from "@/lib/amount-display";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { deviceName } from "@/lib/device-copy";
import { canControlDevice } from "@/lib/device-control-platform";
import { useApp } from "@/store/app";
import { useTradeinSheet } from "@/store/tradein-sheet";
import { PRODUCTS } from "@/mock/products";
import { computeTradeInCredit, TRADEIN_LADDER_RULES, DEFAULT_TRADEIN_CONFIG } from "@/mock/tradein-config";
import { isDeviceTaskBlocked } from "@/mock/eligibility";
import { getMonthsSince, isTradeInTargetAvailable } from "@/store/product-phase";
import { useProductPhase } from "@/composables/use-product-phase";
import type { Device } from "@/store/types";
import { deviceE3Api, remoteApiEnabled } from "@/api/runtime";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { isProductAvailable } from "@/store/product-availability";
import { refreshProductCatalog } from "@/store/product-catalog";

// ── FEAT-DEV02 升级置换条 ──────────────────────────────────────────────
// 设备仓库行与赚取页设备操作面板共用同一资格判定与 retire 入口。
// 总开关关 / 免费设备(paidPriceUsdt=0)/不在 applyTo 白名单 → 返回空对象 =
// 零痕迹;无合规目标 → 只给禁用原因;其余给「可抵 $X」chip + 置换 CTA。
// 默认规则(promoMult=1)下抵扣额与目标无关,取最低升级价参与计算即为真值;
// promoMult>≈1.47 时 clamp 才可能绑定,届时各面按各自目标价如实显示。
// `enabled` 为 false 时不读远端资格(操作面板只在打开时读取)。
export function useTradeinStrip(enabled: () => boolean = () => true) {
  const t = useT();
  const app = useApp();
  const tradeinSheet = useTradeinSheet();
  // 上架节奏门(FEAT-DEV02b):未正式上架且不在抢先购窗口的 SKU 不算升级目标。
  const phase = useProductPhase();
  const monthsSinceJoin = computed(() => getMonthsSince(app.user.joinedAt));
  const remoteEligibleSourceIds = ref<Set<number>>(new Set());
  const remoteEligibilityReady = ref(!remoteApiEnabled);
  let remoteEligibilityRequest = 0;

  async function refreshRemoteTradeinEligibility(): Promise<void> {
    if (!remoteApiEnabled) return;
    const accountKey = app.accountKey;
    const scope = captureAccountScope();
    const request = ++remoteEligibilityRequest;
    const current = () => request === remoteEligibilityRequest
      && accountKey === app.accountKey && isCurrentAccountScope(scope);
    remoteEligibilityReady.value = false;
    remoteEligibleSourceIds.value = new Set();
    try {
      if (!(await refreshProductCatalog(true)) || !current()) return;
      const targets = PRODUCTS.filter((product) => isProductAvailable(product, phase.value));
      const snapshots = await Promise.all(targets.map((product) => deviceE3Api.eligibility(product.id)));
      if (!current()) return;
      remoteEligibleSourceIds.value = new Set(snapshots.flatMap((snapshot) => snapshot.sources
        .filter((source) => source.eligible)
        .map((source) => source.sourceDeviceId)));
      remoteEligibilityReady.value = true;
    } catch {
      if (current()) remoteEligibleSourceIds.value = new Set();
    }
  }

  watch(
    () => enabled() && JSON.stringify([app.accountKey, app.devices.map((device) => [
      device.id, device.activatedAt, device.pendingDeactivate, Boolean(device.currentTask),
    ])]),
    (value, _previous, onCleanup) => {
      onCleanup(() => { remoteEligibilityRequest++; });
      if (value) void refreshRemoteTradeinEligibility();
    },
    { immediate: true },
  );

  function tradeinStrip(d: Device): {
    tradeinCreditText?: string;
    tradeinCtaLabel?: string;
    tradeinDisabledText?: string;
  } {
    if (remoteApiEnabled) {
      if (!remoteEligibilityReady.value || !remoteEligibleSourceIds.value.has(Number(d.id))) return {};
      return {
        tradeinCreditText: t.value.tradein.remoteQuoteCreditLabel,
        tradeinCtaLabel: t.value.tradein.stripCta,
      };
    }
    if (!DEFAULT_TRADEIN_CONFIG.enabled) return {};
    const paid = d.paidPriceUsdt ?? 0;
    if (paid <= 0 || !TRADEIN_LADDER_RULES.applyTo.includes(d.kind)) return {};
    const targets = PRODUCTS.filter(
      (p) =>
        (!TRADEIN_LADDER_RULES.requireHigherPrice || p.price > paid) &&
        isTradeInTargetAvailable(p.unlocksAtPhase, phase.value, monthsSinceJoin.value),
    );
    if (targets.length === 0) return { tradeinDisabledText: t.value.tradein.stripNoTarget };
    const credit = computeTradeInCredit(
      paid,
      Math.max(0, d.cumulativeEarningsUsdt ?? 0),
      Math.min(...targets.map((p) => p.price)),
    );
    return {
      tradeinCreditText: fmt(t.value.tradein.stripCredit, { credit: formatAmount(credit) }),
      tradeinCtaLabel: t.value.tradein.stripCta,
    };
  }

  function handleTradein(d: Device) {
    if (!canControlDevice(d)) return;
    // 激活中且任务运行:阻断层(完成后可下架,查看任务/知道了),不硬拆(规格
    // DEV02A 异常2)。库存机的出厂任务不在跑,不阻断——判定单源 isDeviceTaskBlocked。
    if (!remoteApiEnabled && isDeviceTaskBlocked(d)) {
      tradeinSheet.showRetireBlock(d.id, deviceName(t.value, d));
      return;
    }
    tradeinSheet.showRetire(d.id);
  }

  return { tradeinStrip, handleTradein, refreshRemoteTradeinEligibility };
}
