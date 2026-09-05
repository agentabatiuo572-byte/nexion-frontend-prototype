**本页判定目标 = 「任何带背景色填充的卡片/板块一律零 border;border 只属透明容器;内嵌 chip/pill/icon 容器用 soft tint 禁 border」（来源：`UI/规范/03-空间圆角边框分层规范.md` §3 / §4 / §6 **规范明写**）。规范未明写、需推断的两处已在正文标 `[INFERRED]` 并降档：①「≤16px 圆形隔离描边环」豁免 ②「按钮/表单控件算不算卡片」。**

# C2 · 零-border 铁律 —— 第二轮独立验收

> 验收方 = 独立 agent，非实现方。结论一律自采证据，不引用 `2026-07-23-c2-verdicts.md` §6（实现方自述，按防锚定纪律未读）。
> **快照时点**：本报告基于 **2026-07-23 16:44–17:17** 的工作树。⚠️ 验收期间工作树被并发/后续编辑改动过两次（见 §7），凡受影响处已注明时点。

---

## 0 · 大白话三件事

| | |
|---|---|
| **做了啥** | 自己写了 4 个独立探针（判定扫描器 / 对比度计算器 / 像素实景采样器 / 源码同形扫描器），把「78 条违例消化到剩 4 条」这个说法从机器门、门本身、源码 diff、真实渲染像素四个方向各验一遍。 |
| **结果咋样** | **核心说法成立**：全站 88 路由 × 双主题实测，硬门违例确实只剩 4 条，剩下的 4 条确实该保留。但发现 **1 处删错了**（团队网络页的可视化卡，删完边界彻底消失，验收期间已被修回）、**1 处机制漏洞**（基线文件没重生成，63 个已消失的键还留在里面，同样的违例改回来门抓不到）、**light 主题 10+ 页的提示框删边后边界只剩色相**。另有 3 个存量老 bug（不是这轮弄的）字都快看不见了。 |
| **要主人拍板啥** | ① 基线要不要立刻重生成（现在是个真漏洞）；② light 主题提示框边界靠色相撑，接受还是补 surface 微差；③ 存量的 estimator / events 字色对比 1.0–1.2 要不要单开一轮修。 |

---

## 1 · 🔴 工具自证伪记录（先证伪工具，再信数字）

按要求，跑任何对比度/像素结论**之前**先用已知答案探针校准。**我的工具错了 4 次，全部记录在此。**

### 1.1 对比度算法 — 我的期望值错了 2 次（代码是对的）

| 探针 | 我写的期望 | 实测 | 裁定 |
|---|---|---|---|
| 黑 vs 白 | 21.00 | **21.00** | ✅ |
| 白 vs 白 | 1.00 | **1.00** | ✅ |
| `#767676` vs 白 | 4.54 | **4.54** | ✅ |
| `#949494` vs 黑 | 4.54 | **6.92** | ❌ **我错了**。手算复核 L(148)=0.2962 →(0.2962+0.05)/0.05=**6.92**。4.54 只对 `#767676` vs 白成立，对黑不对称，我把它当成对称阈值了。已改期望值。 |
| 50% 黑 over 白 → 对白 | 3.95 | **3.98** | ❌ **我错了**。3.95 是 `#808080`（整数 128）的值；alpha 合成得到的是 **127.5**，对白 = 3.98。已拆成两条分别断言。 |

修正后 **14/14 pass**（含逐层 alpha 合成 `over()`、CIE L\* 两端点）。此后所有对比度/ΔL\* 数字均出自这套已校准函数。

### 1.2 像素采样器 — 我的探针错了 2 次（这两次会直接产出假结论）

**错误 A：浮层污染，且被 dark 主题掩盖。** 首版实景探针用 `nexgrid-milestones-v1` 压制里程碑浮层——那是**废弃键**（store 已改账号分行 `nexgrid-milestones-accounts-v1`）。结果 `.ms-overlay` + `backdrop-filter: blur(8px)` 全程盖在页面上：

- light 主题整页采样 `rgb(143,141,139)`，而 computed `--v5-bg` = `#F4F1E9` = `rgb(244,241,233)` → **偏差 101**；
- **dark 主题采样 `rgb(0,0,0)` 完全正确**——scrim 压在黑底上≈黑，数字"看着对"。

⚠️ 这正是「单主题验证会放过 bug」的活样本：只验 dark 我会带着一整套错数字写完报告。
**修法**：不再靠猜键，改为① 遍历 pinia 全部 store 调 `dismiss/close/hide` ② DOM 里直接移除 `.ms-overlay/.ms-backdrop` ③ 加**地板色硬断言**——截图采样必须等于「视口级最深不透明容器」的 computed bg（容差 ≤8），不等就**拒绝出数**并记为 blocked，绝不产出可疑数字。断言上线后拦下 3 次污染采样。

**错误 B：采样几何吃圆角。** 第二版内缘取四角 `(x+5, y+4)`。`border-radius: 999px` 的胶囊 / r16 的卡，**角点落在 painted 区之外**，6 点中位数被带偏 → 一口气误报 67 个「边界不可辨」，全是胶囊 CTA。
**修法**：内外缘都只取**中轴线上的点**（左中/右中/上中/下中），任意圆角都保证在形内/形外。改完误报归零。

