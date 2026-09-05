**本页判定目标 = 「任何带背景色填充的卡片/板块一律零 border;border 只属透明容器;内嵌 chip/pill/icon 容器用 soft tint 禁 border;chrome 与可访问性强边界不在约束内」（来源：`UI/规范/03-空间圆角边框分层规范.md` §3 / §4 / §6，**规范明写**）。规范未明写、需推断的三处已在正文标 `[INFERRED]` 并降一档：①「≤16px 圆形隔离描边环」豁免 ②「表单控件算不算卡片」③「平底=地板色的容器算不算透明容器」。**

# C2 · 零-border 铁律 —— 第二轮独立验收 v2（复验上一轮 3 条整改）

> 验收方 = 独立 agent（第 2 轮），非实现方。按防锚定纪律**未读** `2026-07-23-c2-verdicts.md` §6A。
> 上一轮报告 `2026-07-23-c2-round2-acceptance.md` 已读，用途仅为「取它提的 3 条来逐条证伪」。
> **快照时点**：2026-07-23 18:05–18:45 工作树。验收期间检出 1 次并发漂移（§7）。

---

## 0 · 大白话三件事

| | |
|---|---|
| **做了啥** | 把上一轮点名的 3 条整改，一条条自己动手验：给基线**注入一条假的陈旧记录**看新哨兵会不会真变红（会）；把 20 个提示框在**双主题 × 改前 / 改后 × 每个组合开全新页面**共 80 次采样，算文字对比度有没有被这次换底色打下去（没有）；再用自己写的判据把全站 88 个页面重扫一遍对答案。 |
| **结果咋样** | **3 条整改主体都真做了、没有为了放行去改判据。**但发现**新补的哨兵自己带了一个洞**：它排在「有没有新违例」检查的**前面**并直接退出，而它给出的唯一处置命令会把新违例整批洗进基线——等于修 bug 的动作反而给新 bug 开了后门。另外提示框换底色这件事，**最危险的对比度没出事**，但代码注释里写的「变动 ≤0.15」在暗主题实测到 0.58，且「底色比地板亮」这句方向是反的（实测每一处都比地板**暗**）。 |
| **要主人拍板啥** | ① 哨兵的两个洞要不要现在补（我认为要，改动是把两段代码上下调个位置 + 加一句覆盖断言）；② 亮主题最常用的那种提示框（占一半）边界仍然基本只靠颜色不靠明暗，接受现状还是再调一次；③ 存量的 estimator / login 亮主题「深字压深底」要不要单开一轮。 |

---

## 1 · 🔴 工具自证伪记录（先证伪工具，再信数字）

### 1.1 已知答案探针 —— 19/19 一次通过

`scratchpad/v2/color.mjs`（自写，未复用他人脚本）：

| 探针 | 期望 | 实测 |
|---|---:|---:|
| 🔴 黑 vs 白 | 21.00 | **21.00** ✅ |
| 🔴 白 vs 白 | 1.00 | **1.00** ✅ |
| `#767676` vs 白 | 4.54 | 4.54 ✅ |
| `#949494` vs 黑（**非对称**，别拿 4.54 当对称阈值） | 6.92 | 6.92 ✅ |
| L\* 白 / 黑 / `#777777` | 100 / 0 / 50.03 | 同 ✅ |
| 50% 黑 over 白 = **127.5**（不是 128）→ 对白 | 3.98 | 3.98 ✅ |
| 🔴 **反例锁**：`rgb(255,203,77)` 对黑 vs `rgba(255,203,77,.2)` 合成后对黑 | 13.90 / 1.46 | 同 ✅ |

最后一条是坑②的**固定靶**：丢 alpha 会把同一个 token 算成 9.5 倍。此后所有对比度 / ΔL\* 数字均出自这套函数。

### 1.2 我自己错了 5 次（如实记录，其中 1 次差点写出假指控）

| # | 错在哪 | 后果 | 修法 |
|---|---|---|---|
| 1 | 🔴 **差点写出假指控**。实现方注释里的「ΔL 前→后」我按 **CIE L\*** 复算，全部对不上（他写 amber 0.40→2.02，我算 0.17→−0.85），正准备判「数字不可复现」。改用 **ΔY×100（相对亮度差 ×100）** 复算，**5 个 tone 的「改前」值逐个精确命中**（lemon 1.21 / purple 3.34 / amber 0.40 / violet 0.45 / nex 5.82）。→ 他的数字是**真的**，只是口径是 ΔY 不是 L\*，且**没写符号**。**教训：口径不合先怀疑自己读错口径，别先怀疑对方编数字。** |
| 2 | 首版截图只做了**一次性**移除浮层。里程碑浮层由 App.vue 4 秒轮询重新挂载，**整张亮主题提示框截图被 `$100+` 弹窗盖满**。 | 会拿一张全是弹窗的图去说「提示框边界可辨」 | 改 `addInitScript` 里挂 80ms 定时清除 `.ms-overlay/.ms-backdrop`，**并在每张截图前打印 `dirty` 断言**；6/6 clean 才采信。⚠️ 这正是上一轮已经登记过的坑，我还是踩了 |
| 3 | 「边界弱」筛选没排除**页面根容器**，`.nx-chassis` / `.nx-standalone-page` 自己跟自己比必然 ΔL\*=0 → 一口气 53 个假阳性 | 会误报「全站一半元素边界消失」 | 排除满视口容器 + chrome 类名 → 从 53 降到 **3**，其中 2 个是 chrome |
| 4 | 探针脚本裸写 `import "playwright"`，scratchpad 无 node_modules → `ERR_MODULE_NOT_FOUND` | 浪费一轮 | 改 `createRequire("D:/…/Nexion-uniapp/package.json")` |
| 5 | 手算亮主题 purple 标题对比 = 5.40，实测 5.42（color-mix 的亚整数精度） | 无（差 0.02） | 一律以仪器为准，手算只做交叉验证 |

