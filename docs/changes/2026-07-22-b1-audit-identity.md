# B1 审计 · 设计定位 / 视觉身份 / 数据可视化 / 图标插画

**本页判定目标 = 每一屏都服务同一个漏斗目标:引导用户进 Store 买设备(NexGridBox S1 / Pro / Rack)（来源:UI 规范 01 §1 明写）**

> 规范原文 SoT:`UI/规范/01-设计定位.md`（8 条核心设计原则 · 双主题气质）、`09-数据可视化规范.md`、`10-图标插画资产.md`、`00-索引.md`（铁律速记）。
> 审查对象:五 tab 主链路 `pages/{index/index, earn/earn, store/store, team/team, me/me}` + `components/{home,earn,store,team,me}/*` + `app-chassis.vue`。
> 取证:Playwright（工程 node_modules），414×896 / DPR2 / reduced-motion / 时间与 Math.random 冻结，亮暗双主题、55 张截图，全部实景 Read 过。控制台 error = 0（10/10 路由）。
> **纪律声明**:每条 P0/P1/P2 都挂规范原文 + file:line 或实测数值。凭"感觉"的一律进 §6 存疑/口味,不进分级。§0 单列了 3 条我先怀疑、实测后**证伪撤回**的结论。

---

## §0 先证伪:3 条我差点误报的结论（防洁癖陷阱）

| 我的初判 | 实测 | 结论 |
|---|---|---|
| me 菜单栅格"皇冠/锁/月亮/卡片是填充图标,与线性图标体系混用" | 全页 44 个 SVG 程序化审计:`viewBox` 100% 为 `0 0 24 24`;**纯填充图标 0/44**;硬编码 hex **0** | **证伪撤回**。小尺寸下粗描边看着像填充,实为描边图标。规范 10 §1 合规 |
| home 首屏 5 个状态点,违反原则 6「单屏 ● ≤ 1–2」 | 溯源 `components/home/tech-money-card.vue:80-100`,是 `v5-dot-drift 8s linear infinite` 的**装饰漂移粒子**,非状态点 | **证伪撤回**（原则 6 改判 PASS,另见 §6-D） |
| store 商品卡"售价/立即购买"页脚 = 带 bg 卡片加 border | `store/product-card.vue:347` 只有 `borderTop: 1px solid`,是**分隔线**,原则 5 原文明确允许「分隔线 + 微差 surface」 | **证伪撤回**（home `on-grid-section.vue:14` 同理,无 border） |

---

## §1 8 条核心设计原则 · 逐条打分 + 举证

> 原则原文逐字取自 `01-设计定位.md` §3,不自造。分数 = 五 tab 现状综合。

### 原则 1 — Friendly readability > code aesthetics · **8/10**
> 原文:「sentence case;无 `<tag/>` chrome;无 `// comment` 语法;无 ALL CAPS 标题;mono 只给 ID / hash / 时间戳(7 词铁律)」

- ✅ 无 `<tag/>` chrome / `// comment` 装饰语法（verify.sh React 残留哨兵兜底）。
- ✅ **ALL CAPS 不是标题**:全量 15 处 `text-transform: uppercase`,无一例外都是 10.5–11.5px、letter-spacing 0.14–0.16em 的 eyebrow 微标签（`earn/task-center.vue:27,61`、`earn/device-card-pc.vue:217,237,264`、`team/team-ledger-card.vue:107`、`store/tradein-window-banner.vue:107` 等）。中文 locale 下对 CJK 是 no-op。**不违反**。
- ✅ mono 7 词测试全过（最长 `Trade up · $14.92 credit` = 4 词,见 `shots/zoom-store-pro.png`）。
- ⚠️ **扣分点**:mono 溢出到「ID/hash/时间戳」以外的散文串。`shots/home-dark-s1.png` 的 `Pocket Studios · Berlin` / `Helix Labs · SF`（公司名+城市）、`shots/earn-dark-s2.png` 的 `Low barrier entry` / `Flagship compute`（营销副标）都走了 mono。7 词过、语义不过。

### 原则 2 — 金融数据优先 · **7/10**
> 原文:「金额 / 收益 / 提现状态 / 设备状态 / KYC / 地址 / Hash 的可读性永远高于装饰」

