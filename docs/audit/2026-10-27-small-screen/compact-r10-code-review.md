# r10 小屏设备行与试用操作独立源码审查

r13范围提示：下述25文件9.1为r12冻结快照；用户已替换福利卡交互，不能拿此分数签最新Hero。r12其他已关闭项不重开。最新Hero/i18n、Online及新交互测试的定界结论见[独立r13报告](benefits-online-r13-code-review.md)。

当前冻结复核：**COMPACT-R11-NATIVE-SVG-01 与 SMALL-SCREEN-HIT-01 均已在源码范围关闭**；新增福利四文件独立源码 **9.1/10**，合并25文件 **9.1/10，无剩余已确认P2**。8.8历史保留。构建、原生尺寸及最终实景不在本次执行范围，详见末节和福利专项报告。

最新补充：slot按压态已改用`background-color`，此前非阻塞的clip重置备注已闭环，该单行源修复待下一包；福利旧夹具经独立diff复核未削弱断言，Noether记录3文件36/36通过。父线程提供r12指纹`CNOH4xg3 / 64PWOPxR`，不把尚待打包的slot单行或Jason另行Online增量算入该构建实景证明。

2026-10-27 · Averroes · **本轮独立评分 9.1/10，未发现 P2+，阻塞项：无。** 此为 r10 新需求的源码评分，不继承 r9，也不签实景可读性。

基线 `e58039e57c9cc5192cc3fe5642b9ecac5564dce9`，仅审指定 7 文件未提交增量；沿品牌组件读取其尺寸规则和两张 PNG 的尺寸元数据。7 文件按路径排序，以路径 NUL 字节内容 NUL 串联的 SHA-256 为 `1d86e09dd51904e1c4f460005843dc375c0d8a54ae608820174ae22c0dd2e247`，两次读回一致。

## 操作与 CSS

