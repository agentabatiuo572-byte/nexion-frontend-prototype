# UVEL 试用生命周期与队列：独立业务及交互审查

**结论：本次 APP 业务／交互候选验收通过。需求 1：9.2/10；需求 2：9.3/10。当前开放 P0=0、P1=0、P2=0。** 分数绑定下述源码与实际浏览器构建，覆盖本地模拟交易、源码契约和已有隔离验证；不表示已部署 TEST 的真实付款、原生安装或硬件验收通过。

- taskId：`uvel-trial-20261027`
- stepId：`app-business-interaction-review`；verdict：`pass`（本报告范围）
- reviewer：`/root/trial_business_final_review`，未参与产品实现；只读产品源码、规则和证据，另写获准的隔离审查资料。
- 审查日期：2026-10-27；最终指纹读取于 17:21 JST，浏览器操作已释放给独立视觉审查者。
- APP：`D:/WORKS/PLAN/.wt/uvel-trial-20261027-app`；origin 为 `nexion-frontend-uniapp`；当前 detached HEAD：`19f1a42b6b0dbda7ba6579aae236158f5adf7b93`。原基线 `e5810fc575eb95178da9519c8b1f281d978b2b6d` 后，主线快进合入无关的钱包／消息／通知修订。
- snapshotHash / sourceFingerprint：`fa477e96988a9d887dd804d0d27205351539293b7a3eaadfa4be42d5da47a0e0`。算法与 runtime runner 相同：`git ls-files --cached --others --exclude-standard` 中 `src/`、`scripts/` 去重排序，以相对路径与文件字节连续 SHA-256；不是整个工作目录的摘要。
- H5 buildFingerprint：`a80abea6f1a40f40561485691d41fdc9d26729f5a8981ddba156a30b744e4152`。入口及其 JS/CSS 字节拼接 SHA-256。浏览器实读 `/assets/index-BhLOGPgB.js`，CSS 为 `index-vThkQq5P.css`。最终源码／构建／PRD 指纹见 [snapshot.json](D:/WORKS/PLAN/artifacts/uvel-trial-20261027/business/snapshot.json)，可用同目录 `audit-snapshot.mjs` 重算。

验收清单从两项用户需求、用户删除多余提示的后续要求、[任务 PRD](D:/WORKS/PLAN/.wt/uvel-trial-20261027-app/PRD/UVEL_试用生命周期与队列_20261027.md)、主 PRD，以及实际后端 `AppTrialLifecycleService` 的 state/start/cancel/convert 重建。未将演示价、当前促销配置或旧绑卡说明当作新的金融政策。已依次读工程入口、当前 APP 规则与 nexion-audit / done-review，按当前 APP 规则采用相关验证；没有将旧 CLAUDE 的全量 verify 要求覆盖较新的 AGENTS 规定。

| 需求 | 分数及判断 | 主要依据 |
|---|---|---|
| 1. 首页持续保留 3 天 S1 试用卡，确认、计时、活跃、到期／转购与随时提前购买 | **9.2/10，pass** | 亲点首次领取放弃与激活、取消试用、读取失败重试、售罄拒绝、购买确认取消及成功转换；核对真实服务端金额链、领取快照、未知结果恢复和再领资格。旧 12 组矩阵覆盖三语／明暗／320/390及终态，当前新包完成相关补验。 |
| 2. Home／Earn／管理／详情的独立试用设备、金额区分、数量与容量一致，保留付费设备 | **9.3/10，pass** | 实操 active 一试用加两付费为3/6；取消／ended只移走试用回2/6；真实点击转购后3付费、0试用、3/6。源码将试用保持为独立呈现，不写入正式设备数组；容量实际 SQL／服务边界另有最终独立后端证据。 |

扣分保留在尚未执行的部署及原生边界，以及最终 CSS 包未重新跑完整 12 组自动矩阵；没有为满足门槛把这些范围记成已验证。最后一处源码改动仅为 Earn 首行上圆角，已由本审查者测得左右均为28px并亲看截图；全量视觉判断仍由另一位独立审查者负责。

## 已发现问题与关闭依据

**BIZ-01 / P2 / closed：冷却后后台允许再次领取，但首页及详情没有重开确认入口。** 原实现只在 `none` 开放领取；实际后端 [AppTrialLifecycleService.java:542](D:/WORKS/PLAN/.wt/uvel-trial-20261027-backend/src/main/java/ffdd/opsconsole/growth/application/AppTrialLifecycleService.java:542) 对 FAILED/CANCELLED 冷却结束可发布 canStart=true，因此用户会被前端旧门挡住。本审查者提出后，主线回源修补：[trial-hero-banner.vue:56](D:/WORKS/PLAN/.wt/uvel-trial-20261027-app/src/components/trial-hero-banner.vue:56) 及 [trial.vue:89](D:/WORKS/PLAN/.wt/uvel-trial-20261027-app/src/pages/me/trial.vue:89) 以服务端资格开放原确认层，加载时不开放新一轮。三语渲染反例已补；当前 BhLOGPgB 浏览器中，本审查者分别从 Home 与详情亲点“立即领取”，两处均进入同一3天确认层，`.tcs-start-note` 数量为0。证据：[首页再领](D:/WORKS/PLAN/artifacts/uvel-trial-20261027/business/reclaim-confirmation.png)、[详情再领](D:/WORKS/PLAN/artifacts/uvel-trial-20261027/business/reclaim-detail.png)。没有新增或修改冷却政策。

