# 后端试用容量独立阶段验收

> 当前结论：17:16 JST 对最终快照复审后，**本后端范围 pass，开放 P0/P1/P2 均为0**。下方保留16:56的pending历史及缺陷证据；最终指纹、关闭依据和验收范围见文末“最终独立复审追加记录”。

- reviewer: `/root/trial_backend_final_review`（未参与业务实现）
- taskId: `uvel-trial-20261027-backend`; stepId: `backend-final-review`
- 时间: 2026-10-27 16:56 JST
- verdict: **pending / 未通过**。已核实旧 BE-01、BE-02、BE-03 的修补；新增 BE-04 / P1 与 BE-05 / P2 已由主线接收并交实施者修补，尚未经本审查者对修补后快照验收。文件名不表示本轮已通过。
- 仓库: `D:/WORKS/PLAN/.wt/uvel-trial-20261027-backend`；origin=`https://github.com/agentabatiuo572-byte/nexion-backend.git`；detached HEAD 和本地 origin/test 都为 `090a7e5032a8f6e781150201ce51005d554890de`。
- 本轮实际完成回源审查的 snapshotHash: `9FD5CDF6CF65FB80AAD0FC53765371C8623C640E53CDA37A549F017888F95BDA`，31 个相对基线修改/未跟踪文件。算法：路径排序后构造 `path SHA256(content)` 清单，以 UTF-8、LF 连接（无尾随 LF），再做 SHA256。
- 16:55:59 收尾检测到实施中的新快照 `45491E5F2C467A0BB846A7453E372BFD475F4D0800604A69F867855137FD58F0`（仍31文件），已含库存 SQL/测试等后续写入。**该新快照尚未独立验收，不能复用本报告将它标为通过。** 下文缺陷位置及已闭合判断绑定前述实际审查快照；新修补完成后须重新回源和绑定最终指纹。
- 授权执行：只读代码、规则、PRD、Git 差异与既有测试报告；只写本报告。审查者未修改源码、PRD、配置、数据库、记忆，未运行 Maven、启动 MySQL、commit、push 或调用外部交易。

## 权威与覆盖边界

已读 `CODEX_WORKFLOW.md`、`nexion-workflow`、`task-workflow`、`nexion-audit`、`done-review`；目标仓没有检出的 AGENTS/CLAUDE 文件。权威材料为本任务的 `D:/WORKS/PLAN/.wt/uvel-trial-20261027-app/PRD/UVEL_试用生命周期与队列_20261027.md`（FEAT-TRIAL03/04）、真实 `AppTrialLifecycleService` 的 state/start/convert/cancel，以及现有后端订单和容量契约。另对照既有原型 PRD §6.9 关于已购库存与激活分离的约束；没有将其价格、冷却或权益值强行覆盖后端。

从需求重建的检查面：四个持续持久态只保留一槽；取消/终态释放；转购同槽替换且不删除其他资产；start、普通激活/下单、组合、赠送、PC、手机、E5、E3 的容量入口；账号/环境隔离；锁前 RR 快照与锁后 current read；已购库存履约后的计数；领取快照与现行结算金额。

已回源到实际入口和 SQL，不以 `backend.patch` 或实施者的“已修复”声明作为当前证据。旧导出 patch 的 SHA256 `084CCE1E8C271632B030A621356F84152C054EF1868BC1C4C82E1B85F26B6320` 和旧 `evidence.md` 只代表更早一轮，不能代表本轮 31 文件快照。

## 本轮发现（待新快照独立关闭）

### BE-04 / P1 — 已交付库存的订单预约再次计槽，阻断合法激活

