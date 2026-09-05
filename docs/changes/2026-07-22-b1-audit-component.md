# B1 审计 · 组件规范 + 缺省页/交互完整性(五 tab 主链路)

> **本页判定目标 = 五 tab 主链路的「组件状态完整性 + 缺省页覆盖 + 触控/反馈达标」**
> 来源:**UI 规范 05 明写**(§1.3 组件必须有状态 / §3.1 触控目标表 / §5.3 TabBar / §6.1 Button 状态矩阵 / §6.2 Primary / §6.7 IconButton / §6.8 QuickActionCircle / §7.1 Card 状态矩阵 / §7.10 EmptyState / §11.3 Skeleton / §11.5 加载四档)+ **UI 规范 06 明写**(7 种缺省状态 + 禁白屏/空容器/通用转圈)。
> 唯一**推断**项:第 8 条「转化场景 cancel 权重」——05 §6.3 只把 Cancel 归到 Secondary,未明写「转化场景必须更弱」,该判据来自审计任务书,本报告按推断标注。

审计对象:`src/pages/{index/index,earn/earn,store/store,team/team,me/me}.vue` + `src/components/{home,earn,store,team,me}/*.vue`(97 个)+ `src/components/app-chassis.vue`。
审计日期:2026-07-22 · dev server `http://localhost:5173`(未重启,localhost 与 `[::1]` 均 200)。

---

## 0. 取证方法与可信度(先声明,便于复核)

| 手段 | 做法 | 覆盖量 |
|---|---|---|
| 可点元素枚举 | CDP `DOMDebugger.getEventListeners` 逐元素取真实 click/tap 监听(不靠 grep 猜) | 5 tab 共 **178** 个真实可点元素 |
| 真点击 | Playwright 真鼠标点击,每次点击前**强制整页重载 + 清弹层**,比对 route / DOM hash / toast / 固定浮层 / scrollTop | **153** 次点击 |
| 尺寸实测 | `getBoundingClientRect` + `getComputedStyle`,含 parent 高度(区分「小标签在大热区里」) | 全部可点元素 |
| pressed 态判定 | 解析全部 47 张样式表的 `:active` 规则(1086+ 条)+ 元素 `active:` class 双通道 | 53 条 `:active` 选择器 |
| 缺省态 | 注入 uni storage(`{type:"object",data:X}` 包装,键 `nexgrid-account-cloud-v1`)把 5 台设备 `activatedAt` 置 null,重载实测 | home / earn 零设备实景 |

**过程中自查出并修掉的 3 个工具错误**(否则会写出错误结论,记录以备复核):
1. 样式表遍历在 Chrome 嵌套 CSS 下,`CSSStyleRule.cssRules` 非空判断把每条规则都当容器递归 → 首轮误报「全站 0 条 `:active`」。修正后 53 条。
2. `page.goto` 只改 hash 属同文档导航,**不重载**;首轮「无响应」多为定位到上一页残留 DOM。加随机 query 强制跨文档重载后,原 24 条「疑似死控件」有 21 条转为正常响应。
3. Playwright 默认 click 会等元素「稳定」,home 的实时数字/入场动画使其永不稳定 → 误判 CLICK_BLOCKED。改 `force: true` 后全部响应。

**结论前置:153 次真点击中,0 个控件点了完全没反应。**「死控件」一节只剩 1 条(且是源码显式 early-return),不是「点了没反应」类。

运行期 console error = **0**。

---

## 1. 死控件清单

### P1-1 🔴 当前 tab 再次点击 = 显式空操作,规范明写要求回顶
- **规范**:05 §5.3「当前 Tab 再次点击可滚动回顶部」。
- **源码**:`src/components/app-chassis.vue:474`
  ```ts
  function go(tab: { key: string; route: string }) {
    if (tab.key === activeTab.value) return;   // ← 同 tab 直接 return,无回顶
    uni.reLaunch({ url: tab.route, fail: () => {} });
  }
  ```
