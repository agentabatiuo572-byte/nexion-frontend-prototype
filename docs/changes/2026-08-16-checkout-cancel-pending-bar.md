# 结算「可取消/可中断 + 30 分钟待支付浮动条」· Change Proposal

- **工作线**:④ uniapp(pkg/ad-checkout-cancel)
- **日期**:2026-08-16
- **状态**:Shipped(2026-08-16;PRD §7.3.1/§7.3.3/§7.3.5/§12.22/§17.3 已同步;合并进 UniApp 主线)
- **定级**:M(2 包 · 6-8 文件 · 不改产品规则;钱相关 → 子任务敏感级,tester 外加 code-review)

## Why
结算支付流程一旦进入扫码页就「下不来」:`chain-payment.vue` 12 秒定时器自动模拟到账把用户推进扣款(取消按钮寿命 12 秒);等待/激活屏零出口;选支付步无显式取消。此外从扫码页返回 = 会话蒸发 —— 若用户已按地址转账,这笔钱在产品层没有归属(孤儿资金)。生产级定调后这不是演示瑕疵,是资金安全缺口。

## P1-a 既有裁决搜索
已搜 `待支付|浮动条|PENDING_PAYMENT|abandon|取消订单|checkout` 于 `docs/changes/`(含 out-of-scope)、`PORT-PITFALLS`、更新日志:**无既有否决**。相关事实:2026-08-16 commerce sandbox 验收——远端订单已服务端持久(`PENDING_PAYMENT`),远端 awaiting 只轮询 canonicalStatus,ChainPayment 是纯 mock 腿;服务端订单契约**无付款截止字段**(客户端不得凭空造远端倒计时,见「诚实边界」)。

## What changes
**第一包(已批)**
1. 删 `chain-payment.vue` 12 秒自动到账定时器(保留 30 分倒计时、「我已完成付款」、取消)。
2. select-payment 步主按钮下加 ghost 弱化「取消」→ 商品详情(转化场景 Cancel 权重必须弱)。
3. awaiting / activating 屏加 `v-if="orderId"` 的「查看订单」出口(数据驱动,不按 mock/remote 分支)。
4. confirm 步不加第三按钮(主人拍板)。

**第二包(2026-08-16 拍板:整包做 · 返回不弹确认框 · 撞旧会话确认框二选一)**
5. **待支付会话 store**(`store/pending-checkout.ts` + 纯逻辑 `pending-checkout-core.ts`):进扫码步建会话 `{id, kind:'purchase', productId, method, amountUsdt, address, createdAt, expiresAt, quote 快照, leftNoticeShown}`;按账号分行持久(`nexgrid-pending-checkout-accounts-v1`,列表形,单一 live);地址 = `deriveDepositAddress(session.id, method)` 每单专属;远端模式(`fundsServerEnabled`)拒建(不造假地址)。
6. **后退语义**:扫码页/等待页离开 → 会话静默保留 + 一次性 toast「订单已为你保留 30 分钟」;不弹确认框。
7. **浮动条** `components/pending-checkout-bar.vue` 挂 app-chassis overlays:「待支付 $X · mm:ss · 继续支付」;点击 → 同一笔(同地址 + 连续倒计时);正在展示该会话的结算页上不显示;完成/取消/超时消失;账号隔离;刷新存活。
8. **超时态**:倒计时归零 → 扫码页进「支付已超时」态(地址不再展示、无法推进),唯一出口「重新下单」→ 回 confirm 步(重新报价再建新会话);浮动条同时消失。
9. **撞旧会话**:已有 live 会话又点「Pay now」→ 确认框:「放弃它,开始新的」(danger,confirm)/「保留它」(ghost,cancel;点遮罩同,安全默认)= 什么都不动 —— 旧发票在、浮动条就在本页顶上,想回去点它;不替用户跳页(T2 实测:遮罩当「继续」会把人带到另一商品付款页,且 URL 与内容不一致)。确认框随页面卸载一起收掉、回调按 pageAlive 守卫(T2 P1-1 修法)。
10. **显式「取消」**(扫码页原按钮):加确认框「取消这笔支付?若已转账请勿取消」— 判断项,主人未议,可否决。
- **Out of scope**:卡支付腿不建会话(即时表单,无在途资金);远端模式浮动条(服务端无付款截止字段,待后端补 `paymentDeadline` 后由服务端订单驱动,见 HANDOFF);多笔并存 UI;confirm 步第三按钮;30 分钟窗改后台可配。

