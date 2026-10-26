# R18／IM18 最终有限本地验收汇总

日期：2026-10-27；最终状态更新：APP本地队列签署完成。工作树：`D:/WORKS/PLAN/.wt/uvel-design-20261025-app`。本轮仅核对最新独立报告与已有runtime，更新本报告当前摘要／表及4份主文档当前块；未跑测试矩阵、改源码、构建或操作Git／H5。下方各次审查记录保留其原日期与范围。

**当前判断：APP原18项队列在约定的有限本地范围签署完成，无本轮已确认而尚未关闭的本地P2。** Header9.2、counter9.1已签；Noether最终layout／tail9.1、Einstein最终tail9.2关闭fallback与完整清稿重入路径。C2 sampled、L1—L3和AUDIO／timeout双审保持。H5同步、最终提交及推送仍待父代理执行，不等于已发布。

最终APP预览为 **index-PR5b0C9J.js**，thread SHA-256 `4c339e53ce0999d74e98575bd5ea63a07c94093a7f1b0da352d4cdc301458b2c`。[最终runtime][Tail-runtime]两次真实back/list/reopen均8条、scrollTop450.303、末条bottom599.593、field.top607.528、gap7.936px；[Noether最终受理][N-tail-final]与[Einstein最终受理][E-tail-final]一致。Header／counter采用其[修后局部签核][E-layout-final]，sampled等未变范围继承C2原证据，旧图不改标PR5。

## 18项逐项账本

N＝Noether，行为／状态／生命周期；E＝Einstein，视觉；A＝Averroes，本审及既有专项源码复审。日期及 R 阶段按原报告记录，不补造精确时分。分数仅适用于对应范围，不平均、不把旧图改标为新构建；“继承”不是本轮重测。“未单独评分”不等于当前存在生产失败。