- ✅ 关键金融态全部显性:`me` 的 `KYC 待认证` chip、`$0.00 审核中 · $0.00 锁定`、设备 `● 在线`、`1 NEX = $0.171` 汇率（`shots/me-dark-s0.png`）。
- ✅ 金额一律 `tabular-nums` + mono,32–36px hero 档。
- ❌ **扣分点（实测）**:earn 首屏最大字号是 **36px 的 `21`**（试用促销"3 天预计收益 $21",top=106),而本页真正的金融主体「算力收益 · 今天 $247.83」只有 **32px 且 top=443**（近折叠线）。**促销数字压过页面自身财务主体**——详见 §7-B。

### 原则 3 — 漏斗感知 · **10/10**（全场最强项）
> 原文:「每张卡回答"用户升级能得到什么"——peer 对比、payback、locked task 预览」

三要素全覆盖且不止一处:
- peer 对比:`home` live feed 的 `你`/`同伴` chip 双色分轨;`store` 的 `你的手机 $0.06/天 → 117× 更多 → NexGridBox S1 $7.00/天`。
- payback:`home` 算笔账「回本 100 d」;`store` 算力阶梯 5 档比例条。
- locked 预览:`store` 即将上线「阶段 1/3」锁图标;商品卡「可接高阶任务:LLM 70B inference pool」。

### 原则 4 — 动效 = 实时信号,绝不纯装饰 · **7/10**
> 原文:「aurora 漂移、pulse、shimmer、ledger fade,绝不纯装饰」

- ✅ pulse 绑在 live 指示器上;coupon shimmer 是"刚签发"隐喻;ticket 3D 翻转由 IntersectionObserver 触发（用户真看到才播,`tokens.css:650-660`）。
- ✅ `tokens.css:670-676` 有 `prefers-reduced-motion` 降级。
- ⚠️ **扣分点**:两处纯装饰无限循环动画,与任何数据无绑定 —— `home/tech-money-card.vue:80-100` 的 5 颗 `v5-dot-drift 8s infinite` 漂移粒子;`home/nova-card-slot.vue:69,71` 的 `v5-nova-blob-1/3` 9s/14s 色团漂移。

### 原则 5 — 卡不套卡 · **6/10**（本轮最低分）
> 原文:「分隔线 + 微差 surface + dashed 框;🔵 **带 bg 卡片零 border**,嵌套 ≤ 2 层」

- ✅ dashed 分隔框用得好（`do-the-math-card.vue:45` `border-top: 1px dashed`;商品卡 `product-card.vue:59`）。
- ❌ **3 处确证违反「带 bg 卡片零 border」**（同一元素上 `background` + `border` 同时存在,非分隔线）：见 §5-A 表。

### 原则 6 — 状态点克制 · **8/10**
> 原文:「单屏 `●` ≤ 1–2 个,优先用颜色文字 / chip」

- ✅ 实测首屏真·状态点:home **0**、store **0**、team **1**（`● 今日 247 人已领取`）、me **1**（`● 4 live · 1 slots open`）、earn **1**（`● 今日仅剩 47 张`）。全部 ≤2。
- ⚠️ 下滑到设备列表区时同屏可见 4–5 个 `● 在线`（`shots/earn-dark-s1.png`）。逐行状态点是列表惯例,不按违反计,仅记录。

### 原则 7 — Mobile-first rest affordance · **9/10**
> 原文:「可点元素 rest 态就要有可点感(surface bg / chevron / 44pt),🔵 禁 hover-only;tap 反馈用 `active:*`」

- ✅ 全链路 `active:opacity-90` / `active:scale-[0.97]` / `active:opacity-70`,无 hover-only。
- ✅ `me/wallet-action-btn.vue:10` 显式 `min-height: 44px`;设备槽位用 dashed `+` 框（`home/add-device-row.vue:8`）做 rest 态可点暗示。
- ⚠️ 唯一扣分:Nova 浮标固定层会压住滚到该位置的 CTA,见 §5-C。

### 原则 8 — 层级不用 box-shadow · **8/10**
> 原文:「靠 border + 微差 surface 做层级;glow 只小范围装饰转化触点」

