# 独立审查 B / Pauli：全站弹窗 Home Indicator 安全区

审查日期：2026-10-26（Asia/Tokyo）。源码仓库：`D:/WORKS/PLAN/.wt/uvel-design-20261025-app`。基线 HEAD：`31cb5ba4afe4e1194492fa72b6bc5fe10e115b59`，审查对象为其上的未提交工作区 diff，最后复核统计为 33 文件、122 行新增、33 行删除，包含区号列表显式高度修复。评分不代表该 HEAD 本身含有修复。

**最终结论：本轮代码评分全部达到9/10，维持下表逐类评分；已独立核对runtime JSON全部27条记录及最终country截图，country两组末项几何满足安全区要求，接受该缺陷在已测场景下关闭。没有确认的未修复代码阻断问题。签核仅限源码与本地模拟环境中有证据的布局状态，不代表原生、真实业务或所有弹窗分支运行通过。**

最终收尾时只读确认APP HEAD已快进到 `b098bb68e5606491756262532c58b8ce03b7e7b8`；原始审查基线和上面的diff统计保留为历史快照，不伪装成合并远端后的完整代码审查。图片、tokens、country三个修复文件SHA-256与本报告记录仍一致。主agent报告H5整合到 `0c2a14b`，本审查未独立检查H5仓库或执行同步。另已读取[主报告](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-overlay-safe-area.md)，其19类实景与未覆盖状态作为主agent记录保留；最终build/types及提交发布由主agent处理。

审查方式为只读源码、diff、本地 uni-app 依赖实现和已有文件截图；没有操作浏览器、没有修改产品代码。本次仅写本报告，未提交或推送他人工作。

## 证据等级与边界

- **S：独立静态复核。** 已读取当前完整修改及相关模板、CSS、调用方；最新复核包括 `aspectFit` 图片预览、picker 内容区高度、NxSheet footer/nofooter，以及区号列表的显式高度、72px头部预算和uni-scroll-view内部高度规则。`git diff --check` 本次通过。CSS 算式与依赖实现证明属于 S，不是 DOM 实测。
- **R：主 agent/用户转述的运行记录。** 保留聊天及主报告信息；未在JSON中出现的目标距离仍仅为R级，不提升为独立核对的原始记录。
- **J：已独立核对导出的运行数据。** [safe-area-runtime.json](D:/WORKS/PLAN/.wt/uvel-design-preview/safe-area-runtime.json) 共27条记录，scope明确为本地mock原型，无原生设备或真实服务。已逐条读取、核对排除说明及距离算术；原始数据由主agent采集，本审查没有操作浏览器重测。JSON没有每条记录的源码/构建指纹或采集时间，不能仅凭它认定所有记录来自远端整合后的最终构建。
- **V：独立查看已有截图。** 已查看 [海报短屏截图](D:/WORKS/PLAN/.wt/uvel-design-preview/safe-area-poster-short.png)，图像尺寸 390×420，复制链接行完整可见，底部留白可见。截图不能单独证明 inset 值、51.9px 测量、点击成功或与最新源码一致。
- **V（country补充）：** 已独立查看 [country最终截图](D:/WORKS/PLAN/.wt/uvel-design-preview/safe-area-country-final.png) 与 [country初始旧图](D:/WORKS/PLAN/.wt/uvel-design-preview/safe-area-country-vi.png)，两图均为320×568。最终图末项“沙特阿拉伯 +966”完整可见，底部有清晰留白；旧越南语图末项贴近Home Indicator，仅作修复前问题记录，不作最终通过证据。两图语言不同，不作逐像素对比；最终图对应哪组inset未由截图自身证明。
- **T：主 agent 报告的构建/测试。** build、typecheck、235 tests 通过为聊天中收到的信息，本审查未重跑、未独立读取日志；该消息早于最新图片/picker/区号列表修复，不能自动视为覆盖最新源码。随后主agent已报告country最终构建两组复测结果，本报告据此更新country几何结论，但不推断最新构建又重跑了全部235 tests。

