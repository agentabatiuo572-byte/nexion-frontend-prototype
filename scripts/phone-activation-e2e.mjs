import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const baseURL = process.env.NX_E2E_BASE_URL || "http://127.0.0.1:5173";
const backendURL = process.env.NX_E2E_BACKEND_URL || "http://127.0.0.1:8110";
const countryCode = process.env.NX_E2E_COUNTRY_CODE || "+86";
const countryIso = process.env.NX_E2E_COUNTRY_ISO || "CN";
let phone = process.env.NX_E2E_PHONE;
let password = process.env.NX_E2E_PASSWORD;

async function provisionSandboxUser() {
  phone ||= `139${String(Date.now() % 100_000_000).padStart(8, "0")}`;
  password ||= `Nx!Phone${String(Date.now()).slice(-8)}`;
  const send = await fetch(`${backendURL}/auth/users/register/otp/send`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ countryCode, phone }),
  });
  const sent = await send.json();
  if (!send.ok || sent?.code !== 0 || typeof sent?.data?.challengeNo !== "string") {
    throw new Error(`sandbox registration OTP failed with HTTP ${send.status}`);
  }
  const register = await fetch(`${backendURL}/auth/users/register`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      countryCode, phone, challengeNo: sent.data.challengeNo,
      code: "123456", password, sponsorCode: null,
    }),
  });
  const created = await register.json();
  if (!register.ok || created?.code !== 0 || !created?.data?.accessToken) {
    throw new Error(`sandbox registration failed with HTTP ${register.status}`);
  }
}

if (process.env.NX_E2E_PROVISION === "1") await provisionSandboxUser();
if (!phone || !password) throw new Error("NX_E2E_PHONE and NX_E2E_PASSWORD are required");

const artifactDir = path.resolve("artifacts/phone-activation-e2e");
fs.mkdirSync(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: "zh-CN",
  viewport: { width: 390, height: 844 },
  recordVideo: { dir: artifactDir, size: { width: 390, height: 844 } },
});
await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
const page = await context.newPage();
page.setDefaultTimeout(60_000);
const appFrame = () => {
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame() && candidate.url().includes("nx_device_inner=1"));
  if (!frame) throw new Error("device preview iframe is unavailable");
  return frame;
};

let calibrationFailures = 1;
let activationFailures = 1;
let calibratedDeviceId = "";
const activationKeys = [];
const calibrationKeys = [];
const responses = [];
page.on("response", (response) => {
  const url = new URL(response.url());
  if (url.pathname.includes("/api/onboarding/calibrate") || url.pathname === "/api/devices/earnings"
      || url.pathname.startsWith("/api/tasks/assignments")) {
    responses.push({ method: response.request().method(), path: url.pathname, status: response.status() });
  }
});
await page.route("**/api/onboarding/calibrate", async (route) => {
  if (new URL(route.request().url()).pathname === "/api/onboarding/calibrate") {
    const body = route.request().postDataJSON();
    if (body && typeof body.deviceId === "string") calibratedDeviceId = body.deviceId;
    calibrationKeys.push(route.request().headers()["idempotency-key"] || "");
  }
  if (calibrationFailures > 0 && new URL(route.request().url()).pathname === "/api/onboarding/calibrate") {
    calibrationFailures -= 1;
    await route.abort("failed");
    return;
  }
  await route.continue();
});
await page.route("**/api/onboarding/calibrate/activate", async (route) => {
  activationKeys.push(route.request().headers()["idempotency-key"] || "");
  if (activationFailures > 0) {
    activationFailures -= 1;
    await route.abort("failed");
    return;
  }
  await route.continue();
});

