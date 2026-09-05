# B1 独立设计审查 · 镜头=文字规范

> **本页判定目标 = 五 tab 主链路(index / earn / store / team / me + app-chassis)的文字落地是否符合《UI 规范 02-文字规范》**:14 档字号合法集 {56,44,36,34,26,20,15,13,12}(§2)、字重上限 600(§3)、小字边界与「理解/决策/确认/阅读」最低 body.s 13(§4)、数字排版 nowrap(§6)、Mono 7 词测试(§7)、禁孤字断行(§8)。
> **来源:UI 规范 02 明写**(上述均为规范正文条款,§3/§4/§7/§8 带 🔴)。
> **我的推断部分**:P0/P1/P2 严重度分级判据、「教条 vs 真问题」的甄别、以及第 ③ 节全部条目 —— 规范未定义严重度,分级是我按「主人据此会不会做错决策 / 用户是否真的读不到」推的。

**审查方式**:源码全量扫描(103 文件:5 页面 + 96 组件 + app-chassis)+ Playwright 实景 `getComputedStyle` 实测(390×844,en / zh 双 locale,console error = 0)。未修改任何文件。

---

## ① 档外字号分布(按组件聚合)

**口径**:合法集 = 14 档的 9 个字号值 {56,44,36,34,26,20,15,13,12}。统计对象 = 上述 103 文件里的 inline `style` 与 `<style>` 块 `font-size`(UnoCSS 任意值 `text-[Npx]` 与 Tailwind `text-xs/sm/lg` 类在本批**实测为 0 处**,已交叉验证 —— 本面 100% 走 inline/CSS,不存在第二字号来源)。

| 分组 | 涉及文件数 | 档外总数 | <12px 小字债 | 12.5–14 中间档 | ≥16 档外大字 | 最重文件 |
|---|---:|---:|---:|---:|---:|---|
| earn(收益) | 8 | 80 | 58 | 13 | 9 | `device-card-pc.vue` (40)、`task-center.vue` (12) |
| index(首页 + home/) | 15 | 49 | 27 | 15 | 7 | `conversion-banner.vue` (8)、`day-one-quest-card.vue` (6) |
| me(我的) | 12 | 39 | 26 | 8 | 5 | `topup-card-form.vue` (10)、`wallet-card.vue` (6) |
| store(商城) | 13 | 33 | 20 | 11 | 2 | `card-payment.vue` (8)、`chain-payment.vue` (7) |
| team(团队) | 5 | 14 | 9 | 4 | 1 | `share-poster-sheet.vue` (7)、`share-channel-sheet.vue` (3) |
| chassis(外壳) | 1 | 4 | 2 | 0 | 2 | `app-chassis.vue` (4) |
| **合计** | **54 / 103** | **219** | **142** | **51** | **26** | — |

**按值分布**(档外部分,处数):

| 值 | 11.5 | 11 | 10.5 | 12.5 | 13.5 | 10 | 30 | 18 | 14 | 32 | 16 | 26→已在档 | 其它(17/19/22/28/48) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 处数 | 56 | 49 | 29 | 26 | 17 | 8 | 7 | 6 | 8 | 4 | 3 | — | 各 1–2 |

**两点必须点名(不要当成"只是档外"):**

1. 🔴 **86 处落在 10 / 10.5 / 11 px**(8+29+49)。规范 §4 明写「10px / 11px **不作为正式设计字号**,仅可用于不可见标注 / 开发调试,**不进入生产界面**」—— 这不是"档外就近归并"级别的债,是带 🔴 的硬边界破例。实测五 tab **全部**都有可见的 10–11px 文本。
2. 现行机器门**不拦**这一层:`scripts/dom-qa.mjs` 的 `GATE_FONT = 10`、`CENSUS_FONT = 12`,10–12px 只出 `info` 普查、不 gate(源码注释:「9 档过渡期不 gate」)。所以这批债只能靠 B1–B8 人工迁移收,verify 绿 ≠ 这项合规 —— 迁移后需按 TYPO-MIGRATION-MAP 风险面 5 同步收紧 `GATE_FONT` 到 12。

---

## ② 正交问题清单(映射表未覆盖)

### P0 — 破规范铁律

