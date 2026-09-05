# 平台单源锚改造 — 对抗证伪审计报告(skeptic)

- 日期:2026-07-24 · 审计人:nexion-audit skeptic agent(只读证伪,未改任何源文件)
- 对象:`2026-07-24-platform-stats-single-anchor.md` 全改造(4 tester 已验区不重复)
- 方法:静态回源 + 全站同形 grep + 跨仓镜像核对 + 哨兵纸面红队。未起浏览器(全部发现均为字面量/代码级可证,运行时观测 4 tester 已覆盖),无残留进程需清理。
- **总判:P0=0 · P1=2 · P2=10**。锚系核心(资金/机队/人数三族)成立;**jobs 族与 trust Q3 两处漏出锚系**。

---

## 六个进攻面 verdict

### 1. 深层同形漏网 — **击破(2 处,均 P1)**

- `src/components/earn/task-center.vue:19` 硬编码 **"8,432 jobs live globally"**(三语 key `earn.jobsLive`,en:505/zh:493/vi:506,明示"全球"口径)vs globe tile `activeJobs` 4,812 → 同维度(全网并发任务)偏差 **+75%**。→ P1-2a
- `src/mock/globe-regions.ts` 六区 `jobsPerHour` 求和 **51,200/h** vs pulse 卡 sub "4,820 jobs/s"(=17.35M/h)→ **339×**;且 `globe.vue:161-162` 把区域 per-hour 值(Asia 21,460 → "21.5k")渲染在与 tile **相同的 `t.globe.activeJobs` 标签**下,同页 "Active jobs 21.5k(单区)" > "Active jobs 4,812(全网)",零计算可见。诚实标签 `globe.regionJobs`("{n} jobs / hour")只用在同抽屉 `globe.vue:170` 的脚注——同值双标签。→ P1-2b/c
- 其余族**未击破**:globe 六区 devices 求和 28,540 vs 28,432(0.4% ✓);ref `41,286/1.42M=2.907%` ↔ pulse sub "+2.9% /mo" ✓;`$20.5M/月` ↔ 累计 `$127.4M`(≈187 等效天,与 press 2025-12/入驻 Jan 2026 时间线相容)✓;Members 1.42M ↔ trust Active accounts 184,206(注册>活跃漏斗,13%)✓;nova 队列 "812 jobs"(细分池深度)、techVsYesterday "142 jobs settled"(个人)、faq "$45/day"(单 SKU)、leaderboard/products/events/tokens 全为用户/SKU/代币维度,不与锚同维。
- **已扫关键词清单**(证覆盖面):数字形 `[0-9]{1,3}(,[0-9]{3})+`、`\d+(\.\d+)?[KMB]`、`\$\d+` 全量抽取 en/zh/vi + `src/mock/**`(20 文件逐一归维);词形 `jobs live|live jobs|jobs/s|jobs / hour|jobsPerHour|members|customers|accounts|joined|new joiners|paid out|total paid|payout|per day|/sec|monthly|devices online|active nodes|uptime|countries`;定点核对 `28,432|28432|28_432`(仅 lib+trust ✓)、`1.42M`(仅 pulse 卡;tokens.ts priceUSD 1.42 为 NEX 价格异维)、`682|20.5|4,812|4,820|41,286|184,206|31.2|8,432`。nova/stella 话术(nova-templates/conversations/faq)无平台总量口径数字与锚冲突。
- 边缘观察(不立案):trust `nexAnchorSuffix "$4.2M monthly volume"`(市场成交)vs swap 池上限 "$20,000/day 平台池"(站内额度)——异场地异口径可辩护,并置有联想风险,留意即可。

### 2. 下游耦合 — **基本未击破(文档侧 2 个 P2)**

