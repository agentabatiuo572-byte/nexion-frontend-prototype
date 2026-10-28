# R15 读取恢复卡与 slot 材质：独立源码审查

审查者：Averroes。2026-10-27 13:11 UTC。APP 工作树 `D:/WORKS/PLAN/.wt/uvel-design-20261025-app`，HEAD `ff01591fb40a9add42b961199e1ab4cc5bc3a735` 的当前未提交增量。

**本轮独立源码评分：9.2/10；未发现新增 P2 或以上阻塞。** 这是新 r15 的有限源码结论，不继承 r14 分数，不代表构建、视觉、真实设备或业务运行已通过。未运行测试、构建或浏览器，未修改产品、提交或推送。

范围：21 个读取恢复消费者文件、`tokens.css` 的新恢复类，以及追加的 `slot-action-sheet.vue`，共23文件。当前工作树另有旧 r14 home Online/hero 增量和 tokens scrollbar 段，本报告不重签这些旧项。Noether若自检后再改源码，新增差异不自动包含在此结论中。

## 读取恢复卡：9.2/10，无阻塞

| 核对点 | 实际源码结论 |
| --- | --- |
| 32可见 / 44触区 | [tokens.css:1093](../../../../src/styles/tokens.css#L1093) 的点击根为 `min-width/min-height:44px; height:44px; box-sizing:border-box`；背景及quiet/glass边框移到 `::before {inset:6px 0}`，即44−12=32px可见面。根无边框/背景，伪元素 `pointer-events:none`，没有把可点节点缩至32，也没有用负inset扩大到其他控件。 |
| 右下与文案空间 | 新下方按钮为 `display:flex; width:fit-content; margin:8px 0 0 auto`；纵向flex另有 `align-self:flex-end`。原有右槽使用 `--inline` 清掉上间距并底对齐，保留每个来源自己的恢复动作；没有绝对定位覆盖正文或强制所有横排提示另起整行。 |
| 后加载CSS | `main.ts` 先加载 tokens，再 inline-recovery、uno。network/tree使用双类组合 `.nx-inline-recovery__action.nx-card-recovery-action`，可压过后加载的单类display规则；`--inline`双类选择器后置控制margin。inline的字体高优先级规则同为600 13px/20px，没有冲回旧字号。 |
| reward scoped优先级 | [reward-published-guide.vue:8](../../../../src/components/team/reward-published-guide.vue#L8)、33及[commissions-how.vue:11](../../../../src/pages/team/commissions-how.vue#L11) 的恢复节点已移除旧 `.reward-cta`，不再匹配 `reward-page-surface` 深层选择器的11px上下padding和44px实体边框。新glass modifier明确保留原深灰材质、白字、箭头、focus及reduce透明度实底。末尾 `.reward-cta--wide` 返回按钮和共享reward样式未改；三个页面仍从RewardPageSurface继承材质变量。 |
| 共享交易样式 | [bundle.vue:51](../../../../src/pages/store/bundle.vue#L51) 的 `retryReceiptWrite` 仍用原 `catalogRetryStyle`，对象779行保留；只有目录读取42行脱离该对象。[wallet-repurchase.vue:49](../../../../src/pages/me/wallet-repurchase.vue#L49) 的命令恢复和52行入口仍用 `retryCtaStyle`，610行对象保留；仅历史读取60行换类。deposit仅115行历史读取换类，31行大空态与652行 `retryBtnStyle` 保留。没有把金融/回执写入恢复一起缩小。 |
| busy / 分支 / 键盘 | 32个读取恢复节点的handler、条件、role、tabindex及已有aria-disabled/keydown绑定不变。terms的repeat与loading守卫、wallet-cards的刷新busy守卫、orders的重复刷新守卫、referral加载时tabindex=-1和focus/disabled CSS保留；仅有click的节点继续使用既有全局键盘激活层。本轮没有新增局部keydown绕过全局层，也不把既有手写keydown误称为全部具备repeat/modifier保护。 |
| 小屏white-space | `nowrap`只落在按钮，不落在提示正文或卡根；没有新增截断/ellipsis/正文固定高。当前三语retry、wallet、staking标签已核对。wallet-cards仍保留原较长的catalogLoadingTitle加载文字，未改成交易成功文案或删busy；它的320VI加载态实际宽度应由本轮实景确认，源码审查不伪造测量值。 |
| 未误改范围 | NxButton、EmptyState、PageLoadError、reward-page-surface、inline-recovery及a11y-activate文件均无本轮diff。普通load-more、付款/提交/激活/发送、store推荐SKU普通入口未套新类；纯文本恢复条未全局增加底色。 |

已逐份读取的消费者：`how-published-content`、`reward-published-guide`、`commissions-how`、staking/how-it-works、store/store、store/bundle、wallet-cards、wallet、wallet-repurchase、deposit-usdt-pane、daily、terms，以及security、rewards、rewards-list、wallet-bills、orders、order-detail、ref/code、network、tree。被删局部样式未留悬空消费者；需要继续共享的对象保留。

## Slot追加修复：源码9.2/10，视觉8.6历史仍待复验

已读[A的r14 slot补充](../compact-r14-visual-a/slot-supplement/review-slot-r14-visual-a.md)：320VI浅色稳定态 `--nx-glass-fill` 为空、panel透明，原视觉 **8.6 P2 OPEN**。保留该历史，不以本源码分覆盖。

- [slot-action-sheet.vue:19](../../../../src/components/slot-action-sheet.vue#L19) 给实际panel加 `nx-glass-sheet`，使[glass-surfaces.css:26](../../../../src/styles/glass-surfaces.css#L26) 在同一元素定义fill：主题surface的98%底色叠加高光；reduce transparency / increased contrast继续用共享实底。**变量缺失的源码原因已补齐。**
- scoped `.sas-panel` 编译后的优先级高于全局单类sheet；[231行](../../../../src/components/slot-action-sheet.vue#L231) 显式 `border-radius:16px 16px 0 0` 可压住共享28px四角，不会把贴底两角变圆。共享类带入现有edge阴影，没有另加一层backdrop采样。
- 原max-height、overflow-y、`env(safe-area-inset-bottom)+38px`、滑入动画、44×44关闭根、36px可见关闭面、遮罩关闭、panel click.stop、dialog焦点管理，以及购买/激活/禁用分支全部未动。共享scrollbar规则只隐藏轨道，不改滚动。
- **只关闭源码原因；浅暗材质可读性仍由A/B在r15新构建复验。** 未点激活/购买、未验真实库存写入或原生安装。

## 快照与执行边界

- 恢复22文件摘要（slot加入前）：`078d076fb12c8dd251018c24bfa08452e6bfb0668015d786e7575546abde6ba7`。
- 含slot共23文件摘要：`a88eea3c5de4ef61158b77a398db4f6cebf6f685f0e28d36d0ae319533f6b28f`。
- 摘要算法：按 `git diff --name-only -- src` 顺序排除旧home/device-row与trial-hero-banner；每行 `文件字节SHA256小写 + 两空格 + repo相对路径`，LF连接且无末尾LF，再取UTF-8 SHA256。包含tokens当前全文件字节，审查范围仍按上述新段限定。
- tokens SHA256：`ba9d4f1d07aafd8027b8be7274279c44b443d645a0f0a9d85d290819d85ca9aa`；slot SHA256：`d1bed0cee05dd2edbfa62e6fc503f50c3b9934b72cb6ce68dbfe16544f352eb6`。

本报告仅由diff、真实源码、样式引用及已有A报告形成。无新构建指纹、运行尺寸、点击或测试通过记录；不替代A/B视觉、原生APP外接键盘及真实服务验收，不要求新增历史全矩阵。