| # | 位置 | 违反 | 证据(实测) | 建议 |
|---|---|---|---|---|
| **P0-1** | `src/pages/store/store.vue:54` | §7 🔴 Mono 7 词测试 + 明令禁用「促销 callout 整句」 | `t.store.pageFooter` = "Fully managed · zero shipping · 99.9% uptime SLA" —— **9 词**,实测 `font-family: JetBrains Mono`, 12px, 346×16 可见 | 去掉 `font-mono-tabular`,改 `font-family: var(--font-v5)`;整句本就不该等宽 |
| **P0-2** | `src/components/home/tech-money-card.vue:45` | §7 🔴 Mono 7 词测试(混合内容整句) | `t.home.techVsYesterday` = "↑ +5.2% vs yesterday · 142 jobs settled" —— **8 词**,实测 JetBrains Mono / 12px / 281×16 | 同上换 `--font-v5`;若想保留数字对齐,只给 `+5.2%`、`142` 套 `.font-mono-tabular` 子 span |
| **P0-3** | `src/components/team/invite-earn-card.vue:29`(文案 `en.ts:1759 invitePromoChip`) | §7 🔴 Mono + 促销 callout 整句 | "Limited time · 2× bonus this week" —— **7 词**,实测 JetBrains Mono / 11.5px / 228×15 | 换 `--font-v5`;这是转化 chip,等宽读起来像日志行 |
| **P0-4** | `src/components/earn/capacity-explainer-sheet.vue:12`<br>`src/components/me/tradein-ladder-sheet.vue:11` | §3 🔴 字重上限 600 | 源码 `font-weight: 650`,共 2 处(全仓五 tab 面内**仅此 2 处** >600;`font-bold` / 700 / 800 / 900 实测 0 处) | 改 `600`。视觉差异接近不可见,但它是 🔴 字面破例且是 2 行改动,没有理由留着 |

### P1 — 明显影响阅读

| # | 位置 | 违反 | 证据(实测) | 建议 |
|---|---|---|---|---|
| **P1-1** | `src/components/app-chassis.vue:799-804` `.nx-tab__label` | §2 `typography.tab.label` = **12 / 14 / 600** | 实测五 tab 全部 `fs=12, line-height=normal, font-weight=500` —— 字重差一档、行高缺失 | 补 `font-weight: 600; line-height: 14px`。全局底 tab,每屏都在,改一处收全站 |
| **P1-2** | `src/components/store/tradein-window-banner.vue:18` | §4 🔴 需「决策」的内容最低 body.s 13 | 以旧换新决策正文 12px / **23 词** / 实测 312×51 = 换行 3 行:"Upgrade to NexGridRack P1 for about $3,599.75 more. Credit is based on lifetime output…" | 升 13 / 18;这是掏钱决策的唯一说明,12px caption 档不该承载 |
| **P1-3** | `src/components/earn/task-center.vue:67` | §4 🔴 + §4 10/11px 不进生产 | 操作指引 "Last 0 jobs · Tap any row to open its Proof-of-Compute receipt."(12 词)实测 **11px** / lh=normal | 升 13 / 18。这是教用户怎么用的指令文本 |
| **P1-4** | `src/components/earn/task-center.vue:70` | §4 🔴 | 空态文案 "No completed tasks yet — your first one is on the way."(12 词)实测 **11.5px** | 升 13 / 18 |
| **P1-5** | `src/components/store/product-card.vue:76` | §4 🔴 + 内容被截断 | 购买决策关键行 `cardHighTierLine` = "Books higher-tier tasks: {pool}",实测 **11px** + `truncate` → `white-space: nowrap`,盒宽 **385px / 368px 溢出于 390 视口**,4 张卡全部被省略号切掉 | 升 13 并去 `truncate` 改两行显示;算力池是选型依据,不能既小又被剪 |
| **P1-6** | `src/components/home/conversion-banner.vue:179 / 196`(`bannerSub` 11.5px)| §4 🔴 | "Tap to claim a device discount" 实测 11.5px,**index / earn / store / me 四 tab 均可见** | 升 13;这是 CTA 的行动指令,不是状态标签 |
| **P1-7** | `src/components/home/market-board-card.vue:33` | §6 🔴 数字+单位原子必须 `white-space: nowrap`,永不内部断行 | `volText(r)` 11px,父列 `min-w-0` 无 nowrap,实测 **40×28 = 断成 2 行**,5 行行情**全部**中断("vol 142k/h" → "vol" / "142k/h") | 加 `white-space: nowrap`(同组件 line 37-40 那列已有 `whitespace-nowrap`,照抄即可 —— 属漏一处,不是没有先例) |
| **P1-8** | 全面(五 tab) | §8 🔴 禁孤字断行「容器 `text-wrap: pretty` + 原子 nowrap 双保险」 | 全仓 `text-wrap: pretty` 仅 9 处,**五 tab 主链路 0 处**;实测所有节点 `text-wrap: wrap`。已产生实害:`0-day streak` 10px 在 36×26 盒内断成 2 行(index) | 在正文/caption 容器层统一挂 `text-wrap: pretty`;当前 verify **没有**这条哨兵(grep `orphan/nowrap/pretty` 于 `scripts/verify.sh` = 0 命中),建议随修补挂上 |
| **P1-9** | 全面(五 tab) | §2 每档带行高;TYPO-MIGRATION-MAP 风险面 4「行高显式化」 | 231 个含 `font-size` 的 inline `style` **不带 line-height**;实测可见文本节点 `line-height: normal` 占比 —— index **83%**(186/223)、earn **80%**、store **60%**、team **44%**、me **35%** | 这是 B1 迁移的主工作量,不是"顺手补";按档位表逐处补,与 space token 同批调,防"只改字不改距" |

