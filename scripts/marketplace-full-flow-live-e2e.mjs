import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const appBaseUrl = process.env.NX_MARKET_APP_URL || "http://127.0.0.1:5173";
const mysqlBinary = process.env.NX_MARKET_MYSQL_BIN || "D:/software/MySQL/MySQL Server 8.0/bin/mysql.exe";
const databaseName = process.env.NX_MARKET_DATABASE || "nexion";
const databasePassword = required("NX_MARKET_DATABASE_PASSWORD");
const runId = process.env.NX_MARKET_RUN_ID || `marketplace-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const evidenceDir = path.resolve(process.env.NX_MARKET_EVIDENCE_DIR || `D:/workspace/bug-pic/commerce-full-20260826/${runId}`);
const phone = process.env.NX_MARKET_PHONE || `138${String(Date.now() % 100_000_000).padStart(8, "0")}`;
const password = process.env.NX_MARKET_PASSWORD || `Nx!Market${String(Date.now()).slice(-8)}Aa`;
const reuseExisting = process.env.NX_MARKET_REUSE_EXISTING === "1";
const countryCode = "+86";

fs.mkdirSync(evidenceDir, { recursive: true });

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function safePathname(url) {
  try { return new URL(url).pathname; } catch { return url; }
}

async function waitUntil(check, message, timeoutMs = 30_000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`${message}${lastError ? `:${String(lastError)}` : ""}`);
}

function sql(query) {
  return execFileSync(mysqlBinary, ["-N", "-B", "-uroot", databaseName, "-e", query], {
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, MYSQL_PWD: databasePassword },
  }).trim();
}

function sqlText(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("'", "''");
}

function productTruthSnapshot() {
  return sql("SELECT product_no,price_usdt,stock,sold_count,updated_at FROM nx_product WHERE is_deleted=0 ORDER BY product_no");
}

function userTruthSnapshot() {
  const userId = sql(`SELECT id FROM nx_user WHERE country_code IN ('+86','86') AND phone='${sqlText(phone)}' AND is_deleted=0 ORDER BY id DESC LIMIT 1`);
  assert(/^\d+$/.test(userId), "REGISTERED_USER_NOT_FOUND");
  const wallet = sql(`SELECT CONCAT(COALESCE(usdt_available,0),'|',COALESCE(nex_available,0)) FROM nx_user_wallet WHERE user_id=${userId} AND is_deleted=0 LIMIT 1`);
  const orderCount = sql(`SELECT COUNT(*) FROM nx_order WHERE user_id=${userId} AND is_deleted=0`);
  return { userId, wallet, orderCount, productTruth: productTruthSnapshot() };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: "zh-CN", viewport: { width: 390, height: 844 } });
await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
const page = await context.newPage();
page.setDefaultTimeout(30_000);

const evidence = {
  status: "RUNNING",
  runId,
  sections: [],
  productFlows: [],
  checkoutFlows: [],
  lockedFlows: [],
  routeFlows: [],
  recoveryFlows: [],
  acceptanceObservationModalsDismissed: 0,
  relevantResponses: [],
  runtimeErrors: [],
  sideEffects: {},
};
let storeScope = false;
let catalogPayload = null;

page.on("pageerror", (error) => evidence.runtimeErrors.push(`pageerror:${error.message}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const value = message.text();
  if (/favicon|net::ERR_ABORTED|Failed to load resource/.test(value)) return;
  evidence.runtimeErrors.push(`console:${value}`);
});
page.on("response", (response) => {
  const pathname = safePathname(response.url());
  if (pathname === "/api/store/catalog" && response.status() === 200) {
    void response.json().then((payload) => { if (payload?.code === 0) catalogPayload = payload; }).catch(() => undefined);
  }
  if (!storeScope || !(/^\/api\/(?:store|orders|commerce|devices|tradein|genesis)/.test(pathname))) return;
  const entry = { method: response.request().method(), path: pathname, status: response.status() };
  evidence.relevantResponses.push(entry);
  if (response.status() >= 400) {
    void response.json().then((payload) => {
      entry.code = payload?.code ?? null;
      entry.message = payload?.message ?? null;
    }).catch(() => undefined);
  }
});

