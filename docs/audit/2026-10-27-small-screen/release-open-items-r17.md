# R17 收尾：APP OPEN 与外部 N/T 有界盘点

> 归档口径：本文件是签署前盘点，记录盘点时状态，不代表最终状态或最终签署结论。

2026-10-27。仅阅读指定 APP 主报告、交接及所引用的 R18/R19/R20 闭环记录，并核对最近冻结的 r16 A/B 待验清单；不运行测试/构建/浏览器，不读取凭据，不修改产品、代理或仓内文档。r17 A/B 正在进行，本表不等待、不预签其结果。

**结论：旧消息断面/滑入、正式 USER_VIEW 清空的跨账号授权及页面恢复已有修复和两位独立≥9的有限证据，不能继续列为“尚未实施”。当前确定的旧失败待关闭集中在满槽卡与邀请页根灰条；新导航、钱包和部分读取恢复尚待本轮增量签署。最终 H5 暂不能同步，原因是这些 APP 增量未签齐，不是要求重跑旧 IM18 或把所有外部前置变成新产品缺陷。**

“阻止H5同步”指本轮最终源码同步门；不等于 TEST 部署/真实业务上线门。外部 N/T 必须随交付保留，不可以同步完成冒充上线验收。最新构建按[统一报告 U][U]记录为 `BQJ7beyl / DPMvPy7r`、APP HEAD `ddcea906`加WIP；本次没有重新读取运行服务或Git来独立确认。

## 当前 APP OPEN / 增量待签

| 原问题或验收项 | 最新已有证据 | 当前状态 | 是否阻止最终H5同步 |
| --- | --- | --- | --- |
| 满槽320越文福利卡仍过高 | r16 B实景282.33px、**8.7 P2**；普通八格通过不覆盖满槽。r17已改embedded短说明/短管理并去重复行，源码独立**9.1**，已记录52项通过；新包双审在途。[S][S]、[B16][B16]、[R17源码][C17] | **OPEN-复验**；有修复，未签关闭 | **是**，需r17满槽结果，不重跑普通态全矩阵 |
| 邀请页错误恢复后根灰条及窄屏排版 | r15 A **8.6** / B **8.7**；r16已补html/body轨道与简文/小CTA，源码9.2。r16 A/B均未进入该新包路径，未证明修复后上下滚动/恢复。[A16][A16]、[B16][B16] | **OPEN-复验**；旧失败保留，不声称r16又复现 | **是**，沿正常/错误恢复和实际上下滚动关闭 |
| ≤374图标导航、56px高度及一次回弹 | r17源码**9.2**；40项既有测试、SVG1项与解析记录，父线程320读回55.99px、25.96px、标签隐藏及22px底部区域。390/reduce/点击/回弹仍待独立实景。[S][S]、[C17][C17] | **待签新增项**，不是已确认实现缺陷 | **是**，交当前r17 A/B，不另开旧导航矩阵 |
| 钱包新字号、长额、零与无快照 | A r16常规9.2、长额9.1、320零/未知恢复9.2；390零仅DOM、390未知未验。B明确将新金额矩阵列r17待验。[A16][A16]、[B16][B16] | **待签分支**；不能以320或A单侧代签 | **是**，只补剩余390帧及B规定范围 |
| 读取恢复卡剩余合法可达消费者 | A尚缺staking FAQ、deposit历史、network/tree分别实景，以及钱包收益/security最后稳定恢复。B指出FAQ实际GET为`/api/config/exchange/caps`，当前`exchange-config`精确路径模式不命中。[A16][A16]、[B16][B16] | **覆盖待补/QA路径缺口**；尚无证据判为新的APP业务失败 | **是（这些可达增量的验收）**；先命中真实GET，不用外层错误替代。此盘点不改代理 |
| 槽位材质与关闭的新包复验 | 原A8.6材质缺陷已由r15 A **9.2**关闭，关闭/安全区9.2；B仍列新包暗色/44px外沿/遮罩复验。[slot][Slot]、[B16][B16] | **旧缺陷已关，B增量待签** | **是，限已安排的补验**；不要重新写成材质尚未修复 |
| 签到未签到→checked及busy补证 | A已一次模拟签到、9.2；B checked入口9.3，但自己新增授权的未签到转态/重复保护尚未执行。[A16][A16]、[B16][B16] | **B限定N/T**，不是原签到合同失效 | **是，限当前队列已安排项**；不扩大到真实签到或资金行为 |

## 重点旧问题：已有闭环，不重新列 OPEN

