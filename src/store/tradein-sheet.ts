import { defineStore } from "pinia";
import { ref } from "vue";
import { useApp } from "./app";
import type { DeviceKind } from "./types";
import type { CanonicalCapacityReplaceQuote, CanonicalTradeinQuote } from "@/api/device-e3-api";

/**
 * Trade-in flow sheet state machine — Batch C (2026-05-27).
 * Ported from Nexion-prototype/lib/store/tradein-sheet.ts (zustand → Pinia).
 *
 * Single discriminated union enforces "only one sheet open at a time" rule
 * from Batch C spec (prevents double-open from rapid taps). Each show* action
 * transitions from any current state, so the natural sheet chain
 * (choice → tradein, replace → block) works without manual close-then-open.
 *
 * No persistence — sheet state is ephemeral UI; closing or reloading
 * dismisses everything.
 *
 * Note: the union lives on ONE `ref` (whole object replaced atomically by each
 * setter), so Vue reactivity is stable — this is NOT a Set/Map membership case
 * (P-027). `state.value.kind` discriminates which sheet renders.
 */
export type TradeinSheetState =
  | { kind: "none" }
  | {
      kind: "choice";
      targetKind: DeviceKind;
      newPrice: number;
      /** Owned device ids the user could retire toward `targetKind`
       *  (FEAT-DEV02: device-level, ladder credit is per-device). */
      tradeInSources: string[];
    }
  | {
      /** FEAT-DEV02 主动下架入口(设备列表)——先选目标 SKU,再进 tradein 确认。 */
      kind: "retire";
      oldDeviceId: string;
    }
  | {
      kind: "tradein";
      oldDeviceId: string;
      newKind: DeviceKind;
      newPrice: number;
    }
  | {
      kind: "replace";
      newKind: DeviceKind;
      newPrice: number;
      /** Pre-computed lowest-yield active device id, snapshotted at the moment
       *  `showReplace` is called. Sheet uses this id to look up the actual
       *  device — avoiding the previous "recompute lowest per render" bug
       *  (Batch C Round 1 P1 #10), which caused the displayed target device to
       *  drift between sheet open and user tap if `tick()` shifted the active
       *  devices' `todayEarnings` ordering in between. */
      oldDeviceId: string;
      canonicalCapacityQuote?: CanonicalCapacityReplaceQuote;
    }
  | {
      kind: "block";
      origin: "replace";
      /** Lowest active device blocking the replace because of a running task. */
      oldDeviceId: string;
      oldDeviceName: string;
      newKind: DeviceKind;
      newPrice: number;
    }
  | {
      /** FEAT-DEV02:retire 入口的任务阻断——当前任务完成后可下架,只给 查看任务/知道了。 */
      kind: "block";
      origin: "retire";
      oldDeviceId: string;
      oldDeviceName: string;
    };

export const useTradeinSheet = defineStore("tradeinSheet", () => {
  const state = ref<TradeinSheetState>({ kind: "none" });

  /** FEAT-DEV02 结算抵扣上下文:确认置换后写入,checkout 读它渲染抵扣行并在
   *  持久块原子执行(移除旧机+净额扣款+新机未激活入库);「移除」清空恢复原价。
   *  仅内存态(不持久):刷新丢弃=放弃抵扣,旧设备原状,无半执行风险。 */
  const appliedTradein = ref<{ oldDeviceId: string; targetKind: DeviceKind; canonicalQuote?: CanonicalTradeinQuote } | null>(null);
  /**
   * 🔴 全局单槽 + owner(page-header 同款,P-116):浮动条 / 绑卡返回会让**两个结算页实例同时在栈上**,
   * 上层实例的卸载(含晚一拍的 onUnmounted)若无条件清槽,会抹掉在世实例正在用的抵扣上下文 ——
   * 它的活票随即按全价复算、被「金额已变」拒单并销票(审计 R5 P0,运行时红测复现)。
   * 带 owner 的 clear 只清自己写的那份;不带 owner 的 apply / clear 是可见页面上的用户动作,照旧无条件。
   */
  let appliedOwner: symbol | null = null;
  function applyTradein(oldDeviceId: string, targetKind: DeviceKind, canonicalQuote?: CanonicalTradeinQuote, owner: symbol | null = null) {
    appliedTradein.value = { oldDeviceId, targetKind, canonicalQuote };
    appliedOwner = owner;
  }
  function clearApplied(owner?: symbol) {
    if (owner !== undefined && appliedOwner !== null && appliedOwner !== owner) return;
    appliedTradein.value = null;
    appliedOwner = null;
  }
  /** 当前槽是否由该 owner 写入(页面据此决定要不要把自己的镜像重新挂回去)。 */
  function appliedBy(owner: symbol): boolean {
    return appliedTradein.value !== null && appliedOwner === owner;
  }

  function showChoice(
    targetKind: DeviceKind,
    newPrice: number,
    tradeInSources: string[],
  ) {
    state.value = { kind: "choice", targetKind, newPrice, tradeInSources };
  }

  function showRetire(oldDeviceId: string) {
    state.value = { kind: "retire", oldDeviceId };
  }

  function showTradein(oldDeviceId: string, newKind: DeviceKind, newPrice: number) {
    state.value = { kind: "tradein", oldDeviceId, newKind, newPrice };
  }

  function showReplace(newKind: DeviceKind, newPrice: number) {
    // Snapshot lowest-yield active device id at call time. Prevents the
    // "lowest drifts mid-sheet" Batch C R1 P1 #10 attack — even if tick()
    // re-orders earnings between open + tap, the sheet keeps targeting the
    // device the user expected.
    const devices = useApp().slotDevices;
    const active = devices.filter((d) => d.activatedAt !== null);
    if (active.length === 0) {
      // No active device to replace — caller's slot-full assumption is wrong
      // (active count < MAX_DEVICES). Bail out instead of opening a stuck
      // sheet; checkout's normal payment path will resume.
      state.value = { kind: "none" };
      return;
    }
    const lowest = active.reduce((acc, d) =>
      d.todayEarnings < acc.todayEarnings ? d : acc,
    );
    state.value = { kind: "replace", newKind, newPrice, oldDeviceId: lowest.id };
  }

  function showCanonicalReplace(newKind: DeviceKind, newPrice: number, quote: CanonicalCapacityReplaceQuote) {
    if (quote.decision !== "REPLACE_REQUIRED" || quote.sourceDeviceId == null) {
      state.value = { kind: "none" };
      return;
    }
    state.value = {
      kind: "replace",
      newKind,
      newPrice,
      oldDeviceId: String(quote.sourceDeviceId),
      canonicalCapacityQuote: quote,
    };
  }

  function showBlock(
    oldDeviceId: string,
    oldDeviceName: string,
    newKind: DeviceKind,
    newPrice: number,
  ) {
    state.value = { kind: "block", origin: "replace", oldDeviceId, oldDeviceName, newKind, newPrice };
  }

  function showRetireBlock(oldDeviceId: string, oldDeviceName: string) {
    state.value = { kind: "block", origin: "retire", oldDeviceId, oldDeviceName };
  }

  function hide() {
    state.value = { kind: "none" };
  }

  return { state, appliedTradein, applyTradein, clearApplied, appliedBy, showChoice, showRetire, showTradein, showReplace, showCanonicalReplace, showBlock, showRetireBlock, hide };
});
