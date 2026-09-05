# B1 完整性对抗审查 —— 「修一处 vs 全站同类」扫描

> 立场:**默认假设有漏**。对 `2026-07-22-b1-verdicts.md` B-DONE 节 + 当前 `git diff` 的每一类改动,
> 做「已修点 → 全站同类」差集。工具产出一律回源核对;异常先跑已知答案探针证伪工具再归因。
> **未修改任何源文件。**

## 0 · 方法与工具自证(先证伪自己)

| 探针 | 期望 | 实测 | 结论 |
|---|---|---|---|
| `--v5-surface-bg` 在 HEAD 存在、worktree 消失 | HEAD>0 / NOW=0 | HEAD 3 refs → NOW 0 | 差集脚本可信 |
| 对比度算法 黑/白 | 21.00 | 21.00 | 色彩算法可信 |
| `.nx-icon-btn` 必须命中 `:active` 规则 | true | true | 按下反馈探针可信 |
| tabbar 5 tab 必须是最外层 tap target | 5 个 | 5 个 68.2×56 | tap 探针可信 |
| `en.ts`/`vi.ts` 不得含 CJK | 0 | 0 | 语言文件干净 |

**本轮工具自纠 3 次(如实记录,避免把工具 bug 当成产品 bug):**

1. **`activeSel=0` 假警报** —— 首版探针报「全站 0 条 `:active` 规则」,与源码 368 处 `active:` 矛盾。
   根因是我自己的遍历写法:现代 Chrome 里 `CSSStyleRule` 因 CSS Nesting **也带 `.cssRules`**,
   我写的 `if (r.cssRules) { walk(...); continue; }` 把每条样式规则的 `selectorText` 全跳过了。
   修正后 49 条 —— 与页面内 `<style>` 原文 `:active` 出现次数一致。**若不跑已知答案探针,这会变成一条"全站零按下反馈"的假 P0。**
2. **"首页中文 / 其它 tab 英文"假象** —— 实为我的 headless context 未固定 locale,语言解析与首屏渲染竞态。
   固定 `locale:'en-US'` 后五 tab **CJK 全为 0**。非产品 bug。
3. **bash `grep -E "[一-鿿]"` 假阳性** —— 非 UTF-8 locale 下按字节匹配,把 `·` `→` `“` 当成 CJK,
   一度报 `en.ts` 有 717 行中文。改用 Node 精确码点范围后为 **0**。

**扫描口径**:源码扫描一律剥离注释(CSS `/* */` / JS `//` / HTML `<!-- -->`)后再匹配;
运行时数据取 375×812、dark+light 双主题、五个一级 tab,`?nx_device=off`;
基线对照用 `git archive HEAD` 解出的 HEAD 树,逐类算「已修 / 残留」。

---

## 1 · 逐类「修一处 / 全站同类」扫描结果

| # | 类别 | 已修 | 全站同类总数 | 判定漏修 | 教条/豁免 |
|---|---|---:|---:|---:|---:|
| 1 | 硬编码文案 | 3 | 44 CJK 行 + 21 字面 a11y 属性 | **41**(5 组) | 15 |
| 2 | 硬编码颜色 | 5 行 | 188 行(已排除钦定 2 色) | **18** | 170 |
| 3 | 字重 >600 | 2 | 4 | **2**(倾向豁免) | 2 |
| 4 | 零 border 铁律 | 3 | 77 | **77**(系统性,非逐条) | 31 |
| 5 | tap target <44 | 3 组 | 115 个真 tap target | **16** | 2 |
| 6 | 缺按下反馈 | ~15 | 115 个真 tap target | **26** | 0 |
| 7 | 等宽字体用于长句 | 3 | 1 | **0** | 1 |
| 8 | 未定义 token | 1(3 refs) | 2 | **1**(P2)+ 51 定义未用 | 0 |
| 9 | 状态只靠颜色 | 1 | 4 处状态渲染点 | **2** | 2 |

> 第 4 类的 77 不是「漏改了 77 处」,而是**这条铁律在 uniapp 侧从来没有机器门、也没有系统落地**,
> B1 修的 3 处是随手撞上的。详见 §2.4 —— 按「逐条 P1」记会制造洁癖噪声,应作为一次策略决定处理。

---

## 2 · 漏项清单

### P0 —— 无

没有发现功能性断裂。特别核过两个高危面,均**干净**:

