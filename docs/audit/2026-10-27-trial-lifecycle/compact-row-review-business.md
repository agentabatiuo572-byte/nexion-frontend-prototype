# 独立业务与需求覆盖复核

## 最终业务复核结论：当前 CBiChJVg 构建

**UI业务/交互完整性：9.3/10，P0=0、P1=0、P2=0。经济方案设计：9.3/10，P0=0、P1=0、P2=0，仍待批准、未实施。** 本节是最终结论，取代下方历史阶段的pending状态；经济评分只代表可决策设计，不代表金额逻辑已上线。

评分依据是整页源码与原行为检查、当前构建独立操作、已读的76项测试回执，覆盖管理页统一列表与操作、Home导航、Earn互斥、状态真实性和原权限边界。未给满分：本审查未独立执行真实后台交易、原生硬件及完整视觉矩阵；当前模拟样例没有可用置换资格，因此置换按钮/阶梯保留的证据来自源码与行为测试，不能声称此次浏览器点过它。

### 最终源码、构建和证据

- 基础HEAD：`ec67740e2003bfcf2a2527f0180f109f0f997bb2`，加本轮末次工作树修补（管理页倒计时字体/窄屏字号、试用三语简短未知状态）。本审查已读对应diff，动作/金额/配置逻辑未改。
- sourceFingerprint：`ea00f154614da0f29b0335d496433da7e185ddb97bcbfb240c4e8c0f7bd45139`；buildFingerprint：`30fc16e5e82cb9ac1180f4968223d56a7397659d1fc8fd4b22c4f6f463bbabb2`。
- 实际p1 iframe入口为`http://127.0.0.1:5251/assets/index-CBiChJVg.js`，进入管理页/PC页/Earn/Home详情后均使用该当前bundle，不是旧包复验。
- 最终单文件SHA256：`trial-device-row.vue`=`fdfabb78c2a1dd5afe6390c5951d01bff516466d7bbd7b27bf1a818b8e67698f`；`trial-fleet.ts`=`e49ba1a9a3333f590ecd0e9b9a78d88966c2e108379fe335226df680d4d8ba31`；`dist/build/h5/index.html`=`c19d018d3675864293850d6d1957901a089e58c75ded28d0eac0fa145eb94091`。
- 已核末次`checks-short-status-from-thread.json`：exec-8311e28a为76/76及生产H5构建；exec-962ee3e1为上述指纹与native app编译，两者completed/exit0。此前type-check和三语镜像通过见`checks-integrated-from-thread.json`；没有为末次局部文案映射重复跑它们。
- 本审查独立运行：`business-final-runtime.json`；脚本`business-final-01/02/03/04b/05.mjs`，同一Ego TaskSpace2/p1。一次旧snapshot ref失效没有触发动作，重新snapshot后用源已知`.spv-back`继续；这属于自动化定位恢复，非产品失败。未新建空间、未finish。
- 已保存且实际看图：`business-final-paid-expanded.png`（键盘展开证据）与`management-delivery-390-zh-dark.png`（390×844手机区域干净交付图）。p1最终为390/zh/dark管理页，三行均aria-expanded=false，焦点BODY；已立即交回主线恢复用户状态。

### 独立实操结果

| 操作 | 实际结果 |
|---|---|
| 管理页初始 | 一条试用与两条已购共用设备列表，容量3/6；普通body=0、试用body=0，试用状态在线，机型图存在。 |
| 普通行Enter展开 | aria-expanded=true，规格`$6.20/天 · GPU`与“取消激活”入口出现，未emit停用或打开支付。 |
| 普通行Space收起 | body数量回0，动作消失；仅收起，不改变设备。 |
| 试用Enter展开→取消试用 | 弹窗明确说明取消会清零抵扣/UVT及等待规则，提供“继续试用/确认取消”。 |
| 选择继续试用 | 弹窗关闭、取消按钮恢复；服务端演示读回trialRow.state=ACTIVE，trial行仍1，createdOrders=0。 |
| 试用Space收起 | body数量回0。 |
| PC紧凑入口“打开” | 路由进入`/pages/compute-share/download`，下载页面挂载；未复制地址、下载或安装。 |
| PC页返回 | 正确回到`/pages/me/devices`。 |
| Earn互斥 | 试用Enter展开后true；点第一台普通设备后trial=false/body0、paid=true。 |
| Home试用整行 | 正确进入`/pages/me/trial`，仍显示现行“按当前已累计抵扣结算，购买后试用结束”，没有偷换新奖励承诺。 |

