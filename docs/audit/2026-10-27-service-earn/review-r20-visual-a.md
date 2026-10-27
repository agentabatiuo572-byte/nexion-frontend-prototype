# R20 独立视觉审查 A — LIVE BROWSER

2026-10-27。本次重新对照获批原图，不继承 R19 三卡的 9.x 结论。**最终入口为 `assets/index-Bxu7X-7j.js`，GPU 孤字/孤词 P2 已经独立 LIVE 增量复验关闭。** 手机、质押以及未变的按钮交互沿用 READY3 / `assets/index-CkMCrJTe.js` 的实测证据；本次只复验 GPU 文案，不追认旧截图为新包。最终增量记录见文末。

| 卡片 | 独立分数 / 10 | 当前结论 |
| --- | ---: | --- |
| 手机算力 | 9.2 | 本地浏览器范围接受；沿用 READY3 证据。原屏幕发光方块、金属环、底座亮边和落地反光保留；CTA 原生可操作。 |
| 质押 | 9.2 | 本地浏览器范围接受；沿用 READY3 证据。玻璃立方体、银币、角点/棱线发光与地面反光保留，明暗主题对应正确。 |
| 共享电脑算力 | 9.2 | 本地浏览器范围接受。保留 READY3 材质/交互证据，并以 Bxu7X-7j 的中越、390/320、明暗八格实景关闭孤字/孤词 P2。历史8.8及问题证据保留如下。 |

分数为本轮观察到的视觉与排版判断，不是像素相似率，不做平均分。最终上述限定范围内无未关闭的 P0/P1/P2；不代表全站、真实服务或真机全部通过。

## 版本和独立操作范围

- 工作树：`D:/WORKS/PLAN/.wt/uvel-design-20261025-app`。
- 已实际读取的 `earn-way-card.vue` SHA-256：`C576ABDE8A031B75FA61573B9355EB64059119DD0BE8F92BE40BE822B135CE0D`。
- 获批原图：`C:/Users/FL/.codex/generated_images/01a170cf-40d7-73f1-baa2-bd03f7eeb5bf/exec-c853a52e-4909-4ce6-a16f-26b832fc2ffa.png`，1536×1024。
- 原图与 `src/static/img/earn-20261027/design-art.png` 的 SHA-256 均为 `9CB9F6775A878B66F3D3C40BC8B86CB6F840898E9401024AEFE818E82C8D40F1`。文件相同仅证明素材身份；下面的裁切、光效和布局结论另经实际浏览器目检。
- 使用支持的 CUA，在本审查新建隐藏标签中操作。早期自建 5240 标签已关闭；正式 READY2/3 使用独立 `http://127.0.0.1:5242/preview`。未接管主 QA 标签7，未操作用户5237。
- 实际操作页面选择、语言选择、主题切换、手机尺寸、内容区滚动、三张卡的按钮及返回。小屏下继续滚动到 GPU 全卡可见，没有把初始视口外的内容当作裁切缺陷。
- READY3 每格均读取 iframe 实际 `data-theme`、语言文案、宽高及入口脚本。已覆盖 390×844 中文明/暗、320×693 越文明/暗；另复验原碰图场景 390×844 越文。
- 截图由自己的 CUA/CDP 标签现场获取 PNG；手机裁切校正了外层浏览器1.1倍缩放，PNG尺寸为390×844或320×693。它们是屏幕渲染证据，不据此声称逐像素无损复刻原设计。

## 原图必须保留的视觉标志

| 卡片 | 实际检查的标志 |
| --- | --- |
| 手机 | 倾斜黑色手机、屏幕发光方块、金属轨道和小球、同心底座前缘亮线，以及底座下方局部地面反射。暗色青柠、浅色蓝光；不是圆形色块替代反光。 |
| 质押 | 银色 U 币在透明立方体内形成前后层次，顶部/竖向/底部发光棱线、亮角和接地光影。 |
| GPU | 风扇/支架主体、斜向金属环的完整轮廓与亮边、右侧小球，以及环和设备下方地面反射。 |
| 共通 | 左文右图、原生标题/说明/CTA层次；CTA 轻边和局部映光，不再叠加旧重绿双边；底部 Liquid Glass 保留。 |

允许的差异：功能文案、业务槽位信息与中越翻译不要求逐字等同生图；文字保持原生可访问元素；窄屏允许自然换行和卡片增高。不能把素材文件相同换算成“像素满分”，也不能用这些例外掩盖下列孤行问题。

## READY3 的 P2 历史记录（当时GPU 8.8；最终已关闭）

**P2 — GPU 390 宽正文出现孤字/孤词尾行。**

