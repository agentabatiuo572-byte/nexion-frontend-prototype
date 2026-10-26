Nova 输入拒绝恢复独立第二审 · 2026-10-27

**最新限定评分 9.2/10，达到 ≥9 门槛；NOVA-RECOVERY-UX-01 经修复复核关闭。** 首审 8.8/10 的红证据保留如下，修复与独立定向结果见文末。本审只覆盖可操作性、提示含义与离页/编辑生命周期，不替代 Noether 的状态竞态审查，不代表真实 API 或隐藏入口开放验收。

范围依据为 [PRD F15](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/PRD/UVEL_设计审查功能同步_20261026.md:218)。只新增本报告，未修改生产、测试、入口开关或其他文档，未操作浏览器、hiddenNova 生产入口、真实 API，未构建、提交、推送。

**首审 P2 · NOVA-RECOVERY-UX-01：有效正文遇到新 ID 分配失败时，页面提示用户修改长度（后续已关闭，见文末）**

- 入口：明确未受理的队首 → 修改问题 → 输入有效新文 → 保存修改。
- [nova.ts:260](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/store/nova.ts:260) 的 `saveRemoteEdit` 在空文/超长、新安全 ID 生成异常以及 ID 重复时都会返回 `false`；后两种情况不涉及正文错误。
- [chat.vue:1644](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:1644) 对所有 `false` 都展示 `t.nova.queue.invalid`。实际[中文提示](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/i18n/messages/zh.ts:3133)为“请输入 1–2000 个字符的问题。”；英文、越文也都限定为输入长度错误。
- 独立无网络探针执行真实 `nova.ts` store、从当前 SFC AST 提取的真实 `onQueueSave`、实际中文词条，只替换 UUID 能力边界并记录 warn/drain。输入统一为 `Corrected question`，长度 18：正常 UUID 时 `queued`、drain=1、无告警；UUID 不可用或重复时都仍为 `editing`、原 turn/原文保留、drain=0，却收到上述长度提示。正常分支仅调用探针 drain 计数器，没有请求服务端。
- 影响：没有丢文或误发，但用户被引导去反复修改已经合规的正文，无法从提示知道正确的恢复动作。这正是 F15 已显式考虑的新 ID 无法生成/重复分支，不能只用 store 安全保留状态证明页面恢复体验通过。
- 最小建议：区分输入无效与保存不可完成。仅空文/超长给长度提示；其余失败保持编辑内容并提示稍后重试，不向用户暴露 UUID/内部错误码。修后补页面级有效正文＋UUID 异常/重复断言，验证不出现长度提示、无网络派发、编辑内容仍可继续保存。

**已通过的限定路径**

| 检查点 | 当前证据与结论 |
| --- | --- |
| 页面入口保持隐藏 | [nova-visibility.ts:3](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/nova-visibility.ts:3) 仍为 false；[chat.vue:671](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:671) 对 AI 路由置 hidden 后返回消息中心，onShow 随即退出。页面测试只在内存 harness 内替换可见性为 true，不等于生产入口已开放。 |
| 按钮条件 | [nova-failure.ts:5](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/nova-failure.ts:5) 仅将完整的 HTTP 400、数字 code 400、精确消息识别为 input-rejected；store `canEditRemote` 决定可编辑性，页面按该结果投影，真实 thread 模板仅为 editable 的 queued/failed 条目显示修改与取消。processing/tracking/未知结果不出现这两个动作。 |
| 状态不伪装成功 | [chat.vue:996](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:996) 保持 failed 队列状态；[thread 回执映射](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:287) 优先显示失败/排队/发送中，而非底层旧 receipt 的成功勾。内部拒绝码不作为产品文案显示。失败图标仍允许显式原文重试。 |
| 取消编辑、原文保存不重发 | store 对 trim 后相同原文调用 `cancelRemoteEdit`，回到原 input-rejected/failed；编辑期间不能 claim。页面虽调用 drain，其队首检查只接受 queued/tracking，故不会派发。页面测试包含放弃修改、带外围空白的原文保存及 hide→show，推进计时后请求次数仍为 1。 |
| 明确修改后的新意图 | 保存不同正文生成新安全 turnId、保留队列位置/语言/会话；旧尝试状态清理后回到 queued，经原串行 worker 与限流派发。原文显式重试仍复用原 turnId 和完整请求；二者没有混淆。 |
| 取消排队与后续问题 | 删除明确拒绝的队首只移除该本地问题；后续问题继续按顺序处理。取消编辑不删除原问题，未改变正文的保存也不暗中解除失败暂停态。 |
| 生命周期边界 | hide/cleanup 通过 interruptRemote 退出 editing，拒绝项回到 failed；页面 action/save 在不可见时退出。已运行用例覆盖换账号及 A→B→A 后旧操作不改变新队列。本项只确认用户可见边界，不宣称穷尽全部异步竞态。 |
| 可操作控件 | 修改、取消、保存、放弃修改使用 role=button、tabindex、点击及 Enter/Space 绑定；编辑区有 aria-label，按钮最小高度 44px。源码可核，真实触摸、焦点与三语实际排版未操作验收。 |

**定向验证：59 passed，189 skipped，4 文件通过，退出码 0**

2026-10-27 本机 04:32:26 开始，Vitest 3.2.7，耗时 2.11s。没有运行完整矩阵；跳过项明确不计入通过。

