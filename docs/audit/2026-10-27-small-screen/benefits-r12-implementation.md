# 福利双卡 r12 实现说明

2026-10-27 · **READY，四个生产文件停止编辑，供父线程统一构建。** 这是实现者记录，不作独立视觉评分；未操作 5237/5240，未构建、提交或同步 H5。

## 修改范围与样式边界

- [trial-hero-banner.vue](../../../src/components/trial-hero-banner.vue)：`<=430px` 仅 embedded 的英文/越文，或已有生命周期/满队列状态启用 compact。**390 中文未领取、非满队列态不带 compact 类**，继续使用原来的 184px 卡片、完整文案、机型图位置和领取按钮样式。`<=374px` 的未领取卡将说明与机型图放进同一内在排版行，不影响 390 中文批准布局。
- active/grace：短状态、短时间标签、紧凑剩余时间、短查看按钮；例如越文 `1 ngày 23 giờ` 可见为 `1n 23g`，完整文字仍用于 aria。去掉原机型标题右侧 24px 留位，改为完整行；生命周期装饰图放到状态右侧的独立留位区域，保留原浮动动画。金额继续完整取 `creditText`，不作省略或取零。
- ended/converted：只缩短卡片内摘要和按钮文字，完整状态/说明及 CTA aria 保留。未领取卡仅在上述小屏/长文案范围使用短领取、免费说明；完整文案仍在其余布局使用。普通非 embedded 入口不启用这些紧凑样式。
- [trial-lifecycle.ts](../../../src/i18n/trial-lifecycle.ts)：只新增三语 `compact` 文案；原全称及 `formatTrialRemaining` 不变。紧凑时间仍调用原格式化函数，未知值继续显示 `-`。
- [home-benefits.vue](../../../src/components/home/home-benefits.vue)：grid 增加 `align-items:start`，领取后常驻和单卡判断不变。
- [voucher-banner.vue](../../../src/components/voucher-banner.vue)：embedded 券卡从继承相邻卡高度改为自身原有 184px / `<=350px` 200px 高度，避免被长试用卡拉高。票券轮廓、金额、脚注文案、黑灰/浅色主题 token、动画及领取/查看处理不变。

紧凑试用卡使用 200px 最小高、内容自然增高及 44px CTA；没有固定最大高、截断金额或更改可领取/重新领取/转购权限。`canClaim`、`canRestart`、`canOpen`、`onClick`、重试、API/store 及券卡权益计算未改。圆盘继续使用原素材/动画，新增小屏排版中的同素材也遵守 reduced-motion。

## 已执行检查

命令：`node node_modules/vitest/vitest.mjs run src/components/home/trial-benefits-lifecycle.behavior.test.ts src/components/trial-offer-stability.test.ts src/components/voucher-banner.behavior.test.ts`。

| 既有测试文件 | 改前 / 改后结果 |
|---|---|
| trial-benefits-lifecycle.behavior.test.ts | 21/21 → 21/21 |
| voucher-banner.behavior.test.ts | 4/4 → 4/4 |
| trial-offer-stability.test.ts | 6 通过、5 失败 → 同样 6 通过、5 失败 |

基线实跑 20:19:58，改后实跑 20:26:21；均共 36 项，31 通过、5 失败，退出 1。**不能报告全绿。** 五个旧失败分别是三例 `est is not defined`、一例 `trialView is not defined`、一例 `capacityFull is not defined`：该测试通过截取脚本声明执行，仍截取已不存在的 `est`，或没有注入当前声明需要的依赖。本轮不拥有测试文件，因此保留原失败，没有添加生产兼容变量或削弱断言。

四文件 `git diff --check` 通过；未扩大测试范围。现有轻量 renderer 用例验证三语生命周期、保留卡片、金额异常占位、重试和路由权限，**不验证 CSS 可见性、320/390 实际尺寸、主题截图或读屏实测**。这些由父线程构建后两位独立审查者验证，尤其 390ZHdark 未领取批准布局和 320VIlight active 对照。

## 本次冻结 SHA-256

| 文件 | SHA-256 |
|---|---|
| trial-hero-banner.vue | `be27535e147ed90057811cf7bb3170d4a974de353d2cd489456b8781802672af` |
| voucher-banner.vue | `e524781d849bd04eda0092b7e284502e7b5609d1480a36c5d3d498e0cc8fe829` |
| home/home-benefits.vue | `9882800f6b4522338c1044b1059301f927105e3e5af958a2b194e375d1d549d0` |
| trial-lifecycle.ts | `f3875d49138669959d1c2ac1ad1aa934f0199b61900f47dbe6c42e23af9dea29` |

## 追加：旧测试夹具闭环

同日 20:35:29，按新增授权仅修改 [trial-offer-stability.test.ts](../../../src/components/trial-offer-stability.test.ts)，没有修改生产文件。前述两轮 31/36 与五个旧失败保留为历史。

- 金额夹具现在走真实 `trialApi.state` 模拟响应 → `useFreeTrial.refreshRemote` → `useTrialConfig.applyAuthoritative` → `useTrialPresentation.estimatedOffsetUSD` → 组件实际 `estimateText` / `creditBasisText` 声明。网络、固定账户上下文和时钟为测试替身，store、生命周期模型、金额封顶及文本格式化均使用当前生产实现；不再提取不存在的 `est`，没有生产兼容变量。
- 三个原金额用例仍检查 3 × 38.52 的原始收益 115.56、50 上限、五档日收益以及 49.99 小数上限；增加真实可见文本 `$50.00` / `$49.99` 断言。未封顶分支同时检查模型金额 3、显示 `$3.00`、真实日收益文本 `1.00/d × 3` 及其作为 credit basis。旧夹具自己拼出的 `$1.00/d × 3` 不再冒充组件输出，货币单位仍有独立精确断言。
- confirmed poll 用例提取当前组件的 `eligibility`、`productUnavailable`、`capacityFull` 与 `claimCtaText`，提供完整中文词条和 lifecycle copy；实际 store 请求前后分别断言 ready / loading / ready、两次 GET、原文案保持、loading 时 `canStart=false`、完成后恢复 true，且没有 start POST。
- 每个真实 presentation 的 effect scope 在用例后停止，避免观察器泄漏。未删用例、跳过用例或放宽金额等式。

重新运行原三个文件的命令（verbose reporter），**3 文件全部通过，36/36，0 failed，退出 0，2.22s**：生命周期 21/21、稳定性 11/11、券卡 4/4。测试文件 `git diff --check` 通过。四个生产文件 SHA-256 与上表逐一相同，原冻结继续有效；本次未运行构建、浏览器或 H5 同步，视觉边界不变。
