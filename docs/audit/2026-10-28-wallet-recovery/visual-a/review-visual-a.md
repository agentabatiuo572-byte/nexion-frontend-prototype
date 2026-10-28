# 钱包读取恢复与“我的网络”独立视觉审查 A

> 更新说明：下方首轮 8.4 / OPEN 及旧截图原样保留。`web-closed` 增量复验已将长金额项关闭为 9.2；当前结论见本文末尾“web-closed 增量闭环”。

2026-10-28。本报告由审查者本人使用官方 CUA 在独立 Chrome 标签操作并目检截图。只使用 5291 代理及其专属 5290 上游；未操作 5237，未改生产源码、构建或提交。结论是：五处读取恢复 UI 达到本轮视觉门槛，最终包“我的网络”两尺寸达到门槛；**320 长余额仍有 P2，8.4/10，不能整体签成全部通过。**

**版本与证据归属**

- 源工作区：`uvel-design-20261028-integrate`，开始时 HEAD `adce68e84033e15a1559d087c8ae701855018732`，叠加父线程本轮 wallet/me 修改。构建产物才是下面实景结论的版本边界。
- R25 旧固定包：`wallet-r25/web`，实际入口 `index-BpZnWN6Z.js`，入口 SHA256 `b17c7fc7954b2977b303790c819d723c451bc79f4e39bcfa99fa68b23e359ca7`。见[旧包指纹](r25-old-build.json)、[44 条旧包 DOM 记录](r25-old-runtime.json)。
- R25b 最终包：`wallet-r25/web-final`，实际页面入口 `index-BS_Ljxkz.js`，入口 SHA256 `8a007017e65802077437813ede477be051e9fde1fea615672d81fde40f58c728`。最终页面 CSS 为 `me-BqgVI6X3.css`，旧包为 `me-GYhS-1wp.css`。见[最终包指纹及重启核对](r25-final-build.json)、[5 条最终包 DOM 记录](r25-final-runtime.json)。
- 经用户授权，核实 5290 的进程为本轮 PID 7264 后，将演示状态备份到仓外本轮目录，再仅重启该进程到 `web-final`，新 PID 33484。重启前后完整 `state` 序列化比较相等。5291 代理保持运行，且经代理读回最终入口。状态备份未放入此证据目录。
- 旧包执行完整主矩阵：320×693 越语浅色、390×844 中文暗色；额外 320 英文短文案。最终包按父线程限定增量，只复验一次 funds 失败→实际重试恢复，以及 320 VI light / 390 ZH dark 网络四入口；另针对已发现长金额问题做一次最终包确认。未把旧包记录改标为最终包。

**逐项评分（10 分制，每项独立，不能取平均抵消 OPEN）**

| 项目 | 分数 | 结论与实际证据 |
|---|---:|---|
| 资金读取失败卡 | 9.3 | 旧包两套及英文实测；最终包再次通过。[最终错误](r25-final-vi-light-320-funds.png)、[原页点击恢复](r25-final-vi-light-320-funds-recovered.png)、[旧包中文暗色](r25-zh-dark-390-wallet-funds.png)。 |
| 释放明细失败卡 | 9.2 | 旧包实景限定签项；越语两行正文完整、按钮靠右下。[VI](r25-vi-light-320-release.png)、[ZH 稳定帧](r25-zh-dark-390-wallet-release-settled.png)、[EN](r25-en-light-320-wallet-release.png)。最终包未重复此模式。 |
| 累计收益失败卡 | 9.2 | 旧包 overview 与 commissions 两种依赖故障均实际出现，同卡无横溢，两路径均点击恢复。[VI overview](r25-vi-light-320-overview.png)、[VI commissions](r25-vi-light-320-commissions.png)、[ZH overview](r25-zh-dark-390-wallet-overview.png)、[ZH commissions](r25-zh-dark-390-wallet-commissions.png)。最终包未重复两路径。 |
| 提现列表失败卡 | 9.2 | 旧包两套实景限定签项，完整入屏后右下按钮可见，真实重试恢复。[VI](r25-vi-light-320-withdrawals-visible.png)、[ZH](r25-zh-dark-390-wallet-withdrawals.png)。最终包未重复此模式。 |
| 本页订单读取失败条 | 9.2 | 旧包两套及英文实测，文案左侧换行、按钮占右槽，未挤压或截断。[VI](r25-vi-light-320-orders.png)、[ZH](r25-zh-dark-390-orders.png)、[EN](r25-en-light-320-orders.png)。最终包未重复此模式。 |
| 普通 / 零 / 未知余额显示 | 9.2 | `$52,800.64`、`$0.00`、`$—` 含义区分且完整。零值两尺寸为旧包；普通及未知在最终包资金恢复链复核。[320 零](r25-vi-light-320-balance-zero.png)、[390 零](r25-zh-dark-390-balance-zero.png)、[首次未知](r25-vi-light-320-funds-unknown.png)。 |
| 长余额显示 | **8.4** | **P2 OPEN：最终包 320 小数部分断行。** [最终复现](r25-final-vi-light-320-balance-long-open.png)。390 同金额单行正常，[旧包 390](r25-zh-dark-390-balance-long.png)，不能据此关闭 320。 |
| “我的网络”320 VI light | 9.2 | 最终包四入口完整，标签 12px/500/16px，副文案 12px/400/16px；每格 138×52，双列间隔 12px，最长副文案未截断。[实景](r25-final-vi-light-320-network.png)。 |
| “我的网络”390 ZH dark | 9.3 | 最终包标签 13px/500/18px，副文案 12px/400/16px；每格 173×52，层级与相邻分组标题有区分。[实景](r25-final-zh-dark-390-network.png)。 |