## Impact
- **页面**:`pages/store/checkout.vue`(A/B/E 接线 + `?resume=`)· 组件 `store/chain-payment.vue`(props 改 `session`,去本地地址/去 12s)· `app-chassis.vue`(挂浮动条)· 新 `pending-checkout-bar.vue`
- **Store**:新 `store/pending-checkout.ts` + `pending-checkout-core.ts`;`lib/account-scope.ts` 加一行 rebind —— 🔴 backend-replaceable(结构 = 服务端 PENDING_PAYMENT 订单 + 支付指令;远端替换 hydrate 为 GET,`begin` 为 POST /api/orders 已有路径)
- **i18n**:`store.pending*` 约 12 key,en/vi/zh 同序,`node scripts/i18n-key-mirror.mjs`
- **设计**:浮动条走 chrome 玻璃语言(`--v5-chrome-bg` + `--v5-glass-border` + `--v5-glass-shadow` + blur),字号 12.5/13.5,tap ≥ 44,ghost 取消 ink-3;确认框走 `store/ui` `confirm()`(danger 映射到破坏性选项,遮罩=安全默认)
- **PRD**:§7 商城结账流(结账状态机 + 待支付会话/浮动条/超时/撞单规则)
- **不变量风险**:三语镜像 · 账号隔离(per-user 字段按账号作用域)· 时间只用 `mockServerNow()` · 显示的钱指到单源(会话 amount = 确认页快照)· 禁页面开模式分支 · 0 meta 文案 · 焦虑词门

## Done-when(7 条验收判据,P6 逐条回测)
- [x] ① 扫码页停 60s 不自行推进、不扣款(余额不变、无订单)。 —— T2 A2(66s 实测:倒计时递减、订单数不变、余额不变)+ 运行时门 A(15s)。
- [x] ② 从扫码页返回:一次性 toast 出现;浮动条出现且倒计时递减;切 tab / 刷新页面浮动条仍在。 —— T2 B1(四 tab + reload 存活,二次离开 toast 不重复)+ 运行时门 B。
- [x] ③ 点浮动条回到同一笔:地址与离开前一致、倒计时连续(非重置 30:00)。 —— T2 B2 / T4 R6 + 运行时门 B。
- [x] ④ 「取消」(确认后)/ 完成购买 → 浮动条立即消失。 —— T2 B3/B4(遮罩=保留;取消后 storage 0;完成路径 confirmed 时扣款一次 sessions 0)+ T4 R6。
- [x] ⑤ 倒计时归零 → 扫码页进超时态、旧地址不再展示、无法「我已完成付款」;浮动条消失。 —— T2 B5 / T4 R7(Start again → 新地址 30:00)+ 运行时门 D。
- [x] ⑥ 换账号:A 的待支付不出现在 B;切回 A 仍在。 —— T2 B7(真实注册两个账号:B 全 tab NO_BAR、storage 三行分行、登回 A 恢复)+ vitest 账号隔离用例。
- [x] ⑦ 完整购买路径与现状一致 —— T2 B4 / T4 R6(−$649 恰一次、订单 +1、live)。远端 sandbox:store 在 fundsServerEnabled 下拒建不读(vitest 环境即 remote 档,store 恒空;仓内 remote/sandbox 契约链 `npm run test:production-boundaries` 与 commerce sandbox 验收未受本包影响 —— 见收尾 verify 全绿);ChainPayment 在远端不可达由 onConfirmPay `if (remoteApiEnabled) return` 钉住(隐式依赖已在审计 R2 critic 登记,HANDOFF U-20 说明服务端驱动方案)。