| #／项目 | 已承诺功能与当前口径 | 功能签核：何时／谁／几分 | 视觉签核：何时／谁／几分 | 当前本地剩余 |
| --- | --- | --- | --- | --- |
| 1 LIGHT-01 | 浅色活动结构化展示，主题与发布规则／SKU等价；暗色保留发布整图 | 10/26 N，R8继承 **9.0** [N8] | 10/26 E，R2代表活动／商城／缺图，继承 **9.2** [E-base] | 无新增本地必补；真实运营Banner发布属外部边界。 |
| 2 MSG-03 | 标题与未读数同行；全部已读仅清通知域，44px入口 | 10/26 N，R8 **9.2** [N8] | 10/26 E，R2补齐英越触区 **9.3** [E-base] | 无；不重做三语／双端旧矩阵。 |
| 3 CTRL-01 | 居中透明文字重试，防连点、hidden/account代次与失败恢复 | 10/26 N，R8 **9.1** [N8] | 10/26 E，R2＋R5管理页 **9.2** [E-base] | 无；不新增全站所有retry入口。 |
| 4 SHADOW-01 | 领取CTA去外投影，保留玻璃／inset与导航材质 | 10/26 N，R8继承 **9.1** [N8] | 10/26 E，既有领取CTA **9.3** [E-base] | 无；不因composer变更重验首页全部CTA。 |
| 5 SHADOW-02 | 管理页紧凑错误区、列表／预览局部阴影与可读性 | 10/26 N，R8 **9.1** [N8] | 10/26 E，R5 **9.2**；10/27 R18浅色首页／消息顶部阴影各 **9.2** [E-base] · [E-cards] | 无；旧180px空白已关闭。 |
| 6 MSG-01 | 权威回执；Telegram气泡内右下时间／我方图标，incoming仅时间 | 10/26 N，回执语义 **9.1**；后续精确key归第15项 [N8] · [N-final] | 10/27 E，R17普通文字／内置元信息 **9.2**；新材质按C2第15项签 [E-R17] | 无；旧气泡外左右meta布局已被用户覆盖，不复活旧布局断言。 |
| 7 MSG-02 | 双向180ms linear；快ACK保留同节点，历史／返回／receipt不重播，reduced静态 | 10/26 N，R8 **9.1**；10/27 R16明确关闭漏播／快ACK相关P2，最新归并继承 [N8] · [N16] · [N-final] | E历史运动范围 **9.3**；10/27 DEQ另有左右0.18s事件、C2返回无历史动画，未另给整段连续动态新分 [E-base] · [E-feedback] · [N-final] | 无新增必补；不要求重放已关闭race或完整旧动画矩阵。 |
| 8 BADGE-01 | 黄底深字统一token，0隐藏、1／99显示，通知／人工口径分开 | 10/26 N，R8 **9.2** [N8] | 10/26 E，既有角标 **9.3** [E-base] | 无；真实服务计数同步另列。 |
| 9 TOP-01 | 消息列表返回／设置／折叠及恢复，44px控制 | 10/26 N，R8 **9.1** [N8] | 10/26 E **9.2**；10/27消息页局部阴影 **9.2** [E-base] · [E-cards] | 无；与第13项会话历史加载区分开。 |
| 10 TIME-01 | 当前规则为相邻24h；跨午夜不足24h不另分，补页不制造错误首条分隔 | 10/27 N，R18精确边界与DOM **9.2** [N-F15] | 10/27 E，R17可见12px日期外观 **9.1** [E-R17] | 无；与历史加载文字碰撞的布局P2已按第13项关闭，不重跑旧5min规则。 |
| 11 ATTACH-01 | 禁用灰图标／零caption，策略generation及owner守卫，图片预览 | 10/26 N，R8 **9.1** [N8] | 10/26 E，R5 **9.2**；10/27 E另接受L3受控尺寸同步，不另升总分 [E-base] · [E-L23] | 无；不要求真实上传来重新签禁用入口。 |
| 12 SEND-01 | 发送强调／200ms反馈、多行自适应、尾部留位、历史锚点、72px邻近映光与局部玻璃 | N：R8／测量／HISTORY各原限定分保留，reflection **9.0**、清理 **9.2**；最终PR5 layout／fallback／tail **9.1** [N8] · [N-reflection] · [N-dispose] · [N-tail-final] | E：原反馈／rim **9.2**；C2暗材质 **9.2**／浅 **9.1**；PR5清稿重入tail **9.2** [E-send] · [E-rim] · [E-final] · [E-tail-final] | 无。空prefix后invalid／timeout裁切及3j旧transition回写0均已闭环；旧8.6与失败轨迹保留在原报告。 |
| 13 CHAT-TOP-01 | 透明外层、居中身份、44px返回、移除人类右头像，presence状态；历史加载可读 | N，原头部／异步测量 **9.1**，最终historyflow布局 **9.1** [N-top] · [N-overlay] · [N-tail-final] | E，修后header **9.2** [E-layout-final]；历史：**C2历史加载与日期叠字 8.6，未通过** [E-header] | **P2-A已关闭。** history-prefix在滚动流，加载入口与日期分离，分页锚点变化约0.07576px；仅签报告所列局部范围。 |
| 14 AUDIO-01 | 成功修订触发；重试成功、去重、owner/visible门控；初始／历史不补播 | 10/27 N与A独立各 **9.2**，限定通过 [N-audio-final]；A依据见本报告AUDIO追加节 | 不另给听感分；AudioContext running与节点调度不等于耳听 [E-feedback] | 无；已具两位独立限定签核，耳听及原生设备播放仍属发布边界。 |
| 15 STATUS-01 | pending/sending/failed/unknown、原图标重试与原key；单泡纯色、整屏纵向色序；修复输入断面 | N：10/27 singleflight/key **9.1**，sampled行为 **9.1**／18回归；A sampled源码 **9.1** [N16-final] · [N-sample] · [A-render] | E：C2暗材质 **9.2**、浅 **9.1**、原5237 native操作后结果 **9.2**；L2／L3补证已受理，原签保持 [E-final] · [E-L23] | 无本地待办；第13／18项叠字亦已关闭。旧c01／singlepaint失败保留，不外推所有GPU／连续帧。 |
| 16 PREVIEW-RT-01 | 全局消息ID、首建可见、持久指纹、409正确payload回放、UNKNOWN/reset、裸路由／额度门 | N，10/27 R18各对应子项 **9.2** [N-preview] | E，10/27 bare-route消息页 **9.1** [E-rim] | 无；DEMO2／transport旧失败已关闭，fixture不代签真实服务。 |
| 17 SEND-TIMEOUT-01 | human实际派发ACK≤12s＋读回≤3s；精确echo采纳，403/null不误改未知，原key恢复 | 10/27 N与A独立各 **9.2**，限定通过 [N-timeout] · [N-audio-final]；A依据见本报告timeout追加节 | 纯策略不另造视觉分；图标／布局按第15项范围 | 无；21.543秒是已观测unknown的采样时刻，不伪称精确触发时间；真实服务仍未代验。 |
| 18 MESSAGE-LIMITS | trim后2000 UTF-16、不截断；1s＋5/15s及busy；account/cid预算迁移、Retry-After；Nova75s与F15拒绝编辑恢复 | N：迁移／Nova截止／F15各 **9.2**，计数／超限／policy-retry测高 **9.2**；A F15提示 **9.2**；L1已受理 [N16-final] · [N-F15] · [A-Nova] · [N-L1] · [N-layout-final] | E：R17输入原签 **9.2**，修后counter **9.1** [E-R17] · [E-layout-final] | **P2-B已关闭。** 提示进入composefield，2001→2000留位与禁发恢复已受理；IME及真实Nova有效更低上限保持未覆盖。 |

