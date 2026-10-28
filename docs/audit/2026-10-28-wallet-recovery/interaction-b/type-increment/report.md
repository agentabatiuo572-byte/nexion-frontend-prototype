# 响应式列表字体：独立增量审查 B

**READY；仅本次新增列表/section/profile及所列共享组件已实测范围，各项≥9，未发现未修P2。追加developer-loading为N/T，不签。** 旧钱包恢复不重跑、不重签；本轮只quick长金额。

## 包与方法

- 实际5294→5293，官方CUA Chrome4，本人新标签1733373110；内置IAB当次不可用后沿官方CUA Chrome。没有操作5237/A5291、清storage、造store/DOM、修改产品、构建、测试或Git操作。
- 每档读回同一入口 **index-DDUUBFKu.js**，末次读回仍一致；主CSS **index-gu3lZQtt.css**。入口SHA256 **E159FF20C2BE1F6C4759F1A879AA318EA00DB319FABA4BAFF54025C44DE3D69C**。涉及lazy CSS包括nx-list-row-Wr_g_i_N.css、nx-section-DKnURi4h.css、me-DxUOriDN.css，不能只凭主CSS名推断。
- 源树读回HEAD312b10fb89a326dc6b0f14a8aa223e38ba3ef7de及父线程WIP；源码指纹与实际DOM/图片SHA见[runtime.json](./runtime.json)。工作树不是clean发布commit，不把HEAD单独当构建证据。
- 用页面现有尺寸、语言、明暗选择器及原页面控件；实际滚动，原click/Enter/Space验证入口。320×693、360×780越文各明暗，390×844越文浅/中文暗；没有扩大到全站、全部边界或所有语言组合。

## 逐项分数

| 新增项 | 分数/10 | 证据与限定 |
| --- | --- | --- |
| 320下半屏列表 | **9.2** | 主13/18、右摘要12/16，列表56px；两主题越文实拍。客服主文/摘要自然各两行，仍完整在各自列内，不互叠。横溢0。 |
| 360下半屏列表 | **9.2** | 主14/20、摘要12/16，常规56px，最长客服行约56.67px随内容自然生长；两主题无裁重音/叠字。 |
| 390标准对照 | **9.1** | 主15/20、区块15/20；右摘要保留独立12px角色，现有line-height16.8px，比规范16多0.8px，实景无挤压/裁切，记录为非阻塞差异。 |
| section响应式层次 | **9.2** | 320/360为14/20，390为15/20，weight600；与列表主字有清晰层次，长越文标题完整。 |
| profile昵称与入口 | **9.2** | 320/360/390字号18/19/20px；实际Alex完整，360触区328×64，Enter进入/pages/me/profile。行高仍是组件normal（读回可见高24/26/26.67），不冒称已消费规范全部昵称行高。未造超长昵称。 |
| 长VI触区与入口 | **9.2** | 列表根56或64px，均≥44；主题Enter打开Giao diện弹层且原关闭可用；语言Space→/pages/me/language；客服click→/pages/me/support；偏好click→/pages/me/preferences；FAQ Enter→/pages/me/help。无保存设置、发消息等业务写入。 |
| 非Me共享nx-list-row | **9.2** | 商城320实拍主13/18+副12/16、68px根；390读回主15/20+副13/18，78px根。Space→/pages/genesis/genesis，无购买。团队320另实拍共享行，既有页面覆盖主14px/副12px保留；Enter→/pages/team/tree。不把团队特例宣称统一成13。 |
| 长金额quick回归 | **9.2，限定** | 5294只读balance-long，320VI浅完整1,234,567,890.12单行23.5294px、nowrap、横溢0；重复Range矩形同y而非换行。随后mode off，末次正常余额52,800.64。六来源恢复沿旧报告，不在此重跑。 |

## 代表实景

- 320：[浅色下半屏](./me-320-vi-light-lower.png)、[暗色下半屏](./me-320-vi-dark-lower.png)、[浅昵称](./me-320-vi-light-profile.png)、[暗昵称](./me-320-vi-dark-profile.png)。
- 360：[浅色列表](./me-360-vi-light-lower.png)、[暗色列表](./me-360-vi-dark-lower.png)、[浅昵称](./me-360-vi-light-profile.png)、[暗昵称正确可见帧](./me-360-vi-dark-profile-visible.png)。
- 390：[越文浅色列表](./me-390-vi-light-lower.png)、[中文暗色列表](./me-390-zh-dark-lower.png)、[中文暗昵称](./me-390-zh-dark-profile.png)。
- 实操：[主题Enter弹层](./me-320-vi-light-theme-sheet.png)、[商城共享列表](./store-shared-320-vi-light.png)、[团队共享列表](./team-shared-320-vi-light.png)、[长金额quick](./wallet-quick-long-320-vi-light.png)。底部LiquidGlass和indicator在这些实际画面中保留，不据此代签全套导航行为。
- me-360-vi-dark-profile.png当时保留了下半屏滚动位置，文件名不代表实际可见profile；仅作lower佐证，正确昵称采用另存visible帧。语言页截图请求曾超时，无保存图即不声称有该图；语言路由由实际Space/DOM读回证明。其他两张settings命名帧仅按实际画面计覆盖，不用于虚构完整同屏。

## 390右侧摘要澄清（保留历史判断）

初测看到右侧摘要12/16.8而非给定“副13/18”，曾先报条件性8.8。随后读取D:/WORKS/PLAN/uvel-docs/design-system/10-responsive-type.md 10.1：**列表副说明**与**辅助数值/右侧摘要**是不同角色，后者各档12/16；10.4也明确昵称行高尚非全部落地。故撤回把右侧摘要按13px评8.8的假设，**不是代码已修**。原12/16.8读回和上述0.8px非阻塞差异均保留。真正副说明已在商城390确认13/18。

## 范围边界

- 本报告只关闭所列新增字体/布局与采样入口；不是整个Me或全站全部通过。
- 正式后端、新业务、付款/注册、H5发布、物理APP/真机、系统字体放大、字体失败回退及339/340等全部边界未测；不拿本地合成UI分数代签。
- 没有改旧钱包report及失败历史。新的恢复矩阵沿[上一轮报告](../report.md)，本轮只新增此附录目录。
- 收尾要求：5294代理off，关闭本人1733373110；不停止服务、不重置演示数据。实际结果见cleanup.json。

## ui-text-body两消费者追加（同包，不重跑主体）

用户补充作用范围后，仅另建本人标签1733373121验证首页，未切演示数据场景。入口首尾仍index-DDUUBFKu.js。

| 增量 | 分数 | 实际证据 |
| --- | --- | --- |
| 首页待办标题与入口 | **9.2** | 320VI暗标题13px/20、360VI浅14px/20，weight500；本地自然已有quest行，根78px、越文完整、横溢0。360原Enter实际进入/pages/missions/missions。未领取签到/奖励、未购买。 |
| developer-loading | **N/T，不签** | 源码确认使用--ui-text-body，但未取得稳定实际loading；本轮没有人为延长加载、注入DOM或以短暂文字闪现冒充稳定验收。 |

[320待办实景](./home-action-320-vi-dark.png) / [360待办实景](./home-action-360-vi-light.png) / [原Enter目的页](./home-action-360-vi-Enter-missions.png) / [新增读回](./home-body-addendum-runtime.json)。原生滚动后个别瞬时y坐标早于滚动稳定，未用其宣称与后续截图同帧；标题字号、根高度和最终可见帧独立留证。

追加完成后5294再次off；关闭本人3121。主体3110已关闭、原分数不变。真实服务/物理APP及开发者loading仍不在本轮已签范围。
