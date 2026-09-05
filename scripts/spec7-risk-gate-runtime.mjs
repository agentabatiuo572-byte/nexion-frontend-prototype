import { chromium } from "playwright";
import { collectAppConsoleErrors } from "./lib/console-origin-filter.mjs";

// SPEC-7 K1 上限两闸 runtime 哨兵：
//   C. 设备上限内注册放行 + gift 随风险桶(direct 开关生效)
//   A. maxAccountsPerDevice 注册硬闸:同设备第 3 号 manual_or_reject;阈值调大即放行
//   B. maxAccountsPerPaymentInstrument 超限升强维:异设备三号共用同一支付工具 → 入簇 +
//      payment-instrument-overuse 标记;正/逆序同结论，恰好等于阈值仍是弱维。
// 全部在真页面上下文跑真实 store 代码;registry 快照进/出还原,不污染 dev 环境。

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5173";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") collectAppConsoleErrors(errors, baseUrl)(msg);
});
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(`${baseUrl}/?nx_device=off#/pages/index/index`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => typeof window.uni !== "undefined" && document.querySelector("#app")?.children.length,
    null,
    { timeout: 20_000 },
  );

  const result = await page.evaluate(async () => {
    const REGISTRY_KEY = "nexgrid-risk-registry-v1";
    const failures = [];
    const assert = (condition, message) => {
      if (!condition) failures.push(message);
    };

    const identity = await import("/src/store/risk-identity.ts");
    const cluster = await import("/src/store/risk-cluster.ts");
    const configStore = await import("/src/store/config.ts");
    const { en } = await import("/src/i18n/messages/en.ts");
    const { zh } = await import("/src/i18n/messages/zh.ts");
    const cfg = configStore.useConfig().config;

    const snapshot = uni.getStorageSync(REGISTRY_KEY);
    const lockModeBefore = cfg.rewards.welcomeGift.lockMode;
    const maxDeviceBefore = cfg.riskCluster.maxAccountsPerDevice;
    const maxInstrumentBefore = cfg.riskCluster.maxAccountsPerPaymentInstrument;
    const pendingFromBefore = cfg.riskCluster.duplicateAccountPendingFrom;
    const ipCapBefore = cfg.riskCluster.maxSignupPerIp24h;
    const instrumentWeightBefore = cfg.riskScore.dimensionWeights.paymentInstrument;
    const weakThresholdBefore = cfg.riskScore.weakSignalClusterThreshold;

    try {
      assert(typeof en.wallet.riskReasons["payment-instrument-overuse"] === "string", "B: 英文超限原因缺少业务文案");
      assert(typeof zh.wallet.riskReasons["payment-instrument-overuse"] === "string", "B: 中文超限原因缺少业务文案");
      // 断言依赖的阈值显式设定，不依赖 seed 默认值。
      cfg.rewards.welcomeGift.lockMode = "risk_bucket";
      cfg.riskCluster.maxAccountsPerDevice = 2;
      cfg.riskCluster.maxAccountsPerPaymentInstrument = 2;
      cfg.riskCluster.duplicateAccountPendingFrom = 2;
      cfg.riskCluster.maxSignupPerIp24h = 3; // A 归因对照依赖 IP 阈 > 2
      cfg.riskScore.dimensionWeights.paymentInstrument = 0.5; // B 蓝测依赖弱维单独 < 阈
      cfg.riskScore.weakSignalClusterThreshold = 0.6;

      // ── C. 上限内放行 + gift 风险桶路由 ─────────────────────────────
      uni.setStorageSync(REGISTRY_KEY, { schema: 1, accounts: {} });
      identity.recordRegistration("gate-c1@sentinel", null); // 真路径落表: deviceHint = 本机
      const c = cluster.evaluateRegistration("gate-c2@sentinel");
      assert(c.gateRoute === "proceed", `C: 1 账号在册应放行,得 ${c.gateRoute}`);
      assert(c.cluster.slotIndexInCluster === 2, `C: 同设备新号应为簇内第 2 槽,得 ${c.cluster.slotIndexInCluster}`);
      assert(c.cluster.status === "watch", `C: 第 2 槽应 watch,得 ${c.cluster.status}`);
      assert(c.giftRoute === "pending_review", `C: risk_bucket 模式 watch 号 gift 应进待审桶,得 ${c.giftRoute}`);
      cfg.rewards.welcomeGift.lockMode = "direct";
      const cDirect = cluster.evaluateRegistration("gate-c2@sentinel");
      assert(cDirect.giftRoute === "withdrawable", `C: direct 模式 gift 应直入可提,得 ${cDirect.giftRoute}`);
      cfg.rewards.welcomeGift.lockMode = lockModeBefore;

      // ── A. 设备注册硬闸 ────────────────────────────────────────────
      identity.recordRegistration("gate-a2@sentinel", null); // 同设备第 2 条在册
      const a = cluster.evaluateRegistration("gate-a3@sentinel");
      assert(a.gateRoute === "manual_or_reject", `A: 同设备第 3 号应被拦,得 ${a.gateRoute}`);
      assert(identity.listRiskRecords().length === 2, `A: 被拦评估不得落表(仍 2 条),得 ${identity.listRiskRecords().length}`);
      cfg.riskCluster.maxAccountsPerDevice = 99; // 归因对照:只放宽设备阈值即放行
      const aRelaxed = cluster.evaluateRegistration("gate-a3@sentinel");
      assert(aRelaxed.gateRoute === "proceed", `A: 设备阈值放宽后应放行(IP 2<3 不拦),得 ${aRelaxed.gateRoute}`);
      // IP 闸正向对照：设备阈隔离在 99，IP 阈压到 2 → 拦。
      cfg.riskCluster.maxSignupPerIp24h = 2;
      const ipGate = cluster.evaluateRegistration("gate-a4@sentinel");
      assert(ipGate.gateRoute === "manual_or_reject", `A2: IP 阈 2 时同 IP 第 3 号应被拦,得 ${ipGate.gateRoute}`);
      cfg.riskCluster.maxSignupPerIp24h = 3;
      cfg.riskCluster.maxAccountsPerDevice = 2;

      // ── B. 支付工具超限升强维 ──────────────────────────────────────
      const sharedHash = identity.riskHash("USDT-TRC20:TSharedGateSentinel");
      const mk = (key, ordinal) => ({
        accountKey: key,
        deviceHint: `dev-${ordinal}-sentinel`,
        ipBucket: `ipb-${ordinal}-sentinel`,
        uaFingerprint: `ua-${ordinal}-sentinel`,
        sponsorId: null,
        registeredAt: Date.now() - ordinal * 48 * 3600 * 1000,
        withdrawAddresses: [],
        paymentInstruments: [{ hash: sharedHash, firstSeenAt: Date.now() - ordinal * 48 * 3600 * 1000 }],
        hasWithdrawn: false,
        attestedOnlineMs: 0,
      });
      uni.setStorageSync(REGISTRY_KEY, {
        schema: 1,
        accounts: {
          "gate-b1@sentinel": mk("gate-b1@sentinel", 3),
          "gate-b2@sentinel": mk("gate-b2@sentinel", 2),
          "gate-b3@sentinel": mk("gate-b3@sentinel", 1),
        },
      });
      const b = cluster.evaluateAccountCluster("gate-b1@sentinel");
      assert(b.accountCount === 3, `B: 超限工具应强维入簇(3 账号),得 ${b.accountCount}`);
      assert(b.reasons.includes("payment-instrument-overuse"), `B: 应带超限标记,得 ${JSON.stringify(b.reasons)}`);
      // 完整表顺序不得改变统计结论：BFS pool 先后顺序不是风险证据。
      uni.setStorageSync(REGISTRY_KEY, {
        schema: 1,
        accounts: {
          "gate-b3@sentinel": mk("gate-b3@sentinel", 1),
          "gate-b2@sentinel": mk("gate-b2@sentinel", 2),
          "gate-b1@sentinel": mk("gate-b1@sentinel", 3),
        },
      });
      const bReversed = cluster.evaluateAccountCluster("gate-b1@sentinel");
      assert(bReversed.accountCount === 3, `B: 记录反序后超限工具仍应强维入簇(3 账号),得 ${bReversed.accountCount}`);
      assert(bReversed.reasons.includes("payment-instrument-overuse"), `B: 记录反序后应带超限标记,得 ${JSON.stringify(bReversed.reasons)}`);
      // 蓝测：账号数刚好等于上限时仍是中维，0.5<0.6 不应单独入簇。
      cfg.riskCluster.maxAccountsPerPaymentInstrument = 3;
      const bAtCap = cluster.evaluateAccountCluster("gate-b1@sentinel");
      assert(bAtCap.accountCount === 1, `B: 账号数等于阈值时弱维不应入簇,得 ${bAtCap.accountCount}`);
      assert(!bAtCap.reasons.includes("payment-instrument-overuse"), "B: 账号数等于阈值时不应带超限标记");
    } finally {
      if (snapshot) uni.setStorageSync(REGISTRY_KEY, snapshot);
      else uni.removeStorageSync(REGISTRY_KEY);
      cfg.rewards.welcomeGift.lockMode = lockModeBefore;
      cfg.riskCluster.maxAccountsPerDevice = maxDeviceBefore;
      cfg.riskCluster.maxAccountsPerPaymentInstrument = maxInstrumentBefore;
      cfg.riskCluster.duplicateAccountPendingFrom = pendingFromBefore;
      cfg.riskCluster.maxSignupPerIp24h = ipCapBefore;
      cfg.riskScore.dimensionWeights.paymentInstrument = instrumentWeightBefore;
      cfg.riskScore.weakSignalClusterThreshold = weakThresholdBefore;
    }
    return failures;
  });

  if (result.length) {
    console.error(`SPEC-7 risk-gate runtime FAILED:\n${result.map((message) => `  - ${message}`).join("\n")}`);
    process.exit(1);
  }
  if (errors.length) {
    console.error(`SPEC-7 risk-gate runtime console errors:\n${errors.map((message) => `  - ${message}`).join("\n")}`);
    process.exit(1);
  }
  console.log(
    "SPEC-7 K1 gate runtime: device cap rejects 3rd signup (relax→proceed) · in-cap signup passes with gift→pending_review (direct→withdrawable) · overused instrument clusters + flags (order-invariant; at-cap→weak)",
  );
} finally {
  await browser.close();
}
