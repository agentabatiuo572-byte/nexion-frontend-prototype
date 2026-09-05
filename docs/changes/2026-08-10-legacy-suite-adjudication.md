# 老哨兵套件 43 红门逐条判决(包 z1-legacy-gates)

- **基准提交**:origin/UniApp = `c37e642`(feat: align app remote business flows)。基线实测:老套件 `bash scripts/verify.sh` = **380 pass / 43 fail**;新链 `npm run verify` = **绿(exit 0)**。两条链在同一 checkout 串行实测,与主人交底一致。
- **两笔肇事提交**:`c37e642`(远端业务流对齐,客户端资金权威整体让渡后端,113 文件 ±5k 行)与 `a8f57f4`(移除 KYC client runtime)。另有前置 `819a6da`(种子搬进 compat 运行时边界)贡献 3 条。
- **判决口径**:A=判据过期(不变量在,形态变了→改成构造性判据+双向红测)· B=真回归(修码+门同一提交)· C=判据废弃(主语已不存在→显式删除并写明)。
- 状态列:☐ 待实施 · ◐ 实施中 · ☑ 已实施 · ✔ 已红测。

## 2026-08-15 路径与真实契约收口

本台账的运行时基线已迁至当前真实工作树：App 为 `D:\workspace\NX1.0-UniApp`，PC 为 `D:\workspace\nexion-ops-console`。历史条目中的 `Nexion-uniapp`、`Nexion-admin-prototype` 和 `lib/mock/admin/compute-config.ts` 仅保留为历史证据，不再作为脚本输入或验收来源。

- SPEC-7 parity 现在执行 PC `scripts/platform-config-contract-parity.mjs`：严格检查 App `src/api/platform-config-api.ts` 的 `/api/config/platform` 解析契约，以及 PC E6 `/api/admin/devices/compute-config`、K1/K2 server API parser 的真实来源；不恢复已删除的 mock，也不以默认值冒充服务端值。
- 采样证据现在由 PC `scripts/uniapp-port-coverage-audit.mjs` 读取 App `D:\workspace\NX1.0-UniApp\src\pages.json` 与 PC `docs/audit/shards`；缺证据仍判红，不改为跳过。

## 总判决:A 30 · B 8 · C 7(B 类单列见文末;B7/B8 为首轮修复后全量复跑揪出的第二层真回归)

