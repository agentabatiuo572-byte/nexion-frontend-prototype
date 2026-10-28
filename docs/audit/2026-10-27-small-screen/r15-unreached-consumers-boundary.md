**R15 两处未达恢复消费者：只读边界核对（Averroes，2026-10-27）**

APP [APP工作区](../../..)，HEAD `ddcea906d62e8242815e5af104ac1574bfa486a2` 当前源码。只核生产入口、可达条件及已有测试契约；未改实现，未运行测试、交易或浏览器。以下 N/T 指本轮未实测，不写为视觉/交互通过。

| 消费者 | 生产入口与实际可达性 | 最终报告可用的 N/T 表述 |
| --- | --- | --- |
| wallet-cards 旧列表恢复按钮 | route仍注册，钱包、个人页及搜索仍指向旧route。当前 runtime 常量 `remoteApiEnabled=true`、`developmentPaymentEnabled=false`，令 `cardBindingAvailable=false`；旧列表及其retry被模板条件排除。onShow执行openCards，立即navReplace到wallet-cards-new；后者当前实际渲染BankAccountBinding。故可达的是旧入口及其跳转，不是旧卡列表恢复分支。 | **N/T：旧卡列表的读取恢复按钮在当前正式构建开关下不展示；保留旧入口→真实银行账户绑定页的生产路径。未以修改开关或伪造可用卡来签旧列表实景。** |
| wallet-repurchase 内部 historyError | 入口由钱包stakingVisible控制，route仍注册。正常进入/刷新调用store.refresh；失败置整体error，进入外层不可用/重试区域。内部historyError只由refreshHistory失败设置；当前正常生产首次自动调用它的路径是：开单/领取/提前退出已获成功回执，但回执只含部分历史，再GET完整历史失败。内部retry本身是GET，健康页面没有单独可见入口用只读操作首次制造这一前置状态。 | **N/T：生产可达的交易后历史补读恢复分支，本轮未制造资金写操作前置来取得实景；普通读取失败的外层恢复不能替它签通过。内部GET重试有store行为契约覆盖，不等于本轮真实UI已验。** |

银行卡依据：[runtime.ts:78](../../../src/api/runtime.ts#L78)、[wallet-cards.vue:18](../../../src/pages/me/wallet-cards.vue#L18)、[availability/refresh/openCards:100](../../../src/pages/me/wallet-cards.vue#L100)、[wallet-cards-new.vue:16](../../../src/pages/me/wallet-cards-new.vue#L16)。入口见 [wallet.vue:110](../../../src/pages/me/wallet.vue#L110)、[me.vue:302](../../../src/pages/me/me.vue#L302)、[search.vue:238](../../../src/pages/search/search.vue#L238)，route注册在pages.json第161/165行。此判断来自当前前端显式开关，不推断后端是否具备某个provider能力。

已有 [wallet-cards-unavailable.test.ts:74](../../../src/pages/me/wallet-cards-unavailable.test.ts#L74) 使用真实SFC模板编译/SSR、注入运行开关，断言正式模式不显示旧卡、解绑/默认设置及旧retry，new页走真实绑定组件分支；第94/115行执行源码提取的refreshCards/openCards，断言页级刷新守卫及直接替换目标。开发开关开启的旧分支另有模板测试。它们不是新32px可见/44px触区实景或真实卡服务证明。

需准确限定“不请求”：上述测试只证明**页面refreshCards/openCards**不调用旧列表刷新。`useCards()`仍可能在store创建及账号绑定时自行读取（[cards.ts:174](../../../src/store/cards.ts#L174)、第96行），不可据此写成“跳转全过程没有任何卡API请求”。这不改变旧列表UI不可达结论。

回购依据：[wallet.vue:99](../../../src/pages/me/wallet.vue#L99)、[wallet-repurchase.vue:46](../../../src/pages/me/wallet-repurchase.vue#L46)、[remoteReady:217](../../../src/pages/me/wallet-repurchase.vue#L217)、[refreshRemote:338](../../../src/pages/me/wallet-repurchase.vue#L338)。store的普通refresh错误路径在 [repurchase.ts:53](../../../src/store/repurchase.ts#L53)，history专用错误在第122行，交易成功后分页补读在第161行。remoteReady不含historyError，已确认交易不被GET失败改成失败；内部按钮只调用refreshHistory，加载期间隐藏。

已有测试覆盖如下（只审读，本轮未运行）：

- [repurchase-remote-scope.test.ts:81](../../../src/store/repurchase-remote-scope.test.ts#L81)：真实store配mock API，分别验证open/claim/earlyWithdraw分页回执后补全101笔历史。
- [同文件:98](../../../src/store/repurchase-remote-scope.test.ts#L98)：open成功后GET失败，命令仍resolve回执、pendingOpen清除、整体error为空、historyError保留、余额保持回执；随后refreshHistory成功补齐101笔并清error，open总调用仍1次，防止把读重试变成重复写。
- [同文件:122](../../../src/store/repurchase-remote-scope.test.ts#L122)：旧history结果在换账号或新refresh后不得覆盖新状态；第147行验证后来完整命令回执淘汰迟到的旧history重试。
- [audit-state-regressions.contract.test.ts:8](../../../src/components/audit-state-regressions.contract.test.ts#L8)：静态契约只检查history通知、按钮接refreshHistory，以及remoteReady不依赖history。页面balance-gate harness把historyError设为空，并不执行该错误分支的点击/布局。

因此无需为了R15视觉验收新增生产开关、交易入口或改资金业务。保留两项各自的N/T原因，并将已有代码契约、当前源码审读、真实UI证据分开记录即可。