| 原问题 | 最新修复与独立证据 | 当前状态/证据边界 | 是否阻止最终H5同步 |
| --- | --- | --- | --- |
| R18同x气泡/输入框断面、鼠标移出后闪烁 | C2 composer sampled替代出问题的backdrop路径。Einstein暗色**9.2**、浅色**9.1**、用户5237 native操作后结果**9.2**；Noether sampled行为、Averroes renderer源码各**9.1**。最终总账第15项继承该签核。[Q][Q]、[视觉原件][V18] | **本地限定 CLOSED**；旧c01/CBcr失败是历史，不外推全部GPU/连续录像 | **否** |
| R15/R16滑入漏播、快ACK替换截断 | renderKey接续同节点；Noether运行读回110帧same=true，pending→canonical时class保留，明确关闭该窄范围缺口。最终总账MSG-02保留Noether行为**9.1**、Einstein历史运动**9.3**；DEQ补左右180ms linear事件，C2返回无历史重播。[Q][Q]、[快ACK原件][ACK18] | **本地限定 CLOSED**；独立≥9存在，但历史运动分是继承，并非最终包所有路径连续动态重新评分 | **否** |
| 历史prefix裁切、header/counter叠字及清稿重入tail回0 | 最终PR5下空prefix异常fallback及Uni旧transition回写0已修；Noether layout/tail **9.1**、Einstein tail **9.2**。header9.2/counter9.1；最终两次back/list/reopen gap7.936px。[消息主报告][M18]、[Q][Q] | **CLOSED**；旧BEW/3j及8.6不能当当前失败 | **否** |
| R19“正式后端清空尚无实现”及跨账号越权风险 | R20已实现account+stable peer/CID持久水位。Noether授权**9.1**、持久化**9.3**；Averroes授权/持久化各**9.3**。独立实MySQL T1证明他账号/peer不受影响、服务图重建仍隐藏；T4错账号/peer/成员/版本不产生部分清空。[后端A][BA]、[后端B][BB] | **正式实现及本地边界 CLOSED**；不是只靠demo。真实JWT/重登录/换机仍N/T，见下表 | **否**；上线需另满足部署前置 |
| R20附件/markRead等锁后读到旧水位，换客服写旧CID | READ_COMMITTED与持久peer写入核对；Noether P2-A/P2-B **9.2**，双连接T6–T8及T9/T10覆盖；B事务/读取/复用各**9.2**。原命令重放不重新清掉水位后新消息。[BA][BA]、[BB][BB] | **本地服务层 CLOSED**；并发upload重放、真实对象存储/全转接HTTP仍有未验边界 | **否** |
| peer/clear精确拒绝与UNKNOWN混淆、原key卡死 | 精确拒绝才释放拒绝intent/允许新确认；UNKNOWN保留原key，持久拒绝可读回；旧CID只读、保留正文，由用户主动切当前客服。Noether最终各**9.1–9.3**、Averroes对应**9.2**。[R20][R20]、[BA最终][BAFinal]、[BB][BB] | **本地恢复链 CLOSED**；普通409/网络未知不被冒充确定拒绝 | **否** |
| REC-P2-01/02：同账号通知丢正文、clear后存活页旧气泡回流 | 区分真账号变更/同账号通知；水位前进退役页面镜像，重复marker保留新草稿，旧回调不得复活正文，pending原key恢复保留。Noether两项**9.2**，Averroes两项**9.2**（迟到回调单项9.1）；UGGOR9u8补稳定通知及活页clear证据。[BA最终][BAFinal]、[BB][BB] | **CLOSED**；迟到成功分支是源码护卫核对，新增执行用例为迟到失败；不冒称unknown/图片所有DOM组合已测 | **否** |

R19分页最高水位8.4→9.1修复、DEMO全局ID、裸路由防御、AUDIO/12+3、Nova明确输入拒绝恢复也均在[R18总账][Q]及[R19/R20主报告][R20]列为有限闭环；没有新的证据支持把交接历史中的“待实现”重新搬回当前队列。

## 外部环境 / 原生 / 资金或只读前置 N/T

