独立渲染复核 · 2026-10-27 · R18

本报告记录 APP 工作树单层 frosted 材质的源码复核及后续 DYMJD5Wv 证据补审；只写本报告，未改生产或测试，未操作浏览器、构建、运行新测试、提交或推送。

**评分分别记录：既有 390 双主题 solid ready 与浅色恢复证据为 9.2/10；最新 composer sampled 修复后源码复审为 9.1/10，达到 ≥9 的限定源码门槛，SAMPLED-MATERIAL-01 已关闭。STATUS-01 继续 OPEN，不给动态渲染通过分。** 首轮源码 9.0 与 sampled 修复前 8.8 的证据保留如下。各项分数不能用作整体 R18、物理鼠标故障或所有材质状态的验收。

| 检查项 | 当前源码与结论 |
| --- | --- |
| solid ready 底色与图标 | [conversation-thread.vue:1123](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:1123) 对 ready＋frosted＋solid 根层设置 `background: var(--v5-brand)`，覆盖通用 surface 底和普通 ready 渐变；图标保留 `--v5-on-brand`。恢复浅色蓝底白图标、暗色 lime 底深色图标的配对。首轮标记为**源码已修，运行待复验**；文末 DYMJD5Wv 补审已完成该 ready 子项的限定复验。 |
| solid selection | [liquid-glass.vue:63](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/liquid-glass.vue:63) 先设置不透明 surface，随后更具体的 selection＋solid 规则恢复 `--v5-liquid-selected` 同色两端渐变层。选中填色不再被通用 background 简写抹掉；透明选中色仍画在不透明底上。源码复核通过，未量测当前构建像素。 |
| solid 不重新采样 | [liquid-glass.vue:41](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/liquid-glass.vue:41) 同时关闭标准及 WebKit backdrop-filter；其选择器优先级高于普通 frosted 类。renderer 在系统偏好分支前释放旧资源，直接标记 solid。根层已接管不透明底，不再依赖被隐藏的 optics 子层。 |
| 默认导航与 selection | 合层及隐藏四个子材质层均限定在 `--frosted` 类；[glass-segments.vue:7](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/glass-segments.vue:7) 未传 frosted，仍使用默认 refractive。未发现本次规则直接覆盖默认导航/selection 的路径。 |
| 发送功能与局部采样 | [conversation-thread.vue:156](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:156) 保留点击、Enter/Space、disabled、busy；44px 控件及 ready/反馈状态仍在。`:1108` 仅在 composer 内关闭发送玻璃的两种 backdrop-filter，`!important` 能覆盖 renderer 写入的普通内联值，根材质和 ready 外观保留。 |

上述窄范围未发现新的明显 P0/P1/P2。移除 compose/identity 的 isolation 后，源码中仍保留相对定位、内容层及装饰层的 pointer-events 边界；实际层序、点击命中和反光效果尚不在本次静态通过范围。

**C01 用户反馈与构建边界**

- 已直接查看 [C01 原图](C:/Users/FL/AppData/Local/Temp/codex-clipboard-c01de40c-e991-47c0-abc5-1b073e6a7a87.png)：输入框内部存在左暗右亮、带硬直边的矩形断面。用户反馈改预览缩放后面积减小但仍存在。单张图能证明该帧残余，鼠标移出后持续闪烁属于用户运行反馈，本审未独立运行复现。
- C01 属于此前反馈，不能据此判断刚落盘的 solid 修正或最新单层候选已经成功/失败。单层绘制减少了材质子层，但保留原生 backdrop；源码简化与静态正常帧均不能关闭 STATUS-01。
- 首轮本地 `dist/build/h5/index.html` 入口为 `index-CBcrG6IE.js`。当时主线程报告用户/QA 已切换单层候选、solid 修正尚待 build；该历史候选未被当成修正后的实景证据。当前 DYMJD5Wv 补审见下。
- 既有 [renderer 定向日志](D:/WORKS/PLAN/.wt/uvel-design-preview/queue-r18-glass-effective-blur-tests.log) 为 49/49，renderer 源码 SHA256 仍与日志一致。它覆盖生命周期与配置竞态，不覆盖本次新增 CSS 层叠，也不证明断面或闪烁消失。本轮未重跑。

首轮待验项是包含 solid 修正的新构建、reduced-transparency 下双主题 ready，以及切回普通偏好的恢复。以下补审记录已取得证据及仍未覆盖的部分。STATUS 仍需在用户实际触发条件下验证残余断面及鼠标移出后的连续稳定性。

