import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import test from "node:test";

const bundled = await build({
  entryPoints: [fileURLToPath(new URL("../src/api/device-e3-api.ts", import.meta.url))],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`;
const { createDeviceE3Api } = await import(moduleUrl);

const orderBundled = await build({
  entryPoints: [fileURLToPath(new URL("../src/api/order-api.ts", import.meta.url))],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const orderModuleUrl = `data:text/javascript;base64,${Buffer.from(orderBundled.outputFiles[0].text).toString("base64")}`;
const { createOrderApi } = await import(orderModuleUrl);

const coordinatorBundled = await build({
  entryPoints: [fileURLToPath(new URL("../src/domain/e20-capacity-coordinator.ts", import.meta.url))],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const coordinatorUrl = `data:text/javascript;base64,${Buffer.from(coordinatorBundled.outputFiles[0].text).toString("base64")}`;
const {
  RemoteCapacityGate,
  StableCommandKey,
  completeVerifiedMutation,
  handleNoActiveDeviceDecision,
} = await import(coordinatorUrl);

const validCapacityQuote = {
  decision: "REPLACE_REQUIRED",
  activeDevices: 6,
  maxActiveDevices: 6,
  sourceDeviceId: 11,
  sourceDeviceName: "NexGridBox S1",
  targetProductId: 22,
  targetProductNo: "stellarbox-pro-v2",
  targetProductName: "StellarBox Pro v2",
  targetPriceUsdt: 1000,
  payableUsdt: 1000,
  walletBalanceUsdt: 1500,
  sufficientFunds: true,
  decisionSource: "server",
};

const validResult = {
  tradeinNo: "TIO-1",
  orderNo: "ORD-1",
  sourceDeviceId: 11,
  targetDeviceId: 33,
  applicationStatus: "COMPLETED",
  orderStatus: "COMPLETED",
  discountUsdt: 0,
  walletDebitUsdt: 1000,
  walletBalanceAfterUsdt: 500,
};

const validFleet = {
  dailyUsdt: 12.5,
  dailyNex: 3.2,
  realizedTodayUsdt: 1.25,
  realizedTodayNex: 2.5,
  walletUsdt: 500,
  walletNex: 80,
  userJoinedAt: 1760000000000,
  serverNow: 1760003600000,
  timezone: "Asia/Shanghai",
  slotCap: 3,
  capacitySchedule: { capacityBand1DeltaPct: "-3" },
  source: "nx_user_device + nx_compute_receipt + nx_compute_e3_config",
  devices: [{
    id: 9,
    rowVersion: 1,
    instanceNo: "DEV-9",
    name: "NexionBox S1",
    deviceType: "BOX",
    productCode: "STELLARBOX-S1",
    status: "ACTIVE",
    pendingDeactivate: false,
    activatedAt: 1750000000000,
    purchasedAt: 1750000000000,
    dailyUsdt: 12.5,
    dailyNex: 3.2,
    todayEarningsUsdt: 1.25,
    todayEarningsNex: 2.5,
    gpuModel: "RTX 4090",
    vramTotalGb: 96,
    basePowerW: 1200,
    location: "Singapore",
    capacityPct: 100,
    capacityAgeMonths: 1,
    capacityConfigKey: "capacityApplyToS1",
    capacitySubsidized: false,
    capacitySubsidyDays: 0,
    actualPaidUsdt: 649,
    cumulativeOutputUsdt: 200,
  }],
};

test("E20 fleet preserves server timezone, realized today earnings, and complete specs", async () => {
  const fleet = await apiReturning(validFleet).fleet();
  assert.equal(fleet.timezone, "Asia/Shanghai");
  assert.equal(fleet.realizedTodayUsdt, 1.25);
  assert.equal(fleet.realizedTodayNex, 2.5);
  assert.equal(fleet.devices[0].todayEarningsUsdt, 1.25);
  assert.equal(fleet.devices[0].todayEarningsNex, 2.5);
  assert.equal(fleet.devices[0].vramTotalGb, 96);
});

test("E20 fleet rejects a missing device specification instead of coercing it to zero", async () => {
  await assert.rejects(
    apiReturning({
      ...validFleet,
      devices: [{ ...validFleet.devices[0], gpuModel: null }],
    }).fleet(),
    /E3_CANONICAL_RESPONSE_INVALID/,
  );
});

function apiReturning(payload) {
  return createDeviceE3Api({ request: async () => structuredClone(payload) });
}

test("E20 rejects numeric strings in a successful capacity quote", async () => {
  await assert.rejects(
    apiReturning({ ...validCapacityQuote, activeDevices: "6" }).capacityQuote("stellarbox-pro-v2"),
    /E3_CANONICAL_RESPONSE_INVALID/,
  );
});

test("E20 rejects a contradictory capacity-available decision at the cap", async () => {
  await assert.rejects(
    apiReturning({
      ...validCapacityQuote,
      decision: "CAPACITY_AVAILABLE",
      sourceDeviceId: null,
      sourceDeviceName: null,
    }).capacityQuote("stellarbox-pro-v2"),
    /E3_CANONICAL_RESPONSE_INVALID/,
  );
});

test("E20 accepts the complete server decision matrix and preserves source semantics", async () => {
  const available = await apiReturning({
    ...validCapacityQuote,
    decision: "CAPACITY_AVAILABLE",
    activeDevices: 5,
    sourceDeviceId: null,
    sourceDeviceName: null,
  }).capacityQuote("stellarbox-pro-v2");
  const noActive = await apiReturning({
    ...validCapacityQuote,
    decision: "NO_ACTIVE_DEVICE",
    sourceDeviceId: null,
    sourceDeviceName: null,
  }).capacityQuote("stellarbox-pro-v2");
  const replacement = await apiReturning(validCapacityQuote).capacityQuote("stellarbox-pro-v2");

  assert.equal(available.decision, "CAPACITY_AVAILABLE");
  assert.equal(noActive.decision, "NO_ACTIVE_DEVICE");
  assert.equal(replacement.sourceDeviceId, 11);
});

test("E20 rejects a source id without its authoritative display name", async () => {
  await assert.rejects(
    apiReturning({ ...validCapacityQuote, sourceDeviceName: null }).capacityQuote("stellarbox-pro-v2"),
    /E3_CANONICAL_RESPONSE_INVALID/,
  );
});

test("E20 rejects non-terminal HTTP 200 replacement results", async () => {
  await assert.rejects(
    apiReturning({ ...validResult, orderStatus: "PENDING_PAYMENT" }).capacityReplace(
      11, "stellarbox-pro-v2", "replace-key", validCapacityQuote,
    ),
    /E3_CANONICAL_RESPONSE_INVALID/,
  );
});

test("E20 rejects terminal results whose amount does not match the authoritative quote", async () => {
  await assert.rejects(
    apiReturning({ ...validResult, walletDebitUsdt: 999 }).capacityReplace(
      11, "stellarbox-pro-v2", "replace-key", validCapacityQuote,
    ),
    /E3_TRADEIN_RESULT_QUOTE_MISMATCH/,
  );
});

test("E20 accepts a terminal replacement result only when every quote-linked field matches", async () => {
  const accepted = await apiReturning(validResult).capacityReplace(
    11, "stellarbox-pro-v2", "replace-key", validCapacityQuote,
  );
  assert.equal(accepted.targetDeviceId, 33);
  assert.equal(accepted.walletBalanceAfterUsdt, 500);
});

test("E20 rejects terminal replacement results with source or balance drift", async () => {
  await assert.rejects(
    apiReturning({ ...validResult, sourceDeviceId: 12 }).capacityReplace(
      11, "stellarbox-pro-v2", "replace-key", validCapacityQuote,
    ),
    /E3_TRADEIN_RESULT_QUOTE_MISMATCH/,
  );
  await assert.rejects(
    apiReturning({ ...validResult, walletBalanceAfterUsdt: 501 }).capacityReplace(
      11, "stellarbox-pro-v2", "replace-key", validCapacityQuote,
    ),
    /E3_TRADEIN_RESULT_QUOTE_MISMATCH/,
  );
});

test("E20 rejects a non-terminal application even when its order says completed", async () => {
  await assert.rejects(
    apiReturning({ ...validResult, applicationStatus: "PROCESSING" }).capacityReplace(
      11, "stellarbox-pro-v2", "replace-key", validCapacityQuote,
    ),
    /E3_CANONICAL_RESPONSE_INVALID/,
  );
});

const activatedOrder = {
  orderNo: "CPO-1",
  productId: 22,
  productNo: "stellarbox-pro-v2",
  productName: "StellarBox Pro v2",
  quantity: 1,
  unitPriceUsdt: 1000,
  discountUsdt: 0,
  amountUsdt: 1000,
  paymentMethod: "USDT_WALLET",
  paymentStatus: "PAID",
  orderStatus: "COMPLETED",
  activationStatus: "ACTIVATED",
  canonicalStatus: "activated",
  orderType: "TRADE_IN",
  placedAt: 1,
  paidAt: 2,
  activatedAt: 3,
  dataCenter: null,
  tradeinNo: "CPR-1",
  sourceDeviceId: 11,
  targetDeviceId: 33,
  targetDeviceInstanceNo: "DEV-33",
};

test("E20 order readback accepts only a coherent paid and activated terminal", async () => {
  const api = createOrderApi({ request: async () => ({ source: "server", sourceEnvironment: "PRODUCTION", runId: null, orders: [activatedOrder] }) });
  const response = await api.list();
  assert.equal(response.orders[0].canonicalStatus, "activated");
});

test("E20 order readback rejects contradictory or coerced HTTP 200 terminals", async () => {
  for (const malformed of [
    { ...activatedOrder, paymentStatus: "PENDING" },
    { ...activatedOrder, activationStatus: "WAITING_PAYMENT" },
    { ...activatedOrder, paidAt: null },
    { ...activatedOrder, amountUsdt: "1000" },
  ]) {
    const api = createOrderApi({ request: async () => ({ source: "server", sourceEnvironment: "PRODUCTION", runId: null, orders: [malformed] }) });
    await assert.rejects(api.list(), /ORDER_RESPONSE_INVALID/);
  }
});

const placedOrder = {
  ...activatedOrder,
  paymentMethod: null,
  paymentStatus: "PENDING",
  orderStatus: "PENDING_PAYMENT",
  activationStatus: "WAITING_PAYMENT",
  canonicalStatus: "placed",
  orderType: "SINGLE",
  paidAt: null,
  activatedAt: null,
  tradeinNo: null,
  sourceDeviceId: null,
  targetDeviceId: null,
  targetDeviceInstanceNo: null,
};

const createdOrder = {
  orderNo: "ORD-PLACED-1",
  subtotalUsdt: 1000,
  discountUsdt: 0,
  amountUsdt: 1000,
  voucherId: null,
  voucherRedemption: null,
  paymentStatus: "PENDING",
  orderStatus: "PENDING_PAYMENT",
  idSource: "server",
};

test("E20 ordinary order accepts only the canonical placed state triplet", async () => {
  const listApi = createOrderApi({ request: async () => ({ source: "server", sourceEnvironment: "PRODUCTION", runId: null, orders: [placedOrder] }) });
  assert.equal((await listApi.list()).orders[0].canonicalStatus, "placed");

  for (const malformed of [
    { ...placedOrder, paymentStatus: "FAILED" },
    { ...placedOrder, orderStatus: "COMPLETED" },
    { ...placedOrder, activationStatus: "ACTIVATED" },
    { ...placedOrder, paidAt: 2 },
  ]) {
    const api = createOrderApi({ request: async () => ({ source: "server", sourceEnvironment: "PRODUCTION", runId: null, orders: [malformed] }) });
    await assert.rejects(api.list(), /ORDER_RESPONSE_INVALID/);
  }
});

test("E20 order readback accepts every backend-authored canonical state matrix row", async () => {
  const validStates = [
    placedOrder,
    { ...placedOrder, canonicalStatus: "paid", paymentStatus: "PAID", orderStatus: "PAID",
      activationStatus: "WAITING_PROVISIONING", paidAt: 2 },
    { ...placedOrder, canonicalStatus: "provisioning", paymentStatus: "PAID", orderStatus: "PROVISIONING",
      activationStatus: "PROVISIONING", paidAt: 2 },
    activatedOrder,
    { ...placedOrder, canonicalStatus: "payment_failed", paymentStatus: "FAILED", orderStatus: "PAYMENT_FAILED" },
    { ...placedOrder, canonicalStatus: "expired", paymentStatus: "EXPIRED", orderStatus: "EXPIRED" },
    { ...placedOrder, canonicalStatus: "provisioning_failed", paymentStatus: "PAID",
      orderStatus: "PROVISIONING_FAILED", activationStatus: "PROVISIONING_FAILED", paidAt: 2 },
    { ...placedOrder, canonicalStatus: "refunded", paymentStatus: "REFUNDED",
      orderStatus: "REFUNDED", activationStatus: "REFUNDED" },
    { ...placedOrder, canonicalStatus: "chargeback", paymentStatus: "CHARGEBACK",
      orderStatus: "CHARGEBACK", activationStatus: "DEACTIVATED" },
    { ...placedOrder, canonicalStatus: "cancelled", paymentStatus: "CANCELLED", orderStatus: "CANCELLED" },
  ];
  const api = createOrderApi({ request: async () => ({ source: "server", sourceEnvironment: "PRODUCTION", runId: null, orders: validStates }) });
  assert.deepEqual((await api.list()).orders.map((order) => order.canonicalStatus), [
    "placed", "paid", "provisioning", "activated", "payment_failed", "expired",
    "provisioning_failed", "refunded", "chargeback", "cancelled",
  ]);
});

test("E20 remote order projection never collapses server failures into cancelled", () => {
  const source = readFileSync(new URL("../src/store/orders.ts", import.meta.url), "utf8");
  assert.match(source, /const status: OrderStatus = row\.canonicalStatus;/);
  assert.doesNotMatch(source, /\["placed", "paid", "provisioning", "activated"\]\.includes\(row\.canonicalStatus\)/);
});

test("E20 remote order cancellation fails closed until a canonical cancellation command exists", () => {
  const source = readFileSync("src/store/orders.ts", "utf8");
  assert.match(source, /if \(remoteApiEnabled\) return false/);
  assert.match(source, /function cancelOrder\(id: string\): boolean/);
});

test("E20 paid and provisioning rows require the backend payment timestamp and activation state", async () => {
  for (const malformed of [
    { ...placedOrder, canonicalStatus: "paid", paymentStatus: "PAID", orderStatus: "PAID",
      activationStatus: "WAITING_PAYMENT", paidAt: 2 },
    { ...placedOrder, canonicalStatus: "paid", paymentStatus: "PAID", orderStatus: "PAID",
      activationStatus: "WAITING_PROVISIONING", paidAt: null },
    { ...placedOrder, canonicalStatus: "provisioning", paymentStatus: "PAID", orderStatus: "PROVISIONING",
      activationStatus: "PROVISIONING", paidAt: null },
  ]) {
    const api = createOrderApi({ request: async () => ({ source: "server", sourceEnvironment: "PRODUCTION", runId: null, orders: [malformed] }) });
    await assert.rejects(api.list(), /ORDER_RESPONSE_INVALID/);
  }
});

test("E20 create response rejects a malformed placed state before readback", async () => {
  const request = { productNo: "stellarbox-pro-v2", quantity: 1, idempotencyKey: "stable-order-key" };
  const validApi = createOrderApi({ request: async () => structuredClone(createdOrder) });
  assert.equal((await validApi.create(request)).orderStatus, "PENDING_PAYMENT");

  for (const malformed of [
    { ...createdOrder, paymentStatus: "FAILED" },
    { ...createdOrder, orderStatus: "COMPLETED" },
  ]) {
    const api = createOrderApi({ request: async () => structuredClone(malformed) });
    await assert.rejects(api.create(request), /ORDER_RESPONSE_INVALID/);
  }
});

test("E20 capacity gate blocks confirmation for the whole pending quote window", async () => {
  let release;
  const quote = new Promise((resolve) => { release = resolve; });
  const gate = new RemoteCapacityGate();
  const resolving = gate.resolve(() => quote, () => undefined);
  assert.equal(gate.pending, true);
  assert.equal(gate.canConfirm(false), false);
  release({ decision: "CAPACITY_AVAILABLE" });
  await resolving;
  assert.equal(gate.pending, false);
  assert.equal(gate.canConfirm(false), true);
});

test("E20 NO_ACTIVE_DEVICE keeps one actionable reason when fleet refresh fails and after relogin", async () => {
  const notices = [];
  let refreshAttempts = 0;
  const notify = () => notices.push("无可置换的活跃设备，请到设备/仓库核对或联系客服");

  const firstGate = new RemoteCapacityGate();
  await firstGate.resolve(
    async () => ({ decision: "NO_ACTIVE_DEVICE" }),
    () => handleNoActiveDeviceDecision({
      notify,
      async refreshFleet() {
        refreshAttempts += 1;
        throw new Error("TRANSIENT_FLEET_REFRESH_FAILURE");
      },
    }),
  );
  assert.equal(firstGate.canConfirm(false), false);
  assert.deepEqual(notices, ["无可置换的活跃设备，请到设备/仓库核对或联系客服"]);

  const reloginGate = new RemoteCapacityGate();
  await reloginGate.resolve(
    async () => ({ decision: "NO_ACTIVE_DEVICE" }),
    () => handleNoActiveDeviceDecision({
      notify,
      async refreshFleet() { refreshAttempts += 1; },
    }),
  );
  assert.equal(reloginGate.canConfirm(false), false);
  assert.equal(refreshAttempts, 2);
  assert.deepEqual(notices, [
    "无可置换的活跃设备，请到设备/仓库核对或联系客服",
    "无可置换的活跃设备，请到设备/仓库核对或联系客服",
  ]);
});

test("E20 retry keeps one idempotency key and success commits after fleet verification", async () => {
  const key = new StableCommandKey();
  const submittedKeys = [];
  const events = [];
  let failFleet = true;
  const attempt = () => completeVerifiedMutation({
    async submit() {
      const commandKey = key.get(() => "e3-tradein:stable-key");
      submittedKeys.push(commandKey);
      events.push("submit");
      return { orderNo: "ORD-1" };
    },
    async readback() { events.push("readback"); return { orderNo: "ORD-1" }; },
    verifyOrder() { events.push("verify-order"); },
    async refreshOrders() { events.push("refresh-orders"); },
    async refreshFleet() {
      events.push("refresh-fleet");
      if (failFleet) throw new Error("TRANSIENT_FLEET_FAILURE");
    },
    verifyFleet() { events.push("verify-fleet"); },
    commit() { events.push("success-toast"); key.clear(); },
  });

  await assert.rejects(attempt(), /TRANSIENT_FLEET_FAILURE/);
  assert.equal(events.includes("success-toast"), false);
  failFleet = false;
  await attempt();
  assert.deepEqual(submittedKeys, ["e3-tradein:stable-key", "e3-tradein:stable-key"]);
  assert.ok(events.lastIndexOf("success-toast") > events.lastIndexOf("verify-fleet"));
});
