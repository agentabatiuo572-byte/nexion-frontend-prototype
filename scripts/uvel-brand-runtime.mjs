import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ensureServer, identify } from "./lib/dev-server-pool.mjs";

const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/").replace(/\/$/, "");
const out = root + "/.codex-run/uvel-rebrand";
mkdirSync(out, { recursive: true });
const startedAt = new Date().toISOString();
const server = await ensureServer({ root, reuseUrl: process.env.UNI_BASE_URL || "http://127.0.0.1:5174" });
const base = server.baseUrl;
const browser = await chromium.launch({ headless: true });
const routes = JSON.parse(readFileSync(root + "/src/pages.json", "utf8")).pages.map(p => p.path);
const reports = [];
const errors = [];
const shots = [];
let passed = false;
const bindings = Object.fromEntries(["taskId", "stepId", "checkId", "runId", "repo", "snapshotHash"].map((key, i) =>
  [key, process.env[["WORKFLOW_TASK_ID", "WORKFLOW_STEP_ID", "WORKFLOW_CHECK_ID", "WORKFLOW_RUN_ID", "WORKFLOW_REPO", "WORKFLOW_SNAPSHOT_HASH"][i]] || (key === "repo" ? root : "manual")]));
const routeQuery = {
  "pages/store/detail": "?id=stellarbox-s1",
  "pages/ref/code": "?code=NEXGRID-8K9X",
};
async function settle(page) {
  await page.waitForFunction(() => document.querySelector("uni-page-body")?.textContent.trim().length > 5, { timeout: 25000 });
  await page.waitForTimeout(160);
}
async function goto(page, route) {
  await page.goto(base + "/?nx_device_inner=1#/" + route + (routeQuery[route] || ""), { waitUntil: "domcontentloaded" });
  await settle(page);
}
async function dismiss(page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.keyboard.press("Escape");
    for (const selector of [".ms-backdrop", ".tis-close", ".tcs-dismiss", ".vcs-dismiss", ".tcs-close", ".vcs-close"]) {
      const el = page.locator(selector);
      if (await el.isVisible()) await el.click({ position: { x: 4, y: 4 }, timeout: 5000 });
    }
  }
}
async function configure(page, locale, theme) {
  await page.evaluate(async ({ locale, theme }) => {
    (await import("/src/store/locale.ts")).useLocaleStore().setLocale(locale);
    (await import("/src/store/theme.ts")).useTheme().setMode(theme);
  }, { locale, theme });
}
async function login(page) {
  await goto(page, "pages/login/login");
  await page.getByTestId("mock-preview-password").locator("input").press("Enter");
  await page.waitForURL(/#\/$|#\/pages\/index\/index/);
  await settle(page);
  await dismiss(page);
}
function unbranded(text) {
  return text.replace(/(?:https?:\/\/)?(?:[\w.+-]+@)?(?:[\w-]+\.)*nexgrid\.(?:ai|io)[^\s]*/gi, "")
    .replace(/NEXGRID-[A-Z0-9]{4}|CTY TNHH NEXGRID VIETNAM|X-NexGrid-Signature|@nexgrid_official|discord\.gg\/nexgrid/g, "");
}
async function inspect(page, route, locale, theme) {
  const expectedRoute = route === "pages/compute-share/download" ? "/pages/me/devices" : "/" + route;
  assert.equal(page.url().split("#")[1].split("?")[0], expectedRoute, route + " navigation");
  const state = await page.evaluate(() => {
    const visible = el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    const images = [...document.querySelectorAll(".uvel-brand img, .orb-appicon img")].filter(visible);
    return {
      title: document.title,
      icons: [...document.querySelectorAll('link[rel="icon"]')].map(el => el.getAttribute("href")),
      theme: document.documentElement.dataset.theme,
      body: document.body.innerText,
      logos: images.map(img => ({ src: img.src, loaded: img.complete && img.naturalWidth > 0, width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight })),
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
  assert.equal(state.title, "UVEL", route + " title");
  assert.deepEqual(state.icons, ["/static/logo.png"], route + " favicon");
  assert.equal(state.theme, theme, route + " theme");
  assert.deepEqual(unbranded(state.body).match(/.{0,30}NexGrid.{0,40}/gi) || [], [], route + " visible old brand");
  assert.equal(state.overflow, false, route + " overflow");
  const brandedRoutes = ["pages/index/index", "pages/store/store", "pages/earn/earn", "pages/team/team", "pages/me/me",
    "pages/login/login", "pages/register/register", "pages/ref/code", "pages/me/proof", "pages/onboarding/intro", "pages/onboarding/terms"];
  assert.equal(state.logos.length, brandedRoutes.includes(route) ? 1 : 0, route + " required logo");
  for (const logo of state.logos) {
    assert.ok(logo.loaded, route + " broken image");
    assert.ok(logo.src.endsWith("-" + theme + ".png"), route + " wrong logo theme");
    assert.ok(Math.abs(logo.width / logo.height - logo.naturalWidth / logo.naturalHeight) < 0.03, route + " distorted logo");
  }
  reports.push({ route, actual: page.url().split("#")[1], locale, theme, logos: state.logos.length, status: "pass" });
}
async function legacyDataCheck(page) {
  await goto(page, "pages/index/index");
  await dismiss(page);
  const before = await page.evaluate(async () => {
    const app = (await import("/src/store/app.ts")).useApp();
    const cloud = await import("/src/store/account-cloud.ts");
    let device = app.devices.find(d => d.kind === "stellarbox-s1");
    if (!device) {
      const id = app.addDevice("stellarbox-s1");
      device = app.devices.find(d => d.id === id);
    }
    if (!device) throw new Error("legacy fixture device missing");
    const snapshot = cloud.readAccountSnapshot(app.accountKey);
    const stored = snapshot.devices.find(d => d.id === device.id);
    stored.name = "NexGridBox S1";
    stored.activatedAt ??= Date.now();
    if (!cloud.writeAccountSnapshot(snapshot)) throw new Error("legacy fixture persistence failed");
    const receipt = (await import("/src/mock/receipt.ts")).generateReceipt({
      id: "uvel-legacy-receipt", category: "IG", type: "Image Gen", model: "Legacy receipt fixture",
      client: "Example", totalSec: 20, reward: 0.01, completedAt: Date.now(),
    }, stored);
    (await import("/src/store/receipts.ts")).useReceipts().add(receipt);
    const order = { id: "ORD-UVEL-LEGACY", productId: "stellarbox-s1", productName: "NexGridBox S1",
      quantity: 1, unitPrice: 299, discount: 0, total: 299, paymentMethod: "usdt-trc20",
      status: "activated", placedAt: Date.now() - 10000, paidAt: Date.now() - 9000, activatedAt: Date.now() - 8000,
      timeline: [{ status: "activated", ts: Date.now() - 8000, note: "Device live · joined NexGrid network" }],
      deviceId: stored.id, dataCenter: "Singapore DC" };
    const table = uni.getStorageSync("nexgrid-orders-accounts-v1") || {};
    table[app.accountKey] = { orders: [order] };
    uni.setStorageSync("nexgrid-orders-accounts-v1", table);
    return { account: app.accountKey, referralCode: app.user.referralCode, balances: [app.user.usdtBalance, app.user.nexBalance], deviceId: stored.id, receiptSignature: receipt.signature, order: JSON.stringify(order) };
  });
  await page.reload(); await settle(page);
  await goto(page, "pages/me/devices");
  await dismiss(page);
  assert.match(await page.locator("body").innerText(), /UVELBox S1/, "legacy device uses current display brand");
  for (const kind of ["tradein", "block", "replace"]) {
    await page.evaluate(async ({ kind, id }) => {
      const sheet = (await import("/src/store/tradein-sheet.ts")).useTradeinSheet();
      if (kind === "tradein") sheet.showTradein(id, "stellarbox-pro", 899);
      if (kind === "block") sheet.showRetireBlock(id, "NexGridBox S1");
      if (kind === "replace") sheet.state = { kind: "replace", oldDeviceId: id, newKind: "stellarbox-pro", newPrice: 899 };
    }, { kind, id: before.deviceId });
    const modal = page.locator(".tis-root");
    await modal.waitFor();
    assert.match(await modal.innerText(), /UVELBox S1/, "legacy " + kind + " label");
    assert.doesNotMatch(await modal.innerText(), /NexGrid/i);
    await page.locator(".tis-close").click();
  }
  await goto(page, "pages/store/orders");
  assert.match(await page.locator("body").innerText(), /UVELBox S1/, "legacy order list");
  await page.getByText("UVELBox S1", { exact: true }).click();
  await page.waitForURL(/order-detail/);
  await settle(page);
  assert.match(await page.locator("body").innerText(), /UVELBox S1/, "legacy order detail");
  assert.doesNotMatch(await page.locator("body").innerText(), /NexGrid/i);
  await goto(page, "pages/me/receipts");
  await page.getByText("Legacy receipt fixture", { exact: true }).click();
  assert.match(await page.locator("body").innerText(), /UVELBox S1/, "legacy receipt display");
  const after = await page.evaluate(async () => {
    const app = (await import("/src/store/app.ts")).useApp();
    const receipt = (await import("/src/store/receipts.ts")).useReceipts().byId("uvel-legacy-receipt");
    return { account: app.accountKey, referralCode: app.user.referralCode, balances: [app.user.usdtBalance, app.user.nexBalance],
      storedDeviceName: (await import("/src/store/account-cloud.ts")).readAccountSnapshot(app.accountKey).devices.find(d => d.kind === "stellarbox-s1").name,
      storedReceiptName: receipt.deviceName, receiptSignature: receipt.signature,
      order: JSON.stringify(uni.getStorageSync("nexgrid-orders-accounts-v1")[app.accountKey].orders.find(o => o.id === "ORD-UVEL-LEGACY")) };
  });
  assert.equal(after.account, before.account);
  assert.equal(after.referralCode, before.referralCode);
  assert.deepEqual(after.balances, before.balances, "USDT and NEX balances unchanged");
  assert.equal(after.storedDeviceName, "NexGridBox S1");
  assert.equal(after.storedReceiptName, "NexGridBox S1");
  assert.equal(after.receiptSignature, before.receiptSignature);
  assert.equal(after.order, before.order);
  console.log("Legacy account, USDT/NEX balances, devices, orders, trade-in dialogs and receipt: preserved after reload");
}
async function saveDownload(page, click, name) {
  const waiting = page.waitForEvent("download", { timeout: 15000 });
  await click();
  const download = await waiting;
  assert.ok(download.suggestedFilename().startsWith("uvel-"), "brand download filename");
  const file = out + "/" + name + ".png";
  await download.saveAs(file);
  const pixels = await page.evaluate(async data => {
    const image = new Image(); image.src = data; await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    const crop = ctx.getImageData(0, 0, image.width / 2, image.height / 6).data;
    let lemon = 0, white = 0;
    for (let i = 0; i < crop.length; i += 4) {
      if (crop[i] > 90 && crop[i + 1] > 130 && crop[i + 2] < 100) lemon++;
      if (crop[i] > 200 && crop[i + 1] > 200 && crop[i + 2] > 200) white++;
    }
    return { width: image.width, height: image.height, lemon, white };
  }, "data:image/png;base64," + readFileSync(file).toString("base64"));
  assert.ok(pixels.lemon > 30 && pixels.white > 30, "exported logo has colored emblem and wordmark");
  shots.push(file);
  return pixels;
}
async function exportPosters(page, locale, theme) {
  await goto(page, "pages/team/team");
  await dismiss(page);
  const posterLabel = await page.evaluate(async () => (await import("/src/i18n/use-t.ts")).getT().team.inviteSharePoster);
  await page.getByText(posterLabel, { exact: true }).click();
  await page.locator(".ps-preview__img img").waitFor({ timeout: 15000 });
  await saveDownload(page, () => page.locator(".ps-ch").first().click(), "invite-" + locale + "-" + theme);
  await page.locator(".ps-head__x").click();
  await goto(page, "pages/me/proof");
  const proofLabel = await page.evaluate(async () => (await import("/src/i18n/use-t.ts")).getT().proof.shareDestinations.download);
  await saveDownload(page, () => page.getByRole("button", { name: proofLabel, exact: true }).click(), "proof-" + locale + "-" + theme);
}
async function productImages(page, locale, theme) {
  const products = [
    ["stellarbox-pro", "nexgridbox-pro-v2.png"], ["stellarbox-pro-v2", "nexgridbox-pro-v2.png"],
    ["stellarrack-p1", "nexgridrack-p1-v2.png"], ["stellarrack-p2", "nexgridrack-p1-v2.png"],
  ];
  await goto(page, "pages/store/store");
  await dismiss(page);
  for (const file of new Set(products.map(p => p[1]))) {
    const img = page.locator(`img[src$="/products/${file}"]`).first();
    await img.evaluate(el => el.scrollIntoView({ block: "center" }));
    await img.evaluate(async el => { if (!el.complete) await new Promise((resolve, reject) => { el.onload = resolve; el.onerror = reject; }); });
    assert.ok(await img.evaluate(el => el.naturalWidth > 0), "store product image loads");
    if (locale === "en") {
      const shot = out + "/store-" + theme + "-" + file;
      await img.locator("..").screenshot({ path: shot }); shots.push(shot);
    }
  }
  for (const [id, file] of products) {
    // A fresh document runs uni-app onLoad for each product query.
    await page.goto(base + "/?nx_device_inner=1&brand_product=" + id + "#/pages/store/detail?id=" + id);
    await settle(page);
    await inspect(page, "pages/store/detail", locale, theme);
    const img = page.locator(`img[src$="/products/${file}"]`).first();
    if (id === "stellarbox-pro-v2" || id === "stellarrack-p2") {
      const comingSoon = await page.evaluate(async () => (await import("/src/i18n/use-t.ts")).getT().store.comingSoonHeading);
      assert.ok(await page.getByText(comingSoon, { exact: true }).isVisible(), id + " retains release lock");
      assert.equal(await img.count(), 0, "locked product retains its existing text-only preview");
    } else {
      await img.waitFor();
      const data = readFileSync(root + "/src/static/img/products/" + file);
      assert.deepEqual(await img.evaluate(el => [el.naturalWidth, el.naturalHeight]), [data.readUInt32BE(16), data.readUInt32BE(20)], "current product asset dimensions");
    }
    if (locale === "en") {
      const shot = out + "/detail-" + theme + "-" + id + ".png";
      await page.screenshot({ path: shot }); shots.push(shot);
    }
  }
}
try {
  assert.ok((await identify(base, { root })).ok, "exact workspace identity");
  // One context per language keeps persisted preferences/account data independent.
  for (const locale of ["en", "zh", "vi"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-US" });
    const page = await context.newPage();
    page.on("pageerror", e => errors.push({ locale, url: page.url(), message: e.message }));
    page.on("console", msg => { if (msg.type() === "error") errors.push({ locale, url: page.url(), message: msg.text() }); });
    await login(page);
    for (const theme of ["dark", "light"]) {
      await configure(page, locale, theme);
      for (const route of routes) {
        await goto(page, route);
        await inspect(page, route, locale, theme);
      }
      await goto(page, "pages/index/index");
      await dismiss(page);
      const shot = out + "/home-" + locale + "-" + theme + ".png";
      await page.screenshot({ path: shot });
      shots.push(shot);
      await exportPosters(page, locale, theme);
      await productImages(page, locale, theme);
      console.log("Routes " + locale + "/" + theme + ": " + routes.length);
    }
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, locale: "en-US" });
  const page = await context.newPage();
  page.on("pageerror", e => errors.push({ url: page.url(), message: e.message }));
  await login(page);
  await configure(page, "en", "dark");
  await page.reload();
  await settle(page);
  assert.ok(!page.url().includes("/login/"), "session persists after reload");
  await dismiss(page);
  for (const route of ["pages/login/login", "pages/register/register", "pages/onboarding/terms", "pages/ref/code", "pages/me/proof"]) {
    await page.setViewportSize({ width: 320, height: 750 });
    await goto(page, route);
    await inspect(page, route, "en", "dark");
    const shot = out + "/narrow-" + route.split("/").slice(-2).join("-") + ".png";
    await page.screenshot({ path: shot }); shots.push(shot);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await goto(page, "pages/team/team");
  await dismiss(page);
  const posterLabel = await page.evaluate(async () => (await import("/src/i18n/use-t.ts")).getT().team.inviteSharePoster);
  await page.getByText(posterLabel, { exact: true }).click();
  await page.locator(".ps-preview__img img").waitFor();
  await page.route("**/static/img/brand/header-logo-dark.png", route => route.abort());
  await page.locator(".ps-thumb").last().click();
  await page.locator(".ps-fail").waitFor();
  assert.ok(await page.locator(".ps-ch--off").count() > 0, "failed poster cannot be saved");
  await page.unroute("**/static/img/brand/header-logo-dark.png");
  await page.locator(".ps-fail__btn").click();
  await page.locator(".ps-preview__img img").waitFor();
  await saveDownload(page, () => page.locator(".ps-ch").first().click(), "invite-retry");
  await page.locator(".ps-head__x").click();
  await legacyDataCheck(page);
  await context.close();
  assert.deepEqual(errors, [], "browser errors");
  passed = true;
  console.log("UVEL runtime: " + reports.length + " route/locale/theme checks; exports and failure retry passed");
} catch (error) {
  errors.push({ message: error.message });
  throw error;
} finally {
  const result = { ...bindings, at: startedAt, mode: "full", capability: "runtime", treeMoved: false, verdict: passed ? "pass" : "fail", reports, errors, shots,
    steps: [{ id: "runtime-brand", status: passed ? "pass" : "fail", innerSkipped: 0, evidence: [reports.length + " route/locale/theme checks", "Actual downloads and failed-image retry", "Legacy device/order/trade-in/receipt display and persisted account/referral/order/signature after reload", ...shots] }] };
  writeFileSync(out + "/runtime.json", JSON.stringify(result, null, 2));
  await browser.close();
  server.stop();
}
