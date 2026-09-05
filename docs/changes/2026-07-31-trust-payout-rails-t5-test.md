# T5 · 每日提现笔数限制 —— 独立验收报告

- 日期:2026-07-31
- 验收人:独立 tester(黑盒;未看实现方叙述,只按 AC 实测)
- 被测面:`Nexion-uniapp` 提现页 `#/pages/me/wallet-withdraw`(H5,全程 `?nx_device=off`)
- dev server:`http://localhost:5173`(既有进程,未重启)
- 机器门:`npm run type-check` = 0 错;`node scripts/selfcheck-fastlane.mjs` = 43 pass / 0 fail

## 总判定

**6 / 7 AC 通过,AC3 未通过。**

AC3(双标签页并发)拆成两个子场景:
- 「A 提交完 → B 未刷新再提第 2 笔」被正确拒绝 —— 通过,且证到了**计数只有落盘一份、没有各标签页的内存副本**;
- 「A、B 同一时刻点提交」—— **两单齐发**,上限 1 被绕过,3 轮 3 中复现。

另有 3 条 AC 之外的发现(1 条文案错、1 条机器门盲区、1 条口径观察),见文末。

大白话版:

| 事项 | 结果 |
|---|---|
| 做了啥 | 在真浏览器里真点真提交,把 T5 的 7 条验收标准逐条跑了一遍,外加对抗性复验(同刻并发、跨时区文案边界、账号隔离、大额、三语) |
| 结果咋样 | 6 条达标;1 条(并发)在「两个标签页同一秒点提交」时会同时放行两笔提现 |
| 要主人拍板啥 | 这条并发漏洞算不算 T5 的欠账:它是 mock 前端计数天然的非原子窗口,源码注释已声明真后台由服务端权威裁决;若认可「client 只做预判」的架构决策则可判为已知限制,否则需要在建单前先占额度 |

---

## 环境与假阴排除(先说这个)

按纪律记录 3 次「看起来是 fail、实为 harness 问题」的排除过程 —— 若不排除,会误报 3 条 AC:

| # | 现象 | 真因 | 处理 |
|---|---|---|---|
| 1 | 提交第 2、3 笔时点了没反应(单号/计数/余额全不动) | 用 hash 导航回提现页 = 同文档跳转,uni 页面栈里 `wallet-withdraw-tracking` 仍压在上层,**物理点击被上层页吃掉** | 换成带唯一 query 的整文档导航(`?nx_device=off&t5=…#/…`),并改用页面内 `el.click()` 直投元素,绕开遮挡 |
| 2 | AC5 注入的假时钟没生效(页面仍是真实时间) | `addInitScript` 只在**新文档**加载时跑,而我上一步是 hash 跳转 → 同文档,脚本没重跑 | 同上,整文档导航后假时钟正常生效(实测 `Date.now()` = `2026-07-31T23:59:00.905Z`) |
| 3 | 超限点提交后 NEX 从 1240 → 1340、账单 +1,疑似「被扣款」 | **背景噪声**:成就里程碑发币(`achievement/NEX/100`)。做了「静置 3.5s 不点击」的对照组,同样 +100 | 改用对照组区分;USDT 余额、提现账单数、单号在点击前后逐项不变 |

其余已排除的脆性:全程 `?nx_device=off`(不带会套 device-shell 假白屏);每个阶段用独立 browser context(localStorage 互不污染);fixture 中 `dailyWithdrawLimitCount` 是内存态配置,整文档重载后必须重设(已在每次导航后重设并回读确认);console error / pageerror 全程 0。

---

## 逐条 AC

### AC1 — 今日已达上限 → 按钮置灰 + 文案 + 下次可提时间 · PASS

对照组(今日 0 笔):`aria-disabled=false`,底色 `rgb(158, 220, 29)`(品牌绿),文案「提交提现申请」。

真提第 1 笔($50)后落盘(`nexgrid-withdraw-daily-count-v1`):

```json
{"default":{"dayIndex":20665,"count":1}}
```

单号 `null → WD-20260731-9675`,余额 `24856.56 → 24806.56`,跳转 `#/pages/me/wallet-withdraw-tracking`。

再进提现页(上限 1):

| 观测点 | 实测值 |
|---|---|
| `aria-disabled` | `true` |
| 按钮底色 | `rgb(31, 31, 31)`(可提时 `rgb(158, 220, 29)`) |
| 按钮文字色 | `rgb(107, 115, 133)` |
| CTA 文案 | `提交提现申请 今日提现次数已用完,明日 08:00 重置。` |
| 下次可提时间 | 解析到 `08:00`;底层 `nextDayResetAt` = `2026-08-01T00:00:00.000Z` = 本地 `Sat Aug 01 2026 08:00:00 GMT+0800` |

