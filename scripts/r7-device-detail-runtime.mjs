import { chromium } from "playwright";
import { collectAppConsoleErrors } from "./lib/console-origin-filter.mjs";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5173";
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// 🔴 超时 12s→30s(2026-07-23 C3):断言问的是「页面能不能渲染出来」,不是「能不能在
// 12 秒内渲染出来」。12s 是个任意值,它把「机器负载」这个与产品无关的变量引进了判据 ——
// 本轮并发跑多个 headless chromium 时这条稳定误报,回退代码后又「通过」,险些据此改错代码
// (实为偶发:同一份代码连跑 2 次都过)。30s 仍能抓住「页面根本渲染不出来」的真故障,
// 断言强度不变,只是不再把慢启动算成失败。
async function waitUntil(check, message, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
// 🔴 首页 1300ms 会自动弹代金券领取层(z=800 全屏遮罩),本探针随后要点首页设备格 ——
// 谁先到全看机器负载:空闲时探针先点到(绿),套件满载时弹层先弹出(红)。这不是断言
// 该管的变量,与上面 12s→30s 那次同源。按 chrome-baseline / trial-check 的既有家法预置
// 弹层冷却把它移出判据;弹层本身的自动弹出由 trial-check 专项验。
await page.addInitScript(() => {
  const envelope = JSON.stringify({ type: "object", data: { lastClosedAt: 9999999999999 } });
  try { localStorage.setItem("nexgrid-voucher-claim-sheet-v1", envelope); } catch (e) { void e; }
  try { localStorage.setItem("nexgrid-trial-claim-sheet-v1", envelope); } catch (e) { void e; }
});
await page.route(/https:\/\/fonts\.googleapis\.com\/.*/, (route) =>
  route.fulfill({ status: 200, contentType: "text/css", body: "" }),
);
await page.route(/https:\/\/fonts\.gstatic\.com\/.*/, (route) =>
  route.fulfill({ status: 200, contentType: "font/woff2", body: "" }),
);
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") collectAppConsoleErrors(errors, baseUrl)(message);
});
page.on("pageerror", (error) => errors.push(error.message));

async function resolveAppFrame(selector) {
  let match = null;
  await waitUntil(async () => {
    const frames = [...page.frames().filter((frame) => frame !== page.mainFrame()), page.mainFrame()];
    for (const frame of frames) {
      if (await frame.locator(selector).count()) {
        match = frame;
        return true;
      }
    }
    return false;
  }, `app frame not ready for ${selector}`);
  return match;
}

async function goto(route, selector) {
  await page.goto(`${baseUrl}/?nx_device=off&r7detail=${runId}${route}`, { waitUntil: "domcontentloaded" });
  let frame;
  try {
    frame = await resolveAppFrame(selector);
  } catch (error) {
    const frameUrls = page.frames().map((item) => item.url()).join(" | ");
    const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 500);
    throw new Error(`${error.message}; url=${page.url()}; frames=${frameUrls}; console=${errors.join(" | ")}; body=${body}`);
  }
  await frame.locator(selector).first().waitFor({ state: "visible" });
  return frame;
}

