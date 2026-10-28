# r11 文字重试遗漏修复说明

2026-10-27。实现者自查记录，不作为独立审查或实景签署。仅修改 APP 工作树下指定的 8 个源文件，统一读取重试文字为 `font: 600 13px/20px var(--font-v5)`。

| 文件 | 精确类 / 生效边界 |
|---|---|
| [developer.vue:1026](../../../src/pages/developer/developer.vue#L1026) | `.developer-read-retry-label`：申请结果、文档、API 资源、Webhook 资源四处读取重试标签；仅移除文档重试文字原内联 12px，保留间距和错误说明字体 |
| [store/detail.vue:902](../../../src/pages/store/detail.vue#L902) | `.product-material-retry__label`：资料读取失败的文字；箭头和其他购买 CTA 不变 |
| [promotion-reward-detail.vue:24](../../../src/pages/events/promotion-reward-detail.vue#L24) | `.promotion-read-retry-label`：只作用于 `p.retry`；共享 `.promotion-link`、返回、刷新、联系客服不变 |
| [events/detail.vue:137](../../../src/pages/events/detail.vue#L137) | `.event-read-retry-label`：详情/规则读取的两个 `copy.retry`；领取和参与 CTA 不变 |
| [genesis-raffle.vue:166](../../../src/pages/events/genesis-raffle.vue#L166) | `.raffle-read-retry-label`：首次读取失败，以及底部 `error` 为真、显示 `copy.retry` 的分支；正常 refresh、报名和原报名确认不变 |
| [onboarding/terms.vue:408](../../../src/pages/onboarding/terms.vue#L408) | `.tos-fail__retry-label`：仅 `!loadingTerms`、显示重试文字时应用；loading 的省略号保留原字体 |
| [genesis/marketplace.vue:661](../../../src/pages/genesis/marketplace.vue#L661) | `.nx-market-read-retry-label`：补页只在 `genesis.activityPage.error` 时应用，事实读取只在 `!marketplaceRead.busy` 时应用；正常加载更多、marketLoading、`.nx-market-info` 不变 |
| [register/success.vue:371](../../../src/pages/register/success.vue#L371) | `.rs-retry`：H5 条件编译内的下载配置读取重试；保持 `#ifdef H5`，本轮未向 H5 工作树同步 |

验证：逐项读取 diff，8 文件共 23 行新增 / 14 行删除，均为标签 class 或局部字体声明；没有脚本、事件、状态条件、文案、颜色或布局属性改动。指定 8 文件的 `git diff --check` 退出 0。未新增测试文件，未运行测试、浏览器、构建、提交或 H5 同步；构建与实景由父线程统一进行。

保护范围：编辑前后 SHA-256 核对一致，父线程 r10 七文件（app-chassis、device-card-pc、empty-slots-hint、home/device-row、device-inventory-row、trial-device-row、trial-fleet）均未改动。[原遗漏清单](retry-final-inventory.md) 原样保留，作为修复前失败证据；本说明不覆盖它的历史结论。