三语均渲染(限额=1、今日 1 笔):

```
zh  提交提现申请 今日提现次数已用完,明日 08:00 重置。
en  Submit withdrawal request Daily withdrawal limit reached. Resets tomorrow at 08:00.
vi  Gửi yêu cầu rút tiền Đã hết số lần rút hôm nay. Đặt lại vào 08:00 ngày mai.
```

时间点本身正确;但「明日 / tomorrow / ngày mai」这个日子标签在本地 00:00–08:00 窗口内会说错,见文末发现 F2。

### AC2 — 超限不建单不扣款 · PASS

达上限状态下点提交(`aria-disabled=true`),等 2.5–3.5s 后逐项对比:

| 观测点 | 点击前 | 点击后 |
|---|---|---|
| USDT 余额 | 24806.56 | 24806.56 |
| 提现账单数(type=withdraw & USDT) | 2 | 2 |
| `latestWithdrawal.id` | WD-20260731-9675 | WD-20260731-9675 |
| 落盘计数 | `{"default":{"dayIndex":20665,"count":1}}` | 同左(超限尝试**不消耗额度**) |
| 可提额度 `withdrawableUsdt` | 24856.56 | 24856.56 |
| 路由 hash | `#/pages/me/wallet-withdraw` | 未跳 tracking |

NEX 余额的变化经对照组证实为成就发币背景噪声(静置不点击同样 +100),与本次点击无关。

### AC3 — 双标签页并发,以落盘计数为准 · **FAIL**

**通过的部分(证据完整)**

1. 落盘为准,不存在各标签页的内存计数:整个实现里**没有内存计数器**,展示门与提交门都调 `readWithdrawCounter` 读同一张落盘表。
2. A 提交完成后,B 页(未刷新)再提第 2 笔被拒:单号 `WD-20260731-1738 → WD-20260731-1738` 不变、落盘计数仍 1、余额不变、提现账单数不变、未跳 tracking。
3. 提交时点确实穿透到落盘:在 B 页不刷新的前提下,直接调生产用的异步评估 `requestWithdrawalEligibility(...)`:

```
A 提交前,B 页评估: {"canSubmit":true, "dailyLimitReached":false,"route":"pass","diskCounter":null}
A 提交后,B 页评估: {"canSubmit":false,"dailyLimitReached":true, "route":"pass","diskCounter":{"dayIndex":20665,"count":1}}
```

**未通过的部分:同刻并发放行两单(3 轮 3 中)**

两页都停在提现页(今日 0 笔、上限 1、金额 $50),同一时刻各点一次提交:

```
轮 1: A单=WD-20260731-8902(跳转成功) B单=WD-20260731-8902(跳转成功)
      A账单refs=["WD-20260731-8902",…] B账单refs=["WD-20260731-5965",…]  ← 两个不同单号
      落盘计数={"default":{"dayIndex":20665,"count":1}}  余额 24856.56→各自 24806.56
轮 2: A账单refs=["WD-20260731-3395",…] B账单refs=["WD-20260731-1459",…]  落盘计数 count=1
轮 3: A账单refs=["WD-20260731-6556",…] B账单refs=["WD-20260731-4957",…]  落盘计数 count=1
```

结论:上限 1 的情况下**当天建了 2 张提现单**,两页都跳到了 tracking;落盘侧 last-write-wins,只留下其中一条账单、计数只 +1、余额只扣了一次 $50 —— 两单对一次扣款,账实不符。

根因(黑盒推断,`[INFERRED]` 置信 HIGH):判定是「读计数 → 判 → 建单 → 写计数」,读与写之间隔着 `requestWithdrawalEligibility` 的 600ms 合成延迟,且 `bumpWithdrawCounter` 挂在建单**之后**。两页的读都落在对方写之前,于是各自放行。窗口宽度 ≈ 600ms。

补充事实(不改变判定,供拍板参考):`withdraw-daily-count.ts` 自己的注释已写明「PROD:服务端按平台时区权威计数,client 这份仅作 UI 预判;真正的拦截以 POST /api/withdrawals 的返回为准」。即真后台的单事务天然关掉这个窗口。若主人认可「client 只做预判」是既定架构决策,本条可改判为「已知限制」;按 AC 字面(并发提交第 2 笔必须被拒)当前实测未达标。

### AC4 — 上限 1 → 3 当日立即生效 · PASS

在**同一个已打开的页面**里改 pinia 配置(不重载、不重登、不重启):

