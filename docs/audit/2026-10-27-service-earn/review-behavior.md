# R19 客服与收益卡独立行为审查

审查日期：2026-10-27。工作区：D:/WORKS/PLAN/.wt/uvel-design-20261025-app。

本报告记录已完成的独立行为与响应式契约审查。本轮结论为：本地原型范围未发现新增生产阻断，两条分页水位旧P2已复验关闭。七项分别达到9分，不以平均分替代单项门槛。生产源码保持只读；审查期间按授权更新测试，本次仅新建本报告，未改他人报告，未操作浏览器、构建、提交、推送或同步H5。

**审查范围与逐项分数**

| 项目 | 独立行为分 | 已验证依据与范围 |
| --- | ---: | --- |
| 同客服合并与全部历史隔离 | 9.2 | 同一明确staff ID的多个会话合并；不同ID即使同名仍分开；缺失身份不按名称猜测合并。真实chat/store测试覆盖同peer历史读取及不同peer隔离；当前客服入口使用字符串ID匹配。 |
| 右侧未读与已读范围 | 9.1 | 同peer未读汇总，badge位于尾部meta列；零隐藏、数量封顶、读取失败不伪装成零。打开当前peer不读取或清空其他peer未读。 |
| 左滑、确认、取消及失败保留 | 9.2 | 实际SFC与实际删除composable分别验证。覆盖Uni规范化鼠标事件缺少button/buttons、无起点hover、拖动后不导航、结束清理、触摸/键盘及busy门控；确认取消、失败保留、隐藏/换账号/卸载隔离通过。关闭行删除节点保留但隐藏且不可Tab进入。 |
| 用户视图清空 | 9.1 | account+peer服务器水位的本地消费逻辑；刷新、replace、补页与缺口补齐不丢最高水位；旧图片消息被过滤；原幂等命令回读不吞掉水位后的同CID新消息。旧未修版8.4及两条P2事实保留，不将其改标为通过。 |
| Phone收益卡 | 9.2 | H5仅进入下载指引；APP按Android原生能力选择校准或设备状态入口。真实预处理分支、点击回调、三语文案及haptics偏好验证；不代表真机校准已执行。 |
| Staking收益卡 | 9.2 | ready配置与stakingVisible共同决定展示，点击时再次检查；loading、failed或关闭配置后不能通过旧回调跳转。保留原质押路由。 |
| GPU收益卡 | 9.1 | 独立computeShareEnabled配置门及点击复核；保留下载路由、满槽说明和试用占槽计算，满槽时进入连接说明不等于执行绕过槽位限制；devices原入口不被earn新卡替换。 |

收益卡响应式审查读取了真实EarnWayCard/NxButton结构与CSS：内容列min-width:0、文本允许换行、按钮max-width:100%、medium外层最小高度44px，插画不可截获点击；Enter/Space、repeat、disabled/busy守卫来自共享按钮。已目检下述320越文最终上下两图，三张卡CTA文案完整，GPU按钮滚动后可见。这里没有独立实测按钮热区像素，也不代替Einstein的视觉分数。

**两条旧P2的确切复验**

两例均在 [messages-start-entry.test.ts](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/messages-start-entry.test.ts)，使用真实chat脚本与真实Pinia会话store、受控传输响应，并非只断言源码字符串。

1. applies a clear from another device when the first fresh watermark arrives on an older page
   初始消息为10（附件old-image）及30，cursor=10；更早页首次带回水位20、空消息和null cursor。旧实际结果为[10,30]，期望为[30]。修复后断言消息仅30、水位20、threadMessages不再含old-image、cursor为null，均通过。修复路径：prependHistory取当前与补页水位最大值；replace应用过滤；loadEarlier返回过滤后的get(id)。

2. carries a clear watermark found during gap catch-up through the final merged snapshot
   本地旧消息[10,30]，新头页为40，缺口补页带30及水位20。旧实际结果为[10,30,40]，期望为[30,40]。修复后最高水位20穿过catchUpConversation和mergeConversationMessages，最终[30,40]，通过。消息与游标均按最高水位过滤。

