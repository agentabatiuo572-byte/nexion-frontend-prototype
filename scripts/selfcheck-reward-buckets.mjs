#!/usr/bin/env node
// 奖励入桶(creditRewardBucketOnce)三路由行为门 — node 直跑:
//   node scripts/selfcheck-reward-buckets.mjs
//
// 背景(z1 判决包 B8,2026-08-10):c37e642 把客户端释放台账空壳化成恒 false,
// 而 creditRewardBucketInternal 对 held 两路由(pending_review / bonus_locked)拿
// 「台账写成功」当放行条件 —— mock 模式下风控标记账号的赠金/奖励入桶**无条件失败**
// (AUTH02 注册重试链实锤:重试永远打回「服务暂不可用」)。台账义务已让渡服务端,
// 客户端入桶不得再被死存根判死。
//
// 🔴 守的不变量(mock 语义):
//   ① 三条路由(withdrawable / pending_review / bonus_locked)首credit 必须成功,
//      且各自落对桶:withdrawable 进可提+总余额;held 两路由只进对应 held 桶,不动总余额。
//   ② 幂等:同 key 重放返回 true 且金额不重复入桶。
//   ③ no_issue 路由:返回 true 且零副作用。
//   ④ 非法金额(NaN / 负数)拒绝。
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { atAliasResolver } from "./lib/at-alias.mjs";
import { VUE_STUB_NXREF, runtimeStub } from "./lib/harness-stubs.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, "src");

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

const disk = new Map();
globalThis.uni = {
  getStorageSync(k) { const r = disk.get(k); return r === undefined ? "" : JSON.parse(r); },
  setStorageSync(k, v) { disk.set(k, JSON.stringify(v)); },
  removeStorageSync(k) { disk.delete(k); },
  getSystemInfoSync() { return { language: "en" }; },
};

const STUBS = {
  "pinia-stub": `const cache = new Map();
const unwrap = (v) => (v && typeof v === "object" && v.__nxRef === true);
export const defineStore = (id, setup) => () => {
  if (!cache.has(id)) cache.set(id, new Proxy(setup(), {
    get(t, k) { const v = Reflect.get(t, k); return unwrap(v) ? v.value : v; },
    set(t, k, val) { const v = Reflect.get(t, k); if (unwrap(v)) { v.value = val; return true; } return Reflect.set(t, k, val); },
  }));
  return cache.get(id);
};`,
  "vue-stub": VUE_STUB_NXREF,
  "runtime-stub": runtimeStub(root),
};
const out = await build({
  stdin: { contents: `export { useApp } from "@/store/app";`, resolveDir: root, loader: "ts" },
  bundle: true, write: false, format: "esm", platform: "neutral",
  define: { "import.meta.env.PROD": "false", "import.meta.env.DEV": "true", "import.meta.env.MODE": '"test"' },
  plugins: [{ name: "stubs", setup(b) {
    b.onResolve({ filter: /^pinia$/ }, () => ({ path: "pinia-stub", namespace: "stub" }));
    b.onResolve({ filter: /^vue$/ }, () => ({ path: "vue-stub", namespace: "stub" }));
    b.onResolve({ filter: /^@\/api\/runtime$/ }, () => ({ path: "runtime-stub", namespace: "stub" }));
    b.onResolve({ filter: /^@\// }, atAliasResolver(SRC, "selfcheck-reward-buckets"));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS[a.path], loader: "js" }));
  } }],
});
const { useApp } = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));

console.log("selfcheck-reward-buckets — 奖励入桶三路由 + 幂等(mock 语义,台账已让渡服务端)");

const app = useApp();
app.bindAccount("reward-buckets@nexgrid.test");
const snap = () => {
  const u = app.user;
  const b = u.earningBuckets ?? {};
  return {
    usdt: u.usdtBalance, nex: u.nexBalance,
    w: b.withdrawableUsdt ?? 0, p: b.pendingReviewUsdt ?? 0, l: b.bonusLockedUsdt ?? 0, ln: b.lockedNex ?? 0,
  };
};

// ① withdrawable:进可提 + 总余额
{
  const s0 = snap();
  const ok1 = app.creditRewardBucketOnce("z1-rb:w", "withdrawable", 5, 20);
  const s1 = snap();
  check("① withdrawable 首credit 成功", ok1 === true);
  check(`① 可提 +5 · 总余额 +5 · NEX +20(实测 w:${s0.w}→${s1.w} usdt:${s0.usdt}→${s1.usdt})`,
    s1.w === +(s0.w + 5).toFixed(2) && s1.usdt === +(s0.usdt + 5).toFixed(2) && s1.nex === +(s0.nex + 20).toFixed(2));
}
// ① pending_review:只进 held 桶,不动总余额 —— B8 的正靶
{
  const s0 = snap();
  const ok1 = app.creditRewardBucketOnce("z1-rb:p", "pending_review", 5, 20);
  const s1 = snap();
  check("① 🔴 pending_review 首credit 成功(B8:死存根不得判死风控标记账号的赠金)", ok1 === true);
  check(`① pending +5 · lockedNex +20 · 总余额不动(实测 p:${s0.p}→${s1.p} usdt:${s0.usdt}→${s1.usdt})`,
    s1.p === +(s0.p + 5).toFixed(2) && s1.ln === +(s0.ln + 20).toFixed(2) && s1.usdt === s0.usdt);
}
// ① bonus_locked 同理
{
  const s0 = snap();
  const ok1 = app.creditRewardBucketOnce("z1-rb:l", "bonus_locked", 3, 7);
  const s1 = snap();
  check("① 🔴 bonus_locked 首credit 成功", ok1 === true);
  check(`① bonusLocked +3 · 总余额不动(实测 l:${s0.l}→${s1.l})`,
    s1.l === +(s0.l + 3).toFixed(2) && s1.usdt === s0.usdt);
}
// ② 幂等重放
{
  const s0 = snap();
  const ok2 = app.creditRewardBucketOnce("z1-rb:p", "pending_review", 5, 20);
  const s1 = snap();
  check("② 同 key 重放返回 true 且不重复入桶", ok2 === true && s1.p === s0.p && s1.ln === s0.ln);
}
// ③ no_issue 零副作用
{
  const s0 = snap();
  const ok = app.creditRewardBucketOnce("z1-rb:n", "no_issue", 9, 9);
  const s1 = snap();
  check("③ no_issue 返回 true 且零副作用", ok === true && JSON.stringify(s0) === JSON.stringify(s1));
}
// ④ 非法金额拒绝
{
  check("④ NaN 金额拒绝", app.creditRewardBucketOnce("z1-rb:bad1", "withdrawable", NaN, 1) === false);
  check("④ 负数金额拒绝", app.creditRewardBucketOnce("z1-rb:bad2", "pending_review", -1, 1) === false);
}

console.log(`\n${pass} pass / ${fail} fail(样本:3 路由首credit + 幂等重放 + no_issue + 2 个非法金额靶,真 app store)`);
process.exit(fail === 0 ? 0 : 1);
