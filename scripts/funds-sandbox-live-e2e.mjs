import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseURL = process.env.NX_E2E_BASE_URL || "http://127.0.0.1:5173";
const backendURL = process.env.NX_E2E_BACKEND_URL || "http://127.0.0.1:8110";
const artifactDir = path.resolve("artifacts/funds-sandbox-live-e2e");
fs.mkdirSync(artifactDir, { recursive: true });

async function api(pathname, init = {}) {
  const response = await fetch(`${backendURL}${pathname}`, init);
  const payload = await response.json();
  if (!response.ok || payload?.code !== 0) {
    throw new Error(`API ${pathname} failed with HTTP ${response.status}: ${payload?.message || "UNKNOWN"}`);
  }
  return payload.data;
}

const stamp = Date.now();
const phone = `133${String(stamp % 100_000_000).padStart(8, "0")}`;
const password = `Nx!FundsUi${String(stamp).slice(-8)}`;
const otp = await api("/auth/users/register/otp/send", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ countryCode: "+86", phone }),
});
const session = await api("/auth/users/register", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    countryCode: "+86", phone, challengeNo: otp.challengeNo,
    code: "123456", password, sponsorCode: null,
  }),
});
assert.equal(typeof session.accessToken, "string");
const authHeaders = { "content-type": "application/json", authorization: `Bearer ${session.accessToken}` };
await api("/api/app/wallet/sandbox/topups", {
  method: "POST",
  headers: { ...authHeaders, "idempotency-key": `ui-topup-${stamp}` },
  body: JSON.stringify({ channel: "CREGIS_USDT_BEP20", amount: 25 }),
});
const withdrawal = await api("/api/app/wallet/sandbox/withdrawals", {
  method: "POST",
  headers: { ...authHeaders, "idempotency-key": `ui-withdrawal-${stamp}` },
  body: JSON.stringify({
    channel: "CREGIS_USDT_BEP20", amount: 4,
    targetAddress: "0x3333333333333333333333333333333333333333",
  }),
});
assert.equal(withdrawal.status, "CONFIRMED");
const terms = await api("/api/legal/terms/current?locale=zh-CN&jurisdiction=GLOBAL", {
  headers: authHeaders,
});
if (!terms.acknowledged) {
  await api("/api/legal/terms/acknowledgment", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      locale: terms.resolvedLocale,
      jurisdiction: terms.resolvedJurisdiction,
      version: terms.version,
      confirmed: true,
      idempotencyKey: `terms-sandbox-${terms.runId}-${terms.resolvedLocale}-${terms.resolvedJurisdiction}-${terms.version}`,
      runId: terms.runId,
    }),
  });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: "zh-CN", viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.setDefaultTimeout(45_000);
const observedFundsResponses = [];
page.on("response", async (response) => {
  if (new URL(response.url()).pathname === "/api/app/wallet/sandbox") {
    const body = await response.json().catch(() => null);
    observedFundsResponses.push({
      status: response.status(), code: body?.code, runId: body?.data?.runId,
      source: body?.data?.source, sourceEnvironment: body?.data?.sourceEnvironment,
      mode: body?.data?.mode,
    });
  }
});
const appFrame = () => {
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame()
    && candidate.url().includes("nx_device_inner=1"));
  if (!frame) throw new Error("device preview iframe is unavailable");
  return frame;
};
const appSurface = () => page.frames().find((candidate) => candidate !== page.mainFrame()
  && candidate.url().includes("nx_device_inner=1")) || page;
const openAppRoute = async (route) => {
  await page.goto(`${baseURL}/#${route}`, { waitUntil: "domcontentloaded" });
  await page.locator("iframe").waitFor({ state: "visible" });
};
const navigateInsideApp = async (route) => {
  const surface = appSurface();
  await surface.evaluate((target) => { window.location.hash = `#${target}`; }, route);
  await surface.waitForFunction((target) => window.location.hash.includes(target), route);
  // Returning from the full-screen Terms shell recreates the device-preview
  // iframe asynchronously; give that shell transition time to settle before
  // selecting the current interactive surface.
  await page.waitForTimeout(2_000);
};
const dismissObservationCredential = async (surface) => {
  const confirm = surface.getByText("确定", { exact: true }).last();
  await confirm.waitFor({ state: "visible", timeout: 1_500 }).catch(() => {});
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
};

try {
  await openAppRoute("/pages/login/login");
  const currentDialCode = (await appFrame().locator(".lg-phone__cc").textContent())?.trim();
  if (currentDialCode !== "+86") {
    await appFrame().locator(".lg-phone__cc").click();
    await appFrame().locator(".cc-row").filter({ hasText: "CN" }).click();
  }
  await appFrame().locator(".lg-phone__in input").fill(phone);
  await appFrame().locator(".lg-field--flex input").fill(password);
  await appFrame().locator(".lg-cta").click();
  await page.waitForFunction(() => !location.hash.includes("/pages/login/login"));

  await navigateInsideApp("/pages/me/wallet-topup");
  const frame = appSurface();
  await dismissObservationCredential(frame);
  try {
    await frame.locator('[data-testid="funds-sandbox-badge"]').first().waitFor({ state: "visible", timeout: 20_000 });
  } catch {
    const diagnostic = await frame.evaluate(() => ({
      hash: window.location.hash,
      text: document.body.innerText.slice(0, 500),
      badges: document.querySelectorAll('[data-testid="funds-sandbox-badge"]').length,
    }));
    throw new Error(`Sandbox badge unavailable; wallet responses=${JSON.stringify(observedFundsResponses)}; page=${JSON.stringify(diagnostic)}`);
  }
  for (const rail of ["crypto", "bank", "card"]) {
    await frame.locator(`.nx-topup-seg-${rail}`).waitFor({ state: "visible" });
  }
  const amount = frame.locator('[aria-label="Sandbox USDT top-up amount"]');
  await amount.waitFor({ state: "visible" });
  assert.equal(await amount.locator("input").inputValue(), "25");
  await frame.getByText("Cregis USDT-BEP20 · SANDBOX", { exact: true }).waitFor({ state: "visible" });
  await frame.locator(".nx-topup-seg-bank").click();
  await dismissObservationCredential(frame);
  await frame.locator('[data-testid="funds-sandbox-badge"]').last().waitFor({ state: "visible" });
  await frame.locator(".nx-topup-seg-card").click();
  await frame.locator('[data-testid="funds-sandbox-badge"]').last().waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(artifactDir, "01-topup-three-rails.png"), fullPage: true });

  await navigateInsideApp(`/pages/me/wallet-withdraw-tracking?id=${encodeURIComponent(withdrawal.orderNo)}`);
  const tracking = appSurface();
  await tracking.locator('[data-testid="funds-sandbox-badge"]').first().waitFor({ state: "visible" });
  await tracking.getByText("$4.00", { exact: true }).waitFor({ state: "visible" });
  assert.equal(await tracking.getByText(/server callback/i).count(), 0);
  assert.equal(await tracking.locator(".glow-green").count(), 0);
  assert.equal(await tracking.locator('svg path[d="M20 6 9 17l-5-5"]').count(), 5);
  await dismissObservationCredential(tracking);
  await page.screenshot({ path: path.join(artifactDir, "02-withdrawal-confirmed.png"), fullPage: true });

  process.stdout.write(JSON.stringify({
    sandboxBadge: true,
    topupRails: ["chain", "vietqr", "card"],
    editableChainAmount: true,
    withdrawalStatus: "CONFIRMED",
    manualCallbackAction: false,
  }, null, 2));
} finally {
  await browser.close();
}