首轮复核源码指纹（SHA256）：

- `src/components/liquid-glass.vue`：`973C7BE24580390E165A9CCA2598178EF0024398410C906A48911CD9F46690E1`
- `src/components/support/conversation-thread.vue`：`B0CB7F8B009E1AD52C0EED34188F052A1174F6873062CDFCE258E319CE5BC4EB`
- `src/lib/liquid-glass-renderer.ts`：`A036D82478961A031A218CD2F24CE17772C11F10047B224C88F28B42B3E1226D`

**DYMJD5Wv 证据补审 · 2026-10-27**

已独立打开四张原始 PNG、对应四份截图 JSON，以及 [settled 颜色读回](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-solid-light-ready-settled.json)。四张 PNG 的 SHA256 均与对应 JSON 的 `hash` 一致。本地构建入口已核为 `index-DYMJD5Wv.js`；QA5240 使用该构建、实际 Emulation reduce 后恢复 `preferences:[]` 的操作过程由主线程提供，本审未接管或操作浏览器。截图 JSON 本身未保存构建入口和 Emulation 命令，不混称为独立重跑。

| 子项 | 独立复核证据与限定结论 |
| --- | --- |
| 暗色 solid ready | [PNG](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-solid-dark390-ready.png)／[JSON](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-solid-dark390-ready.json)。六个列出的玻璃节点均为 `solid / system-preference / filter:none`。输入与标题为不透明深色表面；发送圆为 lime，飞机深色且清晰。原图按钮内部采样得到底色 `158,220,29`、笔画 `10,10,10`，该配色子项通过。 |
| 浅色 solid ready，采用 settled | [settled PNG](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-solid-light390-ready-settled.png)／[截图 JSON](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-solid-light390-ready-settled.json)。六个节点同样为 `solid / system-preference / filter:none`。额外颜色读回记录输入根白底、发送根蓝底 `14,72,230`、飞机与父色 `255,255,255`、class ready；原始 PNG 也分别采得蓝底和纯白笔画。白色输入内文字、按钮圆边及飞机可辨，ready 底色丢失的 P2 在本批双主题证据范围内关闭。 |
| 恢复普通 frosted | [PNG](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-frost-restored-light390.png)／[JSON](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-frost-restored-light390.json)。六个节点均恢复 `frosted / scrolling-surface`：back、identity、CTA、attach 为 blur18/saturate1.35，input 为 blur24/saturate1.35，send 保持 none。图中标题恢复背景透色，未残留 solid 的不透明白底。此图草稿为空、发送非 ready，因此只通过材质恢复子项，不据此判断偏好切换会清草稿，也不声称覆盖 ready 带草稿往返保存。 |

浅色瞬态证据不覆盖、不删除：[较早 PNG](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-solid-light390-ready.png) 的飞机核心像素实际为 `199,200,204`，尚未到纯白；主线程更早即时 computed 值为 `106,110,119`。最终判断采用新 settled PNG 和颜色读回，不把两个动画中间值当作最终前景色，也不将其新增为持续性生产缺陷。

像素复核使用磁盘原始 1716×1683 PNG，未使用展示时缩放图。根据 JSON 的 iframe/field 坐标与 DPR≈1.65 定位按钮内部，在原图中心 `(883,1474)`、半径 22px 的区域读色：暗色底/笔画分别有 1074/193 个精确像素；浅色 settled 底/白笔画分别有 1150/194 个。对应两对实色的 sRGB 相对亮度比约为 11.98:1、6.80:1，仅用于说明此次核心色对，未宣称整个控件、过渡全程或全站无障碍合规。

覆盖边界：`filter` 是提供 JSON 的单个采样字段，没有另存 WebKit 属性，因此运行证据不扩大为两种属性分别读回；两种 CSS 关闭规则仍有前述源码证据。solid selection 的实际选中状态、默认导航、暗色恢复、其他宽度/系统以及物理鼠标触发连续帧均不在本批图中。三组主截图的 field 几何和 scroll 读回一致，但这不是完整交互回归。

本次限定证据中未新增明显 P0/P1/P2；**9.2/10 只签上述双主题 ready 与浅色恢复子项**。C01 原图的残余矩形断面和用户物理鼠标故障记录继续保留；静态 PNG 正常、solid P2 修复与策略恢复都不能关闭 **STATUS-01 OPEN**。

