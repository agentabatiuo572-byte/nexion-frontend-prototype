# 消息与主题专项 R2：独立交互／数据语义复审

审查日期：2026-10-26。审查工作区：`D:/WORKS/PLAN/.wt/uvel-design-20261025-app`。依据专项报告 [2026-10-26-message-theme.md](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme.md)、R1/R2 manifest、runtime JSON、当前冻结源码及实际页面截图。

**结论：不能签“九项全部通过”。五项在下表明确列出的本地原型范围达到9分；MSG-01、MSG-02存在未闭环P2，SHADOW-02、TOP-01存在本项关键实景证据缺口，四项未签。没有用平均分抵消低分项。**

本轮仅写本文件。未修改生产代码、构建文件、截图或其他文档；未执行Git、提交、推送或浏览器操作。截图由主线程取得，本审使用 `view_image` 逐张目检；运行过程依据保存的记录核验，没有声称亲自复点浏览器。

## 冻结与证据核验

- APP、H5 R2均逐项核对 **40个源码文件和341个构建文件**，与各自manifest的SHA256全部匹配。H5实际文件读取自 `D:/WORKS/PLAN/.wt/uvel-design-20261025-h5`。
- 两端R1→R2清单比较都只改变 `src/styles/message-center.css`；当前生产差异是 `.message-mark-all` 增加 `min-width:44px`。其他审查相关源码未因此回修。
- R2 APP sourceRef为 `5cae9213fc292f5be6cf4e27d2ecaf527c7b6ec5`；H5 manifest引用同一APP sourceRef。本审未用Git核验提交关系，接受的是已经逐文件核对的内容指纹。
- APP原有32张R1截图的汇总指纹仍为 `9776c59b14288b0c7c625e4746fc4679b471e9afe83170f358eea1872af0a506`，与此前目检时一致。R1不改标成R2。R1矩阵可支持未变的布局；R2四张英越320截图及对应量测专门验证新增44px最小宽度。
- 本轮累计目检 **57张非draft PNG**：APP R1 32张、APP R2 3张、H5 R1 14张、H5 R2 8张。三个draft排除。逐文件指纹见附录。
- runtime已按R1/R2及端别拆分，以下记录拆分后当前文件的SHA256，不声称拆分前后JSON字节不变。
- 专项报告记录509/509 Vitest、5/5 Node、APP/H5类型检查、双方生产构建、APP原生资源编译及R2头部12/12通过。本审未重新运行这些整批检查；另执行了实际页面函数／helper的内存复现及会话重试测试。测试数和编译成功不能替代下面未闭环问题或原生实景。

| 清单 | 源码指纹 | 构建指纹 |
|---|---|---|
| app-build-r1.json | `5551259bfb5faa7574bafbf0fc962a8da7db6a28b54289e0d11b5d1852ce0a0a` | `1496541e58c9d61b7fd3cc59feeb804301cd494ddf17fbf13d9139f049775def` |
| h5-build-r1.json | `c6a744320c00c4eb337f02986e47c6a98d4a1e849b355b00341febeed90e2986` | `c467f18198e1f0e10750d8a64e746e0df2bc1a7230a1b697387876fdf5e95287` |
| app-build-r2.json | `76cc951ab545cafac7fe41899eb085e94fc3892836024198ef84147ac8542afb` | `7949b0cbfd735a661f281c8aef8dd7baa9d9c966c35bed3d13322206c8ca17ba` |
| h5-build-r2.json | `ca4447f87f90634d6a90139004a4973ddede5e373e9684aade5fba0991e958df` | `ef5310701b9efcba96750b0c67e75a7a1340e26882ceb7a0e23233f4812fa7c3` |

| runtime文件 | 本次审查SHA256 |
|---|---|
| app-runtime-r1.json | `1f3dd8ebd5695b899d6effe6e33aed8b471a3f4bebfbc3d5e5555c5649004766` |
| h5-runtime-r1.json | `af3b82ad7b71f002db6514dc8895c8ffdaf4158e7766cfb732b74117583bd781` |
| app-runtime-r2.json | `bee378cc5dc499060f7c66310cef1d3e74b89487247554cffd5251621b226dd0` |
| h5-runtime-r2.json | `7aeabc0aefc679712fb3ab3ee76021db4daeeef4dc8ab2680688d20bd54c3eb2` |

## 九项分数

分数以本次本地原型证据为范围；“限定范围签核”不是全站、所有消费者、TEST真服务或真机通过。低于9的两类原因分开：已发现缺陷需要回修；关键实景缺失需要补证，不把缺证直接写成生产缺陷。

| 项目 | 分数 | 结论 | 已核验内容、证据与限制 |
|---|---:|---|---|
| LIGHT-01 | **9.0** | 限定范围签核 | 首页三种活动、APP首页/商城浅色及深色对照、英越320、后台机型替换样例均可读；H5 R2正常、缺主购图、双图失败保持主购/赠品位置，未由赠品顶替主购。见 `app-activity-*.png`、`app-store-*.png`、`h5-r2-store-light-*.png` 及同名runtime条目。仅签这些结构化展示样例；实际运营完整Banner、其额外图内文案以及真实主题切换全过程没有在本项实景签核。 |
| MSG-03 | **9.2** | 限定范围签核 | APP与H5各12格标题矩阵已逐张目检，1301未读与操作同行；R2英越320两端操作均44×44，量测无横溢。R1记录Enter后1301→1298，只清3条通知，人工客服1298保留；零未读截图是另一个全读样例，不能说批量通知操作清空了人工会话。H5失败显示“-”、重试恢复1301。未外推任意大计数、原生或真服务。 |
| CTRL-01 | **9.1** | 限定范围签核 | APP中/越浅色服务重试及H5深色通知/服务重试居中、透明、无外投影，高44；已有click/Space及失败原页Enter恢复记录。通知retryRemote与会话管理retryConversations的同步busy、取消代次、旧finally隔离保留；新增会话实际函数singleflight测试在内存执行通过。发送、上传、购买等业务动作未统一改成读重试样式。其他列举消费者仅完成源码检查，不代签其全部实景状态。 |
| SHADOW-01 | **9.1** | 限定范围签核 | 明暗首页和H5首页目检、runtime均支持试用“领取”只保留inset；对应CSS是局部覆盖，外层领取交互及底部导航保留。H5 `trial` 读回列出32×54视觉表面，它是外层卡片中的展示CTA，不能误称该表面本身是44px按钮。未签未提供的领取按下／禁用动态帧与原生渲染。 |
| SHADOW-02 | **8.8** | 未签：证据不足 | 已见服务头像、文字重试、会话管理入口、聊天内商品CTA和图片预览的局部效果；H5深色头像实际shadow仅inset，源码覆盖局部而非全局取消玻璃。仍缺进入会话管理页后的内容、列表上下滚动边界及相关弹层边界对照。本项不能由一张服务页、一个“会话管理”入口或全站样式枚举代签。未据此认定又有切边代码缺陷。 |
| MSG-01 | **8.7** | 未签：P2-C | 已核对我方回执在左、对方在右、时间保留、系统和缺回执不补造；APP长正文/商品消息及H5 320无横溢。真实对方receipt是否提供属于后台边界。浅色320回执使用12px的ink-4，目检辨识偏弱，按源码前景/底色计算仅约2.11:1，见P2-C；位置正确不足以签该项可读性。 |
| MSG-02 | **8.3** | 未签：P2-A、P2-B | APP/H5 animationstart记录支持左右0.18s linear；APP reduced=true时事件为空、返回24条事件为空；三页8→16→24已有锚点相邻变化最大约0.396px。这些已观察分支有效。但页面ready非响应式导致首条实时消息可能跳过的实际函数复现仍成立；原生scroll-top重复目标也未回修。后续消息动画成功及H5 DOM锚点正确不能关闭这两处代码问题。 |
| BADGE-01 | **9.2** | 限定范围签核 | APP明暗1、暗色99截图及0隐藏读回；H5浅色顶部4、客服1，背景同为rgb(255,203,77)，文字子节点同为rgb(10,10,10)。不同计数口径保留，共享token没有把人工数改成总数；浮标目的地为服务分区。未外推真实后台未读同步或所有状态组合。 |
| TOP-01 | **8.8** | 未签：证据不足 | 共享nx-design-glass/LiquidGlass、R2两端44×44及位置、三语明暗外观均已核验；源码返回/设置路由、头部测量和折叠逻辑仍在。当前runtime没有实际激活返回/设置、返回后状态，以及滚动折叠→恢复的操作结果。只签外观不足以完成本项交互审查，需补下述最小操作矩阵。 |

## 尚未闭环的具体问题

### P2-A：真人聊天打开完成后，ready没有响应式更新（MSG-02）

位置：[src/pages/support/chat.vue:80](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:80)、[src/pages/support/chat.vue:534](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:534)、[src/pages/support/chat.vue:552](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:552)。

`humanOpenRequest` 是普通 `let`，模板却用 `humanOpenRequest === null` 驱动 `entrance-ready`。`convStore.open` 更新历史时发生渲染，子组件看到ready=false；之后finally仅清空普通变量，不能保证再触发渲染。

本审从当前SFC提取实际 `openHumanConversation`，接入实际 `useConversationEntrance` 与Vue响应式渲染桥接，在内存得到：

```json
{"ready":{"actual":true,"rendered":false},"first":null,"second":"nx-conv-enter-left"}
```

即在没有额外响应式刷新时，打开完成后的第一条实时消息触发ready false→true，被helper作为初始化快照种入seen；第二条才进场。现有原子ready测试验证的是“父级已经提供响应式ready”的helper行为，没有覆盖页面自身完成状态。

修复办法：保留请求身份/账号代次判断，增加响应式busy/ready，或用能保持请求对象身份的shallowRef驱动模板。补实际页面“历史打开完成→第一条我方／对方实时消息”集成测试和事件捕获，不仅测helper手动改props。

专项报告已解释首条普通快照的 `animation:none` 可能是错过180ms窗口，本审接受这一点：**不以该快照单独证明未播放**。本问题依据是实际页面函数的独立内存复现，后续双向animationstart不能反证所有首次消息都正确。

### P2-B：原生scroll-top分支可能丢失第二次分页补偿（MSG-02）

位置：[src/components/support/conversation-thread.vue:315](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:315)、[src/components/support/conversation-thread.vue:347](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:347)、[src/components/support/conversation-thread.vue:355](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:355)。

`onThreadScroll` 只更新 `lastScrollTop`；补偿则直接赋 `scrollTop.value=nextTop`。本审执行实际补偿函数，并模拟没有DOM scroller、依赖绑定值下发的原生分支：

```json
{"first":450,"second":150,"binding":450,"applied":[450],"expected":450}
```

复现条件是：首轮实际top150、增加前缀300，绑定下发450；用户滚回150；下一轮也要下发450，但ref仍是450，值未变化，第二次没有更新，实际位置留在150。

修复办法：同步实际滚动位置，或按平台可靠的两阶段更新方式确保相同目标重新下发；补“连续两次分页且目标相同”测试，同时保留旧测量取消机制。原生安装后再实测这一分支。

这是函数与响应式绑定层面的已复现问题，**没有声称已在真机看到跳动**。当前H5 DOM直接写scrollTop的三页记录可以通过；它与这个原生后备分支不同，不能用于关闭P2-B。

### P2-C：浅色气泡侧回执可读性不足（MSG-01）

位置：[src/components/support/conversation-thread.vue:526](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:526)；色值见 `src/styles/tokens.css` 的浅色ink-4/background。

[app-chat-history-light-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-chat-history-light-320.png) 中“已读/未读”明显弱于正文和时间；回执是有效业务状态，不是禁用文字。当前12px回执使用 `#A4A8B0`，页面底色 `#F4F1E9`；按sRGB相对亮度计算，对比度约 **2.1127:1**。这是源码色值推算并结合实际截图目检，未冒称runtime已采集回执computed color。

修复办法：仅为回执换用可读的正文辅助色或专用主题token，保留侧置与主次关系，不全局改disabled token。例如现有浅色ink-3 `#6A6E77` 对该底色约4.53:1，可作为候选；仍需实际截图确认。补浅色320的长短消息、发送/失败/已读及英越较长标签，确认不挤压气泡。

## 两项关键实景缺口的闭环办法

| 项目 | 现有证据能证明 | 尚需最小补证 |
|---|---|---|
| SHADOW-02 | 已提供服务列表/聊天局部未见不当外投影，局部CSS没有移除全站玻璃 | 实际进入会话管理页，320/390代表明暗场景滚到顶部/底部；打开本轮受影响弹层或预览，记录头像、小控件和边缘。给截图与当前构建指纹。仅补本轮消费者，不要求重验无关全站。 |
| TOP-01 | 44×44、共享玻璃外观、静态路由/折叠实现仍存在 | 对当前包实际点/键盘激活返回、设置→偏好→返回；消息页滚动使标题折叠再恢复，确认内容位置及可聚焦控件未受影响。给目的地、返回后的状态及展开/折叠读回。 |

这两项是关键操作证据不足，不是未经复现就断言生产按钮失效或还有阴影缺陷。补齐后可在未变源码和明确构建指纹下重新评分。

## 已认可的具体读回与数据边界

1. R2 APP浅色／H5深色的英、越320，操作矩形均为 `x258,y64,width44,height44`，`horizontalOverflow=false`。R1原43.04/42.84px不足44的问题已由R2关闭，不能继续据此扣分，也不能把R1原量测改写成44。
2. 标题显示的是消息中心总未读；“全部已读”只操作通知。1301→1298符合3条通知被清、1298人工未读保留。独立的零未读样例显示“全部已读”且操作隐藏，不与该次批量操作混为一条因果链。
3. H5 R2通知失败显示“-”，失败态重试为288×44、透明、无shadow；恢复条目重新读到1301。原页Enter动作由主线程操作记录提供；本审没有主动复点。服务深色重试同样288×44，头像shadow仅inset。
4. APP历史记录中同一旧锚点 `nx-conv-message-31-37` 的y依次为-325.9375、-325.604187、-326；相邻最大差约0.395813px。8/16/24条抓取点没有活动动画，返回监听事件为空。仅认可这些记录时刻及已捕获事件，不外推连续帧性能或原生行为。
5. LIGHT采用用户明确授权的展示策略：暗色允许已发布完整Banner；浅色以同一个活动的rules/catalog结构化展示。不反色、不裁剪整图，也不声称后台已有浅色专用资产。源码保留活动ID/版本、SKU、买家/邀请人奖励、门槛、重复方式、限额、资格、规则和原路由；真实运营图片若含规则外文案，须用该实际素材另核等价性。
6. 真人人工receipt缺失时不补造；系统消息没有receipt。现有对方sent/read来自可选服务端字段的解析和本地样例。本地演示对方已读不证明TEST真实客服接口普遍返回该字段。
7. 本轮读取重试与通知/会话取消护卫按代码和实际函数测试认可。没有把读取失败样式改造外推为发送、上传、创建会话、购买等操作的成功证明。

## 未覆盖范围

- APP证据是APP源码编译的网页验收包（5233）；H5为本地5232。均为loopback原型。新APK/IPA安装、iOS/Android实际键盘、触摸、系统减少动态、GPU和原生滚动未执行。
- 真实TEST/生产客服新消息、对方回执覆盖率、权限/私有附件异常恢复、真实后台计数同步与运营Banner发布未由这些样例证明。
- 当前真实完整Banner资源、theme往返过程、物理缓存，以及所有消费者×语言×尺寸×状态组合没有本轮全覆盖。专项报告已单列的总报告依赖继续保留。
- 本报告不声明全站通过、不声明真服务或真机通过、不以资源编译替代安装，也不把本地商品CTA和图片预览等同于真实购买/支付。
- 除R2英越320四张补图外，保留R1证据轮次，不把旧PNG重标为R2。R1有效分支因相关生产源码未变而被明确引用，不等于重发R1整项全部通过。

## R3后续复验说明

本报告已经完成R2独立结论。父审随后通知将浅色回执局部由ink-4调整为ink-3并准备R3；该通知不回写R2分数。R3的新源码／构建指纹与颜色截图尚未在本报告签核，补证后仅追加对应复验。MSG-02的两个逻辑问题以及SHADOW-02、TOP-01的操作证据缺口，不因这次颜色修改自动闭环。

## 证据指纹附录

以下57张均为本次持续独立审查中实际 `view_image` 目检的非draft截图；APP R1的32张已用未变汇总指纹确认连续性。全57张按文件名排序，将 `[{path,sha256},...]` 以JavaScript `JSON.stringify` 序列化为UTF-8后取SHA256：

`35daf5ee35fe12cd7b10de17fe05e48c77a09c1c531d1b9af8567d22bbd588d8`

| 截图 | SHA256 |
|---|---|
| [app-activity-en-light-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-activity-en-light-320.png) | `4a89934d2aca9ff2b93912f5061dc5cacc0bb8dacaa1ce7c7de620a914292db3` |
| [app-activity-home-light-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-activity-home-light-320.png) | `670fff28db1b9a3758f33b0f318c329be96a290c48c61f46f66931467150c4cf` |
| [app-activity-light-320-1.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-activity-light-320-1.png) | `55193ab94065bb61762e34a8fe863471dde8af3f6a724005b8675fc4a7916d52` |
| [app-activity-light-320-2.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-activity-light-320-2.png) | `bb2e383d5f7bec691afefc4a327eaffccbcdf6438b08ab0365dc8070967b00a6` |
| [app-activity-light-320-3.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-activity-light-320-3.png) | `4008c7e6b318d91b75efce6bc0811dab7adfe7f0429f470cbb8d15557493f7df` |
| [app-activity-vi-light-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-activity-vi-light-320.png) | `2f3ee33a915ef4225d0ab476b2663a179288f4339f1bc29bc74ab25cd767d7f2` |
| [app-activity-zh-dark-390.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-activity-zh-dark-390.png) | `01e73b32d17385c22a00d1786c517c6b0fd92238cae9977f0b16de5ac5ed100d` |
| [app-chat-history-initial-dark.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-chat-history-initial-dark.png) | `012cc035f077c4cf237247f472e6acf47571c42d85d4f17bf727e32e83a58754` |
| [app-chat-history-light-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-chat-history-light-320.png) | `79bd1d5ea83b73f53b58dfd503483994ce5636534832510093212003594a9c17` |
| [app-chat-image-preview.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-chat-image-preview.png) | `aad09175c8df11685f6a6176b6b1bd0bfc226f903949045b996ba08ac0c54a8e` |
| [app-chat-receipts-zh-dark-390.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-chat-receipts-zh-dark-390.png) | `7cc95398ec0f8c55d4e29332b203ff2f56df2f5db38e2d1adbf40e98d0ef8617` |
| [app-home-zh-dark-390-99.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-home-zh-dark-390-99.png) | `b9d831b7c2862577b15434f405630664454a764f845cb54e8ab9ebd41292a0b7` |
| [app-home-zh-dark-390.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-home-zh-dark-390.png) | `4e33a7387d5046968f6e3c6eb1444a29210d0c90c5178eff4299583881ee9a54` |
| [app-home-zh-light-390.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-home-zh-light-390.png) | `105f9a9967a54d826cfbd57252284a871c98ffae0da8499861d37d1c404bded7` |
| [app-message-en-dark-320-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-message-en-dark-320-long.png) | `85ff264411c64c97d5b67f969b165fcfb7d3165572b33f9fb64d77408b8fa91e` |
| [app-message-en-dark-390-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-message-en-dark-390-long.png) | `6da300289e92120d3ce19ffdfc738027a15a8b4ac8c38cb169f1abae91a57fd9` |
| [app-message-en-light-320-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-message-en-light-320-long.png) | `5c8471d6a9e8cd0a6d72a97c3a4f2a4a7e09b718d197a0ef7d578f58a202ed76` |
| [app-message-en-light-390-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-message-en-light-390-long.png) | `93f3a2de9029f4cc141a625adeb6d4717db5712c0a65c63959a8242a16747613` |
| [app-message-vi-dark-320-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-message-vi-dark-320-long.png) | `994a2f49cf5626e795c478895697e39e37b445da9b208e40739cfae0009b7d00` |
| [app-message-vi-dark-390-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-message-vi-dark-390-long.png) | `872803498cebf346aec0047c5e0dd30d8248c47b1fbebb915f12061efbc99908` |
| [app-message-vi-light-320-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-message-vi-light-320-long.png) | `28c43372b5d14ba1b65e31bee7006cbfe1ab1749cc2d3ae2e45ebf5aecf92025` |
| [app-message-vi-light-390-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-message-vi-light-390-long.png) | `df32f7c319726cf8671784152dcc79557a907600ff20587530bed399e066c64b` |
| [app-message-zh-dark-320-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-message-zh-dark-320-long.png) | `59dbff009e0e74b56d8fb1d6f637ca04d80c9da6f7cd0410c0683345825d157b` |
| [app-message-zh-dark-390-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-message-zh-dark-390-long.png) | `78ed3434e0e6013a4c1d623533f6598365eb4c6ae19ef07c9d665ccfde507f67` |
| [app-message-zh-dark-390-read.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-message-zh-dark-390-read.png) | `6a789bc252e1ea1b1598368b0ef4f951f0c86f18b3c8e2d322c6ce7c3f2917b5` |
| [app-message-zh-light-320-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-message-zh-light-320-long.png) | `23f9d17878eb5371166bb9cedaf8e3bdc0799f2e0747f88fef4e78435ebe1072` |
| [app-message-zh-light-390-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-message-zh-light-390-long.png) | `a7eab1058b7eee91446f14ce07039d5c46f69014eb276d68f98b1cedf7c6e88e` |
| [app-message-zh-light-390.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-message-zh-light-390.png) | `534d28afcfcea7ac534b75b6fe49420b3e049ac794c70ef701a85d492dd0cf78` |
| [app-r2-message-en-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r2-message-en-320.png) | `3eed68a9482de9697c7a13cc8460ce570ec6cda77c381dc177ffac7270c2c042` |
| [app-r2-message-vi-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r2-message-vi-320.png) | `69c34472a0ceb619c5d2bd10139460e66f20c2d31c1aa0bac0cc4129a3ae0035` |
| [app-r2-message-zh-light-390.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r2-message-zh-light-390.png) | `7c67ea82dbfb85b919e02355f53aea4b91b815e9ddf62e04ca60039fdba8d3e3` |
| [app-service-vi-light-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-service-vi-light-320.png) | `223b57757d4a70e8d7fe131621c972bd2be063ad7a999d448d5fce2ba23c7e54` |
| [app-service-zh-light-390.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-service-zh-light-390.png) | `de004178c09a7f5891e6b9df0242455c29ba71902c41e9cb0e6047d592d2eff0` |
| [app-store-activity-light-390.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-store-activity-light-390.png) | `c11b4a43c5063bb335ce7025a90271b39dcf5f126df98d4bf278ca30c538a5f2` |
| [app-store-alternate-light-390.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-store-alternate-light-390.png) | `840ed4726e6b98799bdfb2905679f331c44ddf6d38e859fd932f9618ce1211b4` |
| [h5-home-light-390.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-home-light-390.png) | `f560bfabdc50674f48880c4d523e9ada32d75d8707affa85a975cd6ee4cad1f2` |
| [h5-message-en-dark-320-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-message-en-dark-320-long.png) | `85ff264411c64c97d5b67f969b165fcfb7d3165572b33f9fb64d77408b8fa91e` |
| [h5-message-en-dark-390-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-message-en-dark-390-long.png) | `dbff1231b4acbdebc083cc12fd8dd30a780ecfb0759867e3f18f218f462ec01d` |
| [h5-message-en-light-320-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-message-en-light-320-long.png) | `5c8471d6a9e8cd0a6d72a97c3a4f2a4a7e09b718d197a0ef7d578f58a202ed76` |
| [h5-message-en-light-390-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-message-en-light-390-long.png) | `e8eee5103d8282f3442942dff3a761db278a215683b6425a052d29e29c5eb056` |
| [h5-message-vi-dark-320-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-message-vi-dark-320-long.png) | `994a2f49cf5626e795c478895697e39e37b445da9b208e40739cfae0009b7d00` |
| [h5-message-vi-dark-390-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-message-vi-dark-390-long.png) | `28e083b776d5326d22d323d9a6cf74f2c3ca872a75fadb98e945524f25992a15` |
| [h5-message-vi-light-320-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-message-vi-light-320-long.png) | `28c43372b5d14ba1b65e31bee7006cbfe1ab1749cc2d3ae2e45ebf5aecf92025` |
| [h5-message-vi-light-390-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-message-vi-light-390-long.png) | `d4614bffb2cfad895b6d56ea313ec0247e2d2a47776585b8e93fc5a5a6f680cb` |
| [h5-message-zh-dark-320-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-message-zh-dark-320-long.png) | `59dbff009e0e74b56d8fb1d6f637ca04d80c9da6f7cd0410c0683345825d157b` |
| [h5-message-zh-dark-390-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-message-zh-dark-390-long.png) | `6ed588967e3bc99e1a3cf0f6d03ee87abf635396f9453fc46418ff9be57602bd` |
| [h5-message-zh-light-320-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-message-zh-light-320-long.png) | `23f9d17878eb5371166bb9cedaf8e3bdc0799f2e0747f88fef4e78435ebe1072` |
| [h5-message-zh-light-390-long.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-message-zh-light-390-long.png) | `c6b0ceb84d2faf6f1ee540f3864115337b9a3035e5b15f058e4687521f369dce` |
| [h5-message-zh-light-390.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-message-zh-light-390.png) | `7c67ea82dbfb85b919e02355f53aea4b91b815e9ddf62e04ca60039fdba8d3e3` |
| [h5-r2-chat-receipts-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r2-chat-receipts-320.png) | `747a7706fa7624bef5a8bb981678f14bd1597554b339d16a1dfaf2aa1563b97e` |
| [h5-r2-message-en-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r2-message-en-320.png) | `79cc8889a8691d5783086ec8a87587a0f9a0c058935ccf5407c7bc54462d037c` |
| [h5-r2-message-error-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r2-message-error-320.png) | `1094f5027e2b3a06f032f2de6ff23a4ff03f4e175b55e723eb122965d960c58f` |
| [h5-r2-message-vi-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r2-message-vi-320.png) | `0193fb62ff2447bb75909df61a3025f6758b1fab2f36b4040283fba9bb390bbc` |
| [h5-r2-service-dark-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r2-service-dark-320.png) | `68cb2d723a29ca1e60af5ee58911eab5a92429eaff79d00929f67e46efaf5f5c` |
| [h5-r2-store-light-broken.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r2-store-light-broken.png) | `c72c6a8968493ec4436a2d81c5dc9022df358f05246a1cd00c2ed03eefe03b6b` |
| [h5-r2-store-light-missing-main.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r2-store-light-missing-main.png) | `ebb60858563d30180b3728e224acd9e5aba37b10835b0dbcf6861fd559b1fb41` |
| [h5-r2-store-light-normal-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r2-store-light-normal-320.png) | `f3eab5718cbfe1dbf11f91ab9c44f859792b8e7a3b90dab14699a73575909ea9` |



## R3 第一阶段独立复核：P2-A/B/C闭环与TOP补证

本节追加于R2结论之后。**R2九项分数、三项P2原始复现及证据缺口全部保留，不回写成R2通过。** 本阶段先完成P2-A/B源码复核，并评审已到齐的回执和TOP实景；管理页整改尚未进入新构建，不等待它再记录本次结论。

### R3冻结、范围与后续源码变化

| 端别 | 已审核构建引用 | 源码指纹 | 构建指纹 |
|---|---|---|---|
| APP | `3acec3425e02e8886fd26b104c0230231e0bbdc6` | `ad624a73bba8ea14f8e51d06f87eb50e081a76e25e31b8cdd55b9dbb70618063` | `2b45ef3aa3c5e8909674afccde584461e280307ba651076699a784d4f8407fb2` |
| H5 | `b984ca5f19cbfc2ea930d05264d5ef8b75be29a6` | `b3c3619d79a290fb1ae7cb47e5c9b2908a88aef454f7c9090d2a850c818d9906` | `18feaaf506f362e04b41cb4cde1c85a14fecd676bb2f44aee947d81c67ae576e` |

- 首次核验时，APP/H5各40个源码、341个构建文件均与各自R3 manifest匹配。R2→R3清单只改变聊天页、ConversationThread及对应两个测试文件；生产改动是ready、滚动同步与局部receipt色值。
- 随后主线程为管理页空白问题修改APP `src/pages/support/messages.vue`。本审再次核验时，APP只有此文件偏离R3 manifest；P2-A/B/C相关源码仍匹配，H5源码仍全部匹配。该未重建管理页变化不属于本节已审R3构建，也不借用旧包签通过。
- 本审没有执行Git；上表提交引用来自manifest/用户，实际独立核验依据是文件SHA256。
- `runtime-r3.json` 是持续累加文件，不当成已经不可变的整轮最终manifest。本次实读11条记录，末条为 `app-top-keyboard-back-restored`，时间2026-10-26T11:13:24.913Z。取样时整文件SHA256为 `0e8712eeb479a062959cebb32e02de4c9c1b861c134aa231b46ac2aa53c9dd0e`；这11条按原顺序JSON.stringify后的取样指纹为 `75f11924c4b39dfa4407b46ae909377faaded7e42388f307f01b1c010e2797e9`。后续新增记录需另行审核，不自动计入。
- 新增IM完整时间戳规则/逻辑任务不在本节范围，不预签其数据语义。
- 本审继续只写本文件，不改代码、不运行浏览器、不提交。

### P2-A：源码与实际模板驱动闭环

当前 [chat.vue:536](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:536) 使用 `shallowRef` 保存请求，未把请求对象深度代理，`humanOpenRequest.value === request` 身份比较保持有效。取消时置空、仅本代finally释放，以及发送guard均使用 `.value`；模板维持真实的entrance-ready表达式，交给Vue自动解包。

新增回归读取真实chat脚本和生产模板的entrance表达式，使用真实ConversationThread SFC渲染，而非手动把helper的ready设为true。分别验证历史等待中ready=false、完成后ready=true、首批历史不进场、首个agent/user实时消息各有一次正确方向class。见 [messages-start-entry.test.ts:654](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/messages-start-entry.test.ts:654)。

本审另从当前SFC提取实际函数，读取实际模板表达式，接入Vue及真实入口helper，重复R2失败路径，独立得到：

```json
{"case":"first-left","ready":true,"class":"nx-conv-enter-left"}
{"case":"first-right","ready":true,"class":"nx-conv-enter-right"}
{"case":"request-identity-cancel-old-finally","passed":true,"polls":1}
```

旧请求完成未清掉新请求；取消后的迟到完成未重新启动轮询。发送guard源码仍阻止历史打开期间提交。**P2-A在所审源码与回归范围关闭。**

R3 runtime的 `app-first-incoming-after-history` 和 `app-first-outgoing-after-history` 分别捕获左右 `animationstart`，均为0.18s、linear，与修复后的首次消息路径一致；不是用动画结束后的普通快照反推全过程。

### P2-B：两次相同原生绑定目标闭环

[conversation-thread.vue:315](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:315) 的scroll事件同时同步实际位置与 `scrollTop.value`。用户滚回150后，绑定值先更新为150，随后补页目标450成为可再次下发的变化；旧测量代次取消和隐藏守卫仍在。

新增测试使用实际组件的scrollTop watcher接收更新，连续两页都断言模拟原生位置到450，且450实际收到两次。见 [conversation-thread.behavior.test.ts:198](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.behavior.test.ts:198)。

本审独立执行当前实际scroll事件函数与补偿函数、Vue watcher，结果：

```json
{"case":"same-native-target","applied":[150,450,150,450],"received450":2}
```

**P2-B在源码／绑定层回归范围关闭。** 此结论不等于安装APP后已观察原生scroll-view；真机触摸、系统滚动和键盘仍未执行。

### 红→绿与扩展回归日志

本审读取并核对了如下现存日志，未重新启动整批Vitest，也未写测试缓存：

| 日志 | 所见结果 | SHA256 |
|---|---|---|
| [queue-r3-regression-red.log](D:/WORKS/PLAN/.wt/uvel-design-preview/queue-r3-regression-red.log) | 原实现新增3项红：agent/user页面ready桥接各1，连续相同native目标1；其余87通过。native实际150而期待450。 | `53070f22ff4cf9b4c5274fe192e7d680b7c7ecebc446989d23e367307ae73fb4` |
| [queue-r3-regression-green.log](D:/WORKS/PLAN/.wt/uvel-design-preview/queue-r3-regression-green.log) | 修复后2文件90/90通过 | `4406a1e4b2d3a27874bcbb5b161da5dd4308156e889789cdf53eb40344dd9db8` |
| [queue-r3-chat-regression.log](D:/WORKS/PLAN/.wt/uvel-design-preview/queue-r3-chat-regression.log) | 扩展8文件168/168通过，包含聊天、历史、实时、队列、读取重试与账号恢复 | `8c7bb3cbdfd43d24a067d252707dfa9e454bfadbf654d105e623a6f7c4e79ce2` |

90项与168项存在重叠，不相加当258项。当前修改没有通过删断言或只替换helper来规避原失败场景。

### P2-C：已到齐的回执颜色实景闭环

本审实际view_image目检了中英越320浅色、中文390暗色及新消息截图。runtime实际读回：

- 浅色回执 `rgb(106,110,119)`，底色 `rgb(244,241,233)`，12px；基于实读色值计算约4.53:1。
- 暗色回执 `rgb(155,163,181)`，底色黑色，约8.30:1。
- 三语320的 `overflow=false`；英文Delivered宽约50.40px，最长可见侧回执的右沿为304px，仍在320px页面的16px内边距内。对方回执在右，我方在左，缺回执仍为空；没有因为改色推断已读。

源码仅把回执局部ink-4换成ink-3，失败状态的专用danger色保留，未全局改disabled token。**P2-C在这些本地样例关闭。** 本阶段新图片为APP源码网页包，不冒充H5 R3三语实景或真实客服提供receipt的能力证明。

### TOP补证：本地已观察路径闭环

已核对 `app-top-before-scroll`、`app-top-after-real-wheel-down`、`app-top-collapsed-settled`、`app-top-settings-destination`、`app-top-keyboard-back-restored`，并实际目检折叠/恢复截图：

- 真实wheel后内层scrollTop约198.67，标题区与分区高度最终归零，aria-hidden=true且inert生效。
- 两个顶栏按钮始终44×44、opacity=1，位置分别x12/x264、y6；保持共享玻璃外观。
- 设置目的地实际为 `/pages/me/preferences`。
- 设置页Enter返回后实际回到消息页；标题与分区恢复56/54px、aria-hidden=false、inert清除，scrollTop为0。

这补齐了R2所缺的当前本地设置/返回与折叠恢复路径。未据此声称所有返回栈、通知页独立fallback分支、所有语言尺寸或原生导航均已操作。

### 本阶段追加分数

| 项目 | R2保留分数 | R3追加分数／结论 | 范围 |
|---|---:|---|---|
| MSG-01 | 8.7 | **9.1，限定范围签核** | 局部ink-3、APP三语320浅色及390暗色的真实截图/读回；真实服务与未提供组合不计入 |
| MSG-02 | 8.3 | **9.1，限定范围签核** | P2-A/B源码及实际函数回归关闭，R3 APP首条双向事件通过；共享helper历史/返回/reduced逻辑未变，扩展回归通过。R2既有实景仍只归R2，未冒充R3重新全跑；原生安装未验 |
| TOP-01 | 8.8 | **9.1，限定范围签核** | APP本次44px顶栏、真实wheel折叠、设置目的地和Enter返回恢复；既有外观矩阵引用仍标原轮次 |
| SHADOW-02 | 8.8 | **仍未签，不提前给整改后分数** | 下述R3管理页实景已暴露样式缺陷，修复尚未重建；真实打开中的弹层仍需确认 |