以下三个文件的 validation 均明确为静态检查/运行待验；本次读取了其元数据与 validation 摘要，不将它们认作runtime JSON。其后续运行补充以文末J级附录为准：

- [root inventory](D:/WORKS/PLAN/.wt/uvel-design-preview/safe-area-root-components.json)，生成于 2026-10-26T06:18:34.279Z。
- [pages inventory](D:/WORKS/PLAN/.wt/uvel-design-preview/safe-area-pages.json)，生成于 2026-10-26T06:15:33.871Z。
- [nested inventory](D:/WORKS/PLAN/.wt/uvel-design-preview/safe-area-nested-components.json)，生成于 2026-10-26T06:21:27.911Z；其历史模板未变声明不应用于后续 `widthFix` → `aspectFit` 修复。

## 最终逐类代码评分

满分 10，低于 9 为必须整改。下表是当前源码的设计/交互评分；运行列单独表达证据状态，不以缺失证据伪造运行分数。

| 类别 | 代码评分 | 独立代码结论 | 运行证据状态 |
| --- | ---: | --- | --- |
| 浮动 sheet 外部 gap | 9.2 | 地球浮动面板由外层承担底部安全区，内部为普通 20px 内容间距，未重复加入安全区；面板有高度约束和滚动 | 本轮未收到该场景原始运行证据 |
| 贴底 sheet 内部 safe padding | 9.2 | bottom:0 与内部安全 padding 职责一致；新增 border-box/限高包含 padding；原 env+38px 未再外加 gap | R：规则、voucher、trial 的末尾距离支持所报场景 |
| 居中 modal 短屏滚动 | 9.1 | 全局确认框直属子项禁止收缩，卡片自身可滚；主题/昵称限高，收据正文 min-height:0 可滚 | R：theme 外框距底79、globalconfirm按钮156.6；长内容、昵称键盘仍待核验 |
| flex 布局与内容末按钮 | 9.1 | 分享类头部不收缩，正文允许收缩并滚动；没有发现此次新增固定操作区遮住正文末项 | R：分享展开规则滚到底、规则及 policy links；语言选择与slot嵌套列表待验 |
| 双重 padding 控制 | 9.3 | 未发现同一手势安全区被内外两层重复相加；普通内容间距加一次safe不是双重安全区 | 已报数值未显示明显异常，但需JSON标明具体节点与computed style |
| NxSheet 无 footer | 9.3 | 安全区由面板承担；body min-height:0/overflow-y:auto；实际四处调用均无footer | R：320×568 policy links滚到底距底43.8；该条未注明inset，不补写 |
| NxSheet 有 footer | 9.2 | footer移除旧env补偿，仅保留普通16px；header/footer flex:none，body可收缩，安全区仅面板计一次 | 未收到有footer夹具实景；不以无footer记录替代 |
| 分享海报操作区 | 9.3 | 保存/复制/渠道均在滚动body；头部固定高度，面板安全padding不被正文占用 | R：390×420 inset34复制链接51.9；V：已查看截图；最后渠道和失败重试待证据 |
| 客服图片预览 | 9.2 | aspectFit配合明确width/height，图片flex:none，关闭按钮flex-shrink:0；原纵向压扁问题源码闭环 | 修复后的正方形/竖长图实景尚未提供 |
| H5 picker | 9.1 | 限高覆盖移动/短屏分支；内容区高度扣除顶部安全距、底部预留及45px标题栏，避免保持固定238px挤出面板 | 最新修复后的滚轮选择、确定/取消、短屏表现尚未提供 |
| 区号列表 uni-scroll-view | 9.1 | 显式height扣除72px头部与面板实际底部padding，flex:none；移除旧max-height及列表底部padding，内部100%高度有确定基准 | J+V：最终320×568，inset0末项gap40.3125、inset34 gap58.3125，两组内部均滚到底；已测越界缺陷关闭，构建关联由主agent归档 |
| LiquidGlass 保持 | 10.0 | 当前diff未修改光学组件与玻璃样式文件；图片/安全区修复没有改变LiquidGlass渲染实现 | 此分数仅评价本次源码变更边界，不替代视觉对比 |

## 问题与最新修复核验（源码关闭不等于运行关闭）

