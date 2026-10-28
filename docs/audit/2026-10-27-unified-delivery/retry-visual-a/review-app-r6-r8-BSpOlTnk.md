# APP r6–r8 限定增量独立视觉复验 A

冻结时间（UTC）：2026-10-27T10:32:51.230Z。

结论：RV01/02/03与商城中文文案通过；新增试用详情重试字体仍有一项P2，8.8，整个文字重试统一项不能签为全部完成。无P0/P1。各项独立评分，不平均。

## 实际版本

只操作本人新建的后台内置浏览器IAB 6 / tab 1，5254/preview；未操作5237、5249或其他代理页面。

初次实际读取已是r7 index-BYkotkfZ.js / index-8t-HDpGw.css，因此没有将本次图片假标r6。RV01/02/03实际检查于r7；继承到r8仅基于父线程明确声明的中文copy变化及CSS不变。最终商城、新增代表点实际读取r8 index-BSpOlTnk.js / index-8t-HDpGw.css。未合并或审阅后到的origin/test fb301913。

使用可见控件切换语言、尺寸、主题和错误场景，真实滚动到团队摘要卡；Enter触发排行重试。截图采用完整预览范围，保留控件上下文。未修改产品DOM或CSS。

## 独立分数

| 项目 | 分数/10 | 证据与范围 |
| --- | --- | --- |
| RV01 团队账本重试 | **9.2** | r7：320×693越文浅色、390×844中文暗色，13px/600/20px，约44×44，右侧完整无挤压；r5的12/400/18缺陷关闭。 |
| RV02 团队摘要重试 | **9.1** | 同上两格，实际滚动目检。本体和真实span均13/600/20，高约44，越文宽约57/中文约44。保持既有小卡纵向布局。 |
| RV03 消息顶栏重试 | **9.2** | 同上两格，.message-summary-recovery .message-button及span13/600/20，高约44，越文宽191.88/中文261.60，未碰撞左右导航。alert壳16/400并非可见按钮文字，不据此误报。 |
| 商城320中文标题/说明 | **9.2** | r8浅色：信息暂不可用、选择已保留，重试后确认。各占一行；右侧重试13/600/20，约89×44，列距约12，无横溢。r7正文“认。”孤行旧图保留，不追认为r8。 |
| 新增代表：排行榜读取失败重试 | **9.2** | r8，320越文浅色，dataState=error、排行榜入口稳定到达。leader-retry-label及span13/600/20，按钮约287.87×47.99，越文完整。Enter后仍为该页失败反馈，不声称恢复成功。箭头/按钮壳的旧14/500不当成重试文字字体。 |
| 新增代表：免费试用详情读取失败重试 | **8.8，未通过** | r8，320越文浅色，dataState=normal、trialState=read-error、免费试用详情。本体和span均13px/**400/normal**，未达600/20；约287.87×43.99触区，无横溢。 |
| 本轮可见底部Liquid Glass | **9.2，限定范围** | r7团队两格、r8商城320的导航光学保留；稳定读取strategy=svg及SVG层。消息/试用/排行为二级页，不要求增加底部导航。这不是全站材质复审。 |

接近44而非十进制恰好44的约43.99几何来自当前布局zoom舍入；商城动作computed min-height/min-width仍44px，不把约0.01px差异误报为触区缺陷。

## 当前唯一P2：RV04-TRIAL

[trial.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/me/trial.vue:353) 的 .trial-read-retry 仍13px/400/normal，本体和末级span实景计算样式一致。只需为此控件补 font:600 13px/20px var(--font-v5)，保留原整页错误态布局及44px触区。本轮未修改源码。修后只补同一读取失败代表帧和文字读回即可，无需重跑已通过矩阵。

## 证据

- RV01：r7-rv01-vi-light-320-full.jpg、r7-rv01-zh-dark-390-full.jpg。
- RV02：r7-rv02-vi-light-320-full.jpg、r7-rv02-zh-dark-390-full.jpg。
- RV03：r7-rv03-vi-light-320-full.jpg、r7-rv03-zh-dark-390-full.jpg。
- 商城历史/最终：r7-store-title-zh-light-320-full.jpg、r8-store-title-note-zh-light-320-full.jpg。
- 新增代表：r8-extra-leaderboard-vi-light-320-full.jpg、r8-extra-trial-vi-light-320-full.jpg。
- 原始DOM读回、指纹、截图清单：runtime-app-r7-r8-visual-a.json。
- 首次r7-rv01-vi-light-320.png裁切偏差，右侧不完整，已由full.jpg替代，不作验收证据。

[r5失败报告保持原样](./review-app-r5-B0RqUdly.md)。手机卡等r5已通过项不在本次重测，不冒称新证据。旧H5候选不因APP局部通过自动升级。

## 未覆盖

新增有效字体代表仅2处：试用、排行。质押在当前场景返回首页、订单未稳定出现所需重试，均未评分、不伪造触发，也不据此新增视觉缺陷。没有检查全部56个源文件或扩大全站矩阵。仅本地原型浏览器；正式Java、H5最终同步、真机/原生安装、真实服务失败恢复未据此签核。没有重建、运行测试、改生产代码或Git操作。
