# 数据可见性与局部动效 · 独立视觉 A

2026-10-28，阶段包 `index-BfQ3iod9.js`。本轮本人使用官方 CUA，在独立 Chrome 标签操作 5291；没有改产品、构建、跑测试、提交或触碰用户 5237。评分只覆盖下列本地原型实景。

**最终有限结论：兼容终包 `index-2zHt78Yy.js` 的个人排名漏遮已独立复验关闭，首页隐私 9.2；新火箭连续动作与 reduced-motion 9.2。其余八项沿用本报告阶段包的已验范围和分数，没有重跑或改标成终包证据。详见文末“兼容终包两项复验”。**

**最新关闭控件补验：`index-C5I8XvUO.js`，320 VI 暗 / 390 ZH 浅的 44×44px 关闭触区及透明边缘实际命中，9.2。仅此增量更新，原十项分数与证据归属保留；详见文末补节。**

**阶段一历史结论（保留）：一条首页个人排名漏遮 P2，首页隐私 8.6，未通过；其余已测项达到 9 分。用户随后将作业池图标改为火箭轻跳与尾焰，当时新要求尚未取证、不评分。** 下文阶段包表格、失败截图及旧双箭头记录均保留原版本和原结论。

## 指纹和实际读取范围

固定根 `wallet-r25/web-privacy`，发布到 5291 对应根。实际入口 `index-BfQ3iod9.js` / `index-H57LADHv.css`；固定与发布 HTML SHA256 均为 `2656b0a493fe71fbecf32ab7fa4a0340087c79dbc90dc70d4fc6d8ae1d941a9f`。见[构建核对](privacy-build-a.json)。每条截图记录保存实际入口、尺寸、主题与 DOM，不保存应用 store/storage、认证或原始 API。

本人逐页实点四处眼睛，以实际底导航跨页；覆盖 **320×693 越语浅/深、390×844 中文浅/深**，四页均有显示和隐藏截图。另实测隐藏后刷新、团队收入构成展开、设备详情展开、首页进度环、团队下方统计、作业池说明入口和商城无 hover 连续动效。完整[运行记录](privacy-runtime-a.json)、[量测摘要](privacy-summary-a.json)与[图片索引](evidence-index-a.md)。父线程提供的编译及测试绿色属于父线程验证，未替代本人实景。

## 分项结果

| 项目 | 分数 / 10 | 限定结论 |
|---|---:|---|
| 首页隐私遮罩 | **8.6 OPEN** | 标题收益、变化比例、完成数、任务进度与环、设备数量/收益可遮并恢复；下方个人设备预估排名仍显示 `#184`，见 P2-A-01。 |
| 赚取隐私遮罩 | **9.2** | 收益汇总、UVT、队列数量/完成任务数、设备收益、流水与历史金额已遮；展开设备后的产能、接单数、进度百分比、完成数也遮，数值进度填充移除。日期、运行时长/倒计时保留。 |
| 团队隐私遮罩 | **9.3** | 月收入、结算金额、成员/直接邀请、等级、首购数、双区贡献、票数/占比/预估均遮。展开构成后 30/70% 比例填充移除，恢复时随数值恢复。公开邀请活动奖励 10 UVT 保持。 |
| 我的钱包隐私遮罩 | **9.3** | USDT、UVT、折算价值、今日/累计/算力/团队收益及确认中/待释放金额已遮，标题后眼睛可恢复；下方个人等级也遮。公开换算单价继续显示。 |
| 四页共享状态、持久化与眼睛布局 | **9.2** | 四处均实际 44×44px，位于相应标题之后；在一页操作后其它页沿用状态。隐藏后真实刷新首页仍为 `aria-pressed=true`，恢复后跨页读到 false 和原值；无横溢。没有用直接写 storage/store 制造结果。 |
| 团队“查看明细”右置 | **9.2** | 320 VI 明暗右缘均 304px，390 ZH 均 374px，即距屏幕右侧 16px；点击区域高 44px，越语未撞 UVT 左区或裁切。 |
| earn 任务数位于队列标题下 | **9.2** | 320/390 均独占标题下的 18px 行；隐藏态任务数字同样遮，长越文正常换行/容纳，未进入标题右侧统计槽。 |
| earn 新空槽外观 | **9.2** | 明暗两宽已目检：磨砂底、虚线外框、“+”和右箭头清楚；按钮 min-height 实测 60px，内“+”底座 32px，320 越文未裁切。 |
| 商城 6.8s 自动错峰扫光 | **9.3** | 两宽两主题已目检。指针移出卡片后连续观察 14.2s，四卡 120 次取样均无 hover，仍有扫光；迭代周期及错峰有真实事件证据。售价保留，扫光不覆盖商品正文。 |
| 旧双箭头/轨道 1.8s 动效 | **9.2，历史限定** | 已实测两轮 1.8s 迭代、44px 入口及说明弹层可达。用户已更改图形要求，本行不代表新火箭验收。 |
| 新火箭持续轻跳 + 尾焰 | **N/T** | 待新冻结包，仅追加该项，不拿旧双箭头证据代签。 |