- 390 中文明/暗实际正文为“共享空闲 GPU，占1个槽位。”，第二行仅“位。”；截图 `ready3-light-zh-390.png`、`ready3-dark-zh-390.png`。
- 390 越文实际正文为“GPU nhàn rỗi · 1 khe tính toán.”，第二行仅“toán.”；截图 `ready3-light-vi-390-spacing.png`。这来自原390越文碰图问题的局部复验，并非要求新增全矩阵。
- 定位：`src/components/earn/earn-way-card.vue` 的正文列与 `.earn-way-card__body`，结合相应 GPU i18n 短句。READY3 将390正文列收窄到约159.17px后解决碰图，但当前短句产生尾行。
- 当时建议的最小修法：保留已修的图文预留宽度，局部缩短 GPU 中/越文说明，或对最后的完整词组采取稳定的排版处理；不要重新扩大正文覆盖图案。父线程提出中文“闲置 GPU · 占 1 个槽位”时尚未有新包实测，因此当时没有提前关闭；越文也要求避免单独落下“toán.”。最终实测结果单独记录于文末。
- 增量验收仅需新包 GPU 中文390及受影响越文390，必要时320核对完整文案；无需重跑已完成的按钮/主题矩阵，若对应源码确实未变，应保留证据版本边界。

## 已关闭的问题与读回

1. **READY2 390越文GPU正文贴图：READY3关闭。** 原正文墨迹右缘约209.85px，图框左缘185.67px，进入淡出区约24.18px。READY3墨迹右缘177.29px，图框仍从185.67px开始，约8.38px间隔，实际画面不再贴金属支架。孤词尾行另列，不把避让修好等同全部排版通过。
2. **READY2 320暗色图像下沿横向接缝：READY3关闭。** 真实滚动到GPU全卡可见后复核，旧矩形底边消失；环带、底部亮点和地面反射仍可见，未以裁掉反光来掩盖接缝。浅色320也检查了完整下半部。
3. **旧CTA双边/重绿：READY2修法在READY3保留并复验。** 实际表面额外border为0，暗色为较轻边缘与局部映光，浅色淡蓝；文字500/12px，三卡外层按钮高度约43.99px（名义44px）。判断同时依据实景，不仅依据computed值。

| READY3 实测格 | 卡片宽度 | 手机 / 质押 / GPU 高度 | 按钮外层高度 | 横向溢出 |
| --- | ---: | --- | ---: | --- |
| 390中文明/暗 | 357.57px | 151.41 / 151.41 / 170.91px | 43.99px | 文档390/390；卡片scrollWidth=clientWidth |
| 320越文明/暗 | 287.87px | 189.73 / 168.14 / 168.14px | 43.99px | 文档320/320；卡片scrollWidth=clientWidth |

320越文手机标题两行且完整可读；三CTA均为单行。GPU完整卡片经实际滚动展示，未把底部导航暂时覆盖滚动内容算成卡片裁断。

## 实际按钮路径

| 卡片 | 现场操作与结果 | 边界 |
| --- | --- | --- |
| 手机 | 390中文点击“下载 APP”→ `/pages/register/success?download=1`，实际显示“前往官网下载 APP”引导，随后返回赚取。 | 页面明确显示下载地址暂未开放；未声称真实安装包下载/安装成功。 |
| 质押 | 390中文点击“查看质押”→ `/pages/staking/staking`，实际看到质押页和规则入口，使用“返回”回赚取。 | 未执行开仓、赎回或真实金融操作。 |
| GPU | 390中文点击“查看连接方式”→ `/pages/compute-share/download`，实际看到客户端连接页；320越文滚动后对“Cách kết nối”按Enter也进入同一路由。 | 目标是明确标注的前端fixture；未下载/安装客户端，未验证真实GPU接入。 |

READY2旧包曾在手机点击后遇到动态chunk加载失败。READY3已重新点击并看到完整目标页，不将旧失败当成当前业务缺陷，也不将旧失败记录删除。

## 独立截图与范围

以下为本审查现场截图的临时本机证据，仓库只新增本报告：

- [390中文浅色](C:/Users/FL/AppData/Local/Temp/r20-visual-a-20261027/ready3-light-zh-390.png)、[390中文暗色](C:/Users/FL/AppData/Local/Temp/r20-visual-a-20261027/ready3-dark-zh-390.png)。
- [320越文浅色](C:/Users/FL/AppData/Local/Temp/r20-visual-a-20261027/ready3-light-vi-320.png)、[浅色GPU完整下半部](C:/Users/FL/AppData/Local/Temp/r20-visual-a-20261027/ready3-light-vi-320-lower.png)。
- [320越文暗色](C:/Users/FL/AppData/Local/Temp/r20-visual-a-20261027/ready3-dark-vi-320.png)、[暗色GPU完整下半部](C:/Users/FL/AppData/Local/Temp/r20-visual-a-20261027/ready3-dark-vi-320-lower.png)。
- [390越文GPU间距及孤词](C:/Users/FL/AppData/Local/Temp/r20-visual-a-20261027/ready3-light-vi-390-spacing.png)。
- [手机目标页](C:/Users/FL/AppData/Local/Temp/r20-visual-a-20261027/ready3-phone-route.png)、[质押目标页](C:/Users/FL/AppData/Local/Temp/r20-visual-a-20261027/ready3-staking-route.png)、[GPU目标页](C:/Users/FL/AppData/Local/Temp/r20-visual-a-20261027/ready3-gpu-route.png)。
- [原始运行几何读回](C:/Users/FL/AppData/Local/Temp/r20-visual-a-20261027/ready3-runtime.json)。