- ✅ 实测五 tab 内容卡 **零 elevation 阴影**,层级全部由 surface 梯度承担;`[data-v5-lift]`（`tokens.css:347`）为 opt-in,五 tab 均未命中。
- ✅ 玻璃只有 2 处且都是 chrome:`nx-top-chrome`（`blur(24px)`）与 `nx-tabbar-pill`（`blur(40px)`）——完全符合「玻璃只给 chrome」。
- ❌ 扣分:glow 越界到 avatar,见 §4-G。

**综合 63/80。** 最弱 = 原则 5（卡不套卡），最强 = 原则 3（漏斗感知）。

---

## §2 模板疲劳 · 实际雷同对

> 判据（`nexion-design` / MEMORY 铁律）:「多转化入口禁同一套模板,3 类角色 3 套视觉身份」。

### 🔴 P0 — 雷同对 #1:`home/do-the-math-card.vue` ⟷ `earn/missed-income-banner.vue`

**这是本轮唯一的硬雷同,而且是双 tab 主转化卡撞车。**

| 结构位 | `home/do-the-math-card.vue` | `earn/missed-income-banner.vue` |
|---|---|---|
| 数据源 | `derivePromoUpgrade(app.visibleDevices)` | `derivePromoUpgrade(...)`（**同一函数**） |
| 点击去向 | `goStore()` → /store | `goStore()` → /store（**同一落点**） |
| 眉标 + 图标 | 标题行 | `↘` trending svg + 标签 |
| 大数字 | 18px 彩色分段标题 | 30px `−$27.08` |
| **双对比条** | base 条（`--v5-ink-4`, `baseWidthPct`）+ target 条（brand, 100%）:L26-42 | base 条（`phoneBarStyle`）+ ceiling 条（brand 45%, `w-full`）:L38-56 |
| 条上标签行 | 左设备名 / 右 `$X /d` | 左设备名 / 右 `$X/d`（**同排版**） |
| 底部 | 3 栏统计 + 满宽 pill CTA | 累计统计 + 右侧 pill CTA |
| 唯一差异 | `--v5-brand`（柠檬绿）· 收益框架「你能多赚」 | `--v5-brand-2`（橙）· 损失框架「你错过了」 |

**证据截图**:`shots/home-dark-s2.png`（算笔账）vs `shots/earn-dark-s1.png`（今天错过的）。并排看是同一张卡换了个色相。
**判定**:同数据 + 同落点 + 同结构,只靠色相区分两个 tab 的主转化入口 = 教科书级模板疲劳。

### ✅ 已通过差异化检查的转化入口（不构成雷同）

| 入口 | 视觉身份 | 判定 |
|---|---|---|
| `earn` 试用卡 `trial-*` | **票券形态**:上下缺口 + 虚线撕裂线 + 紫色 + 3D 翻转入场 | ✅ 独立身份 |
| `store` `vs-phone-hero` | 柱状插画 + 虚线上升箭头 + 橙紫 | ✅ 独立身份 |
| `store` `genesis-showcase-card` | **金色**克制线:皇冠 + 余量席位 + 哑光金 pill | ✅ 独立身份（且符合「高端稀缺 SKU 克制去吆喝」） |
| `team` `invite-earn-card` | 双栏:左奖励 + 右三渠道栈 + 网格纹理 | ✅ 独立身份 |
| `store` 商品卡 ×4 | 同模板 | ✅ **不算疲劳**——同一角色（商品列表项）本就该同构 |
| 全局代金券 banner（4 tab 出现） | 同一组件复用 | ✅ 不算疲劳——同一实例 |

---

## §3 土气测试 · 逐块结论

> 判据:「这张卡放到一个卖咖啡的页面还成立吗?」成立 = 只是通用高级皮,判违例。

