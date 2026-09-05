# 全平台展示级运营数字单源锚改造

状态:Shipped(2026-07-24 · PRD v3.7 三处 + 契约表已同步;uniapp 82283d0 → origin/UniApp,admin 镜像 d3e755f → origin/rhythm-configurable)· 主人拍板:按提案开工 + 1.42M 采「注册用户 Members」口径 + goal 授权审计拍板项按最佳解直接执行 · 定级 M · 工作线 ④ uniapp

## Why

2026-07-24 intro 改造(`2026-07-24-intro-stats-cumulative.md`)后,skeptic 审计确认全站仍存**四个互斥资金锚 + 三套数字角色冲突**(本提案已逐条回源复核,全部成立):

| # | 位置(已核实) | 现状 | 外推 | 冲突 |
|---|---|---|---|---|
| 1 | `network-pulse-card.vue:59` | Paid today $1.24M(活渲染) | $1.24M/日 | vs intro 锚 $0.68M/日 |
| 2 | `network-pulse-card.vue:54` + `on-grid-section.vue:32` | +$215/sec(ticker 还单调漂移) | $18.6M/日 | vs #1 vs intro |
| 3 | `ref/code.vue:94` | This month paidOut $1.2M | $40k/日 | vs #1 vs intro |
| 4 | `store/app.ts:152/376` | paidToday 种子 1,247,893 + 每秒 +60~339 | $17.2M/日 | 零读者的第 4 套锚,随时可被复活 |
| 5 | `network-pulse-card.vue:58` | Phones 1.42M online | 第二套机队模型 | vs intro/trust/globe 的 28,432 |
| 6 | `ref/code.vue:92` + 海报 `posterGiftSub2` ×3 语 + `team.leaderboardHint` ×3 语 | 28,432 兼任「本月新增人数」「排行榜总人数」 | 同一数字三个角色 | 一眼看穿 mock |
| 7 | `store/app.ts:375` | activeDevices 每秒 +0~3(1s tick,App.vue:42) | +13 万台/日 | globe:197 / trust:27 活渲染,几分钟即与静态 28,432 矛盾 |

回源修正一处任务描述:**trust.vue:256 静态「28,432」本身无须改**——它与同页 store 值的矛盾根因是 #7 失控 ticker(校准成 ±1 抖动后矛盾自消);且该值是 admin 受管内容镜像(admin `i-tabs/data.ts:189` + 后台 PRD v4 §11.3),不动它即不牵跨仓 parity。

## What changes

**新增单源锚模块 `src/lib/platform-stats.ts`**(mock of `GET /api/platform/stats`,backend-replaceable):

```
FLEET_DEVICES = 28_432          // 机队锚(唯一设备口径)
FLEET_AVG_DAILY_USD = 24        // 公布可信档 ~$24/台/日(nexion_q1_q17)
DAILY_PAYOUT_USD  = 28_432 × 24 = 682_368     // 日付锚
PAYOUT_PER_SEC_USD = DAILY / 86_400 ≈ 7.9     // 派生
MONTHLY_PAYOUT_USD = DAILY × 30 ≈ $20.5M      // 派生
paidCumulativeNow()             // intro 时间锚公式原样迁移进来(种子 127,438,905 + anchor 2026-07-24)
```

各展示点全部改为从该模块**派生不缓存**:

