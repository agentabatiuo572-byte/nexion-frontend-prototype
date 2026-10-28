# 关闭热区 C5 最后补验 · 独立交互 B

**P2-02由8.8复评为9.2，关闭。仅本次两场景局部验收；原未覆盖范围不变。**

- 实际入口 **index-C5I8XvUO.js**，主CSS index-H57LADHv.css；HTML SHA256 **DC5B30AEC3A8A1DD584F538B6A7BE8D8831207F701D236ED6FFC06346925280C**，JS SHA256 **CFAE0A5AD78097F310575C624471D4478B9003C0D2A360625E950229E48E582C**。首尾均核同入口。
- 官方CUA Chrome4，本人5294标签1733373179。不动5237/A5291、不重启服务、不改产品/构建/执行测试/Git。远端test推进及后续rebase/合并不在此包签核范围。

| 局部场景 | 分数/10 | 实测 |
| --- | --- | --- |
| 320×693 VI暗 | **9.2** | 根44×44、flex 0 0 auto，内部30×30 border-box，四周各7px。左/右/上/下距根边1.5px实点，均在30可见面外5.5px；8.8中的收缩已消除。 |
| 390×844 ZH浅 | **9.2** | 同样44根/30面，不收缩；四边真实指针关闭均通过。 |
| 关闭与返回 | **9.2** | 共8次pointer click，捕获到isTrusted=true且目标属于Đóng/关闭按钮，未把点到背景遮罩也关闭当通过。每次dialog=0、route保持/pages/earn/earn、焦点返回earn-capacity-info；390另实测Escape关闭并回焦。未代签物理手机返回键。 |

[320稳定实景](./close-root44-face30-320-vi-dark-settled.png) / [390实景](./close-root44-face30-390-zh-light.png) / [实际点击坐标与目标](./runtime.json)。外圈44px键盘焦点指示不算背景可见面扩大；内部面实读30px。320首张位置未稳定帧只作历史，验收用settled帧和每次点击前的最新几何。

本次未重复火箭、排名、隐私或商城矩阵，沿[主报告](../report.md)既有版本与边界。周期异值fixture、闲置库存激活、真实后端与物理APP等原N/T不变；父线程native/type/test绿为外部提供，不冒称本人执行或安装验证。

初始隐私pressed=false，未在本补验切换；最终仍false。媒体reduce=false、已clear本标签媒体模拟；locale恢复VI、390/light、modal0。Proxy5294 off，关闭本人标签。见cleanup.json。