| # | 视觉块 | 搬到咖啡页成立? | 判定 | 依据 |
|---|---|---|---|---|
| 1 | `home` 算力列队槽位条（手机/芯片/立方/机架图标 + dashed `+` 空槽） | ❌ 不成立 | ✅ **长在领域里** | 槽位 = DePIN 节点容量的物理隐喻,咖啡无对应物 |
| 2 | `store` 算力阶梯 5 档比例条 | ❌ 不成立 | ✅ 长在领域里 | 手机→份额→Box→Rack 的算力梯度是本领域独有 |
| 3 | `home` NexGrid 网格实时（模型名 + 机构 + 城市 + `30 GPU`） | ❌ 不成立 | ✅ 长在领域里 | GPU 计数 + 推理任务是算力语汇 |
| 4 | `home`/`earn` 行情看板（IMG/LLM/STT/EMB × `/image` `/500 tok` `/60s` 单价） | ❌ 不成立 | ✅ **最强的一块** | 按 token/图/秒计价 = AI 算力市场原生 |
| 5 | `store` 商品卡（真实机架/塔机渲染图） | ❌ 不成立 | ✅ 长在领域里 | 硬件实拍撑住 DePIN 质感（但见 §5-B 品牌泄漏） |
| 6 | `earn` 试用票券卡 | ⚠️ 部分成立 | ⚠️ **通用** | 票券形态是零售通用隐喻;靠"3 天预计收益 $21 / $7.00/d × 3"的算力口径拉回来 |
| 7 | `home` 今日收益 hero（网格纹理 + 径向辉光 + 漂移粒子） | ✅ **成立** | ❌ **违例** | 「大金额 + 网格底纹 + 光晕」是任意金融/SaaS 通用高级皮,无一处算力信号 |
| 8 | `team` 邀请卡（$400 + 划线 $200 + 海报/码/链接三栏） | ✅ **成立** | ❌ **违例** | 通用推荐返利模板,任何电商可直接复用;`💰/💎` emoji 更把它推向通用促销 |
| 9 | `me` 钱包卡（余额 + 3 圆钮 充值/提现/兑换） | ✅ **成立** | ❌ **违例** | iOS Wallet 通用范式（组件注释自陈 "iOS-Wallet 3-up action"）。底部「4 live · 1 slots open / 解锁 +$75/d」是这块唯一的算力锚点 |
| 10 | `me` 菜单四列图标栅格 | ✅ 成立 | ⚠️ 通用但**可接受** | 设置菜单本就该通用,不强求领域感 |
| 11 | `team` 2×2 功能瓦片（硬件配额/区域大使/影响力网络/族谱） | ⚠️ 部分成立 | ⚠️ 边缘 | 「硬件配额」有领域感,其余是通用 MLM 语汇 |

**结论:11 块中 3 块判违例（#7 home hero、#8 team 邀请卡、#9 me 钱包卡)。** 共同点:都是**每个 tab 的首屏视觉焦点**——即最该有领域身份的位置反而最通用。

---

## §4 反 AI 味速查 · 逐项核实

| # | 检查项 | 结论 | 证据 |
|---|---|---|---|
| A | **蓝紫渐变起手** | ✅ **PASS** | 实测五 tab 全部彩色文本:dark 只有 hue 252–265（**紫罗兰**,`rgb(142,114,255)`/`rgb(180,127,255)`）+ 柠檬绿 + 橙。**无 hue 200–240 蓝残留**。紫色是 01 §2 dark 气质原文明写的「紫色科技强调」。light 主色 hue≈220 电光蓝,同样是 01 §2 原文规定 |
| B | **玻璃满屏（只该给 chrome）** | ✅ **PASS（满分项）** | 全站 `backdrop-filter` 仅 2 个元素:`nx-top-chrome`（`saturate(1.8) blur(24px)`）+ `nx-tabbar-pill`（`blur(40px) saturate(1.8) brightness(1.05)`）。**内容卡零玻璃** |
| C | **Inter / Roboto 字体** | ✅ **PASS** | `tokens.css:149-154`:`General Sans → Manrope → -apple-system → … → Roboto`。**无 Inter**;Roboto 仅第 6 位系统兜底。Mono = JetBrains Mono。运行时确认 Manrope + JetBrains Mono 已加载（见 §6-F 一条环境备注） |
| D | **等大白卡阵** | ✅ **PASS** | 唯二的等距栅格:`home` 快捷行 4 格与 `team` 2×2 瓦片。二者均**非白卡**(dark surface / 各自色相 tint)、**非独立卡**(同一容器内靠分隔线切),且每格带差异化色相 + 状态副标。不构成"白卡阵" |
| E | **弹跳回弹动效** | ✅ **PASS**（含轻微保留） | 仅 1 处 overshoot:`tokens.css:655-660` ticket 入场 `rotateY(-92°→+8°→-2.5°→0°)`。是"券被签发"的翻牌隐喻、IntersectionObserver 触发、且 L670-676 有 reduced-motion 降级。非卡通弹跳 |
| F | **ALL CAPS 满屏** | ✅ **PASS** | 见原则 1:15 处全是 10.5–11.5px eyebrow 微标签,**零 ALL CAPS 标题** |
| G | **icon halo glow 滥用** | ❌ **FAIL** | 见下方 P1 |

