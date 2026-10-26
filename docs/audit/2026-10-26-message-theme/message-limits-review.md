# MESSAGE-LIMITS：消息长度与连续发送只读审查

审查日期：2026-10-27。APP 为共享工作树 `D:/WORKS/PLAN/.wt/uvel-design-20261025-app`（HEAD `5c2f2a855d11` 加当前未提交改动）；本报告是唯一写入，不修改生产、测试、动效、PRD或登记表，不提交/推送。

结论：现有前端有长度、串行发送和频控保护，但各入口没有完整统一。已确认 human 长度校验缺层、重试绕过页面频控、服务端冷却时间未传递；Nova 存在明确输入拒绝后的队首恢复缺口。以下数值均为现有实现，不是本次新增规则。

## 现有链路与契约

| 范围 | APP 当前覆盖 | 本地后端对照 |
| --- | --- | --- |
| human 新建/回复、图片说明 | 输入默认 `maxlength=140`，`canSend` 只检查非空/附件与阻塞；child 发送时 trim。页面、store、API 没有正文长度上限检查；API 仅 trim 后发送。图片 READY 可无正文。[输入组件:141、316、354][thread]；[页面:99、1423][chat]；[store:615、643][conversations]；[API:332][support-api] | TEXT trim 后非空且最多 2000；IMAGE 可空、说明最多 2000。新建与回复均调用此校验，HTTP/WS 共用服务入口。[内容校验:24][human-service]；[发送服务:291、327][backend-support]；[WS 分派:39][socket-commands] |
| 远端 Nova 输入/队列编辑 | 输入和编辑框 2000；onSend、enqueueRemote、saveRemoteEdit 检查非空及原字符串 `.length <= 2000`；API safeRequest 再检查 trim 后长度、语言及 UUID。普通输入先经 child trim，编辑路径未统一此顺序。[页面:1355][chat]；[store:181、243][nova-store]；[API:107][nova-api] | DTO `@Size(max=2000)`；service 实际上限为 `clamp(maxInputChars,1,2000)`，默认 2000；status 仅返回 available，没有下发有效长度。APP 固定 2000 无法感知服务端调低。[DTO:9][nova-dto]；[服务:35、149][backend-nova]；[配置:22][nova-properties] |
| human 连续发送 | 页面实例内最多 5 次/滚动 15 秒，间隔至少 1 秒。sendBlocked 在未登录就绪、failed/unknown、humanSendBusy 时阻止普通发送；失败原文单独恢复，无 human FIFO 队列。store 仅对同账号作用域、同 intent 合并并发，不承担所有消息的限流。[页面:109、431、1280、1398][chat]；[store:337][conversations] | PRD 已写“单会话 5/15 秒 + 1 秒、HTTP 429 + Retry-After”，但它是产品契约，不能代替后端落地证据。[PRD:4113][prd] |
| Nova 连续发送 | 队列最多 **4 条未完成项总计**，包含 processing/tracking/failed/editing；满时恢复输入。串行派发，queued（包括手动 retry）经过 5/15 秒 + 1 秒；tracking 同 turn 每 3 秒恢复、最多等待 75 秒，不扣该 dispatch limiter；失败队首暂停后续。[页面:1358、1524–1617][chat]；[store:79、181–260][nova-store] | 已确认有同 user+conversation 并发互斥、同 turn 重放/冲突校验和模型进程并发上限（默认 1，钳位 1–4），忙时 429。它们不同于 APP 队列容量和单会话滑动窗口。[服务:48、88、118、202][backend-nova] |
| 回读 parser / 错误 / 幂等 | human parser 校验类型、非空 TEXT、时间和回执，没有正文上限；Nova 即时回复最多 8000、历史文本最多 16000，均不能当发送输入限额。human 400/413/422 等明确拒绝→failed；HTTP/WS 408/409/425/429/5xx→unknown，12 秒 ACK+最多 3 秒读回保留原 key，精确 canonical echo 才退役。Nova 429→busy，400 输入错误→普通 failed。[support parser:127][support-api]；[Nova parser:63、78][nova-api]；[policy:3–13][delivery]；[错误映射:5][nova-failure] | human 文档要求原 clientMessageId 保留至确认，同载荷恢复原消息、换载荷 409；本地实现有持久命令及消息去重。Nova 以 user+turnId 查询，核 conversation/language/message；不是依赖 Idempotency-Key header。[交接:9–11][handoff]；[服务:568][backend-support]；[消息去重:74–78][human-service]；[Nova 重放:202][backend-nova] |