- `app.global` 消费者**全量枚举**(`app.global`/`.global.`/`global.value.`/storeToRefs 四形态):`network-pulse-card.vue:77` · `on-grid-section.vue:31` · `globe.vue:196-198` · `trust.vue:212+27`(hero 活值)+ store 自身(app.ts tick)。无第五个;无 storeToRefs 解构。旧字段引用 scripts/** = 0(verify.sh 之外无任何 .mjs/walkthrough 引 paidToday/todayIncrement/networkPhones/networkHubs)。
- admin 镜像:`Nexion-admin-prototype/app/components/domain-views/i-tabs/data.ts:185-191` FINANCIALS_FIELDS(184,206/28,432/$31.2M/$4.87M)与 trust Q3 逐位一致,本次未触 → 跨仓 parity 维持 ✓;admin 全仓无 1,247,893/$1.24M/paidToday 残针(data.ts:23 "weeklyExposures 1.24M" 为曝光量异维巧合,非镜像)。
- 击破点:`docs/业务流程说明.md:252` 仍写「activeDevices、paidToday、todayIncrement 加小随机量」——现行为文档失真(P2-6);PRD v3.7 数据契约表(root `PRD/…:3516` + repo 副本 `:3515`)`/api/platform/stats` 行仍列 paidToday 且源指针指向已退役 `lib/store/index.ts:182-187`,而 change doc Impact 只点名 §首页/§ref 两处 sync——契约表为第三处易漏(P2-7)。PORT-LEDGER 两处旧字段为迁移史记录,放行。

### 3. 数字可信自曝量化 — **击破 1(P1-1),其余成立**

| 检验 | 计算 | 结论 |
|---|---|---|
| 682,368/28,432 = $24.00 整 | UI 只显 "$682K"(`Math.round(/1000)`)→ 用户可得 682000/28432=$23.99,非整 | 不可一步戳穿,成立 |
| 41,286/1.42M | =2.907% ↔ sub "+2.9% /mo" | 自洽 ✓ |
| $20.5M/月 vs 累计 $127.4M | 127.4/0.682 ≈ 187 等效天,配 +27%/季史(8 季几何和 ≈ $125M)| 自洽 ✓ |
| 4,812 并发 vs 4,820 jobs/s | Little's law W≈1.0s(微推理任务)| 自洽 ✓——但被 earn 8,432 第三值破坏(P1-2a) |
| **trust Q3** | q3Label 三语均 **"Q3 2026"**(en:3122/zh:3065/vi:3053)+ **"audited by PwC"**;今天 2026-07-24 = Q3 2026 第 24 天。QTD 读法:$31.2M÷24d=**$1.30M/日** vs 锚 $682K/日 = **1.9×**(旧锚 $1.24M/日下偏差仅 4.7%——本次日流水减半后被撕裂,属**重构新生互斥**);完整季度读法(change doc 自洽核算的前提)与页面自印 "Q3 2026"+当日日期矛盾,进行中季度"已审计"不成立,且 Q3 静态 "Devices online 28,432 (+12%)" 与 hero 活值 28,432±24 逐位同 = 季中零增长自曝。另:$31.2M÷(92d×28,432 台)= **$11.9/台/日**,同页可算,为公布档 ~$24 之半 | **P1-1**:out-of-scope 判语「已核算自洽」的算术前提(完整 92 天季)被渲染文本证伪 |

### 4. intro 回归对照 — **未击破**

对照 `2026-07-24-intro-stats-cumulative.md` Done-when 逐条:①「今日已付/paid today」0 命中,`statsPaidTotal` 三语在位(en:110/zh:99/vi:111),`statsDevices` 带「在线」三语 ✓;②锚公式**逐字迁移**(seed 127_438_905 / anchor `Date.UTC(2026,6,24)` / rate DAILY/86_400_000,lib L30-32),`Math.max(0,…)` 保单调不倒退 ✓,±14/1.8s 速率不变 ✓;③设备 ±1 双向(P=0.25/0.25,intro.vue:193-195)✓;④`.intro-stats` flex-wrap(L312)+ text-wrap:pretty(L288)未被重构剥掉 ✓;`statsPaidToday` 全站 0 ✓。唯一瑕疵:intro 本地 devices 游走未随 store 加 clamp(P2-2,非 intro Done-when 项)。

### 5. 组件生命周期与状态 — **未击破(2 个 P2 观察)**

- 计时器清理三处齐全:pulse `perSecTimer`(:67-69)、intro `timer`(:198-200)、globe `pulseTimer`(:239-241)均 onUnmounted clearInterval ✓。
- miningPaused:`tick()` 早退冻结**平台级**抖动(app.ts:373),而 pulse 卡组件级 per-sec 计时器继续跳——踢出→reLaunch kicked 页窗口(~1s)内「设备数冻结 + 速率仍动」;语义上平台数字本不应受个人会话门控(P2-10,幅度 ±1/±0.3 观感极微)。未登录态到不了 home(auth guard),store 种子恒在,无 undefined 渲染面。checkSession 活跃会话自动 resumeMining ✓。
- `activeJobs` 无界游走:±24 夹箝只落在 activeDevices(T1 观察意见的字面修复),activeJobs 步长 {−2..+2} 无上界 clamp——8h 挂机 σ≈240(≈静态 "4,820 jobs/s" 的 5% 边界),周末级 12%(P2-1)。

### 6. 哨兵可绕性 — **部分击破(改进项,当前 0 违例)**

独立复跑各 check 的等价 grep:5/5 当前全绿(682368/127438905 仅 lib;28432 仅 lib+trust;legacy 11 pattern 0 命中;5 消费者 import 在位;41,286 三语 3/3)。下划线变体 ✓ 已含。纸面绕过:
- **(a) import needle 只验路径不验符号**:消费者保留 `import { PAYOUT_PER_SEC_USD }` 同时把日付/月付改回硬编码近似值("$683K"/"$21M")→ 全绿。这是最现实的回归路径(改样式顺手写死)。
- **(b) trust.vue 整文件白名单**:check(3) `grep -vE …trust\.vue` → trust 内新增第二个 28,432 角色(如文案「28,432 members」)不可见。
- **(c) 近似值/新造值类**:683000、"$0.68M"、全角逗号 `28,432` 等不在 pattern 表——字面量哨兵的固有极限,靠 (a) 的符号 needle 缓解。
- 41,286 的 check(5) 是文件存在性(`grep -l`)非计数,且不含 `ref/code.vue:92` 的第 4 份手抄(P2-4)。
- T4 红测已做(注回旧字面量 FAIL),不重复;'paidToday' 无 `-i` 属必要设计(避伤 networkPaidToday),T4 论证成立。

---

## 缺陷清单

### P0(崩坏)— 无

### P1(明显矛盾/回归)— 2

| # | 位置 | 问题 | 修法建议 |
|---|---|---|---|
| P1-1 | `trust.vue:253-258` Q3_FINANCIALS + i18n q3Label/q3Suffix ×3 语;admin 镜像 `i-tabs/data.ts:185-191` | "Q3 2026 financials · audited by PwC" 于 2026-07-24(Q3 第 24 天)不可能已审计;Payouts $31.2M 按 QTD 读 = $1.30M/日,与新锚 $682K/日 互斥 1.9×(旧锚下曾自洽 4.7%,**本次改造把它变成了活着的旧锚遗迹**);Devices 28,432 与 hero 活值逐位同 = 季中零增长;$31.2M÷92d÷28,432 = $11.9/台/日 ≈ 公布档之半,同页一步可算 | 另立小任务(动 trust 需连 admin 镜像 + walkthrough 断言,跨仓,需主人拍板):①标签改**已完结季度**(建议 "Q2 2026",zh「2026 Q2 财报」)②Payouts 改锚曲线一致值(Q2 2026 ≈ 91d × ~$600K 日均 ≈ **$54.6M**,增速改 +18~20%)或整块按增长曲线重标 ③Devices 行改 Q2 季末口径(如 25,4xx,与 +12% 自洽)④admin data.ts 同步同值 |
| P1-2 | a) `earn/task-center.vue:19`+`earn.jobsLive` ×3 语 b) `globe.vue:161-162` c) `mock/globe-regions.ts` jobsPerHour ×6 | **jobs 族平台总量整族漏出锚系**,三值互斥并存:earn "8,432 jobs live globally" vs globe tile 4,812(+75%);globe 抽屉把 per-hour 值(21.5k)渲染在与 tile 相同 `t.globe.activeJobs` 标签下(单区>全网,同页零计算可见);六区求和 51,200/h vs "4,820 jobs/s"=17.35M/h(339×)。change doc 断言 activeJobs「唯一读者 globe:198」——同文件 :162 同标签第二渲染点与 earn 页均漏扫 | 收进锚模块:`CONCURRENT_JOBS = 4_812`(或派生自 JOBS_PER_SEC×median W)+ `JOBS_PER_SEC = 4_820`;earn :19 改绑常量;globe 抽屉大数改用 `regionJobs` 标签或改渲染区域**并发**任务数(新 mock 字段,sum≈CONCURRENT_JOBS);REGIONS jobsPerHour 重标定为 JOBS_PER_SEC×3600 按 devices 占比分摊(Asia ≈ 7.84M/h)。哨兵补 `8,432` 入 legacy 表 + jobs 常量 lib 圈禁 |

### P2(瑕疵/改进)— 10

| # | 位置 | 问题 | 修法 |
|---|---|---|---|
| P2-1 | `app.ts:385` | activeJobs 无界随机游走(±24 夹箝只修了 activeDevices——T1 观察的「修一处」;长挂机漂离 4,820/s 静态 sub);顺带实现步长 {−2..+2} 与 change doc 文本「±1~3」不符 | 同款 clamp `4812±36`;doc 文本改「±0~2」 |
| P2-2 | `intro.vue:193-195` | 本地 devices 游走(P=.25/.25)无 clamp——同类第三处,store 修了 intro 没跟 | clamp `FLEET_DEVICES±24` 或改读 store |
| P2-3 | change doc Done-when 3 vs T1 报告 | 「净漂移 ≤±3」被 T1 实测 +4/−7 打穿,tester 自放宽为 ±5/±60 判 PASS;判据统计上站不住(60s 期望 |漂移| ≈3.9/8.7) | Done-when 3 文本改带宽判据(如 devices∈锚±24、jobs 净漂 ≤±3σ)并补记验收口径 |
| P2-4 | `ref/code.vue:92` + posterGiftSub2 ×3 | 41,286 四份手抄;check(5) 只验三语文件存在性,不计数、不含 ref → 单边改动静默漂移 | `MONTHLY_NEW_JOINERS` 提升进 lib + 仿 check(2) 圈禁;至少补 ref needle |
| P2-5 | `verify.sh:1360-1363` | check(4) 只验 import 路径不验消费符号(留 import 硬编码近似值全绿);check(3) trust.vue 整文件白名单(文件内新增角色不可见) | 每消费者符号 needle(pulse:DAILY_PAYOUT_USD·ref:MONTHLY_PAYOUT_USD·intro:paidCumulativeNow·on-grid:PAYOUT_PER_SEC_USD);trust 28,432 pin count==1 |
| P2-6 | `docs/业务流程说明.md:252` | 仍写 paidToday/todayIncrement 加随机量——现行为描述失真 | 改为「activeDevices/activeJobs 对称抖动,锚见 platform-stats.ts」 |
| P2-7 | PRD v3.7 契约表 root+repo `:3515/3516` | `/api/platform/stats` 行仍 paidToday 口径 + 指向已退役 `lib/store/index.ts`;change doc Impact 未点名此行 | nexion-prd-sync 时**连同契约表**改(字段 activeDevices/activeJobs/…,指针 src/lib/platform-stats.ts) |
| P2-8 | i18n `sharePoster.*` ×3 语(en:2597-2610) | 整命名空间 13 键零消费者(含休眠人数模板 networkMembers "{n} members")——存量死键债,毗邻本次 8 键清理未入清单 | 并入下次死键清理(主人点头后) |
| P2-9 | `app.ts:46/378` | `globalTimer` 只加不读(T1 已提,仍在) | 删 |
| P2-10 | `app.ts:373` + pulse 卡 | miningPaused(会话态)冻结平台级抖动,组件级 per-sec 仍跳——踢出窗口观感不一致;平台数字不应受个人会话门控 | global jitter 移出 miningPaused 早退(或接受,影响 ±1 量级) |

---

## 结语

单源锚在**资金/机队/人数**三族内完成度高(互斥消灭、单源圈禁、抖动对称、死键清净、跨仓 parity 未扰动均经受住证伪);被打穿的是任务边界的划法:**jobs 族整族没进「运营数字」的枚举**(P1-2),**trust Q3 的 out-of-scope 判语建立在被页面文本否定的算术前提上**(P1-1)。两者都属「不变量漏一面/维度盲区」元模式,建议 P1-2 本轮修复循环内收掉(纯 uniapp 侧),P1-1 因牵 admin 镜像与产品数字口径,单独立项报主人拍板。