### 🔴 P1 — G：Nova 头像 halo glow（5 个 tab 全中）

- **铁律原文**（`feedback_no_icon_halo_glow`）:「brand-tinted halo 只允许用在**主 conversion CTA pill**…不准堆在:**avatar** / icon container / chip / pill / status badge」,已踩案例含「StellaCard **avatar** 加 halo → 删」。
- **实测**:`uni-view.nx-nova-btn.nova-pulse`（48×48）计算样式 = `rgba(198,255,58,0.28) 0 0 24px` + `rgba(198,255,58,0.22) 0 0 0 7.17px` 双层光晕,**home / earn / store / team / me 五个 tab 全部命中**。
- **源**:`src/components/nova/nova-bubble.vue:22`,由 `app-chassis.vue:137` `<NovaBubble v-if="isTabRoute" />` 在全部 tab 路由挂载。
- **它是 avatar**:内容为 `/static/img/marketing/nova-avatar.png`,与已踩的 StellaCard avatar 同形。
- **反方观点（已考虑仍维持判定）**:Nova 是转化助手浮标,可辩称"转化触点"。但铁律的豁免口径写死为「主 conversion **CTA pill**（brand fill 大按钮 + 主转化动作）」,浮标不是页面主 CTA,且 avatar 是被点名禁止的第一类。
- 截图:任一 `shots/*-dark-s*.png` 右下角。

---

## §5 图表 / 图标 / 资产问题

### 🔴 P1 — A. 3 处违反「带 bg 卡片零 border」（原则 5 + 00-索引 铁律）

| # | file:line | 声明 |
|---|---|---|
| 1 | `src/components/home/my-fleet-section.vue:21` | `border: 1px solid var(--v5-border); background: var(--v5-surface)` |
| 2 | `src/pages/team/team.vue:377-379` | `background: "var(--v5-surface)", border: "1px solid var(--v5-border)"` |
| 3 | `src/components/store/tradein-window-banner.vue:92-95` | `border: 1px solid color-mix(in srgb, var(--v5-brand-2) 40%, transparent)` + 渐变 `background` |

实测计算样式佐证:home `rounded-2xl.overflow-hidden` 379×231 = `rgb(20,20,20)` + `1px rgba(255,255,255,0.06)`;team `nx-team-quick-panel` 379×301 同形。
**豁免**:`nx-tabbar-pill` 的 1px 描边属玻璃 chrome 的 rim,不计。

### 🔴 P1 — B. 商品渲染图仍带已退役品牌 "NEXION"

产品今日已由 Nexion 更名 NexGrid,但**主力商品渲染图上的品牌字仍是 NEXION**:

- `src/static/img/products/nexionbox-pro-v2.png` — 侧板巨型竖排 `NEXION` + 内部徽标 `NEXION`（我已直接 Read 该 PNG 确认）
- `src/static/img/products/nexionrack-p1-v2.png` — 机箱正面柠檬绿发光 `NEXION`（`shots/zoom-store-pro.png`,DPR3 裁切,清晰可读）

这是**唯一一处用户直接看得见的旧品牌残留**,且位于 store 的主转化位。文件名 `nexion*` 属工程内部标识（白名单),**图片像素里的品牌字不属于**。

**连带 2 条同资产观察**：
- **纵横比不一致**:`nexionbox-s1-v4.png` 是 1536×1024（3:2），`nexionbox-pro-v2.png` / `nexionrack-p1-v2.png` 是 1024×1024（1:1）→ 同一列表里三张卡的裁切比例不同。
- **产品层级视觉倒挂**:最便宜的 `NexGridBox S1`（$649，命名是"Box"）渲染成 4U 数据中心机架整机，比 $1,199 的 `NexGridBox Pro`（塔机）更像企业级设备。价格阶梯与视觉分量方向相反。