其他R2限定签项没有在此重发新轮次分数。本节不代表九项已全部达到9。

### 管理页整改前证据与下一包边界

新发现的管理页warning由row改column后，旧flex-basis:180px/flex:1留下大块空白；本审在整改前管理页截图中确认该视觉缺陷。主线程已告知去掉旧basis/flex并改为紧凑开放文字+44px重试；当前APP源码变化已观察到，但**未重建，不能用旧R3构建或整改前截图签修复通过**。下一包需核对warning紧凑布局、重试44px和正常／失败列表的滚动边界，再评SHADOW-02及该管理页读取恢复分支。

另，`app-r3-management-confirm-dark-320.png.png` 画面是移除后“暂无会话”空态，并没有可见的打开中确认弹层。文件名不能替代弹层可视证据；需要实际打开中的弹层截图/读回后再关闭这部分缺口。R2 CTRL-01对已观察通知/服务重试的限定签核不扩展到这次未重建的管理页整改。

### 本阶段实际目检图片与指纹

下列9张为本节实际view_image读取的文件，双重.png扩展名按现存原名保留，未重命名或修改截图。

| 截图 | SHA256 |
|---|---|
| [app-r3-chat-receipts-zh-light-320.png.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r3-chat-receipts-zh-light-320.png.png) | `8e529b26eedb8ff8d588666736864ecd987b44c84c113b2ed398fb00ccb06f05` |
| [app-r3-chat-receipts-en-light-320.png.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r3-chat-receipts-en-light-320.png.png) | `f4584fe853d8422a4c987532cc12e50d706d9752c28e06b289e06f0aabf6c721` |
| [app-r3-chat-receipts-vi-light-320.png.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r3-chat-receipts-vi-light-320.png.png) | `5cdaa771a0d6bbe94afd985928f66d77692db861573fcee1e7992f841c317e4e` |
| [app-r3-chat-receipts-zh-dark-390.png.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r3-chat-receipts-zh-dark-390.png.png) | `5778941018e9ce8c880c3b66a4e3781784ca24cf2e1202237fcd8b164716675c` |
| [app-r3-chat-live-dark-390.png.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r3-chat-live-dark-390.png.png) | `eaa636d6ab30ecde110ece9a2d2a1f4e248458d550389e9eafb83d8f74b85208` |
| [app-r3-top-collapsed-dark-320.png.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r3-top-collapsed-dark-320.png.png) | `1f5a1c788bff718d08deba618cf2fd5ffa570fa4ea302a0e2dbdde6cc47a5eff` |
| [app-r3-top-restored-dark-320.png.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r3-top-restored-dark-320.png.png) | `9e892dfb6ff0d91eae2af658f6978acfc56ddba6485144ff9006b2e904605b7a` |
| [app-r3-management-dark-320.png.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r3-management-dark-320.png.png) | `e261931e68ab3844429f6cbb7ddd79e08f0abecc7d111361a15fad4318f175a1` |
| [app-r3-management-confirm-dark-320.png.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r3-management-confirm-dark-320.png.png) | `93d5196a5a3eeb69da83a7f7dbba19ed823bf8abb6fa1ce23c1156d9edda849c` |


## R4代码预审与R5候选语义：保留版本边界

本节记录构建实景到齐前的独立代码复审，不改写R2/R3分数。R4行为基线为APP `23e5e42c018a4385090e9aae6ed83a180376a015`；纯类型修正后的冻结目标为APP `e2cad48f7c7314eca032724ddd6e6aa10bd8fcd0`、H5 `f17846670e7e1fe32c7f325e54954d1eb915846a`。按用户后续授权，只用只读git show读取相应快照；没有把R5工作树附件改动当R4，也没有提交、推送或操作浏览器。

### TIME-01已核对的代码语义

依据 [UVEL_IM时间戳显示规范](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/PRD/UVEL_IM时间戳显示规范_20261026.md)：

- 组分隔基于前一条有效消息，满300000ms、设备本地跨日、时间倒退和invalid断开后重新标注；同ID最新数据保持原位置，不在helper中重排。
- 每条有效非系统消息显示作者与24小时HH:mm，完整日期、秒、GMT偏移进入title/无障碍名称；timestamp沿用m.ts，未猜测秒/毫秒，未知不替换为当前时刻或1970。
- 日历日计算独立于经过小时数；独立执行了299999/300000边界、invalid、乱序、未来、跨年和纽约23/25小时夏令时等检查，均通过。
- 设备本地日期使用Date读取；不要求Intl存在。显式IANA时区的辅助路径在不支持时回退设备日历，日期与偏移成对回退。
- 实际startClock/stopClock函数的内存执行验证了重复启动只有一个timer、分钟刷新跨日、清理和重新显示时立即刷新；生命周期钩子本身按源码核对，未冒充真实后台切换实景。
- timeGroups不进入业务messages，不增加未读或动画对象。时钟/locale只改显示；既有入口helper只按身份、ready、可见和消息ID/侧别决定入场，未把日期刷新当新消息。
- 管理warning已为column、transparent、紧凑开放文本，text为flex:0 0 auto、无旧180px basis，重试min-height44；这是源码修复，不用R3整改前截图签R4运行结果。

读取了queue-r4-test-final.log：纯helper50项，相关10文件242/242通过。独立将23e5e42c与e2cad48f的thread脚本转成JavaScript比较，结果完全相同，确认该补提交仅修正类型。APP/H5冻结快照下列8个文件内容逐一相同：PRD规范、conversation-time.ts及test、conversation-thread.vue及behavior test、thread-types.ts、chat.vue、messages.vue。没有重新运行整批测试或写测试缓存。

### R4-P2-01：前测失败被当成合法零高度，超时后仍继续分页

冻结R4的conversation-thread.vue:363/369/398/406以及chat.vue:991/1092存在以下组合：

1. prepareHistoryPrepend在500ms后resolve void，未提供“前测失败”结果。
2. 两个分页调用方await后只检查生命周期/代次，仍可读取并前插历史。
3. preserveHistoryPosition在没有有效preparedHistory时把oldPrefix设为0。

本审从e2cad48f快照提取实际函数，使用异步原生selector分支复现：原top150、旧首气泡prefix42，新prefix300。旧查询超时后分页继续，后测正常返回，结果：

```json
{"elapsedMs":502,"preparedAfterTimeout":null,"actual":450,"expected":408,"anchorError":42,"latePreparationDiscarded":true}
```

迟到查询被正确丢弃，但没有阻止把未知旧prefix当0，因此仍有42px跳位。正常三页/正常旧42px→新300px补偿通过，不覆盖此分支。这是实际函数/绑定层复现，不宣称已在浏览器或真机看到该异常。

修复办法：前测返回明确成功/失败，原生前测无效、空结果、超时或过期时保留当前历史并允许重试；调用方不能继续使用缺失的旧偏移。必须区分“合法prefix=0”与“没有测到”。若采用其他fallback，也必须有可证明正确的旧锚点，不直接代入0。

必要回归：合法旧42→新300得到408；合法旧0得到450；空/超时不前插、不错误补偿；迟到回调不污染新测量；隐藏、重绑和重复按键不提交旧页。该P2关闭前，TIME-01及R4新增分页路径不提前签>=9。

R3稳定证据只用于未改的颜色token、回执语义、基础动画/导航参考。R3事件不能冒充R4时钟刷新、分隔合并或新分页全过程；R3管理页整改前缺陷更不能改标为整改后通过。R4本节没有新增运行/视觉签项。

### ATTACH-01：按R5候选而非R4审查

用户新增要求是“图片不可用时仅灰色禁用图标，不显示可见说明”。本审读取了候选thread及新增测试，并对真实SFC脚本+模板作独立内存执行，得到：

```json
{"candidateOnly":true,"disabledClickEnterSpaceBlocked":true,"captionAbsent":true,"accessibleReasonKept":true,"textSendStillWorks":true,"policyRetryWorks":true,"reenabledAttachWorks":true}
```

子组件正确保留aria-disabled=true、tabindex=-1、不可用原因的无障碍名称，禁用click/Enter/Space均不emit attach；可见状态说明移除，文字发送不受影响。错误策略读取的独立重试是可恢复动作，不是被删除的状态caption。这里是组件事件函数测试，**不是运行页面实际执行了禁用Enter/Space**。

候选随后冻结为R5 APP `ecda4fdd0076aa69605597215d5bd9337dcc0fe8`、H5 `926e8c48af800112b04ead01c90012be79ebf587`。后续最终按R5共11项评分，不把未提交候选或R4当作R5冻结实景。

### R5-P2-02：同scope附件策略旧响应可覆盖新响应

本审读取R5 ecda4fdd的实际loadAttachmentPolicy函数。它只检查accountBindingEpoch与scopeInvalidated，没有请求代次或singleflight。对相同账号/scope并发两次读取，独立复现：

```json
{"calls":2,"afterNewestRead":false,"afterOldRead":true,"attachDisabledAfterOldRead":false}
```

新请求先返回available:false，策略正确禁用；旧请求晚返回available:true又覆盖它，最终使父级attach-disabled为false。子组件guard本身没有失效，但它收到过期的能力状态。该竞争位于既有父级读取函数，灰色图标改造未引入它，却会影响ATTACH-01当前的禁用语义。

修复办法：给策略读取增加请求代次/当前所有者检查，或采用能够满足刷新与取消语义的singleflight。补旧true晚于新false、旧成功晚于新失败、账号/离页/重新显示后旧结果不覆盖的回归；保留文字发送与合法错误恢复。没有必要为此扩大修改到其他业务。

### R5接收记录与当前限制

- 再读R5快照确认R4-P2-01的500ms resolve void及oldPrefix缺失回退0仍在；正常时间线8→16→24和同日分隔替换的锚点结果不能关闭超时分支。
- runtime-r5与app-r5-*是隔离包5234/5235的新证据；后续按其实际交付内容评审，不操作用户的5233标签页，不用旧共享5233记录代签R5。
- 运行禁用点击与“没有打开picker”可以据新记录核验；自动化因aria-disabled拒绝的Enter/Space必须记录为未执行，不能冒称运行通过。它们的guard覆盖来自上面的组件执行。
- 图像策略错误/恢复与可用状态若仅有组件测试，明确不当成真实上传权限或真实上传验收。

### 移除操作说明更正：不设置不存在的确认弹窗门槛

“从列表移除”是可恢复的本地列表移除；新消息可重新出现，并没有移除确认dialog。此前对misnamed management-confirm截图“不是弹层”的描述不应理解为要求新增或补拍移除确认弹窗。该历史文件只作为移除后的空态证据保留，**不把不存在的弹窗作为门槛**。

SHADOW-02后续检查的是管理warning紧凑布局、真实列表/空态边界以及实际存在的图片预览modal。图片预览的打开/键盘关闭按R5新证据评审，不与移除确认混淆。R2/R3已有分数均保留各自范围；本节仍是代码预审，不提前发布R5最终11项分数。


## R5最终独立复核：11项、本地原型限定范围

**R5结论：原九项在下表列明的范围达到9分；新增TIME-01与ATTACH-01分别8.7、8.6，因已复现代码P2未签。不能签“11项全部通过”，没有计算或采用平均分。** 后续R6在修复这些问题，但不反向修改R5分数。

### 实际读取范围与版本

- 本节绑定APP `ecda4fdd0076aa69605597215d5bd9337dcc0fe8`、H5 `926e8c48af800112b04ead01c90012be79ebf587` 的冻结源码与R5 manifest。审查时曾逐项核对两端各43个源码文件和341个构建文件，与各自清单全部匹配。后续R6工作树编辑不当成R5。
- 实读 `runtime-r5.json` **27条记录**，最后为 `h5-management-vi-light-320`（2026-10-26T11:59:40.729Z）。本次文件SHA256为 `eb121a8018504b16dafd90a3e7609cdfa7ed7b565b913cf0ff933d2ffd77196b`。
- 实际view_image逐张目检 **18张R5截图：APP 11张、H5 7张**，逐文件指纹见下表。只使用隔离5234/5235这一轮证据；未打开、控制或读取用户的5233浏览器标签页。
- R5没有重拍的旧签项按内容指纹明确继承原轮次。R5的promotion-entry/referral-progress、notifications.vue、notification-actions.ts、message-center.css、notifications store、trial-hero-banner、tokens、app-chassis、nova-bubble、conversation-entrance与R2/R3清单相同；本审对这11个相关文件逐项比较了清单哈希。继承的是原有限定范围，不冒称已在R5重跑全部旧实景。
- 243/243、两端类型检查和网页构建、APP原生资源编译通过为主线程提供的验证记录；本审没有重跑全批、没有使用编译结果替代实景。另执行过本报告记录的实际函数、真实SFC模板/脚本与Vue绑定内存复现。
- 本节未修改实现、未提交、未推送、未操作浏览器，仅追加本文件。

| manifest | 冻结引用 | 源码指纹 | 构建指纹 |
|---|---|---|---|
| app-build-r5.json | `ecda4fdd0076aa69605597215d5bd9337dcc0fe8` | `97d9f80b3f513557b5eaa1fccba44e66cbfa78fa66912848261e45647cddc0e3` | `ef17fc7be661544abb760bd3782aa5e8a68408612fab81cbd5a58f542faf9fb6` |
| h5-build-r5.json | `926e8c48af800112b04ead01c90012be79ebf587` | `4d136600bbeb9a4e2a9042d350e496e49f2741c144e828059b88bb48c188bfad` | `b4b48ed7b9f45e1e5fbfc3816e352a42acc9a087741f43494c5dc0dedc4986fc` |

### 最终11项逐项分数

| 项目 | R5分数 | 独立结论与实际证据范围 |
|---|---:|---|
| LIGHT-01 | **9.0** | 限定签核：继承未变源码的R2结构化浅色活动、三种活动/商城/机型替换及缺图保位样例；R5没有新拍完整运营Banner，不把组合图、主题单态或行为测试当真实运营发布/完整切换过程通过。 |
| MSG-03 | **9.2** | 限定签核：继承R1双端12格及R2英越44×44修复证据；R5 H5越文320正常/失败/恢复3未读、标题同行和操作入口继续可读。只清通知的语义保持；不能把错误态“-”说成0或把通知批量操作说成清空人工未读。 |
| CTRL-01 | **9.1** | 限定签核：通知/服务原范围保留；R5管理页320/390重试44px、透明、无shadow，失败后Enter恢复当前列表；H5越文失败经不reload恢复及Enter重试后回到正常消息/设置/返回路径。单独的附件策略竞争属于下方ATTACH-01未签范围，不宣称全站所有读重试都已验证。 |
| SHADOW-01 | **9.1** | 限定签核：trial-hero-banner与token源码未变，继承R2明暗首页及H5首页中领取仅inset、导航保留的范围；未把R5管理或聊天截图充作新的首页按下/禁用、原生材质证据。 |
| SHADOW-02 | **9.1** | 限定签核：R5 APP管理320/390与H5越文320均为紧凑透明warning，无旧180px空白；列表头像、小控件及实际图片预览未见该范围阴影切边。真实预览有打开截图和几何读回，主线程记录键盘关闭。移除没有确认dialog，本项不要求不存在的弹窗；未宣称全站所有滚动/弹层通过。 |
| MSG-01 | **9.1** | 限定签核：保留R3 ink-3与真实receipt语义；R5中英越320浅色、中文暗色320/390长正文和商品消息可读，回执方向正确、时间辅助行完整，未见横溢。真实后台对方receipt覆盖率、所有失败标签组合仍未验。 |
| MSG-02 | **9.1** | 限定签核：继承未变入口helper、左右180ms linear、减少动态和R3首消息实际事件的原范围；R5正常历史快照无活动动画，日期分隔不成为业务消息或动画对象。此分数不为TIME-01新增前测超时补偿背书，也不把R3事件改标成R5重新捕获，更不签真机滚动。 |
| BADGE-01 | **9.2** | 限定签核：app-chassis、nova-bubble和token源码与原签项一致；保留R2/R3已观察的同黄底深字、0隐藏、99封顶及总数/人工数分开口径。R5没有新增完整角标矩阵，不伪称重跑真服务同步。 |
| TOP-01 | **9.1** | 限定签核：R3 APP操作路径保留；R5 H5越文320真实wheel折叠、设置目的地、Enter返回后最终settled读回及更新后截图通过，两个按钮44×44。过渡中的h5-top-return-restored不用作最终恢复结论。 |
| TIME-01 | **8.7** | 未签：纯helper与常规实景表现良好，但R4-P2-01仍存在于R5冻结源码：前测空/超时resolve void后仍可前插，未知旧prefix回退0。实际函数原150、旧42、新300应408而得450；正常±0.4px锚点不能关闭此失败分支。 |
| ATTACH-01 | **8.6** | 未签：R5禁用灰图标、无可见caption、文字可发等样式/组件路径通过；但R5-P2-02仍可由同scope旧available:true覆盖较新的available:false或失败结果，使禁用入口重新启用。需父级读取代次/owner和相应回归闭环。 |

### R5实际量测与接受范围

1. APP和H5时间线均8→16→24。按同一旧锚点ID匹配，首轮y差约 **+0.333313px**，第二轮 **-0.395752px**。跨午夜的“今天00:01”分隔保留；00:11→00:16满足恰好5分钟分隔。APP同日页边界从首分隔20:45合并成20:37后，同一旧锚点约 **+0.333313px**。这些证明正常测量成功分支；不外推查询空结果、500ms超时或原生selector失败。
2. 中英越320浅色、中文暗色320/390的有效消息保留作者·HH:mm；完整title含日期、秒和GMT+09:00。跨年截图有2025年日期，星期和今天/昨天标签随语言本地化。真实跨午夜等待、系统时区切换、原生Intl能力未因这些样例而签通过；夏令时/invalid等目前由本报告代码与测试范围支持。
3. APP输入区附件图标实测44×44、opacity0.45、aria-disabled=true、tabindex=-1、caption=false；390样例按钮底812，对844高视口余32px。点击没有picker（dialogCount=0、fileInputs=0）。**禁用Enter/Space被自动化拒绝，没有在运行页面执行，不能算runtime通过**；对应guard由源码、组件回归和本审真实SFC内存事件调用覆盖。
4. 禁用图片时发送文字实际保留，并出现“Today20:51／You·20:51”及完整20:51:26的时间。未向真人客服发送；策略错误/可用/回读竞争的覆盖属于组件或函数测试，不是真实上传能力验收。
5. APP管理warning在320/390均约 **82.79px**，retry分别288×44/358×44；H5越文320warning约 **100.19px**，retry288×44，均透明、无shadow、无横溢。失败页重试并恢复列表的读回已看到；R3旧大空白截图只保留为整改前证据。
6. 实际图片预览overlay390×844，关闭按钮84×44，padding-bottom40，图片可完整容纳；已目检打开画面，键盘关闭由主线程实际操作记录提供。本审没有主动复点。移除后空态不冒充弹层，亦不要求增加确认操作。
7. TOP以 **h5-top-return-restored-settled** 为准：最终title区56/54px、aria-hidden=false、inert清除、scrollTop0，两按钮44×44且opacity1。较早的h5-top-return-restored仍是折叠/过渡状态，只保留为过程记录。设置实际到preferences，返回/错误恢复后3未读可见；不外推所有导航栈或原生返回。

### 仍需修复与R6复验门槛

- **R4-P2-01 / TIME-01**：前测返回明确成功/失败；null、NaN、空、超时、superseded不能前插；合法0仍可继续；human/Nova均需成功才读更早页；未知oldPrefix不可当0。要重放本审150+300-42场景及fail→retry、hide/rebind/dispose路径。
- **R5-P2-02 / ATTACH-01**：策略请求有generation和可见/owner/session边界，旧true不能覆盖newfalse/newfailure；隐藏/清理使旧读取失效，choose入口与picker返回也不得使用旧能力。要重放本审两请求乱序场景及再次显示/重绑/选择返回。
- 用户已告知R6正实现这些修复，并提供新增14项、red13→green107/107的消息；**本节尚未按R6冻结源码独立重放，不因此给R5未修版≥9**。
- SEND-01已新增为第12项，下一最终冻结版一并审查。需验证发送可用态强调色、移动端按压/回弹、disabled/reduced-motion、键盘/重复提交guard；该新增按钮样式不能借R5旧发送按钮截图代签。
- R5已确认样式可作为后续未变样式参考，但始终标R5，不把截图或R5普通路径重标为R6失败恢复通过。原生安装、真实TEST服务/附件、运营完整Banner及全站组合依赖继续单列。

### R5实际目检截图清单

本节18张截图都实际使用view_image读取。文件名是证据标识，布局尺寸以runtime的CSS量测为准，不根据文件扩展名或预览缩放猜测物理像素。更新后的同名restored图以下列最终SHA256固定。

| 截图 | SHA256 |
|---|---|
| [app-r5-chat-zh-dark-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r5-chat-zh-dark-320.png) | `151ed9b576cca0c1c5ddab55b2a49bd2c60a543a19d674013824daf865667c4d` |
| [app-r5-chat-zh-light-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r5-chat-zh-light-320.png) | `6cd5a9cf4b04bcab8b859566593b4ac38fa08941f241bcb6f6a982126b942a90` |
| [app-r5-disabled-image-text-sent-en-light-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r5-disabled-image-text-sent-en-light-320.png) | `eef37efff957eb095ab6c2962bca13d5f69aa95463ab549276041fbae4c90cdb` |
| [app-r5-image-preview-dark-390.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r5-image-preview-dark-390.png) | `a1a4e7d09fe5bea21b364084ac3bc91df3ee0b1c3b3138662d9cf612e14d20da` |
| [app-r5-management-error-zh-dark-390.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r5-management-error-zh-dark-390.png) | `1e73cb3c158f4b5fda932c0f901a95b666d748bff75d8d903f2a53a15f78a29c` |
| [app-r5-management-zh-dark-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r5-management-zh-dark-320.png) | `0a0c450cd1320c3420ec69d3b154275f1bf247108a14d5ebb3cd20eea4230435` |
| [app-r5-management-zh-dark-390.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r5-management-zh-dark-390.png) | `9d43d953de040c3bef56506a7b13fab1158689a63969210d8759c1e63e16e80c` |
| [app-r5-timeline-en-light-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r5-timeline-en-light-320.png) | `66eed18dcd0a5b853c9972e2462956da972e20bbbaef8aa307193d1cbda6ccd6` |
| [app-r5-timeline-initial-zh-dark-390.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r5-timeline-initial-zh-dark-390.png) | `f84f250f91e7efcbce096013540d64f970f40a454789c264ceafe0cd4a478bac` |
| [app-r5-timeline-vi-light-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r5-timeline-vi-light-320.png) | `dd5a232fee98f336e4d93decbf9f2c6d8846d9b41f5da1402a8bc537a832b690` |
| [app-r5-timeline-year-vi-light-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r5-timeline-year-vi-light-320.png) | `44c7684207b89e0006be2e43e129ebc51dcc8b1d69f2f42c031afc52d61044fe` |
| [h5-r5-management-vi-light-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r5-management-vi-light-320.png) | `c76e1df6cc6539f8a9586e0d2214ffc8cb217a1cfa9438b7dafe2acd6a3d7bbe` |
| [h5-r5-message-collapsed-vi-light-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r5-message-collapsed-vi-light-320.png) | `e5791256b4132338add8b2f34e4f35a483e817cbe6c61c3a436c1e5961935476` |
| [h5-r5-message-error-vi-light-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r5-message-error-vi-light-320.png) | `48e7e02a8f442468123fe71fbe223e4da9e9c020028436444366b572ec654cc8` |
| [h5-r5-message-restored-vi-light-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r5-message-restored-vi-light-320.png) | `43b54193f0020367276f90644243e8ced039e77ee322e989eea727fb8fd8cb1f` |
| [h5-r5-message-vi-light-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r5-message-vi-light-320.png) | `43b54193f0020367276f90644243e8ced039e77ee322e989eea727fb8fd8cb1f` |
| [h5-r5-timeline-vi-light-320.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r5-timeline-vi-light-320.png) | `33131665b3d041c32ff276e0cc3db54cd9039fce1c43da86a86973a4763709fc` |
| [h5-r5-timeline-zh-dark-390.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r5-timeline-zh-dark-390.png) | `ab6f5a4790d12f767cc90115bda0b5a20c1bd2b1ef69b357adc980b2b06c98e6` |

### R5 runtime逐条取样指纹

下表27条是本节实际读取文件中的记录；后续新增/修正不能自动获得本节签项。

| label | UTC时间 | 单条JSON.stringify SHA256 |
|---|---|---|
| app-management-compact-390 | 2026-10-26T11:47:25.263Z | `79ce5fe292892cf495ca544a4c6d29296a91bd5bba8d3d2d520c0121a76067cc` |
| app-initial-8-dark-390 | 2026-10-26T11:48:29.402Z | `06c54c59215aa86b3b7e5560ec68dbd8d993f78d53f09095b8ef27ef60d689f6` |
| app-timeline-prepend-8-to-16 | 2026-10-26T11:49:03.658Z | `e01c4f1d8d992f2328135e958a9b393e84e8e9141feff9f1470c43a34968128e` |
| app-timeline-prepend-16-to-24 | 2026-10-26T11:49:14.630Z | `91742c8ffb0e3b1de5d660b4a7dcbe8f31c27561cba80a748970a2292d29c57b` |
| app-timeline-vi-light-320 | 2026-10-26T11:50:06.144Z | `1930786c3a15bccc427e085f15354cb27cc399f9d32d5dacf21968e169453aff` |
| app-timeline-year-vi-light-320 | 2026-10-26T11:50:35.339Z | `480a946df2032ff0af77001e8cd306d0e315a87ef265070514c65da69b7b4b65` |
| app-timeline-en-light-320 | 2026-10-26T11:50:59.323Z | `73ebdb9acdad5939b3802b6db33a96603f2824ba00988ad0f4cda9db49fe803a` |
| app-attachment-disabled-actions | 2026-10-26T11:51:26.000Z | `eff7d7dace25d71197bd9465acb46975c151d182a0552e996813dbe55f66b695` |
| app-text-send-with-image-disabled | 2026-10-26T11:51:37.404Z | `4544fca46dc232753c2c7804ba5d7a240285dcc5a9dfa50054e8bb62364954ac` |
| app-chat-zh-light-320 | 2026-10-26T11:51:47.283Z | `e1f028a6f5b4783c109e88a85bcefe788c0f90b02a053fa042d557a52e529b9d` |
| app-chat-zh-dark-320 | 2026-10-26T11:51:59.230Z | `6bd030ee9a706df350f68b1e849712e025a2cd698d43c453aa36c0c05176103c` |
| app-management-compact-320 | 2026-10-26T11:52:09.774Z | `475b0df060470f7a30aee6b6a0278213df8d96a2713d3a068d7d86d08cddce09` |
| app-management-compact-390-corrected | 2026-10-26T11:52:19.852Z | `c43b04f245c2cb6a13aaa74568f2e5c8c10a36f24a474317855bb07557a4d866` |
| app-management-error-390 | 2026-10-26T11:52:51.468Z | `d45d0d4f8f0affcee3cfb3b150776b7946b491ff1d119436479794878f753c52` |
| app-management-enter-retry-restored | 2026-10-26T11:53:27.023Z | `97a9a287fb5de8b0e2fb11947e5afc2a8d15d756f51c19272a13fe2d3781b27d` |
| app-image-preview-open | 2026-10-26T11:53:47.197Z | `5347d11da7754d742164af1afa993def1b7a810316f1781040fde763b956015d` |
| app-same-day-divider-removal-prepend | 2026-10-26T11:54:32.994Z | `13b83c6b149df2d6acaf3859b188c8ff2a48e04cb656dbbb50397ab0babf4b6d` |
| h5-timeline-8-to-16 | 2026-10-26T11:55:52.204Z | `4dd13b02c989720c82dc13b99905bc9e57a19b93cdb5f7312027da5173ce5df2` |
| h5-timeline-16-to-24 | 2026-10-26T11:56:14.971Z | `f95e6a367ede12d0c0aefbd39e53959cd04f11cce7372ad004086f7e5559dae3` |
| h5-timeline-vi-light-320 | 2026-10-26T11:56:28.163Z | `bb7885737bcb66d1dbb3994dd5afd0ac712cb5823e7deb81874180be8bb03d62` |
| h5-header-before-scroll-vi320 | 2026-10-26T11:56:51.669Z | `5f1f8f27062fdaa47f3bf0e8fc0427cd989fed8fc2d451095ab0d79b1bd00263` |
| h5-header-collapsed-vi320 | 2026-10-26T11:57:04.375Z | `632a15badef453b2bffa9208405310f015bbeba102f094bdda68ca08d2d5a47c` |
| h5-top-settings-destination | 2026-10-26T11:57:13.925Z | `b873f91622061ae7c285f1a4569b743cfab2e2fc62703f779cccf1e54edbe77c` |
| h5-top-return-restored | 2026-10-26T11:57:20.354Z | `348d095e5786987780fee22b7e0191f3e6a89111e8f2544f8bf700d0925e525f` |
| h5-message-error-vi320 | 2026-10-26T11:58:05.046Z | `7fac8bc1ec26b4261b98170d0ebb64d1f222986a87b9043e184693c3320f5381` |
| h5-top-return-restored-settled | 2026-10-26T11:58:37.442Z | `1a127484accb6bbbfa041164594c82c167376d005db96cb4cfe7f014dfec0711` |
| h5-management-vi-light-320 | 2026-10-26T11:59:40.729Z | `d2ebe1fd501b7d299f1f0222886f78496755c9ba0e799761f9f1986b98d7ad9d` |


## R8最终独立交互签核：12项与P2关闭依据

日期：2026-10-26。此区归档此前已经完成的独立源码、实际函数/绑定回归、证据文件读取和截图目检。本次仅追加结论，没有追加测试、浏览器操作或构建；没有修改生产代码、提交或推送。前文R2—R5结论与低分历史完整保留。本区取代旧版本对最终冻结范围的结论，不回改旧证据版本标签。

### 冻结范围与结论

最终范围为APP R8 `d65ee0b64a30739e44644e613511563239c2218c`、H5 R8 `4173e25b8f85df83a2b21412fb378c6babc97b31`。十二项逐项达到9分门槛，仅签本轮已审本地原型范围，不作平均。此范围没有仍未关闭的已知P1/P2，也没有等待用户补交的具体证据。

R6的两个行为P2已分别通过旧错误复现、修复后异步失败路径及正常路径检查关闭；R7新增到达时间误判已关闭；SEND的reduced-motion按住态优先级问题由R8精确状态证据关闭。正常历史分页、静态截图或释放后的按钮状态均未被用来替代相应异步/按住边界证明。

### 最终十二项评分

| 项目 | 独立分数 / 10 | 签核依据及版本适用范围 |
| --- | --- | --- |
| LIGHT-01 | 9.0 | 继承R2已审结构化浅色活动展示及后续未变业务语义：同一发布活动rules/catalog决定SKU、奖励和路由，暗色保留发布整图。仅覆盖已有本地活动样本，未把R8当成重新执行完整运营Banner矩阵。 |
| MSG-03 | 9.2 | 继承R1标题三语/明暗/宽度矩阵和R2全部已读44×44修正；结合R5 H5越语320失败后原页重试及恢复读回。通知已读与客服未读分域，通知3清零不误清客服1298，未知读取不伪装为0。 |
| CTRL-01 | 9.1 | 继承已核对的同步busy/retrying、防重复、隐藏/账户取消代次、旧finally不释放新代；R5管理页实际44px重试及Enter恢复补证。只签本轮相关读取入口。 |
| SHADOW-01 | 9.1 | 继承领取CTA等已审玻璃/inset样式，外部下投影去除；相关源码未因R6—R8变更。不宣称R8新跑了全站CTA视觉矩阵。 |
| SHADOW-02 | 9.1 | R5管理页320/390紧凑布局及越语320补证关闭旧180px留白；APP提示区约82.79px、H5越语约100.19px，重试透明且44px；真实图片预览已打开并键盘关闭。列表移除本就是可恢复的本地移除，不虚构确认弹层。 |
| MSG-01 | 9.1 | 继承R3 ink3回执修正、R5三语小屏布局及已有状态语义；只显示实际可得receipt，不把对方消息伪称已读。R7准确时间与到达刷新未改原消息时间。 |
| MSG-02 | 9.1 | 继承双向0.18s linear实际事件、历史/返回不重播及reduced证据；结合真实SFC首次消息/绑定回归。R6异步分页准备失败须停止请求，R7时间刷新不制造同消息重播。 |
| BADGE-01 | 9.2 | 继承黄底深字共用token、1/99显示与0隐藏证据；通知/客服计数保持分域。相关浮标/头部基础源码未因R6—R8变更，未重标为R8新矩阵。 |
| TOP-01 | 9.1 | 继承R3 APP真实返回/设置/折叠恢复；R5 H5越语320真实wheel→设置→Enter返回，以settled恢复记录为准，排除过渡中首条记录。44px热区及路由语义保持。 |
| TIME-01 | 9.1 | 新核验R6前插预测boolean与有效0/42、失败不请求、旧测量失效；R7真实SFC新到达20秒显示Today、真正未来5分钟仍完整日期。结合R5/R7日期分组与分页锚点证据。原R5 8.7保留。 |
| ATTACH-01 | 9.1 | 新核验R6策略代次、owner/session/visible及销毁守卫，旧true不能覆盖新false/失败，旧picker返回不上传；继承R5灰色禁用44px、零可见caption及文本发送证据。原R5 8.6保留。 |
| SEND-01 | 9.1 | 新核验真实SFC禁用/重复发送/隐藏清理，普通态0.2s内层回弹且44px外层不缩；R8双端reduced且active=true时transform:none、释放无回弹并发送，媒体复原false。仅本地pointer及组件范围。 |

以上旧签项继承均以此前已读源码和版本差异适用性为基础。没有把R5图片改标为R8，没有以新总分覆盖R5低分，也没有将原九项视为本轮重新实景执行的九套矩阵。

### R4-P2-01 / TIME-01：未知旧prefix与超时失败已关闭

旧版独立复现：旧scrollTop=150、真实旧prefix=42、新prefix=300时，超时约502ms后仍继续前插并把未知旧prefix当0，得到450，正确值应为408，产生42px误差。这是R5时间戳项8.7的实质原因。

R6修复核对的是冻结源码中的实际函数及Vue绑定：`measurePrefix`返回number或null；`prepareHistoryPrepend(): Promise<boolean>`对empty、null、NaN/Infinity、超时、隐藏、身份变化或被新准备替代返回false；合法0必须成功。human和Nova父级均只有`prepared === true`才请求更早历史；finally释放本代busy，未知旧prefix不再构造0进行补偿。

既有独立执行结果：

- 合法旧prefix=0：成功补偿到450；合法42：成功补偿到408。
- empty/invalid不回退0；旧超时复现得到prepared=false，scrollTop仍150，没有产生450。
- 首次准备失败时不请求；恢复true后human和Nova各请求一次；human挂起期间重复调用被阻止，被替代的准备丢弃。