1. `network-pulse-card.vue`:Paid today **$682K**(sub 涨幅 +8.2%→+1.9%,sparkline 序列同步重标);per-sec 改「锚 ± 对称抖动重算」显示 **+$7.9/sec**(弃累加型 useTicker,与 intro P1-3 修复同构;useTicker 本身保留,另有 2 个用户级消费者);Hubs 行值绑 `store.global.activeDevices`(label 改「Devices/在线设备」);**Phones 1.42M 行改口径为注册用户**:key `networkPhones`→`networkMembers`,「Members 1.42M · registered · +2.9% /mo」——与 trust「Active accounts 184,206」构成注册>活跃漏斗,与 #6 新增人数 41,286/月 ÷ 1.42M ≈ 2.9% 自洽(避免「累计设备」口径在同卡暴露 2% 存活比)。
2. `on-grid-section.vue`:footer 绑 store 设备数 + 常量格式化 +$7.9/sec。
3. `ref/code.vue`:paidOut **$20.5M**(锚×30);newJoiners **41,286**(28,432 退出人数角色);海报 `posterGiftSub2` ×3 语同值 41,286。
4. `store/app.ts` + `types.ts`:种子 `activeDevices: FLEET_DEVICES`;**删 paidToday**(字段+种子+tick,零读者已核);`todayIncrement` 更名 `activeJobs`(唯一读者 globe:198 渲染的就是 Active jobs),种子 1,247→**4,812**(与 pulse 卡「4,820 jobs/s」同量级,Little's law 自洽);tick 校准:activeDevices ±1 对称抖动(P=0.2/0.2,±24 夹箝)、activeJobs ±0~2 对称(±36 夹箝),消灭单调外推;平台抖动移出 miningPaused 门控(平台数字不随个人会话冻结)。GlobalStats 不持久化,零迁移风险(已核)。
5. `globe.vue`:读者跟随字段更名。
6. `intro.vue`:锚公式与 `devices = ref(28432)` 改 import lib(删本地副本,单源闭环)。
7. **死 key 清理 ×3 语**(运行时引用 0 已终审,verify scripts 引用 0 已核):`home.activeDevices`、`home.paidToday`、`home.paidToCreators`、`home.deviceOnline`、`home.devicesOnline`、`me.deviceOnline`、`me.devicesOnline`、`team.leaderboardHint`(前 1、后 1 为本次回源新发现,超出任务清单)。
8. **verify.sh 新增 `platform_stats_anchor` 哨兵**:`682368` 仅允许存在于 lib;`1247893`/`+$215/sec`/`$1.24M`/`paidToday` 全站 0 命中;pulse/on-grid/intro 的 lib import needle;三语 41,286 计数=3。交付前做红测(注回旧字面量必 FAIL)。

**Out-of-scope**:trust 页全部静态数字(Q3 Payouts $31.2M ≈ $347k/日,按 +27%/季增长曲线回推 ≈ 当前锚 $682k/日 ÷ 2,已核算自洽;TVL $847.3M / press $487M 为异维度指标);admin 工程 Q3 镜像(trust 不动故不牵);`nodes/countries/uptime` 零读者字段(无害后台形状,留);tech-money-card 个人收益 ticker(用户级);**28,432 锚值本身**(动锚=产品决策,牵 admin 三处镜像 + intro 累计公式,需另立任务)。

## Done-when(可证伪)

1. **互斥消灭**:home/intro/ref/globe 任取两个资金数字换算同维度偏差 <5%(锚系 682,368/日 · $20.5M/月 · $7.9/sec · 累计公式);28,432 全站只扮「在线设备」一个角色(人数角色 grep=0)。
2. **单源**:`682368` 在 src/ 唯一定义于 platform-stats;旧字面量(1247893 / +$215/sec / $1.24M / networkPhones)grep=0;store 无 paidToday。
3. **速率校准**:5173 实景观察 ≥60s,activeDevices 恒在 28,432±24 带内、activeJobs 恒在 4,812±36 带内且均可观察到双向变动(带宽判据,替代早版「净漂移 ≤±3」——对称游走 60s 期望漂移即 ~4/9,原判据统计上站不住,T1 实测 +4/−7 已按带宽口径复判 PASS);per-sec 围绕 7.9 无单调漂移;intro 累计值刷新不倒退(回归)。
4. **死 key**:8 key ×3 语删净,i18n mirror 门过(vi 若不在 en/zh mirror 门内,由哨兵计数兜底)。
5. **门**:vue-tsc 0 · verify.sh 全绿(含新哨兵 + 红测证据)· home/ref/globe/trust/intro 5 路由 console 0 · 三语实景抽查。

## Impact

页面:home(2 卡)/ ref / globe / intro。store:app.ts + types.ts(GlobalStats 形状变更,无持久化)。i18n:en/zh/vi(键改名 1、label 改 1、值改 1、删 8)。scripts:verify.sh +1 哨兵。PRD:§首页 network pulse / §ref 社证数字待 sync(nexion-prd-sync,主人确认后)。不变量:数字可信(强化)、mock 可接真(强化:去伪字段+锚模块即 API mock)、三语镜像(维持)、单源派生不缓存(新增机器门)。

## 实施拆解(M 级内联)

- [x] **ST1 锚模块 + store**:新建 platform-stats.ts;types.ts 删 paidToday/更名 activeJobs;app.ts 种子+tick 校准;globe 读者跟随。AC=Done-when 2/3 的 store 部分;增量 tsc 0。tester:注入观察 60s 抖动 + grep 断言。
  ↳ T1 PASS 4/4(`…-t1-test.md`;node 实测锚数学 9/9,60s 61 样本双向抖动)。回源三问:①服务单源目标 ✓ ②tester 观察「无界游走」→ 已补 ±24 夹箝(实现侧强化,非规格偏差)③后续计划成立 ✓
- [x] **ST2 home 双卡 + i18n 键**:pulse 卡四行改造 + on-grid footer + networkMembers/Devices 三语。AC=Done-when 1 的 home 部分 + 实景截图。tester:5173 home 黑盒。
  ↳ T2 PASS 4/4(`…-t2-test.md`;$682K/28,4xx 同读数/91s×16 采样速率 7.6-8.2 无单调/三语截图 assets/st2-*.png;旧值三语 0 命中)。回源三问:①✓ ②无偏差 ③✓
- [x] **ST3 ref + 海报 + intro 接源**:41,286/$20.5M、posterGiftSub2 ×3、intro import。AC=Done-when 1/2 的 ref/intro 部分 + 海报生成实测含新值。tester:ref+intro 黑盒。
  ↳ T3 PASS 4/4(`…-t3-test.md`;海报真生成 PNG 含 41,286;intro 累计与锚公式差 $4 且硬刷新单调不减;28,432±1 双向穿越)。回源三问:①✓ ②无偏差 ③✓
- [x] **ST4 死 key 清理 + 哨兵 + 红测**:8 key ×3 语;verify.sh 哨兵;红测演练记录。AC=Done-when 4/5。tester:verify 全绿 + 红测 FAIL 截图。
  ↳ T4 PASS 4/4(`…-t4-test.md`;三语 mirror 4209 keys 绿,vi 确认在机器门内)。tester 两条加固建议(下划线数字变体/import needle 收紧)已当场焊入哨兵并复验 PASS。红测三向:栽赃 +$215/sec→FAIL、移除→PASS、哨兵曾有机抓到实现者注释里的 28,432。回源三问:①✓ ②哨兵按 finding 加强(单调变强)③✓

每 ST 独立 tester 黑盒验收(实现方≠验收方),报告落同目录 `<slug>-t<N>-test.md`;全部过后 nexion-audit(功能性改动)→ done-review → 问主人 PRD sync。

## 审计与修订记录(2026-07-24)

- 机器门:vue-tsc 0 错;verify 330 PASS / 0 FAIL;i18n mirror en/zh/vi 4209 keys 绿。四 tester 独立黑盒全 PASS(T1-T4 报告见同目录)。
- skeptic 对抗审计:P0=0 / P1=2 / P2=10(报告 `…-audit.md`)。主人 2026-07-24 goal 授权「需拍板项分析后按最佳解直接执行」,两 P1 均本轮修复:
  - **P1-2 jobs 族整族漏出锚系**(修复):earn task-center「8,432 jobs live globally」→ 绑 store activeJobs;globe 区域抽屉值补 `/h` 单位 + 新 label `globe.jobsPerHour` ×3 语(与全网并发 tile 的「Jobs in flight」分辨);pulse 卡 sub「4,820 jobs/s」(=17.35M/h,vs 六区吞吐和 51,200/h 互斥 339×)→「51.2k jobs/hr」= 六区吞吐精确和;app.ts 种子注释改 Little's law 口径(4,812 并发 ↔ 51.2k/h ⇒ 中位任务 ~5-6 分钟)。
  - **P1-1 trust 季报「Q3 2026 · audited by PwC」季中即已审计悖论 + QTD 读法与锚 1.9× 互斥**(修复,采 Q2 方案):标签/报告名 Q3→**Q2 2026** ×3 语(键 q3*→qtr*);Devices 28,432→**27,150**(+12%,季末快照,当前在线 28,432 = 收官后 +4.8% 延续轨迹);Payouts $31.2M→**$47.0M**(+27%,增长曲线季积分,收口于日锚 $682K:QTD $16.4M + Q2 47 + Q1 37 + 启动季 ~27 ≈ 累计锚 $127.4M 闭环);admin 受管镜像 `i-tabs/data.ts` 同步同值,并在哨兵 check(6) 焊 trust↔admin 跨仓 value parity。
- P2 十条:采纳 8(P2-1 activeJobs ±36 夹箝+文档口径、P2-2 intro 设备 ±24 夹箝、P2-3 Done-when 3 改带宽判据、P2-4 MONTHLY_NEW_JOINERS 入 lib+ref 绑定、P2-5 哨兵消费符号 needle+28,432 仅 lib、P2-6 业务流程说明更新、P2-7 PRD 契约表 /api/platform/stats 行更新、P2-9 globalTimer 死累加删除、P2-10 平台抖动移出 miningPaused);**遗留 1**:P2-8 `sharePoster.*` 13 键零消费者死键(毗邻存量债,含休眠模板 networkMembers "{n} members"),待主人点头并入下批死键清理。
- 哨兵 v3:legacy 列表增 `8,432`(防前导数字误伤)/`jobs/s`/`q3*` 键/`Q3_FINANCIALS`;check(4) 升级为「import + 消费符号」双 needle;check(5) 每语计数 ==1;check(6) 跨仓 Q2 parity。

## 墨菲前置(动手前当它必崩去验)

1. vi.ts 是否在 i18n-key-mirror 机器门内——不在则删 key 漏 vi 无机器兜底 → ST4 显式核 + 哨兵计数。
2. 删 key 用内容匹配 Edit(三语行号各不同,禁行号/整文件 Write)。
3. 海报 canvas 文案变更后排版溢出 → ST3 真生成海报截图验(等宽数字,低风险仍验)。
4. pulse 卡 sparkline 序列忘记随值重标 → ST2 checklist 项。
5. intro 回归(累计倒退/抖动变单向)→ ST3 复跑 intro 既有 Done-when 2 条。
