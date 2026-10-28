# R9 合并后限定独立视觉复验 A（冻结）

冻结时间（UTC）：2026-10-27T10:57:22.181Z。

实际入口 index-Dj39Z2mj.js；全局样式 index-8t-HDpGw.css。父线程声明源码提交 e58039e57c9cc5192cc3fe5642b9ecac5564dce9（含合并a3bc695f）。本评审通过当前DOM核实入口及实际加载的动态样式，不以同一个全局CSShash推断组件未变。

只使用本人新建的5254/preview、官方CUA Chrome4 / tab 1733372904。本轮IAB不可用，按既有授权回退到独立Chrome任务标签。未动5237、5249或其他代理页面；未改产品源码、构建、测试或Git。

## 已完成的原约定范围

| 维度 | 分数/10 | 现场证据 |
| --- | --- | --- |
| trial-read-retry字体 | **9.2** | 390中文暗色及320越文浅色，本体和真实span均13px/600/20px。前者358×44，后者288×44。r8的13/400/normal缺陷在Dj39关闭；旧8.8报告原样保留。 |
| 普通/试用行列对齐（仅列几何） | **9.2** | Earn两代表均88px行高：390图列x30/标题x92；320图列x28/标题x78，与普通设备一致。设备管理两代表均约64.20px行高，三行名称左缘x84.67、图40px。此分只认列对齐，不能覆盖用户新提出的字号/视觉体量要求。 |
| 展开内容归属 | **9.1** | Earn真实点击试用/S1：试用开时两普通设备关；切S1后trial关、S1开、Pro关，符合该页单项手风琴。管理列表试用展开后普通行保持关；390再开device:41时trial仍开、Pro仍关，符合该列表独立展开。没有把“可同时开”误套到Earn，也没有串出另一设备详情。 |
| 异常展开右槽/触区/恢复 | **9.2** | 390中文暗色Earn：右重试44×44，与copy间12px；320越文浅色管理列表：57×44、间12px，文字13/600/20，无横溢。恢复请求后实际点击各自重试，行回到在线、重试消失。只为本地受控读取失败，不等于正式后端。 |

详情/紧凑行的主题与语言由当前html/data-theme和预览控件读回确认；记录中的文档横向溢出为0。Earn底部Liquid Glass在此次图片中保留，不重评此前完整材质矩阵。

## 用户新增：现阶段重新OPEN，不能用以上9.x覆盖

- **窄屏展开双按钮协调性：8.7 / 未通过。** 320越文的“Chi tiết dùng thử”换为两行，双胶囊体量明显偏大；r9-earn-trial-expanded-vi-light-320.jpg与r9-inventory-trial-expanded-vi-light-320.jpg均保留。应在Earn和设备管理这两处同组件展开区协调按钮视觉尺寸，同时保留最小44触区；新构建再验。
- **小屏设备标题/剩余时间自适应：8.8 / 待修。** 已有Earn320读回标题仍15px/600/21px，与390相同；剩余时间在320断为两行。该密度不符合用户新增的缩小要求。设备管理本身为13px标题，不能用它替Earn的15px通过；两变体应分别检查新窄屏规则。
- **小屏顶部Logo：OPEN，未给独立分数。** 本次未对完整未滚动小屏顶栏做专门尺寸验收，不凭滚动经过的残留Logo或源码给通过。待父线程修订后的对应320帧检查Logo与两侧控制的比例。

因此只签上述字体、列几何及具体开合/右槽机制；**新的窄屏视觉规格尚未关闭，R9不能作为所有新需求通过或H5放行依据**。本次不追加新矩阵，停在用户要求的冻结点。

## 异常如何真实触发及边界

预览trialState=read-error会重载iframe，使新组件没有已成功读取的试用快照；这不能假充“已载入行的展开读取失败”。本评审先经可见控件载入active数据、真实展开行，再仅在本人标签用官方CUA CDP临时阻断5254/api/trial/*。实际App轮询产生Network.loadingFailed（inspector），已存在行显示未知和重试。清除阻断后真实点击重试，恢复在线。没有改DOM、注入假文字或调用内部store。网络拦截已恢复。

有效异常代表是390暗色Earn、320浅色设备管理；不是这两变体与所有尺寸的完整交叉矩阵。普通/收起布局和展开内容则两页、两代表均有实际操作。

## 实际动态样式

- trial-device-row-13hvJ5MK.css
- trial-Cr6VJnLf.css
- earn-tqi31ymS.css
- devices-D0vzKSD2.css

## 图片与冻结数据

完整截图清单、SHA256、DOM/几何/字体/aria状态与每次实际入口见 [runtime-r9-visual-a.json](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/merge-r9-visual-a/runtime-r9-visual-a.json)。主要图片：

- 字体：r9-trial-read-retry-zh-dark-390-settled.jpg、r9-trial-read-retry-vi-light-320.jpg。
- 对齐：r9-earn-collapsed-zh-dark-390.jpg、r9-earn-collapsed-vi-light-320.jpg、r9-inventory-collapsed-zh-dark-390.jpg、r9-inventory-collapsed-vi-light-320.jpg。
- 展开：r9-earn-trial-expanded-zh-dark-390.jpg、r9-earn-normal-expanded-zh-dark-390.jpg、r9-earn-trial-expanded-vi-light-320.jpg、两张inventory-trial-expanded对应图。
- 异常：r9-earn-abnormal-retry-zh-dark-390.jpg、**r9-inventory-abnormal-retry-vi-light-320-error-frame.png**。
- 排除：最初r9-trial-read-retry-zh-dark-390.jpg实际为控件异步刷新回首页，未作字体证明；r9-inventory-abnormal-retry-vi-light-320.jpg捕到下一次loading过渡，仅用error-frame.png证明失败态。旧帧不覆盖、不冒充稳定失败图。

[r8的8.8失败记录](../../2026-10-27-unified-delivery/retry-visual-a/review-app-r6-r8-BSpOlTnk.md)保持原样。本报告只替r9已实测旧缺陷加复评，不抹掉历史。测试109/types由父线程执行，本评审未重跑。正式Java、真机安装和H5最终同源回归均未据此签核；没有执行购买或取消试用。
