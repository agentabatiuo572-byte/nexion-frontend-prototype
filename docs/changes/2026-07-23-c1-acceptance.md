# C1 · 硬编码颜色 token 化 —— 独立验收报告

> **本次判定目标 = 「消灭 token 色值的字面副本(那类在另一主题下必然失配的),并把机器哨兵补全」。来源:任务书明写。**
> 验收方 ≠ 实现方。全部结论回源 + 运行时双证;未读实现方叙述文档(`docs/changes/2026-07-23-c1-*.md` 未打开)。
> 采样时间:2026-07-23 13:16–13:50(+0900)。dev server 5173 全程 200,未杀进程。
> **结论:不通过(加权 81.3 / 100,门槛 95)。机器门本身干净,失分全在「实景双主题」这一层。**

---

## 0. 🔴 前置事实:验收对象是移动靶

采样期间工作树被**并发会话持续写入**,不是静态快照:

| 时间 | 事件 | 证据 |
|---|---|---|
| 13:16 | 我跑第 1 次 `type-check` → 0 错 | exit=0 |
| 13:20:39 | `src/styles/tokens.css` 被改 | mtime |
| 13:22:23 | `src/components/home/day-one-quest-card.vue` 被改 | mtime |
| 13:23 | 我跑第 2 次 `verify.sh` → **tsc 报 TS2769**(`QuestTask` 缺 `onColor`) | verify2.log |
| 13:26 | 我再跑 `type-check` → 又 0 错(半成品状态已被补完) | exit=0 |
| 13:26:15 | `src/components/captcha-slider.vue` 的遮罩被改成 token | mtime + `git diff --stat` |

**影响**:任何单点测量都只对该时刻成立;下面所有数字都带时间戳。也意味着这个批次**当时尚未真正收尾**(`docs/前端产品更新日志.md` 里也还没有 C1 条目)。建议:批次冻结后再复验一次机器门。

另外,工作树里同时压着 **NexGrid 改名批次 + B0 尺寸阶梯 + B1 排版/a11y + C1 颜色** 四批改动(201 文件 / +1595 −1338),`git diff` **无法**把 C1 单独切出来。因此 D2「夹带改动」只能按「颜色相关 hunk」判,不能按整树判。

---

## 1. 工具自证伪记录(先跑已知答案,再信任何产品数值)

| # | 探针 | 期望 | 实测 | 处置 |
|---|---|---|---|---|
| P1 | `color-mix(in srgb,#FF0000 50%,transparent)` 的 computed 值 | rgba(255,0,0,.5) | **`color(srgb 1 0 0 / 0.5)`** | 🔴 **工具口径错**。Chromium 把 color-mix 序列化成 `color(srgb …)`,直接字符串比对会把「已 token 化」误判成「没变」。→ 给分析器加了 `color(srgb …)→rgb()` 归一化后才采信任何一条比对 |
| P2 | 黑白对比度 | 21.00 | 21.00 | ✓ 公式可信 |
| P3 | 同色对比度 | 1.00 | 1.00 | ✓ |
| P4 | `rgb(1,2,3)` 回读 | rgb(1, 2, 3) | rgb(1, 2, 3) | ✓ 读取通道无污染 |
| P5 | 主题切换通道 | data-theme 翻转 + token 变值 | dark: ink `#F5F7FA` / bg `#000000`;light: ink `#13141A` / bg `#F4F1E9` | ✓ |
| P6 | 我自己写的 token 表解析器 vs 哨兵的表 | 应一致 | 都是 **40 色**,逐条一致 | ✓ 交叉验证通过 |
| P7 | 「用了但没定义的 --v5-* token」 | 用 node 脚本 + 独立 grep 双算 | 两法都得 defined 102 / used 51 / **missing 0** | ✓ |

**我自己出过的 4 次错(如实记)**:

1. **P1**:差点用未归一化的字符串比对下结论。已修正。
2. **AUTH02 误归因**:verify 第 1 次挂在 `AUTH02 … (en)`,我裸跑该脚本→`ERR_CONNECTION_REFUSED @127.0.0.1`,险些写成「dev server 只绑 IPv6」。回源 `verify.sh:918` 发现它其实**显式传了 `BASE_URL=http://localhost:5173`**——我裸跑漏传参数,是**我的调用错**。补传后该脚本 **PASS**。真正的 verify 失败原因是日志里的 `Target page … has been closed`(浏览器 wedge)。
3. **「`--v5-toast-border` 只在 dark 定义」**:我的解析器 `norm()` 不认 `var(--x)` 形式的值,把 `:root` 里的 `--v5-toast-border: var(--v5-border)`(第 101 行)漏掉了。回源 grep 后撤回该结论。
4. **「`--v5-on-quest` 没被追踪」**:我读自己的输出时截断误读,实际它在 light-only 列表第 24 行。回源重跑后撤回。
5. **差点误报「C1 引入了 color-mix 跨端兼容风险」**:回源比对 HEAD —— color-mix 在改动前已用于 **139 文件 / 574 处**,C1 只新增 14 处。属**存量既定写法**,不算本批次引入。已降级为「存量平台风险」信息项。

> 上游本轮多次出现「批量捞取→大量假阳性」,我按同一标准要求自己:上面 5 条只要有一条不回源,就会变成一条假指控。

---

## 2. 逐条判定

### A. 机器门