- 位置（已审快照）：`AppCanonicalBoundaryService.java:207-215`；`OpsDeviceService.java:2902-2914`；`CanonicalStateMapper.java:252-279`；事实生产点 `AppTradeinMapper.java:470-524`。
- 触发：cap=6，4 台在槽物理设备 + 1 笔有效试用 + 1 台已经付款交付的 CAPACITY_KEEP 库存。该库存尚未激活，只有一个真实空位。
- 证据：`insertCapacityKeepOrder` 写 `CAPACITY_KEEP / PAID / PAID / WAITING_PROVISIONING`，同一购买事务通过 `insertInventoryTargetDevice` 写 `OWNED / ORDER / INACTIVE`、`activated_at=NULL`，以 `source_order_no` 关联订单。现有 reserved order SQL 仍把此订单算作1。普通激活新增判断得到 `4 + 1 + 1 >= 6`，返回 `DEVICE_SLOT_CAP_EXCEEDED`；E5 force 新总数同样拒绝。无试用的“5物理+1库存”也成立。
- 影响：已购设备无法按真实空位激活；若有更多空位使激活成功，普通/E5 激活路径也没有完成原 CKO 预约，后续会把同一设备同时计为物理设备和订单预约。这是本轮将订单预约接入激活判断后产生的可达回归，不是推测性竞态。
- 恢复出口核对：`AppOrderCommandService.java:197-200` 仅接受 PENDING/PENDING_PAYMENT/WAITING_PAYMENT，不能用再次支付已付款 CKO 来完成其预约；两个设备激活路径均没有对应订单履约更新。
- 已证程度：源码与状态反例闭合；主线已亲读并确认 P1。审查者未运行数据库复现；实施者正准备隔离反例及最小修补，因此状态为 **open / 修补待独立验收**。
- 修补验收边界：必须凭同账号、订单、商品、数量、环境和真实交付资产证明释放预约，保留未交付/错误关联/其他账号的预约。canonical 普通/current、bundle、promotion 三种口径要一致。不得简单无条件排除 CAPACITY_KEEP；也不得因资产以后合法激活、停用、回收或解绑，使已履约订单再次变成预约。`AppTradeinMapper.java:426-441` 会把所有权改为 RECYCLED，故“仅当前 OWNED 才认履约”的实现需特别反证。金额、订单历史、资产归属均应保持。

### BE-05 / P2 — E3 容量报价漏算真实未履约订单和礼品预约

- 位置（已审快照）：`AppTradeinService.java:538-558`，及 `capacityReplaceInternal:343-345`。
- 触发：cap=6，4台在槽物理设备 + 1笔试用 + 1个真实尚未履约的订单/礼品预约（不包括 BE-04 中已经交付的库存）。
- 证据：`evaluateCapacity` 只比较 `activeDevices + trial >= slotCap`，因此返回 `CAPACITY_AVAILABLE`；普通下单的 canonical 检查会因总预约已满拒绝，而直接提交 capacityReplace 又因 decision 不是 REPLACE_REQUIRED 被拒绝。
- 影响：报价与真实命令容量口径不一致，用户不能沿容量置换流程完成购买；此项没有证明额外设备实际超配，故为 P2，不与 BE-04 合并升级。
- 已证程度：源码可达反例；主线已授权一并修补。状态为 **open / 修补待独立验收**。
- 验收：决策使用与普通新增入口相同的真实占用总数；返回的 activeDevices 仍表示物理设备数量，不能把预约伪装成已购设备。补 quote/replace 的混合预约反例，保持金额政策。

## 旧报告三项修补的独立核对

| ID | 本轮结论 | 回源及运行证据 |
|---|---|---|
| BE-01 / P1 | 旧反例已闭合 | `OpsDeviceService:2907-2911` 在用户锁后调用 `countOccupiedSlotsForE5Activation`；真实 repository 先 current read 用户环境，再调用 canonical current 物理+订单/礼品+试用总数。manual/force共用分支，Cloud Share 正例仍绕过物理槽。E5参数化服务用例覆盖5物理+1试用、4物理+1订单+1试用；真实 MySQL核实repository返回6。该结论不包含新发现的目标自身库存预约问题。 |
| BE-02 / P1 | 旧反例已闭合 | PC create与claim均调用 `CanonicalStateMapper.lockOccupiedDeviceSlotCount`。create另外读取PENDING配对，claim只以真实占用决定能否落设备。MySQL `pcPairingCannotDisplaceMixedTrialAndOrderOrGiftReservations` 分别覆盖order/gift，两条入口均拒绝，实际物理数量仍为4。 |
| BE-03 / P1 | 旧反例已闭合 | `lockOccupiedDeviceSlotCount:282-285` 的物理、订单/赠送、试用全部为 current read；PC cap也改成locking read，PENDING enrollment用FOR SHARE。MySQL `pcClaimAndE5UseTheSixthConvertedDeviceAfterAnOlderSnapshot` 先建立RR旧快照，另一事务新增第六台并把trial改REDEEMED，再取用户锁：旧普通读仍5、trial current为0，但PC claim拒绝，E5总数为6，最终物理仍6。没有仅凭“存在用户锁”推定正确。 |