**按钮几何与真实恢复结果**

实测所有被评分读取恢复按钮均为 `13px / 600 / 20px`，computed font-family 使用 `var(--font-v5)` 所解析的字体栈。越语按钮 65×44px，中文 50×44px，英文约 58.063×44px；`::before` 上下 inset 各 6px，实际可见面高 32px。钱包四处卡片的点击区距卡片右、下内边均 12px；订单条为右槽底部对齐。卡片实测 `scrollWidth === clientWidth`，文字与按钮没有相交。见[逐条几何摘要](retry-geometry-summary.json)。最终资金卡再次读回 13/600/20、65×44 与 32px 面。

操作方法是：设置指定代理模式→刷新→通过外侧真实预览控件进入 `/pages/me/me`、选择尺寸/语言/主题；确认目标错误后将代理设为 off，再直接点击该卡实际“重试”，未用页面刷新代替重试。主矩阵中 funds、release、overview、commissions、withdrawals、orders 六路径都成功移除目标错误。最终包 funds 重试后等待实际金额节点出现，再确认 `$52,800.64`。这只是本地合成 GET 503 的恢复证明，不扩展为真实后台业务正确性审查。

**P2：320 长额拆开小数，最终包仍未关闭**

模式 `balance-long` 通过本轮允许的只读代理返回余额 `1234567890.12`，没有写上游业务数据。在最终包 320 VI light，金额总区域为 `(x32, y216, w256, h79.188)`；数字节点为 `(x51.698, y216, w236.302, h79.188)`。画面第一行显示 `$1,234,567,890.`，第二行仅 `12`。这是实际视觉可读性缺陷，不是横向溢出或数值丢失，也不是最终网络 CSS 新引入；旧包及最终包均复现。

旧包详细 DOM 读回数字 `36px / 650 / 39.6px`、`overflow-wrap:anywhere`、`white-space:pre-line`，[详细证据](r25-long-amount-finding.json)；最终包数字仍两行且高度相同，见最终 runtime。最小修法是让长金额按可用宽度缩小并保持数值整体单行；短金额字号保留。只加 nowrap 会转为溢出，不能单独作为修复；不要截尾、隐藏小数或改变金额。修后需仅补 320 相同长额和一例普通金额，不需要重跑旧错误矩阵。

**不作为通过依据的记录**

- `r25-vi-light-320-withdrawals.png` 是首次滚轮过冲、目标卡未完整入屏的截图；采用后续 `withdrawals-visible.png`。曾有一次关闭故障后提现卡在点击前自动消失，该次不计点击成功；已另做实际点击，记录为 `r25-vi-light-320-withdrawals-click-recovered`。
- `r25-zh-dark-390-wallet-release.png` 是入场透明度过渡帧；采用后续 `wallet-release-settled.png`。
- `r25-en-light-320-wallet-withdrawals.png` 文件名含 light，但截图与 DOM 实际为暗色；只保留为英文暗色补充，不计英文浅色。英文浅色补充由 funds/release/overview/orders 提供。
- 初次 funds 恢复及 overview 的个别 DOM 读取先于截图稳定，已有明确 `-settled` 记录；其它即时 `-recovered` 只证明目标错误消失，不声称所有无关请求同时完成。[排除及时间说明](evidence-notes.json)保留这些事实。