券卡、试用卡及浅色顶部阴影没有漏项：N 10/27交互增量 **9.1**，E券卡／试用卡各 **9.2**，浅色首页／消息页顶部阴影各 **9.2**，继续按其原限定范围继承 [N-overlay] · [E-cards]。它们不增加IM第19项，也不因聊天布局修复重跑。F15归第18项；同flush HISTORY、REFLECTION、composerHost重绑及topInset归第12／13项，不另增队列。

## 先前有限验收清单（历史，现已闭环）

下表保留当时的有限计划原文，现不再作为待办；header／counter已获修后签核，随后发现的fallback与清稿重入亦由PR5最终签署关闭。

| 本地待办 | 最小复验及通过条件 | 审查责任／停止条件 |
| --- | --- | --- |
| P2-A：历史加载文字撞滚动日期 | 在已失败位置取390明／暗各一张，320越文一张检查长文案与44px入口；同一会话实际补一页或重试一次，确认加载／错误反馈不盖日期，阅读锚点不跳。顶部返回／身份仍保留既定布局。 | Jason实现；E只复审这个区域并给≥9的限定分；N只核对实际变更触及的历史入口／锚点差量。三张代表帧＋一次读回足够，不重演全部HISTORY时序。此最小范围沿用[E-header]。 |
| P2-B：计数／长度提示在玻璃外叠历史文字 | 复用2001草稿，在320越文当前失败场景确认提示清楚、不与历史／输入正文／发送圆重叠；另一主题390取一个代表帧。一次删回2000确认提示和留位正常收回、发送状态恢复。检查变更后的实际composer留位，不要求重新发送长文。 | Jason实现；E检查提示所属表面与排版、给修后限定结论；N只核对受影响输入guard／留位绑定。两张代表帧＋一次状态读回，不重复已经完成的真实paste链或限流矩阵。 |

上表是**两条链，最多五张代表帧与各一条操作读回**，不是再开主题×语言×宽度×状态全组合。新包只补与这两处差量对应的源码／产物／运行标识；未变条目的原证据继续继承。若这两条均通过且没有新具体失败，即停止追加同类本地矩阵，汇总为“APP本地已签有限范围完成”，不升级为全设备、全服务、全时段保证。

## L1—L3已补范围与不可扩写的边界

| 点 | 最新接受结果 | 保留的准确边界 |
| --- | --- | --- |
| L1 | N在10/27补录：原生粘贴2000，可发；追加至2001，完整保留并禁发／提示；BackSpace回2000恢复。绑定C2xTeVme [N-L1] | typeText不是IME候选词确认；没有compositionstart/end证据。该边界保留，P2-B布局现已另获修后签核，不再待修。 |
| L2 | E在10/27最新补录：稳定浅320同一bubble前后geometry／position／fill一致，position89.0%、fill rgba(25,66,215,.9)，最小补证接受 [E-L23] | 不倒推旧蓝／紫双图的原因或时序，不据两张结果图承诺所有中间帧。无需重采同一场景。 |
| L3 | E在10/27最新补录：受控width使源／副本约186→110，成功读回双方及内部IMG约109.999992px，画面无明显旧尺寸残影，取证缺口关闭 [E-L23] | 首次仅改height未生效的attempt不算成功；真实网络冷加载／解码未验，已有load行为测试与本次尺寸实景分别保留。无需扩成所有图片／SKU矩阵。 |

18项中没有漏掉最新用户覆盖要求：incoming无状态、气泡内时间、单气泡单色而非内部渐变、整屏取色、局部玻璃和近邻映光、多行增长与末行、失败／未知原键恢复、实际派发15秒、统一长度／连续发送以及Nova明确拒绝后的可编辑恢复，均在上表有对应项。旧5分钟分隔、外部sender/meta布局、靠按钮epoch判断音效成功等已被替代的要求不再恢复。