- **图片资产**:本轮删了 3 个 png(`nexionbox-s1-ranking` / `nexionbox-s1-weekly` / `nexionrack-p1-ranking`)。
  全量交叉核对「源码引用的 `/static/**` 路径 ↔ 磁盘实际文件」:引用 7 个,**缺失 0 个**。删干净了。
- **`stellarbox-*` 不是改名残留**:它是 `store/types.ts` 里 `DeviceKind` 联合类型的**规范内部 id**,
  全站 80+ 处一致使用,展示名才是 `NexGridBox`。内部 id 保持稳定是对的,**不算 dead reference**。

---

### P1 —— 真影响用户,建议本轮补

#### P1-1 🔴 `src/components/message-drawer.vue:88` —— 同一文件、同一功能、同一 ternary 家族,漏改第 4 行

改动把消息抽屉的已读/未读配色 token 化,同一段 7 行 JSX 里改了 3 行,**漏了中间那行 SVG chevron**:

```vue
85  <text class="md-row-title" :style="{ color: n.readAt ? 'var(--v5-ink-3)' : 'var(--v5-ink)' }">   ← 已改
88  <svg ... :stroke="n.readAt ? '#3F4754' : 'var(--v5-ink-3)'" ...>                                  ← 漏
90  <text class="md-row-preview" :style="{ color: n.readAt ? 'var(--v5-ink-4)' : 'var(--v5-ink-3)' }">← 已改
91  <text class="md-row-time" :style="{ color: 'var(--v5-ink-4)' }">                                  ← 已改
```

`#3F4754` 是**按暗主题调的值**。运行时实测(注入一条已读通知,真实渲染出 `readAt` 分支后测量;
对比度算法已用黑/白 = 21.00 自检):

| 主题 | 已读 chevron `#3F4754` | 未读 chevron `--v5-ink-3` | 层级 |
|---|---:|---:|---|
| dark | 1.97 | 6.93 | ✅ 已读更暗,正确 |
| light | **9.37** | **4.82** | ❌ **倒挂**:已读比未读醒目 1.94× |

> **双探针交叉验证**:该结论由两套**互相独立**的 harness 得到同一数字 ——
> 我的探针(375×812、`data-theme` 属性切换、对比背景取 `.md-panel`)算出 light 下 9.37 vs 5.05;
> 本会话另一路 agent 的探针(390×844、经 pinia `theme.setMode()` 切换、背景取 `__bgBehind` 实际行底)
> 算出 9.37 vs 4.82。**已读侧完全一致(9.37),未读侧因取底面不同有 0.23 差,倒挂结论一致。**

**规范依据**:任务书「只在一个主题下正确的最严重」;`feedback_token_alias_silent_fallback` 同源
(A3 裁决已记过同一坑型:「暗主题恰好侥幸通过 → 只测暗色永远发现不了」)。
**为何算漏**:与已修的 3 行是同一 ternary 模式、同一组件、同一次提交,是最典型的「修一处漏同类」。

#### P1-2 🔴 `src/components/home/device-slot.vue:14` —— 被修组件的直系兄弟没跟上

B1-2 给 `home/device-row.vue` 补了离线文字 + 两态状态词进 `aria-label`。
**同一个首页、同一个 `isDeviceOnline`、同样带 `:data-online`** 的槽位机架 `device-slot.vue` 没改:

```vue
14  :aria-label="`${t.earn.deviceDetailTitle}: ${device.name}`"      ← 无状态词
    状态仅由 iconColor(brand / ink-3)+ 托底色(brand-soft / surface-2)+ 在线才出现的绿点传达
```

对照已修的 `device-row.vue:14` `… · ${isOnline ? t.earn.online : t.earn.offline}`。
**读屏用户在机架上完全拿不到在线/离线信息。**
讽刺的是 `device-row.vue` 自己的注释就写着「No icon (those live in the rack above)」——
修的时候引用了这个兄弟组件,却没顺手看它。
**规范依据**:WCAG 1.4.1 + B1-2 自身裁决口径。

#### P1-3 🔴 token 值被硬编码复制(语义色),`verify.sh` 哨兵覆盖不到

`verify.sh` 有一条 token 纪律哨兵:
`sentinel_absent "no hardcoded #0E48E6/#F4F1E9 hex" '#0E48E6|#F4F1E9|#FF5A1F|#13141A'`。
它有**两个洞**,而漏项正好全落在洞里:

