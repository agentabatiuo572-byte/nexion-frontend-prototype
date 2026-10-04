#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5173";
const referenceBaseUrl = process.env.REFERENCE_BASE_URL || "http://127.0.0.1:5174";
const evidenceDir = process.env.NEXGRID_EVIDENCE_DIR;
const accounts = JSON.parse(process.env.NEXGRID_TEAM_ACCOUNTS_JSON || "[]");

assert.ok(evidenceDir, "NEXGRID_EVIDENCE_DIR is required");
assert.equal(accounts.length, 5, "exactly five long-lived UI-only team accounts are required");
for (const account of accounts) {
  assert.ok(account.label && account.phone && account.password, "each account requires label, phone and password");
}

const TEAM_HOME = "/pages/team/team";
const routeClicks = [
  ["rank", ".nx-team-rank-link", "/pages/team/rank"],
  ["leaderboard", ".nx-team-leaderboard-link", "/pages/team/leaderboard"],
  ["unilevel", ".nx-team-royalty-network-link", "/pages/team/unilevel"],
  ["binary", ".nx-team-binary-link", "/pages/team/binary"],
  ["leadership-pool", ".nx-team-leadership-pool-link", "/pages/team/leadership-pool"],
  ["commissions", ".nx-team-commissions-link", "/pages/team/commissions"],
  ["quota", ".nx-team-quota-link", "/pages/team/quota"],
  ["agent", ".nx-team-agent-link", "/pages/team/agent"],
  ["network", ".nx-team-network-link", "/pages/team/network"],
  ["tree", ".nx-team-tree-link", "/pages/team/tree"],
];

const allRoutes = [
  ...routeClicks.map(([, , route]) => route),
  "/pages/team/rank-how",
  "/pages/team/unilevel-how",
  "/pages/team/binary-how",
  "/pages/team/commissions-how",
  "/pages/team/leadership-pool-how",
];

await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const visualMatrix = [];

function hashRoute(page) {
  return new URL(page.url()).hash.replace(/^#/, "").split("?")[0];
}

function fingerprint(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function installErrorCapture(page, runtime) {
  page.on("pageerror", (error) => runtime.pageErrors.push(error.message));
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (pathname === "/api/app/team/network"
        || pathname === "/api/team/rank"
        || pathname === "/api/app/referral-rewards") {
      runtime.authorityReadPromises.push(response.json().then((body) => ({
        status: response.status(),
        path: pathname,
        body,
      })).catch(() => null));
    }
    if (!pathname.startsWith("/api/") || response.status() < 400) return;
    runtime.failedResponseReads.push(response.json().then((body) => ({
      status: response.status(),
      method: response.request().method(),
      path: pathname,
      message: typeof body?.message === "string" ? body.message : "",
    })).catch(() => ({
      status: response.status(), method: response.request().method(), path: pathname, message: "",
    })));
  });
}