以上不是平均分；首页低于门槛时，不能把四页隐私整体标记通过。

## P2-A-01：个人设备预估排名漏遮

在 320 VI dark，任一眼睛打开隐藏后，进入首页并滚动到底部“Hoạt động mạng”，个人栏目“Hạng thiết bị ước tính”仍显示 **#184**。实际 `aria-pressed=true`；数值矩形为 **x222.44、y484、44.19×24.67px**。见[失败截图](privacy-home-320-vi-dark-rank-leak.png)、[独立 DOM 读回](finding-home-rank-a.json)。

冻结包对应 `network-pulse-card.vue` 的 `rankCell.v` 直接输出排名。该值源于当前账号绑定手机的有效算力；规则文案也明确其为个人设备预估，不能当作公开网络总数豁免。父线程已明确公共 network 人数/设备数保留为预期，它们不在此缺陷范围。

最小修复：让个人 rank 的渲染值接入共享可见性；保留公开统计和不含具体排名的通用说明。本人确认已上榜状态的说明弹窗源码只有规则文字，没有具体排名，因此没有把整个说明弹窗扩成必改项。父线程与 B 也确认此项，Nash 已修源码；当前包失败历史与 8.6 保留，待新包隐藏→恢复的独立复验后追加关闭依据。

## 隐私和图形证据

- 首页：[320 浅色显示](privacy-home-320-vi-light-shown.png)、[隐藏](privacy-home-320-vi-light-hidden.png)、[下方任务环/设备](privacy-home-320-vi-light-hidden-lower.png)。实际环从两个 circle 变成只有底轨，数值弧的 `stroke-dasharray` 节点不再存在。[刷新保持隐藏](privacy-persist-reload-home-320-vi-light.png)。
- 赚取：[390 暗色展开显示](privacy-earn-390-zh-dark-expanded-shown.png)、[展开隐藏](privacy-earn-390-zh-dark-expanded-hidden.png)。54% 作业进度填充消失，产能/接单数/奖励及完成数改为遮罩；“约4分39秒剩余”和时间仍在。
- 团队：[320 浅色构成显示](privacy-team-320-vi-light-graph-shown.png)、[隐藏](privacy-team-320-vi-light-graph-hidden.png)、[390 暗色下方统计](privacy-team-390-zh-dark-lower-hidden.png)。比例子节点 2→0，底轨仍保留；等级六边形属于装饰，内部 V2 已改遮罩。
- 钱包：[320 浅色隐藏](privacy-wallet-320-vi-light-hidden.png)、[恢复](privacy-wallet-320-vi-light-shown.png)、[390 暗色隐藏](privacy-wallet-390-zh-dark-hidden.png)。完整显示值 $52,800.64、1,280.00 UVT 与折算值可恢复；隐藏值并非把金额用 CSS 透明化。

日期、倒计时、公开商品价格与公开活动定额不随个人遮罩消失。已领取福利的其它生命周期、其它详情页/弹层、账号切换和跨设备同步没有在本轮另造数据复验；不把当前样本扩展成全站资产隐私认证。此功能为展示偏好，不声称从网络或程序内存中删除数值。