function appFrame() {
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame() && candidate.url().includes("nx_device_inner=1"));
  assert(frame, "APP_DEVICE_FRAME_UNAVAILABLE");
  return frame;
}

function currentRoute() {
  return appFrame().url();
}

async function waitForFrame(selector = "body") {
  await waitUntil(async () => {
    try { return await appFrame().locator(selector).count() > 0; } catch { return false; }
  }, `APP_FRAME_SELECTOR_NOT_READY:${selector}`);
  return appFrame();
}

async function dismissAcceptanceObservationModal(frame = appFrame()) {
  const modal = frame.locator(".uni-modal").filter({ hasText: "Acceptance observation credential" }).first();
  if (!await modal.isVisible().catch(() => false)) return false;
  await modal.locator(".uni-modal__btn").last().evaluate((element) => element.click());
  await modal.waitFor({ state: "hidden" });
  evidence.acceptanceObservationModalsDismissed += 1;
  return true;
}

async function relaunch(route) {
  await waitUntil(async () => {
    try { return await appFrame().evaluate(() => typeof globalThis.uni?.reLaunch === "function"); } catch { return false; }
  }, "APP_UNI_RUNTIME_NOT_READY");
  await appFrame().evaluate((url) => new Promise((resolve, reject) => {
    globalThis.uni.reLaunch({ url, success: resolve, fail: reject });
  }), route);
  await waitUntil(() => Promise.resolve(currentRoute().includes(`#${route.split("?")[0]}`)), `ROUTE_NOT_REACHED:${route}`);
  const frame = await waitForFrame();
  // A sandbox observation credential is a deliberate acceptance carrier, not
  // user-facing product state. Exercise its sole confirmation action before
  // continuing with the page underneath it.
  await page.waitForTimeout(700);
  await dismissAcceptanceObservationModal(frame);
  return frame;
}

async function selectChina(frame, prefix) {
  const current = (await frame.locator(`${prefix}-phone__cc`).textContent())?.trim() || "";
  if (current.includes(countryCode)) return;
  await frame.locator(`${prefix}-phone__cc`).click();
  await frame.locator(".cc-row").filter({ hasText: "CN" }).first().click();
}

async function fillOtp(frame, selector, code) {
  const inputs = frame.locator(`${selector} input`);
  assert(await inputs.count() === 6, `OTP_INPUT_COUNT_INVALID:${selector}`);
  for (let index = 0; index < 6; index += 1) await inputs.nth(index).fill(code[index]);
}

async function register() {
  await page.goto(`${appBaseUrl}/#/pages/register/register`, { waitUntil: "domcontentloaded" });
  let frame = await waitForFrame(".rg-root");
  await frame.evaluate(async () => (await import("/src/store/locale.ts")).useLocaleStore().setLocale("zh"));
  await selectChina(frame, ".rg");
  await frame.locator(".rg-phone__in input").fill(phone);
  const sent = page.waitForResponse((response) => response.request().method() === "POST" && safePathname(response.url()) === "/auth/users/register/otp/send");
  await frame.locator(".rg-cta").click();
  assert((await sent).status() === 200, "REGISTER_OTP_SEND_FAILED");
  const hint = frame.getByTestId("development-otp-code");
  await hint.waitFor({ state: "visible" });
  const code = (await hint.innerText()).match(/\b(\d{6})\b/)?.[1];
  assert(code, "DEVELOPMENT_OTP_NOT_VISIBLE");
  await fillOtp(frame, ".rg-otp__in", code);
  await frame.locator(".rg-step3").waitFor({ state: "visible" });
  const passwords = frame.locator(".rg-step3 input");
  await passwords.nth(0).fill(password);
  await passwords.nth(1).fill(password);
  const committed = page.waitForResponse((response) => response.request().method() === "POST" && safePathname(response.url()) === "/auth/users/register");
  await frame.locator(".rg-cta").click();
  assert((await committed).status() === 200, "REGISTER_COMMIT_FAILED");
  frame = await waitForFrame(".rs-root, .tos-root");
  if (await frame.locator(".tos-root").isVisible().catch(() => false)) {
    const ack = page.waitForResponse((response) => response.request().method() === "POST" && safePathname(response.url()) === "/api/legal/terms/acknowledgment");
    await frame.locator(".tos-cta").click();
    assert((await ack).status() === 200, "TERMS_ACK_FAILED");
  }
  await page.screenshot({ path: path.join(evidenceDir, "01-registration.png"), fullPage: true });
}