| 条目 | 判定 | 证据 |
|---|---|---|
| **A1** `npm run type-check` = 0 错 | ✅ **PASS**(有条件) | 13:16 `exit=0`、13:26 `exit=0`。中间 13:23 因并发会话半成品短暂 TS2769,非 C1 缺陷。**判门未用管道**,均为 `cmd > log 2>&1; echo exit=$?` |
| **A2** `bash scripts/verify.sh` 全绿 | ✅ **PASS**(第 3 次干净) | 跑 3 次:①`316 pass / 1 fail` exit=1(`AUTH02 … (en)`,日志里是 `Target page … has been closed` 浏览器 wedge;补对 `BASE_URL` 单跑该脚本 → **PASS**)②`316 pass / 1 fail` exit=1(`vue-tsc errors` TS2769,并发会话半成品,3 分钟后自愈)③**`319 pass / 0 fail` exit=0**。两次失败均证伪到非 C1 原因 |

🔴 **管道陷阱实证**:后台任务框汇报第 1 次 verify「exit code 0」,而日志里我自己 `echo exit=$?` 打的是 **exit=1**。差别来自复合命令的最后一段是 `echo`。**任何 verify 结论只认日志里的 `exit=` 行。**

C1 新增的三道门在 3 次里全绿:

```
PASS  token-copy selftest(双向红测:hex/rgb/rgba/变alpha 阳性全中 + 真灰/注释/color-mix 全 0)
PASS  token-copy: 0 违例(表内亮暗异值 token 40 色 · 豁免 6 条)
```

---

### B. 哨兵本身可信吗(重点证伪)

#### B1 判据是否成立 — ✅ **成立,设计是对的**

`scripts/token-copy-sentinel.mjs` 的四条判据经得起推敲:

- ① **只钉「亮值 ≠ 暗值」的 token**:单主题 token 的副本不会失配 → 不入门。逻辑正确,也是它敢做到 0 噪声的原因。
- ② **忽略 alpha 比 RGB**:关键改进。`rgba(14,142,74,0.30)` 确实是 `--v5-success@light` 的副本。旧哨兵只比全等值会漏掉全部「变透明度副本」。
- ③ **真灰 (r=g=b) 排除**:`#000/#fff/#0F0F0F` 是主题无关光影。正确。
- ④ **hex 3/6/8 位 + rgb()/rgba() 全认**:旧哨兵 `'#0E48E6|#F4F1E9|#FF5A1F|#13141A'` 只钉 4 色且只认 `#RRGGBB`,被 rgba() 绕过过——`purchase-ticker.vue` 原注释白纸黑字写着「Alex 的蓝特意挪到 `#1A4FD0`,使其不触发哨兵」。这条实证足以证明旧门失效、新门必要。

`node scripts/token-copy-sentinel.mjs --selftest` → **25/25 pass**。

**独立复核表**:我用**另写的解析器**(不 import 哨兵)重算「亮暗异值 token 表」→ **40 色,逐条与哨兵一致**。表没有被做小。

#### B2 我自己的双向红测(不信它的 selftest)— ✅ **13/14 抓对**

在真源文件 `src/components/captcha-slider.vue` + `src/auth/password-rules.ts` 里注入,跑哨兵,再按 sha256 精确还原:

| # | 写法 | 注入内容 | 期望 | 实测 | 结论 |
|---|---|---|---|---|---|
| ① | `#RRGGBB` 大写 | `color: #0E8E4A` | 抓 | **抓** = `--v5-success@light` | ✅ |
| ② | `rgba()` 同色不同透明度 | `rgba(14, 142, 74, 0.22)` | 抓 | **抓** | ✅ 核心能力 |
| ③ | `rgb()` 形式 | `rgb(198,131,22)` | 抓 | **抓** = `--v5-warning@light` | ✅ |
| ④ | 大小写混写 | `#9edC1d` | 抓 | **抓** = brand/success@dark 5 个 token | ✅ |
| ⑤ | 三位 hex `#RGB` | `#9E1` | 放行 | **放行** | ✅(见下注) |
| ⑥ | `rgb()` 空格分隔现代语法 | `rgb(124 92 255)` | 抓 | **抓** = `--v5-nex@light` | ✅ 超出 selftest 覆盖 |
| ⑦ | `#RRGGBBAA` | `#C68316CC` | 抓 | **抓** | ✅ |
| ⑧ | `color-mix` 里嵌字面量 | `color-mix(in srgb, #0E8E4A 30%, transparent)` | 抓 | **抓** | ✅ 逐行扫,不被函数包裹骗过 |
| ⑨ | `hsl()` 等价写法 | `hsl(145 82% 31%)` | 抓 | **放行** | ❌ **唯一漏网** |
| ⑩ | 真灰遮罩 | `rgba(0,0,0,0.5)` | 放行 | 放行 | ✅ |
| ⑪ | `var()` 引用 | `var(--v5-success)` | 放行 | 放行 | ✅ |
| ⑫ | 块注释内违例 | `/* color: #0E8E4A; */` | 放行 | 放行 | ✅ |
| ⑬ | `.ts` 内联 style 对象副本 | `{ color: "#0E8E4A" }` | 抓 | **抓** | ✅ 覆盖 .ts |
| ⑭ | 模板字符串拼接 | `` `rgba(14,142,74,${a})` `` | 放行(无法静态判) | 放行 | ✅ 符合预期 |