计量边界：代码使用 JS `.length`、Java `String.length()` / `@Size`，为 UTF-16 单元；例如一个常见补充平面 emoji 占 2，不等于用户看到的字数。原生输入法、粘贴和组合字符的控件截断效果本次未实机验证。

## 已确认缺口与影响

1. **human 的 140 与服务端 2000 不一致，且控件不是业务校验层。** 普通输入受到较小上限约束；恢复草稿、程序调用或其他消费者没有同等保护。只读探针调用真实 create/reply API，2001 单元正文均到达捕获 transport（各 1 次；未发网络）。后端仍有校验，因此不是“后端无限长”；APP 会多走一次失败请求，且只给通用失败提示。证据见上表 human 行。
2. **human 原消息重试绕过现有频控。** `retryHumanSend` 直接调用 `sendHumanMessage`，没有 `acquireSendSlot`；busy 仅防同时执行，快速拒绝后可在 1 秒内再次发请求。普通入口先占 slot，之后即使未实际派发或失败也不返还，与 limiter 注释“only successful sends”不符。limiter 还绑定页面实例而非账号+会话：重建页面清零，复用页面换账号不会像 Nova 那样重置。[重试:431–452、普通发送:1398][chat]；[limiter:15、29–38][limiter]
3. **未承接服务端冷却信息。** transport 有 response headers，但 ApiError 未保存 Retry-After，API 错误转换也未读取。human 的 429 按当前规则保留 unknown 正确，但重试没有服务端冷却门；Nova 429 暂停队首，只能按客户端预算重试，tracking 则按 3 秒恢复。[错误类型:3–10][errors]；[API 错误转换:189–230][api-client]；[页面:1542、1578][chat]
4. **Nova 明确输入拒绝后无法修正队首。** `claimRemote` 置 attempted；失败后 edit/cancel 都拒绝，retry 保留相同正文和 turnId。若服务端有效上限低于 2000，APP 接受的消息可被 400 拒绝，并持续挡住后续队列；只能重试无效载荷或另开会话。只读真实 store 探针确认：2000 入队=true、2001=false；派发后 failed 的 edit=false、cancel=false、retry=true、正文仍为 2000。这是条件性可达缺口，不表示线上配置已经调低。[store:190–260][nova-store]；[页面:989、1528、1578][chat]；[后端长度:149][backend-nova]

后端限流**并非不存在**：本地有配置驱动的全局/IP/路由分钟预算、登录主体分钟预算，以及 WS 每连接 10 秒最多 60 帧。它们不等价于 PRD 的单会话 5/15 秒+1 秒；在已读发送服务和这些入口中未定位到同口径消息计数器，不能据此排除其他部署层策略。[全局:49–57][global-rate]；[主体:59–70][principal-rate]；[WS:95–97][socket-handler]

## 适合本项目的规则建议（待决定，未实施）

- **先统一既有契约，不另造数值。** human 若无保留 140 的产品理由，建议与已存在的 2000 服务端合同对齐；若保留较小体验上限，也应明确标注并在所有入口一致执行。共享“规范化→校验→派发”逻辑覆盖输入、草稿恢复、重试、store/API、TEXT/IMAGE；不要静默截断原消息。明确 UTF-16 计量及中英越/emoji 反馈。
- **沿用现有 5/15 秒+1 秒作为待核对基线。** 新消息、快捷提问和重试在实际派发前走同一准入；明确按账号+会话持有预算、页面重开与账号切换行为。区分“新消息额度”与“同 key 结果恢复请求”，不要因限流换 key、把 unknown 当 failed，或误将 Nova tracking 当新问题。后台与网关实际策略需另行确认后再决定持久化/分布式实现。
- **传递冷却与明确拒绝原因。** HTTP 429 保留并解析 Retry-After（秒或日期）；WS 若需对等行为，先定义服务端重试信息。客户端等待取本地门和服务端期限较晚者。长度类明确拒绝提示可修正原因并保留原文；Nova 允许对确定未接受的项修正/移除，修改正文作为新意图处理，绝不修改仍可能被服务端接受的同 turn 请求。
- **保留既有恢复语义。** human 12+3 秒、精确 echo、同 key 恢复及 Nova 串行队列继续独立于布局/动效；不以客户端成功音效、按钮完成或未读状态证明后端接受。历史 parser 不应直接套新输入上限而丢弃合法旧消息。