- **洞 A:只认 `#RRGGBB` 形式**。同样 4 个值写成 `rgba()` 就穿过去了 —— 实测 **7 处**逃逸,
  例:`earn/capacity-explainer-sheet.vue:9` `rgba(19, 20, 26, 0.44)` 就是 `#13141A`。
- **洞 B:45 个 token 色值只钉了 4 个**。success / warning / danger / tech-cyan / nex 全裸奔。

被这两个洞放过去的**真违例**(值抄自 token,因此**永远停在某一个主题的值上**):

| file:line | 字面值 | 等于 | 症状 |
|---|---|---|---|
| `components/staking/vault-row.vue:54` | `rgba(14,142,74,0.30)` | `--v5-success` @light | 同一对象里 `softBg`/`text` 用 token、`borderColor` 用亮色值 → **暗主题下描边是亮主题的绿** |
| `components/staking/vault-row.vue:57` | `rgba(198,131,22,0.30)` | `--v5-warning` @light | 同上 |
| `components/staking/vault-row.vue:103` | `rgba(198,131,22,0.30)` | `--v5-warning` @light | 同上 |
| `components/how/how-callout-box.vue:33` | `rgba(14,142,74,0.30)` | `--v5-success` @light | 同型 |
| `components/how/how-callout-box.vue:35` | `rgba(198,131,22,0.30)` | `--v5-warning` @light | 同型 |
| `components/store/purchase-ticker.vue:33/35/37` | `#C68316`/`#0E8E4A`/`#B9554A` | warning/success/danger @light | 3 处头像色锁死亮主题值 |

同一对象里 90/180 档用的是 `var(--v5-brand-border)` / `var(--v5-tech-cyan-border)`,
**证明写法就在手边**;`--v5-success-border`/`--v5-warning-border` 确实没定义,
但全仓已有 **137 个文件**在用 `color-mix(in srgb, var(--x) N%, transparent)`,替代方案是现成的。

#### P1-4 🟠 同一语义、三套实现:涨跌色一半 token 一半 hex

| file:line | 写法 |
|---|---|
| `components/market/token-row.vue:136` | `up ? 'var(--v5-brand)' : 'var(--v5-brand-2)'` ✅ 全 token |
| `components/home/market-board-card.vue:36` | `r.d >= 0 ? 'var(--v5-success)' : '#C26658'` ❌ |
| `components/home/market-board-card.vue:42` | 同上 ❌ |
| `components/home/nex-price-card.vue:40` | `isUp ? 'var(--v5-success)' : '#C26658'` ❌ |

`#C26658` 在两个主题下都不等于 `--v5-danger`(light `#B9554A` / dark `#FF5C5C`),
即**跌色跟全站任何一处跌色都不一致,且不随主题变**。
另 `components/staking/position-row.vue:147` 在同一个 gradient 里混用
`linear-gradient(90deg, #36D4FF, var(--v5-success))` —— 一端固定一端跟主题。

#### P1-5 🟠 tap target:被修弹层自己的关闭按钮没跟上

B1 修了「顶栏图标 38→44 / 代金券主 CTA 34→44 / 次要按钮 40→44」,
**同一个代金券弹层的关闭按钮 `.vcs-close` 实测 36×36,漏了。** 五 tab 实测 `<44` 共 **18/115**,
剔除 toast(点击只为消失,43px 差 1px)后 **16 处**,其中已被 B1-14 点名但未落地的
「6 处文字链仅 17px 高」占 4 处并已复现:

| 实测尺寸 | 位置 | file:line |
|---|---|---|
| 36 × 36 | 代金券弹层关闭 | `components/voucher-claim-sheet.vue`(`.vcs-close`) |
| 61.8 × **17** | 首页 Manage → | `components/home/my-fleet-section.vue:11` |
| 38.4 × **17** | 首页 Map → | `components/home/on-grid-section.vue:11` |
| 77.4 × **17** | 首页 View all → | `components/home/earnings-ledger-card.vue:11` |
| 46.2 × **17** | 首页 Open → | `components/home/market-board-card.vue:11` |
| 82.8 × **32** ×4 | earn 时间分段控件 Today/Week/Month/All | `pages/earn/earn.vue` |
| 65.6 / 70.7 × **28** | 首页 Activity / Earnings 切换 | `components/home/live-feed-card.vue:102-103` |
| 109.6 × **16** / 38.7 × 18 | me 页 「30 this month」/「Bills」 | `components/me/wallet-card.vue` 区 |