其余先前问题逐条复核，没有仅凭“已修复”转为通过：

| 检查项 | 当前证据与结论 |
|---|---|
| 领取后价格／抵扣快照 | `trial-api.ts` 解析领取权威 price/offset/remainder；`free-trial.ts:295` 写入权威金额；`checkout.vue:673` 未知金额关闭支付，`:677` 使用领取价。测试含当前价／抵扣上限变动反例。未发现按新商品价重定旧领取单。 |
| 代金券与 convert 不兼容 | `checkout.vue:732` 对远端试用转换禁用 voucherMatch；实际结算显示“代金券不可与试用购机优惠同时使用”。转换使用既有接口和主动二次确认，没有落入普通订单链。 |
| EXTENDED 误延长估计天数 | `use-trial-presentation.ts:54` 远端估算使用领取时长配置；后端 `AppTrialLifecycleService.java:455` 限制原 durationDays、`:586` 发布领取快照时长。延期只延长抵扣保留；专用反例覆盖。 |
| 失败领取意图永久占用 | `free-trial.ts:494` 只在确定拒绝且读回无活跃领取后退役 key；未明结果继续原意图。状态／绑定测试覆盖。 |
| 未明转换变成第二次购买 | `free-trial.ts:533` 持久化并恢复原 claim/SKU/金额/key；缺原单回执不当作新订单；`checkout` 将恢复失败留在原转换。旧账号和重复点击有定向反例。 |
| 倒计时与终态 | 本人见领取成功3天开始、活跃递减；12组证据包含最后12小时实际11:59:xx及grace/ended/converted；终态不靠客户端时间伪造新领取。 |
| 旧绑卡／自动扣款文档冲突 | 已复读主PRD §9.11、§12.18和路由／交易表修订，现行端点与 safePolicy 一致；不再把绑卡或自动扣款作为本流程前提。 |
| Earn 首行圆角 | 最后补丁仅 `empty-slots-hint.vue:133`。当前浏览器上圆角左右28px；已看 [新包 Earn](D:/WORKS/PLAN/artifacts/uvel-trial-20261027/business/active-earn-newbuild.png)。视觉 P2 的正式关闭由视觉审查者记录。 |

## acceptanceResults

| ID | 状态 | 非空证据与范围 |
|---|---|---|
| R1-retained-lifecycle | pass | Home福利持续展示active/grace/ended/converted；原12组报告与截图，本人亲点激活、取消及转换后刷新。终态下一步可到详情／正式设备。 |
| R1-claim-confirm-start | pass | 亲点“我再想想”后 ELIGIBLE、0试用；确认后 success／开始计时反馈、3/6；真正权威读回之后才成功。对应 SFC/store测试检查失败与旧账号。 |
| R1-retry-prerequisite | pass | 读取失败时详情只有重试；恢复 fixture 后实际重试成功。soldout禁买并展示缺货原因，createdOrders为空；恢复库存后可进结算。容量满、未知金额、加载门另有渲染／store反例。 |
| R1-early-purchase | pass | 从仍处于ACTIVE的详情亲点购机进入试用结算，数量1、领取价1299、当前抵扣与预计值分离；主动二次确认可取消。 |
| R1-canonical-conversion | pass（本地模拟＋代码） | 本人实际确认得到订单 `TRC-DEMO1793089010104`，1单、PAID/ACTIVATED、REDEEMED、device1001；实付1240.33，钱包52800.64→51560.31。当前截图／同源状态读回；既有后端原子链回源。 |
| R1-recovery-idempotency | pass（代码／定向测试证据／已有runtime） | 原12组及快进后完整链均重放同一convert key，订单数和钱包不变；本次取消支付不产生任何转换命令。未知结果、报价增加、余额不足与重绑账号由定向反例覆盖，本人未声称逐项在真实TEST重演。 |
| R1-reclaim | pass | BIZ-01源码、三语反例和当前包两入口亲点证据；原runtime完成再领激活。 |
| R2-distinct-trial-row | pass | 共享TrialDeviceRow使用独立标识；Home/Earn/管理组合显示，app.devices无试用注入。管理真实跳转与取消实操，详情使用同一领取状态。 |
| R2-money-and-time | pass | 行内试用标记、剩余时间、当前可抵扣与预计抵扣独立显示。当前Earn实读38.54对50.00，并明示不能直接提现；详情另列累计试用收益。 |
| R2-count-and-retention | pass | Home active=1试用+2付费=3/6；取消后2/6；亲点转换刷新后`.nx-device-row`=3、试用=0、3/6。Earn active=3/6，ended=2/6，S1与Pro始终可见。 |
| R2-read-failure | pass | 本人读错场景下两台已确认付费设备仍保留，Home计数“— / —”；详情无支付动作，有重试。呈现层只保留身份，未知金额不按0冒充权威值。 |
| R2-capacity-invariant | pass（当前变更的服务／SQL证据） | 已回源试用预留、同槽转换政策；复读后端最终独立报告17:16追加记录，BE01～05全部关闭，497有效例含39真实隔离MySQL，覆盖E5/PC/current read与库存不重复预约。本人未重跑数据库或真实HTTP。 |
| user-extra-note-removal | pass | 全12组断言及当前再领确认层`.tcs-start-note`=0；产品、3天、估算公式和清晰确认／退出动作仍完整。 |
| current-build-affected-regression | pass | 浏览器亲读BhLOGPgB；最后CSS修改后重做读错恢复、售罄、转换、Home终态、Earn及再领。未将旧12组报告冒充新包12组全跑。 |

