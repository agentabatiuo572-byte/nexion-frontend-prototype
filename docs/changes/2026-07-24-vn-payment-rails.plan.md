# 实施拆解 · 越南支付双轨(vn-payment-rails)

> 规格(Signed 2026-07-24):`PRD/specs/PAY-Nexion_越南支付架构规格_v1.0.md` | 原型:`PRD/prototypes/pay-vn-rails.html`
> 状态:**Stamped(主人盖章 2026-07-24,A→B→C 全量推进)** | 定级 L | 主链工程 = Nexion-uniapp,跨线批次 B 在 Nexion-admin-prototype
> 纪律:每子任务 ≤1 上下文;实现方 ≠ 验收方(独立 tester 黑盒验收,敏感子任务加 code-review agent);pass 才打勾 + 回源三问;同一子任务 ≥2 轮 fail 熔断报主人。

## Done-when(批次级,P6 逐条回测)

1. 充值三通道(USDT 链上 / VietQR / 卡)与提现收窄 + 换绑,在 browser 实景按规格 ② GWT 全部可走通(含异常路径),console error = 0。
2. 机器门:uniapp `vue-tsc` 0 错 + `verify.sh` 全绿;admin `verify.sh all` 全绿(canon-sentinel / kill-switch 计数 / A2 审计覆盖门不破)。
3. 全站 grep BTC/ETH 充提入口残留 = 0(历史种子/文案/枚举一并清)。
4. 换号不继承固定靶:充值记录 / 入金意向单 / 提现地址绑定均按账号作用域,切换账号互不可见。

## 已知脆性清单(喂给每个 tester,先证伪环境再判 fail)

- uniapp 页面验证走 `http://localhost:5173/#/...?nx_device=off`(device-shell iframe 白屏假象);store 注入用 uni 包装 `{type:'object',data:X}`。
- 5173 先探后杀(vite 绑 [::1]);中断必清孤儿 headless chromium。
- admin 需登录态:`NEXT_PUBLIC_ADMIN_AUTH_BYPASS=1` 或走 loginAdmin();改弹窗结构前 grep `scripts/*walkthrough*.mjs` 同步断言。
- i18n 加 key 必 en/zh/vi 三文件同序(镜像哨兵);颜色只用 `--v5-*` token。

## 批次 A — Nexion-uniapp(前端,依赖:A1 → A2 → A3;A5 → A4;A6 平行;A7 收口)

- [x] **A1 通道/网络枚举收窄+BEP20 基础**(敏感:钱 → tester + code-review)✅ 2026-07-24 三轮验收 PASS
  文件:`src/store/types.ts`(channel/network 枚举)、`wallet-topup.vue` ALL_CHANNELS、`wallet-withdraw.vue` NETWORKS、i18n×3、全站 grep BTC/ETH 种子与文案。
  AC(PAY01 ③通道表 / PAY04 ②阳光1):充值通道 = usdt-trc20/bep20/erc20 + bank-vietqr(占位)+ card;提现网络仅 USDT×3;BTC/ETH 充提入口残留 grep = 0。
  测试:type-check 0;browser 充值/提现页通道列表实景;`verify.sh`。
  tester 报告:`docs/changes/vn-payment-rails-tA1-test.md`(3 轮:首轮 6/7→i18n 修复→三轮全 PASS;code-review APPROVE 0 阻塞)| 回源三问:① 仍服务规格 PAY01/PAY04 收窄目标 ✓ ② 偏差两处均实现侧:KYC $1 验证补 BEP20(规格 PAY04 ③ 一致性修正)、topup 页存量+新增 i18n 硬编码清债 11 键三语 ✓ ③ A2 建模计划成立(施工中)✓

