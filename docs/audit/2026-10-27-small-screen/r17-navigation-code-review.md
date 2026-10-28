**R17 导航与满槽卡片增量：独立源码复审（Averroes）**

2026-10-27，APP [APP工作区](../../..)，HEAD `ddcea906d62e8242815e5af104ac1574bfa486a2` 上当前未提交源码。

**导航源码 9.2/10；新增 embedded 满槽文案分支源码 9.1/10。未发现本范围 P2+ 阻塞。** 分数仅覆盖下述源码、编译链与既有测试契约审读；不签新构建、浏览器尺寸、原生设备或视觉通过，不沿用 R16 普通福利状态分数。本人未改产品、测试，未执行构建、测试或浏览器操作。

| 检查项 | 实际源码结论与证据 |
| --- | --- |
| 小屏高度、触区与留白 | [app-chassis.vue:588](../../../src/components/app-chassis.vue#L588) 的底部 padding 使用同一 `--nx-tabbar-height`；≤374 在第1005行设56px，其他宽度 fallback68px。[glass-segments.vue:121](../../../src/components/glass-segments.vue#L121) 保留 option 的44px min-height，navigation 内边距5px，因此56px轨道可容纳46px高选项。按现有左右12px、5等分及间距计算，320宽选项约55.6px宽；这是源码推导，非实测。home/earn/team 底部留白164→152，其余tab104→92，子页仍40。 |
| HomeIndicator / Nova | [app-chassis.vue:128](../../../src/components/app-chassis.vue#L128) 保留同一底部容器、LiquidGlass与 HomeIndicator。后者仍22px（Android只隐藏伪元素，不去掉占位）；因此小屏底部轨道加指示器共78px。Nova 的既有 `bottom:calc(100% + 12px)` 随容器整体减12px，48px浮标和额外60px内容留白关系保持。[nova-bubble.vue:198](../../../src/components/nova/nova-bubble.vue#L198)、[device-home-indicator.vue:14](../../../src/components/device/device-home-indicator.vue#L14)。 |
| APP 原生 SVG 编译链 | [app-chassis.vue:133](../../../src/components/app-chassis.vue#L133) 把图标样式放到真实外层 view，内 SVG 仍22×22。[native-svg-icons.mjs:11](../../../scripts/native-svg-icons.mjs#L11) 的 APP 小SVG转换条件仍匹配，vite 在 uni 插件前加载转换器，main 注册 NxNativeSvg。其22px wrapper及 `v-html` SVG 被外层一起缩放到22×1.18≈25.96px；不依赖 NativeSvg 的 class 透传或覆盖内联尺寸。[native-svg.vue:2](../../../src/components/native-svg.vue#L2)。动态 stroke/path 输入保持；本次只核编译源码，未编译新原生资源。 |
| 回弹触发与重复点击 | [glass-segments.vue:53](../../../src/components/glass-segments.vue#L53) 冷开且无 fromValue 时不标记回弹；合法不同页 arrival 才初始化，存活组件则跟随 modelValue 改变。类要求 navigation、当前选中值与 animatedNavigation 同时匹配。重复点同tab不改变 model，原“回到顶部”仍由 [app-chassis.vue:624](../../../src/components/app-chassis.vue#L624) 处理；没有计时器或 hover 回弹入口。失败导航原 reset 机制未改。 |
| 390 / reduced-motion / filter | 新260ms单次 scale keyframes只在≤374 navigation启用；390保留68px、22px图标、选中 translateY(-1px)及既有玻璃弹簧。reduce 覆盖 animation:none、transition:none，保留静态小屏缩放。[glass-segments.vue:135](../../../src/components/glass-segments.vue#L135)。新增媒体规则与类均受 navigation 限定，filter的标签、尺寸、radio/tab选择逻辑未改。 |
| renderjs测量与点击 | [liquid-glass-view.ts:28](../../../src/lib/liquid-glass-view.ts#L28) 仍从直接子 option 读取 offsetLeft/Top/Width/Height，ResizeObserver观察root和options；图标内新增view/transform不改变选项测量对象或命中框。既有拖动、待提交导航、arrival、销毁逻辑未动。媒体高度变化会经过现有resize调度重新定位指示器。 |
| aria / 键盘 | [glass-segments.vue:16](../../../src/components/glass-segments.vue#L16) 保留每项完整 `aria-label=option.label`、aria-current、禁用/tabindex，图标wrapper aria-hidden；display:none标签不会让选项失去名称。导航方向键仅移动焦点，Enter激活、Space可滚动；禁用和重复/修饰键过滤保留，APP串行事件仍交renderjs处理。新增wrapper未改变点击handler或事件归属。 |

既有 [glass-segments.behavior.test.ts:29](../../../src/components/glass-segments.behavior.test.ts#L29) 覆盖键盘、禁用、导航失败与快速回点；提取区从 choose 开始，新 ref/watch 不破坏此 harness。[liquid-glass-view.behavior.test.ts:208](../../../src/lib/liquid-glass-view.behavior.test.ts#L208) 使用实际 segmentsView，覆盖旧model/resize、APP arrival、H5连续运动、drag、filter与reduce。它们不等于新增CSS回弹/实际26px的运行证据；本轮未重跑这些测试。待实景只需确认此次320/360与390差异、重复/首次点击、reduce与底部浮标间距，不扩旧业务矩阵。

**新增满槽分支（独立于上述导航评分）**

[trial-hero-banner.vue:16](../../../src/components/trial-hero-banner.vue#L16) 仅 embedded 且满槽时省去“无需付款”行，显示 `cardCapacityFull`；CTA可见值使用 `cardManage`，aria仍为完整ctaText→manageDevices。三语分别保留“满槽、腾出1位、管理”的含义；[trial-lifecycle.ts:7](../../../src/i18n/trial-lifecycle.ts#L7) 仅新增这两键的三语值，原长文未改。非embedded继续原长文和完整管理标签；已有生命周期仍整卡进入，满槽且无生命周期继续独立CTA。资格、canOpen、canClaim及 [onClick:119](../../../src/components/trial-hero-banner.vue#L119) 分支未改：满槽进入 `/pages/me/devices`，不领取。机图及父容器仍118×118，原定位、44触区与32可见surface保持；320越文高度改善尚待新包实景确认。

已独立读回父线程两份真实日志：

- 初红日志（`capacity-card-tests-r17.log`，仓外日志未归档）：3文件，51通过/1失败；失败为旧长文可见期望，不是资格或交易结果失败。
- 修订后日志（`capacity-card-tests-r17-corrected.log`，仓外日志未归档）：3文件52/52通过，汇总无skip。本人未重跑。
- [测试差异:161](../../../src/components/home/trial-benefits-lifecycle.behavior.test.ts#L161) 只替换可见文案期望并新增完整aria断言；管理路由 exactly once、claim sheet未调用断言保留。非embedded领取弹层原长文测试也保留，未删除/跳过用例。该测试本轮由父线程改动，本人仅复核。

**本次源码指纹（SHA-256）**

| 文件 | SHA-256 |
| --- | --- |
| app-chassis.vue | `3cacb543472255d30f239839fa426e8eb37571fbf2a2b489a504a54e656d3553` |
| glass-segments.vue | `2016e9e3184777124eedc3369cddad23ed963b2ba7659f10bfdc0ad0edf92fe1` |
| trial-hero-banner.vue | `258a0fed517df4a711b5196df1722fc50a52652bb7c45e847a3b9a1eeb70bbd6` |
| trial-lifecycle.ts | `1146d5d3eaf72189bfdc60fc695805ac4cc6dbdf5fa1fdaf5b2368cee45eb91d` |
| trial-benefits-lifecycle.behavior.test.ts | `d26c3c2aac57dacc247ef3a828c5e1f30fe2bb58c58a11004bf602d59d73fb5c` |

R15两处未达消费者的生产可达性与测试边界另见 [r15-unreached-consumers-boundary.md](r15-unreached-consumers-boundary.md)，不混入导航评分。

**R18 source-only 两行增量复核（2026-10-28）**

当前有限源码结论：导航 **9.2/10**，满槽文案 **9.1/10**，无新增 P2+。R17 原文、初红与52/52日志保留为历史；本附注不签R18实景，也未重跑测试或构建。

- [trial-lifecycle.ts:7](../../../src/i18n/trial-lifecycle.ts#L7) 中文 `cardCapacityFull` 已为“队列已满，先腾出1位”，仍准确表达容量已满及先释放一个位置。`cardManage`、英文/越文、完整管理aria与资格/路由未变。
- [glass-segments.vue:146](../../../src/components/glass-segments.vue#L146) 仅≤374 navigation的scale由1.18改1.09；22px图标静态可见尺寸按源码推算为23.98px（约24px）。56px轨道、option至少44px触区、390宽原样、260ms回弹时长/相对曲线/触发条件、reduce与filter隔离均未变。R17的约26px说明由本次约24px替代，实际视觉大小尚未验收。

核验方式：仅在内存中反向替换这两处文本，两个文件分别精确重现上表R17 SHA-256；app-chassis与trial-hero-banner的当前完整文件指纹也与R17一致。因此确认此次限定增量只有所述两处，无产品文件写入。

R18当前 SHA-256：`glass-segments.vue` = `f1a2ede47c8b1490403f8c753abc084a55af3472355af896e10e747ad3952ec0`；`trial-lifecycle.ts` = `10dc8265f7ef9dfd6a22aa57863ab9e2eb9a6540d26555fd4ba7776e7674b418`。HEAD仍为 `ddcea906d62e8242815e5af104ac1574bfa486a2`，结论对应工作树上述指纹。

**R18 最后一处增量：Ref 未登录登录入口触区（2026-10-28，source-only）**

保留 A 本轮实景发现：登录文字入口仅16px高，评分 **8.7/10**（父线程转述，本人未重新操作实景）。当前单行修复独立源码评分 **9.2/10**，达到9分门槛，未发现本增量 P2+ 阻塞；原触区问题的源码原因已修，实景关闭仍由新构建复测决定。

[ref/code.vue:394](../../../src/pages/ref/code.vue#L394) 的 `signinLinkStyle` 增加 inline-flex、双轴居中及 minWidth/minHeight各44px，作用于绑定点击事件的text根，扩大真实布局框；font12、主题色不变。父行第429行已有flex-wrap，允许旁边说明换行，未强制压缩入口至44px以下或覆盖其他按钮。[模板:85](../../../src/pages/ref/code.vue#L85) 仍仅未登录展示，role/button、tabindex及Enter/Space、click均保留原goLogin；[goLogin:292](../../../src/pages/ref/code.vue#L292) 的邀请码编码与登录目标不变。

仅在内存中撤掉新增五个样式属性后，ref/code完整SHA-256精确恢复已审R16指纹 `0e3fd2fb4a642cd1e87c29cb126b346d3579be101ef5aa3a35acb58a64241d55`；当前为 `aa9fdd456cd7d149d98e109ec2fb33c21f5f73adfdec146eba42afde33e54043`。前述中文满槽文案与小屏1.09图标指纹未变：R18限定增量共三处，旧WIP与历史结论保留。

本次只追加本外部报告，未改产品、未重复测试或构建，未把CSS最小尺寸推导当成原生/浏览器实测。
