本页判定目标 = 独立审计 A1 修复后的增量验收(来源:提案 docs/changes/2026-08-17-svg-text-render.md + A1 报告 P0-2 / T1 备注 2)

黑盒实测,不读实现源码,不改 `src/` `scripts/` `uno.config.ts` 任一文件。
靶:`http://localhost:5231/?nx_device=off#/<route>`(mock dev server,worktree `aw-svg-text`),视口 414×896,dpr 2。
脚本与截图目录:`D:\WORKS\PLAN\Nexion-uniapp\.claude\worktrees\aw-svg-text\.claude\pkg-dev\tester2\`

---

## 判定总表

| AC | 内容 | 结论 |
|---|---|---|
| AC-A | globe 地图圆点 opacity + 视觉可见 | **PASS** |
| AC-B | network 四个 svg text 标签在浅色主题下可读 | **FAIL**(「非柠檬绿」3/3 达标;「可读」EXTENDED 浅色 1.47:1 仍落在被点名的坏区间内) |
| AC-C | 4 路由 × 3 语言 × 深色 回归 | **PASS**(12/12) |
| AC-D | 改构建配置后的站点健全性(3 条无关路由) | **PASS**(3/3) |

---

## AC-A — globe 地图圆点(`pages/globe/globe`,dark,en)

`svg circle` 总数 **689**。计算后 opacity 与属性值逐个比对:

| opacity | 属性值计数 | 计算值计数 | 属性→计算配对 |
|---|---|---|---|
| 0.25 | 367 | **367** | `0.25 -> 0.25` ×367 |
| 0.5 | 302 | **302** | `0.5 -> 0.5` ×302 |
| 1(无 opacity 属性) | 20 | **20** | `(none) -> 1` ×20 |

- **属性值与计算值不一致的圆点数 = 0**。
- 期望 `{1: ~19-20, 0.25: ~367, 0.5: ~302}` → 实测 `{1: 20, 0.25: 367, 0.5: 302}`,精确命中。
- 地图 `<svg>` = 页内第 6 个 svg(`viewBox="0 0 440 240"`,显示尺寸 358×195 CSS px,含 682 circle + 1 text)。

**视觉判定(我本人看图确认)**:元素截图 `ac-a-map-dark-en.png` 中大陆点阵**清晰可见**——北美 / 南美 / 欧非 / 亚洲 / 澳洲的轮廓由密集网格点构成,深浅两档点交替铺满整幅;6 个柠檬绿发光区块与 1 个紫色 "You" 标记叠在点阵之上。**不是**「黑底上只有 6 个光斑」。

截图:`.claude/pkg-dev/tester2/ac-a-map-dark-en.png`、`ac-a-globe-page-dark-en.png`

---

## AC-B — network 标签(`pages/team/network`,en)

测量法:截图稳定后(连续两帧字节完全相同才取样,避开入场动画中途帧)取每个标签 bbox 内像素,众数色 = 局部背景;把 computed fill 按其 alpha 合成到该背景得到字形色,再算 WCAG 对比度。**合成预测值与实际渲染像素逐个对上(最大色差 dE 1.7)**,证明测的是真字形而不是邻近元素。

### 浅色主题(`data-theme=light`)

| 标签 | computed fill | fill 属性 | 字号/字重 | 局部背景 | 字形色 | 对比度 | 柠檬绿? |
|---|---|---|---|---|---|---|---|
| YOU(中心) | `rgb(255, 255, 255)` | `var(--v5-on-brand)` | 11px / 600 | rgb(14,72,230) | rgb(255,255,255) | **6.75:1** | 否 |
| V2 | `color(srgb 0.054902 0.282353 0.901961 / 0.85)` = 蓝 rgb(14,72,230) @85% | `color-mix(in srgb, var(--v5-brand) 85%, transparent)` | 9px / 600 | rgb(225,227,212) | rgb(46,95,227) | **4.18:1** | 否 |
| DIRECT | `color(srgb 0.054902 0.282353 0.901961 / 0.45)` = 蓝 rgb(14,72,230) @45% | `color-mix(in srgb, var(--v5-brand) 45%, transparent)` | 7px / 400 | rgb(236,231,234) | rgb(136,159,232) | **2.10:1** | 否 |
| EXTENDED | `color(srgb 0.0470588 0.768627 0.839216 / 0.55)` = 青 rgb(12,196,214) @55% | `color-mix(in srgb, var(--v5-tech-cyan) 55%, transparent)` | 7px / 400 | rgb(244,241,233) | rgb(116,216,223) | **1.47:1** | 否 |

### 深色主题(`data-theme=dark`)

| 标签 | computed fill | 字号/字重 | 局部背景 | 字形色 | 对比度 |
|---|---|---|---|---|---|
| YOU | `rgb(10, 10, 10)` | 11px / 600 | rgb(158,220,29) | rgb(10,10,10) | **11.98:1** |
| V2 | 柠檬绿 rgb(158,220,29) @85% | 9px / 600 | rgb(34,36,33) | rgb(139,192,30) | **7.19:1** |
| DIRECT | 柠檬绿 rgb(158,220,29) @45% | 7px / 400 | rgb(8,6,17) | rgb(76,102,22) | **3.08:1** |
| EXTENDED | 紫 rgb(142,114,255) @55% | 7px / 400 | rgb(0,0,0) | rgb(78,63,140) | **2.41:1** |

### 判定拆开说

- 达标 · **「三个非中心标签不得是柠檬绿」= 3/3 达标**。浅色主题下 V2 / DIRECT 解析为品牌蓝 `rgb(14,72,230)`,EXTENDED 为科技青 `rgb(12,196,214)`,与旧态 `rgba(198,255,58,…)` 色距 >45,**旧的「柠檬黄绿压米白」缺陷确实已消失**。深色主题下 V2 / DIRECT 是柠檬绿,但那是深色底上的品牌色,对比度 7.19 / 3.08,不属被点名的问题。
- 达标 · 深色主题四个标签全部可读(2.41 ~ 11.98:1),6 倍放大图逐字清晰。
- 未达标 · **「必须可读」在浅色主题下未全部达成**:
  - **EXTENDED = 1.47:1**,正好落在派单里被判为坏态的 **1.1–1.8:1 区间内**。也就是说这个标签只换了颜色(柠檬→青),**对比度没有走出原来的坏区间**。
  - DIRECT = 2.10:1,比旧态有改善,但仍低于 WCAG AA 大字号线 3:1,远低于正文线 4.5:1(而它是 7px/400)。
  - 两者在 6 倍放大图上「能认出来」,但 1 倍实景下都属于很淡的微标签。

截图:`ac-b3-svg-light-en.png`、`ac-b3-svg-dark-en.png`(SVG 元素图);`ac-b-labels-zoom-light.png`、`ac-b-labels-zoom-dark.png`(四个标签 6 倍最近邻放大条);`ac-b4-light.png`、`ac-b4-dark.png`(整页)

---

## AC-C — 四路由 × 三语言回归(dark)

12 个组合全部满足:`svg uni-text` = 0 · 每个 `svg text` bbox 宽高均 >0 且文本非空 · 每个带 `font-size` 属性的 svg text 计算字号 == 属性值 · console error = 0 · `[Vue warn]` = 0。

| 语言 | 路由 | svg text 数(下限) | svg uni-text | 空文本 | 零 bbox | 字号不符 | error | Vue warn |
|---|---|---|---|---|---|---|---|---|
| en | team/network | 4(≥4) | 0 | 0 | 0 | 0 | 0 | 0 |
| en | team/binary-how | 5(≥5) | 0 | 0 | 0 | 0 | 0 | 0 |
| en | globe/globe | 1(≥1) | 0 | 0 | 0 | 0 | 0 | 0 |
| en | store/detail?id=cloud-share | 6(≥6) | 0 | 0 | 0 | 0 | 0 | 0 |
| zh | team/network | 4 | 0 | 0 | 0 | 0 | 0 | 0 |
| zh | team/binary-how | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| zh | globe/globe | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| zh | store/detail | 6 | 0 | 0 | 0 | 0 | 0 | 0 |
| vi | team/network | 4 | 0 | 0 | 0 | 0 | 0 | 0 |
| vi | team/binary-how | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| vi | globe/globe | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| vi | store/detail | 6 | 0 | 0 | 0 | 0 | 0 | 0 |

### 各语言标签文案(格式 `"文案"@font-size属性 -> 计算字号`)

| 路由 | en | zh | vi |
|---|---|---|---|
| team/network | `"YOU"@11->11px`, `"V2"@9->9px`, `"DIRECT"@7->7px`, `"EXTENDED"@7->7px` | `"你"@11->11px`, `"V2"@9->9px`, `"直推"@7->7px`, `"扩展"@7->7px` | `"BẠN"@11->11px`, `"V2"@9->9px`, `"TRỰC TIẾP"@7->7px`, `"MỞ RỘNG"@7->7px` |
| team/binary-how | `"YOU"@10`, `"A"@9`, `"Track A"@9.5`, `"B"@9`, `"Track B"@9.5` | `"你"@10`, `"A"@9`, `"A 轨道"@9.5`, `"B"@9`, `"B 轨道"@9.5` | `"BẠN"@10`, `"A"@9`, `"Nhánh A"@9.5`, `"B"@9`, `"Nhánh B"@9.5` |
| globe/globe | `"You"@10->10px` | `"你"@10->10px` | `"Bạn"@10->10px` |
| store/detail | `"CLOUD SHARE"@22`, `"DISTRIBUTED · NO HARDWARE"@10`, `"GPU"@13`, `"CPU"@13`, `"RAM"@13`, `"SSD"@13` | 同 en(6 条全未本地化) | 同 en(6 条全未本地化) |

所有 `font-size` 属性与计算字号一一相等(含 9.5 这类小数值)。

**顺带观察(不计入本次 AC 判定,仅登记交主人裁决)**:store/detail 的 6 条 svg 文案在 zh / vi 下与 en 完全相同。`GPU/CPU/RAM/SSD` 与商品名 `CLOUD SHARE` 属规格串与品牌串,不译合理;`DISTRIBUTED · NO HARDWARE` 是一句可译的英文短语,是否该进 i18n 不在本次派单范围内。

### console 消息全量记录

补跑一遍全量 console 抓取(同样 12 组合,记录一切非 log 级消息):**非 log 级消息总数 = 0**,即无 warning、无 error、无 pageerror。每页仅 2 条 log 级消息(Vite 连接日志)。**要求「逐字记录的警告」清单为空。**

---

## AC-D — 改构建配置后的站点健全性(dark,en)

| 路由 | console error | Vue warn | 页面非空证据 | `px-4` → padding-left/right | `rounded-2xl` → border-radius |
|---|---|---|---|---|---|
| `pages/index/index` | 0 | 0 | 886 个元素;header 下方(top ≥ 90px)可见元素 726 个;最高内容块 `uni-view.nx-card-stagger px-4 pt-3 pb-4 space-y-6` 高 **2766.1px**(top 122.5);正文文本 2203 字符 | **5/5 = 16px** | **1/1 = 16px** |
| `pages/store/store` | 0 | 0 | 709 个元素;header 下方可见元素 550 个;最高内容块高 **3251.8px**;正文文本 1781 字符 | **1/1 = 16px** | 该页无 `rounded-2xl` 元素(0 个),改测 `rounded-full` → **2/2 = 9999px** |
| `pages/me/me` | 0 | 0 | 591 个元素;header 下方可见元素 418 个;最高内容块高 **2050.2px**;正文文本 1022 字符 | **1/1 = 16px** | 该页无 `rounded-2xl` 元素(0 个),改测 `rounded-full` → **2/2 = 9999px** |

补充 utility 抽样(三页合计):`flex` → `display:flex` **83/83**;`text-center` → `text-align:center` **15/15**;`rounded-full` → `9999px` **10/10**。UnoCSS 产物未被构建配置改动破坏。

视觉确认:三页均正常渲染(品牌头、卡片、渐变、tabbar、图标齐全),非空白。截图 `ac-d2-pages_index_index.png`、`ac-d2-pages_store_store.png`、`ac-d2-pages_me_me.png`。

---

## FAIL 清单(带证据)

**F-1 · AC-B · 浅色主题 `EXTENDED` 标签对比度 1.47:1,未走出被点名的坏区间**

- 位置:`pages/team/network`,浅色主题,第 4 个 `svg text`。
- 数字:computed fill `color(srgb 0.0470588 0.768627 0.839216 / 0.55)`(青 rgb(12,196,214) @55%);局部背景实测 rgb(244,241,233);合成字形色 rgb(116,216,223),与实际渲染像素 rgb(117,217,222) 吻合(dE 1.7);**对比度 1.47:1**。
- 为什么算 FAIL:派单把「旧态 ~1.1–1.8:1」定义为要修掉的坏态。颜色确实从柠檬绿换成了青色,但 1.47:1 **仍在这个区间里**,可读性没有实质改善。
- 证据文件:`ac-b4.json`、`ac-b-labels-zoom-light.png`(第 4 条)。

**F-2(P2,同族)· AC-B · 浅色主题 `DIRECT` 标签 2.10:1**

- computed fill 蓝 rgb(14,72,230) @45%,背景 rgb(236,231,234),字形色 rgb(136,159,232),**对比度 2.10:1**。
- 比旧态改善明显,但 7px/400 的文字低于 WCAG AA 3:1(大字号)与 4.5:1(正文)。
- 与 F-1 同一根因族:**低 alpha 的 `color-mix(..., transparent)` 压在米白底上**。建议按族治(定一条「浅色底 svg 微标签最低对比度」不变量 + 机器门),不要只单点调 EXTENDED。

---

## 测量方法的自证与排除项

- **入场动画会污染取样**:首轮在深色主题取到「柠檬盘变暗橄榄色、DIRECT 完全找不到字形像素、EXTENDED 整框单色」的结果,是截图落在入场淡入的中途帧。加「连续两帧字节相同才取样」的稳定门后复现一致。本页所有 AC-B 数字均取自稳定帧。
- **相邻元素会冒充字形**:DIRECT 的 bbox 下沿压到一个蓝色节点圆点,早期「取离众数最远的像素簇」的算法把圆点当成字形,虚报 5.16:1。改成「按 computed fill + alpha 预测合成色,再回像素里验证命中率」后得到真值 2.10:1(预测与实测色差 0)。**先前那个 5.16:1 是错的,以本页 2.10:1 为准。**
- **overlay 清理会自造 console error**:某一轮我按派单清 `.ms-overlay/.ms-backdrop/.ms-confetti` 后,出现 1 条
  `TypeError: Cannot read properties of null (reading 'insertBefore')`(栈:`insert` → `processCommentNode` → `patch`,组件链 `<MilestoneCelebration> <GlobalUi> <AppChassis> <Network>`,由 `src/composables/use-dialog-a11y.ts:56` 的 watch 触发),伴随 1 条 `[Vue warn]: Unhandled error during execution of scheduler flush`。
  判为**测试脚手架自伤**:我摘掉了 Vue 仍持有引用的节点。据此 **AC-C / AC-D 全程不清 overlay**,结果 12/12 与 3/3 零 error 零 warn。
  **未完全闭环的部分**:随后跑 10 次全新 context 想做 A/B 对照,celebration overlay 一次都没出现,无法直接复现。所以这条归因是间接证据(栈指向清理动作 + 只在清理轮出现 + 不清理的 15 次全 0),不是对照实验。若主人要求闭环,需要一个能稳定触发 milestone 的种子状态。
- **顺带观察(低置信,仅登记,未做复现)**:`pages/store/store` 顶部横幅在某一帧出现两条 banner 文案叠印(`Quest complete · +50 NEX` 压在 `You have a voucher to claim` 上),疑似交叉淡入的过渡帧,非本次 AC 范围。

---

VERDICT: FAIL (AC-B)
