#!/usr/bin/env node
/**
 * DEV-ONLY 假后端 —— 只为让**提现全链路真的跑起来**。
 *   node scripts/dev-stub-backend.mjs [--port 8110]
 *
 * 🔴 为什么必须有它(2026-08-11 R3 结论,主人拍板 A):
 * 本仓没有 nexion-backend;而验证脚本要求的 mock 模式会让**所有接口 fail-closed**,
 * 于是提现页恒停在「费率更新中」,日限那道闸**从来没有在真页面上出现过**。
 * 后果不是「少验一项」,而是:三轮下来每一次对钱路径的修补都只能靠**读代码**验证,
 * 而「读代码验证」正是连续三轮失效的那件事 —— 我用字符串门代替行为门,
 * 不是偷懒,是没有能力跑那条路。这个文件就是把那条路打通。
 *
 * 🔴 它能回答三轮都答不上来的那个问题:**服务端到底建了几笔单、用的哪张幂等键。**
 * `GET /__stub/log` 返回收到的每一个请求(含 Idempotency-Key)与实际建单数 ——
 * 「超时重试会不会造出第二笔」从此是**可观测事实**,不是推理。
 *
 * ⚠️ 它不是 mock 数据源,不参与 verify 的 mock 模式;只在本地手动起,配 .env.local 指过来。
 * 契约以 src/api/*.ts 的解析器为准(它们比任何文档都严:字面量常量、四条费用等式、
 * 状态与路由闭集)—— 解析器改了这里就要跟着改,否则页面会拿到 protocol 错。
 */
import { createServer } from "node:http";

const portArg = process.argv.indexOf("--port");
const PORT = portArg > 0 ? Number(process.argv[portArg + 1]) : 8110;

/** 可注入的失败模式。用 POST /__stub/mode {"submit":"..."} 切换。 */
const state = {
  submit: "ok",           // ok | http504 | http500 | dropped | dailyLimit | protocolInvalid | slow
  dailyLimitCount: 2,
  withdrawable: 500,
  /** 幂等台账:key → 已建的单。服务端**真的**去重,这样「重试有没有出第二笔」才验得出来。 */
  byKey: new Map(),
  orders: [],
  log: [],
};

const envelope = (data, code = 0, message = "ok") => JSON.stringify({ code, message, data });
const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*",
    "access-control-allow-headers": "*", "access-control-allow-methods": "*", ...headers });
  res.end(body);
};

function policy() {
  // 字段与 src/api/withdrawal-api.ts 的 parsePolicy 逐条对齐(它比 PRD 严格,以它为准)
  return {
    minAmount: 20,
    dailyLimitCount: state.dailyLimitCount,
    balanceMaxRatio: 1,
    smallAmountThresholdUsd: 50,
    strongReviewThresholdUsdt: 1000,
    payoutSlaHours: 24,
    networkConfirmFeeUsd: { trc20: 1, bep20: 1, erc20: 5 },
    nexFeeOffsetRate: 0.5,
    policyVersion: "stub-v1",
    cooldownDays: 1,
    complianceHoldEnabled: false,
    withdrawalEnabled: true,
    enabledNetworks: ["USDT-TRC20", "USDT-BEP20", "USDT-ERC20"],
    currentPhase: "P1",
    currentMonth: 1,
    gateSource: "J1",
    source: "D5+H1",
  };
}

/** 平台日(UTC+7),与客户端 platformDayIndex 同一口径 —— 服务端日限按它算。 */
const platformDay = (ts) => Math.floor((ts + 7 * 3600 * 1000) / 86400000);