## 实施拆解(M 级内联)
| # | 子任务 | 范围文件 | AC | 敏感 | tester 报告 |
|---|---|---|---|---|---|
| T1 | 核心 store + 纯逻辑 + vitest | `store/pending-checkout-core.ts` · `store/pending-checkout.ts` · `lib/account-scope.ts` · `pending-checkout-core.test.ts` | isLive/prune/secondsLeft 纯函数测试绿;begin 远端拒建;账号 rebind 换行 | 钱 | (机器门 + code-review) |
| T2 | 第一包 A/B/C + chain-payment 改造 + 结算页接线(begin/resume/leave/complete/abandon/collision/expired) | `chain-payment.vue` · `checkout.vue` | 判据 ①③④⑤⑦ | 钱/状态机 | `…-t2-test.md` |
| T3 | 浮动条组件 + chassis 挂载 + i18n 三语 | `pending-checkout-bar.vue` · `app-chassis.vue` · `i18n/messages/{en,vi,zh}.ts` | 判据 ②③⑥;i18n mirror 绿;9 档字号/token 自检 | UI | `…-t3-test.md` |
| T4 | 全套门:tsc · verify.sh(5399)· 独立 tester 7 判据实景 · code-review · nexion-audit · done-review · PRD/更新日志/HANDOFF | — | 全绿 + P0=P1=0 | — | audit 报告 |

## 诚实边界
- 远端模式:ChainPayment 不可达(remote 走 submitRemoteOrder→awaiting 轮询),故会话 store 在远端**不建行也不读行**;浮动条在远端不出现——因为服务端订单契约没有付款截止字段,客户端不得自造 30 分钟并宣称过期。后端补 `paymentDeadline` + 支付指令后,由订单列表驱动同一组件(已在 HANDOFF 登记)。
- 30 分钟窗口 = `PENDING_CHECKOUT_WINDOW_MIN` 单一常量(mock 侧「服务端」);PROD 由服务端下发。

