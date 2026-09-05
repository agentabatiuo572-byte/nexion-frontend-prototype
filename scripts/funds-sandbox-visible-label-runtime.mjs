import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function httpOk(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.once("error", () => resolve(false));
    request.setTimeout(800, () => request.destroy());
  });
}

async function waitUntil(check, message, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(message);
}

function stopTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

function overview(source = "mock", availableUsdt = 35) {
  return {
    code: 0,
    message: "OK",
    data: {
      wallet: { availableUsdt, reservedUsdt: 0, version: 2, source, sourceEnvironment: "SANDBOX" },
      orders: [],
      ledger: [],
      withdrawalPolicy: {
        minAmount: 1,
        dailyLimitCount: 10,
        balanceMaxRatio: 1,
        smallAmountThresholdUsd: 0,
        payoutSlaHours: 1,
        networkConfirmFeeUsd: { trc20: 0, bep20: 0, erc20: 0 },
        nexFeeOffsetRate: 1,
        policyVersion: "funds-sandbox-v1",
        cooldownDays: 1,
        complianceHoldEnabled: false,
        withdrawalEnabled: true,
        enabledNetworks: ["USDT-BEP20"],
        network: "USDT-BEP20",
        channel: "CREGIS_USDT_BEP20",
        source,
        sourceEnvironment: "SANDBOX",
        mode: "LOCAL_SANDBOX",
      },
      source,
      sourceEnvironment: "SANDBOX",
      mode: "LOCAL_SANDBOX",
    },
  };
}