- [x] **A2 入金模型 + 链上到账闭环(store 层)**(敏感:钱+状态机 → tester + code-review)✅ 2026-07-24 验收 PASS
  文件:`src/store/deposits.ts`(新:DepositRecord/DepositIntent + mock 侦测/确认推进 + 每账号×网络确定性地址派生)、`types.ts`、`bills.ts` 联动、`app.ts` recordDeposit 接线、account-scoped 存储。
  AC(PAY01 ②阳光+异常1/3、④):detected→confirming n/N→credited 且余额/账单联动;dust-hold 不入账;同 txHash 幂等 no-op;地址恒定;换号不继承(固定靶)。
  测试:type-check;注入驱动到账后刷新余额仍在(真写+刷新还在);`verify.sh`。
  tester 报告:`vn-payment-rails-tA2-test.md`(6/6 PASS,真 UI 切号验隔离;code-review APPROVE,MEDIUM 持久化回滚 + LOW 备注表已修并复绿)| 回源三问:① 服务 PAY01 ③④ 目标 ✓ ② 偏差 1 观察=「充值入可提桶?」→ 裁决维持既有语义,§5 已加口径澄清(规格补丁非实现错) ✓ ③ A3/A5 计划成立 ✓

- [x] **A3 充值页重构 · USDT 链上 tab + 获取指引页**(UI → tester + 设计评分)✅ 2026-07-24 验收 PASS · 评分 96.5
  文件:`wallet-topup.vue` 重构、新 `components/me/deposit-usdt-pane.vue`、新静态页 `pages/me/usdt-guide.vue` + `pages.json`/`lib/route.ts`、i18n×3。
  AC(PAY01 ⑤4 态 + ⑥点击流):骨架/空/停用/断网四态;最近入金实时进度;错网络警示;`?kyc=1` KYC-Express 流程零回归;入账可见性=最近入金列表+账单双入口,UI 不得承诺「充值可提现」(§5 口径澄清)。
  测试:browser 实景 4 态 + 点击流矩阵逐行;console 0;设计 6 维评分 ≥95。
  tester 报告:`vn-payment-rails-tA3-test.md`(4 轮:首轮 9/10+评分 92 → 修复轮 6 扣分点全消 96 → 终轮扫尾 96.5 全 PASS;附带把 tx 详情页改成带参真值渲染、QR 换按地址派生+定位角、卡表单存量硬编码 20+ 处全部三语化)| 回源三问:① 服务 PAY01 ⑤⑥ ✓ ② 偏差=评分揪出的存量可信度债(tx 假数据/静态 QR)顺势清偿,规格无错 ✓ ③ A4 挂点(segmented 第三段+牌价行)已备好 ✓

- [x] **A5 汇率牌价 client(store+UI)**(敏感:钱 → tester + code-review)✅ 2026-07-24 验收 PASS(运行时 AC 由 tA4 报告 A5 节盖章)
  文件:新 `src/store/fx.ts`(FxQuoteConfig 拉取 + syncFailed 语义)、牌价行 + 牌价说明半屏组件、i18n×3。
  AC(PAY03 ②全部):拉取失败通道置灰禁下单不回退写死价;quoteRate 派生不缓存;异常数据(≤0/缺字段)防御。
  测试:注入 syncFailed / 异常值走查;type-check;`verify.sh`。
  tester 报告:code-review 曾 BLOCK 1 HIGH(货币换算浮点边界静默算错)→ 整数域精确算法根治 + 自检 26/26(BigInt 网格参照)+ 跨仓 fx-parity 哨兵(B3 焊);运行时 AC 由 `vn-payment-rails-tA4-test.md` A5 节全 PASS(牌价行/半屏/失败态灰禁/恢复) | 回源三问:① 服务 PAY03 ✓ ② 偏差=浮点缺陷属实现错已根治并加双保险 ✓ ③ A4 消费接线成立 ✓

- [x] **A4 VietQR 银行轨(UI+store)**(敏感:钱+状态机 → tester + code-review)✅ 2026-07-24 验收 PASS
  文件:新 `components/me/deposit-bank-pane.vue`、`deposits.ts` intent actions(锁价/附言码/回调匹配/超时/差额/孤儿 mock)、i18n×3。
  AC(PAY02 ②阳光+异常1/2/3/4、④):下单锁价 30min;精确到盾;超时 expired + 迟到转账人工态;差额 mismatch_review;取消出口;账户池空 → 通道置灰。
  测试:browser 走全状态机(mock 驱动);对照原型 `pay-vn-rails.html` 行为一致;console 0。
  tester 报告:`vn-payment-rails-tA4-test.md`(首轮 7/7 含 A5 运行时节 → review BLOCK 2 HIGH(迟到边不可达/账户池熔断缺失)+2 MED → 修复轮 6 条 → 复验 5/5 PASS)| 回源三问:① 服务 PAY02 ③④/§5 ✓ ② 偏差=2 HIGH 均 plan AC 明列的实现遗漏,已补全 ✓ ③ A7 收口靶点已列 ✓