完整未知→恢复、多语和窄屏布局由独立视觉reviewer负责，已按主线通知完成36布局与最终6格补验；本审查不把那批记录冒充自己执行。短状态“状态未知/Status unknown/Chưa xác định”仍以presentationReady失败优先，展开体保留错误说明、重试以及购买/取消禁用条件。末次76测试仍覆盖这些条件。

### 范围限制及结论

本次是APP源码在5251隔离模拟服务的UI/交互验收，不等于正式部署、H5同步或真机验收。没有执行真实取消/停用/置换、付款、下载、退款或奖励发放；真实后台的原子交易与退款属于既有/后续经济实施验收。管理页pending/unconfirmed、功能关闭/容量未知/取消失败和置换资格恢复由回源与76测试覆盖，本短浏览器链没有重新制造这些状态。

大白话：管理页已统一成清楚的设备列表，展开、取消出口、键盘和页面跳转实际可用；早购方案也已算全权益并多给固定优惠，但新金额和旧单范围仍须主人明确批准，当前支付继续旧规则。

---

## 以下为历史阶段记录（最终状态以上节为准）

## 整页管理UI源码复核：合入R20后 ec67740e

本节是最新UI复核。后续小节的旧UI source/build与评分仅为历史；经济提案9.3的待批准设计结论保持有效，未改经济提案/原型/产品源码。审查人`/root/trial_purchase_analysis`未参与本轮UI实现，只写本外部报告。

**范围**：按主人“管理页卡片、字体、按钮混乱”的整页请求重建检查项，覆盖设备容量、统一设备列表、待激活、状态待确认、购机入口、PC/手机连接提示、行展开操作和失败恢复；不是只检查试用行。

**当前源码发现：P0=0、P1=0、P2=0。运行与最终评分：pending。** 本次未获p1窗口，按主线要求未操作p1；视觉由另一reviewer独占。源码空发现不能替代当前build实景验收。本节不会复用旧运行报告给新源码判通过。

### 绑定快照

- APP HEAD：`ec67740e2003bfcf2a2527f0180f109f0f997bb2`，本轮UI提交：`de69dc4b90262c0085f48db96ae0b5d7c013e257`；对比基线`f7c9de55`。当前tracked工作树无修改，只有`.cache/`未跟踪。
- 合入R20对共享`compute-share-entry`及Earn的变化已一起回源，未将合并前文件当最终源码。
- 源文件SHA256：`src/pages/me/devices.vue`=`40ef1162c018e4057cae373633522822d9460e7581d80cf7a102b0a60eba6996`；`src/components/me/device-inventory-row.vue`=`f2f963f4767ebc64c2f1edfe872d61b7f24673d38358da1483a8ef94d07e167b`；`src/components/trial-device-row.vue`=`76fdc6f39fb0b7a72d427aa9ee8f68f4597cf2050dcadd82dd1d45f81418d836`；`src/components/earn/compute-share-entry.vue`=`a3737e19480496d798a7ece1334392b35f99feffa8a16a81508b417b39c1728e`；`src/pages/earn/earn.vue`=`41c4d7bd27d57194602d347d121951cb2c71a59db07b1466d5c3683b07197dd9`。
- 当前集成构建证据`runtime-integrated/report.json`：sourceFingerprint=`5417ab89749c563e0655261d7bda19328e5018bb75f080ab7bb60b10e87eb38c`，buildFingerprint=`ee3de3c0c7f0ec0c1de6ecdb953502cc205260240b8ee35879a6fe61affb42d9`，入口`index-wnMrmWBY.js`。报告390/zh/dark完整链pass=true、errors=[]；管理行64.1875px高度、13px/600字体、x=85一致，角标inside/top均true。这是主线运行证据，本审查独立p1实操仍pending。
- 已读`checks-integrated-from-thread.json`五个原始命令回执：76/76与三语镜像（exec-6ed604b6）、type-check（exec-7d9aecc0）、生产H5构建（exec-836e141e）、当前390运行（exec-d399d0e0）、native app编译（exec-7029114a）均completed/exit0。不重复运行。native编译不等于真机验收；H5构建不是已部署。

