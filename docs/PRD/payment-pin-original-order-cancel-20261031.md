# 错误 PIN 后原单取消与恢复（2026-10-31）

## 行为规则

- 仅钱包付款进入 PIN。实际钱包调用在账号作用域的原命令上持久化 `WALLET` 来源；外部两种付款在同一原命令上持久化 `EXTERNAL`，不调用 PIN。标记不改变支付键、金额或报价版本。
- 缺少来源的旧记录不推断为钱包。原键 GET 为 `NOT_SEEN/canResumeSameKey=true` 时仅允许显式选择钱包、以原键再次提交建立来源；仍不允许取消例外。已知外部记录保持封闭，不能由钱包重试覆盖。
- 错 PIN 后取消 PIN 只关闭输入层。返回时必须重新查询原支付键和同归属原单；仅显式钱包来源、`NOT_SEEN/true`、同原单仍待付，才允许调用服务端原单原子取消。该查询是瞬时快照，不阻止迟到付款。
- 发取消前持久化取消身份并保留原支付身份。只在权威读回同原单 `CANCELLED/EXPIRED` 后退出；付款先赢时恢复原已付/激活结果，不显示取消成功、不再次付款。取消409/响应未知保留原取消键与原支付键，沿原单回查/重试。
- `PROCESSING/INDETERMINATE/NOT_SEEN+false`、原单读失败和外部未决继续封闭；返回被阻止时显示既有原结果回查文案，不能静默吞返回。

## App 与 Lite 范围

App 的普通 checkout、order detail、legacy bundle 钱包与外部回调均写显式来源；Promotion session 与取消返回页按上述原单原子门恢复。Lite 仅等价同步共享 Promotion session；保留 Lite 既有离开确认/导航策略，不整分支移植 App 页面或手机购买/质押策略。

## 复验边界

本地定向行为测试使用实际 session、SFC 提取函数和可控 transport/方法选择端口；不是公网/真机取消验收。此前 cb4 原记录缺少来源，真机须在相同 CloudShare 数量2的原 session 中显式选钱包原键再错 PIN一次后返回；如原单已自然到期，应记录真实 EXPIRED，不改TTL、不用新单冒充原恢复。

取消命令查询暂未找到时，权威原单若已CANCELLED/EXPIRED/PAID则接受原单终态、清活动取消fence并保留previousPayment，不把已完成取消留成未决命令。

App订单详情成功进入统一方式门时即消费自动继续付款入口；取消方式选择后不因旧pay意图自动再次打开。Lite没有此autoPay入口，不添加新行为。
