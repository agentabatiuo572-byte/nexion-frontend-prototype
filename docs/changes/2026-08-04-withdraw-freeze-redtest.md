# 提现提交链快照单源化 + NEX 退款账本对齐 — 红测留痕(2026-08-04)

R2 审计确认的 3 条 P1,全部由 R1 的修复引入,且**同一个根:跨 `await` 的状态漂移**。
本轮用**一条修法**收全族:提交前冻结一切 → 确认后与当前权威值核对 → 不符即拒。

| 编号 | 现象 | 根 |
|---|---|---|
| P1-A | 失败提现退还了 NEX,账单里那条「−N NEX(已入账)」没人冲正 → 账本与钱包互相矛盾 | 退款只动余额、没动账本 |
| P1-B | 弹窗展示的报价 ≠ 实际扣款的报价 | 报价在 `await uiConfirm` 前后各读一次 |
| P1-C | 确认期间换账号 → 钱扣新账号,弹窗写的是旧账号 | 账号快照取在 `await uiConfirm` 之后 |

## 一条修法收全族

`handleSubmit` 里原本散落的 `amountSnapshot / quoted / offsetSnapshot / rateSnapshot / acct`
合成**一份** `snap`(账号 · 网络 · 收款地址 · 金额 · 可提上限 · 抵扣开关 · 报价 · server 形状费用快照),
冻结点在**第一个 await 之前**;弹窗文案、页面费用明细、扣款、建单、账单、拒单归因全部只读这一份。
确认之后加一道「快照 vs 当前权威值」的校验,排在 `debitNex` **之前**:

- 身份三元组(账号 / 网络 / 收款地址)变了 → `withdrawContextStale`「账户或收款地址已变化,请重新提交」;
- 冻结报价对当前权威费率/费值不再成立 → 既有的 `withdrawFeeStale`「费率已更新,请重试」。

P1-A 走复式账本的通用规矩:**已终态分录是既成事实,冲正靠反向分录**。
`bills.settleByRef` 跳过非 pending 行的规则不变(原来那条「NEX 费按规则不退」的论证已作废,注释同步改成新论证);
退还改由 `App.vue reconcileBills ②b` 补一条同单号 `+N NEX` 正向行,两行相抵 = 钱包净变化。
判据取自**账本自己**(`appliedRewardKeys["refund-nex:<id>"]` 已落盘)而不是「单据是失败终态」——
钱还没真退就记账,等于账单抢在余额前面宣布退款,方向反了同样是裂脑。

## 机器门

`scripts/selfcheck-withdraw-freeze.mjs`(**31 pass / 0 fail**),已焊进 `scripts/verify.sh` [1.6] money selfchecks。
结构断言跑在剥注释后的正主源码上;行为断言把**正主代码块原文抠出来执行**(不是抄一份复制品):
`quoteStillValid` 从 `.vue` 里抠出注入真 `nex-faucet` 判据跑;`reconcileBills ②b` 的循环体从 `App.vue`
抠出对着 **真 bills store**(esbuild bundle + stub pinia/vue/storage)跑。

连带更新两条因重构而失效的存量哨兵(判据改指新形态,不是放宽):
`selfcheck-feegate`(18 pass)开关快照 → `snap.offset`、`toggleOffset` 守卫 → `inputsLocked`;
`selfcheck-fastlane`(114 pass)金额快照 → `amount: amountNum.value` 且须早于首个 await。

## 红测:12 靶逐个隔离,12/12 命中

纪律:`cp` 备份 + 还原后 **sha256 逐字节比对**(禁 `git checkout` —— 工作树有并发会话的未提交改动)。
每靶只破坏**一个合取项**,避免「靠 A 红了而 B 从没验过」;注入未命中锚点直接报错终止(而不是静默算过)。
脚本:`<scratchpad>/fix-r2-withdraw/redtest.mjs`。

