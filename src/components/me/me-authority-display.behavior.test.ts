import { describe, expect, it } from "vitest";
import { computed, reactive, ref, type ComputedRef } from "vue";
import ts from "typescript";
import walletSource from "./wallet-card.vue?raw";
import meSource from "@/pages/me/me.vue?raw";
import { remoteAuthorityStatus } from "@/lib/remote-authority-display";
import { isActiveSlotDevice } from "@/lib/device-slot-policy";
import { fmt, openSlotsTemplate } from "@/i18n/format";
import type { DeviceKind } from "@/store/types";

function mount(remoteApiEnabled = true) {
  const devices = reactive<Array<{ kind: DeviceKind; activatedAt: number | null }>>([]);
  const app = reactive({
    remoteFleetHasSnapshot: false, remoteWalletReceiptHasSnapshot: false, remoteFleetStatus: "idle",
    slotCap: 6,
    user: { usdtBalance: 0, nexBalance: 0, earningBuckets: { pendingReviewUsdt: 0, bonusLockedUsdt: 0 } },
    get activeSlotCount() { return devices.filter(isActiveSlotDevice).length; },
  });
  const trial = reactive({ authorityStatus: "unknown", authorityServerState: null as string | null, status: "none" });
  const market = reactive({ isMockMode: false, remoteReady: true, nexPriceUSDT: 2 });
  const earningsReleaseSnapshot = ref<{ serverCanonical: boolean; buckets: { pending_review: number; bonus_locked: number } } | null>(null);
  const earningsReleaseHasSnapshot = ref(false);
  const earningsReleaseStatus = ref("idle");
  const t = ref({
    me: { walletBucketsHint: "Review {review} · Locked {locked}", walletSlotsLine: "{active} active · {open} slots open" },
    myDevices: { sectionCount: "{n} / {total}", activatedLabel: "{n} active", emptySlots: "{n} slots open" },
  });
  const inputs = { computed, app, trial, market, earningsReleaseSnapshot, earningsReleaseHasSnapshot, earningsReleaseStatus, t, remoteApiEnabled,
    remoteAuthorityStatus, fmt, openSlotsTemplate,
    trialReservesSlotNow: () => ["active", "grace"].includes(trial.status),
  };
  function projections(source: string, names: string[]) {
    const script = source.split('<script setup lang="ts">')[1].split("</script>")[0];
    const ast = ts.createSourceFile("me.ts", script, ts.ScriptTarget.Latest, true);
    const declarations: string[] = [];
    for (const statement of ast.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (names.includes(declaration.name.getText(ast))) declarations.push(`const ${declaration.getText(ast)};`);
      }
    }
    const body = ts.transpileModule(declarations.join("\n"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return new Function(...Object.keys(inputs), body + `;return {${names.filter(name => declarations.some(d => d.startsWith(`const ${name} =`))).join(",")}};`)(
      ...Object.values(inputs),
    ) as Record<string, ComputedRef<string | number | boolean>>;
  }
  const wallet = projections(walletSource, ["fundsReadable", "usdtBalanceReadable", "bucketsReadable", "trialReady", "slotsReadable",
    "buckets", "usdt", "pendingLine", "nex", "nexLabel", "marketReady", "nexMarketLabel", "activeCount", "trialSlot", "emptySlots", "slotsLine", "usdtLabel"]);
  const me = projections(meSource, ["trialReady", "slotsReadable", "activeCount", "trialSlot", "slotsUsed", "emptySlots",
    "deviceSectionCount", "activatedLabel", "emptySlotsLabel"]);
  const slotCondition = walletSource.match(/v-if="([^"]+)" class="grid items-center nx-wallet-slot-block"/)?.[1];
  if (!slotCondition) throw new Error("Wallet slot promotion binding missing");
  const showsSlotPromotion = () => new Function(...Object.keys(wallet), `return ${slotCondition};`)(...Object.values(wallet).map(v => v.value));
  const read = () => ({
    usdt: wallet.usdtLabel.value, nex: wallet.nexLabel.value, pending: wallet.pendingLine.value,
    valuation: wallet.nexMarketLabel.value, count: me.deviceSectionCount.value,
    active: me.activatedLabel.value, open: me.emptySlotsLabel.value, promotion: showsSlotPromotion(),
  });
  const confirmFleetAndTrial = () => {
    app.remoteFleetHasSnapshot = true; app.remoteFleetStatus = "ready";
    trial.authorityStatus = "ready"; trial.authorityServerState = "ELIGIBLE";
  };
  const confirmRelease = (review = 0, locked = 0) => {
    earningsReleaseSnapshot.value = { serverCanonical: true, buckets: { pending_review: review, bonus_locked: locked } };
    earningsReleaseHasSnapshot.value = true; earningsReleaseStatus.value = "ready";
  };
  return { app, trial, market, devices, earningsReleaseSnapshot, earningsReleaseHasSnapshot, earningsReleaseStatus,
    read, confirmFleetAndTrial, confirmRelease };
}