## 实施记录(2026-08-16,pkg/ad-checkout-cancel)
- 提交:229415e(主体)· 06054fe(撞单原地切换 / 浮动条内缩 / 伪 QR 种子修复 / 超时态副标题 / 弹框短标签)· 7e71b25(a11y 基线 / verify 哨兵 / 日志 / P-115·P-116)。
- 【主人 2026-08-17 定稿】扫码页按钮改名「取消支付」;点击先弹确认框**问「是否已转账」并告知风险**(已转账请勿取消 / 未转账可放心取消),确认后才作废;顶部返回 = 保留 + 浮动条提示未支付。
- 判断项(主人可否决):① 扫码页显式「取消」加确认框(拍板只议了「返回」不弹;显式取消 = 作废发票,已转账者误触即孤儿化资金,故加一道,遮罩 = 继续支付);② 顺手修 chain-payment 伪 QR 全白(旧 LCG 越 2^53 精度丢失,所有地址只剩三个定位块;改用 deposits-core 的 fnv1a+mulberry32,与充值面同源);③ 浮动条在有 chassis 页头的页(5 tab + useSetPageHeader 子页)让内容整体下让 60px 占独立一带(实测覆盖商城券横幅),sub-page-header 子页仅悬浮不内缩(内缩会把 sticky 行推下去又从条底穿过)。
- 设计取舍:撞单「保留它」= 什么都不动(原地切换商品的方案被 T2 实测推翻:遮罩当「继续」会把人带到另一商品付款页且 URL 与内容不一致);浮动条从任何页(含另一结算页)一律 `navTo` push,页头 store 按 owner 清(P-116 修法)。
- 门:vue-tsc 0 · vitest pending-checkout-core 4/4 · i18n mirror 4848 键 · a11y-activate 门绿(基线内)· 新 verify 哨兵「付款腿禁定时器 emit complete」红测旧文件红;全量 verify.sh(5401 worktree,mock)见收尾汇报。
- 环境教训:worktree dev server 无 HMR(vite ignore `**/.claude/**`,P-115)——改完必冷重启;交接书点名的 zk-anxiety-copy 实为他会话活动树,已自建 ad-checkout-cancel 树并把误入的他方改动复原。
- 审计 R10(Workflow 五层,43 agent,HEAD e8e0bd4):确认 P0 ×1(orders 行是钱路上唯一整行覆盖写:另一标签页一次落盘就把已扣款订单从盘上抹掉 —— 钱按增量合并保住、单却没了、履约永不发生)+ P1 ×2(试用返还入账失败无登记且弹「没有产生任何记录」假话 / 券放回失败后引导重试,重试撞券一致性闸把可能已转账的发票销掉);对抗 kill ×7(含 R9 修法「retireDevice 非 CAS」「consume 内存三态」等 5 条证伪未成立);P2 ×69;critic 缺口 13。**趋势:R9 8 条 → R10 3 条,首次明显下降**;按主人 A 拍板本轮为最后一轮。
- R10 修法(本轮):orders store 落盘改 CAS 提交器(与 pending-checkout / deposits 同款):建单追加在磁盘最新列表上、履约推进 / 激活 / 取消都在磁盘最新行上带前置 apply(别的标签页已推进 → 撤回刚生的设备不重复发)、登记进 staking-cas / money-cas 两道注册门,vitest 加「两标签页互不覆盖」靶;试用返还入账走 silentFailure + 失败登记 kind=payout(三语文案);券放回失败记入页级待补放回,下一次结算尝试开头先补放回再过券一致性闸。另按主人 2026-08-17 定稿:扫码页按钮改「取消支付」,点击先弹「你已经转账了吗?」+ 风险告知(已转账,继续支付 / 取消支付),确认后作废并提示「已取消付款」;顶部返回 = 保留 + 浮动条提示未支付(Playwright 实景截图核过三态)。
- 审计 R9(Workflow 五层,43 agent,HEAD 4f20e57):确认 P0 ×1(旧机下架无在册断言 / CAS:两个结算实例各吃一次同一台设备的抵扣;券与发票有 CAS 唯独设备没有)+ P1 ×7(置换 sheet 三条成交腿没接「成交即兑现意图」/ bundle 把 debit 失败一律报余额不足 / convert 终态后建单失败弹「没有产生任何记录」且不登记 / consume 混淆「别处已结算」与「写失败」/ 离开提示恒报 30 分钟而非真实剩余 / onLoad 三门静默销毁可能已转账的发票 / 置换回滚再激活撞同一槽位谓词必连环失败);对抗 kill ×2;P2 ×58;critic 缺口 12(含 50 处 persist-verdict-ok 豁免理由未核、页面直写 app.devices 门看不见、runtime 门不读余额、stuck 队列零消费者、远端档零判据等)。
- R9 修法(本轮):app.ts 新增 `retireDevice(id): retired|absent|unpersisted`(在册才删,店内断言 + 落盘)/ `restoreDevice(device)` / `patchDevice(id, patch)`,结算下架改走 retireDevice(absent = 别处已抵扣 → 拒单冲正)、建单失败只回架**本实例**下架的那台;`deactivateDevice` 返落盘判决,设备页两处按判决给文案;`consume()` 三态(consumed / absent / failed:写失败留在扫码步弹「交易未保存」,不谎称别处已结算);离开提示改报真实剩余分钟;onLoad 三门不再删票,改提示「待支付订单已保留;如已转账请联系客服」(新 key pendingResumeBlocked ×3);convert 终态后失败面独立 kind=trial 文案 + 登记(新 key trialStuck ×3);bundle 加数值闸 + 余额预检,debit 失败弹「交易未保存」;置换 sheet:三条成交腿调用 settleProduct、置换 / 强制两腿在停旧机前按同一槽位谓词预检、deactivate 判落盘、任务快照恢复走 patchDevice;deposits 三处入金收据写失败 → 待对账登记(同 R6 结算页处置,原豁免理由被审计证伪);persist-verdict 门:新增「页面 / 组件不许直写 app.devices/user/withdrawals/earnings」赋值判据(app.ts 自身除外)、原语 +5、发现地板 24;vitest consume 三态。
- 审计 R8(Workflow 五层,43 agent,HEAD be4713b):确认 P0 ×1(卡 / $0 结算完全绕过发票不变量:链上开票后离开,全新结算页实例改用卡付同一 SKU 成交,旧票仍活着、浮动条继续催第二笔)+ P1 ×5(余额预检已过后 debit 失败只可能是落盘故障却弹「余额不足」/ 置换加购五处回滚直写 app.devices 不落盘 → 白得一台 / persist-verdict 门对本地包装函数失明(consume 丢判决恒返 true 门仍绿)/ FILES 手写闭集,门外 98 处命中 / pending.remove 丢弃 CAS 判决,取消可静默失败);对抗 kill ×4;P2 ×54;critic 缺口 14。
- R8 修法(本轮):store 增 `settleProduct(productId)`(任何支付方式成交 = 该商品在窗票作废;checkout 建单后 + bundle 建单后调用;运行时门场景 G:链上开票 → 离开 → 卡付同 SKU → 票 0 张 / 条消失,红测去掉调用即红)+ `remove()` 返回布尔(显式取消删不掉 → 提示重试不宣布已取消;回弹 / 门命中处标注放行);debit 落盘失败改弹「交易未保存」;置换五处回滚改 `discardSpawnedDevice`(落盘)+ 撤不掉登记待对账;persist-verdict 门:扫描面改构造性发现(import money-receipt / CAS 提交器 / 账户快照 / 资金与设备原语,32 文件,核心种子为下限)+ 本地包装函数按「返回值派生自判决」迭代入集(consume 变异实测红)+ 属性访问同名不算本地包装 + 遮蔽,首跑门外 21 处逐条标注理由(冲正腿收口点内部已响亮 / 入金收据残余归入金包 / 奖池票数残余归活动包 / 进度与过期标记下一 tick 重放);vitest settleProduct / remove。
- 审计 R7(Workflow 五层,43 agent,HEAD eacdad4):确认 P0 ×1(R6 给 freeTrial.start 加的回滚快照取在 `status = active` **之后** —— 落盘失败回滚成「active + 全空边界」的坏行,解析器 fail-closed 判 ended 并被 poll 落盘,一次性试用资格被永久烧掉;R6 自己引入)+ P1 ×5(补偿链 kind 优先级两处把钱卡住报成券 / 建单失败设备退不回只报 funds 且无设备信息 / persist-verdict 门 FILES 漏 app.ts(addDevice / activateDevice 落盘失败照样返回成功)/ 门自测把 `ok && persist();` 认证成合规、同族 9 种丢弃写法放行 / 试用转化单仍会叠加旧机抵扣,护栏只焊在 intercept);对抗 kill ×4;P2 ×49;critic 缺口 16。
- R7 修法(本轮):快照移到任何字段改动之前 + vitest `free-trial.persist.test`(storage 注入失败:start 后仍可开始、convert 失败仍 active;变异回原写法即红);补偿链 kind 优先级统一 钱 > 设备 > 券(新增 kind=device 与三语文案,ref 带设备 id);`app.addDevice` 返回 `string | null`(落盘失败不给 id)、`activateDevice` 返回落盘判决;履约 advanceOrder 拿不到 id 这一跳不发生;置换三处调用点判 null;persist-verdict 门:FILES 加 app.ts / tradein-sheets.vue、原语加 postReceiptOnce / addDevice / activateDevice / discardSpawnedDevice / markActivated、判据从「裸调用」扩到全部丢弃位(逻辑与或 / 逗号 / 三元分支 / 一元 / 数组对象字面量 / 非判决调用实参 / 可选调用),自测 14 红 12 绿;app.ts 里 11 处非资金落盘逐条标注理由;`appliedTradeinView` / `resolveQuotedTradeIn` 在试用转化态一律 null;两 harness 判据接受 `const x = app.restoreMoney(...)` 形状;PORT-PITFALLS 编号避撞改为 P-115 / P-116 / P-117;交接书指针补 U-20 / U-21 索引(与后台仓正文双向相等)。
- 审计 R6(Workflow 五层,43 agent,HEAD da445ec):确认 P0 ×1(收据恢复行的落盘结果被丢弃 —— 收据与恢复行走同一层 storage,写不进去时唯一的补写入口随 onShow 蒸发,且不进待对账队列)+ P1 ×4(voucher.release 返回值在 5 个失败面被丢弃 / normalizeSessions 只卡窗口宽度不卡位置,时间戳同步前移 10 年即永生发票 / netPrice·cardFee·goConfirm 直读全局槽的 canonicalQuote 绕过 appliedTradeinView 四道校验 / 支付时刻「抵扣失效」闸用全局槽当前件,全价单被误拒销票并清掉兄弟实例的抵扣);对抗 kill ×5;P2 ×60;critic 缺口 12。**同型第三次(落盘判决被丢弃)→ 按 R5 反思的约定升层**:新增 AST 机器门 `scripts/selfcheck-persist-verdict.mjs`(TypeScript AST,vue 只取 script 块;钱路 6 文件里 17 个落盘 / CAS / 资金原语不许作为裸表达式语句;`void` 显式丢弃与 `persist-verdict-ok: <理由>` 放行;自测 4 红 7 绿 + 真文件变异红),首跑抓出 14 处(含审计的 2 处 + bundle 同形 + orders.advanceOrder 落盘失败会在下一 tick 再发一台设备 + free-trial start/end + 远端命令键 4 处)。
- R6 修法(本轮):恢复行写失败 → 内存卡保留(onShow 只在磁盘有行或换号时覆盖)+ `reportStuckFunds(..., "receipt")` 登记待对账并给交易号;补写改 `postReceiptOnce`(按 ref 幂等,清不掉恢复行不会写出第二条);`reportStuckFunds` 增 kind(funds / voucher / receipt 三套文案,三语);`releaseVoucher` 返回布尔,五个失败面按 voucherBack 决定通用文案还是响亮终态;`normalizeSessions(raw, now)` 加位置上界 `expiresAt ≤ now + 30min`(vitest 加「两个时间戳同步前移」靶,原「只动 expiresAt」靶保留);`appliedTradeinView` 外露 canonicalQuote,netPrice / cardFee / goConfirm 改读视图;支付时刻 `resolveQuotedTradeIn()` 按本页快照解析抵扣、失效闸前件改 `quotedTradeIn && !ti`、清槽带 owner;`orders.advanceOrder` 落盘失败退回内存并撤回刚生的设备(`app.discardSpawnedDevice`),`markActivated` 判落盘;`freeTrial.start / end` 落盘失败退回并报 ok:false(advanceTo 标注为纯推导放行);远端命令键 4 处标注放行并落 HANDOFF U-21(服务端须按账号 + 意图幂等);bundle 恢复行同形处理 + 补写幂等。
- 审计 R5(Workflow 五层,43 agent,HEAD 3f2c765):确认 P0 ×3(单次券核销 CAS 判决被丢弃 + 排在建单之后 → 两处各结算一次同一张券 / 收据恢复卡排在全部 step 分支之前 → resume 进来的活票整页被遮、全站失联 / cleanup 的 tradein.clearApplied() 无 owner → 同栈第二个结算页实例卸载抹掉在世实例的抵扣,活票按全价复算被「金额已变」拒单并销票 —— 审计跑了运行时红测)+ P1 ×4(发票无券而窗内新领券 → voucherQuote 清 null 后被券一致性闸误拒 / R4 两条钱路规则零机器门 / freeTrial.convert 落盘失败仍报 ok / bundle 逐单建单中途失败整体退款而已落盘的单子照发设备);对抗 kill ×3;P2 ×56;critic 缺口 10(浮动条从未被切成 unit、R3/R4 未过实景门、orders.persist 同形调用点、tradein 单槽在 adoptSession 的写、远端/沙盒档、refreshFromDisk 不自愈、发票行取值域、文案、发票生命周期产品面、多实例栈 ownership)。
- R5 修法(本轮):券「先占后花」—— `voucher.markUsed` 返回 CAS 判决并排在扣款之前,之后每个失败面 `release` 放回(vitest `voucher.redeem.test` 双实例只成一次);收据恢复卡 `v-if="receiptWriteFailure && !activeSession"`(有活票先付票);tradein 槽记 owner + 页级镜像 onShow 重挂 + cleanup 幂等(`pageAlive` 门)—— 运行时门新增场景 F(push 第二个结算页实例再返回,抵扣仍在、恰按票面 634.08 成交;红测:去掉 owner/重挂/幂等 → F 红);券一致性闸只在快照带券时生效;`reconcileInvoiceQuote` 抽成核心层纯函数(vitest 钉逐项 min / 篡改封顶 / 窗内新券不参与)+ trial-quote harness 加票面相等闸与券 CAS 固定靶 ⑦⑧(变异红测:删闸 → 4 红,核销恒真 → 2 红);`freeTrial.persist` 返布尔、convert 落盘失败退回内存报 ok:false;`orders.createOrders` 一批一次落盘(bundle 不再逐单)+ `cancelOrder` 落盘失败返 false;`refreshFromDisk` 读入面自愈(剪过期 + 单活票,正常行只读同步);`normalizeSessions` 取值域(窗口 (0,30min] / createdAt≤expiresAt / 票面=报价总额 / 分项非负);建单失败补偿三件不短路;浮动条对 sub-page-header 子页也下让一带(sticky 行经 provide/inject 钉在带下沿;Playwright 实测 daily / wallet-nex overlap 36px → 0);`pendingSettledElsewhere` 文案改成与落点一致;onConfirmPay 本地发票腿前再钉一次远端守卫。