| # | 门 | 判决 | 依据(回源) | 处置 |
|---|---|---|---|---|
| 1 | selfcheck-fastlane(13 子红) | A+C+B4 | 13 子红全在静态接线门半区,行为断言半区全绿。子 1-9/12:submitWithdrawal 本地「占额度/扣款/落盘/重放」链整体删除(app.ts:1249-1280 remote-only,-182 行),主语灭失→C;子 10:列表模型仍在,写法 `wd`→`canonical`+按 id 去重(app.ts:1278)→A 重锚;子 13:smallAmountLine 有意 HOLD 硬编码 0(wallet-withdraw.vue:660,注释明写 backend 未实现快车道)→A 钉 HOLD 态;子 11:commitWithdrawal(风控台账落地)搬进 withdrawal-eligibility.ts:135-137 后**全站零调用**→B4 | 重写静态块:删灭失主语断言(替代义务记 HANDOFF:服务端事务内占额度/复核);重锚子 10/13;B4 接线+钉新调用点 |
| 2 | selfcheck-feegate(2 子红) | A | F1:feeConfigUsable 判据换源(config store→页面本地远端 policy,3 合取 fail-closed,wallet-withdraw.vue:532-537);F2:重试 `cfg.load()`→`loadWithdrawalPolicy()`(:540-548),语义未变 | 整串 pin 换钉新定义全文(保留「尾部不得追加分支」防 `\|\| true`);F2 重锚新函数名。另加 B2 的渲染条件 pin |
| 3 | selfcheck-slacopy(8 子红) | A+C | 6 条 {h} 占位符:三语时限承诺句被有意改为「以服务端订单状态为准」(zh 932/en 994/vi 950 + terms 127/138/139,三语同步无漏);§04 渲染源换远端 chapters(risk-disclosure.vue:141-145),本地 withdrawWindowBody 成零消费死 computed;§06 插值机制随文案删除 | {h} 断言退役,保留并确认「无写死数字」断言;重锚 §04 远端渲染源+loadError 重试;删死 computed(其 4 条绿断言一并退役,防假绿);§06 断言退役 |
| 4 | bare login-entry chrome runtime geometry | A(共因) | 18 页×2 视口全部几何断言通过,仅 console 断言红=启动期 3 个 unhandled rejection(B1)+ suite 从未声明 dev server 需 mock 模式 | B1 修复 + verify.sh 焊「server 必须 mock 模式」前置断言(构造性:探不到模式即红) |
| 5 | payout-address PROD guard | A | 守卫仍在且**加强**:`if (import.meta.env.PROD \|\| remoteApiEnabled) return false`×2(payout-address.ts:296/308,a8f57f4);老判据钉死单条件字面 | 重锚:函数体内 `import.meta.env.PROD` 出现在守卫 return 且允许附加合取/析取;0 候选即红;两处都验 |
| 6 | SPEC-7 riskScore cloned | A | 克隆逻辑 819a6da 搬进 compat(platform-config-compat.ts:64-67),写法同款(seed 展开),覆盖面更全;config store 经 completePlatformConfigSeed 初始化(config.ts:20) | 新 selfcheck-config-compat.mjs 行为断言:合成两次互不污染+改合成物不污染种子 |
| 7 | SPEC-7 release ledger exists (R1) | C | c37e642 客户端释放引擎整体让渡后端:LEDGER_KEY/readLedger/writeLedger 删,appendLedgerEntry 成 `return false` 空壳;快照改 shallowRef+GET /api/earnings/release-status(earning-release.ts 15-39) | 显式删门。**连带处置殉葬绿门**:verify.sh:405-416 一带钉空壳调用的 journal×2/attest/release 哨兵同批退役(绿但守死代码=假绿);替代=**本包已接入 npm run verify 的契约套件**(run-contract-suite:hard-block-k1 四条钉 clusterRestricted)+earnings-release-api 协议校验 —— V1-P0-1 更正:接入前它是无链执行的孤儿,原表述属空头支票。HANDOFF:服务端账本义务 |
| 8 | SPEC-7 cluster circuit breaker (R1) | C | clusterBreakerTripped 函数+调用整删;替代=服务端下发 clusterRestricted(earnings-release-api.ts:10/34/55),唯一消费 wallet-withdraw.vue:406 归零可提;契约套件里的 hard-block-k1 已钉 4 条(本包接入前是孤儿) | 显式删门,提交信息写明替代;消费点归零行为并入 #10 新判据 |
| 9 | AUTH03 captchaAlwaysScenes seed pin | A | 键从种子移出(otpGate 5 键),compat 运行时默认 `["register"]`(platform-config-compat.ts:35/43-45/70);种子类型改 Partial;消费链经 config store 合成配置闭合 | selfcheck-config-compat:合成后 captchaAlwaysScenes 含 "register"(行为断言,种子若显式覆盖为空必红);AUTH03 wiring 哨兵(470-490)不动 |
| 10 | withdraw available = total balance | A | 2026-07-31 规则被新规则取代:(总余额−服务端 held 两桶)×balanceMaxRatio,clusterRestricted/无快照/无 policy 三态 fail-closed 归 0(wallet-withdraw.vue:405-412) | 重锚:钉 fail-closed 结构(三个归 0 分支+乘比率),不钉字面表达式 |
| 11 | SPEC-7 reject route never debits | A | 本地扣款链删除(「never debits」结构性成立);reject 闸移页面提交前(wallet-withdraw.vue:942)+API 白名单不含 reject(withdrawal-api.ts:91-98 回包校验) | 重锚三合一:页面 pre-submit reject 闸在+API allowedRiskRoutes 无 reject+submitWithdrawal 函数体无余额写入(负向结构断言) |
| 12 | SPEC-7 risk route maps to queue status | A | 映射换输入源:服务端 status 字符串→canonicalStatus()(withdrawal-api.ts:190-225,FROZEN→frozen 等,未知值抛错) | 重锚 canonicalStatus 映射表+未知态抛错分支 |
| 13 | withdrawal 落盘余额复核 ×2 | C | 占额度/落盘/复核链整删,客户端不再本地扣款;并发收敛=服务端事务+idempotencyKey(wallet-withdraw.vue:877) | 显式删门;HANDOFF:服务端 POST /api/withdrawals 事务内必须重读余额(幂等键≠CAS,主人错题集同款) |
| 14 | withdrawal clamps withdrawable >= 0 | C | 主语(本地提现扣款 applyDebit)删除;购买链 debitBalance 的姊妹 clamp 仍在且其哨兵(565/569)仍绿 | 显式删门,写明姊妹门仍守购买链 |
| 15 | P0 neg-balance 总余额门 | C | 主语(本地扣款透支)灭失;页面 fail-closed 上限+服务端 reservation | 显式删门;页面上限并入 #10 |
| 16 | P0 neg-balance 金额有效性 | A | store 边界删,但用户流上的守卫在页面层:amount≤0 禁提交(wallet-withdraw.vue:782)+输入剥非数字(:815-821);四余额原语守卫仍在(app.ts:975/988/1013/1027,nex_guard_sites 门绿) | 重锚页面层守卫;残余缺口(store 直调透传)记 HANDOFF:服务端必须拒非法 amount |
| 17 | P1 fee snapshot 5 参交叉核对 | A | 5 参调用活在页面提交链(wallet-withdraw.vue:518-526/962),第 5 参权威源换 policy.networkConfirmFeeUsd;store 侧死;config 的 currentNetworkConfirmFeeUsd() 成零调用死码 | 重锚页面 5 参调用+提交链位置;删死函数(防未来门盯死代码假绿) |
| 18 | SPEC-7 value parity coverage otpGate=5(应 6) | A | captchaAlwaysScenes 出种子进 compat(见 #9);循环 5 数值键与种子 5 键现实一致,硬计数「应 6」过期 | 覆盖度改集合等式:种子块键集 == 循环键集(键清单单源成 bash 变量,两处共用);0 键即红 |
| 19 | WD02 network-confirm-fee parity | A | 提取器按设计红(种子形状变了);值搬 compat RUNTIME_WITHDRAW_RULE_DEFAULTS={1,1,5}(compat:25),admin-ops 锚={1,1,5} **仍逐键一致** | selfcheck-config-compat:合成配置取有效值逐键 vs admin 锚(路径双候选,锚缺失必红);键数覆盖度保留 |
| 20 | R7 device detail runtime | A(共因) | 业务断言全过,仅 console 断言红(B1 启动噪声) | 同 #4 |
| 21 | SPEC-7 K1 registration gates | A(共因) | K1 闸门断言全过(result.length=0),仅 console 断言红 | 同 #4 |
| 22 | AUTH02 handoff (en) | A | 探针驱动 mock 流;c37e642 给 register.vue:329-347 加 remote 分支(remote 下 POST /auth/users/register/otp/send→404→流程停第 1 步);mock 分支原样在 | 同 #4(mock 模式 server 前置断言);remote 注册流由新链契约测试守 |
| 23 | AUTH02 handoff (zh) | A | 同 #22 | 同 #22 |
| 24 | SPEC-4 account-cloud app sync | A(共因) | 三条合并断言(:88/:91/:94)全过,仅 console 红 | 同 #4 |
| 25 | SPEC-4 runtime session guard | A(共因) | 撤销后停写断言过,仅 console 红 | 同 #4 |
| 26 | brand legacy 'Nexion' residual | A+B5 | 4 命中全 scripts/ 层、全 c37e642:2×`../nexion-backend` 路径(后端仓目录名=白名单族)+`x-nexion-edge-country`(后端契约 header,client 只能跟随)+`nexion-ops-console`(**把创世门取材面改成本机不存在的仓名**,实存 admin-ops)| 白名单收编 3 个后端契约字面(tight pattern);B5=genesis-gate 仓名回退双候选;header 改名义务记 HANDOFF |
| 27 | platform-anchor: code.vue MONTHLY_NEW_JOINERS | A | c37e642 把 joiners 从编译期常量改为配置派生+健康门控+"—" 兜底(code.vue:145-156);import 列表整条移除,非死 import | 重写消费对清单为现状真值(intro.vue/code.vue 的 *Of 派生函数+健康门控);0 消费即红 |
| 28 | platform-anchor: app.ts FLEET_DEVICES | A | 同上:app.ts:326-336 改健康门控归 0,remote watch 重基线 | 同 #27 |
| 29 | platform-anchor: 种子取自编译期锚 | A(判据反转) | 819a6da 种子出走+c37e642 compat 默认清零并注释「Deliberately invalid sentinel…Never replace with plausible data」 | 新判据钉**全零哨兵不变量**(compat publicStats 默认必须全零/空表,出现可信假数即红)——这是新的承重不变量 |
| 30 | platform-anchor: trust.vue 27,150 | C | Q2 字面量整删:QTR_FINANCIALS=[]+模板段 v-if="false"(trust.vue:46/279);披露改远端 trustSectionApi 按地区下发;admin-ops 侧同字段已服务端化(i4-trust.tsx:91),字面量 0 命中 | 显式删门(连同 $47.0M 与 admin data.ts 镜像判据);对照锚在停更仓,概念整体废弃 |
| 31 | platform-anchor: trust.vue $47.0M | C | 同 #30 | 同 #30 |
| 32 | sampling evidence(learn 2 页) | B6 | 历史基线曾指向旧 prototype；当前门已由真实 PC `D:\workspace\nexion-ops-console\scripts\uniapp-port-coverage-audit.mjs` 解析 `D:\workspace\NX1.0-UniApp` 页面与 shard 证据 | 给 2 页补采样证据并保持缺证据即红，不伪造样本 |
| 33 | 四边描边容器(3 违例) | B2+B3+产品修 | ①genesis dock 禁用态:allowlist cls 钉了启用态类串,禁用态掉 active:scale 类→miss(元素本身已被豁免)→A 放宽 cls 匹配;②tcs-hero:1px brand 描边违《03》§3,被 voucher 弹层让位暴露→B3 删描边;③stake-alt 卡:渲染条件被 policy-null 回退削弱(0≥0 恒真),空表单即渲染→B2 收条件 amountNum>0 | ①**实际处置=产品修**(genesis dock 禁用态 border:none),非改 allowlist —— V1-P1-1 更正;②③产品修+门不动(zero-border 门本身工作正常) |
| 34 | dom-qa 新 DOM 违例 | A(共因) | 5 路由 DOM 违例 0(gate=0 info=0);红=coverage 前置的 pageerror(B1 噪声) | B1 修复+mock 前置;dom-qa 门不动。附:team 页 25 节点疑点记走查清单 |
| 35 | 兑换/创世重入守卫 | A | B④ 资金原语命中 0=创世购买让渡后端原子事务(purchase-sheet.vue:167-204,不再本地扣款);:580 needle 掉 async 前缀致 transform 崩 | 重写:锁点须在 `await genesis.purchase` 前+needle 换 async 形态+双击固定靶用 stub genesisApi 数调用次数(恰 1) |
| 36 | P1 涉钱/配额乐观并发(money-cas) | A | harness 缺 shallowRef(stub 单源化已修);真断言浮出 3 红:voucher/daily-powerup/nex-faucet 的 remote-apply 缝(clearRemoteFacts/refreshRemote 等)是「sync+bindAccount」外第三类赋值,remote-gated(voucher.ts:99-105 首行守卫) | stub 单源化(scripts/lib/harness-stubs.mjs,runtime 导出面从磁盘扫)+判据扩第三类:remote-apply 函数需自带 remoteApiEnabled 守卫才豁免 |
| 37 | 创世邀请码码表核销 | A | c37e642 删本地码表(-157 行):「Server-only redemption. No local registry, seed code or rollback exists.」;错误码→reason 映射是仅存客户端逻辑(genesis-invite.ts:12-26) | 重写:行为测错误码映射(5 码→4 reason+格式预检不打 API)+负向钉码表字眼不复活;一码一用义务记 HANDOFF |
| 38 | 冲正(回滚)自身 | A | 纯 harness 崩(shallowRef);stub 修复后 28/0 全绿 | stub 单源化即毕(✔ 已复跑绿) |
| 39 | 领奖幂等 | A | 同 #38;修复后 0 fail | 同 #38(✔) |
| 40 | 总有效算力聚合 | A(判据反转) | ⑥ 期望本地种子分位表合法;819a6da 删种子表+c37e642 清零 compat(故意非法哨兵);合法性校验移 platform-config-api.ts:151-174(<2 档抛 H9_PUBLIC_STATS_RESPONSE_INVALID) | ⑥ 改钉:合成种子表=空(全零哨兵)+API 校验器拒 <2 档;名次固定靶改用 fixture 表喂纯函数(行为保留) |
| 41 | 创世单一派生 | A(含 B5) | 48/1:唯一红=兄弟仓名被 c37e642 改成不存在的 nexion-ops-console(实存 admin-ops;作者环境仓名不同) | 仓名双候选(admin-ops→nexion-ops-console),都缺才红(保留「判据失效必红」) |
| 42 | 资金 ⊗ 收据 | A | runtime-stub 缺 pointsApi/i18nApi(手列清单没跟上依赖面);修复后浮出 2 红:①「1>0」实为 App.vue `businessTimeouts.add(handle)`(Set.add,被门的**有意过近似**扫中——机制本体要求逐个登记);② WIRED needles 未含 postMoneyBillsOnce(b023674 claim 族统一引入) | stub 单源化+ALLOW 登记 App.vue:1(Set.add,写明缘由)+WIRED 三针补 postMoneyBillsOnce;**顺带补洞**:收口点 EXPORTS 缺 postMoneyBillsOnce→补上后反向入册门抓出漏网的 payout-address.ts,已入册(80/0) |
| 43 | 接口引用台账 | A | 门按设计工作:台账孤儿 /api/market/nex(c37e642 删了唯一引用注释,契约本身也变 HTTP fetch);同笔已删 3 条同族孤儿,漏此 1 条 | 从 LEDGER 删该条+邻条 GET /api/market 备注同步修 |

## B 类(真回归)单列 — 8 条

| B# | 归属门 | 回归内容 | 修法(与门同一提交) |
|---|---|---|---|
| B1 | #4/20/21/24/25/34(6 门共因) | c37e642 的 10 个远端刷新缝 7 个有 try/catch,漏 3 个:v-rank.ts:228(Promise.all 裸 await)、commission.ts:183(裸 await)、genesis.ts:319(applyPublicState 在 try 外)→ 无后端时每次启动 3 个 unhandled rejection | 补 catch(照同批 quest/voucher/cards 的既有写法);新增 selfcheck-remote-refresh-resilience.mjs(esbuild 行为门:API 全抛时 refresh 必须 resolve,unhandledRejection=0)接入 verify.sh |
| B2 | #33③ | wallet-withdraw 质押劝阻卡渲染条件被削:minWithdrawable 回退 0 后 `0>=0` 恒真,空表单即渲染转化卡 | 条件收紧 `amountNum > 0 &&`;feegate 加结构 pin |
| B3 | #33② | trial-claim-sheet .tcs-hero 有填充+四边描边(违《03》§3),被 voucher 让位暴露 | 删 border 保留 tint;zero-border 门本身即防复发 |
| B4 | #1 子 11 | commitWithdrawal(首提标记+地址登记)搬家后全站零调用,客户端风控引擎数据面断供:hasWithdrawn 永 false → 首提人工审永远误触发、地址永不登记 → 新地址 hold 永误判、K1 强维输入丢失。已回源核验:seam 注释自证用途+消费面(eligibility-core:442)活着 | ✔ app.ts:1282 建单成功后接回 `commitWithdrawal(accountKey.value, network, address)`;fastlane #11 重锚三合取(调用在/顺序对/seam 体内两原语在),红测 3 组各自隔离打红 |
| B5 | #26/#41 | c37e642 把创世门跨仓取材面改成本机不存在的仓名,门失效 | 双候选仓名+失效必红(已并入 #41 处置) |
| B6 | #32 | learn/courses+learn/course 两新页无走查采样证据(门的本职拦截) | ✔ 历史 prototype 证据仅作旧基线；当前验收由真实 PC audit 读取 `NX1.0-UniApp` 页面和现有 shard，缺项仍红 |
| B7 | #33②→连锁 | 「故意非法」全零哨兵在 publicStatsHealth 的 members/rank/jitter 合法域里**是合法值**(0∈域)→ mock 首页把「Members 0 +0%/mo」当真数据渲染(tap-feedback 探针连带报违例) | ✔ compat 哨兵三字段(onlineJitter/growthPct/virtualUserCount)0→-1 使六健康位全 false;account-hashrate ⑥a 升级为「无正数 + 六健康位全 false」行为断言(86/0);红测:塞 28432 必红 |
| B8 | #22/#23 根因二段 | creditRewardBucketInternal 把「客户端释放台账写成功」当 held 两路由的放行条件,而 c37e642 已把台账空壳化恒 false → **mock 模式风控标记账号的赠金/奖励入桶无条件失败**(AUTH02 注册重试恒「服务不可用」实锤;settle 路径同调用但忽略返回值,无此病) | ✔ 与 settle 同形 fire-and-forget(台账义务在服务端);新增 selfcheck-reward-buckets.mjs(3 路由+幂等+非法金额,10/0)接入 [1.6];红测:塞回判死条件→held 两路由精准判红、withdrawable 不误伤;AUTH02 en/zh 复跑 PASS |

## 实施补记(2026-08-10 收口)

- **红测计分板**(除各 selfcheck 内置自证外的文件级注入):resilience✓✓ · preflight✓✓(5173 remote 必红/5183 mock 必绿)· PROD 守卫✓✓ · canonicalStatus✓✓ · available fail-closed✓✓ · no-local-debit✓✓ · compat 全零✓✓ · coverage 集合等式✓✓(此条红测揪出我判据自身的幽灵键 bug 并修正——红测同样防「broken-red」)· trust Q2✓(注入红+还原字节校验)· brand✓✓(裸词红/白名单三形态绿);I1 9 组 · I2 9 组 · I3 13 组(各 agent 报告存证)。
- **实施 agent 裁量披露**:① I3 将本地 admin-ops checkout `--ff-only` 快进 5 笔到 origin/main(⑧c 键 parity 的红是本地旧线环境红,错题集「本地可能是旧分叉线」同型;纯 ff 干净树,未改判据);② I3 补齐 money-receipt 收口点 EXPORTS(postMoneyBillsOnce),连带抓出并入册漏网的 payout-address.ts。
- **历史采样证据**:旧 prototype 仓 commit `b702df4` 仅作为当时的取证背景，不再由当前门解析。
- **相邻发现状态更新**:① learn 双页 i18n 问题仍按原任务芯片管理；② SPEC-7 parity 已迁至 `D:\workspace\NX1.0-UniApp\scripts\verify.sh` 调用真实 PC `platform-config-contract-parity.mjs`，不再依赖旧 mock；③ 其它历史孤儿链仍按各自台账处理；④ team 页 runtime 覆盖仍需独立走查，不因路径迁移自动宣称完成。

## 独立验收三路(2026-08-10 夜,报告存证)

派三路只读独立 agent,派单未暗示期望结论。结果与处置:

| 路 | 范围 | 结论 | 我的处置 |
|---|---|---|---|
| V2 代码评审 | 本包 8 项 B 修的产品代码 | CRITICAL 0 / HIGH 0,Approve;独立复现 B8 爆炸半径(修前**任何被风控路由的新用户注册**领礼包必抛错) | 采纳 M3(两处失效注释);**驳回** M1(catch 里加 console.error —— 会让 remote 无后端时全部「console error=0」探针变红,得不偿失,正解是 error ref 上浮到 UI,属产品决策);**驳回** L1(删「孤儿」i18n key —— slacopy 门仍在断言它们,删了门就瞎) |
| V1 判决表审计 | 判决表 43 行 vs 实施(抽核 37 行,B 8/8 · C 7/7 · A 29/30) | 1 P0 + 3 P1 + 5 P2;14 个门只读复跑全绿且 pass 数与表逐一吻合 | P0-1 已修(见下);P1/P2 全部落表更正 |
| V3 判据强度对抗 | 对每条新判据构造「缺陷仍在但判据仍绿」的绕法 | 4 P0 + 21 P1 + 11 P2;**同时确认「候选为 0 必判红」这条铁律本包全部落实到位,无一处「扫不到=没违规」** | 见下分层处置 |

### 已修(本轮)

- **V1-P0-1 · 空头支票**:表里把 hard-block-k1 当 C 类删门的「替代防线」,但它和另 7 个契约测试**两条链都没接**。根因不是「谁忘了接」,是这个仓的测试文件**天然可以变成孤儿**。→ 新建 `scripts/run-contract-suite.mjs` 登记门:每个 `scripts/*.test.mjs` 必须显式登记归属(chain 7 / elsewhere 5 / excluded 1+原因),未登记即红;接进 `npm run verify`。红测:新建一个未登记测试文件 → 判红。h-remote-authority 因依赖本机不存在的 `nexion-backend` 兄弟仓,登记为 excluded 并记 HANDOFF(不假装它在跑)。
- **V3-P1-5/7/8/9/10 · 我自己引入的判据洞**:新写的 withdraw fail-closed / canonicalStatus / allowedRiskRoutes / payout PROD 守卫 / compat 哨兵五块**没继承本仓「剥注释再判」的家法**,注释即可哄绿;白名单只验在场不验被消费;PROD 守卫数总数不分函数;compat 用黑名单正则被具名常量绕过。→ 五处全部重写(剥注释 · 加消费点断言 · 逐函数验 · 黑名单改白名单「只许 0/-1/[]」· sed 区间改 awk 取首块)。compat 那条红测:注入 `fleetDevices: PLAUSIBLE_FLEET` → 旧判据放过、新判据判红。
- **V3-P0-1 · 绿着守死代码 + 连带活缺陷**:fastlane 三条断言钉着零调用的 `claimWithdrawSlot` 内部实现。→ 退役三条,换一条「仍无调用方 + 复活须同批恢复三条实现级断言」(扫描面为空必红);产品侧缺陷单独立案(见下)。

### 相邻发现:4 个活缺陷,超出 43 门范围,均已回源坐实并立案(不由我单方面改)

均为 c37e642 引入、两条链都看不见。前三条已建任务卡,第 4 条并入卡 B:

| # | 缺陷 | 回源证据 | 性质 |
|---|---|---|---|
| 1 | **提现日限客户端预检恒不触发**:计数器唯一写入方 `claimWithdrawSlot` 全站零调用 → `todayWithdrawCount` 恒 0 → `dailyLimitReached` 恒 false,而页面仍渲染「每日最多 N 笔」并留着置灰分支 | withdraw-daily-count.ts:86/:121 零调用 · eligibility.ts:99 · core:457 · wallet-withdraw.vue:250/:782/:948 | 体验/承诺与实现不符(服务端才是真闸);作为**门**的问题是 P0(套件全绿地放行) |
| 2 | **服务端 publicStats 被解析后丢弃**:`config.ts` 的 merge 不含 publicStats → 全部 16 个消费点永久走「不可用」分支 | platform-config-api.ts 完整校验 · config.ts:70-76 无该字段 | 产品数字永远显示占位;且全套件**无任何门**守「服务端值有路径进 store」 |
| 3 | **可提现口径三处分裂**(2026-07-31 老坑结构性复发):提现页扣 held 两桶再乘比率,钱包页/钱包卡片仍显示裸总余额;且存活的 `withdrawable_source_parity` 门**锁死了这个分裂**(谁去统一口径,门反而红) | wallet-withdraw.vue:405-412 vs wallet.vue:172 / wallet-card.vue:121 · verify.sh:570-583 | 用户看到的数 ≠ 能提的数 |
| 4 | **小额免审注释说停用、实际在线**:`smallAmountLine≡0` 只让 CTA 不可达,真判定走 `rules.smallAmountThresholdUsd`(compat 仍 50)→ ≤$50 仍免掉首提必审与新地址 hold | wallet-withdraw.vue:660 注释 vs core:388 `isFastLane` · compat:24 | 客户端风控预检与注释矛盾,需产品口径 |

### 第二轮(主人 2026-08-11 指示「按推荐继续、把这批 P0/P1/P2 收掉」)

主人同时提醒:此时仓里已有 8 个工作树并发(含主人开的 4 张卡)。故按「不碰卡会话文件」排序,
先收零冲突的脚本层,verify.sh 内部若干条留待卡会话合流后再动(见文末未收清单)。

| V3 编号 | 判据问题 | 处置 | 红测 |
|---|---|---|---|
| P1-22/23 | 韧性门扫描面只认无参裸调,漏带参 `void fn(id)` / 成员调用 `void x.fn()` / 箭头函数 `const fn = async () =>`;且 `void fn().catch(…)` 被误读成 `.catch`(payout 那条缝整条漏掉);「触发了几条」无真凭据;覆盖度是 `>=3` 下限不是台账 | 三族写法全收 + 扫描面扩到 store/composables/lib;计 API 调用次数作真凭据;未触发的缝必须登记原因 + 陈旧登记反查;基数台账 16 | ✔ 语法合法注入(catch 改再抛)→ 精准判红 |
| — | **上条加严当场抓到真缺陷**:payout-address 的刷新缝**自己不吞异常**,全靠调用点写 `.catch(() => undefined)` —— 与 B1 那三条同款脆弱写法 | 改为函数内自吞(与其余 15 条同族一致) | ✔ 同上 |
| P1-19 | money-receipt 的收口点导出面是手抄清单(刚被 postMoneyBillsOnce 漏抄咬过,修法却还是手加一项) | 改从磁盘扫 lib/money-receipt.ts 的全部 post* 导出;扫不到必炸 | ✔ 新增出口 + 未登记消费者 → 判红(手抄版会整体放过) |
| P1-20 | 创世/兑换守卫的资金原语清单漏 4 个真实出口(`"postMoneyBills(".includes("postMoneyBill(")` 为 false,后面跟的是 s 不是括号) | 收口点那半从磁盘扫 + app.creditNex 补入,清单 5→10 | ✔ 塞入原漏网出口 → 判红 |
| P1-17c | money-cas 的持久化 ref 清单是手抄的,新接 CAS 的 store 不在册会静默漏检 | 加覆盖门:凡用 CAS 提交器的 store 必须在册(漏/陈旧双向),排除定义方 | ✔ 覆盖门首跑即抓出定义方误判并修正判据 |
| 收口① | 老套件依赖「你自己先起 5173」这个口头约定(忘起 → 探针验错对象;起了没 mock → 流程整条绕开被测代码) | 新增 scripts/run-legacy-suite.mjs 自启壳:自挑空闲端口、以 mock 起本工作树 server、跑完收进程树 —— 套件对外部环境零依赖,多工作树并发各起各的 | 见本轮全量跑 |

### 未修:留给主人定轮次(V3 剩余 P1/P2 共 ~28 条)

按价值排序的前几条:①`selfcheck-remote-refresh-resilience` 的缝扫描漏带参 `void fn(id)`、成员调用与箭头函数写法,且覆盖度是 `>=3` 下限而非基数台账(应改台账 + 扩扫 .vue/composables/lib);② `money-receipt` 的 `EXPORTS` 与 `money-cas` 的 `PERSISTED_REFS` 仍是手抄清单(应照 `harness-stubs` 的磁盘扫写法);③ 本包 11 个脚本里 10 个没有断言基数台账(删断言不会红 —— 本包自己一次删了 15 条没有任何门变红);④ `money-cas` 的 remote-apply 守卫是「一行可自由添加的标记」;⑤ trust Q2 禁令只禁两个旧字面量,新起一组本地财务数据照样过;⑥ brand 白名单三个新增项是**整行**豁免,src 里一条注释就能开洞。
**这些是判据强度问题,不是当前有缺陷**;是否再开一轮由主人定(项目铁律:轮次不由 main 或 agent 决定)。

## 收口决定(推荐,待主人拍板 —— 本包未执行)

**推荐:接回,不退役。** `npm run verify` 末尾串 `bash scripts/verify.sh`,并把孤儿契约测试同笔接入;拆细见收尾报告的拍板项(含代价/风险/不做会怎样)。核心理由:① 本包已把 43 红清零、判据全部构造化+红测,套件恢复资产状态;② 两链已有真实重叠(老套件末检=新链 verify-h5-runtime 同款自起隔离 server),接回只增不冲突;③ 「留着不跑=假装有门」在本仓 3 天内已实证三次(新链架空老套件 / 43 红无人跑 / 新契约测试无链可跑),不接回必然复发。

## 收口①:已执行(主人 2026-08-11 指示「按推荐继续」)

**老套件接回官方门链,不退役。** `npm run verify` 末尾串 `npm run test:legacy-suite`。

前提先补齐了:老套件原本依赖「你自己先起 5173」这个口头约定,两种翻车都真发生过
(忘起 → 探针验错对象;起了但不是 mock 模式 → app 走 remote 分支,注册等流程整条绕开
被测代码,门静默失效)。新增 `scripts/run-legacy-suite.mjs` 自启壳:自挑空闲端口、以 mock
模式起**本工作树**的 server、把 BASE_URL 交给 sh、跑完连进程树一起收掉。实测该壳单独跑
418 pass / 0 fail(隔离服务落在 52998,未抢占并发会话的 5173/5183/5193/5283)。

代价与已知影响(如实记):`npm run verify` 从约 5 分钟变成约 20 分钟(多一次 dev server
冷启 + 全套件);多工作树并发时各起各的随机端口,不互相踩。

## HANDOFF 义务清单(随包写入后台仓交接书)

0. **旧 admin 侧数组参数登记**:历史 compute-config mock 登记项不再是当前验收输入；captchaAlwaysScenes 由 App platform-config parser/compat 行为门守护，PC 当前 K2 API parser 守护 OTP 数值键集，不能以旧 mock defaultVal 替代服务端响应。
1. POST /api/withdrawals 服务端事务内:重读落盘余额(幂等键≠并发闸)、拒 NaN/≤0 金额、reject 路由零扣款、费用与 policyVersion 交叉核对。
2. 收益释放:服务端账本+熔断(clusterRestricted)为唯一权威;客户端已只读。
3. 创世邀请码:一码一用/一账号一次改服务端强制。
4. `x-nexion-edge-country` header 名含旧品牌,改名需后端同步(client 测试跟随)。
5. 采样证据体系已按当前边界迁移解析：App `D:\workspace\NX1.0-UniApp` + PC `D:\workspace\nexion-ops-console`；缺页、缺 shard 或 blocking action 仍由 PC audit 判红。
6. `h-remote-authority-contract.test.mjs` 断言读兄弟仓 `../nexion-backend` 的 Java 源,本机无该 checkout —— 已在契约套件登记为 excluded(不假装它在跑),需在有后端仓的环境单跑。