- **实测证据**:先把 `.nx-scroll` 滚到 900px,再点当前 tab —— earn / team / me 三处 `scrollTop 900 → 900`(零位移),store 900→900,home 同代码路径。
- **影响**:长页面(store 滚动高 3470px、home 2918px)用户回顶只能手动滑,是 iOS 用户的肌肉记忆动作。

**除此之外无死控件。** 以下曾被列为候选、经复核**证伪**(记录以防后续重复误报):
| 曾疑 | 实测结论 |
|---|---|
| 团队「邀请码 / 链接」复制按钮无反馈 | 有 inline 反馈:label 切「已复制」+ 勾选 icon,1.5s 复位(`invite-earn-card.vue:181/192`)。合格 |
| 商城「解锁后购买」是死的 | 点击 → `#/pages/team/quota`(解锁条件页),路径合理 |
| `.ms-card` / `.vcs-panel` 有 `@click` 无 handler | `@click.stop` 阻断冒泡的标准写法,非死控件 |
| home 行情行 / earn 设备卡头/阶梯行 | 分别导航到 earn / 设备详情 / 商品详情,均有响应 |

---

## 2. 四态缺失清单

### 2.1 P1 🔴 缺省页规范在代码里 0% 落地
- 06 规范的 7 张插画 asset **在 `UI/缺省页/assets/{dark,light}/` 全部存在**(`empty-list` / `no-owned-asset` / `no-search-results` / `no-filter-results` / `locked-or-no-permission` / `network-offline` / `recoverable-error`)。
- 在 `Nexion-uniapp/src/` 内 grep 这 7 个名字:**0 处引用**。
- 后果:五 tab 内**没有任何一处**符合 06 §1「插画 + 标题 + 说明 + 可选 CTA」的 composed 缺省态。

### 2.2 P1 🔴 home「我的算力列队」零设备 = 空容器(规范 06 §3 明令禁止)
- **文件**:`src/components/home/my-fleet-section.vue:21-23`
- 设备列表容器写死 `border + background: var(--v5-surface)`,内部只有 `v-for`,**无 `v-else` 空态分支**。
- **实景实测**(注入 storage 令 5 台设备 `activatedAt=null`,重载 home):该容器渲染为 **高 2px、0 子节点的空描边条**;标题仍显示「我的算力列队 0/6」。
- 这正是 06 规范列的转化型状态 `no-owned-asset`——本该是「你还没有设备 / 插上设备就能开始赚 / **去看看设备**」的漏斗入口,现在是一条 2px 的线。
- 对照组:**earn 页同样零设备时表现合格**(`earn/empty-slots-hint.vue`:6 个虚线空槽 + 满宽「添加设备 →」pill CTA),说明团队有能力做,只是 home 漏了。

### 2.3 P2 现存 2 处空态是「裸一行字」,不满足 05 §7.10
| 组件 | 现状 | 规范要求 |
|---|---|---|
| `team/team-roster-section.vue:24` | `sortedMembers.length===0` → 只有一行居中小字 | 插画 96–140px + 标题 + 说明 + **必须给下一步动作** |
| `earn/task-center.vue:69` | `allRecent.length===0` → 只有一行 11.5px 灰字 | 同上;05 §7.10「不只显示 No data」 |

两处都没有 CTA,用户在空态里没有出口。

### 2.4 Error 态:五 tab 内无 inline 错误位
- 全局有 `global-ui.vue`(toast / confirm / netError),属页面级;但五 tab 主链路里**没有任何列表/区块级的 inline 错误 + 重试**。
- 严重度按 **P3** 记:该原型无真实网络请求,错误分支当前不可达(见第 5 节 存疑-1)。

### 2.5 Loading 态:判定为**不适用**,不计违例
五 tab 数据全部来自 Pinia 同步 state,无任何异步取数(`grep loading|pending` 命中的 5 个文件全是业务义「待审核提现」,非 UI loading)。按 05 §11.5 的四档规则,`<300ms` 本就**不该展示任何加载反馈**。此处若强求 skeleton 属教条,已归入第 5 节。