本轮分数仅限上述APP构建的本地浏览器可见范围。未冒称真机安装、原生触觉、真实后端、实际下载分发、真实质押或GPU接入已验收；这些外部边界也不用于给当前已观察的界面虚降分。未修改生产文件、未运行构建/测试、未提交或推送。

## 最终 GPU 增量复验 — Bxu7X-7j

2026-10-27，最终独立分数 **GPU 9.2/10，接受**。旧8.8的原因已在实际运行画面中消除，没有因构建成功或源码短句变更而直接给分。

本轮原IAB入口不可用。获得用户明确授权后，使用官方CUA新建独立Chrome任务标签，sessionName为“🧪 R20 GPU复验”，仅访问 `http://127.0.0.1:5242/preview`。亲自选择赚取、切换中越语言、390/320尺寸及明暗主题、滚动到GPU卡片并逐格截图。每格均从iframe读回 `assets/index-Bxu7X-7j.js`、实际主题、语言和视口，未操作用户其他标签或设置。取证后已关闭本人临时标签 `1733372789`。

本轮再次读取 `earn-way-card.vue` SHA-256，仍为 `C576ABDE8A031B75FA61573B9355EB64059119DD0BE8F92BE40BE822B135CE0D`。手机、质押、图案/CTA样式以及READY3按钮路径证据不重跑。英文短句已核对源码，但按本轮最终要求未新增英文运行格，不将其冒充已测。

| 本轮实际复验 | GPU说明 | 明/暗行数 | 正文列宽约 | GPU卡片宽×高约 | 文档横向溢出 |
| --- | --- | --- | ---: | --- | --- |
| 390×844 中文，明/暗 | 闲置 GPU · 占 1 个槽位 | 1 / 1 | 159.71px | 358×150.83px | 0 / 0 |
| 320×693 中文，明/暗 | 闲置 GPU · 占 1 个槽位 | 1 / 1 | 136.61px | 288×148.43px | 0 / 0 |
| 390×844 越文，明/暗 | GPU nhàn rỗi · 1 khe | 1 / 1 | 159.71px | 358×150.83px | 0 / 0 |
| 320×693 越文，明/暗 | GPU nhàn rỗi · 1 khe | 1 / 1 | 136.61px | 288×148.43px | 0 / 0 |

八格正文均完整单行、墨迹在正文列内，未见“位。”或“toán.”独立尾行、文字截断或文字碰到可见GPU主体。GPU卡片回到紧凑高度，44px按钮外层仍在卡内。目检原金属环亮边和地面反光仍保留；没有为了容纳文案再放宽文字覆盖图片。上述几何只是辅助证据，最终判断包含逐格实际图像观察。

本轮使用官方浏览器截图接口的JPEG手机裁切图，非此前READY3的PNG；不会将JPEG称作像素级复刻证明。独立原始截图与读回保存在原临时证据目录，未覆盖旧文件：

- [390中文浅色](C:/Users/FL/AppData/Local/Temp/r20-visual-a-20261027/Bxu7X-7j-gpu-zh-390-light.jpg)、[390中文暗色](C:/Users/FL/AppData/Local/Temp/r20-visual-a-20261027/Bxu7X-7j-gpu-zh-390-dark.jpg)。
- [320中文浅色](C:/Users/FL/AppData/Local/Temp/r20-visual-a-20261027/Bxu7X-7j-gpu-zh-320-light.jpg)、[320中文暗色](C:/Users/FL/AppData/Local/Temp/r20-visual-a-20261027/Bxu7X-7j-gpu-zh-320-dark.jpg)。
- [390越文浅色](C:/Users/FL/AppData/Local/Temp/r20-visual-a-20261027/Bxu7X-7j-gpu-vi-390-light.jpg)、[390越文暗色](C:/Users/FL/AppData/Local/Temp/r20-visual-a-20261027/Bxu7X-7j-gpu-vi-390-dark.jpg)。
- [320越文浅色](C:/Users/FL/AppData/Local/Temp/r20-visual-a-20261027/Bxu7X-7j-gpu-vi-320-light.jpg)、[320越文暗色](C:/Users/FL/AppData/Local/Temp/r20-visual-a-20261027/Bxu7X-7j-gpu-vi-320-dark.jpg)。
- [本轮八格运行读回](C:/Users/FL/AppData/Local/Temp/r20-visual-a-20261027/Bxu7X-7j-gpu-runtime.json)。

最终每卡分数为手机9.2、质押9.2、GPU9.2，三卡均仅在本文明确的本地原型范围内受理。真实下载、安装、后端及物理手机边界保持不变。此次仅由本独立审查者更新本报告，未委托其他子任务编辑，未改生产代码或进行Git操作。
