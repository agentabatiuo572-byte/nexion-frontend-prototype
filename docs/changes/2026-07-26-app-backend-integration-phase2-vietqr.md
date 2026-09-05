# App 与 PC 数据打通二期：VietQR 充值闭环

> 日期：2026-07-26  
> 范围：`NX1.0` App、`nexion-backend`、`nexion-ops-console`  
> 真源：`PAY-VIETQR-APP-PC-INTEGRATION-SRS-v1.md`

## 已打通

1. App remote 模式从后端读取 PC D1/D6 管理的 VietQR 限额、收款账户可用性和 VND/USDT 报价。
2. App 使用稳定 `Idempotency-Key` 创建 canonical intent；后端锁定用户、金额、汇率版本、VND 应付额、收款账户、附言、过期时间和版本。
3. intent 创建时同事务生成 `APP-{intentNo}` D1 在途投影，PC 可在“在途意向单”看到 App 新单。
4. App 的查询、列表、取消全部按认证用户隔离；取消与到账使用版本 CAS，断网未知结果保留原命令键。
5. PC 人工匹配不再接受操作员指定入账用户，用户归属只读 canonical intent；核销同事务推进 intent、reconciliation、钱包累计入金和不可变账本。
6. App 每 3 秒重新读取服务端状态，刷新或重登后可恢复等待、复核、成功、过期状态；remote 失败清除旧可操作快照，不回退 mock。
7. PC D1 新增受权限保护的“登记银行回单”：提交唯一银行流水号、实际收款账户、实收金额、到账时间和证据编号，服务端按附言分类到已匹配、孤儿、差额或迟到队列；确认入账后 App 轮询得到最终状态。
8. 首笔精确回单登记后 intent 立即进入不可取消、不可过期的 `receipt_review`；到账时点在到期前或宽限期内，即使财务稍后确认仍可正常入账，宽限期后到账只进入迟到复核。
9. 同一附言的第二笔新银行流水作为独立补充回单进入迟到队列，只允许登记退回，不会复用过期锁价或重开已成功/已取消/已退回的原 intent。
10. 物理实收在唯一银行流水登记事务中按越南 UTC+7 业务日计入账户累计；超日限额会熔断该账户、取消其余等待单并停止新单路由，但不会拒绝已经到账的当前资金。所有 OPEN 真实回单（含精确匹配）进入待核实入金负债。

## 失败关闭与隐私

- 收款账号继续以 AES-GCM 密文落库；PC 只见尾号，App 只向 intent 所属用户在等待付款阶段返回完整账号，终态只返回尾号。
- App 首次 intent 列表同步成功前禁止创建新单；创建结果未知时只允许同金额、同幂等键重试。
- 后端锁定有效用户并串行化同用户创建，最多保留 5 张未过期 intent；跨用户查询统一 404。
- 高敏登记、匹配、核销和退回均要求不可变银行流水/证据编号；入账金额永远按 intent 的 canonical 锁价计算。
- 收款账户停用时服务端取消该账户未付款意向单并关闭 PC 在途投影；历史终态只返回尾号，不再解密完整账号。
- remote 模式不展示 mock 点阵二维码。正式银行/provider 尚未返回真实 VietQR payload 时，只展示账号、金额和附言手工转账提示。

## 数据与接口

- 迁移：`scripts/migrations/20260725_vietqr_intent_app.sql`
- App API：
  - `GET /api/app/payments/config`
  - `GET /api/app/payments/fx-quote?fiat=VND&asset=USDT`
  - `POST /api/app/deposits/vietqr/intents`
  - `GET /api/app/deposits/vietqr/intents`
  - `GET /api/app/deposits/vietqr/intents/{intentNo}`
  - `POST /api/app/deposits/vietqr/intents/{intentNo}/cancel`
- PC D1：
  - `POST /api/admin/finance/vietqr/receipts`
  - `POST /api/admin/finance/vietqr/reconciliations/{id}/actions/{action}`

## 验证

- 后端 scoped VietQR 测试、架构测试和全量 Maven 测试。
- 本地 MySQL 8 条件集成测试真实执行：创建、幂等重放、App 列表、PC D1 在途可见、真实回单登记、回单占用后取消拒绝、精确匹配入账、终态第二笔回单独立退回、钱包与累计入金、D4 ledger 唯一性、账户日累计、重复结算拒绝、账本冲突回滚、取消和投影关闭；另由真实 Spring `@Transactional` 代理验证审计失败时钱包/账本/intent/reconciliation 整体回滚。
- App payment API / remote store Vitest、覆盖率门、TypeScript 和 remote H5 production build。
- PC D1/D6 contract test、TypeScript/Next.js production build。

## 下一阶段

银行/provider 自动回调签名接入与真实 VietQR payload/二维码是下一小阶段；当前 PC 受控回单登记已经可以完成真实数据闭环。在签名和生产 QR 数据确定前，不允许用 mock 点阵冒充正式支付二维码。