## 证据分层与边界

1. **主线完整矩阵**：[runtime-acceptance/report.json](D:/WORKS/PLAN/.wt/uvel-trial-20261027-app/.cache/trial-lifecycle/runtime-acceptance/report.json)，320/390 × zh/en/vi × 明暗，共12条，`pass=true`、errors为空；source `0eb1973db4ad8dd71681709f4e1cf5c8670872ad4e27c8d75ca13e46603dba1b`、build `65b7c249b687ccf6728198abdff021b55db23f5540dbf58975da56976e81eb4f`。本人阅读实际脚本和报告，并亲看320英文／越文／中文的确认、详情、付款、队列、最终日及转购图，不以文件存在代替看图。
2. **快进集成后回归**：[runtime-integrated/report.json](D:/WORKS/PLAN/.wt/uvel-trial-20261027-app/.cache/trial-lifecycle/runtime-integrated/report.json)，390中文暗色完整链通过，source `30f1a8570569394389af647243954e992761c9e5cee053a3f03eb9a0ad4b7924`、build `9f3c4c5c8e91394b9a7f0912e7a5258e58fb36f8eb69ac9a3346204e30220747`。此后测试脚本guard修正及Earn圆角／断言改变指纹；不能直接挪用该报告为当前摘要。
3. **本审查者亲手操作**：仅在5251、ego space1/p1串行操作，本任务独占期间执行。原ChX2izrk完成初领、取消和读错；当前BhLOGPgB完成恢复、售罄、显式付款取消／成功、转购刷新、Earn、ended及两入口再领。可读 [observations.json](D:/WORKS/PLAN/artifacts/uvel-trial-20261027/business/observations.json) 和同目录逐轮脚本；[转换后队列](D:/WORKS/PLAN/artifacts/uvel-trial-20261027/business/converted-fleet.png) 经本人打开检查。自动化曾因错误等待URL和模糊Cancel定位失败，均先重新读取实际状态再继续，没有重复支付；这些工具等待失败没有伪装成产品用例通过。
4. **机器证据**：主线当前记录10文件182/182 Vitest、type-check、生产H5与APP资源编译通过；本人读取相关测试源码及验收记录，未将其写成“本审查者重跑182例”。真实渲染测试也含stub，不能单独证明浏览器，本报告以实际动作补足。
5. **后端补充**：[最终独立后端报告](D:/WORKS/PLAN/artifacts/uvel-trial-20261027/backend/review-final.md) 的最终快照 `C26B6CB0F22E9EF093B6D13676BD3159802B759E4CD4389DCF5ADC2F3B9E37D1`，已读关闭BE04库存重复占槽和BE05 E3漏预约的源／XML／主线复验依据；历史pending段不作为当前结论。此报告仅补强服务和SQL，不替代前端动作。

**没有通过或没有运行的部分明确保留：**旧 `runtime-final/report.json` 因英文“3 of 6”被旧断言判错而失败，未作为通过依据；`trial-stock-unavailable-contract.test.mjs` 实跑仍在未改product-card的旧 `renderWrapStyle` 断言失败，日志位于 `artifacts/uvel-trial-20261027/trial-stock-check.log`。本人核对商品卡无本任务diff及保留的原断言，相关售罄业务另有SFC和本次真实UI证明，不把该脚本报绿。full verify未运行。当前最终包未重跑完整12组；已部署TEST HTTP交易、真实资金、原生安装／硬件心跳均为 **unverified、报告范围外**。

`coverageReview=pass`（两项APP需求与本次业务／交互范围）：按用户目标重建了持续入口、完整生命周期、提前购买、独立资产、计数／容量、金融权威、恢复和取消出口，再向每个入口及异常状态核对；没有仅审主线diff。done-review六维均有对应证据：真写读回、应有内容、交互出口、同形入口、金额／资产不变量、实景回归；防自欺检查保留真实部署和原生未证边界。本报告不代签另一位视觉审查，也不代表提交、推送、H5同步已经完成。

大白话：我亲自走通了领取、取消、恢复和提前购机，核实试用只占一个独立位置，转购与到期不会吞掉原有设备；当前两项业务验收都超过9分，没有需要主人新增拍板的产品规则。
