# 重启恢复交接 · 2026-10-27

## 当前交接：APP／H5本地队列验收完成（2026-10-27）

当前结论集中见[消息与主题主报告顶部](2026-10-26-message-theme.md)：最终APP预览PR5b0C9J，Noether layout／tail **9.1**、Einstein最终tail **9.2**；header／counter及两条prefix异常红测均已闭环，sampled、L1—L3和AUDIO／timeout既有签核保持。

APP签署后已同步H5，合并保留双方远端新增提交。当前APP预览K60P-cxP、H5预览BSDHHyfm；消息thread指纹未变，类型／构建及H5代表交互通过。5237保留用户原会话33条和空草稿。完整验证、交付目标和未覆盖边界集中在主报告顶部；下面历史失败与评分保留。不要把历史“暂停／未修／待同步”继续列为当前任务。

## 之前阶段记录（历史；以顶部当前状态为准）

以下全部内容是历史快照；其中“当前／未修／待审／quota0”仅指当时状态，已由顶部当前块更新。历史失败与旧分数保留，不能据此将已关闭P2重新列为未实施。

### 上次R18恢复进度（历史，已由C2xTeVme当前块覆盖）

用户已明确恢复，APP队列继续实施。以下为当前状态，后面的暂停记录、旧低分及旧截图均保留为历史，不代表本轮已经通过。APP全部队列及双人逐项审查通过前，不同步H5。

| 项目 | 本轮当前状态 |
|---|---|
| STATUS-01／SEND-01整页断面、输入框矩形边缘与闪烁 | **未关闭**。用户最新2442cde8、28dc6549截图及“鼠标在原型屏幕外移动也闪烁”均纳入同一项。用户在去除iframe变换缩放后确认“大面积减少但仍存在”，新增c01de40c输入框内矩形色差截图。当前CBcrG6IE候选进一步将frosted背景/高光/内缘合为根层单次绘制，发送按钮复用父层采样，去掉compose/identity隔离层；预览改layout zoom。保留主题取色、边缘高光和近邻映照，导航仍为默认refractive。当前仍未获用户物理鼠标路径的通过反馈，不能用CDP静态/连续图正常关闭。 |
| 玻璃异步模式切换 | 已修有效配置改变时同步失效旧资源结果、清geometryKey，等效配置去重；renderer 49项通过。单层CSS另被审查发现solid语义色P2，已补ready品牌底和selection选中底，待当前构建复核。 |
| HISTORY-R18-P2-01 | 已修同flush前插、连续prepare、host/ref切换、500ms后测释放；线程133项通过，Noether独立25项确认各9.1–9.2。仍需当前真实历史分页与输入留位视觉验收。 |
| REFLECTION-R18-P2-01 | owner/host切换同步清光、旧回调隔离已有独立行为9.0。卸载后排队测量P3已加disposed门，queued tick/timer/late observer三例通过，待独立复核。 |
| PREVIEW-RT首建与恢复 | 本地后端schema确认消息id为全表主键。demo已统一分配全局id，旧state内存迁移保持正文、顺序、回执及幂等键。重启后实景CID3首条可见sent；3会话33消息33唯一id。正式跨人工会话历史聚合保留；Noether给全局ID迁移9.2。重启指纹已补持久摘要和冲突409，26项通过；transport冲突缓存污染及裸路由防御继续修，未签完整恢复。 |
| 券卡／试用卡／浅色顶部阴影 | 各自已有视觉9.2、交互handler9.1限定结论，保持原范围；不重复声明为完全未修，也不抵消聊天问题。 |
| IM其余收尾 | 依review-behavior.md“IM18剩余最小实景清单”补当前状态图标/原键重试、24小时边界、历史与输入留位、near rim动态范围；Nova有效较低上限和明确拒绝后的修正/移除仍核对中。旧已关闭合同不无谓重跑。 |

当前预览仍为 http://127.0.0.1:5237/preview 。本轮已从备份恢复并重启本人启动的服务，state继续仅留本机，不能提交；最新本机恢复文件为 D:/WORKS/PLAN/.wt/uvel-design-preview/resume-demo-state-5237-after-id-fix.json。

