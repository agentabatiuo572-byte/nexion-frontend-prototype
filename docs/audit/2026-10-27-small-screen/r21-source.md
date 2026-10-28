**R19 Intro 小屏增量：独立源码复审（Averroes，2026-10-28）**

APP [APP工作区](../../..)，HEAD `ddcea906d62e8242815e5af104ac1574bfa486a2`。仅审 `src/pages/onboarding/intro.vue` 当前CSS差异及必要依赖/已有测试契约；未编辑产品、运行测试、构建或操作浏览器。

**当前源码评分 8.8/10，暂未达到9分：存在1项具体触区缺口。** 父线程报告320×693、320×568越文浅色实景scrollHeight等于viewport；本人未独立操作该实景，不能据此补签英文短链接或其他运行边界。

**R19-INTRO-P2-01：英文 Terms 链接未保证44px横向触区。**

[intro.vue:564](../../../src/pages/onboarding/intro.vue#L564) 的 `.terms-link` 改为inline-flex并设置 `min-height:44px`，但没有min-width或水平padding；它作为居中flex行的独立项，仍按文字内容定宽。当前 [英文词条:274](../../../src/i18n/messages/en.ts#L274) 是短词 `Terms`，小屏继承11px字，在该布局下横向命中不足本轮要求的44px。已读共享CSS，没有适用于此链接的通用44px最小宽度。此项是本轮44×44要求尚未落实，不声称是新CSS首次引入的旧代码缺陷，也不伪造浏览器像素测量。

最小建议：仅在 `.terms-link` 增加 `min-width:44px; justify-content:center`，保留现有min-height、flex-wrap、词条、role/link及路由。无需更改数据口径或展开其他页面；修复后可对该差异复核，实景关闭交父线程确认。

其他检查结果如下：

| 项目 | 源码结论 |
| --- | --- |
| 差异归属 | 工作树intro的完整template和script与HEAD逐段比较相同；本次只有style变化，没有删内容或改业务条件。 |
| 两个目标高度 | [intro.vue:575](../../../src/pages/onboarding/intro.vue#L575) 使用≤374宽 **或** ≤740高的媒体条件；320×693的orb源码尺寸为163px，320×568为104px，下限防止继续缩至负值。≤620高进一步减少标题/间距。该计算解释缩排意图，不是内容全部可见的实景证明。更宽但短的视窗也会进入此紧凑规则，非仅320。 |
| 内容与滚动 | content补border-box；没有新增固定内容总高、line-clamp或纵向overflow:hidden。原root仍overflow-y:auto，legal仍flex-wrap，HomeDisplayStats有max-width/box-sizing与原flex-wrap；大字设置可以自然增高滚动。 |
| 品牌 / 动效 / 主题 | [intro.vue:100](../../../src/pages/onboarding/intro.vue#L100) BrandLockup仍60；仅orb容器等比例缩小，logo居中独立定位。SVG轨道、motionAllowed、静态降级及reduce规则未改；背景、文字、轨道继续用原主题token。没有新增动画或移除减少动态门控。 |
| safe area | [StandalonePageShell](../../../src/components/device/standalone-page-shell.vue) 仍提供状态栏与 `env(safe-area-inset-bottom)+38px` 底部留白。intro未覆盖该padding；语言sheet原safe38亦保留在intro第336行。 |
| CTA / 链接 | 小屏两个主CTA仍整行44px高且flex-shrink:0；语言入口原44px最小高保留。法律说明独占一行，两个链接可换行，点击/Enter、role/link与tabindex不变。注册/登录、terms及带return参数的privacy目标完整保留在第223—233行。唯一待修是上述短链接的横向44px下限。 |
| 当前统计组件 | intro仍引用HomeDisplayStats；组件请求 `/api/config/home-display`、`authenticated:false`，由原player管理未知值与显示更新；onShow/onHide激活门不变。本次deep CSS只压缩其字号/间距，没有改数据源、空值或生命周期。 |

**既有测试失败边界，保留原始红记录**

已读 app-tests-r19-intro.log（`app-tests-r19-intro.log`，仓外日志未归档）：3文件5项，privacy 1项和motion 3项通过，public-stats 1项失败，即 **4pass/1fail**，不能写全绿。

[intro-public-stats-authority.contract.test.ts:8](../../../src/pages/onboarding/intro-public-stats-authority.contract.test.ts#L8) 仍硬匹配 `const devices = ref(fleetNow())` 及 `devices.value = fleetNow()`。已独立读取 `git show HEAD:...`：HEAD与工作树均没有这两条字串、均有 `<HomeDisplayStats :active="statsActive" />`；测试文件本身与HEAD相同，intro的template/script亦相同。因此该精确断言在HEAD也必然失败，属于此次CSS之前已存在的过期实现契约。这里是对原始断言与HEAD输入的直接核对，本人没有另跑一次HEAD测试。

建议单列测试维护项，后续按现行HomeDisplayStats的公开未登录读取/未知状态/生命周期契约更新测试；本次不改回fleetNow、不换数据口径、不删/skip失败用例，也不把旧失败算成新增CSS造成的产品红。

审查时intro SHA-256：`1697a09a44584bace1802f7bbdc500800eef152eb30f5fa836bd6651aabce72e`。报告仅覆盖此源码指纹；修复后需追加新指纹与结论，保留本次8.8历史。

钱包及导航重定向WIP完全不在本报告审查/写入范围。R18 A钱包字体 **8.8 OPEN** 保持原归属，等待独立钱包工作结束后复验；不以R19 Intro结论代签。

**修复后限定复审（2026-10-28，source-only）**

**Intro 当前源码9.2/10，R19-INTRO-P2-01源码闭环，无剩余本范围P2+。** 上述8.8及初始指纹保留为历史；实景关闭仍由新构建复测确认。

[intro.vue:564](../../../src/pages/onboarding/intro.vue#L564) 已增加 `justify-content:center; min-width:44px`，与原min-height:44px一起约束短英文Terms的命中框。只在内存撤掉这两条声明，完整文件SHA精确恢复此前 `1697a09a…72e`，确认没有夹带模板、路由、品牌、动效、safe38或其他CSS改动。当前SHA-256：`167afd257beba1886e2957c607756f598b285abe6c8d536bd19612a019e0f061`。

已独立读回 app-tests-r19-intro-current.log（`app-tests-r19-intro-current.log`，仓外日志未归档）：privacy 1、motion 3、home-display-player 7，共3文件 **11/11通过**，汇总无skip。player组覆盖时间戳/精度、输入计划校验、隐藏停止、控制读取失败、时钟回退、过期缓存与离页迟到响应。此组未运行旧public-stats契约，不能据此写成旧失败已修复；原3文件 **4pass/1fail** 与原始日志继续保留。本人未重跑测试。

**附：签到两处主题色CSS，源码9.2/10，无新增P2+。**

仅核 [daily-check-in-row.vue:81](../../../src/components/home/daily-check-in-row.vue#L81) 按钮外阴影与 [第95行](../../../src/components/home/daily-check-in-row.vue#L95) today边框/阴影/渐变：固定绿色改用 `--v5-brand`、`--ui-lime-pale` 的color-mix，透明度及几何参数保持。tokens浅色brand为电蓝、ui-lime-pale跟随brand，暗色继续lime/pale；这些token均已有定义，未引入空变量。白色内高光和原文字色保持；仅凭源码不签新包色彩/对比度实景。

在内存将这两条CSS恢复旧值后，完整签到文件SHA精确匹配已审R16 `cdbec792…166c3`，因此本次template、checkIn、busy、账号/页面隔离、已签到入口及触区均未变。当前SHA-256：`bb4205e823a8e7644d14b402e94473e00a1914f039fa430a78cab5f203f8ad4e`。这两处颜色尚待新构建验证，本人未构建、测试或操作浏览器，也未写产品。钱包8.8 OPEN与其独立WIP归属保持。

**R21 今天标签字号微改（2026-10-28，source-only）**

限定源码评分 **9.2/10，无新增P2+**。[daily-check-in-row.vue:96](../../../src/components/home/daily-check-in-row.vue#L96) 新增 `.daily-check-in-row__days .today > text:last-child { font-size:10.5px;line-height:14px; }`。实际模板第13行的最后一个text在today格显示 `copy.today`，因此只将“今天/Today/Hôm nay”从继承的11.5px降到10.5px；上方 `.day-mark` 奖励数值仍12px，其他日期/奖励文字规则不变。此规则适用于各视窗宽度；主题色、格高、完整aria、领取按钮及交互逻辑未改。

只在内存移除该唯一新增行后，完整文件SHA精确恢复上段 `bb4205e8…8ad4e`，确认没有夹带其他变化。R21当前签到SHA-256：`3dc2a7f4fa4005707a0dcd9b9d842b70785b41e9006c027a2ed1c68e39324254`，与父线程给出的冻结指纹一致；intro仍为 `167afd257beba1886e2957c607756f598b285abe6c8d536bd19612a019e0f061`。

旧8.8、旧指纹及测试红绿记录均保留。本次只追加报告，未改产品、构建、重复测试或操作浏览器；5269/5268的A/B实景审查由各自审查者签署，本源码评分不代替其可读性结论。