const expectVisibleText = async (text) => {
  await appFrame().getByText(text, { exact: false }).first().waitFor({ state: "visible" });
};
const dismissObservationCredential = async () => {
  const observationConfirm = appFrame().getByText("确定", { exact: true }).last();
  await observationConfirm.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
  if (await observationConfirm.isVisible().catch(() => false)) await observationConfirm.click();
};
const canonicalActivation = async () => {
  if (!calibratedDeviceId) throw new Error("calibrated device identity was not captured");
  const login = await fetch(`${backendURL}/auth/users/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ countryCode, phone, password }),
  });
  const session = await login.json();
  if (!login.ok || session?.code !== 0 || !session?.data?.accessToken) {
    throw new Error(`canonical verification login failed: HTTP ${login.status}`);
  }
  const response = await fetch(`${backendURL}/api/onboarding/calibrate/result?deviceId=${encodeURIComponent(calibratedDeviceId)}`, {
    headers: { authorization: `Bearer ${session.data.accessToken}` },
  });
  const body = await response.json();
  if (response.status === 404 && body?.message === "ONBOARDING_CALIBRATION_NOT_FOUND") return null;
  if (!response.ok || body?.code !== 0 || typeof body?.data?.activationStatus !== "string") {
    throw new Error(`canonical activation readback failed: HTTP ${response.status}`);
  }
  return body.data;
};

let failure;
try {
  await page.goto(`${baseURL}/#/pages/login/login`, { waitUntil: "domcontentloaded" });
  await page.locator("iframe").waitFor({ state: "visible" });
  await appFrame().locator(".lg-phone__cc").waitFor({ state: "visible" });
  const currentDialCode = (await appFrame().locator(".lg-phone__cc").textContent())?.trim();
  if (currentDialCode !== countryCode) {
    await appFrame().locator(".lg-phone__cc").click();
    await appFrame().locator(".cc-row").filter({ hasText: countryIso }).click();
  }
  await appFrame().locator(".lg-phone__in input").fill(phone);
  await appFrame().locator(".lg-field--flex input").fill(password);
  await appFrame().locator(".lg-cta").click();
  await page.waitForFunction(() => !location.hash.includes("/pages/login/login"), null, { timeout: 30_000 });

  // Switch through the visible language preferences page so this acceptance
  // run verifies the exact Chinese copy requested by product.
  await page.goto(`${baseURL}/#/pages/me/language`, { waitUntil: "domcontentloaded" });
  await page.locator("iframe").waitFor({ state: "visible" });
  await appFrame().locator(".nx-language-row-zh").click();
  await expectVisibleText("语言");

  // Use the real, user-facing recalibration page. The first network request is
  // deliberately interrupted to prove the detection failure recovery state.
  await page.goto(`${baseURL}/#/pages/onboarding/connect`, { waitUntil: "domcontentloaded" });
  await page.locator("iframe").waitFor({ state: "visible" });
  // Acceptance sandbox exposes the observation credential in a confirm modal.
  // Dismiss the normal product prompt before exercising the calibration CTA.
  await dismissObservationCredential();
  await appFrame().getByText("开始校准", { exact: true }).click();
  await appFrame().locator(".cn-error-actions").waitFor({ state: "visible", timeout: 20_000 });
  await expectVisibleText("重试");
  await expectVisibleText("暂不激活");
  await expectVisibleText("设备仓库");
  await expectVisibleText("不会发放手机算力及相关激活奖励");
  await page.screenshot({ path: path.join(artifactDir, "01-detection-failed-actions.png"), fullPage: true });

  // Detection failure may be deferred before any calibration row exists. The
  // server must persist a canonical tombstone with no invented capability.
  await appFrame().getByText("暂不激活", { exact: true }).click();
  await page.waitForFunction(() => location.hash === "#/" || location.hash.includes("/pages/index/index")
    || location.hash.includes("/pages/me/devices"), null, { timeout: 20_000 });
  const detectionDeferred = await canonicalActivation();
  if (detectionDeferred?.activationStatus !== "DEFERRED" || detectionDeferred?.calibrationAvailable !== false) {
    throw new Error(`detection defer was not persisted without capability: ${JSON.stringify(detectionDeferred)}`);
  }
  await page.goto(`${baseURL}/#/pages/me/devices`, { waitUntil: "domcontentloaded" });
  await page.locator("iframe").waitFor({ state: "visible" });
  await expectVisibleText("重新激活手机算力");
  await appFrame().getByText("重新激活手机算力", { exact: true }).click();
  await dismissObservationCredential();
  calibrationFailures = 1;
  await appFrame().getByText("开始校准", { exact: true }).click();
  await appFrame().locator(".cn-error-actions").waitFor({ state: "visible", timeout: 20_000 });

  // A later retry from the warehouse still reuses the exact same observation
  // command while replacing the revision-0 tombstone through CAS.
  await appFrame().getByText("重试", { exact: true }).click();
  await expectVisibleText("校准完成");
  const firstResultAction = appFrame().locator(".cn-cta .cn-go--on").first();
  await firstResultAction.waitFor({ state: "visible", timeout: 20_000 });
  if (calibrationKeys.length !== 3 || !calibrationKeys[1] || calibrationKeys[1] !== calibrationKeys[2]) {
    throw new Error(`calibration retry did not reuse one idempotency key: ${JSON.stringify(calibrationKeys)}`);
  }

  // The first binding attempt is interrupted; choosing defer from the binding
  // failure must revoke the now-existing canonical calibration.
  await firstResultAction.click();
  await appFrame().locator(".cn-error-actions").waitFor({ state: "visible" });
  await expectVisibleText("手机算力绑定失败");
  await expectVisibleText("暂不激活");
  await appFrame().getByText("暂不激活", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(artifactDir, "02-binding-failed-defer.png"), fullPage: true });
  await appFrame().getByText("暂不激活", { exact: true }).click();
  await page.waitForFunction(() => location.hash === "#/" || location.hash.includes("/pages/index/index")
    || location.hash.includes("/pages/me/devices"), null, { timeout: 20_000 });
  const stateAfterDefer = await canonicalActivation();
  if (stateAfterDefer?.activationStatus !== "DEFERRED" || stateAfterDefer?.calibrationAvailable !== true) {
    throw new Error(`binding defer left invalid canonical state: ${JSON.stringify(stateAfterDefer)}`);
  }
  await page.goto(`${baseURL}/#/pages/me/devices`, { waitUntil: "domcontentloaded" });
  await page.locator("iframe").waitFor({ state: "visible" });
  await expectVisibleText("手机算力尚未激活");
  await expectVisibleText("重新激活手机算力");
  await expectVisibleText("不发放手机算力及相关激活奖励");
  await page.screenshot({ path: path.join(artifactDir, "03-device-warehouse-recovery.png"), fullPage: true });

  // Enter through the visible warehouse CTA. Calibration succeeds, then the
  // first activation call is interrupted to prove binding failure recovery.
  await appFrame().getByText("重新激活手机算力", { exact: true }).click();
  await dismissObservationCredential();
  await appFrame().getByText("开始校准", { exact: true }).click();
  await expectVisibleText("校准完成");
  const resultAction = appFrame().locator(".cn-cta .cn-go--on").first();
  await resultAction.waitFor({ state: "visible", timeout: 20_000 });
  activationFailures = 1;
  await resultAction.click();
  await appFrame().locator(".cn-error-actions").waitFor({ state: "visible" });
  await expectVisibleText("手机算力绑定失败");
  await expectVisibleText("重试");
  await expectVisibleText("暂不激活");
  await page.screenshot({ path: path.join(artifactDir, "04-binding-failed-actions.png"), fullPage: true });

  await appFrame().getByText("重试", { exact: true }).click();
  await page.waitForFunction(() => location.hash === "#/" || location.hash.includes("/pages/index/index"), null, { timeout: 30_000 });
  if (activationKeys.length !== 3 || !activationKeys[1] || activationKeys[1] !== activationKeys[2]) {
    throw new Error(`activation retry did not reuse one idempotency key: ${JSON.stringify(activationKeys)}`);
  }

  await page.goto(`${baseURL}/#/pages/me/devices`, { waitUntil: "domcontentloaded" });
  await page.locator("iframe").waitFor({ state: "visible" });
  await page.waitForTimeout(1_000);
  if (await appFrame().getByText("手机算力尚未激活", { exact: true }).count()) {
    throw new Error("phone activation card remained visible after canonical ACTIVE response");
  }

  // Server-mode H5 intentionally forgets bearer authority on a hard reload.
  // Re-authenticate, then prove the canonical ACTIVE state is restored rather
  // than treating the expected login gate as an activation success.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("iframe").waitFor({ state: "visible" });
  await appFrame().locator(".lg-phone__cc").waitFor({ state: "visible" });
  const reloadDialCode = (await appFrame().locator(".lg-phone__cc").textContent())?.trim();
  if (reloadDialCode !== countryCode) {
    await appFrame().locator(".lg-phone__cc").click();
    await appFrame().locator(".cc-row").filter({ hasText: countryIso }).click();
  }
  await appFrame().locator(".lg-phone__in input").fill(phone);
  await appFrame().locator(".lg-field--flex input").fill(password);
  await appFrame().locator(".lg-cta").click();
  await page.waitForFunction(() => !location.hash.includes("/pages/login/login"), null, { timeout: 30_000 });

  if ((await canonicalActivation())?.activationStatus !== "ACTIVE") throw new Error("canonical ACTIVE readback failed after re-login");
  // Keep the freshly authenticated memory-only Bearer session. A second
  // page.goto would be another hard reload and, correctly, discard that
  // authority before the warehouse projection can be verified.
  await appFrame().evaluate(() => new Promise((resolve, reject) => {
    globalThis.uni.navigateTo({ url: "/pages/me/devices", success: resolve, fail: reject });
  }));
  await expectVisibleText("设备仓库");
  await expectVisibleText("你的手机");
  await expectVisibleText("已激活");
  await expectVisibleText("取消激活");
  if (await appFrame().getByText("手机算力尚未激活", { exact: true }).count()) {
    throw new Error("canonical phone activation state did not survive reload and re-login");
  }
  const projectionFailures = responses.filter((entry) =>
    (entry.path === "/api/devices/earnings" || entry.path.startsWith("/api/tasks/assignments"))
      && (entry.status < 200 || entry.status >= 300));
  if (projectionFailures.length) {
    throw new Error(`canonical warehouse projection failed: ${JSON.stringify(projectionFailures)}`);
  }
  await page.screenshot({ path: path.join(artifactDir, "05-active-after-refresh.png"), fullPage: true });

  const summary = { status: "PASS", calibrationAttemptCount: calibrationKeys.length,
    reusedCalibrationKey: calibrationKeys[1] === calibrationKeys[2], activationAttemptCount: activationKeys.length,
    reusedActivationKey: activationKeys[1] === activationKeys[2],
    canonicalStatusAfterDetectionDefer: detectionDeferred.activationStatus,
    calibrationAvailableAfterDetectionDefer: detectionDeferred.calibrationAvailable,
    canonicalStatusAfterDefer: stateAfterDefer.activationStatus,
    canonicalStatusAfterRelogin: "ACTIVE", responses };
  fs.writeFileSync(path.join(artifactDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary));
} catch (error) {
  failure = error;
  await page.screenshot({ path: path.join(artifactDir, "failure.png"), fullPage: true }).catch(() => undefined);
  const body = await appFrame().locator("body").innerText().catch(() => "");
  console.error(JSON.stringify({ status: "FAIL", url: page.url(), message: String(error), body: body.slice(0, 4_000), responses }));
} finally {
  await context.tracing.stop({ path: path.join(artifactDir, "trace.zip") });
  await context.close();
  await browser.close();
}
if (failure) throw failure;