### P2：区号列表内部滚动区越入安全区 — 源码修复已核对，最终两组几何复测支持关闭

主 agent 新报告：旧版 `.cc-list` 经flex布局后为308px，但uni-scroll-view内部仍按继承的max-height达到352px，进入底部安全区。这是R级运行缺陷记录，本审查没有独立复现；此前仅确认外层flex/min-height不足以证明内部滚动容器安全，旧版不得沿用当前修复后评分。

[country-code-sheet.vue:145](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/country-code-sheet.vue:145) 当前为 `flex:none`，使用明确 `height:calc(min(74vh,620px,100vh - top) - 72px - max(env(bottom) + 24px, overlay-bottom))`，移除了旧max-height和12px底部padding，仅保留左右16px。

独立源码核对结果：

- 72px对应当前拖动条4px加上边距10px，以及头部44px关闭按钮加上下padding 8px/6px，即14+58=72；此预算以当前标题不高于44px为前提。今后若字体放大/标题换行抬高头部，需要重新核对预算，不能只改标题尺寸。
- 扣除的底部值与面板实际padding-bottom完全相同；该处扣除是分配高度，不是再次添加padding，因此不构成双重安全区。
- 本地uni-components的内部 `.uni-scroll-view` 使用 `height:100%; max-height:inherit`。移除宿主旧max-height、提供明确height且取消flex收缩后，内部百分比高度有确定宿主基准，避免旧max-height与flex实际高度脱节。
- 在视口与固定定位包含块等高、顶部safe=12、真实env(bottom)=34的公式条件下：390×420的面板预算310.8px、底部padding58px、列表180.8px；320×568时列表290.32px。这些是算式，不是新实测，也不把token override自动等同于真实env。

新源码评分维持9.1。主agent随后明确提供最终构建的内部滚动节点数据（R）：

| 视口 | inset | 内部滚动区bottom | scrollTop | scrollHeight | clientHeight | 最后项目距视口底部 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 320×568 | 0 | 528 | 588 | 896 | 308 | 40.3125 |
| 320×568 | 34 | 510 | 606 | 896（最终JSON已提供） | 290 | 58.3125 |

对最终JSON的独立算术核对：两组scrollHeight均为896，inset0的588+308=896，inset34的606+290=896，均符合内部滚动到底。内部bottom分别预留568−528=40px、568−510=58px，与末项gap40.3125/58.3125及源码预算相符；末项比滚动区底边再高约0.3125px，没有借外层滚动把内部越界掩盖的迹象。

已独立查看并再次复核最终截图，末项完整、底部留白明确，视觉结果支持JSON中的修复数据。接受已报告的两个视口/inset组合下安全区越界修复；选择操作读回、其他视口和构建身份不由这组几何数据代证。无需仅为本报告重复已完成的测量，补构建关联归档即可。

初始 `safe-area-country-vi.png` 与旧308/352记录保留为失败历史；不得用于最终验收或套用修复后评分。最终country证据使用 `safe-area-country-final.png`，其SHA-256另列，当前源码SHA-256与前次修复复核一致。

### P2：widthFix 图片被单独限高压扁 — 源码关闭

[conversation-thread.vue:155](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:155) 已改为 `mode="aspectFit"`。[布局样式:404](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:404) 保留外层安全区，关闭按钮不收缩；图片为 `flex:none; width:100%; height:min(78vh, 可用高度减60px)`。

本地 uni-app 的 aspectFit 使用 `background-size:contain`，与旧 widthFix 的 `100% 100%` 不同。即使可用矩形变矮，图像也按比例适配，不再通过压扁绘制填满容器。评分由 8.5 提升至 9.2。仍需修复后截图验证实际图像比例及关闭操作；不宣称已实景复现修复结果。

### H5 picker：内部高度预算补齐 — 源码合理

[tokens.css:25](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/styles/tokens.css:25) 保留H5条件编译；移动/短屏条件对应本地依赖的桌面条件（宽高均至少500px）。新增内容区 `min(238px, 100vh - top - bottom - 45px)`，45px与本地依赖标题栏高度一致。底部padding只在custom容器计一次。