因此关闭依据覆盖失败、重试、防重入、有效零和正常42高度，不依赖正常DOM分页锚点。原生selector在此是实际函数配合模拟原生测量/绑定，不是安装到真实手机的运行证据。

### R5-P2-02 / ATTACH-01：迟到附件策略与选择结果已关闭

旧版独立复现：新策略已经返回false后，旧请求迟到true仍把policy改回true、attachDisabled改为false。R5 8.6保留。

R6修复实际函数复核包括：每次受控读取/reset递增generation并清空旧策略；应用结果同时核对generation、visible、disposed、sessionReady、binding、scope和composer owner key。账户/会话绑定变化、hide及cleanup使旧读取失效；chooseSupportImage复用受控读取，picker返回还需匹配generation、策略身份及当前owner。

既有独立执行结果：

- old true晚于new false：旧值丢弃，后续合法读取可恢复。
- old true晚于new failure：旧值丢弃，失败保持禁用，后续可重试。
- hide、return、rebind、owner、session、dispose分别通过失效路径。
- 新禁用策略生效后旧picker返回被丢弃，uploads=0。

这关闭的是异步读取与选择结果边界；真实上传、真实服务权限和上传失败未被冒称完成。禁用图标的运行时Enter/Space被自动化工具因aria-disabled拒绝执行，不能记成实际键盘操作通过；该防线由组件/真实SFC守卫覆盖。

### R7时间到达修正与最终脚本继承

R7针对分钟级clockNow造成新到达消息短暂被判为future的缺陷，在visible消息id/timestamp变化时刷新Date.now，不修改消息原始ts。独立编译真实R7 SFC并控制时钟，结果为：

- 20秒后到达消息即时显示Today 18:00；真正未来5分钟仍显示完整日期Oct 26, 2026 18:05。
- 原timestamp不变；同id时间更新不重播进场动画。
- hidden时不变更clock，show即时刷新，cleanup通过。

R6与R7的measurePrefix、prepareHistoryPrepend、preserveHistoryPosition、onSend，以及chat中的loadAttachmentPolicy、resetAttachmentPolicy、chooseSupportImage、loadEarlierHumanHistory、loadEarlierNovaHistory实际函数文本已对比一致。R7→R8的conversation-thread.vue及chat.vue完整script/template亦已对比一致，APP/H5对应script/template一致。因此两项R6异步关闭证明适用于最终R8，而非仅凭正常截图或汇报日志继承。

R7实际H5到达记录为“Hôm nay 21:25”，逐条元信息保留准确时刻，完整日期信息保留GMT+09:00。最终历史16→24锚点差约+0.167px，24→25约-0.354px。R5 8→16→24、同日首日期标记替换及跨日保留证据仍按R5版本引用。

### SEND-01：R7按住态问题与R8关闭

R6/R7普通按住选择器`.nx-conv-send[aria-disabled="false"]:active .nx-conv-send-face`的specificity高于原reduced块内的普通face选择器。此前独立CSS解析确认，reduced按住时scale仍可能生效；释放后/发送后disabled截图不能关闭该问题。R7阶段SEND未独立签核，不为其补造已通过分数。

R8只在reduced块加入同等优先级的active选择器，位置更后，令transform:none生效；会话脚本和模板保持R7。已有runtime-r8.json的双端真实held状态同时满足reduced=true、active=true、disabled=false、内层transform:none和animation:none，外层44×44；释放无动画，APP记录发送可见。computed transition为全局reduce的极短1e-05s，未将其写成字面零时长。

H5普通浅色320保持44px外层，按住仅内层缩小，释放捕获0.2s cubic-bezier(.2,.8,.3,1)事件。APP/H5媒体均还原false。R6真实SFC还已验证disabled不发送、重复Enter被阻止、首条文本仅发送一次、busy护卫及hide清理；JS反馈清理约220ms与CSS回弹200ms分别记录，不混称。

runtime-r8最终10条；前9条保持原记录，第10条仅新增`app-final-ready-dark-390`。ready颜色处于过渡的采样不被当成稳定token读回；按住稳定状态已有主题色证据。SEND按住态P2关闭，不外推为实体手机轻按验证。

### 实际读取范围、日志与冻结证据

此前已阅读专项报告、对应R1—R5 manifest/runtime及相关冻结生产实现、真实SFC/组件测试；R5既有目检18张（11 APP、7 H5）及27条runtime的详细范围保留在前文。本区新增归档的既有读取范围为R6/R7/R8 runtime 9+9+10条、最终manifest、指定回归日志及以下10张实际view_image图片。未操作浏览器；未重跑旧矩阵。

| 版本 | 实际目检图片（既有读取） | 当次记录SHA-256 |
| --- | --- | --- |
| R6/R7 | app-r6-send-pressed-zh-dark-390.png | f361efb52da2002a5d243bf52bbbd74848c598c04e288880860d0f368a0f1f23 |
| R6/R7 | app-r6-send-ready-zh-dark-390.png | 3ac20e1143d42dc20c9f411921eaf386ec8dbc7fed86d986f8dff6aeeaa7abb9 |
| R6/R7 | app-r6-send-ready-zh-light-320.png | 3d3eaeb6455f2ba65070cffae4f9955c2854236d4c0960d61f5a0c5203927b6e |
| R6/R7 | app-r7-send-ready-zh-dark-390.png | e106128e63f117b1f67cb112a5c7074f835246963657b0dcc03036b0a6c726fb |
| R6/R7 | h5-r7-send-empty-vi-light-320.png | dd551892bd928977fa9826784b2ddc6f916c2f5cbcdac7c7b5820189f85dfc49 |
| R6/R7 | h5-r7-send-ready-vi-light-320.png | 660f3bf2d8688c4e231e7bdc2b0a3485861c8530469c220d2cd15b1c90bccf66 |
| R6/R7 | h5-r7-fresh-today-vi-light-320.png | 34e22471646d4b5518b8063fad354d5fb1529098cecded4a14e79a31164280c8 |
| R8 | app-r8-send-reduced-held-zh-dark-390.png | 174a9d4ebcc261ab7d1bbde39e5f73626964bdda0cec6e358a6b3bd95049cc92 |
| R8 | h5-r8-send-reduced-held-vi-light-390.png | 45b4dd2ab3a0c572b61c97eb6cf788ffca82f4fc125a81a0f8f7a52f080bd3f1 |
| R8 | h5-r8-send-ready-vi-light-320.png | b797b162d68c10f804727c2f4dd872e7c8d17a3399a8bdc8ac77ba34351b839a |

R6/R7/R8读回摘要：

| 文件 | 记录数/结果 | SHA-256 |
| --- | --- | --- |
| runtime-r6.json | 9条 | f9769d6cd5938b2a1e29c13b18005837528b6a4808be2ccf950bd675ce3c1232 |
| runtime-r7.json | 9条 | 6ef9f2c8f6a825b0f6d6556c647eedc20222f8a59435cb7cab62a212dd8f27cb |
| runtime-r8.json | 最终10条 | bcf11360482c7eadba1d9d85003168b4d3285d94e06ad699254b66b3cb365885 |
| app-build-r8.json | 43项源码/341项产物已核对 | fe54a2f092d9e1c898dc906282f63f022c393ef2ff6c64e2ba1113b6341ab56c |
| h5-build-r8.json | 43项源码/341项产物已核对 | 15127771ce994aa171a46fab016538f2cf5da6fb93d9aa6cefbf52f317d4d550 |

APP R8 source fingerprint：`41abf777a1664ce0b1606865474b15e40b8fb8acdaad25e88c5d658c962bbec1`；artifact fingerprint：`b0658042401a74bf30eeb76365b318f8e850de4d0f91559060298f598b4e71b0`。

H5 R8 source fingerprint：`189276d1a415980534c5996107951c9dd2c9ee212cd0c4f892a60146d3aad220`；artifact fingerprint：`02b3bf39b904f687dd3e9fe106849c2d55e26b9a1e266f7218d10309ed02736f`。

已实际读取的既有日志位于`D:/WORKS/PLAN/.wt/uvel-design-preview/`。以下是日志证据，不代表本次又执行测试，也不将重叠集合相加：

| 日志 | 读回结果 | SHA-256 |
| --- | --- | --- |
| queue-r6-red.log | 13 failed / 94 passed，共107 | 931fa73138c0f5bf5eb84878adb8efa19c4c7027a13967abcf2c9a37f9db5279 |
| queue-r6-fix-tests.log | 2文件107/107 | e6beadfd67715aaff5ab3d2a92673b663114c5175df520cc40d7d3820a71d662 |
| queue-r6-nova-test.log | 43/43 | 76befea52c1e9923b92d85fafbe166dc4cdb890580f05fa73140752af994cca3 |
| queue-r6-tests-final.log | 10文件259/259 | 3e3784fd816c78f83b3af6ac3b7fbf26b1d6d9cc414eda5525befe8a55a3bc4a |
| queue-r7-clock-test.log | 38/38 | 3c20c3ee566c526df80ba0a6bbd7cc0e62f5ce89d0c3a79c3a54dd4399673bf2 |
| queue-r7-tests.log | 10文件260/260 | e0bfcebcda1d3c8c3cb4f47502b08009ebbdfc5ce7634e78c9c304c425fe7673 |

### 实际未覆盖边界

- 本地APP源码的Web预览/H5与测试数据，不等于TEST真实服务、生产、全站或所有页面/三语/明暗/宽度组合通过。
- 未新装APK/IPA，未在实体iOS/Android验证原生滚动测量、键盘、安全区、GPU、系统reduced-motion或真实触摸。APP原生资源编译绿与真机安装运行分开陈述。
- 原生prefix失败证明来自冻结实际函数及模拟原生测量/绑定。真实设备异常回调仍属于未实景范围。
- touch dispatch工具不支持；已有pointer实测，不能据此写“手机轻按已验”。禁用附件的Enter/Space亦不能写成运行时已执行。
- 真实服务receipt可得性、真实附件权限/服务错误/上传，以及完整运营发布Banner、后端浅色资产、物理缓存和完整发布流程均未实景。浅色结构化展示是已批准的本次策略，不声称后台存在浅色整图。
- 本地图片预览、列表可恢复移除及fixture读回，只证明相应本地交互；不代表真实运营数据、支付或真实外发消息。
- 旧截图和runtime保留原版本；只对经源码适用性核对的未变逻辑继承结论，不把R5/R6实景重标为R8。

以上为明确排除的范围，并非等待新增补验的任务。十二项报告在此完成；按用户指示停止新增检查。

### 新增第十三项待审

CHAT-TOP-01为本报告之后新提出的聊天身份区居中布局：保留左侧44px返回，对称轨道，中间avatar/title/status整体居中，拟仅改template/style。此项尚未提供最终布局证据，不包含在上述十二项评分内；待用户提供后独立审查。既有TOP-01分数只对应本报告已冻结版本及原返回/设置/折叠交互，不预签新布局。


## R11增量复审：CHAT-TOP-01签核与SEND玻璃恢复预审

本次仅只读审查新增聊天顶部布局及发送键恢复共享LiquidGlass的增量；不重跑已关闭异步P2或旧十二项矩阵。只追加本报告，没有修改生产代码、执行测试、构建、浏览器操作或Git写操作。

### 冻结来源

- APP：`f80c088ae40f24cd96e3b2dc889fe4752a2356f4`，app-build-r11.json SHA-256 `6c80cb5f600cb748f1880a8d5f8b3724886fd78ca71a7f226389f69eab294628`。
- H5：`fc781634fa3c0d12306429f48c1a95239de8026b`，h5-build-r11.json SHA-256 `97560c80464d605049dbfa86362ccac4923f188cc8d9205d21a36b9bdaf51803`。
- 已在各自仓库核对R10与R11的整个src Git tree相同；APP与H5的chat.vue、conversation-thread.vue、liquid-glass.vue对应源码一致。
- 两份manifest内chat/thread摘要与冻结文件核对一致：APP manifest采用CRLF工作树字节，H5采用LF；首次直接以Git LF核APP摘要不等，经核对是换行表示差异，并非内容漂移。此次只核对上述目标文件，没有重新核验全量341项构建产物。
- 相对R8，thread完整script相同；chat script除SUPPORT_ICON的viewBox常量外相同。旧分页、附件、发送、账户/可见性生命周期guard的关闭依据据此继承，不借正常路径重新关闭异步缺陷。

### CHAT-TOP-01：9.1 / 10，限定已审本地范围

未发现本轮需修复的业务或可达性阻断。

1. 顶部采用44px / minmax(0,1fr) / 44px对称grid轨道，身份区包含avatar、title及status并整体居中；右侧无动作时使用aria-hidden且pointer-events:none的44px占位，不生成可聚焦空按钮。
2. 返回保留role=button、tabindex=0、原aria-label及click/Enter/Space处理；键盘repeat保护及navBack到消息页的fallback未变。实际runtime的app-header-back、h5-header-back均读回#/pages/support/messages且conversationVisible=true。此记录没有证明本轮每种键盘键都实际执行过，键盘语义来自保留的模板/handler。
3. Nova新会话只把文字换为装饰SVG，44px尺寸、原aria-label、handler、isAi && remoteApiEnabled门及隐藏AI路由处理均保持；新会话确认、账户/会话身份检查未改。入口仍隐藏，本轮未把它当作已实景可达的新功能。
4. 头像装饰标记不遮蔽真实headerName/headerRole文本；未知/重连/离线/关闭及原会话所属客服身份计算均未被布局变更重写。耳机viewBox与容器居中修正只影响图形。
5. runtime-r11前24条对应APP/H5×中英越×明暗×320/390：所有返回44×44、overflow=false，身份区绝对中心偏差最大0.005203px，两侧动作与身份区最小余量27.802px。已实际view_image目检下表前4张顶部代表截图，未宣称24张均逐张目检。耳机量测的垂直图形轴偏差约0.0013px与代表图目检一致。

宽度边界：320时中心轨道184px，32px头像加8px间距后可留约144px文本区域；name的overflow-wrap:anywhere、meta/identity的min-width:0允许长姓名换行，44px两侧不被压缩。实际24格均为“演示客服”与三语重连状态，没有覆盖超长真实客服姓名、所有在线/忙碌/转接状态、大字模式或小于320宽度。长姓名可能使头部增高并压缩列表可视区；状态行未设置任意字符串断词，不应外推为无限长度/任意窄宽通过。这些为本轮未覆盖边界，不凭猜测新增阻断；日后开放Nova或扩展最小宽度时需按新范围再审。

### SEND-01：共享玻璃恢复源码预审通过，最终重签待按压证据冻结

用户新增“保留Liquid Glass”后，R8 SEND 9.1作为旧要求下历史保留，本区不把它直接继承为新要求的最终分数。

R11在原44px内层face加入一个共享LiquidGlass(radius22)，箭头z-index=1；glass及其子层pointer-events:none、aria-hidden=true，不新增交互目标。ready通过--v5-liquid-tint叠加82%主题强调色，保留原on-brand字色；disabled使用原中性玻璃/ink。原44px外层、内层缩放、200ms动画及R8同优先级reduced active覆盖均仍存在。

thread完整script未变，原click/Enter/Space入口、同步canSend检查、防重复发送、反馈清理及hide清理不因装饰组件重写。已读behavior测试相关断言中LiquidGlass是stub，38项通过本身不能证明真实玻璃渲染与按压后的命中/动画；本区据此只签源码语义预审，不提前补最终SEND分数。

下表后3张ready截图已实际目检，能看到浅色蓝/暗色强调色发送键与玻璃边缘层；24条header记录附带的发送键读回包含单一glass、SVG策略及rim/specular。这些只能补静态装饰存在性。runtime-r11仍累加，晚于header24的按压条目未在本区最终签核；等待主线程冻结双端普通/reduced按住及释放证据后，只重审受影响的SEND范围。

### 本轮实际读取与目检

已读冻结R8→R11两处生产diff、chat身份/状态/返回/新会话与隐藏路由代码、thread发送模板/样式、共享LiquidGlass、相关真实SFC/组件测试断言、两份R11 manifest、runtime前24格及两个返回读回。用户报告R9父组件143、R10共享线程38、tsc/web/native结果，本轮没有重跑，也没有独立读取全部对应测试/构建日志。

runtime-r11为累加文件，不将本次观察到的条目总数当最终冻结总数。前24格按原顺序JSON.stringify所得SHA-256：`16fad9f87b1f81191cb5cee492ce19883a4508f0573c2db8982b5faebf0d737d`，用于固定本区实际采用的子集。

| 实际view_image文件 | SHA-256 |
| --- | --- |
| app-r11-chat-header-vi-light-320.png | 6e8281a1061519d9bc7ccbea1710a4b993d4fdba655391eec4126a05dae0659c |
| h5-r11-chat-header-en-dark-320.png | ccbb056dd949665cabf4b7e79789618ac3d98fa8d19ad7835c20eb0703b4dfa9 |
| app-r11-chat-header-zh-dark-390.png | b126fb65f1b580573ad8ae6553e23a5c8f56a9d743c7c763dbbca0dd549317a6 |
| h5-r11-chat-header-vi-light-390.png | 47004aa6424c270f9a5b7c7409ff832920c85297f421a057e754ae99f181c7a1 |
| app-r11-send-glass-ready-zh-light-390.png | 7fd5957e3219e9419f01a6976df0a0b1c6dfb7a95f0b9f53c0f14d9d69f30595 |
| app-r11-glass-ready-zh-dark-390.png | 42b2c0f9bef0195b4cfde7745af9294da45ddb94160d953981de6ad944e374ea |
| h5-r11-glass-ready-zh-light-320.png | 0af6ac00800028e53ff11692b4c646d633f0e2a16ee63ac72f9f9f44cbe06723 |

真实服务、实体手机安装/键盘/触控、完整后台身份数据及隐藏Nova实际启用流程仍不在本轮签核范围。原十二项报告和R5低分历史不改；CHAT-TOP为第13项9.1，SEND新要求等待最终按压证据后另附结论。


## R11聊天顶部最终签核及SEND材质修整待审

本区响应最终冻结R11与随后R12光学装饰修整的范围更新。只追加本报告，不修改生产代码、不操作浏览器、不执行测试/构建/Git写操作，不重跑原十二项矩阵或已关闭异步P2。

### CHAT-TOP-01最终：9.1 / 10

APP冻结`f80c088ae40f24cd96e3b2dc889fe4752a2356f4`，H5冻结`fc781634fa3c0d12306429f48c1a95239de8026b`。沿用上一节已完成的独立源码复核、目标manifest字节核对、24格量测、4张顶部代表截图目检与双端返回读回；未发现待修阻断，本项在已审本地原型范围最终签核。

24格为APP/H5×中英越×明暗×320/390，返回键均44×44、无横溢；身份区中心偏差最大0.005204px，动作与身份区最小间距约27.802px。对称轨道、装饰头像/耳机与原headerName/headerRole数据计算匹配。右侧占位没有可聚焦空动作；隐藏Nova的新会话图标保留原44px、aria-label、原handler及隐藏门，本轮不签隐藏入口启用后的实景。

既有返回/Enter/Space模板及repeat保护未变；实际APP/H5返回记录到#/pages/support/messages且conversationVisible=true，不将它扩写为本轮每个键盘键都逐项实测。超长后台姓名、所有身份状态、大字、小于320宽度及真实原生安装仍未实景；长姓名换行可能增高头部，此项不外推为任意宽度通过。

### SEND-01：R11行为证据已完成，最终材质签核等待R12

R11恢复共享LiquidGlass的源码语义预审及本次冻结按压证据读取完成。用户随后确认ready颜色无需修改，R12只拟局部高光/暗缘光学装饰；ready的82%主题tint、disabled中性、script/template、热区和动画均要求保留。R11旧“等待按压证据”的原因在此结束；新的未签原因是材质修整，不能再写成异步guard尚未闭环。

本次实际读完runtime-r11剩余记录，结合上节前24格，冻结文件共42条，SHA-256：`5855919636d1696b13b0d9f7dc630a39fede66f62148241f1d171048493fceb5`。采用证据与排除记录如下：

- ready/empty与普通、reduced记录均存在一个真实共享glass实例，运行策略为SVG，含rim/specular与tint读回。这里的“真实LiquidGlass”指生产共享组件实际挂载及光学层存在，不声称实际采用WebGL策略或真机折射验收。
- APP普通按住settled时active=true、reduced=false、face=40.48px、transform=scale(0.92)，外层仍44×44；释放捕获0.2s及原cubic-bezier事件，之后恢复44×44、disabled=true，并记录sentVisible=true。
- H5正确坐标按住时active=true，采样transform仍为1，不能写成已采到稳定0.92；其后释放事件实际捕获0.2s，内层约40.892px/scale(0.92937)，外层仍44×44。结合未变的共同0.92 active CSS及APP稳定按住记录，证明热区与内层动效分离，不为H5补造稳定按住数值。
- APP/H5 reduced按住均active=true、reduced=true、transform:none、animation:none；释放均none-observed且44×44，APP另记录sentVisible=true。media-restored记录reduced=false，但该条没有明确平台字段，不能单靠它声称双端分别完成媒体恢复读回。
- `h5-pointer-miss-not-validation`及`h5-pointer-miss-release-not-validation`明确排除，不参与验收。
- held记录的url是取证iframe src属性，不据此判断SPA当前路由错误；最终empty记录读回实际chat?cid=DEMO-SUPPORT-1。该字段解释不替代真实guard/组件及正确坐标运行证据。
- app-error-routed-to-list只证明错误fixture进入列表且可见retry，不作为聊天错误头部视觉通过证据；R9 draft主题未就绪截图继续排除。

已实际view_image目检本次指定的APP dark ready、H5 light ready及APP dark final empty三张。ready暗色为主题绿、浅色为主题蓝，disabled保持中性玻璃；本轮没有实施用户已取消的空输入调色方案。原脚本、防重入、取消/账户/隐藏生命周期和reduced active优先级关闭依据保持，不因恢复装饰组件而重复全套检查。

视觉独审现给ready材质8.8，指出高光/暗缘偏平；这是另一审查的发现，不冒充本审独立量测分数。该发现与用户本次Liquid Glass要求直接相关，本审不对当前SEND给最终>=9或宣称通过。保留此前R8 SEND 9.1为旧要求下历史，R11仅行为证据完成；待R12冻结最小源码差异及真实光学补证后，对受影响材质再独立评分。无需为此重跑其他十二项或两个已关闭异步P2。

本轮三个实际目检文件的摘要见下方，旧顶部目检范围与摘要沿用上一节。真实手机触摸、原生安装、真实服务消息发送及完整GPU/渲染降级矩阵仍不在签核范围。

| 文件 | SHA-256 |
| --- | --- |
| app-r11-glass-ready-zh-dark-390.png | 42b2c0f9bef0195b4cfde7745af9294da45ddb94160d953981de6ad944e374ea |
| h5-r11-glass-ready-zh-light-320.png | 0af6ac00800028e53ff11692b4c646d633f0e2a16ee63ac72f9f9f44cbe06723 |
| app-r11-final-empty-zh-dark-390.png | 65da51aef0afd946c1f58770283bfa21b8b867bd889e6945ca10cefa60b0f449 |

结论：CHAT-TOP-01第13项最终9.1；SEND-01最终重签等待R12光学补证。原十二项其余R8结论及R5低分历史完整延续。


## R12冻结行为预审：SEND结果回调与AUDIO-01成功漏音

审查来源：APP `602274ee7f8961d143d1691ea33a6411678a715f`、H5 `88038a67aaf8e8d2822a6e0d9e3e87409d79812a`。本轮没有修改实现、提交、推送、操作浏览器、执行构建或重跑原有十二项矩阵。独立执行的是内存中的真实SFC/实际函数定点复现；本报告为唯一写入文件。

### 当前结论

| 项目 | 本轮结论 |
| --- | --- |
| SEND-01 | 新结果回调/owner及最短转向计时的源码行为预审未发现新增阻断；玻璃光学增强、飞机正常/reduced实景仍待冻结证据，不给最终通过分。旧R8分数保留为旧范围历史。 |
| AUDIO-01（第14项） | 代码行为预审8.6/10，未达到9分。独立复现同owner连续发送漏音及Nova重试成功无回调；须修复后重审。这个分数不包含真实音色、音量或设备播放验收。 |
| 其余签项 | 原R8其余结论及CHAT-TOP-01最终9.1保持；原异步P2关闭依据不重跑。 |

用户报告195/195（六文件）及双tsc/web绿；本轮阅读了相关测试与源码，没有独立重跑这个完整集合。绿测没有覆盖下述两个失败路径，不能用来关闭它们。

### AUDIO-R12-P2-01：同一owner后发消息使先发成功音被错误丢弃

位置：conversation-thread.vue的onSend，特别是settled回调开头的`epoch !== sendVisualEpoch`返回与其后的`sounds.play('send')`。

真实SFC独立复现使用实际createConversationAudio，偏好开启、前台可见且有unlock；同一account/binding/composer内连续两次onSend，600ms间隔分别完成：

```json
{"case":"same-owner-first-success-after-second-enqueue","played":[],"stillTurning":true,"expectedSendSounds":1}
{"case":"same-owner-second-success-600ms-later","played":[{"kind":"send","at":2600}],"expectedSendSoundsTotal":2}
```

第二次点击只应替代“按钮现在跟随哪一次发送”的动效，不能使同owner第一条真实成功事件失效。当前声音与动效共用sendVisualEpoch，导致第一条成功音丢失；两次完成相隔600ms，明确不是同类400ms合并。Nova允许连续排队，此路径符合设计；当前隐藏Nova入口不作为已实景可达功能，但不能据此把用户明确要求的Nova队列语义签通过。

修复建议：将声效的owner/会话代次和成功去重与按钮动效epoch分开。旧发送完成可不控制最新按钮，但仍应在同owner、可见、偏好开启、已gesture且该权威成功事件未消费时进入播放门；跨账户/隐藏/销毁的旧事件继续丢弃。去重应使用turn/command或等价发送身份，400ms合并仍交给audio控制器，不用“最新一次点击”代替成功身份。

### AUDIO-R12-P2-02：失败后重试成功不再触发成功音

Nova位置：chat.vue的settleQueuedSendVisuals、onQueueAction及queuedSendVisuals。第一次failed时删除map并done(false)，后续retry只重新入队，没有为同turn后续权威成功建立新的反馈通路。

独立执行冻结chat实际map/settle/onQueueAction及冻结Nova store的failRemote/retryRemote/claimRemote/completeRemote，配合实际Vue同步watch：

```json
{"case":"actual-frozen-nova-fail-retry-success","afterFail":{"results":[false],"callbacks":0},"afterSuccessfulRetry":{"results":[false],"callbacks":0,"pending":0,"successfulTurn":true}}
```

重试已真实进入成功状态，但结果只有最初false，没有true，子组件不可能播成功音。

human位置：chat.vue:433，retryHumanSend直接await sendHumanMessage并丢弃true结果，未经过包含声音回调的onSend；此为明确源码路径检查，本轮没有把它夸写为真实后端重试实景。快捷入口onChip调用onSend时不传settled，也不进入子组件结果回调，属于同一成功事件接入范围需一起处理，不能声称已覆盖所有成功发送入口。

修复建议：在权威发送成功层统一发出owner隔离、按成功身份去重的反馈，或给重试/快捷发送建立等价结果通路。失败/取消不播；同一未知请求反复读回成功不能重复播；失败后真正成功可播一次。按钮转向只跟随其原发送，不必让非主按钮的重试重新触发主按钮动效。

### SEND结果回调与owner边界

- human主发送await实际sendHumanMessage后仅true映射accepted=true；失败、拒绝、取消或失去请求身份走false/undefined。父级busy finally与飞机回正计时分开，不以160ms到时伪造成功。
- Nova入队不立即完成回调，map按turnId等待pending终态/失败/取消；onHide、cleanup、账户/binding或conversationBoundary清理未完成回调。实际Nova完整函数检查确认“delivery清除”时成功user记录已可查，正常完成不会被误作取消。
- 子组件每次点击更新视觉epoch，防旧回调/restore控制后续输入或按钮；hide、scope dispose、composer/reveal/account/binding变化同步reset。160ms只是快速完成时的最短可见转向，不制造消息成功或重试。
- 实际SFC定点执行确认较早完成没有把第二次sendTurning复位；composerKey切换后旧成功回调被抑制且turning=false。已有真实SFC测试还覆盖hide/account/conversation/dispose及重复settled，本轮仅阅读这些断言，未冒称重跑。
- 新建human会话首句完成前可能由start:type切到真实cid，触发composer reset；其声音可能因此被合理抑制。已独立执行composer切换后的抑制路径，不把首次创建成功音算作已通过分支，也不把它同上述“同owner仅有新点击”的错误混为一谈。
- reduced CSS同时覆盖face与plane，包括turning选择器；不提前宣称真机或最终RAF实景通过。新模板只增加平面转向/aria-busy，44px主热区与真实共享LiquidGlass保留。

### 接收、播放门与资源：独立定点结果

使用冻结实际conversation-entrance及createConversationAudio、实际Vue响应式与scope；替代平台voice以观察调用，没有伪造声卡/浏览器已播放。结果累计如下：

| 操作 | 累计播放次数 |
| --- | ---: |
| 初始history、偏好关闭 | 0 |
| 开启但尚无gesture，新消息到达 | 0 |
| unlock后真正实时incoming | 1 |
| 回执更新及历史前插 | 1 |
| 同类小于400ms新incoming | 1 |
| 到400ms的新incoming | 2 |
| system消息 | 2 |
| 同ID删除/恢复 | 2 |
| hidden时新消息 | 2 |
| return后历史 | 2 |
| 再禁用后的新消息 | 2 |

只有两次receive调用（t=1000与1400）；voice创建一次、销毁一次。disable/owner watch同步stop，onHide stop及dispose destroy均存在，错过的声音没有队列等待恢复。音频创建/播放异常被捕获，不改变消息结果；创建失败可在下次合法gesture重试。保存偏好默认false的读取逻辑未被本次改为true，三语soundHint准确说明默认关闭。

冻结原生资源经RIFF/WAVE头部读取：send为单声道22050Hz/16bit、约150ms，receive约205ms；声明data长度与文件长度吻合。只验证资源格式与路径，不证明听感、音量或设备静音开关已实测。H5 WebAudio走合成，native走bundled WAV，平台播放许可和被拒后的实际表现仍需运行证据。

### 适用性与证据定位

此前先审工作树再收到冻结，本轮核对audio/thread/entrance/chat四文件的工作树与APP冻结源码在换行规范化后相同，前述真实SFC复现适用于602274ee。随后核对APP/H5冻结的这四文件逐字相同，两端均有这两个问题：

| 冻结文件 | Git内容SHA-256 |
| --- | --- |
| src/lib/conversation-audio.ts | 99d221d6acfc827c0d771809a9c9f57025b0ee0fa39ac42b3d828ea7305ff28b |
| src/components/support/conversation-thread.vue | 4cd027f3f68c94a8634abfe1954cc6586de72e1025ef963d2ba260c4d7fdaf64 |
| src/components/support/conversation-entrance.ts | 2df99a075dcddd2518968d0db05c5c2affc829699ed7eb8b5cafe003b59f82e8 |
| src/pages/support/chat.vue | d90072c9df8780cefee446acede1a3b20405dc98a51e49ee4b128c20d6ffe9ac |

- app-build-r12.json：48 source / 343 artifacts；manifest SHA-256 `5ca3c412081ea8a642c06a2fd568069e62bb4ab24ae3cb0b37ce8788365555bd`。
- h5-build-r12.json：48 source / 343 artifacts；manifest SHA-256 `a3216e1df4f4f9368d83aae7c2ac622e4ed5c14f509c71c8fa851ced7cfca466`。
- 本轮只读manifest及目标冻结源码，不声称逐项重哈希所有48源码/343产物，也未以构建结果替代音频运行验收。

最小回归应包含同owner连续两条成功相隔>400ms、human/Nova失败后重试成功、重复成功回调、隐藏/换owner后的迟到成功以及首建composer切换的明确预期。修复后只复核受影响范围。真实服务、真机静音/后台、真实用户gesture解锁、浏览器播放被拒、音色音量与最终玻璃/飞机实景未入分；这些边界不抹去已复现的源码失败。


## R14 APP冻结独立行为复审：两项旧AUDIO关闭、两项新P2未关闭

日期：2026-10-27。APP冻结为`fd28d620422b2bf775aee71d8952265642d53079`。本区只复核用户本轮指定的STATUS / SEND-TIMEOUT / PREVIEW-RT / AUDIO行为，并记录紧凑时间/气泡取色的源码适用性。旧报告、R5低分及旧关闭依据完整保留；没有重新执行原十二项整套矩阵，没有改生产实现、提交、推送、操作浏览器或构建，只追加本报告。

### 当前四项独立行为分

| 项目 | 行为分 / 10 | 判定与精确范围 |
| --- | ---: | --- |
| STATUS-01 | 8.7 | 未通过。有精确服务端echo时，未结束的本地发送仍被追加为第二个sending气泡；应按原command/clientMessageId合并。新紧凑布局与最终明暗色序未作最终视觉签核。 |
| SEND-TIMEOUT | 9.2 | 在冻结实际command/timeout策略、模拟时钟与传输边界范围通过；读回403/null保未知、精确echo确认、有界等待和原key重试分别验证。不等于TEST真实服务超时实景。 |
| PREVIEW-RT | 9.0 | 在本地loopback演示协议/场景实现、既有8项真实socket集成日志及历史presence读回范围通过；不等于生产WS连接、真实在线客服或完整运营环境通过。 |
| AUDIO-01 | 8.8 | 未通过。R12两处漏音P2已独立关闭，但新增post-flush成功事件跨owner播放P2；不能用旧修复/正常WebAudio记录关闭这个新边界。 |

这是APP冻结代码的独立行为结论，不是H5最终镜像或新截图全量验收。H5镜像与最终图由主线程继续准备，本轮未冒称同步已完成。无需等待新视觉证据才报告当前两个实质失败。

### 已关闭：R12两个AUDIO P2

1. 最新按钮视觉epoch不再决定声音。真实冻结ConversationThread SFC与实际audio控制器执行：同owner两次发送的成功revision分别到达，相隔600ms，第一条成功后播放1次、第二条后累计2次；旧完成仍不能控制较新按钮。
2. 权威成功已移到父级sendHumanMessage/noteSendSuccess，Nova成功反馈另有pendingNovaSounds，并在retry重新注册。独立执行冻结Nova实际队列与父级settle/onQueueAction：失败revision=0，retry成功revision=1，重复完成仍1；实际human retryHumanSend→sendHumanMessage成功revision=1。不是仅从新增测试标题或回调签名推断关闭。

定点输出：

```json
{"case":"r12-two-send-sound-reproducer-now","afterFirst":1,"total":2,"played":[{"kind":"send","now":2000,"owner":"user:A"},{"kind":"send","now":2600,"owner":"user:A"}]}
{"case":"old-Nova-retry-audio-P2","afterFailure":0,"afterRetry":1,"afterDuplicate":1}
{"case":"old-human-retry-audio-P2","successRevision":1}
```

这些关闭仅对应R12“同owner被最新点击吞音”和“重试成功无反馈”的原错误；下述新owner race继续扣分。

### AUDIO-R14-P2-01：post watcher未携带成功事件owner

位置：conversation-thread.vue:263—266。owner/账户变化只同步sounds.stop；声音voice仍可用。sendSuccessRevision的post watcher只比较数字增加，缺少该成功事件所属account/binding/composer信息。

真实冻结SFC复现：已合法gesture解锁；旧会话success revision增加后，在post flush执行前改accountKey、binding与composer，得到：