### 整页需求与交互证据

| 要求/反例 | 回源证据 | 源码判定 |
|---|---|---|
| 单一层级设备列表，试用不另成营销卡 | `devices.vue:60-84,649-653,759-761`：试用在activeDevices前，同一list背景/边框；试用host的背景/阴影归零。列表计数是可见行数量，容量meter仍使用原`slotsUsed`。 | 覆盖；字体/间距最终需截图 |
| 默认收起，规格与操作不丢 | `device-inventory-row.vue:3-40,74`：header仅图片/机型/状态，body按expanded渲染规格、待停用说明、抵扣阶梯、置换、动作；展开本身不emit停用。 | 覆盖 |
| 真机型图片，未知不冒充S1 | 普通行`76-78`按kind查`getProductMedia`，phone单独图；未匹配用中性图形，试用未匹配不造商品图。已核S1/Pro/phone/cloud本地文件存在，产品目录另含Pro v2/Rack。 | 覆盖；最终加载待浏览器 |
| 统一标题/状态/按钮字号与触控 | 普通行CSS`98-121`、管理页`sectionTitleStyle/phoneActivation*`、PC compact CSS：标题13/状态12/动作13，操作最小44px，长说明可换行；列表和连接入口各有一致样式。 | 覆盖；320/长语种/亮暗实际测量由运行门 |
| 试用图上方角标及三态 | `trial-device-row.vue:5,47-48,68`：角标top:2px且在art内；presentationReady=false优先未知，active在线、grace离线；不会将error保留快照标在线。 | 覆盖；到期调度仍服从原服务端状态 |
| 普通设备状态与待停用 | 普通行`79-84`：activationUnconfirmed优先未知，未激活显示库存状态，已激活走`deviceOnlineState`三态；pendingDeactivate在收起行就提示，展开仍有说明，remote pending禁止重复停用。管理页`72,78`传运行可信与禁用标志。 | 覆盖；不认证心跳/收益 |
| 待激活、容量未知、待确认 | `devices.vue:88-139,265-285,387-414`：三个来源筛选未改；待激活按容量/权威就绪禁用并有原因；待确认单独显示且disabled，无激活事件连接；handler再次拒绝不确认设备。 | 覆盖；无新增激活权限 |
| 置换、停用、取消流程保持 | `devices.vue:80-82,107-109,376-447,541-562`：原handleTradein/Deactivate/Activate/Cancel仍连接。运行任务使用wait/force/dismiss sheet，无任务先确认；试用取消先确认、busy、账号epoch复验。 | 覆盖；具体弹窗取消/错误重试待实操 |
| 权限及原生能力边界 | `show-action=canControlDevice(d)`保留；handlers仍检查；手机激活CTA仍受nativePhoneAvailable且处理函数复验；H5手机只读规则未改。 | 覆盖 |
| PC紧凑只作用管理页 | `compute-share-entry.vue:2-18,47,54-60`：Earn分支优先，compact默认false，devices显式compact；配置未ready或关闭不显示/不导航，仍去原download页，满槽保留说明。 | 覆盖；合入R20 artwork未被compact吞掉 |
| 首次加载、读取失败、旧快照 | `devices.vue:27-44,244-255`：首读loading/error、旧快照stale提示与重试保留；`use-trial-presentation`让未知金额为null/界面“—”，动作关闭；普通已购快照不会因试用读取失败消失。 | 覆盖；不制造0金额/0容量 |
| 经济边界 | 对比`src/store/free-trial.ts`、`api/trial-api.ts`、`checkout.vue`、权限/槽位policy无改动；新提案仅文档/原型，未把补足/10USDT写进现行支付。 | 覆盖 |