**错误 C（同批修掉）**：`textContent.includes` 直接 find 会命中祖先。改为「最深匹配 + 尺寸约束 + **候选必须自身有填充**」——否则抓到透明外壳，量出的 ΔL\*=0 是壳自己 vs 壳自己，是假阴性。

### 1.3 环境

`curl localhost:5173` → **200**（`127.0.0.1` → 000，vite 绑 `[::1]`，符合已知环境特性）；viewport **390×844**；一律 `?nx_device=off`；落地等 2.0–2.2s 越过浮层窗口。

---

## 2 · 逐条判定表

| # | 声称 | 判定 | 实测证据 |
|---|---|---|---|
| 1 | 机器门全绿 | **PASS** | `npm run type-check` → `exit=0`；`bash scripts/verify.sh` → `exit=0`，**324 PASS / 0 FAIL**。均按要求用 `cmd > log 2>&1; echo exit=$?` 取退出码，**未走管道**。 |
| 2 | 门本身可信 | **PASS** | `node scripts/zero-border-gate.mjs --selftest` → `exit=0`，**26/26**（含阳性：实底/tint/渐变+四边框、`box-shadow 0 0 0 Npx` 环、`outline`；阴性：透明底+四边框、虚线、`style:none`、全透明描边、alpha<0.03、tabbar/header chrome；反向锁「普通卡不被 chrome 豁免误放」）。判据逐条回源对得上 §3/§4/§6，**不是为放行调的参**。 |
| 3 | **78 → 剩 4 条 full** | **PASS** | 官方门 `--list` **跑了两次**（16:5x 与 17:1x），两次都是 **`合计 full 4 · partial 152`**。4 条 = login `.lg-field-wrap` / login `.lg-phone` / register `.rg-phone` / wallet-withdraw 20×20 单选点。 |
| 4 | 独立复核该结论 | **PASS（+3 差异，均已解释）** | 我**不 import 那个脚本**（它顶层有 `await sweep()` 副作用），自写判据扫全部 **88 路由 × 双主题 × 分段滚动（8 段）**、选择器用 `*`（不是门的 6 类标签）。结果 **full 7**：门的 4 条 + genesis 2 条（在豁免名单里，门不报）+ `.uni-checkbox-input` 1 条（**门的选择器盲区**，见 §5.5；我判它**不是**违例）。→ **门无漏报**（对真违例而言）。 |
| 5 | 剩的 4 条是「故意保留的教条项」 | **PASS，我独立同意不该修** | 见 §6。实测：login 输入框壳 ΔL\* **4.32** 双主题、边界对比 1.10；wallet-withdraw 单选点 ΔL\* **+74.51**(dark) / **−50.70**(light)、边界对比 10.78 / 5.06。 |
| 6 | 删了 48 处 border 声明 / 33 文件 | **基本属实（计数口径差 1）** | 逐行解析 diff：**47 条 `border:` 声明** + **2 条 `boxShadow: inset 0 0 0 1px` 环**（v-badge / v-badge-icon）= **49**。文件数 33（我快照时点）→ 17:03 后变 34。差 1 属「`ACCENT_BORDER` 表算不算一处声明」的口径，非实质。 |
| 7 | **新增 border = 0** | **PASS** | 扫描 diff 全部 `+` 行：唯一带 `border` 的 `+` 行是 `genesis.vue` 的**同一条边**（只改了小数精度，见 #8）与 4 条注释。`.lg-social__btn` / `.rg-social__btn` / `.rg-sponsor` / `bugCardStyle` 都是整行重写后**不带** border。✅ |
| 8 | 没改任何底色/字色/尺寸 | **PARTIAL** | ①**底/字色**：v-badge / v-badge-icon 的 13 档 `bg` 与 `text` 值**逐字节相同**，只删了 `ring` 字段 ✅。②**夹带**：`genesis.vue` 两处 `color-mix(… 55.00000000000001%, …)` → `55%`（一处 `color:`、一处 `background:` 渐变）——数值等价、视觉零差，但**属本轮范围外**。③**尺寸**：实测 **43 个元素各缩 2px**（删 1px 边的固有后果，不是额外改尺寸），无塌陷/重叠/遮挡，console error = 0。 |
| 9 | 门 / 基线 / 豁免名单没被改过 | 🔴 **FAIL（如实陈述层面）** | 三个文件**都在工作树里被改了**。方向逐个判见 §3——结论：门的改动是**收紧**不是放水；豁免名单是**真放行**（3 条）；基线**没重生成**，留下真漏洞。 |
| 10 | 没删错（过度整改） | 🔴 **发现 1 处，验收期间已被修回** | `network.vue` orbCard，见 §4.1。其余 49 处删除逐条回源：**无一处是 `background: transparent` 元素**（全部在同一 style 块内有真实填充）。 |
| 11 | 实景 verify 绿 ≠ 渲染 OK | **PASS + 1 系统性 NOTE** | 见 §5。`borderWidth` 实测全 0（136 次采样）；console error **0**；边界 dark 主题 ΔL\* 6.3–17.1 清晰，**light 主题 callout 家族 ΔL\* 0.17–1.42 / 边界对比 1.00–1.04**，只靠色相撑。 |
| 12 | 约 20 处「门因条件渲染看不见」 | **数字对，口径偏小 ~3.5×** | 见 §5.6。 |

