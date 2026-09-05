// 并集探针:证明「同档位逐字段合并(主线)」与「退款事实整对取大(包 z8)」两条修法
// 在合并后**同时**生效,而不是一条盖掉另一条。三格各自先证起点成立,再证结果。
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const js = ts.transpileModule(fs.readFileSync("src/store/account-cloud.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
const sandbox = { exports: {}, require, console, Date, Map, JSON, Math };
vm.runInNewContext(js, sandbox);
const { mergeAccountSnapshots } = sandbox.exports;

const W = (o) => ({
  id: "WD-1", amount: 10, network: "trc20", address: "T1", status: "tx-failed",
  submittedAt: 1_720_000_000_000, estimatedCompletion: 0, fee: { nexBurned: 5 }, ...o,
});
const BASE = {
  schema: 1,
  accountKey: "demo",
  entrySurface: "h5",
  updatedAt: 1000,
  user: {
    email: "demo@nexgrid.ai",
    tier: "L2",
    joinedAt: 1,
    referralCode: "NEXGRID",
    usdtBalance: 100,
    nexBalance: 10,
    pendingEarnings: 1,
    cumulativeDepositUsdt: 0,
  },
  devices: [
    {
      id: "phone-1",
      kind: "phone",
      todayEarnings: 1,
      todayEarningsNEX: 2,
      status: "online",
      lastSettledAt: 1000,
      currentTask: {
        id: "IG-A1",
        category: "IG",
        type: "Image Gen",
        model: "Flux",
        client: "Mosaic",
        location: "Berlin",
        totalSec: 30,
        startedAt: 1000,
        reward: 0.1,
      },
      recentTasks: [],
    },
  ],
  earnings: { today: 1, todayNEX: 2, thisWeek: 10, thisMonth: 20, total: 30, history: [] },
  latestWithdrawal: null,
};

const snap = (rows) => ({ ...structuredClone(BASE), withdrawals: rows });
const merge = (disk, mem) => {
  const out = mergeAccountSnapshots(snap([]), snap([mem]), snap([disk]));
  return out.withdrawals.find((w) => w.id === "WD-1");
};

let bad = 0, total = 0;
const check = (name, cond, got) => {
  total++;
  if (cond) console.log(`  PASS  ${name}`);
  else { bad++; console.log(`  FAIL  ${name} — 实得 ${JSON.stringify(got)}`); }
};

// ① 主线那半:同档位、只有磁盘带 terminalReason → 不许被内存行整行顶掉
{
  const r = merge(W({ terminalReason: "RISK_REJECTED" }), W({}));
  check("同档位:磁盘独有的 terminalReason 保住(主线修法)", r?.terminalReason === "RISK_REJECTED", r);
}
// ② z8 那半:同档位、磁盘有退款事实、内存是 0 → 不许被抹回 0,且金额与时刻同源
{
  const r = merge(W({ nexRefunded: 3, nexRefundedAt: 1_722_000_000_000 }), W({ nexRefunded: 0 }));
  check("同档位:退款事实不被内存的 0 抹掉(z8 修法)", r?.nexRefunded === 3, r);
  check("同档位:金额与时刻整对同源", r?.nexRefundedAt === 1_722_000_000_000, r);
}
// ③ 两半同时(真实高发路径):同档位、状态不同(tx-failed 与 refunded 同为 6 档),
//    内存那份是服务端刚回的新状态但**金额还没补上**(显式 0)—— 两条修法必须同时生效
{
  const r = merge(
    W({ status: "tx-failed", nexRefunded: 3, nexRefundedAt: 1_722_000_000_000 }),
    W({ status: "refunded", nexRefunded: 0 }),
  );
  check("同档不同态:内存的新状态生效", r?.status === "refunded", r);
  check("同档不同态:磁盘独有的退款证据不被 0 抹掉(并集特有)", r?.nexRefunded === 3, r);
  check("同档不同态:救回的时刻与金额同源", r?.nexRefundedAt === 1_722_000_000_000, r);
}
// ③b 档位**真的**不同(sent=4 → refunded=6)的防御路径:高档位整行胜出,
//     输家独有的退款证据仍须救回。构造性靶 —— 现实数据里少见,但这条分支存在就必须被钉住。
{
  const r = merge(
    W({ status: "sent", nexRefunded: 3, nexRefundedAt: 1_722_000_000_000 }),
    W({ status: "refunded" }),
  );
  check("档位不同:高档位状态胜出", r?.status === "refunded", r);
  check("档位不同:输家独有的退款证据仍被救回", r?.nexRefunded === 3, r);
}
// ③c 整对同源(变异 C 抓出的覆盖洞):两份**都**带退款且金额不同 ——
//     时刻必须跟着金额走,不许各取各的拼出一份两端都不存在的事实。
{
  const T_DISK = 1_722_000_000_000;
  const T_MEM = 1_723_000_000_000;
  const r = merge(
    W({ nexRefunded: 3, nexRefundedAt: T_DISK }),
    W({ nexRefunded: 1, nexRefundedAt: T_MEM }),
  );
  check("整对同源:金额取大的那份", r?.nexRefunded === 3, r);
  check("整对同源:时刻必须来自同一份(不是各取各的)", r?.nexRefundedAt === T_DISK, r);
}
// ④ 反向:内存带更新的退款事实,磁盘没有 → 内存的值必须留下(证明不是无脑偏袒磁盘)
{
  const r = merge(W({}), W({ nexRefunded: 4, nexRefundedAt: 1_723_000_000_000 }));
  check("反向:内存新增的退款事实保住(证明规则不是偏袒磁盘)", r?.nexRefunded === 4, r);
}
if (total < 11) { console.log(`union-probe FAIL —— 只跑了 ${total} 格,少于登记的 8 格(靶被删或没执行)`); process.exit(1); }
console.log(bad === 0 ? `union-probe PASS —— 两条修法并存,${total}/${total}` : `union-probe FAIL —— ${bad}/${total} 格`);
process.exit(bad === 0 ? 0 : 1);