---

## 3. tap target < 44 实测表

判定口径:**元素自身高度 < 44 且其父级热区也 < 44**(排除「小 label 套在 44 高按钮里」的假阳性)。同形只列一次。

| # | 位置 | 元素 | 实测 | 规范要求(05 §3.1) | 级别 |
|---|---|---|---|---|---|
| 1 | 5 个 tab 全有 | `.nx-icon-btn`(顶栏搜索) | **38 × 38** | 视觉 44×44 / 热区 48×48 | P1 |
| 2 | 5 个 tab 全有 | `.nx-icon-btn.nx-bell`(顶栏铃铛) | **38 × 38** | 同上 | P1 |
| 3 | home | `管理 →`(我的算力列队) | 43 × **17** | Text Link 高度 ≥ 44 | P1 |
| 4 | home | `查看全部 →` | 71 × **17** | 同上 | P1 |
| 5 | home | `地图 →` / `打开 →` | 43 × **17** | 同上 | P1 |
| 6 | store | `去换购 →`(product-card:99) | 48.8 × **17** | 同上 | P1 |
| 7 | me | `账单` | 40.1 × **18** | 同上 | P1 |
| 8 | me | `33 条本月` | 71.2 × **15** | 同上 | P1 |
| 9 | home | 分段 chip `动态 / 收益` | 45.9 × **28** | — | P2 |
| 10 | earn | 分段 chip `今天/本周/本月/全部` | 86.1 × **32** | — | P2 |
| 11 | earn | `查看全部` | 77 × **27** | Text Link ≥ 44 | P2 |
| 12 | home 代金券弹层 | `.vcs-close` | **36 × 36** | Close Button 40×40 / 热区 48×48 | P2 |
| 13 | home 代金券弹层 | `.vcs-cta-claim`「立即领取」主 CTA | 82 × **34** | Primary 高 52px | P1(见 §4.4) |

**通过项**:tab item 71.2 × 56(要求 ≥48×48)✅;nova 浮标 48 × 48 ✅;商城「立即购买」pill 宽 115.7 高 44(仅低于 Primary 52 的建议值,热区达标)。
**已排除的假阳性**:`.nx-toast`(41px)是提示条不是控件;`立即购买 / 解锁后购买` 的内层 `<text>`(18px)是 44 高 pill 的子节点,同一动作。

---

## 4. 其它违例

### 4.1 P1 🔴 pressed 反馈缺失面积过大:126 个去重可点元素中 **55 个(44%)零 pressed 态**
规范:05 §1.3「移动端可不设 hover,但必须保留 focus-visible 与 pressed」;§6.1 状态矩阵 pressed = scale 0.96;§7.1「卡片可点击时必须有 pressed 态」;§6.8「点击后必须有 pressed 反馈」。
判定:元素既无 `active:*` class,也不被任何 `:active` CSS 规则命中。按危害排序的代表:

| 位置 | 元素 | 尺寸 | 规范条款 |
|---|---|---|---|
| **store** | **`立即购买` 主 CTA(4 张商品卡)** | 115.7×44 | §6.2 Primary `active:opacity-85` |
| **store** | **整张商品卡可点(4 张)** | 356.8×443.7 / 498.1 / 402.3 | §7.1「卡片可点击时必须有 pressed 态」 |
| store | `解锁后购买` pill + gate box | 128.2×44 / 324.8×44 | §6.1 |
| store | 「升级置换」换购卡整卡可点 | 356.8×175.2 | §7.1 |
| chassis(5 tab) | 5 个 `.nx-tab` | 71.2×56 | §6.1 |
| chassis(5 tab) | `.nx-icon-btn` 搜索 + 铃铛 | 38×38 | §6.7 |
| chassis(5 tab) | `.nx-nova-bubble` 浮标 | 48×48 | §6.1 |
| home | 4 个 quick action 磁贴(质押/创世/任务/签到) | 83×79.2 | §6.8 明写「点击后必须有 pressed 反馈」 |
| home | 代金券横幅 `.vb-wrap` | 390×72 | §7.1 |
| home | `查看 6 个任务` 折叠按钮 | 324.8×44 | §6.1 |
| home | 6 行行情条 | 356.8×59.1 | §7.1 |
| earn | 5 个设备卡头(可展开) | 356.8×65 | §7.1 |
| earn | 5 行设备阶梯行 | 356.8×56.8 | §7.1 |
| earn | 「今天错过的」转化卡整卡可点 | 356.8×204.4 | §7.1 |
| store | 2 行「即将上架」 | 268.8×53.8 | §7.1 |

