# R13 福利整卡入口与设备 Online 独立源码复核

**R14构建前最终增量：≤350未领取六条CSS＋平台三语六key，源码9.2/10，未发现新增P2或明显业务/布局退化。** 92px图、44px触区与390默认分支保持；A的320VI未领取8.7仍是待新包实景闭环的视觉结论，源码分数不替代它。详见末节，历史记录保留。

2026-10-27 · Averroes。**最新有限源码结论：Hero/i18n 9.1/10，未发现其他确证P2；Jason Online 9.2/10；inventory增量9.2/10，键盘P2已最小修复关闭。** 字号P2撤回：14/12是父线程旧方案，并非用户固定要求，11/10.5的新标题同排方案交A/B判断真实可读性。此前两处8.8判断及失败路径保留在下文历史；不沿用r12福利评分，不代签视觉/原生结果。≤350排序疑点已排除：源码meta为order0、art为1，父线程确认A/B各状态截图均为文字在上、图片在下；不改CSS、不为此重建。

## 历史：R13-HERO-P2-01（旧验收口径失效，撤回）

最新澄清：此前将父线程旧独立时间数值方案误列为用户固定字号要求，原8.8及该P2不再适用。当前用户要求是标题后同排紧凑`2d 23h:44`，没有指定14/12；不要求为消除此记录放大字体。11/10.5源码事实保留，但其可读性由A/B实景判断。以下两段是原判断记录，不作为当前整改要求。