- **⑤ 注**:当前 40 个亮暗异值 token **没有一个**能用 3 位 hex 表示(需 `#XXYYZZ` 形式),所以这条分支今天不可达;`norm()` 里的 3 位分支是防未来,不算缺口。
- **还原校验**:两文件 sha256 与注入前**完全一致**;`grep __REDTEST / \.rt[0-9]` = 0 命中;`git diff --stat` 里 `password-rules.ts` 无任何改动。移除后哨兵回 `exit=0 / 0 违例`。**红测无残留。**
- ⚠️ 自我批评:我是在一个**并发会话正在写**的工作树上做「写入→还原」,时间窗虽只有 3 秒,但这是有风险的操作,更稳妥的做法是新建临时文件而非改真文件。

#### B3 假阴性(它抓不到的真副本)— 找到 5 类

| # | 盲区 | 严重度 | 说明 |
|---|---|---|---|
| N1 | **`.css` / `.scss` 文件完全不扫** | LOW | `walk()` 只收 `.vue/.ts/.js`。今天 `src/` 下只有 `tokens.css`(本就跳过)和 `uni.scss`(uni 默认样板,未使用),**当前 0 实际漏网**;但任何新增 `src/styles/*.css` 都是黑洞。verify 里旧的 4 色硬地板 (`sentinel_absent`) 反而能扫到 css/scss,两门覆盖面**不一致** |
| N2 | **`src/` 之外不扫** | LOW-MED | `index.html`(设备外壳,含 `#15171b / #08090b / #f7f9fc / #e8edf4`)、`uno.config.ts`(实测 0 色值)不在范围。index.html 是 dev 外壳,不影响产品,但范围边界应写明 |
| N3 | **`hsl()` / `hwb()` / `lab()` 不识别** | LOW | 实测 ⑨ 漏网。全库现有 `hsl(` = **0 处**,今天无实际漏网 |
| N4 | **近似值(挪一两位)不识别** | MED | 只做 RGB 全等匹配。`purchase-ticker` 原注释自陈「特意挪值以免触发哨兵」——**挪值这条路今天仍然通**。同一个人换个色号仍可绕过 |
| N5 | 🔴 **「不是 token 副本、但双主题恒定」的字面量完全在射程外** | **HIGH** | 这是设计取舍(哨兵只钉「必失配」),但**本次最严重的三个用户可见缺陷全出在这一类**(见 C2):`#D4AF5A` 金、`rgba(15,21,42,0.035)` 网格线、`rgba(255,255,255,0.03)` 网格线,全都不是任何 token 的值,哨兵天然看不见,而且本批次也没有任何机器门去兜 |

#### B4 假阳性(会不会拦住合法写法)— ✅ **未发现**

- `var()` / `color-mix(var())` / 真灰 / 三种注释(`//`、`/* */`、`<!-- -->`)全部放行,红测 ⑩⑪⑫ 验证。
- `//` 的剥离用 `(^|[^:\w])\/\/`,不会误伤 `https://`。
- 全库实跑 **0 违例 / 21 条命中全在豁免内**,没有一条噪声。
- 唯一潜在假阳性风险:第三方品牌色/数据字段色与 token 值**巧合同值**时会命中——本次就发生了 4 次(见 B5),靠 allowlist 解决,机制正确。

#### B5 豁免逐条回源 — ✅ 4 条正确 / ⚠️ 2 条「结论对但范围过宽 + 是在寄存真缺陷」

| 文件 | 命中数 | 我的判定 | 回源证据 |
|---|---|---|---|
| `team/share-poster-sheet.vue` **(整文件)** | 9 | **✅ 该豁免,但范围过宽** | 回源 178–185、288–309:全部是 canvas 画稿常量 `BRAND_ON_DARK/CYAN_ON_DARK/INK_ON_DARK` 与其十进制展开,注释写明「海报 = 恒定深色画稿…主人 2026-07-08 拍板浅深同一张海报;canvas 本就不解析 CSS var」。海报之外的 `.ps-mask`(516 行)确已 token 化。**问题**:哨兵支持 `literal` 级豁免却用了整文件级——这个 500+ 行文件里将来任何模板/样式里的新违例都会被静默放行 |
| `team/v-badge.vue` **(整文件, pending)** | 4 | **⚠️ 判定对,但等于把一个已确认的亮主题缺陷寄存在 allowlist 里** | 回源 30–42:`rgba(124,92,255,α)` 是 V5/V6 军衔紫,与 `--v5-nex@light` **巧合同值**,语义不是 NEX 标识 → 不该按「token 副本」修,判定正确。但 reason 自己承认「亮主题下 V3(蓝字柠檬底)/V5(**青字紫底**)异色系」——那是真缺陷:`text: var(--v5-tech-cyan)` 在 dark 是紫 `#8E72FF`(与紫底同族),在 light 变青 `#0CC4D6`(压在紫底上撞色)。留 `pending` 留痕是诚实的,但**必须进「待主人拍板」清单**,不能只躺在 JSON 里 |
| `team/v-badge-icon.vue` **(整文件, pending)** | 4 | **⚠️ 同上** | 与 v-badge.vue **各存一份完全相同的 13 档色表**(reason 自己点破)。重复定义本身是另一个欠账 |
| `mock/tokens.ts` `#7C5CFF` | 1 | **✅ 该豁免** | 回源 153 行:io.net 币种品牌识别色,同表 16 个币种同理,属 mock 行情数据字段 |
| `mock/events.ts` `#7C5CFF` | 1 | **✅ 该豁免** | 回源 101 行:事件流标识 tint,数据字段 |
| `pages/team/network.vue` `rgba(124,92,255,0.18)` | 2 | **✅ 该豁免** | 回源 52 行 = SVG 轨道环 `stroke`,262 行 = `orbCardStyle` 径向光晕;同处还有 `rgba(198,255,58,0.18)` 旧柠檬,是这张可视化图自带的小调色板,不是主题语义色 |