同工程里 `active:opacity-*` / `active:scale-*` 用得很熟(71 个元素有),说明是**覆盖不全**而非不会写——最刺眼的是**转化主路径**(商品卡 + 立即购买)恰好在缺失侧。

### 4.2 P2 按钮圆角非 pill(05 §6 全系 🔵 999,无例外)
| 位置 | 元素 | 实测 radius |
|---|---|---|
| home | `.newcomer-task__toggle`「查看 6 个任务」(44 高、有实底 bg,形态即按钮) | **12px** |
| store | `解锁后购买` gate box(`role="button"` 显式声明,44 高) | **10px** |
| team | `海报 二维码 + 图` 按钮 | **8.32px** |
| earn | `AI 任务池升级中` 条(33 高,可点) | 12.48px |
| home / earn | 分段 chip(`动态/收益`、`今天/本周/…`) | 6px / 9px |

前三条形态上就是按钮,建议按 999 收敛;后两条(chip / 状态条)是否算「按钮」有争议 → 见第 5 节。

### 4.3 P2 顶栏 IconButton 违反 §6.7 三条
`.nx-icon-btn` 在 `app-chassis.vue:656` 写死 `width:38px; height:38px`,无 padding 外扩:
- 尺寸 38×38 < 视觉 44×44 / 热区 48×48;
- 无 `aria-label`(§6.7「必须提供 aria-label」);
- 无 focus outline / pressed(§3.2 + §6.1)。

### 4.4 P1 🔴【推断判据】代金券弹层的 cancel 权重**倒挂**(转化场景)
`src/components/voucher-claim-sheet.vue` 实测:

| 元素 | 尺寸 | 样式 |
|---|---|---|
| 主 CTA `立即领取` | **82 × 34** | `align-self: flex-start`、`min-height:34px`、brand 实底、pill |
| cancel `暂不领取` | **358 × 40** | `width:100%`、`height:40px`、无 bg、`ink-3`、12.5px |

颜色权重方向是对的(cancel 无底、ink-3、font 400),但**面积权重完全反了**:cancel 面积是主 CTA 的 **5.1 倍**(14320 vs 2788 px²),且更高。这是「开通/领取」的转化场景,主 CTA 还只有 34px 高(低于 Primary 52 / 最小热区 44)。
标注:该条判据为**推断**(见抬头),但「主 CTA 34px 高」本身是 05 §6.2 明写违例,与推断无关。

### 4.5 通过项(实测确认,列出以证覆盖)
- ✅ **底部 tab 当前位置指示**:active tab icon + label 走 `var(--v5-brand)`,并叠品牌软底胶囊(`activeTabStyle`),截图确认 home/earn 高亮正确,不只靠颜色。
- ✅ **主 CTA 是块级可点区不是文字链接**:store `立即购买`、earn `添加设备 →`、代金券 `领取 →` 均为 pill 块。
- ✅ **复制类操作有 inline 反馈**(团队邀请码/链接)。
- ✅ **禁 hover-only**:全工程 0 处用 hover 表达移动端可点,反馈一律走 `active:`。
- ✅ **运行期 0 console error**。

---

## 5. 教条 / 存疑 —— 我判断**不该**直接当 bug 修的

