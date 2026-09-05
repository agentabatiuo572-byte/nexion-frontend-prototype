# App × PC 管理端数据打通 · 一期契约与二期缺口

> 日期：2026-07-25
>
> 实现仓：`D:\workspace\NX1.0`（`master`）
>
> 后端真源：`D:\workspace\nexion-backend`（本批只读）
> PC 管理端：`D:\workspace\nexion-ops-console`（本批只读）

## 1. 连接原则

App 不直接连接 PC 管理端。PC 与 App 都只连接 `nexion-backend`：

1. PC 写配置 / 审核结果；
2. 后端校验权限、持久化、记审计，并生成版本化业务事实；
3. App 读取或发起用户动作；
4. 后端状态机推进；
5. PC 查看 / 处理异常；
6. App 再读最终状态。

任何一步失败都保持服务端原状态，不允许前端用本地 mock 补一个“成功”。这是后续模块统一的闭环。

## 2. 一期已落地

| 能力 | App 调用 | 后端现有接口 | 状态 |
|---|---|---|---|
| 密码登录 | `authApi.login` | `POST /auth/users/login` | 已接 |
| 登录 2FA | `authApi.completeTwoFactor` | `POST /auth/users/login/2fa` | 已接 |
| 会话内 401 刷新 | `apiClient.refreshSession` | `POST /auth/users/refresh` | 已接；刷新令牌只驻内存 |
| 退出登录 | `authApi.logout` | `POST /auth/users/logout` | 已接；断网仍清本机 |
| 安全总览 | `accountApi.securityOverview` | `GET /api/app/security` | 已接 |
| 修改密码 | `accountApi.changePassword` | `POST /api/app/security/password` | 已接 |
| 2FA 开关 | `accountApi.updateTwoFactor` | `PUT /api/app/security/two-factor` | 已接 |
| 会话下线 | `revokeSession / revokeOtherSessions` | `/api/app/security/sessions/*` | 已接 |
| KYC 状态 | `accountApi.kycStatus` | `GET /api/kyc/status` | 已接，只认服务器状态 |

安全与 KYC 两个域独立加载、独立失败：只有 `status=ready` 的当前响应才可作为页面事实；刷新中、503、协议漂移或账号切换都会立即清除对应旧快照，不能继续展示或操作旧 2FA、旧会话、旧 KYC。安全总览的 `passwordChangedAt` 按后端表结构接受 `null`，仅显示“尚未修改”，不影响同一响应里的 2FA / 会话。登录 2FA challenge 只接受真实 HTTP 428 且 envelope 同时为 `code=428`、`message=USER_TWO_FACTOR_VERIFICATION_REQUIRED` 的响应。

运行模式只有两个：

- `mock`：默认，高保真演示使用；
- `remote`：真实后端联调使用；缺接口即失败，不回退 mock。

一期的 `remote` 完成范围仅是本节列出的认证、安全和 KYC 状态。其他业务页仍属于原型数据，不得把“能打开页面”当成已完成真实联调；后续必须逐模块替换并逐模块验收。当前没有安全凭证容器：H5 未接 HttpOnly Cookie，原生未接 Keychain / Keystore，因此所有端冷启动都重新登录，绝不降级把 refresh token 写入普通本地存储。

## 3. 已确认但本期不伪接的认证缺口

后端安全配置虽放行部分路径，但当前代码没有相应业务 Controller，不能按“路径可能存在”宣称可用：

| App 用户动作 | 当前处理 | 后端需补 |
|---|---|---|
| 普通 OTP 登录 | remote 模式停用 | OTP 发码、校验并签发正式 session |
| 新用户注册 | remote 模式停用 | 注册预占、OTP 校验、激活、幂等提交 |
| 忘记密码 | remote 模式停用 | 独立 reset challenge；不能复用需当前密码的改密 |
| 注销账号 | remote 模式拒绝假成功 | 冷静期、资产 / 在途单校验、审计、撤销接口 |

## 4. 二期：越南支付模块必须补齐的 App 接口

后端现在已有：

- 管理端：`/api/admin/finance/vietqr/**`、`/api/admin/finance/fx-quote`；
- 支付提供商回调：`/openapi/v1/topups/**`；
- 用户提现：`GET/POST /api/withdrawals`。

这些不能代替 App 用户接口。二期建议按下面最小闭环补齐。

