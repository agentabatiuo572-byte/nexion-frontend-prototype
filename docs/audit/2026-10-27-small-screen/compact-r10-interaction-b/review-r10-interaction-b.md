# r10 窄屏增量交互复审 B — 冻结 / READY

**已完成的 7 文件窄屏新增项最低 9.3/10，可保留本构建归属。底部导航新增问题单列 OPEN，暂记 8.8/10，整体验收仍待 r11。父线程可以开始 r11 重建。**

本报告不将 r9 的通过分数用于新增要求，也不将 r10 的 Logo、按钮、字体通过结论用于尚未修复的导航文字问题。

## 候选与证据

- 实际入口：**assets/index-vv3sJnOr.js / assets/index-8t-HDpGw.css**。11 张截图各自保存入口读回，均为 vv3sJnOr。
- 入口 SHA256：`3CFC0186DC93D3BBDFEFDCB7655F8AD225C13A20DEF7BA722E78FDD2E3199345`。
- 主 CSS SHA256：`EF9523A26C7D0E928999D9D89308A117969D2542595DCF9A019CB944651D9FAC`。
- 实载动态 CSS：`app-chassis-BYVbGD9Q.css`、`trial-device-row-CrNa4nU3.css`、`earn-CIyLOhln.css`、`devices-DgEM7_Yk.css`、首页 `index-CQ7Qd8Rs.css`；没有从主 CSS 一致推断动态组件未变。
- 7 文件为 app-chassis.vue、trial-device-row.vue、trial-fleet.ts、home/device-row.vue、earn/device-card-pc.vue、me/device-inventory-row.vue、earn/empty-slots-hint.vue。完整源码与实载资源 SHA256 见 [artifact-fingerprints-r10.json](artifact-fingerprints-r10.json)。
- 独立 CUA 标签 1733372909，**owned port 5252**，仅自己的本地 mock。父 QA、其他审查端口及用户页面未操作。
- [运行态 JSON](runtime-evidence-r10.json)包含 11 帧、每帧尺寸/字体/伪元素/触点读回及实际导航和禁止购买操作记录。

## 各新增需求评分

| 新增需求 | 分数 | 实际证据与结论 |
|---|---:|---|
| 小屏顶部 Logo 缩小，右上控件保留 | **9.4** | 320 越文浅色和中文暗色：父槽及 BrandLockup 同为 **112×39px**，x16/y8.5；搜索、消息均 **44×44px**。390 中文暗色 Logo 保留 **146×50px**，右上按钮仍 44×44。字标完整、比例正常，没有侵入右侧控件。 |
| active/grace 双按钮缩为紧凑胶囊 | **9.4** | 320 越文 active：详情目标 **64.95×44**、购买 **93.49×44**，伪元素可见高度均 **32px**；grace 购买 **133.58×44**，可见仍 32px，长文案单行。390 中文 active/grace：详情 **50×44**、购买 **95.06×44**，可见均 32px。按钮不再撑满两半。 |
| 设备名称、剩余时间、状态自适应 | **9.3** | 320 Home/Earn 名称 **13px**，状态 **11px**；试用 remaining **12px**，General Sans 字体族，已无等宽字体。Home 试用与普通机型名同 x92.67；Earn 同 x78。320 管理页试用/普通名称 **12px**、状态 **11px**、remaining **12px**；三条标题行均高 **64px**。390 Earn 保留名称 **15px**、remaining **14px**、状态 **12px**；管理名称 **13px**、remaining **13px**，三条标题行均约 **64.20px**。无文案重叠或文档横向溢出。 |
| 添加设备字号与盒模型 | **9.3** | Earn 320 **13px**、按钮 **260×44px**；390 **15px**、**330×44px**，实测 border-box，没有 padding 将目标高度撑大。 |
| 44px 热区与禁止购买边界 | **9.4** | 实际点击 320 越文详情按钮 **y+2px**，位置在 32px 可见胶囊上沿之外，成功进入试用详情并返回；完整 aria-label 仍为“Chi tiết dùng thử”，可见文字为“Chi tiết”。异常态购买 aria-disabled=true，点击相同外沿后 URL 仍为 Earn，窗口内没有业务写入，只有 analytics。grace 按钮仍进入含抵扣信息的详情，未执行支付。 |
| 底部导航文字溢出选中底座 | **OPEN / 8.8** | 用户新增反馈为 **320 越文浅色标签溢出选中底座**。B 已保存该语言/主题导航截图，但本轮未完成五个选中态的边界量化；8.8 是此新增问题的跟踪分，不伪称已量化复现全部五态。**不继承先前导航通过分，也不签该项通过。** 等 r11 字号/字重/布局修复后限定复验。 |

