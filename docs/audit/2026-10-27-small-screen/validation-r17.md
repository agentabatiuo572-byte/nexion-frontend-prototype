# r16–r17定向验证记录

APP基线`ddcea906d62e8242815e5af104ac1574bfa486a2`加本轮源文件。浏览器r17入口`index-BQJ7beyl.js`、全局CSS`index-DPMvPy7r.css`；动态组件CSS另有内容哈希，不能单凭全局CSS判断版本。

| 检查 | 实际结果 | 边界 |
| --- | --- | --- |
| r17 `npm run type-check` | 退出0 | 最终r17源文件；非只使用较早r16类型结果。 |
| r17 `npm run build:h5:prod` | 退出0 | 本地APP源码的浏览器产物；不是独立H5仓最终同步。 |
| r17 `npm run build:custom -- app` | 退出0 | 原生资源编译；未安装物理手机。 |
| 满槽卡定向Vitest | 3文件52/52 | `trial-benefits-lifecycle.behavior`、`trial-claim-prerequisite.behavior`、`trial-offer-stability`。初次51通过、1旧可见文案断言失败；按新文案修订后52通过，完整aria、管理路由以及零领取断言仍在。 |
| 导航既有Vitest | 3文件40/40 | `glass-segments.behavior`、`liquid-glass-view.behavior`、`native-svg.behavior`。最终CSS又限定回弹仅小屏；之后原生SVG Node测试1/1、源码解析和watcher检查通过，CSS动效由本轮实景另验。 |
| r16福利/邀请 | 5文件68/68 | r17未更改邀请及普通福利动作；容量满新增分支以上述52项为准。 |
| r16签到 | 3文件28/28 | 已签到短图标与原daily入口；不当作真实奖励到账。 |
| r16钱包 | 3文件49/49 | 金额及未知态守卫；字号/长金额布局由独立实景另验。 |

各批次存在交集，不将数量相加为一次全量验证。没有运行full verify。命令日志在本机仓外`uvel-design-preview/r20-backend-test`，本报告只记录实际结果，不包含模拟账户状态或凭据。

构建仍输出既有静态CSS资源延迟解析提示；`s1.webp`已核对源码、浏览器产物、APP产物均117466字节。真实页面机型展示另有两位审查截图，未把编译警告静默解释为资源缺失。

父线程5237读回主入口；320×693导航实际55.99px、图标25.96px、五个标签隐藏、底部保留约22px指示器区。该几何读回不替代独立视觉和交互评分。恢复390×844，原模拟业务与聊天记录不重置。

最终两位实景、未覆盖与H5同步状态以[主报告](../2026-10-27-small-screen.md)和[统一交付](../2026-10-27-unified-delivery.md)为准。

## r18最终源码增量（2026-10-28）

本包相较r17仅缩短中文容量满说明、小屏图标scale 1.18→1.09、邀请页未登录文字入口补44×44点击区。没有改变金额、资格、路由或消息状态处理。

- 最终 `npm run type-check`、`npm run build:h5:prod`、`npm run build:custom -- app` 均退出0；对应仓外日志 `app-types-r18-final.log`、`app-build-r18-final.log`、`app-native-r18-release.log`。较早的r18原生编译发生在Ref触区修改前，不代签最终包。
- 浏览器入口 `index-Bl4ZaVBC.js`，SHA256 `F28C066E8B316FDB3F60C5AF30F7C0E253B933864297518DC2E3B54EC8FB887E`；主CSS `index-DPMvPy7r.css`，SHA256 `361F8178B8E346B1B8C3A0E2E168938DE62036EEF456B13962803AD0E07FA80D`。
- 未为三处文字/样式重复运行之前全部逻辑测试；既有52项、导航40项的范围如上，真实排版/点击由r18独立实景增量核验。
