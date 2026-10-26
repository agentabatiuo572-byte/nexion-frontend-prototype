> 当前状态（Raman独立复审B）：邀请卡9.2/10、团队/等级双卡9.2/10。旧320越南文浅色顶部遮挡的证据缺口，已由新增clear截图及主agent两入口CUA结果解除。前文Avicenna原审查保留为历史；当前范围、补证和pending以文末Raman附录为准。

# 独立交互审查 B

## 邀请卡紧凑布局复签（2026-10-26）

已观察范围评分 **9.2/10**。邀请卡本体未发现本次改动引入的 P1/P2；下列未执行范围不算实景通过。320 越南文浅色截图受页面搜索/通知层遮挡，顶部两个入口的无遮挡结论待补证，不能由这张裁图代替。

审查只读源码、既有测试日志和主 agent 采集的截图/尺寸；未操作浏览器，未新增或运行源码测试。唯一写入文件为本报告。

### 受审版本与证据

- 工作树：`D:/WORKS/PLAN/.wt/uvel-design-20261025-app`。
- 组件：`src/components/team/invite-earn-card.vue`；基线 HEAD `c2078fe1db92fc48b6546bc0cd7087b9fb6440d4`。
- 最终组件 SHA-256：`E36E503E6CB53A9E6B898ADC62746A0B61699A85C3F23879720500CB01946E48`。
- 独立比较确认：script 与基线相同，template 除注释外相同；本轮实际改动为 CSS 与解释性注释。
- 参考：`D:/WORKS/PLAN/.wt/uvel-design-preview/design-proposals/2026-10-25-fidelity/team-overview-v2.png`。
- 已独立查看：本目录 `invite-390-zh-final.png`、`invite-320-vi-dark-final.png`、`invite-320-vi-light-final.png`；同时查看首版 `invite-390-zh-card.png` 和 `before-after-metrics.json`，不将首版尺寸当最终构建的独立测量。
- 主 agent 提供最终实测：390 中文卡高 225px，六入口高度均 44px，正常说明 18px，隐藏异常说明 0px；320 英文 CTA 126.33×44px、文字单行、正常说明 36px、卡高约 230.07px、无横向溢出。本审查未亲自执行该测量。
- 已核对既有测试执行日志：4 文件、47/47，通过项包括邀请/钱包状态行为、团队概览行为及分享弹层契约；这些测试包含内存渲染器，不证明浏览器像素、真实剪贴板、真实服务或读屏播报。

### 逐项核对

| 项目 | 可确认结论 | 证据类别 |
| --- | --- | --- |
| 紧凑布局 | 中文最终图中奖励、说明、44px 主按钮与底部工具条形成连续层级；没有首版长异常说明留下的空白。插画上移放大后未遮住左侧文字或底部入口。 | 最终截图 + 主 agent 实测 |
| 三语 | 中/英/越标题、资格说明、状态及操作名称仍来自既有词条；越南文窄屏暗色图的 CTA 单行，正常说明两行，底部三入口完整可见。英文窄屏尺寸来自主 agent 实测。 | 源码 + 最终越南文截图 + 主 agent 实测 |
| 44px 触区 | 32px header 仅压缩排版高度，记录/重试控件仍 44×44，规则至少 44×44；四分享入口仍至少高 44。header 操作绝对定位，未删除或缩小入口。 | 源码；390 六入口、320 英文 CTA 有主 agent 尺寸证据 |
| 入口 | 正常态保留奖励记录、规则、邀请好友、海报、复制邀请码、复制链接。异常时原记录位切为重试。父页团队空态和首购进度仍通过暴露的 `openShare()` 打开同一分享入口。 | template/script 与基线比较 + 调用链核对 |
| 金额和状态 | 只有奖励快照可用、无错误且非加载并启用奖励时展示奖励数值，否则显示破折号；UVT 单位及金额格式未改。关闭奖励仍允许有效邀请码分享；无码时四分享入口禁用并退出 Tab 顺序。 | 源码 + 既有行为测试覆盖 |
| 失败恢复 | 失败显示当前失败说明及重试；loading 显示当前加载说明并置 `aria-busy`。分享基址暂不可用时原有恢复弹层分支保留；复制失败不报成功，复制不记为分享。 | 源码 + 既有行为测试覆盖 |
| 读屏语义 | 未激活说明仍 `aria-hidden`，普通说明的隐藏占位不进入可访问文本；可操作入口保留 role、名称、Enter/Space 和 focus-visible。复制反馈走 `global-ui.vue` 的 `role=status` / `aria-live=polite` toast，弹层既有焦点管理保留。 | 源码及语义测试核对；非实际读屏播报验收 |
| 加载布局 | 正常说明作为唯一常驻占位；未激活的长异常 `display:none`，激活异常才按内容增高。图片固定宽高比，主按钮和底部入口不因加载移除。该策略修复隐藏异常共同撑高根因。 | 源码；最终正常态截图/尺寸。未据此宣称全状态零 CLS |
| 插画交互隔离 | `translateY(-14px) scale(1.08)` 只改变绘制；插画容器/素材 `pointer-events:none` 且素材 `aria-hidden`，不会新增可点或读屏节点，未改变奖励/分享逻辑。 | 源码 + 最终暗色图 |