## 证据与覆盖边界

- 本次只读源码/本地文档，并用内存 TypeScript 转译调用真实 API、Nova store、limiter；网络由捕获函数代替，未连接服务或修改数据。limiter 探针确认 999ms 拒绝、1000ms 放行，第六次在 5000ms 拒绝且提示 10 秒，15000ms 放行；这证明 limiter 自身，不证明所有入口都调用它。
- 既有测试覆盖 Nova 2001/空白/重复 turn 入队与编辑拒绝、4 项容量、串行、实际派发窗口、账号切换、429 同 turn 重试，以及 human unknown/明确拒绝、原 key、12+3 秒和 echo。见 [Nova store 测试:107][nova-tests]、[Nova 页面测试:591–674][nova-page-tests]、[human deadline 测试][deadline-tests]。本轮没有新增/重跑测试；父线程报告的 422 项 green 保留为原任务结论，不扩大成此次长度/限流全覆盖。
- 后续应补：human 139/140/141 与 1999/2000/2001、图片空正文、直接 store/API/草稿恢复、emoji/组合字符/trim、快速失败连续重试、页面重建/换账号、Retry-After、Nova 配置上限调低后的可修正恢复。控件原生截断、HTTP/WS 同口径频控、跨设备并发和线上网关均未实测。
- 后端依据仅为本地 `D:/WORKS/PLAN/nexion-backend`（HEAD `4113c61e1950`，所读关键发送文件无本地修改）及其交接文档，不能等同当前部署版本或配置。当前 `NOVA_SUPPORT_VISIBLE=false`，客户入口隐藏；Nova 结论针对保留代码路径，不代表线上入口已开放。[可见性开关:3][nova-visibility]；[页面:662][chat]

## 2026-10-27 经授权整改补记

本节记录原只读审查之后新增授权的实现；前文保留当时快照。此次仅处理共享长度策略、直达 API、HTTP 冷却信息、相关测试及本补记，UI 自适应高度、页面提示和跨页面发送预算由父代理集成。

