// 提现幂等契约 —— 「同一笔钱只出一次」这条不变量的可运行判据(2026-08-11 独立审计 P0)。
//
// 分工:页面的接线形状由 selfcheck-withdraw-freeze.mjs 钉(键不在函数里现铸 / 发请求前落盘 /
// 失败按结果分层);本文件钉它接的那两个件**语义**对不对 —— 什么算「服务端已定局」,
// 以及未收口的尝试在落盘上活得下来。两道门缺一不可:形状对而语义反,或语义对而没接上,
// 都会重新长出「超时重试 = 建两张单」。
import assert from "node:assert/strict";
import { build } from "esbuild";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
async function load(relative) {
  const out = await build({ entryPoints: [path.join(root, relative)], bundle: true, write: false, format: "esm", platform: "node" });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
}

/** uni storage 的内存替身(H5 端它就是 localStorage)。 */
function installStorage() {
  const table = new Map();
  globalThis.uni = {
    getStorageSync: (k) => (table.has(k) ? table.get(k) : ""),
    setStorageSync: (k, v) => void table.set(k, v),
  };
  return table;
}

test("定局判据:只有服务端明确应答过的拒绝才算定局", async () => {
  const { isSettledRejection, isIdempotencyConflict, ApiError } = await load("src/api/errors.ts");
  const http = (status) => new ApiError({ kind: "http", message: `HTTP_${status}`, status });

  // 定局 = 确定没建单 ⇒ 可以退役幂等键。
  for (const settled of [
    new ApiError({ kind: "business", message: "DAILY_LIMIT_REACHED", code: 40001 }),
    new ApiError({ kind: "auth", message: "AUTH_REQUIRED", status: 401 }),
    http(400), http(403), http(404), http(422),
  ]) assert.equal(isSettledRejection(settled), true, settled.message);

  // 结果未知 ⇒ 键必须留着原样重放。408/425/429 都是 4xx,但语义是「我可能已经收到了」。
  for (const unknown of [
    new ApiError({ kind: "network", message: "NETWORK_UNAVAILABLE", retryable: true }),
    new ApiError({ kind: "network", message: "REQUEST_ABORTED" }),
    new ApiError({ kind: "protocol", message: "WITHDRAWAL_RESPONSE_INVALID" }), // 服务端已 200,单反而一定在
    new ApiError({ kind: "configuration", message: "REMOTE_API_DISABLED_IN_MOCK_MODE" }),
    http(408), http(409), http(425), http(429), http(500), http(503),
    new Error("客户端自己抛的意外"), // 非 ApiError 一律按最安全的一侧算
  ]) assert.equal(isSettledRejection(unknown), false, String(unknown.message));

  // 409 = 服务端这个键已有记录 ⇒ 首次请求确实落库了。
  assert.equal(isIdempotencyConflict(http(409)), true);
  assert.equal(isIdempotencyConflict(http(400)), false);
  assert.equal(isIdempotencyConflict(new ApiError({ kind: "business", message: "x", status: 409 })), false);
});

test("未收口的尝试:落盘、按账号分行、形状不全一律当没有", async () => {
  installStorage();
  const m = await load("src/lib/withdraw-attempt.ts");
  const attempt = {
    key: "withdrawal:abc",
    amount: 100,
    network: "USDT-TRC20",
    address: "TXxx",
    policyVersion: "P1",
    offset: true,
  };

  assert.equal(m.readWithdrawAttempt("u1"), null);
  m.rememberWithdrawAttempt("u1", attempt);
  assert.deepEqual(m.readWithdrawAttempt("u1"), attempt);
  assert.equal(m.readWithdrawAttempt("u2"), null, "别的账号不该看到 u1 的尝试");

  m.forgetWithdrawAttempt("u1");
  assert.equal(m.readWithdrawAttempt("u1"), null);

  // 半个 body 重放会撞「同 key 异 body → 409」,所以宁可当没有、重新铸键。
  for (const broken of [
    { ...attempt, key: "" },
    { ...attempt, amount: 0 },
    { ...attempt, network: "USDT-XXX" },
    { ...attempt, address: "" },
    { ...attempt, policyVersion: "" },
    { ...attempt, offset: undefined },
  ]) {
    m.rememberWithdrawAttempt("u3", broken);
    assert.equal(m.readWithdrawAttempt("u3"), null, JSON.stringify(broken));
  }

  assert.notEqual(m.newWithdrawKey(), m.newWithdrawKey(), "新键必须带随机熵");

  // 存储不可用 / 配额满:必须诚实回报失败,让调用方拒发 —— 静默吞掉就等于「没有重放保护还照发钱」。
  globalThis.uni.setStorageSync = () => { throw new Error("QUOTA_EXCEEDED"); };
  assert.equal(m.rememberWithdrawAttempt("u4", attempt), false);
});

test("超时重试复用同键同 body;服务端定局拒绝后才换新键", async () => {
  installStorage();
  const m = await load("src/lib/withdraw-attempt.ts");
  const { isSettledRejection, isIdempotencyConflict, ApiError } = await load("src/api/errors.ts");

  // 页面 handleSubmit 的键选取 + 失败处置(与 wallet-withdraw.vue 同一条规则;
  // 页面确实按这条规则接线由 selfcheck-withdraw-freeze.mjs 钉住)。
  const sent = [];
  function submit(account, live, outcome) {
    const pending = m.readWithdrawAttempt(account);
    const body = pending ?? { ...live, key: m.newWithdrawKey() };
    m.rememberWithdrawAttempt(account, body);
    sent.push(body);
    if (outcome === "ok" || isIdempotencyConflict(outcome) || isSettledRejection(outcome)) {
      m.forgetWithdrawAttempt(account);
    }
  }
  const live = { amount: 100, network: "USDT-TRC20", address: "TXxx", policyVersion: "P1", offset: true };

  // ① 超时(结果未知)→ 用户改了金额、费率也换了版本 → 重放仍是原键原 body。
  submit("u1", live, new ApiError({ kind: "network", message: "NETWORK_UNAVAILABLE" }));
  submit("u1", { ...live, amount: 50, policyVersion: "P2" }, "ok");
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1], sent[0], "结果未知后的重放必须与首次逐字节相同");

  // ② 成功已退役 → 用户合法地再提一笔同额同址 → 必须是新键(否则被服务端去重吞掉)。
  submit("u1", live, "ok");
  assert.notEqual(sent[2].key, sent[0].key);

  // ③ 服务端明确拒绝 → 键作废 → 下一笔新键。
  submit("u2", live, new ApiError({ kind: "business", message: "DAILY_LIMIT_REACHED" }));
  submit("u2", live, "ok");
  assert.notEqual(sent[4].key, sent[3].key);

  // ④ 409 → 首次确实落库了 → 键已用掉,退役,不再拿它重放。
  submit("u3", live, new ApiError({ kind: "http", message: "HTTP_409", status: 409 }));
  submit("u3", live, "ok");
  assert.notEqual(sent[6].key, sent[5].key);
});