### 证据缺口与必要补证

1. `invite-320-vi-light-final.png` 顶部可见页面搜索/通知层，覆盖记录与规则附近。这是当前截图的可确认干扰，尚不能直接归因于邀请卡 CSS。补一张页面工具层与卡片分离后的浅色图，并核对顶部两入口命中；无需为了裁图擅自扩大源码修改范围。
2. 本审查未执行 TalkBack/VoiceOver、原生 APP 真机、真实分享/剪贴板/服务端结算；无相关通过声明。
3. 未独立操作浏览器重演 loading→ready、失败→重试、奖励关闭和无码。既有测试与源码核对支持状态逻辑保持；实际状态切换位置、命中及读屏播报不能仅据静态结果签为通过。

已观察邀请卡正常态的紧凑布局可复签；浅色顶部入口无遮挡及上述未执行分支保留边界。团队/等级双卡为用户后续扩展，另节补充，不追溯扩大本节结论。

---

## Raman 独立复审 B：紧凑邀请卡与团队/等级双卡

审查时间（UTC）：2026-10-26T07:13:27.067Z。工作树：D:/WORKS/PLAN/.wt/uvel-design-20261025-app。基线 HEAD：`c2078fe1db92fc48b6546bc0cd7087b9fb6440d4`。仅限用户指定的3个源码diff；本轮未操作浏览器、未改源码、未提交或推送。唯一写入文件为本报告。

### 当前结论

| 对象 | review scope | 最终评分 | 结论 |
|---|---|---:|---|
| 邀请卡 | 紧凑结构、正常caption预留、异常状态布局与交互保留、320三语相关边界、顶部/底部入口、插画命中隔离 | **9.2/10** | 指定源码与已提供最终截图范围通过；无本轮新增P1/P2阻断点 |
| 团队/等级双卡 | 320越南文浅/暗色、320英文暗色及390中文暗色双卡；窄屏标题/主体对齐、48px图与数字并排、两入口路由/语义 | **9.2/10** | 指定源码与补齐的四组双卡截图范围通过；无本轮新增P1/P2阻断点 |

评分依据为独立源码比较、已有图片的独立目视复核及明确标注来源的主agent实测/交互结果；不称为Raman亲自操作CUA。未测试分支不算通过，缺少真机不作为本次达到9分的额外门槛。

### 独立核对的方法与结果

已查看完整3文件diff及相关组件、调用点和三语词条，并对比最终截图与[参考稿](D:/WORKS/PLAN/.wt/uvel-design-preview/design-proposals/2026-10-25-fidelity/team-overview-v2.png)。三个文件的script均与HEAD完全相同；template忽略注释/排版空白后均相同，本轮无业务条件、奖励数值、状态判定、路由或事件处理变更。独立执行3个SFC解析、3个template编译、3个样式块编译及指定3文件git diff --check，均无错误。没有重跑测试；47tests passed及双卡变更后的43passed为用户提供的结果，不能相加当作独立90项覆盖，也不代表浏览器布局/实际读屏通过。

