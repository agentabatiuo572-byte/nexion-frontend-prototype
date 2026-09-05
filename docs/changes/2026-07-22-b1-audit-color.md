# B1 审查 · 色彩 + 空间/圆角/边框/分层（五 tab 主链路）

> **本页判定目标 = 五 tab 主链路（home / earn / store / team / me）的颜色 token 纪律 与 空间-圆角-边框-分层纪律**
> **来源:UI 规范 03/04 明写**（`UI/规范/04-色彩规范.md` §2/§7/§11、`UI/规范/03-空间圆角边框分层规范.md` §1/§2/§3/§4/§6/§7）。
> 仅少数判据为**推断**,已在正文逐条标注 `[推断]`。

审查范围:`src/pages/{index/index,earn/earn,store/store,team/team,me/me}.vue` + `src/components/{home,earn,store,team,me}/*.vue`(97 个)+ `src/components/app-chassis.vue` = **103 文件**。
取证方式:静态扫描(inline `style` / `:style` 对象 / `CSSProperties` 对象 / scoped CSS 四种形态)+ **Playwright `getComputedStyle` 实测**,五 tab × 亮/暗双主题 = 10 次采样。
**未修改任何文件。**

---

## 0. 结论速览

| 级别 | 条数 | 内容 |
|---|---:|---|
| **P0** | **2** | 亮底文字用错 token(`--v5-on-brand` 用在 `--v5-brand-2` 填充上)→ **仅 light 主题** 对比度 3.12 < AA 4.5 |
| **P1** | **5** | 带 bg 填充的卡片/按钮带 4 边描边(违 V5 零-border 铁律) |
| **P1** | **4** | 硬编码 hex 渲染在页面上,**仅 light 主题**对比度不达标(2.08–3.94) |
| **P1** | **1** | `--v5-surface-bg` 是**未定义 token** → 整条 `background` 声明失效静默回退 |
| **P2** | **1** | rem 尺度漂移:圆角/间距阶梯**只在 375px 宽下成立**,414px 默认宽全部 ×1.104 |
| **P2** | **3** | 按钮非胶囊(违「所有按钮 999」铁律) |
| **P2** | **2** | 状态门后的 accent 描边大卡(`myRank>=3` / missions 页) |
| **P3** | **2** | 存量离散值分布、L3 层实际未被用作 Hero |
| **教条/存疑** | **12 类** | 单列第 ⑤ 节,**均判定为不是违例** |

**最该先修 3 条**
1. **P0 `--v5-on-brand` 用在 `--v5-brand-2` 上**(2 处)—— light 主题白字压橙底 3.12:1,dark 因 `on-brand`≡`on-brand-2`≡`#0A0A0A` **碰巧不翻车**,所以单看暗色永远发现不了。
2. **P1 零-border 铁律破口**(5 处 4 边描边)—— `my-fleet-section` / `team.vue` quickPanel 是首屏大卡,双主题都违。
3. **P2 rem 尺度漂移**(345 处 utility)—— 一处根因导致圆角/间距**全站** 119 个实测值离开阶梯,单点修组件无效,必须在 uno/根字号层解决。

---

## ① 硬编码 hex 清单

### 1.1 判定口径先说清楚(防误报)

运行时 `getComputedStyle` **无法区分**「源码硬编码 `#0E8E4A`」和「`var(--v5-success)` 在 light 下解析成 `#0E8E4A`」。
首轮实测按颜色值匹配捞到 52 条 `#FFFFFF`、37 条 `#0E8E4A`、42 条 `#C68316`,**逐条回源核对后确认绝大多数是 token 正常解析,不是硬编码**。本节只收录「hex 值不等于任何 `--v5-*` token 值」的真硬编码;token 本身的对比度问题另立第 ④ 节。

> 同理,首轮「52 条白字对比度不足」是探针 bug(计算背景时从 `parentElement` 起算,漏掉元素自身填充)。修正探针(把自身 `background` 计入)后复测:**五 tab × light 白字低于 AA 的只剩 1 条**,即下方 P0。已排除 51 条幻觉。

### 1.2 真硬编码 · 已实测渲染 · 单主题翻车

对比度 = 元素文字色 vs **实测合成后的真实背景**(逐级向上合成 alpha),阈值取 WCAG AA 正文 4.5:1(这些文字实测字号 10.5–26px,除 26px 外均属正文档)。