### 结构性反思 ②(R5→R9 仍未收敛,2026-08-17)
五轮各确认 5–8 条,总量不降。按族拆:① **发票 store 自身的不变量**(≤1 活票 / 至多结算一次 / 票面恰好结算 / 成交即兑现意图)自 R2 起没有被推翻,R8 的 P0(卡付不作废旧票)与 R9 的 P0(设备无 CAS)都不是发票内部,而是**结算梯子对相邻 store 的组合**;② 其余确认项落在**既有 store 的失败面**(persist 返回 void 的家族、页面直写 devices、置换 sheet 的回滚逻辑、入金收据缺口)—— 这些在本包之前就存在,是审计沿着钱路往外扫到的;③ 门自身被证伪两轮(手写闭集 / 包装失明 / 赋值旁路),现在是构造性发现 + 派生包装 + 直写判据。**根因结论**:mock 档的结算梯子是「页面编排 6 个无事务 store」,每一步都要手写补偿与判决,补偿本身又能失败 —— 这是结构性的、且按 CLAUDE.md 的口径它是**优化期临时脚手架**(生产结算 = 服务端单事务)。继续逐轮把 mock 梯子焊得更硬,边际收益递减而每轮成本约 500 万 token。**建议(交主人拍板,见收尾汇报)**:本包在门(vitest / harness / 运行时 A–G / persist-verdict / verify)全绿 + 独立 T5 通过的状态下合并;剩余同族债按「服务端权威结算」路线在真后端接入时一并消化,而不是再刷 mock 轮次。