- [trial-device-row.vue:91](../../../src/components/trial-device-row.vue#L91) 的按钮根仍为 `min-height:44px; box-sizing:border-box`。单行时上下各 inset 6px 的伪元素形成 32px 可见底色；伪元素 `pointer-events:none`，文本相对定位在其上，原点击与 focus 命中区没有缩成 32px。多行时根和底色会自然增高，不能把注释中的 32px 理解为所有语言下的固定高度。
- 两按钮使用可换行 flex、max-width:100%，取消原先各自填满一半的布局；详情、购机仍是各自完整控件，禁用 opacity 同时覆盖文字和伪元素。恢复提示不属于 actions 区，新按钮 12–13px 字体不会覆盖既有重试 13px/600/20px。
- `detailsAction` 三语均存在，短文案为“详情 / Details / Chi tiết”，完整 `copy.details` 留在 aria-label。中文“抵扣购机”和越南语短句保留使用抵扣购买含义，抵扣用途说明、购机/取消 readiness 与 busy 守卫没有改动。
- 六个 Vue 文件的 script 区块、事件绑定、显示条件、disabled/busy/tabindex/aria-disabled/aria-busy 表达式相对 HEAD 均未变化；唯一新增无障碍内容是详情按钮的完整名称。[empty-slots-hint.vue:138](../../../src/components/earn/empty-slots-hint.vue#L138) 的 border-box 防止 padding 额外扩大原 44px 最小高度，原打开设备入口和 reduced-motion 规则保留。

## 字号下限与覆盖

下表为 CSS 算术值，**不是浏览器测量**。

| 对象 | 320px | 390px | 说明 |
|---|---:|---:|---|
| 赚取/首页设备名、普通设备主要数值、添加设备按钮 | 13px | 15px | `clamp(13px,3.85vw,15px)` |
| 管理页设备名、试用展开双按钮 | 12px | 13px | `clamp(12px,3.34vw,13px)` |
| 状态、辅助标签 | 11px | 12px | `clamp(11px,3.08vw,12px)`；主名称未降到 11px |
| 试用剩余时间 | 12px | earn/home 14px；inventory 13px | inventory 的局部覆盖及 ≤350px 的 12px 规则仍生效 |

已核对 device-card-pc 原 inline 12px 删除后，状态 clamp 不再被覆盖；home/device-row 内保留的金额 monospace 类只改字体族和数字变体，不覆盖 clamp 字号。试用剩余时间去掉 monospace 后仍有 tabular-nums。原试用图上 9px/8.5px 角标未改，故本报告不声称全组件所有文字都 ≥11px。

## 品牌比例

[app-chassis.vue:1001](../../../src/components/app-chassis.vue#L1001) 的后置断点依次得到默认 146×50、≤374px 的 124×43、≤350px 的 112×39 盒子；较小断点位于后方，不会被 374px 规则反盖。BrandLockup 是单根组件，调用处 100% 宽高覆盖其默认像素盒，让页头缩小实际生效；其他 BrandLockup 调用未改。

两张原图实际尺寸均为 **712×246**，内部仍使用 `mode="aspectFit"`。盒子比例与原图略有舍入差，但图片按原比例适配留白，不会按盒子强制变形。此次按用户明确要求在页头局部缩小到组件默认 144px 最小宽度以下，没有修改原图或全局尺寸 helper。

执行边界：仅阅读源码、做文本对比和尺寸/字号算术；未修改产品、图片或主线程文档，未运行测试、构建或浏览器。320/390 三语真实换行、11px 辅助文字可读性和原生点击感受仍由本轮实景验收判断；未引用旧构建或旧评分代替。唯一写入为本报告。

## r11 读取重试字体增量独立复审

2026-10-27 · Averroes。**r11 八文件源码评分 9.2/10；r10+r11 共 15 文件合并范围评分 9.1/10，未发现 P2+，无源码阻塞项。** 此次独立读取实际 diff，不以实现者自查替代审查；上文 r10 原结论和下限说明保留，不继承 r9 评分。r11 尚待父线程统一构建与实景，本评分不代表其已执行。

对照 [修复前遗漏清单](retry-final-inventory.md) 和 [r11 实现说明](retry-font-fix-r11.md)，实际增量为 23 行新增、14 行删除：

| 文件及源码证据 | opt-in 与非重试边界 |
|---|---|
| [developer.vue:1026](../../../src/pages/developer/developer.vue#L1026) | 四处读取失败标签加局部 class；文档重试的内联 12px 已删除，不再压过新字体。申请提交、创建/撤销资源、密钥轮换未接入。 |
| [store/detail.vue:199](../../../src/pages/store/detail.vue#L199) | 仅资料读取失败文字使用新类，箭头、购买 CTA 和根 44px 最小触区不变。 |
| [promotion-reward-detail.vue:4](../../../src/pages/events/promotion-reward-detail.vue#L4) | 仅 `p.retry` 子文字使用 scoped 类；共享 `.promotion-link` 未改，返回、普通刷新、联系客服未被统一。 |
| [events/detail.vue:137](../../../src/pages/events/detail.vue#L137) | 仅详情/规则读取的两处重试文字，领取/参与的 `.event-primary` 未改。 |
| [genesis-raffle.vue:38](../../../src/pages/events/genesis-raffle.vue#L38) | 首次失败重试显式使用；底部共享入口仅 `error` 分支加类，与 `copy.retry` 分支一致，普通 refresh 和报名结果确认 `retryEntry` 保持原样。 |
| [terms.vue:62](../../../src/pages/onboarding/terms.vue#L62) | 仅 `!loadingTerms` 的重试文字加类；加载省略号、语言选择、同意提交未改。 |
| [marketplace.vue:135](../../../src/pages/genesis/marketplace.vue#L135) | 补页仅 `activityPage.error` 分支，事实读取仅 `!marketplaceRead.busy` 分支加类；普通加载更多、marketLoading 和 `.nx-market-info` 未改。 |
| [register/success.vue:371](../../../src/pages/register/success.vue#L371) | `.rs-retry` 唯一模板入口位于 `#ifdef H5`，子文字无另行字体覆盖；下载链接、等待提示、成功页主 CTA 未改。这是同源码 H5 分支，不计为 APP 原生入口或 H5 已同步。 |

八处局部声明均完整为 `font:600 13px/20px var(--font-v5)`。前七文件直接设置重试子文字，不依赖父级继承，也没有改 NxButton 的共用默认尺寸/字体；最后一处设置专用根，子文字继承。读取当前 scoped 规则及共用 promotion.css 后，未发现更高优先级规则或残留内联字体覆盖这些标签。既有点击根、padding/min-height、focus 和禁用样式未改，不能把文字 20px 行高误当为点击高度。

只读文本比对确认八文件的全部 script 区块、事件绑定及显示/role/tabindex/aria/disabled/busy 属性与 HEAD 相同；本轮没有引入普通 refresh/loading/submit 的业务变更，也未触碰全页 EmptyState。r10 七文件指纹仍为上文 `1d86e09d…dd2e247`，没有被本次字体修复改动。

审查基线仍为 `e58039e57c9cc5192cc3fe5642b9ecac5564dce9`。按上文相同字节规则，r11 八文件 SHA-256 为 `bcaae74ff75b91342cb39df05ee72859406e806a4083393cccf8bcb14ad40688`；合并 15 文件为 `3e9141a12f78bc7ffa12aa9903875d790d0fd2b8098131cf6312c407d7c85eb4`。

执行边界：本次仅静态 diff、样式/模板核对和文本指纹比对；未运行测试、类型检查、构建或浏览器，未改源码、原清单或实现说明。真实字号、三语换行、原生交互和最终构建验收留给父线程本轮实景，不用旧 native 证据替代。仅追加本仓外报告。

## r11 追加：小屏导航标签单文件复审

2026-10-27 · Averroes。**glass-segments.vue 增量源码评分 9.2/10；连同上述 15 文件的合并范围评分 9.1/10，无新增 P2+ 源码阻塞。** 用户提供的 320px 越南语实测为 `Trang chủ` 57.77px、option 55.6px，证明原版确实越界；本次尚未获得重建后的测量，不把静态审查签成越界已经消除。

- [glass-segments.vue:131](../../../src/components/glass-segments.vue#L131) 的字号仅限定 navigation 下 `.nx-tab__label`，使用 `clamp(10.5px,3.28vw,12px)`；另有明确的 `text-align:center`。filter、计数和普通分段标签没有改变。[app-chassis.vue:139](../../../src/components/app-chassis.vue#L139) 实际 slot 标签匹配 deep 选择器，内联样式仅颜色，未发现会压过新字号的标签规则。
- ≤350px 的后置同优先级规则把字重/行高/字距设为 500/13px/−.01em，图标与标签间距为 2px；351px 起恢复 600/14px/原字距及 3px 间距。按 CSS 算术，320/350/351/390px 字号分别为 10.5/11.48/11.5128/12px，约 365.85px 起封顶 12px。断点没有被后续规则反盖；10.5px 的实际可读性仍待本轮实景。
- 完整 template、setup script、renderjs 与 HEAD 字节归一化对比一致。LiquidGlass 的轨道和选中底片、配置传递、图标上移和 transition、减弱动态/降低透明度规则原样保留。没有增加循环动效或改玻璃采样方式。
- 导航根仍高 68px、padding 5px；option 仍 `min-height:44px; box-sizing:border-box; padding:4px 2px`，只缩文字和内部 gap，没有缩小点击根。navigation/link、完整 aria-label、aria-current、disabled/tabindex、键盘和 select 处理保持不变。

实景确认只需延续已发现的 320 VI 案例：新文字应容纳于 option **内容盒**；现有左右各 2px padding 意味着 55.6px 外宽约对应 51.6px 内容宽，不能仅以文字小于 55.6px 判定修复。保持完整文字、不截断、不换行的实现方向合理，但字体字重变化后的实际宽度不能用旧值等比例计算充当测量。本报告不新增整套矩阵。

前 15 文件指纹仍为 `3e9141a12f78bc7ffa12aa9903875d790d0fd2b8098131cf6312c407d7c85eb4`，本次未发生变化。新增文件原始字节 SHA-256 为 `794cf61127008098b56cebb060d52c58b8fe96157400b5973e72e99e7029de7b`；16 文件按上文路径/NUL/内容规则合并指纹为 `1199d6ea46652e1e0c5817266aa8ddf31795cf98b9691adc42cbaa047f643be9`，基线仍为 `e58039e57c9cc5192cc3fe5642b9ecac5564dce9`。

执行边界：只读单文件 diff、对应调用点与文本/算术核对；仅追加本报告。未修改源码，未运行测试、类型、构建或浏览器。r11 最终构建、实际文字边界和小屏可读性由父线程随后实景确认。

## r11 追加：顶部玻璃及签到小屏规则（最新默认 medium 版）

2026-10-27 · Averroes。以用户最后恢复的签到默认样式为准，**不采用中间版默认 small/font13 的结论**。顶部与签到新范围因下面同一 APP 图标匹配问题暂评 **8.8/10**，合并 18 文件亦暂为 **8.8/10**；业务处理未发现新增问题。底部 glass-segments 原审指纹未变，继续保留源码 9.2，320 VI 修复后的真实边界尚待实景。

### COMPACT-R11-NATIVE-SVG-01 · P2 · 外盒缩小未约束 APP 内层 SVG

[tokens.css:1066](../../../src/styles/tokens.css#L1066) 的新规则分别匹配按钮直下的 `svg` 或 `.nx-native-svg`。APP 的 [构建转换](../../../scripts/native-svg-icons.mjs#L19) 会把这些 20/22px 图标转换成 NxNativeSvg；[native-svg.vue:2](../../../src/components/native-svg.vue#L2) 用外层 view 包住 v-html，而 [native-svg-markup.ts:38](../../../src/lib/native-svg-markup.ts#L38) 原样保留内层 SVG 的 width/height。因此 max-width/max-height 只会约束外盒到 19/18px，不会继承到仍为 20/22px 的内层 SVG；直接子 `> svg` 分支也匹配不到它。当前相关全局/组件规则没有补齐内层自适应，不能用外盒测得 18px 来签图标已缩小，且可能形成图形相对外盒偏心。

最新 [daily-check-in-row.vue:94](../../../src/components/home/daily-check-in-row.vue#L94) 的火焰 `> svg {width:18px;height:18px}` 同样只覆盖直接 SVG，APP 转换后直接子是 `.nx-native-svg`，新 18px 声明不匹配，仍使用原 20px 图标。并入本编号，不另开重复缺陷。

最小建议：仅在这些已授权的小屏入口中同时约束 native wrapper 与实际内层 SVG，或让内层按受限外盒尺寸适配；保持现有 16px 返回图标不被放大，勿全局改变所有 SVG。修复后只需按已计划的 APP 实景读取 wrapper 和内层 SVG 两者尺寸；本报告没有冒称执行过 APP native 测量。

### 已确认保持的结构与业务边界

- 顶部新媒体规则位于 nx-design-glass 后，仅 ≤374px 使用 inset 2px、≤350px 改为 3px。search/bell、APP icon-only scan、message-nav、cp-back/ticket 的实际点击根仍为 44×44；直接 LiquidGlass 子层据此成为 40/38px。不是伪元素，也未使用负 inset。装饰层仍 pointer-events:none；按钮事件、焦点、disabled/aria 与语义根不变。
- 全局选择器可匹配跨组件的 APP scan 插槽，不依赖 scoped 穿透。玻璃渲染配置、材质、动画及 ResizeObserver 均未改；未把 cp-identity 或 composer 一起缩小。详情 `.nx-nav-side` 的 44px 根及 `.nx-nav-glass` 的 36px 玻璃不被这些选择器命中，保持原样。≥375px 顶部不应用本次缩小。
- 签到当前 template 与 script 相对 HEAD **完全相同**，媒体规则前的全部基础 CSS 也相同。故 390px 保持 `size="medium"`、14px 按钮字、40px surface、8×18px padding 和原阴影，未因本次增量更改用户认可的 5237 390ZHdark 默认样式；这是源码保持结论，不是再次实测。
- 签到仅 ≤374px 改为 `32px minmax(0,1fr) auto` 三列，删除原 ≤350px 的整行 CTA；按钮在右上，火焰 margin-top 6px 对齐按钮可见面的顶部。标题 13/18、辅助文字 11/16、按钮 12px nowrap；表面目标 32px、根 min-height44px 与上下各6px padding 区分清楚。局部 deep 声明只在该卡内生效；编译后的 medium surface 覆盖以父线程本轮计算样式确认，不把 visible surface 当点击高度。
- `submitting`/visible 守卫、重复点击保护、未就绪或已签到时跳转签到页、真实提交、账号/页面 scope 校验和 toast 原样保留。改版未把已签到状态变成再次提交，也未变更七日数据、奖励规则或业务读写。当前模板只有原有一个 CTA，没有新增重叠点击层。

快照：基线仍为 `e58039e57c9cc5192cc3fe5642b9ecac5564dce9`；前 16 文件指纹保持 `1199d6ea46652e1e0c5817266aa8ddf31795cf98b9691adc42cbaa047f643be9`。tokens 原始字节 SHA-256 为 `4cedba7c1bb32fd1744cb71d9ed9f9dea1d7df88a5d40242ac8e84c0f8b4fa30`，最新签到为 `7f8322ba106757043afac886218abd4e5223146516925435cd89c766f3582122`；18 文件按前述路径/NUL/内容规则的合并指纹为 `98407038a960508b83dc4d332d10c047523572e5f412efaa082f2fd2c374689c`。

执行边界：仅静态源码、真实转换链及文本指纹核对；未测试、构建、操作浏览器或修改产品，只更新本仓外报告。新福利双卡四文件尚未进入本节审查范围。

### Native SVG 第一轮补丁复核

顶部当前补丁在 ≤374px 内为 header/message-icon/cp-back/ticket 的 `.nx-native-svg svg` 增加 `width:100%;height:100%;display:block`，外盒原 max-width/max-height 继续限制 19/18px，因此内外尺寸约束已接通。该部分 **源码 9.2/10、P2 关闭**；16px 原图标仍不被放大，未改全局 NativeSvg 或玻璃/触区。APP 安装后实际尺寸仍未测量，资源构建只能验证编译与 selector，不能代替设备实景。

签到补丁尚未完全关闭：[daily-check-in-row.vue:95](../../../src/components/home/daily-check-in-row.vue#L95) 为 wrapper 设置普通 CSS `width/height:18px`，但 [native-svg.vue:16](../../../src/components/native-svg.vue#L16) 将原图标的 `20px` 写入 **内联 style**。普通选择器宽高覆盖不了内联宽高，新增内层 100% 仍会跟随 20px。这里需局部 max-width/max-height 18px 等有效约束，不应只以选择器已存在签通过。**本编号只剩此一处，签到与合并 18 文件评分仍 8.8/10**；上一轮 8.8 证据完整保留。

本次读回默认签到 template/script/媒体规则前 CSS 仍与 HEAD 一致，390 默认 medium/14px/40px 及阴影未变。前16文件指纹未变；当前18文件指纹为 `c35e9a1868971a307a653019c17cba2143ada7a5740c5ed9847d47674acba647`。只读复核，没有执行构建、测试或设备测量。

## 最终冻结补丁与福利 r12 合并结论

2026-10-27 · Averroes。签到 wrapper 已增加 `max-width:18px;max-height:18px`，因此内联 width/height20px会受最大尺寸约束，内层100%随外盒缩小。**COMPACT-R11-NATIVE-SVG-01完整源码闭环，9.2/10**；旧普通width18无效的8.8判断保留为历史。顶部玻璃面40/38px、44px根及底部导航既有动效/语义未再改动。390签到默认样式仍与HEAD一致。

三处sheet关闭根均改为44×44并采用border-box：slot/device-deactivate上下左右padding4px、nickname padding6px，background-clip:content-box在正常态保留36/32px可见圆面，透明padding仍是事件根的一部分。三者模板完整相同，事件、键盘、aria及关闭行为未变。**SMALL-SCREEN-HIT-01源码闭环，9.2/10**，对应[巡检清单](small-screen-inventory-code.md)。非阻塞细节：slot原有`:active {background:…}`简写会重置background-clip，按下时可见背景可能铺满44px；不影响此次修复的命中区，不能把正常态36px外观推称为已验证的按压态。

福利四文件独立复核见 [benefits-r12-code-review.md](benefits-r12-code-review.md)，**9.1/10，无新P2**。未知值、完整机型/金额与试用规则保留；390中文未领取分支不启用compact。实现者报告的5项旧harness红仍单列，不把它们改签成全绿。

当前25文件合并源码评分 **9.1/10**。18文件指纹 `bbdee67656811546f37d5ed6d44db78b8afeba2158e2932b17f16353070ae271`；加入3个sheet后21文件 `b77441068b336c376188ade1d000a8efff867767d1236198e86e238c9ca68bca`；福利4文件 `9dfa44a6e6af445088ba4b74f4312de1e0ab5e0adb8123529ddc03f893c6ea2d`；总25文件 `9e4069d3ed13b28c7edcda472e0346c353edc17fa44157aa90b511adb7a297ea`。均按此前路径/NUL/字节/NUL规则。

本次只读源码及冻结指纹，更新仓外报告；未运行测试、构建或浏览器。APP资源编译selector、真实设备内外SVG尺寸与父线程r11/r12新构建实景仍由对应执行者确认，源码分数不代替它们。

## r12末次定界补充：slot按压态与测试维护

[slot-action-sheet.vue:284](../../../src/components/slot-action-sheet.vue#L284) 的`:active`由`background`改为`background-color`，不再重置根上的`background-clip:content-box`；44px命中根、4px透明padding及事件均未改。将这一个属性名在内存中还原后，SHA-256精确回到此前冻结值`d048333585236d4e579efafe6732b5e5e251bfb60843cc61a6db8badf081faa0`，确认相对该快照只有此项变化；没有写回源文件。当前slot原始SHA-256为`b8430c3f2d8a0a4a4f8233761688791f1c1a6637060172ef5943bcb4cc2208a6`，此前25文件总指纹保留为历史，不冒用为此次单行后的指纹。**25生产文件源码范围仍9.1/10，无新增P2；按压clip备注关闭。**

旧trial-offer五个harness失败的修复另见[福利测试独立复核](benefits-r12-code-review.md)。真实store→presentation→组件文本路径、封顶/49.99和poll守卫均保留或加强，无删测/跳过；Noether执行记录为3文件36/36通过，本人只读未重跑。

已确认预览HTML存在360×780选项；后续若获实景授权，应整页reload后通过原选择器选取，不注入DOM改尺寸。本次没有操作浏览器、重启服务或接触用户5240；预览选项和Online增量不进入上述生产25文件评分。r12构建指纹由父线程提供，A/B实景结论仍由其独立交付。