| hex | file:line | light 实测 | dark 实测 | 哪个主题翻车 | 应改为 |
|---|---|---|---|---|---|
| `#9B89E0` | `src/components/home/day-one-quest-card.vue:29`(倒计时 16px)、`:133`、`:137`(任务数据 color 字段) | **2.98** on `#FFFFFF` | 6.18 on `#141414` | 🔴 **light** | `--v5-nex`(light 4.35 / dark 6.51) |
| `#9B89E0` | `src/components/home/conversion-banner.vue:206`(“4d 11h” 12.5px) | **2.98** on `#FFFFFF` | 6.18 | 🔴 **light** | `--v5-nex` |
| `#C26658` | `src/components/home/market-board-card.vue:36`(sparkline color)、`:42`(涨跌文字 12.5px) | **3.94** on `#FFFFFF` | 4.68 on `#141414`(勉强过) | 🔴 **light**(dark 也仅 4.68) | `--v5-danger`(light 4.71 / dark 6.09) |
| `#C26658` | `src/components/home/nex-price-card.vue:40`(`tint` computed,喂给 sparkline) | **3.94** | 4.68 | 🔴 **light** | `--v5-danger` |
| `#D4AF5A` | `src/components/store/genesis-showcase-card.vue:24`、`:177`、`:193`、`:219`(标题 10.5px / 金额 26px / CTA 13.5px) | **2.08** on `#FFFFFF` | 8.84 on `#141414` | 🔴 **light** | 见 §⑤-9(文件内有 intentional 注释,建议补 light 档金色 token 而非直接改) |

**同链路溢出(不在指定 5 目录、但渲染在 earn tab 上,一并记录)**

| hex | file:line | light | dark | 翻车 |
|---|---|---|---|---|
| `#9B89E0` | `src/components/trial-hero-banner.vue`(“限时免费”11px / “$”20px / “立即领取”13.5px / svg stroke) | **2.66–2.98** | 5.25–6.18 | 🔴 light |
| `#FF6B35` | `src/components/trial-hero-banner.vue`(“今日仅剩 47 张”12.5px + fill) | **2.84** | 6.50 | 🔴 light |

`#FF6B35` 是 v2 legacy palette 残值(tokens.css:38 `--warning`),V5 对应 token 是 `--v5-brand-2`。

### 1.3 真硬编码 · 源码确认但默认态未渲染(状态门后)

未在默认账号状态下渲染 → 无实测对比度,按 hex 值静态推算,**标 `[推断]`**。

| file:line | hex | 说明 | 静态推算 |
|---|---|---|---|
| `src/components/team/v-badge.vue:31–39`、`src/components/team/v-badge-icon.vue:26–34` | `#B0B8C5` `#D0D5DE` `#D4FF55` `#A88FFF` `#FFCB5F` `#FFD982` | V1–V9 等级徽章文字色,双主题固定 | `[推断]` 全部为「暗底可读、亮底几乎不可读」型:on `#FFFFFF` 实算 1.15–2.61 |
| `src/components/store/purchase-ticker.vue:33–37` | `#C68316` `#0833B8` `#0E8E4A` `#1A4FD0` `#B9554A` | 头像 tint。**这 5 个值正好是 V5 light 主题的 token 值**(warning/brand-deep/success/danger),写死后 dark 主题拿不到 dark 档 | `[推断]` dark 下 `#0833B8` on `#141414` = 1.91、`#1A4FD0` = 2.70 |
| `src/components/home/day-one-quest-card.vue:134–136` | `#FF6B35` `#C6FF3A` | 任务数据 `color` 字段(v2 legacy) | `[推断]` `#C6FF3A` on `#FFFFFF` = 1.18 |
| `src/components/home/day-one-quest-card.vue:57` | `#0F0F0F` | svg `stroke`,压在品牌填充上 | 值≈`--v5-on-brand` dark;light 下品牌是蓝底,近黑描边偏暗 |
| `src/components/store/product-card.vue:246`、`src/components/store/product-render.vue:39,40,67,68,69,105,120` | `#101216` `#0A0B0E` `#1A1D24` `#15181E` `#2A2F38` `#0F0F0F` | 产品渲染图「摄影棚暗背景」渐变 + SVG 芯片 fill/stroke | 双主题固定深色;light 主题下是一块深色图块,属产品图资产([推断] 可接受,见 §⑤-10) |

### 1.4 未定义 token(比硬编码更隐蔽)

| file:line | 问题 |
|---|---|
| `src/components/me/menu-grid-card.vue:97` | `color-mix(in srgb, var(--v5-surface-bg) 94%, #111317 6%)` —— **`--v5-surface-bg` 在 `tokens.css` 中不存在**(已比对 105 个已定义 token)。未定义 var 在 `color-mix()` 里 → 整条 `background` 声明 **invalid at computed-value time** → 静默丢弃,元素退回透明。同 rule 里还有 `border: 1px solid var(--v5-border)`,于是这块「本该是渐变实底卡」实际渲染成「透明容器 + 描边」。**tsc / grep 都抓不到**(已知坑 `feedback_token_alias_silent_fallback`)。同文件 `:74` 用的是存在的 `--v5-surface-2`,说明是笔误而非有意。 |

同时该行还硬编码了 `#111317` / `#000`(`:74`),在 light 主题会把暖米底 surface 往冷灰压。

---

## ② bg + border 同现违例