**结构性观察**:6 条豁免里 **4 条是同一个根因**——C1 新造的 `--v5-nex@light` 选了 `#7C5CFF`,而这个值在库里**早就被三处占用**(io.net 品牌色、事件 tint、V 军衔紫、还有 legacy `--accent-purple: #7C5CFF`)。换一个不撞的紫,这 4 条豁免根本不用写。**选值时没做碰撞检查**。

---

### C. 实景双主题(verify 绿 ≠ 渲染 OK)

采样:Playwright(工程内)、viewport 390×844、`?nx_device=off`、主题经 `$pinia._s.get('theme').setMode()` 切换。所有 computed 值经 `color(srgb …)→rgb()` 归一化后比对。

#### C1 定点抽查 —— 10 个改动着色元素,**全部随主题变化** ✅ **PASS**

| # | 元素(改动来源) | dark 实测 | light 实测 | 判定 |
|---|---|---|---|---|
| 1 | `message-drawer` `.md-backdrop`(新 `--v5-bg-color-mask`) | `rgba(0, 0, 0, 0.62)` | `rgba(19, 20, 26, 0.45)` | ✅ 变 |
| 2 | `capacity-explainer-sheet` 遮罩 | `rgba(0, 0, 0, 0.62)` | `rgba(19, 20, 26, 0.45)` | ✅ 变 |
| 3 | `how-hero` 网格线(`rgba(19,20,26,0.04)`→`color-mix(ink 4%)`) | `srgb .9608 .9686 .9804/.04` = ink@dark #F5F7FA | `srgb .0745 .0784 .102/.04` = ink@light #13141A | ✅ 变(原写法在暗主题下纹理会消失) |
| 4 | `how-callout-box` 边框 | `srgb 1 1 1 / .0353` | `srgb .898 .8745 .8157 / .6` = border@light #E5DFD0 | ✅ 变 |
| 5 | `purchase-ticker` 头像底(hex→`var(--v5-warning)` 等 5 色) | `rgb(255, 203, 77)` = warning@dark | `rgb(198, 131, 22)` = warning@light | ✅ 变(**但字色有回归,见 §5-P1**) |
| 6 | `locked-product-card` 渐变(`rgba(255,90,31,.10)/rgba(12,196,214,.08)`→color-mix) | `srgb 1 .478 .239/.1` = brand-2@dark + `srgb .5569 .4471 1/.08` = tech-cyan@dark | `srgb 1 .353 .122/.1` = brand-2@light + `srgb .047 .7686 .8392/.08` = tech-cyan@light | ✅ 变 |
| 7 | `product-card` 斜纹(repeating-linear-gradient) | `srgb .5569 .4471 1/.08`(紫) | `srgb .047 .7686 .8392/.08`(青) | ✅ 变 |
| 8 | `staking` vault/卡片边框 | `rgba(255,255,255,.12)` / `rgba(255,255,255,.06)` | `rgb(213,205,184)` / `rgb(229,223,208)` | ✅ 变 |
| 9 | `tradein` 卡渐变 | `srgb 1 .478 .239/.14` → `rgb(20,20,20)` | `srgb 1 .353 .122/.14` → `rgb(255,255,255)` | ✅ 变 |
| 10 | 首页任务卡奖励值(`var(--v5-warning)`→`var(--v5-nex)`) | `rgb(180, 127, 255)` = nex@dark | `rgb(124, 92, 255)` = nex@light | ✅ 变 |
| 11 | `nex-price-card` 跌幅 tint(`#C26658`→`var(--v5-danger)`) | 源码 `var(--v5-danger)` → #FF5C5C | → #B9554A | ✅ 变(原恒定 #C26658 在纯黑上偏闷) |

**结论:C1 声称修掉的那批,运行时确实都在跟随主题。这一项是实打实做到了。**

#### C2 反向抽查:仍然双主题恒定的着色元素 —— ❌ **FAIL,3 处是真缺陷且都在一级 tab 上**

对 8 条路由 × 双主题逐元素比对 computed 值(已排除 border=currentColor 的重复噪声):