相关测试从真实Vue脚本/模板编译执行，并非仅字符串哨兵：普通行三语展开、真实图片、三态、pending提示、只读/禁用；管理页分区顺序、三种行与原handler连接、手机能力门；PC三语compact、旧默认、Earn优先、功能关闭；试用三语与错误优先未知、互斥、原金额、取消绑定及失败恢复。测试局限：模板测试不能证明真实CSS尺寸、图片加载、全页视觉或真实后台写入，所以运行状态仍pending。

下一步只需在主线提供的当前build及p1窗口内补必要整页操作：默认行/展开规格和置换入口、停用取消、试用取消拒绝与失败重试、状态未知恢复、pending/unconfirmed禁用、PC路由与Earn互斥。真实native设备和部署后台支付仍不在本次UI实景范围。

---

## 最新复核：2026-10-27，图片角标＋固定早购立减提案

本节取代后面的历史快照结论。审查人仍为`/root/trial_purchase_analysis`，未实现产品代码；只改独立报告/证据文件。当前正式源码只有队列UI修补，新经济规则尚未批准、未实现。用户要求“现在买更划算”是设计目标，不是同意示例10 USDT、完整期补足或旧单范围。

后续UI需求更新：主人又要求管理页整理、图片角标移到上方，以及在线/离线/未知状态。主线正在合入R20；本节UI源码/构建是该更新前快照，**UI最终评分继续pending，不构成R20验收**。按主线要求暂停p1操作，只完成独立经济设计审查。下列B节经济设计及p2实操结论仍适用。

### 当前证据绑定

- APP HEAD：`1c947332c2b0d366464ec28c81116a32887d94ba`；backend参考HEAD：`6fc6bd7bf5cd44cab2b438f81a3779b4b9141529`。
- 已读主线最终运行证据`runtime-final/report.json`，sourceFingerprint=`891aadd6fe2cdbf739ad4cb290e4c399d0e22941233279be570d98360f4b1e95`，buildFingerprint=`0d0838fb8c70f7a2d44974bccc4547a7418a8d6467bb7edfdb2b8c4e8026573c`；pass=true、errors=[]。
- 本审查回源确认`src/components/trial-device-row.vue` SHA256=`c261fd63658b1a98c01c399043842dfd9ddd1a2693bb058059c77725c83e1c7b`，`src/i18n/trial-fleet.ts`=`7ee3b4ea8d049b8ccc036aa24d7516bbf880682112c2bb49eb92bdea0268622d`，最终`dist/build/h5/index.html`=`03be3a0bd55a688307e0d325db337eb30610e5070c31f5b239b3370516f4e6e7`。
- 当前提案`PRD/proposals/UVEL_试用提前转购权益衔接_20261027.md` SHA256=`8330283e01835c792decf1e3dadbcb67e131fe31df12ac19258b50ee6a9f13ec`；原型source与served SHA256一致，均为`0e414aa1bb7065cc87022afe1a8cfe061444e9a8d3bac3855a80c48444fe28ff`。
- 本审查独立使用同一Ego TaskSpace 2/p2，未新建空间、未finish、未操作其他端口。实操记录`business-proposal-runtime.json`、截图`business-proposal-runtime-final.png`，脚本`business-proposal-runtime-20261027.mjs`。原型无支付连接，点击“模拟确认支付”只改变演示状态。
- 已阅读当时最终行为测试源码，未重跑已通过测试。已核对`checks-final-from-thread.json`原始回执：build命令`exec-502fd3ea-b0fd-42d5-9eba-c0d2e6d18cee` exit0；type-check及41/41命令`exec-bc47c2ce-a0f2-4c53-92a9-afc2337d290e` exit0（19+11+11）。该文件也含历史32/32，不能将其混用。R20后须绑定新检查结果。

### A. 当前UI业务覆盖：源码复核通过，独立p1实操待释放

当前源码P0=0、P1=0、P2=0；最终业务评分待本审查p1操作后落定。视觉矩阵由另一独立审查人负责。