- [x] **A6 提现地址换绑流程**(敏感:钱+权限 → tester + code-review)✅ 2026-07-24 验收 PASS
  文件:新 `pages/me/wallet-address-rebind.vue` + 路由、`wallet-pairing.ts`/绑定 store 扩展、`wallet-withdraw.vue` 地址行 + 冻结横幅、i18n×3。
  AC(PAY04 ②阳光2+异常1/2/3/4、④):$1 重验证→原子换绑→24h 冻结(提现按钮灰+倒计时);在途提现单拦截;7 天频控;来源不符可重试;换号不继承绑定。
  测试:browser 全流程 + 冻结态;type-check;`verify.sh`。
  tester 报告:`vn-payment-rails-tA6-test.md`(首轮 7/8 → review 2 HIGH(冻结未下沉/网络脱钩)+tester 1 FAIL(tracking 原因吞行)→ 修复轮 5 条 → 复验 4/4 PASS)| 附带:风控话术挖出第 3 渲染源抽单源共享函数 `risk-reason-text.ts`+焊哨兵(根治两张皮)| 回源三问:① 服务 PAY04 ②③④ ✓ ② 偏差=2 HIGH 均安全性实现缺陷(server-canonical 冻结/网络绑定),已根治 ✓ ③ A7 收口靶点(跨仓 walkthrough selector)已列 ✓

- [ ] **A7 批次收口:哨兵 + 实景门 + 审计**
  内容:verify.sh 增哨兵(BTC/ETH 充提残留=0、fx 派生不缓存、通道枚举单源);全量 type-check + verify;独立走查 agent 扫全部改动路由 + 5 tab 基线(双语双主题);`nexion-audit` 修到 P0=P1=0;产品更新日志追加。
  ⚠️ 跨仓债(2026-07-24 B1 验证时发现):admin 仓 verify 的 `uni-storage-key-sentinel` + 2 个跨仓 walkthrough 断言被本批 uniapp 改动牵红(充值页结构重构 + 新持久键 `nexgrid-deposits-accounts-v1`)——**等 A3 充值页定型后一次性同步**(收进本条或 B4),防改两遍;另 uniapp verify 有 1 项 genesis 零边框红灯属其它会话 WIP,非本批,收口时仍红则报主人。
  tester 报告:`…-tA7-walkthrough.md` | 回源三问:□

## 批次 B — Nexion-admin-prototype(后台,依赖:B1 → B2/B3 → B4)

- [x] **B1 通道枚举 + 账本第 9 科目(data 层)**(敏感:钱 → tester + code-review)✅ 2026-07-24 验收 PASS
  文件:`d-tabs/data.ts` CHANNELS、`lib/mock/admin/user-deposits.ts` channel、`lib/mock/admin/ledger.ts` LiabilityAccount 增「待核实入金」、D2 网络展示。
  AC(§5/§6):D1 渠道表=新枚举;C1 投入卡同步;账本 9 科目且「储备=负债+净值」校验仍平;KILLSWITCH 仍 5 闸(哨兵计数不变)。
  测试:tsc;`verify.sh all`(canon/kill-switch/A2 审计哨兵全绿)。
  tester 报告:`Nexion-admin-prototype/docs/vn-payment-rails-tB1-test.md`(6/6 PASS 实景;review APPROVE,2 MEDIUM——「八类」文案 + 提现三网络三处手抄——均已修并复绿:tsc 0/派生等值/killswitch/canon OK)| 回源三问:① 服务规格 §5/§6/PAY01 ③ ✓ ② 偏差=恒等式建模(reserve/负债同额+3,847.52)与规格 §5 挂账分录一致,无规格错 ✓ ③ B2/B3 依赖的 channels 单源与 suspense 科目已就位 ✓