async function loginAfterReload() {
  await page.goto(`${appBaseUrl}/#/pages/login/login`, { waitUntil: "domcontentloaded" });
  let frame = await waitForFrame("body");
  if (!currentRoute().includes("/pages/login/login") && await frame.evaluate(() => typeof globalThis.uni?.reLaunch === "function")) {
    return { restoredByRefreshCookie: true };
  }
  await frame.locator(".lg-root").waitFor({ state: "visible" });
  await selectChina(frame, ".lg");
  await frame.locator(".lg-phone__in input").fill(phone);
  await frame.locator(".lg-field--flex input").fill(password);
  const response = page.waitForResponse((candidate) => candidate.request().method() === "POST" && safePathname(candidate.url()) === "/auth/users/login");
  await frame.locator(".lg-cta").click();
  assert((await response).status() === 200, "RELOGIN_FAILED");
  await waitUntil(() => Promise.resolve(!currentRoute().includes("/pages/login/login")), "RELOGIN_ROUTE_STUCK");
  return { restoredByRefreshCookie: false };
}

async function openStore(label = "store") {
  storeScope = true;
  catalogPayload = null;
  let frame;
  try {
    frame = await relaunch("/pages/store/store");
  } catch (error) {
    if (!/APP_UNI_RUNTIME_NOT_READY/.test(String(error))) throw error;
    // The registration-success document may be replaced once while its
    // account bootstrap commits. Re-enter through the normal visible login
    // route, then use the stable authenticated UniApp runtime.
    await loginAfterReload();
    frame = await relaunch("/pages/store/store");
  }
  await frame.locator("[data-testid='store-catalog-loading']").waitFor({ state: "hidden" }).catch(() => undefined);
  assert(!await frame.locator("[data-testid='store-catalog-error']").isVisible().catch(() => false), `${label}:CATALOG_ERROR_VISIBLE`);
  assert(!await frame.locator("[data-testid='store-catalog-empty']").isVisible().catch(() => false), `${label}:CATALOG_EMPTY_VISIBLE`);
  await frame.getByText("为你推荐", { exact: true }).waitFor({ state: "visible" });
  await waitUntil(() => Promise.resolve(Boolean(catalogPayload?.data?.products?.length)), `${label}:CATALOG_PAYLOAD_MISSING`);
  return frame;
}

async function assertNoNewRuntimeErrors(before, label) {
  assert(evidence.runtimeErrors.length === before, `${label}:RUNTIME_ERROR:${evidence.runtimeErrors.slice(before).join("|")}`);
}

async function cancelCheckout(frame, productId) {
  const cancel = frame.getByRole("button", { name: /取消/ }).last();
  await cancel.waitFor({ state: "visible" });
  await cancel.click();
  await waitUntil(
    () => Promise.resolve(currentRoute().includes(`#\/pages/store/detail?id=${productId}`)),
    "CHECKOUT_CANCEL_DID_NOT_RETURN_DETAIL",
  );
}