### 🔴 P1 — C. 同一屏内"正收益"用了两个不同 token（规范 09 §3）

规范 09 §3 色板表原文:**正收益 / 完成率 → `var(--v5-success)`**;**Pending / Cooling → `var(--v5-warning)`**。

| file:line | 语义 | 实际 token | 判定 |
|---|---|---|---|
| `src/components/home/live-feed-card.vue:58` | 正收益 `+$0.247` | `var(--v5-success)` | ✅ 合规 |
| `src/components/home/earnings-ledger-card.vue:24` | 正收益 `+$0.00032` | **`var(--v5-warning)`** | ❌ 违规 |
| `src/components/home/device-row.vue:23` | 正收益 `+$0.040` | **`var(--v5-warning)`** | ❌ 违规 |

**同一张 home 页、同一个语义、两种颜色**：`shots/home-dark-s0.png` 的动态流水是绿的、`shots/home-dark-s1.png` 的设备行和 `s2/s3` 的收益流水是琥珀色的。
额外后果:琥珀在别处代表 Pending/Cooling（`me` 的 `$0.00 审核中`），语义撞车——用户看到琥珀金额无法判断是"已赚到"还是"待结算"。

### 🔴 P1 — D. store 全页零不确定性表达（规范 09 §2）

规范 09 §2 原文:「预测 / 估算 / 模拟 / ROI / **设备收益** / 未来任务量等图表必须含 Estimated 标签 / Range band / Assumption 入口 / Last updated…**显真实感不打包票**」。

实测各 tab 页面文本中的不确定性词表命中：

| tab | 命中 | 页面上的预测型断言 |
|---|---|---|
| earn | `预计`、`更新` ✅ | 试用卡「3 天**预计**收益」、行情看板「● 2 分钟前更新」 |
| home | 仅 `est.` | 算笔账给出 `$75.00 每日` / **`回本 100 d`** / `2×`,**无 Estimated、无区间、无 Last updated**（"查看测算"勉强算 Assumption 入口） |
| **store** | **零命中** | hero「向上攀升至 **117×** 日收益」、商品卡「你将赚取 **$7.00/天**」×4、算力阶梯 5 档日产、置换「可抵 **$899.25**」——全部以**确定值**呈现 |
| team | 零命中 | — |
| me | 零命中 | 「解锁 **+$75/d** 更多」 |

**store 是漏斗终点也是缺口最大处**:所有购买决策数字都不带估算标注、不带区间、不带更新时间。这既违反 09 §2,也削弱"真平台仿真"（真平台不承诺确定收益）。

### 🟡 P2 — E. `home` 算力市场缺 Last updated,与 `earn` 行情看板不一致

规范 09 §1:「图表必须有**标题、图例、单位、Last updated**」。

- `earn/market-board.vue` ✅ 有「● 2 分钟前更新」（`shots/earn-dark-s1.png`）
- `home/market-board-card.vue` ❌ 无（`shots/home-dark-s3.png`）——标题/单位齐全,缺 Last updated

同一概念两个组件、两套完整度。价格表不带更新时间既违规也伤真实感。
（✅ 顺带确认合规:两块看板的涨跌都是 **颜色 + `↑`/`↓`/`→` 箭头 + 带符号数字**,满足 09 §1「不用红绿作为唯一差异」。）

### 🟡 P2 — F. emoji 混入线性图标体系

规范 10 §1 图标风格:24×24 画布 / 1.75–2px 描边 / round cap / token 上色。emoji 是彩色位图字形——无画布、无描边、无 token、跨平台渲染不一致。

**五 tab 主链路内确证 1 个文件 2 处**（已逐一核对挂载关系,排除未挂载组件）:
- `src/components/team/invite-earn-card.vue:21` — `💰 {{ t.team.earnForEachFriend }}`
- `src/components/team/invite-earn-card.vue:47` — `<text>💎</text>`