**规范依据**:《07》tap≥44 + `feedback_mobile_first_principle`(tap≥44pt 是 4 条 checklist 之一)。

---

### P2 —— 真问题但影响有限

#### P2-1 按下反馈:五 tab 实测 **26/115** 仍无反馈;且**同族 4 个入口只有 2 个有**

最能说明「漏同类」的证据 —— 首页四个 section header 行动链接,**四个文件都在第 11 行**,
`style` 完全一致,只差一个 class:

| file:line | class | 按下反馈 |
|---|---|---|
| `components/home/my-fleet-section.vue:11` | `font-mono-tabular active:opacity-70` | ✅ |
| `components/home/earnings-ledger-card.vue:11` | `font-mono-tabular active:opacity-70` | ✅ |
| `components/home/on-grid-section.vue:11` | `font-mono-tabular` | ❌ |
| `components/home/market-board-card.vue:11` | `font-mono-tabular` | ❌ |

> **诚实说明**:`git diff` 显示这 4 个文件本轮都被改过,但 `active:` 不在本轮 diff 里 ——
> 所以这个 2:2 分裂是**存量**,不是本轮「改了一半」。仍属「全站同类未扫」。

其余无反馈的成组遗漏(均为整组缺失,非零星):

- 首页四宫格快捷入口 `Stake / Genesis / Missions / Daily` 79.8×92 ×4
- 首页行情行 `.grid items-center gap-2` ×6
- earn 页产品行 `.flex items-center gap-3 py-2.5` ×5
- store 页 `以旧换新` banner ×1、锁定商品卡 `.flex-1 min-w-0` ×2
- Nova 悬浮球 `.nx-nova-bubble` ×1(**五个 tab 全站可见**)

#### P2-2 `--v5-bg-color-mask` 仍未定义(`components/global-ui.vue:175`)

全站 `var(--v5-*)` 引用 50 个、定义 98 个,**未定义差集 = 1**:

```css
background: var(--v5-bg-color-mask, rgba(0, 0, 0, 0.45));
```

与已修的 `--v5-surface-bg` 不同,**这处写了 fallback**,运行时实测解析为 `rgba(0,0,0,0.45)`,
**不存在静默失效**(实测 `getPropertyValue('--v5-bg-color-mask')` 返回空串,fallback 生效)。
定义一个真 token 更干净,但按现状不影响用户。

#### P2-3 排版 token 阶梯定义了却零消费者

`tokens.css` 定义了 14 档字号阶梯 + 8 档间距 + 7 档圆角,**51 个 token 引用数为 0**:

```
--v5-type-hero/display-xl/display-l/h1/h2/h3/body-m/body-s/caption/tab/button/input/mono (+ -lh 共 28)
--v5-space-1..10 (8)   --v5-radius-s/m/l/xl/2xl/3xl/full (7)
```

B-DONE 写「字号迁移 252 处 → 0 处(全部落 14 档)」—— 落的是**字面 px 值**(如 `font-size: 13px`),
不是 `var(--v5-type-body-s)`。功能上等价,但阶梯 token 目前是装饰品:
以后调档要改 51 个 token 之外的 N 处字面值,阶梯没起到单源作用。属架构取向问题,列此备主人裁。

#### P2-4 状态只靠颜色:`pages/team/network.vue:64`

```vue
:stroke="p.m.status === 'active' ? 'rgba(198,255,58,0.30)' : 'rgba(255,255,255,0.06)'"
```

网络图连线仅用颜色区分活跃/非活跃,无图例无文字。节点可点开详情,属补偿路径,故记 P2。

#### P2-5 遗留品牌绿 `#C6FF3A` 用在与主题无关的类上

`--v5-brand` 亮主题是**蓝** `#0E48E6`、暗主题是 `#9EDC1D`;`#C6FF3A`(rgb 198,255,58)两者都不是。
`tokens.css` 里它出现 15 次,其中 L289 在 `html[data-theme="dark"]` 内(正确),
但 `.dot-grid`(L381)、`.pulse-node`(L394)、`.hero-glow`(L493)**不分主题**,亮主题下是离题的柠檬绿。
**实测缓解**:这 3 个类在五个一级 tab 上渲染数均为 **0**,只在二级页出现 → 降为 P2。