async function login(page, account, runtime) {
  await page.goto(`${baseUrl}/?nx_device=off#/pages/login/login`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const phoneInput = page.locator(".lg-phone__in input");
  await phoneInput.waitFor({ state: "visible", timeout: 30_000 });
  const countryCode = account.phone.startsWith("+86") ? "+86" : "+1";
  const nationalPhone = account.phone.startsWith(countryCode) ? account.phone.slice(countryCode.length) : account.phone;
  if ((await page.locator(".lg-phone__cc-t").innerText()).trim() !== countryCode) {
    await page.locator(".lg-phone__cc").click();
    await page.locator(".cc-row").filter({ has: page.locator(".cc-row__code", { hasText: countryCode }) }).click();
  }
  await phoneInput.fill(nationalPhone);
  await page.locator('input[type="password"]').fill(account.password);
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("/auth/users/login") && response.request().method() === "POST", { timeout: 30_000 });
  await page.locator(".lg-cta").click();
  const response = await responsePromise;
  assert.equal(response.status(), 200, `${account.label}: login HTTP status`);
  const loginBody = await response.json();
  assert.equal(loginBody?.code, 0, `${account.label}: login envelope`);
  const loginUserId = Number(loginBody?.data?.user?.userId);
  assert.ok(Number.isSafeInteger(loginUserId) && loginUserId > 0, `${account.label}: login user identity`);
  const teamTab = page.locator(".nx-tab").filter({ hasText: /Team|团队|Nhóm/i });
  await page.waitForFunction(() => location.hash.includes("/pages/onboarding/terms") || document.querySelectorAll(".nx-tab").length > 0, undefined, { timeout: 30_000 });
  if (hashRoute(page) === "/pages/onboarding/terms") {
    try {
      await page.locator(".tos-cta").waitFor({ state: "visible", timeout: 20_000 });
    } catch (error) {
      const body = (await page.locator("body").innerText()).replace(/\+?\d[\d\s-]{5,}/g, "<PHONE>").slice(0, 1200);
      throw new Error(`${account.label}: legal terms gate did not become actionable; body=${JSON.stringify(body)}`, { cause: error });
    }
    await page.locator(".tos-cta").click();
    await page.waitForFunction(() => !location.hash.includes("/pages/onboarding/terms"), undefined, { timeout: 30_000 });
  }
  try {
    await teamTab.waitFor({ state: "visible", timeout: 30_000 });
  } catch (error) {
    const body = (await page.locator("body").innerText()).replace(/\+?\d[\d\s-]{5,}/g, "<PHONE>").slice(0, 1200);
    throw new Error(`${account.label}: post-login route ${hashRoute(page)} did not reach app tabs; body=${JSON.stringify(body)}`, { cause: error });
  }
  await teamTab.click();
  await page.locator(".nx-team-rank-link").waitFor({ state: "visible", timeout: 30_000 });
  assert.equal(hashRoute(page), TEAM_HOME, `${account.label}: team tab route`);
  await page.waitForFunction(() => (document.querySelector(".nx-team-rank-link")?.textContent || "").includes("V0"), undefined, { timeout: 20_000 });
  await page.waitForFunction(() => (document.querySelector(".nx-team-copy-code .font-mono-tabular")?.textContent || "").trim().length > 0,
    undefined, { timeout: 20_000 });
  await page.waitForTimeout(500);
  const authorityReads = (await Promise.all(runtime.authorityReadPromises)).filter(Boolean);
  const canonical = [];
  let referralCode = "";
  for (const response of authorityReads) {
    const body = response.body;
    assert.equal(response.status, 200, `${account.label}: ${response.path} HTTP status`);
    assert.equal(body?.code, 0, `${account.label}: ${response.path} envelope`);
    if (response.path === "/api/app/referral-rewards") {
      assert.equal(body?.data?.source, "ledger", `${account.label}: referral reward ledger authority`);
      assert.equal(body?.data?.sourceEnvironment, "PRODUCTION", `${account.label}: referral reward environment`);
      assert.equal(body?.data?.runId, null, `${account.label}: referral reward production scope`);
      referralCode = typeof body?.data?.referralCode === "string" ? body.data.referralCode.trim() : "";
      assert.ok(referralCode.length > 0, `${account.label}: canonical referral code`);
      canonical.push({
        path: response.path,
        sourceEnvironment: body.data.sourceEnvironment,
        source: body.data.source,
        runId: body.data.runId,
        referralFingerprint: fingerprint(referralCode),
      });
      continue;
    }
    assert.ok(typeof body?.data?.source === "string" && body.data.source.length > 0, `${account.label}: server authority source`);
    assert.equal(body?.data?.serverCanonical, true, `${account.label}: server canonical proof`);
    canonical.push({
      path: response.path,
      sourceEnvironment: body.data.sourceEnvironment,
      serverCanonical: body.data.serverCanonical,
      totalMembers: body.data.totalMembers,
      directCount: body.data.directMembers ?? body.data.directCount,
      extendedCount: body.data.totalMembers === undefined || body.data.directMembers === undefined
        ? body.data.extendedCount
        : body.data.totalMembers - body.data.directMembers,
      currentRank: body.data.rankCode ?? body.data.currentRank ?? body.data.vRank,
    });
  }
  const normalizedCanonical = [...new Map(canonical.map((entry) => [entry.path, entry])).values()]
    .sort((left, right) => left.path.localeCompare(right.path));
  assert.ok(normalizedCanonical.some((entry) => entry.path === "/api/app/team/network"), `${account.label}: canonical team network read`);
  assert.ok(normalizedCanonical.some((entry) => entry.path === "/api/team/rank"), `${account.label}: canonical V-Rank read`);
  assert.ok(normalizedCanonical.some((entry) => entry.path === "/api/app/referral-rewards"), `${account.label}: canonical referral reward read`);
  const visibleReferralCode = (await page.locator(".nx-team-copy-code .font-mono-tabular").innerText()).trim();
  assert.equal(visibleReferralCode, referralCode, `${account.label}: visible referral code must match server authority`);
  return { canonical: normalizedCanonical, loginUserId, referralCode };
}

async function returnHome(page) {
  if (hashRoute(page) === TEAM_HOME) return;
  const teamTab = page.locator(".nx-tab").filter({ hasText: /Team|团队|Nhóm/i });
  if (await teamTab.count()) {
    await teamTab.click();
  } else {
    await page.goBack({ waitUntil: "domcontentloaded" });
  }
  await page.locator(".nx-team-rank-link").waitFor({ state: "visible", timeout: 20_000 });
  assert.equal(hashRoute(page), TEAM_HOME, "team tab returns to canonical team home");
}

