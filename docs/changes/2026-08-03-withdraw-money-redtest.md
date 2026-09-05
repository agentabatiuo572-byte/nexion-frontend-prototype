# 2026-08-03 提现资金 2×P1 修复 · 红测留痕

修复对象(均涉钱):

- **P1-A 费用快照可伪造**:`isWithdrawalFeeSnapshotValid`(src/store/nex-faucet.ts)原只校「意图守恒 + 内部等式」,任意自洽三元组(如 `{networkConfirmUsd:0, nexBurned:0, actualFeeUsd:0}`)一路放行 → 客户端改配置即可 $0 费提现。修法:validator 增可选参 `(network, authoritativeFeeMap)` 做权威交叉核对(容差 `|Δ| ≤ 0.0001`,非严格 `!==`);权威值经 `src/store/config.ts` 新增纯函数 `currentNetworkConfirmFeeUsd()` 单源供给(fail-closed:syncFailed / 超值域 → null → 拒单);`app.submitWithdrawal` 以 5 参调用(`NETWORK_FEE_KEY[network]` 映射键)。页面 staleness 预检保持 3 参旧行为(UI 预检不是资金门)。
- **P1-B 失败提现白烧 NEX**:`refundFailedWithdrawals`(src/store/app.ts)原只退 USDT 本金,忽略 `wd.fee.nexBurned`。修法:同函数内补退 NEX;幂等键拆两个(USDT `refund:` / NEX `refund-nex:`,复用单键会「USDT 退过 → NEX 同键判已处理 → 永久跳过」);历史单可选链 + `>0` 才退(纯数字 fee 不炸、无需退不算退款失败);NEX 走 `creditRewardBucketOnce` 第 4 参、usdt 位传 0。

机器门:`scripts/selfcheck-withdrawfee.mjs` 由 30 靶扩至 **45 靶**(⑥ 交叉核对行为固定靶 + ⑦ 剥注释接线门),`scripts/verify.sh` 提现段追加 2 条完整调用形态快速哨兵。

## 红测规程

按合取项逐个隔离注入;备份/还原一律 `cp`(**禁 `git checkout`**);每轮:注入自证落盘 → 跑 selfcheck → **FAIL 集合与预期集合精确相等**(缺一 = 假哨兵,多一 = 误伤)→ `cp` 还原 → `Buffer.equals` 逐字节比对 → 复跑 45/0 全绿。执行器:scratchpad `redtest-withdraw.mjs`(会话临时件,不入库)。注入形态全部取自真实事故谱系(修复没落地 / 严格等号误杀浮点 / falsy 吞 $0 / 判定对没接上 / 单键复用 / 参数位反 / 回退写死值)。

## 逐轮结果(13/13 通过)

| 轮 | 注入(破坏哪个合取项) | 预期红靶 | 实际 | 还原 |
|---|---|---|---|---|
| R1 | nex-faucet:整块删除权威交叉核对(修复没落地形态) | 伪造三元组 / 权威同步 / 容差 / map fail-closed / 网络键 共 5 靶 | 恰红 5,无误伤 | byte-identical,复绿 45/0 |
| R2 | 容差 `>0.0001` 换严格 `!==` | 仅「浮点容差」 | 恰红 1 | 同上 |
| R3 | `!Number.isFinite(authoritative)` 换 `!authoritative`(falsy 吞 $0) | 仅「合法 $0 网络不误拒」 | 恰红 1 | 同上 |
| R4 | app.ts 调用退回 3 参(判定对但没接上) | 仅「接线:5 参调用」 | 恰红 1;verify 哨兵① grep=0 | 同上 |
| R5 | NEX 退款复用 `refund:` 单键 | 「双键:NEX」+「NEX 参数位」 | 恰红 2;verify 哨兵② grep=0 | 同上 |
| R6 | NEX 传进 usdt 参数位(当美元退) | 仅「NEX 参数位」 | 恰红 1;verify 哨兵② grep=0 | 同上 |
| R7a | `wd.fee?.nexBurned` 去可选链 | 仅「历史单安全」(合取项 1) | 恰红 1 | 同上 |
| R7b | 去 `> 0` 门 | 仅「历史单安全」(合取项 2) | 恰红 1 | 同上 |
| R8 | USDT 键改名 `refundUsdt:` | 仅「双键:USDT」 | 恰红 1 | 同上 |
| R9 | config 纯函数删 `syncFailed`(按种子收费回退形态) | 仅「config fail-closed」 | 恰红 1 | 同上 |
| R10a | app.ts 删权威函数 import(单源断线) | 仅「接线:单源」(合取项 1) | 恰红 1 | 同上 |
| R10b | app.ts 本地写死同名函数遮蔽单源 | 仅「接线:单源」(合取项 2) | 恰红 1 | 同上 |
| R11 | map 取键写死 `"trc20"`(错键复制粘贴) | 仅「网络键取对」 | 恰红 1 | 同上 |

补充说明:

- 接线门与 verify 哨兵判据均**先剥注释再判**(块注释 + 整行注释;与 selfcheck-feegate 同款剥法),注释里出现判定式文本不能哄绿;verify 侧 pin 完整调用形态而非短串,短串(`refund-nex:` 等)会出现在注释里。
- R5 一轮红 2 靶属同一事实族(独立键消失同时使键靶与参数位靶失配),两靶各自另有隔离轮(R6 证参数位靶可独立红)。
- 每轮均验证「其余 40+ 靶保持绿」= 注入无误伤扩散;13 轮复跑均回到 45 pass / 0 fail。
