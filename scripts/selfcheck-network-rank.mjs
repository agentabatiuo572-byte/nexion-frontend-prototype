#!/usr/bin/env node
// 首页「你的排名」派生的行为门(规格 FEAT-HOME02)— node 直跑:
//   node scripts/selfcheck-network-rank.mjs
//
// 守的是规格里三条**对用户的承诺**,不是实现细节:
//   ① 加算力,名次只会前进或持平,**永不倒退**;
//   ② 零算力**不编造名次**(「未上榜」与「算不出来」是两种状态,不许合并);
//   ③ 同输入必同输出(**禁随机数参与**),多次刷新不跳动。
//
// 🔴 ① 的地基是分位表的单调性 —— 所以「拒收非单调表」不是洁癖:表一旦非单调,
//   承诺 ① 当场失效而界面毫无察觉(名次会随算力上升往后掉)。本门对这条做了红测。
//
// 方法:用 esbuild 载**真模块**跑真函数,不复制一份实现来测(复制品测不出正主的回归)。
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { atAliasResolver } from "./lib/at-alias.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, "src");

const bundle = await build({
  stdin: {
    contents: `export { computeRank, percentileForTops, isValidPercentileTable } from "@/lib/network-rank";`,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  plugins: [{ name: "alias", setup(b) { b.onResolve({ filter: /^@\// }, atAliasResolver(SRC, "selfcheck-network-rank")); } }],
});
const { computeRank, percentileForTops, isValidPercentileTable } = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text, "utf8").toString("base64")
);

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

console.log("selfcheck-network-rank — 排名派生的三条用户承诺");

const TABLE = [
  { tops: 5, cumPct: 20 },
  { tops: 20, cumPct: 55 },
  { tops: 60, cumPct: 82 },
  { tops: 150, cumPct: 96 },
];
const POP = { realPopulation: 8000, virtualPopulation: 12000 };
const rankOf = (tops, table = TABLE) => computeRank({ myTotalHashrate: tops, table, ...POP });

// ── ① 单调性:算力升 → 名次不倒退 ───────────────────────────────────────────
{
  // 取一串覆盖全表(含表下、档内、跨档、表上)的算力值,逐对比较。
  const samples = [0.5, 1, 3, 5, 8, 12, 20, 21, 45, 60, 61, 99, 150, 151, 400, 5000];
  let violations = [];
  let prevRank = Infinity;
  for (const tops of samples) {
    const r = rankOf(tops);
    if (r.kind !== "ranked") { violations.push(`${tops} TOPS 竟然不是 ranked(${r.kind})`); continue; }
    if (r.rank > prevRank) violations.push(`${tops} TOPS → 第 ${r.rank} 名,比上一档的第 ${prevRank} 名更差`);
    prevRank = r.rank;
  }
  check(`🔴 ① 加算力名次永不倒退(${samples.length} 个采样点逐对比较)`, violations.length === 0, violations.slice(0, 3).join(" | "));
}

// ── ② 零算力不编造名次;两种「没名次」不合并 ──────────────────────────────
{
  check(`🔴 ② 零算力 = unranked(未上榜),不是第 N 名`, rankOf(0).kind === "unranked", JSON.stringify(rankOf(0)));
  check(`② 负算力同样按未上榜处理`, rankOf(-5).kind === "unranked", JSON.stringify(rankOf(-5)));
  const broken = computeRank({ myTotalHashrate: 30, table: [{ tops: 5, cumPct: 60 }, { tops: 20, cumPct: 30 }], ...POP });
  check(`🔴 ② 分位表非单调 = unavailable(与 unranked **不同的**状态)`, broken.kind === "unavailable", JSON.stringify(broken));
  check(`② unranked 与 unavailable 确实是两个值(合并了这条就废)`,
    rankOf(0).kind !== broken.kind, `两者都是 ${broken.kind}`);
}

// ── ③ 确定性:同输入必同输出(禁随机数参与)───────────────────────────────
{
  const runs = Array.from({ length: 50 }, () => JSON.stringify(rankOf(37)));
  check(`🔴 ③ 同输入跑 50 次结果完全一致(禁随机)`, new Set(runs).size === 1, `出现 ${new Set(runs).size} 种结果`);
}

// ── ④ 表上封顶:超高算力不给出「第 1 名」这类不可信结果(规格 异常5)────────
{
  const top = rankOf(1e9);
  const atTop = rankOf(150);
  check(`🔴 ④ 算力远超最高档时封顶,不外推`, top.kind === "ranked" && atTop.kind === "ranked" && top.rank === atTop.rank,
    `1e9 → ${JSON.stringify(top)} · 150 → ${JSON.stringify(atTop)}`);
  // 最高档 cumPct=96 → 名次 ≈ 0.04×20000+1 = 801,**不该是 1**
  check(`④ 封顶后名次仍 > 1(表内最优档只到 96%,给不出第 1 名)`, top.kind === "ranked" && top.rank > 1, JSON.stringify(top));
}

// ── ⑤ 表校验:各条非法形态逐个隔离(不靠一条红掩护其余)──────────────────
{
  const cases = [
    ["少于 2 档", [{ tops: 5, cumPct: 20 }]],
    ["tops 非升序", [{ tops: 20, cumPct: 20 }, { tops: 5, cumPct: 50 }]],
    ["cumPct 递减", [{ tops: 5, cumPct: 50 }, { tops: 20, cumPct: 20 }]],
    ["cumPct > 100", [{ tops: 5, cumPct: 20 }, { tops: 20, cumPct: 120 }]],
    ["负 tops", [{ tops: -1, cumPct: 20 }, { tops: 20, cumPct: 50 }]],
    ["非数值", [{ tops: 5, cumPct: "20" }, { tops: 20, cumPct: 50 }]],
    ["空表", []],
    ["null", null],
  ];
  for (const [label, table] of cases) {
    check(`⑤ 非法表被拒:${label}`, isValidPercentileTable(table) === false, "竟然判为合法");
  }
  check(`⑤ 合法表被接受(判据不是恒 false)`, isValidPercentileTable(TABLE) === true, "合法表也被拒 = 判据恒 false");
}

// ── 红测自证:判据不空转 ────────────────────────────────────────────────────
{
  // 把单调性判据喂一组**故意倒退**的名次,它必须报违例。
  let violations = 0;
  let prevRank = Infinity;
  for (const rank of [900, 800, 850, 700]) { // 850 比 800 差 = 倒退
    if (rank > prevRank) violations++;
    prevRank = rank;
  }
  check(`红测自证:给单调性判据喂倒退序列,必须报违例`, violations === 1, `报了 ${violations} 次`);
  // 百分位插值:表下方必须真的插值,不是直接返回首档值
  const below = percentileForTops(TABLE, 2.5);
  check(`红测自证:表下方走插值(2.5 TOPS 的百分位应 < 首档 20)`, below > 0 && below < 20, `得到 ${below}`);
}

console.log(`\n${pass} pass / ${fail} fail(样本:16 个算力采样点 · 8 种非法表 · 50 次确定性重跑 · 2 条判据红测自证)`);
process.exit(fail === 0 ? 0 : 1);