**判据(SoT 明写)**:《03》§3 —「任何带背景色填充的卡片 / 板块一律零 border,border 只属于透明容器」;§6 —「内嵌元素(chip / pill / icon 容器):用 soft bg tint + 内容色,**禁加 border**」。
**判据细化**:只有 **4 边完整描边** 才算「描边卡片」;单边 `border-top/bottom` 属《03》§3 明写的**分割线 hairline**,不算(详见 §⑤-1)。

静态扫描命中 38 个 `bg`+`border` 同现style单元 → 运行时实测保留 **19 个真实渲染**,逐个判定如下。

### 2.1 P1 · 确认违例(双主题都违)

| # | file:line | 实测(dark / light) | 说明 |
|---:|---|---|---|
| 1 | `src/components/home/my-fleet-section.vue:21` | `379×231` bg `rgb(20,20,20)` / `rgb(255,255,255)`,border 4 边 `1px` `--v5-border`,radius 17.66px | 首屏「我的设备」大卡,实底 + 4 边描边。inline `style="border: 1px solid var(--v5-border); background: var(--v5-surface);"` |
| 2 | `src/pages/team/team.vue:377`(`quickPanelStyle`) | `379×301` bg surface,border 4 边 `--v5-border` | team 首屏快捷面板,同上 |
| 3 | `src/components/me/wallet-action-btn.vue:33` | `44×44` bg `--v5-surface-2`,border 4 边 `--v5-border`,radius 999 | **icon 容器**,《03》§6 明写禁加 border(非主按钮分支 `props.primary ? "none" : "1px solid var(--v5-border)"`) |
| 4 | `src/components/global-ui.vue`(`.ms-card`,渲染于 store/team/me) | `300×219`–`300×235` bg surface + radial,border 4 边 `rgba(255,255,255,0.12)`(=`--v5-border-strong`) | 确认弹层。**注**:《03》§4 只把「玻璃质感」豁免给 chrome/浮层,没给「实底浮层描边」开口子 → 判违例,但承认这条最接近灰区(见 §⑤-4) |
| 5 | `src/components/me/menu-grid-card.vue:88`(`.me-menu-card`) | border 4 边 `--v5-border` + bg 因 §1.4 失效 | 修好 `--v5-surface-bg` 后即成为「实底 + 4 边描边」;两个问题要一起修 |

### 2.2 P2 · 仅 light 主题违例(暗色下合法)

| # | file:line | 判定 |
|---:|---|---|
| 6 | `src/components/home/do-the-math-card.vue:52` | `347×42` radius 999 CTA,`background: var(--v5-brand-soft)` + `border: 1px solid var(--v5-brand-border)`。**dark**:`--v5-brand-soft` = `rgba(158,220,29,0.20)` → 实测 bg 半透明 → 属《03》§3 `border-brand`「仅透明底小元素」→ **合法**。**light**:`--v5-brand-soft` = `#E8EDFB` 不透明(实测 `rgb(232,237,251)`)→ 变成「实底 + 品牌描边」→ **违例**。同一行代码两个主题两种判定,是 token 亮暗透明度不对称造成的。 |

### 2.3 P2 · 源码确认、状态门后未渲染

| # | file:line | 门 | 判定 |
|---:|---|---|---|
| 7 | `src/pages/team/team.vue:302`(`royaltyHeroStyle`) | `v-if="myRank >= 3"`(team.vue:19) | `background: radial-gradient(…var(--v5-brand-soft)…), var(--v5-surface)` + `border: 1px solid var(--v5-brand-border)` → 实底 Hero 大卡 + **品牌 accent 描边**,同时违 §②(零 border)和 §③(accent 描边大卡) |
| 8 | `src/components/home/weekly-quest-hero.vue:174` | 该组件**未挂在五 tab 上**,只在 `src/pages/missions/missions.vue:58` | `background: var(--v5-surface)` + `border: 1px solid var(--v5-warning-soft)` → 实底卡 + **warning accent 描边**。归属 `components/home/` 故列入,但不在五 tab 主链路 |

### 2.4 交互后才出现(sheet / input),静态确认未实测

以下 11 处在弹层/输入聚焦后才渲染,本轮未点开,只做静态登记、**不定级**:
`earn/capacity-explainer-sheet.vue:61`、`me/device-deactivate-sheet.vue:119`、`me/nickname-sheet.vue:93`、`me/theme-picker-sheet.vue:89`、`me/theme-row.vue:48`、`me/tradein-ladder-sheet.vue:101`、`me/setting-row.vue:49`、`me/stake-alternative-card.vue:83`、`me/trial-countdown-hero.vue:108`、`store/locked-product-card.vue:203`、`me/receipt-modal.vue:305`(后者另有 `background: var(--v5-on-brand)` —— 把「品牌填充上的文字色」当背景用,token 语义反用 `[推断]` 应为 `--v5-surface`)。