按390×420、底部inset34、顶部保底12的算式，内容区仍为238px，总高333px，小于408px面板预算；这是算式核对，不是运行测量。滚轮手势与最终选择读回需实景验证。

## 已收到的运行记录（R，保留原始语义）

距离单位为px。没有注明inset或目标节点细节的项目不推断补全。

| 场景 | 视口 | inset | 转述结果 |
| --- | --- | --- | --- |
| share取消 | 390×844 | 34 | 距底46 |
| share展开规则并滚到尾 | 390×420 | 未单独注明 | 取消距底45.6 |
| poster复制链接 | 390×420 | 34 | 距底51.9 |
| 规则末尾 | 320×568 | 0 | 距底52 |
| 规则末尾 | 320×568 | 34 | 距底70 |
| voucher/trial末尾 | 320×568 | 0 | 距底38 |
| NxSheet无footer，body滚到底 | 320×568 | 未注明 | policy links距底43.8 |
| theme | 390×420 | 未注明 | 外panel距底79 |
| globalconfirm | 390×420 | 未注明 | 按钮距底156.6 |
| country旧版缺陷 | 未注明 | 未注明 | `.cc-list`外层308px、内部352px，内部越入安全区；只保留为修复前失败记录 |
| country最终构建复测 | 320×568 | 0 | 内部bottom528、st588、sh896、ch308，末项gap40.3125 |
| country最终构建复测 | 320×568 | 34 | 内部bottom510、st606、sh896、ch290，末项gap58.3125；sh由最终JSON补齐 |

theme外框与globalconfirm按钮的距底值包含居中布局空余空间，不能直接解释成padding过大。上述距离也不能单独证明按钮点击成功、当前构建来源、图片比例或不存在横向裁切。

## 运行最终签核保留项

1. runtime JSON与最终country截图已独立核对。主agent归档每类证据对应的源码/构建身份；较早未变化组件记录保留原来源，不能改标为远端整合后最终构建采集。无需因报告收尾重跑已完成场景。
2. 不把JSON中的panel/controls坐标提升为点击成功、选择读回或资金业务成功；没有记录的目标测量在下方附录单独注明。
3. 保留主报告列出的未实景状态：原生APK/IPA和系统弹窗/图片预览、真实软键盘与触摸滚轮；H5框架picker、客服正方形/竖长图；两类验证码拖动、里程碑、创世门控状态、slot内外滚动、换机系列、设备PC菜单、汇率说明、推广离开确认、NxSheet有footer；质押恢复/不可用、海报生成成功全部渠道及重试。图片与picker代码修复不能替代这些运行证据。
4. 已核对的引导语言选择为320×568越南文三项列表；不推及字体放大或其他极短视口。未执行完整verify、原生真机或真实资金流程。本审查完成，不扩展范围要求主agent新增实测。

## 本次复核指纹

以下为读取时文件字节SHA-256，仅标识审查源码/截图，不是构建指纹。

| 文件 | SHA-256 |
| --- | --- |
| src/components/support/conversation-thread.vue | EBE2F09A608B5C1DCEA93746E4D8B1960633612C0A603EDFCDD80598C6101274 |
| src/styles/tokens.css | 53D79077B53ED1010832B43EFDB34DB60F4D81F1EDB0BB401688BE5676252FE6 |
| src/components/ui/nx-sheet.vue | D96DA0F2EA0DB25F6E7B89554ADC1AE2397E10EE012849E28CDD2607BF83D49E |
| src/components/country-code-sheet.vue | 0C74FB6419E5D0D5BFF38770DBFC14744179F0AE4E327C37A9407C34B45954FC |
| safe-area-poster-short.png | 100A0AC17B9EF09D1D06882D75A6AAC0B10916FD49AC2355720B83D3902F721A |
| safe-area-country-final.png（最终截图） | DD4914F7D4E1ACB3F06E4B4F622FC79C3A94F642314BA5A1C0AA6CEA425B2619 |
| safe-area-country-vi.png（初始旧图，仅失败历史） | A8A6E87B8CF6D725C1231D749009DE4C8A8D152F17243C2F59F8AED4C3694699 |
| safe-area-runtime.json | 5F7D25830682226325068DBDF968361062A0B94C83960CE6534B72F64C11CD36 |