function buildOrder(amount, chain, key) {
  const now = Date.now();
  const seq = state.orders.length + 1;
  const networkFee = chain === "USDT-ERC20" ? 5 : 1;
  return {
    withdrawalNo: `WD-STUB-${String(seq).padStart(4, "0")}`,
    amount,
    chain,
    status: "SUBMITTED",
    holdUntil: new Date(now + 24 * 3600 * 1000).toISOString(),
    // 四条费用等式必须成立,否则 parseSubmission 抛 protocol(客户端比文档严)
    networkConfirmUsd: networkFee,
    networkFee,
    penaltyFee: 0,
    grossFee: networkFee,
    nexBurned: 0,
    feeWaived: 0,
    actualFee: networkFee,
    netReceive: amount - networkFee,
    policyVersion: "stub-v1",
    useNexFeeOffset: false,
    riskRoute: "fast-pass",
    idSource: "server",
    __createdAt: now,
    __idempotencyKey: key,
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  let body = "";
  for await (const chunk of req) body += chunk;

  if (req.method === "OPTIONS") return send(res, 204, "");

  // ── 控制面 ──────────────────────────────────────────────
  if (path === "/__stub/mode" && req.method === "POST") {
    Object.assign(state, JSON.parse(body || "{}"));
    return send(res, 200, JSON.stringify({ ok: true, submit: state.submit, dailyLimitCount: state.dailyLimitCount }));
  }
  if (path === "/__stub/log") {
    return send(res, 200, JSON.stringify({
      requests: state.log,
      orders: state.orders.map((o) => ({ no: o.withdrawalNo, key: o.__idempotencyKey, at: o.__createdAt })),
      // 🔴 这三个数就是三轮都答不上来的那个问题的答案
      orderCount: state.orders.length,
      distinctKeys: new Set(state.orders.map((o) => o.__idempotencyKey)).size,
      submitAttempts: state.log.filter((l) => l.path === "/api/withdrawals" && l.method === "POST").length,
    }, null, 1));
  }
  if (path === "/__stub/reset" && req.method === "POST") {
    state.byKey.clear(); state.orders.length = 0; state.log.length = 0; state.submit = "ok";
    return send(res, 200, JSON.stringify({ ok: true }));
  }

  const key = req.headers["idempotency-key"] || null;
  state.log.push({ method: req.method, path, key, at: Date.now() });

  // ── 会话面 ──────────────────────────────────────────────
  // 🔴 注意它**不在 /api 下**(客户端拼的是 `${baseUrl}/auth/users/refresh`)。
  // 提现页的每个请求都要 Authorization,没有 accessToken 时客户端会先来刷一次。
  if (path === "/auth/users/refresh" || path === "/auth/users/login") {
    return send(res, 200, envelope({
      accessToken: "stub-access-token",
      refreshToken: "stub-refresh-token",
      tokenType: "Bearer",
      user: { userId: 1001, countryCode: "VN", phone: "900000001", nickname: "stub" },
    }));
  }

  // ── 业务面 ──────────────────────────────────────────────
  if (path === "/api/withdrawals/policy") return send(res, 200, envelope(policy()));

  if (path === "/api/earnings/release-status") {
    return send(res, 200, envelope({
      buckets: { withdrawable: state.withdrawable, pending_review: 0, bonus_locked: 0 },
      assets: { USDT: { withdrawable: state.withdrawable, pending_review: 0, bonus_locked: 0 } },
      releaseMode: "attest_or_manual",
      attestedOnlineSeconds: 999999,
      requiredAttestationSeconds: 0,
      clusterRestricted: false,
      serverCanonical: true,
    }));
  }

  const withdrawalDetail = /^\/api\/withdrawals\/([^/]+)$/.exec(path);
  if (withdrawalDetail && req.method === "GET") {
    const order = state.orders.find((item) => item.withdrawalNo === decodeURIComponent(withdrawalDetail[1]));
    if (!order) return send(res, 404, envelope(null, 40400, "WITHDRAWAL_NOT_FOUND"));
    return send(res, 200, envelope({
      withdrawalNo: order.withdrawalNo,
      status: order.status,
      confirmedAt: null,
      terminalReason: null,
      retriable: null,
      nexRefunded: 0,
      nexRefundedAt: null,
    }));
  }

  if (path === "/api/payout-addresses" && req.method === "GET") {
    const iso = new Date(Date.now() - 30 * 86400000).toISOString();
    return send(res, 200, envelope({
      addresses: [{ network: "USDT-TRC20", address: "TXstub00000000000000000000000000001",
        status: "ACTIVE", effectiveAt: iso, createdAt: iso,
        nextChangeAllowedAt: new Date(Date.now() - 86400000).toISOString(), changePending: false }],
      serverCanonical: true,
      changeCooldownDays: 7,
      effectiveDelayHours: 24,
      inFlightWithdrawalBlocked: true,
    }));
  }

  if (path === "/api/withdrawals" && req.method === "POST") {
    // 🔴 幂等去重先于一切:同一张键必须返回**同一笔单**,这是「重试不该出第二笔」的服务端保证
    if (key && state.byKey.has(key)) return send(res, 200, envelope(state.byKey.get(key)));

    const payload = JSON.parse(body || "{}");

    // 🔴🔴 真正危险的那一档:**单已经建好了,响应才丢**。
    // 第一版我把 504 写成「建单前就返回」—— 于是服务端根本没建单,实验必然显示「没重复」,
    // 而那正是被测代码最需要被证伪的地方。harness 把被测侧做成天然安全 = 实验白做
    // (同 memory 里「优化必须在真实运行时里量」那族坑)。这几档必须**先建单再失败**。
    const failAfterCreate = ["createdThen504", "createdThenDrop", "createdThenSlow"].includes(state.submit);
    if (failAfterCreate) {
      const order = buildOrder(Number(payload.amount) || 0, payload.chain || "USDT-TRC20", key);
      state.orders.push(order);
      if (key) state.byKey.set(key, order);
      if (state.submit === "createdThenDrop") { req.socket.destroy(); return; }
      if (state.submit === "createdThenSlow") await new Promise((r) => setTimeout(r, 35000));
      return send(res, 504, envelope(null, 50400, "GATEWAY_TIMEOUT"));
    }

    switch (state.submit) {
      case "http504": return send(res, 504, envelope(null, 50400, "GATEWAY_TIMEOUT")); // 未建单就失败
      case "http500": return send(res, 500, envelope(null, 50000, "INTERNAL_ERROR"));
      case "dropped": req.socket.destroy(); return;           // 连接直接断:客户端得到 network 类
      case "dailyLimit": return send(res, 429, envelope(null, 42901, "WITHDRAWAL_DAILY_LIMIT_EXCEEDED"));
      case "protocolInvalid": return send(res, 200, envelope({ withdrawalNo: "WD-BAD", status: "WAT" }));
      case "slow": await new Promise((r) => setTimeout(r, 35000)); break; // 超过客户端 30s 超时
      default: break;
    }

    // 服务端自己的日限闸(真闸)——客户端预检只是省一次白跑
    const today = platformDay(Date.now());
    const usedToday = state.orders.filter((o) => platformDay(o.__createdAt) === today).length;
    if (state.dailyLimitCount > 0 && usedToday >= state.dailyLimitCount) {
      return send(res, 429, envelope(null, 42901, "WITHDRAWAL_DAILY_LIMIT_EXCEEDED"));
    }

    const order = buildOrder(Number(payload.amount) || 0, payload.chain || "USDT-TRC20", key);
    state.orders.push(order);
    if (key) state.byKey.set(key, order);
    return send(res, 200, envelope(order));
  }

  // 其余端点:与今天 remote 模式下的降级一致(404),不假装自己什么都有
  send(res, 404, envelope(null, 40400, "STUB_ENDPOINT_NOT_IMPLEMENTED"));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`dev-stub-backend 起在 http://127.0.0.1:${PORT}`);
  console.log(`  控制面:POST /__stub/mode {"submit":"http504"} · GET /__stub/log · POST /__stub/reset`);
  console.log(`  submit 可注入:ok | http504 | http500 | dropped | dailyLimit | protocolInvalid | slow`);
});