- **长度接口已交付**：[message-length-policy.ts](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/message-length-policy.ts:1) 导出 `MESSAGE_MAX_LENGTH=2000`、`normalizeMessageText(value, { allowEmpty?: boolean })`、`MessageTextValidationError`。按 JS trim 后 UTF-16 长度校验，返回完整正文，保留内部换行，不截断；错误 `reason=required|too_long|invalid_type`，稳定 message 分别为 `MESSAGE_TEXT_REQUIRED|MESSAGE_TEXT_TOO_LONG|MESSAGE_TEXT_INVALID`，继承 ApiError、`kind=business/code=422/retryable=false`，属于本地未派发的明确拒绝。
- **派发入口已覆盖**：support 的 `startConversation/replyConversation/createTicket/replyTicket` 均先校验；会话携附件时允许空正文，但说明仍受 2000 限制；Nova `chat` 的 safeRequest 复用同一 helper。本地后端 human `validContent` 和工单 create/reply 已有 2000 校验，本次未改服务端或增加限额。发送 key、clientMessageId、turnId、版本字段、已有 ACK/读回/Nova 超时及历史 parser 均沿用原实现。
- **冷却接口已交付**：[ApiError.retryAfterMs](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/api/errors.ts:52) 为可选毫秒数；[API client](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/api/api-client.ts:26) 大小写无关地读取 HTTP `Retry-After`，支持整数秒和 HTTP 日期。日期换算为处理响应时的剩余时间，过去日期为 0；缺失/非法值为 undefined。输出仅接受 `0..2_147_483_647` 的整数毫秒（JS timer 可表示范围），超范围忽略而不缩短成较早期限。`parseRetryAfterMs` 同时从 errors 模块导出供契约测试；不改变既有错误 kind、retryable 或未知结果分类，也不自动重发。
- **传输边界**：普通 HTTP 请求及提供 headers 的上传响应携带该属性；未提供头的传输、WS ACK、文件下载专用返回结构不伪造冷却信息。父代理应以 `retryAfterMs !== undefined` 判断有效提示，并将其与原账号+会话发送预算合并；本子任务不关闭此前“页面重试绕过频控”的审计项。
- **验证**：2026-10-27 01:00 JST 联合定向 13 文件 **291/291 passed**，含新长度策略 20、直达 support API 35、Nova API 11、Retry-After 39、原 human deadline 48、delivery policy 31，以及受影响的入站卡、系统消息、工单策略、原生兼容、Nova transport、鉴权和上传测试。原生兼容的 3 项曾因 Node 子进程不解析 `@/` 导入失败，已仅在该 API 测试内注册别名解析、继续导入真实模块，原断言全部保留；未改 scripts。新 Retry-After 测试的一处 unknown 类型访问修正后，39/39 再通过；最终 10 个变更 TypeScript 文件定向诊断 **0**，未宣称全仓类型检查或实机通过。
- **剩余边界**：Nova store 的入队/编辑规范化、服务端调低长度后的队首修正、原生输入法与多行高度、页面 1s+5/15s 与 Retry-After 联动验收由后续对应范围完成。未修改 chat.vue、conversation-thread.vue、i18n、后端或既有超时/幂等规则，未提交/推送。

[thread]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:141
[chat]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:1280
[conversations]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/store/conversations.ts:337
[support-api]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/api/support-api.ts:332
[nova-store]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/store/nova.ts:181
[nova-api]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/api/nova-ai-api.ts:107
[delivery]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/conversation-delivery-policy.ts:3
[nova-failure]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/nova-failure.ts:5
[nova-visibility]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/nova-visibility.ts:3
[limiter]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/send-limiter.ts:15
[errors]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/api/errors.ts:3
[api-client]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/api/api-client.ts:189
[prd]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/PRD/NexGrid_产品功能架构设计文档_v3.7.md:4113
[nova-tests]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/store/nova-queue.test.ts:107
[nova-page-tests]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/nova-queue-page.test.ts:591
[deadline-tests]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/store/conversations-send-deadline.test.ts
[human-service]: D:/WORKS/PLAN/nexion-backend/src/main/java/ffdd/opsconsole/content/application/SupportHumanMessageService.java:24
[backend-support]: D:/WORKS/PLAN/nexion-backend/src/main/java/ffdd/opsconsole/content/application/AppSupportService.java:291
[backend-nova]: D:/WORKS/PLAN/nexion-backend/src/main/java/ffdd/opsconsole/content/application/AppNovaAiService.java:149
[nova-dto]: D:/WORKS/PLAN/nexion-backend/src/main/java/ffdd/opsconsole/content/dto/NovaAiChatRequest.java:9
[nova-properties]: D:/WORKS/PLAN/nexion-backend/src/main/java/ffdd/opsconsole/content/application/NovaAiProperties.java:22
[handoff]: D:/WORKS/PLAN/nexion-backend/docs/HANDOFF-support-s4.md:9
[global-rate]: D:/WORKS/PLAN/nexion-backend/src/main/java/ffdd/opsconsole/platform/application/PlatformGlobalRateLimitFilter.java:49
[principal-rate]: D:/WORKS/PLAN/nexion-backend/src/main/java/ffdd/opsconsole/platform/application/AuthenticatedPrincipalRateLimitFilter.java:59
[socket-handler]: D:/WORKS/PLAN/nexion-backend/src/main/java/ffdd/opsconsole/content/realtime/ConversationSocketHandler.java:95
[socket-commands]: D:/WORKS/PLAN/nexion-backend/src/main/java/ffdd/opsconsole/content/realtime/ConversationSocketCommands.java:39