| 步骤 | 实测 |
|---|---|
| 改前(上限 1,今日 1 笔) | `aria-disabled=true`,文案「今日提现次数已用完…」 |
| 改成 3 后(同页面,600ms 内) | `aria-disabled=false`,底色回 `rgb(158, 220, 29)`,文案「提交提现申请」,限额说明同步变「每日限额:3 笔/日。」 |
| 真提第 2 笔 | 计数 `count:1 → 2`,单号 `WD-20260731-9675 → WD-20260731-7425`,余额 `24806.56 → 24756.56` |
| 真提第 3 笔 | 计数 `count:2 → 3`,单号 `→ WD-20260731-6008`,余额 `24756.56 → 24706.56` |
| 第 4 笔 | `aria-disabled=true` +「今日提现次数已用完,明日 08:00 重置。」(不是无限放行) |

### AC5 — 23:59 与 00:01 分属两天 · PASS

用注入假时钟(`Date.now` 平移,整文档重载后生效)在真页面上跑:

| 步骤 | 页面时钟 | 实测 |
|---|---|---|
| 23:59 提第 1 笔 | `2026-07-31T23:59:00.905Z` | 成功;落盘 `{"dayIndex":20665,"count":1}`(当日日序 20665) |
| 同日再提(对照组) | `2026-07-31T23:59:01.375Z` | `aria-disabled=true` +「今日提现次数已用完」 |
| 跨到 00:01 | `2026-08-01T00:01:00.849Z` | `aria-disabled=false`,文案回「提交提现申请」 |
| 00:01 提第 2 笔 | 同上 | 成功;落盘 `{"dayIndex":20666,"count":1}`,单号 `WD-20260731-9304 → WD-20260801-7383` |

跨日归零是读时判定(日序对不上即 0),不依赖定时任务;纯逻辑侧「昨日计数不影响今天」也在哨兵里有固定靶。

### AC6 — 「每日限额 X 笔/日」从配置插值 · PASS

同一页面不重载,连改三次配置,DOM 逐次实读:

| 配置值 | DOM 实读 |
|---|---|
| 1 | `每日限额:1 笔/日。` |
| 3 | `每日限额:3 笔/日。` |
| 7 | `每日限额:7 笔/日。` |

三语同样插值:`Daily limit: 1 per day.` / `Giới hạn mỗi ngày: 1 lần.`,改成 5 时 en 变 `Daily limit: 5 per day.`。不是写死的 1。

### AC7 — 哨兵全绿 + 红测有效 · PASS

基线:`node scripts/selfcheck-fastlane.mjs` → **43 pass / 0 fail**,exit 0。哨兵已接进机器门(`scripts/verify.sh:103`,§1.6 money selfchecks 里含 `fastlane`)。

红测(备份/还原全程 `cp`,**未用 git checkout**;原文件 sha256 `7cb98615327fe017d57e5d544b194cf337911baf682127eb0a4ec7b55044b3ff`):

| 变体 | 注入内容 | 哨兵结果 |
|---|---|---|
| R1 去掉限额判定 | `dailyLimitReached` 恒 `false` | exit 1,41 pass / 2 fail(首条:今日 1 笔 / 上限 1 → 不可提) |
| R2 判定还在但不挡提交 | `canSubmit` 里摘掉 `!dailyLimitReached` | exit 1,41 pass / 2 fail |
| R3 跨日不归零 | `todayCountFrom` 无视 `dayIndex` | exit 1,41 pass / 2 fail(首条:落盘计数器是昨天 → 归零) |
| R4 差一错误 | `>=` 改 `>` | exit 1,42 pass / 1 fail |

每个变体注入后都回读确认「已落盘」,再 `cp` 还原并核 sha256;4 次还原全部 byte-identical,末轮哨兵回到 43 pass / 0 fail。备份文件保留在 scratchpad(可回滚)。

---

## AC 之外的发现

### F1 [P1 · 钱] 同刻并发可绕过每日上限(同 AC3 未通过项)

见 AC3。证据:3/3 复现,两单不同单号、两页都跳 tracking、落盘只留一条账单、余额只扣一次。
可选修法(**未修**,仅列):① 把「占额度」提前 —— 评估通过后**同一 tick 内先 bump 再建单**,建单失败回滚,窗口从 600ms 缩到微秒级;② `navigator.locks` 或带版本号的 CAS 写,把读-判-写串行化;③ 明确接受为 mock 限制并在 PRD 注明由服务端事务兜底。

### F2 [P2 · 文案] 「明日 X 重置」在本地 00:00–08:00 窗口说错日子

固定靶(注入时钟,时区 Asia/Shanghai):