try {
  const home = await goto("#/pages/index/index", ".nx-device-slot");
  const logic = await home.evaluate(async () => {
    const { createDevice } = await import("/src/store/device-types.ts");
    const { settleDeviceBatch, useApp } = await import("/src/store/app.ts");
    const {
      computeLiveHashpower,
      isDeviceOnline,
      ONLINE_HEARTBEAT_TIMEOUT_MS,
    } = await import("/src/lib/hashpower.ts");
    const { mergeAccountSnapshots } = await import("/src/store/account-cloud.ts");
    const failures = [];
    const check = (condition, message) => { if (!condition) failures.push(message); };
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const now = 1_800_000_000_000;
    const sixHours = 6 * 60 * 60 * 1000;
    const bonus = { h5BaseFactor: 0.6, continuityFullHours: 2 };
    const makePhone = (beat) => ({
      ...createDevice("phone", `r7-${beat ?? "none"}`),
      activatedAt: now - sixHours,
      purchasedAt: now - sixHours,
      miningSince: now - sixHours,
      lastSettledAt: now - sixHours,
      onlineHeartbeatAt: beat,
      todayEarnings: 0,
      todayEarningsNEX: 0,
      cumulativeEarningsUsdt: 0,
      status: "online",
      pausedReason: null,
      thermalState: "nominal",
    });

    const originalRandom = Math.random;
    Math.random = () => 0.5;
    try {
      const stalePhone = makePhone(now - ONLINE_HEARTBEAT_TIMEOUT_MS - 1);
      const freshPhone = makePhone(now - 1);
      const stale = settleDeviceBatch([stalePhone], "app", now, bonus, true);
      const freshApp = settleDeviceBatch([freshPhone], "app", now, bonus, true);
      const freshH5 = settleDeviceBatch([freshPhone], "h5", now, bonus, true);
      const rawNetworkLoss = settleDeviceBatch(
        [{ ...freshPhone, pausedReason: null, isWifiConnected: false }],
        "app",
        now,
        bonus,
        true,
      );
      const staleUsd = stale.settled[0].todayEarnings;
      const freshUsd = freshApp.settled[0].todayEarnings;

      check(staleUsd > 0 && freshUsd > staleUsd, `stale reopen must settle at baseline: ${staleUsd}/${freshUsd}`);
      check(staleUsd / freshUsd < 0.75, `stale reopen was priced too close to online: ${staleUsd}/${freshUsd}`);
      check(freshH5.settled[0].todayEarnings === freshUsd, "viewing carrier changed a fresh device's factor");
      check(rawNetworkLoss.settled[0].todayEarnings === 0, "raw network hard-gate accrued before telemetry sync");
      check(rawNetworkLoss.settled[0].lastSettledAt == null, "raw network hard-gate retained settlement anchor");
      check(stale.settled[0].onlineHeartbeatAt === stalePhone.onlineHeartbeatAt, "settlement mutated the old heartbeat before pricing");
      check(stale.nextDevices[0].onlineHeartbeatAt === now, "eligible App phone did not refresh heartbeat after settlement");
      check(isDeviceOnline(stale.nextDevices[0], now + 2_000), "refreshed heartbeat was not online on the next tick");
      check(isDeviceOnline({ onlineHeartbeatAt: now - ONLINE_HEARTBEAT_TIMEOUT_MS + 1 }, now), "fresh boundary heartbeat marked offline");
      check(!isDeviceOnline({ onlineHeartbeatAt: now - ONLINE_HEARTBEAT_TIMEOUT_MS }, now), "timeout boundary heartbeat marked online");
      check(!isDeviceOnline({ onlineHeartbeatAt: null }, now), "null heartbeat marked online");
      check(!isDeviceOnline({ onlineHeartbeatAt: now + 1 }, now), "future heartbeat marked online after clock rollback");
      check(!isDeviceOnline({ kind: "phone", status: "offline", onlineHeartbeatAt: now }, now), "offline phone status was ignored");
      check(isDeviceOnline({ kind: "stellarbox-s1", status: "online", onlineHeartbeatAt: null }, now), "hosted hardware service status was ignored");

      const paused = { ...makePhone(null), pausedReason: "no-network" };
      const inactive = { ...makePhone(null), activatedAt: null };
      check(settleDeviceBatch([paused], "app", now, bonus, true).nextDevices[0].onlineHeartbeatAt == null, "paused phone received heartbeat");
      check(settleDeviceBatch([inactive], "app", now, bonus, true).nextDevices[0].onlineHeartbeatAt == null, "inactive phone received heartbeat");

      const hardware = {
        ...createDevice("stellarbox-s1", "r7-hardware"),
        activatedAt: now - sixHours,
        purchasedAt: now - sixHours,
        lastSettledAt: now - sixHours,
        todayEarnings: 0,
        todayEarningsNEX: 0,
        cumulativeEarningsUsdt: 0,
      };
      const hardwareA = settleDeviceBatch([{ ...hardware, onlineHeartbeatAt: null }], "h5", now, bonus, true).settled[0];
      const hardwareB = settleDeviceBatch([{ ...hardware, onlineHeartbeatAt: now }], "h5", now, bonus, true).settled[0];
      check(hardwareA.todayEarnings === hardwareB.todayEarnings, "non-phone earnings depended on heartbeat");

      const offlineLive = computeLiveHashpower({
        baselineTops: 30, online: false, isCharging: true, isOnline: true,
        thermalState: "nominal", continuityMs: sixHours, nowSeed: now, onlineBonus: bonus,
      });
      const onlineLive = computeLiveHashpower({
        baselineTops: 30, online: true, isCharging: true, isOnline: true,
        thermalState: "nominal", continuityMs: sixHours, nowSeed: now, onlineBonus: bonus,
      });
      check(onlineLive.effectiveTops > offlineLive.effectiveTops, "online display factor did not exceed hosted baseline");

      const app = useApp();
      const seed = clone(app.visibleDevices[0]);
      const snapshot = (beat) => ({
        schema: 1,
        accountKey: "r7-merge@sentinel",
        entrySurface: app.entrySurface,
        updatedAt: now,
        user: clone(app.user),
        devices: [{ ...seed, onlineHeartbeatAt: beat }],
        earnings: clone(app.earnings),
        latestWithdrawal: null,
      });
      const merged = mergeAccountSnapshots(snapshot(null), snapshot(300), snapshot(200));
      check(merged.devices[0].onlineHeartbeatAt === 300, `heartbeat merge did not keep freshest value: ${merged.devices[0].onlineHeartbeatAt}`);
      const mergeNow = Date.now();
      const recovered = mergeAccountSnapshots(
        snapshot(mergeNow + 60 * 60 * 1000),
        snapshot(mergeNow),
        snapshot(mergeNow + 60 * 60 * 1000),
      );
      check(recovered.devices[0].onlineHeartbeatAt === mergeNow, `valid heartbeat did not replace future poison: ${recovered.devices[0].onlineHeartbeatAt}`);
    } finally {
      Math.random = originalRandom;
    }

    const app = useApp();
    const phoneId = app.visibleDevices.find((device) => device.kind === "phone")?.id;
    check(!!phoneId, "seed fleet has no phone for lifecycle heartbeat checks");
    if (phoneId) {
      const patchPhone = (patch) => app.$patch({
        devices: app.devices.map((device) => device.id === phoneId ? { ...device, ...patch } : device),
      });

      patchPhone({ currentTask: null, onlineHeartbeatAt: Date.now() });
      app.scheduleDeactivation(phoneId);
      let phone = app.devices.find((device) => device.id === phoneId);
      check(phone?.activatedAt === null && phone?.onlineHeartbeatAt == null, "scheduled deactivation retained heartbeat");
      check(app.activateDevice(phoneId), "phone could not reactivate after scheduled deactivation");
      phone = app.devices.find((device) => device.id === phoneId);
      check(phone?.onlineHeartbeatAt == null, "reactivation reused a retired heartbeat");

      patchPhone({ onlineHeartbeatAt: Date.now() });
      app.deactivateDevice(phoneId);
      phone = app.devices.find((device) => device.id === phoneId);
      check(phone?.activatedAt === null && phone?.onlineHeartbeatAt == null, "immediate deactivation retained heartbeat");
      check(app.activateDevice(phoneId), "phone could not reactivate after immediate deactivation");
      phone = app.devices.find((device) => device.id === phoneId);
      check(phone?.onlineHeartbeatAt == null, "immediate reactivation reused a retired heartbeat");

      patchPhone({ onlineHeartbeatAt: Date.now(), lastSettledAt: Date.now() - 5_000 });
      app.setPhoneRuntime(phoneId, { isWifiConnected: false });
      phone = app.devices.find((device) => device.id === phoneId);
      check(phone?.pausedReason === "no-network", "runtime network loss did not synchronously gate phone");
      check(phone?.onlineHeartbeatAt == null && phone?.lastSettledAt == null, "runtime network loss retained earning anchors");
      app.setPhoneRuntime(phoneId, { isWifiConnected: true });
    }
    const inactiveId = app.addDevice("stellarbox-pro-v2");
    const activeIds = app.visibleDevices.filter((device) => device.activatedAt !== null).map((device) => device.id);
    return { failures, activeIds, inactiveId };
  });

  assert(logic.failures.length === 0, logic.failures.join("; "));
  assert(logic.activeIds.length >= 2, "seed fleet did not expose phone + hardware instances");

  await waitUntil(
    async () => (await home.locator(".nx-device-slot").first().getAttribute("data-online")) === "false",
    "stale phone slot still advertised true-online",
  );
  assert(
    (await home.locator(".nx-device-slot").nth(1).getAttribute("data-online")) === "true",
    "online hosted hardware lost its service status",
  );
  assert(
    (await home.locator(".nx-device-row").first().getAttribute("data-online")) === "false",
    "stale phone row still advertised true-online",
  );

  await home.locator(".nx-device-slot").first().click();
  await waitUntil(() => page.url().includes(`/pages/earn/device-detail?id=${encodeURIComponent(logic.activeIds[0])}`), "phone slot did not open instance detail");
  let detail = await resolveAppFrame(".nx-device-detail");
  await detail.locator(".nx-device-card__details").waitFor({ state: "visible" });
  assert((await detail.locator(".nx-device-card").getAttribute("data-online")) === "false", "stale phone detail advertised true-online");
  assert(
    /基础托管模式|Base hosting mode/.test(await detail.locator(".nx-device-status-label").innerText()),
    "stale phone detail did not label base-hosting mode",
  );
  const cardHeader = detail.locator(".nx-device-card__header");
  await cardHeader.focus();
  await cardHeader.press("Shift+F10");
  await detail.locator(".nx-device-quick-menu").waitFor({ state: "visible" });
  assert(
    await detail.locator(".nx-device-quick-stats").evaluate((element) => element === document.activeElement),
    "keyboard-opened device quick menu did not move focus inside",
  );
  await detail.locator(".nx-device-quick-stats").press("Shift+Tab");
  assert(
    await detail.locator(".nx-device-quick-menu [tabindex='0']").last().evaluate((element) => element === document.activeElement),
    "device quick menu Shift+Tab escaped instead of wrapping to the last action",
  );
  await detail.locator(".nx-device-quick-menu [tabindex='0']").last().press("Tab");
  assert(
    await detail.locator(".nx-device-quick-stats").evaluate((element) => element === document.activeElement),
    "device quick menu Tab escaped instead of wrapping to the first action",
  );
  await detail.locator(".nx-device-quick-stats").press("Escape");
  await detail.locator(".nx-device-quick-menu").waitFor({ state: "detached" });
  assert(await cardHeader.evaluate((element) => element === document.activeElement), "device quick menu did not restore header focus");

  const helpButton = detail.locator(".nx-device-help");
  await helpButton.focus();
  await helpButton.press("Enter");
  assert((await helpButton.getAttribute("aria-expanded")) === "true", "device help did not open from keyboard");
  const networkSwitch = detail.locator(".nx-device-network-toggle");
  const networkBefore = await networkSwitch.getAttribute("aria-checked");
  await networkSwitch.focus();
  await networkSwitch.press("Space");
  assert((await networkSwitch.getAttribute("aria-checked")) !== networkBefore, "device network switch ignored keyboard activation");
  await networkSwitch.press("Space");

  const homeForHardware = await goto("#/pages/index/index", ".nx-device-slot");
  await homeForHardware.locator(".nx-device-slot").nth(1).click();
  await waitUntil(() => page.url().includes(`/pages/earn/device-detail?id=${encodeURIComponent(logic.activeIds[1])}`), "hardware slot did not open owned instance detail");
  detail = await resolveAppFrame(".nx-device-detail");
  await detail.locator(".nx-device-card__details").waitFor({ state: "visible" });
  assert((await detail.locator(".nx-device-card").getAttribute("data-online")) === "true", "online hosted hardware detail was shown offline");
  const validBack = detail.locator(".spv-back");
  await validBack.focus();
  await validBack.press("Enter");
  await waitUntil(() => page.url().includes("#/pages/index/index"), "valid detail keyboard back did not restore Home");

  const homeForRow = await goto("#/pages/index/index", ".nx-device-row");
  // Seed onboarding overlays can legitimately appear after a few seconds;
  // keyboard activation both bypasses that unrelated pointer layer and proves
  // the H5 accessibility path for the row.
  const firstRow = homeForRow.locator(".nx-device-row").first();
  await firstRow.focus();
  await firstRow.press("Enter");
  await waitUntil(() => page.url().includes(`/pages/earn/device-detail?id=${encodeURIComponent(logic.activeIds[0])}`), "device row did not open instance detail");

  const inactive = await goto(
    `#/pages/earn/device-detail?id=${encodeURIComponent(logic.inactiveId)}`,
    ".nx-device-detail__empty",
  );
  assert((await inactive.locator(".nx-device-card__details").count()) === 0, "inactive inventory device rendered as earning detail");

  const missing = await goto("#/pages/earn/device-detail?id=missing-sentinel", ".nx-device-detail__empty");
  const back = missing.locator(".nx-device-detail__back");
  await back.focus();
  await back.press("Enter");
  await waitUntil(() => page.url().includes("#/pages/earn/earn"), "missing-device keyboard CTA did not return to Earn");

  assert(errors.length === 0, `browser errors: ${errors.join(" | ")}`);
  console.log("R7 runtime + device detail: stale-gap/boundaries/merge + phone/hardware/empty routes passed");
} finally {
  await browser.close();
}