---

## 3 · 门 / 基线 / 豁免名单：逐处判「是谁的、是不是为放行而改」

### 3.1 `scripts/zero-border-gate.mjs` — **收紧，不是放水** ✅

```diff
-const allowed = (h) => ex.some((e) => (!e.route || e.route === h.route) && (!e.cls || e.cls === h.cls));
+const allowed = (h) =>
+  ex.some((e) => (!e.route || e.route === h.route) && (!e.cls || e.cls === h.cls) && (!e.size || e.size === h.size));
```
豁免匹配从 `route+cls` 加严到 `route+cls+size`。`cls` 常是泛用工具类（`relative overflow-hidden`），只比 route+cls 会把同页同类名元素一起放走。**这是唯一一处门逻辑改动，方向是变严**，判据（`judge` / `hasFill` / `borderSides` / `shadowRing` / `isChrome`）**一行未动**。红测 26/26 全绿且含双向锁。→ **不是「改门迁就违例」。**

### 3.2 `docs/ZERO-BORDER-ALLOWLIST.json` — `[]` → **3 条**，这是真放行 ⚠️

| 条目 | 我的裁定 |
|---|---|
| `genesis` hero 358×232 · Claim seat CTA 358×54（金-曜石） | **归属：主人拍板（文中自述）。我无法验证该拍板，故不判对错，只如实标注：这 2 条是「豁免」不是「修复」。** 从视觉看理由站得住（$11,999 旗舰 SKU 视觉身份），且 route+cls+size 精确匹配、不外溢。实测两条确实仍带 1px 金边（dark/light 均 `bw=1px×4`）。 |
| `network` orbCard 358×388 | **归属：C2 第二轮（17:03 后新增）。我独立同意这条豁免**——理由不是人情，是规范本体：该卡平底层**逐值等于页面地板**（dark 卡底 `rgb(0,0,0)` = 祖先 `rgb(0,0,0)`；light `rgb(244,241,233)` = 祖先同值，我实测 ΔL\*=**0.00**、边界对比 **1.00**）。§3「零 border 靠 surface 微差色分层」的前提（存在可用微差）在这里**不成立**，按 §3 本体它就是**透明容器**形态 → border 合法。 |

> ⚠️ 净效果：**声称的「78 → 4」里，有 3 条是靠豁免出列的，不是靠删边**。准确表述应是「78 → 硬门 4 条 + 豁免 3 条」。

### 3.3 `docs/ZERO-BORDER-BASELINE.json` — 🔴 **没重生成，留下 63 键的棘轮漏洞**

| | HEAD | 工作树 | 实测 live |
|---|---:|---:|---:|
| full | 78 | **67** | **4** |
| partial | 151 | 151 | 152 |

文件 mtime **16:18:22**，而多数源文件改到 **16:26 及以后**（如 `login.vue` 16:26:35）→ **基线是在整改中途生成的，之后再没更新**。门自己也在报：

```
PASS  零-border:无新增 full 违例(基线 218 条,本次消失 63 条)
```

**为什么这是真漏洞**：门的判据是
```js
const known = new Set(baseline.map(key));
const added = live.filter((h) => h.kind === "full" && !known.has(key(h)));
```
那 **63 个已消失的键仍在 `known` 里**。任何一条被原样改回来（同 route + kind + cls + size），`added` 都是空 → **门不会拦**。基线 `_doc` 写着「只许缩不许涨」，但**没有任何机制强制它缩**。

**建议（置信度 HIGH）**：跑 `node scripts/zero-border-gate.mjs --update-baseline` 让基线落到 4 + 152，并在 verify 里加一条哨兵：`gone > 0` 时 exit≠0，强制「消化完必须重生成基线」。这是本轮**最该立刻做的一件事**，成本一条命令。

---

## 4 · 有没有删错（防过度整改）

### 4.1 🔴 确认 1 处过度删除：`src/pages/team/network.vue` orbCard

**我是怎么发现的**（时间线可证伪）：

1. 读 `git diff -U20` 时发现被删的 border **正上方三行注释还在**，且注释内容正是「别删这条边」：
   > `// Visualization card (whitelist): flat part of the bg equals the page floor, so`
   > `// the neutral border IS the card boundary — dropping it would turn the radial`
   > `// wash into a floor aura (which must then be deleted, degrading the orb).`
2. 实景像素实测印证注释的预言：`ΔL* = 0.00`、边界对比 **1.00**、内缘 `rgb(0,0,0)` = 外缘 `rgb(0,0,0)`（dark）/ 内外均 `rgb(244,241,233)`（light）。→ **删边后这张 358×388 的卡在两个主题下都完全没有边界**。
3. 截图证据：`assets/c2-round2-acceptance/_pages_team_network__{dark,light}__s0.png`。

