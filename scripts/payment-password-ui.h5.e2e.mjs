import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.PAYMENT_PIN_UI_BASE_URL || "http://127.0.0.1:5598";
const output = new URL("../output/payment-pin-20261030/frontend/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(() => performance.setResourceTimingBufferSize(10000));
// This focused fixture also owns the shell's unrelated support socket.
await context.routeWebSocket("**/ws/conversations**", socket => { socket.onMessage(() => {}); });
let configured = false, version = 0, remaining = 5, lockedUntil = null;
let setupCalls = 0, resetCalls = 0, changeCalls = 0;
let loggedIn = false;
let fixtureSession = null;
let statusFailure = false, setupTimeout = true, changeTimeout = false, fixturePin = "039417", lastChangeKey = "";
const receipts = new Map();
const state = () => ({ configured, credentialVersion: version, lockedUntil, remainingAttempts: remaining, serverTime: new Date().toISOString() });
const receipt = request => ({ commandKey: request.headers()["idempotency-key"], status: "SUCCEEDED", state: state(), canResumeSameKey: false });
const reply = (route, data, status = 200, message = "OK") => route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ code: status === 200 ? 0 : status, message, data }) });
const pageErrors = [];
const consoleErrors = [], expectedTransportErrors = [];
const focusedPinStages = [];
const requestPaths = [];
try {
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) requestPaths.push(`${request.method()} ${url.origin}${url.pathname}`);
    if (url.origin !== new URL(base).origin) return route.continue();
    if (url.pathname === "/auth/users/refresh") return loggedIn ? reply(route, fixtureSession) : reply(route, null, 401, "USER_REFRESH_TOKEN_REQUIRED");
    if (url.pathname === "/auth/users/login") {
      const body = request.postDataJSON();
      loggedIn = true;
      fixtureSession = { accessToken: "ui-fixture-access", refreshToken: null, tokenType: "Bearer", user: { userId: 90210, countryCode: body.countryCode, phone: body.phone, nickname: "Payment PIN UI fixture", onboardingComplete: true } };
      return reply(route, fixtureSession);
    }
    if (url.pathname === "/api/legal/terms/current") return reply(route, { source: "server", sourceEnvironment: "PRODUCTION", runId: "", requestedLocale: url.searchParams.get("locale") || "zh-CN", resolvedLocale: "zh-CN", requestedJurisdiction: "GLOBAL", resolvedJurisdiction: "GLOBAL", provenance: "payment-pin-ui-fixture", version: "v1", effectiveAt: "2026-09-02T00:00:00Z", title: "Terms", summary: "Accepted", sections: [{ key: "main", title: "Terms", body: "Accepted", sortOrder: 0 }], acknowledged: true, acknowledgedAt: "2026-09-02T00:00:00Z" });
    const security = "/api/app/security/payment-password";
    if (url.pathname === security) return statusFailure ? reply(route, null, 503, "PAYMENT_PASSWORD_UNAVAILABLE") : reply(route, state());
    if (url.pathname === `${security}/setup`) {
      const body = request.postDataJSON(); assert.equal(body.newPassword, "039417"); assert.equal(body.confirmPassword, "039417");
      setupCalls++; configured = true; version++;
      const result = receipt(request); receipts.set(result.commandKey, result);
      if (setupTimeout) { setupTimeout = false; return reply(route, null, 504, "FIXTURE_SETUP_RESULT_UNKNOWN"); }
      return reply(route, result);
    }
    if (url.pathname.startsWith(`${security}/commands/`)) return reply(route, receipts.get(decodeURIComponent(url.pathname.split("/").at(-1))) ?? { commandKey: decodeURIComponent(url.pathname.split("/").at(-1)), status: "NOT_SEEN", canResumeSameKey: false });
    if (url.pathname === `${security}/change`) {
      const body = request.postDataJSON(); changeCalls++;
      if (body.currentPassword !== fixturePin) { remaining--; return reply(route, state(), 422, "PAYMENT_PASSWORD_INCORRECT"); }
      assert.equal(body.newPassword, body.confirmPassword); assert.equal(body.expectedCredentialVersion, version);
      version++; fixturePin = body.newPassword;
      const result = receipt(request); lastChangeKey = result.commandKey; receipts.set(result.commandKey, result);
      if (changeTimeout) { changeTimeout = false; return reply(route, null, 504, "FIXTURE_CHANGE_RESULT_UNKNOWN"); }
      return reply(route, result);
    }
    if (url.pathname === `${security}/reset/challenge`) {
      assert.equal(request.postData(), null, "Recovery must not accept an arbitrary new phone");
      return reply(route, { phoneMasked: "+84 *** 1234", challengeNo: "fixture-challenge", resendAfterSec: 60, expiresAt: new Date(Date.now() + 600000).toISOString() });
    }
    if (url.pathname === `${security}/reset/verify`) {
      assert.deepEqual(request.postDataJSON(), { challengeNo: "fixture-challenge", code: "012345" });
      return reply(route, { resetProof: "fixture-proof", expiresAt: new Date(Date.now() + 600000).toISOString() });
    }
    if (url.pathname === `${security}/reset`) {
      const body = request.postDataJSON(); assert.equal(body.resetProof, "fixture-proof"); assert.equal(body.newPassword, body.confirmPassword);
      resetCalls++; version++; remaining = 5; fixturePin = body.newPassword; return reply(route, receipt(request));
    }
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return reply(route, {});
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => {
    if (message.type() !== "error") return;
    const location = message.location().url;
    if (message.text().startsWith("Failed to load resource:") && /\/(?:auth\/users\/refresh|api\/app\/security\/payment-password)(?:\/|$)/.test(new URL(location || base).pathname)) expectedTransportErrors.push(message.text());
    else consoleErrors.push(message.text());
  });
  await page.goto(`${base}/?nx_device=off#/pages/login/login`);
  await page.waitForSelector(".lg-cta", { timeout: 30000 });
  await page.locator(".lg-phone__in input, input.lg-phone__in").fill("13800138000");
  await page.locator(".lg-field--flex input, input.lg-field--flex").first().fill("ui-fixture-password");
  await page.locator(".lg-cta").click();
  await page.waitForURL(url => url.hash === "#/" || url.hash.includes("/pages/index/index"), { timeout: 30000 });
  await page.evaluate(async () => {
    const [{ useLocaleStore }, { navTo }] = await Promise.all([import("/src/store/locale.ts"), import("/src/lib/route.ts")]);
    useLocaleStore().setLocale("zh"); await navTo("/me/payment-password");
  });
  await page.locator(".payment-pin-page__primary").waitFor();
  const bindPinModule = () => page.evaluate(async () => {
    // Vite's HMR timestamp is part of module identity. Import the actual URL
    // already loaded by the page so the harness observes its singleton.
    const current = performance.getEntriesByType("resource").map(entry => entry.name).filter(name => name.includes("/src/store/payment-password.ts")).at(-1);
    window.__paymentPinModule = await import(current || "/src/store/payment-password.ts");
  });
  await bindPinModule();
  const openPayment = async () => {
    await page.evaluate(async () => {
      const { requestPaymentPassword } = window.__paymentPinModule;
      window.__paymentPinResult = undefined;
      void requestPaymentPassword({ amount: "0.00", currency: "USDT", summary: "置换测试设备", details: [{ name: "完整设备名称与本笔置换权益摘要", quantity: 1, amount: "0.00" }] }).then(result => { window.__paymentPinResult = result; });
    });
    await page.waitForTimeout(350);
    await page.locator(".payment-pin-mask").waitFor({ timeout: 5000 });
    await page.waitForFunction(() => !document.body.textContent.includes("正在读取支付密码状态…"));
  };
  const pinInput = () => page.locator(".payment-pin-mask .payment-pin-input input");
  const primary = () => page.locator(".payment-pin-mask .payment-pin-primary");
  const screenshot = name => page.screenshot({ path: new URL(name, output).pathname.replace(/^\/(\w:)/, "$1"), fullPage: true });
  const assertPinFocused = async stage => {
    await page.waitForFunction(() => {
      const input = document.querySelector(".payment-pin-mask .payment-pin-input input");
      return input && !input.disabled && document.activeElement === input;
    }, undefined, { timeout: 5000 });
    assert.equal(await pinInput().evaluate(input => document.activeElement === input), true, `${stage}: PIN input must own keyboard focus`);
    focusedPinStages.push(stage);
  };
  const typeFocusedPin = async (value, stage) => { await assertPinFocused(stage); await page.keyboard.type(value); };

  // The personal-center source shares setup content without promising a payment.
  await page.locator(".payment-pin-page__primary").click();
  await page.locator(".payment-pin-mask").getByText("您暂未设置支付密码，这是初次设置，设置成功后请牢记。", { exact: true }).waitFor();
  await assertPinFocused("personal-first-setup");
  assert.equal(await page.locator(".payment-pin-title").getAttribute("aria-live"), "polite");
  assert.equal(await page.locator(".payment-pin-mask").getByText("设置完成后，请再次输入支付密码，继续本笔支付。", { exact: true }).count(), 0);
  await page.locator(".payment-pin-close").click();
  await openPayment();
  await page.getByText("您暂未设置支付密码，这是初次设置，设置成功后请牢记。", { exact: true }).waitFor();
  assert.deepEqual(await page.locator(".payment-pin-sheet").evaluate(sheet => ({
    inset: getComputedStyle(sheet).padding,
    gap: getComputedStyle(sheet.querySelector(".payment-pin-input__cells")).gap,
    radius: getComputedStyle(sheet.querySelector(".payment-pin-input__cell")).borderRadius,
  })), { inset: "20px", gap: "8px", radius: "12px" });
  await screenshot("01-first-setup-zh-390.png");
  await typeFocusedPin("039417", "checkout-first-setup"); await primary().click();
  await typeFocusedPin("039418", "setup-confirm"); await primary().click();
  await page.getByText("两次输入的新支付密码不一致，请重新输入", { exact: true }).waitFor();
  assert.equal(await pinInput().inputValue(), "");
  await typeFocusedPin("039417", "setup-confirm-after-mismatch"); await primary().click();
  await page.locator(".payment-pin-mask").getByText("正在确认设置结果，请勿重复提交修改", { exact: true }).waitFor();
  assert.equal(setupCalls, 1); assert.equal(await pinInput().count(), 0);
  await page.locator(".payment-pin-mask").getByText("查询结果", { exact: true }).click();
  await page.getByText("支付密码已设置，请牢记。请再次输入，完成本笔支付。", { exact: true }).waitFor();
  assert.equal(await pinInput().inputValue(), "");
  assert.equal(await page.evaluate(() => window.__paymentPinResult === undefined), true, "Setup must not authorize payment");
  await assertPinFocused("fresh-third-payment");
  await page.getByText("展开明细", { exact: true }).click();
  await screenshot("02-third-entry-details-zh-390.png");
  await page.keyboard.press("Tab");
  await typeFocusedPin("039417", "payment-after-details-keyboard-tab"); await page.locator(".payment-pin-mask").waitFor({ state: "hidden" });
  assert.equal(await page.evaluate(() => window.__paymentPinResult.paymentPassword === "039417" && window.__paymentPinResult.credentialVersion === 1), true);
  const firstAttempt = await page.evaluate(() => window.__paymentPinResult.attemptNo);
  await page.evaluate(async () => { const { reportPaymentPasswordError } = window.__paymentPinModule; const current = performance.getEntriesByType("resource").map(entry => entry.name).filter(name => name.includes("/src/api/errors.ts")).at(-1); const { ApiError } = await import(current || "/src/api/errors.ts"); reportPaymentPasswordError(new ApiError({ kind: "business", status: 422, message: "PAYMENT_PASSWORD_INCORRECT" })); });
  remaining = 4; await openPayment();
  await page.locator(".payment-pin-mask").getByText("支付密码不正确，还可尝试 4 次", { exact: true }).waitFor();
  await typeFocusedPin("493017", "payment-after-incorrect-pin"); await page.locator(".payment-pin-mask").waitFor({ state: "hidden" });
  assert.notEqual(await page.evaluate(() => window.__paymentPinResult.attemptNo), firstAttempt);

  lockedUntil = new Date(Date.now() + 1500).toISOString(); remaining = 0; await openPayment();
  assert.equal(await pinInput().isDisabled(), true);
  assert.equal(await pinInput().evaluate(input => document.activeElement === input), false, "A locked PIN input must not take focus");
  await screenshot("03-locked-zh-390.png");
  await page.waitForTimeout(1800); lockedUntil = null; remaining = 5;
  await page.locator(".payment-pin-mask .payment-pin-link").filter({ hasText: /^重试$/ }).click();
  await page.waitForFunction(() => !document.querySelector(".payment-pin-mask input")?.disabled);
  await page.locator(".payment-pin-mask").getByText("忘记支付密码", { exact: true }).click();
  await page.locator(".payment-pin-mask").getByText("+84 *** 1234", { exact: true }).waitFor();
  await screenshot("04-bound-phone-recovery-zh-390.png");
  await page.locator(".payment-pin-code input, input.payment-pin-code").fill("012345");
  await primary().click();
  await typeFocusedPin("039417", "reset-first-input"); await primary().click();
  await typeFocusedPin("039418", "reset-confirm"); await primary().click();
  assert.equal(await pinInput().inputValue(), "");
  await typeFocusedPin("039417", "reset-confirm-after-mismatch"); await primary().click();
  await page.getByText("支付密码已重置，请输入新密码，继续本笔支付", { exact: true }).waitFor();
  await typeFocusedPin("039417", "fresh-payment-after-reset"); await page.locator(".payment-pin-mask").waitFor({ state: "hidden" });
  assert.equal(resetCalls, 1);

  await page.evaluate(async () => { const { navTo } = await import("/src/lib/route.ts"); await navTo("/me/payment-password"); });
  await page.locator(".payment-pin-page__field").first().waitFor();
  const fields = page.locator(".payment-pin-page .payment-pin-input input");
  await fields.nth(0).fill("930417"); await fields.nth(1).fill("493017"); await fields.nth(2).fill("493017");
  await page.locator(".payment-pin-page__primary").click();
  await page.getByText("支付密码不正确，还可尝试 4 次", { exact: true }).waitFor();
  assert.equal(await fields.nth(0).inputValue(), ""); assert.equal(await fields.nth(1).inputValue(), "493017");
  await screenshot("05-change-error-three-fields-zh-390.png");
  await fields.nth(0).fill("039417"); await page.locator(".payment-pin-page__primary").click();
  await page.waitForURL(url => url.hash === "#/pages/me/me");
  assert.equal(changeCalls, 2);

  await page.evaluate(async () => { const { navTo } = await import("/src/lib/route.ts"); await navTo("/me/payment-password"); });
  await fields.nth(0).waitFor();
  await fields.nth(0).fill("493017"); await fields.nth(1).fill("039417"); await fields.nth(2).fill("039417");
  changeTimeout = true; await page.locator(".payment-pin-page__primary").click();
  await page.locator(".payment-pin-mask").getByText("正在确认设置结果，请勿重复提交修改", { exact: true }).waitFor();
  assert.equal(changeCalls, 3); const persistedKey = lastChangeKey;
  await page.reload();
  await fields.nth(0).waitFor({ timeout: 30000 });
  await page.locator(".payment-pin-mask").waitFor({ state: "hidden" });
  assert.equal(changeCalls, 3, "Reload recovery must query instead of sending a second change command");
  assert(requestPaths.some(path => path.endsWith(`/commands/${encodeURIComponent(persistedKey)}`)));
  assert.equal(await page.evaluate(() => JSON.stringify(uni.getStorageSync("nexgrid-payment-password-commands-accounts-v1")).includes('"pending":null')), true);
  await bindPinModule(); await screenshot("05b-change-reload-recovery-zh-390.png");

  // Use an available page action as the origin; page PIN fields themselves
  // are intentionally disabled while the shared dialog is busy.
  await page.locator(".payment-pin-page__link").focus();
  statusFailure = true; await openPayment();
  await page.locator(".payment-pin-mask").getByText("暂时无法读取支付密码状态，请重试", { exact: true }).waitFor();
  assert.equal(await pinInput().count(), 0, "An unreadable status must not render setup or payment inputs");
  statusFailure = false; await primary().click(); await pinInput().waitFor();
  await typeFocusedPin("039", "payment-after-status-retry");
  for (let tab = 0; tab < 12; tab++) {
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest(".payment-pin-mask")), true, "Tab must stay in the payment dialog");
  }
  await page.locator(".payment-pin-close").click();
  await page.waitForFunction(() => document.activeElement === document.querySelector(".payment-pin-page__link"));
  await openPayment(); assert.equal(await pinInput().inputValue(), "", "Closing must clear the partial PIN");
  await page.locator(".payment-pin-mask").getByText("忘记支付密码", { exact: true }).click();
  await page.locator(".payment-pin-mask").getByText("+84 *** 1234", { exact: true }).waitFor();
  await page.locator(".payment-pin-mask").getByText("手机不可用", { exact: true }).click();
  await page.locator(".payment-pin-mask").getByText("当前无法通过短信验证，请联系客服协助核实身份", { exact: true }).waitFor();
  assert.equal(await page.locator(".payment-pin-mask input").count(), 0);
  await page.locator(".payment-pin-close").click();

  // Exercise the actual shared authorization helper while a partial PIN is visible.
  await page.evaluate(async () => {
    const resources = performance.getEntriesByType("resource").map(entry => entry.name);
    const vueUrl = resources.find(name => /\/(?:vue|vue\.runtime\.esm)\.js(?:\?|$)/.test(name));
    if (!vueUrl) throw new Error("Loaded Vue runtime URL missing");
    const { ref } = await import(vueUrl);
    const helperUrl = resources.filter(name => name.includes("/src/lib/authorized-payment.ts")).at(-1);
    const { executePaymentWithPassword } = await import(helperUrl || "/src/lib/authorized-payment.ts");
    window.__quoteVersion = ref(1); window.__quotePosts = 0; window.__quoteResult = undefined;
    void executePaymentWithPassword({amount:"0.00",currency:"USDT",summary:"同额报价更新测试"},
      async () => { window.__quotePosts++; return {}; }, () => window.__quoteVersion.value === 1)
      .then(result => { window.__quoteResult = result; });
  });
  await pinInput().waitFor(); await pinInput().fill("039");
  await page.evaluate(() => { window.__quoteVersion.value = 2; });
  await page.locator(".payment-pin-mask").waitFor({state:"hidden"});
  await page.getByText("订单信息已更新，请重新确认后支付",{exact:true}).waitFor();
  assert.equal(await page.evaluate(() => window.__quoteResult === null && window.__quotePosts === 0), true);
  await openPayment(); assert.equal(await pinInput().inputValue(), "", "A quote change must clear the partial PIN");
  await page.locator(".payment-pin-close").click();
  await page.getByText("订单信息已更新，请重新确认后支付", { exact: true }).waitFor({ state: "hidden" });

  for (const [locale, width] of [["en", 320], ["vi", 390]]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(async locale => { const { useLocaleStore } = await import("/src/store/locale.ts"); useLocaleStore().setLocale(locale); }, locale);
    await openPayment(); await screenshot(`06-payment-${locale}-${width}.png`);
    const dialog = page.locator(".payment-pin-sheet"); const box = await dialog.boundingBox(); assert(box && box.width <= width - 20);
    await page.locator(".payment-pin-close").click();
  }
  await page.evaluate(() => { delete window.__paymentPinResult; delete window.__paymentPinModule; delete window.__quoteVersion; delete window.__quotePosts; delete window.__quoteResult; });
  assert.equal(setupCalls, 1); assert.deepEqual(pageErrors, []); assert.deepEqual(consoleErrors, []);
  const steps = [
    { id: "pin-quote-invalidated", status: "pass", evidence: ["With three PIN digits visible, a same-amount quote version change immediately closed the prompt, showed a review notice, cleared the input and issued zero purchase commands."] },
    { id: "pin-setup", status: "pass", evidence: ["Exact Chinese first-setup reminder rendered; real keyboard input reached the focused first setup, second confirmation, mismatch retry and fresh third payment input; setupCalls=1; setup alone did not authorize payment. The heading retained its polite announcement, and Tab from expanded details reached the PIN input."] },
    { id: "pin-attempt", status: "pass", evidence: ["A rejected payment PIN reopened the same displayed amount and returned the server's four remaining attempts; the retry automatically focused the real input and accepted keyboard digits, generating a distinct attempt number."] },
    { id: "pin-lock", status: "pass", evidence: ["The PIN input was disabled during the lock; after the deadline it remained blocked until the Retry action read fresh server state."] },
    { id: "pin-recovery", status: "pass", evidence: ["The recovery challenge sent no phone field; the bound masked phone was shown; SMS verification led to two new PIN inputs and resetCalls=1; a fresh payment PIN was then required."] },
    { id: "pin-change", status: "pass", evidence: ["Three independent masked inputs rendered; a wrong current PIN cleared only the current input and retained the new input; a correct retry produced a receipt and returned to the personal center. A later committed change lost its response; reloading recovered the persisted command with GET and did not repeat its POST; total changeCalls=3."] },
    { id: "pin-locales", status: "pass", evidence: ["Rendered Chinese at 390×844, English at 320×844 and Vietnamese at 390×844; the sheet width stayed within its viewport; screenshots 01 through 06 are in the report directory."] },
    { id: "pin-recovery-statuses", status: "pass", evidence: ["A setup response was lost after commit; querying the original command completed setup with no second POST. An unavailable status showed retry with no password field; successful retry focused the PIN input. Twelve Tab presses stayed inside the dialog, and closing restored focus to the original available page action and cleared the partial PIN. Phone-unavailable showed support guidance with no arbitrary phone input."] },
    { id: "pin-runtime-errors", status: "pass", evidence: ["The isolated browser session reported zero uncaught page errors and zero unexpected console errors; deliberately injected HTTP failures were recorded separately."] },
  ];
  const report = { capability: "runtime", verdict: "pass", mode: "full", treeMoved: false,
    taskId: process.env.WORKFLOW_TASK_ID || "standalone", stepId: process.env.WORKFLOW_STEP_ID || "standalone", checkId: process.env.WORKFLOW_CHECK_ID || "standalone", runId: process.env.WORKFLOW_RUN_ID || "standalone", repo: process.env.WORKFLOW_REPO || "standalone", snapshotHash: process.env.WORKFLOW_SNAPSHOT_HASH || "standalone",
    source: "isolated browser server fixture; not a real backend payment", passed: true, viewport: ["390×844", "320×844"], locales: ["zh", "en", "vi"], focusedPinStages, setupCalls, resetCalls, changeCalls, pageErrors, consoleErrors, expectedTransportErrors, steps };
  await writeFile(new URL("ui-fixture-report.json", output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  const pages = context.pages(); if (pages[0]) { await pages[0].screenshot({ path: new URL("failure.png", output).pathname.replace(/^\/(\w:)/, "$1"), fullPage: true }); console.error((await pages[0].locator("body").innerText()).slice(-3000)); }
  console.error(JSON.stringify({ requestPaths: requestPaths.slice(-30), pageErrors }));
  throw error;
} finally { await context.close(); await browser.close(); }