### P2 — 打磨项

| # | 位置 | 违反 | 证据 | 建议 |
|---|---|---|---|---|
| **P2-1** | `src/components/app-chassis.vue:565` `.nx-nav-title` 17px;`:638` `.nx-brand` 19px | §2 档外 | 实测 team 页 nav 17 / 600 / lh=17 | 17 → `body.m` 15 或 `heading.h3` 20(映射表 17 为"逐处判");19 → 20 |
| **P2-2** | `src/components/earn/market-board.vue:61` 14.5px | §2 档外(映射表未收录 14.5) | 实测 earn 页 5 处 `$45.00/d` 等 = 14.5 / normal / 400 | 归 `body.m` 15 / 22;顺带该值不在迁移表里,B0 表需补一行 |
| **P2-3** | `src/components/team/team-ledger-card.vue:125` 50px | §2 档外(映射表未收录 50) | 实测 team "242" = 50 / lh 50 / 600 | 归 `display.xl` 44 或 `display.hero` 56;同样需回填 B0 表 |
| **P2-4** | `src/components/store/chain-payment.vue:37` | §6 / §8「Hash / 地址默认 `direction: ltr`,即使页面 RTL」 | 钱包地址用 `font-mono` + `word-break: break-all`,**未设 `direction: ltr`**,11.5px | 补 `direction: ltr`;当前 LTR locale 无感,阿语上线即翻车 |
| **P2-5** | 行高在档但与阶梯不符 · 41 处 | §2 行高列 | 实测:`heading.h3` 20 → lh 23/24(应 28,如 `greeting-header.vue:7` `line-height:1.15`);`heading.h2` 26 → lh 26/27.3/28.6(应 34);`body.m` 15 → lh 15(应 22) | 多数落在**单行**数字/标题上,今天零视觉损失;随 P1-9 一起按档位补齐即可,不必单独排期(详见第 ③ 节存疑项 4) |

### 邻域提醒(不在指派文件范围内,但渲染在五 tab 之上)

`src/components/milestone-celebration.vue:288-291` `.ms-body` = **11.5px**,承载 13 词里程碑说明("First $100 earned — your phone has officially paid back its activation overhead.")。实测在 `me` 页以 `ms-overlay[position:fixed, opacity:1]` **真实盖在主链路上**(rect 67,455 257×31,onScreen=true),经 `global-ui.vue` 全局挂载。同 §4 判据应升 13 / 18。**范围外,交给 main 决定是否并入 B1。**

---

## ③ 教条 / 存疑项(我判断不该当违例修,单列)

