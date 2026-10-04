#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

const base = process.env.UNI_BASE_URL ?? "http://127.0.0.1:5173";
const screenshot = process.env.APP_HOME_SCREENSHOT ?? "D:/workspace/bug-pic/app-home-final-live.png";
const resultPath = process.env.APP_HOME_E2E_RESULT ?? "D:/workspace/bug-pic/app-home-final-live.json";
const expectedRunId = process.env.APP_HOME_EXPECTED_RUN_ID?.trim() ?? "";
const candidateTree = process.env.APP_HOME_CANDIDATE_TREE?.trim() ?? "";
const backendClasses = process.env.APP_HOME_BACKEND_CLASSES?.trim()
  ?? "D:/workspace/nexion-backend/target/classes";
const backendCandidateResources = [
  "ffdd/opsconsole/home/application/AppHomeOverviewService.class",
  "ffdd/opsconsole/home/mapper/AppHomeOverviewMapper.class",
  "ffdd/opsconsole/device/application/AppNetworkRankService.class",
  "ffdd/opsconsole/device/mapper/AppNetworkRankMapper.class",
  "ffdd/opsconsole/device/application/AppTaskAssignmentService.class",
  "ffdd/opsconsole/device/mapper/AppTaskAssignmentMapper.class",
];
const backendCandidateHash = createHash("sha256");
for (const resource of backendCandidateResources) {
  backendCandidateHash.update(resource, "utf8");
  backendCandidateHash.update(Buffer.from([0]));
  backendCandidateHash.update(await readFile(resolve(backendClasses, resource)));
}
const backendCandidateId = backendCandidateHash.digest("hex");
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{7,95}$/.test(expectedRunId)) {
  throw new Error("APP_HOME_EXPECTED_RUN_ID_REQUIRED");
}
if (!/^[0-9a-f]{40,64}$/.test(candidateTree)) throw new Error("APP_HOME_CANDIDATE_TREE_REQUIRED");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const responses = [];
const consoleErrors = [];
const pageErrors = [];
let homeOverviewPayload = null;
let networkRankPayload = null;
let networkRankStatus = null;

page.on("response", async (response) => {
  const url = response.url();
  if ([
    "/api/config/market/", "/api/content/trust/", "/api/store/catalog",
    "/api/app/home/overview", "/api/app/network/rank", "/api/config/platform", "/auth/users/oauth/",
  ].some((path) => url.includes(path))) {
    responses.push({ url, status: response.status() });
    if (url.includes("/api/app/home/overview") && response.status() === 200) {
      homeOverviewPayload = await response.json().catch(() => null);
    }
    if (url.includes("/api/app/network/rank")) {
      if (response.status() === 200) networkRankPayload = await response.json().catch(() => null);
      if (networkRankStatus !== 200) networkRankStatus = response.status();
    }
  }
});
page.on("console", (message) => {
  if (message.type() === "error" && !/Failed to load resource/i.test(message.text())) {
    consoleErrors.push(message.text());
  }
});
page.on("pageerror", (error) => pageErrors.push(error.message));

