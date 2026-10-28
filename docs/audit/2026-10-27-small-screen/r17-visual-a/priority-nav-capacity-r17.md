# R17 优先阶段：独立视觉 A

实际入口 **index-BQJ7beyl.js / index-DPMvPy7r.css**，每条记录保存lazy CSS，未凭全局CSS同名判旧版。官方CUA Chrome4自有5254，未操作用户5237/5251。无产品编辑/构建/测试。

| 项目 | 分数/10 | 结论 |
| --- | --- | --- |
| 新小屏导航 | **9.2** | 320/390×ZH/VI×浅/暗八组合实际目检；320 bar56、hit约55.6×46、SVG实际约25.96（wrapper22），label display:none且完整aria保留；390 bar68、hit约69.6×58、22图标+文字。 |
| 导航点击/短回弹 | **9.2，限定** | 五个路由实际点到，选中current=page正确；只读animationstart捕获nx-tab-select 0.26s/cubic-bezier(.2,.8,.2,1)。另一次受控单击观察只1事件，稳定后未增加。未代签原生touch/reduced-motion。 |
| 底部玻璃/indicator | **9.2** | 实景保留玻璃内缘/透明层，bar与selection均data-glass-strategy=svg、rim/specular各1。HomeIndicator区域仍22高，实际bar底接区域顶、5px指示线可见，无叠压。374/375边界未逐像素扫描，仅320/390实测。 |
| 容量满320VI浅暗 | **9.1** | 双卡138×226.33，Hết chỗ. Giải phóng 1 vị trí.为两行，重复no-payment已无，118×118机图不缩；Quản lý右下32面/44hit，完整管理aria。 |
| 容量满390VI浅 | **9.1** | 双卡173×215.33，新短copy单行；机图118，右下按钮完整。 |
| **容量满390ZH暗** | **8.8 P2 OPEN** | 中文末尾 **位。** 单独第二行，双卡173×233.33；仅两个字符多占一整行，把卡进一步撑高。不能由VI分数或普通available/active覆盖。 |
| 满槽管理入口 | **9.2，限定** | 320VI浅实际点Quản lý thiết bị→/pages/me/devices；不激活/购买。capacity为试用reason mock，管理fleet仍2/6，不作为正式容量生命周期一致性签核。 |

## 唯一返修

只精简嵌入卡中文容量满说明，保留“腾出1个空位”含义，避免390末行“位。”；例如采用更短同义句，必要时局部balance防孤字。保留118图、floor在art内、32可见44命中，不全局缩小字体/图片，不改其他状态。最小复验只需390ZH暗+320ZH代表，VI已证范围不重做。

[中文失败帧](r17-capacity-full-zh-dark-390.png) / [越文320浅](r17-capacity-full-nav-vi-light-320.png) / [越文320暗](r17-capacity-full-nav-vi-dark-320.png) / [越文390浅](r17-capacity-full-nav-vi-light-390.png)。

[阶段原始读回](priority-nav-capacity-runtime-r17.json)。用户旧容量PNG在本线程未给附件或路径，本报告按已明确批注与自有实景判断，不冒称逐像素对照原用户图。

只读动画观察器已移除。raw CDP Animation.enable不受当前工具支持，未作为产品问题；改用document animationstart临时观察，已真实捕获且清理。所有分数独立，不借B或源码分。后续320VI grace/ended/converted、Ref/390wallet及最小只读卡仍未由本阶段签完。