底部 Liquid Glass 材质、圆角底座和当前选中视觉在已保存图片中仍可见；Home→Earn 的底部导航实际点击可达。此材质观察不能替代新增导航文字布局验收。320 导航根尺寸为 296×68、390 为 366×68，但根尺寸正确不等于各标签都落在选中底座内。

## 关键操作与边界

- 实际代表范围：**320 越文浅色、390 中文暗色，另 1 帧 320 中文暗色**。按允许选项使用了 320 暗色补帧；**351–374 / 360 English 的 124×43 档未作实景评分**。
- 320 active 详情外沿触点为页面坐标约 **448.47 / 552.83**；触区 44px，可见胶囊从目标上沿 6px 后开始。点击后为 `/pages/me/trial`，再经实际返回按钮回 Earn。
- 为检查禁止购买，在自己 5252 的 `/__demo/state` 控制接口设置 read-error，保留当前已确认设备行，由应用正常轮询触发；没有注入应用 store 或改 DOM。异常数值显示“—”、购买禁用。点击禁用按钮后没有订单、试用转换等业务写入。
- grace 控制同样来自自己 mock，按钮“ Mua với khấu trừ ”仍导航至抵扣详情；没有再次穷举购买/付款。最后 mock 恢复 active/normal。
- 滚动帧中屏外或位于固定导航之后的控件 hit=false 仅反映该帧位置；44px 外沿操作使用完整显示的详情目标，不以屏外测量冒充触控失败。

## 冻结截图

1. [390 中文暗色首页 Logo](01-home-logo-zh-dark-390.jpg)
2. [320 越文浅色首页设备字体](02-home-fleet-vi-light-320.jpg)
3. [320 越文 active 紧凑双按钮](03-earn-active-pills-vi-light-320.jpg)
4. [320 越文异常禁止购买](04-error-purchase-blocked-vi-light-320.jpg)
5. [320 越文 grace 按钮](05-earn-grace-pills-vi-light-320.jpg)
6. [320 越文浅色顶部 Logo](06-earn-logo-top-vi-light-320.jpg)
7. [320 越文管理行对齐](07-inventory-align-vi-light-320.jpg)
8. [390 中文管理行对齐](08-inventory-align-zh-dark-390.jpg)
9. [390 中文 grace 按钮](09-earn-grace-pills-zh-dark-390.jpg)
10. [390 中文 active 按钮](10-earn-active-pills-zh-dark-390.jpg)
11. [320 中文暗色 Logo 补帧](11-earn-logo-top-zh-dark-320.jpg)

截图为 CUA 原始 JPEG；390 使用完整预览视口，手机真实尺寸仍为 390×844。曾出现截图晚于 DOM 更新的帧，08/09 已用截图与 DOM 一致的最终帧替换，未用旧画面签分。

## 后续交接

本轮没有剩余实景缺项，**READY，允许父线程 r11 重建**。r11 范围为五个导航选中态及点击、新增 8 处重试文字；不得把上述 r10 已完成项扩成全量重跑，也不得以相同主 CSS 哈希替代动态资源读回。

仅此目录新增报告/截图/JSON；未改产品源码、未构建、未运行测试、未 commit/push。父线程提供的源码审查 15 文件 9.1、测试/type/build 通过不列为 B 独立执行结果。旧 r9、r8、8.8 历史记录保留。5252 服务保留，自有临时标签关闭。H5 继续等待最终同源构建的限定实景验证。