| 要求 | 当前回源证据与判定 |
|---|---|
| 图片小角标、标题只有机型 | `trial-device-row.vue:5-6`：image-badge放在图片art内，identity只包含机型和状态；三语`imageBadge`为短文案。测试遍历三host×三locale并断言title没有badge。 |
| 默认收起，和付费行同密度 | `13-24,42-43`：金额、进度、说明、动作均只在展开body；默认false。主线最终390运行几何为trial/paid同88px、透明底、机型文字x=92、相同S1图片。 |
| Earn互斥展开 | `earn.vue:95-96,247-249`与`empty-slots-hint.vue:6`共享expandedId；测试执行实际toggleDevice与父模板连接。 |
| Home进入详情 | `trial-device-row.vue:48-50`和Home variant；Home不渲染展开体。 |
| inventory取消/拒绝/失败/重试 | `devices.vue:80,544-564`保留确认、busy、账号epoch与状态复验；错误恢复由行为测试覆盖。 |
| 未知金额与可恢复失败 | `trial-device-row.vue:15-24,46`：未知为“—”，无伪造进度；危险动作禁用，详情/重试可达；原i18n继续明确抵扣不可直接提现。 |
| 不伪装已购、不改计数 | 独立`trial:current`身份，diff无设备模型/金额store修改；Home/Earn/Inventory仍按权威已购数+试用占位，读取失败不删除已购快照。 |
| 宽限期 | 状态显示“抵扣可用”，展开说明试用已停止；无取消按钮，不暗示仍产出。 |

### B. 新经济提案：设计评分9.3/10，P0=0、P1=0、P2=0

评分对象是“早买更划算且工程受控”的方案可决策性，**不是经济代码或生产上线评分**。目标符合9.5、完整边界9.2、前后端一致9.3、工程可控9.2，均分9.3。未满分原因是退款逐资产冲正/人工恢复、旧单发布范围及配置金额仍需在获准实施阶段落成详细契约与测试；提案已经明确这些是启用前置条件，不能当作已实现能力。

| 核对项 | 证据及判定 |
|---|---|
| 早买确定更多利益 | 提案21-23、47-55：同快照、商品价、通用优惠且应付足够时，早买完整试用包不减，再固定额外立减E；没有把未来正式设备收益提高当保证。 |
| 不漏等待收益 | 115.56 USDT完整包按旧口径拆成50抵扣+65.56购后奖励，完整UVT30；12h未累计96.30 USDT+25 UVT补足，不能只补cap。 |
| 不伪造累计 | 提案38-40、45及原型明细，实际19.26/5与补足96.30/25分列；保留原shadow，建议新增nullable settled_trial_nex只代表结算总量。 |
| 到期与延期 | ACTIVE有效才有额外E；GRACE/EXTENDED保留既有通用优惠与完整原期权益，延长使用窗口不扩算日额。实施需以服务端原T判定，避免调度滞后ACTIVE越期享E。 |
| 低价/叠加封顶 | 应付低于E仅减至0，展示实际额外金额；不现金兑出未用E。抵扣与通用优惠不兼容的低价单明确拒绝并说明，不能偷改余款口径。 |
| 配置/发布 | 唯一金额参数earlyPurchaseDiscountUSD；最新提案0=整套新方案不启用新报价，版本变化且实付增加须重新确认。已成交权益不能因后续调0回收。 |
| 成本可审 | 相比等满期用户新增E；相比原本会早买用户新增未累计USDT/UVT及E。没有只按50抵扣上限估成本。 |
| 售罄、容量、余额、准备金 | 任一失败整笔不成功、不消费试用/奖励资格，待发奖励不能当现有余额；未增加擅自延长试用规则。 |
| 幂等与退款 | 原订单/领取/版本/流水唯一性，未知结果先查原意图。退款按实付基数、关联奖励冲正；已消费不能隐形负余额/扣其他设备收益/暗改退款权利。未接通不得启用。 |
| 新旧单 | 历史终态不追补；旧有效单只有发布明确兼容政策后采用；原durationDays固定。新增结算列旧NULL回落、新领取轮次清空。 |
| 工程范围诚实 | 复用原convert、policy键值表、管理路由、订单/双币奖励ledger和退款链；需要配置白名单/seed、1nullable列、资金证明SQL、state/convert报价、APP详情/结算/规则三语及测试。不能声称只加一个if或只改显示。 |
| 审批边界 | 提案3、82及原型顶部明确待确认；未获金额/范围批准前不覆盖现行主PRD，不实施后端金额。 |

