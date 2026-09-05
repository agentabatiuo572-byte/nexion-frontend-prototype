/**
 * Ported from Nexion-prototype/lib/store/orders.ts
 * (zustand persist → Pinia + uni storage).
 *
 * Unified 4-stage flow for every product (NexGridBox tiers + Cloud Share).
 * No shipping fiction — every device is platform-hosted in our DC, so the
 * only meaningful states are: order placed → paid → DC provisioning → live.
 *
 * ⚠️ MOCK STATE MACHINE — INCOMPLETE FOR PRODUCTION
 * Missing terminal states a real platform needs (payment_failed / expired /
 * refunded / chargeback / provisioning_failed) collapse into `cancelled` here.
 * Production: state machine + transitions live on server; client receives
 * canonical state via `GET /api/orders/:id` (no client state inference).
 */

import { defineStore } from "pinia";
import { onScopeDispose, ref } from "vue";
import { useApp } from "./app";
import type { DeviceKind } from "./types";
import { normalizeAccountKey } from "./account-cloud";
import { createAccountRowCommit } from "./account-scoped-storage";
import { orderApi, remoteApiEnabled } from "@/api/runtime";
import type { CanonicalOrder, CanonicalOrderStatus } from "@/api/order-api";
import {
  captureCommerceSandboxRun,
  isCurrentCommerceSandboxScope,
  subscribeCurrentCommerceSandboxRun,
} from "@/api/order-api";

/** Server status is rendered verbatim in remote mode; no terminal outcome is collapsed into cancellation. */
export type OrderStatus = CanonicalOrderStatus;

export interface OrderTimelineEvent {
  status: OrderStatus;
  ts: number;
  note?: string;
}

export interface Order {
  id: string;               // ORD-20260516-1234
  productId: Exclude<DeviceKind, "phone">;
  productName: string;
  quantity: number;
  /** Number of products represented by a canonical bundle order. */
  itemCount?: number;
  unitPrice: number;        // USDT
  discount: number;         // USDT (voucher)
  /** FEAT-DEV02 旧机抵扣(USDT)——仅结算抵减,永不入余额;服务端同事务复算。 */
  tradeInCredit?: number;
  /** 被下架抵扣的旧设备 id(履约与审计追溯用)。 */
  tradeInDeviceId?: string;
  /** FEAT-TRIAL02 试用转化促销折扣(USDT)——与代金券分列,order-detail 分行展示。 */
  promoDiscountUSD?: number;
  /** FEAT-TRIAL02 试用抵扣金(USDT)——仅结算抵减;服务端在同一订单事务里复算并 convert。 */
  trialOffsetUSD?: number;
  total: number;            // USDT = unitPrice − discount − tradeInCredit − promoDiscountUSD − trialOffsetUSD
  paymentMethod: string;    // "usdt-trc20" etc
  status: OrderStatus;
  placedAt: number;
  paidAt?: number;
  activatedAt?: number;
  timeline: OrderTimelineEvent[];
  deviceId?: string;        // the spawned device id once activated
  // Data-center the unit was provisioned in (Singapore / Frankfurt)
  dataCenter: "Singapore DC" | "Frankfurt DC";
}

export interface CreateOrderInput {
  productId: Order["productId"];
  productName: string;
  unitPrice: number;
  paymentMethod: string;
  discount?: number;
  tradeInCredit?: number;
  tradeInDeviceId?: string;
  promoDiscountUSD?: number;
  trialOffsetUSD?: number;
}

// 旧设备级单键 "nexgrid-orders-v4" 废弃(存量无账号归属,mock 可重建);订单按账号分行。
const ACCOUNTS_KEY = "nexgrid-orders-accounts-v1"; // { [accountKey]: { orders: Order[] } }