实测已确认渲染进 DOM（team 页文本提取含 `💰`/`💎`）。截图 `shots/team-dark-s0.png`。
> 排除项:`home/weekly-quest-list.vue:64`（🎉）只被 `pages/missions/missions.vue:110` 引用,不在五 tab;`home/vrank-card.vue:29`（🎁）**全工程无引用**;`store/genesis-showcase-card.vue:11` 的 🔒 在注释里不渲染;`me/topup-card-form.vue:139-147` 的国旗在国家选择器内,属合理用法。

### 🟢 P3 — G. 3 个图标描边超出规范上限

规范 10 §1:线宽 **1.75–2px**。实测 44 个 SVG 分布:`2`×38、`1.9`×2、`1.8`×1、**`2.4`×2**、**`2.2`×1**。
`2.4` 来自 `app-chassis.vue:125` 的 tabbar 激活态（`:stroke-width="tab.key === activeTab ? 2.4 : 2"`）——是刻意的激活强调,但超了规范区间上限。

### ✅ 图标体系整体合规（程序化审计结论）

| 指标 | 规范 10 §1 要求 | 实测 |
|---|---|---|
| 画布 | 24 × 24 | **44/44 = `0 0 24 24`** ✅ |
| 描边体系 | 线性 | **纯填充图标 0/44** ✅ |
| 硬编码 hex | 禁 | **0 处** ✅ |
| 线宽 | 1.75–2px | 41/44 合规,3 处超上限（见 P3） |

---

## §6 存疑 / 口味项（明确不进 P0/P1）

| # | 事项 | 为什么不定级 |
|---|---|---|
| A | `me` 充值圆钮 44px 的双层 glow（`wallet-action-btn.vue:40` `--v5-spotlight-brand`） | 铁律豁免口径是「主 conversion CTA **pill** + brand fill 大按钮 ≥36px」。它满足 brand fill 与 ≥36px,但形状是圆钮不是 pill、且属"icon container"。组件注释 L4-5 已显式援引本铁律主张豁免。**双向可辩,交主人裁决**,不算违规 |
| B | `home` hero 与 `earn` hero 用同一套"巨额 $ + 大整数 + 小数点后缩小"排版 | 模板疲劳铁律的射程是**转化卡**,不是统计 hero。同类数据同排版反而是一致性。仅记录 |
| C | 亮暗主题"上涨"色语义翻转:dark = 柠檬绿,light = 电光蓝（`shots/earn-dark-s1.png` vs `earn-light-s1.png`） | 01 §2 原文允许「两主题…仅色板不同」,09 §3 亦把趋势归 `--v5-brand`。规范上合法。但"绿=涨"是金融普适直觉,light 下变蓝值得主人过目 |
| D | `tech-money-card` 漂移粒子 / `nova-card-slot` 色团 = 纯装饰,似违原则 4 | 原则 4 自身把「aurora 漂移」列为**正例**,漂移粒子可读作"网络活动"氛围。边界模糊 |
| E | store hero 的柱状插画无坐标轴/图例/单位 | 是**装饰插画**不是数据图表,09 §1 射程存疑。但它承载了"117×"这个具体断言,形式上像图表 |
| F | 环境备注:运行时 `document.fonts` 只注册了 Manrope + JetBrains Mono,**General Sans 未注册 FontFace**（请求走 `api.fontshare.com`） | 本机可能无代理,属**环境依赖**而非产品缺陷。不当缺陷记,但生产需确认 Fontshare 可达,否则字体降级到 Manrope |
| G | `home/vrank-card.vue` 全工程零引用（疑似死代码） | 不在本镜头射程,仅顺手记录 |
| H | `me` 的 `NEX balance` / `4 live · 1 slots open`、`team` 的 `Sarah K. just joined your network` 在中文 locale 下仍是英文；`store` 的 `Maya · ID购买了NexGridBox S1` 缺中英间空格 | i18n / 文案镜头,交 tester-copy |
| I | `tokens.css:679-681` `v5-hb-pulse` 用硬编码 `rgba(12,196,214,…)` 而非 token | 色彩镜头（auditor-color）射程,不重复定级 |
| J | eyebrow 标签 10.5–11.5px < 铁律「字号最小 12px（10/11 仅角标）」 | 字体镜头（auditor-type）射程,不重复定级 |

---

## §7 信息层级 · 五 tab 首屏视觉焦点实测

> 方法:折叠区（top < 780px）内按 `font-size` 排序取最大文本元素,dark 主题实测。