独立p2交互结果：

| 场景 | 实付 | 真实累计 | 补足奖励 | 状态 |
|---|---:|---|---|---|
| 12小时 | 1,239 | 19.26 USDT / 5 UVT | 96.30 USDT / 25 UVT | 试用中、有额外10 |
| 1天 | 1,239 | 38.52 / 10 | 77.04 / 20 | 试用中、有额外10 |
| 2天 | 1,239 | 77.04 / 20 | 38.52 / 10 | 试用中、有额外10 |
| 到期 | 1,249 | 115.56 / 30 | 0 / 0 | 试用已结束、额外10隐藏 |

每个场景完整试用包均为50抵扣+65.56 USDT+30 UVT。此演示不计通用优惠；独立分析报告的promo20示例早1219/晚1229是另一个已注明条件的例子，不能混为金额矛盾。

到期确认弹窗1249，取消返回未完成；12h确认1239，模拟确认后出现“模拟结果/未真实资金操作”；空态隐藏产品和利益并可返回；报价失败隐藏可购买内容，重试恢复；售罄禁用购买；加载禁用确认。原历史B-P2-01“到期状态不变/空态仍显示产品”已实景关闭。本原型只用于决策演示，不能代替账户、真实交易、退款和资金核对验收。

### 当前结论

UI业务源码已覆盖此前小角标要求及关键交互，最新R20管理页、角标上方及在线状态仍在实现，最终独立p1操作待补。新方案设计达9.3，可供主人决定；仍需主人明确批准完整期补足、额外金额与旧单范围后才可实施经济逻辑。

---

## 历史快照记录（以下不作为当前验收）

审查人：`/root/trial_purchase_analysis`。日期：2026-10-27。

审查性质：只读产品源码、PRD 与提案，未实现这轮 8 文件 UI 修补。此前提供过提前购买经济分析，但未修改经济代码或撰写被审的提案文件。本报告区分现行 UI 与待批准经济提案；用户要求先举场景示例，不构成对新金额规则的批准。

状态：以下是上一快照的源码/契约审查记录，**不能用作当前最终验收**。用户随后要求改为图片上的小“试用”角标，且经济目标从“早晚同权益”升级为“早买额外更划算”。UI待最终新bundle实操；旧提案最终评分已暂停。最新经济设计分析见同目录 `early-purchase-analysis.md` 的完整期补足＋ACTIVE固定立减方案及工程清单。用户仍未批准金额改动。

## 绑定快照与检查证据