APP仍为226249e2加R18工作区；远端test已到7c86e97c，比较为20本地／3远端提交，须在最终交付前安全合入远端改动。H5仍停在前期cd94809，不属于最终同步。本轮尚未提交或推送，不标整体完成。

当前证据：4文件271项定向测试、类型和APP浏览器构建曾通过；这些先于最后玻璃路径修正，不代签新候选。独立QA连续帧、鼠标移出帧和几何数据在本目录message-theme/中按qa/stable标签保存，旧默认窗口idle帧受操作变化影响不作静止证明，裁偏截图不采用。原生实机／真实服务仍按原未覆盖范围记录。


本次STATUS证据新增：app-r18-layoutzoom-*/r18-layoutzoom-outside-pixel-diff.json仅证明同页鼠标采样；用户残余故障优先于有限通过。独立QA服务5240使用本机state克隆，不影响5237场景。CBcrG6IE已加载至5237，保留cid与647.879阅读位置；没有输入草稿被清空。新修solid语义色尚未包括在该指纹。

### 更早阶段记录（历史）

当前状态：quota0暂停。按用户通知额度已100%、无免费重置卡，立即停止新检查与实现；只保存文档/交接。无H5同步、无提交、无push，不自动重试或安排续跑。等待用户在额度可用后明确恢复；APP全部队列完成并双审前仍不得继续H5。

## 工作树与基线

| 工作树 | 当前本地HEAD | 状态 |
|---|---|---|
| APP：`D:/WORKS/PLAN/.wt/uvel-design-20261025-app` | `226249e2fc64e89c32ee54b520a304e0127ee383` | R17提交，R18实现/测试及文档WIP未提交；未推送 |
| H5：`D:/WORKS/PLAN/.wt/uvel-design-20261025-h5` | `cd94809a1d2a4b6541915f86f36659009c5c645e` | 前期33写入/0删除的同步；本地树干净，非最终交付，未推送；停止继续同步 |

R18 WIP涉及conversation-bubble-layout及其测试、conversation-thread及行为测试、chat.vue、messages-start-entry.test.ts，以及trial-hero-banner.vue/voucher-banner.vue、顶部导航阴影和prototype-preview.html入口增量；具体清单以续作时git status为准。这些是主线程和worker的工作，保留原状，不覆盖、reset或清理。R17的3文件220通过、APP/前期H5构建与类型、APP app-plus编译只证明当时基线，不能代签R18。

R18最新有限证据：queue-r18-geometry-tests.log为2文件190通过，queue-r18-current-types.log类型检查通过，queue-r18-shadow-build.log APP构建完成；本子任务只读核对，未重跑。runtime-r16.json当前r18标签记录浅390近邻gap8.11px/strength0.965、暗320 gap7.78px/strength0.967、空会话strength/opacity0；第8行末尾caret记录client144、scrollHeight576、scrollTop430、selection[207,207]。这些补齐已列样本，不能直接关闭两项overlay旧8.6、几何8.8或完整rim矩阵，独立审查仍进行中。

LIGHT-TOP-SHADOW已实现并有APP首页/消息页390实景：外投影0 2px 6px rgba(23,31,45,.12)，svg策略及44px热区保留；LiquidGlass内缘保留，底部导航不变仍是验收约束。当前待审、未评分，不再列未处理。原home-320记录有重载回390的命名错误，采用明确home-390与messages-390标签，不冒称320已测。

## 已有结论，勿重新列为未修

- SEND-TIMEOUT的12秒ACK＋最多3秒原命令读回已实现；[行为报告](2026-10-26-message-theme/review-behavior.md)给9.2限定结论：读回403/null与原写入明确拒绝区分，精确echo确认、15秒有界等待及原key重试已验证。不是Averroes仍在修旧超时；真实服务/真机与整项双审边界另保留。
- PREVIEW-RT已有9.0本地协议/fixture限定行为结论，不代表真人客服或正式WS上线。
- R16 `1fc11b1b`的singleflight onKey关联P2已关闭（9.1），首建start:type→cid预算迁移和Nova tracking冷却/75秒各9.2限定关闭；2000 UTF-16 guard、Retry-After传递已实现。AUDIO旧漏音/owner、普通精确echo去重及incoming窗口漏播也已按报告关闭，不重开旧矩阵。
- [R17视觉复审](2026-10-26-message-theme/review-visual.md)对普通顶部/online配色/透明浮层/普通文字单色气泡/输入代表态分别9.2限定接受，可见日期12px为9.1；不覆盖R18映照、几何竞态、完整状态或跨端最终验收。 最新61a2dba9…色裂反馈已重开STATUS，旧普通文字色面9.2不再作为当前关闭依据。