**状态**：**17:03 该边已被修回**（`bw=1px/1px/1px/1px` 实测复现），并补了实测数据的注释 + 登记进豁免名单。我独立复核认可该修法（理由见 §3.2）。

**流程含义**（比这一处本身更重要）：删除动作发生在**紧贴其上三行的反对意见**没被读的情况下。建议把「删 border 前必须读同一 style 块上方 5 行注释」写进对应 skill 的检查项。

### 4.2 没删错的部分（逐类回源核过，全部健在）

| 该保留的类别 | 核验方式 | 结论 |
|---|---|---|
| **`background: transparent` 元素的边** | 对全部 **50 处删除**逐条抓同 style 块的 `background` | ✅ **0 处**误删——每一处删除的元素都有真实填充（实底 / color-mix tint / gradient） |
| 透明容器 hairline | `partial` 152 条实测，主体是 `.spv` 子页头底边、`.tis-panel` 面板顶边 | ✅ 全在，门只列不拦 |
| empty-state 虚线 | 源码扫描：`search.vue:209/214`、`developer.vue:377`、`trial.vue:297` 的 `1px dashed var(--v5-border-strong)` | ✅ 全在 |
| chrome | `app-chassis.vue:558` `--v5-glass-border`、`global-ui.vue:134` `--v5-toast-border` | ✅ 全在 |
| 隔离描边环 | `nova-bubble.vue:177` `1px solid var(--v5-bg)`、`my-devices-entry.vue:91` / `locked-product-card.vue:155` `2px solid var(--v5-surface)`、`messages.vue:279` `1.5px solid var(--v5-bg)` | ✅ 全在 |
| 表单控件边界 | login `.lg-phone`/`.lg-field-wrap`、register `.rg-phone`、`captcha-slider.vue:186/203/207`、`card-payment.vue:209`（cvv 聚焦态） | ✅ 全在 |
| **spinner 的 border** | `captcha-slider.vue:222` `.cs-spin { border: 2px solid …; border-top-color: … }` | ✅ 完整（estimator 的 spinner 是 SVG stroke，本就无 border） |
| 选中/激活态的边 | `wallet-topup.vue:443`、`wallet-withdraw.vue:584` 的 `2px solid ${active ? brand : border}` | ✅ **未被删**（源码扫描确认仍在） |

### 4.3 状态可辨性没丢（业务逻辑面）

- `genesis/marketplace` 排序 chip：删边后选中态改为 `--v5-brand-soft` 底 + `--v5-brand` 字。实测选中 vs 未选 ΔL\* **dark 24.90 / light 12.24**，状态差保留；且**两态都不带 border**，切换无 1px 跳位（原来未选态是 `1px solid transparent` 占位）。✅
- `estimator` `.est-phone`：删掉 `2px solid var(--v5-brand)` 后只剩 glow + brand 12% 渐变，实测 dark ΔL\* **0.70** → **强调几乎消失**。这是装饰性强调不是交互态，判 **MEDIUM 不判 FAIL**，但建议补回 surface 差或加厚 tint。

---

## 5 · 实景（verify 绿 ≠ 渲染 OK）

方法：以 **HEAD 基线记的 78 条 full 本身**为靶（`route + cls + size` 精确定位，不另起炉灶猜元素），88 路由 × 双主题 × 4 段滚动，截图 → pngjs 解码 → 中轴线采样。共 **136 次成功采样**，`console error = 0`。

### 5.1 `borderWidth` 是否真为 0

**是。** 136 次采样中 `bw ≠ 0` 的只有 14 次，全部可解释：genesis ×2（豁免）、login ×2 + register ×1 + wallet-withdraw ×1（声称保留的 4 条，双主题共 8 次）、network ×1（17:03 修回）。**其余全部 `bw=0px/0px/0px/0px`。**

### 5.2 边界仍可辨？—— dark PASS，light 有系统性弱化

**dark 主题（PASS）**：主流卡片 ΔL\* **+4.32 ~ +17.10**，边界对比 1.10–1.46。抽样：

| 元素 | ΔL\* | 边界对比 | 内缘 / 外缘 |
|---|---:|---:|---|
| `how-hero` 卡（11 路由共享，staking 页） | **+6.32** | 1.14 | `20,20,20` / `0,0,0` |
| `how-callout-box`（13 处，commissions 页） | **+17.10** | 1.46 | `51,41,15` / `20,20,20` |
| `entry-action--ghost`（3 路由） | **+6.32** | 1.14 | `20,20,20` / `0,0,0` |
| `v-badge` V1（team/unilevel） | **+20.27** | 1.61 | — |
| `v-badge-icon` 档位方块 48×48（team/rank） | **+12.65** | 1.30 | — |
| trust 40×40 头像 | **+12.49** | 1.35 | — |
| 状态角标 COOLING / UNLOCKED | **+13.44 / +12.93** | 1.39 / 1.37 | — |

→ **`v-badge` / `v-badge-icon` 删 `inset 0 0 0 1px` 环后，dark 主题边界靠 soft tint 完全撑得住**（12.6–20.3），符合 §6「内嵌 chip/pill 用 soft tint 禁 border」。

**light 主题（🔴 系统性 NOTE）**：`how-callout-box` 家族 **10+ 页** ΔL\* 掉到 **0.17 ~ 1.42**、边界对比 **1.00–1.04**：