`store/card-payment.vue:209` 的 `border: 1px solid var(--v5-brand-2)` 是**输入框聚焦态**,《03》§3 末条明写「可访问性强边界(表单聚焦)…不在此用弱 border-subtle」→ **不是违例**。

---

## ③ 大块卡片 accent 色描边

《03》§3:`border-brand` / `border-success` / `border-warning` 仅限「**透明底**小元素 / 选中态」。

**默认态五 tab 实测:0 处大卡 accent 描边。** 探针对 brand / brand-border / tech-cyan / warning / success / danger / nex / brand-2 八种 accent 边框色做了全量比对,唯一命中的是 §2.2 的 `do-the-math-card` 胶囊(42px 高,不是「大块卡片」)。

状态门后的 2 处(`team.vue:302` brand 描边 Hero、`weekly-quest-hero.vue:174` warning 描边卡)见 §2.3。

---

## ④ 圆角 / 间距档外分布

### 4.1 根因:rem 尺度漂移(P2,一处根因 → 全站 119 个实测值离开阶梯)

实测证据:

| 视口宽 | `html` 实测 font-size | `.rounded-2xl` 实测 | 结论 |
|---:|---|---|---|
| 375 | `16px` | `16px` | 阶梯成立 |
| **414(默认目标)** | **`17.664px`** | **`17.664px`** | 全部 ×1.104 |
| 480 | `20.48px` | `20.48px` | 全部 ×1.28 |

- `html` 的 `style` 属性实测为 uni-app H5 运行时注入:`font-size: 17.664px; --status-bar-height: 0px; --top-window-height: 0px; …`(与 uni 自己的窗口变量同批写入)。换算 `16 × 414/375 = 17.664` 精确吻合。
- UnoCSS `presetWind3` 实测输出 **rem**:`.mt-3 { margin-top: 0.75rem; }`。
- 因此 `uno.config.ts:9` 注释「We keep px (not rpx): H5 + App 都渲染标准 CSS」是**错误假设** —— 走 rem + uni 的 rem 自适应,效果等价于 rpx。
- 本次 103 文件中 rem 型 utility **共 345 处**(`gap-1.5`×37、`rounded-full`×23、`gap-2`×21、`rounded-2xl`×18、`mx-4`×16、`px-4`×11 …)。

**后果**:inline `px` 值(存量主力)不缩放,utility class 缩放 → 两套系统在默认 414 宽下**永久差 10.4%**。实测同页并排:`my-fleet-section` 卡角 17.66px 紧挨着 inline 写死 16px / 24px 的卡,肉眼即为「圆角不齐」。

### 4.2 圆角实测分布(dark,五 tab 合并,可见盒 >12px)

阶梯 = {12,16,20,24,28,32,999}(+ `9999` 与 `%` 视同 999,见 §⑤-6)。

| 实测值 | 条数 | 来源 | 判定 |
|---:|---:|---|---|
| 999 | 55 | inline px | ✅ |
| 16 | 51 | inline px | ✅ |
| 12 | 44 | inline px | ✅ |
| 9999 | 12 | class | ✅(等效 999) |
| `%` | 8 | inline | ✅(圆点) |
| **14** | **38** | inline px | ❌ 档外(最大一档) |
| **4** | 21 | inline px | ❌ 档外(进度条/小 bar) |
| **8** | 12 | inline px | ❌ 档外 |
| **8.83** | 8 | **class `rounded-lg`** | ❌ rem 漂移(375 下=8,仍档外) |
| **6** | 7 | inline px | ❌ 档外 |
| **3** | 6 | inline px | ❌ |
| **17.66** | 6 | **class `rounded-2xl`** | ❌ rem 漂移(375 下=16,在档) |
| **9 / 10 / 18 / 22** | 5+5+5+5 | inline px | ❌ 档外 |
| **13.25** | 1 | **class `rounded-xl`** | ❌ rem 漂移(375 下=12,在档) |

**合计:在档 170 / 档外 119(41%)。** 其中 15 条(8.83/17.66/13.25)纯粹由 §4.1 漂移造成 —— 源码写的是在档值,渲染出档。

档外 Top 来源:`voucher-banner.vue`(14)、`home/device-slot.vue`(14)、`me/theme-picker-sheet.vue`(14)、`store/genesis-showcase-card.vue`(18)、`team/team-ledger-card.vue`(18)、`global-ui.vue`(18)、`app-chassis.vue`(22,tabbar pill)。

### 4.3 按钮胶囊铁律(《03》§2 🔵「所有按钮无例外 radius-full」)

实测口径 `[推断]`:uniapp 禁用原生 `<button>`,故以「带 `active:opacity|scale|bg` 按压反馈 class + 不透明填充 + 高 ≤64px」判定为按钮。命中 17 个,**3 个非胶囊**:

| file:line | 实测 | 判定 |
|---|---|---|
| `src/components/team/invite-earn-card.vue:55,60,65` | `158×44`,radius **8.83px**(`rounded-lg`) | 🔴 **真违例**。同卡 `:71` 主 CTA 用 `rounded-full` 正确 → **同一张卡里主按钮胶囊、3 个次按钮方角**,视觉不一致肉眼可见 |
| `src/components/voucher-banner.vue` | `382×60`,radius 14px | `[推断]` 整条可点横幅,判为**卡片**不是按钮 → 不算违例(见 §⑤-11) |
| `src/components/home/device-slot.vue` | `48×48`,radius 14px | `[推断]` 设备槽位方块 tile → 不算按钮 |

### 4.4 间距 8pt grid 档外分布

阶梯 = {4,8,12,16,20,24,32,40}。静态扫描(px 字面量,排除 `var()`/`calc()`/`env()`/`%`)命中 **396 条档外声明**。

| 值 | 条数 | 备注 |
|---:|---:|---|
| 6 | 97 | 最大宗 |
| 2 | 83 | 多为 1–2px 微调 |
| 10 | 56 | |
| **14** | **56** | ⚠️ 《03》§1 明写「卡片间纵向:14 / 16」→ **合规,不计违例** |
| 3 | 23 | |
| **18** | **20** | ⚠️ 《03》§1 明写「卡片内边距:16–18」→ **合规,不计违例** |
| 5 / 9 / 7 / 1 / 13 / 11 / 22 / 30 / 28 / 62 / 42 | 15/12/10/6/6/3/3/2/2/1/1 | |

**扣除规范明许的 14(56)与 18(20)共 76 条 → 真实档外 320 条。**
档外 Top 文件:`store/product-card.vue`(20)、`earn/device-card-pc.vue`(17)、`me/topup-card-form.vue`(15)、`home/weekly-quest-hero.vue`(14)、`home/day-one-quest-card.vue`(13)、`store/genesis-showcase-card.vue`(13)。

### 4.5 页面级节奏实测(双主题一致)

| 页 | 实测左右边距 | 实测卡间纵向 gap 分布 |
|---|---:|---|
| home | **17.66px** | `{0:8, 14:1, 26:7, 59:1}` |
| earn | **17.66px** | `{0:14, 1:1, 18:1, 26:3}` |
| store | **17.66px** | `{0:8, 11:1, 26:8, 74:2}` |
| team | **17.66px** | `{24:4}` |
| me | **17.66px** | `{13:1, 22:6, 24:1}` |

- **左右边距 17.66px**:来源是 `class="px-4 pt-3 pb-4 space-y-6"`(index/store/me)、`class="px-4"`(team)。《03》§7.1 要求页面左右边距 **20 / 24px**,§7.2 对 361–414 档同样要求 20/24 → **五 tab 全部偏窄**,且是 §4.1 漂移的产物(375 下会是 16px,更窄)。
- **卡间 26px** 高频出现 = `space-y-6`(1.5rem,意图 24)漂移后的值;me 的 **22px** = `space-y-5`(意图 20)。即节奏本身设计在档,渲染出档。
- team 的 `24×4` 是 inline px 写死,**唯一精确落档**的一页 —— 反证 inline px 与 utility class 两套系统并存。

---

## ⑤ 教条 / 存疑 —— 逐条判定「不是违例」

每条先问「这是真问题还是教条」,以下 12 类判定为**不报**,附理由与证据。

1. **单边 hairline 分割线不算描边**。`home/on-grid-section.vue:30`(`border-top`)、`home/network-pulse-card.vue:15`(`border-bottom`)、`home/market-board-card.vue:15`、`store/product-card.vue:344`、`earn/device-card-pc.vue:30` 实测均为 1 边 `1px --v5-border`,压在卡内 footer/header 条带上。《03》§3 明写「分割线:透明 hairline,`border-top`/`border-bottom`,色用 `border-subtle`」→ **这是规范钦定写法**。
   *唯一可讨论点*:条带自身有 `--v5-surface-2` 填充,与卡体 `--v5-surface` 已有色阶差,hairline 属冗余强化 → 最多 LOW「可删」,不列违例。

2. **状态点的「挖空环」不是描边**。`home/device-slot.vue`(11×11,`border: 2px solid var(--v5-bg)`)、`store/locked-product-card.vue`(8×8,`2px --v5-surface`)、`nova/nova-bubble.vue`(18×18 badge,`1px` 页底色)。边框色 = **它所压住的那层的底色**,作用是把小圆点从头像/卡面上「抠」出来,是遮罩技法不是装饰描边。删掉会让圆点糊在下层上。**不是违例。**

3. **全局 chrome 豁免**(任务书已明示,实测确认身份)。`app-chassis` 的 `.nx-tabbar-pill`(390×66,radius 22,`--v5-tabbar-bg` + `--v5-tabbar-border`)、`.nx-nav-glass`(`--v5-glass-*`)、`.nx-refresher`。《03》§4 末条 +《04》§8 都把 TabBar/Header/浮层的玻璃材质排除在「卡片零 border」之外,且 tokens.css 为它们**专设**了 `--v5-tabbar-border` / `--v5-glass-border`。**不是违例。**