真实 MySQL 用例以 `TransactionTemplate` 创建 RR 外层与 REQUIRES_NEW 竞争事务；`afterOlderSnapshot:357-368` 明确断言 REPEATABLE-READ，另一连接提交发生在外层用户锁之前。PC使用真实service及真实MyBatis mapper，配置、审计、幂等为mock；E5在该测试中验证真实repository计数，manual/force服务分支由单独服务测试覆盖。它们证明指定反例，不等同完整HTTP/A2/钱包流程。

## 其他已证事实

- `TrialSlotReservationMapper` 以账户和未删除claim的 CLAIMED/ACTIVE/GRACE/EXTENDED 做 EXISTS，只返0/1；production隔离和 terminal/deleted/other-account排除有真实SQL用例。终态释放依据服务端持久状态，未擅改 CLAIMED 的现行业务动作。
- start 在消费试用名额前检查物理设备和订单预约，加1代表即将占用的试用槽；state发布 capacity-full。普通新增入口加试用预留；convert继续使用已有 READ_COMMITTED 事务及用户锁，以“物理+其他预约+1”替换自身试用，不额外叠加第二个试用槽。
- convert 的扣款、订单、设备、REDEEMED 沿既有原子链，无本轮新增自动扣款或付款接口；未看到本轮删除/挤出其他已购设备的新增语句。没有执行真实钱包/HTTP支付。
- 已领取claim的 config时长和抵扣上限改用claim快照；商品价和日收益此前已使用快照。schema声明 duration_days、offset_cap_usdt非空。现行促销仍是比例且有上限的折扣；没有改成无条件85%原价，没有修改实际后台金额、冷却或权益规则。
- 手机已有有效绑定设备复用原槽；新手机计算设备+真实订单/赠送+试用。赠送生产入口在账号锁后计算预约，发放用已预约槽置换真实设备。带促销的普通/组合下单在prepareCreate再次执行包含商品数量与赠品数量的current容量检查，因此不能仅凭后续普通读就推断该入口存在旧PC同款超配。

## 测试证据与流程监察

本审查者没有重跑既有绿套件，直接解析实际 `target/surefire-reports/TEST-*.xml` 的 tests/errors/failures/skipped、文件mtime及Surefire JVM标识，并与源码、class的mtime对照。15:36:34的PC/E5/canonical源码已在15:38编译，之后有15:39结果；不能以旧导出patch代替它们。

- 16:48读取时共16份XML，累计 **484 tests，0 failures，0 errors，0 skipped**，XML time合计15.778秒。这是保留在目录内的多个轮次总和，**不是一次484例的最终全量命令**；XML time也不是准备/构建/墙钟耗时。
- 最新修补相关集合可核实 **214例 = 15:39同一Surefire JVM的211例 + 15:40独立后补SQL契约3例**。不能写成214再加3。211的组成是PC9、E5 174、repository容量2/观测1/分页12、MySQL13。
- 另有15:30普通激活/订单服务84例；15:23试用68、转换13、E3 45、组合20、促销16、手机服务5、旧槽位SQL契约3及转换MySQL16例。所有结果均0失败/错误/跳过。
- 当前MySQL证据共29例（转换16 + 手机/PC/E5容量13）。其中后者的3个新增场景是mixed order/gift参数化2例和旧快照转换1例；不是全部29例都在最终同一轮执行。
- fixture源码使用真实MySQL驱动、真实MyBatis和专属随机schema；并保留了失败schema与成功drop的区分。旧 `fixture-cleanup-r2.txt` 记录33329剩余非系统schema为0、shutdown成功、ownerLauncher=17788；本审查者没有把这份历史记录表述为现在的实时状态。新库存修补的隔离测试/资源生命周期应由实施者再次记录并经复核。
- 复用既有证据避免了重复启动数据库和整套构建。审查自身没有新增构建/数据库产物，只有本报告。旧过程的准备/等待/完整墙钟与构建新增字节缺独立记录，保持unknown。后续不能拿本报告的214/484替代新SQL修补后的必需回归。
- 两次审查时 `git diff --check` 均通过；只证明空白差异，不证明业务。