function genOrderId(): string {
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const seq = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${yyyymmdd}-${seq}`;
}

const TIMELINE: OrderStatus[] = ["placed", "paid", "provisioning", "activated"];

export function timelineFor(_productId: Order["productId"]): OrderStatus[] {
  return TIMELINE;
}

function pickDataCenter(productId: Order["productId"]): Order["dataCenter"] {
  // NexGridRack (P1/P2) lives in Frankfurt, everything else in Singapore.
  return productId === "stellarrack-p1" || productId === "stellarrack-p2"
    ? "Frankfurt DC"
    : "Singapore DC";
}

function statusNote(next: OrderStatus, dc: Order["dataCenter"]): string | undefined {
  switch (next) {
    case "provisioning":
      return `Allocating rack slot in ${dc}…`;
    case "activated":
      return "Device live · joined NexGrid network";
    default:
      return undefined;
  }
}

type OrdersRow = { orders: Order[] };
function parseOrdersRow(raw: unknown): OrdersRow {
  const row = raw as { orders?: unknown } | null;
  return { orders: row && Array.isArray(row.orders) ? (row.orders as Order[]) : [] };
}

// app store optional device-CRUD surface — these actions land on useApp when the
// store/me/devices pages are ported (PORT-LEDGER app store block step 4). Until
// then this typed view lets advanceOrder() compile and degrade gracefully: the
// order still advances to "activated", just without spawning a Device.
type DeviceSpawnApp = {
  addDevice?: (kind: DeviceKind, options?: { paidPriceUsdt?: number }) => string | null;
  activateDevice?: (id: string, reservedSlots?: number) => boolean;
  discardSpawnedDevice?: (id: string) => boolean;
  devices: { id: string; activatedAt?: number | null }[];
};

export const useOrders = defineStore("orders", () => {
  // 账号维度。boot 期落 "default";账号确定后由 lib/account-scope 的
  // rebindAccountScopedStores 统一重绑(P-031 store 不互 import)。
  let boundKey = "default";
  // Any in-flight server response is scoped to this binding generation. A logout
  // or account switch must not project the prior account into the new session.
  let boundEpoch = 0;
  let refreshGeneration = 0;
  const orders = ref<Order[]>([]);

  const unsubscribeCommerceRun = subscribeCurrentCommerceSandboxRun(() => {
    if (!remoteApiEnabled) return;
    refreshGeneration += 1;
    orders.value = [];
  });
  onScopeDispose(unsubscribeCommerceRun);

  /**
   * 🔴 落盘走 CAS 提交器(与 pending-checkout / deposits 同款),不再整行覆盖写(审计 R10 P0):
   * H5 多标签页各持一份内存副本、永久不同步,覆盖写 = 后写者用陈旧数组抹掉别的标签页刚落盘的已付款订单
   * (钱按增量合并保住了,单却没了 → 履约永不发生)。每次变更在**磁盘最新行**上 apply,提交结果 sync 回内存。
   * 远端档不落本地盘(状态归服务端):提交器不建、不读。
   */
  const rows = createAccountRowCommit<OrdersRow>({
    tableKey: ACCOUNTS_KEY,
    parse: parseOrdersRow,
    snapshot: () => ({ orders: orders.value }),
    sync: (row) => { orders.value = row.orders; },
  });

  /** 在磁盘最新行上改订单列表;返回提交是否成功(前置不成立 / 写失败都是 false,内存已按提交器语义处理)。 */
  function commitOrders(apply: (cur: Order[]) => Order[] | null): boolean {
    if (remoteApiEnabled) return false;
    return rows.commit((cur) => {
      const next = apply(cur.orders);
      return next ? { next: { orders: next }, result: true as const } : null;
    }).ok;
  }

  /** 账号切换重绑:装载该账号的订单行。 */
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    boundEpoch += 1;
    refreshGeneration += 1;
    orders.value = remoteApiEnabled ? [] : (rows.bind(boundKey)?.orders ?? []);
  }
  bindAccount(boundKey); // boot 期先挂 "default";账号确定后由 rebindAccountScopedStores 重绑

  function fromCanonical(row: CanonicalOrder): Order {
    const status: OrderStatus = row.canonicalStatus;
    const dataCenter = row.dataCenter?.toLowerCase().includes("frankfurt")
      ? "Frankfurt DC" as const : "Singapore DC" as const;
    const timeline: OrderTimelineEvent[] = [{ status: "placed", ts: row.placedAt }];
    if (row.paidAt != null) timeline.push({ status: "paid", ts: row.paidAt });
    if (status === "provisioning") timeline.push({ status, ts: row.paidAt ?? row.placedAt });
    if (row.activatedAt != null) timeline.push({ status: "activated", ts: row.activatedAt });
    if (!["placed", "paid", "provisioning", "activated"].includes(status)) {
      timeline.push({ status, ts: row.activatedAt ?? row.paidAt ?? row.placedAt });
    }
    return {
      id: row.orderNo,
      productId: row.productNo as Order["productId"],
      productName: row.productName,
      quantity: row.quantity,
      ...(row.itemCount != null && { itemCount: row.itemCount }),
      unitPrice: row.unitPriceUsdt,
      discount: row.tradeinNo ? 0 : row.discountUsdt,
      ...(row.tradeinNo && { tradeInCredit: row.discountUsdt, tradeInDeviceId: String(row.sourceDeviceId) }),
      total: row.amountUsdt,
      paymentMethod: row.paymentMethod ?? "wallet",
      status,
      placedAt: row.placedAt,
      ...(row.paidAt != null && { paidAt: row.paidAt }),
      ...(row.activatedAt != null && { activatedAt: row.activatedAt }),
      ...(row.targetDeviceId != null && { deviceId: String(row.targetDeviceId) }),
      timeline,
      dataCenter,
    };
  }

  async function refreshRemote(): Promise<void> {
    if (!remoteApiEnabled) return;
    const requestBoundKey = boundKey;
    const requestEpoch = boundEpoch;
    const requestGeneration = ++refreshGeneration;
    const requestRunScope = captureCommerceSandboxRun();
    const isCurrent = () => boundKey === requestBoundKey && boundEpoch === requestEpoch
      && requestGeneration === refreshGeneration
      && isCurrentCommerceSandboxScope(requestRunScope);
    try {
      const canonical = await orderApi.list();
      if (!isCurrent()) return;
      orders.value = canonical.orders.map(fromCanonical);
    } catch (error) {
      if (!isCurrent()) return;
      throw error;
    }
  }

  async function cancelOrderRemote(id: string): Promise<boolean> {
    if (!remoteApiEnabled) return cancelOrder(id);
    const requestBoundKey = boundKey;
    const requestEpoch = boundEpoch;
    const requestRunScope = captureCommerceSandboxRun();
    const isCurrent = () => boundKey === requestBoundKey && boundEpoch === requestEpoch
      && isCurrentCommerceSandboxScope(requestRunScope);
    try {
      await orderApi.cancel(id, `order-cancel:${id}`);
      if (!isCurrent()) return false;
      await refreshRemote();
      if (!isCurrent()) return false;
      return orders.value.some((item) => item.id === id && item.status === "cancelled");
    } catch {
      if (!isCurrent()) return false;
      // The command may have committed before the response was lost. Read-back is
      // the only safe result for the UI; never project a local cancellation.
      try { await refreshRemote(); } catch { return false; }
      if (!isCurrent()) return false;
      return orders.value.some((item) => item.id === id && item.status === "cancelled");
    }
  }

  /**
   * 建单并落盘。落盘失败 → 内存那条一并撤掉,返回 null:一张只活在内存里的「已付」订单会在刷新时
   * 消失,而调用方此前已经扣款 / 下架旧机 —— 必须让调用方知道并按原路退回,不能静默吞掉。
   */
  function createOrder(input: CreateOrderInput): Order | null {
    return createOrders([input])?.[0] ?? null;
  }

  /**
   * 一批建单 = **一次**落盘:全部进内存后只写一次盘,失败整批撤掉返 null —— 组合购买不存在「前几单落了、
   * 后几单没落」的半执行态(审计 R5 P1:逐单写盘中途失败,整笔退款而已落盘的单子照发设备)。
   */
  function createOrders(inputs: CreateOrderInput[]): Order[] | null {
    if (remoteApiEnabled) throw new Error("REMOTE_ORDER_CREATE_REQUIRES_SERVER_API");
    const batch = inputs.map(buildOrder);
    // 追加在**磁盘最新**列表之上(不是本标签页的内存副本):别的标签页刚建的单不会被本次落盘抹掉。
    return commitOrders((cur) => [...batch.slice().reverse(), ...cur]) ? batch : null;
  }

  function buildOrder(input: CreateOrderInput): Order {
    const {
      productId, productName, unitPrice, paymentMethod,
      discount = 0, tradeInCredit = 0, tradeInDeviceId,
      promoDiscountUSD = 0, trialOffsetUSD = 0,
    } = input;
    const id = genOrderId();
    const now = Date.now();
    const order: Order = {
      id,
      productId,
      productName,
      quantity: 1,
      unitPrice,
      discount,
      ...(tradeInCredit > 0 && { tradeInCredit, tradeInDeviceId }),
      ...(promoDiscountUSD > 0 && { promoDiscountUSD }),
      ...(trialOffsetUSD > 0 && { trialOffsetUSD }),
      // 阶梯抵扣基数(FEAT-DEV02)吃这个净额:试用抵扣买入的设备,置换基数
      // 一并按实付算,不按目录价虚高。
      total: Math.max(0, +(unitPrice - discount - tradeInCredit - promoDiscountUSD - trialOffsetUSD).toFixed(2)),
      paymentMethod,
      // Resting state right after checkout is "paid"
      status: "paid",
      placedAt: now,
      paidAt: now,
      dataCenter: pickDataCenter(productId),
      timeline: [
        { status: "placed", ts: now, note: "Order received" },
        { status: "paid", ts: now + 1000, note: `Settled via ${paymentMethod}` },
      ],
    };
    return order;
  }

  function advanceOrder(id: string, reservedSlots = 0) {
    // 🔴 闸焊在这里而不是 tickOrders:三个驱动都从这条缝进来 —— App.vue 的 6s 轮询、
    //    订单详情页自己那条 3s 定时器(在 stopBusinessLoops 管辖之外)、下拉刷新
    //    (store/refresh.ts)。逐个驱动加判断必漏掉后两个。
    //    远端模式下履约状态与设备库存都归服务端(GET /api/orders —— orderApi.list 已在用),
    //    这里往前推一步就等于凭空发一台机器:next === "activated" 会 addDevice + activateDevice。
    if (remoteApiEnabled) return;
    const cur = orders.value.find((o) => o.id === id);
    if (!cur || cur.status === "activated" || cur.status === "cancelled") return;
    const idx = TIMELINE.indexOf(cur.status);
    if (idx < 0 || idx >= TIMELINE.length - 1) return;
    const next = TIMELINE[idx + 1];

    // When advancing INTO "activated", spawn the device synchronously so the
    // deviceId can land in the same update — every caller converges on the same
    // wire-into-Earn behaviour. (No-ops cleanly until device CRUD is on useApp.)
    let spawnedDeviceId: string | undefined = cur.deviceId;
    let activationBlocked = false;
    if (next === "activated") {
      const app = useApp() as unknown as DeviceSpawnApp;
      if (!spawnedDeviceId && typeof app.addDevice === "function") {
        // FEAT-DEV02:阶梯抵扣基数 = 实付净额(order.total 已扣券与置换抵扣),
        // 不是目录价——否则券/抵扣买入的设备下一跳置换基数被系统性高估。
        spawnedDeviceId = app.addDevice(cur.productId, { paidPriceUsdt: cur.total }) ?? undefined;
        // 生不出设备(落盘失败)= 这一跳不发生:不把幽灵 id 写进订单,下一 tick 整跳重试。
        if (!spawnedDeviceId) return;
      }
      if (spawnedDeviceId && typeof app.activateDevice === "function") {
        const alreadyActive = app.devices.some((d) => d.id === spawnedDeviceId && d.activatedAt !== null);
        activationBlocked = alreadyActive ? false : !app.activateDevice(spawnedDeviceId, reservedSlots);
      }
    }
    const targetStatus = next === "activated" && activationBlocked ? cur.status : next;
    const targetNote = activationBlocked
      ? "Waiting for an empty device slot"
      : statusNote(next, cur.dataCenter);

    // CAS 前置:磁盘上这张单仍是我看到的那一跳(status 相同、还没被别的标签页配上设备)。别的标签页已经推进
    // 过 → 前置不成立 → 本次不写,刚为它生的那台设备撤回(否则两个标签页各发一台);写失败同样撤回、下一 tick 重试。
    const committed = commitOrders((list) => {
      const disk = list.find((o) => o.id === id);
      if (!disk || disk.status !== cur.status || (spawnedDeviceId && !cur.deviceId && disk.deviceId)) return null;
      return list.map((o) =>
        o.id !== id
          ? o
          : {
              ...o,
              status: targetStatus,
              deviceId: spawnedDeviceId ?? o.deviceId,
              activatedAt: targetStatus === "activated" ? Date.now() : o.activatedAt,
              timeline: [
                ...o.timeline,
                { status: targetStatus, ts: Date.now(), note: targetNote },
              ],
            },
      );
    });
    if (!committed && spawnedDeviceId && !cur.deviceId) {
      // 撤回自己的落盘不再追(R5 结构反思:撤销的撤销是无穷回归)。
      const app = useApp() as unknown as DeviceSpawnApp;
      void app.discardSpawnedDevice?.(spawnedDeviceId);
    }
  }

  function markActivated(id: string, deviceId: string): boolean {
    if (remoteApiEnabled) return false;
    return commitOrders((list) => (list.some((o) => o.id === id)
      ? list.map((o) =>
          o.id === id
            ? {
                ...o,
                status: "activated",
                activatedAt: Date.now(),
                deviceId,
                timeline: [
                  ...o.timeline.filter((e) => e.status !== "activated"),
                  {
                    status: "activated",
                    ts: Date.now(),
                    note: "Device live · joined NexGrid network",
                  },
                ],
              }
            : o,
        )
      : null));
  }

  // Cancel is allowed ONLY pre-payment ("placed"). Once paid, DC provisioning
  // carries financial + capacity commitments → no self-cancel (server-canonical
  // refund/support flow). No-op on any non-"placed" status.
  function cancelOrder(id: string): boolean {
    // There is no user-facing canonical cancellation command. Remote mode must
    // remain HOLD/pending rather than pretending a local mutation succeeded.
    if (remoteApiEnabled) return false;
    // 前置在磁盘最新行上复核(placed 才可取消);没落盘 = 没取消(刷新后仍是 placed),如实返 false。
    return commitOrders((list) => (list.some((o) => o.id === id && o.status === "placed")
      ? list.map((o) =>
          o.id === id && o.status === "placed"
            ? {
                ...o,
                status: "cancelled",
                timeline: [
                  ...o.timeline,
                  {
                    status: "cancelled",
                    ts: Date.now(),
                    note: "Order cancelled · refund queued",
                  },
                ],
              }
            : o,
        )
      : null));
  }

  function currentAccountKey(): string {
    return boundKey;
  }

  function getById(id: string): Order | undefined {
    return orders.value.find((o) => o.id === id);
  }

  return { orders, createOrder, createOrders, advanceOrder, markActivated, cancelOrder, cancelOrderRemote, getById, bindAccount, currentAccountKey, refreshRemote };
});

// ⚠️ MOCK-ONLY: client unilaterally progresses orders through provisioning with
// a Math.random()<0.45 gate. PRODUCTION: server pushes order status changes;
// client only reflects server state. `advanceOrder` spawns the device when it
// reaches "activated", so callers don't handle device wiring separately.
export function tickOrders(reservedSlots = 0) {
  if (remoteApiEnabled) return;
  const store = useOrders();
  store.orders.forEach((o) => {
    if (o.status === "cancelled" || o.status === "activated") return;
    if (Math.random() < 0.45) {
      store.advanceOrder(o.id, reservedSlots);
    }
  });
}