| # | 表面违例 | 为什么我判它不是真问题 | 建议处置 |
|---|---|---|---|
| **D-1** | `src/pages/me/me.vue` 汇率行 "≈ $285.57 · 1 NEX = $0.171" 实测 12px JetBrains Mono,按空格分词 **= 7 词**,触发 §7 铁律 | 它是**纯数字换算行**,正属 §7 ✅ 白名单「需对齐的数字+单位」。7 词是把 `·` `=` `≈` 当成词数出来的假阳性,不是句子 | 不改。建议给 §7 的 7 词测试补一句判据:**只数词法意义上的单词,分隔符 / 运算符 / 货币符不计** —— 否则任何 3 段式数字行都会假红 |
| **D-2** | 10.5px mono cap-label 共 29 处(`chain-payment.vue:45/49` coAmount/coNetwork、`locked-product-card.vue:23/60`、`app-chassis.vue:678` `.nx-badge__t` 等),机械升 12 即"消灭档外" | 这类是**刻意的角标 / 徽标**,不是被压小的正文。实测 `.nx-badge__t` = 10.5 / lh 1 / 600,装在固定圆形通知徽标里 —— 升 12 会直接撑破容器;`locked-product-card` 队列角标同理挤在卡片右上 | **迁移需配合容器检查**,不能进"批量替换"清单。逐处走「容器能不能长大 → 不能就先保留并登记豁免」,别为了棘轮数字好看牺牲布局 |
| **D-3** | `src/components/me/network-card.vue:16` 22px、`src/components/events/events-card.vue:21` 22px 被计为"档外字号" | 内容是 **emoji 图标**(`maxPrizeIcon` / `ev.emoji`),`font-size` 在这里等价于图标尺寸,不是排版档位 | 不改。建议 `value-ladder` 哨兵对纯 emoji / 单符号节点做豁免,否则每次迁移都要人工排除 |
| **D-4** | 41 处"行高不匹配档位"(P2-5)全部按 §2 补成 20/28、26/34 | §2 的行高是给**会换行的多行文本**定的纵向节奏。单行卡片标题 lh 1.15–1.2 是主流做法,硬拉到 1.4 会在标题下方多出一截死白;实测这 41 处里绝大多数是单行数字(`$`、`649`、`$7.00`、`$500+`) | 真正要补的是**实际换行的多行文本**(P1-9 里的部分),不是这 41 处。建议给 §2 补一句「**单行标题 / 单行数字可用 1.1–1.2,行高列的值面向多行文本**」,把 41 处机械改动变成 0 |
| **D-5** | 48px hero(`tech-money-card.vue:42`、`earn.vue:55`)按映射表直升 56 `display.hero` | 实测 390 视口下 48px 主数字 + 32px 小数 + 20px `$` 组合已占 281px 宽。升 56 后在 360/320 视口高概率换行 | 映射表自己已注「≤360px 降 `display.xl` 44」—— 执行时必须**同批落媒体/容器查询**,不能当单值替换。B1 若只改数字不落降级,等于把 hero 换行 bug 埋进去 |

---

## ④ 实测取证表

**方法**:Playwright chromium headless,390×844,`http://localhost:5173/?nx_device=off#/<route>`,en-US locale(注入 `nexgrid-locale-v1` uni 包装格式),`waitUntil:networkidle` + 2s,对文本节点父元素取 `getComputedStyle`。console error = **0**。共实测 25 个代表节点(每 tab 5 个)。