#### P2-6 i18n:数据模型里写死双语字段,越南语无着落

| file | 症状 |
|---|---|
| `src/store/v-rank.ts:41-124` | 13 个军衔同时写 `title`(英)+ `cnTitle`(中),**没有 vi** |
| `src/mock/platform-config.ts:79-80` | `zhTitle` / `zhGuide` 中文写死 |
| `src/mock/faq.ts:119-122` | 意图匹配正则只含中/英关键词(`/withdraw|提现/`),越南语输入匹配不到 FAQ |

`v-rank.ts:110` 的 `NexGrid Founder` **正是本轮改名改到的那一行** —— 改名时进过这个文件,
没注意同一张表绕开了 i18n。考虑到平台主战场是越南(`Operations-related documents` 口径),这条值得排期。

#### P2-7 未翻译的 aria-label(读屏用户拿到英文/中文)

全仓字面(未绑定)a11y 属性 21 个,其中**真需要 i18n 的 6 个**:

```
pages/store/detail.vue:105   aria-label="Decrease quantity"
pages/store/detail.vue:109   aria-label="Increase quantity"
pages/me/order-detail.vue:62 aria-label="View on Earn"
pages/tx/hash.vue:48         aria-label="Copy hash for Etherscan"
pages/tx/hash.vue:52         aria-label="Copy hash for TRONScan"
components/entry-surfaces/entry-surface-home.vue:58  aria-label="查看三端完整入口链接"
```

#### P2-8 `entry-surfaces` 整个功能面 0 i18n

`components/entry-surfaces/entry-surface-home.vue` + `pages/entry-surfaces/{index,h5,signed,white}.vue`
共 **~20 条中文写死**(「签名版 APP」「H5 网页版」「白 APP 接管」「算力模式」「体检融合」…)。
铁律「i18n 不硬编码」的最大单块违例。若该面是内部/调试入口应显式标注并移出产品路由;
若是产品面则必须走 i18n。**需主人确认定位后再动。**

---

## 3 · 未定义 token 差集(完整结果)

方法:扫 `src/**/*.{vue,ts}` + `src/styles/tokens.css` + `index.html`,剥注释后
取 `var(--v5-*)` 与 `"--v5-*"` 字面串为**引用集**,取声明位 `--v5-*:`(先剔除 `var()` 内文本,
避免把 fallback 当定义)为**定义集**,做差。

```
定义 98  ·  引用 50  ·  未定义差集 = 1
```

| token | 引用处 | fallback | 判定 |
|---|---|---|---|
| `--v5-bg-color-mask` | `src/components/global-ui.vue:175` | ✅ `rgba(0,0,0,0.45)` | P2,不静默失效 |

**HEAD 基线对照(证明差集脚本有效)**:HEAD 未定义 2 个 ——
`--v5-bg-color-mask`(1 ref)+ `--v5-surface-bg`(3 refs:`me/menu-grid-card.vue:97` ×2、`earn/device-detail.vue:75`)。
`--v5-surface-bg` 已修,**runtime 实测 `getPropertyValue('--v5-surface-bg')` 返回空串**,
印证「未定义 = 静默回退」的判断成立;当前已无该引用。

**注释里的假阳性已排除**:`tokens.css:179` 的 `var(--v5-type-X)` / `var(--v5-type-X-lh)`
是注释中的用法示例,非真引用(首版脚本曾误报 2 条)。

**非 v5 前缀自定义属性**一并扫过,12 个未定义中 11 个带 fallback 或为运行时 JS 注入
(`--nx-cs-step` / `--cdur` / `--nx-device-*` 等),仅 `milestone-celebration.vue:229`
的 `--dx/--dy/--rot` 无 fallback —— 但它们由粒子 JS 每帧 inline 赋值,属正常写法,不计。

**反向发现(比差集更值钱)**:51 个 token **定义了但零引用**,见 §2 P2-3。

---

## 4 · 判为教条 / 可豁免 —— 不计入漏项