**评分口径：** 本地队列完成依据有效历史分、子项及最终差量的独立签核，不把不同构建证据统一改标PR5，也不写成每项在PR5均重跑功能／视觉全矩阵。AUDIO已具N／A各9.2，但听感未评；timeout等纯策略不另造视觉分。

## 发布／外部环境边界

- **真实服务**：TEST／生产鉴权、真实客服WS和权威送达／已读、真实429／服务端预算、Nova部署的有效长度上限未下发、正式运营Banner发布均未由本地fixture证明。F15本地拒绝恢复已签，不再作为“尚未实施”；隐藏Nova不因验收而开放。
- **真实设备**：Android／iOS安装、系统键盘与安全视口、App WebView／GPU、原生WAV／扬声器听感和触摸表现未验。桌面native鼠标、APP资源编译和AudioContext running不能代替。
- **性能与范围**：C2的24条、240个rAF样本、约3.196秒及clone1..4只支持该样本；不写成数百条历史、持续长时间、所有缩放／设备或逐像素无闪。该限制不阻止已审本地范围收尾。
- **发布动作**：本轮不做Git／H5。APP预览使用build:h5不等于H5仓库已同步或发布；旧R8双端证据仅继承对应未变范围，不能宣称当前R18双端发布完成。

上述发布边界及IME／真实网络图片加载限制不转换为已签本地队列的新待办。H5同步、远端整合、最终提交及推送由父代理另行执行；本报告不宣称这些交付动作已完成。


[N-layout-final]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-behavior.md:2954
[N-tail-final]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-behavior.md:2992
[E-layout-final]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-visual.md:1498
[E-tail-final]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-visual.md:1509
[Tail-runtime]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-final-tail-runtime.json

## 签核来源索引

表内短标记链接至对应独立报告段落；评分和关闭结论由原审查者负责，本报告只归并范围。

[N8]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-behavior.md:499
[N-top]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-behavior.md:691
[N-audio]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-behavior.md:841
[N16]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-behavior.md:1216
[N16-final]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-behavior.md:1561
[N-overlay]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-behavior.md:1794
[N-reflection]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-behavior.md:2024
[N-history]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-behavior.md:2313
[N-dispose]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-behavior.md:2402
[N-preview]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-behavior.md:2512
[N-F15]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-behavior.md:2585
[N-sample]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-behavior.md:2682
[N-timeout]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-behavior.md:835
[N-final]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-behavior.md:2792
[N-L1]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-behavior.md:2880
[E-base]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-visual.md:37
[E-send]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-visual.md:619
[E-R17]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-visual.md:874
[E-cards]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-visual.md:937
[E-rim]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-visual.md:1310
[E-feedback]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-visual.md:1381
[E-final]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-visual.md:1399
[E-header]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-visual.md:1454
[E-L23]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-visual.md:1474
[A-render]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-rendering.md
[A-Nova]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-nova-recovery.md

## 2026-10-27追加：AUDIO-01／SEND-TIMEOUT独立源码与合同复审

审查者：Averroes。此次按用户明确委托，重新读取当前APP源码、F12.2／F12.3合同及已有测试，并执行下述最小定向测试；仅追加本报告。两个分数由本审根据事件链、隔离条件及实际测试结果独立判断，不从Noether分数、视觉分或平均分推导。未修改生产或测试，未操作浏览器、构建、Git或H5。本节不复审Jason正在处理的两处布局。

| 项目 | 本审独立分与结论 | 本轮具体未修问题 | 第二位审查与登记结果 |
| --- | --- | --- | --- |
| AUDIO-01 | **9.2/10，限定通过**：权威成功／incoming事件、去重、owner／生命周期及设置门控的源码与本地行为范围。 | 本范围未发现新的具体P1／P2；已关闭的漏音与跨owner问题没有在本轮定向用例中复现。 | Noether已另行补记同范围 **9.2** [N-audio-final]。现在两位各有明确限定分；本节更新前表第14项和评分口径段中“尚无最终数值”的登记状态，不改写历史低分。 |
| SEND-TIMEOUT-01 | **9.2/10，限定通过**：实际派发后的12+3秒、错误语义、精确echo、原key及隔离恢复。 | 本范围未发现新的具体P1／P2；读回403覆盖原超时、13秒echo后null重建unknown两处旧缺陷均未回归。 | Noether既有独立 **9.2**，最新补记维持 [N-audio-final]。本审为另一份源码／合同及测试判断；纯策略不另造视觉分。 |

