# 文字重试最终遗漏清单

2026-10-27。只读核对 APP `D:/WORKS/PLAN/.wt/uvel-design-20261025-app`，HEAD **e58039e57c9cc5192cc3fe5642b9ecac5564dce9**。本轮复查此前字体清单、显式 retry 类及其实际模板/词条；只写本文件，没有改源码、运行测试、构建、浏览器或提交。

结论：仍有 **7 个 APP 源文件**的同类读取重试没有完整落实 `600 13px/20px var(--font-v5)`，另有 **1 个 H5-only** 入口。下面区分明确的 12px 与缺失的字重/行高声明；“继承”是源码事实，不冒称已实测为 400、normal 或某个像素值，也不把本清单当全站视觉签署。

| 文件 / 实际入口 | CSS 依据及遗漏 | 最小处理边界 |
|---|---|---|
| [developer.vue:112](../../../src/pages/developer/developer.vue#L112)，文档读取失败 `t.network.retry` | 重试文字内联 **`font-size:12px`**；同文件 81/144/171 的申请结果、API 资源、Webhook 资源读取重试文字没有字体声明，`requestStatusStyle`（987）仅 padding/margin | 只补四处读取重试标签；不改申请提交、资源创建/删除或密钥轮换按钮 |
| [store/detail.vue:199](../../../src/pages/store/detail.vue#L199)，资料读取失败 `t.network.retry` | `.product-material-retry`（901）只有 **`font-size:13px`**，没有 600/20px；父 `trustCardStyle`（858）仅 padding | 此文件属于本人先前实现范围，**自查**；只补资料重试，不改购买或整组 CTA |
| [promotion-reward-detail.vue:4](../../../src/pages/events/promotion-reward-detail.vue#L4)，奖励详情读取失败 `p.retry` | 引入的 [promotion.css:18](../../../src/components/promotion/promotion.css#L18) `.promotion-link` 只有 **`font-size:13px`**，没有 600/20px | 给该重试标签局部类；不要整体改同时承载返回、刷新、联系客服的 `.promotion-link` |
| [events/detail.vue:7](../../../src/pages/events/detail.vue#L7)，详情失败及 26 行规则读取重试 `copy.retry` | 136 行 `.event-action, .event-primary` 为 **13px/600，未指定 20px 行高**；两处均没有共享字体 opt-in | 只限 `.event-action` 的重试；不改 `.event-primary` 领取/参与动作或失败页布局 |
| [genesis-raffle.vue:9](../../../src/pages/events/genesis-raffle.vue#L9)，读取失败及 38 行 error 分支 `copy.retry` | 165 行 `.raffle-primary, .raffle-link` 为 **13px/600，未指定 20px 行高** | 只补读取失败文字；38 行正常刷新及 `copy.retryEntry`“确认上次报名”不混改 |
| [onboarding/terms.vue:61](../../../src/pages/onboarding/terms.vue#L61)，条款读取失败 `t.ui.retry` | `.tos-fail__retry`（398–407）为 **13px/600，未指定 20px 行高**；`.tos-fail__message` 的 1.55 是兄弟文字规则，不覆盖按钮 | 字体局部补齐；保留条款/语言恢复入口现有条件与处理函数 |
| [genesis/marketplace.vue:160](../../../src/pages/genesis/marketplace.vue#L160)，事实读取失败 `t.marketplace.retry`；135 行活动补页失败 `t.orders.retry` | `.nx-market-retry`（652–660）为 **13px/600，未指定 20px 行高**；补页按钮 134 行仅 padding/text-align/color，文字继承字体 | 只作用于 retry/error 标签；保留普通加载更多、loading 和 `.nx-market-info` |
| [register/success.vue:98](../../../src/pages/register/success.vue#L98)，下载配置读取失败 `t.ui.retry` | `.rs-retry`（371）明确 **12px**，没有 600/20px | **81–102 行为 `#ifdef H5`，不计 APP 原生遗漏**；此处仅作同源码 H5 分支备注 |

以上未接入共享规则的节点不能由 [inline-recovery.css:22](../../../src/styles/inline-recovery.css#L22) 自动修复：共享字体只匹配直接 opt-in action 和 `.nx-button.nx-retry-action[role="button"]`。建议仅对表内实际重试文字使用统一 font shorthand，保持布局、颜色、事件和其他按钮不变。

已复核 `trial-read-retry`（[trial.vue:353](../../../src/pages/me/trial.vue#L353)）为完整 600/13/20。此前 team-ledger、team-summary 状态动作、invite-detail、staking-read-status、notifications、network-pulse 可点击重试以及本人六个字体文件均已有对应限定覆盖；不能因普通 CTA 或非可点击状态仍有 12/14px 就报回退。当前未确认另有同类读取重试明确为 14px 的遗漏。

语义排除：`store.catalogRetry` 实际是“重新同步 / Sync again”，`wallet.retryFunds` 是“刷新钱包”，`pageLoad.retry` 是“重新加载页面”；成就等部分 `retry` 词条实际为“重新加载”。daily、rewards、wallet-bills/cards/nex、商品目录等剩余 12px 命中不能只看变量名便归为同类“重试”。本轮中途的 12px 候选提示已按实际词条收窄，不作为这些页面的新阻断。交易原结果确认、重新发送、验证码重做、报名确认同样排除。已明确授权统一过的 PageLoadError/订单字体保留，不建议回退。

执行归属：本人先前实施过下列文件，本次属于**实现者自查，不是独立第二审**；没有借本报告补签其视觉或业务行为。

- 字体六文件：[orders.vue](../../../src/pages/store/orders.vue)、[order-detail.vue](../../../src/pages/store/order-detail.vue)、[deposit-usdt-pane.vue](../../../src/components/me/deposit-usdt-pane.vue)、[leaderboard.vue](../../../src/pages/team/leaderboard.vue)、[empty-state.vue](../../../src/components/empty-state.vue)、[page-load-error.vue](../../../src/components/page-load-error.vue)。EmptyState 仅 recoverable-error 的 20px 条件；排行榜/补页只限定 retry 标签；订单读取重试 44px 保留。
- 先前紧凑布局十三文件：[task-center.vue](../../../src/components/earn/task-center.vue)、[tech-money-card.vue](../../../src/components/home/tech-money-card.vue)、[my-fleet-section.vue](../../../src/components/home/my-fleet-section.vue)、[trial-device-row.vue](../../../src/components/trial-device-row.vue)、[store.vue](../../../src/pages/store/store.vue)、[detail.vue](../../../src/pages/store/detail.vue)、[promotion-entry.vue](../../../src/components/promotion/promotion-entry.vue)、[promotion-bundle.vue](../../../src/components/promotion/promotion-bundle.vue)、[referral-progress.vue](../../../src/components/promotion/referral-progress.vue)、[devices.vue](../../../src/pages/me/devices.vue)、[network.vue](../../../src/pages/team/network.vue)、[tree.vue](../../../src/pages/team/tree.vue)、[quota.vue](../../../src/pages/team/quota.vue)。