try {
  await page.goto(`${base}/?nx_device_inner=1#/pages/login/login`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.getByText("Passkey", { exact: true }).click({ timeout: 15_000 });
  await page.waitForTimeout(1_500);
  // The acceptance account may still require the legal-terms screen. The
  // server session already exists after Passkey, so visit Home directly to
  // verify this task without changing the account's legal acceptance state.
  await page.evaluate(() => { location.hash = "#/pages/index/index"; });
  await page.waitForTimeout(5_000);

  // Promotions can open sequentially after the home data resolves. Dismiss
  // every non-mutating overlay so the screenshot proves the home cards rather
  // than a voucher/trial modal; never trigger a claim CTA.
  for (let attempt = 0; attempt < 16; attempt += 1) {
    for (const selector of [".tcs-dismiss", ".vcs-dismiss", ".tcs-close", ".vcs-close"]) {
      const dismiss = page.locator(selector);
      if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
    }
    const milestone = page.locator(".ms-overlay");
    if (await milestone.isVisible().catch(() => false)) {
      await milestone.click({ position: { x: 5, y: 5 } });
    }
    await page.waitForTimeout(250);
  }
  const observationConfirm = page.getByText("确定", { exact: true }).last();
  if (await observationConfirm.isVisible().catch(() => false)) await observationConfirm.click();

  const scroller = page.locator(".nx-scroll");
  if (await scroller.count() === 0) {
    const diagnostic = {
      url: page.url(),
      body: (await page.locator("body").innerText()).slice(0, 2_000),
      responses,
      consoleErrors,
      pageErrors,
    };
    throw new Error(`APP_HOME_NOT_REACHED ${JSON.stringify(diagnostic)}`);
  }
  await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await page.waitForTimeout(1_200);
  const body = await page.locator("body").innerText();
  const livePayloads = await page.evaluate(async () => {
    const paths = {
      platform: "/api/config/platform",
      nex: "/api/config/market/nex",
      trust: "/api/content/trust/sections/current",
    };
    return Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) => {
      const response = await fetch(path);
      return [key, { status: response.status, body: await response.json() }];
    })));
  });
  const platformPayload = livePayloads.platform;
  const publicStats = platformPayload.body?.data?.publicStats;
  const nexMarket = livePayloads.nex.body?.data;
  const trustPayload = livePayloads.trust.body?.data;
  const trustSections = trustPayload?.sections ?? [];
  const networkRank = networkRankPayload?.data;
  const trustFields = Object.fromEntries(trustSections.flatMap((section) =>
    (section.fields ?? []).map((field) => [field.key, field.value])));
  const dailyUsdtPerDevice = livePayloads.platform.body?.data?.computerCompute?.yieldEstimate
    ?.find((row) => row.key === "dailyUsdtPerBaseline")?.value;
  const homeOverview = homeOverviewPayload?.data;
  const networkPulseText = await page.locator('[data-home-section="network-pulse"]').innerText();
  const onGridText = await page.locator('[data-home-section="on-grid"]').innerText();
  const ledgerText = await page.locator('[data-home-section="earnings-ledger"]').innerText();
  const computeMarketText = await page.locator('[data-home-section="compute-market"]').innerText();
  const ledgerMode = homeOverview?.earningsLedgerMode;
  const ledgerRows = homeOverview?.earningsLedger ?? [];
  const ledgerSemanticsHonest = ledgerMode === "SETTLED"
    ? ledgerRows.every((row) => row.synthetic === false)
    : ledgerMode === "SANDBOX_QUOTE_EXAMPLES"
      && ledgerRows.every((row) => row.synthetic === true)
      && /不入账|not credited|không ghi có/i.test(ledgerText);
  // Keep the visual artifact centered on the three cards repaired by this
  // task; the JSON separately proves the lower trust/product sections.
  await page.locator('[data-home-section="on-grid"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: screenshot, fullPage: true });

  const nexMarketLink = page.locator('[data-home-action="nex-market-link"]');
  await nexMarketLink.focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/#\/pages\/market\/market/, { timeout: 10_000 });
  const keyboardLink = /#\/pages\/market\/market/.test(page.url());
  await page.evaluate(() => { location.hash = "#/pages/index/index"; });
  await page.waitForURL(/#\/pages\/index\/index/, { timeout: 10_000 });

  const checks = {
    networkPulse: /网络脉搏|Network pulse|Nhịp mạng/.test(body)
      && body.includes(Number(publicStats?.values?.fleetDevices).toLocaleString())
      && /1\.4\dM/.test(body)
      && !/更新中|Updating|Đang cập nhật|重试|Retry|Thử lại/.test(networkPulseText),
    rankProvenance: networkRankStatus === 200
      && networkRank?.serverCanonical === true
      && networkRank?.source === "nx_user_device"
      && networkRank?.sourceEnvironment === "SANDBOX"
      && networkRank?.runId === expectedRunId,
    platformProvenance: platformPayload.status === 200
      && publicStats?.serverCanonical === true
      && publicStats?.sourceEnvironment === "SANDBOX"
      && publicStats?.runId === expectedRunId,
    marketProvenance: livePayloads.nex.status === 200
      && nexMarket?.serverCanonical === true
      && nexMarket?.sourceEnvironment === "SANDBOX"
      && nexMarket?.runId === expectedRunId,
    productTrust: /商品信任资料|Product trust profile|Hồ sơ tin cậy sản phẩm/.test(body)
      && body.includes("StellarBox Pro"),
    trustCms: /算力需求支持的 NEX|Demand-backed NEX/.test(body) && body.includes("$128.4M"),
    trustProvenance: livePayloads.trust.status === 200
      && trustPayload?.serverCanonical === true
      && trustPayload?.source === "mock"
      && trustPayload?.sourceEnvironment === "SANDBOX"
      && trustPayload?.runId === expectedRunId,
    onGridLive: !/更新中|Updating|Đang cập nhật|重试|Retry|Thử lại/.test(onGridText)
      && onGridText.includes(Number(homeOverview?.onGrid?.activeDevices).toLocaleString())
      && /\+\$0\.\d+\/sec/.test(onGridText),
    earningsLedger: await page.locator('[data-home-ledger-row="true"]').count() >= 5
      && !/暂无|No earnings|Chưa có/.test(ledgerText)
      && ledgerSemanticsHonest,
    computeMarket: await page.locator('[data-home-market-row="true"]').count() >= 6
      && !/暂不可用|Unavailable|unavailable|không khả dụng|重试|Retry|Thử lại/.test(computeMarketText),
    homeProvenance: homeOverview?.serverCanonical === true
      && homeOverview?.sourceEnvironment === "SANDBOX"
      && homeOverview?.runId === expectedRunId
      && homeOverview?.serverCandidateId === backendCandidateId
      && homeOverview?.source === "server:sandbox-run-projection:nx_config_item,nx_admin_device_task,nx_product",
    warrantyIsNotInvented: /待后台配置|Not configured|Chưa cấu hình/.test(body),
    keyboardLink,
    endpointStatuses: livePayloads.platform.status === 200
      && livePayloads.trust.status === 200
      && networkRankStatus === 200
      && responses.some(({ url, status }) => url.includes("/api/store/catalog") && status === 200)
      && responses.some(({ url, status }) => url.includes("/api/app/home/overview") && status === 200),
  };
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  const result = {
    executedAt: new Date().toISOString(),
    candidateTree,
    backendCandidateId,
    url: page.url(),
    checks,
    publicStats: {
      fleetDevices: publicStats?.values?.fleetDevices,
      onlineRatePct: publicStats?.values?.onlineRatePct,
      onlineJitter: publicStats?.values?.onlineJitter,
      registeredUsersBase: publicStats?.values?.registeredUsersBase,
      registeredUsersMonthlyGrowthPct: publicStats?.values?.registeredUsersMonthlyGrowthPct,
      virtualUserCount: publicStats?.values?.virtualUserCount,
      publishedDailyUsdtPerDevice: dailyUsdtPerDevice,
      serverCanonical: publicStats?.serverCanonical,
      sourceEnvironment: publicStats?.sourceEnvironment,
      runId: publicStats?.runId,
    },
    market: {
      nexRunId: nexMarket?.runId,
      nexCurrentPrice: nexMarket?.currentPrice,
      nexCostBasis: nexMarket?.costBasis,
      nexSparkline: nexMarket?.sparkline,
    },
    trust: {
      serverCanonical: trustPayload?.serverCanonical,
      source: trustPayload?.source,
      sourceEnvironment: trustPayload?.sourceEnvironment,
      runId: trustPayload?.runId,
      sectionKeys: trustSections.map((section) => section.sectionKey),
      tvlOnChain: trustFields.tvlOnChain,
      mrrValue: trustFields.mrrValue,
      activeAccountsValue: trustFields.activeAccountsValue,
      devicesOnlineValue: trustFields.devicesOnlineValue,
      payoutsProcessedValue: trustFields.payoutsProcessedValue,
      nexNarrativeZh: trustFields["hero.zh"],
    },
    networkRank: {
      status: networkRankStatus,
      serverCanonical: networkRank?.serverCanonical,
      source: networkRank?.source,
      sourceEnvironment: networkRank?.sourceEnvironment,
      runId: networkRank?.runId,
      currentRank: networkRank?.currentRank,
      snapshotAvailable: networkRank?.snapshotAvailable,
    },
    home: {
      runId: homeOverview?.runId,
      source: homeOverview?.source,
      serverCandidateId: homeOverview?.serverCandidateId,
      activeDevices: homeOverview?.onGrid?.activeDevices,
      activeJobs: homeOverview?.onGrid?.activeJobs,
      perSecUsdt: homeOverview?.onGrid?.perSecUsdt,
      earningsLedgerMode: ledgerMode,
      earningsLedgerRows: homeOverview?.earningsLedger?.length,
      earningsLedgerSyntheticRows: ledgerRows.filter((row) => row.synthetic === true).length,
      earningsLedgerDisclaimer: /不入账|not credited|không ghi có/i.test(ledgerText),
      workloadRows: homeOverview?.marketBoard?.workloads?.length,
      deviceRankingRows: homeOverview?.marketBoard?.deviceRankings?.length,
    },
    responses,
    coverageScope: "authenticated-home-data-only",
    consoleErrors,
    pageErrors,
    screenshot,
  };
  await mkdir(dirname(resultPath), { recursive: true });
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
  if (failures.length || consoleErrors.length || pageErrors.length) {
    throw new Error(`APP_HOME_LIVE_E2E_FAILED:${[...failures, ...consoleErrors, ...pageErrors].join("|")}`);
  }
} finally {
  await browser.close();
}