| 元素 | 恒定值 | dark 对比度 | **light 对比度** | 判定 |
|---|---|---|---|---|
| 🔴 **Store · 创世节点卡**「Genesis Node · Limited 1,000」12px / **「$11,999」26px** / **「Subscribe now(立即认购)」13px** | `#D4AF5A` 金(**纯字面量,非 token**) | 8.84:1 ✓ | **2.08:1** ✗✗ | **漏改**。见截图 `store-genesis-light.png`:白卡上金字几乎糊掉,而这是 $11,999 旗舰 SKU 的**转化 CTA** |
| 🟠 **Home · 新手任务倒计时**「18:23:57」15px、「4d 11h」13px<br>**Earn ·**「限时免费」12px/600、「$」20px、**「立即领取」13px/600** | `#9B89E0` = `--v5-quest-violet` | 6.18:1 ✓ | **2.98:1** ✗ | **合理豁免了一半**:tokens.css 注释明写「双主题恒浅」是刻意的,并为**压在其上的前景**造了 `--v5-on-quest`;但**它自己当文字色**时亮主题只有 2.98:1,批次没处理也没记为待办 |
| 🟠 **Earn ·**「今日仅剩 47 张」12px | `#FF6B35` = `--v5-quest-ember` | 6.5:1 ✓ | **2.84:1** ✗ | 同上 |
| 🔴 **Store · locked-product-card 网格纹** | `rgba(15,21,42,0.035)` | 暗底上近黑 → **纹理消失** | 可见 | **漏改**。与 C1 已修的 `how-hero`(`rgba(19,20,26,0.04)`)**是同一个 bug 的同胞**,只因值不同(15,21,42 vs 19,20,26)而躲过 |
| 🔴 **Team · invite-earn-card 网格纹** | `rgba(255,255,255,0.03)` | 可见 | 白线压奶油底 → **纹理消失** | **漏改**,方向相反的同类。同一张卡里**隔壁的分隔线是会变的**(dark `rgba(255,255,255,.03)` → light `rgba(229,223,208,.58)`)——半边 token 半边字面量的活标本 |
| ⚪ 通知红点数字 | `rgb(10,10,10)` | — | — | ✅ **合理**:`--v5-on-brand-2` 是全库唯一「两主题同值」的 token,压在恒定橙底上,正确 |
| ⚪ TabBar 胶囊高光/描边 | `rgba(255,255,255,.1)` + 白渐变 | — | — | ✅ **合理**:TabBar 是恒定深色 chrome,截图确认亮主题下仍是深胶囊 |
| ⚪ 商品图上的「S1 / 经典款」角标 | 白 .88 字 + 黑 .55 底 | — | — | ✅ **合理**:压在产品图上,与主题无关 |
| ⚪ 商品图深色底板 `linear-gradient(135deg,#101216,#0A0B0E,#000)` | 恒定深 | — | — | ✅ **合理**:产品渲染图统一深底板,设计意图 |
| ⚪ Market 币种色(`#C6FF3A/#CF1E4D/#3A8DFF/#FFD23F`) | 恒定 | — | — | ✅ **合理**:币种品牌识别色,数据字段 |

#### C3 console / pageerror / requestfailed —— ✅ **PASS,全 0**

| 路由 | dark | light |
|---|---|---|
| pages/index/index | 0 | 0 |
| pages/earn/earn | 0 | 0 |
| pages/store/store | 0 | 0 |
| pages/team/team | 0 | 0 |
| pages/me/me | 0 | 0 |
| pages/staking/staking | 0 | 0 |
| pages/staking/how-it-works | 0 | 0 |
| pages/market/market | 0 | 0 |

(5 个一级 tab 全覆盖,另加 3 条深页;三类事件 console.error / pageerror / requestfailed 分别监听。)

#### C4 遮罩统一性 —— ✅ **PASS**

- **静态**:全库 **20 个文件 / 21 处** 弹层/抽屉/底部弹层的遮罩底色,**全部**写 `var(--v5-bg-color-mask)`,包括 `global-ui`(全局 confirm)、`message-drawer`、`country-code-sheet`、`captcha-slider`、`genesis/purchase-sheet`、`lucky-spin-sheet`、`trial-*-sheet` ×3、`tradein-sheets`、`share-poster/channel-sheet`、`milestone-celebration`、`slot-action-sheet`、`stake-sheet`、`voucher-claim-sheet`、`tradein-ladder-sheet`、`capacity-explainer-sheet`、`device-card-pc`、`eligibility-sheet`。**0 例外。**
  - 注:`login/register` 的 `.lg-root/.rg-root { background: #000 }` 不是遮罩,是恒定暗场页壳,合理保留。
- **运行时**:dark `rgba(0,0,0,0.62)` / light `rgba(19,20,26,0.45)`,双主题不同值 ✅。
- **视觉(截图判,不只看数值)**:`mask-drawer-light.png` / `mask-capacity-light.png` —— 亮主题遮罩 + `backdrop-filter: blur` 后,背景内容明显压暗且虚化,层级清楚,**压得住**。`store-genesis-light.png` 里的庆祝弹层同样。

---

### D. 防洁癖 / 防过度整改

| 条目 | 判定 | 证据 |
|---|---|---|
| **D1** 有没有把该保留的硬编码改掉 | ✅ **PASS,一处都没有** | ① **canvas**:`grep '(setFillStyle\|fillStyle\|addColorStop\|createCircularGradient).*var(--'` = **0 命中** —— 没有把 CSS 变量塞进 canvas(那会直接画不出来)。全库只有 `share-poster-sheet.vue` 一个 canvas 文件,其色值常量原样保留并进了 allowlist ② **二维码**:同一文件,同样保留 ③ **第三方品牌色**:`mock/tokens.ts` 16 个币种色、`mock/leaderboard.ts` 银/铜牌 `#C9D2DC/#C77546` 原样保留(该批次只改了同行的品牌名文案) ④ **固定暗场页**:login/register `#000` 保留 ⑤ **数据字段色**:`mock/events.ts` tint 保留 |
| **D2** 有没有与颜色 token 化无关的夹带 | ⚠️ **无法按整树判;按颜色 hunk 判 = 无夹带** | 工作树同时压着 4 个批次:改名(`Nexion→NexGrid` 品牌词/存储键)、B0(radius/space/type 阶梯 token)、B1(9→14 档字号迁移 + tap≥44pt + a11y)、C1(颜色)。同一文件里三批交织,例:`purchase-ticker.vue` 一次改动同时含 `12.5px→13px`(B1)、`NexionBox→NexGridBox`(改名)、`hex→var(--v5-*)`(C1)。**这不是 C1 的错,是工作树的组织方式**,但它让「C1 单独回滚」不可能,也让本项无法给硬结论 |
| D2-附 | ⚠️ 1 处新引入的硬编码 | `how/how-hero.vue` 在**修网格线的同一段**里新写了 `rgba(255,203,148,0.20)`(桃色光晕,不是任何 token 值)。在「消灭硬编码颜色」的批次里新增硬编码色,自相矛盾。严重度 LOW(装饰光晕,双主题下都不刺眼) |