| 文件 | 本轮实际执行 |
| --- | --- |
| `src/lib/nova-failure.test.ts` | 17：精确拒绝包识别与其他错误映射 |
| `src/store/nova-queue.test.ts` | 23：拒绝恢复、队列顺序、原文/取消、ID 失败保留及既有串行边界 |
| `src/pages/support/nova-queue-page.test.ts` | 13：拒绝后的 edit/cancel/retry、无改文/离页不重发、未知结果按钮守卫、账号边界及等待队列编辑 |
| `src/components/support/conversation-thread.behavior.test.ts` | 6：真实模板按钮条件、动作回传及单一失败重试图标 |

命令（工作目录为本 APP worktree）：

```powershell
node node_modules/vitest/vitest.mjs run src/lib/nova-failure.test.ts src/store/nova-queue.test.ts src/pages/support/nova-queue-page.test.ts src/components/support/conversation-thread.behavior.test.ts --no-cache --reporter=verbose -t 'Nova actionable errors|Nova confirmed input rejection recovery|Nova serial pending turns|Nova page confirmed input rejection recovery|editing blocks dispatch|shows revision actions|keeps one failed queue retry icon'
```

首审测试绿与当时 P2 不矛盾：当时 store 测试验证 UUID 失败保留原状态，但页面用例没有检查这两种失败的用户提示。独立探针补充了该页面分支证据，未写入或改动测试文件；后续 Jason 已补页面用例。

**不覆盖真实服务长度与开放验收**

本地 [AppNovaAiService.java:47](D:/WORKS/PLAN/nexion-backend/src/main/java/ffdd/opsconsole/content/application/AppNovaAiService.java:47) 在原 turn 读回及 reserve 前校验；`:149` 将配置上限约束到 1–2000 UTF-16 单元。[NovaAiStatus](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/api/nova-ai-api.ts:5) 仍只含 available，没有有效长度上限。前端 2000 合同不能保证所有不超过 2000 的正文会被真实部署接受；本审没有获取真实配置、验证较低上限或真实 HTTP 拒绝响应。当前证据是本地源码与模拟 transport，不是后端不存在该能力或线上合同已验证的证明。

若服务端拒绝的原因需要更低上限提示，仍须依赖后续正式契约，不猜值、不静默截断。此次不解除隐藏入口，不把 F15 局部修复、原 renderer 评分或 STATUS-01 的渲染问题混为同一验收。

本审源码 SHA256（截至定向测试后读回）：

- `src/store/nova.ts`：`F431161187B55488DCCC79330014B51BDB6DA4A2F9C206267D1F72D815D72C22`
- `src/lib/nova-failure.ts`：`3077098B36B7A4E296B0CFE52EE97B86D3EF29923579FDADC2CE27650611EED3`
- `src/pages/support/chat.vue`：`C4663EAA87AF528975CB2B987556CDEE2CE06F0C9B9B22BD211FAC74F546C95D`
- `src/components/support/conversation-thread.vue`：`676B9D742909CA53541D928783E413D67328281CEB20BB4AEC690352FC168562`

**Jason 修复后独立复核 · 2026-10-27**

复核结论：**关闭本审提出的 NOVA-RECOVERY-UX-01，限定评分 9.2/10。** [chat.vue:1640](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:1640) 先核对当前编辑资格，再使用真实 `normalizeMessageText` 按 trim 后 2000 UTF-16 合同校验；只有该校验失败显示正文要求。有效正文遇到 `saveRemoteEdit` 返回 false 时使用现有 `security.opFailed`，即“操作未完成，请稍后重试”，三语均已核对。分支直接返回，不调用 drain；失效旧保存动作也先被资格检查挡住。未改 store 的原文保存/新 ID 语义。

本审独立运行以下窄选择，不重复全部相关矩阵：

```powershell
node node_modules/vitest/vitest.mjs run src/pages/support/nova-queue-page.test.ts --no-cache --reporter=verbose -t 'NOVA-RECOVERY-UX-01 save feedback'
```

实跑结果：**1 文件通过，14 passed / 67 skipped（总计 81），exit 0**；Vitest 3.2.7，输出 Start at 04:58:20，Duration 1.96s。三语各覆盖 UUID 不可用、重复 ID、空文、2001 长度，共 12 项；另有原文保存不分配新 ID/不重发，以及编辑结束后旧保存动作不误报，共 2 项。测试执行当前 SFC 脚本、真实 Nova store 与长度 helper，仅替换传输/生命周期和 UUID 失败边界；UUID 恢复后可再次保存并以新 ID 发送，失败期间原状态不变且没有额外 API 调用。

原 harness 在脚本直接执行时输出 Vue `onMounted` 无活动实例警告；这是本轮测试边界，不能把这些测试说成已挂载真实页面或已复现 native UI。本审未新增/修改测试，也未重跑 Jason 报告的“15 新增、263 相关、tsc”整组结果；上述 14 是本次命令实际选中的数量。

当前 `NOVA_SUPPORT_VISIBLE` 仍为 false；`NovaAiStatus` 仍仅下发 available。真实部署有效长度、真实 HTTP 拒绝、隐藏入口操作仍未覆盖。此项 9.2 与 composer sampled 第二审及 STATUS-01 渲染故障完全分开，不据此关闭 STATUS。

复核后源码 SHA256：chat `31ac825bc2e17c697e25a002ecb3e2ff7633e9bb0c4d2617dff56297992e8145`；page test `e0091499328247101dca8b0be5f663adba56ec6de58f37aa3b09f1df19ceeda2`。本次只更新两份已授权独立报告，未改生产/测试、未操作浏览器、未 build/commit/push。