## 当前剩余队列

STATUS-01已重开，明确仍未解决。用户最新截图61a2dba9-02e5-40ca-a91b-c04be2d26572.png显示气泡与输入框在同一x坐标出现竖向颜色分界；新增共同玻璃合成层检查。R17旧样本9.2仅留历史，不能用旧图、单一computed颜色或单一伪元素结构签关闭；本轮未独立目检该新截图，完整证据由主线程归档。

Noether最新限定行为结论：原OVERLAY-MEASURE-01、OVERLAY-TAIL-01及composer Observer重绑各9.1关闭，旧8.6/8.8保留历史；当前未改的是HISTORY-R18-P2-01（8.6，同批历史前插与topInset共享cancelScroll互相取消，丢失总delta）及REFLECTION-R18-P2-01（8.8，旧owner测量在post失效前写入，缺owner/host实时校验与切换时同步清光）。纯几何通过不关闭状态归属问题。

首建入口路由已通，但首发未完整通过：chat.vue约806的全人工历史new Map(message.id)聚合会发生ID碰撞，已观察DEMO2首句id1被DEMO1 id1覆盖。真实生产消息ID是否全局唯一仍待核；演示消息ID需全局唯一只是根因/修法候选，不贸然改变正式聚合、会话或幂等语义。裸support/chat缺cid/start的产品防御仍未覆盖。

IM仍为原18项；下面列当前开放增量和收尾门槛，不新增IM第19项。每项须两人独立复核，不能平均分或用旧通过覆盖新要求。

| 追踪项 | 当前状态 | 最小待办 |
|---|---|---|
| HISTORY-R18-P2-01 | 8.6未通过，当前未修改 | 将同批prepend/topInset按总锚点差处理，避免cancelScroll互相取消；两赋值顺序、增/减高度和owner/hide边界待修后复核 |
| REFLECTION-R18-P2-01 | 8.8未通过，当前未修改 | apply实时核对owner/host，切换同步invalidate并清光；补旧回调在post前返回、host替换与hide/return |
| STATUS-01：同x颜色割裂/玻璃合成 | 明确未解决、重开 | 按最新61a2dba9…截图检查气泡与输入框共同竖界及玻璃合成层，保留单色磨砂需求；旧图/旧9.2不关闭新问题 |
| SEND-01：R18 near rim | 已有近邻/空会话有限实景，未评分；完整矩阵与双审待补 | 上缘72px内近邻气泡驱动当前颜色/横向位置，平滑距离衰减、远处或无近邻强度0、近处增强；随滚动/多行更新，原生/H5几何代码保持一致但暂不做H5同步 |
| HO04-追加：浅色越南文券卡 | 父线程整改及视觉复核进行中，未验 | 截图3a028f6f…对应中部空白；收紧benefit卡，平衡金额/图片/footer并对齐trial，保留主题和照片资产。纯视觉，不新增功能PRD |
| LIGHT-TOP-SHADOW | 已实现，APP首页/消息390有实景，reviewers在审 | 已测外投影0 2px 6px .12、svg、44px；复核共享导航与底部导航保持，未获最终评分/双审，原误名320不算320样本 |
| PREVIEW-RT-01：首建ID碰撞 | 路由已通，首发未完整通过，修法待定 | DEMO2首句id1被全人工历史Map(message.id)中的DEMO1覆盖；先核真实ID合同与fixture唯一性，保持正式聚合语义；裸路由防御仍未覆盖 |
| IM其余验收收尾 | 已有限定通过，整批未终签 | 核对18项适用结论和未覆盖分支；补当前failed/unknown焦点与原消息重试、附件/CTA、online灰态切换、24h完整边界、reduced/返回/历史不重播等审查员剩余最小范围；不重跑已关闭旧矩阵 |