function submittedWithdrawal() {
  return {
    code: 0,
    message: "OK",
    data: {
      orderNo: "SBX-WD-RUNTIME-25",
      kind: "WITHDRAWAL",
      channel: "CREGIS_USDT_BEP20",
      amount: 25,
      targetAddress: "0x1111111111111111111111111111111111111111",
      status: "SUBMITTED",
      source: "mock",
      sourceEnvironment: "SANDBOX",
      version: 0,
      createdAt: "2026-08-11T08:00:00",
      settledAt: null,
      wallet: { availableUsdt: 10, reservedUsdt: 25, version: 3, source: "mock", sourceEnvironment: "SANDBOX" },
    },
  };
}

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const npmCli = [
  process.env.npm_execpath,
  path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
].find((candidate) => candidate && fs.existsSync(candidate));
const npmArgs = ["run", "dev:h5", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"];
const serverCommand = npmCli ? process.execPath : (process.platform === "win32" ? "cmd.exe" : "npm");
const serverArgs = npmCli
  ? [npmCli, ...npmArgs]
  : process.platform === "win32"
    ? ["/d", "/s", "/c", `npm.cmd ${npmArgs.join(" ")}`]
    : npmArgs;
const server = spawn(serverCommand, serverArgs, {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: { ...process.env, VITE_NEXGRID_API_MODE: "sandbox" },
  shell: false,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput = (serverOutput + chunk).slice(-8000); });
server.stderr.on("data", (chunk) => { serverOutput = (serverOutput + chunk).slice(-8000); });

let browser;
try {
  await waitUntil(async () => {
    if (server.exitCode !== null) throw new Error(`H5 server exited (${server.exitCode})\n${serverOutput}`);
    return httpOk(`${baseUrl}/`);
  }, "sandbox H5 dev server did not start");

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let contradictory = false;
  let overviewRequests = 0;
  let sandboxWithdrawalPosts = 0;
  let productionPolicyRequests = 0;
  await page.route("**/*", (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/app/wallet/sandbox" && request.method() === "GET") {
      overviewRequests += 1;
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(overview(contradictory ? "provider" : "mock")) });
    }
    if (pathname === "/api/app/wallet/sandbox/withdrawals" && request.method() === "POST") {
      sandboxWithdrawalPosts += 1;
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(submittedWithdrawal()) });
    }
    if (pathname === "/api/withdrawals/policy") productionPolicyRequests += 1;
    return request.resourceType() === "fetch" || request.resourceType() === "xhr"
      ? route.abort()
      : route.continue();
  });
  await page.goto(`${baseUrl}/#/pages/login/login`, { waitUntil: "domcontentloaded" });

  let frame;
  await waitUntil(async () => {
    for (const candidate of page.frames()) {
      if (await candidate.locator(".lg-root").count()) {
        frame = candidate;
        return true;
      }
    }
    return false;
  }, "sandbox H5 login frame unavailable");

  const proven = await frame.evaluate(async () => {
    const [{ sessionVault }, { useApp }, { completeSignIn }] = await Promise.all([
      import("/src/api/runtime.ts"),
      import("/src/store/app.ts"),
      import("/src/auth/complete-sign-in.ts"),
    ]);
    const user = { userId: 8601, countryCode: "+86", phone: "13900008601", nickname: "Sandbox witness" };
    sessionVault.save({
      accessToken: "sandbox-visible-dom-access",
      refreshToken: "sandbox-visible-dom-refresh",
      tokenType: "Bearer",
      user,
    });
    const app = useApp();
    const signedIn = completeSignIn({ identity: "user:8601", serverProfile: user, onboardingComplete: true });
    // completeSignIn starts this exact post-login bootstrap read. Awaiting the
    // same account-scoped promise demonstrates that the fresh Bearer session,
    // rather than an HMR/local fallback, is what establishes the evidence.
    const refreshed = await app.refreshFundsSandboxForAccount("user:8601");
    uni.reLaunch({ url: "/pages/me/wallet", fail: () => {} });
    return { signedIn, refreshed, status: app.fundsSandboxStatus, evidence: app.fundsSandboxEvidence };
  });
  assert.deepEqual(proven.signedIn, { ok: true });
  assert.equal(proven.refreshed, true);
  assert.equal(proven.status, "ready");
  assert.deepEqual(proven.evidence, {
    source: "mock",
    sourceEnvironment: "SANDBOX",
    mode: "LOCAL_SANDBOX",
    withdrawalPolicy: {
      minAmount: 1,
      dailyLimitCount: 10,
      balanceMaxRatio: 1,
      smallAmountThresholdUsd: 0,
      payoutSlaHours: 1,
      networkConfirmFeeUsd: { trc20: 0, bep20: 0, erc20: 0 },
      nexFeeOffsetRate: 1,
      policyVersion: "funds-sandbox-v1",
      cooldownDays: 1,
      complianceHoldEnabled: false,
      withdrawalEnabled: true,
      enabledNetworks: ["USDT-BEP20"],
      network: "USDT-BEP20",
      channel: "CREGIS_USDT_BEP20",
      source: "mock",
      sourceEnvironment: "SANDBOX",
      mode: "LOCAL_SANDBOX",
    },
  });

  try {
    await waitUntil(async () => {
      const badge = frame.locator('[data-testid="funds-sandbox-badge"]');
      return await badge.count() > 0 && await badge.isVisible();
    }, "the real wallet DOM did not render the server-proven sandbox label");
  } catch (cause) {
    const observed = await frame.evaluate(async () => {
      const { useApp } = await import("/src/store/app.ts");
      return {
        route: location.hash,
        body: document.body.innerText.slice(0, 800),
        funds: { status: useApp().fundsSandboxStatus, evidence: useApp().fundsSandboxEvidence },
      };
    });
    throw new Error(`${cause instanceof Error ? cause.message : "SANDBOX_BADGE_MISSING"}: ${JSON.stringify(observed)}`);
  }
  const badgeText = await frame.locator('[data-testid="funds-sandbox-badge"]').innerText();
  assert.equal(badgeText.trim(), "Acceptance Sandbox · source=mock · SANDBOX");

  await frame.evaluate(() => {
    uni.reLaunch({ url: "/pages/me/wallet-withdraw", fail: () => {} });
  });
  await waitUntil(async () => {
    const body = await frame.locator("body").innerText();
    return body.includes("BEP20") && body.includes("$35.00");
  }, "the sandbox withdrawal page did not project the authoritative $35 wallet balance");
  assert.equal(productionPolicyRequests, 0,
    "an explicit sandbox withdrawal rail must not request the production policy");

  const submitted = await frame.evaluate(async () => {
    const { useApp } = await import("/src/store/app.ts");
    const app = useApp();
    const id = await app.submitWithdrawal(
      25,
      "USDT-BEP20",
      "0x1111111111111111111111111111111111111111",
      { networkConfirmUsd: 0, nexBurned: 0, actualFeeUsd: 0 },
      false,
      "funds-sandbox-v1",
      "pass",
    );
    return { id, available: app.user.usdtBalance, reserved: app.withdrawals[0]?.amount };
  });
  assert.deepEqual(submitted, { id: "SBX-WD-RUNTIME-25", available: 10, reserved: 25 });
  assert.equal(sandboxWithdrawalPosts, 1,
    "the explicit BEP20 sandbox policy must permit the authenticated sandbox POST");

  contradictory = true;
  const rejected = await frame.evaluate(async () => {
    const { useApp } = await import("/src/store/app.ts");
    const app = useApp();
    await app.refreshFundsSandbox().catch(() => undefined);
    return { status: app.fundsSandboxStatus, evidence: app.fundsSandboxEvidence };
  });
  assert.deepEqual(rejected, { status: "error", evidence: null });
  await waitUntil(async () => await frame.locator('[data-testid="funds-sandbox-badge"]').count() === 0,
    "a contradictory sandbox response left a visible label behind");
  assert.ok(overviewRequests >= 2, "the witness must exercise the actual GET authority path");

  console.log("funds sandbox visible DOM: PASS");
} finally {
  await browser?.close();
  stopTree(server);
}
