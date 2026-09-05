# 平台单源锚改造 — 终局收口校验报告(final verifier)

- 日期:2026-07-24 · 校验人:终局独立 verifier(实现方≠验收方,只读源码 + headless 浏览器实测,未改任何源文件)
- 对象:审计修复轮(P1-1 / P1-2 修复 + 采纳的 8 个 P2)· 背景:`2026-07-24-platform-stats-single-anchor.md` 审计与修订记录节 + `…-audit.md`
- 方法:静态回源 Grep/Read(独立复跑,不信任 verify.sh 自报绿)+ node 验算数字闭环 + Playwright headless 双语(en/zh)四路由实景 + Murphy 残针扫描
- **总判:PASS(5/5 项全过;3 条非阻塞观察留档)**

---

## 1. P1-2 闭环(jobs 族收进锚系)— PASS

| 检项 | 结果 | 证据 |
|---|---|---|
| task-center 无「8,432」字面量 | ✓ | src/ 全量 grep `8,432|8_432|8432` 仅命中 `src/lib/platform-stats.ts:13/18/28`(28_432 子串);task-center.vue 0 命中 |
| task-center 绑 store activeJobs | ✓ | `src/components/earn/task-center.vue:19` `app.global.activeJobs.toLocaleString()` + `:20` `t.earn.jobsLive`;三语值均不含数字(en:505 / zh:493 / vi:506) |
| globe 区域值带 `k/h` | ✓ | `src/pages/globe/globe.vue:133`(列表行)与 `:161`(抽屉)均 `(jobsPerHour/1000).toFixed(1)}k/h` |
| 抽屉 label 用 jobsPerHour 新键 ×3 语 | ✓ | `globe.vue:162` `t.globe.jobsPerHour`;键在 en.ts:2772「Jobs/hr」/ zh.ts:2729「任务/小时」/ vi.ts:2705「Tác vụ/giờ」 |
| pulse 卡 sub =「live · 51.2k jobs/hr」 | ✓ | `src/components/home/network-pulse-card.vue:77`;旧「4,820 jobs/s」src/ 全量 grep 0 命中 |
| 51.2k = 六区 jobsPerHour 之和 | ✓ | node 验算:21,460+14,280+12,140+2,180+720+420 = **51,200** → `(51200/1000).toFixed(1)`=「51.2k」精确相等(`src/mock/globe-regions.ts`) |
| 种子自洽(Little's law) | ✓ | `src/store/app.ts:149-151` 注释「51.2k jobs/hr ⇒ ~5–6 min median job」;node:4812/51200×60 = **5.64 min** ✓ |

## 2. P1-1 闭环(trust 季报 Q2 口径 + 跨仓镜像)— PASS

| 检项 | 结果 | 证据 |
|---|---|---|
| q3Label/q3Suffix/q3ReportTitle 全灭 | ✓ | src/ 大小写不敏感 grep:0 命中(哨兵 legacy 表 `\bq3(Label|Suffix|ReportTitle)` 同口径,verify.sh:1348) |
| qtr* ×3 语在位 | ✓ | en.ts:3123-3125「Q2 2026 financials / audited by PwC / Q2 2026 Earnings Report」;zh.ts:3066-3068「2026 Q2 财报 / 普华永道审计 / 2026 年第二季度收益报告」;vi.ts:3054-3056 同口径 |
| QTR_FINANCIALS 值 | ✓ | `src/pages/trust/trust.vue:258-263`:Devices **27,150 (+12%)** · Payouts **$47.0M (+27%)**(另 MRR $4.87M +22% / Active accounts 184,206 +38%) |
| admin 跨仓镜像同值 | ✓ | `../Nexion-admin-prototype/app/components/domain-views/i-tabs/data.ts:188-193` FINANCIALS_FIELDS 四值逐位一致,且 :185-187 注释已声明与 check(6) 的耦合 |
| 换算:Q2 日均 < 当前锚 | ✓ | node:$47.0M ÷ 92d = **$510.9K/日**(÷91d = $516.5K)< 锚 $682,368/日,增长方向正确 |
| 累计闭环 ±5% | ✓ | node:QTD 24d × 682,368 = **$16.38M**;16.38 + 47(Q2)+ 37(Q1)+ 27(启动季)= **$127.38M** vs 累计种子 127,438,905 → 偏差 **-0.05%** |
| 28,432 单角色维持 | ✓ | trust.vue 不再含 28,432 字面量(hero 绑 store 活值);src/ 内 28,432 仅存 lib(check(3) 由「lib+trust 白名单」收紧为「仅 lib」后仍成立) |

## 3. P2 落地抽查(采纳 8 条)— PASS

| # | 检项 | 结果 | 证据 |
|---|---|---|---|
| P2-9 | app.ts 无 globalTimer | ✓ | `src/store/app.ts` grep `globalTimer` 0 命中 |
| P2-10 | 平台抖动在 miningPaused 早退之前 | ✓ | app.ts:374-388(global jitter)先于 :389 `if (miningPaused.value) return;`,:375-376 注释明示「platform-wide figures must not freeze on an individual's mining state」 |
| P2-1 | activeJobs 夹箝 ±36 | ✓ | app.ts:387 `Math.min(ACTIVE_JOBS_SEED+36, Math.max(ACTIVE_JOBS_SEED-36, …))`;步长 `Math.floor(Math.random()*5)-2` = ±0~2,与 change doc 文本一致 |
| P2-2 | intro devices 夹箝 ±24 | ✓ | `src/pages/onboarding/intro.vue:195-196` `Math.min(FLEET_DEVICES+24,…)/Math.max(FLEET_DEVICES-24,…)`;:143 lib import |
| P2-4 | ref 绑 MONTHLY_NEW_JOINERS | ✓ | `src/pages/ref/code.vue:139` import + `:145` `MONTHLY_NEW_JOINERS.toLocaleString`;code.vue 无 41,286 字面量;41,286 仅存 lib:29 + posterGiftSub2 ×3 语(en:4621/zh:4528/vi:4541,check(5) 每语 ==1) |
| P2-5 | check(4) import+符号双 needle | ✓ | verify.sh:1359-1370:5 消费者对(pulse/DAILY_PAYOUT_USD · on-grid/PAYOUT_PER_SEC_USD · intro/paidCumulativeNow · ref/MONTHLY_NEW_JOINERS · app.ts/FLEET_DEVICES),import 路径 + 符号出现次数 ≥2 双验 |
| (新) | check(6) 跨仓 parity 存在 | ✓ | verify.sh:1375-1380:trust.vue 与 admin i-tabs/data.ts 双侧核 `27,150` 与 `\$47\.0M` |
| P2-3 | Done-when 3 改带宽判据 | ✓ | change doc L51 已重写为「恒在 28,432±24 / 4,812±36 带内 + 双向变动」并留判据修订理由 |
| P2-6 | 业务流程说明更新 | ✓ | `docs/业务流程说明.md:252` 已改「activeDevices/activeJobs 围绕锚对称有界抖动(±24/±36,不受 miningPaused 门控;锚单源 platform-stats.ts)」 |
| P2-7 | PRD 契约表行更新 | ✓(root) | 根 PRD `D:\WORKS\PLAN\PRD\Nexion_产品功能架构设计文档_v3.7.md:3518`:字段改 activeDevices/activeJobs、指针改 `src/store/app.ts:createInitialGlobal + src/lib/platform-stats.ts`、paidToday 已除。repo 副本 `:3515` 仍旧行——root 为权威、push 脚本单向覆盖,属预期滞后非缺陷(下次 push 自消) |

哨兵 legacy 表独立复验:`1247893(3 变体)/$1.24M/+$215\/sec/paidToday/todayIncrement/networkPhones/networkHubs/paidToCreators/leaderboardHint/(^|[^0-9])8,432/jobs\/s/q3(Label|Suffix|ReportTitle)/Q3_FINANCIALS` 全部 src/ **0 命中**(区分大小写口径下 networkPaidToday 不受 `paidToday` 针误伤,与 T4 论证一致)。

## 4. 浏览器实测(Playwright headless,`?nx_device=off`,en+zh 双遍)— PASS

| 路由 | en 实测 | zh 实测 |
|---|---|---|
| home `#/pages/index/index` | 「$682K」+ sub「live · 51.2k jobs/hr」+ Members 1.42M + Devices **28,433**(带内)+「+$7.9/sec」;legacy(4,820 jobs/s / $1.24M / +$215/sec)0 | 同值同过(28,433 / +$7.9/sec) |
| earn `#/pages/earn/earn` | 「**4,816** jobs live globally」(带内 4,812±36) | 「**4,809** 个全球任务进行中」(带内) |
| globe `#/pages/globe/globe` | tile Active jobs **4,818**(带内);六区行值 21.5k/h·14.3k/h·12.1k/h·2.2k/h·0.7k/h·0.4k/h;点开亚太抽屉:值「**21.5k/h**」+ label「**Jobs/hr**」+ 脚注「21,460 jobs / hour」 | tile **4,813**;抽屉「21.5k/h」+「**任务/小时**」,区域名「亚太」 |
| trust `#/pages/trust/trust` | 「Q2 2026 financials · audited by PwC」+「Q2 2026 Earnings Report」渲染;**27,150** 与 **$47.0M** 在位;「Q3 2026 financials」/「$31.2M」0 命中;hero 活值 28,437(带内) | 「2026 Q2 财报 · 普华永道审计」同过;hero 28,434 |
| console error | **4 路由 ×2 语全程 0**(含 boot;无需归因排除——本 verifier 独立 browser context 内无任何 error/pageerror 事件) | 同 0 |

过程记录:首轮 globe 抽屉点击被**里程碑庆祝弹窗**(milestone-celebration,$5,000 milestone,新 mock 会话首访自然触发)遮挡吞掉——属既有产品行为非本轮回归;点 overlay 关闭后区域行点击、抽屉渲染均正常。首轮 en 断言落空系本机中文系统下 Playwright 默认 locale=zh-CN(app 按浏览器语言匹配),显式注入 `nexgrid-locale-v1`(uni 包装格式)双语重跑后全过。

## 5. 末轮新问题扫描 — 无新增互斥/回归

运行时同屏/跨页交叉:earn 4,8xx ↔ globe tile 4,8xx(同 store 同带)✓;home/trust hero 活设备同带 ✓;Q2 27,150(静态收官值)< 活值 28,4xx(+4.72%,与注释「+4.8% 延续轨迹」一致)✓;41,286/1.42M=2.91% ↔「+2.9% /mo」✓;$20.47M ↔「$20.5M」✓。「Q3 2026」残存仅 docsTabComing(文档门户上线预告,未来向,合法)与 LISTINGS「Application Q3」(交易所申请进度,异口径,审计已放行)。

**非阻塞观察(留档,不构成 FAIL)**:

1. `q3DownloadCta` / `q3Footnote` 两键(en:3126-3127 等)保留 q3 前缀命名,值为季度中性文案(「Download PDF →」等),不渲染任何 Q3 字样;哨兵有意只圈 `q3(Label|Suffix|ReportTitle)`。纯命名残留,可在下批死键/改名批顺手清。
2. jobs 族三处一致性(pulse sub「51.2k jobs/hr」字面量 ↔ globe-regions 六区和 ↔ ACTIVE_JOBS_SEED 注释)当前精确自洽但**无哨兵互锁**(verify.sh 无 51.2/51200/jobsPerHour 针)——与修复前 P2-4 同类的「多手抄无针」形态,后续改 REGIONS 会静默漂移。建议下轮顺手补一针(如 pin 六区和==51200 + pulse sub 字面量)。
3. repo 副本 PRD `:3515` 契约行待下次 push 覆盖(见 P2-7 行)。

## 收尾

- Playwright 浏览器均已 `browser.close()`;进程表复查 headless/ms-playwright chromium **0 孤儿**。
- 本 verifier 未改动任何源文件/脚本/i18n;仓库内新增仅本报告;截图落 session scratchpad(会话隔离,不入仓)。