### 结构性反思(nexion-audit 铁律:≥2 轮同型 → 先反思再继续)
R4 与 R5 出现两族同型:**A「落盘 / CAS 判决被丢弃」**(R4:persistAccountSnapshot、createOrder;R5:voucher.markUsed、freeTrial.persist、orders 同形三处)与 **B「全局单槽无 owner」**(R1:page-header;R5:tradein 槽、viewingId)。四问结论:① 路线没选错 —— 发票 store 的不变量(≤1 活票 / 至多结算一次 / 票面恰好结算)自 R2 起没有再被推翻,R4/R5 的确认项全部落在**结算块调用的既有 store 契约**上;② 结构性根因是**既有 store 的 `persist()` 一律返回 void、由页面代码替 store 承担一致性**,以及**页面级 UI 上下文放在全局单槽 store 里且允许多实例同栈**;③ 族的根治:A 族在钱路上逐个消费返回值只是补丁,真正的不变量是「结算链上每一步落盘 / CAS 都必须把判决交回调用方」—— 本轮把结算链上的全部落盘点(app 快照 / orders / voucher / free-trial / pending)收齐并各配 vitest,并把「先占后花 + 失败放回」写成券与发票同一形状;B 族用同一个 owner 模型收口(page-header / tradein 两处同款,cleanup 幂等),判据写进 P-116;④ 机器门:结算链的三条钱路规则(票面相等 / 券 CAS / 逐项 min)与场景 F 都焊成了跑代码的门,不再只有注释。**结论:非方向性错误,可以继续 R6;若 R6 再出现 A/B 同型 → 停下把 `persist()`/单槽 owner 升成全站 store 层约定(而不是再补调用点)。**
- 审计 R4(Workflow 五层,43 agent):确认 P0 ×1(旧机下架 `persistAccountSnapshot()` 返回值被丢弃 —— 落盘失败时设备复活、扣款照旧、订单仍记 tradeInDeviceId)+ P1 ×3(恢复发票后现算值可低于票面,QR 说转 649 却按 600 入账、差额无账目落点 / 开票时 quote.tradeIn 取撞单框 await 之后的实时读数而非确认页快照 / 下架先于建单落盘,createOrder 把 persist 失败整条吞掉);对抗 kill ×6;P2 ×48;critic 缺口 19(首条:R3 修法④收据恢复行「按商品作用域」写侧从没写过 productId → 门空转)。修法(本轮):adoptSession 逐项 min(现算, 票面)+ 支付时刻「实扣 = 票面」闸(链上发票按二维码金额恰好成交,不等即拒单重报价);openChainSession 写 quotedTradeIn;下架落盘判返回值(失败 → 资金冲正 / 响亮终态);orders.persist 返回布尔、createOrder 落盘失败撤内存返 null(vitest `orders.persist.test.ts` 2 例并登记 verify),checkout / bundle 两个调用方按原路退回(旧机重新上架 + 资金冲正,退不回去 reportStuckFunds);persistReceiptRecovery 补写 productId;dropResumeInvoice 只作废本商品页的票。critic 其余:viewingId 单槽无 owner(至多一张活票 + onShow 重设,不改)、cleanup 里 tradein.hide() 全局(sheet 只从结算页开,不改)、浮动条 push 无上界(条在展示该票的结算页上不显示;跨页多次点击受 uni 页栈上限约束,不改)。
- 审计 R3(Workflow 五层,43 agent):确认 P0 ×1(发票行是不可信输入:恢复时原样复位持久化 voucher.discount,篡改成 648 可 $1 买 $649 —— 审计运行时复现)+ P1 ×5(单向天花板下报价后才可抵扣的设备被静默下架 / consume 不可逆排在余额之前 / 收据恢复行劫持所有结算页 / retryReceiptWrite 绕咽喉留孤儿票 / onLoad 门序循环);对抗 kill P0 ×1 + P1 ×3;P2 ×58;critic 缺口 18。修法(46cba0e):adoptSession 券/试用按此刻现算、发票只作天花板;quotedTradeIn 页级快照(支付时刻只承认报价当时的设备);余额预检先于 consume;恢复行加 productId 作用域 + 补写成功先作废本页发票;三道跳转门命中作废 ?resume 票;文案按「不在册 vs 过期」区分;goAwaiting 先回灌;storage 事件拨时钟;运行时门 E 探针无条件化。
- 审计 R2(Workflow 五层,43 agent):确认 P0 族 ×3(同根:支付时刻只验「过期」不验「还在不在」,同一张票被两处各结算一次 / 取消后仍能扣;审计跑了运行时复现)+ P1 ×3(resume 只认内存 / 购买门回弹静默 / live toast 硬编码英文);对抗 kill P1 ×4;P2 ×55;critic 缺口 22。修法(本轮):store 增 `consume(id)`(CAS 在磁盘最新行要求票仍在册且在窗,删成功才返 true)并排在 debitBalance **之前**;`refreshFromDisk()` + H5 `storage` 事件回灌;resume / onShow / goAwaiting 先回灌再判;bindAccount 读入面自愈到单活票;购买门回弹加 toast;live toast 走 i18n;运行时门加场景 E(两标签页一张票只结算一次)并把条 / 返回 / CTA 改真实点击;vitest +5(consume 一次性 / 拒已取消 / 跨实例后到者失败 / refresh 只读 / 多活票自愈)。
- 审计 R1(Workflow 五层,43 agent):确认 P0 族 ×4(同根:支付时刻守卫回弹不作废发票 + store begin 纯追加 → 再点 Pay now 铸第二张活票、两地址催付、落单后孤儿票二次扣款)+ P1 ×1(回弹后 viewingId 钉死浮动条被抑制);对抗 kill P1 ×5(扣款金额与发票不同源 / 守卫回弹后钱在链上 / 建单无条件销票 / onLoad 门前无退役路径 / 守卫无门 —— 均被 3 视角证伪);P2 ×55;critic 缺口 16。修法(1722cd9):不变量焊进 store(begin 在磁盘最新行复核 ≤1 活票 + replaceId 同次销旧开新,CAS 提交器)+ watch(step) 单一咽喉作废发票 + 撞单框对任何活票都问 + confirmed 复检在窗 + onHide/onShow viewing 握手 + owner 精确收确认框 + 页头 owner 清 + 卸载收 sheet + 组件层 6 项;新增 store vitest 9 用例与运行时门 pending-checkout-runtime.mjs(红测:关咽喉 → C 红)。