**Native 单变量证据与局部采样建议 · 2026-10-27**

本审直接打开了 [四帧同坐标对照](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-native-diagnostic-comparison.png) 与 [隐藏 sensor 的 native 截图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-native-diagnostic-no-sensor.png)。对照图中 before、restore、own-layer 均可见输入内部的竖直硬边，no-backdrop 帧没有该边；no-sensor 图仍有残余。主线程确认它们来自 CBcrG6IE 的真实桌面复现、仅关闭 composer backdrop 后消失、恢复后复现，translateZ(0) 与隐藏 sensor 不改善，诊断样式已恢复。本审复核图片，未独立执行切换。

后续主线程补充 blur-only、glass clip-path、parent 采样/child none 同样未消除 native seam；这些结果按主线程实测记录，本审未逐张复看。当前证据把可复现条件收敛到 composer 的原生 backdrop 路径，不能进一步断言具体是浏览器 GPU 分片、驱动还是嵌套窗口合成缺陷。sensor、saturate、简单提层不再是优先修复方向。`backdrop:none` 只作为诊断对照，不是最终材质方案。**STATUS-01 仍 OPEN；不提高此前仅属于 solid 子项的 9.2 分。**

优先候选：仅 composer 使用「有界消息视觉副本 → 一次普通 filter 模糊 → 胶囊裁切」，保留现有 tint、高光、动态 rim、真实 textarea 与发送按钮；导航维持原路径。普通 filter 处理元素及子内容的绘制结果，见 [W3C Filter Effects 绘制模型](https://www.w3.org/TR/filter-effects-1/#Abstract)。这能避开读取背后合成层的 backdrop 路径，但普通 filter 仍可能由 GPU 执行，不能预先宣称无缝。建议先冻结一份局部副本，用同一桌面触发条件验证；通过后再接动态更新。

实施边界与主要风险：

- 新路径需要独立策略标记和首帧样式，覆盖组件默认 backdrop、renderer:58–61 的内联写入及 thread:1031 的 scoped blur；只关闭其中一处会重新启用原生采样。配置切换同时使旧异步工作失效，不能在新副本上短暂恢复旧材质。
- 采样范围为 composer 外扩模糊核的区域，24px 模糊可先以约 72px 边距作为近似起点；包含靠近但尚未直接相交的气泡。先绘制场景底色与局部消息，再整体模糊，最后按输入胶囊裁切，不能先把邻近内容裁掉。只选空间范围，不能按“最近 N 条”截断而漏掉可见颜色。
- 副本只承载静态视觉内容，不挂载第二套 Vue/Uni 组件。移除原 ID、焦点/交互属性、入场动画和内部玻璃，设为 aria-hidden、不可交互。实际消息内的图片失败按钮与 CTA 含 LiquidGlass（thread:43、54），直接深克隆会重新引入 backdrop。副本外壳也不能保留 `.nx-conv-bubble` 采样标记，否则 thread:695 的 native selectAll 会把副本算入原消息测量。以实测尺寸、解析后的颜色/字体/布局样式保持原换行，不能依赖换父节点后仍相同的百分比或继承变量。
- 先把背景与气泡 RGBA 合成，再模糊并覆盖原场景在胶囊内的直接显示；如果只是把半透明模糊副本叠在清晰原文上，会产生双影与漏字。圆角外仍透明，材质 tint/高光仍保留；内部使用预合成场景模拟透射，这一取舍应明确。副本取自 composer 后方的场景，不能包含 composer 自身、发送按钮或它们的反光，避免反馈。
- 统一使用同一 iframe 的 CSS 坐标，保留小数，先相对 composer 定位，再统一转换采样分辨率。滚动、主题、消息/图片、布局变化才合并更新；入场动画仅在有效动画期间追踪并补最终帧，鼠标移出后没有永久采样循环。更新复用节点、批量读后写，沿用 owner/host/epoch 检验；hide、换账号、换会话和 dispose 即时清副本。solid 偏好直接走已有不透明材质。

备选为可控颜色与几何的 canvas：若普通 filter 仍复现，使用小范围像素缓冲和显式像素模糊，完成后一次提交位图；仅把同一 blur 挪进 `ctx.filter` 或 OffscreenCanvas 不等于绕开 GPU。现有 thread:665–697 已有气泡/输入几何与 owner 检查，bubble-layout 提供颜色，但没有文字、附件图片或完整层叠像素，因此 geometry canvas 首版是可解释的场景近似，不能称为真实页面截图。Canvas 的标准图片输入不包含任意 HTMLElement，见 [HTML CanvasImageSource](https://html.spec.whatwg.org/multipage/canvas.html#canvasimagesource)；不建议为此引入整页 DOM 截图或屏幕捕获。

本次只追加本报告，未实现副本/canvas、未改生产或测试、未运行新测试/构建、未操作浏览器。最终仍需同一 native 条件下的连续稳定证据，及滚动、多行、双主题、solid 和隐藏/owner 切换验证；普通静态截图不能签整体 STATUS。

**sampled 已落盘后的材质/兼容性第二审 · 2026-10-27**

限定评分 **8.8/10，未达到 ≥9 门槛**。只读复核 sampler、renderer、component 与 composer 唯一调用，不重复 Noether 的独立行为测试，不操作浏览器、构建或生产。以下 P2 来自现有源码与已安装 Uni 实现的明确数据流，尚未独立 native 复现；不能将它称为当前硬直边的已证实原因。

**修复前 P2 · SAMPLED-MATERIAL-01：子节点仅 style 更新后，副本保留旧图片尺寸（已关闭，见文末）。** 当时的 [conversation-glass-sample.ts:69](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/conversation-glass-sample.ts:69) 对所有仅 `style` 的 mutation 都不置 dirty；`:54–63` 随后的 paint 只更新气泡根节点，复用的深克隆子节点没有同步。真实 [thread:39](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:39) 使用 `image mode="widthFix"`，`:803` 宽度为 `min(220px,58vw)`。已安装 [uni-h5.es.js:10292](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/node_modules/@dcloudio/uni-h5/dist/uni-h5.es.js:10292) 通过 ResizeSensor 调用 fixSize，`:10418–10421` 只更新图片宿主的内联 height。

触发路径：含图片气泡已进入采样区并被复制 → 390/320 宽度切换或旋转让 widthFix 重算 → 原图片高度改变，但采样子树仍沿用旧内联高度。窗口 resize 与 source style mutation 虽都会 schedule，现有两条路径都不使子树失效；clone 本身没有 Vue 的 fixSize 处理。直至后续非 style mutation/主题变化重建，玻璃中可能出现错误长宽比、色块范围和布局，违背当前 resize 更新承诺。

建议只对派生根气泡的调色/定位 style 保留快速更新；对其视觉子节点的 style 变化刷新对应副本，或显式同步必要子树样式。不要把每次气泡色位更新全部变成重克隆循环。建议定向断言同一图片副本在 source 子节点高度 220→186 后与原图一致、仍保持无原 ID/测量标记/内部玻璃；此处只提供回归需求，未添加或执行测试。

其余限定结论：

- sampled 类首帧同时关闭标准与 WebKit backdrop，`!important` 能覆盖 renderer 内联和 composer scoped 旧规则；renderer sampled 分支位于资产创建之前，只查询同一 cp-root 内独立列表。未发现默认 refractive 导航被改为 sampled。
- 3×blur 预留、cp-root 实色打底、整个局部平面先普通 blur 后裁成胶囊，满足当前避免透明副本与清晰原文重复混合的设计；tint、specular、rim 保留为后续绘制。普通 filter 仍由浏览器决定实现，源码不能证明 native seam 已消失。
- solid 分支仍先 release 采样资源；solid 根底的选择器优先级高于 sampled 的 transparent，specular 的 solid 隐藏规则也更具体，未发现重新变透明的明确回归。但 sampled 恢复了 tint 子层，暗色 solid 的最终像素可能较此前单 paint 略变，本候选仍需 native 双主题复验，旧 9.2 不直接迁移。
- 新增 inert 有 aria-hidden、去 ID/焦点和 pointer-events 的配合；旧 WebView 对 inert 的实际支持与 App renderjs 仍未实测。采样保留普通图片但去掉内部玻璃/编辑控件，不包含时间分隔、system 行、头像等全部原场景；这些属于材质保真范围限制，不宣称完整页面像素复制。

源码指纹（本审读回，SHA256）：sampler `d5f8b7d3337ffc8095b88661e5fa0e2949b958b92353d95d6d496d82426fb32e`；renderer `2efc03e6abf128075749316e4d5f64ecfabc8b6c00241d5e800ff71380c37cb5`；component `8b1a65ef7bbdf3f89cd5393b26632e320841fbf8abbb0ede906f15b1e8d1859e`。修复 P2 后须按新源码复核，native 连续稳定证据仍是 STATUS-01 的独立门槛。

**sampled 最终当前源码二次复审 · 2026-10-27**

结论：**9.1/10，达到限定源码/材质边界的 ≥9 门槛；关闭 SAMPLED-MATERIAL-01（测试中对应 SAMPLE-R18-P2-03）。未发现本次修复新增的明确 P0/P1/P2。** 本轮按要求只读生产及测试，只更新本报告；没有执行测试、浏览器、build、commit 或 push。以下“已有断言”描述读取到的测试内容，不代表本轮实跑结果。

| 复核边界 | 当前实现与结论 |
| --- | --- |
| 子节点 style / image load | [sampler:69](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/conversation-glass-sample.ts:69) 仅对真实气泡根的 style 变更保留复用；其他 style 变更置 dirty 并清旧副本。`:78` 的 load 单独置 dirty。下一 paint 重克隆子树，原 widthFix 高度失配路径已修；根气泡调色仍不必重克隆。[测试:212](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/conversation-glass-sample.test.ts:212) 已包含子节点高度变化、无 mutation 的 load，以及根样式保持复用的业务断言。 |
| 同尺寸 source 替换 / 缺失后出现 | [renderer:51](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/liquid-glass-renderer.ts:51) 将实际 source 身份纳入去重；`:65` 的 scope childList observer 不依赖 resize 或 controller.update，身份变化先 stopSample、断开旧 owner observer，再调度重取当前 source。ownGeneration/disposed 检查阻止旧 owner 回调清掉新实例。已有测试覆盖 observer 单独恢复、两次替换只采最新 source、旧 source/RAF/owner 回调不影响新副本。 |
| 脱离 / 页面隐藏 / dispose | sampler 每次 paint 检查 host/source 的 isConnected、共同 cp-root 和 doc.hidden；失效时清副本。renderer:209 已对 sampled 单独处理 Chrome offscreen，清理不再只依赖非 SVG 浏览器分支。document hide 会停止采样；dispose 取消 RAF、断开 observers、移除事件及底片。已有断言覆盖脱离后旧 paint、隐藏后回返、清理后旧回调及 document 仍可见的 Chrome 页面隐藏。没有据此扩大为所有 App 导航时序实测。 |
| 主题 | sampler:82 监听 documentElement 的 class/data-theme，置 dirty 后重绘；paint 重新读取 cp-root 底色与原气泡 computed color，避免沿用旧主题子树。Chrome 在 sampler 内完成；非 SVG 路径还允许 renderer 重建，release 会取消旧 sampler 的待执行帧。当前测试仅显式检查 dispose 后迟到 theme 回调不能复活，没有正常双主题 computed-style/pixel 往返断言；主题外观仍交 native 验证。 |
| reduced transparency / contrast | preferenceChanged 同步使 renderer 代次失效；下一 render 在挂 sampler 前 release 并进入 solid，恢复偏好后重建当前 source。component 的 solid 不透明根底与隐藏 specular 规则仍有效，sampled 强制 none 不影响 solid；旧 sampler 的观察/事件随 release 移除。已有双 preference 断言检查无副本、scroll 不再排帧及恢复后只有一份 sampler。实际偏好切换的首帧、暗色 tint 后的最终颜色仍不由轻 DOM 测试证明。 |

生产 sampled 调用仍只在 [composer:139](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:139)。component 的 `!important` 双 backdrop:none 首帧保护、普通 filter 后裁切和系统不透明材质边界未被本次修复移除；默认导航未改用 sampled。此前完整场景保真、旧 WebView/真实 renderjs、材质像素与鼠标移出持续稳定性的覆盖限制继续保留。

当前 SHA256：sampler `9535907a0c279849c0af64b22af22fae8856cd536f60cc8ab5f43055c421b089`；renderer `77bb273705b6b95abc4d9560ce01f0041e0b8ecffcafee9e373192e877c72939`；sample test `9436f43dee7151136444a6bfe94546431489a568a9fde7491b9d934951bc9fd1`；component 与上轮一致。**9.1 只签本次源码复审；STATUS-01 保持 OPEN，等待主线程当前构建 native A/B 和持续稳定证据。Nova 9.2 不受此评分影响。**