## 验收矩阵

| 验收 | 本阶段状态 | 已证/未证 |
|---|---|---|
| 四个持久活跃态只保留1槽，终态不保留 | pass（SQL/服务范围） | 四态及隔离/终态真实SQL；取消等命令回源；未跑部署HTTP |
| start满容量拒绝，convert同槽置换并保留其他已购 | pass（原试用修补范围） | 定向服务与MySQL证据，既有事务回源；完整钱包HTTP原子回滚未单独运行 |
| E5 manual/force、PC订单/赠品混合预约与旧快照反例 | pass（旧BE01-03指定反例） | 当前代码及15:39/15:40真实证据；新库存正例另列BE04 |
| 已购库存不重复占位，合法激活不被自己的预约阻断 | fail / 新修补未验收 | BE-04；主线确认，实施中 |
| E3报价与订单/礼品真实预约一致 | fail / 新修补未验收 | BE-05；实施中 |
| 金额、期限、抵扣来自权威现行规则和claim | pass（代码与服务测试范围） | 不使用演示价；未读取线上实际配置值 |
| 首页/赚取/设备管理、取消/转购的真写刷新与错误交互 | unverified / 本子任务外 | 前端与部署链路由主线独立验收，不以此后端报告代替 |
| 后续库存SQL新快照及最终集成 | pending | 16:55:59指纹已变化，须实施完成后由本审查者follow-up回源，不能由实施者代签 |

按 done-review 六维：真实落地已有服务/mapper运行证据，但完整HTTP支付未证；应有入口与同形覆盖发现BE04/05，暂不通过；交互和浏览器回归不在本子任务；金额/隔离不变量有证据，库存容量不变量尚待修补验收。防自欺六问中“全入口当前修补运行复验”和“浏览器真写刷新”不能回答已完成，所以不报最终pass。

大白话：旧的后台/PC容量漏洞已核实修好，但本轮又查出库存会被重复算槽、E3报价漏预约，主线正在修；要等新代码和新测试由独立审查者再验，当前没有新增金额或产品规则需要主人拍板。

---

## 最终独立复审追加记录（2026-10-27 17:16 JST）

- reviewer: `/root/trial_backend_final_review`，与原独立审查者相同，仍未参与业务实现。
- taskId: `uvel-trial-20261027-backend`; stepId: `backend-final-review`。
- verdict: **pass（本后端变更的独立验收范围）**；当前 open findings：P0=0、P1=0、P2=0。历史 BE-01～BE-05 全部关闭。
- 最终实际读取的仓库 HEAD / 本地 origin/test：`090a7e5032a8f6e781150201ce51005d554890de`。没有以目录名猜仓库，也没有使用旧导出patch代替当前源码。
- snapshotHash: **`C26B6CB0F22E9EF093B6D13676BD3159802B759E4CD4389DCF5ADC2F3B9E37D1`**。17:15:53按本报告前述同一算法重新计算，覆盖全部31个修改/未跟踪文件。
- 七个库存/E3修补文件逐个SHA-256均与 `inventory-fix-source-snapshot.json` 匹配；该局部manifest摘要为 `e78068b41f5b1a82f47af230f3ad2ca354109a523586a0d82d80ea9c3f3870eb`。五个生产文件最后修改在16:55～16:58，E3测试16:56，MySQL测试17:03；所选有效XML均在对应源码修改之后。局部摘要与完整任务摘要作用不同，不能互换。
- 本次追加只修改本报告；没有改实现、重复运行测试或占用33329。主线独立执行了P1正例，审查者另行读取其实际XML和清理记录。

### BE-04 / P1 的关闭依据

回源 `CanonicalStateMapper.java:37-61,288-308`：仅将现有单件 CAPACITY_KEEP 的真实已交付库存排除出未履约预约。证明要求 quantity=1、item_count=1、PAID/PAID/WAITING_PROVISIONING及paid_at；唯一未删除的明细与订单商品/数量相符；存在同账号、同source_order_no、同商品、source_channel=ORDER、PRODUCTION、空run_id、未删除且有purchased_at的物理资产。不凭订单类型单独释放预约，也不依赖以后可变的status/ownership_status。