**未覆盖与收尾**

本轮仅本地 APP 源码的浏览器原型视觉；未验证正式登录/JWT、真实资金接口、写交易、真实设备触控/软键盘、APP 原生安装、独立 H5 交付，也不签全站。没有通过 storage/store 人造界面；只用外侧 UI、授权代理模式和正常滚轮/点击。未做业务状态写入。

最终已将 5291 模式恢复 off，关闭本人 Chrome 标签；保留 5290（新 PID 33484）及 5291 服务。源码与父线程正文未改。当前唯一明确视觉 OPEN 为上述长额 8.4，其他分数均受本报告版本、页面及矩阵边界限制。

**web-closed 增量闭环（2026-10-28，保留前述失败历史）**

父线程将长金额补包 `wallet-r25/web-closed` 发布到现有 `web-final` 后，本人重新建立独立 Chrome 标签复验，未重启服务。经 5291 实际读到的入口及每条浏览器 DOM 均为 `index-CZ5ylXPm.js`，SHA256 `24aeb6a2ec24699bddf93e29c4b0e140ada1e037554d9abd8d7f3543e64fd22b`。已比较入口 HTML、该 JS 和公共 CSS：发布根与固定 `web-closed` 根的 SHA256 相等。[补包指纹](r25-closed-build.json)、[7 条补验 DOM 记录](r25-closed-runtime.json)、[代理模式记录](r25-closed-modes.json)。

| 增量核验 | 当前分数 | 实际结果 |
|---|---:|---|
| 320 长金额 | **9.2，原 P2 关闭** | `$1,234,567,890.12` 完整单行；数字字号 23.5294px，行高 25.8824px，实际数字框约 169.938×25.875px，`white-space:nowrap`，未截尾或溢出。总金额区仍为 x32–288，实际高度由旧 79.188px 降至 25.875px。[新图](r25-closed-vi-light-320-long.png)。 |
| 320 普通 / 零 / 未知 | 9.2 | `$52,800.64`、`$0.00`、`$—` 均保留数字 36px / 650 / 39.6px，总金额区高 39.594px，未因长额适配缩小普通数值。三者实测总区域 clientWidth/scrollWidth 均 256/256。[普通](r25-closed-vi-light-320-normal.png)、[零](r25-closed-vi-light-320-zero.png)、[未知](r25-closed-vi-light-320-unknown.png)。 |
| 资金读取错误恢复 | 9.3 | 补包 `wallet-funds` 后刷新，仍显示未知而非 0；卡片按钮仍为 13px/600/20px、65×44px 点击区、32px 面。关闭故障后真实点击“Thử lại”，错误消失并等待读回 `$52,800.64`；记录 `r25-closed-vi-light-320-unknown-recovered`。 |
| 网络四入口 320 VI light | 9.2 | 四格仍各 138×52px，标签 12px/500/16px、副文案 12px/400/16px，全部完整，scrollWidth=clientWidth，无回退。[新图](r25-closed-vi-light-320-network.png)。 |
| 网络四入口 390 ZH dark | 9.3 | 四格仍各 173×52px，标签 13px/500/18px、副文案 12px/400/16px，全部完整，scrollWidth=clientWidth，无回退。[新图](r25-closed-zh-dark-390-network.png)。 |

本次只有上述补验；释放明细、累计收益、提现列表、本页订单四项维持前轮各 9.2 的既有范围，没有在新包重跑或把旧记录改标为新包。320 长额 8.4 的原判断、失败截图和原因保留；关闭依据是补包真实画面和完整数值 DOM，不是源码声明。新增长额视觉充分可读，普通数值和钱包原有层级保持，未发现本次已覆盖范围内新的阻断。

此次新增 6 张截图、7 条 DOM 记录。只使用授权代理 GET 模式和真实预览 UI，未改 storage/store、生产源码、测试、构建或父线程正文。结束时再次恢复 5291 为 off，关闭本人新增标签，5290/5291 服务保留。此前正式服务、真机、原生安装、独立 H5 和全站未覆盖边界继续有效；本轮签项不能扩展到这些范围。