| tab | 首屏最大元素 | 焦点是否 = 本页最重要信息 |
|---|---|---|
| **home** | `.50` **32px** @213（今日收益 $295.50） | ⚠️ **基本正确但被稀释**——`+500` / `+1,200` NEX（**30px 紫色**@348/361）几乎等重。两个 30px+ 的任务奖励数字与唯一的 32px 收益数字争夺焦点 |
| **earn** | `21` **36px** @106（试用促销"3 天预计收益 $21"） | ❌ **错位**。本页主体「算力收益 · 今天 $247.83」是 **32px @443**——**更小、更靠下**。促销 banner 压过页面自身数据 |
| **store** | `117×` **26px** @175（hero 倍数断言） | ✅ 正确。store = 卖设备,升级倍数就是第一诉求 |
| **team** | `400` **30px** @131（每邀请奖励 $400） | ✅ 正确。team = 拉新,邀请奖励就是第一诉求 |
| **me** | `.56` / `1,240` **32px** @326/435（钱包余额 / NEX 余额） | ✅ 正确。me = 资产,余额居首 |

**结论:3/5 正确,home 稀释,earn 错位。** earn 是唯一需要改动的一项(§2 §7 双指)。

---

## §8 最该先修 3 条

| 优先级 | 事项 | 位置 |
|---|---|---|
| **1** | 商品渲染图上的已退役品牌 **NEXION** —— 唯一用户可见的旧品牌残留,且在 store 主转化位 | `src/static/img/products/nexionbox-pro-v2.png`、`nexionrack-p1-v2.png` |
| **2** | 模板疲劳硬撞车 —— home 算笔账 / earn 今天错过的,同数据源 + 同落点 + 同双条结构,只换色相 | `components/home/do-the-math-card.vue` ⟷ `components/earn/missed-income-banner.vue` |
| **3** | 正收益色 token 分裂 —— 同一屏 `--v5-success` 与 `--v5-warning` 混用,且与 Pending 语义撞车 | `home/earnings-ledger-card.vue:24`、`home/device-row.vue:23`（对照 `live-feed-card.vue:58`） |

---

## §9 截图索引

根目录:`C:\Users\jason\AppData\Local\Temp\claude\D--WORKS-PLAN\27efd79e-c876-472f-bf4f-81f4726b6b26\scratchpad\shots\`

| 类型 | 命名 | 说明 |
|---|---|---|
| 首屏 | `{tab}-{theme}-fold.png` | 414×896 折叠区（10 张）—— §7 信息层级判据 |
| 整页 | `{tab}-{theme}-full.png` | 视口撑到 scrollHeight 的整页（10 张,`leftover=0` 无裁切） |
| 分段 | `{tab}-{theme}-s{N}.png` | 414×896 逐屏切片,可读细节（34 张）—— 主要视觉判据 |
| 特写 | `zoom-store-pro.png` | DPR3 裁切,NEXION 品牌泄漏证据 |

`{tab}` ∈ {home, earn, store, team, me}；`{theme}` ∈ {dark, light}。
分段数:home 4 / earn 3 / store 5 / team 2 / me 3（每主题）。共 **55 张**。

**关键引用**

| 结论 | 截图 |
|---|---|
| 模板疲劳对 | `home-dark-s2.png` ⟷ `earn-dark-s1.png` |
| NEXION 品牌泄漏 | `zoom-store-pro.png`、`store-dark-s1.png`、`store-light-s1.png` |
| 正收益双色 | `home-dark-s0.png`（绿）vs `home-dark-s1.png` / `s3.png`（琥珀） |
| Nova avatar glow | 全部 `*-dark-s*.png` 右下角 |
| Last updated 不一致 | `earn-dark-s1.png`（有）vs `home-dark-s3.png`（无） |
| store 零不确定性 | `store-dark-s0.png`、`store-dark-s1.png` |
| earn 焦点错位 | `earn-dark-fold.png` |
| 玻璃只给 chrome（PASS） | 任一 `*-fold.png` 顶栏 + 底 tabbar |

---

**取证环境**:dev server `http://localhost:5173`（未重启,curl 探活 localhost/[::1] 均 200)。全程未修改任何工程文件。Chromium 与临时脚本已清理。
