> 归档分类：**SOURCE-ONLY（仅源码审查）**。原报告评分只适用于其注明的源码范围，不代表视觉、构建或真实运行验收。

# R16 钱包余额字号：独立源码复核

2026-10-27 13:23 UTC，Averroes。仅审 APP `src/pages/me/wallet.vue` 新余额增量；HEAD `ff01591fb40a9add42b961199e1ab4cc5bc3a735`，文件 SHA256 `43039aebc84e3ad9bae60724777a797d2880f5b21d4ab6b6add4458e936b1b29`。

**有限源码评分9.2/10；未发现新增P2或必须修改的阻塞项。** r16尚未构建，本人未运行测试、浏览器或构建。此分仅评价余额展示增量；同文件已有的r15恢复按钮不重审、不改签，r15报告保持原样。

## 源码结论

- [wallet.vue:246](../../../src/pages/me/wallet.vue#L246) 的 `usdtBalanceLabel` 与原模板表达式等价。仍由180行 `fundsReadable || remoteWalletReceiptHasSnapshot` 判定可读，没有权威快照时显示 `—`，已确认0仍显示 `$0.00`；没有放宽账号/快照读取条件。computed同时供模板和字号计算使用，有实际复用。
- 124行仍导入 `formatFinanceAmount as formatAmount`，调用路径仍为 `app.user.usdtBalance → formatFinanceAmount → 原两位小数/分组格式`。美元符号、分隔符、负号和小数文本未截断或替换为K/M；USDT标题、UVT次行及读取/资金操作入口均未改，也没有写回原金额。精度规则仍由已有formatter负责，本次不新增金额舍入。
- [heroStyle:336](../../../src/pages/me/wallet.vue#L336) 左右margin16px、padding2px，合计36px；当前AppChassis固定铺满viewport、内容无额外横向padding，所以 `100vw - 36px` 与现有余额内容宽度一致。仅此页面使用该公式，无需为未出现的窄容器提前引入测量或共享抽象。
- [heroNumStyle:347](../../../src/pages/me/wallet.vue#L347) 保持原600字重、字体、颜色、tabular数字和字距；56px改为响应式字号，line-height为1.15且不换行。没有新增固定文本高度、ellipsis、overflow隐藏或缩放transform。原AppChassis自身仍横向裁剪，因此不能把“文本节点完整”误当“任意金额均已实景完整可见”。

## 公式边界与有限建议

以下仅按源码算术推导，不是DOM或原生测量：

| viewport | 常规短金额字号 | 17字符金额（如 `$1,234,567,890.12`）字号 |
| --- | --- | --- |
| 320px | 30px | 约25.70px |
| 360px | 33.30px | 约29.32px |
| 390px | 36px | 约32.04px |

外层 `min()` 允许长金额低于30px；30px不是所有金额的硬下限。这符合本次“完整金额按剩余宽度收紧”的实现意图，不建议未经实际失败就加硬下限、删小数或引入省略。`label.length × 0.65` 是含符号/逗号/小数点的字宽预算，不是实际字体测量；字体加载/回退与原生文字缩放仍属运行边界。

建议下一构建只补本项必要实景：320/390的常用余额与一条足以触发收紧的长余额，读回字号和左右边界；保留一个无快照 `—` / 已确认0的语义对照。复用父线程现有明暗审查即可，不要求重复历史矩阵或扩展其他金额页面。无实际溢出证据前，不建议加ResizeObserver、自动截断或额外金额校验。

已有 `wallet-held-authority.behavior.test.ts` 采用真实SFC并断言金额、舍入及原数据不变；本轮只读其相关部分，未运行，不能宣称新绿。原生APP字体/放大设置及本轮视觉分尚未覆盖。

只新增本仓外报告；未改产品、r15报告、测试、提交或推送。

## R16追加：B-R15-P2-01文档根滚动条

2026-10-27 13:34 UTC，仅补审 [tokens.css:657](../../../src/styles/tokens.css#L657)、[660](../../../src/styles/tokens.css#L660) 的两个selector新增 `html, body`。**本增量源码9.2/10，无新增P2；未发现阻断滚动的改动。** B此前报告的邀请页正常恢复后文档根占用15px滚动条，保留为待新构建运行复验的历史，不能以源码分代签视觉关闭。

- 声明仍只有 `scrollbar-width:none` 及 `::-webkit-scrollbar` 的 `display:none; width:0; height:0`。零宽高作用于滚动条伪元素，不是html/body本体；没有增加 `overflow:hidden`、height限制、fixed定位、touch-action或事件拦截，原文档滚动范围及触摸/滚轮/键盘滚动机制保留。此处隐藏轨道也意味着不再提供轨道拖拽，属于本次明确要求的结果。
- 新增根选择器覆盖实际scrollingElement在html/body的情况，补齐仅后代容器选择器不能命中祖先viewport的缺口；不是继续给ref/code内容容器加滚动锁。
- [main.ts:20](../../../src/main.ts#L20) 在应用入口导入tokens。[prototype-preview.html:11](../../../scripts/prototype-preview.html#L11) 将应用置于独立iframe文档，外层使用自身内联样式且未导入tokens；CSS选择器不会越过iframe去隐藏外层控制面板的滚动条。同源不改变这个CSS文档边界。
- 源文件字节核对：将新增的两处 `html, body, ` 仅在内存中移除后，tokens SHA256恢复为r15已审的 `ba9d4f1d07aafd8027b8be7274279c44b443d645a0f0a9d85d290819d85ca9aa`；未发现其他tokens增量。当前tokens SHA256为 `fb2154a1e2f99607552357cba2db0abe91cfaa177125e9e16579e417a507bb3b`。钱包SHA256仍为本报告顶部原值，未变。

最小运行边界：统一新构建后，复验邀请页恢复成功时原15px占宽消失、内容仍可滚至底部，以及外层preview面板不受影响即可；本次未执行这些操作，也未构建。只追加本报告，r15报告及其结论不变。

## R16追加：邀请页、试用卡与已签到按钮

2026-10-27 13:54 UTC，基线已为 `ddcea906d62e8242815e5af104ac1574bfa486a2`。本段独立审核当前ref/code、trial-hero-banner、daily-check-in-row及zh/en/vi三份文案，共6文件增量。**本范围源码9.1/10，无新增P2阻塞；不签预览或原生实景。** 前面钱包/滚动条结论及r15历史不变。

| 范围 | 只读结论 |
| --- | --- |
| 邀请资格与入口 | [ref/code.vue:65](../../../src/pages/ref/code.vue#L65) 的未登录referral/ordinary及已登录enter三条CTA条件、handlers、键盘事件不变；rewardEnabled、礼包金额来源、邀请码归属、读失败重试及卸载generation均无业务diff。已登录只隐藏法律同意前缀，三个真实法律链接仍有role/link、tabindex、44px高度及原目的地；没有隐去链接或跳过注册校验。 |
| 邀请布局与三语 | CTA由内联 `width:fit-content;max-width:100%;min-height:44px;margin-left:auto` 驱动，优先于保留的普通w-full utility；父节点为正常块流且按钮是flex，右对齐成立，长文可增加高度。福利说明有min-width0和自然换行；三条非礼包文案缩短，Android校准/启用仍在，没有增加24/7或收益承诺；礼包行仍按原开关保留。平台统计只去掉卡背景、改分隔排版，verified来源与未知 `—` 不变。 |
| 试用产品条件 | [trial-hero-banner.vue:58](../../../src/components/trial-hero-banner.vue#L58) 的canClaim、visible、capacityFull、canRestart、cardEntry及onClick脚本无改动。产品缺货/容量满/无资格未被短文案绕过；已领取embedded仍按 `cardEntry` 隐藏独立CTA，整卡去既有试用/设备目的地，只有符合原重启资格时打开领取面板。 |
| 试用CTA与事件 | [21行](../../../src/components/trial-hero-banner.vue#L21) 仅正常embedded可领取且非容量满时显示“领取 / Claim / Nhận”，aria仍是完整ctaText；loading、缺货、不可领取、管理设备保持原状态文案。外根min-height44，普通一行短label的子表面16px行高+上下8px=32px，并定位右下。新增surface没有role/tabindex/handler；click.stop仍在原按钮根，整卡`.self.prevent`与嵌套retry停止冒泡不变，没有新增第二次键盘激活。 |
| 单层玻璃、机型与主题 | 原LiquidGlass从CTA根移到唯一的 `.trial-cta__surface.nx-design-glass`；根不再带玻璃类，也没有第二个LiquidGlass或额外backdrop。装饰层pointer-events:none，子层不抢按钮操作。embedded机型及其素材均固定118×118，没有320/语言缩图规则；floor位于art内部，两个动画同为4.2s、同相位，reduce-motion同时停用。卡底/地板/文字跟随现有明暗token；完整机型名、badge天数、无需付款、抵扣金额/未知值保留，仅删重复“免费体验”。 |
| checked签到 | [daily-check-in-row.vue:9](../../../src/components/home/daily-check-in-row.vue#L9) 的checked条件仍是remote ready且真实checkedInToday。仅checked改勾形图标；完整checkInLabel继续供NxButton aria，svg不再成为焦点。原checkIn、submitting、账号/visit/隐藏隔离均未改；已签到仍进入daily，未签到仍走原命令。NxButton的busy/disabled/tabindex/repeat过滤继续有效。 |
| 签到尺寸与CSS优先级 | checked根44×44，常规padding4配36圆面，≤374 padding6配32圆面；checked后代选择器比NxButton medium样式更具体，padding0与固定圆面不会被原8px/16px撑大。原生svg wrapper明确18×18并限制max，内svg100%。primary分支使用品牌底色，并不创建LiquidGlass，故没有双玻璃。 |

精确覆盖边界：

- 试用32px可见面针对正常短label；不可领取等完整状态文案仍允许换行，`min-height:32px`并非所有文案强制32。未据此删状态文字。右下按钮与118px素材的实际留白、双卡最终高度、10px紧凑倒计时可读性，留给本轮A/B；本源码分不声称所有状态已经实景容纳。
- 签到圆面/图标改造确实checked-only；但新公共 `.daily-check-in-row__action {align-self:start;justify-self:end}` 也作用于未签到按钮。其原文案、常规字号/40px表面和44px触区保留，多行副文案时由居中改为顶部对齐，因此不表述为“未签到所有CSS完全没变”。目前未见此对齐引起的确定阻塞，不建议为理论风险扩展改造。
- 父线程报告5文件68通过、Noether报告3文件28通过；本人未运行或读取这两次原始测试日志，不将转述数量当独立实跑证明。未打开浏览器、构建、修改产品或预签视觉。

本次源指纹：

| 文件 | SHA256 |
| --- | --- |
| ref/code.vue | `0e3fd2fb4a642cd1e87c29cb126b346d3579be101ef5aa3a35acb58a64241d55` |
| trial-hero-banner.vue | `2cbbaef10063133c01fc37fe5f859f55d80f91e2607dfec14de0dc3190cefe3e` |
| daily-check-in-row.vue | `cdbec792e74090dcfa464644e585372464d9d7e0506b760f5e9faafb0cc166c3` |
| messages/zh.ts | `a0cef52e777388bd3d6d24fd267b2e0fad1873a3cd5d5080e7ec0bf41995721f` |
| messages/en.ts | `ae0c163f51ad24419018a423e3022d3f7ad60de3afd373ed6521088c56f7f31b` |
| messages/vi.ts | `99d13d0afa8dd62ea6fcacbf64722b3cac3cfc987f374802f940ba8ebca4a3c1` |
