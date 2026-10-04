# 越南银行账户提现（2026-09-15）

用户授权补齐 HDPay 代付；仅 test 候选，真实出款默认关闭。不更改 USDT 提现原路径。

## App 入口与接口

钱包、日收益、搜索与追踪页的普通提现入口先进入 `/pages/me/wallet-withdraw-method` 选择 USDT 或银行卡；原 `/pages/me/wallet-withdraw` 深链与 NEX 手续费专用入口保留。银行分支复用 `/pages/me/wallet-withdraw-bank`。方式选择先读取服务端未决银行意图；有未决单时提示查询原单，不允许切换为新的 USDT 提现。

绑定仅收银行收款账号与户名，复用服务端明确开启的 BANKQR 无银行下拉、无 OTP 分支；不收有效期或 CVV。旧支付卡不作为银行受益账户。所有新显示时间经现有服务端时间解析器（无时区值按 Asia/Shanghai）转换为 Asia/Ho_Chi_Minh，语言跟随 en/vi/zh。

以下端点均在 `/api/withdrawals/bank` 下，且由当前已认证的 App 用户限定所有权：

| 方法与后缀 | 用途 |
| --- | --- |
| GET `/config` | 通道、当前账户核验/收款能力/保护期、账户级 `unresolvedIntent` |
| POST `/beneficiary` | 绑定银行账户 |
| POST `/beneficiary/verify` | 重新核验现有账户并读回，不重置保护期 |
| POST `/quotes` | 获取不可变的金额、手续费、汇率、到账 VND 与期限 |
| POST `/orders` | 按报价提交一次提现（固定幂等键） |
| GET `/quotes/{quoteNo}` | 恢复结果不明的原请求 |
| POST `/quotes/{quoteNo}/abandon` | 服务端取消未提交报价；已提交时返回原订单 |
| GET `/orders/{withdrawalNo}` | 查询本人原订单 |

`canWithdraw=true`、归属/账户类型/核验/收款能力与未过期证据同时满足才允许报价；24 小时到期不能代替核验。缺字段、未知结果、旧支付卡均不放行。当前真实核验提供方不可用，因此不会凭前端计时解锁。

提交前只持久化当前账号的报价编号并核对写入成功。响应丢失后隐藏提交入口，按服务端意图恢复原单，换设备或通道关闭仍能查询；不得生成新键重发。多笔意图逐笔查看，不自动选一笔。`EXPIRED` 是服务端已封存的结果；本地倒计时不能自行丢弃原报价。只有匹配 `settlementEvidence` 与金额/单据状态的真实证据才能显示到账或已退回。失败退款由后端共享账务处理器执行，前端不改余额。

## 验收

`src/lib/bank-withdrawal-state.test.ts` 经 Vitest 的 `src/**/*.test.ts` 纳入 `test:real-backend-integration`。原 API 与绑卡行为测试同步覆盖旧响应不放行。

`scripts/bank-withdrawal-runtime.mjs` 与 `scripts/bank-binding-runtime.mjs` 继续纳入 `test:withdraw-status-mirror`：真实页面、路由和 API 解析器，仅隔离网络传输。覆盖选择方式、跨设备且关闭通道恢复、不重复提交、证据与终态、耐久取消、三语言和明暗主题的核验禁用状态、无有效期/CVV。网络桩不代表供应商真实打款验收；原生设备实测与真实提供方联调仍单独验收。

本轮仅交付到 `test` 候选分支，并记录完整检查的实际结果；进入主线与发布前必须通过完整仓库门禁。新页面不属于旧 5174 原型的 32 页镜像；原页面样式对齐保留，仅授权的银行卡入口更新模板指纹。
