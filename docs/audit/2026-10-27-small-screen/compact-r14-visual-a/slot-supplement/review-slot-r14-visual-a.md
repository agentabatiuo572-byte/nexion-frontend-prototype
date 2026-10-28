# R14 Slot 补充：独立视觉 A

2026-10-27T13:08:05.773Z，官方CUA Chrome4，自有5264→5254只读代理，320VI浅暗。运行入口 **index-CpjEudmG.js**。仅面板页面/尺寸/语言/主题及slot打开/关闭/遮罩；未改数据场景、未点激活/购买、未写生产代码。

| 项目 | 分数/10 | 证据与边界 |
| --- | --- | --- |
| 打开、关闭/取消 | 9.2 | 两主题从赚取“添加设备”真实打开；点Đóng后dialog0；再次打开点sas-backdrop后dialog0，均仍/pages/earn/earn。当前没有独立取消按钮，不能虚构第三种控件。 |
| 热区/安全距离/排版 | 9.2 | panel320×302.25，稳定top391.08；close44×44，右距16。底部库存行bottom655.33，距693.33底部38px；无横溢。标题/两行说明不压关闭，normal inventory1可见，但未点击。 |
| **浅色材质与说明可读性** | **8.6 P2 OPEN** | 稳定截图说明直接落在灰遮罩上。panel及before透明；实际--nx-glass-fill为空，说明rgb106,110,119。不是刚打开未settled。关闭/安全区通过不能盖过材质失败。 |

## 唯一具体P2与最小修法

[slot-action-sheet.vue:233](../../../../../src/components/slot-action-sheet.vue#L233) 的 background:var(--nx-glass-fill) 依赖变量；实际DOM class仅sas-panel、变量值为空，computed background为透明。

[glass-surfaces.css:2](../../../../../src/styles/glass-surfaces.css#L2) 的token定义只作用于nx-glass-hero/sheet/action等明确选择器，本panel未opt-in。该结构解释了浅色面板无底材、灰说明在灰遮罩上难读；暗色可见不代表变量正确。

最小候选：该panel显式采用共享sheet玻璃类，或局部定义匹配现有主题的fill；核对本地16px上角/animation/38px底部padding不被覆盖。不全局改玻璃token、不取消底部Liquid Glass、不仅把说明文字变黑掩盖缺材质。新构建只需320VI浅暗同一sheet截图+44读回，不需重复所有历史矩阵。

- [浅色稳定失败图](./r14-slot-vi-light-320-settled.png)
- [暗色正确主题记录](./r14-slot-vi-dark-320-open-confirmed.png)
- [取消后仍赚取](./r14-slot-vi-light-320-cancelled.png)
- [完整运行索引](./runtime-slot-r14.json)

原r14“slot无fixture未验”是当时事实，现仅由本补充覆盖布局/关闭/取消范围。**激活成功仍无模拟写入，未签，也未实际点击激活。** 只读代理的响应改动不是正式后端库存生命周期证明；未物理手机安装。

首次截图r14-slot-vi-light-320-open.png实际dark，是本次误标原始记录，排除light验收，不覆写；有效图均带正确主题/confirmed或settled。

## R15准备已读

已读r14-error-card-actions.md：限定实体读取恢复按钮，11个左下/整行候选、9个既有右槽及terms，总21文件范围。现有右槽不强制另起行；只看32可见面/44hit、正常流不压长文。优先terms320VI浅暗、store/bundle目录、reward-published玻璃、wallet/daily/invitequiet代表；无fixture不预签。纯文本恢复、付款/写入/主CTA/整页EmptyState不扩改。r15尚未运行，不给新分。

**本补充冻结；slot浅色材质8.6待修，其余局部9.2。** 本人标签关闭，代理由主线程协调保留/清理，未停止他人服务。