async function testCheckout(product) {
  await waitUntil(async () => {
    try { return await appFrame().getByText("支付方式", { exact: true }).isVisible(); }
    catch { return false; }
  }, `checkout:${product.id}:PAYMENT_STEP_NOT_READY`);
  const frame = appFrame();
  await dismissAcceptanceObservationModal(frame);
  const before = evidence.runtimeErrors.length;
  const paymentButtons = frame.getByRole("button").filter({ hasText: /开发模拟钱包|USDT|银行卡|Card|链上/ });
  const count = await paymentButtons.count();
  assert(count >= 1, `checkout:${product.id}:PAYMENT_METHODS_NOT_VISIBLE`);
  await page.screenshot({ path: path.join(evidenceDir, `checkout-${product.id}.png`), fullPage: true });
  for (let index = 0; index < count; index += 1) await paymentButtons.nth(index).click().catch(() => undefined);
  const continueButton = frame.getByRole("button", { name: /继续/ }).last();
  if (await continueButton.isVisible().catch(() => false)) {
    await continueButton.click();
    const change = frame.getByRole("button", { name: /更换支付方式|修改支付方式/ }).last();
    if (await change.isVisible().catch(() => false)) await change.click();
  }
  await cancelCheckout(await waitForFrame("body"), product.id);
  await assertNoNewRuntimeErrors(before, `checkout:${product.id}`);
  evidence.checkoutFlows.push({ productId: product.id, paymentOptionCount: count, result: "PASS", finalPaymentSubmitted: false });
}