| 项 | 数量 | 不计原因 |
|---|---:|---|
| `rgba(0,0,0,x)` 遮罩 / 投影、`rgba(255,255,255,x)` 高光 | ~120 | 与主题无关的通用光影;`#000/#FFF` 恰好等于某 token 值属巧合,按 token 复制记会制造洪水 |
| `login.vue` / `register.vue` 的 `#000`/`#0F0F0F`/`#fff` | 22 | `.lg-root`/`.rg-root` 显式 `background:#000`,**整页自洽的暗色专属面**,不随主题翻车 |
| `onboarding/intro.vue`、`estimator.vue` 暗色硬编码 | 10 | 同上,引导页固定暗场 |
| `store/product-render.vue` 深色渐变 + `font-weight:700/800` | 10 | 产品 SVG 插画自成一体;字重在装饰性 SVG 文字上,升到 600 反而削弱插画 —— **建议豁免,不建议为规范而改** |
| `mock/tokens.ts` 加密货币品牌色 16 条 | 16 | 币种品牌识别色(BTC 橙等)= 数据不是主题;且 `market/token-row.vue:109` 已对 `#000000/#222326/#181EA9` 做深色品牌特判 |
| `me/proof.vue` Twitter/WhatsApp/Instagram 色 | 3 | 第三方品牌色 |
| `mock/leaderboard.ts` 金银铜牌色 | 3 | 奖牌隐喻色 |
| `share-poster-sheet.vue` `*_ON_DARK` 常量 6 条 | 6 | **canvas 读不到 CSS 变量**,必须硬编码;命名已显式声明"锁定暗色",海报本就恒暗 —— 正确写法 |
| `chain-payment.vue` / `proof.vue` 二维码黑白 | 4 | 二维码必须高对比黑白,不可主题化 |
| genesis 金色系 `#D4AF5A`/`#F4E5C2` | ~25 | 创世节点的"奢华金"子主题,自洽成体系;改需产品决定,非疏漏 |
| `#9B89E0` / `#FF6B35` | — | 任务书已声明钦定豁免 |
| 零 border:模态/抽屉/输入框/表单外框 | 31 | 铁律原意针对**卡内嵌套元素**(chip/pill/row/badge,见 `feedback_inner_block_no_border`);顶层弹层与输入框描边是标准做法 |
| `.nx-toast` 43px | 2 | 点击仅为提前消失,差 1px,非目标控件 |
| 等宽字体 `"≈ $212.04 · 1 NEX = $0.171"`(7 词) | 1 | 几乎全是数字,等宽正当;**verdicts C 节已自行标注为"汇率行 7 词假阳性"** |
| `placeholder="MM/YY"` / `"1234 5678 9012 3456"` / `"0.00"` / `"123"` | 15 | 格式示意,非可读文案 |
| `title="USDT"` / `aria-label="CVV"` | 4 | 国际通用票据/金融缩写 |
| `#C68316` 等出现在 `--v5-*-soft` 派生语境 | — | 已在 P1-3 只计"语义角色直接复制"的,派生用法不重复计 |

**另:磁盘上 6 个未被引用的图片**(`static/img/devices/*.png` 等)属清理项,无用户影响,不计漏项。

---

## 5 · 建议的机制修复(比逐条修更根治)

1. **补齐 `verify.sh` 的 hex 哨兵**:把 45 个 token 色值全部入表,并**同时匹配 `#RRGGBB` 与 `rgb()/rgba()` 两种形式**。
   一次改动即可自动抓住 P1-3 全部 8 处 + P1-4 的 4 处,且防复发。
2. **新增「同族 class 一致性」哨兵**:对同名 section-header 行动链接一类的重复结构,
   校验 `active:` 覆盖率(本轮 2/4 的分裂靠人眼才发现)。
3. **零 border 铁律先定作用域再上门**:明确它只管卡内嵌套(chip/pill/row/badge)还是所有带 bg 容器。
   现状 77 处 = 规则没落地,不是 77 个 bug;定完口径再上哨兵。

---

## 6 · 一句话结论

改动本身**没有引入功能性回归**(资产、路由、内部 id 全干净),但**「修一处 → 全站同类」这一步普遍没做完**:
最集中的证据是 `message-drawer.vue` 同一段 7 行里改了 3 行漏了第 4 行(且漏的那行在亮主题下让已读/未读层级倒挂),
以及被修组件 `device-row.vue` 的直系兄弟 `device-slot.vue` 原地未动。
按下反馈与 tap target 两类属**成组遗漏而非零星**(26/115、16/115)。
根因不是能力问题 —— 全仓有 368 处 `active:` 熟练用法、137 个文件在用 `color-mix` —— 是**缺少同类扫描这一道工序**,
以及 `verify.sh` 的 token 哨兵只钉了 45 个色值中的 4 个、且只认 hex 不认 rgba。