| 原问题/边界 | 最新证据及实际未覆盖 | 状态 | 是否阻止最终H5同步 |
| --- | --- | --- | --- |
| TEST部署、迁移与bootstrap | 后端8f4f8086已推test是版本记录，不是Jenkins部署证明。新增`20261027_app_conversation_user_clear.sql`须在API启用前安装；启动注册已有源码/隔离schema证据。[U][U]、[BA][BA] | **外部TEST N/T** | **不单独阻源码同步**；是启用正式能力的硬前置，不能声称线上生效 |
| 真账号跨登录/物理换机、正式HTTP/JWT/WS | 本地DB服务图重建、合成USER principal/事件和前端实景已验；不等于真实登录、网关/正式WS投递与两个物理设备。[R20][R20]、[BA最终][BAFinal] | **外部集成N/T** | **否，限定源码交付**；保留能力门，旧服务404不降级dismiss/假成功 |
| 附件对象存储、真实图片网络及并发upload重放 | DB旧附件拒绝/不取字节已测；对象存储替身、受控图片resize不证明真实文件网络/存储；部分upload并发仅源码依据。[BA][BA]、[BB][BB]、[M18][M18] | **外部存储/网络N/T** | **否**；不得扩大附件线上签核 |
| 原生安装、触摸/相册hide-return、软键盘/IME、安全区、声效耳听、硬件心跳 | APP资源编译、浏览器native截图、相册行为45项、AudioContext调度不等于物理App体验。手机本机算力仍Android限定，合入iOS方案文档不等于iOS功能。[R20][R20]、[S][S]、[M18][M18] | **原生/硬件N/T** | **否，限定源码同步**；阻“真机已通过”声明 |
| 真实领取/激活/转购、付款、入金、绑定、回购等资金链 | 试用已有隔离模拟交易读回；本轮错误卡代理只准读取/恢复，不用真实资金动作造状态。[试用验收][Trial]、[A16][A16]、[B16][B16] | **真实资金/业务前置N/T** | **否**；不计真实经济业务验收 |
| repurchase historyError、无nextPage补页、legacy wallet-cards | historyError仅有资金命令后的独立路径，不能以外层refresh错误代签；账单/奖励mock nextPage:null；旧wallet-cards被gate转新绑定页。[A16][A16]、[B16][B16] | **只读fixture/路由前置N/T**，不据此判APP业务缺陷 | **不单独作为实现阻塞**；必须明列未覆盖，不能宣称21消费者全部实景通过或造业务/分页 |
| Nova后台较低有效上限、真实服务消息字段/完整幂等 | 客户端2000 UTF-16、12+3原key与明确拒绝恢复已有本地签核；真实Nova较低配置未下发、真实服务及后端幂等不由fixture代验。[Q][Q]、[M18][M18] | **接口/真实服务边界** | **否**，沿已约定范围保留，不重新把F15写成未实现 |
| 旧全局检查红项及full verify | 没有本轮full verify；旧`trial-stock-unavailable-contract`商品卡断言、Me促销骨架/全局a11y历史失败保留，未修改/跳过换绿。[U][U]、[Trial][Trial] | **遗留验证欠账**，不是本次确认的新产品缺陷 | **不按full绿设新同步门**；必须报告，不能称全站/全套绿 |
| 早购完整原试用期权益补齐＋固定立减 | 当前交付是详细提案，用户另交后续实施；非本轮已实施经济规则。[U][U] | **后续产品任务，非本轮OPEN** | **否** |

口径提醒：[restart-handoff][H]顶部仍写r16旧包，而[U][U]/[S][S]已记录r17；其更下方“正式接口未实现”“REC-P2仍开放”“quota0暂停”等明确为历史。本表采用最新闭环节，不改写原件、旧失败或旧分数，也不代替在途r17最终双审。

> 归档补注：盘点时读到的旧标题已更正；父线程已将 restart-handoff 的顶部口径更新为 r17。上文保留盘点时原文。

> 后端证据边界：后端 A/B 链接指向独立 `nexion-backend` 仓库的 commit `8f4f8086b26d000f90c55d2efec09556562b4f28`，后端报告未复制进 APP。

[U]: ../2026-10-27-unified-delivery.md
[S]: ../2026-10-27-small-screen.md#L69
[H]: ../2026-10-27-restart-handoff.md
[R20]: ../2026-10-27-service-earn.md#L5
[M18]: ../2026-10-26-message-theme.md#L3
[Q]: ../2026-10-26-message-theme/review-final-queue.md
[V18]: ../2026-10-26-message-theme/review-visual.md#L1399
[ACK18]: ../2026-10-26-message-theme/review-behavior.md#L1541
[BA]: https://github.com/agentabatiuo572-byte/nexion-backend/blob/8f4f8086b26d000f90c55d2efec09556562b4f28/docs/r20-user-clear-review.md#L11
[BAFinal]: https://github.com/agentabatiuo572-byte/nexion-backend/blob/8f4f8086b26d000f90c55d2efec09556562b4f28/docs/r20-user-clear-review.md#L329
[BB]: https://github.com/agentabatiuo572-byte/nexion-backend/blob/8f4f8086b26d000f90c55d2efec09556562b4f28/docs/r20-user-clear-review-b.md#L3
[A16]: r16-visual-a/review-r16-frozen-visual-a.md
[B16]: r16-interaction-b/review-r16-interaction-b.md
[Slot]: r15-visual-a/slot-result-r15.md
[C17]: r17-navigation-code-review.md
[Trial]: ../2026-10-27-trial-lifecycle/acceptance.md