| 路由 | ΔL\* | 边界对比 | 内缘 / 外缘 | 逐通道最大差 |
|---|---:|---:|---|---:|
| `genesis/how-it-works`「⚠️ Emissions…」| **0.17** | **1.00** | `251,241,217` / `244,241,233` | 16 |
| `me/kyc` ×2 | **0.17** | **1.00** | `251,241,217` / `244,241,233` | 16 |
| `team/commissions-how`「💡 Why a cooling…」| **0.17** | **1.00** | `251,241,217` / `244,241,233` | 16 |
| `team/rank-how` / `leadership-pool-how` / `wallet-repurchase-how` | **0.17** | **1.00** | 同上 | 16 |
| `me/wallet-exchange-how`「✓ Your funds…」| **−0.51** | 1.01 | `223,245,232` / `244,241,233` | 21 |
| `genesis/how-it-works`「💡 Why earlier…」/ `unilevel-how` / `marketplace` chip | **−1.42** | 1.04 | `232,237,251` / `244,241,233` | 18 |

**判定：NOTE 不是 FAIL。** 边界没有完全消失——它靠**色相**存在（逐通道最大差 16–21，相当于 6–8% 的 tint），亮度上确实等于地板。但 §4 明写「相邻层之间保证亮度差可辨」，light 主题下这条**没满足**。dark 主题同一组件是 16.1–17.1，说明问题只在 light。
**建议（置信度 MED）**：light 主题给 callout 换 `--v5-surface`（#FFFFFF，对地板 ΔL\* ≈ +4.8）打底再叠 accent tint，既守零 border 又拿回亮度差。

### 5.3 位移 / 塌陷

**43 个元素各缩 2px**（删 1px 边的固有后果），一处不多一处不少：`358x321→358x319`、`354x95→354x93`、`62x18→60x16`…… **无塌陷、无重叠、无内容溢出**，`console error = 0`（88 路由全量扫描 + 全部定点跑）。判 **PASS + NOTE**：chip 高度 18→16px 属非交互标签，不触 44pt 触达线。

### 5.4 上一轮对比度回归有没有复发 —— **没有** ✅

上一轮的坑是「顺手把 `me.vue` 退出按钮底色从 `--v5-surface` 换成 `--v5-danger-soft`，对比度 4.71 → 3.73」。本轮核验：

- `git status` 里**根本没有 `src/pages/me/me.vue`** → 本轮一行没碰；
- HEAD 源码 `signOutStyle` 上方已有防御注释：`// 《03》§4 零 border。⚠️ 不要换成 --v5-danger-soft 底…`；
- 更根本地：**全轮 142 行变更逐行核过，除 genesis 两处小数精度外，零底色 / 零字色改动**（v-badge 13 档 bg/text 逐字节相同）。

→ **本轮不存在同类回归**。（我实测到的低对比度全部是存量，见 §8，已逐条证明字色未被本轮改动。）

### 5.5 门的选择器盲区（LOW，当前不产生漏报）

门的探针只查 6 类标签：
```js
document.querySelectorAll("uni-view,view,uni-text,text,uni-button,button")
```
我用 `*` 扫，全站命中的 163 个元素里 **只有 1 个**落在门的射程外：`/pages/me/wallet-cards-new` 的 `<div class="uni-checkbox-input">`（18×18，白底 + `1px solid rgb(209,209,209)`）。
**我判它不是违例**——那是 uni 内置勾选框的原生默认样式，属「非文本 3:1 对比」的可访问性边界，§3 尾明写归《无障碍规范》。
→ 盲区**真实存在**（`image` / `label` / `input` / `div` 一旦承载卡片就查不到），但**当前成本 = 0 条真违例**。判 LOW，建议下轮把选择器放宽到 `*` + 尺寸下限。

**另有好消息**：我同时扫了 `::before` / `::after` 伪元素画边（上一轮记录的已知盲区）—— **全站 0 处**。这个洞目前是空的。

### 5.6 完整性：「约 20 处门看不见的同形」核实

**数字对得上，但口径偏小。** 两个不同的分母：

| 口径 | 数量 | 说明 |
|---|---:|---|
| HEAD 基线 78 条 full 里，运行时**再也定位不到**的 | **20** | 与「约 20 处」**完全吻合** ✅。清单：`me/goals 358x195`、`me/kyc 358x249`、`missions 358x193`、`estimator .est-loading` / `.est-phone anim-up`（瞬时态）、`terms .tos-risk`、`commissions-how WITHDRAWN chip`、`unilevel-how ×2`、`trust 358x140` 等。 |
| **源码里**「同一 style 块同时有 `background` + 四边 `border`」 | **87**（剔除 transparent 底 4 / 虚线 4 / chrome token 3 / TS 类型 1 后 **≈75**） | 其中只有 7 个当前渲染成违例。**≥40 个是无争议的「实底卡 + 标准边」**。 |

**门看不见的真实存量举例**（全部 `--v5-surface` / `--v5-surface-2` 实底 + `--v5-border` 标准边，与已修的那批同形）：