## 布局及动效实测

[320 布局](earn-layout-320-a.json)、[390 布局](earn-layout-390-a.json)：jobs 行紧接标题行下边，行高 18px；图标入口 44×44px。空槽实测 `backdrop-filter:blur(12px)`、半透明底和 dashed 边框。[320 light 空槽](privacy-earn-320-vi-light-slot.png)、[320 dark 空槽](privacy-earn-320-vi-dark-slot.png)、[390 light 队列](privacy-earn-390-zh-light-shown.png)。本轮点击的是说明图标，未触发添加设备业务写入。[说明弹层截图](privacy-earn-320-vi-light-explainer.png)。

旧图标[循环记录](earn-animation-a.json)：双箭头和轨道各捕获 elapsedTime 41.4→43.2，相隔 1.8s；运行时 opacity/transform 实际变化。此记录保留原图形和原包，不用于新火箭要求。

商城[真实循环与取样](store-sheen-animation-a.json)：四张可见卡 delay 分别 **0.6/1.7/2.8/3.9s**；第一张两次迭代 wall 时间相差约 6799.6ms、elapsedTime 40.8→47.6，第二张相差约 6799.8ms。同排事件相差约 1.1s。四卡 opacity 取样峰值约 0.76–0.85，120 次均 `hover=false`。记录里 index=-1 为不在前四卡采样集合的其它商品事件，不用于前四卡周期结论。

[390 light 稳定扫光图](privacy-store-390-zh-light-sheen-active.png)、[390 dark](privacy-store-390-zh-dark-sheen.png)、[320 VI light](privacy-store-320-vi-light-sheen.png)、[320 VI dark](privacy-store-320-vi-dark-sheen.png)。初次滚动进入时下排商品会经过既有入场淡入；不把该过程帧当作缺图。320 首排卡宽138px、内容 clientWidth/scrollWidth 137/137，长越文说明与价格未横溢，见[商城量测](store-320-layout-a.json)。

[减弱动态实测](animation-reduced-a.json)：媒体 reduce=true 时，旧 earn 两个动效均 animation-name:none/transform:none，商品扫光伪元素 display:none/name:none；随后恢复媒体 false。没有拿源码声明代替该读回。新火箭还需在补包单独复验。

## 当前边界与状态

截至本阶段所有截图均为本人独立 5291 的 `index-BfQ3iod9.js`，没有使用 B 的图或分数代替本人判断。48 张截图、48 条主记录覆盖指定矩阵及必要的展开/滚动/恢复样本；仅本地浏览器原型，不含正式 Java/JWT/WS、真实登录、物理设备、真机 GPU 性能、系统字体放大、读屏或独立 H5 交付。

本人已通过实际眼睛恢复最初的“显示”偏好，跨页确认首页值恢复，见[恢复记录](privacy-restore-a.json)。未修改用户演示业务状态，5291 保持 off，媒体恢复正常。后续补包只需验证 P2-A-01 与新火箭图标；其余限定签项及历史失败不覆盖、不重标。

## 兼容终包两项复验 · 2026-10-28

最终发布 HTML SHA256 为 `9BA0E17CFDCB960FB0B4C456BF750DF6F5B416647020968A270FD6EC5510534B`；本人核对发布根文件哈希，并刷新自己的 5291 标签。9 条新增运行记录实际入口均为 **`index-2zHt78Yy.js`**，主 CSS 为 `index-H57LADHv.css`。见[最终指纹](final-compat-build-a.json)、[9 条 DOM 与截图记录](final-two-items-runtime-a.json)、[量测摘要](final-two-items-summary-a.json)。此前 `index-BJuG9oWu.js` 只留下预先指纹，不用于此次最终签分。

### P2-A-01 关闭：个人排名隐藏与恢复，9.2 / 10

在最终包实际点眼睛后，320 VI 浅/深色下首页个人设备预估排名均显示 `••••`，眼睛 `aria-pressed=true`；公开成员数和设备数仍显示。随后实际点眼睛恢复，暗色同一栏目重新显示 `#184`，`aria-pressed=false`。这是旧失败路径的复验，没有把公开网络统计加入遮罩，也没有用 storage/store 写值制造结果。