```json
{"case":"success-post-flush-cross-owner","newPlays":[{"kind":"send","now":4000,"owner":"user:B"}],"expected":[]}
{"case":"success-post-flush-hidden","newPlays":[]}
```

结果为旧成功音在user:B下播放；相同窗口若hide则被visible门正确拦住。此处验证的是组件真实watch调度及实际音频控制器调用，voice为观测替身，不假称实际扬声器已出声。

修复建议：成功反馈携带可校验的owner/request/最终会话身份，或在入队到post播放之间保存并验证所属边界，旧owner事件直接丢弃。只stop播放、只比较全局revision或依赖父级“成功当时”检查均不足。首次创建会话的start:type→新cid是合法转换，应以该请求的最终会话身份处理，不能为堵此race重新退回“所有composer变化都吞掉成功音”。同owner重复成功去重及400ms合并继续保留。

必要最小回归：成功事件入队→账户/同账户绑定/切换另一会话→post flush均不播；合法首次创建的composer转换仍按明确预期播；hide/dispose不回放。现有父级“切换后才收到结果”测试不能替代此“成功已入队、播放尚未执行”的窗口。

### STATUS-R14-P2-01：精确echo与本地pending同时展示

位置：chat.vue:1004—1012、1015—1035。只要humanSendBusy为true且localHumanSend存在，投影就把本地sending追加到服务器消息列表，未按clientMessageId/原命令关联排除已被确认的本地项。localHumanSend没有保存对应命令key，正文一致不能替代关联。

独立执行冻结的实际threadMessages computed，模拟精确服务端user echo已进入当前会话但ACK/readback仍挂起：

```json
{"case":"canonical-echo-while-ack-or-readback-pending","messages":[{"id":"server-77","text":"same accepted message","state":"sent"},{"id":"pending-human:1:1","text":"same accepted message","state":"sending","local":true}],"copies":2}
{"case":"after-await-finishes","copies":1}
```

同一逻辑发送同时出现sent与sending两条；await结束才剩一条。WS先回显/ACK迟到，以及第13秒echo到达而读回尚未结束均可产生该状态。此定点检查是投影/响应式边界，不冒称已经操作真实后台重现。

修复建议：本地pending携带原command/clientMessageId，并在权威echo确认同一会话同一请求时合并/退役，渲染只保留一条；或由store提供等价已确认事件驱动本地生命周期。不要按正文、相近时间或全局busy结束去重；未知结果重试仍使用原key。保留实际请求singleflight与busy，不为去除重复气泡误放开第二个请求。

必要最小回归：同一key的echo先于ACK/readback时只有一条sent/read；同正文不同key、不同会话、agent消息都不能吞掉本地pending；unknown恢复和显式失败重试也不能生成第二个逻辑气泡。

### SEND-TIMEOUT：六个独立实际函数边界

执行冻结store中的command/mustReadBack/completePending与实际conversation-delivery-policy；替换外部传输、持久化与时钟，不运行真实后端、不等待真实15秒。结果：

```json
[{"case":"readback403","time":12000,"result":"unknown","pending":1,"busy":false},{"case":"echo-null","time":13000,"result":"success","pending":0,"busy":false},{"case":"echo-403","time":13000,"result":"success","pending":0,"busy":false},{"case":"wrong-echo-null","time":13000,"result":"unknown","pending":1,"busy":false},{"case":"unbounded-readback","time":15000,"result":"unknown","pending":1,"busy":false,"retryKeys":["key-1","key-1"],"sameOriginalKey":true},{"case":"explicit403","time":0,"result":"failed","pending":0,"busy":false}]
```

- 原写入超时后，GET readback 403不改成明确failed，仍抛原不确定原因并保留key。
- 第13秒精确clientMessageId echo在当前目标会话，随后readback null或403均采用已确认echo，不回退unknown。
- 错误key保持unknown，不能用相同正文推断已送达。
- 无响应ACK最多12秒，再最多3秒readback；15秒时释放mutating/inFlight等待，未知key保留，后续发送相同intent仍用key-1。
- 原发送明确403立即failed并退役key，与“读回403”分开。
- 冻结实现的timeout从实际dispatch起算；authority预检不计入12秒ACK窗口，这个边界已在现有测试中明确。reconcile改为异步最佳努力，不拖住原发送结果等待。未将整个登录/authority预检链路宣称为固定15秒。
- scope/account/run守卫与精确key/会话/发送者匹配源码已核对；既有48项deadline测试还覆盖并发共享、迟到ACK、另一账户读回等。本轮独立执行的是上述六组定点，不声称独立重跑48项全部。

这里的“unknown”与“failed”及“已确认成功”有三种含义；有精确echo时应确认成功，不能概括成“所有超时最后都unknown”。STATUS重复展示问题不改变store已确认结果语义，但必须另修。

### PREVIEW-RT与运行音频证据

已阅读冻结scripts/lib/prototype-realtime.mjs、prototype-message-demo.mjs、prototype-preview-server.mjs相关接线及prototype-realtime.test.mjs场景：

- server只监听127.0.0.1；原probe拥有ticket/auth/ready/ping，演示presence来自真实本地socket watch和状态变更。online/offline发送presence；reconnecting关闭socket，生产client进入原恢复链路。
- HTTP与WS共用原fixture写入；原idempotency key和clientMessageId需相同，原key重试复用结果，改正文/目标拒绝复用。delayed真实等2秒，failed拒绝写入，unknown丢ACK并保留结果；场景reset代次阻止旧延迟写入污染新场景。
- incoming场景先更新fixture再发唯一event，使实际client reconcile读取；不是直接修改页面“在线”文字，也未把用户typing伪装成客服typing。
- 已读queue-realtime-r14.log：8/8，包含实际socket ready/watch/presence/重连、HTTP/WS写入、unknown恢复及reset。日志SHA-256 `531a458ee57e8103933c50ecce766c635f1300cb5c2bec482d4bda21b9b5de4d`；本轮没有再运行该整套。
- R13历史runtime的online/offline/reconnecting及两秒因果/失败重试仅用于对应旧场景佐证，不作为最新Telegram气泡位置或蓝紫色序的证据。

本次实际读取runtime-r13.json的12条（SHA-256 `f62f6dcdfb192ec2835c7fcfcdae117c1b60412d9a43c6fbca943a05bf6d3466`）及读取时runtime-r14.json的8条（SHA-256 `a868314253b459a2dab13343db9c090428e3282e9d8a97464dae17063fa598fa`）。文件仍可能累加，此处固定的是本次读取快照，不称最终总数。

R14的send-success-audio与live-incoming-audio-attempt各有2个Oscillator及2个Gain node创建事件；R13明确失败窗口0个事件，retry success有对应node。R13首次延迟窗口及旧live receive捕获为空，不能改写成当次成功听见；后续R14非空记录单独归档。node创建证明代码进入WebAudio播放构造路径，不证明扬声器音量、用户听感或native静音开关；也不能关闭跨owner race。

### 紧凑布局与纵向取色源码边界

模板将准确时间放气泡内右下角，仅right消息渲染状态图标，SVG aria-hidden由外层标签表达状态；可重试状态role=button、tabindex=0、click/Enter/Space入口，失败图标44px热区。unknown保留不同图标与原key重试语义，不冒充明确失败。已检查canRetryStatus及父级重试guard，未把源码存在键盘handler写成已实景执行每个键。

compactMessageGroups按相同speaker/meta、无新时间divider及非system分组，不改消息timestamp。bubbleViewportPosition按可见消息viewport中的气泡中心计算并clamp；每条背景是一次color-mix生成的单色半透明色，background-image:none。scroll、布局/消息/图片load/resize触发合并测量，hide/dispose及测量代次挡迟到结果，无永久poll。源码暗绿、浅色蓝紫端点按顶部浅/底部深取样；这不是逐泡linear-gradient。

本轮未对最终颜色、对比度、随滚动真实像素、各语言宽度/图片/超长内容的内嵌时间布局、native测量或H5最终镜像作视觉签核；不得从上述源码检查写成视觉>=9。当前STATUS实际重复气泡已独立扣分。

### 实际读取与冻结指纹

先读取WIP，再逐文件核对冻结，八个目标文件内容均仅有CRLF/LF表示差异、逻辑文本相同，故先前定点检查适用于此freeze：

| 文件 | 冻结Git内容SHA-256 |
| --- | --- |
| src/pages/support/chat.vue | 0b69f3fe982aedc88c6b175b61d4d4bb9465a2b0e186978a7831b4d92f90e8c0 |
| src/components/support/conversation-thread.vue | 961758fc12e0a4200524a47167ffc1da19444bf9d5b0c493b1481c2db63f7648 |
| src/components/support/conversation-bubble-layout.ts | 6771dc27bcf97ff91cf75401090ef4f26cfa0f7f028efdd438ec76c7a5cdd374 |
| src/components/support/thread-types.ts | 10bdfc7c12cfcee22c73385078b3df4375439b6eb5044a12eb5668653b8e7dab |
| src/store/conversations.ts | 43ce0a52c8216142d519c94fb318441af9fe27207f969454a81bf2efd5ed49b1 |
| src/lib/conversation-delivery-policy.ts | 5f3e9a0b9e99ec5386b8b5119bb3e0dcca23cd744cf9d956a14aad4fa6dc5f7d |
| src/api/conversation-realtime.ts | f699cf05b093afa58be5335c2efadf9ad9a21c2168fbaaf9d936ef4866bda7e2 |
| src/api/support-api.ts | 67c5baa9afeaa7b5f1b488dd5f36d4efdfad8a3954b568322406db94c8601473 |

已实际读取queue-r14-regression.log，10文件422/422，SHA-256 `46452b9ed9c600d923ddd5424683fdbd724b3ebcd27fbe97875a76e97a197302`；还阅读相关新增测试断言。本轮无新测试文件或实施日志写入，定点输出保存在本区；工具中一次human隔离fixture缺t依赖的失败已补齐fixture后重做，未当生产错误或通过证据。

最终边界：当前仅APP冻结代码与本地模拟/运行记录，真实服务WS/权限、真机声音/静音/后台、H5镜像最终指纹和最新视觉矩阵未覆盖。旧AUDIO两P2关闭；新AUDIO跨owner和STATUS重复各一P2未关闭，不签这两项>=9，待针对性修复后增量复核。


## R14剩余行为检查点：原冻结收尾与新表现待审边界

本区仍针对APP `fd28d620422b2bf775aee71d8952265642d53079`。父代理正在修改chat.vue及conversation-thread.vue，本轮没有读取其新编辑作为R14结论，也没有修改生产源码、运行浏览器、构建或整套测试；只执行冻结SFC/模板handler相关定点与冻结函数适用性比对，并追加此文档。

### 剩余行为判定完成

- SEND：真实冻结SFC在结果未到达、虚拟时间推进1000ms后，turning仍true且旧220ms反馈已结束；成功回调到达后回正，不把纯计时结束当成成功。快速拒绝分支采用同一最短转向计时，失败不增加成功revision。禁用时没有新增send事件。hide/show后旧restore/settled不覆盖新draft，新输入保持“new”、turning=false。这里证明脚本状态，不等于用户实际看到了飞机/气泡动画。
- STATUS交互：冻结实际retryStatus/canRetryStatus/onKeyboardActivate函数执行，对当前可重试的local failed和unknown各发一个retry-message；canRetrySend=false后不再发；incoming不触发；Nova failed发queue-action(turnId,retry)，repeat键不增加事件。此为实际handler定点，不写成浏览器真实Enter/Space已执行或屏幕阅读器已验。
- human/Nova结果回调仍由权威结果驱动；原账户/会话/隐藏清理与父级singleflight源码已核对。这里没有把“按钮视觉只跟随最新send”同“声音允许吞掉其他合法成功”混为一谈，后者旧问题已在上一节关闭，新的post-flush owner问题仍开放。
- 分页：对比冻结R8与R14的measurePrefix、prepareHistoryPrepend、preserveHistoryPosition、onThreadScroll实际函数，去除新增scheduleBubblePositions调度行后逐字相同。没有重跑原0/42高度、null/timeout及父级失败重试整套；旧独立关闭证据依然适用于这些函数，新增取色只在几何/scroll处理后排队。
- 时间：紧凑分组与内嵌时间使用原message timestamp/共享时间helper，不改服务器时间和receipt。此前R14本地pending与精确echo同时展示会生成两行和两组元信息，继续按STATUS P2扣分，不能以时间helper原有50绿掩盖投影重复。

本轮新增实际handler输出：

```json
{"case":"R14-status-handler-guards","events":[["retry-message"],["retry-message"],["queue-action","t","retry"]],"failedA11y":"Failed","unknownA11y":"Unconfirmed"}
{"case":"history-binding-source-applicability","checks":[{"name":"measurePrefix","unchangedExceptColourScheduling":true},{"name":"prepareHistoryPrepend","unchangedExceptColourScheduling":true},{"name":"preserveHistoryPosition","unchangedExceptColourScheduling":true},{"name":"onThreadScroll","unchangedExceptColourScheduling":true}]}
```

第一段标签在canRetrySend置false后采样，所以显示基础Failed/Unconfirmed；可点击状态的“重试”附加标签源码仍由receiptLabel按canRetryStatus生成，不把这段采样误写为可点击时标签丢失。发送定点的disabled/send计数、pending、hide/show及新draft结果已核对；未用脚本变量代替屏幕像素判断。

### 当前分数与开放问题不变

R14 STATUS行为8.7、AUDIO行为8.8仍未通过；SEND-TIMEOUT 9.2和PREVIEW-RT 9.0保持原限定范围。剩余行为核对没有发现第三个需修复阻断，不增加整体UI最终通过分。

未关闭的两个问题仍是：

1. AUDIO成功revision进入post队列后切换owner，旧事件在新owner下播放。
2. STATUS精确echo先到而ACK/readback未结束时，服务端sent与本地sending两条同时存在。

父代理后续修复仅在新冻结版本完成针对性复现后才能关闭；本区不根据“正在改”改写旧失败。

### 用户新增表现要求，待新冻结证据

- 在线状态：只在真实当前online状态满足既有身份/会话条件时验证绿点与绿字；重连、未知、离线、关闭/转接的业务优先级继续保留。新颜色尚未审查。
- 长气泡：后续核对实际叠层/磨砂与像素表现。旧源码单一background-color不充分证明整条长气泡视觉均匀，不能凭CSS没有linear-gradient排除用户观察到的分色。
- 滑入动效：新增实景反馈为动效消失，后续应验证实际实时新增消息的入场触发与动画事件，并保留初始/历史/返回/reduced不误播边界。原keyframes/class存在及旧R8分数都不能代替新版本实景；本轮不对恢复结果预签。

旧报告全部保留。R14当前代码行为检查在此收尾，新绿色/长泡叠层/入场恢复以及两个P2修复待新冻结后增量复核。


## R15b入场独立预审及R14两个P2的最小复现

R15b冻结：`abdca3ab1e0906347bc51739b34d2a399b129570`。本区只写本报告，没有修改实现、提交、浏览器操作、构建或重跑114/115项。独立执行实际useConversationEntrance、Vue watch/ref及虚拟时钟；DOM key唯一性指实际messageKey结果集合，不冒称新浏览器运行已完成。

### R15b新入场逻辑：8.7 / 10，未通过

正常快速ACK与store-before-outbox两阶段迁移可工作；但新incoming被漏掉，构成ENTRANCE-R15-P2-01。

最小消息序列（H原历史、P localSend=true、C新canonical、I新左侧agent）：

1. 活跃ready/visible会话由[H]追加P，P有右侧入场。
2. t=12ms发布[H,C,I,P]；唯一新右侧C被acknowledgedTails记住，P仍存在。
3. t=13ms移除P，剩[H,C,I]。
4. C继承P的key和剩余active，key无重复；I在两个阶段均无左侧入场class、onIncoming累计0。
5. 单阶段[H,I,C]同样漏I；[H,C,I]则正常左侧入场并onIncoming=1。

根因：watch在找到旧尾部P或继承后的C后，从tail+1扫描；新I若在该锚点前被视为未处理，最后却已加入seen，下一次也不会补播。真实parent把本地P始终追加在服务端消息列表之后，因此store先发C/I再由page移除P的排序是实际可产生的输入，不能只测试canonical在前且所有incoming都在新锚点后的一种排列。

建议：把“ACK映射/视觉key和active迁移”与“整个合法新尾部窗口中的新incoming识别”分开。唯一replacement只能免于重开自身动画，不能让同窗口其他unseen left消息被跳过。保留identity、visible、ready与历史门，接收回调每批至多一次；不要为补I把历史前插或receipt更新也播出来。

### 已独立通过的key/期限边界

- 简单两阶段[H,P]→[H,C,P]→[H,C]：共存key为[H,C,P]、退役后[H,P]，每阶段唯一，没有canonical与pending同时使用同key。
- active从P迁到C，expiresAt沿用原值。独立虚拟时间t199ms仍有fallback active，t201ms清除；这对应180ms CSS加20ms防丢animationend保护，不是重新启动一个180ms周期。
- 超过原期限才替换，不重新入场；同ID failed/sending重试不重播。
- 多个新右侧候选不擅自合并，切account/composer清alias和active，ready/history循环及hide/return不重播。原WIP也执行过这些边界；新冻结重测了歧义候选、账号reset及历史ready循环。
- thread行key已改messageKey(m)，helper与调用绑定源码已核对。新运行尚未提供，本轮不声称mounted DOM真的完成180ms视觉接续。

冻结实际函数结果：

```json
[
  {
    "mode": "two-stage-simple",
    "phase1": {
      "keys": [
        "h",
        "canonical",
        "pending"
      ],
      "unique": true,
      "classes": {
        "h": null,
        "canonical": null,
        "pending": "nx-conv-enter-right"
      },
      "received": 0
    },
    "final": {
      "keys": [
        "h",
        "pending"
      ],
      "unique": true,
      "classes": {
        "h": null,
        "canonical": "nx-conv-enter-right"
      },
      "received": 0
    },
    "activeAt199": true,
    "activeAt201": false
  },
  {
    "mode": "two-stage-incoming",
    "phase1": {
      "keys": [
        "h",
        "canonical",
        "incoming",
        "pending"
      ],
      "unique": true,
      "classes": {
        "h": null,
        "canonical": null,
        "incoming": null,
        "pending": "nx-conv-enter-right"
      },
      "received": 0
    },
    "final": {
      "keys": [
        "h",
        "pending",
        "incoming"
      ],
      "unique": true,
      "classes": {
        "h": null,
        "canonical": "nx-conv-enter-right",
        "incoming": null
      },
      "received": 0
    },
    "activeAt199": true,
    "activeAt201": false
  },
  {
    "mode": "canonical-first",
    "final": {
      "keys": [
        "h",
        "pending",
        "incoming"
      ],
      "unique": true,
      "classes": {
        "h": null,
        "canonical": "nx-conv-enter-right",
        "incoming": "nx-conv-enter-left"
      },
      "received": 1
    }
  },
  {
    "mode": "incoming-first",
    "final": {
      "keys": [
        "h",
        "incoming",
        "pending"
      ],
      "unique": true,
      "classes": {
        "h": null,
        "incoming": null,
        "canonical": "nx-conv-enter-right"
      },
      "received": 0
    }
  },
  {
    "mode": "ambiguous-two-candidates",
    "keys": [
      "h",
      "a",
      "b"
    ],
    "classes": {
      "h": null,
      "a": null,
      "b": null
    }
  },
  {
    "mode": "account-reset",
    "keys": [
      "h",
      "a",
      "b"
    ],
    "classes": {
      "h": null,
      "a": null,
      "b": null
    },
    "received": 0
  },
  {
    "mode": "history-no-replay",
    "classes": {
      "older": null,
      "h": null,
      "a": null,
      "b": null
    },
    "received": 0
  }
]
```

先审WIP helper SHA-256 `1f9ec752808140fb4a00676a922daf3dd3f5ed2c61141b619a300d1488dd0770`，已发现incoming-first漏播；后收到新冻结，重新读取并复现，helper SHA-256 `dd8b9b7a6cb35f183c9637f95e091bf18f7f030456c20545a7be3c670eb60afa`。旧WIP结论保留，新acknowledgedTails修复了简单两阶段的接续，但没有关闭incoming漏播。用户说明首轮fast-ack-entrance及r15-entrance-before.json为失败证据，本区未把它们作为关闭依据。

chat在线点/字的绿色条件源码已核对：human非muted dot使用presence green，online文字class取当前online状态，light另有深绿色token；没有改header状态优先级。未作最终颜色对比度、长气泡整层视觉或新浏览器动画签核。

### 供R16修复的旧AUDIO最小用例

原冻结fd28d620；位置为conversation-thread.vue的sendSuccessRevision post watch（R14:264—266），不是按钮settled回调。

可直接加入现有conversation-thread.behavior.test.ts夹具的最小断言（sound是观察mock，不是真实播放）：

```ts
const h = mount();
h.props.sendSuccessRevision++; // A的权威成功先进入post队列
h.app.accountKey = 'user:other';
h.app.accountBindingEpoch++;
h.props.composerKey = 'conversation:other';
await flush();
expect(h.sound.play).not.toHaveBeenCalled();
```

R14实际结果：1次send调用；期望0。实际audio controller替身voice的独立复现同样记录owner=user:B。测试刻意在任何nextTick之前完成owner转换，否则会错过窗口；只测试“切换后旧网络结果才回来”不足。

修复需要成功事件携带/保留原owner、binding及请求/目标会话身份，在post播放前再次验证；父级成功时检查和同步sounds.stop都不能独自关闭此窗口。首次创建从start:type切到最终cid属于合法请求转换，必须单列，不应重新用按钮视觉epoch吞掉合法成功音。

### 供R16修复的旧STATUS最小用例

原冻结fd28d620；位置为chat.vue的threadMessages pending构造与最后messages.push(pending)（R14:1004—1035）。

1. 打开已存在的人类会话C，控制reply promise不完成；发送X，记录该真实请求的原clientMessageId/idempotency key K。本地P已创建、humanSendBusy=true。
2. ACK仍挂起，通过真实store读取/WS回显发布会话C的canonical user消息S，clientMessageId=K，status=sent/read，text=X。
3. 保持busy=true读page.threadMessages.value：当前同时有S(sent)与P(sending)，两行；期望只有一条逻辑消息。
4. 再完成ACK，busy=false后才剩S。第13秒收到精确echo、随后readback尚未结束也覆盖此窗口。

用于投影的最小状态：

```json
{
  "cid":"C",
  "humanSendBusy":true,
  "localHumanSend":{"id":"P","side":"right","tone":"user","localSend":true,"text":"X","deliveryState":"sending"},
  "canonical":{"id":"S","sender":"user","clientMessageId":"K","text":"X","status":"sent"}
}
```

文本计数只用于测试观察，修复绝不能按X正文匹配。应把P与原K显式关联，精确echo退役/合并P；不同key、会话、agent发送者均不可误吞P。请求singleflight和业务busy仍按原链路处理，不能为了隐藏重复气泡提前伪造请求完成。

### 当前开放集合与后续范围

R12两个漏音P2已关闭，保持历史；R14跨owner声音和canonical+pending重复这两个P2仍未关闭，R15b另有incoming窗口漏动画/接收回调的P2。这三者分开记录，不能用视觉key接续通过替代业务pending合并或声音owner验证。

本区完成R15b源码预审并给出实际失败，暂不签>=9。R16拟新增textarea自适应与2000限制，尚未提供冻结源码，本轮不预判其实现或给分；待新冻结后只做增量复核。所有旧报告保留。


## R16 WIP增量行为检查点：owner关闭、精确key加入缺口与限流迁移

日期：2026-10-27。本区审查APP当前WIP快照，尚未收到本轮最终commit/manifest。先后读取的chat/store/send-limiter SHA一致，新增entrance和24h时间规则单独记录新指纹。只读实现、在内存执行实际函数/响应式定点并追加本文件；没有编辑生产代码、提交、浏览器、构建或全套测试。264与129为用户报告的部分重叠集合，不相加为393。

### 优先结论

| 范围 | 独立判定 |
| --- | --- |
| 旧owner post成功音效race | 原P2已关闭。account/binding/composer/hide前置变化均不播；合法首建最终owner可播。 |
| 普通精确echo去重 | 原最小用例修复通过，busy保持；但singleflight加入者拿不到key，存在新STATUS-R16-P2-01，整个STATUS不能签>=9。 |
| start:type→真实cid限流身份 | SEND-RATE-R16-P2-01已复现：首次快速创建后换空桶，绕过1s间隔及首句预算。 |
| Nova tracking恢复 | SEND-RATE-R16-P2-02已复现：hide/恢复后的tracking绕过共享Retry-After；75s deadline被重建。 |
| ENTRANCE-R15-P2-01 | 新liveWindowStart版本独立三排列复现关闭，保留key唯一、不重复receive和边界不重播。 |
| 24h时间分隔 | 相邻有效消息规则的精确边界定点通过；替代旧5分钟/跨日自动分隔要求，不将旧规则签项直接继承为新要求。 |

textarea自适应与2000长度guard仍由其他worker实现，本区不将读取时的半成品视为完整R16签核；最终统一冻结后另作增量复核。

### 旧owner race关闭依据

执行当前实际post watch、实际Vue调度及原audio控制器，以voice替身观察调用。sendSuccessOwner为精确JSON[account,binding,composer]，播放前同时检查visible和当前owner；父级note在restoreCompletedHumanCreate后捕获最终threadComposerKey，避免合法首建被当成旧composer丢弃。

```json
[
  {
    "kind": "same",
    "plays": 1
  },
  {
    "kind": "account",
    "plays": 0
  },
  {
    "kind": "binding",
    "plays": 0
  },
  {
    "kind": "composer",
    "plays": 0
  },
  {
    "kind": "hidden",
    "plays": 0
  },
  {
    "kind": "first-create",
    "plays": 1
  }
]
```

same=1；账户/binding/composer变化与隐藏均0；first-create最终owner=1。声效仍独立于按钮visual epoch，R12两个漏音修复不回退。本区证明反馈调用，不声称重新实测扬声器或native。

### 普通精确echo已修；STATUS-R16-P2-01：singleflight加入者缺原key

当前store在start/send的action闭包调用onDispatch(key)，本地pending记录clientMessageId。正常路径只用当前c.messages的user精确key去掉pending，不依赖正文，不把busy提前释放：

```json
[
  {
    "localKey": "K",
    "canonicalKey": "K",
    "sender": "user",
    "count": 1,
    "busy": true
  },
  {
    "localKey": "K",
    "canonicalKey": "other",
    "sender": "user",
    "count": 2,
    "busy": true
  },
  {
    "localKey": "K",
    "canonicalKey": "K",
    "sender": "agent",
    "count": 2,
    "busy": true
  },
  {
    "canonicalKey": "K",
    "sender": "user",
    "count": 2,
    "busy": true
  }
]
```

同key user只剩一条且busy=true；不同key、agent和无key均保留pending，这些负例正确。

但command在发现scope.inFlight相同fingerprint后直接return running；第二个调用者的action闭包不执行，因此其onDispatch不收到key。独立执行实际command/sendUser后：

```json
{"case":"same-intent-singleflight-onDispatch","transportCalls":1,"firstKeys":["original-K"],"joiningCallerKeys":[]}
```

最小真实场景：页面A发送原intent仍在等待；导航/新page在1s后恢复并重试同一intent，store共享原promise，新的localHumanSend未拿到K。此时精确echo K到达，新页面busy=true而pending无key，正常“无key不得正文去重”规则会再次显示两行。单测证明“同key直接投影去重”不能代替加入已有inFlight的关联通知。

修复建议：每个合法加入者都应获得原逻辑请求key，即使没有新网络dispatch。可在command检查running的分支前/返回共享promise前向该调用者提供当前slot key，或另设按owner可查询的onKey关联；不能为触发onDispatch而重新派发。沿用原scope/owner/localId守卫，确保迟到key不写到新pending。

最小回归：同intent两个调用者，传输次数仍1、两个合法调用者均收到同K；第二页的pending遇到同会话精确echo仅一行；异owner加入/迟到callback不写当前localSend。

### SEND-RATE-R16-P2-01：首句预算未迁移到实际cid

位置：chat.vue的sendLimiter getter，key为app.accountKey + (cid或start:type)，以及send-limiter.ts registry。以下实际getter/registry结果已复现，后续读取确认文件SHA未改变：

```json
{"case":"start-to-created-conversation-budget","opening":{"ok":true,"retryInSec":0},"replyAt400ms":{"ok":true,"retryInSec":0},"expectedReplyAllowed":false}
```

精确时序：t=0派发首句，使用start:support；创建在t=400ms完成并切cid=created-C；立即尝试回复，因真实cid是空桶而允许。1s最小间隔应按实际派发计：此时需再等600ms。若首句本身耗时超过1秒，则立即回复不一定违规，不能把规则误写为“ACK成功后必须额外等1秒”。

最小修复建议：

- 在切换/暴露最终cid前，迁移原account+start:type桶到account+实际cid，保留原limiter状态：派发timestamps、lastSentAt、blockedUntil。不能新建空桶。
- 正常成功后可移除旧start键，避免未来另一场新会话永久共用旧cid预算；如采用alias，需限定为本次创建身份。
- 恢复已有会话、目标桶已存在时保守合并/保留更严格窗口与server deadline，不能覆盖掉任一方冷却。
- 迁移仍验证本次create的account/binding/request/最终cid，禁止旧创建结果搬动新账户预算。

最小断言：t0首句算一次；t400拒绝；t1000允许；首句和随后4次派发共同占5/15，第6次受限；Retry-After不因迁移缩短；不同owner/真实另一会话仍隔离。

### SEND-RATE-R16-P2-02：tracking跳过registry，返回后绕过Retry-After并延长deadline

位置：drainNovaQueue只在headDelivery==='queued'调用novaDispatchLimiter().tryAcquire；tracking直接claim/dispatch。cancelNovaThinking又清除novaDispatchTimer与novaReplyDeadline，hide/cleanup都会执行。

独立执行当前实际drain函数、实际registry和实际claimRemote，提供与上述取消后的代码状态一致的tracking队列（timer/deadline均undefined）。外部API为可观测挂起promise，未请求真实服务：

```json
{
  "case": "tracking-after-hide-or-remount-state",
  "results": [
    {
      "resumeAt": 1000,
      "dispatchTimes": [
        1000
      ],
      "budgetWouldAllow": false,
      "originalDeadline": 75000,
      "newDeadline": 76000
    },
    {
      "resumeAt": 70000,
      "dispatchTimes": [
        70000
      ],
      "budgetWouldAllow": true,
      "originalDeadline": 75000,
      "newDeadline": 145000
    }
  ]
}
```

- server cooldown到t60000，t1000恢复时，registry明确拒绝，但tracking仍在t1000派发。
- 原turn deadline为t75000；t70000恢复时被重建成t145000。没有显式新发送/用户retry，仅恢复同一tracking，不应成为新75s窗口。

这不是仅仅定时器取max/retryAfter的正常路径问题：留在当前页等待时定时器尊重delay；跨hide/remount把定时器清掉后才暴露该缺口。Nova入口仍隐藏，本区是实际函数状态复现，不冒称用户当前界面可达的真实后端场景。

修复建议：按account+conversation+turn持有tracking的nextAllowedAt与原expiresAt，使hide/remount只取消本页timer、不丢失约束。tracking派发前也检查server deadline；调度不超原75s总截止，截止先到则按原状态语义结束本次等待，而不是提前绕过Retry-After或延长总截止。不要为检查冷却误消费额外发送预算；queued/显式retry的新attempt策略单独定义并测试。

### ENTRANCE-R15-P2-01增量关闭

新helper SHA `50977bf14269725aae45ebd10655d8f42e75491fe99af141f1b3709eb61073fa`。与R15b相比引入liveWindowStart，在同live prefix下扫描整个新增尾窗口，并跳过已识别canonical。实际模块/Vue/虚拟时钟结果：

```json
[
  {
    "mode": "incoming-first",
    "before": {
      "left": "nx-conv-enter-left",
      "receive": 1,
      "keys": [
        "H",
        "I",
        "P"
      ]
    },
    "after": {
      "left": "nx-conv-enter-left",
      "receive": 1,
      "keys": [
        "H",
        "I",
        "P"
      ],
      "right": "nx-conv-enter-right"
    },
    "afterBoundary": {
      "active": 0,
      "receive": 1
    }
  },
  {
    "mode": "canonical-first",
    "before": {
      "left": "nx-conv-enter-left",
      "receive": 1,
      "keys": [
        "H",
        "P",
        "I"
      ]
    },
    "after": {
      "left": "nx-conv-enter-left",
      "receive": 1,
      "keys": [
        "H",
        "P",
        "I"
      ],
      "right": "nx-conv-enter-right"
    },
    "afterBoundary": {
      "active": 0,
      "receive": 1
    }
  },
  {
    "mode": "two-stage",
    "before": {
      "left": "nx-conv-enter-left",
      "receive": 1,
      "keys": [
        "H",
        "C",
        "I",
        "P"
      ]
    },
    "after": {
      "left": "nx-conv-enter-left",
      "receive": 1,
      "keys": [
        "H",
        "P",
        "I"
      ],
      "right": "nx-conv-enter-right"
    },
    "afterBoundary": {
      "active": 0,
      "receive": 1
    }
  }
]
```

[H,I,C]、[H,C,I]、[H,C,I,P]→[H,C,I]三排列均left active、receive恰好1；共存与退役key集合均唯一，canonical保留P的视觉key与右侧active；hide/owner/history后无额外active或receive。原180ms+20ms清理期限的继承逻辑未改，不凭这组代码定点声称已捕获新浏览器180ms动画事件。旧R15b 8.7及失败运行保留为历史，新缺陷按此实际结果关闭。

### 24h规则增量定点

新time helper SHA `22e5a283fe97654be385b0e67facfc11dd50b87d2586791df35fa3a3bd9759ba`。新阈值86400000ms，按相邻有效消息之差，invalid不虚构分隔、跨午夜本身不插入，首个有效消息定位：

```json
{
  "gap": 86400000,
  "results": [
    {
      "name": "first-only",
      "dividers": [
        "0"
      ]
    },
    {
      "name": "cross-midnight-2min",
      "dividers": [
        "0"
      ]
    },
    {
      "name": "24h-minus-1ms",
      "dividers": [
        "0"
      ]
    },
    {
      "name": "exact-24h",
      "dividers": [
        "0",
        "1"
      ]
    },
    {
      "name": "adjacent-valid-not-cumulative",
      "dividers": [
        "0"
      ]
    },
    {
      "name": "invalid-between-valid",
      "dividers": [
        "0",
        "2"
      ]
    },
    {
      "name": "invalid-head",
      "dividers": [
        "2"
      ]
    }
  ]
}
```

覆盖24h前1ms/正好24h、午夜2分钟、连续12h+12h不按累计24h分隔、invalid夹在两个有效消息之间、invalid开头。该测试只比较分隔出现在哪些消息，不将当前设备Intl输出、三语视觉、DST/真机全部宣称重跑。原逐条精确HH:mm逻辑保留；2000/textarea尚不在此结论中。

### 实际源码适用范围

第一轮WIP快照与增量轮的chat/store/send-limiter摘要相同，故优先项复现仍适用于第二轮读取；本轮仍无最终commit，未来冻结需核对差异。