这两条具体异步路径的回归已经执行通过；未用一般刷新成功路径替代其关闭依据。

**原幂等命令读回水位的结论**

现有逻辑允许原命令的旧水位低于重试时成员快照的最新消息ID，并保持水位后的新消息。这一结论有明确限定，不表示任意过低或错误水位都合法。

本审新增并执行的用例仍在同一测试文件，名称为 settles a late original clear receipt without clearing a newer same-cid message：

- 首次清空时最后公开消息ID为20；传输写响应及首次回读不可得，store保留原命令key。
- 同CID随后出现消息30、unread=1，并通过刷新获得水位20。
- 再次操作沿用原key，当前成员快照的lastPublicMessageId已为30；commandResult按该原key返回原清空回执20。
- 实际断言：第二次使用同一个key，回读匹配原key；操作完成后仍只有消息30，unread仍为1，水位仍为20。真实store测试通过。

源码核对：直接DELETE响应在conversation-management.ts中按本次members校验peer、成员及throughMessageId不低于其lastPublicMessageId；store的命令恢复路径则通过原key读回，校验kind、peer和成员覆盖，然后应用回执。上述场景中，原请求完成点是20，重试时新到达的30不属于原清空范围。因此不能机械地把重试时直接DELETE的“至少30”阈值套到原命令回读，否则会拒绝该合法原回执。

这项测试控制了API传输返回，验证的是实际store的原key恢复与状态归并；未执行真实HTTP DELETE/command-result联调，也未用该用例证明任意低于原请求边界的回执可接受。直接响应与命令读回校验差异的判断同时依据实际源码阅读。

**实际测试文件、执行结果与记录**

| 实际执行文件 | 最终结果 | 主要覆盖 |
| --- | ---: | --- |
| [service-message-list.test.ts](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/service-message-list.test.ts) | 16/16 | 真实SFC渲染，peer/右badge/确认/失败保留；dateLocale与共享display-date依赖；warm loading/categoryLoading不闪行、冷空加载、错误与fallback重试门控。 |
| [messages-start-entry.test.ts](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/messages-start-entry.test.ts) | 121/121 | 保留原有chat/历史测试；当前客服入口、真实store两条水位P2及旧key回执保留新消息。 |
| [use-conversation-delete.test.ts](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/composables/use-conversation-delete.test.ts) | 13/13 | 实际composable，小renderer；三语确认含用户视图语义、取消、失败、单飞、隐藏/账号/卸载及迟到结果。 |
| [conversation-swipe-row.behavior.test.ts](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-swipe-row.behavior.test.ts) | 14/14 | 实际SFC及安装依赖中的Uni鼠标事件规范化；拖动、hover、点击抑制、关闭隐藏DOM、键盘与busy。 |
| [earn-more-ways.behavior.test.ts](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/earn/earn-more-ways.behavior.test.ts) | 14/14 | 实际Uni预处理、卡片/NxButton渲染、三语入口、平台与配置门、满槽和试用占槽、devices入口保留。 |

四套客服测试最终164/164，收益卡14/14，合计178个用例最终通过。没有把他人的94项或143项结果作为本审独立执行结果。

执行使用本地node node_modules/vitest/vitest.mjs run，指定上述五个文件，并带--reporter=dot --silent。2026-10-27 13:46:06该次合跑为176通过、2失败：两条warm加载用例的测试快照函数序列化了Vue附加的循环引用，尚未走到产品断言。仅修正测试辅助函数为序列化显式host节点字段，未改变产品断言或生产代码；13:46:30单独重跑service-message-list.test.ts为16/16、exit0。故178为修正后各文件的最终合计，不声称存在一次“五文件178全绿”的新合跑。其余四个文件在前次合跑已全部通过，未重复扩大矩阵。