证据：[320 浅色隐藏](final-rank-320-vi-light-hidden.png)、[320 暗色隐藏](final-rank-320-vi-dark-hidden.png)、[实际恢复](final-rank-320-vi-dark-restored.png)。浅/深色均未横溢；公开人数从 12,741 到 12,742 属演示实时变化，不影响该结论。首页其它遮罩/图形与恢复范围继承阶段一已测证据；**旧 8.6 及漏遮截图仍是修复前失败历史**。

### 新火箭持续轻跳、尾焰与喷射，9.2 / 10

本人目检了 [320 VI dark](final-rocket-320-vi-dark.png)、[320 VI light](final-rocket-320-vi-light.png)、[390 ZH light](final-rocket-390-zh-light.png)、[390 ZH dark](final-rocket-390-zh-dark.png)。图形为竖直火箭，浅色蓝、暗色绿，未残留旧双箭头/轨道；SVG 实际 22×22px，外围说明入口 44×44px，标题、右侧队列数与火箭未相撞。四个场景 `scrollWidth` 等于视口宽。

[连续动效证据](final-rocket-continuous-a.json)为 5.109s 观察、43 次实际取样及 16 个 `animationiteration` 事件：轻跳 elapsedTime 27.2→28.8→30.4，周期 **1.6s**；尾焰相邻事件差 **0.72s**；喷射相邻事件差 **0.9s**。transform/opacity 随时间变化，全部取样的外围点击区始终 **44×44px**，没有随内部轻跳缩放。这里是浏览器运行事件与样式取样，不是只读取 CSS 声明，也不是 FPS 或真机性能测试。

实际点击新火箭打开越语通用说明弹层，并由“Đóng”关闭，见[入口实点结果](final-rocket-320-vi-light-dialog.png)。没有点击购买/添加设备或其它业务提交。

[reduced-motion 记录](final-rocket-reduced-a.json)中媒体为 true，连续观察 2.209s：火箭、尾焰、喷射均 `animation-name:none`、`transform:none`，无迭代事件；喷射 opacity=0，火箭和尾焰静态可见，前后矩形一致。见[静态截图](final-rocket-320-vi-light-reduced.png)。随后恢复媒体 false，实际动画名重新出现。

[发布 CSS 读回](final-rocket-css-a.json)确认选择器为 `.earn-capacity-info[data-v-4b6766d5] .earn-capacity-info__rocket`（flame/exhaust 同类），内部节点不再要求 scoped 属性；reduce 规则也为这种后代选择器。两份跨源字体样式表因浏览器 CSSOM 安全限制跳过，未用于结论。本人实景仍是 Web SVG 路径，**未在 App 的 NxNativeSvg/v-html 运行环境或物理设备上取证**；父线程所报 Web/App 编译、1 项转换测试及 13 项 markup/component 测试只作为其提供的构建/测试依据，不冒称本人原生实景。

### 本轮最终逐项分数

| 项目 | 分数 / 10 | 依据归属 |
|---|---:|---|
| 首页隐私遮罩（含个人排名） | **9.2** | 阶段一已验其它范围 + 终包本人排名修复复验；旧 8.6 保留。 |
| 赚取隐私遮罩 | **9.2** | 继承阶段一指定矩阵，未重跑。 |
| 团队隐私遮罩 | **9.3** | 继承阶段一指定矩阵，未重跑。 |
| 我的钱包隐私遮罩 | **9.3** | 继承阶段一指定矩阵，未重跑。 |
| 四页共享状态、持久化与眼睛布局 | **9.2** | 继承阶段一实际点击/刷新证据，未扩展跨设备。 |
| 团队“查看明细”右置 | **9.2** | 继承阶段一 320/390 明暗量测。 |
| earn 任务数位于队列标题下 | **9.2** | 继承阶段一指定布局范围。 |
| earn 磨砂虚线空槽 | **9.2** | 继承阶段一指定布局范围。 |
| 商城 6.8s 自动错峰扫光 | **9.3** | 继承阶段一真实循环、无 hover、reduce 证据。 |
| 新火箭连续动作、说明入口及 reduce | **9.2** | 终包本人 320 VI / 390 ZH 明暗、实际事件、点击和减弱动态。 |