| 文件 | 本轮采用SHA-256 |
| --- | --- |
| src/pages/support/chat.vue | dccfcd661e793f75a6436b21a4dbb0cadacdaa9fce9e9c9744d7c4b32d72d8af |
| src/components/support/conversation-thread.vue | 7fe10df750854a655651ec7f500d85a4783560ef0c1c4b26f9681f41d54791f7 |
| src/components/support/thread-types.ts | 44d88cab307d7c3d882556be924e31a371566c4644123feb730cc5e65161f019 |
| src/store/conversations.ts | 812da63f908e5feee78dfb0a9a49bd1087e24f1f291b646141a60460ae3977fe |
| src/lib/send-limiter.ts | fe9975b4a639600c75ca6c2b290f9be2b321013861f5828eb3924600fb31ce18 |
| src/components/support/conversation-entrance.ts | 50977bf14269725aae45ebd10655d8f42e75491fe99af141f1b3709eb61073fa |
| src/components/support/conversation-time.ts | 22e5a283fe97654be385b0e67facfc11dd50b87d2586791df35fa3a3bd9759ba |

本轮只读代码与内存实际函数执行；没有将本地模拟等同TEST真实后端，未验H5最终镜像、native声音/键盘/多行textarea或新截图。当前优先结果已经明确：旧owner race关闭，普通精确echo用例修复；singleflight key加入、首建预算迁移及tracking恢复三处需修，新增incoming漏播关闭、24h核心边界通过。最终R16统一分数仍待修复与冻结，不以用户报告的重叠绿测抵消实测失败。


## R16快速ACK实景补证：仅采用bubble标签

本次只读runtime-r16.json的指定动画证据，没有操作浏览器、执行测试或改生产CSS；只追加本报告。读取快照共5条，SHA-256 `fce21af65ee8a9911552ee40602c83407f448836af55c72266ac13e79a8e5e3a`，不将累加文件条数称为最终冻结总数。

有效标签为`fast-ack-bubble-entrance`（2026-10-26T16:16:19.983Z），共110帧，same全部true。实际读回：

- t161：pending-human:1:2，opacity=0，nx-conv-enter-right，duration=0.18s，timing=linear，初始translateX约12px/scale .98。
- t171：同一DOM节点变为canonical id 29，same=true，原动画class/名称仍在。
- t341：opacity约0.962817；t353达到1，transform回单位矩阵。
- t366：class与animation移除，opacity仍1。

此记录直接支持快速ACK不再在12ms时截断该气泡，结合前一节独立key/同批incoming三排列检查，关闭该窄范围的脚本与实际运行证据缺口。RAF帧间隔不能当成精确动画耗时测量，0.18s来自实际computed duration；未外推为所有输入路径/所有平台矩阵通过。

`fast-ack-entrance`实际采样的是外层nx-conv-msg-row（id为空、animation:none），排除验收；R15首轮失败证据及旧标签保持原样，不改标为成功。

用户报告264测试及129 echo集合通过，部分重叠，不相加；本轮未重跑。busy=true普通精确key去重先前已独立验证，错key/agent不吞pending也已验证；这些不能替代尚未关闭的singleflight加入者缺key、start预算→cid迁移以及tracking恢复三个边界。优先问题原结论保持，等待针对性修复。

用户要求移除绿色输入框focus outline记录为后续源码冻结范围，本条运行证据不承担该CSS变更或新textarea的最终签核。旧报告、低分、来源指纹与所有失败证据完整保留。


## R16 1fc11b1b三P2关闭与R17悬浮测量增量审查

日期：2026-10-27。APP源冻结`1fc11b1b410316f6f7bd2f6fa62a04775eded3b9`。随后按用户要求读取R17仅chat/thread悬浮布局WIP，指纹单列；本区不把R17编辑混入R16 commit，不宣称R17已经最终冻结。所有旧报告、低分及失败记录保留。只读实现并在内存执行实际函数/SFC定点，唯一写入仍是本报告；未改源码、提交、浏览器或构建。

### 当前独立行为分

| 审查范围 | 行为分 / 10 | 结论 |
| --- | ---: | --- |
| singleflight onKey / STATUS关联 | 9.1 | 原STATUS-R16-P2-01关闭：reply/create与slot已退役但promise仍在的加入者都获原key，网络派发保持一次。 |
| start:type→cid预算迁移 | 9.2 | 原SEND-RATE-R16-P2-01关闭：1s间隔、首句计入5/15、已有目标合并及迟到defer均保留。 |
| Nova tracking冷却/75s | 9.2 | 原SEND-RATE-R16-P2-02关闭：恢复沿用原deadline，peek尊重冷却，到期不派发，人工retry才清原deadline。 |
| 浮层头部/底部测量 | 8.6 | 未通过：原生异步测量乱序可让旧小高度覆盖最新高度。R16底部及R17顶部均有实际函数复现。 |
| 历史阅读/尾部跟随 | 8.6 | 未通过：离开尾部后迟到测量、新incoming仍强制到底。R17相关函数未修改，原失败继续适用。 |

上述是本轮交互/数据语义分，不能视为悬浮玻璃、去头像、安全区、键盘或截图视觉最终签核。旧AUDIO owner修复、24h分隔及R15 incoming漏播关闭结论保持适用范围，不重新执行原整套矩阵。

### 三个剩余P2：独立关闭依据

**1. onKey覆盖合法singleflight加入者**

冻结command在合法scope/expectedAccount/createPolicy检查后，从WeakMap查询原promise的key通知加入者；slot可能已经由精确echo退役时，仍能从原inFlight promise取得key。start/send把回调传给command，而不是仅绑action。实际冻结command/startConversation/sendUser执行：

```json
[{"kind":"reply","transportCalls":1,"first":["K"],"join":["K"]},{"kind":"create","transportCalls":1,"first":["K"],"join":["K"]},{"kind":"retired-key-join","transportCalls":1,"first":["K"],"join":["K"]}]
```

reply、create、retired-key-join均transportCalls=1、first=["K"]、join=["K"]。不为通知key制造新请求，延续原owner/localId回调守卫。本轮未重新跑全部旧timeout集合，实际delta足以关闭本P2；普通精确echo/错key/agent负例沿用前文定点。

**2. transfer迁移/合并保持预算**

冻结chat在创建current guard通过后、humanCreateRecovery.complete/切cid前调用transfer。实际registry迁移与合并：

```json
{"case":"transfer","gapAt400":{"ok":false,"retryInSec":1},"at1000":{"ok":true,"retryInSec":0},"sixthAt5000":{"ok":false,"retryInSec":10},"lateSourceDeferRemainingAt2000":49000,"newStartSeparate":true,"accountSeparate":true}
```

t0首句后转cid，t400拒绝、t1000允许；首句与随后四次共同占5/15，t5000第六次等待10秒。已有source/target预算合并保守；保留的旧source引用后续defer也forward到新state，t2000仍需49秒。旧start键退役，新start与其他account保持隔离。计时基准是实际派发，不是ACK完成时刻。

**3. Nova恢复保留store绝对截止**

replyDeadlineAt保存在消息turn上；interrupt/hide不清，claimRemote只在未设置时接收首次deadline；complete清理，显式retryRemote才为新attempt清空。冻结drain对queued用tryAcquire、tracking用peek，并将等待timer封顶到原剩余期限。实际函数/registry/claim/interrupt/retry执行：

```json
[
  {
    "now": 1000,
    "cooldown": 30000,
    "dispatches": [],
    "retainedDeadline": 75000,
    "remaining": [],
    "timerAt": [
      30000
    ],
    "delivery": "tracking"
  },
  {
    "now": 70000,
    "cooldown": 30000,
    "dispatches": [
      70000
    ],
    "retainedDeadline": 75000,
    "remaining": [
      5000
    ],
    "timerAt": [],
    "delivery": "processing"
  },
  {
    "now": 70000,
    "cooldown": 120000,
    "dispatches": [],
    "retainedDeadline": 75000,
    "remaining": [],
    "timerAt": [
      75000
    ],
    "delivery": "tracking",
    "atDeadline": {
      "delivery": "failed",
      "dispatches": []
    },
    "afterExplicitRetry": {
      "delivery": "queued",
      "deadline": null
    }
  },
  {
    "now": 75000,
    "cooldown": 30000,
    "dispatches": [],
    "retainedDeadline": 75000,
    "remaining": [],
    "timerAt": [],
    "delivery": "failed"
  }
]
```

t1000仍在30秒冷却，无派发且timer在t30000；t70000恢复仅剩5秒并保留t75000；冷却长到t120000时timer被封顶t75000，到期failed且0次派发，人工retry后queued、deadline清空。没有变成t145000，也没有绕过server defer。该结果来自实际函数配合虚拟时钟/传输，不等于隐藏Nova入口已在真实服务启用。

### 新P2：OVERLAY-MEASURE-01，旧测量覆盖新高度

R16 thread的measureComposer只有owner/visible/有效height门，无测量generation。两次同owner native selector请求反序回调，220先到、86后到：

```json
{"case":"composer-out-of-order-native-measure","afterLatest":220,"afterOld":86,"expectedFinal":220}
```

最终composerSpace变86，低估实际220，absolute浮层可能遮住最后消息。R17 thread测量函数与R16逐字相同，失败仍适用。

R17新增measureTopOverlay同样缺测量代次。实际函数/Vue nextTick及原生bridge替身中，新头部/notice stack=180先返回，旧74后返回：

```json
{"case":"R17-top-overlay-native-measure","afterNew":180,"afterOld":74,"expected":180,"afterDispose":74,"disposedIgnored":true}
```

topOverlayHeight被旧值覆盖回74。chatDisposed=true后回调可正确忽略，这个dispose正例单独保留，不能据此关闭乱序。header只靠chatDisposed，未将hide/当前owner/本次host及测量代次作为统一失效条件；本轮实际复现的是乱序，不把未执行的其余race写成已复现。

修复建议：头/底各自增加测量generation，下一次测量、host更换、hide、dispose时失效旧代次，回调核对generation、当前host/owner、visible及disposed；无效/旧结果保留最新有效值或明确fallback。同scope的先发旧查询也必须失效，不能仅增加账户比较。补反序高度、hide→return、dispose、notice/多行快速切换回归。

### 新P2：OVERLAY-TAIL-01，阅读历史时被拉回底部

R16实际冻结SFC独立复现：

```json
{"case":"user-leaves-tail-during-measure","beforeCallback":100,"afterCallback":2000,"expected":100}
{"case":"new-incoming-while-reading-history","before":100,"after":2000,"expected":100}
```

- 开始在尾部调用measureComposer，native callback尚未到；用户scroll到历史100后，旧callback仍按捕获的follow=true调用scrollToEnd。
- 用户已经在历史100，新incoming更新messages，watch对append无条件scrollToEnd，同样回底部。

测试host的scrollHeight=2000、clientHeight=500；记录2000是实际函数对滚动目标的赋值，真实DOM会clamp至底部，不冒称浏览器实测scrollTop恰为2000。

R17 measureComposer、scrollToEnd、message-scroll-watch与R16源码比对均相同：

```json
[{"name":"measureComposer","same":true},{"name":"scrollToEnd","same":true},{"name":"message-scroll-watch","same":true}]
```

修复建议：应用测量结果/执行每次延迟scroll前，重新检查当前tail状态或用户滚动代次；append和typing也遵守“仅仍在尾部才跟随”。保留初次打开/明确切会话的定位以及原历史前插prefix补偿，避免把用户手动阅读历史视为强制到底的许可。仅在测量发起时捕获atTail不足，90ms延迟重试同样须失效检查。

### R17头/底布局与安全视口：已读范围

- top wrapper绝对定位，包含head与现有错误/历史/安全提示等children，其完整实测height作为topInset留位。header human头像在新模板移除，保留返回、身份文本、对称spacer及隐藏Nova原门。
- footer绝对定位，以content paddingBottom留位；未测时加env safe area，实测height包含底部padding后不再额外加env，源码没有直接双计safe area。
- shared LiquidGlass与局部blur保留，透明overlay容器与controls的pointer-events边界已读；不以源码声明代替实际叠层/遮挡检查。
- measureTopOverlay已复用既有onShow入口，没有再增加第二个覆盖测试harness的注册。onUnmount disconnect observer，cleanup设置disposed；真实Vue可注册多个生命周期，旧测试harness只存最后一个hook造成的89失败不当生产bug。
- 本轮没有实测系统键盘、visual viewport/旋转、真机顶部status bar、safe area、单行/六行最终gap，未给这些视觉/原生范围通过分。用户报告的局部gap与玻璃观感等待最终runtime/截图绑定。
- 旧历史前插prepare/prefix算法保留，但不能用其原正常路径证据关闭上述新tail race。

### 实际日志、源码与版本边界

已找到并读取：`D:/WORKS/PLAN/.wt/uvel-design-preview/queue-r16-final-regression.log`，5文件287/287，SHA-256 `fa768b6049353bb38cdd3e4038a44a582b0809f4d0b73a541d1fe88fd050dcb1`。本轮实际文件位置在preview根，不将其写成已在APP checks找到；没有重新运行这套。

已读`queue-r17-targeted-fix.log`，3文件220/220，SHA-256 `4456106bdb70aacb82af7aac3c2ca296ddf6aa1a2580aab7990d719650ce2475`。其中有fixture setup的onMounted无active instance warning，输出仍是测试通过；它既不单独证明生产错误，也不证明实际mounted measurement lifecycle已被完整覆盖。没有把220与287相加。

| R16冻结源码 | Git内容SHA-256 |
| --- | --- |
| src/pages/support/chat.vue | f120004b166cf35a42bce035df0ce22ab393611c346f15245ae185d6e70f0144 |
| src/components/support/conversation-thread.vue | 33cbfcd83b3513655ead5a31b77c997de76103c26f009eafdd952bbeaea60ce4 |
| src/lib/send-limiter.ts | 92c17e5679694b862abb54c857c967ab2e9ce5d07b423e9b779075a0748216f1 |
| src/store/nova.ts | 141b772b191fdf5654f1b2f43c46984e061086f2e3181618a992f46f46884abf |
| src/store/conversations.ts | 36d1f15f0995caeb7f90723f25337438549cabb051fe4299edd487c5e76c662d |
| src/lib/message-length-policy.ts | 7555eae63a0b4589ccaf2392d932814fedf24bc2abdaa1149bf35dba47a5d0e7 |

| R17本轮WIP源码 | 文件字节SHA-256 |
| --- | --- |
| src/pages/support/chat.vue | 320ee820292eacdd870d46c78514a98cef90893ffa586c5645d305cf2c7685d9 |
| src/components/support/conversation-thread.vue | 6f577cfa99d65f21603cdf0f256baaa3833c963908399e52ea3fef7a01c929bf |

R17没有最终commit，后续修改需按新指纹增量复核。三个原P2关闭与两个新overlay P2分别记账；本轮不签整体>=9，不把本地函数/bridge替身等同TEST真实服务或新装原生App。所有历史评分与失败证据保留。


## 重启暂停检查点：R16已闭环、R18修复尚未独立复核

用户明确要求为PC重启暂停审查。当前停止所有审查执行；本次仅追加检查点，没有新增源码读取、测试、浏览器、构建、实现修改、同步或Git写操作。现有报告、旧低分和所有失败证据完整保留。

### 最后完成的独立审查版本

- R16 APP冻结：`1fc11b1b410316f6f7bd2f6fa62a04775eded3b9`。
- 后续R17仅审过WIP快照：chat.vue SHA-256 `320ee820292eacdd870d46c78514a98cef90893ffa586c5645d305cf2c7685d9`；conversation-thread.vue SHA-256 `6f577cfa99d65f21603cdf0f256baaa3833c963908399e52ea3fef7a01c929bf`。
- R18由父代理报告已修复，但没有最终冻结引用/独立重测结果。本检查点不把R18的“已实现”改写成“已验证关闭”。

### 最新评分，逐项不平均

| 最近审查范围 | 最后独立行为分 / 10 | 状态 |
| --- | ---: | --- |
| singleflight onKey / STATUS关联 | 9.1 | R16冻结原P2关闭 |
| start:type→cid预算迁移 | 9.2 | R16冻结原P2关闭 |
| Nova tracking冷却/75s截止 | 9.2 | R16冻结原P2关闭 |
| 头部/底部浮层测量 | 8.6 | R16/R17失败保留，R18已报修但待独立复核 |
| 历史阅读/尾部跟随 | 8.6 | R16/R17失败保留，R18已报修但待独立复核 |

这些是最近增量范围的行为分，不是APP全站/最新所有UI的视觉分。原十二项及之后各项历史分仍见前文；规则已被后续用户要求改变的旧评分不自动升级为新版本通过。当前不签整体>=9。

### 已独立关闭的P2清单

1. R6旧历史prefix未知/超时仍前插：失败不请求、有效0/42及原finally边界独立关闭，保留原范围。
2. R6旧附件策略迟到true覆盖新false/失败及旧picker结果：generation/owner/session/visible与销毁边界独立关闭。
3. R7新到达消息被分钟clock短暂误判future：真实SFC时钟刷新回归关闭。
4. R8 SEND reduced按住选择器优先级：双端active=true/reduced=true无transform/animation证据关闭，保留该版本范围。
5. R12 AUDIO连续同owner成功被按钮visual epoch吞音：R14独立复现关闭。
6. R12 AUDIO human/Nova失败后重试成功无反馈：R14实际函数复现关闭。
7. R14 AUDIO成功已入post队列后跨owner播放：R16精确sendSuccessOwner与post当前owner/visible比对独立关闭，合法首建可播。
8. R14普通精确echo与本地pending重复：R16原最小用例关闭；无key/错key/agent不按正文合并。
9. R15b ENTRANCE同批incoming在canonical前/共存窗口漏动画和receive：R16三排列独立关闭，正确bubble运行标签另有0.18s linear/same DOM补证。
10. STATUS-R16-P2-01：singleflight加入者缺key，R16 1fc11b1b关闭；reply/create/slot已退役但原promise仍在均收到原K，transport仍1次。
11. SEND-RATE-R16-P2-01：start预算未迁移，R16 1fc11b1b关闭；t400拒绝、t1000允许、首句计入5/15、合并及迟到defer保留。
12. SEND-RATE-R16-P2-02：tracking恢复绕过Retry-After/重建75s，R16 1fc11b1b关闭；冷却和store绝对deadline保留，到期0派发，人工retry才清deadline。

此清单汇总已在前文保存的独立依据，不表示本次重新执行这些检查。更早R2/R3的身份/历史锚点等结论继续保留前文，不因本次暂停重写。

### 仍未独立关闭：恰为两个overlay P2

- **OVERLAY-MEASURE-01**：R16底部最新220px被旧86px覆盖；R17顶部最新180px被旧74px覆盖。父代理报告R18已加composerMeasureEpoch/topMeasureEpoch、owner/visible/composerVisible及hide/dispose失效，但独立复现尚未执行。
- **OVERLAY-TAIL-01**：阅读历史时迟到measure callback或新incoming仍强制拉底。父代理报告R18已让measure与延迟apply重查followingTail、被动append/typing受门控、主动onSend恢复跟随；独立复现尚未执行。

当前“未关闭”指审查状态；不声称R18仍有同一缺陷，也不在没有复现的情况下把8.6提高到9。

### R18未验证WIP与恢复后最小范围

- worker Averroes正在补真实native bridge反序、hide、历史及主动发送测试；尚未独立读取/验证其最终输出。
- 动态rim：最近的重叠气泡、72px内渐隐、映射其视口颜色、范围外为零。conversation-bubble-layout.ts helper与thread测量由父代理实施；尚未独立读取当前新代码、检查迟到测量ownership或给分。
- 最新悬浮LiquidGlass头/底、去human头像、局部blur/透明背景、安全视口以及新截图：尚未最终签核。之前局部代码/测量观察不替代新冻结实景。
- 用户明确要求APP全部完成前不做H5同步；H5保持R17阶段。没有远程推送，本reviewer不实施同步或提交。
- 真实服务、真机新安装、原生声音/静音/键盘与完整安全视口范围仍未覆盖。已有WebAudio节点/本地函数和RAF证据保持各自版本标签。
- 暂停解除后先取得R18最终commit/源码指纹和worker证据，仅重测上述两个P2及动态rim增量；不重跑已关闭旧矩阵。未经用户恢复，不继续执行。

检查点已写入，审查暂停，等待用户重启后恢复。


## R18恢复后限定独立审查：原overlay关闭、同批历史补偿与reflection新P2

日期：2026-10-27。用户恢复审查后，本区仅审R18历史滚动、异步测量、Observer重绑、topInset补偿及composerReflection/voucher交互增量。读取时HEAD为`226249e2fc64e89c32ee54b520a304e0127ee383`，目标实现另有WIP，故以本区文件指纹固定范围，不声称HEAD即包含所有已审内容。只追加此报告，没有改生产代码、提交、推送、浏览器、构建或全面测试。

### R18当前限定行为分

| 范围 | 分数 / 10 | 结论 |
| --- | ---: | --- |
| 原OVERLAY-MEASURE-01：异步测量/生命周期 | 9.1 | 原P2关闭，反序、hide/return、dispose旧回调均失效，头/底分别复现。 |
| 原OVERLAY-TAIL-01：被动尾部跟随 | 9.1 | 原P2关闭，迟到测量、incoming/typing不拉离尾用户到底；主动发送可恢复跟随，90ms旧apply受门控。 |
| composer Observer重绑 | 9.1 | 原host断开、新host重绑，后续resize和dispose断开均通过。 |
| topInset与历史前插同批补偿 | 8.6 | 新HISTORY-R18-P2-01，两个watch互相取消补偿，未通过。 |
| composerReflection状态归属 | 8.8 | 几何纯函数通过，但新REFLECTION-R18-P2-01：旧owner测量在post失效前可写入，未通过。 |
| voucher/trial交互增量 | 9.1 | 本次script/handler未改，模板包装与CSS未引入新业务/点击流程阻断；视觉另验。 |

分数不平均。本轮不能签整体>=9，两个新P2需修。旧报告低分、失败运行及已关闭P2全部保留；不因原P2关闭就覆盖新边界。视觉交父代理，本表不包含新截图、色彩/阴影/磨砂观感或真机键盘/安全视口通过分。

### 原两个overlay P2独立关闭

实际编译读取快照的ConversationThread SFC，使用真实Vue ref/watch/nextTick，替代平台原生选择器、Observer和滚动host观察状态；未操作浏览器。结果：

```json
[
  {
    "case": "reverse-hide-return-dispose",
    "reverse": 220,
    "afterReturn": 220,
    "afterDispose": 220
  },
  {
    "case": "tail-intent",
    "afterLate": 100,
    "afterPassive": 100,
    "afterOwn": 2000,
    "afterUserUpBefore90": 100
  },
  {
    "case": "observer-rebind",
    "firstDisconnected": 1,
    "firstTargets": 1,
    "secondTargets": 1,
    "afterResize": 220,
    "secondDisconnected": 1
  }
]
{"case":"header-measure-reverse-hide-dispose","afterReverse":180,"final":180}
```

- 底部新220先到、旧86后到，仍220；hide→return及scope dispose后迟到999/555都不覆盖。
- 顶部新180先到、旧74后到，仍180；hide/return与dispose后保持180。
- 离尾100时迟到测量、incoming、typing后仍100；主动onSend后追加自己的消息恢复跟随；用户再滚离尾，90ms重试不抢回。
- 原Observer仅观察一次并在host替换时断开；新host变化到220触发新测量；dispose断开新Observer。实际是响应式host ref重绑，不是再次手工调用旧observer即声称新节点被观察。
- 虚拟滚动host记录scrollHeight=2000的赋值，真实DOM会clamp到底；不将这个测试赋值写成真机实际scrollTop读回。

### HISTORY-R18-P2-01：同一flush中的前插与topInset互相取消

位置：conversation-thread.vue的message-scroll watch、preserveHistoryPosition及topInset watch（当前约495—546）。

已分别用隔离host和纯native绑定路径复现，纯native不依赖DOM几何：

```json
[
  {
    "case": "pure-native-prepend-topInset-same-flush",
    "order": "messages-first",
    "actual": 226,
    "expected": 426
  },
  {
    "case": "pure-native-prepend-topInset-same-flush",
    "order": "inset-first",
    "actual": 320,
    "expected": 426
  }
]
```

最小步骤，可移植到现有nativeMeasurements夹具：

1. 当前消息[old]，topInset=0，native viewport height=400，scrollTop=120、scrollHeight=1000，明确离尾。
2. prepareHistoryPrepend测得旧prefix=0并完成。
3. **不在两次赋值之间await/flush**：追加更早页，messages=[earlier,old]，同时topInset=106。
4. flush后旧气泡的native新prefix返回306（更早内容200+新header106），应得到120+306=426。
5. messages先赋值实际226（只补header）；topInset先赋值实际320（少补header106）。

现有顺序用例“先header改变并flush、再prepend”能通过，但没有覆盖同一Vue flush。实际最终历史页可以同时改变historyNextCursor/historyTruncated并移除/改变顶部notice，因此不是仅无关属性的人工组合。

根因：两条布局操作共享cancelScroll/ticket。topInset分支可能取消已排队的prepend补偿；反过来prepend取消header补偿，但preparedHistory.prefix却已加delta，导致部分位移被当成已执行。用户原有历史锚点因此发生实质跳位。

修复建议：将同批header变化与prepend归入同一锚点/布局事务，捕获旧anchor位置，DOM/bridge更新后一次性按新旧prefix总差补偿；不要让两个cancelScroll互相丢掉尚未应用的delta。只有header补偿真的提交后才推进其已补状态。至少补两种赋值顺序、header增/减、末页提示消失，以及owner/hide取消的回归，保留原fail-closed预测量。

### REFLECTION-R18-P2-01：旧owner结果在post取消前写入

位置：conversation-thread.vue的measureBubblePositions/apply及flush:post失效watch（当前约617—651）。

apply仅比较bubbleMeasureEpoch、threadVisible及viewport，不检查采集时的account/binding/composer/host。owner变化时composer测量同步失效，但bubble/reflection测量要等props post watcher取消，存在窗口。

最小定点：

1. owner A可见，发起原生bubble/field测量，暂存回调。
2. 同一轮同步修改accountKey、binding、composerKey到B，尚未await nextTick。
3. 立即返回A的旧viewport、bubble及field坐标。
4. 旧结果仍写入composerLight与bubblePositions：

```json
{"case":"reflection-old-owner-before-post-flush","strength":0.947,"positions":{"out":0.99}}
```

这是实际SFC状态调用的旧owner写入，不声称已拍到真实设备上的光晕泄漏。post取消后也没有同步清掉已经写入的旧reflection状态，可能留到下一次有效测量。该问题只涉及本轮装饰/测量归属，本区没有将其夸大为已证明的消息正文泄漏或业务发送错误。

修复建议：测量捕获owner与当前composer/list host身份；apply再次精确比较。owner/host切换同步invalidate并将reflection置off，实际布局测量仍可在post/nextTick进行。补“旧测量→owner切换→post前回调”、host替换及hide/return，不能用纯几何empty=0证明这个异步窗口已关闭。

### composerReflection纯几何与交互正例

直接执行本次helper：

```json
[
  {
    "case": "outside-72",
    "result": {
      "strength": 0,
      "x": 50,
      "width": 60,
      "dark": "transparent",
      "light": "transparent"
    }
  },
  {
    "case": "outside-100",
    "result": {
      "strength": 0,
      "x": 50,
      "width": 60,
      "dark": "transparent",
      "light": "transparent"
    }
  },
  {
    "case": "no-horizontal-overlap",
    "result": {
      "strength": 0,
      "x": 50,
      "width": 60,
      "dark": "transparent",
      "light": "transparent"
    }
  },
  {
    "case": "nearest",
    "result": {
      "strength": 0.966,
      "x": 50,
      "width": 46.666666666666664,
      "dark": "rgba(73, 125, 108, .78)",
      "light": "rgba(28, 78, 221, .66)"
    }
  },
  {
    "case": "different-position-colour",
    "result": {
      "strength": 0.966,
      "x": 50,
      "width": 46.666666666666664,
      "dark": "rgba(130, 152, 65, .78)",
      "light": "rgba(138, 71, 195, .66)"
    }
  },
  {
    "case": "unavailable",
    "result": {
      "strength": 0,
      "x": 50,
      "width": 60,
      "dark": "transparent",
      "light": "transparent"
    }
  }
]
```

72px及更远、无横向重叠、field缺失均强度0；有多个候选时取最近gap；viewport position变化映射不同主题颜色。新反射伪元素pointer-events:none，写入CSS custom properties，无新增表单提交或点击handler。几何正例不能关闭owner race；父代理报告near约.965/.967与empty=0的实景未在本轮独立读取其截图/runtime，不当作本审视觉签核。

### voucher/trial与浅色阴影增量

- voucher-banner新增vb-amount包装及embedded布局CSS；trial-hero仅改长文案/小屏高度和装饰图尺寸。已比较两文件script与HEAD，逐字规范化相同。
- whole-card role=button、tabindex、click/Enter/Space的open仍在，claimable决定打开原sheet，否则原rewards-list路由；金额/百分比/资格来源没有被本次布局改写。
- 装饰art仍pointer-events:none，新增amount包装没有独立动作或阻止事件。未新增交互阻断；小屏长文案遮挡、真实热区和截图观感交视觉/运行验收，不能从script相同推出所有布局均通过。
- tokens.css本轮只将既有外部box-shadow尾项参数化为--ui-control-shadow，并在light的nx-header/spv/message-nav祖先内设0 2px 6px rgba(23,31,45,.12)。既有inset层与默认fallback保留，没有新增pointer-events、尺寸、定位、focus或handler改动，未发现新交互阻断。
- 选择器适用于这些祖先内所有nx-design-glass，不将其描述成只影响三个具体按钮；本轮未全面枚举全站spv后代。底导航/材质的最终视觉保留由父代理证据确认，不宣称全站视觉通过。

### 本轮证据与未验证边界

已读`D:/WORKS/PLAN/.wt/uvel-design-preview/queue-r18-geometry-tests.log`，2文件190/190，SHA-256 `bf579edf833701f80e60df985f8fa184ec9ee2fc7af5ebb70394a92cab46972a`；没有重跑190项。相关测试源码已读，包括分步topInset补偿、Observer重绑及测量失效。日志中的fixture onMounted warning不单独当生产失败，也不当真实mounted生命周期全覆盖。

本轮最后核对核心五个文件摘要与最初读取相同，实际新失败仍适用：

| R18读取快照 | SHA-256 |
| --- | --- |
| src/pages/support/chat.vue | d6270fb5a06b9c941dcc4c82993bc8e2339043ca0ac53cce35dfec48bdb47324 |
| src/components/support/conversation-thread.vue | 2b1d60be9f013ada2a0bc72e231833846dde5339c676145bf194fb943d517c68 |
| src/components/support/conversation-bubble-layout.ts | 4dfa6fc947fd0f369a07d25b6ca2c09ccdf6b306fd4606b2d057612ccb9af1d9 |
| src/components/voucher-banner.vue | bf6d0a2c141147cbd7da3fd2ecc6e5f06d3b0293da01868a54d6a6d1f03ccd9d |
| src/components/trial-hero-banner.vue | 47e5d99919afa1a32354ee3862e8881d5f9497183d30c03ab26a96b94380d0a3 |
| src/styles/tokens.css | b5e40a6ee6e61af5a42ed13f2088756741386c1b7d7c867ebe88d96d2e21bdd6 |

未提供本轮统一最终commit/manifest，未来冻结需核对变更适用性。没有审H5新同步，继续遵守APP完成前不做H5同步的用户要求；未触碰远端。真实服务、新原生安装、键盘/旋转/安全viewport、native音效与最终材质/阴影视觉均未签。

当前审查完成：旧两个overlay P2关闭；新增同批历史补偿与reflection owner各一P2未关闭。只有修复后定点复现通过才能升相应分数，不以190绿或父代理视觉数值抵消这两个实际代码边界。


## 额度暂停检查点：R18两个新P2与preview首建未签

用户报告额度usedPercent=100并明确要求现在暂停。审查停止；本次仅保存既有结论，没有进行新源码/截图/运行检查，没有测试、构建、浏览器、产品修改或Git写操作。既有报告及全部历史分数/失败证据保留。

仍开放：

- HISTORY-R18-P2-01：topInset与历史前插同批更新丢补偿，行为分8.6，未通过。
- REFLECTION-R18-P2-01：旧owner的迟到测量可在post失效前写入reflection状态，行为分8.8，未通过。
- preview首建会话内容归属未签：用户报告start=support首发新建DEMO-SUPPORT-2，state2仅1条新消息，但路由cid2的可见UI显示DEMO-SUPPORT-1的31条历史；截图名app-r18-preview-support-created-visible.png。此为用户报告，本审未独立目检或核验根因。父代理正在定位fixture读取/游标映射，不能先认定根因，也不能把路由cid正确当成消息归属正确。此项未评分、未签通过。

原两个overlay P2的关闭及其9.1限定行为结论保持此前范围；不覆盖上述新失败。最新R18评分与源码指纹见上一节，不因额度暂停调整分数或标记整体完成。

暂停后等待用户明确恢复；如恢复，仅针对修复与首建→读取→显示cid一致性做增量复核，不扩大全面重跑。H5同步/远程推送未在本次执行，产品未修改。


## R18两P2修复独立复审：同批正例通过，历史事务仍有三个边界（2026-10-27）

本节在用户明确恢复后追加。范围仅为当前APP未提交的conversation-thread.vue两项修复、相关父级分页入口及必要独立定点；仅本报告可写。本次没有操作浏览器、修改生产/测试文件、运行构建、提交、推送或同步H5。先前R5低分、R16关闭项、R18原失败及额度暂停检查点全部保留。

### 当前独立分数与关闭状态

| 项目 | 分数 / 10 | 本次结论 |
| --- | ---: | --- |
| HISTORY-R18-P2-01：历史/topInset定位事务 | **8.6** | 原同flush两顺序及高度增/减已修；普通pending期间滚动及多次变更也正确。但真实父级连续分页可清掉未完成的首笔补偿，准备阶段host未隔离，后测失败事务不释放。当前历史范围仍未过9，不签关闭。 |
| REFLECTION-R18-P2-01：测量归属与同步清光 | **9.0** | 原P2关闭。account/binding/composer/reveal、list/composer ref替换、hide/return及composer不可见均同步清光；旧回调不能写入新归属，新测量可恢复。另有销毁后排队任务再启动一次测量的P3清理项，见下，不混称新owner可见污染。 |

这是本审独立执行真实SFC/父函数后的评分，不引用worker的评分，不取平均。原OVERLAY-MEASURE-01、OVERLAY-TAIL-01、composer Observer重绑的9.1只继承原已验证范围；本节发现的历史事务问题是当前新增条件，不能被旧正常路径抵消。STATUS材质、首建内容归属及其余未签增量不会因reflection通过而自动关闭。

### 实际读取与执行方式

- 读取当前thread生产源码及113项behavior测试源，重点核对新增22个边界；读取chat.vue实际loadEarlierHumanHistory/loadEarlierNovaHistory、conversation-scroll.ts、相关几何/入口/时间helper、use-tab-page-lifecycle.ts。
- 用@vue/compiler-sfc和TypeScript在内存编译真实thread setup，执行真实Vue ref/watch/nextTick/effectScope及真实helper；只替代平台选择器/时钟、宿主和外部store。没有复制pendingPosition算法另写一个“测试版”。
- 独立调用真实父级loadEarlierHumanHistory函数体，与上述真实thread的prepareHistoryPrepend连用；替代transport提供两页返回，以检查父级busy何时释放。此为函数/原生bridge控制定点，不是浏览器或真机实际scrollTop。
- 读取既有红绿日志，未重跑22或113全套。红日志准确为**18失败、4通过、91跳过**；绿日志为22通过、91跳过；thread全量日志113通过。因此不把“22个新增用例”误写成“旧版22红”。
- 独立定点结果保存于本节。没有另写测试或日志文件；本节是本轮执行记录。最后复核thread/测试/chat指纹未变。

