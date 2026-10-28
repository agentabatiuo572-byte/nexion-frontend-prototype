# R14 错误卡实体恢复按钮：只读收尾清单

读取时间：2026-10-27 12:50 UTC。源头为 `D:/WORKS/PLAN/.wt/uvel-design-20261025-app` 当前工作树；不是冻结构建或浏览器实测。只枚举读取失败、读取降级块中的次级恢复按钮，不改生产、不跑测试/构建、不提交，也不修改既有总结或评分。

本次通过 `rg` 搜索 retry/Retry、翻译键、按钮绑定，再核对模板的实际失败分支、内联样式及共享 CSS。**优先清单为下列 11 个文件中的限定分支**；右侧已有实体按钮另列，不能混称左下/整行问题。

## 对齐基准与最小做法

[terms.vue:398](../../../../src/pages/onboarding/terms.vue#L398) 当前 `.tos-fail__retry` 已是 `display:flex; width:fit-content; min-width/min-height:44px; margin:8px 0 0 auto`，背景移到 `::before { inset:6px 0 }`，形成 **32px 可见面、44px 实际命中区**。这一项不再列为遗漏；此处仅确认源码，不签视觉。

- 在对应失败分支添加局部恢复按钮类，采用同样的 32/44 分层；有边框/玻璃材质时也把可见边框与材质收进 32px 面，避免仅去背景、44px 外框仍显大。
- 文字正常流在上，按钮在下靠右。用块级 `display:flex` 配 `width:fit-content; margin-left:auto`；父级本身是纵向 flex 时可用 `align-self:flex-end`。**只给现有 `inline-flex` 加 auto margin 并不能保证右对齐。** 不绝对定位到卡角，避免压住越文长文案。
- 44px 热区、现有 role/tabindex/aria-disabled、busy、点击/键盘处理不变。按钮文字不压缩；沿用既定重试文字规范。不要把点击节点直接降为 32px。
- 不全局修改 `NxButton`、`.reward-cta`、共享提交样式或 `.nx-inline-recovery`；下表明确标出的共用样式必须按恢复分支局部覆盖。

## 优先：左下或整行的实体恢复按钮

| 文件、实际绑定/选择器 | 当前源码依据 | 最小修改范围 |
| --- | --- | --- |
| [components/how/how-published-content.vue:8](../../../../src/components/how/how-published-content.vue#L8)，`languageFallback` 块和 `v-if="error"` 内的 `[role="button"]`（第二处在34行，无专属类） | 两处均内联 `min-height:44px; background:var(--v5-brand)`，块级 flex 自动铺满，位于提示文字下方；错误卡本体另有 surface-2 背景。 | 两处各补局部类，取消按钮整行拉伸，32面/44hit、右下。共享组件可覆盖 genesis、wallet-exchange、wallet-repurchase 的已发布说明页，不改这些页面主 CTA。 |
| [components/team/reward-published-guide.vue:8](../../../../src/components/team/reward-published-guide.vue#L8)，语言降级及错误块的 `.reward-cta`（第二处33行） | 分隔式读取提示下方左对齐。真实玻璃样式来自 [reward-page-surface.vue:13](../../../../src/components/team/reward-page-surface.vue#L13)：`min-height:44px; padding:11px 18px; border:1px; background:var(--reward-glass)`，不是纯文本。 | 只给这两个恢复节点加 modifier，收窄玻璃面并右下；保持末尾 `.reward-cta--wide` 返回入口和其他奖励 CTA。影响 binary-how / unilevel-how 共用内容。 |
| [pages/team/commissions-how.vue:11](../../../../src/pages/team/commissions-how.vue#L11)，读取失败/不完整提示内 `.reward-cta` | 同上共享玻璃44px及上下 padding；当前是文字下方左侧的局部恢复按钮。 | 只覆盖该 `!state.loading` 恢复节点；不要改正常说明页 CTA，也不要把 loading 分支新增按钮。 |
| [pages/staking/how-it-works.vue:82](../../../../src/pages/staking/how-it-works.vue#L82)，FAQ内 `:style="retryStyle"` | [213行](../../../../src/pages/staking/how-it-works.vue#L213) `minHeight:44px; background:var(--v5-brand)`；父级纵向 flex，按钮默认横向拉满。触发仅 `exchangeReadFailed && !staking.remoteError`。 | 该读取恢复节点 `align-self:flex-end`、固有宽度、32面/44hit。保留下方 `goStaking` 主入口；不是兑换提交重试。 |
| [pages/store/store.vue:59](../../../../src/pages/store/store.vue#L59)，`[data-testid="store-catalog-error"]` 内 `:style="catalogRetryStyle"` | [388行](../../../../src/pages/store/store.vue#L388) `minHeight:44px; padding:0 14px; background:var(--v5-brand)`；`inline-flex mt-3` 位于卡文案下方左侧。 | 只改无商品的读取失败卡按钮，采用基准右下规则；不改 promotion 的纯文本右槽，也不把正常推荐 SKU 不可用时的 `goalFocusRetryStyle` 当读取失败。 |
| [pages/store/bundle.vue:42](../../../../src/pages/store/bundle.vue#L42)，`[data-testid="bundle-catalog-error"]` 内 `:style="catalogRetryStyle"` | [779行](../../../../src/pages/store/bundle.vue#L779) 可见/命中同为 `minHeight:36px`、品牌背景；卡下左侧。**51行 `retryReceiptWrite` 也共用此 style。** | 仅42行读目录/策略失败节点采用32面/44hit并右下；不得直接改共用 style 导致回执写入恢复按钮一起变化。 |
| [pages/me/wallet-cards.vue:21](../../../../src/pages/me/wallet-cards.vue#L21)，`[data-testid="wallet-cards-retry"]` / `refreshRetryStyle` | [227行](../../../../src/pages/me/wallet-cards.vue#L227) `minHeight:44px; marginTop:8px; background:var(--v5-brand)`；位于刷新失败卡左下。 | 对此读取恢复按钮右下+32面/44hit；不改绑定、删除、新建卡入口。 |
| [pages/me/wallet.vue:60](../../../../src/pages/me/wallet.vue#L60)，三处失败卡 `:style="retryFundsStyle"`（60/66/72行） | [400行](../../../../src/pages/me/wallet.vue#L400) `display:inline-flex; minHeight:44px; marginTop:10px; background:var(--v5-surface)`，均左下。188–198行实际 handler 读取 fleet、释放详情、收益，未提交资金交易。 | 可在这三个读恢复节点统一右下及32面/44hit；不扩展到付款/提现/兑换操作。 |
| [pages/me/wallet-repurchase.vue:60](../../../../src/pages/me/wallet-repurchase.vue#L60)，**仅历史读取失败卡** `:style="retryCtaStyle"` | [610行](../../../../src/pages/me/wallet-repurchase.vue#L610) `display:flex; minHeight:44px; marginTop:12px; background:var(--v5-surface)`，整行；该节点调用 `repurchase.refreshHistory()`。49行原命令恢复和52行页面入口也共用 style。 | 只给60行历史读取按钮局部类/局部覆盖；不改 `handleRepurchase`、`.nx-repurchase-submit-cta` 或共用对象的其他消费者。 |
| [components/me/deposit-usdt-pane.vue:115](../../../../src/components/me/deposit-usdt-pane.vue#L115)，`.nx-dep-history-retry` | [652行](../../../../src/components/me/deposit-usdt-pane.vue#L652) `minHeight:44px; padding:0 26px; background:var(--v5-surface-2)`，`grid` 块级横向铺满；仅最近入金记录读取失败，handler重新读列表。 | 只改 `.nx-dep-history-retry` 为固有宽度右下+32面/44hit；同对象用于31行 `.nx-dep-retry-cta` 大居中空态，后者不在本轮。 |
| [pages/daily/daily.vue:184](../../../../src/pages/daily/daily.vue#L184)，history卡失败节点及159行余额读取提示 `:style="retryBtnStyle"` | [962行](../../../../src/pages/daily/daily.vue#L962) `minHeight:44px; background:var(--v5-surface-2)`；下方两个恢复节点是左侧 `inline-flex`。21行头部失败条也用同对象。 | 下方恢复分支局部右下+32面/44hit；不给正常签到/积分转换按钮套此样式，头部右槽按下一节另判。 |

## 已右对齐的实体恢复按钮：不误报为左下/整行

下列源码仍有实体背景，但已在 `justify-between` / 右侧动作槽。**不是第一节的左下/整行问题**。若同轮统一这些错误卡的实体面高，最小动作是32面/44hit及需要时右侧底对齐；保持原文案区与右槽，不为了“右下”强制另起整行。不能把它们与无背景的纯文本右槽混为一谈。

| 文件、绑定/选择器 | 实际尺寸/背景与边界 |
| --- | --- |
| [pages/me/security.vue:22](../../../../src/pages/me/security.vue#L22)，`remoteSecurityRetryStyle` | 1119行：`minHeight:44px; padding:0 10px; borderRadius:7px; background:var(--v5-surface-3)`；安全资料读取提示右侧，非手机修改提交。 |
| [pages/me/rewards.vue:26](../../../../src/pages/me/rewards.vue#L26)，`retryBtnStyle` | 259行：44px面/命中，surface-2；汇总读取失败行已右对齐。 |
| [pages/me/rewards-list.vue:31](../../../../src/pages/me/rewards-list.vue#L31)，`retryBtnStyle` | 474行：44px、surface-2；优惠券及列表刷新/补页读取恢复，需保持各自 loading/追加读取入口，不能改领奖按钮。 |
| [pages/store/orders.vue:22](../../../../src/pages/store/orders.vue#L22)，`retryBtnStyle` | 339行：44px、surface-2；每个不可用订单来源各有右槽，不能挪成整张多来源卡共用一个新恢复行为。 |
| [pages/store/order-detail.vue:24](../../../../src/pages/store/order-detail.vue#L24)，`retryBtnStyle` | 749行：44px、surface-2；现有订单的读取刷新提示，非支付/退款重试。 |
| [pages/daily/daily.vue:21](../../../../src/pages/daily/daily.vue#L21)，`retryBtnStyle` | 顶部错误条已右对齐；与上节下方卡共用44px面，不能按同一个 margin 修改所有位置。 |
| [pages/ref/code.vue:77](../../../../src/pages/ref/code.vue#L77)，`.ref-preview-status > .ref-preview-retry` | 429行：44px、surface；父级flex、文字flex:1，动作已在右侧。该区域也有 loading/disabled，不改注册/进入App主 CTA。 |
| [pages/me/wallet-bills.vue:25](../../../../src/pages/me/wallet-bills.vue#L25)，`retryBtnStyle`，另87/93行 | 443行已经是32px可见面，命中也只有32px；父级及 `appendErrorStyle` 均右对齐。**不用再降低面高**，如收口应仅扩到44hit，保持32面和原读/补页动作。 |
| [pages/team/network.vue:12](../../../../src/pages/team/network.vue#L12)、[tree.vue:12](../../../../src/pages/team/tree.vue#L12)，`.nx-inline-recovery__action` + `retryStyle` | 虽有 inline-recovery 类，399/123行仍内联 `background:color-mix(...6%,transparent); border:1px solid ...; minHeight:44px`；tree另有 `padding:8px 16px`。共享 inline-recovery CSS没有清除背景/边框，因此**这两处不是纯文本**。已在右槽，无需推翻grid；如统一实体面，将该局部边框/底色收进32px面即可。 |

## 明确不纳入这次实体错误卡改动

- `EmptyState`、`PageLoadError`、商品详情冷启动整页错误出口、checkout主流程、wallet-address-rebind整页入口：保留全页恢复/主CTA布局。`trial.vue .trial-read-state`、`leaderboard.vue .leader-state` 是整段主体读取/暂停替代态，本次不据其44/48px按钮直接扩大为卡内次级动作改造；leaderboard共用 `.leader-cta` 更不可全局缩小。
- `bundle.vue` 的 `retryReceiptWrite`、`wallet-repurchase.vue` 的 `handleRepurchase`、登录/付款/转账/提交/发送失败重发，以及重新测验、普通加载更多/刷新：不纳入读取错误卡统一。
- `nx-inline-recovery` 的**真实纯文本**右槽，包括 Earn、活动/促销、quota、service-message-list、trust 等已采用 text/无底恢复节点：不新增实体按钮、不改变横排。不能只看类名判断，network/tree例外已单列。
- achievements 的 `retryBtnStyle`、goals 的 `recCtaStyle`、trust/nex 的 `retryStyle` 实际没有按钮背景；events/detail `.event-action`、genesis-raffle `.raffle-link` 也无实体背景。即使布局偏左/整行，也不作为本轮“实体按钮过大”遗漏。
- store/detail `.product-material-retry` 为仅描边、无填充按钮，不混入实体背景清单；register/success `.rs-retry` 是 H5 条件编译的下载配置恢复，留到 H5 专项，不借 APP 本轮扩改。
- 不改 `reward-page-surface.vue` 全局 `.reward-cta` 或 `nx-button` 组件：它们包含返回、正常导航及其他业务CTA。本报告涉及的是上表明确的读取恢复消费者。

本次无浏览器、无运行几何/触区实测，不给视觉分或业务重签。仅写本仓外清单；所有先前签署范围及历史失败证据保持原样。