本轮限定范围无剩余 P2。没有重审或签署全站、独立 H5 交付、正式服务、真实登录或物理设备；未覆盖的其它业务状态、系统字体放大及读屏等边界沿用上文。各项独立达到门槛，不使用平均分。旧双箭头 9.2 仅为历史记录，已由新火箭这一项替代。

收尾以[最终清理记录](final-cleanup-a.json)为准：媒体恢复正常、隐私恢复显示、5291 代理 off，本人标签关闭；保留预览服务，不触碰 5237。此次仅写本目录证据和报告，没有修改产品、运行构建/测试或提交。

## 关闭控件补包 · 2026-10-28 · 9.2 / 10

本次只补作业产能说明弹层的关闭控件。B 报告的旧 29.34×30px 热区属于其发现，本人不冒称旧尺寸由本人测得；此前火箭 9.2 包括入口与动效，没有证明旧关闭控件透明边缘具备 44px 热区。此处保留该覆盖缺口，新增实际补验，不改写旧证据。

实际入口 **`index-C5I8XvUO.js`**，主 CSS `index-H57LADHv.css`；发布 HTML SHA256 **`DC5B30AEC3A8A1DD584F538B6A7BE8D8831207F701D236ED6FFC06346925280C`** 已核对。见[补包指纹](close-hit-build-a.json)、[4 张截图及 DOM](close-hit-runtime-a.json)、[4 次实际边缘点击](close-hit-edge-clicks-a.json)。本次仍只操作本人 5291 标签，未使用 B 的 5294。

| 场景 | 实测根 / 视觉面 | 真实边缘点击（iframe CSS 坐标） | 结果 |
|---|---|---|---|
| 320×693 VI 暗色 | 44×44 / 30×30；根 flex=0 0 auto、flex-shrink=0；面 border-box | 左侧 (260, 238.74)，下侧 (280, 258.74) | 均处在30px视觉面外、44px根内，实际指针按下/抬起后弹层数量由1变0，赚取路由保持；再次打开正常。 |
| 390×844 ZH 浅色 | 44×44 / 30×30；根 flex=0 0 auto、flex-shrink=0；面 border-box | 右侧 (370, 523.43)，上侧 (350, 503.43) | 均处在视觉面外、根内，实际关闭成功；再次打开及返回原赚取页正常，无残余弹层。 |

各点击位于根边缘内侧2px，距离视觉面边界5px。用实际 `Input.dispatchMouseEvent` 指针事件完成，没有用 DOM `.click()` 直接触发 handler；点击前的 `elementFromPoint` 命中关闭根，点击后实际 DOM 已移除弹层。

本人已目检 [320 暗色弹层](close-hit-320-vi-dark-before.png)、[320 关闭返回](close-hit-320-vi-dark-returned.png)、[390 浅色弹层](close-hit-390-zh-light-before.png)、[390 关闭返回](close-hit-390-zh-light-returned.png)。长越语标题正常换两行，关闭控件未被压缩、遮挡或挤出右边界；两宽均无横溢，aria-label 为“Đóng”／“关闭”，role=button、tabindex=0 保留。

**限定结论：关闭控件视觉与边缘命中 9.2，本增量无剩余问题。** 原排名遮罩、火箭动画、reduce 及其它签项维持各自版本和覆盖范围，本次没有重新测试这些矩阵，也不从当前关闭动作外推系统返回键、读屏、真机触摸或 App 原生实景。父线程所报2文件26测试及Web构建通过属于其验证；交接时Native仍在编译，本人没有将其记为完成或原生通过。

[补验清理](close-hit-cleanup-a.json)：本人标签关闭，初始中文／390／暗色／首页恢复，隐私 aria-pressed=false（显示）、reduced=false，5291代理off，保留服务。未改产品、构建、运行测试或提交。