| 核对项 | 源码与截图结论 | 证据归属/边界 |
|---|---|---|
| 隐藏异常占位 | 默认description display:none；只有first-child正常caption常驻隐藏预留，active分支才display:block/visible。没有把所有隐藏长异常一起算入grid高度。异常激活仍可按真实内容增高。 | Raman源码核对；不声称全状态零CLS |
| 正常紧凑度 | 最终390中文图中金额、caption、44px主按钮、底部分隔线与三入口连续排列，插画体量与参考稿方向一致。正常caption由54px减到18px、卡高由约285.615降到225px，来自metrics JSON；未自行测DOM。 | Raman看图+JSON核对；只比较高度，不混用前后页面绝对top |
| 32px header与44px触区 | header min-height32，操作区绝对居中；history仍44×44、rules仍至少44×44，两个控件相隔4px，标题预留96px。触区超出header排版高度约6px，但仍落在卡片顶部12px内边距及右侧区域，未改成32px触区。 | Raman源码；无新入口裁切规则 |
| 主邀请按钮 | min-height44、宽度受列宽约束；320越南文深/浅色最终图文字与箭头单行完整。用户所报窄屏126×44与代码max-width100%的限幅一致；390 JSON的主按钮为128×44。 | Raman看图+源码；尺寸是JSON/主agent报告，非独立DOM测量 |
| 插画上移放大 | translateY(-14px) scale(1.08)只改变绘制；art及TeamArt pointer-events:none，TeamArt aria-hidden，不增加点击节点。指定截图中未压住金额、按钮或底部入口。 | Raman源码与截图 |
| 状态/失败恢复 | loading/error/奖励停用/无码仍显示各自既有文案；按钮状态、guardCode、guardLink、复制失败提示、复制与分享埋点区分、重试保持原逻辑。正常caption的隐藏占位aria-hidden保留。 | script/template对比；这些切换本轮未由Raman实景重演 |
| 邀请卡入口 | 奖励记录或异常重试、规则、邀请好友、海报、复制邀请码、复制链接均保留。Enter/Space、可用状态tabindex、aria名称与focus-visible仍在。 | Raman源码；真实交互范围见补证附录 |
| 双卡标题 | team.vue仅在max-width359px将左右header统一为min-height42；越南文左标题两行、右标题一行时不再把两卡主体起点错开。 | Raman源码+pair截图；主agent报告两header均42 |
| 双卡主体 | summary body min-height78；内容宽≥110px用48px素材与数字row-reverse并排，右卡emblem固定68×78。138px外宽减去左右padding/边框后仍达到110px内容断点，故320截图触发紧凑横排。 | Raman源码+pair截图；主agent报告主体78 |
| 双卡底部 | 左direct margin-top:auto将末尾行推至卡底，右hint自然位于78px徽章下；截图中左卡成员/直属信息完整，右侧不再出现之前大块空白，末尾文字下沿对齐。 | Raman独立查看pair截图；138×194.92及无overflow来自主agent实测 |
| 大数字/异常态保留 | >6位count沿用纵排fallback，数字仍按真实位数缩放且可横向滚动；未知值显示破折号。空态邀请、错误重试仍以canOpen避免误打开成员页。 | Raman源码；超长数字/空/错的新增布局未实景认证 |
| 双卡两入口 | TeamSummaryCard ready且total>0时emit open，父页go('/pages/team/tree')；等级整卡链接到'/pages/team/rank'，保留Enter/Space及焦点样式。 | Raman独立核对调用链；两入口CUA跳转正确由用户报告 |

### 浅色顶部入口补证：旧缺口已解除

旧的[invite-320-vi-light-final.png](D:/WORKS/PLAN/.wt/uvel-design-preview/invite-compact/invite-320-vi-light-final.png)确实包含覆盖邀请卡顶部的页面搜索/通知浮层。这一观察保留为历史证据，不将其错误归因于本轮3个CSS diff。

本轮Raman已独立查看新图[invite-320-vi-light-clear.png](D:/WORKS/PLAN/.wt/uvel-design-preview/invite-compact/invite-320-vi-light-clear.png)：邀请卡标题、记录图标、Quy tắc规则入口、金额、两行正常说明、主CTA及底部三入口均完整；顶部不再被pagechrome覆盖。图中规则入口外的蓝框为聚焦/操作标记，不是裁切或布局遮挡。