## 最终运行JSON附录（J级核对）

已读取全部27条。按文件notes排除以下3条作为最终验收依据：

- `country-vi-320x568-inset0`：动画未稳定，仅诊断。
- `withdraw-fee-390x420-inset0`：动画未稳定，仅诊断；使用对应settled记录。
- `country-vi-320x568-inset0-settled`：虽已稳定，但为country修复前外层几何；最终使用两个 `country-final-end-*` 记录。

剩余24条是保留记录数，**不是24项全部通过**。`nickname-390x420-inset0`是滚动前基准，按钮负距底不能单独判失败，应结合`nickname-scrolled-*`；`voucher-320x568-inset0`测到内部卡片，不能替代`voucher-panel-*`整面板。滚到末尾后上部控件为负坐标是离开滚动视口，不自动认定布局故障。

保留记录的所有controls条目均满足 `viewport - bottom = bottomGap`（数值误差阈值0.01px），无算术不一致。country两组另核对了scrollTop/clientHeight/scrollHeight与lastBottom/lastGap。下表归并为主报告的19类；仅对实际记录的状态作结论。

| 类别 | JSON支持的事实 | 独立核对边界 |
| --- | --- | --- |
| 分享渠道 | inset34，844高取消gap46；420高展开末尾取消gap45.5729 | 顶部条目滚出视口不算失败；不证明全部渠道调用成功 |
| 分享海报 | 420高inset34，复制链接gap51.8646 | 与已查看截图相符；主报告明确为海报不可用回退态，非生成成功全渠道验收 |
| 邀请规则 | 568高inset0/34，操作gap52/70 | 两个操作同底边，记录支持该状态几何 |
| voucher | 整面板暂不领取gap37.9666，padding38 | 内部卡片记录单独保留，不误当整面板 |
| trial领取 | 568高末尾gap38 | 主按钮gap86，未证明领取业务提交 |
| NxSheet无footer | 面板约500高，padding24，关闭入口可见 | JSON无policy links坐标；此前约43.8/44px仍为聊天/主报告R级，不能称J级核对 |
| 主题选择 | 420高面板bottom341，外距79 | 不把外距当padding |
| 全局确认 | 按钮gap156.5833 | 居中布局，未退出账户 |
| 设备停用确认 | 返回gap38 | 未执行停用 |
| 昵称选择 | 滚前scrollHeight491/clientHeight356；滚后末按钮gap60 | 支持内部滚动可达，不证明软键盘 |
| 试用抵扣规则 | 知道了gap38 | 支持当前内容高度 |
| 质押配置 | 420高面板408高，内容630，末按钮gap67.2708 | 顶部关闭已滚出视口，不表示丢失；未提交质押，不覆盖恢复分支 |
| 收据 | 复制证明哈希gap84.1146 | 支持所记录目标位置，不证明实际复制读回 |
| 引导语言 | 越南文320×568，最后选项gap38 | 仅当前三项列表 |
| country最终 | 两组内部滚到底，gap40.3125/58.3125 | J+最终截图V支持已测几何关闭；旧图不作通过证据 |
| 团队成员 | 面板bottom约844，padding48 | controls仅关闭按钮，无末尾文字边界；完整详情显示为主报告R级 |
| 幸运转盘 | 面板396高，内容631，padding40 | controls为空，无末项坐标和scrollTop；主报告末奖池gap40为R级，JSON不独立证明滚到底 |
| 提现费用 | settled面板bottom约420，padding38 | 排除动画途中bottom512.1052的记录 |
| 产能说明 | 420高查看设备按钮gap40 | 支持该按钮安全距离 |

评分收尾：**逐类最终代码分维持9.1–10.0；未发现需要再改的确认代码问题。country已测越界缺陷关闭。JSON附录核对完成，允许主agent按上述证据边界汇总APP/H5交付；此意见不声称已执行推送、生产发布、最终构建复测或原生验收。**