普通与current计数、`AppBundleOrderMapper:75-77`、`PromotionMapper:89-90`、E3预约读取共用同一履约事实。current版本对交付资产/明细查询及“其他明细”内层查询都使用FOR SHARE，促销既有legacy-trial内层也改为current read。已读实际SQL拼接与真实MyBatis注册，非只搜索到常量名称。

`PhoneActivationCapacityMySqlTest:339-362` 使用真实 `insertCapacityKeepOrder`、`insertPaidOrderItem`、`insertInventoryTargetDevice` 生产订单/库存，然后实际调用普通激活service和真实SQL：无试用的5台物理、有试用的4台物理+1试用都能激活最后一台；预约始终0，激活后总数为6，再新增容量被拒绝。提交后读回库存为ACTIVE/OWNED，物理数量分别6/5；订单的user_id、amount_usdt、payment_status、order_status、activation_status与激活前完全相同。

同一测试文件还实际证明：

- `365-399`：无交付、错账号/订单/商品、删除资产或明细、SANDBOX资产、错误来源/类型、缺购买/付款时间、未付款、非CKO、数量不符及额外明细均不能伪装成完整履约；真实预约仍计入。单件生产契约以外的多件/部分数据保守保留预约，未发明多件履约政策。
- `404-423`：实际E5激活、移回库存、回收和E5解绑SQL之后，旧订单预约仍为0，已退出槽位的物理数量也为0；不存在因RECYCLED或UNBOUND使预约复活的回归。
- `428-458`：外层先建立REPEATABLE READ快照，另一事务提交新交付资产、替代有效明细、或新增使交付证明失效的额外明细。snapshot读仍旧值，canonical/E3/current以及促销读取正确新值；新增额外明细时仍计2个预约并拒绝新增容量。检查覆盖内层query block，而非只给外层加锁。
- `462-482`：4物理+1试用+已购库存时，真实PC create/claim可占最后一槽；原库存保持OWNED/INACTIVE；此后普通激活该库存正确拒绝超配，不能通过库存豁免绕过硬上限。

运行证据包含同条件红→绿：16:54:49旧代码两参数均失败为“expected reserved count 0, actual 1”（0 errors、0 skipped）；最终23例MySQL全部通过。主线17:13:52再次独立重跑同一两个真实库存正例，2 tests、0 failures/errors/skipped。审查者亲自解析了 `inventory-fix-main-recheck-reports/TEST-ffdd.opsconsole.shared.canonical.PhoneActivationCapacityMySqlTest.xml`，不是仅转述实施者或主线消息。因此 **BE-04 closed**。

### BE-05 / P2 的关闭依据

回源 `AppTradeinService.java:538-565`：E3决策已比较 `activeDevices + reserved + trial`，且保持响应中的activeDevices为真实物理数量；locked提交使用current物理、预约、试用及cap读取。`AppTradeinMapper.java:50-66` 直接复用canonical普通/current预约SQL和current物理/cap SQL，没有再维护不同的预约定义。既有锁用户、报价金额、扣款、旧设备退出及新设备创建顺序未被改写。

`AppTradeinServiceTest` 的新增quote用例覆盖4物理+1试用+1真实未履约预约时为REPLACE_REQUIRED，并保留activeDevices=4；已交付库存预约=0时返回CAPACITY_AVAILABLE。新增replacement用例执行已有真实服务购买/置换分支并验证使用全部current读、不调用旧snapshot计数。真实MySQL中的E3 mapper同时参与混合容量、履约与RR断言，所以服务mock不是唯一计数证据。

16:57:30的旧代码反例XML确实为2例：quote断言失败（CAPACITY_AVAILABLE而非REPLACE_REQUIRED），replacement抛CAPACITY_REPLACEMENT_NOT_REQUIRED；17:00:02完整E3服务48例全部通过，既有资金捕获/扣款/归属测试仍保留。因此 **BE-05 closed**。

### 最终有效验证与主线复验