| tab | 节点 | 源码位置 | 源码值 | 实测值(fs / lh / fw / family) | 一致? |
|---|---|---|---|---|---|
| index | 底 tab 标签 "Home" | `app-chassis.vue:799` `.nx-tab__label` | 12px / 500 / 无 lh | 12 / normal / 500 / General Sans | ✅ 一致(**源码即违规**,见 P1-1) |
| index | 今日收益主数字 | `home/tech-money-card.vue:42` | 48px | 48 / — / — | ✅ |
| index | "↑ +5.2% vs yesterday…" | `home/tech-money-card.vue:45` | 12px + `font-mono-tabular` | 12 / normal / 400 / **JetBrains Mono** | ✅(P0-2 成立) |
| index | 行情成交量 `vol 142k/h` | `home/market-board-card.vue:33` | 11px,无 nowrap | 11 / normal / 盒 40×28 → **2 行** | ✅(P0 无,P1-7 成立) |
| index | 问候语 "Good evening, Hyper" | `home/greeting-header.vue:7` | 20px / 600 / `line-height:1.15` | 20 / 23 / 600 | ✅(23 = 20×1.15,档位应 28 → P2-5) |
| earn | 算力收益 kicker | `pages/earn/earn.vue:49` | 11px + mono | 11 / normal / 400 / JetBrains Mono | ✅ |
| earn | 收益主数字 | `pages/earn/earn.vue:55` | 48px | 48 / — / — | ✅ |
| earn | 任务历史提示 | `earn/task-center.vue:67` | 11px | 11 / normal / 400 / 盒 315×15 | ✅(P1-3) |
| earn | 任务空态 | `earn/task-center.vue:70` | 11.5px | 11.5 / normal / 400 / 盒 280×15 | ✅(P1-4) |
| earn | 设备日收益 `$45.00/d` | `earn/market-board.vue:61` | 14.5px / 400 | 14.5 / normal / 400 | ✅(P2-2,该值不在迁移表内) |
| store | 页脚 SLA 句 | `pages/store/store.vue:54` | 12px + `font-mono-tabular` | 12 / normal / 400 / **JetBrains Mono** / 346×16 | ✅(P0-1) |
| store | 算力池说明行 | `store/product-card.vue:76` | 11px + `truncate` | 11 / normal / **ws=nowrap** / 盒 385×15(>390 视口,已被切) | ✅(P1-5) |
| store | 以旧换新说明 | `store/tradein-window-banner.vue:18` | 12px / `line-height:1.4` | 12 / 16.8 / 400 / 盒 312×51 = **3 行** | ✅(P1-2) |
| store | 商品价格 | `store/product-card.vue:110` | 26px / 600 | 26 / 26 / 600 | ✅(lh 应 34 → P2-5 / D-4) |
| store | 商品标题 | `store/product-card.vue:308` `fontSize:"20px"` | 20px | 20 / 23 / — | ✅ |
| team | 快捷行数值 | `pages/team/team.vue:421` | 17px / 600 / `lineHeight:1` | 17 / 17 / 600 | ✅(P2-1 同类档外) |
| team | 账本大数字 "242" | `team/team-ledger-card.vue:125` | 50px / 600 / lh 1 | 50 / 50 / 600 | ✅(P2-3) |
| team | 促销 chip | `team/invite-earn-card.vue:29` | 11.5px + `font-mono-tabular` | 11.5 / normal / 400 / **JetBrains Mono** / 228×15 | ✅(P0-3) |
| team | 月度 NEX | `pages/team/team.vue:27` | `fontSize:'10.5px'` + mono | 10.5 / — / — | ✅(§4 🔴 10–11px) |
| team | 里程碑说明(浮层) | `milestone-celebration.vue:290` | 11.5px | 11.5 / 16.1 / 400 / 盒 232×31 = 2 行 | ✅(邻域项) |
| me | 版本行 | `pages/me/me.vue:76` | 11px + mono | 11 / normal / 400 / JetBrains Mono | ✅ |
| me | 钱包小数位 | `me/wallet-card.vue:34` | 32px | 32 / — / — | ✅ |
| me | 通知徽标数字 | `app-chassis.vue:678` `.nx-badge__t` | 10.5px / 600 / lh 1 | 10.5 / 10.5 / 600 / General Sans | ✅(D-2 存疑项,勿机械升 12) |
| me | 汇率换算行 | `pages/me/me.vue` 钱包区 | 12px + mono | 12 / normal / 400 / JetBrains Mono / 7 "词" | ✅ 值一致,**但判定为假阳性**(D-1) |
| me | 折扣 banner 副文案 | `home/conversion-banner.vue:179` | 11.5px | 11.5 / 14.95 / 400 / 158×15 | ✅(P1-6) |

**一致性结论**:25/25 源码值与实测值**完全一致** —— 本工程 inline `style` 未被 class 覆盖,**源码扫描结论可信**,第 ① 节的 219 处档外统计不需要按实景打折。唯一需要实景才发现的两类是:(a) 行高继承成 `normal` 的真实占比,(b) 换行 / 截断的实际发生(P1-5、P1-7、P1-8),这两类 grep 抓不到。

---

## 附:与既有机器门的关系

| 门 | 现状 | 对本报告的覆盖 |
|---|---|---|
| `scripts/dom-qa.mjs` | `GATE_FONT=10` / `CENSUS_FONT=12`,10–12px 只出 info | **不拦** ① 的 86 处 10–11px;B1 收完需把 `GATE_FONT` 提到 12 |
| `scripts/value-ladder-sentinel.mjs` | 按 9 档判档间值(B0 待升 14 档) | 升级前迁移新档(34/56)会假红;另需按 D-3 豁免 emoji 节点 |
| `scripts/verify.sh` | 无 orphan / nowrap / text-wrap 哨兵(grep 0 命中) | **P1-7 / P1-8 完全无机器门**,建议随修补焊上 |
| 字重 | 无哨兵 | P0-4 的 650 靠人工发现;建议加 `font-weight` >600 正则哨兵(全面仅 2 处,红测成本极低) |