1. **「Loading 四态缺失」不成立**。五 tab 无异步取数,05 §11.5 明写 `<300ms` 不展示任何加载反馈。现在补 skeleton 是给不存在的等待造视觉噪音。真正该补的时机是接真后台那一刻,建议记进接后台 checklist 而非本轮。
2. **「Error 态缺失」暂缓**。同上,无请求即无失败分支;强行加 inline error 会写出永不触发的死代码。已按 P3 记账。
3. **静态常量列表不需要空态**。34 个含 `v-for` 的文件里,`ROWS / CHIPS / GRID_CLIENTS / DATA_DOTS / tabs / iconPaths / tiers / options` 等是写死常量,长度恒 >0,加空态是纯教条。真正需要空态的只有用户数据驱动的 3 处(fleet / roster / task history),已在第 2 节列出。
4. **chip / 状态条的圆角是否必须 999,存疑**。05 §6 的 pill 铁律针对 Button 组件;分段控件(`动态/收益`、`今天/本周/本月/全部`)与状态条(`AI 任务池升级中`)在 05 里没有对应组件条目,03 圆角规范才是它们的归口。建议由设计定性后统一,不建议本轮按「按钮」处理。
5. **「rest 态可点线索」我不出具全量清单**。我的自动检测(元素自身无 bg + 无 border)在 me 页命中 20+ 个磁贴,但它们的父卡片有 surface、自身有图标,是有线索的——检测器只看自身计算样式会大量假阳性。规范原文禁的是「hover-only」,该项工程已 100% 通过(见 4.5)。若要判「线索是否够强」,需要人眼定性,不该由本次机器口径出结论。
6. **自动弹层在每次进入 tab 时抢占交互,存疑不计违例**。实测每次重载 home/earn/store 都会弹里程碑庆祝(`ms-overlay`)+ 代金券 sheet,一度让自动化点不中任何元素。但这是「每次重载都推进累计收益」的原型特性,真实会话里同一里程碑只弹一次。是否节流请另开口径判断,本轮不计。
7. **`nx-toast` 被算成可点元素**属工具口径噪音,不是控件,已从所有清单剔除。
8. **store `立即购买` 高 44 而非 §6.2 的 52**:热区达标、视觉自洽,我倾向归 P3 建议而非违例——但它确实低于规范明写值,列此备主人裁。

---

## 6. 汇总

| 级别 | 条数 | 明细 |
|---|---:|---|
| P1 | **6** | 1-1 tab 回顶空操作 · 2.1 缺省页 0 落地 · 2.2 home 零设备空容器 · 3.x 顶栏 38px + 6 类文字链 17px · 4.1 主 CTA/商品卡零 pressed · 4.4 代金券 cancel 权重倒挂 |
| P2 | **4** | 2.3 两处裸文字空态 · 3.9-3.12 chip/close 热区 · 4.2 按钮圆角非 pill · 4.3 IconButton 无 aria-label/focus |
| P3 | **2** | 2.4 无 inline error 位(不可达) · 5.8 Primary 高 44 vs 52 |
| 存疑/教条(不建议本轮动) | **8** | 见第 5 节 |

### 最该先修的 3 条

1. **4.1 转化主路径补 pressed 态** —— store 4 张商品卡 + 4 个「立即购买」+ 5 个 tab + 顶栏 2 个 icon。工程里 `active:opacity-*` 已是熟练写法,是覆盖遗漏不是能力问题;点了没有任何按下反馈的「立即购买」直接削弱最关键一步的可信度。
2. **2.2 home 零设备空容器** —— 一个 2px 高的空描边条,是「半成品感」最直接的证据,而且它占的正是 06 规范点名的转化漏斗位(`no-owned-asset` → 去看看设备)。earn 页已有现成的合格实现(`empty-slots-hint.vue`)可直接对齐。
3. **3.1/3.2 顶栏 38×38 + 6 处 17px 文字链** —— 全站每一页都在的两个 icon 低于热区底线,加上 `管理 → / 查看全部 → / 去换购 →` 这类 17px 高的链,是最高频的误触来源;`.nx-icon-btn` 只需改一处 CSS(38→44 + 热区外扩)即可全站生效。