- APP：`D:/WORKS/PLAN/.wt/uvel-trial-20261027-app`，HEAD `1c947332c2b0d366464ec28c81116a32887d94ba`。
- backend 参考：`D:/WORKS/PLAN/.wt/uvel-trial-20261027-backend`，HEAD `6fc6bd7bf5cd44cab2b438f81a3779b4b9141529`；本轮无经济代码改动。
- UI 8 文件组合 SHA256：`503a31be79061686dcd22437d651eeaecb161a3c571c93a51aac147fcaf05483`。
- 提案与原型组合 SHA256：`1d35e386567953d4807fd8dc8ac4448105b1ea9bc512c7b675c9864032f13ae3`。
- 组合算法：按下列顺序，各行 `相对路径 空格 小写文件SHA256`，LF 拼接、无尾换行，再取 UTF-8 SHA256。
- UI 顺序：`src/components/earn/empty-slots-hint.vue`、`src/components/home/my-fleet-section.vue`、`src/components/trial-device-row.behavior.test.ts`、`src/components/trial-device-row.vue`、`src/components/trial-fleet-integration.behavior.test.ts`、`src/i18n/trial-fleet.ts`、`src/pages/earn/earn.vue`、`src/pages/me/devices.vue`。
- 提案顺序：`PRD/proposals/UVEL_试用提前转购权益衔接_20261027.md`、`PRD/prototypes/trial-early-purchase.html`。
- 构建 `dist/build/h5/index.html` SHA256：`248662ccb127f892177b9c49774bd9e5bb9f78445109820acac69c3a1cac11c7`。
- 构建试用行 `assets/trial-device-row.6_hL8fMS.js` SHA256：`ba39ce0fd8c9eab10003b11a3d0f99ae1987298cb8c4ad36051f0f05efb1d056`。
- Earn 构建 `assets/pages-earn-earn.BVglQpyB.js` SHA256：`72177b374fb9bcb1ee6a4ad352f8e94e9d0e117867175164fe1a136fdbf46812`。
- Inventory 构建 `assets/pages-me-devices.4Thl0KZ3.js` SHA256：`f3f98087df87084740be4feab140714a4870e97b9a0e4e96915d9dadf30a056c`。
- 修正后的原型源码与 served `dist/build/h5/trial-early-purchase.html` SHA256 均为 `80e50dec340d3385ffd8cb4b5bf4cb4d3a1e53d22f57317d0a94a0e22824b375`。
- 已读取 `checks-from-thread.json` 的原始 Codex commandExecution 回执：`type-check` exit 0；`build:h5:prod` exit 0；三组行为测试 32/32（trial-device-row 10、trial-fleet-integration 11、use-trial-presentation 11）。未重复运行。
- 生产构建回执包含既有静态资源解析警告；这些警告不被改写为失败，也不用于证明浏览器资源一定可见。

## A. 现行试用行需求覆盖

上一绑定快照的源码及行为契约评分：**9.2/10（已被新角标需求取代，不是最终评分）**。该快照源码 P0=0、P1=0、P2=0；新版最终实景结论待补。评分不代表完整系统、H5 或经济规则已验收。

| 原始要求/边界 | 回源证据 | 判定 |
|---|---|---|
| 默认行与普通设备同密度，仅机型、标签、剩余时间 | `trial-device-row.vue:3-13,38-43`；默认 localExpanded=false，金额、进度、双按钮、取消都在 v-if 展开体内 | 源码通过，几何交给独立视觉实测 |
| 真实机型图片，不用虚假资产 | 同文件 `5,44` 使用产品图目录；未知 SKU 不造图片；独立 key `trial:current` | 通过 |
| Earn 试用/付费设备互斥展开 | `pages/earn/earn.vue:95-96,247-249` 同一个 expandedId；`empty-slots-hint.vue:6,31-32` 传递受控展开及 toggle | 通过；集成测试实际抽取 toggleDevice 及模板连线 |
| Home 整行进入详情 | `trial-device-row.vue:47-51` 的 home 分支进入 `/pages/me/trial`；`my-fleet-section.vue:6` 传 home | 通过；不把试用 id 发给付费设备接口 |
| Inventory 展开保留取消与明确确认 | `pages/me/devices.vue:80,544-564`；仅 active/权威可操作，busy 防重复，确认后再查账号/epoch/状态 | 通过；取消拒绝/失败恢复有行为测试 |
| 失败可重试、未知不写零 | `trial-device-row.vue:15-19,46`；未知金额为“—”，进度不伪造 aria-valuenow，仍可进详情，危险动作关闭 | 通过 |
| 当前抵扣与预计值不混淆 | 展开体 `15-18` 保留不同标签和不能提现说明；`use-trial-presentation.ts:49-65` 远端抵扣不按当前促销反算，延期不扩算原试用期 | 通过；不是新增奖励展示 |
| 不伪装付费资产、不改计数 | diff 没有 store/device model 变更；Home 继续 `activeSlotCount+reservedSlots`，未知显示“— / —”；inventory保留已购快照 | 通过；试用转终态只移除独立行 |
| 三语与宽限期语义 | `i18n/trial-fleet.ts` zh/en/vi 同构 active/graceBadge；grace 不显示取消、展开明确“试用已停止，抵扣仍可用” | 源码/三语行为通过，布局待实测 |
| 正式文档同步不引入新金额规则 | 主 PRD §5.6（983 行）及 FEAT-TRIAL04 的差异仅约定默认紧凑、互斥展开和取消保留；产品日志明确经济提案未实施 | 通过 |