| 靶 | 注入(单一合取项) | 结果 | 首条报红断言 |
|---|---|---|---|
| R1 | 报价快照挪到 `await uiConfirm` 之后(P1-B 原形态) | RED | ② 首个 await 之后 0 处裸读活值 |
| R2 | 弹窗文案改读活值(展示 A / 扣款 B 最小形态) | RED | ① 弹窗文案只读快照 |
| R3 | await 之后裸读活值(NEX 回滚不看账号换没换,P1-C 原形态) | RED | ② 首个 await 之后 0 处裸读活值 |
| R4 | 删掉身份三元组校验 | RED | ③ 身份三元组校验排在 debitNex 之前 |
| R5 | 报价复验挪到 `debitNex` 之后 | RED | ③ 冻结报价复验排在 debitNex 之前(拒单不扣款) |
| R6 | `quoteStillValid` 改用冻结费率复验(等式恒真 = 门等于没有) | RED | ④ 拿当前权威值复验 + ⑤ 费率变动拒单 |
| R7 | 输入面冻结只看 `submitting`(弹窗那几秒入口全活着) | RED | ④ inputsLocked 含确认弹窗在途 |
| R8 | 删掉 NEX 退还反向分录(P1-A 原形态) | RED | 判据找不到正主代码块,抛错终止 |
| R9 | 反向分录不看退款幂等键(账单抢跑) | RED | ⑥ 退款幂等键未落 → 不抢跑记账 |
| R10 | 反向分录丢掉存在性判据(每 5s 重复补 = 凭空发币) | RED | ⑥ 幂等:再跑 2 轮不重复补 |
| R11 | 反向分录符号搞反(退成 −N) | RED | ⑥ 同单号 NEX 净和 = 0 |
| R12 | 反向分录改成 `type: "bonus"`(会点亮「我的奖励」红点) | RED | ⑥ 反向分录 type/status/ref 与燃烧行同族 |

还原后:两文件 sha256 与注入前**逐字节相同**,哨兵复跑 31 pass / 0 fail。

## 运行时实证(真浏览器 · 真点真输 · console error 0)

`<scratchpad>/fix-r2-withdraw/runtime-proof.mjs` — **14 pass / 0 fail**。
测试隔离:先停挖矿 + 排空里程碑奖励背包(种子账号 lifetime 两万多刀,轮询每 5s 补发一档 NEX,
实测 9 秒 +753,不排空的话余额等式会被这份**合法收入**淹掉)。

| 步骤 | 观测 |
|---|---|
| 起点 | USDT $25,156.56 · NEX 1280 |
| 真输 $60 + 真点抵扣开关 | `aria-checked=true`,knob 右移 |
| 确认弹窗原文 | Withdraw **$60.00** · 网络确认费 **−$1.00** · NEX 抵扣 **+$1.00(3 NEX)** · 到手 **$60.00** |
| 提交后 | 钱包 USDT **$25,096.56**(−60)· NEX **1277**(−3);单据 `fee.nexBurned = 3`;账单 `USDT −60 [pending]` + `NEX −3 [posted]` |
| 推到 `tx-failed` 后等轮询 | 钱包 USDT **$25,156.56**(全额退回)· NEX **1280**(退回 3);账单新增 `NEX +3 [posted] withdrawNexRefund`,USDT 行置 `failed` |
| 🔴 账本对账 | 同单号 NEX 行净和 = **0**,与钱包 NEX 净变化一致 |

截图:`01-withdraw-form.png` · `02-confirm-dialog.png` · `03-bills-after-submit.png` ·
`04-bills-after-refund.png`(账单页两行相抵实景)· `05-wallet-after-refund.png`。

## 同形扫描(`grep -n "await " src/pages/me/wallet-withdraw.vue`)

| 行 | await | 其后是否重读活值 |
|---|---|---|
| `handleResetKyc` 的 `await uiConfirm` | 确认重置 KYC | 无(后续只调 `pairing.reset()` + toast,不读报价/账号) |
| `handleSubmit` 的 `await uiConfirm` | 确认弹窗 | 无裸读:`app.accountKey` / `network.value` / `boundAddress.value` 只出现在与 `snap.*` **比对**的那一行 |
| `handleSubmit` 的 `await requestWithdrawalEligibility` | 风控复评 | 同上,5 个入参全走 `snap.*` |
| `handleSubmit` 的 `await app.submitWithdrawal` | 建单 | 同上;NEX 回滚的 `app.accountKey === snap.account` 是**故意**的活值比对 |
| `retryFeeConfig` 的 `await cfg.load()` | 重拉配置 | 无后续读 |

这条扫描已固化成机器门(哨兵 ②:首个 await 之后逐行扫 7 个活值 token,只放行与 `snap.` 同行的比对)。