用户同时明确提供：DOM card top94.66、bottom324.73，完整位于工具栏下；两个顶部入口已分别真实打开规则和奖励记录弹层，CUA观察到对应正确标题。这些属于主agent实景结果，本reviewer未重演；结合无遮挡截图与未变事件处理，可解除历史“320vi-light顶部两入口无遮挡/命中待补证”项。无需修改chrome，未扩大本轮代码范围。

### 证据范围与pending

- 邀请卡：已独立看390中文暗色、320越南文暗色、旧浅色和新增无遮挡浅色最终图。主agent提供正常尺寸及顶部两入口实际打开结果。本次不把截图当作实际分享、复制、支付、服务端结算或读屏播报证明。
- 双卡：已独立看[pair-320-vi-light.png](D:/WORKS/PLAN/.wt/uvel-design-preview/invite-compact/pair-320-vi-light.png)，确认该截图中的左右卡视觉对齐。138×194.92、两header42、主体78、底文案下沿一致、无overflow及团队/等级两入口跳转正确，均由主agent实测/操作提供。
- 双卡暗色中文图补证已完成：Raman已独立查看390中文暗色、320越南文暗色重新定位图、320英文暗色；对应最终几何见文末暗色双卡补证附录。本项不再pending。
- loading→ready、失败→重试、奖励停用、无码、大金额/超长count、空团队/错误态布局切换，以及原生APP、TalkBack/VoiceOver，本reviewer未操作；保持pending，不据静态代码或给定测试计为运行通过。
- 参考稿用于结构与紧凑度方向比较；没有把参考图里的演示金额、人数或语言当真实业务要求。

### 当前审查指纹

3文件diff SHA-256：`8b12d679b754eace7fcdf3db34e57c66dea29704c7e3ecf6d178f4f2f41f9321`。

| 文件 | SHA-256 |
|---|---|
| `src/components/team/invite-earn-card.vue` | `e36e503e6cb53a9e6b898adc62746a0b61699a85c3f23879720500cb01946e48` |
| `src/components/team/team-summary-card.vue` | `9ba4dfab6ddb6c24997af530cd3221d264245ff74030e9834b7a042562892485` |
| `src/pages/team/team.vue` | `9b5e585beb388f8fc01511d8ff03505be8653fc02d361b42271434f88d5fd4cb` |

| 已查看/读取证据 | SHA-256 |
|---|---|
| [invite-390-zh-final.png](D:/WORKS/PLAN/.wt/uvel-design-preview/invite-compact/invite-390-zh-final.png) | `b80cf23e8ba8b81fc620617fbca750888678e50095137f8a9d4b41a24404edfb` |
| [invite-320-vi-dark-final.png](D:/WORKS/PLAN/.wt/uvel-design-preview/invite-compact/invite-320-vi-dark-final.png) | `18749b2984f22125f7d0a7a05f3549d05dab9a33c3bba75a6f1a9cce3277e7be` |
| [invite-320-vi-light-final.png](D:/WORKS/PLAN/.wt/uvel-design-preview/invite-compact/invite-320-vi-light-final.png) | `fb1af1c25a36118ac59f5cec778a3394e0de90b4fcca96fb06be901b7efc3b95` |
| [invite-320-vi-light-clear.png](D:/WORKS/PLAN/.wt/uvel-design-preview/invite-compact/invite-320-vi-light-clear.png) | `95b199851a81e20ccef68ed3634e22ddc127fa318074550b7958b699d4ce413f` |
| [pair-320-vi-light.png](D:/WORKS/PLAN/.wt/uvel-design-preview/invite-compact/pair-320-vi-light.png) | `931e94d0db7611f4e47d8acabd61aa8987e1c88fde30e4d3aa64b67b98930eb2` |
| [before-after-metrics.json](D:/WORKS/PLAN/.wt/uvel-design-preview/invite-compact/before-after-metrics.json) | `2a8eed2a7698dcd912cbbc2d57fbbea4ef5c6a4ade07bbe26d82f633d35725e2` |
| [参考team-overview-v2.png](D:/WORKS/PLAN/.wt/uvel-design-preview/design-proposals/2026-10-25-fidelity/team-overview-v2.png) | `b31088161e4c75f432a6f77d065457ceb2d28d4a748fd1872831b7c6fa4f01bb` |