- [x] **B2 D1 银行轨对账 + 收款账户池**(敏感:高敏动作 → tester + code-review)✅ 2026-07-24 验收 PASS
  文件:`d1-recon.tsx` 扩展(或新 section)、`data.ts` mock(意向单/孤儿/差额/过期后到账队列 + 账户池)、`registry/d.ts` 文案。
  AC(§6 行1/2):五视图齐;手动匹配/按实收核销/登记退回三动作全带确认+理由+审计+失败态;账户池启停/日限/轮换/水位;运营可读中文标签。
  测试:tsc;`verify.sh all`;Playwright 点三动作走审计落账;walkthrough 断言同步。
  tester 报告:`Nexion-admin-prototype/docs/vn-payment-rails-tB2-test.md`(首轮 5/6+2 缺陷 → 修复 → 复验 3/3 PASS;review 曾 BLOCK 1 HIGH=跨页账实断言过强 → 日终过账语义裁决落地)| 附带收获:修掉全站共享层两个存量缺陷(A2 审计详情从不显示理由 / 确认弹窗可连点刷审计)| 回源三问:① 服务 §6/PAY02 ③④ ✓ ② 偏差=账实一致的实现方式从「实时联动」改「日终基线并存」,属产品语义澄清非规格错(B4 走查自洽)✓ ③ B3 依赖的锁价快照语义已注明 ✓

- [x] **B3 [D6] 汇率牌价模块(新 tab)**(敏感:钱 → tester + code-review)✅ 2026-07-24 验收 PASS
  文件:新 `d-tabs/d6-fx.tsx`、`d-tabs/types.ts`/`data.ts`、D 域 tab 注册(走 admin L2 模块位置栈 9 位清单)、registry。
  AC(PAY03 ③ + §6 行3):base/spread/锁窗可配 + 生效历史 + 审计;spread 越界 422 失败态;quoteRate 派生展示不双写。
  测试:tsc;`verify.sh all`;Playwright 改价→审计落账→越界拒绝。
  tester 报告:`Nexion-admin-prototype/docs/vn-payment-rails-tB3-test.md`(7/7 PASS;review APPROVE 零缺陷,数学两仓逐字符一致+parity 哨兵真执行双向致红)| 回源三问:① 服务 PAY03 ③/§6 ✓ ② 偏差 0;fx-parity 哨兵为进化闭环新增(跨仓值教训落机器门)✓ ③ B4 走查靶点已列(含 2 条非阻断观察:A2 审计前值「—」与 D6 历史口径差、422 后弹窗不可原地重试)✓

- [ ] **B4 批次收口**:全量 verify all + 独立走查(D 域全 tab)+ `nexion-audit` P0=P1=0。
  注(2026-07-24 B2 审查 HIGH 处置):挂账跨页一致性裁决为**日终过账语义**(D1 实时队列 + 科目 #9 日终基线并存,页脚说明归平)——B4 走查确认两页表述自洽;实时活选择器统一非本批必须,要做另立任务。
  tester 报告:`…-tB4-walkthrough.md` | 回源三问:□

## 批次 C — 文档同步(A+B 完成并主人确认后)

- [ ] **C1 PRD/参数修订**:前端 PRD §9.2/§9.3 按规格 §7 清单 7 条修订(走 nexion-prd-sync,改根 PRD/ 不改 repo 副本);处方 §3.D 补 VietQR 参数 + 提现最小额 $20;《资金账本_落地方案》科目表补第 9 科目;后台 D 域 PRD 续写登记到 nexion-admin-prd 线。本 plan 标 Shipped + memory 收尾。

## 平台不变量(每子任务自查)

i18n 三语同序 · token 不写 hex · mock 100% 可接真(action=endpoint 形态)· 产品内 0 meta · 数字可信 · 高敏动作确认+理由+审计+失败态 · 参数单源派生 · per-account 作用域 · server-canonical 状态 client 不推进。