回归测试覆盖了未知金额、busy、active→grace、未知 SKU、终态移除、Earn 互斥、已购设备保留、容量未知、取消确认跨账号绑定与失败恢复。测试没有把原型补足金额作为当前结算断言，未放宽真实 backend 权威金额门。

## B. 待批准经济提案与可点原型

旧目标下的业务可决策性评分曾为9.2/10，**因用户改为“早买额外更划算”，此评分暂停适用**。下面保留已核过的同权益基础，不把它当作满足最新目标。新版须另核ACTIVE固定立减及晚买权益保留。原型发现P2 1项已源码修复，待最终新原型实景复验；本报告从未给经济生产上线评分。

| 核对项 | 证据 | 判定 |
|---|---|---|
| 先承认原方案没有消除等待优势 | 提案 `3-9` 清楚区分当前合同与新规则 | 通过 |
| 覆盖完整 USDT、超上限余额与 UVT | `19-20,34-37,41-49`：完整期 115.56→50 抵扣+65.56购后奖励，UVT 30；12小时补足96.30+25 UVT | 通过；没有只补抵扣上限 |
| 不虚报已累计 | `7,34-36,53` 保留真实 accrued，差额名为 earlyReward；原型明细区独立展示且解释不属于已发生收益 | 通过 |
| 早晚比较范围准确 | `20` 限定同领取单/价格/通用优惠，明确不承诺正式设备未来收益更高 | 通过；消除的是少拿试用包，不是所有资金时间价值差异 |
| 成本披露 | `9,49` 区分原本等满期的人与原本提前买的人，明确后者新增奖励成本 | 通过 |
| 库存、余额、容量、准备金及报价变化 | `21-23,37-39,59` 失败不发放、不关闭试用，未知不补零、金额增加重新确认 | 通过 |
| 退款与支付不明 | `23-24,39,53` 绑定原流水，失败不发、退款逆向全部权益，消费后不能制造负余额或暗改退款资格；账务未接通不得启用 | 足够支持当前产品决策；实施前仍须细化逐资产退款状态和人工恢复契约 |
| 旧单/终态/延期 | `25,35` 原完整天数封顶；既有未结束单仅在发布兼容政策后采用，已完成历史账不追溯赠送 | 通过 |
| 审批范围 | `3,9,29,61,76` 标明待确认/新增字段不存在/不连接支付/获准前不覆盖现行合同 | 通过；用户“先举例”不是采用授权 |

### 发现记录 B-P2-01（已修，待实景关闭）

- 位置：原型 `PRD/prototypes/trial-early-purchase.html:6,23-31`。
- 原触发：购买时间选“试用结束”仍显示“试用中”；交互状态选“暂无领取单”仍显示试用设备和剩余时间。
- 影响：原型展示的状态与当前选择矛盾，可能让用户误以为宽限期仍产出或无领取单也有权益。
- 主线修复：`trial-status` 随 days 切换；empty 时隐藏 `product-head`。本审查回源确认 source/served HTML hash 相同，未扩大经济规则。

## 实景补记与最终限制

浏览器实操待视觉审查释放同一 TaskSpace 2 / p1 后补充。不会建立新 TaskSpace、不会独立 finish、不会操作其它预览端口。

现阶段没有批准也没有实现“提前补足完整试用权益”。正式支付链仍只结算当前已累计金额；这项提案的产品可决策性不能当作新优惠已上线。H5 不在本次独立复核授权内。

大白话：源码已把试用行收回正常设备队列的密度，关键操作保留；新方案也确实算全了抵扣、余款和 UVT，但它仍在等主人决定，不能靠本报告直接改金额规则。