---

### E. 完整性(修一处 vs 全站同类)

| 条目 | 判定 | 证据 |
|---|---|---|
| **E1** 每类被修的模式,全站同类扫过没有 | ❌ **FAIL,3 处同类漏网** | ① **网格线类**:修了 `how-hero.vue` 和 `staking/compound-calculator.vue` 的 `rgba(19,20,26,0.04)`,**漏了** `store/locked-product-card.vue:140-141` 的 `rgba(15,21,42,0.035)` 和 `team/invite-earn-card.vue:226` 的 `rgba(255,255,255,0.03)`——两者运行时实测双主题恒定,各自在一个主题下纹理消失 ② **on-color 类**:为 quest 填充造了 `--v5-on-quest` 解决前景色问题,**同一批次**改的 `purchase-ticker` 头像却用了不匹配的 `--v5-on-brand`(见 §5-P1) ③ 搜索方式推断:漏网的两处**值不同**(15,21,42 / 255,255,255 vs 19,20,26),说明扫描是**按值 grep** 而不是**按模式(1px 网格线渐变)** 扫的 |
| **E2** 同一对象/同一段样式里「一半 token 一半字面量」还剩多少 | ⚠️ **剩 30+ 处,多数有理由,4 处可疑** | 全库 `grep 同行含 var(--v5-*) 且含色字面量` = 30+ 行。**合理的**:`color-mix(… , #000 28%)` / `#111317 6%` 这类**中性明暗调和常量**(menu-grid-card)、canvas 常量、`live-feed-card` 的 `rgba(0,0,0,0.10)` 阴影、`card-brand-badge` 的银行卡白字。**可疑的 4 处**:`staking/position-row.vue:147` `linear-gradient(90deg, #36D4FF, var(--v5-success))`(左半恒定青、右半随主题翻)、`genesis/nft-card.vue:39` `var(--v5-brand) → #7250C8`、`pages/daily/daily.vue:380` `#FFCB94 → var(--v5-brand-2)`、`pages/daily/daily.vue:411-412` 已签到态 `background: rgba(255,255,255,0.42)` + `color: rgba(255,255,255,0.65)`(白底白字,亮主题下大概率糊)。这 4 处哨兵**都看不见**(字面量不是 token 值) |

---

## 3. 六维评分

| 维度 | 权重 | 分 | 证据(每维必附) |
|---|---:|---:|---|
| **跨端兼容** | 25% | **90** | H5 实测 8 路由 × 双主题:主题切换通道 100% 生效(`data-theme` + token 双证)、三类运行时错误全 0、40 色 token 表双向可达。`color-mix` 新增 14 处属**存量写法**(HEAD 已有 574 处 / 139 文件),不构成新增平台风险。**扣分**:App(iOS/Android webview)与 mp-weixin 两端**无任何证据**——verify 只打 H5;新增的 `--v5-quest-*` / `--v5-nex` / `--v5-bg-color-mask` 只在 H5 验过 |
| **视觉对齐规范** | 20% | **62** | 修对的 11 个定点全部随主题变(见 C1 表)。**扣分**:一级 tab 上 3 处双主题恒定缺陷实测——Store 金字 **2.08:1**、Home/Earn quest 紫 **2.98:1** / 橙 **2.84:1**(WCAG AA 正文需 4.5:1);两处 1px 网格纹各在一个主题下消失;ticker 头像亮主题 warning 档 **5.83→3.15** 回归 |
| **业务逻辑一致** | 20% | **88** | token 语义映射查对:NEX 奖励值 → `--v5-nex`(与 AI/tech-cyan 分色,合理)、跌幅 → `--v5-danger`、vault 档位 → `success/warning` 30% color-mix、遮罩 → `--v5-bg-color-mask`,全部语义正确;`tsc` 0 错。**扣分**:`--v5-nex@light = #7C5CFF` 与库内既有的 io.net 品牌色 / 事件 tint / V 军衔紫 / legacy `--accent-purple` **四处撞值**,直接制造了 6 条豁免里的 4 条——选值前没做碰撞检查;V 军衔紫 vs NEX 身份紫的语义冲突被挂 `pending` 未收敛 |
| **转化 + 文案** | 15% | **70** | 未改任何文案,i18n 4087 key 三语镜像 PASS。**扣分**:最高客单价 SKU(创世节点 $11,999)的**认购 CTA + 价格**在亮主题下 2.08:1;新手任务「立即领取」CTA 2.98:1;Earn 稀缺提示「今日仅剩 47 张」2.84:1 —— 三个都踩在转化链路上 |
| **i18n** | 10% | **98** | `i18n-key-mirror` PASS:en/zh/vi **4087 keys · 495 条插值占位符对齐**;本批次纯颜色改动,未新增/删除任何 key,未引入硬编码文案(verify 的 i18n 哨兵组全绿)。占位符 4 条 INFO 级差异属既有语法差异,与本批次无关 |
| **token 纪律** | 10% | **85** | 哨兵设计判据成立(B1),selftest 25/25,**我的独立红测 13/14**,独立复算 40 色表一致,全库 0 违例,豁免 6 条 reason 必填且 4 条回源正确。**扣分**:`hsl()` 盲区、`.css/.scss` 与 `src/` 外不扫、近似值挪一位仍可绕过、3 条整文件级豁免过宽;最关键——**「非 token 副本但双主题恒定」这一类没有任何机器门**,而本次最严重的缺陷全在这一类 |