“待验”描述审查状态，不宣称R18仍存在旧缺陷；不得把测试绿或主线程“已修”写成独立关闭。真实接口clientMessageId、真实服务/真机声音/键盘等边界仍按主报告保留，不能拿loopback样本代验。

## 续作步骤

1. 仅在额度恢复且用户明确恢复后续作；先读本交接和最新两份审查，核对APP/H5 HEAD与WIP。当前不执行任何新检查，不使用不存在的免费重置卡。
2. 恢复后优先修并复核HISTORY-R18-P2-01、REFLECTION-R18-P2-01，调查STATUS同x合成分界及首建ID冲突；原测量/尾随/observer已9.1关闭，不重跑旧失败矩阵冒充新问题。
3. APP暗390/浅320补rim近约8px、中约36px、到达/超过72px、空会话，以及左右来信/发信、滚动/多行；补失败→恢复→权限retry增减及顶部提示变化。券卡补浅色越南文前后/与trial对齐图。R18已有浅390/暗320近邻、空会话0及8行内滚记录，继续补中距/远距/左右追随等剩余范围。LIGHT-TOP-SHADOW已有首页/消息390对照，复核共享导航和底部导航保持；在线客服下拉补实际首建发送。记录真实样本尺寸、同ID锚点和资源指纹。
4. 两位独立审查员按当前冻结分别复核，更新下列文档中的当前队列和限定分数；旧低分、旧签项与证据原件保留。APP IM18项及并行券卡、LIGHT-TOP-SHADOW等全部队列完成前，不进行H5同步。
5. APP门槛满足后，由主线程按[同步说明](../app-h5-sync.md)进行最终H5同步、双端验收和交付，记录最终产物hash及真实推送范围；当前没有最终同步或推送。

## 本机模拟会话恢复（不纳入提交）

备份：`D:/WORKS/PLAN/.wt/uvel-design-preview/restart-demo-state-5237.json`。本次只确认文件存在，未读取内容、未重启服务；**该state只留本机，不提交、不推送，也不将内容复制到报告或证据清单。**

主线程需要恢复预览时，在该预览进程的启动环境设置下列变量，再沿用原启动命令：

```powershell
$env:DEMO_STATE_FILE = 'D:/WORKS/PLAN/.wt/uvel-design-preview/restart-demo-state-5237.json'
```

DEMO_STATE_FILE仅读取导出的{state}，不是自动实时保存或未导出在途请求恢复保证。不要据此自行操作用户5237/5235或停止其他服务；恢复由主线程按用户会话控制。

## 文档与证据入口

- [消息主报告（18项与当前证据）](2026-10-26-message-theme.md)、[总队列master](2026-10-26-fidelity-recheck.md)。
- [功能PRD F12/F13](../../PRD/UVEL_设计审查功能同步_20261026.md)、[时间戳规范](../../PRD/UVEL_IM时间戳显示规范_20261026.md)、[前端更新日志](../前端产品更新日志.md)。
- review-behavior.md、review-visual.md及message-limits-review.md由审查员维护；本子任务只读，不编辑这些原件或证据清单。
- [runtime-r16.json](2026-10-26-message-theme/runtime-r16.json)按内部标签区分版本；R17 final图片、构建清单保留原身份。R18新数据只按实际标签/指纹采纳。
- [R17定向日志](../../../uvel-design-preview/queue-r17-targeted-fix.log)和[前期同步记录](../../../uvel-design-preview/queue-r17-sync.json)属于历史基线，不是R18完成证据。
- R18：[geometry190](../../../uvel-design-preview/queue-r18-geometry-tests.log)、[当前类型](../../../uvel-design-preview/queue-r18-current-types.log)、[APP构建](../../../uvel-design-preview/queue-r18-shadow-build.log)；实际R18 rim/8行/顶部阴影记录仍在runtime-r16.json内，按标签识别，独立终审待补。