4. **Toast 同属 chrome**。`global-ui.vue` `.nx-toast`(356×41,`--v5-toast-bg` + `--v5-toast-border`)。《04》§8 把 `--v5-toast-bg/-border/-shadow` 明确列在「Chrome / 玻璃(仅顶栏 / 底栏 / **浮层**)」表内 —— **token 本身就是为它建的**。**不是违例。**
   *对比*:同文件的 `.ms-card`(确认弹层)用的是通用 `--v5-border-strong` 而非 chrome token,所以我把它列进了 §2.1 而不是这里。这条是本轮最接近灰区的判定,若主人认为「实底浮层需要边界」也合理,可降级为 LOW。

5. **Bottom Sheet 顶边 hairline 不是描边**。`team/share-channel-sheet.vue:111`、`team/share-poster-sheet.vue:516`、`voucher-claim-sheet.vue` 实测均为 `border-top` 单边 + 圆角只在上两角(实测 `16px 16px 0px 0px`)→ 是 sheet 与页面的分界线。**不是违例。**

6. **`9999px` 不等于违反 999 阶梯**。实测 12 处 `9999px`,渲染效果与 999 完全一致(两者都远大于半高)。且 `scripts/value-ladder-sentinel.mjs:29` 的 `RADIUS_LADDER` 已把 `9999` 收进合法集。**不是违例**,最多是 token 一致性 NIT。

7. **`box-shadow 做层级` = 0 违例**。实测 width>120 的阴影全部逐条比对 tokens.css,**无一例外**都是规范钦定 token:
   - `rgba(255,255,255,0.04) 0 1px 0 inset, rgba(0,0,0,0.55) 0 8px 24px` ≡ `--v5-card-shadow-lift`(dark)
   - `rgba(255,255,255,0.06) 0 1px 0 inset, rgba(0,0,0,0.7) 0 12px 32px` ≡ `--v5-card-shadow-lift-strong`
   - `rgba(0,0,0,0.55) 0 8px 24px` ≡ `--v5-toast-shadow`;tabbar pill 用 `--v5-tabbar-shadow`
   《03》§4 明写「dark 模式**可用**统一的 `--v5-card-shadow-lift`(floating base…装饰非层级)」→ **全部合法,0 违例。**

8. **「同一视口 L3 ≤ 1」未被违反**。实测 surface-3 命中:home 2 处、store 5 处、earn/team/me 各 0 处 —— 但逐个看尺寸,**全部是 3–5px 高的进度条轨道**(`home/do-the-math-card.vue` 347×3、`store/cluster-ladder.vue` 203×5),不是 Hero 卡。**不是违例。**
   *反向观察(不定级,列为 P3 观察项)*:五 tab **没有任何一处**把 `--v5-surface-3` 用作 Hero/主收益卡 —— L0–L3 四层阶梯实际只用到 L1/L2,Hero 全部改用自定义渐变/aurora 实现。规范的 L3 层在主链路上处于闲置状态,值得主人决定是「补用」还是「从规范里删」。

9. **Genesis 金色 `#D4AF5A` 属域内设计资产**。`store/genesis-showcase-card.vue:8` 有显式注释声明其为 genesis 域设计色。light 下 2.08:1 确实不达标,但**改成通用 token 会抹掉创世节点的身份色**。判定:**不按硬编码违例处理**,建议改为「补一组 `--v5-genesis-gold` 双主题 token(light 档需压暗到 ≥4.5)」。已在 §1.2 表内标注。

10. **产品渲染图深色背景不是主题违例**。`store/product-render.vue` / `product-card.vue:246` 的 `#101216 → #0A0B0E → #000000` 渐变 + SVG 芯片 fill,模拟的是产品摄影棚背景,属图像资产。`[推断]` **不是违例**(与「深色产品图在浅色页面上」同理)。

11. **QR 码黑白不是硬编码违例**。`store/chain-payment.vue:27,31,32` 的 `#ffffff`/`#000000`,文件内 `:29` 已有注释说明是 B/W 对比度资产。QR 必须黑白才可扫。**不是违例。**

12. **海报 canvas 常量不是主题违例**。`team/share-poster-sheet.vue:182–205`(`BRAND_ON_DARK` / `COIN_FACE` / `NOTE_TRIM` …)绘制的是**导出到相册的分享图**,必须与 App 当前主题解耦(否则用户切浅色主题分享出去的海报会变样)。命名 `*_ON_DARK` 也说明是有意的。**不是违例。**

