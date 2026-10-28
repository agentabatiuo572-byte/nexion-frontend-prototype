# 紧凑恢复提示独立源码复审（r8 最终）

## r8 单字串附注

2026-10-27 · Averroes · 已只读核实 [promotion.ts:143](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/i18n/messages/promotion.ts:143) 的中文 `promotion.errorNote` 为 **“选择已保留，重试后确认。”**。它保留“当前选择已保存”和“重试后再确认”两层语义；本字串增量未发现新增 P2，既有源码评分 **9.2/10** 不调整。

父线程提供的 r8 最终指纹为 **`index-BSpOlTnk.js` / `index-8t-HDpGw.css`**，并确认 CSS 不变。本轮仅读取该文案文件 diff 和本报告，未重审或重算 58 文件，未运行测试、构建或浏览器；320 宽度孤行是否消除不作为本轮独立实景结论。原 P2 关闭记录、8.8 分及历次失败证据继续保留。

## r7 源码结论（历史保留）

2026-10-27 · Averroes · **9.2/10；本次已修改源码范围内无未关闭 P2+。** 搜索 `RETRY-CODE-P2-01`、team-ledger、team-summary、notifications header 四处已知问题均保持源码关闭；原 8.8 分及 r5 三处实景失败历史保留在下方和链接报告中。

当前基线仍为 `f7c9de55af6f539b457bc12fc63d2ecbfadecc22`，范围为 **57 个 tracked src 文件 + 1 个新增 CSS**。58 文件按下方同一方法取得 SHA-256：`b0523f759a84c8e9acdaa67525c9946f88491acac1de196e18e0b97bdfd34431`。排除本轮新增的 `src/i18n/messages/promotion.ts` 后，其余 57 文件哈希与 r6 的 `fe29b61a…e2a28a58` 完全一致，覆盖 CSS、组件及处理函数。新增 diff 仅将中文 promotion.error 改为“信息暂不可用”；errorNote、retry、其他语言和状态语义未变，未引入新的事件或业务改动。

父线程提供的最终构建为 **r7 `index-BYkotkfZ.js` / `index-8t-HDpGw.css`**，前一构建为 **r6 `index-D-cOhgB2.js` / `index-8t-HDpGw.css`**。CSS 源码不变已独立核对；构建指纹按父线程提供记录。

执行归属：本审查独立读取 diff、核对源码哈希及原 P2 修复依据，仅更新报告；未运行类型检查、测试、构建或浏览器，也未审后端。父线程反馈 **r6 类型检查通过、8 文件 95 项回归通过、r6 native 通过**，这些结果未由本审查重跑或读取原始日志/截图。r6 运行结果不冒充 r7 中文换行的独立实景证明；本最终评分仅签源码与既定交互契约，不新增验证矩阵。

## r6 源码复核记录（历史保留）

2026-10-27 · Averroes · **9.2/10，达到本轮源码审查门槛；r6 已修改范围内未发现未修 P2+。** 本结论不替代新构建实景评分。

只读审查 APP 基线 `f7c9de55af6f539b457bc12fc63d2ecbfadecc22` 上的 56 个 tracked src 文件及新增 `inline-recovery.css`。57 文件按路径排序，以路径 NUL 字节内容 NUL 串联的 SHA-256 为 `fe29b61aa3db9d6f03346a5d10a636bf0dcb6324bc9b5afc38b75650e2a28a58`，审查结束读回一致。phoneBody 是已知文案改动，不在本报告作独立视觉签署。r6 构建指纹待父线程提供。

## r5 失败历史与 r6 关闭依据

[前次报告](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/retry-code-review.md) 的原始 **8.8**、搜索 P2 及修复后限定 **9.2** 全部保留。后续 A 在 r5 实景发现以下三处遗漏；该运行结果由父线程提供，本审查未亲自操作浏览器。前次分数不能代替这三处修复后的实景验收。

| r5 实景失败 | r6 源码复核 | 结论 |
|---|---|---|
| team-ledger 按钮继承 12px/400/18px | [team-ledger-card.vue:122](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/team/team-ledger-card.vue:122) 对重试自身指定 `600 13px/20px`，保留 nowrap、44px 根命中区及旧状态投影 | 源码关闭 |
| team-summary 的 NxButton medium 行高 18.2px | [team-summary-card.vue:42](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/team/team-summary-card.vue:42) 仅在 status 分支指定统一字体；父组件 scoped 选择器优先级高于 NxButton 单类 scoped 默认，普通邀请按钮不匹配 | 源码关闭 |
| notifications 末尾 scoped 规则覆盖成 12px/18px | [notifications.vue:345](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/me/notifications.vue:345) 原覆盖点自身改为 `600 13px/20px`，不再依赖较弱的全局字体规则 | 源码关闭 |

搜索 `RETRY-CODE-P2-01` 的 root/copy/action 共享类与 13px/20px 字体仍保留，本轮未回退。

## 增量核对

- **覆盖与对照：**新增 `.nx-button.nx-retry-action[role="button"]` 优先级 `(0,3,0)` 高于 NxButton 默认/medium 的 scoped 单类规则 `(0,2,0)`。invite-detail、rank-how、courses 接入的根按钮与其文本符合这条规则。其余新增声明落在实际重试根节点或文字节点；style 数组的字体覆盖位于原样式之后。文字、图标颜色及 disabled 外观未被 font shorthand 改写。
- **保留非重试状态：**network compact 仅 `[role='button']` 使用新字体；market 的非 error 提示、orders/leaderboard 正常加载文案保持原样。检查范围为本次 diff，不声称全库 111 个引用或未修改页面均已验收。
- **触区与缺省页：**orders/order-detail 的读取重试最小高度从 32px 增至 44px，处理入口不变；NxButton 内 surface 与根点击区继续分开。EmptyState 仅给 `recoverable-error` 的 CTA 文本增加 20px 行高，其他 kind 返回 undefined，插画、纵向结构、CTA 颜色、禁用和点击逻辑保持。promotion 的 `text-wrap:balance` 仅匹配内联错误标题，不作用于正常活动标题或操作按钮。
- **事件与状态：**对 53 个变更 Vue 文件逐项比较，所有事件绑定、v-if/v-else-if、disabled/busy/tabindex/aria-disabled/aria-busy 表达式均与 HEAD 一致。13 个 script 区块的差异均为展示样式（含 EmptyState 的 kind 条件行高）；未修改重试请求、恢复 key、业务状态或生命周期函数。

未修改产品，未运行测试、构建或浏览器，未审后端。r5 的搜索 2 文件/12 项通过记录仅是历史测试证据，未当作 r6 全范围结果。r6 多语言换行、像素对齐及真实点击/键盘表现由父线程当前构建和既定实景复核承接，本报告不新增整套矩阵。