### AUDIO：实际事件链与可证范围

| 检查点 | 当前源码与结果 |
| --- | --- |
| human权威成功与首建交接 | [sendHumanMessage][Aq-human]在store成功返回、account binding／cid／support scope仍有效后才推进revision；首建先恢复真实cid，再记录成功owner。[noteSendSuccess][Aq-success]另挡隐藏／销毁。失败、unknown和按钮完成回调本身都不能制造成功声。普通／快捷／图标重试共用此发送通路；本轮未冒称逐一实际点击所有入口。 |
| Nova入队、重试及重复完成 | [队列结算][Aq-success]按pendingNovaSounds的turnId移除一次，再检查同turn已完成消息；入队或processing本身不触发。实际[drain][Aq-drain]先收到API结果并核对当前request／account／conversation／visible，才调用[completeRemote][Aq-nova]；后者只接受processing项，重复完成不能再次结算。图标重试重新登记原turn，独立于是否存在按钮回调。 |
| revision与owner | [thread post watcher][Aq-thread]在播放时再比对JSON[account,binding,composer]及可见性，不依赖按钮epoch。定向测试通过相隔401ms的两次成功、重试、首建最终owner，以及成功已入post队列后改变account／binding／conversation／hide的反例；初始revision、重复revision、reset及dispose不补播。 |
| incoming、历史及重复 | [真实entrance helper][Aq-entrance]只在相同owner且前后均visible／ready时识别未见过的左侧实时尾部消息；初始／切换／历史只登记ID，历史前插、receipt变更、system及隐藏后返回均不触发。本轮thread用例实际执行该helper，收到一次incoming后，上述操作没有增加receive调用。未因只看CSS入场class推断声音正确。 |
| 偏好、手势及资源 | [preferences][Aq-prefs]默认关闭、读取本地布尔设置并持久化toggle；[audio controller][Aq-audio]同时检查enabled／visible／disposed，须先由用户手势unlock创建voice，同类400ms内合并且不补播。thread在关闭设置／owner改变时同步stop、hide停止、dispose销毁。控制器测试通过平台缺失／播放抛错不影响业务、WebAudio suspended不播放、native配置与销毁；两个WAV路径实际存在，但这不证明设备能听到。 |

评分依据是发送与接收事件均能追溯到明确业务条件，并且错误／重复／归属改变有可执行反例；不把单次按钮动画或AudioNode数量当作成功语义。400ms内同类合并是现合同，不以“每个revision必须可听到独立一声”另设规则。

### SEND-TIMEOUT：12+3与原key恢复

| 检查点 | 当前源码与结果 |
| --- | --- |
| 实际派发计时与有限等待 | [策略][Aq-policy]固定ACK 12000ms、readback 3000ms，Promise.race后清timer；[command][Aq-command]在action(key)实际调用后包ACK等待，只有不明确结果才读原命令。create／reply失败后的[reconcile][Aq-dispatch]是后台void调用，不追加到主动等待。15秒是本次发送主动等待上限，非从点击算起的排队／鉴权／附件上传总时长，也不保证浏览器阻塞时物理时钟准点回调。 |
| unknown与明确拒绝 | HTTP／WS业务ack的408／409／425／429／5xx按统一策略判不明确；非HTTP普通business明确拒绝即时退出并退役key。GET readback的403／auth／network失败不能替换原写入超时cause；没有权威结果仍unknown。定向用例覆盖精确12秒与15秒边界、早拒绝及上述映射。 |
| 同key与singleflight | command先持久化pending fingerprint→key，再派发；同intent并发调用共享同一promise，retry读取原pending key，读回仍用这个key。scope／account／pending run变化会阻止旧恢复采用；未知结果不自动新建key重发。晚ACK本身不会绕过已settled wrapper触发第二次业务完成，后续权威reconciliation可恢复。 |
| 精确canonical与两个旧缺陷 | [echoedOutcome][Aq-command]限定同cid（create为同type）、user消息及精确clientMessageId；[replace][Aq-replace]采用同一匹配条件退役pending并清理saved.failedSend，不以正文认领。本轮通过相同正文不同key、无echo、跨会话／type和agent消息反例；也通过13秒收到精确echo后readback为null、或读回超时仍采纳已确认结果，以及GET403不得把原unknown改成failed。 |