- `components/me/setting-row.vue:49`、`components/me/theme-row.vue:48`
- `components/me/stake-alternative-card.vue:83`、`components/me/trial-countdown-hero.vue:108`
- `components/store/locked-product-card.vue:205`、`components/genesis/my-token-card.vue:199`
- `components/support/conversation-thread.vue:415`、`components/me/menu-grid-card.vue:60/89`
- `pages/store/detail.vue:451`、`pages/me/trial.vue:308`、`pages/register/success.vue:192`
- `pages/onboarding/connect.vue:329/338/355`、`pages/me/wallet-topup.vue:409/494/520`
- **弹窗/浮层内 22 处**（门从不打开它们）：`lucky-spin-sheet` ×3、`trial-extension-sheet` ×2、`opensea-modal` ×2、`purchase-sheet`、`eligibility-sheet`、`nickname-sheet`、`theme-picker-sheet`、`tradein-ladder-sheet`、`stake-sheet`、`capacity-explainer-sheet`、`receipt-modal`……

**裁定**：「约 20 处」这个说法**在它自己的口径下是诚实的**（就是基线里定位不到的那 20 条），**不是给漏修找借口**。但它会让读者低估欠账——真实同形存量 **≥40 处**（保守，已剔我扫描器的假阳性），约为陈述值的 **3.5 倍**，且大头在**弹窗/浮层**这个运行时门结构性看不到的区域。
**建议（置信度 HIGH）**：下一轮把门扩成「打开每个 sheet/modal 再扫」，或补一条**源码侧**哨兵（同块 `background` + `border` 的静态计数棘轮），否则这 40+ 处永远不会被机器发现。

---

## 6 · 我判为「不该修」的教条项（防洁癖，别为了显严格要求过度整改）

| # | 项 | 为什么不该修 |
|---|---|---|
| 1 | login `.lg-phone` / `.lg-field-wrap`、register `.rg-phone`（342×56，实底 + 1px `--v5-surface-2`） | §3 尾**明写**：「可访问性强边界（表单聚焦、非文本 3:1 对比）详见《无障碍规范》，不在此用弱 `border-subtle`」。输入框壳的边就是控件边界。实测 ΔL\* 4.32 也说明它没在假装卡片。 |
| 2 | wallet-withdraw 20×20 单选圆点（brand 20% 底 + 2px brand 环） | 同上，选中态的表单控件指示器。门的 `isoRing` 豁免只到 16px 所以被抓，属**判据边界效应**不是真违例。`[INFERRED]`：规范未明写按钮/控件算不算卡片，故此条降一档表述。 |
| 3 | `.uni-checkbox-input`（uni 内置勾选框默认样式） | 框架原生控件，非本工程编写的卡片样式；同属非文本 3:1。 |
| 4 | `network.vue` orbCard（17:03 后恢复 + 登记豁免） | 平底层逐值等于页面地板 → 按 §3 本体它**就是透明容器**，border 是规范允许的那一类。我实测 ΔL\*=0.00 支持这个判断。 |
| 5 | `captcha-slider.vue:222` `.cs-spin` 的 `2px solid` + `border-top-color` | 那是 spinner 的**几何构造**，不是卡片描边。删了就没有转圈动画。 |
| 6 | `nova-bubble:177` / `my-devices-entry:91` / `locked-product-card:155` / `messages:279` 的 `1.5–2px solid var(--v5-bg|surface)` | 状态点用**底色**描边做分隔，是隔离环技法。删了小圆点会糊进背后的头像/卡面。`[INFERRED]`：该豁免规范未明写，是任务书列的，故降档表述。 |
| 7 | genesis 金-曜石 hero + Claim seat CTA | 已有主人拍板 + 精确匹配豁免，不外溢。我不重开这个议题。 |
| 8 | 152 条 `partial` | 主体是 `.spv` 子页头底边与 `.tis-panel` 面板顶边 = §3 认可的分组 hairline / chrome。门只列不拦是对的。 |
| 9 | `search.vue` / `developer.vue` / `trial.vue` 的 `1px dashed` | §3 明写 empty-state 虚线合法。 |

---

## 7 · ⚠️ 并发会话导致的工作树漂移（归属存疑，不算到本轮头上）

验收期间工作树**被改了两次**，我如实记录、不做归属断言：

| 时点 | 变化 | 我的处理 |
|---|---|---|
| 16:44 | 我的快照基线（33 文件） | 全部 diff 分析基于此 |
| **17:03** | `network.vue` orbCard border **被恢复** + 补实测注释 | 我的过度删除结论**在此之前**已独立得出（§4.1 时间线），修复本身我认可 |
| 17:03–17:17 | 新增 `captcha-slider.vue`（只加防御注释）；`how-callout-box` / `how-hero` / `holder` / `wallet-withdraw` 等补注释；豁免名单加第 3 条 | 文件数 33 → **34**；`--shortstat` 66 insertions / 98 deletions |

三次跑门（16:5x、17:1x）结果一致（full 4），说明漂移**没有改变核心结论**。但主人若要按 commit 拆分，需先确认 `captcha-slider.vue` 与 genesis 小数精度改动的归属。

---