| 已读日志（D:/WORKS/PLAN/.wt/uvel-design-preview/） | SHA-256 |
| --- | --- |
| queue-r18-p2-red-tests.log | bee64ff3979d8ef1a23b496960c1bf718265b88095008001daa44548baf5e825 |
| queue-r18-p2-green-tests.log | 24ee33c8051a24cbaeaadd1e9324aaec7b472dbc424da790778f1e83264dd847 |
| queue-r18-thread-green-tests.log | a4a741b8d6f6fe85a8c3cffb8a10a9ac432a1a1748f83b89b57dd25ceffd08a9 |

### 已独立通过的历史正例

原两个watch已合并；pendingPosition在后续header/消息更新时保留原top、inset、anchor prefix。以下全部采用真实watch调度：

| 独立定点 | 实际 | 应得 |
| --- | ---: | ---: |
| topInset 0→106，messages先赋值、同flush prepend200 | 426 | 426 |
| topInset 0→106，inset先赋值、同flush prepend200 | 426 | 426 |
| topInset 106→0，两种赋值顺序分别执行 | 各214 | 各214 |
| 首笔前插/106测量pending，用户120→170；再次前插、header80→160同批；旧回调返回；再手动170→150，最后返回总prefix560 | 710 | 710 |

最后一项旧回调返回后仍170，未提前应用306；最终从原120加用户净滚动30、总prefix560得到710，事务释放。说明正常的“scroll while pending”和“多次布局变化”确实通过；以下缺陷来自真实第二次prepare与失败/host边界，不能用这个正例代替。

### HISTORY剩余P2-A：第二次真实prepare丢失首笔pendingPosition

位置：conversation-thread.vue:461—463的prepareHistoryPrepend先cancelScroll；cancelScroll在421清掉pendingPosition。父级chat.vue:1048—1063、1153—1164的busy只覆盖数据请求，不覆盖后测定位。

最小复现：

1. native离尾scrollTop120，旧第一条prefix0，prepare返回true。
2. 第一页前插200，同时topInset0→106；保留其后测回调不返回。首笔应补306。
3. 第一页数据请求已结束，父级busy=false。再次点击“更早消息”，实际父函数允许第二次prepare；该调用直接清掉首笔事务。
4. 第二次预测量读新第一条prefix106，返回true；再前插200。
5. 首笔旧回调返回被忽略，第二笔新prefix306，只应用第二页200。

独立父级+thread执行记录：

~~~json
{
  "case": "actual-human-parent-sequential-pages",
  "firstIdle": true,
  "calls": ["A", "A"],
  "warnings": [],
  "actual": 320,
  "expected": 626
}
~~~

正确原锚点是120+第一页200+header106+第二页200=626，实际320，少306。此处不是并发请求绕过父busy，而是数据加载结束早于原生几何回调的连续分页；不需要两个请求同时在flight。worker现有“再次props前插”用例没有调用第二次真实prepare，因而覆盖不到。

最小修法建议：第二次prepare不要清掉未提交的定位事务。可先安全拒绝/等待当前事务结束再授权下一页，或沿用同一原anchor/prefix合并后续页。若选择拒绝，必须保留原事务且有有界失败恢复，不能先cancel再返回false，也不能永久卡住“更早消息”。补真实父函数的连续调用，并返回首笔/第二笔反序回调。

### HISTORY剩余P2-B：预测量缺少host身份

位置：conversation-thread.vue:463—473。prepare捕获owner/id/inset，却不捕获listHost；preparedHistory也没有host。后测current检查host不能补救已跨host获准的旧prefix。

独立定点：在list A发起预测量，回调pending时将listHost.value替换为B（owner/id不变），立即返回A的prefix42。prepare仍true。B实际旧prefix0，随后前插200，新prefix200；使用A的42得到120+200−42=278，正确应为320。

~~~json
{"case":"history-host-during-preparation-list-ref","allowed":true,"actual":278,"expected":320}
~~~

这证明当前函数对显式ref替换不安全，不声称本轮在真实页面上已观察到替换频率。最小修法是让预测量和preparedHistory持有同一host token，apply前即时比较；host替换同步失效/清掉旧准备，拒绝旧true，允许新host重新测量。不要仅改后测current。

另外，同一个包装ref的$el替换也不被本轮身份比较捕获；未证明当前页面会发生这一宿主内部替换，所以它只保留为适配器边界，不另列一个已证实产品阻断。

### HISTORY剩余P2-C：后测空值/NaN/无返回使事务悬挂

位置：conversation-thread.vue:534—539后测只有成功分支；500ms截止只用于预测量，不用于pendingPosition后测。结果无效时不提交、不释放，也没有后测timeout。后续composer测量/输入高度watch以!pendingPosition门控跟随。

独立纯native定点分别执行空数组、NaN、不回调三种情况；600ms后事务仍在。用户随后明确滚到当前底部scrollTop800/scrollHeight1200/viewport400，再将输入从24增到144，实测composer206；三个分支均保持pending、scrollAnchor为空。相同正例后测成功时，输入增高会正确发出nx-conv-end：

~~~json
{
  "empty_nan_or_no_return": {
    "pendingAfter600": true,
    "pendingAfterGrowth": true,
    "composerSpace": 206,
    "scrollTop": 800,
    "scrollAnchor": ""
  },
  "successful_post_measurement_control": {
    "pending": false,
    "composerSpace": 206,
    "scrollAnchor": "nx-conv-end"
  }
}
~~~

这是实际绑定/跟随状态差异，不声称真机最后一条已被拍到遮挡。由于事务悬挂，它也使P2-A的“有pending就拒绝下一页”最小补丁不能单独交付。

建议为后测设置截止和明确失败/取消路径，失效旧回调并解除悬挂；继续保持未知prefix不猜0。用户滚动回尾后，应允许当前follow intent响应composer增高；历史阅读中则不得因失败强行到底。失败后下一次prepare可重测，旧回调不得释放或覆盖新事务。

### REFLECTION原P2独立关闭；一个非阻断P3

生产apply现在捕获historyOwner、listHost、composerHost；同步watch对owner/host/visible/composerVisible变更增代次并清空light/positions。独立测试从已亮状态出发，另挂一条旧回调，在不await nextTick的窗口改变条件：

| 条件 | 变更当刻及旧回调后 | 新测量 |
| --- | --- | --- |
| account、binding、composerKey、revealTick，逐个执行 | light0、positions空 | light0.966，可恢复 |
| list ref、composer ref替换，分别执行 | light0、positions空 | light0.966，可恢复 |
| hide→return，不等post | light0、positions空 | light0.966，可恢复 |
| composer closed/不可见 | light0、positions空 | 不要求在隐藏composer点亮 |
| 同owner新旧测量反序 | 新0.966保持；旧远距结果不能覆盖 | 已符合最新代次 |
| scope dispose后才返回既有旧回调 | 不能改写已有值 | 不把卸载后残存的dead ref当作用户可见状态 |

因此原“旧owner在post之前写回”及显式host切换窗口关闭。原scope内的普通hide路径没有新增测量，恢复可正常亮。纯几何72px/最近重叠/取色原结论继承，本次不重测或冒称目检新材质。

**P3：销毁前已经排队的nextTick仍可在dispose后重新安排一次测量。** 在同步host失效watch排入nextTick(scheduleBubblePositions)后、nextTick前stop scope，scope清理只取消现有timer；threadVisible仍true。排队的nextTick随后创建16ms timer，调用一次selector并能写dead实例的light0.966。hide再dispose对照不会触发。复现如下：

~~~json
{
  "case": "reflection-dispose-with-nexttick-scheduled",
  "timersAfterStop": [16],
  "requests": [[".nx-conv-list", ".nx-conv-bubble", ".nx-conv-compose-field"]],
  "deadInstanceLightAfterCallback": 0.966
}
~~~

这是一笔无效的卸载后工作，不是旧owner污染新实例的证据，也未观察到循环或网络副作用，因此定为P3、不据此重新打开原可见归属P2。建议加disposed门到schedule/measure/apply，并在dispose同步失效/清光；不只clearTimeout。use-tab-page-lifecycle注入模式的remove会先hide，但没有注入时是page hook fallback，组件级卸载不能由本组件假定一定先收到pageHide。

### IM18剩余最小实景清单（APP先行，非重做18套矩阵）

以下是父线程下一步最小增量，不是本审已执行的浏览器检查。先核对最终源码/产物及已有证据是否适用；可复用的旧图/记录保持原版本，不改标本轮。相同场景合并拍摄，优先浅390与暗320各一条代表链；长文案只在新布局需要时选越南文320，不再要求旧三语×明暗×宽度全矩阵。

| IM项 | 此轮最小动作或继承边界 |
| --- | --- |
| LIGHT-01 | 原结构化活动/主题合同签项继承，无需为本次thread改动重拍活动。完整运营Banner、真实后台仍在原排除范围。 |
| MSG-03 | 原标题同行、1301→1298及R2 44px证据继承，不重跑12格标题矩阵。 |
| CTRL-01 | 原读取retry singleflight/失败恢复与管理页证据继承。若首建修复改了history retry，再只验该入口；当前没有理由全站重跑。 |
| SHADOW-01 | 原领取CTA签项继承；本次thread修复不增加首页领取验收。 |
| SHADOW-02 | 原局部阴影/管理页签项继承。thread新底色层只合并检查下方STATUS的状态焦点与图文/CTA，不重拍旧管理/选择器矩阵。 |
| MSG-01 | 旧回执外置位置已被用户覆盖；不再按旧左右布局验收。权威来源不伪造的结论继承，当前展示只随STATUS一次验。 |
| MSG-02 | R16快ACK同DOM及incoming窗口P2已关，不重复race矩阵。最终历史/overlay链中顺带记录补页和返回不重播；若已有未改逻辑的有效reduced记录则直接继承，无须为布局再重拍完整动画矩阵。 |
| BADGE-01 | 原数量口径、0/1/99和颜色/入口签项继承，不为thread改动再测。 |
| TOP-01 | 原消息列表返回/设置/折叠签项继承；新的会话悬浮头归CHAT-TOP。 |
| TIME-01 | 最小用一个可控时间线展示首条、跨午夜不足24h、相邻23:59:59.999不分隔、恰24h分隔；每条HH:mm保留。合并一页历史移入/移除首分隔与本次锚点测量。新locale长日期只补当前窄屏代表图；旧5min图不能代签，R16纯helper边界不重复全跑。 |
| ATTACH-01 | 灰禁用/零caption及旧权限race签项继承。新气泡绘制层合并看一次图片预览开关或图片/CTA布局；若实现未变且已有适用记录，引用即可。不要求真实上传来签禁用入口。 |
| SEND-01 | 历史三个缺口修完后，一条链完成：离尾加载两页并改变header，等待中手动滚动；回尾后输入1→6行→收起，确认最新gap约8px、离尾不被抢滚。rim从近邻到72px外/空、主题取色和横向位置，沿用现有near/empty只补缺失动态帧。暗320多行和滚动/停止的材质交视觉审查；旧200ms/reduced/真实settled逻辑未改不重跑全套。 |
| CHAT-TOP-01 | 与上述链共用当前长notice/末页notice消失的topInset变化，记录同ID气泡前后y；正常/错误或较长状态的44px返回可达、online绿与offline/reconnecting灰一处切换即可。正常居中旧矩阵不重拍，删除human头像/透明顶层取当前产物代表图。 |
| AUDIO-01 | 旧authority/owner/去重P2已关，不再制造同一批race。首建内容修复后的同一成功链可记录一次首建/重试成功音效与消息身份；失败不能假成功，已有R13/R14节点因果保持原范围。若验收要求听感，需实际听感/音轨，不能仅凭Oscillator/Gain推断；本地节点级结论仍可明确限定，真机声音不强塞入当前原型分。 |
| STATUS-01 | 浅390长气泡+composer重叠已有视觉局部复评；只补当前暗320、多行及滚动/停止代表样本，观察同x色界与圆角/文字，不以computed单色签像素。合并失败/unknown状态真实焦点和一次原消息重试，确认自己的图标+时间在内右下、incoming仅时间、44px触区未裁。已关闭精确echo/onKey不重复全套。 |
| PREVIEW-RT-01 | 首建仍未签：当前start=support→创建→readback→显示的新消息、cid/key必须一致，同ID旧历史不得覆盖首句；按既定跨会话历史合同判断，不为演示擅删历史。用此会话顺带读online→offline/reconnecting→恢复即可；既有协议loopback9.0不重复。裸路由缺参数和DEMO_STATE_FILE重启若仍列交付要求，各留一个恢复/可行动结果，不假称已验。 |
| SEND-TIMEOUT-01 | 15秒/echo/403/null/原key修复限定9.2继承。只补当前图标UI尚缺的一个真实等待未知→同key重试/精确确认链，与STATUS共用；不为布局重跑六个虚拟时钟红测，不把演示接口当TEST。 |
| MESSAGE-LIMITS | 借多行链留2000/2001、粘贴/组合输入后的草稿保留/禁发/明确提示，已有效的2001证据可复用。首建start→cid共享预算9.2继承，不重跑迁移/75s/Retry-After矩阵。专项报告列的Nova更低有效上限及明确拒绝后修正/移除仍是未闭合功能边界，截图不能解决；隐藏Nova/未承诺启用范围须单列，不能宣称已全部完成。 |

额外不属IM第19项的voucher/trial/浅色顶部阴影：保持视觉审查已签的局部范围，本审script/handler9.1原范围继承，无需为这两个thread修复重复点击全套。

### 当前指纹、边界与下一步

| 本次实际读取文件 | SHA-256 |
| --- | --- |
| src/components/support/conversation-thread.vue | ce1d508d494111c2158a4cd1cf09d287c812bf7b59918ad2070a05214542ed65 |
| src/components/support/conversation-thread.behavior.test.ts | 8c80a08ff4382fc0ca88f373f113c908b4553de783081c8e85a600ecd45faab5 |
| src/pages/support/chat.vue | d6270fb5a06b9c941dcc4c82993bc8e2339043ca0ac53cce35dfec48bdb47324 |
| src/components/support/conversation-scroll.ts | 1c22ddf6797e0915341052bc716bbbff92aded0174310f85d40a1cb4faf413d6 |
| src/components/support/conversation-bubble-layout.ts | 4dfa6fc947fd0f369a07d25b6ca2c09ccdf6b306fd4606b2d057612ccb9af1d9 |

当前APP是未提交候选，未来冻结须比对本节指纹。只有本节列出的行为正例与原P2关闭可采用；没有新PNG目检、新浏览器运行、真实后端或原生新安装证据。最小实景表参考了专项报告、恢复交接及视觉报告最新适用范围，未将同行的截图观察冒称本人本轮目检。

首建cid2内容问题此轮未重审，没有签分；本节仅保留专项报告的新旧message.id冲突记录及必要验收条件，不把其根因/修复视为本审已复现。H5保持此前阶段，未同步、未运行；不得将APP候选评分写成双端最终通过。

下一次只需要历史三个缺口的定点修复/关闭及相关最新实景，reflection原P2不再重复全矩阵；P3可随局部清理补一条dispose前nextTick用例。当前不接受历史项≥9，也不宣告IM18整体完成。


## R18 PREVIEW-RT增量：全局消息ID迁移、首建可见与恢复语义独立复审（2026-10-27）

用户在等待Jason历史修复期间授权本次增量。仅审scripts/lib/prototype-demo-support.mjs及新增语义测试、相关预览恢复入口；没有操作浏览器、重启正在使用的preview、请求其运行API、修改实现/测试/state、构建、提交、推送或同步H5。renderer/玻璃mode交其他审查，本节不介入。历史三个P2与reflection 9.0原结论不变。

### 本次独立结论

| 子范围 | 分数 / 10 | 结论 |
| --- | ---: | --- |
| PREVIEW-RT-01：全局消息ID迁移、旧state同内容恢复、首发内容保留 | **9.2** | 本次增量限定通过；不是沿用旧协议9.0。原DEMO2首句因同ID被聚合覆盖的问题，在当前预览迁移路径及CID3样本关闭。 |
| PREVIEW-RT-01：恢复后同key换载荷仍必须拒绝 | **8.8** | 新独立定点未通过，PREVIEW-R18-P2-01。是现有预览命令指纹恢复边界，不是本次全局ID分配回归；完整跨重启幂等不签。 |

分数按子范围记账，不平均。9.2不能覆盖下面8.8，也不将PREVIEW-RT整项、IM18或真实后端宣布最终通过。旧“首建未核验”在本节仅更新为上述已验证路径通过，裸路由缺参数及其他未覆盖入口不随之关闭。

### 合同与源码实际核对

- 已独立读取本地后端scripts/schema.sql:5027—5039，nx_conversation_message.id是BIGINT AUTO_INCREMENT PRIMARY KEY，conversation_id/conversation_no是独立列。全表消息ID符合该本地schema合同，不能从这一文件推断当前线上数据库已核验。
- APP chat.vue:802—807仍将全部human消息按message.id聚合；本次预览脚本没有改正式跨human历史规则。旧state中两个会话都存在id1确会让Map只保留一条，修预览ID分配与此合同一致。
- prepareMessageIds在任何新分配前扫描已保存sequence、全部会话消息、lastPublicMessageId、nextCursor、dismissal边界；按conversation.id升序保留较老会话ID，遇到冲突后将该会话需迁移的后续ID一并递增，避免内部游标逆序。
- 首建、普通回复、incoming agent、history/timeline/receipts替换场景均改用同一nextMessageId。场景替换不回收旧ID；已唯一的稀疏ID保持原值，迁移不改正文、时间、回执、附件信息或clientMessageId。
- lastPublicMessageId、排他的nextCursor、包含端点的throughMessageId分别按原边界映射。不能只证明全局唯一就忽略移除/历史页成员是否仍相同。
- prototype-preview-server.mjs:13只在启动时读取DEMO_STATE_FILE中的state；没有自动写回或保存正在进行的命令。本审没有写入或提交scratch的state，也没有把内存round-trip测试称为本人实际重启该服务器。

### 实际执行与已读证据

本审实际运行node --test scripts/lib/prototype-demo-support.test.mjs，**9/9通过**。包括跨会话首建/回复分配、incoming、三个替换场景、旧碰撞迁移及metadata/游标/移除标记、稀疏ID、UNKNOWN原key恢复。只跑此文件，没有重跑旧socket协议或IM矩阵。

另外直接调用真实supportDemo/createPrototypeMessages做内存定点，未改生产实现：

1. 读取scratch旧resume-demo-state-5237.json的副本：32条消息但只有31个唯一ID；迁移后32条/32唯一，DEMO1的1—31完整保留，DEMO2首句变32。正文、时间、回执、附件、原命令key及会话顺序不变。
2. 重复读取、同key同正文重试不重新编号或追加。独立副本中新建下一会话获得33；导出JSON再恢复并回读仍保留该消息。
3. 当前after-id-fix保存state为3会话/33消息/33唯一ID，sequence33，DEMO3 id33、receiptStatus sent、lastPublicMessageId33、正文与截图相同。对每个会话重复调用真实fixture读回，当前state不变。
4. 独立生成24组合法升序旧ID分布×41个边界，共**984个state案例、2952个会话**，逐项比较迁移前后cursor选中的消息、dismissal包含的消息、全局唯一性、会话内严格递增及重复迁移的业务内容稳定性，均通过。这是984个确定性内存案例，不包装为984条仓库测试。
5. 首轮“整个JSON字节完全不变”探针出现一次失败并中止。定位后确认仅排他游标映射产生的sequence高水位校准：例如迁移后最大消息53、cursor54，下一次扫描将sequence53校准到54；消息及边界都不变。按业务内容稳定且sequence不倒退重新检查，984案例中120个有这种仅sequence变化。它会留下合法ID空隙，没有复用/覆盖消息，故不列数据丢失P2；不声称所有任意旧state在第一次迁移后立刻字节不变。

实际执行摘要：

~~~json
{
  "saved-state": {
    "oldMessageCount": 32,
    "oldUniqueIds": 31,
    "migratedUniqueIds": 32,
    "nextCreatedMessageId": 33,
    "currentMessageCount": 33,
    "currentUniqueIds": 33,
    "currentRepeatedReadsStable": true
  },
  "deterministicBoundaryCases": {
    "states": 984,
    "conversations": 2952,
    "sequenceOnlyAdvances": 120,
    "messageOrderingAndBoundaryMembership": "pass"
  }
}
~~~

已用view_image original实际目检app-r18-resume-created-message-visible.png，PNG390×844。最下方我方气泡清楚显示“R18 恢复检查：新会话首条消息。”及单勾，旧历史仍在。它证明该新句在此截图中可见；截图本身没有可读路由，CID3与id33归属来自已读取的保存state，不从画面臆测路由。父线程报告真实刷新再进入及服务器重启保持内容；本审没有重复浏览器动作，独立补证为保存state+真实fixture恢复/读回。没有在本节给材质、断面或真实真机视觉分。

| 已读证据 | SHA-256 |
| --- | --- |
| scratch：restart-demo-state-5237.json | dc45cab5a90ac3c9e81460d8021c6ae71162bedc89a96a08698f6eb98d873a51 |
| scratch：resume-demo-state-5237.json | ec46d4fbbce8b8b966bc95a2f58ad6e7dce728b19b0d8efd390057845104ed25 |
| scratch：resume-demo-state-5237-after-id-fix.json | 66a2dfddb906b021f6cc11903760d6da1590deb2d02d54ec67c85d7f2e5532be |
| app-r18-resume-created-message-visible.png | aae82f76ccf0e5519c8129516854aa8a486d0359bd3b5a0325f86f19246d8e44 |

scratch路径均在D:/WORKS/PLAN/.wt/uvel-design-preview/，只读原件并在内存克隆，未复制state到审计目录或修改文件。

### PREVIEW-R18-P2-01：重建transport后丢失同key载荷约束

位置：prototype-message-demo.mjs:11的receipts=new Map、39—42的fingerprint检查，以及prototype-demo-support.mjs:107按clientMessageId直接返回existing。

新测试最后一项检查了重启前“同key不同正文409”，也检查了重启后“同key同正文不重复”。**没有检查重启后同key换正文**。这两个正例不能闭合缺失的交叉分支。

最小真实函数复现，无网络：

1. 新createPrototypeMessages实例，以key=saved-open、openingText=original成功创建。
2. 同实例同key改正文changed，返回409，符合已有合同。
3. JSON导出state，再JSON解析成新state并新建createPrototypeMessages，模拟server启动重新创建内存receipts。
4. 同key请求changed，fixture看到原clientMessageId就返回旧会话，transport将它包装为200。

~~~json
{
  "case": "restart-changed-payload-same-key",
  "beforeRestart": 409,
  "afterRestart": 200,
  "returnedOriginal": "original",
  "expected": 409,
  "stateUnchanged": true
}
~~~

没有创建第二条消息，ID迁移本身正确；失败在于冲突载荷被当作成功并返回另一份正文，不能将“没有重复行”写成完整幂等合同通过。此处是本地预览恢复语义，不是生产服务已发现相同漏洞。prototype-message-demo及server相对HEAD没有本次差异；旧supportDemo也直接按create key重放，故准确归为现有恢复边界被新增定点揭示，非Jason全局ID修复引入。

最小建议：在可导出的state中保留已完成命令的规范指纹（操作、目标、类型、原正文等），或依据保存的消息和会话在重放前重建并比较；同key冲突返回409且不分配新ID。旧导出缺指纹时只能从可证字段恢复，不能默认接受任意新载荷。不需要改正式human聚合，也不应把未结束的计时器/Promise当作可持久状态。

必要定点只需在现有新测试上补“导出→新transport→同key不同正文409、同key相同正文保持原ID”，并按同一指纹合同覆盖目标/操作变化。保留当前正常首建可见的证据，不要求因此重拍旧标题、动画或声效矩阵。

### 源码指纹及签项限制

| 本次实际读取源码/测试 | SHA-256 |
| --- | --- |
| scripts/lib/prototype-demo-support.mjs | b9ee53fb76b28c437d17c1ec3ccd5fb5bc0ef0807ad4d387e43bfd97aee6a485 |
| scripts/lib/prototype-demo-support.test.mjs | 06fcc0b2df98d03214a9c7f880e59920ba85993dc56fd666c70e0116c472ed42 |
| scripts/lib/prototype-message-demo.mjs | 742c086af25745d42224faf4653d2b2a22394eb29d9bcee32cc462a8f9012e5a |
| scripts/prototype-preview-server.mjs | 944398d51f37522ed140a67a89bffc681025f27bbb061e6ca3d2a90991cd1267 |

仅签合法preview导出数据的全局ID/同内容恢复及已见首句样本，不包括手工损坏state、任意非法数字ID、真实部署数据库、TEST真服务、真机安装或H5同步。没有改正式会话聚合规则；既有跨human历史显示也没有因本次检查被要求移除。

本次增量审查完成。全局ID与首建可见子范围9.2可采用；恢复后的冲突key子范围8.8保持未签，修后定点关闭前不宣告PREVIEW-RT完整恢复通过。等待Jason历史修复，未提前重审或重评其在途实现。


## R18 HISTORY三项P2第二次独立复核：限定行为关闭（2026-10-27）

Jason交付后，本审对当前未提交thread实现重新执行定向检查。上一节8.6及全部复现记录保留；本节用新源码指纹更新关闭状态。仅追加本报告，没有修改生产/测试代码，没有浏览器、构建、提交、推送或H5同步，也没有提前复审仍在处理的PREVIEW指纹P2。

### 分项评分

| 范围 | 独立行为分 / 10 | 关闭依据 |
| --- | ---: | --- |
| 同flush前插与header增/减 | **9.2** | 两种赋值顺序分别执行，0→106得到426，106→0得到214，均含完整前插delta。 |
| HISTORY剩余P2-A：连续prepare | **9.2** | 真实父函数第二次加载等待首笔settled；首笔未提交前fetch仍1次、busy保持；最终626，不再320。 |
| HISTORY剩余P2-B：host切换 | **9.2** | ref替换和同ref的$el替换均使旧prepare返回false；新host重测后定位320，旧42不再得到278。 |
| HISTORY剩余P2-C：后测失败释放 | **9.1** | 空值/NaN释放；无返回499ms仍pending、500ms释放；失败不猜delta、不抢滚，允许重新prepare与当前tail跟随。 |
| pending期间用户滚动/多次布局变化 | **9.1** | 连续两页等待期间用户+50/−30，最终646；多次header与前插共同pending最终710，保留用户净位移。 |
| 迟到回调/归属取消 | **9.2** | 旧结果在新事务前后返回均无效；account/binding/composer/reveal/host/root/hide-return/dispose释放等待，旧结果不能覆盖或释放新事务。 |

不取平均。**HISTORY本轮三个剩余P2在当前指纹的限定行为范围关闭，历史定位整体可按9.1限定接受。** 这不是原生视觉或全IM验收：真实滚动像素、键盘/安全视口和新材质仍由对应实景审查独立签，不能拿本表替代视觉≥9。

### 实际独立执行

本审在内存编译当前真实ConversationThread SFC，使用真实Vue ref/watch/nextTick/effectScope、真实scroll/entrance/time/bubble helper，并抽取当前chat.vue真实loadEarlierHumanHistory函数连接到thread。替代的是可控制顺序的原生选择器、运输返回和时钟，没有复制定位算法。Date.now与定时器统一到同一虚拟时钟，以正确检验原绝对deadline，避免只推进timer却让Date.now停留造成假结论。

共执行**25个独立定点，全部断言通过**。这些是本审内存探针，不改称25条已写入仓库的测试，也不是实际浏览器操作。没有重跑整套旧矩阵。

关键结果：

~~~json
{
  "sameFlush": {
    "0_to_106_messages_first": 426,
    "0_to_106_inset_first": 426,
    "106_to_0_messages_first": 214,
    "106_to_0_inset_first": 214
  },
  "realParentContinuousPages": {
    "whileWaiting": {"fetches": 1, "busy": true, "top": 120},
    "firstCommitted": 426,
    "final": 626,
    "pending": false
  },
  "continuousPagesWithManualScroll": {
    "firstCommittedAfterPlus50": 476,
    "userThenMinus30": 446,
    "final": 646,
    "pending": false
  },
  "multipleLayoutsAndManualScroll": {"final": 710, "pending": false},
  "hostRefAndRootReplacement": {"oldAllowed": false, "freshFinal": 320},
  "wholePostTransactionDeadline": {"pendingAt499": true, "releasedAt": 500, "top": 120}
}
~~~

失败恢复各自执行empty、NaN、timeout三分支：

- 第一次父级请求已结束、第二次父调用正在等首笔定位。失败后第二次调用返回，fetch仍为1次、busy释放、提示一次；不会带着未知旧prefix继续前插。
- 人工重试取得新预测量后才加载第二页，fetch变2，当前位置120加新页200得320。这里**不补造**此前未测得的首笔306；320是从当前视口重新建立基线，不再是首轮“首笔已知却被清掉”的错误。
- 失败后的离尾阅读增高composer，仍停120且scrollAnchor空；用户明确回尾800后再次增高，正确产生nx-conv-end。晚到9999不会改写800。
- 新事务pending时返回旧失败查询，pending继续属于新事务；新测量仍可成功提交。
- 400ms时header变化重排查询，旧事务仍在500ms截止，不延长到900ms；旧/新两个失效结果随后返回均不跳动。
- account、binding、composerKey、revealTick、host、root、hide、hide→return和dispose九个边界分别返回false、释放pending，旧回调无效。没有用普通成功路径代替这些取消边界。

### 代码关闭点

- prepareHistoryPrepend在475—499捕获owner/host/root/preparation；有pending时先await其有界settled，完成后再验证当前归属及重新测当前首条。它不再先cancel掉未付的前插delta。
- preparedHistory同时记录host/root；measurePrefix在457—471回调时即时检查owner/host/root/visible/disposed。同步watch在438使host或$el变化立即取消原准备/事务。
- PositionAdjustment拥有settled Promise与首次expiresAt。cancelScroll(true)只换当前查询代次，保留定位基线及原截止；完成/失败的settlePosition统一清timer、释放等待。
- 500ms只限制这笔后测事务；后续新预测量本身另有500ms截止。等待旧事务再进行新预测量是两阶段，不能误写成“每次点击到请求派发总共最多500ms”。虚拟时钟结论也不是原生event-loop性能承诺。
- 后测空值/NaN走失败settle，无回调走截止；没有将未知prefix改成0。scrollToEnd的延迟nextTick新增disposed/current检查，失败释放本身不主动拉到底部。
- 本次源码没有改状态、发送key、时间分组或正式human历史聚合合同；chat.vue现有其他玻璃改动不在本节签核范围。

### 133测试的来源区分

用户报告thread行为133/133通过；本审已读取当前测试源码新增的真实父级连续prepare、host/root更换、失败释放、原deadline及取消回归。本轮在原scratch路径读到的queue-r18-thread-green-tests.log仍是旧113通过，SHA-256 a4a741b8d6f6fe85a8c3cffb8a10a9ac432a1a1748f83b89b57dd25ceffd08a9；未定位到新133日志，因此**133作为用户交付信息，不冒称本人已读新日志或重跑133**。本轮关闭依据为实际独立25定点及当前源码，不等待或要求再跑整套来重复证明。

### 本次指纹与剩余边界

开始和报告写入前核对一致：

| 本次实际读取文件 | SHA-256 |
| --- | --- |
| src/components/support/conversation-thread.vue | 15c6febdd3c04c0d5507e025438fcd42e6eb12f2abe755e540122641373ee0ca |
| src/components/support/conversation-thread.behavior.test.ts | 1e50c0f8c8194ea5c39ed4a3e300e83509d360d23fc831a2cb4c0df8c7586364 |
| src/pages/support/chat.vue | fb7763494594708fc88696814a6dd5f5de23f5879cfba6c94d19fbb27fad61eb |
| src/components/support/conversation-scroll.ts | 1c22ddf6797e0915341052bc716bbbff92aded0174310f85d40a1cb4faf413d6 |

本节未发现新的HISTORY可复现P1/P2。REFLECTION owner/host原9.0关闭保留；其销毁前nextTick排队后仍发一次测量的P3没有因historyDisposed新增而自动关闭，bubble调度分支仍需对应独立证据。PREVIEW-R18-P2-01（重启后同key换正文返回200）继续未签，Jason后续交付再审；不使用历史正常路径关闭它。

本次仅关闭历史三个行为缺口。最终IM各项仍须当前适用的视觉与行为独立≥9；H5、真实后端、真机安装及未读新实景全部维持原边界，不扩大本节结论。


## R18 bubble销毁P3独立关闭（2026-10-27）

本次仅审bubbleMeasurementDisposed增量及对应生命周期测试。真实thread SFC内存编译/执行，平台测量、计时器及Observer由可控夹具替代；没有浏览器、构建或产品修改，没有复跑HISTORY与renderer旧矩阵。只追加本报告。

**独立行为评分：9.2/10，销毁后重启bubble测量的P3关闭。** 原REFLECTION owner/host 9.0限定结论保留；不以本次清理给整个SEND材质或IM18补签视觉分。未发现此增量新的可复现P1/P2/P3。

### 关闭依据

- scope dispose先置bubbleMeasurementDisposed=true，再取消已有timer、递增bubbleMeasureEpoch并disconnect Observer。
- scheduleBubblePositions和measureBubblePositions都拒绝已销毁实例；已排入nextTick但尚未创建timer的回调也不能重新安排16ms测量。
- 既有native测量回调由dispose递增epoch失效。apply虽未单独读取disposed，但measure入口不能在dispose后生成新epoch，旧epoch不能重新匹配，当前链路有效。
- 仅hide不永久置disposed，return仍能正常采样；未把隐藏与销毁混为一体。

本审独立执行以下**7个定点，全部通过**：

| 定点 | 实际结果 |
| --- | --- |
| 同步host变更排入nextTick，flush前dispose | 后续requests0、timers0 |
| reveal变更排入nextTick，flush前dispose | 后续requests0、timers0 |
| 已建立16ms timer再dispose | 后续requests0、timers0 |
| 实际调用SFC mounted回调挂载bubble ResizeObserver，dispose后触发该Observer保留的notify两次 | disconnect1次，新增DOM reads0、selector requests0 |
| dispose后返回既有native回调 | 状态写入0；死实例原light0.966未被旧结果改写 |
| dispose后直接调用schedule与measure两个入口 | requests0、timers0 |
| hide→return对照 | hidden requests0，return的新测量light0.966 |

Observer定点执行的是生产onMounted内建立的Observer回调，使用替代ResizeObserver对象记录observe/disconnect；不把直接调用schedule命名为真实Observer测试，也不声称运行了浏览器Observer。死实例保留旧ref值不等于用户可见光残留；本P3关闭目标是销毁后不再采样或改写，而非强制把已经卸载的每个ref都重置。

### 日志及继承范围

已实际读取D:/WORKS/PLAN/.wt/uvel-design-preview/queue-r18-render-lifecycle-tests.log：