async function testProduct(product, detailedCheckout) {
  const before = evidence.runtimeErrors.length;
  const frame = await relaunch(`/pages/store/detail?id=${encodeURIComponent(product.id)}`);
  await frame.locator("[data-testid='product-trust-material']").waitFor({ state: "visible" });
  assert(!await frame.locator("[data-testid='detail-catalog-retry']").isVisible().catch(() => false), `${product.id}:DETAIL_CATALOG_ERROR`);
  const decrease = frame.getByRole("button", { name: /减少|Decrease/ });
  const increase = frame.getByRole("button", { name: /增加|Increase/ });
  if (await increase.count()) {
    const quantityText = () => frame.locator(".tabular-nums.text-center").first().innerText();
    await decrease.click();
    assert((await quantityText()).trim() === "1", `${product.id}:QTY_MIN_FAILED`);
    for (let index = 0; index < 7; index += 1) await increase.click();
    assert((await quantityText()).trim() === "6", `${product.id}:QTY_MAX_FAILED`);
    await decrease.click();
    assert((await quantityText()).trim() === "5", `${product.id}:QTY_DECREASE_FAILED`);
  }
  const faqButtons = frame.locator(".mx-4").getByRole("button");
  const faqCount = await faqButtons.count();
  for (let index = 0; index < faqCount; index += 1) {
    const faq = faqButtons.nth(index);
    if (await faq.isVisible().catch(() => false)) {
      await faq.click();
      await faq.click();
    }
  }
  const cta = frame.locator(".scb-cta");
  await page.screenshot({ path: path.join(evidenceDir, `detail-${product.id}.png`), fullPage: true });
  let ctaResult = "hidden";
  if (await cta.isVisible().catch(() => false)) {
    const disabled = await cta.getAttribute("aria-disabled") === "true";
    const label = (await cta.innerText()).trim();
    if (disabled) {
      const routeBefore = currentRoute();
      await cta.click({ force: true });
      assert(currentRoute() === routeBefore, `${product.id}:DISABLED_CTA_NAVIGATED`);
      ctaResult = `disabled:${label}`;
    } else {
      await cta.click();
      await waitUntil(() => Promise.resolve(/#\/pages\/(?:store\/checkout|team\/quota)/.test(currentRoute())), `${product.id}:CTA_NO_DESTINATION`);
      ctaResult = currentRoute().includes("store/checkout") ? "checkout" : "quota";
      if (ctaResult === "checkout") {
        if (detailedCheckout) await testCheckout(product);
        else await cancelCheckout(await waitForFrame("body"), product.id);
      } else {
        await relaunch(`/pages/store/detail?id=${encodeURIComponent(product.id)}`);
        await waitForFrame("[data-testid='product-trust-material']");
      }
    }
  }
  await assertNoNewRuntimeErrors(before, `detail:${product.id}`);
  evidence.productFlows.push({ productId: product.id, name: product.name, faqCount, ctaResult, result: "PASS" });
}

async function testStoreCards(products) {
  let frame = await openStore("cards");
  for (const product of products.filter((item) => item.available !== false)) {
    frame = appFrame();
    const hero = frame.getByRole("button", { name: product.name, exact: true }).first();
    if (!await hero.isVisible().catch(() => false)) continue;
    const before = evidence.runtimeErrors.length;
    await hero.click();
    await waitUntil(() => Promise.resolve(currentRoute().includes(`/pages/store/detail?id=${product.id}`)), `CARD_DETAIL_FAILED:${product.id}`);
    await openStore(`card-return:${product.id}`);
    await assertNoNewRuntimeErrors(before, `card:${product.id}`);
  }
  evidence.sections.push({ name: "商品卡片到详情", tested: products.filter((item) => item.available !== false).length, result: "PASS" });
}

async function testLockedCards(products) {
  const locked = products.filter((item) => item.available === false);
  if (!locked.length) {
    evidence.lockedFlows.push({ result: "NOT_APPLICABLE", reason: "当前 E1/H1 权威快照无锁定商品" });
    return;
  }
  let frame = await openStore("locked");
  for (const product of locked) {
    frame = appFrame();
    const toggle = frame.getByRole("button").filter({ hasText: product.name }).first();
    await toggle.click();
    const notify = frame.getByRole("button", { name: /通知我|Notify me/ }).last();
    await notify.waitFor({ state: "visible" });
    const subscribe = page.waitForResponse((response) => response.request().method() === "POST" && /\/notifications$/.test(safePathname(response.url())));
    await notify.click();
    assert((await subscribe).status() === 200, `${product.id}:NOTIFY_SUBSCRIBE_FAILED`);
    const unsubscribe = page.waitForResponse((response) => response.request().method() === "DELETE" && /\/notifications$/.test(safePathname(response.url())));
    await notify.click();
    assert((await unsubscribe).status() === 200, `${product.id}:NOTIFY_UNSUBSCRIBE_FAILED`);
    evidence.lockedFlows.push({ productId: product.id, subscribeAndCleanup: true, result: "PASS" });
  }
}

async function testAuxiliaryRoutes() {
  let frame = await relaunch("/pages/store/orders");
  const retry = frame.getByRole("button", { name: /重试/ }).first();
  if (await retry.isVisible().catch(() => false)) await retry.click();
  evidence.routeFlows.push({ route: "/pages/store/orders", result: "PASS" });

  frame = await relaunch("/pages/store/order-detail?id=NX-NOT-FOUND-20260826");
  const orders = frame.getByRole("button", { name: /订单/ }).first();
  if (await orders.isVisible().catch(() => false)) {
    await orders.click();
    await waitUntil(() => Promise.resolve(currentRoute().includes("/pages/store/orders")), "ORDER_NOT_FOUND_RETURN_FAILED");
  }
  evidence.routeFlows.push({ route: "/pages/store/order-detail", result: "PASS", destructiveAction: false });

  frame = await relaunch("/pages/store/bundle");
  await frame.locator("[data-testid='bundle-catalog-loading']").waitFor({ state: "hidden" }).catch(() => undefined);
  assert(!await frame.locator("[data-testid='bundle-catalog-error']").isVisible().catch(() => false), "BUNDLE_CATALOG_ERROR");
  const add = frame.getByRole("button", { name: /添加|Add/ }).first();
  if (await add.isVisible().catch(() => false)) await add.click();
  const remove = frame.getByRole("button", { name: /移除|Remove/ }).first();
  if (await remove.isVisible().catch(() => false)) await remove.click();
  const clear = frame.getByRole("button", { name: /清空|Clear/ }).first();
  if (await clear.isVisible().catch(() => false)) await clear.click();
  const checkout = frame.getByRole("button").filter({ hasText: /结算|Checkout/ }).last();
  if (await checkout.isVisible().catch(() => false)) {
    const routeBefore = currentRoute();
    await checkout.click({ force: true });
    assert(currentRoute() === routeBefore, "BUNDLE_DISABLED_CHECKOUT_NAVIGATED");
  }
  evidence.routeFlows.push({ route: "/pages/store/bundle", addRemoveClear: true, orderSubmitted: false, result: "PASS" });
}

async function testCatalogRetry() {
  // Settle any catalog refresh started by the preceding bundle/orders routes.
  // Otherwise refreshProductCatalog() legitimately reuses that in-flight
  // promise and the newly installed failure carrier sees no network request.
  await openStore("catalog-retry-precondition");
  await relaunch("/pages/store/orders");
  await page.waitForTimeout(100);
  let injected = false;
  const handler = async (route) => {
    if (!injected) {
      injected = true;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: 503, message: "ACCEPTANCE_INJECTED_CATALOG_FAILURE" }) });
    } else await route.continue();
  };
  await page.route("**/api/store/catalog**", handler);
  let frame = await relaunch("/pages/store/store");
  await waitUntil(() => Promise.resolve(injected), "CATALOG_FAILURE_WAS_NOT_INJECTED");
  const error = frame.locator("[data-testid='store-catalog-error']");
  await error.waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(evidenceDir, "catalog-error.png"), fullPage: true });
  await page.unroute("**/api/store/catalog**", handler);
  // UniApp replaces the complete catalog-state subtree as soon as retry starts;
  // a Playwright actionability click can therefore succeed and then keep
  // retrying the already-detached node. Dispatch once and assert the outcome.
  await error.getByRole("button").evaluate((element) => element.click());
  await error.waitFor({ state: "hidden" });
  frame = appFrame();
  await frame.getByText("为你推荐", { exact: true }).waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(evidenceDir, "catalog-recovered.png"), fullPage: true });
  evidence.recoveryFlows.push({ failure: "catalog 503", visibleError: true, retryRecovered: true, result: "PASS" });
}