### 1.3 两个「本来会猜错」的点（已按任务书绕开，并实证）

- **emoji ≠ tone**：`grep tone=` 实证 `⚠️` 出现在 amber，`✓` 同时出现在 **lemon**（wallet-exchange-how / staking）和 **purple**（rank-how），`💡` 同时出现在 amber 和 purple。**按 emoji 猜必错**。我改为按「标题元素的 computed color 反查 accent token」定位。
- **暗主题 tone 反查有歧义**：dark 下 `--v5-brand` 与 `--v5-success` **都是 `#9EDC1D`**，`-soft` 也都是 `rgba(158,220,29,0.20)`。歧义存在但**不影响 before 值**（两者的旧底色逐字节相同），已记录不隐瞒。
- **元素定位**：不用 `textContent.includes`，改为「内联 style 同时含 `margin-top:10px` + `border-radius:12px` + `padding:10px 14px`」三重指纹 + **最深匹配**（排除自身仍包含另一匹配元素的祖先）+ 尺寸下限。

### 1.4 环境

`curl localhost:5173` → **200**（`127.0.0.1` → 000，vite 绑 `[::1]`，符合已知特性）；viewport **390×844**；一律 `?nx_device=off`；落地等 1.5–1.8s 越过浮层窗口。所有退出码用 `cmd > log 2>&1; echo exit=$?`，**全程未走管道**。

---

## 2 · 机器门（全部自跑，禁管道取退出码）

| 门 | 结果 |
|---|---|
| `npm run type-check` | **exit=0** |
| `bash scripts/verify.sh` | **exit=0**，**323 pass / 0 fail** |
| `node scripts/zero-border-gate.mjs --selftest` | **exit=0**，**26/26** |
| `node scripts/overflow-probe.mjs --out … --diff docs/OVERFLOW-BASELINE.json` | **exit=0**，**新增溢出 0 · 消失 2** |

**门的可复现性（今天跑了 3 次真实 sweep）**：

| 跑法 | full | partial |
|---|---:|---:|
| verify.sh 内置那次 | 4（"基线 156 条，本次消失 0 条"） | 152 |
| `--list` | **4** | **152** |
| 红测那次（基线被我注入 1 条假 full） | 只报我注入的 1 条 gone ⇒ 真实 4 条全在 | 152 全在 |

→ **三次完全一致，任务书提到的「partial 151/152 抖动」今天未复现**。

---

## 3 · 上一轮 3 条的逐条复验

### 3.1 第 1 条 · 基线棘轮漏洞 —— **主体做到了，但补丁自带两个新洞**

#### ✅ 判据函数一行未动（重点核查项，PASS）

`git diff -- scripts/zero-border-gate.mjs` = **恰好 2 个 hunk**，起点分别在第 247 行（`if (--selftest) selftest();` 之后）和第 280 行。而
`parseColor` / `hasFill` / `shadowRing` / `hasOutline` / `borderSides` / `isChrome` / `judge` / `PROBE` / `evaluate` / `sweep` / `selftest` **全部位于第 44–248 行**，**一行未进 diff**。
旁证：selftest 仍是 **26/26**，用例数与上一轮**一字不差**——没有任何一条阳性用例被删弱。
→ **没有「改门迁就违例」。** 这是本项目最严重的失误模式，本轮不成立。

#### ✅ ①note 按 key 继承 —— 机制真生效，**但数据没跟上**

代码路径成立：读旧基线 → `Map(key→note)` → `prevNote.get(key(h)) ?? "新登记,待判"`。
运行时证据：现基线 156 条里 **155 条**仍带旧 note 文本、**1 条**是 `新登记,待判` → 继承确实跑了。

🟠 **但**：4 条 `full` 的 note **全是占位符 `存量,C2 批次待判`**，没有一条写「为什么留」。而基线 `_doc` 自称「每条 note 写为什么还在（重建时按 key 继承，不会被冲掉）」。
→ **修的是机制，没修数据**。下一轮面对这 4 条，仍然只能从无理由的清单重判——正是这次改动声称要消除的那件事。成本：4 行 JSON。判 **MEDIUM**。

#### ✅ ②哨兵真的会红 —— 我注入假条目实证

```
（注入 1 条 route=/pages/__acceptance_probe__ kind=full 的陈旧条目后）
$ node scripts/zero-border-gate.mjs
零-border:基线有 1 条 full 已修好但基线没跟着缩 —— 棘轮必须收紧,否则这些位置改回来门抓不到
  /pages/__acceptance_probe__  1x1  .zzz-stale-probe
GATE exit=1
```
**精确还原自证**：还原前后 `md5(docs/ZERO-BORDER-BASELINE.json)` 均为 `473fe8d6c91fa67d961b38f8b2e44905`；`git status` 文件集与会话开始时**逐行相同**（见 §9）。

#### ✅ ③基线 218→156 —— 属实

`4 full · 152 partial`，门自报「基线 156 条，本次消失 0 条」⇒ 棘轮当前是**紧的**，无陈旧键。

#### 🔴 新洞 A（HIGH）：哨兵排在「新违例」检查**前面**，其处置指令会把新违例洗进基线

`scripts/zero-border-gate.mjs` 第 283–304 行，顺序是：

```js
const added   = live.filter(h => h.kind === "full" && !known.has(key(h)));   // 283 算出来了
…
const goneFull = baseline.filter(b => b.kind === "full" && !live.some(…));   // 290
if (goneFull.length) {
  …
  console.error(`跑 … --update-baseline --stamp="<说明>" 重建`);            // 294 唯一处置指令
  process.exit(1);                                                          // 295 ← 在 added 之前退出
}
if (added.length) { … process.exit(1); }                                    // 298 永远够不着
```

而 `--update-baseline`（第 266–270 行）写的是 `entries: live.map(…)` —— **live 是什么就写什么，包括刚引入的新违例**，note 记成 `新登记,待判`。