这些结果符合[PRD F12.2／F12.3][Aq-contract]；不把human的15秒混同Nova的75秒回复截止，也不把authoritative sent解释为对方已读。

### 本轮实跑记录与限制

在本工作树执行以下两个已有测试选择，退出码均0；**6个文件，共125 passed、0 failed；第二组315 skipped是显式筛选，未称全套通过。** 没有新增矩阵或写测试日志文件，实际输出摘要在此保存：

```text
05:41:32  Test Files 3 passed (3); Tests 84 passed (84); Duration 520ms
05:44:02  Test Files 3 passed (3); Tests 41 passed | 315 skipped (356); Duration 3.21s
```

```powershell
node node_modules/vitest/vitest.mjs run src/lib/conversation-audio.test.ts src/lib/conversation-delivery-policy.test.ts src/store/conversations-send-deadline.test.ts --no-cache --reporter=dot
node node_modules/vitest/vitest.mjs run src/components/support/conversation-thread.behavior.test.ts src/pages/support/messages-start-entry.test.ts src/pages/support/nova-queue-page.test.ts --no-cache --reporter=dot -t 'post-flush success revisions|concurrent successes more than 400ms|sounds for retry success|already queued success sound|does not replay an initial revision|unseen live incoming|rendered human delivery and success revisions|counts two queued Nova successes|counts Nova retry success|does not sound a late Nova success'
```

第二组页面源码提取式harness输出Vue `onMounted ... no active component instance`警告；断言通过仍只证明该harness实际覆盖的函数、Vue响应式／post调度及投影行为，不能据此宣称完整页面挂载、真实媒体播放或原生生命周期已验。第一组使用fake timers／受控transport和平台音频替身，验证真实策略／store／controller；没有访问真实服务。

当前源码取证指纹（SHA-256前16位，读取于2026-10-27 05:45 JST）：audio `99d221d6acfc827c`；entrance `50977bf14269725a`；thread `d2def8aa2ebb472b`；chat `a166621ddfc02a70`；Nova store `f431161187b55488`；preferences `efc4200f977374ed`；API errors `4b0a1b576b10a51b`；delivery policy `5f3e9a0b9e99ec53`；conversations store `b81b5f89fdc6d967`。对应测试指纹依上面命令顺序：`7d40d3b7166c4aab`、`0890bd97d61c8ff3`、`e735f53f02588c65`、`1db4716e481aacb7`、`0ed62398ad887204`、`e009149932824710`。在途布局WIP的后续文件hash可能变化，本分只覆盖上述已读事件与策略，不代签新布局或后续改动。

**本轮没有耳听、真机WAV／静音开关／音频焦点、真实客服WS／HTTP超时或后台幂等数据库验收。** 真实服务是否正确保存并回传key、实际部署的送达／已读以及设备播放许可继续属于发布边界。两项在本地已审范围可记录为双独立限定通过，不把这些边界新增为已关闭P2，也不扩写成全设备／全服务通过；AUDIO不给听感分，timeout不给伪视觉分。

[N-audio-final]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/review-behavior.md:2908
[Aq-human]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:1445
[Aq-success]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:215
[Aq-drain]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:1556
[Aq-nova]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/store/nova.ts:206
[Aq-thread]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:276
[Aq-entrance]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-entrance.ts:24
[Aq-prefs]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/store/preferences.ts:49
[Aq-audio]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/conversation-audio.ts:5
[Aq-policy]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/conversation-delivery-policy.ts:3
[Aq-command]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/store/conversations.ts:319
[Aq-dispatch]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/store/conversations.ts:622
[Aq-replace]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/store/conversations.ts:403
[Aq-contract]: D:/WORKS/PLAN/.wt/uvel-design-20261025-app/PRD/UVEL_设计审查功能同步_20261026.md:152

## 2026-10-27追加：交付前远端合入风险（只读）

读取现有fetch结果：APP HEAD `226249e2fc64e89c32ee54b520a304e0127ee383`，`origin/test=7c86e97cb4d3604c1a41e4d758a81d79b6b6551b`，共同基线 `c17d42d464fdd82c0cdc62b69fed825d8a5a4a02`；确认 **20本地／3远端**。远端三提交为 `6bb0693d`（客服重连、课程恢复、邀请规则）、`2baa7f11`（等级内部标签）、`7c86e97c`（奖励详情内部元数据）。计数不包含当前R18／Nova／initial-tail未提交工作；不能把HEAD等同最终候选。本轮仅使用status／rev-parse／log／diff／show／grep等只读命令，未fetch、合并、模拟合并、提交、建分支或运行测试，仅追加本文件。