## 8 · 清单之外的问题（按真影响用户排序）

> 🔴 以下 1–4 **全部经 diff 逐行核实为存量**，**不是本轮引入**（本轮零底色/零字色改动）。但它们就在本轮动过的页面上，且删边后更缺补救，故一并报出。

| # | 严重度 | 问题 | 实测证据 |
|---|---|---|---|
| 1 | 🔴 **P1** | `/pages/onboarding/estimator` **light 主题字几乎看不见**。`.cmp` / `.est-loading` 硬编码 `background: #0f0f0f`，而文字用主题 token（light 下是深色）→ 深字压深底。 | 文字框内像素 2% 分位 `rgb(14,14,14)`、98% 分位 `rgb(18,19,24)` → **实测对比度 1.04**；声明字色 `rgb(19,20,26)` vs 底 = **1.01**。（AA 需 4.5）截图 `spot__…estimator__light__With-NexGridBox.png` |
| 2 | 🔴 **P1** | `/pages/events/events` **light 主题 CTA 文字不可读**。「View progress」/「Claim discount」用 brand 亮绿字压 brand-soft 浅底。 | 声明字色 `rgb(198,255,58)` / 底 `rgb(249,255,235)` → **1.16**。同页「FEATURED」标签 `rgb(255,200,61)` / 白 = **1.55**。 |
| 3 | 🟠 **P2** | light 主题 callout **标题**对比度不达 AA（10+ 页共享 `how-callout-box`）。叠加 §5.2 的 ΔL\*≈0.17，整块提示几乎"浮"在页面上。 | `rgb(198,131,22)` on `rgb(251,241,217)` = **2.81**（12.5px/600，AA 需 4.5）。同组件 dark 主题 = **9.31** ✅ |
| 4 | 🟠 **P2** | login / register **light 主题主题化不完整**：`.lg-root` / `.rg-root` 硬编码 `#000`，子元素却用 `var(--v5-surface)` → light 下变「黑底白卡」。 | `.lg-social__btn` light 内缘 vs 外缘 ΔL\* = **100.00**、边界对比 **21.00**（= 纯黑 vs 纯白）。 |
| 5 | 🟡 **P3** | 🔴 **基线棘轮漏洞**（见 §3.3）：63 个已消失的键仍在 `known` 集合里，同款违例改回来门抓不到。 | 门自报「本次消失 63 条」；基线 full 67 vs 实测 live 4。 |
| 6 | 🟡 **P3** | 门选择器只覆盖 6 类标签（见 §5.5）。 | 我用 `*` 扫出 1 个门看不到的元素。 |
| 7 | 🟡 **P3** | `genesis.vue` 两处 `55.00000000000001%` → `55%` 属范围外夹带（视觉零差）。 | diff 逐行。 |
| 8 | 🟡 **P3** | 流程信号：`network.vue` 的删除动作发生时，**紧贴其上三行的反对注释没被读**，且删完注释被留在原地与代码矛盾约 45 分钟。 | §4.1 时间线。 |

---

## 9 · 六维评分（每维附证据）

| 维度 | 权重 | 分 | 证据（可复核） |
|---|---:|---:|---|
| **跨端兼容** | 25% | **92** | 改动全是纯 CSS `border` 删除，零平台 API / 零条件编译；uni H5 **88 路由 × 双主题**全量扫描 `console error = 0`；136 次像素采样无塌陷/重叠，唯一位移是删 1px 边固有的均匀 **−2px（43 元素）**；`type-check exit=0`、`verify exit=0 / 324 PASS 0 FAIL`。**扣 8**：`.cmp` `#0f0f0f`、`.lg-root` `#000` 这类硬编码底色在 light 主题下与 token 化子元素冲突（实测字对比 **1.01**），虽为存量，但删边后连最后一点边界提示也没了。 |
| **视觉对齐规范** | 20% | **84** | 判据逐条回源对得上 §3/§4/§6，selftest 26/26 双向红测；dark 主题边界 ΔL\* **+4.32 ~ +17.10**、边界对比 1.10–1.46，§4「相邻层亮度差可辨」满足。**扣 16**：light 主题 `how-callout-box` 家族 **10+ 页** ΔL\* **0.17–1.42**、边界对比 **1.00–1.04**，亮度差实测为零、只靠色相（逐通道差 16–21）撑，§4 该条在 light 下不成立；另 `.est-phone` 强调边删后 dark ΔL\* 仅 **0.70**。 |
| **业务逻辑一致** | 20% | **95** | 状态可辨性逐个实测：marketplace 选中态 ΔL\* **dark 24.90 / light 12.24** 且两态皆无边（消除 1px 跳位）；`wallet-topup:443` / `wallet-withdraw:584` 的 `2px solid brand` 选中态**未被误删**（源码扫描确认）；`day-one-quest` done 态未动；spinner `.cs-spin` 环完整；表单控件边界 8 处全在。**扣 5**：`.est-phone` 装饰性强调削弱（非交互态，故轻扣）。 |
| **转化 + 文案** | 15% | **88** | 转化触点边界全部实测可辨：`entry-action--ghost` **4.83/6.32**、`cta-secondary`(intro Sign in) **4.83/6.32**、`ref/code` 礼包卡 **4.83/6.32**、`ks-card` **6.32/7.27**、`.lg-social__btn` **6.32/21.00**；文案**零改动**（142 变更行逐行核过，无 i18n 文件、无字符串增删）。**扣 12**：events「View progress」CTA light 字对比 **1.16**（存量，但本轮动过 `events-card.vue`，属"路过没顺手报"）。 |
| **i18n** | 10% | **100** | `git status` 无 `src/i18n/**`；142 变更行中零字符串增删；`i18n-key-mirror`（94 namespace）+ `i18n-placeholder-parity` 在 verify 324 PASS 内全绿。本维零风险。 |
| **token 纪律** | 10% | **90** | diff 全部 `+` 行**零新增硬编码 hex**（唯一出现的 `#0F0F0F` 是 `.rg-sponsor` 整行重写时原样带过，HEAD 已有）；删掉的 `ACCENT_BORDER` 表 `grep -rn ACCENT_BORDER src/` = **0 残留消费者**；`--v5-*-border` 系列 token 定义未被误删；金色已收敛为 `--v5-genesis-gold-on-dark` token。**扣 10**：`genesis.vue` 两处小数精度改动属范围外夹带。 |