describe("Me wallet and device authority", () => {
  it("keeps initial unknown balances, buckets and default six slots out of the first frame", () => {
    expect(mount().read()).toEqual({
      usdt: "—", nex: "—", pending: "Review — · Locked —", valuation: "≈ — USDT · 1 NEX = 2.000 USDT",
      count: "—", active: "—", open: "—", promotion: false,
    });
  });

  it("shows a payment receipt's confirmed USDT without authorizing NEX, buckets or slots", () => {
    const s = mount(); s.app.user.usdtBalance = 1299; s.app.remoteWalletReceiptHasSnapshot = true;
    expect(s.read()).toMatchObject({ usdt: "1,299.00", nex: "—", pending: "Review — · Locked —", count: "—", promotion: false });
  });

  it("requires both fleet and trial authority and preserves genuine zero", () => {
    const s = mount(); s.app.remoteFleetHasSnapshot = true; s.app.slotCap = 3;
    expect(s.read()).toMatchObject({ usdt: "0.00", nex: "0", count: "—", active: "—", open: "—", promotion: false });
    s.confirmFleetAndTrial();
    expect(s.read()).toEqual({
      usdt: "0.00", nex: "0", pending: "Review — · Locked —", valuation: "≈ 0.00 USDT · 1 NEX = 2.000 USDT",
      count: "0 / 3", active: "0 active", open: "3 slots open", promotion: true,
    });
  });

  it("retains confirmed values while refreshing and removes them on account authority reset", () => {
    const s = mount(); s.confirmFleetAndTrial(); s.confirmRelease(4.5, 7); s.app.slotCap = 3; s.app.user.usdtBalance = 1299; s.app.user.nexBalance = 10;
    s.app.remoteFleetStatus = "loading"; s.trial.authorityStatus = "loading";
    expect(s.read()).toMatchObject({ usdt: "1,299.00", nex: "10", pending: "Review 4.50 · Locked 7.00", count: "0 / 3" });
    s.app.remoteFleetStatus = "error";
    expect(s.read()).toMatchObject({ usdt: "1,299.00", nex: "10", count: "0 / 3" });
    s.app.remoteFleetHasSnapshot = false; s.app.remoteWalletReceiptHasSnapshot = false;
    s.earningsReleaseHasSnapshot.value = false; s.earningsReleaseStatus.value = "idle";
    s.trial.authorityServerState = null; s.trial.authorityStatus = "unknown";
    expect(s.read()).toMatchObject({ usdt: "—", nex: "—", pending: "Review — · Locked —", count: "—", open: "—", promotion: false });
  });

  it("keeps failed initial reads unknown and recovers after confirmed snapshots arrive", () => {
    const s = mount(); s.app.remoteFleetStatus = "error"; s.trial.authorityStatus = "error";
    expect(s.read()).toMatchObject({ usdt: "—", nex: "—", count: "—", promotion: false });
    s.confirmFleetAndTrial(); expect(s.read()).toMatchObject({ usdt: "0.00", nex: "0", count: "0 / 6" });
    s.trial.authorityStatus = "error"; s.trial.authorityServerState = null;
    expect(s.read()).toMatchObject({ usdt: "0.00", nex: "0", count: "—", open: "—", promotion: false });
  });

  it("counts two physical slots plus one reserved trial while Cloud Share remains virtual capacity", () => {
    const s = mount(); s.confirmFleetAndTrial(); s.app.slotCap = 3;
    s.devices.push({ kind: "phone", activatedAt: 1 }, { kind: "stellarbox-s1", activatedAt: 1 },
      ...Array.from({ length: 3 }, () => ({ kind: "cloud-share" as const, activatedAt: 1 })));
    expect(s.read()).toMatchObject({ count: "2 / 3", active: "2 active", open: "1 slot open", promotion: true });
    s.trial.status = "grace"; s.trial.authorityServerState = "EXTENDED";
    expect(s.read()).toMatchObject({ count: "3 / 3", active: "2 active", open: "0 slots open", promotion: false });
  });

  it("preserves readable local mode and keeps unknown market valuation distinct from known holdings", () => {
    const s = mount(false); s.app.user.usdtBalance = 12.5; s.app.user.nexBalance = 10; s.market.remoteReady = false;
    s.app.user.earningBuckets.pendingReviewUsdt = 4; s.app.user.earningBuckets.bonusLockedUsdt = 2;
    expect(s.read()).toMatchObject({ usdt: "12.50", nex: "10", pending: "Review 4.00 · Locked 2.00", valuation: "≈ — USDT · 1 NEX = — USDT", count: "0 / 6" });
  });

  it.each(["idle", "loading", "error"])("fleet confirmation never authorizes held buckets while release is %s without a snapshot", status => {
    const s = mount(); s.confirmFleetAndTrial(); s.earningsReleaseStatus.value = status;
    expect(s.read()).toMatchObject({ usdt: "0.00", nex: "0", pending: "Review — · Locked —", count: "0 / 6" });
  });

  it("requires complete release authority and shows genuine zero only from a confirmed release snapshot", () => {
    const s = mount(); s.confirmFleetAndTrial(); s.confirmRelease();
    expect(s.read().pending).toBe("Review 0.00 · Locked 0.00");
    s.earningsReleaseSnapshot.value = null;
    expect(s.read().pending).toBe("Review — · Locked —");
    s.confirmRelease(); s.earningsReleaseHasSnapshot.value = false;
    expect(s.read().pending).toBe("Review — · Locked —");
    s.confirmRelease(); s.earningsReleaseStatus.value = "error";
    expect(s.read().pending).toBe("Review — · Locked —");
    s.confirmRelease(); s.earningsReleaseSnapshot.value!.serverCanonical = false;
    expect(s.read().pending).toBe("Review — · Locked —");
    s.confirmRelease(); expect(s.read().pending).toBe("Review 0.00 · Locked 0.00");
  });

  it("reads release independently of fleet, retains same-account buckets only during refresh, and hides reset or failed authority", () => {
    const s = mount(); s.confirmRelease(4.5, 7);
    expect(s.read()).toMatchObject({ usdt: "—", nex: "—", pending: "Review 4.50 · Locked 7.00" });
    s.earningsReleaseStatus.value = "loading";
    expect(s.read().pending).toBe("Review 4.50 · Locked 7.00");
    s.earningsReleaseSnapshot.value = null; s.earningsReleaseHasSnapshot.value = false; s.earningsReleaseStatus.value = "error";
    expect(s.read().pending).toBe("Review — · Locked —");
    s.confirmRelease(4.5, 7); s.earningsReleaseHasSnapshot.value = false; s.earningsReleaseStatus.value = "loading";
    expect(s.read().pending).toBe("Review — · Locked —");
  });
});