> **加权总分 = 90×0.25 + 62×0.20 + 88×0.20 + 70×0.15 + 98×0.10 + 85×0.10 = 22.50 + 12.40 + 17.60 + 10.50 + 9.80 + 8.50 = 81.3**
>
> ### 🔴 81.3 < 95 → **不通过**

---

## 4. 我找到的、清单之外的问题(按真影响用户排序)

### P1 · 🔴 HIGH — Store 创世节点卡在亮主题下几乎读不出来(2.08:1)

- **位置**:`src/components/store/genesis-showcase-card.vue`,`lockMetStyle` 等处 `color: "#D4AF5A"`。
- **实测**:亮主题下「Genesis Node · Limited 1,000」(12px)、「**$11,999**」(26px/600)、「**Subscribe now / 立即认购**」(13px/500) 的有效背景是 `rgb(255,255,255)`,对比度 **2.08:1**(暗主题 8.84:1)。截图 `store-genesis-light.png`。
- **为什么漏**:`#D4AF5A` 不是任何 token 的值 → token-copy 哨兵天然看不见;本批次也没做「双主题恒定色」的正交扫描。
- **建议**:补 `--v5-gold` / `--v5-gold-on-surface` 双主题 token(暗 `#D4AF5A`,亮取加深版,目标 ≥4.5:1),而不是把这个字面量再放行一次。

### P2 · 🟠 MED-HIGH — ticker 头像:修好了暗主题,却把亮主题 warning 档从 5.83 打到 3.15

- **位置**:`src/components/store/purchase-ticker.vue`,`avatarStyle.color`:`var(--v5-ink)` → `var(--v5-on-brand)`(本批次改的)。
- **精算**(同一 WCAG 公式,与浏览器探针同源):

| 头像底 | 改前 `--v5-ink` | 改后 `--v5-on-brand` | 若用 `--v5-on-brand-2` |
|---|---|---|---|
| light warning `#C68316` | 5.83 | **3.15** ⬇ | 6.28 |
| light success `#0E8E4A` | 4.36 | **4.21** | 4.70 |
| light danger `#B9554A` | 3.90 | 4.71 ⬆ | 4.21 |
| light brand `#0E48E6` | 2.70 | 6.80 ⬆⬆ | 2.91 |
| light brand-deep `#0833B8` | 1.90 | 9.65 ⬆⬆ | 2.05 |
| dark(全部 4 档) | 1.41 ~ 2.82 | **6.54 ~ 13.11** ⬆⬆ | — |

- **公允结论**:这是一次**大幅净改善**(暗主题 5 档全部从「几乎不可读」拉到 6.5+),但 **warning 一档在亮主题回归**,success 一档仍 4.21 < 4.5。单一 on-color 覆盖 5 种填充在数学上做不到。
- **建议**:照抄本批次自己在 `day-one-quest-card.vue` 里已经落地的模式——给每条 purchase 记录配显式 `onColor`(`QuestTask.onColor` 就是这个思路)。

### P3 · 🟠 MED — 两处 1px 网格纹在某一主题下消失(与已修的 how-hero 同胞)

- `src/components/store/locked-product-card.vue:140-141` `rgba(15,21,42,0.035)` → 暗主题近黑压近黑,纹理消失(运行时实测双主题恒定)。
- `src/components/team/invite-earn-card.vue:226` `rgba(255,255,255,0.03)` → 亮主题白线压奶油底,纹理消失。**同一张卡里隔壁的分隔线是会变的**(`rgba(255,255,255,.03)` → `rgba(229,223,208,.58)`),半边改了半边没改。
- 修法与 how-hero 一致:`color-mix(in srgb, var(--v5-ink) 3.5%, transparent)`。

### P4 · 🟠 MED — `--v5-quest-violet` / `--v5-quest-ember` 当**文字色**时亮主题 2.98 / 2.84:1

- tokens.css 注释只解决了「压在 quest 填充**之上**的前景」(造了 `--v5-on-quest`),但这两个色**自己当文字**用在 Home 倒计时、Earn「限时免费 / $ / 立即领取 / 今日仅剩 47 张」上,亮主题全部 < 3:1。
- token 化本身**没造成回归**(值没变),但把「已知的亮主题欠账」固化成了 token,且**没有进任何待办清单**。
- 建议:要么在 `:root` 给这两个 token 取亮主题专用的加深值(dark 块再覆盖回原色),要么显式记入待拍板项。

### P5 · 🟡 MED — `daily.vue` 已签到态:白 42% 底 + 白 65% 字

- `src/pages/daily/daily.vue:411-412`:`background: lastSignedToday ? "rgba(255,255,255,0.42)" : "var(--v5-ink)"`、`color: lastSignedToday ? "rgba(255,255,255,0.65)" : "var(--v5-brand-2)"`。
- 三元的一支是 token(随主题)、另一支是白色字面量(恒定)。亮主题下「今天已签到」的按钮 = 白底白字。哨兵看不见(白不是 token 值,且真灰会被排除)。
- 我未能在运行时复现该态(需要「今天已签到」状态),**标为待验证,不是已确认缺陷**。