**判断：已给定远端差量与本地Nova恢复没有发现直接语义冲突；主要风险是合入时丢掉任一侧修改，或只接一半realtime状态契约。** 远端改30条路径，其中7条与本地相对基线的修改重叠；逐hunk核对未见同一基线行的相斥修改。这是源码风险判断，不是实际合入成功或整合测试通过的证明。

| 重叠／耦合范围 | 应保留的两侧行为与具体风险 |
| --- | --- |
| `src/api/conversation-realtime.ts` ＋ `src/store/conversations.ts` | 远端把state改为`(ready, terminal, unavailable)`，健康续期不是故障，已有故障要等catch-up成功才清除；store必须采用第三参，二者需一起保留。本地ACK使用共享12000ms常量，store另有12+3、echo、原key／singleflight与后台reconcile，远端未修改这些段。整文件择一会丢修复；只更新一侧会恢复误报或把undefined写入fallback。远端15秒**建连**时限不替代本地消息12+3，续期仍拒绝未确认命令且不自动重放，语义可并存。 |
| `src/i18n/messages/{zh,en,vi}.ts` | 远端新增课程开始恢复文案、删除奖励详情内部policyVersion／effectiveAt标签；本地改消息／重试／长度文案，位于不同段。应保留双方差量；不能为恢复旧类型引用又把用户要求隐藏的内部标签显示回来。 |
| `src/components/team/invite-detail-sheet.vue` | 远端把rules分支换成共享InviteRuleContent并新增import；本地在records失败区保留文字重试与纵向居中布局。两个分支不冲突，整文件覆盖会丢一侧；规则模块、分享入口及对应文案须随远端一并进入。 |
| `PRD/UVEL_设计审查功能同步_20261026.md` | 远端补F02课程、F04邀请；本地补后部IM／F15合同及当前WIP。无相斥规则，需同时保留，不用远端旧全文替换本地合同。其余远端课程／团队差量没有本地同路径修改。 |

**replyHint／inputRetryPolicy专项核对：** 对上述固定`origin/test`全`src`以及共同基线搜索，均无这两个标识；远端三提交也未修改`chat.vue`、`conversation-thread.vue`、`nova.ts`或`nova-failure.ts`。该ref能证实的support变化是重连状态，不能替另一份未提供的提示／重试策略差量签兼容。当前存在的`retry-policy`是附件策略读取事件，chat接到`loadAttachmentPolicy`，与Nova的queue编辑／取消／retry通道分开，不能把它当“重新发消息”。

本地Nova [失败映射](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/nova-failure.ts:5)仅把HTTP400／code400／`NOVA_AI_INPUT_INVALID`认作明确未受理；[编辑门控](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/store/nova.ts:246)拒绝outcomeUnknown，取消编辑／原文保存恢复failed，修改正文才生成新turn；[页面保存](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:1644)保存失败用通用失败反馈，只有实际queued才进入派发。已给定远端不改变这些条件，因此保留本地WIP时可兼容；若replyHint／inputRetryPolicy来自另一个未推送候选，此结论不覆盖它，尤其不能让“提示重试”隐式保存或重发未知turn。

合入后**最少必要验证建议**，不另建矩阵：一次现有type-check；回跑远端已改的`conversation-realtime.test.ts`、`conversation-refresh-continuity.test.ts`、`conversations-realtime.test.ts`与本地`conversations-send-deadline.test.ts`，核对健康续期／真实故障／catch-up、旧owner和未知命令不重放仍与12+3、403／null／原key共存；邀请仅复用`share-channel-sheet.behavior.test.ts`现有规则入口／读回重试用例，并检查本地records文字重试仍保留。未触及的课程、团队及Nova既有通过证据可继承，不重复18项或声音／视觉矩阵；只有实际整合又改到Nova提示／动作绑定时，再选已有F15的明确400、unknown禁编辑、原文保存／取消不发、改文新turn用例。Jason的initial-tail回归继续由其当前验证负责，本审未改其文件。上述建议不代替项目既有发布门槛，也不表示本轮已执行合入验证。
