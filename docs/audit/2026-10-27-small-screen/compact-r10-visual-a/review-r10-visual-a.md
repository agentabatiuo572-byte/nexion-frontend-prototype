# R10 窄屏限定独立视觉复验 A — 冻结 / READY

冻结时间（UTC）：2026-10-27T11:13:49.345Z。

**READY：现有13张r10截图已冻结，原约定范围无剩余取证项，父线程可以构建r11。** 新增导航文字问题保持OPEN，不能拿本报告放行最终H5。

实际入口 **index-vv3sJnOr.js** / 全局CSS **index-8t-HDpGw.css**。每组DOM均读取实际入口及动态CSS，不以全局CSS文件名相同推断组件未变化。只操作本人5254/preview、官方CUA Chrome4 / tab 1733372912；未操作5237、5249或别人的标签。只写本目录报告/截图，未改产品、构建、运行测试或Git。

## 独立分数

| 项目 | 分数/10 | 实际证据与结论 |
| --- | --- | --- |
| 小屏Logo比例及右上控件 | **9.2** | 320越文浅色及补充320中文暗色均112×39；390中文暗色146×50。Logo适配父槽，两侧留白协调，右上搜索/消息两按钮均44×44，无碰撞。 |
| active/grace双按钮协调性 | **9.2** | Earn在320VIlight、390ZHdark的active/grace均实际展开目检；管理列表两代表active展开亦检查。详情短文案单行、完整aria保留；按钮不再等分撑满两半。视觉底色/描边层32px，外部点击盒44px。越文Mua sớm/Mua với khấu trừ、中文提前购买/抵扣购机完整，体量较r9协调。旧8.7在本范围关闭。 |
| 试用/普通设备字号及列对齐 | **9.2** | 320 Earn/Home试用名13px、剩余12px；普通行截图和Earn文字读回与试用协调。320管理试用/两普通设备名均12px，状态11px，名称左缘一致。390 Earn/Home标题15px、剩余14px，管理标题/剩余13px，保留常规上限。越文时间恢复单行；剩余时间字体为项目字体而非原等宽。页面横向溢出读回0。旧窄屏8.8在此范围关闭。 |
| 添加设备文字/盒模型 | **9.1** | Earn320字13px、260×44；390字15px、330×44；与父卡内边距匹配。Home添加行保持同列，截图未见边界膨胀。不是全站主按钮尺寸重审。 |
| 44px真实命中及读取失败禁止购买 | **9.2** | 320VI在详情按钮顶边2px处（位于32px可见pill之外、44px盒内）实际pointer点击成功进入/pages/me/trial，完整aria为Chi tiết dùng thử。grace读取失败后购买按钮aria-disabled=true、tabindex=-1；实际pointer点击前后均为Earn路由。恢复请求后实际点击重试回到正常。 |
| Liquid Glass材质保留，仅材质 | **9.2** | 明暗截图与稳定DOM仍有SVG光学层/strategy=svg，顶部圆控件与底部Liquid Glass保留。这不构成导航文字布局通过。 |
| **新增NAV-01：320越文浅色导航标签** | **8.6 / OPEN** | 现有r10-home-logo-vi-light-320.png及r10-active-actions-vi-light-320.png可见标签超出选中底座，底部词组拥挤。用户新增要求后，旧导航文字分数不再继承。父线程r11待修，随后五个选中态单独验收。 |

分数不平均。原r10窄屏七文件对应UI效果可限定受理；**导航文字新P2尚未关闭，不能称本轮全部通过或同步H5已过关**。

## 实际操作范围

- 主代表：320×693、越文浅色；390×844、中文暗色。
- 额外按约定二选一补帧：320×693中文暗色首页完整顶栏。没有运行360EN或351–374中间档，不能声称124×43的中间断点已实景验证。
- 控件切换active/grace并真实展开Earn；查看设备管理的同类展开区；Home查看Logo和算力列队。旧r9展开归属完整矩阵未重跑。
- 44px边缘验证使用官方CUA CDP浏览器鼠标pointer；未冒称手机touch。
- 读取失败采用本人标签临时阻断本地5254/api/trial/*，由实际App轮询产生失败、已载入行保留并出现右侧重试。没有注入DOM或改store。禁用购买的点击只验证无导航；没有提交购买/取消试用。
- 临时阻断已清除，恢复重试已操作。r11新增8文字retry及导航修改均未预先签核。

## 冻结图片与数据

[runtime-r10-visual-a.json](runtime-r10-visual-a.json)保存每组实际入口、主题/语言/viewport、动态样式、DOM字体/几何/aria、点击前后路由和13张PNG的SHA256。截图通过官方CUA CDP直接捕获手机完整范围，未后期改图。

主要图片：

- Logo：r10-home-logo-vi-light-320.png、r10-home-logo-zh-dark-390.png、r10-extra-home-logo-zh-dark-320.png。
- Home列队：r10-home-row-vi-light-320.png、r10-home-row-zh-dark-390.png。
- Earn双按钮：r10-active-actions-vi-light-320.png、r10-grace-actions-vi-light-320.png、r10-active-actions-zh-dark-390.png、r10-grace-actions-zh-dark-390.png。
- 管理同类：r10-inventory-actions-vi-light-320.png、r10-inventory-actions-zh-dark-390.png。
- 交互：r10-details-hit-result-vi-light-320.png、r10-grace-read-failure-disabled-vi-light-320.png。

实际观察的相关动态CSS：

- brand-lockup-BuVYk5AL.css
- app-chassis-BYVbGD9Q.css
- device-slot-CLCoDqc9.css
- trial-device-row-CrNa4nU3.css
- earn-CIyLOhln.css
- devices-DgEM7_Yk.css

## 后续最小范围与边界

允许r11重建后，仅新增导航五个选中态和父线程列明的8处其它页重试文字做差异复核；本轮图片保持r10归属，七文件若未变不再整套重拍。旧[r9冻结记录](../merge-r9-visual-a/review-r9-visual-a.md)、[r8失败记录](../../2026-10-27-unified-delivery/retry-visual-a/review-app-r6-r8-BSpOlTnk.md)保留，不覆盖历史。

正式Java/真实服务、真机安装与触摸、最终同源H5均不在本报告签核范围。父线程报告的87测试/type/build未由本评审重复执行，也不代替上述实景。