审查者逐一打开 `inventory-fix-tests.summary.json` 指定的16份真实XML，比对classname、tests、failures、errors、skipped，全部与摘要一致：**497 tests，0 failures，0 errors，0 skipped**。选用的有效结果如下，未把有意红灯、夹具修复失败或被替代轮次混入最终通过数。

| 有效报告目录 | 范围 | Tests | 时间 |
|---|---|---:|---|
| `inventory-fix-targeted-reports` | E3服务48 + TrialConversionSlotMySql16 | 64 | 17:00:02～17:00:10 |
| `inventory-fix-targeted-r3-reports` | PhoneActivationCapacityMySql | 23 | 17:04:03 |
| `inventory-fix-regression-reports` | 其余13类：PC、E5、repository、SQL契约、试用、转购、促销、组合、普通激活/订单、手机 | 410 | 17:04:56～17:04:58 |

合计包含 **39例真实隔离MySQL（16+23）**，另458例服务/repository/契约测试。XML time合计19.229秒，仅是suite统计，不当作命令墙钟。497覆盖同一个最终生产快照及最终MySQL测试修订；它取代历史214/484作为本轮有效结果，不能与这些历史数字相加。

主线另跑的两个库存参数case是独立复验，不是新增的唯一用例，**不把它们加成499**。已读取 `inventory-fix-main-recheck.log` 中本次专属schema CREATE/DROP配对及 `inventory-fix-main-recheck-cleanup.txt`：mavenExit=0、剩余非系统schema=0、cleanupReadExit=0、shutdownExit=0、listenerCount=0、elapsedSeconds=10.08。审查者未重启DB；仅引用这次可定位的读回记录，不扩展为对其他服务的检查。

首次三类绿灯过程中的夹具问题及中间失败记录保留在实施者报告和各轮XML；最终证据选择明确，没有删除失败记录来伪装单次全绿。修补范围只有既有5个生产文件和2个测试文件的增量，未引入迁移、新端点、自动扣款、支付金额或归属改写。最后 `git diff --check` 通过。

### 当前验收与完成门

| 验收ID | 当前状态 | 证据 |
|---|---|---|
| BE-01-E5-capacity | pass | manual/force公共容量分支、真实current repository；174例E5服务与真实MySQL回归 |
| BE-02-PC-reservations | pass | create/claim统一占用；真实order/gift混合预约拒绝及合法库存正例 |
| BE-03-RR-conversion | pass | 旧快照5物理、current已转购6物理时拒绝PC；最终MySQL套件保留原反例 |
| BE-04-delivered-inventory | pass | 严格单件交付证明、真实普通/E5/PC写回、生命周期/错误关联/未履约/RR反例、主线独立2例重跑 |
| BE-05-E3-consistency | pass | 48例E3服务，shared mapper实际MySQL与current读；未篡改activeDevices含义 |
| trial-single-slot-and-conversion | pass（本后端范围） | 原试用start/state/cancel/convert回源；四态、终态、转换、账号/环境隔离回归 |
| economic-and-owned-device-invariants | pass（本次改动范围） | 只读计数排除与E3决策变化；原结算公式/原子交易保留；真实激活前后金额/状态/账号/所有权读回 |
| coverageReview | pass（本后端范围） | 从FEAT-TRIAL03/04和真实生产入口重建清单，覆盖新增占槽与履约释放两个方向，未仅审diff或拒绝路径 |

done-review六维与六问在本后端范围的结论：真实写入及提交后读回已证；应有入口和同形SQL已逐项覆盖；状态/容量错误分支有正反例；账号、环境、Cloud Share、权益及已有资产不变量有对应证据；旧BE01～03与新BE04～05在最终快照回归通过。未把服务mock、SQL契约或绿灯数量当作真实数据库操作的替代；没有开放P0/P1/P2。

范围仍然明确：本报告不证明已部署HTTP、真实钱包付款、生产配置值或前端首页/赚取/设备管理交互与刷新；这些由主线自己的集成和浏览器验收负责。本范围内没有尚待产品决定或用户批准的事项。

大白话：后端库存重复算槽和E3漏预约都已按真实业务事实修好，并经过反例、真实MySQL和主线独立复跑核实；本后端独立验收通过，金额和已购归属没有被改动。