列表retry用例通过模拟drawer同步置busy，验证真实组件在Vue补丁前连续调用的阻断以及loading/categoryLoading的禁用；drawer的inFlight合并另有本轮源码阅读依据，不将此组件用例描述成真实网络并发试验。未恢复已被用户新要求替代的旧管理入口/removeHint期待。

**实际读取的运行证据**

本轮已读取.cache/r19/clear-before.json与clear-after.json：记录显示3个旧会话、34条客服存档，清空后可见会话为0，3个CID回读均0条且cursor为null，markerCount=1，archiveUnchanged=true。存档保留结论来自该记录；本审未重新从原始数据计算一遍archive SHA。

实际view_image目检过：

- 客服：service-swipe-dark-390.png、service-clear-confirm-zh-390.png、service-cleared-fresh-storage.png、service-clear-new-message.png、service-unread-dark-390.png。
- 收益卡：final-earn-light-vi-320.png、final-earn-light-vi-320-lower.png、earn-light-en-320-lower.png、earn-dark-zh-390.png。

以上文件均位于D:/WORKS/PLAN/.wt/uvel-design-20261025-app/.cache/r19/。service-clear-new-message.png显示的是新发出的消息，不用它替代incoming badge证据；service-unread-dark-390.png可见右侧badge=1，但其右缘红色细线属于修复前截图，不作为“删除底泄漏已修”的最终视觉证明。后者本审关闭的是当前源码/组件行为，不伪造新截图。

**已审源码指纹**

本次保存报告前只读核对以下SHA256与已审版本一致；没有重新运行测试或构建。

| 文件（相对APP工作区） | SHA256 |
| --- | --- |
| src/store/conversations.ts | C3C59CD469952C0B2305492F5442FA74EA53F653132E5AC7E41B93FA9B9B8DC4 |
| src/api/conversation-history.ts | AF972B0EF76217BE9880D1A487494EB028F197108A6442EC6F84FE07E1DE70CD |
| src/components/support/service-message-list.vue | 947C3052B2EB9DF06D4C3DE1E19A06824BF1B7D3CC19411040354828AFFE7E87 |
| src/pages/earn/earn.vue | 62D5481429A4C88F1105A91AF9F846D50D0ACF5505F4BBAD489514B3C3FC3A1B |
| src/components/earn/earn-way-card.vue | 0481E075B08E318D9A625CAC8D7046AE6FA04865020FD094CC230EFDBBBEFAFB |
| src/components/earn/compute-share-entry.vue | 6C4A62DB2F9EBB4A5915F50D1205FF876C86EA5F25205CD477889C7F3BE11322 |
| src/components/ui/nx-button.vue | F38BEBF3FA45D6C6A2AF503D9DEB99E1AE7368A417FEF6A6276840ED51E54A56 |

**生产未覆盖与签署边界**

本地后端源码审查显示，既有dismiss是个人收件箱隐藏，不等于本次account+peer用户历史清空。新conversation-management/USER_VIEW清空合同尚不能据本审宣布已在正式服务上线；前端收到能力404时关闭清空能力，不用本机缓存冒充服务器跨设备清空。

正式后端历史稳定客服身份仍需联调确认；已读到的后端ownerAgentId来自当前ACTIVE分配，不能以本地fixture稳定staff ID的通过推断生产历史归属永远正确。真实服务的重新登录/换机后水位、历史分页、附件资源访问权限及客服存档保留，均未完成生产验收。本地消息中的旧附件被过滤，不等于服务器附件URL的访问控制已验证。

本审未操作浏览器，使用的是既有运行记录与截图；未执行新原生安装、真机手势/热区、Android实际校准、真实质押交易、GPU连接执行或生产配置发布。H5最终构建/typecheck/native compile由主线程执行，本报告不冒认独立执行结果。视觉复刻、美术完成度及整页全站通过不在本行为评分内；本轮之外的R18既有签项不重新评分。

本次所需本地行为项已完成，未保留新增生产P2。完成报告后停止审查。
