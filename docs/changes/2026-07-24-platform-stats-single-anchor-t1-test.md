# ST1 平台单源锚模块 + store 校准 — 独立黑盒验收报告

- 日期:2026-07-24 · 验收人:独立 tester agent(实现方≠验收方,只读源码 + 独立浏览器实测)
- 对象:`src/lib/platform-stats.ts` + `src/store/types.ts` + `src/store/app.ts`(ST1 子任务)
- 结论:**PASS(4/4 条款全过)**,附 2 条非阻塞观察

## 条款 1 — platform-stats.ts 单源锚模块 · PASS

文件存在(`src/lib/platform-stats.ts`),用 node 实际 import 评估仓库源文件(仅剥 `: number` 注解,临时脚本在会话 scratchpad,未入库),9/9 断言全过:

| 断言 | 实测 |
|---|---|
| `FLEET_DEVICES === 28432` | 28432 ✓ |
| `FLEET_AVG_DAILY_USD === 24` | 24 ✓ |
| `DAILY_PAYOUT_USD === 682368` 且 `=== FLEET_DEVICES × FLEET_AVG_DAILY_USD` | 682368 ✓(源码 L19 为派生表达式 `FLEET_DEVICES * FLEET_AVG_DAILY_USD`,非字面量) |
| `PAYOUT_PER_SEC_USD === DAILY/86400 ≈ 7.897` | 7.897777… ✓ |
| `MONTHLY_PAYOUT_USD === 20471040`(= DAILY×30) | 20471040 ✓ |
| `paidCumulativeNow()` = 种子 127_438_905 + (now − anchor 2026-07-24 UTC) × 速率 | 实测 127,595,653 = 独立重算区间 [127595653,127595653] 逐毫秒吻合(采样时刻 2026-07-24T05:30:47Z)✓ |
| 锚点已过 → 值 > 种子 | Δ=+156,748 ✓ |
| 1.5s 后重呼单调递增且增量 ≈ 速率 | Δ1.5s=+12(理论 ≈11.8)✓ |

anchor/种子源码核对:L30 `Date.UTC(2026, 6, 24)`(= 2026-07-24 UTC),L31 `127_438_905`。

## 条款 2 — store 校准(代码审读) · PASS

- `src/store/types.ts` `GlobalStats`(L213-219):**无** `paidToday`,**有** `activeJobs: number`(L218)✓
- `src/store/app.ts` L14 `import { FLEET_DEVICES } from "@/lib/platform-stats"`;L152 种子 `activeDevices: FLEET_DEVICES`(grep 全文件无 `28432`/`28_432` 字面量)✓
- L158 `activeJobs: 4812` 种子 ✓;全文件无 `paidToday` ✓
- tick 对称抖动(L379-382):
  - `activeDevices`:`devDrift > 0.8 ? +1 : devDrift < 0.2 ? −1 : 0` — 上/下行各 p=0.2,期望 0,无恒正增量 ✓
  - `activeJobs`:`Math.floor(Math.random()*5) − 2` — 均匀 {−2…+2},期望 0,`Math.max(0, …)` 仅护下界 ✓
  - 注释(L375-377)明示「Symmetric wobble only … must not extrapolate」,与旧「always-add +130k/day」回归针对性一致

## 条款 3 — 运行时 60s 观察(globe 页) · PASS

方法:独立自建 headless Chromium(playwright 本地包,390×844,全新 profile,与共享 MCP tab 隔离),`?nx_device=off#/pages/globe/globe`,DOM 每秒采样 61 个点,全程停留 globe 路由(61/61 有效样本),**app console error = 0**。

| 时点 | Active nodes | Jobs in flight(= `activeJobs`) |
|---|---|---|
| t0 | **28,433** | **4,814** |
| t60 | **28,436** | **4,805** |

- 节点:t0/t60 两时点均在 28432±5 内;**净漂移 +4 ≤ ±5** ✓;轨迹 13 次上行 / 10 次下行 → 双向波动、非单调 ✓
- 任务:min 4803 / max 4814,全程在 4812±60 内 ✓;21 上行 / 27 下行,净漂移 −7,非单调 ✓
- 截图:`docs/changes/assets/2026-07-24-st1-globe-t0.png` · `…-st1-globe-t60.png`(目检数值与采样一致)
- 命名说明:页面英文文案为「Jobs in flight」(i18n key `t.globe.activeJobs`,store 字段 `activeJobs`),即条款所指「活跃任务」,文案措辞非偏差。

环境假阴排除记录:首次尝试走共享 Playwright MCP tab,被并发 tester(st2/st3)的导航污染(页面被跳至 team、采样冻结、console 出现注入轮询自身的 TypeError——经 stack 归因全部为 evaluate 注入代码,非 app 错误)。**该次运行整体作废**,改用独立浏览器重跑得到上表干净数据;dev server 全程 200。

## 条款 4 — 全站 grep · PASS

`src/` 内 `paidToday`、`todayIncrement` 均 **0 命中**(Grep 全 src 树)。

## 非阻塞观察(不影响本次验收)

1. **随机游走无回中/夹箝**:`activeDevices` 为无界对称随机游走(本次 60s 中段瞬时曾摸高 28,440,即 +8,随后自行回落;两时点判据与净漂移均在带内)。σ 随 √t 增长——数小时会话后 globe 值可能漂离静态引用 `FLEET_DEVICES=28432` 的其它展示面(intro/social proof)几十以上。若在意长会话一致性,可加轻量均值回归(如 `28432 + clamp(walk, ±N)`)。
2. **`globalTimer` 死累加**:app.ts L46/L378 只累加从不读取,疑似重构残留,可删。

## 总结

| 条款 | 结果 |
|---|---|
| 1. 单源锚模块存在 + 数学关系 node 实测 | PASS |
| 2. types/app store 校准 + tick 对称 | PASS |
| 3. 60s 运行时双向波动、带内、非单调 + 截图 | PASS |
| 4. `paidToday`/`todayIncrement` 全站 0 命中 | PASS |

**总判:PASS。** 自建 headless 浏览器已随脚本 `browser.close()` 退出(残留的两个 headless chrome 为并发 tester 共用的 MCP 实例,创建时间早于本次运行,未触碰);共享 tab 中作废截图已移 `.trash/20260724-st1-tester/`。
