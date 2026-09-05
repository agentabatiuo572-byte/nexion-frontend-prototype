# 登录注册流程系统安全区 · Change Proposal

- **工作线**：④ uniapp
- **日期**：2026-07-15
- **状态**：Shipped（纯 UI 系统不变量，不改业务 PRD）

## Why

登录、注册与 onboarding 使用 bare 全屏页面，没有复用主应用壳的顶部状态栏与底部 Home Indicator；估算页 CTA 也没有按注册成功页的底部安全区基准定位。

## What changes

- 建立 bare 全屏页共用的系统安全区壳，统一复用状态栏与 Home Indicator。
- 登录、注册、注册成功、onboarding intro / estimator / connect / terms、邀请码落地与会话失效重登录页全部接入共用壳。
- estimator CTA 的左右边距与底部距离对齐注册成功页。
- 短屏补可滚动访问、onboarding 补返回出口，非原生按钮补键盘语义；未开放的第三方登录明确反馈，不再渲染死按钮。
- 中文 onboarding 移除内部性能测试标识和未本地化单位。
- verify 增加自动发现的登录入口系统壳静态 + 运行时门，防止后续页面再次漏掉或假绿。
- **Out of scope**：不改登录、注册、onboarding 的账号规则、数据模型或收益计算。

## Impact

- **页面 / 路由**：`pages/login/login`、`pages/register/register`、`pages/register/success`、`pages/onboarding/{intro,estimator,connect,terms}`、`pages/ref/code`、`pages/session/kicked`。
- **Store / model**：无。
- **i18n**：补登录方式不可用反馈、收益单位和算力性能友好文案，保持中英镜像。
- **设计**：复用现有 `DeviceStatusBar`、`--v5-home-indicator` 与 38px 底部安全区基准。
- **PRD 章节**：仅 UI 系统安全区，不同步业务 PRD。
- **不变量风险**：App/H5 双端、移动端安全区、bare 页面全量覆盖、已有注册成功页未提交改动不得回退。

## Done-when

- [x] H5 设备预览中 9 个登录入口与 onboarding 页面都显示同一套顶部状态栏与底部 Home Indicator。
- [x] estimator CTA 与注册成功页 CTA 在 430×940 和 320×568 的左右边界、底部距离一致，且不与 Home Indicator 重叠。
- [x] 区号弹层打开时状态栏与 Home Indicator 仍在最上层可见；短屏可滚动到全部主操作。
- [x] `npm run type-check` 与 `bash scripts/verify.sh` 通过，新增哨兵能拦截任一流程页漏接共用壳。
- [x] 浏览器逐页实景无控制台错误，短屏下关键按钮仍可见、可点。
