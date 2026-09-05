# 商城 Sandbox 支付与 APP 真接口收口验收（2026-08-16）

## 结论

本轮验收通过。显式 `local-sandbox` 中的商城已经能够从服务端目录建单，用服务端持久的隔离钱包完成模拟支付，并在重试、刷新和重新进入订单页后恢复同一支付事实。生产支付提供方未配置时仍失败关闭，没有把 Sandbox 模拟支付当成生产成功。

## 逻辑验收路径

1. 登录有效 Sandbox 账号，读取 `GET /api/store/catalog`；目录证据为 `source=mock` / `sourceEnvironment=SANDBOX` / 当前 RunID。
2. 确认至少一件后端裁决为可购的商品；未达 E1 发布阶段的商品仍保留锁定。
3. 余额不足时通过 `POST /api/app/wallet/sandbox/topups` 建立隔离入金，回读 `SETTLED`；未修改生产钱包。
4. 通过 `POST /api/orders` 建单，回读 `PENDING / PENDING_PAYMENT`。
5. 通过 `POST /api/orders/{orderNo}/pay` 支付，回读 `PAID / PAID / paid` 和服务端 `paymentNo`。
6. 以同一幂等键重放支付，`paymentNo` 保持不变，不重复扣款。
7. 再次读取 `GET /api/orders`，订单状态稳定为 `PAID / WAITING_PROVISIONING / paid`，支付编号与首次回执一致。

## 首次失败与继续修复

- 后端启动时发现 Trial eligibility 重复路由，删除重复入口并增加路由唯一性测试。
- Wheel Sandbox 启动校验错把 `information_schema` 结果按错误字段计数，修正表/索引/约束探针并加 SQL 契约测试。
- Sandbox 商品投影漏了数据中心认证，导致完整商品被误判为规格不可用；补齐 datacenter 字段并验证可购。
- 首次支付返回 500，定位为 MyBatis record 构造字段顺序与 SELECT 投影不一致；先增加失败契约，再修正字段顺序，最后重走 API 闭环。
- 生产边界测试曾继续要求 remote 客户端本地扣/退款，与现有服务端余额真值冲突；更新为“所有远端轨禁止客户端二次扣款/退款”并复验。
- 对抗复审发现 Sandbox 换新结算仍可能触碰生产钱包/库存/订单；后端在任何读取与幂等执行前增加 fail-closed，容量替换同样封堵。
- D7 模拟出金补齐 Sandbox 用户和 RunID 维度；管理端支付方式增加 profile/user 环境一致性；Home 的事实表没有 RunID 时直接返回不可用，不跨验收运行复用事实。
- Mock 单品/组合的收据写入失败原会继续提示成功，改为保留可重试错误态；远端银行卡与安全命令改为只有权威读回成功后才确认。
- 商品详情增加目录重试，组合订单回读保留 `itemCount`；remote 收益、NEX 历史、合作/合规背书、随机成员动画与固定解锁倒计时全部改为服务端真值或不可用。
- 收据失败恢复按账号隔离；组合购与试用转购必须回读同一 canonical 订单并确认已支付，组合购还需确认 `itemCount` 一致后才清空购物车。
- Trade-in 对所有 Sandbox 用户统一失败关闭，不因运行 profile 旁路生产钱包、库存或订单；Day-one、Proof、团队财务、钱包 NEX 与网络统计缺少权威数据时统一显示不可用。

## 自动化证据

- Backend：3822 tests，0 failure，0 error，12 skipped。
- UniApp：TypeScript 检查通过；50 test files / 129 tests 通过。
- Production boundaries：23/23 通过。
- Remote logic journey：3/3 通过。
- Cross-repo contracts：8/8 通过。
- H5 production build：通过。
- PC：A3 契约 4/4、RBAC 21/21，Next.js production build 通过。
- Final commerce / funds / remote truth contracts：17/17 通过。

## 不在本轮签发的生产能力

- 真实 PSP/银行/链上支付。
- 真实出款与供应商回调。
- 没有权威数据提供方的外部账户、安装包或链上详情。

上述项目保持 HOLD/失败关闭，不回落到生产假成功。