13. **支付网络品牌色不是硬编码违例**。`me/card-brand-badge.vue:17–19` 的 Visa `#1A1F71` / Mastercard `#EB001B` / Amex `#2E77BB` + `:28` 白字,是第三方品牌资产,不可 token 化。**不是违例。**

14. **`live-social-proof.vue:101–102` 的 `#000` 不是颜色**。用在 `maskImage: linear-gradient(180deg, transparent 0%, #000 22%, …)`,mask 里只取 alpha 通道,`#000` 表示「完全不透明」。**不是违例。**

15. **`me/preference-toggle-row.vue:56` 的 `#FFFFFF` 旋钮**。开关旋钮压在彩色轨道上,白色是通行约定;light 主题实测未出现对比度问题。**不是违例。**

---

## ⑥ 双主题实测取证表

采样:Playwright + 工程自带 `playwright@1.61.0`,`chromium` headless,viewport `414×896`,URL `http://localhost:5173/?nx_device=off#/<route>`,主题经 `localStorage["nexgrid-theme-v1"] = {type:"object",data:{mode}}` 注入 + `documentElement[data-theme]` 硬置双保险。

### 6.1 总量对照(证明双主题结构一致、差异纯在颜色)

| 页 | 元素数 | bg+border 命中 | 其中 4 边描边 | L1/L2/L3 | dark 页底 | light 页底 |
|---|---:|---:|---:|---|---|---|
| home | 854 | 12 | 8 | 9/10/2 | `rgb(0,0,0)` | `rgb(244,241,233)` |
| earn | 603 | 3 | 3 | 2/14/0 | 同上 | 同上 |
| store | 699 | 10 | 6 | 11/6/5 | 同上 | 同上 |
| team | 462 | 4 | 4 | 6/3/0 | 同上 | 同上 |
| me | 606 / 614 | 5 | 5 | 7/5/0 | 同上 | 同上 |

两主题 bg+border 命中数与 4 边描边数**完全相同** → 边框违例与主题无关,是结构问题;颜色违例才是主题相关。

### 6.2 ①有 bg 的卡片 borderWidth 是否为 0(实测)

| 组件 | dark 实测 | light 实测 | 判定 |
|---|---|---|---|
| `home/my-fleet-section.vue` | bg `rgb(20,20,20)`,border `1/1/1/1` `rgba(255,255,255,0.06)` | bg `rgb(255,255,255)`,border `1/1/1/1` `rgb(229,223,208)` | ❌ 双主题违 |
| `team.vue` quickPanel | bg `rgb(20,20,20)`,border `1/1/1/1` | bg `rgb(255,255,255)`,border `1/1/1/1` | ❌ 双主题违 |
| `me/wallet-action-btn.vue` | bg `rgb(31,31,31)`,border `1/1/1/1` | bg `rgb(250,247,240)`,border `1/1/1/1` | ❌ 双主题违 |
| `home/do-the-math-card.vue` | bg `rgba(158,220,29,0.2)`(**半透明**) | bg `rgb(232,237,251)`(**不透明**) | ⚠️ 仅 light 违 |
| `app-chassis` `.nx-tabbar-pill` | bg `rgba(12,12,14,0.22)` + 渐变,border `1px rgba(255,255,255,0.1)` | 同结构 | ✅ chrome 豁免 |
| `home/device-slot.vue` 状态点 | bg `rgb(158,220,29)`,border `2px rgb(0,0,0)`(=页底) | bg `rgb(14,142,74)`,border `2px rgb(244,241,233)`(=页底) | ✅ 挖空环,非描边 |

### 6.3 ②圆角实测值

见 §4.2 完整分布。关键对照:同一元素 `.rounded-2xl` 在 375 / 414 / 480 三档实测 `16px / 17.664px / 20.48px`。

### 6.4 ③关键容器 padding / gap 实测

见 §4.5。补充实测样本:
- `home/on-grid-section.vue` 条带 `padding: 8.832px 17.664px`(源码 `px-4 py-2`,意图 16/8)
- `home/network-pulse-card.vue` 条带 `padding: 11.04px 15.456px`(源码 `px-3.5 py-2.5`,意图 14/10)
- `home/market-board-card.vue` 条带 `padding: 9px 14px`(inline px,**不漂移**)
- `store/product-card.vue` 底条 `padding: 13px 16px`(inline px,不漂移)
- `voucher-claim-sheet.vue` 面板 `padding: 20px 16px 38px`(38px = home indicator 安全区,《03》§7.3 铁律,正确)

同一屏内 `8.832px` 与 `9px`、`15.456px` 与 `14px` 并存 —— 这就是 §4.1 两套单位系统并存的可视化证据。

### 6.5 ④亮底文字 `--v5-on-brand`(实测,P0 证据)

探针:找出所有背景 = brand / brand-2 / tech-cyan / success 的填充元素,取其直接文字子节点,比对文字色是否等于对应的 `on-*` token。

| 主题 | 精确命中 on-brand | 不匹配 |
|---|---:|---:|
| dark | 16 | **0** |
| light | 15 | **1** |