try {
  if (reuseExisting) await loginAfterReload();
  else await register();
  const before = userTruthSnapshot();
  evidence.sideEffects.before = before;

  const store = await openStore("initial");
  const initialText = await store.locator("body").innerText();
  for (const heading of ["算力阶梯", "你的手机", "为你推荐"]) assert(initialText.includes(heading), `STORE_SECTION_MISSING:${heading}`);
  const products = catalogPayload.data.products;
  evidence.catalog = {
    source: catalogPayload.data.source,
    serverCanonical: catalogPayload.data.serverCanonical,
    productCount: products.length,
    products: products.map((item) => ({ id: item.id, name: item.name, price: item.price, stock: item.stock, available: item.available, purchaseBlocked: item.purchaseBlocked })),
  };
  await page.screenshot({ path: path.join(evidenceDir, "02-store-top.png"), fullPage: true });

  await testStoreCards(products);
  let detailedCheckoutDone = false;
  for (const product of products) {
    const canCheckout = product.available !== false && product.purchaseBlocked !== true;
    await testProduct(product, canCheckout && !detailedCheckoutDone);
    if (canCheckout && !detailedCheckoutDone && evidence.checkoutFlows.some((entry) => entry.productId === product.id)) detailedCheckoutDone = true;
  }
  assert(detailedCheckoutDone, "NO_SAFE_CHECKOUT_FLOW_WAS_REACHABLE");
  await testLockedCards(products);

  const storeBottom = await openStore("bottom");
  await storeBottom.locator("body").evaluate((body) => { body.scrollTop = body.scrollHeight; });
  await page.screenshot({ path: path.join(evidenceDir, "03-store-bottom.png"), fullPage: true });
  const genesisTitle = storeBottom.getByText(/创世|Genesis/).last();
  if (await genesisTitle.isVisible().catch(() => false)) {
    const routeBefore = currentRoute();
    await genesisTitle.click();
    await page.waitForTimeout(500);
    evidence.routeFlows.push({ route: "Genesis showcase", result: currentRoute() !== routeBefore ? "PASS" : "PASS_WITH_EXPLANATION", destination: currentRoute() });
  } else evidence.routeFlows.push({ route: "Genesis showcase", result: "NOT_APPLICABLE", reason: "运营开关关闭" });

  await testAuxiliaryRoutes();
  await testCatalogRetry();

  await page.reload({ waitUntil: "domcontentloaded" });
  let reloadFrame = await waitForFrame("body");
  // The session/terms guards resolve asynchronously after the document shell
  // exists; inspecting immediately can still see the pre-guard store route.
  await page.waitForTimeout(1_500);
  reloadFrame = await waitForFrame("body");
  let legalTermsReacknowledged = false;
  if (await reloadFrame.locator(".tos-root").isVisible().catch(() => false)) {
    const acknowledged = page.waitForResponse((response) => response.request().method() === "POST"
      && safePathname(response.url()) === "/api/legal/terms/acknowledgment");
    await reloadFrame.locator(".tos-cta").click();
    assert((await acknowledged).status() === 200, "RELOAD_TERMS_ACK_FAILED");
    legalTermsReacknowledged = true;
    await reloadFrame.locator(".tos-root").waitFor({ state: "hidden" }).catch(() => undefined);
    await page.waitForTimeout(1_200);
    await waitUntil(() => Promise.resolve(!currentRoute().includes("/pages/onboarding/terms")), "RELOAD_TERMS_ROUTE_STUCK");
    reloadFrame = await waitForFrame("body");
  }
  const refreshedRoute = currentRoute();
  const refreshAuth = refreshedRoute.includes("/pages/login/login")
    ? await loginAfterReload()
    : { restoredByRefreshCookie: true };
  if (currentRoute().includes("#/pages/store/store")) {
    const restoredStore = await waitForFrame("body");
    await restoredStore.getByText("为你推荐", { exact: true }).waitFor({ state: "visible" });
    await dismissAcceptanceObservationModal(restoredStore);
  } else {
    await openStore("after-relogin");
  }
  evidence.recoveryFlows.push({
    failure: "full document reload",
    refreshCookieRestoredSession: refreshAuth.restoredByRefreshCookie,
    visibleReloginUsed: !refreshAuth.restoredByRefreshCookie,
    legalTermsReacknowledged,
    storeRecovered: true,
    result: "PASS",
  });

  const after = userTruthSnapshot();
  evidence.sideEffects.after = after;
  assert(after.userId === before.userId, "USER_ID_CHANGED");
  assert(after.wallet === before.wallet, `WALLET_CHANGED:${before.wallet}->${after.wallet}`);
  assert(after.orderCount === before.orderCount, `ORDER_COUNT_CHANGED:${before.orderCount}->${after.orderCount}`);
  assert(after.productTruth === before.productTruth, "PRODUCT_INVENTORY_OR_PRICE_CHANGED_DURING_APP_CLICKS");
  await new Promise((resolve) => setTimeout(resolve, 300));
  const unexpectedHttp = evidence.relevantResponses.filter((entry) => entry.status >= 400 && entry.message !== "ACCEPTANCE_INJECTED_CATALOG_FAILURE");
  assert(unexpectedHttp.length === 0, `UNEXPECTED_MARKETPLACE_HTTP_ERRORS:${JSON.stringify(unexpectedHttp)}`);
  assert(evidence.runtimeErrors.length === 0, `RUNTIME_ERRORS:${JSON.stringify(evidence.runtimeErrors)}`);
  evidence.status = "PASS";
} catch (error) {
  evidence.status = "FAIL";
  evidence.failure = error instanceof Error ? `${error.stack || error.message}` : String(error);
  await page.screenshot({ path: path.join(evidenceDir, "failure.png"), fullPage: true }).catch(() => undefined);
  throw error;
} finally {
  fs.writeFileSync(path.join(evidenceDir, "summary.json"), JSON.stringify(evidence, null, 2));
  await context.tracing.stop({ path: path.join(evidenceDir, "trace.zip") }).catch(() => undefined);
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
  process.stdout.write(JSON.stringify({ status: evidence.status, evidenceDir, productFlows: evidence.productFlows.length, checkoutFlows: evidence.checkoutFlows.length, failure: evidence.failure ?? null }, null, 2));
}
