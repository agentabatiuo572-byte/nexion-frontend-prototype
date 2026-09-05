# 页面骨架注册表（PAGE-SKELETONS）

> vibe-playbook P2-G（2026-07-22 主人批）。**增页第一步：先到本表选骨架，不从空白猜**——同名≠同构、「两种 header 路径」类坑的出生免疫。
> 判定顺序：是 5 tab 主页？→ ① · 从 tab 进入的二级页？→ ② · 登录/注册/引导等无 App 界面的全屏流程？→ ③ · 特殊全屏演出页？→ ④。
> 出处：壳组件 `src/components/`（app-chassis / sub-page-header / device/standalone-page-shell / device/device-status-bar）；坑账 memory `feedback_decard_two_header_paths`、`feedback_bare_page_device_statusbar`。

## ① chassis-nav Tab 页（5 个）

| 项 | 内容 |
|---|---|
| 适用 | 5 个 tab 主页：index / earn / store / team / me（自绘 chassis-nav，**pages.json 无原生 tabBar**） |
| 必备件 | `AppChassis` 壳（路由感知 header + tabbar pill + nova 浮标 + 下拉刷新 + 进场动画）；页面内容区**每页单独加 24px 顶距**（全局 24px 只盖 SubPageHeader 页，chassis 页不吃） |
| 已知坑 | 顶距漏加 → 内容顶死 header（两种 header 路径坑的 chassis 侧）；tab 页再点当前 tab 应滚回顶部 |
| 禁用边界 | 二级页/流程页禁套此骨架（tabbar 会残留）；chassis 是全站 chrome，禁在页面内自绘第二个 tabbar/header |

## ② SubPageHeader 二级页（≈70 个，默认骨架）

| 项 | 内容 |
|---|---|
| 适用 | 从 tab 进入的一切二级页：钱包/提现/设备详情/设置/KYC/How-it-works… **新增页面默认选这条** |
| 必备件 | `SubPageHeader`（back + title + 可选右操作）；nav→内容 **24px 呼吸由 SubPageHeader 单源提供**（verify 哨兵 `SubPageHeader nav→content 24px gap` 守着，页面**勿再手加**会双倍）；底部有 sticky CTA 时 `padding-bottom: calc(env(safe-area-inset-bottom) + 38px)` |
| 已知坑 | 在此骨架手加 24px = 双顶距;back 无历史时应回对应 tab（`navTo` 语义） |
| 禁用边界 | 不承载 tabbar；金融确认不是页面而是 `SecurityConfirmSheet`（组件层，见《05》§10.3） |

## ③ StandalonePageShell 独立全屏页（10 个）

| 项 | 内容 |
|---|---|
| 适用 | 登录 / 注册 / onboarding / 引导等**不套 App chrome** 的全屏流程页 |
| 必备件 | `StandalonePageShell` 壳——统一提供顶部状态栏、底部 Home Indicator、`env(safe-area-inset-bottom)+38px` 安全区；**禁各页自行猜系统留白**（CLAUDE.md 铁律） |
| 已知坑 | 预览壳 iframe 里 `env(safe-area-inset-top)=0`，自算状态栏必翻车——所以必须用壳 |
| 禁用边界 | 已登录的业务页禁用（应走 ①②）；不加 SubPageHeader（壳自带布局语义） |

## ④ 裸全屏演出页（特例，现存 1 个）

| 项 | 内容 |
|---|---|
| 适用 | 不能套任何壳的特殊全屏演出（campaign/特效页） |
| 必备件 | 手挂 `<DeviceStatusBar />` + 底部 38px 安全区；**禁 `env(safe-area-inset-top)` 当状态栏高**（iframe 里=0） |
| 已知坑 | 验证走 `?nx_device_inner=1`（memory `feedback_bare_page_device_statusbar`） |
| 禁用边界 | 非演出必要不开此特例——先问 ③ 能不能装下 |

## 增页 checklist（骨架之外的出生件）

- [ ] `pages.json` 注册 + `src/lib/route.ts` 逻辑路径映射（导航一律 `navTo()`）
- [ ] i18n en/zh 镜像 key 同序加
- [ ] 跨仓采样证据：admin `docs/audit/l1-shards.json` 对应 UNI-FR-* shard 补 sampleRoute（verify 跨仓门会拦）
- [ ] dom-qa：新页自动被 `--sweep all` 覆盖；核心页想进默认门 → dom-qa.mjs core 清单加一行
- [ ] 4 态齐（默认/空/加载/报错，规格见 nexion-spec ⑤；加载按四档）

## 附：易混浮层选型速查（组件层，详见《05》§10-11）

| 要做的事 | 用 | 别用 |
|---|---|---|
| 短确认/轻表单/筛选 | `BottomSheet` | 长规则、FAQ>5 条（改独立页） |
| 短规则解释（3-5 bullet） | `RuleSheet` | 塞完整风险披露 |
| 钱/不可逆/高风险确认 | `SecurityConfirmSheet`（字段表固定） | 普通 BottomSheet 平替 |
| 破坏性二次确认 | `ConfirmDialog` / `DestructiveConfirmDialog` | 浏览器原生 confirm |
| 轻提示（无需处理） | `Toast`（同屏 ≤1） | 用 Toast 报重要错误（必须页面级错误态） |
| 需用户处理的轻反馈（Undo/Retry） | `Snackbar` | 遮 TabBar |
| 区域空数据 | `Card/EmptyState`（插画+引导+CTA） | 白屏/裸转圈 |
| 整页断网/接口挂 | `NetErrorOverlay` | 表单校验错也整页盖（应 inline error） |
