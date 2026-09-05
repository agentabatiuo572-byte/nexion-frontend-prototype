# 2026-08-03 试用时间边界单一不变量 — 红测留痕

对象:`scripts/selfcheck-trial-boundary.mjs`(51 断言:boundary=22 · matrix=18 · wiring=11;已焊 `scripts/verify.sh` TRIAL 段哨兵E)。
方法:按合取项(缺陷族 ①②③④⑤⑥ + 接线门)逐个单独注入破坏 → 只允许红对应族 → `cp` 备份还原(禁 `git checkout`)→ `cmp` byte-identical → 复跑全绿。注入形态一律取自真实事故现场(原始 bug 形态)。

| # | 注入(文件 · 形态) | 预期红族 | 实际红(条) | 正交族 | 还原 |
|---|---|---|---|---|---|
| R1 | trial-boundary.ts:`accruedShadow` 窗口改读 live `cfg.trialDays`(原 P1-② bug 形态) | ② 冻结窗口 | ②调大 5d 累计 21非35 · ②调小 2d 累计 14非7(2 条) | 全绿 | cmp OK → 51/0 |
| R2 | trial-boundary.ts:grace→ended `finishedAt = now`(原 P1-③ bug 形态) | ③ 终态时刻 | ③×2 + ④补齐路径×2 + ⑤矩阵 finishedAt×2(6 条,全部为 finishedAt=真边界 同族断言) | ①②⑥/wiring 全绿 | cmp OK → 51/0 |
| R3 | trial-boundary.ts:graceEndsAt=null 补齐块条件改 `if (false)`(原 P1-④ 存量卡死复活) | ④ 补齐/fail-closed | ④×3 + ⑤null 边界矩阵×2 + ⑤卡时代已过宽限(6 条,全为 null-边界同族) | ①②⑥ 全绿 | cmp OK → 51/0 |
| R4 | trial-boundary.ts:两级联间插 `if (changed) return r;`(退化回一格一停 = 原 P0 根因) | ① 级联 | ①级联 · ①convert 门 · ①幂等 + 依赖级联的 ③④⑤ 下游 6 条(共 9) | ②⑥/wiring 全绿 | cmp OK → 51/0 |
| R5 | trial-boundary.ts:终态守卫放开 + converted 参与 grace 级联(终态被推进 bug 形态) | ⑥ 终态不可变 | ⑥converted 同引用 + ⑤redeemed/failed/cancelled 终态同引用(4 条) | ①②③④ 全绿 | cmp OK → 51/0 |
| R6 | free-trial.ts:`migrateRow` 冻结补齐不走 `accruedShadow` 单源(发明 0 值) | ⑤ 迁移补齐 + W 接线 | ⑤extended 补齐 21/120 · W-migrateRow 单源公式(2 条) | 其余全绿 | cmp OK → 51/0 |
| R7 | free-trial.ts:`convert()` 摘掉 `advanceTo(now)` 调用行(判定在、没接上) | W 接线门 | W-convert 先走 advanceTo(1 条;行为靶全绿 —— 正是接线门存在的理由) | 其余全绿 | cmp OK → 51/0 |
| R8 | 自检脚本副本:切片 marker 改 `migrateRowZZZ`(空集探针) | 硬死 | `FAIL free-trial.ts 切片缺失` · exit=1(不允许找不到=全过) | – | 副本移 scratchpad |

判据说明:R2/R3/R4 红出的多条均为**同一合取项在不同路径上的同族断言**(finishedAt=真边界 / null 边界补齐 / 级联一次到位),无跨族误红;每轮还原后 `cmp -s` byte-identical 且复跑 `51 asserts, 0 fail`。

终局:`node scripts/selfcheck-trial-boundary.mjs` → PASS 51/0;`node scripts/selfcheck-trial-price-parity.mjs` → PASS;`npm run type-check` → 0 错;`bash -n scripts/verify.sh` → OK。