- conversation-thread.behavior.test.ts：136通过；
- liquid-glass-renderer.behavior.test.ts：49通过；
- 合计2文件185通过，日志SHA-256：c2dfeb71fc25d78efa8af9cb84179503c8d39ee5c7b5b176c2caecd6d20ce648。

这是读取父线程执行日志，不冒称本审重跑185。renderer模式本轮没有独立审实现，不凭49绿签renderer视觉或所有渲染路径。

本次将thread第407—647行与上一节HISTORY关闭快照逐字规范化比较，内容相同，因此前次25个HISTORY定点与三P2关闭继续适用，不重跑来重复计数。当前完整文件指纹因bubble守卫及其他已有样式范围不同而更新：

| 文件 | SHA-256 |
| --- | --- |
| src/components/support/conversation-thread.vue | 033e27b3221216f26ba81dfd7edc8bdbee609e381aa7e6a378c7d56848e5cc29 |
| src/components/support/conversation-thread.behavior.test.ts | e90a90cf7cd332174f2d061bf99262a112ea34bebfcebacff3c7013f3f2a52e5 |

仍待处理的是PREVIEW-R18-P2-01持久指纹恢复边界，等待Jason交付后独立定点；本轮未查或提前给它改分。当前玻璃断面、renderer模式及最终实景保持对应审查边界，不因本P3关闭而宣称全站/真机/H5通过。


## R18持久指纹fixture预审：等待transport最终修复（2026-10-27）

按用户授权先审已完成的prototype-demo-support.mjs及测试，不等待全部实现才读源码；但**不签完整PREVIEW-RT、不更新恢复幂等最终分数**。transport409缓存问题已由用户交Jason处理，本节不另开重复P2。原全局ID/首发可见9.2及恢复幂等8.8历史结论保留，后者须最终transport闭环才能更新。

### 已独立确认的fixture实现

- supportMessageCommands保存key、SHA-256规范意图指纹、conversationNo；意图包括operation、target、conversationType、正文及kind。版本不纳入指纹，与现有transport意图tuple一致。
- 新create/reply在完成时登记指纹，重放在分配新ID或追加消息之前校验；不同正文、会话类型、目标及操作不能借同key恢复。
- 旧state无指纹时，从可证的user TEXT记录恢复；旧opening缺message.clientMessageId时，仅完整历史的无key首条user消息可作依据。截断、被场景替换而无法证明、同key多个owner或把后续reply误当opening均拒绝，不猜原载荷。
- 恢复先于scenario替换，已记录的完成指纹不会随history/receipts替换丢失。只存意图hash，没有持久化Promise、timer或额外正文副本。
- 本轮未发现fixture层新增的确定P1/P2。该判断只覆盖下列已执行定点，不等于transport成功回执、并发及reset全部闭环。

### 七组独立内存定点通过

直接调用真实supportDemo，使用state副本，不通过正在修复的transport缓存做成功假设：

| 独立定点 | 结果 |
| --- | --- |
| 已完成create，JSON恢复后依次换正文/类型/操作，再同key原载荷重放 | 三次409；合法重放保留canonical id2；state不变 |
| 已完成reply，JSON恢复后依次换正文/目标/操作，再合法重放 | 三次409；合法重放保留canonical id2；state不变 |
| 实际旧resume-demo-state-5237.json副本恢复 | 旧DEMO2原key/正文可重放id32，换正文409；完成迁移后重放不改state |
| 实际after-id-fix导出副本恢复 | DEMO3 id33与DEMO2 id32原key重放均保持；换正文409；重放不改state |
| legacy完整性标为truncated | 409，拒绝推断opening |
| legacy同key跨多个会话 | 409，保留两边历史 |
| 原消息已被场景替换且没有保存的指纹 | 409，不拿新fixture正文冒充原载荷 |

实际导出恢复生成的指纹记录分别28/29条；只在内存操作，没有修改scratch或正在使用的preview。没有重拍截图、操作浏览器或重复旧协议/ID边界矩阵。

### 本轮测试运行遇到正在添加的transport红测

最初读取的测试文件为新增13例的版本；实际执行node --test期间，工作树测试已更新为同一transport上“先冲突、后合法重放”，并新增reset/UNKNOWN用例。因此本次实际执行结果为**24项：15通过、9失败，exit1**。不能把用户此前报告的26入口测试通过记成本轮当前工作树全绿。

失败均位于：
- create/reply冷启动先冲突，再合法原载荷，后者仍409；
- 换操作/目标/type冲突后，原载荷仍409；
- 旧state恢复先冲突，随后合法重放仍409；
- UNKNOWN冲突清理后，原载荷预期首次504但得到409。

这与已知的transport将fixture409及冲突指纹缓存到receipts中相符；同一实例被污染后合法原载荷过不了内存fingerprint检查。fixture直接调用的合法重放通过，不能掩盖实际入口失败。本节记录的是在途红测，不声称Jason已经交付的最终transport失败，也不为同一个已知问题重复分配新编号。

本轮最初测试指纹：
4f4f63e24c3b8d0ff4e1bc111174af9499372d3024a3b2cd2b1b76c99877d649。
执行后读取版本：
f048bed3e50c35b636b6b2f8e80ad8e26f2d511da90921ac897afe05dc8fda23。
两者明确分开，不冒称审查期间测试文件冻结。未由本审修改测试。

### 最终transport最小复核范围

Jason交付后仅增量验证：

1. 同一cold transport：冲突409→原载荷成功且原ID不变；create/reply及目标/操作变化均不污染合法重放。
2. 冲突与合法原载荷并发/先后时，不把临时冲突保存成已完成原命令的指纹；清理旧409必须检查receipt实例身份，不能误删reset后的新记录。
3. commands读回能返回正确成功结果；UNKNOWN仍需原key显式确认，不因清理冲突泄露“已确认”假象；同key正确重试不重复分配消息。
4. 保留已有普通create/reply、旧state可证恢复、不可证拒绝以及全局ID正常路径，不重跑UI旧矩阵。

| 本次fixture/transport读取指纹 | SHA-256 |
| --- | --- |
| scripts/lib/prototype-demo-support.mjs | cce58db864566307ce1475246de448186889ef82fea91121b120acabcae872c3 |
| scripts/lib/prototype-message-demo.mjs（当前仍为修前读取版本） | 742c086af25745d42224faf4653d2b2a22394eb29d9bcee32cc462a8f9012e5a |

本节不签最终分。HISTORY三P2及bubble销毁P3原关闭结论保持；等待transport完成后再更新PREVIEW恢复子范围。只写本报告，没有生产修改、state写入、提交、推送或H5同步。


## R18 transport409与裸路由增量最终行为复核（2026-10-27）

本节仅完成用户指定的持久指纹、同实例409缓存恢复、UNKNOWN/reset和human裸路由/空cid/有效start/无目标额度门；Nova的NOVA_AI_INPUT_INVALID明确拒绝恢复正在独立实现，不在本节签署范围。STATUS仍待用户确认，不代表整个R18、IM18项或APP/H5全部完成。此前PREVIEW恢复幂等8.8及24项中9项失败的历史原文保留；本节是修复后新结论，不回改旧证据。

### 结论与独立分数

| 本次增量范围 | 行为分 | 本轮结论 |
| --- | ---: | --- |
| PREVIEW-RT持久指纹及同instance冲突后正确payload回放 | 9.2/10 | PREVIEW-R18-P2-01关闭；包含之前已发现的transport409缓存污染。原载荷重放保持原canonical ID，不新增消息 |
| PREVIEW-RT UNKNOWN与reset回执隔离 | 9.2/10 | 已执行create/reply及旧回调/新receipt交错定点；本次未发现新增P1/P2 |
| human裸路由、空cid与有效start分流 | 9.2/10 | 通过；无目标回消息列表，有效start首发才创建，trim后的已有cid优先回复 |
| 无目标发送/重试额度门 | 9.2/10 | 通过；额度获取前拒绝，导航pending/false时保留草稿及失败重试记录，不创建会话 |

**本次PREVIEW-RT本地原型持久幂等/transport子范围可签9.2；路由与无目标额度子范围可签9.2。各项独立成立，不取平均。** 全局消息ID迁移与首发可见此前9.2结论延续，未重复运行其984组矩阵；HISTORY三项P2、REFLECTION owner及销毁P3的既有关闭依据不替换。本次没有新增产品修复建议。

### 源码依据

- scripts/lib/prototype-message-demo.mjs的409清理位于execute完成之后，仅当receipts.get(key)仍严格等于本次saved对象才删除。它清除被fixture拒绝的临时意图，不删除reset后建立的新receipt；非409的成功/UNKNOWN路径保留原处理。
- fixture的supportMessageCommands持久指纹及legacy可证恢复沿用上一节已独立验证的实现。operation、target、type、正文及kind受校验；expectedVersion变化不改变命令意图。无证据的legacy payload仍拒绝。
- chat.vue:671的onLoad先处理既有AI开关，再仅接受trim后非空字符串cid或精确support/advisor start；否则导航到消息列表。空cid不会遮蔽有效start，已有cid优先。
- chat.vue:1300的acquireSendSlot在调用sendLimiter之前检查human目标。onSend、retryHumanSend与本地快捷入口共用该检查；远程快捷入口走onSend。失败重试在该门之后才清除failedHumanSend。
- 本轮没有修改Nova拒绝恢复、会话store、生产脚本、测试文件或preview state。

### 独立执行的8组真实fixture＋transport定点

直接import当前supportDemo和createPrototypeMessages，在内存建立已完成命令、JSON恢复副本和新transport；不用已完成的正常路径代替错误链路。以下每组均断言原canonical ID不变且JSON state无新增/重排，源版本见后表。

| 独立组 | 实际执行与读回 |
| --- | --- |
| create：同instance换正文/type/操作后原载荷 | 三次冲突409，每次随后原载荷200；版本字段可变化；commands返回原id3；state不变 |
| reply：同instance换正文/目标/操作后原载荷 | 三次冲突409，每次随后原载荷200；commands返回原id3；state不变 |
| create UNKNOWN | 错载荷409→正确载荷504→commands null→错载荷409→commands仍null→原key正确重试200→commands返回原id3 |
| reply UNKNOWN | 同上完整顺序，未因冲突清理提前暴露已确认结果；单条原消息保留 |
| create reset交错 | 启动旧冲突及同payload加入者，尚未结算时reset，再启动正确原载荷；结果409/409/200；旧回调后commands仍保留新正确receipt |
| reply reset交错 | 同样409/409/200；随后错payload仍409、正确payload仍200，新receipt没有被旧清理误删 |
| UNKNOWN待结算时reset | 旧/新两次首次响应均504；commands仍null；当前实例原key重试200后才读回canonical；没有重复写消息 |
| 三轮JSON导出恢复 | 每轮新transport先错payload409再正确payload200；原reply id3与完整state保持不变 |

### 路由与额度：实际SFC及独立函数边界

1. 独立重跑真实chat.vue脚本的human chat route admission组：**12/12通过，99项跳过，exit0**。这是从111项页面测试中只选当前增量，没有重跑全部页面/Nova矩阵。
2. 覆盖裸路由、空cid、全空白cid、非法start；首次进入不发conversation/start/reply请求。
3. 导航Promise持续pending或返回false时，连续两次onSend均restore一次并settled(false)，不调用tryAcquire、不显示限流警告、不创建localHumanSend；failed retry仍保留原记录且不消耗额度。
4. 空cid/全空白cid＋support/advisor四种组合，进入不创建，首次发送仅获取一次额度、仅创建一次，随后切换canonical cid并清除startType。已有trim后cid＋start只reply，不start。
5. 另用TypeScript AST抽取**当前生产onLoad和acquireSendSlot**，独立执行15组：11组无目标/无效类型（undefined、null、非字符串cid、Unicode空白、大小写/带空格的非法start等）均导航并拒绝；每组连续两次获取均为false，额度getter与tryAcquire次数都为0。4组有效start/cid仅在实际获取时调用额度一次。
6. 真实SFC测试替代transport/lifecycle边界，使用实际Pinia会话store；有onMounted无组件实例的Vue warning。因此它证明脚本分流、状态及请求，不证明原生路由动画、挂载、像素或真机行为。独立AST组也不冒充整页挂载。

本轮命令：
- node --test scripts/lib/prototype-demo-support.test.mjs：**24/24通过**；之前9个失败现全部绿。
- node --test --test-name-pattern="^(receipt scenarios|badge scenarios|history pages|timeline fixture)" scripts/prototype-message-demo.test.mjs：另**4/4通过**。24与4合为28个不同用例；不是将父线程报告直接改写成本审执行。
- node node_modules/vitest/vitest.mjs run src/pages/support/messages-start-entry.test.ts -t "human chat route admission" --no-cache：**12通过，99跳过**。
- 另8组真实transport交错＋15组AST路由/额度定点均exit0，仅内存运行，没有写新测试文件或日志。
- 用户所报页面入口与Nova共166通过保留为提交方结果，本审没有为本次结论重跑这166项，也没有用它替代Nova后续独立复核。

### 本次读取冻结指纹

| 文件 | SHA-256 |
| --- | --- |
| scripts/lib/prototype-demo-support.mjs | cce58db864566307ce1475246de448186889ef82fea91121b120acabcae872c3 |
| scripts/lib/prototype-demo-support.test.mjs | f048bed3e50c35b636b6b2f8e80ad8e26f2d511da90921ac897afe05dc8fda23 |
| scripts/lib/prototype-message-demo.mjs | d336846037b5183a53865caec6cad604e47e144448e228b06a642b27edbbded6 |
| src/pages/support/chat.vue | cf8ba84fa317c02e4efa8abd9a4e102318abff25ac35a8c69ca269bebb415c40 |
| src/pages/support/messages-start-entry.test.ts | 655eda30ffd4a18b1c1f21b03f92c700aaa0f2d9043a8f9db4dfc621d4844ed5 |

### 保留的边界和后续项

- 本节签本地原型函数级命令处理、持久state恢复与页面脚本行为；没有运行真实TEST服务、物理进程重启、真实HTTP/WS并发/断连或新原生安装，也没有操作浏览器或拍图。
- 上节旧state可证恢复7组与本节新transport交错分别记录；本轮没有重新改写scratch或正在使用的preview state。不能把内存JSON恢复称为本次已重启服务器。
- 用户补充的CBcrG6IE历史25→33→41→49→56、header148.873→72.879与同ID误差≤0.199px，以及图片预览恢复、失败图标同正文单条sent、21.543s UNKNOWN后原图标恢复，属于提交方新增实景；文件名r18-history-pages-runtime.json、r18-unknown-recovery-runtime.json、app-r18-singlepaint-*已知。本轮依用户“先完成transport/bare route”范围，未逐图重看或独立操作这些场景，未用它们替代本节异常链路证明，也不据此更新STATUS视觉结论。
- **Nova明确NOVA_AI_INPUT_INVALID受理前拒绝恢复尚待最终实现后的独立增量复核**；新正文新turnId、UNKNOWN/tracking保留的要求未在本节签核。
- **STATUS仍待用户确认；整个R18尚未完成。** 未同步H5、未commit/push、未构建。只追加本review-behavior.md，旧分数/红测/签项原文完整保留。


## R18 F15 Nova明确输入拒绝恢复：独立行为增量结论（2026-10-27）

按用户分工，仅复核F15新增拒绝分类、编辑/删除/重试身份与队列恢复，以及时间线新增23:59:59.999边界证据。没有重审既有消息状态视觉、Liquid Glass或整套IM矩阵。上一节transport/bare route签项及更早低分、红测原文保留。

### 独立分数与结论

| 本轮范围 | 行为分 | 结论 |
| --- | ---: | --- |
| F15：受理前精确输入拒绝恢复 | **9.2/10** | 本地代码、状态机、实际SFC脚本及动作模板范围通过；本轮无新增P1/P2 |
| TIME-01：24h分隔新增边界与已保存DOM证据 | **9.2/10** | 86,399,999ms不分隔、跨午夜120,000ms不分隔、86,400,000ms分隔；历史补页取消旧首条分隔符合规则 |

F15的9.2覆盖下列每一条要求，并非用平均分掩盖未通过分支。它是限定行为签核，不替代Nova浏览器/原生实景验收，也不宣布整个R18完成。STATUS仍待用户确认。

### F15源码与本地合同核对

1. **精确分类**：novaFailure只将真实ApiError的kind=http、status===400、code===400、message===NOVA_AI_INPUT_INVALID四项同时满足判为input-rejected。缺code、字符串"400"、不同kind、类似错误名及普通Error/普通对象均不授权编辑。
2. **受理前依据**：读取本地后端AppNovaAiService.java:42、149，validate在mapper.turn和reserve之前；INPUT_INVALID由该validate抛出BizException(400, ...)。GlobalExceptionHandler.java:34、143将这个code同时映射到HTTP400与响应业务码400。仅核本地源码合同，没有调用或确认已部署TEST版本。
3. **不能抹除既有未知**：nova.ts:218的非input-rejected失败和trackRemote均置outcomeUnknown；retryRemote不清除此标记。后续精确输入拒绝遇到此标记只保留普通failed，canEditRemote仍拒绝。离页中断processing进入tracking，也留下该标记。未发出的queued可编辑是已有行为；本轮只扩大“已经尝试发送”的明确拒绝恢复范围。
4. **改文是新意图**：saveRemoteEdit先要求editing且可编辑；规范化后正文发生变化才取新UUID。同步更换id/turnId并清理旧attempt/failure/serverPending/deadline，保留语言和队列位置。UUID不可用或与现有turn冲突时保持原editing记录。旧ID的完成、失败、保存、删除不能改动新turn。
5. **原文不是新发送**：规范化后正文未变只取消编辑，明确拒绝项回failed；用户显式retry才回queued，正文、conversationId、language、turnId均原样重用，重复retry不会再入队。
6. **取消/离页**：明确拒绝项取消编辑或在editing时hide，均回failed，不自动重发。隐藏时page动作与保存入口拒绝操作；account切换后旧拒绝及旧ID操作不作用于新会话。这里没有把“原本未发出的queued项”误说成一律停止其既有排队行为。
7. **续行及成功反馈**：page在编辑保存/删除成功后调用drainNovaQueue。改文的新turn成功后继续下一项；删除明确拒绝头部直接释放下一项；原文retry完成后继续。onQueueSave按修改后的turnId登记pendingNovaSounds，只有成功完成才增加sendSuccessRevision。
8. **动作可达性**：thread模板只在queued/failed且editable时呈现编辑、删除，processing/tracking/不可编辑failed无此动作；模板继续接原queue-action/queue-save。此次只检查动作条件和handler，没有重新评价状态图标或CSS材质。

主要生产位置：src/lib/nova-failure.ts:5、src/store/nova.ts:218、246、260、275、289、src/pages/support/chat.vue:984、1552、1627、1640、src/components/support/conversation-thread.vue:66、338。

### 本审实际执行范围

定向命令：

node node_modules/vitest/vitest.mjs run src/lib/nova-failure.test.ts src/store/nova-queue.test.ts src/pages/support/nova-queue-page.test.ts src/components/support/conversation-thread.behavior.test.ts -t "confirmed input rejection|Nova actionable errors|shows revision actions only for allowed queue entries" --no-cache

实际结果：**4文件48通过、200跳过，exit0**，其中分类17、store恢复14、page恢复12、模板动作5。page执行实际chat.vue脚本、使用真实Nova store和替代API/lifecycle边界；thread动作测试编译实际模板并调用生成的handler。page测试有onMounted无组件实例的Vue warning，因此不宣称覆盖真实浏览器挂载或原生生命周期时序。

额外独立内存定点直接转译当前生产novaFailure/nova.ts，使用真实Pinia/Vue，未新增或修改测试文件：

| 独立定点 | 实际结果 |
| --- | --- |
| kind×status×code×message共1,200组 | 只有完全精确四元组1组获input-rejected；其余全部拒绝 |
| 4种非ApiError输入 | Error、普通伪同形对象、null、undefined均不解锁 |
| 改文／旧动作／续行 | 新UUID与新user id；旧完成/失败及重复旧ID保存/删除不改变新processing项；新项完成后next被claim |
| 取消／原文保存／原ID重试 | 连续取消仍failed；仅空白差异保存不发送；显式retry保留old ID，第二次retry返回false |
| editing离页中断／删除 | 中断后failed且不可claim；删除只删除拒绝头部，下一项可claim |
| 7种先前不确定分类，各连续3轮精确拒绝 | failed/timeout/network/busy/unavailable/auth/interrupted都保留outcomeUnknown；每轮编辑/删除/改文均拒绝，原ID与正文保留 |
| processing中断后精确拒绝 | tracking留下的unknown不被后续INPUT_INVALID清除 |
| account重绑 | 旧失败/改文/删除不会作用于新账户processing项 |
| UUID不可用／碰撞原ID／碰撞下一项ID | 三种失败都保持原正文、原ID及editing，不能被claim |

独立状态序列计7组，上表另分列分类与错误输入；UUID生成边界使用Node crypto并注入失败/碰撞，没有声称实际执行Android/iOS UUID桥。用户提供“8文件383通过＋tsc”保留为提交方验证结果，本审不把它计为自己重跑的数量。

### TIME-01新增证据核对

本审读取：
- r18-24h-timeline-dom.json；
- r18-24h-timeline-boundaries.json；
- app-r18-timeline-dark320-vi-oldest.json；
- 并实际使用view_image目检app-r18-timeline-dark320-vi-oldest.png。

独立核对保存JSON中的精确ISO时间差，并按相邻时间对齐DOM记录，得到：

| 时间边界 | 精确差值 | 保存DOM实际divider |
| --- | ---: | --- |
| 前一天23:52:00→次日23:51:59.999 | 86,399,999ms | 无 |
| 23:59→次日00:01 | 120,000ms | 无 |
| 00:16→次日00:16 | 86,400,000ms | 有 |

两次DOM快照为16条→24条，headers为2→3；原16条首行nx-conv-message-31-30在补页后同ID保留、其原首条divider消失。DOM的aria时间显示到秒，毫秒精度来自配套raw ISO及fixture断言，不声称仅凭DOM文本就能区分最后1ms。raw fixture ID与聚合DOM ID不强行当作同一字面ID。

窄屏截图实际是320×693预览框、dark、越南语；可见首条跨年定位“31 thg 12, 2025 10:00”、后续“Thứ Bảy 23:46”和每条HH:mm，未见这些时间文本横向截断。截图展示最旧端，不单凭这一张图声称看到了全部边界；完整分隔判断使用已保存DOM。没有重审其玻璃或消息颜色。

仅重跑新增fixture所属用例：
node --test --test-name-pattern="^timeline fixture" scripts/prototype-message-demo.test.mjs
结果**1/1通过，exit0**，包含新增index7→8=86,399,999ms断言。此前R16纯helper六组边界与HISTORY闭环证据沿用，未重复整个时间或分页矩阵。保存DOM的script字段为http://127.0.0.1:5240/assets/index-DYMJD5Wv.js；本审没有访问该服务。

### 读取指纹与未覆盖边界

| 文件 | SHA-256 |
| --- | --- |
| src/lib/nova-failure.ts | 3077098b36b7a4e296b0cfe52ee97b86d3ef29923579fdadc2ce27650611eed3 |
| src/store/nova.ts | f431161187b55488dccc79330014b51bdb6da4a2f9c206267d1f72d815d72c22 |
| src/pages/support/chat.vue | c4663eaa87af528975cb2b987556cdee2ce06f0c9b9b22bd211fac74f546c95d |
| src/components/support/conversation-thread.vue | 676b9d742909ca53541d928783e413d67328281ceb20bb4aec690352fc168562 |
| src/lib/nova-failure.test.ts | 11621e97194d67f82d693e32f7f48f82895db62e35ed6b9bf9a31ec49efa0d1c |
| src/store/nova-queue.test.ts | e0fa51cfb5b7a24ab7e077914070d70b06b7259a06332f78770d903aed19fb34 |
| src/pages/support/nova-queue-page.test.ts | 97dc4a253bf2b5af0dfa08fd67081b95f594c8c9ad7918d7820f1f90f831faae |
| src/components/support/conversation-thread.behavior.test.ts | 4d73d372a7f37e31dda169d362ff9c4ec7a2220deb23591f71fe9526fb3a593e |
| scripts/lib/prototype-demo-support.mjs | 7402c80b1f4a348586473168060f86a749639f304751bcf94bf0c5cc8daa2b65 |
| scripts/prototype-message-demo.test.mjs | 74a7ceb76c38ff24830d6fd371ccf04bcab48198643fc4f180a06cde99850f15 |
| r18-24h-timeline-dom.json | 7bfb28b752b58f2e0ecfd849f88eb8da32997b1162c40f7e46c9df19700a9a5d |
| r18-24h-timeline-boundaries.json | e639aded5115cc0809cec4157a74945792722c647ce99bd706227814b1cdb8ae |
| app-r18-timeline-dark320-vi-oldest.png | d28096846886a8fc78ba5e2ec8f3bdf7b8725a0c2b288e4cdd02425e4c8d96ed |

F15未新增浏览器点击/Enter/Space实景、真实TEST拒绝响应、真实模型调用或原生离页操作；测试harness开放AI分支不代表当前产品已向用户开放Nova入口。full reload只恢复服务端确认历史是既有store边界，本轮没有新增pending持久化签项。时间线只覆盖上述本地保存证据，没有补签其它时区/DST、H5最新镜像或真机。

**当前没有新增需修复P2；F15此前待审状态在上述行为范围内关闭。STATUS和整轮视觉/用户确认仍未完成。** 本轮仅追加本报告，无生产代码/测试/state写入、浏览器、构建、commit/push或H5同步。


## R18 composer sampled模式：独立红绿回归与限定签核（2026-10-27）

本节只审composer显式采样层的功能、生命周期、数据副本与工作量控制，不重签导航或既有消息状态CSS。用户另授权本审创建src/lib/conversation-glass-sample.test.ts；实际只新增/编辑该测试并追加本报告，生产实现均由父线程修改。本审没有安装依赖、操作浏览器、构建、提交、推送或同步H5。

### 当前结论

| 审查范围 | 当前分数/状态 |
| --- | --- |
| sampled功能与生命周期（下列18项覆盖） | **9.1/10，限定通过** |
| SAMPLE-R18-P2-01：source身份及缺失后恢复 | **已关闭**，含不调用controller.update的scope observer路径 |
| SAMPLE-R18-P2-02：Chrome offscreen停止 | **已关闭**，doc可见但page不可见时旧副本与采集停止 |
| SAMPLE-R18-P2-03：descendant style／load快照失效 | **已关闭**，独立复现后验证修复 |
| F15 Nova save反馈小增量 | **原9.2/10延续**，14项新增定向验证通过 |
| native STATUS视觉与实机性能 | **未由本节关闭／未评分**，不能用源码或18项绿测替代 |

当前已测增量没有剩余阻断P2。9.1只针对明确列出的行为，不是整个STATUS、native或全站验收，也不是用平均分抵消旧失败。

### 诊断图片的实际读取边界

使用view_image实际看过：
- app-r18-native-diagnostic-sampled.png，SHA-256：9fee467b7dcc4ffbdb16056ae875964c41d37b9019e9c12874bc7fc84d03f885；
- r18-native-diagnostic-comparison.png，SHA-256：6d00d872d6d1518a0ed6bfb000d0864f502079d15e522c34d8b72128c22eec0a。

对照图中no-backdrop条带的矩形分界消失，restore/own-layer仍可见；sampled截图中输入区高光保留，当前画面未见同样明显分界。这支持当前桌面原型显示环境的A/B诊断与方案方向，但静态图不能证明连续滚动、软键盘、长列表或其它GPU/WebView已经通过。图中是Codex桌面原型画面，本审没有执行Android/iOS安装或实机操作，不能自行将文件名native解释成这些平台的覆盖。

### 修前真实失败记录（保留，不被绿色覆盖）

初版去除副本nx-conv-bubble标记后，本审新建轻量FakeDOM，仅替代document/节点/observer/RAF边界；直接执行生产mountConversationGlassSample与mountLiquidGlass，没有重写采样或renderer算法，没有jsdom依赖。

首次11项为8通过、3失败；补host/source旧回调后12项为9通过、3失败。收到Averroes的descendant style/load问题后，本审独立加入两条失败回归及一条bubble自身style正常路径，得到**15项：10通过、5失败，exit1**：

| 编号 | 最小复现及修前实际结果 | 影响与最小修复方向 |
| --- | --- | --- |
| SAMPLE-R18-P2-01 | 同尺寸同配置，移除旧list并插入新list，update后仍得到Old private body，而非New body | geometryKey在解析source前早退；必须独立核scope/source身份，换源先清旧副本再重绑 |
| 同一P2的缺失恢复分支 | 初次无source→后续补入→配置尺寸不变，仍为[] | 缺失不是可永久缓存的成功状态；需观察scope中的source到达 |
| SAMPLE-R18-P2-02 | Chrome、document.hidden=false，IO回调isIntersecting=false后副本数仍1；再发scroll，气泡几何读取由1变2 | 原offscreen清理仅适用!svgBackdrop，sampled需独立停止，而不能继承SVG例外 |
| SAMPLE-R18-P2-03（Averroes先发现，本审复现） | Uni image子节点仅height style从20px改80px，副本仍20px | 不能把所有style变化都当作“根气泡逐帧更新”而忽略；descendant需dirty |
| 同一P2的load分支 | 不投递mutation，只投递图片load，副本仍20px | load需使快照失效，不能只重算根气泡几何 |

两项自主发现P2已在聊天中即时报告；第三项明确归因于Averroes先报、本审独立复现，未重复冒称首发现。以上都是修前候选的真实失败，不指称修后代码仍失败。

修前关键指纹：
- sampler（已含测量类名修正，尚未修descendant/load）：d5f8b7d3337ffc8095b88661e5fa0e2949b958b92353d95d6d496d82426fb32e；
- renderer（尚未修source/offscreen）：2efc03e6abf128075749316e4d5f64ecfabc8b6c00241d5e800ff71380c37cb5。

### 修复依据与18项独立结果

父线程修后，本审先运行原15项全部通过，再增加3条未依赖controller.update的身份交错：

1. renderer在相同几何配置下仍比较实际source引用；scope childList observer发现当前source或scope变化时先停止旧sampler、断开旧observer并失效generation，再调度重建。初次source缺失也注册scope观察。
2. owner observer回调检查disposed与ownGeneration；已退役owner即使迟到执行，也不能清空新副本或再排一次RAF。
3. Chrome sampled也走offscreen停止路径；return后重建单实例。
4. sampler仅把根气泡自身style当作可逐帧复制的更新；后代style变化使快照dirty并清旧，load也标dirty。其自身根样式变化继续复用副本，避免无意义整树clone。

最终18项逐项通过：

| 覆盖组 | 实际断言 |
| --- | --- |
| 克隆隔离 | 根/子节点ID、autofocus、aria-live、inline on属性去除；输入/按钮/媒体/iframe/optics剥离；副本tabindex=-1；外层aria-hidden/inert；原节点不变 |
| 测量与递归隔离 | 副本改为nx-liquid-sample-bubble；全树nx-conv-bubble查询只返回原消息；source本身不包含采样层 |
| 空间范围与合帧 | blur24采样带为field±72px并受source viewport约束；四方向范围外消息不clone；30次scroll合成一个RAF，未变副本只clone一次；离开范围后移除 |
| host/source离开 | 已排队paint在旧host/source脱离时清空旧副本 |
| destroy迟到工作 | 旧RAF、mutation、resize、theme及事件在cleanup后不恢复副本、不再读气泡几何；observer已disconnect |
| 换host后的旧回调 | 销毁旧host/source sampler并挂载新者，迟到旧回调不擦除新owner副本 |
| document hidden/return | 隐藏当次清副本；回到可见后按当前正文重建 |
| 正文与子样式 | 正文变更先清旧再clone；descendant style及load均得到80px；根bubble style更新不重clone整树 |
| 透明偏好 | reduced-transparency和prefers-contrast分别切换solid并移除采样；恢复后仅一个新sampler，等价update不重复实例 |
| source替换/初次缺失 | 同geometry配置能换到新source；初次缺失后出现能恢复 |
| observer独立重绑 | 不调用controller.update，只投递scope childList，旧副本立即移除，新source在下一帧生效 |
| old-owner隔离 | 新副本建立后重放旧owner observer、旧source observer和旧RAF，新副本引用不变、无多余RAF |
| 同帧多次换源 | A→B→C发生于待执行帧前，只clone最终C，B没有被clone |
| 页面隐藏而doc可见 | Chrome offscreen清空；之后scroll不再读取气泡；重新intersect后单实例恢复 |

命令：node node_modules/vitest/vitest.mjs run src/lib/conversation-glass-sample.test.ts --no-cache

最终绑定指纹复跑为**18/18通过，exit0**；运行前后sampler、renderer和测试文件SHA一致。保留原P2测试名而不删红测、不降低断言；本审没有帮修生产。

### 性能与数据可见性的实际限度

- 已证的是采样成员的空间范围、事件合帧、复用和清理，不是“整页计算量固定”。paint仍对source内所有气泡做几何读取，入选气泡仍深克隆其子树；本节未测数百条历史、极长消息/大图的native帧率、内存或GPU开销。
- aria-hidden/inert、pointer-events样式和移除控件只能在本节证明DOM配置/handler隔离。FakeDOM不提供真实布局、浏览器焦点树、屏幕阅读器、图片下载、真实MutationObserver自动投递或WebView合成，不能冒称这些实景通过。
- scope/source引用及销毁代次已覆盖。未声称模拟了全部原生page缓存/键盘/zoom组合或renderjs重建行为。
- clone用的是当前消息DOM的副本，本审没有新增持久化、日志正文或上传。图片URL加载/解码及长气泡克隆成本仍需目标运行环境观察，不以单元测试耗时冒充性能结论。
- 现有HISTORY/REFLECTION已签业务行为不因这次采样测试自动重开，也不被这次绿色取代。最终native STATUS需用修后源码/构建指纹关联实景，至少补当前问题位置连续滚动、1→多行/键盘、离页返回和会话更换；无须重复此前全站矩阵。

### F15 save反馈增量复核

读取chat.vue:1640当前onQueueSave：先要求真实editing且canEditRemote；文本normalize失败才提示queue.invalid；UUID生成/冲突等saveRemoteEdit失败改提示security.opFailed；失效save直接返回；成功后按实际保存turn登记成功声效意图。nova.ts状态机指纹仍为f431161187b55488dccc79330014b51bdb6da4a2f9c206267d1f72d815d72c22。

只运行：
node node_modules/vitest/vitest.mjs run src/pages/support/nova-queue-page.test.ts -t "NOVA-RECOVERY-UX-01 save feedback" --no-cache

结果**14通过、67跳过，exit0**：三语UUID不可用/碰撞均保留编辑态、正文和原ID，不错误显示长度提示，后续可保存新turn；三语空白/超长仍正确提示输入问题；原文保存不取UUID不重发；结束编辑后的迟到save静默不改状态。本次仍有SFC harness的onMounted warning；并行定向运行出现一次Vitest附带WebSocket端口占用提示，测试断言完整执行且exit0，未停止任何其它服务，不将此视为真实联网验收。没有重跑整套Nova矩阵。**原F15 9.2状态安全结论保持，本次反馈增量通过。**

### 最终本审读取与执行指纹