用户上一条给出的时间字号是390下14px、320下12px。实际新模板使用[trial-header-countdown](../../../src/components/trial-hero-banner.vue#L7)，[默认声明](../../../src/components/trial-hero-banner.vue#L207)为11px，[≤374声明](../../../src/components/trial-hero-banner.vue#L222)为10.5px。旧`.trial-countdown`属于仅standalone保留的独立时间组，不能据其样式认定新标题倒计时已满足14/12。

这是静态可确认的需求落差，不是猜测字长溢出；后续补充的“标题后同一行、小字号”没有明确撤销14/12数值。最小处理是把新节点的实际字号与最新认可规则对齐。若主人明确重新指定11/10.5，应记录该替代规则后关闭此项；不能把当前11/10.5记成14/12已实现。除此一项，没有确认的新增Hero阻塞。不追加整套实景矩阵。

## Hero入口、几何与旧卡保护

| 检查点 | 独立源码结论 |
| --- | --- |
| 整卡入口/移除CTA | `cardEntry = embedded && hasLifecycle`；active/grace/ended/converted领取后卡有role=button、tabindex=0，独立CTA不渲染。完整状态、机型、原操作文案组成主卡aria；仅短标题新增zh/en/vi各两个key。非embedded仍保留原CTA和独立剩余时间区域。 |
| 既有目的地和资格 | `onClick`、canRestart/canClaim/visible等原逻辑未改：新鲜eligible的ended打开领取面板，converted进设备，其他生命周期进原试用详情，满容量进设备管理，未获准领取仍受原守卫限制。没有自动领取/购买、改金额或改服务端状态。 |
| 键盘与retry隔离 | 根使用`@keydown.enter.self.prevent`和space同序修饰符，子节点先被self排除，不会阻止其键盘事件。现有[全局激活层](../../../src/lib/a11y-activate.ts#L59)在bubble阶段识别事件目标自身，尊重defaultPrevented；根自身不会再合成第二次点击，retry可交给全局层生成自身click，再由原click.stop阻止根导航。retry仍仅error时refresh。此为链路源码核对，未实测原生键盘/读屏。 |
| 标题时间 | active/grace标题后同排显示`2d 23h:44`格式；按分钟向上取整再拆天/时，分钟补零，null为`-`，ended/converted不显示倒计时。原完整状态及本地化剩余时间仍在aria；显示零不会自行结束试用。 |
| 108/96图和地板光影 | card-entry的图/内图规则与旧embedded、long-copy、lifecycle图规则同优先级且在后，能覆盖旧72px/opacity .4，改为relative、order1、居中、108px，≤374为96px。非lifecycle窄屏92px规则不会命中领取后卡。aura仍绝对定位在底部并横向居中，图进入内容流；实际像素位置与等高后留白留给r13实景。 |
| 标题/meta优先级 | meta的flex0、标题padding-right0/margin-top6采用与旧embedded+lifecycle相同的三个class权重且位置在后；≤374的padding-right0也在14px旧规则后，未被旧保留区挤回。小badge另有非阻塞细节：后置`.trial-status-row .trial-badge{font-size:11px}`权重低于`.embedded.lifecycle .trial-badge{font-size:11.5px}`，实际是11.5px；本报告不把它写成11px已生效，也没有无实测依据把它另列溢出P2。 |
| 390未领取保护 | 非满容量未领取时cardEntry/lifecycle均false，新增标题分支不生效，CTA和原文字仍在；新增布局规则限card-entry/lifecycle，390不命中≤374。原184px、118px图及默认样式未改。此为源码保护结论，不冒称再次验证5237。 |
| 福利双卡等高 | home-benefits和voucher相对HEAD无有效文本diff：grid恢复默认stretch，券卡embedded恢复height100%/min-height184（≤350为200），撤回r12的align-items:start及固定自身高度。源结构支持同一grid行等高，实际测量仍待r13。 |

## Jason Online与测试复核

已读[实现说明](device-online-r13.md)以及其五生产文件/四测试当前diff。只审Online增量；同文件内先前字号与试用按钮WIP不重复计分。

- zh/vi仅将`earn.online`改为字面`Online`，英文原值保留；实际四个消费组件已核对，不影响聊天/网络状态翻译。三处新点为7px空内容伪元素，沿已有`--v5-success`主题token，不新增点击、朗读词或循环动画；首页原有圆点保持。
- PC/phone卡按原优先级先显示未绑定、待停用、重连、暂停、未接单，之后服务器设备按runtime ONLINE/OFFLINE/UNKNOWN显示；点的门控与Online标签一致。卡片、详情管理标题、详情统计区共用状态，暂停不再被统计区单独显示为Online。真实canonical映射与页面激活筛选也已只读核对，未以人为构造的未激活设备冒称实际入口缺陷。
- 库存保留真实`deviceOnlineState`三态、activationUnconfirmed与runtimeConfirmed门控；未激活/未知不点亮。待停用仍保留原`Online · 待停用`含义。试用行仍以presentationReady且active表示原有试用Online，grace为Offline、读失败未知；不声称它新增了设备心跳。
- 状态/样式之外未改长按、导航、展开、管理、购买/取消、禁用或提交处理。新增测试执行真实SFC和显示helper，通过响应式数据变化检查三语字面Online与点的类；库存/试用既有断言只加强，未删减/跳过。trial presentation用替身隔离上游，不能把组件测试当作真实设备心跳或API验收。
- 已独立读[最终原始日志](device-online-r13-green.log)：20:41:03，4文件72/72通过。首轮69绿/3红日志保留；失败发生在卡片夹具读取仅详情页存在的节点。当前统计区断言实际位于详情测试，未通过删除该业务检查换绿。本人没有重跑。

## Noether新Hero测试与执行边界

已读当前`trial-benefits-lifecycle.behavior.test.ts`增量及[READY记录](benefits-r13-tests.md)。21个原用例保留并改为真实根卡交互，新增5例，共26；仍精确检查实际11.37而非估算50、错误未知值、重新领取门控和券消失后的单列。新用例覆盖根/后代键盘区分、retry click停止冒泡、12组分钟进位和状态不被倒计时改写。派发器仅模拟target/currentTarget及冒泡，Vue编译的self/prevent/stop仍是真实处理逻辑；没有复写业务结果或CSS快照。

Noether记录20:52:33原三文件41/41通过（26+11+4），Hero指纹与本次读回一致。本人未运行测试；此处读取的是执行者报告，未独立核对其原始终端日志。测试没有安装浏览器全局激活层，也没有CSS布局引擎；“retry键盘不被根劫持”不等于原生键盘合成click已实测。字体P2不受41绿消除。

本轮没有构建、浏览器、服务操作或产品修改；未碰5240。仅写仓外审查文档，不提交/推送。R13构建/实景尚未在本审查中读取，不以CNOH4xg3旧r12构建代签。

## 源快照

HEAD：`e58039e57c9cc5192cc3fe5642b9ecac5564dce9`。

- Hero：`f77aed23d65c2fe9e6cde2f0d21f5898dcc7c8ca7bc2792caaca2314a282bc66`
- lifecycle i18n：`ae65b770f8179aea330eb886bd471f29dd55b8ebc4b0996a26f6010abae65007`
- Online五生产文件（实现说明清单，排序路径/NUL/字节/NUL）：`89bf8f624489a512271e25f4a9f803ebe9a433246061f1eec88e8c789c22a0e6`
- Online四测试（同规则）：`3d24938a40faf91fdf27f3e086324c229f32f6e62910f49503803659d21f37b6`

## 追加：inventory两文件图片与展开操作

只读新增`device-inventory-row.vue`与`trial-device-row.vue`的inventory变体，未扩展其余页面。**初审8.8/10，下面1项P2已在末节最小修复复核中关闭，最新9.2/10**；Online状态逻辑本身未再改变，前述9.2仍只签Online范围。

### 历史：R13-INVENTORY-P2-01（已修复）新增keydown绕过原重复按键过滤

普通设备的[heading:5](../../../src/components/me/device-inventory-row.vue#L5)与[action:24](../../../src/components/me/device-inventory-row.vue#L24)新增`@keydown.enter.prevent`/space直接改expanded或调用onAction。此前这些role按钮走全局`a11y-activate`，它明确拒绝`ev.repeat`及Alt/Ctrl/Meta组合键；新局部处理先执行并preventDefault，文档层随后直接返回，无法再提供过滤。按住Enter/Space所产生的重复keydown会持续开合heading，启用的action也会重复emit toggle；`onAction`只有showAction/disabled检查，并不等于重复按键守卫。这是源码可确认的原交互变化，本人未运行键盘实景。

最小修复：只在这两个新增局部键盘入口保留原repeat及组合键过滤，或沿用原全局激活路径；点击与`onAction`无需更改。单次按键不会因全局层再合成click而双发，disabled仍被onAction拦住；不能将这两点等同于“按住按键也保持旧行为”。没有据此声称实际后端重复变更成功，后端命令保护不在本轮范围。

### 已通过的定界检查

- 普通设备art/image均64×64，≤374后置同权重规则均改56×56；trial仅`.trial-device-row--inventory`同样64/56，home/earn原尺寸不受此增量影响，≤350的earn44规则不会覆盖inventory。仍aspectFit，完整机型与Online文案未删。
- spec进入新summary左列，`flex:1;min-width:0;overflow-wrap:anywhere`；操作右列`flex:none;max-width:45%;min-width:64px`，文本保留并可换行。没有省略规格/金额、隐藏待停用提示或移动trade-in到操作内部。
- 操作根保留`min-height:44px`和border-box；背景伪元素inset上下6px、pointer-events:none，因此单行44px根对应32px可见面，文字增长时两者自然增高，不承诺所有语言固定32px。active边框及disabled整根透明度均覆盖背景。
- `onAction`、actionDisabled、actionLabel及事件负载未改；showAction、tabindex/aria-disabled保持。summary位于body，和heading是兄弟，操作键盘冒泡不会触发heading开合；新增`.prevent`可阻止全局重复合成一次click。试用inventory此增量仅图片CSS，没有新增键盘处理或改变试用取消/购买守卫。

此前Online72/72和福利41/41记录都不能自动延伸为这一后加键盘/布局增量的测试通过。未运行新测试、构建或浏览器；真实64/56图、按钮折行及44px边缘触控仍交父线程本包既有实景，不另开矩阵。

最新两文件SHA-256：device-inventory-row `634fec50e8c51d44da3a95b7742caa1ef229fedf9aa268e745e263be9822c399`；trial-device-row `c3641392147079a773e1a1519ae05e9ce901c9251617cf55aee1c9e144602ea5`。前述Online五文件总指纹是本增量前的历史快照，不当作新总指纹；Hero仍为`f77aed23d65c2fe9e6cde2f0d21f5898dcc7c8ca7bc2792caaca2314a282bc66`。

## 最小修复与验收口径澄清复核

**R13-INVENTORY-P2-01关闭，inventory源码9.2/10。** 当前heading/action均已删除局部keydown，role/tabindex、click与disabled/onAction守卫保持。键盘重新经过未改动的全局`a11y-activate`：过滤repeat、Alt/Ctrl/Meta及禁用目标后才合成click。将这两组已删除属性仅在内存中补回，内容SHA-256精确回到初审的`634fec50…`，确认没有夹带其他行为变动。当前device-inventory-row SHA-256为`6c0817cb32dc1a23eec8bfe42f0f47afa24e9b413ea6faab94a2d0a10059033c`；试用行仍为`c3641392…`。没有执行测试或写回源码。

**Hero字号项按旧验收口径失效撤回，Hero/i18n源码9.1/10；没有发现除此以外的确证P2。** 保留11/10.5紧凑标题倒计时，让A/B以新方案实景判可读性；不将历史14/12当作放大字体的依据，也不以代码分数代替视觉评分。

父线程提出的≤350 meta/art同order问题，当前`f77aed23…`源码仍需与实景区分：[line179](../../../src/components/trial-hero-banner.vue#L179) `.nx-trial-hero--embedded.nx-trial-hero--lifecycle .trial-meta {order:0}`有三个class，优先于[line188](../../../src/components/trial-hero-banner.vue#L188)窄屏`.nx-trial-hero--embedded .trial-meta {order:1}`的两个class；后者虽然更晚且在media内，也不会因此提高优先级。新card-entry meta规则只改flex，没有重设order。因此按当前源码，领取后meta应为0、art为1，不能仅用两条order1声明认定同序后按DOM倒置。若A/B当前包实测meta确为1，应对照该包的compiled selector、computed order和指纹定位；此记录不否定实际截图，也不提前签排序修复完成，不另开矩阵。

本次仅更新本仓外报告。旧评分和旧失败路径保留；未运行测试、构建、浏览器或服务，未触碰5240。

### 排序取证回报与构建边界

父线程随后明确更正排序怀疑，并确认A/B各状态截图均为meta在上、机型图在下，与上述优先级判断一致。**该点按“疑点排除”关闭，不是CSS修复完成**，无需新增代码或因该点重建。截图结论归属父线程/A/B，本人此轮未独立打开截图或浏览器，源码分数维持不变。

按父线程当时的冻结说明，inventory删除新增局部keydown是彼时唯一r13 build后生产变更；该源码补丁已在本报告复核关闭。这条“唯一”仅为当时历史，后续增加的六个文案key见下节。构建后补丁与r13现有构建证据分开记录，不将旧包冒称已经包含补丁。没有新矩阵、测试或构建执行。

### 构建后追加：手机本机算力三语文案

已只读核对zh/en/vi各`phoneActivationAppOnlyTitle/Body`，共六个key：标题分别为“手机本机算力”“On-device phone compute”“Tính toán ngay trên điện thoại”；正文都把Android App要求限定于手机校准、激活及算力运行，未宣称整个APP仅支持Android。**未发现P2，既有源码评分不变。** `phone-activation-guidance.ts`无diff，H5/native分支及相邻校准/不可用文案保持；本次没有更改guard或业务行为。

当前构建后增量应记录为两项：inventory局部keydown撤回，以及本次三语六key文案；zh/vi的Online修改属于此前已审内容，不重复列入。guidance **9/9通过为父线程/Jason报告**，本人未重跑或独立读原始日志。未来6ede业务日期合入不在此审查树内，本次未合并、构建或提前H5同步。

## R14构建前最终增量：320未领取紧凑CSS与平台文案

当前HEAD为`ff01591fb40a9add42b961199e1ab4cc5bc3a735`。本次仅复核[Hero末尾六条未提交CSS](../../../src/components/trial-hero-banner.vue#L226)，并读回前述平台六key；不扩展为当前HEAD的远端合入审查。**此增量源码9.2/10，无新增P2，未发现明显业务或布局退化。**

- 六条选择器均限定≤350、embedded且非lifecycle，`:not`中的class计入优先级，能覆盖较早的普通embedded/long-copy规则。领取后及满容量特殊卡不命中；360/390均不命中。390批准的184px、118px图、默认字样及CTA样式没有因这六条改变。
- badge改11.5/16、标题13/18及6px上距、说明11/16，meta上padding12；保留完整三语内容、自然换行及overflow-wrap，没有ellipsis/line-clamp或固定最大高度。未改原height:auto/min-height200，长文案仍可增长。
- 图片仅去掉底部8px margin；原92×92外盒/内图、aspect与order2保持。meta为order1、CTA为order3，该未领取分支仍是文字→机型图→领取操作。没有压缩图片换取高度。
- CTA改12/16、左右padding10、左右margin12/底margin10、max-width减24；相较原规则增加可用文字宽度，保留继承的min-height44及box-sizing规则。没有用缩小触区换取紧凑；两行文字仍允许自然增长。父级grid stretch与券卡height100%不变。
- 当前未提交diff没有template/script变更，原onClick、canClaim、canRestart、重试及aria/禁用保持。平台六key也与上一节一致：Android限定于手机本机算力的校准/激活/运行，不改整个APP平台承诺或guard。

已读[A的原r13视觉报告](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/compact-r13-visual-a/priority-review-r13-visual-a.md)：320VI双卡138×283.33、未领取胶囊两行及券空白，8.7 OPEN。六条CSS缩减的是该路径的字体/空距，方向与其建议一致；**尚不能仅由源码推算新实际高度或宣布8.7视觉已关闭**。保留既定r14实景复核，不增加新矩阵。

当前Hero原始SHA-256：`0ee99de841898af5fc092e0c70af49cec8d35e9f42fc5da5da5dc1b2bafd6a3e`。r13构建后增量历史现在还包括本六条CSS，不再使用“只有inventory/平台文案”的旧清单充当最新状态。本人本次只读源码/报告并更新此仓外文件，没有运行测试、构建、浏览器、合并、提交或H5同步。