**加权总分 = 92×0.25 + 84×0.20 + 95×0.20 + 88×0.15 + 100×0.10 + 90×0.10 = 23.00 + 16.80 + 19.00 + 13.20 + 10.00 + 9.00 = 91.0**

**判定：通过（91.0 ≥ 90），带 2 条必办、3 条待拍板。**
（对比：上一轮 82.7 不通过。本轮主体工作扎实——49 处删除零误删透明容器、零新增 border、零底色/字色回归、dark 主题边界全部可辨。失分集中在 **light 主题**与**机制层**，不在整改本身。）

---

## 10 · 必办 / 待拍板

### 必办（不需要主人决策，成本极低）

1. 🔴 **重生成基线**：`node scripts/zero-border-gate.mjs --update-baseline`，让基线从 67 落到 4 + 152。当前 63 个陈旧键是**真漏洞**（§3.3）。
2. 🔴 **给棘轮加锁**：verify 里加一条 —— 门报告 `gone > 0` 时 exit≠0，强制「消化完必须重生成基线」。否则同样的漂移下轮还会发生。

### 待拍板（附我的倾向与置信度）

| 事项 | 利 | 弊 | 我的倾向 |
|---|---|---|---|
| **light 主题 callout 边界只剩色相**（10+ 页，ΔL\* 0.17–1.42） | 现状完全守住零 border 铁律 | §4「相邻层亮度差可辨」在 light 下不成立；叠加标题对比 2.81，整块提示"浮"着 | **建议改**：callout 在 light 主题下先垫 `--v5-surface`(#FFF，对地板 ΔL\* ≈ +4.8) 再叠 accent tint。既守零 border 又拿回亮度差。**置信度 MED**（改法确定，但要不要改是设计取舍） |
| **门的射程扩到弹窗/浮层 + 源码侧哨兵** | 能覆盖 ≥40 处当前机器看不见的同形 | 门跑一次会更慢（现已 ~6 分钟）；打开 sheet 需要每个入口的触发脚本 | **建议先加轻的那个**：源码侧「同块 `background` + `border`」静态计数棘轮（我的扫描器可直接改成哨兵），几秒钟跑完；运行时打开 sheet 的重活留到下一轮。**置信度 HIGH** |
| **存量字色对比 1.01–1.16**（estimator / events，§8 #1#2） | 不属本轮范围，本轮零字色改动，不背这个锅 | 用户在 light 主题下这两处**基本读不了字**，是真 P1 | **建议单开一轮**（"light 主题主题化补齐"），连带 login/register 的 `#000` 硬编码根一起收。**置信度 HIGH**（问题确凿），范围另议 |

---

## 附 · 验收自身的可证伪性声明

- **未改任何源文件**。`git status --porcelain` 中新增项只有我创建的截图目录 `docs/changes/assets/c2-round2-acceptance/`（26 张，2.1MB；多余 261 张已按项目规则 Move 到 `.trash/<时间戳>/c2-round2-acceptance-extra/`，未硬删）。`git diff --stat -- src` 的 34 文件全部是实现方/并发会话的改动，无一行来自我。
- **未 import 被验对象**：独立扫描器完全自写判据（`scripts/zero-border-gate.mjs` 顶层有 `await sweep()` 副作用，import 即执行）。
- **所有退出码用 `cmd > log 2>&1; echo exit=$?`** 取得，未走管道。
- **所有对比度/ΔL\* 数字**出自 §1.1 校准通过（14/14）的函数；所有像素数字出自通过地板色硬断言的截图采样，未通过断言的一律标 blocked 丢弃。
- **探针脚本**存放于本次会话 scratchpad（`calib.mjs` / `indep-scan.mjs` / `static-scan.mjs` / `realscene4.mjs` / `spot.mjs`），非工程内文件，不污染工作树。
- **进程卫生**：所有 headless chromium 均由脚本 `browser.close()` 正常退出；收尾已核无孤儿进程。