async function exerciseHomeButtons(page, accountLabel) {
  const clicked = [];
  await page.locator(".nx-team-copy-code").click();
  await page.waitForTimeout(150);
  clicked.push("copy-code");
  await page.locator(".nx-team-copy-link").click();
  await page.waitForTimeout(150);
  clicked.push("copy-link");

  await page.locator(".nx-team-share-poster").click();
  await page.locator(".ps-sheet").waitFor({ state: "visible", timeout: 20_000 });
  await page.locator(".ps-thumb").last().click();
  await page.locator(".ps-sw").click();
  await page.locator(".ps-head__x").click();
  await page.locator(".ps-sheet").waitFor({ state: "hidden" });
  clicked.push("poster-open-template-toggle-close");

  await page.locator(".nx-team-share-now").click();
  await page.locator(".ss-sheet").waitFor({ state: "visible", timeout: 10_000 });
  await page.locator(".ss-cancel").click();
  await page.locator(".ss-sheet").waitFor({ state: "hidden" });
  clicked.push("share-channel-open-close");

  for (const [name, selector, route] of routeClicks) {
    await returnHome(page);
    await page.locator(selector).click();
    await page.waitForFunction((expected) => location.hash.replace(/^#/, "").split("?")[0] === expected, route, { timeout: 20_000 });
    assert.equal(hashRoute(page), route, `${accountLabel}: ${name} click route`);
    await page.waitForFunction(() => (document.body?.innerText || "").trim().length > 30, undefined, { timeout: 20_000 });
    assert.ok((await page.locator("body").innerText()).trim().length > 30, `${accountLabel}: ${name} page renders content`);
    clicked.push(name);
  }
  return clicked;
}

try {
  for (let index = 0; index < accounts.length; index += 1) {
    const account = accounts[index];
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const runtime = { pageErrors: [], failedResponseReads: [], authorityReadPromises: [] };
    installErrorCapture(page, runtime);

    try {
      const firstIdentity = await login(page, account, runtime);
      const clicked = index === 0
        ? await exerciseHomeButtons(page, account.label)
        : ["team-tab", "independent-login-state"];

      if (index === 0) {
        const matrixDir = path.join(evidenceDir, "ui-5173-5174-route-matrix");
        await mkdir(matrixDir, { recursive: true });
        const referencePage = await context.newPage();
        for (const route of allRoutes) {
          await page.goto(`${baseUrl}/?nx_device=off#${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
          await page.waitForFunction(() => (document.body?.innerText || "").trim().length > 30, undefined, { timeout: 20_000 });
          assert.equal(hashRoute(page), route, `${account.label}: direct route ${route}`);
          assert.ok((await page.locator("body").innerText()).trim().length > 30, `${account.label}: ${route} direct render`);
          if (route === "/pages/team/tree") {
            await page.getByText(/Genealogy|族谱|Gia phả/i).first().waitFor({ state: "visible", timeout: 20_000 });
            await page.locator(".grid.grid-cols-2").first().waitFor({ state: "visible", timeout: 20_000 });
          }
          await page.waitForTimeout(700);
          const slug = route.replace(/^\/pages\/team\//, "").replaceAll("/", "-");
          const formalScreenshot = `5173-${slug}.png`;
          const referenceScreenshot = `5174-${slug}.png`;
          await page.screenshot({ path: path.join(matrixDir, formalScreenshot), fullPage: true });
          await referencePage.goto(`${referenceBaseUrl}/?nx_device=off#${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
          await referencePage.waitForFunction(() => (document.body?.innerText || "").trim().length > 30, undefined, { timeout: 20_000 });
          assert.equal(hashRoute(referencePage), route, `5174 reference direct route ${route}`);
          await referencePage.screenshot({ path: path.join(matrixDir, referenceScreenshot), fullPage: true });
          visualMatrix.push({ route, formalScreenshot, referenceScreenshot, dataAuthority: "5173 server / 5174 UI reference only" });
        }
        await referencePage.close();
        await writeFile(path.join(evidenceDir, "ui-5173-5174-route-matrix.json"), `${JSON.stringify({
          result: "PASS",
          comparisonScope: "route-by-route visual evidence; no mock data equality assertion",
          viewport: { width: 390, height: 844 },
          routeCount: visualMatrix.length,
          routes: visualMatrix,
          generatedAt: new Date().toISOString(),
        }, null, 2)}\n`, "utf8");
        await page.goto(`${baseUrl}/?nx_device=off#${TEAM_HOME}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.locator(".nx-team-rank-link").waitFor({ state: "visible" });
        await page.screenshot({ path: path.join(evidenceDir, "ui-5173-team-full-flow.png"), fullPage: true });

        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.querySelector(".lg-phone__in input")
          || document.querySelector(".nx-tab")
          || location.hash.includes("/pages/onboarding/terms"), undefined, { timeout: 30_000 });
        if (await page.locator(".lg-phone__in input").count()) {
          runtime.authorityReadPromises = [];
          await login(page, account, runtime);
          clicked.push("refresh-visible-relogin-team-readback");
        } else {
          if (hashRoute(page) === "/pages/onboarding/terms") {
            await page.locator(".tos-cta").click();
            await page.waitForFunction(() => !location.hash.includes("/pages/onboarding/terms"), undefined, { timeout: 30_000 });
          }
          await returnHome(page);
          clicked.push("refresh-server-session-team-readback");
        }
        assert.equal(hashRoute(page), TEAM_HOME, "refresh must recover to Team");

        await context.clearCookies();
        await page.evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        });
        runtime.authorityReadPromises = [];
        const reloginIdentity = await login(page, account, runtime);
        assert.equal(reloginIdentity.loginUserId, firstIdentity.loginUserId, "explicit relogin must restore the same server user");
        assert.equal(reloginIdentity.referralCode, firstIdentity.referralCode, "explicit relogin must restore the same referral code");
        assert.deepEqual(reloginIdentity.canonical, firstIdentity.canonical, "explicit relogin must restore the same canonical team reads");
        clicked.push("explicit-visible-relogin-team-readback");
        assert.equal(hashRoute(page), TEAM_HOME, "explicit visible relogin must recover to Team");
      }

      const failures = await Promise.all(runtime.failedResponseReads);
      const expectedHolds = failures.filter((entry) =>
        (entry.status === 503 && (
          entry.path === "/api/app/team/insights/leadership-pool"
          || entry.path === "/api/config/leadership-pool"
        ))
        || (entry.status === 409 && entry.path === "/api/share/event" && entry.message === "QUEST_NOT_CONFIGURED"));
      const unexpectedFailures = failures.filter((entry) => !expectedHolds.includes(entry));
      const pageErrors = runtime.pageErrors.filter((message) => message !== "Object");
      assert.deepEqual(pageErrors, [], `${account.label}: page errors`);
      assert.deepEqual(unexpectedFailures, [], `${account.label}: unexpected API failures`);

      results.push({
        label: account.label,
        result: "PASS",
        contextIsolation: true,
        identityFingerprint: fingerprint(firstIdentity.loginUserId),
        referralFingerprint: fingerprint(firstIdentity.referralCode),
        visibleReferralMatchesServer: true,
        canonicalReads: firstIdentity.canonical,
        clicked,
        expectedHolds,
        pageErrors,
        unexpectedFailures,
      });
    } finally {
      await context.close();
    }
  }

  assert.equal(new Set(results.map((item) => item.identityFingerprint)).size, accounts.length,
    "all five browser contexts must resolve to distinct server user identities");
  assert.equal(new Set(results.map((item) => item.referralFingerprint)).size, accounts.length,
    "all five browser contexts must resolve to distinct server referral codes");

  await writeFile(path.join(evidenceDir, "ui-5173-team-full-flow.json"), `${JSON.stringify({
    result: "PASS",
    executedAt: new Date().toISOString(),
    baseUrl,
    accountCount: results.length,
    credentialsPersisted: false,
    crossAccountIsolation: {
      distinctServerIdentities: results.length,
      distinctServerReferralCodes: results.length,
      rawIdentityOrReferralValuesPersisted: false,
    },
    visualReferenceMatrix: {
      referenceBaseUrl,
      routeCount: visualMatrix.length,
      evidence: "ui-5173-5174-route-matrix.json",
    },
    accountResults: results,
  }, null, 2)}\n`, "utf8");
  console.log(`TEAM-FULL-FLOW PASS — ${results.length} isolated contexts; ${routeClicks.length} visible home links; ${allRoutes.length} team routes; refresh and relogin`);
} catch (error) {
  await writeFile(path.join(evidenceDir, "ui-5173-team-full-flow-failure.json"), `${JSON.stringify({
    result: "FAIL",
    executedAt: new Date().toISOString(),
    completedAccounts: results.map((item) => item.label),
    error: error instanceof Error ? error.message : String(error),
  }, null, 2)}\n`, "utf8");
  throw error;
} finally {
  await browser.close();
}