### P6 · 🟡 LOW-MED — 3 条整文件级豁免过宽

`share-poster-sheet.vue` / `v-badge.vue` / `v-badge-icon.vue` 三条豁免省略了 `literal` 字段 = 整文件放行。哨兵本身支持 `literal` 级精确豁免。建议改成逐值豁免,否则这三个文件将来任何新违例都静默通过。

### P7 · 🟡 LOW — `v-badge.vue` 与 `v-badge-icon.vue` 各存一份**完全相同**的 13 档色表

allowlist 的 reason 自己点破了。属重复定义,改一处漏一处的经典温床。

### P8 · 🟡 LOW — 在「消灭硬编码颜色」的批次里新引入硬编码颜色

`how/how-hero.vue` 修网格线的同一段里新写 `rgba(255,203,148,0.20)`。

### P9 · 🟡 LOW — 两道门覆盖面不一致

`verify.sh` 的旧 4 色硬地板 `sentinel_absent` 扫 `src/` **全部文件类型**(含 `.css/.scss`),新 `token-copy` 门只扫 `.vue/.ts/.js`。同一目标两个覆盖面,将来加 `src/styles/*.css` 会出现「旧门拦得住、新门看不见」的错位。

### P10 · ⚪ INFO — 批次收尾件未齐

`docs/前端产品更新日志.md` 顶部无 C1 条目(工程 CLAUDE.md 完成门第 6 条)。考虑到并发会话仍在写(§0),按「尚未收尾」处理,不计入扣分。

---

## 5. 教条项(我判为「不该修」的,列出来防下一轮被当成漏改)

| # | 目标 | 为什么不该修 |
|---|---|---|
| T1 | `share-poster-sheet.vue` 的全部画稿常量 | canvas 不解析 CSS 变量;且主人 2026-07-08 已拍板「浅深模式同一张海报」。改成 token 会直接画不出色 |
| T2 | `mock/tokens.ts` 16 个币种色、`mock/events.ts` tint、`mock/leaderboard.ts` 银/铜牌色 | 第三方品牌识别色 / 数据字段,不是主题语义色。`#7C5CFF` 与 `--v5-nex@light` 撞值纯属巧合 |
| T3 | `login.vue` / `register.vue` 的 `.lg-root/.rg-root { background: #000 }` | 恒定暗场页壳,设计如此,不是遮罩也不随主题 |
| T4 | TabBar 胶囊的 `rgba(255,255,255,.1)` 描边与白渐变高光 | TabBar 是恒定深色 chrome(截图确认亮主题下仍是深胶囊),白色微高光是对的 |
| T5 | 商品图上的角标(白 .88 字 / 黑 .55 底)与商品图深色底板 | 压在产品渲染图上,与页面主题无关 |
| T6 | `menu-grid-card.vue` 的 `color-mix(… , #111317 6%)` / `#000 28%` | 中性明暗调和常量,不是语义色。用 token 反而语义不对 |
| T7 | `--v5-quest-violet/ember` **值本身**保持设计稿原色 | 主人已批准「值不变、只收敛为 token」。P4 说的是**它当文字色时的亮主题对比度**,不是要改这两个值的定义 |
| T8 | `network.vue` 可视化图的轨道环 / 光晕紫 | 可视化装饰自带调色板;走 token 会让暗主题变亮紫,偏离设计意图 |
| T9 | V 军衔 13 档色阶 | 按色族成对分档,只改「带 token 的半档」会拆散色族配对反而更糟。整族口径**必须主人裁决**,不该由实现方单方面改 |

---

## 6. 截图索引 `docs/changes/assets/c1-acceptance/`

| 文件 | 用途 |
|---|---|
| `pages_{index,earn,store,team,me}_*-{dark,light}.png` | 5 个一级 tab 双主题全景(C3 取证同批) |
| `pages_staking_{staking,how-it-works}-{dark,light}.png`、`pages_market_market-{dark,light}.png` | 深页双主题 |
| `store-genesis-{dark,light}.png` | **P1 主证**:创世节点卡金字亮主题 2.08:1 |
| `mask-drawer-{dark,light}.png`、`mask-capacity-{dark,light}.png` | **C4 主证**:遮罩双主题 + 亮主题压得住(视觉判) |
| `staking-{dark,light}.png`、`how-it-works-{dark,light}.png`、`home-{dark,light}.png`、`earn-{dark,light}.png`、`team-vbadge-{dark,light}.png`、`daily-{dark,light}.png` | C1/C2 定点取证 |

---

## 7. 放行条件(修完这几条我认为可以复验)

1. **P1** `#D4AF5A` → 双主题 token,亮主题 ≥4.5:1(转化 CTA,必修)。
2. **P3** 两处网格纹改 `color-mix(var(--v5-ink) …)`。
3. **P2** ticker 头像改逐条 `onColor`(复用本批次已有模式),亮主题 5 档全部 ≥4.5:1。
4. **P4** quest 双色当文字色的亮主题对比度:给方案或明确记入待主人拍板项。
5. **P6** 3 条整文件豁免降级为逐值豁免。
6. **补一道正交机器门**:「双主题恒定的着色元素」运行时扫描(本报告的 C2 脚本即可产品化),把 N5 这一整类从盲区里拉出来 —— 否则同类缺陷下次还会以「值不同」的形式再漏一遍。
7. 批次冻结后重跑一次 `verify.sh` 复核(已拿到一次干净的 `319 pass / 0 fail / exit=0`,但工作树在动,冻结后应再取一次)。
