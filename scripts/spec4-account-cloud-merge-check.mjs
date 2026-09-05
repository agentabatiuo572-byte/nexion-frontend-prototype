import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = fs.readFileSync("src/store/account-cloud.ts", "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;

const sandbox = { exports: {}, require, console, Date, Map, JSON, Math };
vm.runInNewContext(js, sandbox);
const { mergeAccountSnapshots } = sandbox.exports;
if (typeof mergeAccountSnapshots !== "function") {
  throw new Error("mergeAccountSnapshots export missing");
}

const base = {
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

const latest = structuredClone(base);
latest.user.usdtBalance = 999;
latest.devices[0].lastSettledAt = 2000;
latest.devices[0].currentTask.startedAt = 2000;
latest.devices.push({ id: "pc-1", kind: "pc-gpu", todayEarnings: 0, todayEarningsNEX: 0, status: "online" });

const staleWriter = structuredClone(base);
staleWriter.earnings.today = 1.5;
staleWriter.user.pendingEarnings = 1.5;
staleWriter.devices[0].lastSettledAt = 1500;
staleWriter.devices[0].currentTask.startedAt = 1500;

const merged = mergeAccountSnapshots(base, staleWriter, latest);
if (merged.user.usdtBalance !== 999) {
  throw new Error(`stale writer overwrote latest balance: ${merged.user.usdtBalance}`);
}
if (!merged.devices.some((d) => d.id === "pc-1")) {
  throw new Error("stale writer dropped latest device");
}
const mergedPhone = merged.devices.find((d) => d.id === "phone-1");
if (mergedPhone?.lastSettledAt !== 2000) {
  throw new Error(`lastSettledAt was merged as an additive balance field: ${mergedPhone?.lastSettledAt}`);
}
if (mergedPhone?.currentTask?.startedAt !== 2000) {
  throw new Error(`nested currentTask.startedAt was overwritten by a stale writer: ${mergedPhone?.currentTask?.startedAt}`);
}
if (merged.earnings.today <= latest.earnings.today) {
  throw new Error("local earnings delta was not merged");
}

const taskIdentityBase = structuredClone(base);
taskIdentityBase.devices[0].currentTask.id = "TASK-A";
taskIdentityBase.devices[0].currentTask.startedAt = 1000;
const taskIdentityLatest = structuredClone(taskIdentityBase);
taskIdentityLatest.devices[0].currentTask.id = "TASK-C";
taskIdentityLatest.devices[0].currentTask.startedAt = 3000;
const taskIdentityStale = structuredClone(taskIdentityBase);
taskIdentityStale.devices[0].currentTask.id = "TASK-B";
taskIdentityStale.devices[0].currentTask.startedAt = 2000;
const taskIdentityMerged = mergeAccountSnapshots(taskIdentityBase, taskIdentityStale, taskIdentityLatest);
const identityTask = taskIdentityMerged.devices.find((d) => d.id === "phone-1")?.currentTask;
if (identityTask?.id !== "TASK-C" || identityTask?.startedAt !== 3000) {
  throw new Error(`currentTask identity conflict created a hybrid task: ${JSON.stringify(identityTask)}`);
}

const taskNullConflictBase = structuredClone(taskIdentityBase);
const taskNullConflictLatest = structuredClone(taskNullConflictBase);
taskNullConflictLatest.devices[0].currentTask.id = "TASK-C";
taskNullConflictLatest.devices[0].currentTask.startedAt = 3000;
const taskNullConflictStale = structuredClone(taskNullConflictBase);
taskNullConflictStale.devices[0].currentTask = null;
const taskNullConflictMerged = mergeAccountSnapshots(taskNullConflictBase, taskNullConflictStale, taskNullConflictLatest);
const nullConflictTask = taskNullConflictMerged.devices.find((d) => d.id === "phone-1")?.currentTask;
if (nullConflictTask?.id !== "TASK-C" || nullConflictTask?.startedAt !== 3000) {
  throw new Error(`stale currentTask null cleared latest task: ${JSON.stringify(nullConflictTask)}`);
}

const taskEmptyBase = structuredClone(base);
taskEmptyBase.devices[0].currentTask = null;
const taskEmptyLatest = structuredClone(taskEmptyBase);
taskEmptyLatest.devices[0].currentTask = {
  ...base.devices[0].currentTask,
  id: "TASK-C",
  startedAt: 3000,
};
const taskEmptyStale = structuredClone(taskEmptyBase);
taskEmptyStale.devices[0].currentTask = {
  ...base.devices[0].currentTask,
  id: "TASK-B",
  startedAt: 2000,
};
const taskEmptyMerged = mergeAccountSnapshots(taskEmptyBase, taskEmptyStale, taskEmptyLatest);
const emptyConflictTask = taskEmptyMerged.devices.find((d) => d.id === "phone-1")?.currentTask;
if (emptyConflictTask?.id !== "TASK-C" || emptyConflictTask?.startedAt !== 3000) {
  throw new Error(`currentTask empty-baseline conflict did not preserve latest task: ${JSON.stringify(emptyConflictTask)}`);
}

const taskEmptySameIdBase = structuredClone(base);
taskEmptySameIdBase.devices[0].currentTask = null;
const taskEmptySameIdLatest = structuredClone(taskEmptySameIdBase);
taskEmptySameIdLatest.devices[0].currentTask = {
  ...base.devices[0].currentTask,
  id: "TASK-SAME",
  startedAt: 3000,
};
const taskEmptySameIdStale = structuredClone(taskEmptySameIdBase);
taskEmptySameIdStale.devices[0].currentTask = {
  ...base.devices[0].currentTask,
  id: "TASK-SAME",
  startedAt: 2000,
};
const taskEmptySameIdMerged = mergeAccountSnapshots(taskEmptySameIdBase, taskEmptySameIdStale, taskEmptySameIdLatest);
const sameIdCurrentTask = taskEmptySameIdMerged.devices.find((d) => d.id === "phone-1")?.currentTask;
if (sameIdCurrentTask?.startedAt !== 3000) {
  throw new Error(`empty-baseline same-id currentTask regressed latest timestamp: ${JSON.stringify(sameIdCurrentTask)}`);
}

const taskClearedBase = structuredClone(taskIdentityBase);
const taskClearedLatest = structuredClone(taskClearedBase);
taskClearedLatest.devices[0].recentTasks = [
  { ...taskClearedBase.devices[0].currentTask, completedAt: 3000 },
];
taskClearedLatest.devices[0].currentTask = null;
const taskClearedStale = structuredClone(taskClearedBase);
taskClearedStale.devices[0].currentTask.startedAt = 2000;
const taskClearedMerged = mergeAccountSnapshots(taskClearedBase, taskClearedStale, taskClearedLatest);
const clearedDevice = taskClearedMerged.devices.find((d) => d.id === "phone-1");
if (clearedDevice?.currentTask !== null) {
  throw new Error(`stale writer restored a cleared currentTask: ${JSON.stringify(clearedDevice?.currentTask)}`);
}
if (!clearedDevice?.recentTasks.some((task) => task.id === "TASK-A")) {
  throw new Error(`cleared task was dropped from recentTasks: ${JSON.stringify(clearedDevice?.recentTasks)}`);
}

const taskHistoryBase = structuredClone(base);
taskHistoryBase.devices[0].recentTasks = [];
const taskHistoryLatest = structuredClone(taskHistoryBase);
taskHistoryLatest.devices[0].recentTasks = [
  { ...taskHistoryBase.devices[0].currentTask, id: "newer", completedAt: 3000 },
];
const taskHistoryStale = structuredClone(taskHistoryBase);
taskHistoryStale.devices[0].recentTasks = [
  { ...taskHistoryBase.devices[0].currentTask, id: "older", completedAt: 2000 },
];
const taskHistoryMerged = mergeAccountSnapshots(taskHistoryBase, taskHistoryStale, taskHistoryLatest);
const mergedTaskIds = taskHistoryMerged.devices.find((d) => d.id === "phone-1")?.recentTasks.map((task) => task.id) ?? [];
for (const id of ["newer", "older"]) {
  if (!mergedTaskIds.includes(id)) throw new Error(`recentTasks merge dropped task ${id}: ${JSON.stringify(mergedTaskIds)}`);
}

const taskHistorySameIdBase = structuredClone(base);
taskHistorySameIdBase.devices[0].recentTasks = [];
const taskHistorySameIdLatest = structuredClone(taskHistorySameIdBase);
taskHistorySameIdLatest.devices[0].recentTasks = [
  { ...taskHistorySameIdBase.devices[0].currentTask, id: "TASK-SAME", completedAt: 3000 },
];
const taskHistorySameIdStale = structuredClone(taskHistorySameIdBase);
taskHistorySameIdStale.devices[0].recentTasks = [
  { ...taskHistorySameIdBase.devices[0].currentTask, id: "TASK-SAME", completedAt: 2000 },
];
const taskHistorySameIdMerged = mergeAccountSnapshots(taskHistorySameIdBase, taskHistorySameIdStale, taskHistorySameIdLatest);
const sameIdRecentTask = taskHistorySameIdMerged.devices.find((d) => d.id === "phone-1")?.recentTasks.find((task) => task.id === "TASK-SAME");
if (sameIdRecentTask?.completedAt !== 3000) {
  throw new Error(`empty-baseline same-id recentTasks regressed latest completion: ${JSON.stringify(sameIdRecentTask)}`);
}

const mkWd = (id, status, submittedAt) => ({
  id,
  amount: 10,
  network: "USDT-TRC20",
  address: "Tdemo",
  fee: 1,
  status,
  submittedAt,
  estimatedCompletion: submittedAt + 4000,
});
const withdrawalBase = structuredClone(base);
withdrawalBase.withdrawals = [mkWd("wd-1", "submitted", 1000)];
const withdrawalLatest = structuredClone(withdrawalBase);
withdrawalLatest.withdrawals[0].status = "processing";
const withdrawalStale = structuredClone(withdrawalBase);
withdrawalStale.withdrawals[0].status = "review-passed";
const withdrawalMerged = mergeAccountSnapshots(withdrawalBase, withdrawalStale, withdrawalLatest);
const wd1 = withdrawalMerged.withdrawals.find((w) => w.id === "wd-1");
// 同一单:状态取 rank 更靠后的那份(跨进程「读最新」可能读到旧值,last-write 会把已到账退回处理中)
if (wd1?.status !== "processing") {
  throw new Error(`withdrawal status regressed: ${wd1?.status}`);
}

// 🔴 同档位 = 同一状态的两份快照,必须**按字段合并**,不是整行择一
// (2026-08-11 R1 独立审计,包 z7 立案的直接原因;R3 又抓到反方向)。
// 缺陷两个方向都真实发生过:
//   ① 服务端这一拍只补了终态原因(状态没变)→ 整行择一时磁盘旧行赢 → 原因整拍丢失;
//   ② 内存行赢时 → 把磁盘上已落盘的原因抹掉。终态单不再被回查 = 两个方向都是永久丢失。
// ⚠️ 本门**不**覆盖「frozen 与四个终态同档 → 冻结单收不到最终结论」那条主线既有缺陷:
//    它要真时序判据(独立仲裁重构,主人 2026-08-12 拍板独立立卡)。别在这里加假靶充数。
const sameStatus = (over, memOver) => {
  const b = structuredClone(base);
  b.withdrawals = [{ ...mkWd("wd-same", "frozen", 3000), ...over }];
  const disk = structuredClone(b);            // latest = 磁盘行
  const mem = structuredClone(b);             // next   = 内存行
  mem.withdrawals[0] = { ...mem.withdrawals[0], ...memOver };
  return mergeAccountSnapshots(b, mem, disk).withdrawals.find((w) => w.id === "wd-same");
};
// 方向 ①:磁盘没有原因,内存刚镜像到 → 必须留下
const gotMem = sameStatus({}, { terminalReason: "address-risk", retriable: false });
if (gotMem?.terminalReason !== "address-risk" || gotMem?.retriable !== false) {
  throw new Error(`同状态下内存新补的字段被丢弃:${JSON.stringify({ r: gotMem?.terminalReason, t: gotMem?.retriable })}`);
}
// 方向 ②:磁盘已有原因,内存这拍没带 → **不许**被抹掉(赢家通吃会抹,R3 探针实测)
const gotDisk = sameStatus({ terminalReason: "risk-hit", retriable: false, confirmedAt: 777 }, {});
if (gotDisk?.terminalReason !== "risk-hit" || gotDisk?.retriable !== false || gotDisk?.confirmedAt !== 777) {
  throw new Error(`同状态下磁盘已落盘的字段被抹掉:${JSON.stringify({ r: gotDisk?.terminalReason, t: gotDisk?.retriable, c: gotDisk?.confirmedAt })}`);
}
// 双方都有值 → 以内存(本端刚写入的)为准,且不得串成第三个值
const gotBoth = sameStatus({ terminalReason: "risk-hit" }, { terminalReason: "data-mismatch" });
if (gotBoth?.terminalReason !== "data-mismatch") {
  throw new Error(`双方都有值时未取内存值(得到 ${gotBoth?.terminalReason})`);
}
// 🔴 字段合并必须**对所有可选字段成立**,不是对一份手写清单成立
// (2026-08-12 并入主线时自查:上一版枚举了 6 个,而类型里有 7 个 —— 漏掉的 riskRoute
//  会退回「整行择一」的老坏法)。判据从 **types.ts 的实际字段表**取,不在门里再抄一份。
const optionalFields = (() => {
  const src = fs.readFileSync("src/store/types.ts", "utf8");
  const body = src.slice(src.indexOf("export interface Withdrawal {"));
  return [...body.slice(0, body.indexOf("\n}")).matchAll(/^ {2}([a-zA-Z]+)\?:/gm)].map((m) => m[1]);
})();
if (optionalFields.length < 5) {
  throw new Error(`Withdrawal 可选字段只解析出 ${optionalFields.length} 个 —— 判据失效,空集全过是假绿`);
}
for (const field of optionalFields) {
  // 磁盘有值、内存这拍没带 → 必须保留磁盘的值(逐字段各测一次,不抽样)
  const probe = { "wd-field": 1 };
  void probe;
  const b = structuredClone(base);
  b.withdrawals = [{ ...mkWd("wd-field", "frozen", 3400), [field]: "SENTINEL" }];
  const disk = structuredClone(b);
  const mem = structuredClone(b);
  // 🔴 靶必须是「内存**显式给了 undefined**」,不是「内存没这个键」——
  // 对象展开 `{...disk, ...memory}` 本来就能处理「没这个键」,拿 delete 造靶等于测不到
  // 被测分支(首版就是这么写的,红测不红才发现;同族:靶没进被测分支 = 恒绿)。
  mem.withdrawals[0][field] = undefined;
  const got = mergeAccountSnapshots(b, mem, disk).withdrawals.find((w) => w.id === "wd-field");
  if (got?.[field] !== "SENTINEL") {
    throw new Error(`同状态合并漏了可选字段 ${field}(得到 ${JSON.stringify(got?.[field])})—— 判据是手写清单就会这样静默漏`);
  }
}

// 档位不等时仍按档位:主链单调,不因字段合并而退化
const rankUp = (() => {
  const b = structuredClone(base);
  b.withdrawals = [mkWd("wd-rank", "processing", 3100)];
  const disk = structuredClone(b);
  const mem = structuredClone(b);
  mem.withdrawals[0] = { ...mem.withdrawals[0], status: "confirmed" };
  return mergeAccountSnapshots(b, mem, disk).withdrawals.find((w) => w.id === "wd-rank");
})();
if (rankUp?.status !== "confirmed") {
  throw new Error(`升档被丢弃(processing→confirmed 得到 ${rankUp?.status})`);
}
const rankDown = (() => {
  const b = structuredClone(base);
  b.withdrawals = [mkWd("wd-rank2", "confirmed", 3200)];
  const disk = structuredClone(b);
  const mem = structuredClone(b);
  mem.withdrawals[0] = { ...mem.withdrawals[0], status: "processing" };
  return mergeAccountSnapshots(b, mem, disk).withdrawals.find((w) => w.id === "wd-rank2");
})();
if (rankDown?.status !== "confirmed") {
  throw new Error(`陈旧低档内存行顶掉了磁盘的 confirmed(得到 ${rankDown?.status})`);
}

// 🔴 列表化才有的不变量:两端**各自新建**的单都必须保留。
// 单条版这里会互相顶掉 —— 钱已扣、单据不可达、到账推进永不再碰它(2026-07-31 audit P0)。
const wdBothBase = structuredClone(base);
wdBothBase.withdrawals = [];
const wdBothNext = structuredClone(wdBothBase);
wdBothNext.withdrawals = [mkWd("wd-A", "submitted", 2000)];
const wdBothLatest = structuredClone(wdBothBase);
wdBothLatest.withdrawals = [mkWd("wd-B", "submitted", 2100)];
const wdBothMerged = mergeAccountSnapshots(wdBothBase, wdBothNext, wdBothLatest);
const bothIds = wdBothMerged.withdrawals.map((w) => w.id).sort().join(",");
if (bothIds !== "wd-A,wd-B") {
  throw new Error(`concurrent withdrawals must both survive, got: ${bothIds}`);
}
// 排序:最近提交的在前(展示面取 [0] 即最新)
if (wdBothMerged.withdrawals[0].id !== "wd-B") {
  throw new Error(`withdrawals must be sorted newest-first, got: ${wdBothMerged.withdrawals[0].id}`);
}

const secondLocalWrite = structuredClone(merged);
secondLocalWrite.user.usdtBalance = +(secondLocalWrite.user.usdtBalance + 1).toFixed(2);
const secondMerged = mergeAccountSnapshots(merged, secondLocalWrite, merged);
if (secondMerged.user.usdtBalance !== 1000) {
  throw new Error(`merged baseline was not reusable for the next write: ${secondMerged.user.usdtBalance}`);
}

const deletionBase = structuredClone(base);
deletionBase.devices.push({ id: "box-1", kind: "stellarbox-s1", todayEarnings: 0, todayEarningsNEX: 0, status: "online" });
const deletionNext = structuredClone(deletionBase);
deletionNext.devices = deletionNext.devices.filter((d) => d.id !== "phone-1");
const deletionLatest = structuredClone(deletionBase);
const deletionMerged = mergeAccountSnapshots(deletionBase, deletionNext, deletionLatest);
if (deletionMerged.devices.some((d) => d.id === "phone-1")) {
  throw new Error("local device deletion did not propagate to account cloud");
}

console.log("SPEC-4 account-cloud merge PASS");