```
page 时钟 : Sat Aug 01 2026 02:00:01 GMT+0800  (2026-07-31T18:00:01Z)
重置时刻 : Sat Aug 01 2026 08:00:00 GMT+0800  (2026-08-01T00:00:00Z)   ← 与「现在」同一本地日
CTA 文案 : 提交提现申请 今日提现次数已用完,明日 08:00 重置。            ← 说成了「明日」
```

用户在本地凌晨 2 点看到「明日 08:00 重置」,实际今天早 8 点就能提。根因:平台日按 UTC 切(`platformDayIndex`),而「明日」是写死在 i18n 串里的日子标签,没跟着真实日期差走。三语同源:`en: Resets tomorrow at {time}` / `vi: Đặt lại vào {time} ngày mai`。窗口宽度 = 平台时区与用户本地时区的时差(UTC+8 下每天 8 小时,UTC+7 下 7 小时)。

### F3 [P2 · 机器门盲区] 计数接线没有任何机器门

把 `src/store/withdrawal-eligibility.ts` 里 `commitWithdrawal` 中的 `bumpWithdrawCounter(accountKey, Date.now());` 注释掉(整个每日限额就此变成永不生效的空头承诺),实测:

```
selfcheck-fastlane → exit=0 · 43 pass / 0 fail
selfcheck-feegate  → exit=0 · 14 pass / 0 fail
```

`tsconfig.json` 未开 `noUnusedLocals`,遗留的未用 import 也不会让 `type-check` 变红;`verify.sh` 里 grep 不到任何 `dailyLimit / withdraw-daily / bumpWithdrawCounter` 相关判据。即:**判定层守得很严(4 种改法全被红测抓到),但「判定有没有被接上」零覆盖**,只有本轮 runtime 走查覆盖到。建议补一条 runtime 哨兵(参照 `scripts/spec7-risk-gate-runtime.mjs` 的形态:真页面里提一笔 → 断言落盘计数 +1 → 再提断言被拒)。已按纪律 `cp` 备份并还原,sha256 一致。

### F4 [P3 · 口径观察] 平台日按 UTC 切,不是用户当地 0 点

mock 里 `platformDayIndex = floor(ts / 86400000)` = UTC 日。越南用户的重置时刻是当地 07:00、中国用户 08:00,都不是「当地 0 点」。源码注释已声明 PROD 由服务端按平台时区裁决,这里只记录以便与 PRD 口径对齐(若平台时区定为 Asia/Ho_Chi_Minh,F2 对越南用户消失,但对跨时区用户仍在)。

---

## 顺带核过的正交面(均正常)

- **账号作用域**:`bumpWithdrawCounter("other-user@t5.test", …)` 后整表 = `{"other-user@t5.test":{...}}`,本账号 `readWithdrawCounter` 仍为 `null`,页面 `aria-disabled=false` —— 别号的计数不影响本号,per-user 作用域成立。
- **大额路径**:$200(超小额免审线 $50,走非快车道)第 1 笔成功、第 2 笔被拦,计数与余额均正确 —— 限额不只对小额免审生效。
- **建单口径**:审核类路由(manual/delay)建单即计数,与「驳回单仍占额度、防刷」的设计一致(哨兵有固定靶)。
- **配置为 0**:哨兵覆盖「上限 0 = 未配置 → 不限制」,不会被坏配置把提现锁死。
- **console**:全部阶段 pageerror / console error = 0。

## 复现方式

1. dev server 起在 5173,浏览器开 `http://localhost:5173/?nx_device=off#/pages/me/wallet-withdraw`
2. fixture:`useWalletPairing().complete({address, network})` + `useRiskDisclosure().accept()` + `useConfig().config.withdrawRules.dailyWithdrawLimitCount = 1`
3. 填金额 → 提交 → 回提现页(**必须整文档重载,hash 跳转会被 tracking 页遮挡**)→ 再提即见置灰
4. 并发复现:同 context 开两个 tab,都停在提现页且都填好金额,`Promise.all` 同刻点击两页的 `.nx-withdraw-submit-cta`
5. 落盘键:`nexgrid-withdraw-daily-count-v1`(uni 包装格式 `{type:'object',data:{…}}`)

驱动脚本用完即删,未落进工程;临时改动(红测 5 次注入)全部 `cp` 还原并核过 sha256。

## 一句话总结

限额本身是真的 —— 按账号+平台日落盘计数、达上限置灰不建单不扣款、跨日自动归零、后台调参当场生效、限额文案三语从配置插值、判定层 4 种改法红测全抓;唯一没守住的是**两个标签页同一秒点提交会齐发两单**(3/3 复现,落盘只留一条账单、余额只扣一次),外加「明日 X 重置」在本地凌晨窗口说错日子、以及计数接线本身没有任何机器门。

裁决: FAIL(1 条)