### 暗色双卡最终补证（Raman，2026-10-26T07:15:43.203Z）

按用户要求仅独立查看以下三张新图，并核对runtime.json对应最终记录；未重新检查源码、未操作浏览器或新增交互测试。用户说明源码无后续修改，原源码审查指纹及结论继续沿用。**暗色中文pending解除，邀请卡与双卡评分均维持9.2/10。**

| 独立查看范围 | 最终截图 | runtime最终label | 左/右外框尺寸 | 两卡top / bottom | overflow | 图片复核结论 |
|---|---|---|---|---|---|---|
| 390中文暗色 | [pair-390-zh-dark.png](D:/WORKS/PLAN/.wt/uvel-design-preview/invite-compact/pair-390-zh-dark.png) | `390-zh-dark` | 173×176.67 / 173×176.67 | 333.66 / 510.32 | false / false | 两卡等高；标题、数字/素材、等级徽章与底文案完整，无截图可见遮挡或裁切 |
| 320越南文暗色（重新定位） | [pair-320-vi-dark.png](D:/WORKS/PLAN/.wt/uvel-design-preview/invite-compact/pair-320-vi-dark.png) | `320-vi-dark-clear` | 138×194.92 / 138×194.92 | 249.40 / 444.31 | false / false | 两卡等高；标题、数字/素材、等级徽章与底文案完整，无截图可见遮挡或裁切 |
| 320英文暗色 | [pair-320-en-dark.png](D:/WORKS/PLAN/.wt/uvel-design-preview/invite-compact/pair-320-en-dark.png) | `320-en-dark` | 138×184.00 / 138×184.00 | 254.73 / 438.73 | false / false | 两卡等高；标题、数字/素材、等级徽章与底文案完整，无截图可见遮挡或裁切 |

320越南文暗色最终图中，左侧两行标题、48px素材/数字组合与右侧徽章的分区保持紧凑；对应最终记录两header均42px、左body/右emblem均78px，左右末尾文案下沿约431.646px一致。320英文暗色为同一42/78px窄屏结构，英文标签和底文案完整。390中文暗色双卡均173×176.67px，图文横排与徽章完整，未见原先右卡大块空白；该宽屏记录左header约34.667px、右header32px，未将窄屏42px或底文案像素级同线结论泛化到390。

runtime.json旧label `320-vi-dark` 的top656.0625/bottom850.9792属于手机范围外的历史几何诊断，不用于“完整位于手机内”的最终验收。最终越南文暗色证据使用 `320-vi-dark-clear`（top249.3958/bottom444.3125）及重新定位的 `pair-320-vi-dark.png`，与JSON notes一致。before与较早CTA/art测量同样不被升级为最终证据。

这些补证关闭的是三组已列明暗色正常态的截图/几何缺口；测试日志、导航结果仍沿用其已有来源，不宣称Raman重新运行。原报告关于loading/失败/停用/无码/超长count、原生设备和读屏的pending继续保留。

| 新证据 | SHA-256 |
|---|---|
| [pair-390-zh-dark.png](D:/WORKS/PLAN/.wt/uvel-design-preview/invite-compact/pair-390-zh-dark.png) | `fb5f4a30c9539ef91c47ca526a626187c8f8380413d85e50506a83cad5d6fcac` |
| [pair-320-vi-dark.png](D:/WORKS/PLAN/.wt/uvel-design-preview/invite-compact/pair-320-vi-dark.png) | `b39a3f79f2b8f189228d374ec4cd57869d30a23a628b9c81bd1580ad737c44bf` |
| [pair-320-en-dark.png](D:/WORKS/PLAN/.wt/uvel-design-preview/invite-compact/pair-320-en-dark.png) | `4050918d21523ac38bfed7b8e95a14c292e4719cef3074048d879952e31d9616` |
| [runtime.json](D:/WORKS/PLAN/.wt/uvel-design-preview/invite-compact/runtime.json) | `d6422528ef89736171629f7bd8c2b5b25a8581e39d3e6b911c63a8352bb8bf17` |
