# 全球网络：Android 与 TEST 接续验收

2026-10-26；修复运行版本 App `c2078fe1`、网页共享线 `3110d4e`。保留上游 `604e6198` 全站安全区调整。Jenkins uniapp #292 SUCCESS，TEST broker 返回同一 App SHA 已部署。后续验收文档提交不改变已发布运行版本。

真机为 Samsung SM-A5760（1080×2340、density450），HBuilder标准基座；浏览器为真实TEST地址。原生app-service.js SHA256：`19DCA88139785547F2A46A37D0D5CDF18ACC0A1793483AE90B1A3B770E7BAB1C`。本轮未清数据、改权限、创建账号、订单或执行资金操作。

## 修复与独立闭环

| 票 | 复现与修复 | 当前结论 |
|---|---|---|
| #652 | 减少动态时H5仍生成SMIL。复用已有运动偏好；停止脉冲而保留计数。退役依赖旧远端投影的失效测试，改用真实SFC生命周期检查 | TEST真实页面媒体偏好false/SMIL2→true/稳定0→false/2，数字继续更新；closed/fixed。Android系统设置的实际匹配另待验 |
| #653 | 详情打开时系统BACK直接退地图。Globe局部先关层，再次BACK放行历史；关闭按钮28px外观、44px触区 | 原生首次关层留地图、二次回搜索，以及外缘点击关闭通过；closed/fixed |
| #654 | 遮罩下拉冒泡，刷新图标出现并将卡片拉出视区；松手复位不能当通过。局部隔离触摸，遮罩阻止默认滚动，卡片保留内滚与滚动链隔离 | 最终原生上下拖动卡片/背景稳定；H5长内容实际内滚通过；closed/fixed |

代码修复者 `globe_independent_review`，独立复核者 `globe_acceptance_review`，主线程独占真机。独立复核运行41项地图检查，并查看原始截图与结构化浏览器结果；原有断言未放宽，八中心模型未改。类型、App原生资源与H5生产构建、2749文件强来源检查通过，未执行full verify。

官方状态逐次读回见[闭环回执](globe-native-20261026/zentao-closure-receipt.json)。

## 实景范围

- 从实际搜索“全球”进入地图、退出与再进入；当前测试账号首页网络卡片不可用，没有冒称验证该首页按钮。
- 八个地图点逐个点击：新加坡23.6W+、东京25.3W+、胡志明16.3W+、伦敦24.9W+、巴黎20.8W+、法兰克福21.7W+、纽约31.6W+、圣何塞28.4W+。新加坡/伦敦初轮点位来自b098，点位未改；最终版本另从列表复验，其他六点在最终候选补验。不将复用证据写成最终版本八点全量重跑。
- 最终c207版本的八个列表入口全部逐项打开，关闭后列表位置保持。逐项原始截图：

| 中心 | 固定节点 | 最终原生列表详情 |
|---|---:|---|
| 新加坡 | 23.6W+ | [截图](globe-native-20261026/list-singapore-latest.png) |
| 东京 | 25.3W+ | [截图](globe-native-20261026/list-tokyo-latest.png) |
| 胡志明市 | 16.3W+ | [截图](globe-native-20261026/list-vietnam-latest.png) |
| 伦敦 | 24.9W+ | [截图](globe-native-20261026/list-london-latest.png) |
| 巴黎 | 20.8W+ | [截图](globe-native-20261026/list-paris-latest.png) |
| 法兰克福 | 21.7W+ | [截图](globe-native-20261026/list-frankfurt-latest.png) |
| 纽约 | 31.6W+ | [截图](globe-native-20261026/list-new-york-latest.png) |
| 圣何塞 | 28.4W+ | [截图](globe-native-20261026/list-san-jose-latest.png) |

- 当前Android竖屏卡片留在系统手势条上方，说明完整、关闭可用；原生中文深色。计数/任务/延迟持续变化，固定W+保持；精确同快照汇总由模型/组件检查覆盖。
- TEST 320×270短屏：卡片顶部12px、底部40px，内容240px、可视218px；实际滚轮使内滚0→22，背景117.3333保持。此为浏览器长内容证据，不替代原生长内容。
- TEST 320px中英越、深浅主题详情已检查，长城市名与关闭按钮无重叠，无横向溢出；底部约39.67px。测试后恢复中文/深色，清除浏览器媒体和视口模拟。

## 证据

- 返回：[首次关闭](globe-native-20261026/back-first-fixed.png)、[再次回历史](globe-native-20261026/back-second-fixed.png)。
- 滚动：[原始失败瞬间](globe-native-20261026/scrim-drag-beforefix.png)、[修复后下拉](globe-native-20261026/scrim-down-fixed.png)、[修复后上推](globe-native-20261026/scrim-up-fixed.png)。
- [44px外缘关闭](globe-native-20261026/close-edge-fixed.png)、[英文](globe-native-20261026/h5-en-320.jpg)、[越南文](globe-native-20261026/h5-vi-320.jpg)、[浅色](globe-native-20261026/h5-light-320.jpg)、[H5结构化观察](globe-native-20261026/h5-runtime.json)。
- 全部原始执行资料及计划位于 `D:/workspace/output/globe-native-20261026/`；关键图片与回执已随本文件入仓，不只引用另一台机器的本地路径。

## 仍未覆盖

iOS安装/触控、Android系统减少动态偏好的实际匹配、原生长内容/大字体/其他尺寸、原生英越/浅色和后台休眠仍未签。全站其他U01–U21沿用原台账；本轮不扩写为全站通过、生产发布或资金验收。
