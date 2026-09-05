# App 后端遗留端点消费审计（2026-08-15）

本次只按 App 的可见产品入口审计 `nexion-backend` 已存在、但 App 可能未消费的端点；没有可见入口的端点保持不接入。

## 试用生命周期

当前 App 可见入口是试用状态页、开始试用、取消试用，以及结算页的“立即购买”路径。结算页在服务端模式调用当前的 `/api/trial/convert`，并携带稳定幂等键；没有“延长试用”“提前赎回”或独立的试用扣费按钮。

因此以下后端端点明确标记为 **App 不应接入**：

- `/api/trial/extension`：旧卡时代延长流程，无可见 App 入口。
- `/api/trial/redeem-early`：旧名称/兼容流程；当前提前购买语义由 `/api/trial/convert` 承担。
- `/api/trial/charge`：旧卡时代扣费流程；当前结算由订单/支付链路和 `/api/trial/convert` 收口。

不为“全接端点”新增隐藏调用，也不以这些旧端点作为当前试用状态机的降级路径。

## 风险提示闸门

提现页是当前可见的资金动作入口。提交前调用 `/api/legal/risk-disclosure/gates/withdraw/check`，以该次提现的稳定幂等键作为 `operationId`；账号切换后的旧响应不能放行提交。服务端提现链路仍保留最终闸门，前端检查失败时不建单并引导重新阅读或重试。

## 动态文案与错误态

首页转化横幅继续消费 `/api/content/positions/home.conversion-banner`，运行时语言包继续消费 `/api/content/i18n`。动态文案按账号 epoch 清理和防旧响应污染。

活动中心与任务中心的 `/api/events` 500 不再被渲染成“暂无活动”：页面展示可恢复错误和重试入口；周任务错误、加载中、空态及服务端验证文案也统一走 i18n。