| 文件 | SHA-256 |
| --- | --- |
| src/lib/conversation-glass-sample.ts | 9535907a0c279849c0af64b22af22fae8856cd536f60cc8ab5f43055c421b089 |
| src/lib/conversation-glass-sample.test.ts（本审新增） | 9436f43dee7151136444a6bfe94546431489a568a9fde7491b9d934951bc9fd1 |
| src/lib/liquid-glass-renderer.ts | 77bb273705b6b95abc4d9560ce01f0041e0b8ecffcafee9e373192e877c72939 |
| src/lib/liquid-glass-view.ts | a30f2d6deb80b04f396195d40ba0ff012e49d0fce38bfa46abe6b450c2215d11 |
| src/components/liquid-glass.vue | 8b1a65ef7bbdf3f89cd5393b26632e320841fbf8abbb0ede906f15b1e8d1859e |
| src/components/support/conversation-thread.vue | 487f5abadf02d059896208314a9b828dbac1dbdc2bcaf6db153660318498c919 |
| src/pages/support/chat.vue（Nova反馈增量） | 31ac825bc2e17c697e25a002ecb3e2ff7633e9bb0c4d2617dff56297992e8145 |
| src/pages/support/nova-queue-page.test.ts | e0091499328247101dca8b0be5f663adba56ec6de58f37aa3b09f1df19ceeda2 |

本轮结束状态：三个sampled行为P2在上述范围内关闭；sampled行为9.1，F15行为9.2保持；native STATUS视觉/性能仍未被本审签完。只写获准的新测试文件与本报告，未改生产。


## R18最终差距对照：C2xTeVme与IM18最小清单（2026-10-27）

本节对照本报告此前“IM18剩余最小实景清单”及sampled附录的剩余边界，更新哪些证据已经补齐、哪些仍未覆盖。旧低分、修前红测和当时待审文字原样保留，以本节判断当前缺口。本轮只读现有报告、manifest、runtime和截图，未运行测试、浏览器、构建、Git或H5；仅追加本报告。

**当前没有未关闭的本审行为P2。** SAMPLE-R18-P2-01/02/03保持已关闭，sampled行为9.1及此前18/18独立回归结论不变；HISTORY、REFLECTION、精确echo、旧owner声效、singleflight onKey、start→cid预算、Nova截止和F15等原关闭依据均保留。本轮不是重测，也不以新正常路径替换旧异步红绿证据。

### 最终版本与已经补齐的证据

已读取[r18-sampled-final-build-manifest.json](r18-sampled-final-build-manifest.json)，并实际重新计算其列出的5个源码文件及5个产物／日志文件SHA-256，全部与manifest相符。sampler、renderer、LiquidGlass、thread和chat的源码指纹与本报告上一节签核指纹一致；APP浏览器预览主产物为index-C2xTeVme.js，5237与5240读回也指向该产物。manifest的appHead是226249e2基线加当前WIP的记录，不能说这些WIP全在该提交内。已读web与APP资源构建日志尾部的DONE；未重新执行命令，APP资源编译不等于真机安装。最终源码／产物的这项关联不再列为缺口，H5仓库未同步。

| 已存证据 | 本轮实际核到的内容 | 当前差距处理 |
| --- | --- | --- |
| r18-sampled-final-scroll-runtime.json | C2xTeVme、浅390、24条图文；240个rAF样本，3195.7ms；中位13.3ms、p95 13.4ms、maxGap13.5ms，longTasks为空，clone范围1..4 | 已有这组往复滚动样本，不再要求重新跑相同场景。文件是汇总值，本审未从原始逐帧数组重算；不换算为GPU FPS、不声称所有像素全程无闪或数百条性能已验。 |
| r18-sampled-final-return-runtime.json | 实际离开后sampleLayers=0、inputs=0；回到CID1后samples=1、clones=3，sourceBubbles=allMeasuredBubbles=24，animations为空 | 离页清理、重进恢复、该次历史不重播和副本不增加测量计数已有实景。它与旧owner／source反序回调测试分别成立，不能互相冒充。 |
| r18-sampled-final-transparency-runtime.json | C2xTeVme；solid输入白底、ready蓝底，两个backdrop均none、samples=0，按钮约43.9962×43.9962；恢复sampled后samples=1 | 当前浅390偏好切换代表路径已有实景，不再列为“透明偏好完全未验”，也不为本次收尾另开明暗×偏好矩阵。 |
| r18-sampled-final-multiline-runtime.json | 浅320；textarea高144、scrollHeight192、scrollTop45.4545、length=selection=61；outline none，field约244.015×175.208，sampled／backdrop none／clone1 | 多行内部滚动与末尾可见有读回；不是手机软键盘证据。 |
| r18-sampled-final-user5237-runtime.json | 用户5237、C2xTeVme、CID2、33条、空draft、暗390；sampled输入sample1／backdrop none，scrollTop738.7878 | 原用户位置已有最终包的结果样本，不再要求重新首建或重做旧矩阵。是否与更新前完全一致沿用父线程保存状态的说明，本审本轮未重新读取旧state。 |
| r18-sampled-feedback-runtime.json | 该文件仍明确为DEQmPjoi：right和left各有start/end，elapsed=0.18、linear；send-tap elapsed=0.2；draft为空、飞机单位矩阵；4条running音频频率／调度记录 | 保留原版本的反馈证据；未改的反馈逻辑按既有签项继承，不改标成C2xTeVme。节点调度不是扬声器听感，飞机终态不是独立证明所有中间转角或失败／取消分支。 |

本轮用view_image实际查看以下四张final文件：app-r18-sampled-final-user5237-outside.png、app-r18-sampled-final-light320-multiline-outside.png、app-r18-sampled-final-dark320-multiline-caret.png、app-r18-sampled-final-light390-overlap-outside.png。可见桌面原型、当前输入及图文，320多行图能看到第8行末尾；没有把这些静图当连续录像或真机。未重新看旧全矩阵，也未冒称本人执行父线程的native拖动。

另读取视觉审查刚追加的“C2xTeVme最终本地视觉签核与最小未覆盖清单”：暗材质9.2、浅材质9.1、小屏／多行／用户5237结果／浅390透明偏好各9.2，均为其独立有限范围结论。该报告已不再以final320、多行、返回、透明偏好缺证为由挂起这些范围；本审不代签视觉分，也不把其两个新增观察点改称自己已复现的生产P2。

### IM18逐项差距归并

“继承”表示原版本的有效证据和关闭依据继续适用，绝非本轮重新运行。以下不新增平均分。

| # | 项目 | 当前行为／实景差距 |
| --- | --- | --- |
| 1 | LIGHT-01 | 原结构化浅色活动、主题及业务等价合同继承；本次composer不增加活动补验。完整运营Banner和真实发布仍属外部边界。 |
| 2 | MSG-03 | 标题同行、三语代表矩阵、R2 44px和通知读取口径继承，无本次新增本地必补。 |
| 3 | CTRL-01 | retry防重入、隐藏／账号代次和失败恢复、管理页紧凑布局继承，无需重跑旧读回矩阵。 |
| 4 | SHADOW-01 | 原领取CTA局部签项继承，无本次新增本地必补。 |
| 5 | SHADOW-02 | 原管理页／局部阴影签项继承；图文与composer的新显示证据归STATUS，不回头增加全站阴影验收。 |
| 6 | MSG-01 | 权威回执来源继承；旧气泡外左右布局已被用户覆盖，当前气泡内时间／我方图标归STATUS，incoming不伪造状态。 |
| 7 | MSG-02 | 快ACK同DOM、同时incoming等旧P2保持关闭；DEQ反馈证明左右180ms linear事件，C2返回记录没有历史事件；旧reduced路径继承，无需重放race矩阵。 |
| 8 | BADGE-01 | 数量口径、0/1/99、同token与入口签项继承，无新增本地必补。 |
| 9 | TOP-01 | 消息列表返回／设置／折叠签项继承；会话悬浮头的新增证据归CHAT-TOP。 |
| 10 | TIME-01 | 原5min已被24h规则取代；本审此前9.2及r18-24h-timeline-dom／boundaries证据有效，含86,399,999ms、86,400,000ms、跨午夜短间隔及历史首条分隔，不再列待补。 |
| 11 | ATTACH-01 | 灰禁用零caption、policy generation与可见／owner guard继承；既有image-preview记录／打开关闭说明与当前图文布局保留。不要求通过真实上传来签禁用入口；图片后加载的采样视觉同步另见L3。 |
| 12 | SEND-01 | HISTORY／overlay／followingTail行为已关；历史25→33→41→49→56及header约148.873→72.879的旧实景保留；新C2多行、滚动、返回与偏好读回已补。200ms／settled／reduced原依据继承，材质对应视觉限定分；不再要求同一套重新发送。 |
| 13 | CHAT-TOP-01 | topInset与迟到测量旧P2已关；presence三态记录、约44px返回、移除human头像和透明顶层已有证据，最终原会话图可见当前布局，无新增本地必补。 |
| 14 | AUDIO-01 | authoritative success／owner／初始与历史／重复门控原关闭依据继承；DEQ记录补浏览器running调度，不重测相同race。实际耳听、原生WAV及真机为外部边界，不伪称全部已听到。 |
| 15 | STATUS-01 | failed／unknown／原图标重试及状态来源原行为签项保留；当前C2材质、小屏和多行视觉有独立限定通过。L2色相时序和L3图片变化仍未有对应实景，不把它们挂回已关闭sampler三个P2。 |
| 16 | PREVIEW-RT-01 | 全局ID与首发可见、持久指纹、409正确payload回放、UNKNOWN／reset、裸路由与额度门的9.2依据延续；r18-bare-route落在messages且composer0的记录已在。原DEMO2失败不再当当前缺陷；真实后台不由fixture代签。 |
| 17 | SEND-TIMEOUT-01 | 12+3秒、echo／403／null及原key恢复行为9.2继承；r18-unknown-recovery记录21.543秒时已观测unknown及随后单条sent。该采样时刻不是精确超时触发时刻，无须重跑旧六红测。 |
| 18 | MESSAGE-LIMITS | 2000 UTF-16 guard、共享预算、start→cid transfer、HTTP Retry-After及Nova保留75秒已关闭；F15明确拒绝恢复和保存提示9.2也已关闭。旧R16/R17的2001保留／禁发／提示有实景；桌面真实粘贴／IME临界序列仍仅有L1所述缺口。Nova更低有效上限未下发已在PRD明确，不再误标为F15未实施。 |

voucher／trial／浅色顶部阴影维持之前单独限定签项，不增加IM第19项；本轮没有为这些无关文件重跑交互。

### 本地尚未覆盖的最小三点

以下不是已确认的新生产缺陷，不撤销原分数、不重新打开原P2。若最终报告采用已签的明确本地范围，可以带这些边界收尾；若要写成“此前IM18最小实景清单和最新两条视觉观察均全部闭环”，则还需要以下三点，完成且无失败后不再追加同类矩阵。

| 编号／归属 | 确切未覆盖内容与依据 | 最小可完成动作 |
| --- | --- | --- |
| L1：MESSAGE-LIMITS | 本审原最小表要求粘贴／组合输入临界过程。现存runtime-r16内overlength-2001及r17-final-light-320-over2000读回2001、禁发和提示；没有明确2000边界及真实paste／composition事件序列。多行61字符的final记录不补这条。 | 一次桌面输入链：真实粘贴到2000，IME确认后达到2001，验证不截断草稿／不误发／禁发及提示；删回2000后恢复可发送。记录长度、draft、disabled及是否派发即可，不必发出长文、不必三语全矩阵。这是本地可补项，与真机软键盘分开。 |
| L2：STATUS／SEND动态色位说明 | 最新视觉报告比较light320-multiline与outside图，指出整体发送气泡由偏蓝变偏紫；没有两时点同一bubble的rect／位置变量／computed fill。它不是输入内矩形断面，也尚不能判定为bug。本审只读该发现，不冒称已执行其像素抽样。 | 只在该场景稳定后，对同一bubble记录rect、viewport／composer高度、位置变量和fill，外部操作后再读一次；若首图测量未稳定，补时序说明；若稳定条件完全相同仍异常变化，再提出具体新问题。无需先改renderer。 |
| L3：STATUS采样图片更新 | 当前图文滚动已有图片；source descendant style／load的旧P2已有独立红绿测试关闭，但未存同一图片在composer后方从旧尺寸／未加载变为新尺寸／已加载的可视前后过程。 | 一组加载完成或尺寸变化的前后画面，配原图片／副本尺寸或采样读回，确认同步且无旧残影。只补这一个运行边界，不重做动态商品、所有SKU或旧图片矩阵。 |

L2／L3来自当前视觉报告的新限定观察，L1来自本审原清单。不要把它们合并成一个含糊“STATUS仍有旧P2”，也不要据此要求重跑HISTORY／音效owner／限流／权限／sampler的已关闭测试。

以下不再列作本轮必须新采的本地矩阵：320／390及双主题、多行末尾、用户5237原位置、返回清理、历史不重播、代表透明偏好、24h、presence、rim距离、failed／unknown、bare-route、已有按钮动画／声效节点。不同会话同一挂载实例的真实切换、所有页面缓存时序等没有由这一次return记录逐项证明，但owner/source异步P2已有独立测试关闭；本轮不将“所有生命周期都实景覆盖”新设为旧P2的关闭条件。

### 外部及发布边界，不能混作本地修复待办

- 尚无Android／iOS新安装、真机软键盘升降／安全视口、设备WebView／GPU、触摸反馈或扬声器听感；桌面native鼠标、模拟手机框、资源编译和AudioContext running不能替代。
- 真实TEST／生产鉴权、客服WS／权威已读、实际429与部署预算、Nova真实有效上限及完整运营Banner发布未在本轮运行。F15精确受理前拒绝已在代码／SFC／状态机范围签核；隐藏Nova不为拍图而开放，也不能称真实服务已触发过该拒绝。
- 240帧、约3.196秒、24条与clone1..4只约束本次桌面样本；数百条长历史、长时间、图片解码／内存、其它缩放或GPU组合没有被这个样本覆盖。无需把这些无限扩展为当前9.1行为的前置条件。
- H5仍未做本轮最终同步；本次APP预览的build:h5不是H5仓库验收。完整全站、无障碍设备及其它未承诺矩阵不在此次增量结论内。

当前主线程可直接引用最终manifest和两份独立限定结论汇总APP队列，不必再请求相同的滚动／返回记录或重新构建。若需清空上述三条本地实景边界，只补L1–L3；若保留限定验收范围，则在总报告明确列出，不写成“全18项所有分支／所有设备实测”。当前没有本审要求修改的生产代码。

### 本轮证据指纹与写入边界

| 文件 | SHA-256 |
| --- | --- |
| r18-sampled-final-build-manifest.json | 90a8a7df0635020ec69ccaca9865a501ba0488d8326f54a1133e3c440f6b1ab2 |
| r18-sampled-feedback-runtime.json（DEQmPjoi） | e5e395ea779c39d2156b0d433daeea5977d5c7f010a2124ce31cacfe9dc2a030 |
| r18-sampled-final-multiline-runtime.json | ca8e03e43a12cfaba6bd4ce63ae8f30910e4866f823b6e5eaff1cab61ade308b |
| r18-sampled-final-user5237-runtime.json | fd258c4f464e2bcf06a509bf20bbc575a642a98ac41ccd178179aef66ea7be71 |
| r18-sampled-final-scroll-runtime.json | 35c085bed8e2e75dc2e8fa6be624263840a511b5f0d4d8a4ce52ca4d8801f562 |
| r18-sampled-final-return-runtime.json | 1cc94be2adaad054b92af736d06b16b6c17130a80732ef48f96aa5bbd32ea24b |
| r18-sampled-final-transparency-runtime.json | 028ff1de201a5b5abb341b371edbfa2ef1a2e0ed95fd6eaf3ab343d91daafabd |

本轮只追加review-behavior.md；追加前文件SHA-256为b82f15fbc76c6bdf17b7629b4919e46c0a4bd3fe72457f87ce0343ee408771a6。没有新增／重跑测试，没有生产、fixture、截图或其他报告写入；没有浏览器、构建、提交、推送或H5同步。旧低分与日志继续保留。


## R18 C2xTeVme原生粘贴长度补证（2026-10-27，仅更新L1）

按用户要求，本轮只读[r18-sampled-final-native-length-runtime.json](r18-sampled-final-native-length-runtime.json)，并用view_image目检[app-r18-sampled-final-native-paste-2001.png](app-r18-sampled-final-native-paste-2001.png)。没有操作浏览器、复跑测试、读取在修生产逻辑或重做旧矩阵。

**L1中的桌面原生粘贴／追加字符／删除恢复代表路径已补齐。** 旧表“没有明确2000边界及真实paste序列”不再适用于当前证据；原业务guard签核继续有效。记录明确绑定index-C2xTeVme.js：

| 步骤 | 实际读回 | 限定结论 |
| --- | --- | --- |
| 原生粘贴2000个中文字符 | length=selection=2000，disabled字符串为false，hint为2000 / 2000 | 临界值保留，发送控件可用。 |
| 原生typeText追加1字符 | length=selection=2001，disabled为true，hint含2001 / 2000及越文超长提示 | 超限正文没有被控件截回2000，进入禁发并产生提示。 |
| 原生BackSpace删除 | length=selection=2000，disabled恢复false，hint回到2000 / 2000 | 删除至合法长度后恢复可发送。 |

三态textarea高均144px，scrollHeight均4367、scrollTop均4223.0302734375；这是该次末尾输入过程的读回，不外推为真机键盘联动。JSON未保存完整正文，故本审不声称逐字比对全部2000字符。用户执行说明及JSON method均说明仅QA、未发送消息；本审没有另查transport计数，不把控件disabled字段扩写为本轮独立网络抓包结果。

原生typeText追加字符**不等于已经执行IME候选词确认或compositionstart／compositionend流程**。本条关闭实际完成的paste→追加→BackSpace长度路径，真实IME组合过程仍明确未覆盖；不将其伪记通过，也不为这次补记新增测试矩阵。

截图同时可见输入框外的计数／超长提示与下方历史文字相叠。因此本轮只确认长度准入和恢复，不把它签成计数／提示布局通过。该布局缺陷由父线程交Jason做slot／field最小修复，待修后证据独立检查；用户通知的header“加载历史／日期叠字”及视觉8.6另行保留，本轮未复审该区域，不转授或改写该分数。

sampler行为9.1、三个已关闭sampled P2及其他已完成证据保持不变；新提示布局问题不挂回sampler生命周期P2。L2色位说明、L3图片变化及其余边界本轮均不重新判定。

证据SHA-256：

- r18-sampled-final-native-length-runtime.json：407be1b6e1bff3ff1b53d23fc17ef9cdb2d1f42533b24a14b098ca5fa1fdb67e。
- app-r18-sampled-final-native-paste-2001.png：0fbd19c8c708ee7ca549948cc344c41429254f250e21a9054718f99f2986fc41。

本轮仅追加本报告，追加前SHA-256为f57ace36ba31bf55d0ca2b0d51099c09fc8f8c85bc11cb2a6238f05fab4b0ac5；旧报告、分数和日志保留。无生产代码／测试／截图写入，无浏览器、构建、Git或H5操作。


## AUDIO-01本地行为最终数值补记（2026-10-27）

本节按用户要求补齐此前“P2已关闭但未给最终数值”的记录，依据本审已经独立执行的真实SFC／实际函数／Vue调度结果，以及已经保存的运行证据，不重新测试或检查Jason正在修改的布局。

| 项目 | 当前独立行为分 | 适用范围与状态 |
| --- | ---: | --- |
| AUDIO-01 | **9.2/10，限定通过** | 已审APP声音事件语义、权威成功反馈、接收筛选、owner与可见性隔离、偏好／gesture门、去重与400ms合并、资源清理；下列原P2均已关闭。不是实际听感或原生设备播放分。 |
| SEND-TIMEOUT-01 | **9.2/10，保持** | 原12+3秒、精确echo、unknown／failed区分和原key恢复的独立关闭依据延续；本轮未重跑或扩大范围。 |

AUDIO的9.2是本审对已有闭环证据作出的独立判断，不从Averroes或视觉评分推导，也不与其它项取平均。R12的8.6、R14的8.8及修前失败仍保留为历史；本节是后续修复后的当前数值，不抹去旧发现。

### 足以评分的独立依据

| 行为范围 | 本审已有实际结果及本轮核对 |
| --- | --- |
| 同owner连续发送成功不被按钮epoch吞掉 | R14真实ConversationThread SFC与实际audio controller执行：两次成功相隔600ms，第一次累计1，第二次累计2。按钮最新视觉代次与声音成功事件分开。关闭AUDIO-R12-P2-01。 |
| human／Nova失败重试成功反馈与重复完成 | R14实际Nova store与父级队列函数：failure后revision=0，retry成功=1，重复完成仍1；实际human retryHumanSend→sendHumanMessage成功revision=1。关闭AUDIO-R12-P2-02。快捷入口的统一成功通路为此前源码核对范围，不冒称已独立点击所有入口。 |
| 成功已入post队列后改变owner | R16实际post watch、真实Vue调度与audio controller：same=1；account／binding／composer／hidden分别0；合法first-create最终owner=1。成功事件精确JSON[account,binding,composer]与播放时当前owner／visible再比对，关闭AUDIO-R14-P2-01。不是用“切换后网络才返回”的正常路径替代该race。 |
| 接收筛选、权限及合并 | R12独立实际entrance＋audio controller结果：初始history、偏好关、无gesture均0；unlock后实时incoming到1；回执／历史前插不增加；同类小于400ms不增加、到400ms增加到2；system、同ID删除恢复、hidden、return历史和再禁用均不再增加。voice创建1次、销毁1次。 |
| 快ACK并存与同时incoming | R16对[H,I,C]、[H,C,I]、[H,C,I,P]→[H,C,I]三排列独立执行，receive均恰好1，hide／owner／history后没有额外receive。原ENTRANCE-R15-P2-01关闭同时覆盖该接收通知遗漏路径，不只证明视觉class。 |
| 运行调用的正／反例 | 本轮重新读取R13明确失败窗口events=[]、重试成功2个Oscillator＋2个Gain；R14的send-success-audio与live-incoming-audio-attempt各2个Oscillator＋2个Gain。DEQmPjoi反馈文件另有4条context=running的频率／调度记录。以上补充实际运行路径，不替代前三项异步隔离证明。 |

前述实际函数验证使用平台voice替身观察调用，保留生产事件与状态逻辑；运行JSON由父线程采集，本审独立读回，不冒称本人操作浏览器或耳听。偏好默认false、创建／播放异常不改变消息结果、hide／disable停止和dispose销毁等原读取结论继续适用。原生WAV仅曾核对RIFF格式、长度及路径。

本地事件行为的原阻断已经具有对应修后证据；**当前没有为了给出AUDIO这个限定分仍必须新增的本地检查。** F15保存反馈中仅真实成功增加revision的既有状态机结论也保持，不因本次补数字重开其整套矩阵。

### 明确不计分的边界

- 未独立耳听，未验证扬声器音量、音色、静音开关、蓝牙输出或OS音频焦点。AudioNode创建和context running都不足以证明实际可听。
- 未新装Android／iOS，未实测native WAV播放、后台恢复及各WebView播放许可。旧原生资源格式检查不是原生播放通过。
- 本地模拟transport不等于真实客服／Nova服务；隐藏Nova入口的队列语义由真实函数及SFC验证，不冒称产品入口已开放并完整实景覆盖。
- R13首次延迟窗口及旧live-receive捕获为空，仍保持原记录；不能被后续非空样本改写为当时有声。DEQ反馈仍属DEQmPjoi，不改标C2xTeVme。
- 分数承接已审的R16音频修复及其后C2已签范围；本轮没有读Jason在写的slot／field／header布局。后续冻结若影响成功事件、owner或生命周期，由后续明确委托增量复核，本分不代签在途WIP。

这些是本地行为评分以外的覆盖限制，不将“必须先耳听或真机安装”新增为原行为P2关闭条件。Averroes的源码独立评分仍由其报告负责，两个独立分数分别记录，不能把本节9.2当作双方已签的证明。

### 本轮实际读取及保存

本轮读取本报告R12接收门控、R14两处漏音关闭、R16旧owner及incoming三排列关闭记录；重读runtime-r13.json、runtime-r14.json的相关audio条目及r18-sampled-feedback-runtime.json。当前文件SHA-256：

- runtime-r13.json：f62f6dcdfb192ec2835c7fcfcdae117c1b60412d9a43c6fbca943a05bf6d3466。
- runtime-r14.json：65d8b2010bdb6fa1c3594e8d0f6d898db7b06ae5f51c3a3896d0017e08950405；该文件后续累加，保留前文当时a8683142快照说明。
- r18-sampled-feedback-runtime.json：e5e395ea779c39d2156b0d433daeea5977d5c7f010a2124ce31cacfe9dc2a030。

仅追加review-behavior.md，追加前SHA-256为760849ce26c8c74b3204af4f27077438e6088ad8abdcdc0b0c73c201857d2db2。无生产／测试／其它报告写入，无浏览器、构建、测试重跑、Git或H5操作；旧日志和历史分数完整保留。

## R18 historyflow／composer计数与fallback最终限定复审（2026-10-27）

冻结thread SHA-256：`5f78d1cc47445f6a4d41ba5f439e5340d6af11a710e355249a7f0840e1acbf3e`；chat保持`a166621ddfc02a7053ac6515d782c86c8b65b09bce503e1f60f1700c69a32bd2`。本审实际执行该指纹的SFC及模板，仅控制平台测量回调，无浏览器／生产修改／构建／Git／H5操作。

| 本轮分项 | 独立行为分 | 结论 |
| --- | ---: | --- |
| historyflow、前缀／顶部补偿、初始tail及失败fallback | **9.1/10，限定通过** | 本轮两个布局P2均关闭；正常分页补偿与用户离尾意图保持。 |
| composer计数／超限提示／policy-retry测高 | **9.2/10，限定通过** | 2000↔2001、retry增减及旧高度回调隔离通过；输入行高不变也重新测高。 |

保留修前结论：旧thread `bfc9afe6…`在empty0→非空后invalid／超时，真实模板仍输出`height:0px`和measured裁切类；两条红测属于同一个P2，当时**8.6，未通过**。首个baseline尚为null的自然流对照通过，证明原失败不是style取值错误。此前初始tail实际停在93.33而非末尾的问题也保留为失败历史；不以新绿覆盖旧记录。

本次独立`conversation-flow.review.test.ts` **17/17通过，exit0**，原两条断言未放宽。新增仅两例补足本修复边界：无回调499ms仍保留旧高度、500ms取消固定高度和裁切类；迟到回调不能覆盖fallback；重新测得88px保持scrollTop=120，随后增长至120px仅补32至152；旧owner的无效／迟到回调及超时不释放新owner已测88px布局。原初始tail例落450/450、前缀与header合并补偿两顺序、owner／host／hide／dispose、计数及retry测高均绿。未重跑其它IM旧矩阵，未将Jason的23项结果计作本审执行。

执行命令：`node node_modules/vitest/vitest.mjs run src/components/support/conversation-flow.review.test.ts --no-cache`。独立测试SHA-256：`881f30d719ac0edf538521fc4a5077f75333c8a576ebc229d7693e11c96e8fe1`。Node crypto导入按仓库已有Node-only测试惯例加局部类型说明；`node node_modules/vue-tsc/bin/vue-tsc.js --noEmit`亦exit0。

运行证据边界：5lgLz_SW的旧正常路径继续适用，未改标本次新构建；本审读回`r18-flow-tail-repair-runtime.json`的暗390首入／真实重入，均8条、top249.09、末气泡与field间距8.29px，浅320的top450.30／间距7.94为父线程实测通报。此前BEW实际native分页同ID误差0.0758px及2001→2000提示入glass／44px／间距7.94的已读回证据保留；locator click造成的40px位移不列产品缺陷。

**本次限定行为范围无剩余确定P2。** 以上分数不是新冻结截图视觉验收；新build局部实景由父线程补齐，不将5lg或BEW图片冒充新构建。真实设备软键盘／IME、真实服务及此前明确外部边界不入分，sampler9.1、AUDIO9.2、TIMEOUT9.2等旧签项不重开。仅追加本节并补本审独立测试，旧报告与低分历史保留；追加前报告SHA-256为`37532af76afae7d26c62ccb939c43a64ba0458d2177cd3122fb1f2f037d1d337`。
## R18 清空多行后重入：Uni旧transition回写增量（2026-10-27）

3jJgdd29／thread `5f78d1cc…`出现新的确定尾部P2：2001→2000→清空→Quay lại→列表演示客服，8条稳定后top=0、sh=1131／h=681、last.bottom=1049.896／field.top=607.528。因此上一节9.1及“无剩余P2”**不能覆盖这个完整重入序列**；5f78版在补入该实景后的historyflow分收回至**8.6，未通过**。此前fallback关闭、分页同ID误差0.07576及计数恢复分别保留，不以旧390重入或320 reload代签。

已独立读回`r18-closure-layout-runtime.json.data.light320Reentry`及`r18-reentry-scroll-trace.json`：t6549000.8时主滚动容器从450.303被主动写0，随后scroll事件及prop回写固化0。对照实际dist内index-3jJgdd29.js第25行137546／139684及已安装Uni源码，确为旧`transitionend`闭包捕获目标0后执行。只改后续prop为false或多等一次不能撤掉已注册监听；此前17项几何shim未执行Uni内部transition生命周期，故未覆盖此链路。

本次实际读到修复thread SHA-256：`4c339e53ce0999d74e98575bd5ea63a07c94093a7f1b0da352d4cdc301458b2c`，chat仍a166621d…；模板从首次渲染固定`:scroll-with-animation="false"`，程序定位不再开启容器动画。气泡左右180ms linear与发送按压200ms保持，不涉及会话语义或fallback改动。

本审只运行**6项通过／13项跳过**：两条原fallback红例、无回调500ms恢复且回测不双补偿、旧owner隔离，以及首次／重入两条Uni旧transition回写回归。新增回归用实际SFC模板绑定驱动本地安装的Uni `scrollTo2/_scrollTopChanged/_transitionEnd`函数；新定位后派发旧过渡完成，DOM与绑定均保持450。重入用例含2001→2000→清空→hide/show/reveal。平台尺寸与事件派发受控，不冒称本审浏览器复现。最初试跑因源码已删除scrollAnimated、fixture仍读内部变量而报错；改为读取真实模板绑定后通过，该fixture错误不计产品失败。vue-tsc亦exit0。独立测试SHA-256：`2f600f3b360bac354c93bb7a600b0ade88f0d327dd00c74915a4667e8211af56`。

**当前4c339版historyflow／fallback源码行为9.1，composer计数／超限／retry测高9.2延续；正式尾部实景闭环仍待修后同序列证据。** 没有发现另一个确定源码阻断，也不扩大其它测试。3j失败、旧分数和原始trace保留；Einstein的header9.2／counter9.1属于其视觉签项，本审未代作新的视觉评分。

证据SHA-256：closure-layout runtime `dffd590a708fdb83d8470419feb877f85e0a9a5f2ec2a723f61b001f77d31245`；reentry trace `b49a7b5f198754e4c25481da25c3826532ad9f2a487cb29d97c4d23e0fb92898`。仅追加本报告及修改独立flow测试；无生产、Jason测试、浏览器、构建、Git、H5操作。

### 4c339最终冻结确认

用户最终确认thread冻结为`4c339e53ce0999d74e98575bd5ea63a07c94093a7f1b0da352d4cdc301458b2c`，与上一节本审实际执行指纹完全一致，无需再跑。**整体本次layout行为限定分：9.1/10，通过源码／受控平台回归范围**；fallback与program scroll合并计入，非平均其它旧项。独立6/6（13跳过）、vue-tsc exit0沿用，不将Jason的9项计入本审数量。

程序滚动修复及fallback无剩余确定源码阻断，composer计数9.2和其它已签项保持。修后完整2001→2000→清空→back→列表重入的桌面实景待父线程新build补证；本审不提前宣布该实景通过，也不覆盖3j失败、耳听／真实手机／软键盘等未测边界。本次仅追加冻结确认，无新增测试或其它操作。

### PR5b0C9J最终backflow实景受理

已独立读回`r18-final-tail-runtime.json`并实际view_image目检`app-r18-tail-final-light320-reentry.png`。build为PR5b0C9J，sourceHash与已审冻结`4c339e53ce0999d74e98575bd5ea63a07c94093a7f1b0da352d4cdc301458b2c`及当前源码一致。浅320越文2001→2000→clear→back/list/reopen、再重复back/reopen，两次稳定记录均8条、top450.303／sh1131／h681，末气泡bottom599.593、field.top607.528，间距7.936px；截图可见末条完整位于空输入框上方。父线程确认读回等待超过旧0.3s过渡窗口；JSON未逐点记录等待时长，本审不另声称精确计时采样。

**本次layout行为维持9.1/10，限定通过；该完整backflow的尾部定位P2现已闭环。** 依据为既有实际Uni函数最小回归加本次修后同序列实景，未用reload替代重入。3j失败／trace与8.6历史不变，其它已签项保持；仅签本地APP桌面原型范围，不外推真实手机、软键盘或真实服务。无新矩阵、测试、浏览器、构建或生产修改，仅追加此补记。

证据SHA-256：runtime `ea2456cb3a4e9874f75410a8726d769bb70931188441721c0ed43830331740f6`；截图 `cdacecde61bca5ee032d24815f91e81044a7bb816dabfd9f7ef16964aa58dd03`。

### 566facc5合入origin/test后的限定语义复核

按父线程提供的566facc5普通merge origin/test（7c86e97c）背景，只读核对当前合并产物，**未发现新增阻塞或明确语义冲突**。`conversation-realtime.ts`第三个unavailable参数与store的`state(ready,_terminal,unavailable)`对应；正常续凭证保留已有故障至catch-up成功。连接级401/403终态停止重连／轮询，仍把在途命令作为UNKNOWN释放，不把连接终态误判为某条消息明确失败。已发WebSocket命令失败不自动再发HTTP，避免双投递。

本地12秒ACK＋3秒原key读回、读回403／null仍保留原不确定结果、精确echo确认、pending持久化、scope隔离及singleflight加入者onKey均保留。原create恢复仍校验原scope/key后重放，不因入口关闭另造key。这里的连接终态与明确业务ACK拒绝保持分开。

`invite-detail-sheet.vue`两处独立改动均在：规则区contactSupport按钮先关闭弹层再进入`/pages/me/support`，以及读取失败重试的text／medium按钮和纵向居中容器；原loading门与refresh处理保留。已签thread SHA-256仍为`4c339e53ce0999d74e98575bd5ea63a07c94093a7f1b0da352d4cdc301458b2c`，不重开layout与旧矩阵。

读取指纹：realtime `e9d833d0cd85902586ce3fcc3ad9a54d6d4d4e40fb308fe606beb214d18951d0`；store `b65b5422f0b41f0cfe55e04f820e1bcbd148cbf190218a4cc8bfc379450ac6a9`；invite sheet `7f7c07d977acab9616194e5bd74a3b9a6a3c7a2627073731bbac384328ea4540`。另只读核对app-conversation-realtime、delivery-policy、错误分类及相关既有测试源码，未执行测试。

父线程补充通报合并后5文件114项、type-check、browser build、APP compile通过，5237新K60P-cxP读回33条／draft0／presence online／尾距7.888；本审将其作为父线程验证记录，不冒称独立重跑或浏览器操作。本轮仅追加此短节，无生产、测试、构建、浏览器、Git或H5操作；既有签项及外部边界保持，审查结束。