### 4.1 通道与牌价

| 建议接口 | 服务器职责 |
|---|---|
| `GET /api/app/payments/config` | 返回可用充值通道、USDT 网络、费用、限额、维护状态和配置版本 |
| `GET /api/app/payments/fx-quote?fiat=VND&asset=USDT` | 从后台基准价 / 点差派生当前展示价；返回有效期与 quote version |

App 不读取 admin 路由，不缓存成第二套业务真源。拿不到牌价时 VietQR 下单按钮禁用。

### 4.2 USDT 链上充值

| 建议接口 | 服务器职责 |
|---|---|
| `GET /api/app/deposits/addresses` | 返回当前用户 TRC20 / BEP20 / ERC20 固定专属地址 |
| `GET /api/app/deposits?cursor=&limit=` | 返回真实 detected → confirming → credited / review 状态 |

到账、确认数、幂等入账全部由链上监听与后端账本推进；App 只有读取权，不能上传“已到账”。

### 4.3 VietQR 银行转账

| 建议接口 | 服务器职责 |
|---|---|
| `POST /api/app/deposits/vietqr/intents` | 校验通道 / 限额；原子锁价 30 分钟；分配收款账户与唯一附言；要求 `Idempotency-Key` |
| `GET /api/app/deposits/vietqr/intents/{intentNo}` | 返回等待、成功、过期、差额复核、迟到款复核等服务器状态 |
| `POST /api/app/deposits/vietqr/intents/{intentNo}/cancel` | 只允许可取消状态；CAS 防止到账与取消竞态 |

PC 端现有对账 / 人工动作完成后，必须写回同一 intent 和账本，App 再读最终结果。

VietQR 不能只新增三个 App 路由，还必须先建立 canonical intent 单一事实源（如 `nx_vietqr_intent` 或等价模型），至少持久化：`intent_no`、`user_id`、幂等请求哈希、应付 VND / 入账 USDT、锁定汇率与版本、收款账户、唯一附言、状态、过期时间、乐观锁版本和审计时间。`intent_no`、唯一附言及有效期内收款匹配键必须有数据库唯一约束。

PC 现有 reconciliation 不能继续信任操作员自由输入的 `userId + intentNo`。人工匹配必须先查询真实 intent，并以 CAS 在同一事务内推进 intent、reconciliation、用户钱包和不可变账本；用户不符、金额不符、已过期、已入账或版本冲突一律拒绝，重复回调 / 重复点击只返回同一最终结果。

### 4.4 国际卡充值

| 建议接口 | 服务器职责 |
|---|---|
| `POST /api/app/deposits/card/sessions` | 创建 PSP 支付会话，返回短期 client secret / redirect 参数 |
| `GET /api/app/deposits/card/sessions/{sessionNo}` | 返回支付、拒付、退款、拒付争议状态 |

卡号、CVV 不进入 NexGrid App 日志、状态仓或后端数据库；必须由 PSP 托管输入 / tokenization。

### 4.5 提现地址换绑

| 建议接口 | 服务器职责 |
|---|---|
| `GET /api/app/wallet-bindings/usdt` | 返回当前地址、网络、换绑冷却、提现冻结截止时间 |
| `POST /api/app/wallet-bindings/usdt/rebind-challenges` | 创建新地址 $1 验证挑战；校验在途提现与 7 天频控；要求幂等键 |
| `GET /api/app/wallet-bindings/usdt/rebind-challenges/{challengeNo}` | 返回来源地址校验与链上确认状态 |

换绑成功必须由后端在同一事务中更新绑定、记录审计并写 24 小时提现冻结。App 不能自行 finalize，也不能自行倒计时后解除冻结。

## 5. 二期验收闭环

每条支付路径至少验证：

1. PC 改配置后，App 重新读取能看到同一版本；
2. App 发起动作后，数据库只有一条幂等业务记录；
3. 提供商 / 链上回调重复、乱序、迟到时不重复入账；
4. PC 人工处理必须有权限、确认、理由、审计；
5. App 刷新 / 重登仍显示服务器最终状态；
6. 断网、超时、401、409、422、503 全部 fail closed；
7. 账户 A 的地址、意向单、充值和换绑状态绝不泄漏给账户 B；
8. 资金类代码由非实现 Agent 按墨菲定律对抗复审。