唯一不匹配 + 复测确认:

```
src/components/earn/missed-income-banner.vue
  ctaStyle      (:157) background: "var(--v5-brand-2)"
  ctaLabelStyle (:162) color:      "var(--v5-on-brand)"     <-- 应为 --v5-on-brand-2

  light 实测: bg rgb(255,90,31)  text rgb(255,255,255)  contrast 3.12  ✗ AA 4.5
  dark  实测: bg rgb(255,122,61) text rgb(10,10,10)     contrast 7.64  ✓
```

**为什么 dark 不翻车**:`--v5-on-brand` 在 dark = `#0A0A0A`,恰好与 `--v5-on-brand-2` 同值 → 巧合正确。light 下 `--v5-on-brand` = `#FFFFFF`,而 tokens.css:69 的注释早就写明「白字在 `#FF5A1F`/`#FF7A3D` 上 fails」。**只看暗色永远发现不了这个 bug。**

**同类全站排查**(遵循「修一处 = 排查同类」):扫描全部 103 文件里 `background: var(--v5-brand-2)` 的 6 处填充,逐个核对文字色 ——

| file:line | 文字色 token | 判定 |
|---|---|---|
| `earn/missed-income-banner.vue:157/162` | `--v5-on-brand` | ❌ **P0** |
| `pages/me/me.vue:394`(`quickBadgeStyle`,`:403`) | `--v5-on-brand` | ❌ **P0**(角标未读数,状态门后) |
| `app-chassis.vue:664` `.nx-badge` / `:680` `.nx-badge__t` | `--v5-on-brand-2` | ✅ |
| `earn/device-card-pc.vue:576/583` | `--v5-on-brand-2` | ✅ |
| `store/tradein-window-banner.vue:112` | `--v5-on-brand-2` | ✅ |
| `me/stake-alternative-card.vue:141` | `--v5-on-brand-2` | ✅ |

**6 处里错 2 处。** 另:全 103 文件 `color: #fff/#000` 直写 = **0 处**(铁律「禁 `#FFF` 直写」本身遵守良好,问题出在选错了 token 而非写死 hex)。

### 6.6 ⑤L0–L3 相邻层亮度差(实测相对亮度)

| 主题 | L0 页底 | L1 surface | L2 surface-2 | L0→L1 对比比 | L1→L2 对比比 |
|---|---|---|---|---:|---:|
| dark | `rgb(0,0,0)` L=0 | `rgb(20,20,20)` L=0.0070 | `rgb(31,31,31)` L=0.0137 | 1.14 | 1.12 |
| light | `rgb(244,241,233)` L=0.8607 | `rgb(255,255,255)` L=1.0 | `rgb(250,247,240)` L=0.9314 | 1.15 | 1.07 |

- dark 两级步进均匀(1.14 / 1.12),与 tokens.css:213 宣称的「×1.5 步进」口径不同但**视觉上可辨**,判定符合《03》§4「相邻层保证亮度差可辨」。**不是违例。**
- light 的 L1→L2 只有 **1.07** —— 白 `#FFFFFF` 与米白 `#FAF7F0` 差异最小。`[推断]` 这是 light 主题层级最弱的一环,若后续要加强 L2 可读性可从这里入手。**本轮不定级**(规范只要求「可辨」,未给数值门)。

### 6.7 控制台错误

双主题 × 五 tab 采样期间 console error 收集:**0 条**(采样脚本已挂 `page.on("console")` 过滤 `type==="error"`)。

---

## ⑦ 附:本轮方法论自查(防自欺)

| 自查项 | 结果 |
|---|---|
| 是「运行时证明」还是「grep 到了」 | 全部 P0/P1 均有 `getComputedStyle` 实测值;仅状态门后的条目标 `[推断]` 并注明未渲染 |
| 有没有在未验证的工具输出上建叙事 | **有过一次并已纠正**:首轮按颜色值匹配报出 52 条白字 + 37 条 success + 42 条 warning「硬编码违例」,回源核对发现是 token 正常解析 + 探针背景计算 bug;修正探针复测后真实白字违例 = 1 条。已排除 ~130 条幻觉,详见 §1.1 |
| 「修一处」有没有全站复验同类 | on-brand 类:扫全部 6 处 brand-2 填充,定位 2 错(§6.5);零-border 类:静态 38 命中 + 运行时 19 渲染全量列出 |
| 双主题不变量是否全覆盖 | 五 tab × light/dark 各采一遍,§6.1 给出对照总量 |
| 有没有把既定豁免报成违例 | §⑤ 单列 15 类判定不报,含 chrome/toast/sheet/挖空环/QR/海报/支付品牌色 |
| 有没有只报症状不报根因 | 圆角+间距 119+320 条档外的根因收敛到 §4.1 一条(rem 漂移),而非罗列 400 条组件级 NIT |