**因此**：一次同时「修好 3 条旧的 + 带进 1 条新的」的改动（本轮本身就是 74 处删除的大改，这种组合毫不罕见）会走成——
门变红 → 只报「基线要缩」→ 开发照指令跑 `--update-baseline` → **新违例被静默吸收进 156 条 JSON 里的一行** → 门转绿。
**棘轮自己的处置路径给新违例开了后门。** 这恰好是这个哨兵要防的那类事。

> 最省的修法（ponytail）：把 `added` 那段整体**上移到 goneFull 之前**。6 行位移，无新逻辑。
> 修完语义变成「先必须没有新违例，才轮到你重建基线」——重建就永远安全。
> 置信度 **HIGH**（[COMPUTED] 自源码行序 + `--update-baseline` 的写入语义，无需运行时）。

#### 🔴 新洞 B（MED-HIGH）：sweep 吞导航失败且无覆盖断言 → 一次抖动就假红，照指令重建会**删掉真违例**

第 168–169 行：

```js
try { await page.goto(`${BASE}/?nx_device=off#${route}`, {…, timeout: 20000 }); }
catch { continue; }        // ← 整条路由静默跳过，全局无「跑满 88 条」断言
```

改动前，跳一条路由只是让 `gone` 计数变大，**无害**。
改动后，`/pages/login/login` 一次超时 ⇒ 它的 2 条 full 不在 `live` ⇒ `goneFull=2` ⇒ **exit 1 假红**；开发按提示跑 `--update-baseline` ⇒ 这 2 条**真违例被从基线里删掉**，棘轮悄悄比现实还松。
→ **本轮把一个原本良性的既有弱点，转成了一条基线腐蚀路径。** `--update-baseline` 自身也有同样暴露（同样从可能不完整的 sweep 写盘）。
最省修法：`sweep()` 记成功导航数，`< ROUTES.length` 时直接 exit≠0 并拒绝出裁决，不是 `continue`。置信度 **HIGH**（[COMPUTED] 自源码；与任务书自述的「两个门都有采样不确定性」相互印证）。

#### 🟠 新洞 C（MEDIUM）：三条新代码路径 0 红测

`--update-baseline` 的 note 继承、`allowed()` 的 size 严格匹配、`goneFull` 哨兵——**一条 selftest 用例都没加**（仍是 26/26，与改动前同数）。本项目的纪律是「每坑必加哨兵 + 双向红测」。我这次是**靠手工注入**才证明哨兵会红；仓库里没有任何东西能防它下次被改坏。

#### 🟢 顺带确认：size 严格匹配没把 3 条豁免搞坏

若任一豁免因 size 不匹配而失效，该元素会落进 `live` 且不在 baseline ⇒ `added≠∅` ⇒ 门红。**门绿 ⇒ 3 条豁免当前全部精确命中**（[COMPUTED]，不需另跑）。

🟡 LOW：`_updated` 的兜底是 `(prevRaw._updated ?? "") + " · regenerated"`，不带 `--stamp` 连跑会累积成 `… · regenerated · regenerated`。

---

### 3.2 第 2 条 · `team/network.vue` orb 卡 —— **回滚属实，事实成立，但豁免理由的措辞过强**

#### ✅ 回滚 + 登记：属实

`git diff` 里 `border: "1px solid var(--v5-border)"` 是**上下文行（未变）**，新增的全是注释。运行时双主题 `bw=1px/1px/1px/1px` 复现。

#### ✅ 「平底=页面地板」这个**事实**：我独立实测成立

| 主题 | 卡自身平底 | 第一个不透明祖先 | ΔL\* | 边界对比 |
|---|---|---|---:|---:|
| dark | `rgb(0,0,0)` | `rgb(0,0,0)` | **0.00** | **1.00** |
| light | `rgb(244,241,233)` | `rgb(244,241,233)` | **0.00** | **1.00** |

删边后这张 358×388 的卡在两个主题下**确实没有任何边界**。截图 `assets/c2-round2-acceptance-v2/orb-card__{dark,light}.png`。

#### ✅ 匹配精度：不会误放同页其它元素

运行时枚举 `/pages/team/network` 上 className **完全等于** `relative overflow-hidden rounded-2xl` 的元素：**全页仅 1 个**，尺寸 `358x388`。route+cls+size 三者精确，**零外溢**。我的独立全站扫描在该路由也只命中这 1 条 full。

#### 🟠 但理由的**措辞**我不认可（判 MEDIUM，非 FAIL）

豁免 reason 写的是「📐 **规范本体豁免，非人情例外**……按 §3 本体判，它属**透明容器**形态」。逐字回源 §3：

> 「**任何带背景色填充的卡片 / 板块一律零 border**……border **只属于透明容器**（分组 hairline、empty-state 虚线）。」

该元素**声明了** `background: …, var(--v5-bg)`，字面上就是「带背景色填充」。把它改称「透明容器」是一次**再描述**，不是 §3 写的东西 —— `[INFERRED]`，按纪律应降一档，不该写成「规范本体豁免」。

**更要紧的是：存在一个严格更合规的修法，而它没被考虑。** 把平底从 `var(--v5-bg)` 换成 `var(--v5-surface)`，零 border 也成立，且 §4「相邻层亮度差可辨」直接达标：

| 主题 | 现状（bg 底 + 1px 边） | 换 `--v5-surface` 底 + 零边 |
|---|---:|---:|
| dark | ΔL\* 0.00 / 靠 1px 边 | ΔL\* **6.32** |
| light | ΔL\* 0.00 / 靠 1px 边 | ΔL\* **4.83** |

源码注释说「删边会把 radial wash 变成地板光晕」——那是在**假定平底继续用 `--v5-bg`** 的前提下才成立，没考虑换底。
**同一张截图上就有反证**：orb 卡正上方那三张 Members / Active now / Direct 统计卡，就是白色 surface + 零 border，读起来是完完全全的卡片。

→ 裁定：**豁免的结果我不反对**（无用户损害，且已精确登记、有实测支撑），**但它是一次取舍判断，不是「规范强制」**。建议把 reason 里「规范本体豁免」改成「取舍豁免 + 已知替代方案（换 surface 底）与不选它的原因」，并标 `[INFERRED]`。

---

### 3.3 第 3 条 · callout 家族换底色 —— 🔴 **最危险的对比度没出事；但注释里的两处描述不准**

方法：`/pages/*` 共 10 条含 callout 的路由 × **双主题** × **{改前, 改后}**，**每个组合都开全新 BrowserContext + 全新页面**（禁同页先测 before 再改样式）；改前值用「在**同一个父容器**里插一个复刻 HEAD 旧样式（`var(--v5-*-soft)` + 旧 ACCENT_BORDER）的探针」读 computed，**绝不改真元素**。共 **80 次采样，20 个实例 × 双主题**，主题作用域自证通过（dark 读到 `--v5-bg:#000000 / --v5-surface:#141414 / --v5-warning-soft:rgba(255,203,77,0.20)`，light 读到 `#F4F1E9 / #FFFFFF / #FBF1D9`）。

#### 🟢 红线一：有没有文字对比度「改前达标 → 改后不达标」？ —— **0 条**

| 分界 | 跌破条数 |
|---|---:|
| AA 4.5（正文/标题） | **0** |
| 3.0（大字/非文本） | **0** |

**上一轮实现方栽的那个坑（换底色把对比度打下去），本轮没有重演。** 这是本条最重要的结论。

#### 🟢 红线二：新增硬编码 hex / 波及非 callout 元素 —— 均为 0

- 新公式 `color-mix(in srgb, ${ACCENT_TEXT[tone]} 14%, var(--v5-surface))` 全 token。全 diff 的 `+` 行里唯一的裸 hex 是 `.rg-sponsor` 的 `#0F0F0F`，**HEAD 第 631 行原样已有**（整行重写时带过），新增 hex = **0**。
- 删掉的 `ACCENT_SOFT` / `ACCENT_BORDER` 是文件内局部常量，`grep` 全 src 无残留消费者；`--v5-nex-border`(2) / `--v5-brand-border`(6) / `--v5-brand-2-border`(5) / 四个 `-soft` token 均仍有其它消费者，**无孤儿 token**。
- 改动只落在 `boxStyle`；`titleStyle` / `bodyStyle` 一字未动；模板 / 逻辑 / i18n **0 改动**。
- 20 个实例双主题 `borderWidth` 实测 **全 0**。

#### 🔴 但注释里的「标题对比度变动 ≤0.15」是错的（暗主题实测 0.58）

| | 改前 | 改后 | 变动 |
|---|---:|---:|---:|
| **dark / amber 标题**（`#FFCB4D`） | 9.52 | 8.95 | **−0.57** |
| **dark / purple 标题** | 8.93 | 8.35 | **−0.58** |
| **dark / nex 标题** | 5.86 | 5.33 | −0.53 |
| **dark / nex 正文** | 11.26 | 10.24 | **−1.02** |
| light / purple 标题 | 5.81 | 5.42 | −0.39 |
| light / amber 标题 | 2.81 | 2.73 | −0.08 |

「≤0.15」只在**亮主题**近似成立（最大 0.39 也已超）。**暗主题显然没量。**
影响：全部仍远高于 AA，**不构成用户可感缺陷**；但它是「只验一个主题就下全称结论」的又一例——上一轮报告刚把这条列为系统性教训。判 **MEDIUM（文档准确性）**。

#### 🔴 「surface 比地板亮 → 天然产生正亮度差」方向说反了

实测：**亮主题下每一个 tone 的新底色都比页面地板暗**（ΔL\* 全为负）。注释给的数字是 **ΔY×100 且未写符号**：

| 亮主题 tone | 注释写的 | 实测 ΔY×100（**带符号**） | 实测 ΔL\*（感知） | 边界对比 | 实例数 |
|---|---|---:|---:|---:|---:|
| amber | 0.40→2.02 | 0.40→**−2.02** | 0.17→**−0.85** | 1.00→**1.02** | **10 / 20** |
| purple | 3.34→9.37 | −3.34→**−9.37** | −1.42→**−4.09** | 1.04→1.11 | 7 / 20 |
| lemon | 1.21→5.08 | −1.21→**−5.08** | −0.51→**−2.18** | 1.01→1.06 | 2 / 20 |
| nex | 5.82→5.05 | −5.82→**−5.05** | −2.51→**−2.17** | 1.07→**1.06** | 1 / 20 |
| violet | 0.45→3.75 | — | — | — | **0（死配置）** |

数值本身**逐个可复现，没有编**（见 §1.2 #1，我差点为此写出假指控）。问题是：

1. **机制描述反了**：不是「surface 比地板亮所以变亮」，而是「14% 的中/深调 accent 兑进白，把结果拉到地板**以下**」。方向反了，下次照这句话推别的组件会推错。
2. **nex 实际变差**（|5.82|→|5.05|），注释把它和其它 tone 并列成「改善」。
3. **占一半实例的 amber，亮主题下等于没修**：边界对比 1.00 → **1.02**，ΔL\* 0.17 → −0.85。§4「相邻层之间保证亮度差可辨」这条，对 50% 的 callout **仍不满足**。
4. 上一轮建议的做法（底走 `--v5-surface` 再叠 accent tint）实测可给 **ΔL\* 4.83**（亮）/ **6.32**（暗）——现方案取到的是 0.85 ~ 4.09。

**实景复核（不是只看数字）**：`assets/c2-round2-acceptance-v2/callout-amber-closeup__light.png` 里，「💡 Why a cooling period?」确实以一块**暖米色**读得出来（靠色相），相对上一轮的「几乎浮在页面上」是**可见改善**。所以我判 **NOTE 不判 FAIL**——但 §4 的字面要求对 amber 仍未达成。

#### 🟠 同族公式分叉（MEDIUM）

`how-hero.vue` / `how-section.vue` / `how-step-row.vue` **仍各自持有 `ACCENT_SOFT` 表**并直接拿 `-soft` 当底。只有 callout 换了 14%-over-surface。同一个 how 家族现在有两套 accent 面公式，下次改会漏一半。

---

## 4 · 独立复核（不只信上一轮结论）

### 4.1 全站重扫：**full 12**，其中真违例 0

我的扫描器**不 import 被验脚本**（它顶层 `await sweep()`，import 即执行），判据自写、选择器用 `*`（门只查 6 类标签）、88 路由 × 双主题 × 4 段滚动。**console error = 0**。

| 分类 | 条数 | 明细 |
|---|---:|---|
| 门也报的 | 4 | login `.lg-field-wrap` / login `.lg-phone` / register `.rg-phone` / wallet-withdraw 20×20 |
| 已登记豁免（门不报） | 3 | genesis ×2、network ×1 |
| 🔴 **门选择器盲区** | **5** | wallet-cards-new `<uni-input>` ×3（卡号 / MM-YY / 持卡人）、wallet-cards-new `<div>.uni-checkbox-input`、**support/chat `<uni-input>.nx-conv-input`** |
| **partial** | **152** | 与门**逐数吻合**（两套独立实现同数 = 强旁证） |

**盲区比上一轮多找到 4 条**（上一轮只报了 1 条 `.uni-checkbox-input`）。根因：门的探针写死
`querySelectorAll("uni-view,view,uni-text,text,uni-button,button")` —— **`uni-input` 完全在射程外**。
但这 5 条**全部是表单输入控件**，§3 尾明写归《无障碍规范》→ **不是违例**。所以盲区当前成本仍是 **0 条真违例**，判 **LOW**；不过它证明盲区是真实存在且比上一轮估的大。

### 4.2 剩的 4 条是不是「故意保留的教条项」—— 是，且**不该修**（我独立同意，并补一条上一轮没抓到的理由）

| # | 元素 | 为什么不该删 |
|---|---|---|
| 1 | login `.lg-field-wrap`（342×56） | 🔴 **上一轮漏了这条**：它有 `.lg-field-wrap--err { border-color: … }` —— border 是**错误态的状态通道**，删了等于删掉密码校验的错误反馈（同 `captcha-slider` 的 `.cs-track--err/--ok`，那边已有防御注释）。 |
| 2 | login `.lg-phone` / register `.rg-phone` | 输入框壳；内部还有 `.lg-phone__cc { border-right }` 做区号分隔。§3 尾明写表单/控件边界归《无障碍规范》。 |
| 3 | wallet-withdraw 20×20 | 源码是 `radioStyle(active)` —— **单选指示器**。未选态 `background: transparent`（门正确忽略），选中态才是 brand 20% 底 + 2px 环。删了选中态就只剩一个 20% tint 圆点（对比 ~1.2），**选择状态彻底不可见**。`[INFERRED]`：门的 `isoRing` 豁免只到 16px，这是 20px 被边界效应抓到。 |
| 4 | 盲区那 5 条（uni-input ×4 + uni 内置勾选框） | 同上，全是控件。 |

🟠 顺带指出一个**判据层缺口**（非本轮引入）：`judge()` 实现了 §3 的 dashed / isoRing / chrome 三条豁免，**唯独没实现 §3 尾那条「表单控件归无障碍规范」**。结果是：门当前报的 4 条 full，100% 落在规范明写「不在此约束内」的类别里。
→ 我**不建议**现在往 `judge()` 加控件豁免（容易过宽，且「留在基线里 + 写清理由」更安全），但**必须把这 4 条的 note 写成真实裁决理由**（见 §3.1 那条 MEDIUM）。

### 4.3 有没有删错 —— **0 处误删**（源码逐 hunk + 运行时后果双向核）

**源码侧**：50 处删除逐条抓同 style 块的 `background`，**每一处都有真实填充**（实底 / `color-mix` tint alpha≥0.06 / gradient）。**0 处**删的是 `background: transparent` 元素。

**已知陷阱专项**：`src/components/home/conversion-banner.vue` 的 `.weekly-quest__multiplier` —— `git status` 该文件**空（本轮零改动）**，第 176–177 行 `border: 1px solid var(--v5-brand); background: transparent;` **原样健在**。✅

**合法边逐类点名健在**：

| 类别 | 证据 |
|---|---|
| 选中态 2px | `wallet-withdraw.vue:590`、`wallet-topup.vue:448`（`2px solid ${active ? brand : border}`）、`wallet-topup.vue:513` |
| spinner 几何 | `captcha-slider.vue:222` `.cs-spin { border: 2px solid …; border-top-color: … }`（且本轮**新增**了防删注释） |
| 空态虚线 | `developer.vue:379`、`events.vue:216`、`marketplace.vue:475`、`devices.vue:411`、`empty-slots-hint.vue:132` 等 21 处 `dashed` 全在 |
| 隔离描边环 | `device-slot.vue:23`（`2px solid var(--v5-bg)`）等 |
| chrome | `.nx-top-chrome` 实测仍在（ΔL\*=0 属 §4 明写豁免） |
| 透明容器 hairline | partial 152 条，门只列不拦 |

**运行时后果侧**（这才是「删对了没」的真答案）：24 条本轮真删过边的路由 × 双主题，采到 **202 个「已无边 + 有填充」的内容元素**，算它们对第一个不透明祖先的 ΔL\* / 边界对比：

| |ΔL\*| < 1.0（边界几乎不可辨） | 条数 |
|---|---:|
| 全部命中 | **3** |
| 其中 chrome（`.nx-top-chrome`，§4 豁免） | 2 |
| **真正的内容元素** | **1** |

那唯一 1 条 = `light / genesis/holder 358×89 ΔL* −0.19`，底色 `--v5-brand-2-soft`。
**但它 HEAD 里本来就没有 border**（`ctaCardStyle` 逐字节未变，`git show HEAD` 已核）→ **存量，不是本轮删的**。
→ **过度整改：0 处。** 上一轮抓到的那 1 处（network orb）已回滚。

### 4.4 有没有夹带 —— 只剩上一轮已记的那一处

全 diff（38 文件）里，除「border/ring 删除 + 注释 + callout 底色」之外的改动：

| 改动 | 判定 |
|---|---|
| `genesis.vue` ×3 处 `55.00000000000001%` → `55%` | 数值等价、视觉零差，但**属范围外夹带**。上一轮已记，本轮**未清理**。LOW。 |
| 模板 / `v-if` / `@click` / 函数体 | **0 改动**（diff 全量 grep） |
| `src/i18n/**` | **0 文件**；142 变更行零字符串增删 |
| 新增硬编码 hex | **0** |

---

## 5 · 清单外发现（按真影响用户排序）

| # | 严重度 | 问题 | 证据 |
|---|---|---|---|
| 1 | 🔴 **HIGH** | **棘轮补丁把「修 bug」变成了新违例的洗白通道**（§3.1 洞 A）。`goneFull` 检查排在 `added` 之前并 exit，唯一处置指令 `--update-baseline` 整批写 `live`。 | 源码 283 / 290–295 / 298 行序 + 266–270 写入语义 |
| 2 | 🔴 **HIGH** | **一次导航抖动 → 假红 → 照指令重建会删掉真违例**（§3.1 洞 B）。`sweep()` 第 169 行 `catch { continue; }` 无覆盖断言。 | 源码 168–169 |
| 3 | 🟠 MED | 三条新代码路径**零红测**，selftest 仍 26/26。哨兵会红是我手工注入才证明的，仓库无常驻保护。 | `--selftest` 输出 |
| 4 | 🟠 MED | 4 条 `full` 的基线 note 全是占位符 `存量,C2 批次待判`，与 `_doc` 自称的「每条写为什么还在」矛盾——note 继承机制修好了，数据没跟上。 | 基线 JSON |
| 5 | 🟠 MED | callout 注释「标题对比度变动 ≤0.15」在暗主题实测 **0.58**（正文 1.02）；「surface 比地板亮 → 正亮度差」**方向反了**（亮主题全为负）；nex 实为**变差**。 | §3.3 表 |
| 6 | 🟠 MED | **亮主题 amber callout 等于没修**：边界对比 1.00→1.02、ΔL\* 0.17→−0.85，占 callout 实例 **10/20**。§4「亮度差可辨」仍不满足。 | §3.3 表 + 截图 |
| 7 | 🟠 MED | `network` 豁免 reason 写「规范本体豁免，非人情例外」，但那是 `[INFERRED]` 再描述；且存在严格更合规的替代（平底换 `--v5-surface`，ΔL\* 6.32/4.83），未在 reason 里交代为何不选。 | §3.2 |
| 8 | 🟡 LOW | 门选择器射程漏 `uni-input`，实测漏 4 个元素（3× wallet-cards-new + 1× support/chat）。当前成本 0 条真违例，但盲区比上一轮估的大。 | §4.1 |
| 9 | 🟡 LOW | 同族 `how-hero` / `how-section` / `how-step-row` 仍用 `-soft` 底，与 callout 的 14%-over-surface 分叉。 | `grep ACCENT_SOFT` |
| 10 | 🟡 LOW | `violet` tone **零消费者**（10 个页面 20 处 callout 无一使用），注释却给了它「0.45→3.75」的实测值——那是无法从任何渲染实例复现的数字。 | `grep tone=` |
| 11 | 🟡 LOW | `genesis.vue` 3 处小数精度夹带（上一轮已记，未清）。 | §4.4 |
| 12 | 🟡 LOW | `_updated` 兜底会累积 ` · regenerated`。 | 源码 268 |
| — | ⚪ 存量 | 上一轮 §8 的 P1/P2 全部**复现且未处置**：estimator `.cmp` 亮主题 ΔL\* −90.86（`#0f0f0f` 硬底 + 主题化深字）；login/register 亮主题整页仍是黑底（`.lg-root` `#000`，截图 `form-controls-kept__light.png`）。本轮零字色/底色改动，**不算到本轮头上**，但本轮**编辑过这三个文件仍未顺手报**。 | `edge.json` + 截图 |

---

## 6 · 我判为「不该修」的教条项

| # | 项 | 理由 |
|---|---|---|
| 1 | login `.lg-field-wrap` / `.lg-phone`、register `.rg-phone` | §3 尾**明写**控件边界归《无障碍规范》；且 `.lg-field-wrap--err` 用 border-color 传错误态，是**状态通道**。 |
| 2 | wallet-withdraw 20×20 `radioStyle(active)` | 单选指示器；删了选中状态不可见。`[INFERRED]` 规范未明写控件算不算卡片，降一档表述。 |
| 3 | wallet-cards-new ×3 `<uni-input>` + `.uni-checkbox-input`、support/chat `.nx-conv-input` | 同 1；且勾选框是 uni 框架原生默认样式，非本工程编写。 |
| 4 | `captcha-slider.vue:222` `.cs-spin` 的 `2px solid` + `border-top-color` | spinner 的**几何构造**，删了没有转圈动画。 |
| 5 | `device-slot.vue:23` 等 `2px solid var(--v5-bg)` 隔离环 | 用底色描边做分隔的技法。`[INFERRED]`，规范未明写，降一档。 |
| 6 | 21 处 `1px dashed` 空态/分隔虚线 | §3 明写 empty-state 虚线合法。 |
| 7 | 152 条 `partial` | 分组 hairline / 行分隔线，§3 认可，门只列不拦是对的。 |
| 8 | genesis 金-曜石 hero + Claim seat CTA | 已有主人拍板 + 精确匹配豁免、不外溢。不重开议题。 |
| 9 | `.nx-top-chrome` 等 chrome | §4 明写不在约束内。 |

---

## 7 · 并发漂移（如实记录，不做归属断言）

会话开始时的 `git diff` 快照 vs 中途重取，`src/components/how/how-callout-box.vue` 的**模板头注释**被改写（1 行 → 2 行，纯注释）。文件集 38 个**未变**，其余 diff 逐行相同。核心结论不受影响。

---

## 8 · 六维评分（每维附证据）

| 维度 | 权重 | 分 | 证据（可复核） |
|---|---:|---:|---|
| **跨端兼容** | 25% | **93** | 改动 100% 是 CSS 声明删除 + 1 处底色公式，零平台 API / 零条件编译 / 零模板逻辑改动；**88 路由 × 双主题 × 4 段滚动 console error = 0**；`overflow-probe --diff` **新增溢出 0 · 消失 2**；202 个无边填充元素无塌陷/重叠；`type-check exit=0`、`verify exit=0 / 323 PASS 0 FAIL`。**扣 7**：本轮编辑过 `login.vue` / `register.vue` / `estimator.vue`，三者的 `#000` / `#0f0f0f` 硬编码底 + 主题化字色在亮主题下仍是「深字压深底 / 整页黑」（实测 `.cmp` 亮主题 ΔL\* −90.86），路过既没修也没在交付里报。 |
| **视觉对齐规范** | 20% | **86** | 20 个 callout 实例 × 双主题 `borderWidth` 实测**全 0**，零 border 落地 100%；判据函数一行未动、selftest 26/26 双向红测；**暗主题全面改善**（callout ΔL\* 16.08→18.39 / 16.98→19.07 / 11.46→15.26，边界对比 1.27–1.46→1.39–1.55）；`v-badge` 删 `inset 0 0 0 1px` 环后靠 soft tint 撑住（符合 §6）。**扣 14**：亮主题 **amber（10/20 实例）边界对比 1.00→1.02、ΔL\* 0.17→−0.85**，§4「相邻层亮度差可辨」仍不满足；**nex 反而退化**（\|ΔL\*\| 2.51→2.17）；上一轮建议的 `--v5-surface` 打底可给 4.83，现方案只取到 0.85–4.09；同族 `how-section`/`how-step-row` 未同步，公式分叉。 |
| **业务逻辑一致** | 20% | **78** | 状态可辨性逐个回源：`.lg-field-wrap--err` 错误态边**未删**（上一轮漏检，我补的证据）、`radioStyle` 选中环未删、`wallet-topup:448`/`wallet-withdraw:590` 的 2px 选中态未删、`.cs-spin` 完整、marketplace 选中态两态皆无边无 1px 跳位；本轮任务核心逻辑（棘轮门）判据零改动、哨兵注入实证会红（exit=1）、基线 156 条棘轮当前是紧的。**扣 22**：🔴 **棘轮补丁引入两个新洞** —— ①`goneFull` 排在 `added` 之前 exit，其唯一处置指令 `--update-baseline` 会把新违例整批洗进基线（源码 283/290–295/298 + 266–270，[COMPUTED] HIGH）；②`sweep()` 第 169 行 `catch { continue; }` 无覆盖断言，一次导航抖动即假红，照指令重建会**删掉真违例**（本轮把良性弱点转成基线腐蚀路径）；③三条新代码路径 0 红测，selftest 仍 26/26；④4 条 full 的基线 note 仍是占位符，与 `_doc` 自称矛盾。 |
| **转化 + 文案** | 15% | **88** | **文案零改动**（142 变更行零字符串增删，`src/i18n/**` 0 文件）；转化触点边界实测可辨：`.entry-action--ghost` ΔL\* 4.83(light)/6.32(dark)、`ks-card`、`ref/code` 礼包卡、genesis 吸底 CTA（豁免、金边实测在）；marketplace 排序 chip 选中态靠 brand-soft 底 + brand 字，状态差保留。**扣 12**：`events-card.vue` 本轮动过，同页「View progress」CTA 亮主题字对比 1.16（存量）仍未报；「78→4」的准确口径是「硬门 4 + 豁免 3」，交付叙述未区分。 |
| **i18n** | 10% | **100** | `git status` 无 `src/i18n/**`；diff 全量 grep 无 `t(` / `title=` / `label=` / `placeholder=` 增删；`i18n-key-mirror`（94 namespace）+ `i18n-placeholder-parity` 在 verify 323 PASS 内全绿。本维零风险。 |
| **token 纪律** | 10% | **90** | diff 全部 `+` 行**新增硬编码 hex = 0**（唯一 `#0F0F0F` 在 HEAD 第 631 行原样已有）；callout 新公式 `color-mix(accent 14%, var(--v5-surface))` 全 token；删掉的 `ACCENT_SOFT`/`ACCENT_BORDER` 全 src 零残留消费者；`--v5-*-border`(2/6/5) 与四个 `-soft` token 均仍有其它消费者，**无孤儿**；`v-badge` 13 档 `bg`/`text` 逐字节相同，只删 `ring`。**扣 10**：`genesis.vue` 3 处小数精度夹带未清（上一轮已记）；`violet` 是零消费者的死配置，注释却给了它无法复现的实测值。 |

**加权总分 = 93×0.25 + 86×0.20 + 78×0.20 + 88×0.15 + 100×0.10 + 90×0.10
= 23.25 + 17.20 + 15.60 + 13.20 + 10.00 + 9.00 = 88.25**

**判定：未达 95，也未达上一轮采用的 90 线 → 不通过，需处置下方 2 条必办后复评。**

> 对比上一轮 91.0。**整改主体是扎实的**：判据一行未动、0 处误删、0 新增 border/hex、0 文案/i18n 改动、最危险的对比度回归没重演、network 误删已正确回滚并精确登记。
> **失分几乎全部集中在「补丁本身的机制质量」和「交付描述的准确性」**，不在删边这件事上。上一轮 91.0 里的 −16（视觉）本轮改善到 −14；新出现的 −22（业务逻辑）全部来自棘轮补丁的两个洞。

---

## 9 · 必办 / 待拍板

### 必办（不需要拍板，改动都很小）

1. 🔴 **把 `added` 检查上移到 `goneFull` 之前**（`scripts/zero-border-gate.mjs` 298–304 行整体移到 290 行之前）。6 行位移，无新逻辑。修完语义 = 「先没有新违例，才轮到你重建基线」，重建从此安全。
2. 🔴 **给 `sweep()` 加覆盖断言**：记成功导航数，`< ROUTES.length` 时 exit≠0 并**拒绝出裁决**（现在是 `catch { continue; }` 静默跳过）。同时 `--update-baseline` 也应受同一道门约束。
3. 🟠 **给三条新路径补 selftest 用例**（note 继承 / size 严格匹配 / goneFull 双向红测）——本项目纪律是每坑必配红测，现在 26/26 与改动前同数。
4. 🟠 **把 4 条 `full` 的基线 note 写成真实理由**（表单控件 / 单选指示器 / §3 尾归无障碍规范），4 行 JSON。
5. 🟠 **修正 `how-callout-box.vue` 注释**：标「ΔY×100」而非「ΔL」、**补符号**、把「标题对比度变动 ≤0.15」改成实测的「亮 ≤0.39 / 暗 ≤0.58」、删掉 `violet` 那行无法复现的值、把「surface 比地板亮」改成实际机制（accent 兑进 surface 后落到地板**以下**）。

### 待拍板（附分析与我的倾向）

| 事项 | 利 | 弊 | 我的倾向 |
|---|---|---|---|
| **亮主题 amber callout 边界仍是 1.02**（占 callout 实例 10/20） | 现状完全守住零 border，且比上一轮有可见改善（截图可证，靠色相读得出来） | §4「相邻层亮度差可辨」对一半实例仍不成立；amber 是最常用 tone | **建议再调一次**：底改成「`var(--v5-surface)` 打底 + accent tint 叠加」，实测可拿到 ΔL\* **4.83**（亮）/ **6.32**（暗），且不动任何文字色。改动仍是一行公式。**置信度 MED**（改法确定；要不要改是「色相够不够」的设计取舍，主人说了算） |
| **`network` orb 卡：保留豁免 vs 平底换 `--v5-surface` 零 border** | 保留 = 不动 orb 视觉；换底 = 彻底不需要豁免，与同页三张统计卡一致 | 保留 = 全站多一条需要长期维护的例外；换底 = orb 的 radial wash 观感会变（幅度未实测） | **倾向换底**，但**不建议现在做**——需要先看换底后的 orb 实景。**短期只改 reason 措辞**（去掉「规范本体豁免」，改成取舍豁免 + 写明为何不选换底）。**置信度 MED** |
| **门射程扩到 `uni-input` / `uni-image` / `div`** | 消掉结构性盲区（实测漏 5 个） | 当前 5 个全是 §3 明写不在约束内的控件 → 扩了会立刻多 5 条要登记的噪声，除非同时实现 §3 尾的控件豁免 | **建议先不扩**，把「盲区 + 当前成本 0」写进门的注释即可；等哪天真有卡片渲染成 `uni-input` 再说。**置信度 MED**（YAGNI） |
| **存量亮主题「深字压深底」**（estimator `.cmp` ΔL\* −90.86、login/register 整页黑） | 不属本轮范围，本轮零字色/底色改动 | 用户在亮主题下这两处基本读不了字，是真 P1 | **建议单开一轮**「亮主题主题化补齐」，连 `#000`/`#0f0f0f` 硬编码根一起收。**置信度 HIGH**（问题确凿，范围另议） |

---

## 附 · 验收自身的可证伪性声明

- **未改任何源文件**。唯一一次写入是 §3.1 的哨兵红测：向 `docs/ZERO-BORDER-BASELINE.json` 注入 1 条假条目，跑完立刻按字节还原。
  **自证**：还原前 md5 = `473fe8d6c91fa67d961b38f8b2e44905`，还原后 md5 = `473fe8d6c91fa67d961b38f8b2e44905`（相同）；`git status` 的 38 个 ` M` 文件与会话开始时**逐行相同**（`diff` exit=0）。
- **我在工作树里新增的只有** `docs/changes/assets/c2-round2-acceptance-v2/`（20 张截图，1.9 MB）与本报告。未硬删任何文件。
- **未 import 被验对象**：`scripts/zero-border-gate.mjs` 顶层有 `await sweep()`，import 即执行副作用；我的扫描器判据完全自写。
- **未复用他人脚本**：所有探针在 `scratchpad/v2/`（`color.mjs` / `callout.mjs` / `analyze.mjs` / `scan.mjs` / `edge.mjs` / `shots.mjs` / `callshot2.mjs`），非工程内文件。
- **所有退出码**用 `cmd > log 2>&1; echo exit=$?` 取得，**全程未走管道**。
- **所有对比度 / ΔL\* 数字**出自 §1.1 校准 19/19 的函数；**所有 before/after 组合都开全新页面**；所有截图前打印 `dirty` 断言，6/6 clean 才采信。
- **未读** `2026-07-23-c2-verdicts.md` §6A（防锚定）。
- **进程卫生**：收尾实测 `Get-Process | where Path -like '*ms-playwright*'` = **0** —— 我起的 headless chromium 全部由 `browser.close()` 正常退出，零孤儿。
  ⚠️ 机器上另有 **20 个 `C:\Users\jason\.agent-browser\browsers\chrome-149…\chrome.exe`**（属其它并发会话，非我起的）与 15 个用户真实 Chrome —— **我没有动它们**，也不建议在并发会话仍在跑时清理。
