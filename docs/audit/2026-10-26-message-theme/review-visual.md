# 消息与主题专项独立视觉审查 B

日期：2026-10-26起；最新增量复审2026-10-27。**最新增量见文末“PR5b0C9J清稿重入tail局部复评”：浅320越文清稿后两次重入结果9.2，受理；旧scroll0回归在该路径闭环。** 历史入口／日期叠字9.2、counter叠字9.1继承3jJgdd29五帧及读回范围。C2xTeVme取色与受控图片尺寸补证、暗色composer材质9.2、浅色9.1、小屏输入布局9.2、多行末尾9.2、5237原会话操作后结果9.2、透明偏好9.2均保持各自历史证据范围，不求平均，不冒称全部基于最新包或全部状态通过。真机／真实服务另列。旧失败与历史分保留，本审不操作浏览器或同步H5。

TIME-01旧实现基线为 APP `e2cad48f7c7314eca032724ddd6e6aa10bd8fcd0`；TIME-01、ATTACH-01与管理页补修曾按R5产物及实景复评，R7另补fresh时钟及发送场景，R8单独关闭SEND-01 reduced按住态问题。下文保留待证与勘误历史；当前要求以最新用户指令、本页总表及末尾R17／R18范围为准，旧版本通过不外推为新要求已通过。用户已明确先完成APP、暂停H5同步；H5 `cd94809` 初步产物不作发布或本轮验收完成的依据。

**当前：c01及24／28用户图仍是旧方案的真实失败，sampled材质原签不重开。历史入口／日期叠字及counter覆盖历史消息两项已局部通过；清稿重入scroll0另由PR5b0C9J新截图和两次重入读回复评通过，不以旧初始tail代签。旧浅320双图差异仍不追认时序或原因；受控图片尺寸同步已验，真实网络加载未验。**

R5视觉限定签分不覆盖其后交互审查发现的两个P2：原生分页前测超时、附件权限响应乱序。后续实现已通知修复，交互闭环由Noether独立核对，本视觉审查不代签、不把早先待修状态冒称R7／R8仍未实现，也不把测试总数当运行闭环。SEND-01的reduced问题由本审在R8单独关闭。

用户随后新增SEND-01：R6将实际改变发送按钮的可发送强调色与轻按反馈。因此，下文早先“R6不改CSS／布局”的通知仅是新增SEND-01之前的历史范围，不能继续作为R6没有UI变化的结论。原十一项视觉分数保留，新增第十二项不借旧灰色按钮截图签过。

R2 历史结论保留：八项达标，MSG-01 为 8.6 分；TOP-01 原 8.8 分来自看图误判，更正为 9.2 分。R3 的 MSG-01 为新增复评，不把 R2 旧截图、旧颜色或旧评分改写为当时已通过。

本审仅读取源码、冻结清单、运行记录，并用 `view_image` 逐张查看实际截图；未操作浏览器、未执行 Git、未修改任何生产源码或测试。本次唯一写入文件为本报告。

## 版本及证据边界

- “APP 实景”在本报告中指 APP 工作树构建产物的本地浏览器预览，不代表 APK/IPA 真机运行。本地模拟数据不等同于 TEST 真服务、真实人工会话或生产业务。
- APP R1 清单为 [app-build-r1.json](app-build-r1.json)，记录基线 `c17d42d464fdd82c0cdc62b69fed825d8a5a4a02`。审查 R1 时，40/40 个源码文件、341/341 个构建文件哈希匹配。
- R2 仅在 `src/styles/message-center.css` 的 `.message-mark-all` 增加 `min-width:44px`。独立比对 APP R1 清单，只有此文件变化；在内存中移除该声明后，文件哈希精确恢复为 R1。其他九项相关生产源码没有借此重新归版。
- 本审在 R2 核验时逐文件核验 APP、H5 各自工作树：双方均为源码 40/40、构建文件 341/341 匹配。H5 使用其独立工作树核验，没有拿 APP 文件替代 H5 文件。收到 R3 修改通知后，不把这次历史核验冒称为当前工作树仍与 R2 完全相同。
- APP R1、H5 R1 的标题矩阵均逐张目检三语 × 深浅 × 320/390 共 12 格；矩阵实际截图尺寸为 320×693、390×844，不写成 320×568。
- 本对话已逐张目检 APP R1 的 32 张 `app-*.png`；另外目检 H5 R1 的 12 张长计数矩阵及 APP/H5 R2 补图。没有采用 `draft-*`。R1 原图继续作为 R1 证据，不改称 R2。
- [app-runtime-r1.json](app-runtime-r1.json) 为 18 条，[h5-runtime-r1.json](h5-runtime-r1.json) 为 14 条；R2 标签已分别放入 [app-runtime-r2.json](app-runtime-r2.json) 的 2 条及 [h5-runtime-r2.json](h5-runtime-r2.json) 的 11 条。本报告按最终分离后的文件及标签引用。
- 509 项 scoped tests、5 项 node tests、vue-tsc、生产构建，以及 R2 头部 12 项测试、APP 原生资源编译通过，采用主代理提供的完成记录；本审没有重跑。R1 清单中的 `browser/native:pending` 是冻结时字段，不把后来完成的事情反写为当时已通过。编译通过不能代替真机运行。

| 清单 | sourceFingerprint | artifactFingerprint |
|---|---|---|
| APP R1 | `5551259bfb5faa7574bafbf0fc962a8da7db6a28b54289e0d11b5d1852ce0a0a` | `1496541e58c9d61b7fd3cc59feeb804301cd494ddf17fbf13d9139f049775def` |
| H5 R1 | `c6a744320c00c4eb337f02986e47c6a98d4a1e849b355b00341febeed90e2986` | `c467f18198e1f0e10750d8a64e746e0df2bc1a7230a1b697387876fdf5e95287` |
| APP R2 | `76cc951ab545cafac7fe41899eb085e94fc3892836024198ef84147ac8542afb` | `7949b0cbfd735a661f281c8aef8dd7baa9d9c966c35bed3d13322206c8ca17ba` |
| H5 R2 | `ca4447f87f90634d6a90139004a4973ddede5e373e9684aade5fba0991e958df` | `ef5310701b9efcba96750b0c67e75a7a1340e26882ceb7a0e23233f4812fa7c3` |

R2 清单：[app-build-r2.json](app-build-r2.json)、[h5-build-r2.json](h5-build-r2.json)。本报告的“通过”仅指对应行已观察、已明确列出的范围，不外推为全平台、全状态通过。

## 既有十五项分版本状态（旧证据保留，当前新增与覆盖范围见R16节）

| 项目 | 分数 | 判定 | 实际证据与判断 | 剩余风险／未覆盖范围 |
|---|---:|---|---|---|
| LIGHT-01 | **9.2** | 已观察范围通过 | [老用户加购礼](app-activity-light-320-3.png)、[首购成长礼](app-activity-light-320-2.png)、[购机赠礼](app-activity-light-320-1.png) 已改为浅色底、深色文案及克制的蓝色装饰；320 英越截图文字与图片未相互遮挡。商城 [正常](app-store-activity-light-390.png)、[换机型](app-store-alternate-light-390.png) 与 [H5 缺主图](h5-r2-store-light-missing-main.png)、[双图失败](h5-r2-store-light-broken.png) 保持角色与占位；[深色参考](app-activity-zh-dark-390.png) 保留黑灰设计。运行记录中的期限入口高 44px，检查项未报告横溢。 | 是代表性主题／语言／活动状态验收，不是所有排列组合；真实后端完整 banner 发布、主题资源版本及正式数据变化没有实景，不入分。 |
| MSG-03 | **9.3** | R2 已观察范围通过 | APP/H5 R1 各 12 格：1301 条未读紧随标题，全部已读在右侧同行，无交叠。运行记录保留 Enter 操作前 1301、后 1298 的真实演示口径：只清除了 3 条通知未读，没有清掉客服未读；[零未读截图](app-message-zh-dark-390-read.png) 隐藏操作。R1 英文 43.0417px、越文 42.84375px 宽的触区不足确实存在；R2 四张英越窄屏补图及双方对应记录均读回 **44×44**，无横溢，关闭该触区问题。 | R1 的完整交互验收不能追溯写成当时已满足 44px；本项终版包含 R2 补证。自然计数变化、所有更长计数、真机字体及系统文字放大没有完整覆盖。 |
| CTRL-01 | **9.2** | 已观察范围通过；R5管理页补验 | [中文服务页](app-service-zh-light-390.png)、[越文服务页](app-service-vi-light-320.png)、[H5 深色服务页](h5-r2-service-dark-320.png) 的读取恢复为居中文字，无额外按钮底座或外投影；实际记录宽 358/288、高至少 44。H5 R2 当前页 Enter 恢复1301；R5 APP管理页失败后Enter恢复列表，H5 VI320错误及恢复图均已目检，管理页重试44px、透明且无投影。 | preferences、tickets、quota、rank-how、团队详情、staking 等同源候选已核对源码，但未逐页逐异常实景；不把这条签项写成全站所有 retry 都已运行通过。 |
| SHADOW-01 | **9.3** | 已观察范围通过 | [首页浅色领取](app-home-zh-light-390.png)、[首页深色领取](app-home-zh-dark-390.png) 不再带原有黑色下投影；运行记录为 inset only。局部 tint 选择器保留内边缘与光学层，福利卡、机器圆盘光源、签到光晕和底部 Liquid Glass 仍存在。 | 全部业务资格、领取中／不可用／实际领取回执没有逐一实景；当前只签已展示的按钮材质及局部阴影，不代签领取业务。 |
| SHADOW-02 | **9.2** | 已观察范围通过；R5管理页补验 | 原服务头像／按钮／分类及聊天CTA签项保留；R5 [APP暗色320管理页](app-r5-management-zh-dark-320.png)、[正确的390管理页](app-r5-management-zh-dark-390.png)、[H5越文浅色320](h5-r5-management-vi-light-320.png) 均未见旧180px撑高／色块。APP提示区约82.79px，H5越文换行后约100.19px；重试均44px且透明、shadow:none。真实 [图片预览](app-r5-image-preview-dark-390.png) 的图像与关闭入口未被裁切。 | 原9.1分为此前版本历史，R5新增管理页后复评9.2。预览只观察APP暗390打开态和关闭入口尺寸，未见实际关闭操作读回；320／浅色预览、全部弹层及真实附件权限未全面验证。不要求管理页移除确认弹窗。 |
| MSG-01 | **R17普通文字布局9.2；旧分保留** | **APP已见暗390、浅320／390子范围通过** | R17六张final图已original目检：中文／越文长文完整换行，内置HH:mm与自己的状态不盖正文，来信无状态；短消息保持紧凑。滚动记录externalMeta=0、incomingStatus=0、overflow=false。具体文件和版本见末节。 | 本分不代签图文／CTA、所有状态生命周期、失败图标焦点、动态顶部高度或H5新布局。R14对比度估算不冒称R17重新测得；旧8.6／9.3及R14限定9.2保持历史。 |
| MSG-02 | **历史9.3；R16局部轨迹已见，最终待评** | **双向滑入及快确认接续已有草稿运行证据** | R16有效`fast-ack-bubble-entrance`110帧sameNode全true，pending→canonical后继续0.18s linear，位移12→0、opacity0→1；`incoming-entrance`120帧为-12→0、0.18s linear。误采外row的`fast-ack-entrance`不计。R1／R2／R5旧轨迹与历史不重播证据原样保留。 | 当前只证实本轮本地暗390的所列运行轨迹，不外推新构建reduced／历史前插／返回不重播及全部送达时序。最终版本和其余局部证据到齐后再按范围评分。 |
| BADGE-01 | **9.3** | 已观察范围通过 | [浅色 1](app-home-zh-light-390.png)、[深色 1](app-home-zh-dark-390.png)、[深色封顶 99](app-home-zh-dark-390-99.png) 中浮标与右上角标均为黄底深字；记录读回 `rgb(255,203,77)`／`rgb(10,10,10)`，0 时隐藏。两个入口共同消费 token，保留通知／客服各自的未读口径，没有强行使数量一致。 | 浅色封顶及所有未读数切换未逐个截图；真实后台未读同步不入分。 |
| TOP-01 | **9.2** | **复核更正后通过；R5 H5补闭环** | 原共享导航与R2误判更正保留。R5 H5 VI浅320的 [普通态](h5-r5-message-vi-light-320.png)、[真实wheel折叠](h5-r5-message-collapsed-vi-light-320.png)、[错误态](h5-r5-message-error-vi-light-320.png)、[最终恢复](h5-r5-message-restored-vi-light-320.png) 均已目检；双按钮44×44、opacity:1，设置目标为preferences。最终按 `h5-top-return-restored-settled`：标题／分类恢复56／54px、移除inert、scrollTop=0，无横溢，图中3未读与标题同行。 | `h5-top-return-restored`为过渡态，不作最终恢复失败证据，也不删除历史。操作由主代理提供，本审未重新点击；真机触摸／键盘／文字放大未覆盖。 |
| TIME-01 | **R17日期外观9.1；新分隔行为未签** | **暗390可见12px分隔的字号问题关闭** | R17 final滚动图可见“昨天22:07”，对应记录font-size=12px、rect y84.885／height38；居中辅助色、无底座，气泡HH:mm保留。源码及PRD为首次有效消息定位、以后相邻有效时间戳间隔≥86400000ms才分隔。 | 9.1只签该可见日期样本的排版，不借此签三语长日期及24h边界／历史页缝。相邻24h前／恰好／之后、跨午夜短间隔、连续多日链仍是本地运行缺口；旧5分钟规则不再验收，旧8.8／9.3保持历史。 |
| ATTACH-01 | **9.2** | **R5已观察的本地视觉范围通过** | APP中英越浅320及中文暗320／390、H5越文浅320／中文暗390中的附件入口均为中性灰态，44×44、opacity:.45、aria-disabled=true、tabindex=-1；无可见不可用说明或遗留说明行。APP禁用态强制指针激活后dialog／file input为0，仍实际发送文字并出现20:51消息；底部间隔约32px。 | 权限旧响应隔离的行为闭环由Noether独立核对，本分仅签已记录状态的视觉。Enter／Space守卫由源码／组件测试证明，UI未实际派发；H5禁用选择器操作、策略恢复及真相册权限未完整实景。R7本地H5文字发送另有补证。 |
| SEND-01 | **阶段9.2：R12双端已观察视觉／动效** | **所列子范围达标，完整settled因果待补证** | APP暗390及H5浅320各ready／empty图已original目检；玻璃亮暗层次、强调色与禁用区分可接受。H5普通stable-held外44、内40.48／scale(.92)，补齐旧取证缺口。APP/H5正常飞机约-24.704°／-25°并回正；两端reduced RAF采样face／plane均none，H5reduced按住亦none。 | 这9条运行记录未给慢请求／失败／取消与业务settled事件链，不能由busy／turning自行推断成功；迟到owner及Nova关闭分支不代签。仅H5有媒体恢复false记录，APP尚缺同轮恢复记录。R11 8.8及单帧9.1保留为历史；真机、真实服务、全矩阵不入分。 |
| CHAT-TOP-01 | **R17普通态9.2；R11历史9.2保留** | **透明头部、居中身份玻璃、移除右头像限定通过** | R17暗390及浅320／390 final图已目检，16px局部磨砂后标题可读，背后消息没有穿成标题笔画；pill中心约195／160，返回44px，右侧为无绘制44px占位，avatar=0。online点与文字在双主题图中可见绿色，暗色读回rgb(55,201,106)。 | 普通态分数不覆盖长名称／非online长状态及顶部错误／历史提示增减。顶部高度变化后的滚动保持有源级P2，见末节8.8分；旧完整24格不冒充R17矩阵，Nova仍关闭。 |
| AUDIO-01 | **待评分** | **设置图可读，触发与听感仍无运行签核** | APP中文暗390音效设置图已目检，label／hint完整、开关当前为on；源码默认false及历史／前台／成功守卫预审保留。当前runtime-r12九条均为SEND相关，没有WebAudio创建／resume／start-stop或send／receive业务触发记录。 | 一张on截图不能证明默认关闭、真实开关持久化或音频成功播放。需UI操作与WebAudio事件，含首手势、静音／后台／历史／失败等抑制场景；未试听、native未安装，不把波形／事件当设备音量与听感通过。 |
| STATUS-01 | **OPEN；c01新用户图明确失败，不新增通过分** | **布局zoom不是充分修复；根层绘制候选待验** | 本审original目检c01图，输入内部有x≈366／y≈127矩形色阶；前24／28失败不删。布局zoom的16张受控PNG独立比较没有输入变化，但不能覆盖用户实际触发。DF0ikPda浅3209.2／9.1仅保留原静态范围。 | 根层合并、发送双前缀none、ready样式迁移已源码检查，仍须新构建色面／闪烁及玻璃层次双重验收；不以平面背景遮盖问题，不把DOM单层写成GPU单次合成已证。真实物理鼠标未覆盖，不擅切前台。 |

## 未关闭问题、判定更正及最小补验

### P2 历史问题：MSG-01 浅色回执文字可读性不足（R3 已关闭）

以下为 R2 的原始问题及修复建议，保留用于版本追溯；当前 R3 复评见下节，不再作为未关闭缺陷。

- 定位：[conversation-thread.vue](../../../src/components/support/conversation-thread.vue) 的 `.nx-conv-receipt-t`（审查时第 526–529 行）为 `font-size:12px; color:var(--v5-ink-4)`；[tokens.css](../../../src/styles/tokens.css) 浅色 `--v5-ink-4:#A4A8B0`，页面底色 `--v5-bg:#F4F1E9`。
- 本地按这两个源码色值计算亮度对比约 **2.11:1**。[app-chat-history-light-320.png](app-chat-history-light-320.png) 中“已读／未读”比同一行附近的普通辅助文字明显更淡。回执不是不可用控件，不应沿用禁用层级的文字色。
- 最小修正建议：只提高回执文字的局部颜色层级，例如使用现有 `--v5-ink-3` 或专用回执 token。现有浅色 ink-3 与页面底色的计算对比约 **4.53:1**；这里是建议，不代表已修改或已实景验收。不要全局加深所有禁用色。
- 修后补 320 浅色来信／外发的已读、未读、无回执及 390 深色对应帧，确认方向、长消息及错误状态仍正确。若改生产源码，应产生新的冻结清单；不能继续将修改后的代码称作“R2 仅增加 min-width”。

### TOP-01 历史判定：8.8 分，R2 H5 两张取证帧顶部控件未显示（已撤回）

以下三条保留最初判定，均已被本节末尾的复核更正取代，不再作为当前缺陷或补证要求。

- `h5-r2-message-vi-320.png` 当前读取文件 SHA256：`0193fb62ff2447bb75909df61a3025f6758b1fab2f36b4040283fba9bb390bbc`。这张图有标题与列表，但顶部应显示返回／设置的区域为空；消息失败图也存在同类现象。
- 这是一项需要补证的终版可见性问题，尚未定位为生产源码缺陷。R2 唯一生产改动是 mark-all 最小宽度，与 TOP-01 的独立源码没有直接修改关系；因此不撤销 R1 9.2 的历史视觉子签，但不据此代签两张缺失的 R2 帧。
- 请在相同 R2 产物、320 越文深色及消息失败状态稳定后补完整截图，并实际点击返回／设置读回目标。若只是取证时序问题，可新增稳定帧文件而保留现有帧与 R1 记录；若确有运行缺陷，修复后另行冻结。

**复核更正：这是本审看图误判，TOP-01 最终为 9.2 分。** 原始文件未覆盖：H5 英文、越文和失败 PNG 的返回区域 `(12,6,44,44)` 与设置区域 `(264,6,44,44)` 均含相同的实际控件像素；逐区域读取后，每张图分别有 408／625 个最大 RGB 通道大于 30 的非透明像素，最大值为 225／234，排除了“该区域纯黑、控件没有绘出”的最初判断。重新 `view_image` 目检 [失败原图](h5-r2-message-error-320.png)、[越文原图](h5-r2-message-vi-320.png) 及新增 [APP 浅色稳定图](app-r2-message-zh-light-390.png)，并结合 [top-navigation-r2.json](top-navigation-r2.json) 的一致样式与设置往返记录，已足以关闭原取证疑点。原越文图 SHA256 仍为上述值；没有用新图替换旧图，也没有把 R1 改称 R2。此前未定位出生产源码缺陷，现在不再保留“按钮缺失”的有效问题。

## R3 新增复评：仅 MSG-01 回执颜色及排版

本次读取 [app-build-r3.json](app-build-r3.json)、[h5-build-r3.json](h5-build-r3.json) 及 [runtime-r3.json](runtime-r3.json)，并用 `view_image` 查看上表四张 R3 回执图。实际文件扩展名为 `.png.png`，本报告按落盘名称链接，没有重命名或覆盖截图。

| R3 清单 | sourceFingerprint | artifactFingerprint | 独立逐文件核验 |
|---|---|---|---|
| APP | `ad624a73bba8ea14f8e51d06f87eb50e081a76e25e31b8cdd55b9dbb70618063` | `2b45ef3aa3c5e8909674afccde584461e280307ba651076699a784d4f8407fb2` | 源码 40/40，构建 341/341 匹配 |
| H5 | `b3c3619d79a290fb1ae7cb47e5c9b2908a88aef454f7c9090d2a850c818d9906` | `18feaaf506f362e04b41cb4cde1c85a14fecd676bb2f44aee947d81c67ae576e` | 源码 40/40，构建 341/341 匹配 |

- R3 不是只有颜色修改。与 R2 清单比较，双方均有四个文件变化：`conversation-thread.vue`、`chat.vue` 以及对应的 `conversation-thread.behavior.test.ts`、`messages-start-entry.test.ts`。清单还明确记载历史就绪响应及原生滚动位置同步。本次不据回执截图代签这些行为分支，也不把 R2 的其他八项测试自动改称 R3 重验。
- 浅色三帧 computed 回执均为 `rgb(106,110,119)`，页面底色为 `rgb(244,241,233)`，字体 12px；两者本地亮度对比计算约 **4.53:1**，较 R2 的 2.11:1 改善。中文已读／未读、越文 Đã xem／Đã gửi、英文 Read／Delivered 均可辨认；英文较长的 Delivered 仍完整容纳，没有挤压或遮挡气泡。
- 深色中文帧回执为 `rgb(155,163,181)`，黑底计算对比约 **8.30:1**；没有为了浅色修复把深色文字压暗。失败状态仍有独立 danger 选择器；本次没有新增失败状态截图，不将其列入四帧已观察结果。
- 四组记录均有五条普通消息：三条带回执、两条无回执；十二条带回执行全部方向正确，气泡至回执间距约 **6px**，无负间隔或水平越界，四组 `overflow:false`。英文来信 Delivered 右边缘约 304px，保留 320px 视口的 16px 页边距。无回执消息与系统提示行没有被补造状态。
- `runtime-r3.json` 当次读取 SHA256 为 `e80accab580af9d62bbf62463f1bb1abdd9888f221810bb0045fd119c9dfe624`。其中另含初次来信／外发 0.18s linear 事件，本次仅记录其存在，不用它替代历史补页、返回及 reduced 的完整 R3 回归。
- TOP-01 的 R2 原图误读更正继续有效：原始 PNG 中双按钮像素存在，稳定图与导航往返记录支持 9.2 分；本次没有因误判要求生产修复，也没有等待尚在补充的 H5 稳定帧来阻塞回执复评。

**MSG-01：9.3 分，R3 已观察的回执颜色和排版范围通过。** R2 的 8.6 分及问题证据保持原义；本轮新增没有覆盖真实后端、真机、新原生安装或全部语言／主题／屏宽组合。

## 关键读回与版本沿革

- R1 标题布局原视觉评分 9.3 保留为历史子项；后来实测发现 Read all 宽 43.0417px、Đọc hết 宽 42.84375px，高均为 44px，故 R1 不能宣称已满足完整 44×44 触区。
- R2 [APP 英文](app-r2-message-en-320.png)、[APP 越文](app-r2-message-vi-320.png)、[H5 英文](h5-r2-message-en-320.png)、[H5 越文](h5-r2-message-vi-320.png) 的对应 header rect 均为 44×44，水平溢出为 false。MSG-03 因而在 R2 关闭触区问题；R1 原图及原测量不被改写。
- APP 历史 8/16/24 行的坐标快照包含负 y，即部分行在当前视口外。该记录用于核对布局和历史行为，没有把“挂载 24 行”写成“24 行同时可见”。
- 最早 `outgoing-live-animation` 静态抓取为 `animation:none`，不能单独证明动效失败或时长；本次时长／方向签核使用随后捕获的实际 animationstart 事件。
- `prior-r1-runtime-readbacks` 是主代理整理的早先 CUA 读回摘要，retry 点击／Space、未读清零及领取 inset-only 主要取自此条；本审将其与截图、源码对照使用，没有称作自己重新操作所得。
- 图片预览 [app-chat-image-preview.png](app-chat-image-preview.png) 已目检；主代理报告实际点击图片与 SKU 链接。本审没有重做点击，不将本地图片和 SKU 路由访问外推为 TEST 真服务、私有权限或完整购买流程成功。

## 明确未签范围

真实后端、真实真人回执／收发、真实私有附件权限与物理缓存、真实完整 banner 发布、APK/IPA 安装及真机运行均未签。全部业务路由 × 三语 × 主题 × 屏宽的笛卡尔积没有实测。H5 本轮补证只用于各行列出的范围，不表示 H5 全站同步与全部业务验收完成。

底部 Liquid Glass 在已查看的首页／商城截图中保留；本审没有要求或实施全局取消卡片、玻璃及阴影。MSG-01 的 R3 局部修复已按本节自己的清单与实景复评；其他八项仍按各自 R1/R2 的范围和证据签项，不冒称整版 R3 九项全部重验或全站通过。

## R4 源码预审：TIME-01、管理页补修与顶部历史操作

### 冻结边界与当前状态

用户告知 R4 最终源码为 APP `e2cad48f7c7314eca032724ddd6e6aa10bd8fcd0`、H5 `f17846670e7e1fe32c7f325e54954d1eb915846a`；`23e5e42c018a4385090e9aae6ed83a180376a015` 为行为基线，后续差异为纯类型标注。本审未执行 Git，不将用户提供的提交号写成已经独立验证的 HEAD。R4 构建清单与运行证据待提供，尚未做源码／产物清单匹配。

**TIME-01 当前仅完成源码与规范预审，未发现明确阻断项，不打视觉验收分。** 原九项的版本与分数继续有效；SHADOW-02 的新管理页修复仍待 R4 实景，不能借旧签项代签新状态。TOP-01 的顶部源码没有重改，R3 操作记录是补充历史证据，不改称 R4。

### TIME-01 静态核对

对照 [IM 时间戳规范](../../../PRD/UVEL_IM时间戳显示规范_20261026.md)，检查了 [conversation-time.ts](../../../src/components/support/conversation-time.ts)、[conversation-thread.vue](../../../src/components/support/conversation-thread.vue)、[chat.vue](../../../src/pages/support/chat.vue) 及相关测试源码。本次没有运行测试、构建或浏览器。

- 分隔层在消息气泡及入场绑定之外，以 `justify-content:center`、12px／18px 行高及 `--v5-ink-3` 显示；没有新增背景、边框或 Liquid Glass 层。辅助行仍在每个非系统气泡下方，作者与 24 小时 `HH:mm` 拼接，完整日期、秒和 GMT 偏移放在 `title` 与 `aria-label`，不挤入气泡正文；系统行没有伪造作者／回执。
- 分组函数在第一条有效消息、本地日期不同、相邻时间差 `>=300000ms` 或逆序时刻处产生标记；发送者变化不参与判断。无效／缺失时刻重置分组边界，相同 ID 按原位置取最后一次数据，不在此函数内排序消息。
- 中文、英文、越文分别有今天／昨天／星期与日期格式；2–6 个日历日、同年较早日期、跨年及未来时刻的层次符合规范。日期差以本地日历日期为标尺，不按经过的 24 小时推断昨天；时区读取失败时日期与偏移一并回退本地，没有混用两个时区。
- `chat.vue` 人工消息沿用 `m.ts`，元信息只传作者，组件统一格式化时间，未拿读取／已读时刻覆盖发送时刻。图片、SKU 和链接共用相同辅助行。无效时间不被替换成当前时刻。
- 时钟在 mounted／show 更新并启动一分钟间隔，hide／scope dispose 停止；时间格式依赖计算没有进入按消息 ID／typing／reveal 驱动的滚动 watcher。源码上日期刷新不会追加业务消息或触发入场绑定；实际跨午夜、切后台返回及滚动保持仍待运行证据。
- 历史读取前先测量旧首条气泡相对内容的偏移，前插后用偏移差补偿；测量点在时间分隔之后，设计上可计入原首条分隔消失的高度。已看到 299999／300000／300001ms、DST 23／25小时日、逆序／无效时刻、同 ID、页缝消除及分隔高度补偿的测试代码；读取测试代码不等于本审已经执行通过。

静态抽查指纹：`conversation-time.ts` 为 `9cdf2bd5ca300a12c7e70b32faedd1f37855daca4027a71c8165cae58f913a93`，`conversation-thread.vue` 为 `2388c97285b78eced3f9919e75e3bd0552dd3bfe146051bb76c18b4ba81813c2`。这些是本次读取时的源码快照，不替代待到齐的 R4 build manifest。

### 管理页：修复方向正确，旧截图仅留缺陷历史

[messages.vue](../../../src/pages/support/messages.vue) 的 `.nx-conv-refresh-warning` 现为 column、透明背景；其文本 `flex:0 0 auto`，不再把旧 180px basis 用作纵向高度。读取恢复入口没有内部玻璃层，`min-height:44px`，空／失败恢复使用 `family-control--text`；[chat.vue](../../../src/pages/support/chat.vue) 的历史读取／失败恢复也采用居中、透明、至少44px的文本入口。上述代码方向与“去撑高、保留恢复动作”一致。

本次实际查看 [R3 管理页缺陷图](app-r3-management-dark-320.png.png)：旧色块与大段空白只用来证明问题曾存在，**不用于 R4 签过**。SHADOW-02 原 9.1 分仅保留此前已观察的服务头像／按钮／分类等范围；管理页恢复布局、直接移除后的状态及小屏末端可达性待最终新图确认，未给它们先打9分。此前预审用语“确认动作”不构成设计要求，已更正；这里不要求确认弹窗。

### TOP-01：R3 操作补记，不冒充 R4

本次 [runtime-r3.json](runtime-r3.json) 已有11条，读取 SHA256 为 `0e8712eeb479a062959cebb32e02de4c9c1b861c134aa231b46ac2aa53c9dd0e`；此前六条版本及其当次哈希仍按前文历史记录保留。新增五条顶部记录显示：

- 滚动前、真实 wheel 下滚及折叠稳定后，返回／设置均为44×44、`opacity:1` 且含 SVG；位置分别为 `(12,6)` 与 `(264,6)`，渐变／投影保持相同公共导航效果。
- 折叠稳定后原大标题／主分类高度为0，并有 `aria-hidden`／inert；顶部控件保留，滚动区高度由约447增至557px。
- 实际设置目标为 `/pages/me/preferences`；键盘返回后回到 `/pages/me/notifications?section=notifications`，标题／分类恢复56px与54px，滚动位置读回0。

已用 `view_image` 查看 [R3 折叠图](app-r3-top-collapsed-dark-320.png.png) 与 [R3 恢复图](app-r3-top-restored-dark-320.png.png)。它们及上述记录补充支持 TOP-01 已更正后的9.2分，均明确属于R3。当前 `notifications.vue` 与 `message-center.css` 的文件哈希与 R3 清单一致；没有因先前误读要求再改顶部代码。

### R4 最小待验重点

| 范围 | 核对内容 | 当前状态 |
|---|---|---|
| TIME-01 小屏／主题／语言 | 三语320的长日期、作者与HH:mm；390及双主题层次，分隔无底、12px且可读，无横溢／遮挡。长作者名和英文／越文较长日期需关注换行。 | 待R4截图与computed量测，不先签视觉通过 |
| TIME-01 分组／生命周期 | 首条、同分钟／不足5分钟、恰好5分钟、跨午夜／跨年；三页前插消除重复分隔且锚点不跳；日期刷新／返回不重播。DST／无效／未来时刻可结合冻结版本测试结果，不能仅靠普通截图代替。 | 已检查规则与测试源码，待实际结果 |
| SHADOW-02 管理页 | 320长提示与透明44px重试，不再出现180px空白；正常／失败及移除后空态不切边，末端动作可达，局部保留玻璃。移除按设计直接执行，不以确认弹窗为验收门槛。 | R3仅缺陷证据，待最终补验 |
| TOP-01 | R4清单证明顶部代码沿用；如提供新图／操作，按R4单独标注。R3设置返回／折叠恢复可保留历史佐证。 | 原9.2分有效，尚未将R3归版为R4 |

本阶段仅更新本审查文档；没有修改实现、运行浏览器或执行 Git。待R4产物到齐后，按实际证据逐项复评；没有证据的新增项保持待验，不以旧九项平均分抵销。

## ATTACH-01 新增源码预审：第十一项，待 R5 实景

用户新增要求：图片不可用时，附件图标呈灰色禁用，不再展示可见的不可用说明文字。上述预审时 `conversation-thread.vue` 及对应 behavior test 为尚未提交的实现；本审没有参与实现，也不将其记入已冻结的 R4 时间戳提交。后续已收到 R5 冻结通知，见下一节；最终以 R5 manifest 固定源码／构建与截图版本。

已只读核对当前代码：

- 附件入口保留44px尺寸和共享玻璃；禁用时使用中性 `--v5-ink-2` 随 `opacity:.45` 淡化，`aria-disabled=true`、`tabindex=-1`，点击及 Enter／Space 均检查 `!attachDisabled` 后才发出 attach 事件。
- 原可见 `nx-conv-policy-caption` 已移除；不可用原因仅合入附件入口无障碍名称，不再占据输入区下一行。正文输入与发送条件独立于附件禁用，未因图片不可用而禁用文字消息。
- 策略读取失败时仍有单独的44px文字恢复入口 `nx-conv-policy-retry`，由 `attachRetry` 控制；页面仅在远端策略读取错误时请求该入口。最终需分开查看“图片不可用，无说明行”及“策略读取失败，可恢复”两态，不把恢复动作当作应保留的不可用说明，也不把本要求扩大成隐藏上传／发送失败反馈。
- 已读取新增测试：检查禁用语义、灰态、不可用说明节点消失、禁止 attach 事件、文字发送与策略恢复动作。29/29 为主代理提供的测试结果，本审未运行测试；源码和测试不能代替双主题实景。

| 新增项 | 当前结论 | 最小视觉／交互补验 |
|---|---|---|
| TIME-01（第十项） | 源码预审无明确阻断；尚未签分 | 沿用上一节时间分组、小屏三语、双主题、历史页缝与日期刷新重点；R5运行图按R5标注，R4实现基线单列。 |
| ATTACH-01（第十一项） | 源码方向符合新增要求；尚未签分 | 320双主题下图标灰态清晰、无可见不可用说明及遗留空白，输入／发送排列不变；禁用点击／Enter／Space不打开选择器，文字仍可发送；可用态与策略失败恢复态单独核对，三语无旧说明残留。 |

R5 计划在隔离的 APP 5234／H5 5235 取证。这是取证目标记录，不是本审已访问或验证的地址；本审没有操作任何浏览器，也没有触碰用户5233标签。原九项分数与历史误判更正继续保留；最终十一项逐项依实际证据评分，未达9分直接保留问题，不用平均分补足。

## R5 冻结通知与取证勘误（交付前历史记录）

本节保留正式交付前的通知与勘误，后续APP/H5补证及最终判定见下一节；不将这里的“尚未核验”误读成最新状态。

用户通知 R5 已冻结为 APP `ecda4fdd`、H5 `926e8c4`，manifest 已写入，243项测试及网页构建通过；这些目前按主代理通知记录，本审尚未进行该版清单匹配或终版实景签核。`runtime-r5` 正在隔离的5234积累，待正式证据交付后再给十一项最终分数，不将积累中的截图先签过。

- 旧 queueShot helper 曾误抓用户标签，第一张管理页截图实际是首页。该批错误来源截图不作为 R5 管理页证据；待显式指定隔离 tab 的 helper 交付正确截图与读回后，再核对页面身份。本审没有操作用户5233标签，也不因文件名含 management 就认定画面是管理页。
- 管理页“从列表移除”按设计直接执行；当前 `removeRow` 直接调用 dismiss 路径，没有确认弹窗门槛。用户说明记录保留。本审不新增确认流程要求，也不把 R3 `app-r3-management-confirm-dark-320.png.png` 的误名当作存在确认弹窗的证据；该图实际为空态，按空态历史材料理解。关于真实记录保留／恢复的数据语义，仍需相应运行读回，不能仅凭空态截图证明。
- 上文曾列“确认面板”作为管理页待验对象，该要求已撤回并改为“直接移除后的空态”。不将不存在的弹窗缺失判为缺陷或扣分。
- 本轮真正需要检查的弹层为图片预览：实际打开后的边界、关闭入口、320视口容纳及双主题层次。是否已完成以正式截图／运行记录为准，目前不预签。

R4时间戳实现基线、R3缺陷图、R2／R3顶部误判及其更正均保留版本标签；本次勘误没有把任何旧图改称R5。除本审查文档外无写入，没有浏览器或Git操作。

## R5 最终分项复评：APP与H5补证已纳入

### 冻结核验与本次目检范围

独立读取 [APP R5清单](app-build-r5.json)、[H5 R5清单](h5-build-r5.json)，分别在两个工作树核验，**双方均43/43源码、341/341构建文件哈希匹配**。没有拿APP产物冒充H5。提交号来自冻结清单，未执行Git。

| R5 | sourceRef | sourceFingerprint | artifactFingerprint |
|---|---|---|---|
| APP | `ecda4fdd0076aa69605597215d5bd9337dcc0fe8` | `97d9f80b3f513557b5eaa1fccba44e66cbfa78fa66912848261e45647cddc0e3` | `ef17fc7be661544abb760bd3782aa5e8a68408612fab81cbd5a58f542faf9fb6` |
| H5 | `926e8c48af800112b04ead01c90012be79ebf587` | `4d136600bbeb9a4e2a9042d350e496e49f2741c144e828059b88bb48c188bfad` | `b4b48ed7b9f45e1e5fbfc3816e352a42acc9a087741f43494c5dc0dedc4986fc` |

243项测试、双端类型检查／网页构建及APP原生资源编译通过，采用主代理通知，本审没有重跑；原生资源编译仍不等于安装与真机实景。

本次实际使用 `view_image` 目检 **11张APP R5图、7张H5 R5图**，均为当前准确文件名，无双扩展名：

- APP时间／输入：`app-r5-timeline-initial-zh-dark-390.png`、`app-r5-timeline-vi-light-320.png`、`app-r5-timeline-year-vi-light-320.png`、`app-r5-timeline-en-light-320.png`、`app-r5-chat-zh-light-320.png`、`app-r5-chat-zh-dark-320.png`、`app-r5-disabled-image-text-sent-en-light-320.png`。
- APP管理／预览：`app-r5-management-zh-dark-320.png`、`app-r5-management-zh-dark-390.png`、`app-r5-management-error-zh-dark-390.png`、`app-r5-image-preview-dark-390.png`。
- H5：`h5-r5-timeline-zh-dark-390.png`、`h5-r5-timeline-vi-light-320.png`、`h5-r5-message-vi-light-320.png`、`h5-r5-message-collapsed-vi-light-320.png`、`h5-r5-message-error-vi-light-320.png`、`h5-r5-message-restored-vi-light-320.png`、`h5-r5-management-vi-light-320.png`。

H5新图实际PNG为270×585缩放取证图，320／390指运行记录中的CSS视口宽度，不能把PNG像素宽度当CSS量测；44px等尺寸签项结合DOM读回。APP/H5分别使用主代理提供的隔离5234／5235取证；旧共享5233的R4画面没有用于R5闭环。本审没有操作这些浏览器或用户5233标签。

[runtime-r5.json](runtime-r5.json) 本次最终读取为**27条：APP17、H5 10**，SHA256为 `eb121a8018504b16dafd90a3e7609cdfa7ed7b565b913cf0ff933d2ffd77196b`。文件后续若追加，不把新内容倒写成本次已经看过；本报告使用以下明确标签和截图。APP子集17条按PowerShell `ConvertTo-Json -Depth 30 -Compress` 序列化的SHA256为 `1382a39114ef61d84a9a39e96988e3000310457ca9e2155c72cd1d22c408091a`，供与本次APP读回比对。

### TIME-01：9.3，所列本地场景通过

- 浅色分隔读回 `rgb(106,110,119)`、深色 `rgb(155,163,181)`，背景透明；字号12px由冻结源码与截图对照。三语作者／24h时刻层次清楚，越文首条跨年 `31 thg 12, 2025 10:00` 完整居中，没有中文日期拼接或横溢。示例消息正文仍含中文夹具，不将其写成全部正文翻译验收。
- 中文历史记录包括昨天23:59→今天00:01，两分钟也正确跨日；00:02→00:07、00:11→00:16的恰好五分钟分隔保留。图片及SKU消息仍有自己的作者／时刻，分隔不成为业务消息。
- APP与H5均有8→16→24页：旧行纵坐标差范围分别约 `+0.33331～+0.33337px`、`-0.39587～-0.39575px`，绝对值均<0.4px，行animation均none。APP另有 `app-same-day-divider-removal-prepend`：原“今天20:45”首标记被“今天20:37”替代，已有行差约+0.333px，未留下重复标记或明显阅读跳动。离屏负y不当作同时可见的证据。
- R5没有浏览器逐例重做DST／未来／无效时刻、定时跨午夜及系统时区变化；这些保留源码／针对性测试与未实景边界，不借普通日期截图声称全覆盖。

### ATTACH-01：9.2，灰态／无可见说明通过

- APP及H5已列截图中入口为灰态，读回44×44、opacity=.45、aria-disabled=true、tabindex=-1；`caption:false`，不可用原因仅在无障碍名称，输入区下方没有旧可见说明行。composer高约86.67px，附件底边距页面底端约32px；这是本地视口几何，不代替系统安全区真机验证。
- `app-attachment-disabled-actions`记录强制指针激活不打开picker、dialogCount=0、fileInputs=0；`app-text-send-with-image-disabled`及截图有实际新文字消息“Timestamp check: text messages remain available.”与20:51时刻，证明附件不可用没有阻断本地文字发送。
- 同一记录明确写键盘自动化拒绝激活aria-disabled入口，因此只签源码／组件测试的Enter、Space守卫，不冒称实际按键派发成功后已验证无响应。H5本轮仅补视觉／computed及历史取证，没有独立重做禁用后的发送与指针操作；策略读取错误恢复、图片重新可用和真实设备权限仍未完整覆盖。

### SHADOW-02管理页／实际图片预览：综合复评9.2

- 正确APP管理图320／390均为“会话中心”，不是旧误抓首页。提示父区约82.79px，文字内容与44px重试自然排列，底透明且shadow:none；H5 VI320换行后父区约100.19px、重试288×44，也没有180px空白、旧色块或横溢。
- APP失败图与 `app-management-error-390` 中恢复入口358×44；`app-management-enter-retry-restored` 记录当前页Enter后恢复列表及紧凑提示。错误空态的插画／标题区域属于EmptyState，未把其自然高度误认为旧flex-basis撑高。
- 管理页移除直接执行，记录保留为设计语义，不要求确认弹窗；本次未提供R5实际移除后真实后端记录保留的证明，不代签该业务行为。旧R3误名confirm图仍只按空态／缺陷历史理解。
- 实际图片预览遮罩390×844，image容器342px宽且在左右24px留白内，商品完整aspectFit；关闭入口84×44，顶部约54.84px，未裁切。记录证明打开及关闭入口布局，没有提供关闭后的读回，不签关闭交互已实测；320／浅色预览和真实附件权限仍未覆盖。

### TOP-01：维持9.2，按最终settled证据闭环

H5 VI浅320普通、实际wheel折叠、错误和恢复图已目检。各状态返回／设置44×44、opacity:1、SVG存在，公共玻璃渐变／投影一致；实际设置目标记录为5235的preferences。`h5-top-return-restored`保留的是折叠过渡态，不能拿它判定最终标题没有恢复。最终采用 `h5-top-return-restored-settled` 及更新后的restored截图：大标题／分类56／54px、aria-hidden=false、无inert、滚动0、overflow=false，3未读与标题同行。

R2原“顶部缺失”误判与更正仍保留；R3操作没有被冒称R5。没有要求实现虚构的管理页确认弹窗，也没有操作用户标签来复现。

### 最终签项边界与具体未闭环项

本表十一项均按各自列明范围达到9分，没有取平均、没有以旧截图冒充R5。以下仍未闭环，不被本次视觉分数覆盖：

1. TEST／真实客服往返、真实回执覆盖、真实私有附件／权限、真实运营完整Banner与物理缓存。
2. APK／IPA新安装及iOS／Android实机的键盘、系统减少动态、安全区和时区行为；原生资源编译通过仅作编译结果。
3. R5两端三语×双主题×320／390全排列、长作者名／系统文字放大；H5独立禁用附件操作与文字发送、策略错误→重新可用的完整实景。
4. R5定时跨午夜／系统时区切换及DST等边界逐例浏览器复演；H5 reduced媒体模拟本轮未单独重测。
5. 图片预览关闭后的实际读回、320／浅色预览；R5实际移除会话及服务端记录保留证明。管理页不存在确认弹窗不是缺口。

上述是具体未覆盖边界，不是本次已发现的视觉阻断。当前没有待修的低于9分项；若补证暴露新问题，应重新评分，而不是维持签分。仅本文件有写入，未改实现、测试或其他文档，未运行浏览器或Git。

## R6行为修复通知：保留R5视觉证据，未提前签R6

用户转达交互审查的两项P2，正在做R6修复：

1. 原生分页前测超时后不应继续分页。R5本地正常路径的锚点稳定不证明原生超时分支正确；R6需补该分支的行为验证，正常聊天／分组新图只证明对应新版本的正常布局。
2. 附件权限旧响应不能覆盖新响应。R5已观察的灰态、无说明行及文字可发送不证明异步乱序状态正确；R6需补响应身份与过期结果隔离验证，并以新图确认最终禁用／可用状态布局。

据用户通知，R6不会修改R5 CSS／布局，本审仍以R5的冻结清单和截图签本地视觉范围；不将此通知当成R6源码／产物核验。两个行为P2明确未闭环，不被十一项视觉分数、平均分或测试总数抵销。R6构建和最新运行图到齐后再按其版本复核；本报告没有将任何R5证据改称R6。

## SEND-01：第十二项，R6交付前预审历史

此节保留交付前待证状态；R6新截图、运行记录及最终8.8分判定见下一节。

此节记录上述R6行为修复通知之后的新增需求，取代“R6没有新UI”的范围假设。前十一项视觉审查已完成，分数继续按各自版本及边界保留；本次不重复打分，也不将SEND-01作为R5旧需求倒扣。其他R5布局据通知保持不变，发送按钮本身须用R6新证据验收。

SEND-01要求：发送可用时采用当前主题强调色，禁用态有明确区别；手机点击有轻按回弹，不能用hover动效代替；减少动态模式保留可辨认状态并停止或消除位移动效。**当前尚未收到R6最终构建／截图／动画读回，SEND-01不打分、不先签通过。**

| 待验范围 | 具体检查 |
|---|---|
| 双主题可发送／禁用 | 浅色、深色分别查看有文字可发送与空输入／阻断禁用态；强调色符合主题、图标可辨，禁用态不与可用态混淆，不借附件禁用状态错误阻断文字发送。 |
| 输入区排版 | 按钮触区、图标居中、输入框宽度及底部间隔与原布局保持；320小屏下不挤压输入、不溢出，禁用／恢复不跳位。 |
| 手机轻按回弹 | 实际按下、释放／取消后反馈可见且回到原位；记录运行时变换／时长或动画事件，不只从CSS推断。没有仅鼠标悬停触发的hover动效。 |
| 减少动态与禁用交互 | reduced模式无缩放／位移回弹，强调色和可用状态仍清楚；禁用入口不发送，正常点击不因动效重复发送。媒体模拟与真机系统减少动态分开标注。 |

两个P2已有“红13→绿107 tests”为主代理最新通知，本审未运行这些测试，也未据此撤销待验证边界。待R6最终manifest、双主题实际截图和按压／减少动态读回后，单独评分SEND-01，并检查新版本正常聊天、分组与附件灰态是否保持原十一项已签的视觉表现。真实设备未运行部分仍明确不入分。

本次只补充审查范围与验收矩阵，唯一写入为本报告；无实现修改、浏览器或Git操作。

## R6 SEND-01独立视觉复评：8.8分，reduced按住态尚未通过

实际使用 `view_image` 查看 [深色390可发送](app-r6-send-ready-zh-dark-390.png)、[深色390按住](app-r6-send-pressed-zh-dark-390.png)、[浅色320可发送](app-r6-send-ready-zh-light-320.png)，读取 [runtime-r6.json](runtime-r6.json) 的9条记录。当次文件SHA256为 `f9769d6cd5938b2a1e29c13b18005837528b6a4808be2ccf950bd675ce3c1232`。

R6冻结清单为 [APP](app-build-r6.json) 的 `1a9b539b8665f764720dc57f797d31e6a7d9fd22`、[H5](h5-build-r6.json) 的 `13bb3345210c74322aa8f61c96aae75d76e7584f`。APP source/artifact fingerprint分别为 `99b9b695db2769e05dfc82c2ef391dfde2686e198be25a0d1cf22674e56396db`／`e95fd21312064d51dcc3a66b0d6a6084999ea669ae794b2a0ee22312cc64bf8a`；H5为 `c2a1c21f939b460d446bc0f00ecda7671531c689e29d3b4bf281719b03eeddd4`／`073b8663e7265baf7da9aaf3b7d689b22d4eb8ca4fad3a1a8d0039c1f9cfab67`。这些是读取的R6清单值；此时R7构建已使当前dist与R6整套清单不再一致，不能冒称本次复验当前dist全部匹配R6。截图及运行数据保留R6版本，当前源码检查另注明R7沿用CSS的通知边界。

### 已观察合格部分

- 深色可发送面为 `rgb(158,220,29)`、图标 `rgb(10,10,10)`；浅色为 `rgb(14,72,230)`／白色。双主题较旧灰色明显，禁用深色面恢复 `rgb(42,42,42)`／`rgb(155,163,181)`，浅色禁用为 `rgb(240,235,224)`／`rgb(106,110,119)`，可用／禁用区别清楚。
- 外层一直44×44。普通pointer按住时内部face为40.48×40.48，transform matrix=.92，位置围绕中心收缩，输入区没有跳位或挤压。实际animationstart为 `nx-conv-send-tap-6ae5e8da`、0.2s、`cubic-bezier(0.2,0.8,0.3,1)`；不是仅从CSS推断。
- `app-sent-and-empty-restored` 中本地发送后出现21:15作者时间，按钮恢复aria-disabled=true、tabindex=-1、animation:none与transform:none。按压规则使用active／feedback，没有新增发送按钮hover动效。
- IAB不支持 `Input.dispatchTouchEvent`，记录明确只做浏览器pointer，触摸模拟已恢复关闭。reduced媒体设定据主代理通知已还原；均不当作原生手机触摸或系统减少动态已验。

### P2：reduced中的transform重置未覆盖active缩放

当前 [conversation-thread.vue](../../../src/components/support/conversation-thread.vue) 第750行与760行的规则分别为：

```css
.nx-conv-send[aria-disabled="false"]:active .nx-conv-send-face { transform: scale(.92); }
@media (prefers-reduced-motion: reduce) {
  .nx-conv-send .nx-conv-send-face { transition: none; animation: none; transform: none; }
}
```

源选择器优先级分别为 `(0,4,0)` 与 `(0,2,0)`；Vue scoped属性增加后强弱关系仍相同。因此，reduced=true且可用按钮保持active时，`transform:scale(.92)`仍胜出。减少动态规则停止了transition／点击keyframe，却没有按其声明意图消除按住态缩放。当前全局减少动态规则未提供能覆盖该transform的兜底。

`app-send-reduced-motion` 捕获的是 `animation:none-observed` 及点击后已禁用、transform:none的状态，不能证明**可发送且按住时**没有缩放；不能拿这一条关掉该边界。本审未操作浏览器，不将源码级覆盖关系冒称为自己已经复现了R6 reduced-pointerdown运行状态。用户通知R7只改fresh live刷新clock、沿用R6 CSS，因此这组选择器问题也需在最终源码里核对，不能因为版本号更新就视为消失。

最小修法：在reduced块内用同等或更高优先级的可用active选择器覆盖`transform:none`，或将active缩放放入`prefers-reduced-motion:no-preference`；无需改变主题强调色、44px外层或输入区布局。修后应以新冻结源码／产物补 **reduced=true、canSend=true的pointerdown按住态**，再读pointerup／发送后的transform和动画事件。普通模式仍保留现有0.2s回弹；reduced按住／释放保持静态，不能只记录mouseup后的none。

**SEND-01总体8.8，暂不签过；双主题与普通pointer反馈子范围约9.3，不以子分代替整项。** 未修改任何实现。R7用户通知源码为APP `5e7c3525`、H5 `f139ef8`，260/260与构建进度按通知记录；fresh clock、H5最终发送实景及新修复后的reduced证据均待对应版本实际交付，未提前签R7。

## R7十二项视觉结论（R8前历史）

以下保留R7当时SEND-01为8.8分的结论；该项已由末节R8新证据复评9.3分，不再作为当前未关闭问题。其余十一项沿用原版本范围。

前十一项维持总表原分与实际历史范围；此次新增的四张R7图及九条R7运行记录只补发送／fresh时钟等列明场景，没有把全部历史签项改称全R7重验。SEND-01单独维持 **8.8，未通过**；前十一项不取平均、不替它签过。

### 冻结与本次实际证据

读取 [APP R7](app-build-r7.json)、[H5 R7](h5-build-r7.json)，分别对两工作树逐文件核验：**双方均源码43/43、构建文件341/341匹配**。本次没有执行Git、测试、类型检查或构建；260/260、双TS／双web build及APP原生资源编译绿为主代理提供的验证结果，不等于真机实景。

| R7 | sourceRef | sourceFingerprint | artifactFingerprint |
|---|---|---|---|
| APP | `5e7c3525cc4f5e62412de626def94bd59c5b3196` | `01b20f9e09e74efc78336bbd70741db336f5a66486b43c85d68ee4230ab5555c` | `b88d7388037ff6d6e9f2bf1a486f41250c1c7a0eb4c0937f00d5c933738a0df0` |
| H5 | `f139ef8e3ae4a9a02d75cb38b890d318ba3c4da5` | `806d4574e99452726cf288b9b8c09d67630ee82bb1b7e38a775792a5a2e38fe4` | `dcff871ada91e33fcc32c7dc7766cadce8be2ef8d087f0297cbe556856784e94` |

实际 `view_image` 目检 [APP暗390可发送](app-r7-send-ready-zh-dark-390.png)、[H5 VI浅320禁用](h5-r7-send-empty-vi-light-320.png)、[H5 VI浅320可发送](h5-r7-send-ready-vi-light-320.png)、[H5 fresh发送后](h5-r7-fresh-today-vi-light-320.png)。[runtime-r7.json](runtime-r7.json) 当次9条，SHA256为 `6ef9f2c8f6a825b0f6d6556c647eedc20222f8a59435cb7cab62a212dd8f27cb`。

- APP强调色仍为158,220,29／深字10；H5浅色为14,72,230／白字。H5空输入禁用面为240,235,224／106,110,119，发送可用后对比明确；44×44外层、输入区及附件灰态未见跳位或横溢。
- `app-final-send-animation` 与 `h5-final-send-animation` 分别捕获真实animationstart，均0.2s、`cubic-bezier(0.2,0.8,0.3,1)`。发送后读回恢复禁用，APP新增“我·21:24”、H5“Tôi·21:25”，不是只从CSS推测点击成功。
- fresh消息显示 `Hôm nay 21:25`，没有因参考clock落后而显示完整未来日期；R7源码在可见时监听消息ID／timestamp变化并刷新clock。H5追加页的旧行y差分别约+0.1667px、-0.3542px，原视觉范围未见阅读跳动。R7没有重新逐例覆盖DST、系统时区或完整12格时间矩阵。

### SEND-01仍保留的P2：已在R7冻结编译CSS确认

匹配R7 APP清单的 `dist/build/h5/assets/chat-BpUhzqM-.css` SHA256为 `661e3dfd9d2ef7095b7fd7c305e807622a413876f1f421c43de46896aa71ae98`，实际仍包含：

```css
.nx-conv-send[aria-disabled=false]:active .nx-conv-send-face[data-v-0e4f2366]{transform:scale(.92)}
@media (prefers-reduced-motion: reduce){
  .nx-conv-send .nx-conv-send-face[data-v-0e4f2366]{transition:none;animation:none;transform:none}
}
```

编译后优先级分别为 `(0,5,0)`、`(0,3,0)`，active仍胜出。此项现在已直接绑定R7冻结产物，不只是对当前工作树的怀疑。R6按住缩放与点击后reduced none记录没有覆盖reduced=true下可用按钮持续active的状态；R7新图和双端动画事件也没有新增这一态。因此，主题色与普通点击子范围合格仍不能关闭这项P2。

最小修法和补验沿用上一节：局部覆盖reduced active或只在no-preference启用缩放，重新冻结后读回reduced可发送按住／释放；不需重做其余R5布局。本审没有将IAB pointer冒称touchDispatch成功、原生真机或系统减少动态通过。

### 交互审查与最终未覆盖边界

原生分页前测超时保护、附件权限旧响应隔离已有实现修复通知，其交互闭环由 **Noether独立核对**；本页不复制其评分，也不以本地视觉截图代签。历史段落中的“待R6”按当时状态保留，不能据此宣称R7尚未实现修复。SEND-01的CSS优先级问题仍是本审当前未关闭项。

最终：**11项在明确历史／新增局部范围签过，SEND-01未签。** 真实TEST服务、真人收发／回执、私有附件权限、真实完整运营Banner、物理缓存、新APK／IPA安装、真机触摸／键盘／系统减少动态仍不在本地视觉签项内；预览关闭后的实际读回及全部语言／主题／尺寸组合亦未补齐。只有本审查文档被修改，没有实现、浏览器或Git操作。

## R8最终复评：SEND-01为9.3，十二项按分版本范围签项

此次只重审SEND-01的reduced优先级修复、相关正常模式和所列主题／尺寸，没有重新签发其他十一项的整版R8验收。R6／R7各8.8分与具体P2保留为真实历史；**该P2在R8已关闭，SEND-01当前9.3分**。其余十一项分数不变。

### 冻结清单与变更范围

读取 [APP R8](app-build-r8.json)、[H5 R8](h5-build-r8.json) 并在各自工作树逐文件核验，**双方均源码43/43、构建341/341匹配**。与R7的source清单比较，双方只有 `src/components/support/conversation-thread.vue` 的哈希变化；所审局部为reduced块增加同等active选择器，没有据此把旧截图改名为R8。

| R8 | sourceRef | sourceFingerprint | artifactFingerprint |
|---|---|---|---|
| APP | `d65ee0b64a30739e44644e613511563239c2218c` | `41abf777a1664ce0b1606865474b15e40b8fb8acdaad25e88c5d658c962bbec1` | `b0658042401a74bf30eeb76365b318f8e850de4d0f91559060298f598b4e71b0` |
| H5 | `4173e25b8f85df83a2b21412fb378c6babc97b31` | `189276d1a415980534c5996107951c9dd2c9ee212cd0c4f892a60146d3aad220` | `02b3bf39b904f687dd3e9fe106849c2d55e26b9a1e266f7218d10309ed02736f` |

38项组件回归及双端网页构建成功采用主代理通知，本审未重跑；R8原生资源编译在首次复评通知时进行中，该历史时点不记为已绿，也不把旧R7编译结果追溯充作R8结果。后续R8编译完成通知与最终封档见下节补记。真机与新安装仍未验。

### 优先级修复已在实际编译产物确认

R8源码reduced块为两个并列选择器：原普通face及新增的 `.nx-conv-send[aria-disabled="false"]:active .nx-conv-send-face`。后者与普通按住规则同等优先级，位于其后；媒体条件满足时正确胜出，设置transition:none、animation:none、transform:none。APP编译CSS `chat-CNWgJyh1.css` 的SHA256为 `98f5a94d81ad07cc43466e4bc06e7bcd893c17f08fa481e7748f34060a41e3c1`，H5 `chat-BzXRSDqB.css` 为 `1cd776b905ae12ef3c10ac43094456a86f1804a7f24a6d26d989a0b547df5f73`；两份均实际含有这组修正，不是只看到未构建源码。

### 实际截图、按住与释放读回

已使用 `view_image` 目检 [APP暗390 reduced按住](app-r8-send-reduced-held-zh-dark-390.png)、[H5越文浅390 reduced按住](h5-r8-send-reduced-held-vi-light-390.png)、[H5越文浅320普通可发送](h5-r8-send-ready-vi-light-320.png)。前两张运行记录CSS视口均为390，第三张为320；H5最初误标320的文件名已在交付前修正，按准确现名和DOM宽度记录，不因旧称虚构一个320 reduced实测。

[runtime-r8.json](runtime-r8.json) 当次9条，SHA256为 `4ba3cdb2f5adf057fa8076b80d2fc680cbe10412d82ddd1326ee62530326f1ad`：

- `app-reduced-held-dark-390`、`h5-reduced-held-light-390`：均为reduced=true、active=true、aria-disabled=false；外层与face均44×44，transform:none、animation:none。APP保持158,220,29／10深字，H5保持14,72,230／白字，颜色和图标未因减少动态失去可辨性。截图未见按压导致输入区跳位、裁切或旧附件说明回归。
- 两端释放记录均为active=false、reduced=true，没有捕获到animationstart（none-observed），state恢复禁用／tabindex=-1、transform:none、animation:none；APP另有 `app-reduced-sent` 的messageVisible=true。H5本条没有独立的messageVisible字段，不将其写成与APP相同的消息可见性量测。
- reduced下computed transition为`1e-05s`，与全局减少动态0.01ms兜底一致；本报告不把它误写为computed transition字面值none。关键的可发送按住状态已实测无缩放、无动画，关闭的是此前确切的active覆盖问题。
- `h5-normal-ready-light-320` 为reduced=false；该瞬时ready色值处于颜色过渡中，不拿它替代最终主题token。随后正常held读回active=true、外44×44、face约40.64px、matrix约.923575；最终稳定目标.92与冻结CSS一致。release实际animationstart为0.2s、`cubic-bezier(0.2,0.8,0.3,1)`，普通反馈保留。
- 正常release的state在动画播放途中采样（face约.909736），不能说该帧已经回到1；正常结束恢复已有R6／R7历史证据，本次未将它冒称R8新结束帧。`media-restored` 最终app=false、h5=false，未留下减少动态媒体模拟。

### 最终范围与未签边界

**十二项均在总表各自明确范围达到9分，SEND-01由8.8复评为9.3；本轮没有剩余低于9分的已发现视觉项。** 前十一项继续引用其原R1／R2／R3／R5及局部R7证据，不能把整张表宣传为“十二项全R8重跑通过”。原生前测／附件响应身份等交互闭环由Noether独立负责，本页不代签。

SEND-01本次为本地浏览器pointer按住／释放与媒体模拟，不是原生触控、touchDispatch或真机系统减少动态；IAB不支持touchDispatch的边界保持。其他未签范围仍包括真实TEST客服／回执／附件权限、完整运营Banner与物理缓存、新APK／IPA安装及真机、全部语言／主题／尺寸排列，以及预览关闭后独立读回。原生编译状态按通知时点单列，后续成功也不以本地视觉分数代替原生运行验收。

本次唯一写入为本审查文档。未改实现、运行浏览器、触碰用户5233标签或执行Git。

### R8封档补记：最终10条，原九条未变

收到主代理通知 `runtime-r8.json` 已停止写入，本审再次读取为 **10条**，最终文件SHA256为 `bcf11360482c7eadba1d9d85003168b4d3285d94e06ad699254b66b3cb365885`。将前九条按原两空格JSON格式加末尾换行重新序列化，其SHA256精确恢复为先前的 `4ba3cdb2f5adf057fa8076b80d2fc680cbe10412d82ddd1326ee62530326f1ad`，独立确认前述按住／释放记录未被改写。

仅新增 `app-final-ready-dark-390` 及 [APP R8最终深色可发送图](app-r8-send-ready-zh-dark-390.png)。该图已实际 `view_image` 目检，发送强调色与输入区正常；记录为width=390、reduced=false、aria-disabled=false、外层44×44、transform:none、animation:none。新增条的computed颜色处于颜色过渡时点，不将该瞬时数值改称稳定主题token；此前两主题稳定色与减少动态读回保持原义。

读取 [最终指纹核验](checks/final-fingerprints.json)：APP／H5各43源码、341网页构建文件，R8 sourceRef与本节冻结版本一致，mismatches均为空，artifact fingerprint也与本审先前独立核验一致。该文件的范围明确为冻结功能源码及浏览器构建，不将其扩展为原生包或真机运行证明。

双端网页及 **APP R8原生资源编译完成** 按主代理补充通知更新，取代前述“进行中”的当前状态；本审未重跑编译或检查真机。SEND-01保持 **9.3**，其余十一项分数／历史证据／验收边界不变，没有因补一张ready图重新签整版R8。唯一写入仍为本审查文档。

## CHAT-TOP-01：R9前布局风险预审，待冻结实景评分

用户新增第13项：聊天页耳机图标偏上、头部左侧拥挤且右空。原十二项已签分数、版本证据与边界全部保留；本节只提供布局建议，**CHAT-TOP-01尚未评分或通过**。本次只读检查当前源码，并重新使用view_image目检 [R8 APP中文暗390](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r8-send-ready-zh-dark-390.png) 与 [R8 H5越文浅320](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r8-send-ready-vi-light-320.png)，作为改前布局参考，不冒充R9。截图像素尺寸不替代runtime中的CSS视口宽度。

### 具体来源与最小改法建议

1. **整体居中不能只给文字加text-align:center。** [chat.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:24) 当前把返回、40px头像、flex:1的cp-meta连续左排，cp-head还允许flex-wrap，造成左侧聚集。建议导航主行使用左右各44px、中间minmax(0,1fr)的对称轨道，将头像、名字和状态作为一个完整身份组居中；右槽纯留白，不带背景、role、tabindex或点击事件。先明确居中对象是身份组，避免头像另占左侧后又把文本单独锚到屏幕中线而挤占返回区。
2. **320px需要真正允许中区收缩。** 沿用左右16px内距和两处10px列间距时，中央可用宽仅180px；40px头像加10px内部间距后文字约130px。当前cp-meta的min-width:100px、名字20px与长英文／越文状态应一起检查。中区和文字容器使用min-width:0；头像与6px状态点不收缩。名字需截断时保留完整可访问名称；状态受控换行，不能仅用整组overflow:hidden吞掉不可用／等待信息。避免状态变化造成导航主行反复换列或首条消息突然跳位。
3. **耳机偏上有两个不同来源。** cp-ava中v-html生成的SVG仍有inline基线行盒；应先让专用图标包装器零行高并居中、SVG为block。动态v-html节点需用局部:deep(svg)或其内联属性命中，普通scoped后代选择器未必命中。SUPPORT_ICON的名义路径纵向约为viewBox y=3…18，中心10.5而非12；在20px SVG内相当于几何上约1.25px偏上。消除行盒后再按R9实际像素做约1px量级光学微调，不能把该估算当作已验证补偿值，也不能把同一translateY强加给顾问人像或Nova位图。
4. **已有真实右侧动作不能被44px槽挤没。** 当前isAi && remoteApiEnabled分支有“重新发起会话”，英文为Start a new session、越文为Bắt đầu phiên mới。建议保留其真实功能和可访问名称，将文字动作置于独立行，不把长文字硬塞进44px右轨道，也不为人类客服补一个虚假动作。当前Nova客户入口由 [nova-visibility.ts](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/nova-visibility.ts:3) 隐藏；若R9取证仍不可达，应单列Nova运行未覆盖，不为截图改产品开关。
5. **局部对齐不要引入新裁切或占高。** 保留statusBarHeight+10的既有顶部避让来源，防止再加一份safe-area；只对文字处理截断，头像halo、返回Liquid Glass和focus-visible需有外溢空间。主导航行不可被根flex列压缩；长状态／错误条展开时，消息滚动区与底部输入仍需可用。不要通过移动整个头部来补耳机偏上，也不修改公共NovaAvatar样式或默认主题来解决单页问题。
6. **状态含义与原动效保持原有数据来源。** headerName、headerRole、dotStyle已有待分配／重连／离线／不可用／正在输入等分支；模板重排不能把所有状态统一成在线，不能丢掉原reduced-motion守卫。头像移入容器后重点看halo被overflow裁切，以及状态换行时点与首行文字是否对齐。

### R9最小代表验收矩阵与读回

| 场景 | 必看内容 |
|---|---|
| APP/H5，320中文浅色、英文深色、越文浅色 | 普通客服与长名称／最长状态；返回44×44，左右轨道等宽，身份组居中，无横溢、重叠或图标切边。英文／越文重音和辅助文字不能被截顶。 |
| APP/H5，390中文深色 | 放宽后的视觉平衡、耳机实际笔画的光学中心、玻璃及头像完整外缘；记录无状态行时的垂直居中。 |
| 320同页状态切换及历史／错误恢复 | 短状态→重连／等待／长状态、失败原页重试；返回实际点击与键盘仍可用，状态变化不会遮挡首条、日期分隔或输入区。 |
| Nova／顾问身份及真实远端动作，仅限可达范围 | 顾问SVG不被耳机偏移误伤；Nova40px头像与halo完整、长状态和“重新发起”布局可用。不可达分支明确记为源码检查，不能凭人类客服截图代签。 |

每张关键截图对应冻结R9清单及DOM读回：CSS视口宽度、头部／左右轨道／身份组／头像／SVG／返回按钮rect，组中心相对内容区中线的偏差（正常字号建议不超过1 CSS px）、滚动宽度与可见宽度、是否存在留白槽焦点。至少补一次返回操作及长状态切换；减少动态检查已有头像／状态动效守卫。新图只验新增项与受影响布局，不把原十二项历史证据更名为R9。真机安全区、系统文字放大、真实远端Nova／客服状态仍按实际覆盖范围单列。

本次仅追加本审查文档；未改生产源码、未使用浏览器、未执行Git。

## R10待复评补记：SEND-01恢复玻璃要求，CHAT-TOP-01暂停R9矩阵签核

用户明确发送按钮应保留Liquid Glass。主代理计划恢复共享LiquidGlass层，并叠加主题强调色，保留轻按反馈与减少动态支持。**SEND-01因此按新要求重开**：R8的9.3分及其reduced优先级修复仍是当时范围的真实历史，但不再作为当前材质要求已经通过的结论。此时尚未读取冻结R10代码或运行图，不提前打新分；其他十一项已签结论与边界保持。

R10本项需同时看可发送／禁用的双主题材质、纸飞机对比、共享玻璃层实际可见性及裁切；不能仅凭组件被挂载就认定玻璃已经显示。普通按住仍应外层44×44、内部反馈，玻璃层不能拦截发送或溢出；reduced下必须在可发送且active=true时实际读回各相关层无缩放／动画，并检查释放发送与媒体还原。既有R8旧证据不能替代新层级下的运行验证。

CHAT-TOP-01仍待评。主代理自行发现R9快速矩阵在主题尚未稳定时取图，light文件实际为dark，已明确撤出验收证据；本审按该通知记录排除，不冒称自己已经逐张判读R9。R9初始中文暗390仅为主代理报告的单帧结果，不能据此签主题矩阵。待独立端口重拍并提供最终R10清单／运行记录后，再逐张核对resolved主题、稳定颜色、截图和DOM视口；旧误标图不更名冒充R10。

本轮只更新本报告的当前状态及补记；未改生产代码、未操作浏览器或用户正在使用的5236、未执行Git。

## R11阶段复审：APP头部12格子范围9.2，SEND-01仍待补验

本轮收到的是R11源码冻结及APP头部12格先行交付，runtime仍追加中。**CHAT-TOP-01在已观察的APP头部12格本地视觉子范围给9.2；这是阶段分，总项尚未最终签核。SEND-01重开状态保持。** 原十一项分数和历史证据不变，R9的draft截图及runtime-r9-draft不计本轮通过。

### 冻结来源与独立核验

读取 [APP R11清单](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-build-r11.json) 和 [H5 R11清单](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-build-r11.json)，在各自工作树逐文件重新计算SHA256：双方均 **source43/43、artifacts341/341匹配，零不匹配**。

| 端 | sourceRef | browserBuildSourceRef | sourceFingerprint | artifactFingerprint |
|---|---|---|---|---|
| APP | `f80c088ae40f24cd96e3b2dc889fe4752a2356f4` | `31e43645c96b666c61ed119cf4d4035b3db2a980` | `81b7844b300a75b01d4d342a31758ad7cc6be18ec0a802eb83cb021d04a1c21d` | `8eee79a5cfe961a0b7f4f0c0d1bad7abfc4ba263f5c7fda5a252bb643204c6bf` |
| H5 | `fc781634fa3c0d12306429f48c1a95239de8026b` | `9a68faac8accb8a70e470183b1430d539a0efd77` | `c20f0fb5ad8c0367ecf23fc4a7dbb720d8140bc2de29dacdf15249a4c2afd71d` | `ff9784de9b5dd60314e803a6340a080226a2ca80a40df6776a9056c82040ed95` |

清单明确网页assets编译于R10，R11仅修改独立提供的预览HTML与日志，生产src不变；本审保留这两个版本字段，不冒称在R11重新执行网页编译。本次独立确认的是当前源码／产物与R11清单匹配，未执行Git跨提交差分或重跑构建。与已有R8清单比较，受追踪source变化为preview HTML、chat.vue及conversation-thread.vue，不把R8→R11整体变化误写成只有预览HTML。

### 逐张目检与读回范围

下列12张均使用view_image实际查看。图片扩展名为.png，文件实际编码为JPEG、像素尺寸均270×585；320／390是runtime记录的CSS视口宽，不用缩放图片像素推算触区。

| 语言 | 深色320 | 浅色320 | 深色390 | 浅色390 |
|---|---|---|---|---|
| 中文 | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r11-chat-header-zh-dark-320.png) | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r11-chat-header-zh-light-320.png) | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r11-chat-header-zh-dark-390.png) | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r11-chat-header-zh-light-390.png) |
| 英文 | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r11-chat-header-en-dark-320.png) | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r11-chat-header-en-light-320.png) | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r11-chat-header-en-dark-390.png) | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r11-chat-header-en-light-390.png) |
| 越文 | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r11-chat-header-vi-dark-320.png) | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r11-chat-header-vi-light-320.png) | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r11-chat-header-vi-dark-390.png) | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r11-chat-header-vi-light-390.png) |

读取 [runtime-r11](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/runtime-r11.json) 时其条目已从20追加到24；**本节只采用12条app-header记录**，时间为13:12:34.233Z至13:12:59.777Z。按原序筛选这些记录并以JSON.stringify(rows,null,2)加末尾换行序列化，子集SHA256为 `5cd68672ed61e57ecb2049e77989a9d08679aff01618424903c9938adcf9e73c`。这是本次审查子集的标识，不称仍在写入的整个runtime已经封档。

- 六张dark的theme为dark、pageBackground为rgb(0,0,0)；六张light为light、rgb(244,241,233)，与所见截图一致。本轮未见R9那种light文件实际dark的错配。
- 用identity左右坐标重新计算中心偏差，最大绝对值 **0.005203247px**；全部返回和右侧槽44×44，rightIsAction=false、overflow=false。头部约67.46px高、身份组约44.79px高，按钮、头像与两行文字视觉关系平衡。修复的是身份组整体居中，名字本身仍与其下状态左对齐。
- 耳机外框20×20，头像32×32；runtime的ink读回纵向偏差约0.0012953px、横向最大约0.00000793px。该数值是提交的几何读回，不冒称本审从270px缩放JPEG独立测出了亚像素墨迹重心。目检未见此前明显偏上或笔画切边。
- 三语状态分别为“正在恢复连接…”／Reconnecting…／Đang kết nối lại…；名称全部仍为“演示客服”，因此这是三语界面短状态矩阵，不等于长英文／越文客服姓名或最长状态已覆盖。

### 源码及实际构建CSS判断

[chat.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:24) 采用44px/minmax(0,1fr)/44px三轨、8px列间距；身份组justify-self:center、min-width:0，文字min-width:0。头像从此页原40px改32px，为窄屏释放空间；未因此修改共享NovaAvatar默认尺寸。名字与状态允许折行，头像和状态点不收缩。头部flex-shrink:0，保留statusBarHeight+10来源，返回玻璃允许外溢。

v-html专用包装器20px、line-height:0，局部:deep(svg)使生成的SVG为block；SUPPORT_ICON独立使用viewBox="0 -1.5 24 24"，顾问图标未套相同偏移。已检查清单匹配的APP `chat-Cz8tt3tr.css` 和H5 `chat-CnsM7AQ2.css`，实际包含上述grid／居中规则及 `.cp-ava-icon[data-v-…] svg{display:block}`，不是只存在于未编译源码。

Nova开关仍为false。原远端“重新发起会话”改为44×44真实图标动作，保留完整本地化aria-label及click／Enter／Space的onStartNewConversation绑定；人类会话右槽只是aria-hidden的不可点留白。该设计避免长文字挤入44px格，未新增虚假客服动作。Nova分支未打开运行，本节只确认其模板／样式和绑定，不能据此签操作成功或头像halo实景。

### 当前缺口及后续复评边界

本轮未发现需立刻退回的头部视觉缺陷。CHAT-TOP-01总项仍需已规划的H5实景、长名称／长状态与状态切换、实际返回读回；未知状态及真机安全区／文字放大继续单列。H5清单匹配与运行文件中开始出现H5条目，不等于本审已目检并签其矩阵。

头部截图内发送按钮处于禁用态，运行记录有glassCount=1、rim／specular／tint；这些只说明该静态状态已有玻璃层信息。**SEND-01仍待可发送强调色、两端普通／reduced按住及释放补验**，不凭这些头部图关闭重开项。前十一项未重新评分或改归R11。

唯一写入为本报告；未修改生产代码、未运行测试或浏览器、未触碰5236、未执行Git。

## R11补充复审：双端头部24格，SEND材质8.8未通过

### H5头部12格已逐张目检

在先前APP12格基础上，本次使用view_image original逐张查看以下H512格。文件实际JPEG，320图为320×693、390图为390×844，保持原文件名，不与先前270×585的APP缩放截图混记。

| 语言 | 深色320 | 浅色320 | 深色390 | 浅色390 |
|---|---|---|---|---|
| 中文 | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r11-chat-header-zh-dark-320.png) | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r11-chat-header-zh-light-320.png) | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r11-chat-header-zh-dark-390.png) | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r11-chat-header-zh-light-390.png) |
| 英文 | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r11-chat-header-en-dark-320.png) | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r11-chat-header-en-light-320.png) | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r11-chat-header-en-dark-390.png) | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r11-chat-header-en-light-390.png) |
| 越文 | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r11-chat-header-vi-dark-320.png) | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r11-chat-header-vi-light-320.png) | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r11-chat-header-vi-dark-390.png) | [图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r11-chat-header-vi-light-390.png) |

本次读取runtime时其条目从40追加到42，仍未收到封档通知。前24条均为预期header标签；按两空格JSON加换行重建该子集，SHA256为 `0bd2a3babb3381f3c574d70e8aef659f6d18f584b48369b44c89fbd2c1aff6c6`。其中APP12条的子集哈希仍与上节一致，没有把新增记录混入旧子集。

H5六张深色／六张浅色的theme分别对应黑底rgb(0,0,0)／米白rgb(244,241,233)。十二条均返回44×44、rightIsAction=false、overflow=false，最大身份组中心偏差0.005203px。目检未见英文／越文重连状态裁切、头像偏上或左右轨道失衡。**CHAT-TOP-01阶段9.2的已观察范围扩展为双端24格。** 两端新增header-back记录均为page="#/pages/support/messages"、conversationVisible=true；本审读取结果，未亲自操作。长名称／长状态切换仍未覆盖；错误fixture明确路由到列表，不据此签聊天页错误头部。

### P2视觉：SEND-01真实玻璃层已恢复，但可发送态仍偏平

实际查看 [APP深色ready，390×844](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r11-glass-ready-zh-dark-390.png) 与 [H5浅色ready，320×693](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r11-glass-ready-zh-light-320.png)。两文件SHA256分别为 `42b2c0f9bef0195b4cfde7745af9294da45ddb94160d953981de6ad944e374ea`、`0af6ac00800028e53ff11692b4c646d633f0e2a16ee63ac72f9f9f44cbe06723`。

**SEND-01当前视觉复评8.8，不通过。** 这是新要求下材质辨识度的判断，与R6／R7曾有的reduced优先级缺陷不同；R8修复及历史9.3保持原义。

- APP深色：右下44px绿色按钮主体几乎为均匀色块，细边存在，但上缘亮面与下缘暗面差异很弱；在常规页面观看尺寸下，更容易读成实色圆片。纸飞机清楚、可发送状态清楚，但这两点不能代替玻璃质感。
- H5浅色：蓝色按钮比深色略有边缘层次，仍以饱和蓝色圆片为主；细微亮缘不足以形成稳定可辨的玻璃厚度。同页返回入口的边缘与体积层次更明确，可作为现有材质系统的局部对照。
- runtime确有glassCount=1、strategy=svg、specular blob、rim及品牌色82%透明tint，且face背景透明。因此本审认可共享层恢复，没有声称组件缺失或是伪造玻璃；未过的是最终图上的可辨程度。纯色背景下不要求凭空出现内容折射，但仍应能读出克制的高光、暗缘与色层差异。

可行动位置为 [conversation-thread.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:742) 的ready face局部，以及它所消费的 [LiquidGlass](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/liquid-glass.vue:32) 已有光学层。当前ready采用单一82%品牌tint，shared specular opacity为.38；这组组合是优先试调位置，实际改善仍需新图确认：

1. 只为可发送face调现有`--v5-liquid-highlight`／`--v5-liquid-bottom`／rim或局部specular强度，使一侧亮缘与相对暗缘在44px正常尺寸可辨；控制在现有共享层内，保持图标为最上层。
2. 若色层仍掩盖层次，再小幅降低或分层处理ready tint覆盖，逐主题确认绿／深字和蓝／白字可读；不将降低alpha当作已经验证的固定答案。保留可发送与禁用的明显区别。
3. 保持44px外触区、内部缩放及R8同等active的reduced守卫；保留无hover要求。采用局部内缘层次，避免加大外投影而重新触发阴影切边，也不改变全局玻璃或底部导航。

修后最小复验仍为APP暗390、H5浅320的正常尺寸ready／disabled对照，再核对普通按住与reduced按住时玻璃和图标一起稳定、没有切边。素材／代码变化须用新冻结版本，不覆盖本次8.8证据。

### 按压补录的阶段观察，不冒称已最终封档

正在追加的记录已出现APP稳定普通held：active=true、reduced=false、外44、face40.48、scale(.92)，以及实际0.2s回弹事件和restored发送可见。两端reduced held均为active=true、44px、transform:none、animation:none，释放记录为none-observed。上述可以作为最终补验材料，但不改变本次材质8.8。

H5 `h5-glass-normal-held-correct-coordinate` 当前是active=true却face44、transform matrix(1)，不能把它写成已证明稳定按住缩放；释放0.2s事件已记录。需补transition结束后的正常held读回，例如外44／内部约40.48。此前带`pointer-miss-not-validation`的两条仍排除，不使用其中none-observed判断动效失败。这个缺口是测量时点待补，不凭单帧认定实现回归。最终media-restored与发送成功范围以封档记录再确认。

前十一项结论不变。本轮只更新本报告，未改实现、未操作浏览器或5236、未执行Git。

## R11头部最终签核与R12发送项限定范围

**CHAT-TOP-01最终9.2，接受R11双端24格已经观察的本地视觉范围。** 从阶段分转为该范围最终签核，分数未提高；长名称／长状态和真机等未覆盖项按下文继续排除，不要求补齐这些范围才承认现有24格的结果。

最终源码标识保持APP `f80c088ae40f24cd96e3b2dc889fe4752a2356f4`、H5 `fc781634fa3c0d12306429f48c1a95239de8026b`。本次只重新核对与头部直接相关的双方chat.vue哈希，仍匹配各自R11清单；沿用此前43/43源码、341/341产物核验，不重新运行整套测试。Nova visibility文件不在43文件清单中，其关闭状态来自此前直接源码检查，不误列为该清单覆盖。

[runtime-r11.json](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/runtime-r11.json) 已按主代理通知冻结为 **42条**，本审读回一致，整文件SHA256为 `5855919636d1696b13b0d9f7dc630a39fede66f62148241f1d171048493fceb5`。前24条header子集哈希仍为 `0bd2a3babb3381f3c574d70e8aef659f6d18f584b48369b44c89fbd2c1aff6c6`，之前逐张目检的证据保持原义。24条均44px返回、无横溢、无虚假右侧动作，身份组最大偏差0.005203247px。两端header-back记录目标为消息页；没有把这些记录描述成本审重新操作浏览器。

签项边界：APP/H5浏览器原型的三语×明暗×320/390常规头部，使用固定“演示客服”和三语重连短状态。长身份名称、最长状态、状态切换后的阅读锚点、Nova关闭分支的真实操作、原生安装／设备安全区／系统文字放大均未签。app-error-routed-to-list属于列表错误fixture，不补造聊天错误头部通过。未发现该已观察范围内仍需退回的布局缺陷；R9 draft主题图不进入证据。

### SEND-01仍为R11的8.8，R12只增强现有ready玻璃层次

用户已确认可发送时的绿色并明确“颜色不用改”。因此取消给空输入新增主题色的要求；**R12保留ready82%荧光绿／蓝tint及disabled中性色，只局部增强ready上缘高光、下缘暗部与specular，不加外投影或hover。** 上一节关于降低tint的可选试调建议不再作为当前修复要求。

[APP最终空输入图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r11-final-empty-zh-dark-390.png) 已实际view_image original查看，SHA256为 `65da51aef0afd946c1f58770283bfa21b8b867bd889e6945ca10cefa60b0f449`；禁用入口是中性深色玻璃与灰图标，最新要求允许保持。其记录disabled=true、44×44、tint为rgba(24,24,28,.82)，故“视觉偏透明”不等于实现完全无底色。本项8.8仍仅针对先前ready两图中玻璃厚度辨识不足，不以被取消的禁用染色需求扣分，也不因用户认可颜色抹去材质问题。

两张R11 ready图的哈希与上节相同。R11 stable-held中APP已有外44、内40.48／scale(.92)；H5正确坐标held仍为scale(1)的时点帧，释放有0.2s动画。R12准备的双端stable-held＋reduce读回可补这一差异；现阶段不将早帧推断成源码回归。两个pointer-miss-not-validation条目继续排除。主代理已说明actualPressed.url是iframe的src属性，该字段不用于判定SPA当前路由；最终app-final-empty-restored记录的实际url为聊天页cid=DEMO-SUPPORT-1，不因旧src显示messages而虚构路由问题。

R12补验仅要求新版本APP暗390／H5浅320 ready与disabled材质对照，以及普通稳定按住、释放回弹、reduced按住／释放和恢复媒体状态；不会把旧R11照片改称R12。SEND-01在新实景评审前保持 **8.8、未通过**。其他十一项原评分和版本边界延续，CHAT-TOP-01独立9.2；不得汇总为十三项全过。

本次只更新本报告，未改生产代码、未跑测试或浏览器、未执行Git。

## R12新增验收约定：飞机转向与真实settled复位，尚未评分

用户进一步追加发送按钮内飞机转向。本节记录主代理准备实施的设计，未检查尚未冻结的实现，也不宣称测试或运行已通过。先前R12“仅增强玻璃”的范围自此增加本项；原颜色保持不变。

- 飞机自身转向-25deg，过渡160ms；最短展示160ms用于看清转向。真实发送尚未settled时，不能因该时长结束或Nova仅入队就复位。
- 成功、失败、取消均复位；复位仅表达发送过程结束，不能代替成功回执，也不能隐藏失败／取消提示。视觉检查需区分短请求与长请求的实际事件顺序。
- 父组件send计划接收可选settled回调；human等待实际send完成，Nova按turnId终态／失败／取消处理。回调兼容性、重复触发及生命周期／owner隔离由独立行为审查核对；视觉证据同时检查离页、切会话后旧请求不会使新按钮旋转或回正。
- 飞机旋转与原face按压缩放应分别作用于对应层，保持外层44px触区及玻璃完整，不让图标旋转带动整块玻璃或造成裁切；保留原回弹，不新增hover或外投影。
- reduced=true时飞机、face全程静态，包括实际按住、等待settled及复位过程；不能仅用释放后的animation:none证明全部静态。

R12补证范围更新为APP暗390／H5浅320的ready与disabled材质对照，普通稳定按住／回弹，飞机开始转向／等待／settled回正，失败与取消恢复，以及reduced完整周期。Nova入口仍关闭，不为验收开启；未能实景覆盖的队列终态仅列源码／行为测试证据，不借human截图代签。仍需新冻结清单与对应截图／运行记录，旧R11证据保持原名和分数。

**SEND-01继续保留R11的8.8、未通过，新转向不提前评分。CHAT-TOP-01最终9.2及其余十一项已签结论和边界均不变。** 本次仅更新本报告，未修改实现、未操作浏览器、未执行Git。

## AUDIO-01新增第十四项：移动交互／可用性预审，未评分

新增项接现有“界面音效”偏好，默认false，不增加聊天header按钮。本审只读检查 [音效控制](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/conversation-audio.ts)、[会话接入](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:259)、[偏好状态](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/store/preferences.ts:49)、[偏好页面](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/me/preferences.vue:21) 与相关现有测试，未运行测试、未播放声音。

静态确认：缺省与无有效保存值时关闭，开关写入本地存储；现有整行switch有aria-checked、Enter／Space，三语hint说明聊天音效与默认关闭。音效创建需已开启且当前可见，并由聊天区touchstart／mousedown／keydown或输入／发送解锁。accepted=true只触发一次发送音，失败及旧epoch回调不触发。来信复用已见ID／尾部追加判断，历史前插、系统行、回执修改与返回快照不作新来信。音效入口按类型400ms合并突发，播放错误被吞并，不改变消息状态；静音、hide、身份切换停止播放，dispose销毁。

H5背景接线已查本地安装的UniApp运行库：visibilitychange会发App foreground/background，并调用当前页ON_SHOW／ON_HIDE；聊天页生命周期再控制threadVisible及sounds.stop。因此没有仅因业务代码未直接监听document.hidden就判为漏洞。**实际切后台／恢复是否立即停止且不补播仍需运行证据**，设备锁屏和原生生命周期不由这段H5源码代签。

明确可用性边界：开启偏好本身不在聊天区创建voice。若进入会话后尚无聊天区手势，play会因voice未创建而静默；AudioContext尚未running时也不排队补播。验收时需要展示“首次手势前后”的真实结果，不把开关开启解释为无条件已能播放。若产品要求返回聊天后首条来信立即有声，需另外确认手势授权与voice生命周期如何衔接；本次不新增header控制或强制提示。

### 音频文件分析，不能代替听感

只读解析RIFF/PCM：两文件均单声道、22050Hz、16bit，无需通过扬声器即可得到下表。非零采样时长与拟定135／190ms一致，文件另含约15ms零尾。

| 文件 | 总长度 | 最后非零采样位置 | 峰值幅度 |
|---|---:|---:|---:|
| chat-send.wav | 150.023ms | 135.011ms | 0.06940 |
| chat-receive.wav | 205.034ms | 190.023ms | 0.06976 |

H5源码为send 660→990Hz、receive 784→622Hz，gain峰值.07；native设volume .55及obeyMuteSwitch=true。上述只能说明波形／参数及静音开关意图，**本审没有耳听，不据此签“轻柔”“音量合适”、实际声压或原生静音行为**。没有安装／运行新的原生包。

最小运行矩阵：默认off与开关持久化；开关on后手势前／后；一次成功send与失败／取消无音；新live receive与历史／回执无音；静音立即停止；前台→后台→返回无补播；会话／账号切换迟到响应无音；音频被浏览器拒绝仍能聊天。提供WebAudio创建／resume／oscillator start-stop等事件及业务对应关系，和三语320偏好行可见性／触区代表图。事件分与主观听感、真机证明分开；**AUDIO-01当前无分，不提前给9分。**

## R12先行实景：仅APP暗390材质9.1，整体SEND仍待补证

已读取 [APP R12清单](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-build-r12.json) 与 [H5 R12清单](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-build-r12.json)。源码标识为APP `602274ee7f8961d143d1691ea33a6411678a715f`、H5 `88038a67aaf8e8d2822a6e0d9e3e87409d79812a`。双方清单均48个source、343个artifact，本审实际重算结果：

- H5：48/48源码、343/343构建匹配。
- APP：47/48源码、343/343构建匹配。唯一差异为 `src/lib/conversation-audio.test.ts`，清单hash为 `6433dd6d255c1e965dd55fd30d0c18c819a4996e418363a28a30f34d9b1b2b1a`，当前文件为 `7d40d3b7166c4aab360c693a1097bb8eaed8304b83f2dc2b87f32baeff1a58e1`。清单内生产源码与构建未出现不匹配，但不能称当前APP整个48文件测试树完全冻结；本审不修改或重跑这个测试。
- APP source/artifact指纹为 `e12702ae6a4e774694c67b7f4ae48642332f44996c0037f5e38b5221e4d71fbb`／`0e470fd5fefc9d6ab779eed8259a4a28c101b570e1a55805c31a0e03b186203b`；H5为 `5cde848413a438099cd04059e5cbff40bd9dd6194befb5b4dabc9f178077d89a`／`6a652dcce88ac2932e2a59a5a8ba5cd971db0da2714c3ff78957a5372f971416`。195/195及双web／tsc绿采用主代理通知，不冒称本审执行；native通知仍在收尾，不计新安装或设备运行。

### APP已冻结截图的材质判断

使用view_image original查看 [APP R12 ready暗390](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r12-send-ready-zh-dark-390.png)，文件SHA256为 `d1e85ebb52b617c72ecb8bc0c8e8f4ca38a7bec2b8a6d48fe4486c5d505afa33`。相较R11的均匀色片，上缘亮面、下缘暗部及曲面过渡已经可辨；绿色强调不变，深色飞机保持清晰，按钮外围未出现新增大投影或裁切。效果仍克制，这一帧已达到接受程度：**仅APP暗390 ready材质子范围9.1**。

局部源码保留82%品牌tint，只增强ready的highlight／bottom、内阴影、既有tint层渐变和specular .6；作用范围未扩至全局玻璃。此处评分基于所见最终图，源码只用于解释变更，不因层数或参数增加自动判过。R11的8.8保留为修前记录；不把APP单帧分数等同于整个SEND-01已经通过。

### 首条正常飞机RAF记录：只确认已记录的视觉轨迹

读取runtime-r12时已有3条、尚未封档；本次只采用已明确交付的首条 `app-plane-normal-dark-390`。该条按两空格JSON加末尾换行序列化的SHA256为 `aacfe3c3f46df777701d1bbcbe7ef4718b43f63bfe44803b17842d67b1e9f252`。43帧记录中，按matrix独立计算最深角度为152ms时 **-24.703898°**；166ms首次turning=false，366ms回到0°，所有帧buttonWidth=44。face回弹与飞机转向分层，未把44px热区一起缩小。

此样本证明已捕获正常模式的转向及约200ms回正轨迹；busy／turning是表现状态，不能单独推出真实send在160ms完成。慢请求、失败、取消、迟到owner隔离及Nova终态仍按各自证据审核。后续条目虽已开始写入，本节不把尚未交付／封档的H5、reduced或AUDIO材料自动计为通过。

当前结论：**SEND-01整体待复评，APP上述单帧材质9.1；AUDIO-01待运行评分；CHAT-TOP-01的9.2及其他十一项原签项不变。** 本次唯一写入本报告，未改源码、未重跑测试、未使用浏览器或Git。

## R12继续复审：不等待STATUS-01，先记录当前结论与缺口

用户新增STATUS-01为第15项，要求后续增量审查。本轮继续读取R12清单和现有运行证据，没有审新状态实现，也没有把原型缺少WebSocket造成的持续reconnecting追溯成R11头部布局失败；后续preview脚本的模拟状态必须与真服务区分。

### R12证据隔离与当前文件状态

APP／H5的R12 sourceRef与上一节相同。重新逐文件核验：H5仍48/48 source及343/343 artifact匹配；APP目前46/48 source匹配，差异为 `src/components/support/conversation-thread.behavior.test.ts` 和 `src/lib/conversation-audio.test.ts`，343/343 artifact全部匹配。当前清单内生产源码仍匹配，两个测试变化不能当作冻结R12测试已重新通过；本审不重跑测试或修改这些文件。此记录更新“仅一份测试变化”的当前状态，保留先前时点为历史。

runtime-r12本次读取为 **9条**，SHA256 `4afbdc3a417f122e915b79b72b2b5794731f5bcadcc1b3a1a897f1666874df65`；尚未收到最终封档通知，本节只签明确列出的观察范围。最早APP正常RAF条目hash仍为上节 `aacfe3c3f46df777701d1bbcbe7ef4718b43f63bfe44803b17842d67b1e9f252`。

### SEND-01当前视觉／正常与reduced子范围9.2

已original目检并复核 [APP ready暗390](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r12-send-ready-zh-dark-390.png)、[APP empty暗390](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r12-send-empty-zh-dark-390.png)、[H5 ready浅320](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r12-send-ready-zh-light-320.png)、[H5 empty浅320](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/h5-r12-send-empty-zh-light-320.png)。原ready82%色保留，两端局部上缘／暗缘能读出层次，图标清楚；禁用中性色与ready明确区分，无新增外投影切边或触区挤压。R11材质问题在这两端代表帧已改善，不继续以旧8.8描述新图。

APP ready hash仍为 `d1e85ebb52b617c72ecb8bc0c8e8f4ca38a7bec2b8a6d48fe4486c5d505afa33`；APP empty为 `2e756f1f4b5f5c65ba5153221e555a801c6ddeafc78e4f736d873e8837dbdd78`。H5 ready／empty分别为 `57bd275b7259e88bc324353bf15281d868075af385ea536a041d5eff7403e47e`／`8208fe70603ff1f9a04c0bdb836c55a828ba6beaeada036896116a1a770c4180`。

运行读回：

- `h5-glass-normal-held-settled` 为active=true、reduced=false、外44×44、face40.47998px、matrix(.92)，**关闭R11 H5只采到scale(1)的测量缺口**。这是新证据，不改写旧帧。
- APP正常43帧最深约-24.704°、366ms回0°；H5正常44帧最深约-25°，181ms首次turning=false，约380ms接近0°，末帧为0°。两组buttonWidth始终44。约200ms回正与源码设计一致，但RAF采样精度不等同毫秒精确计时。
- APP reduced 43帧、H5 reduced 45帧，全程记录face与plane均none，逻辑turning仍从true到false，说明静态模式未靠停止业务状态推进实现。H5另有active=true的reduced held，内外44×44、transform:none、animation:none。
- `h5-reduced-restored` 为false；**当前九条没有APP同轮恢复媒体false记录**，不能顺带声称双端设置均已复原。

**当前已观察的视觉／正常与reduced子范围阶段9.2；没有新发现的确定视觉P2。** SEND完整签核仍需确认回正与真实send settled的因果：现有帧只有busy／turning等表现状态，未展示慢请求超过160ms仍保持转向、失败／取消复位且不产生成功假象，以及会话／owner切换迟到响应不影响新实例。它们是未覆盖证据，不凭缺证认定实现有错，也不等待STATUS实现才给出本结论。Nova关闭分支只按源码／行为测试证据列明，不能用human图代签；真实服务、真机仍未验。

### AUDIO-01当前缺口：设置可读，不等于音效已运行

已original目检 [APP音效设置暗390](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r12-sound-setting-zh-dark-390.png)，hash为 `f688d4e3fcea7c0251114e4068255760385beb9eeaeb6767148e572df299d9f7`。中文标题“界面音效”、说明与开关没有裁切／重叠，现有整行设置方式可理解，无新增聊天header按钮。这张图显示on，不能据此证明首次启动为off或开关实际持久化；默认false仍是源码证据。

本轮九条runtime中没有音效创建／resume／oscillator start-stop与业务事件对应记录，也没有开关off→on→off的操作读回。因此 **AUDIO-01仍不评分，不用设置截图给9分**。需补首手势授权后的成功send／新live receive、关闭及后台抑制、历史／回执／失败／取消不响、返回不补播的事件证据；开关持久化与拒绝播放仍能发消息也需明确。首手势前可能静默的已知边界保持。

本审未播放音频、未耳听设备，也未安装native。即便后续WebAudio事件完整，也只证明相应浏览器音频调用，不会替代扬声器实际出声、音量舒适或原生静音开关实测。此时不追加无证的音效成功声明。

### STATUS-01后续增量边界

待主线程完成thread/type/chat状态投影、pending bubble、图标a11y与真实状态生命周期，并提交冻结代码／新截图后再审。检查对象将是原回执位置的纯图标与失败图标直接重试；TIME-01已有逐条时间及居中时间规则、AUDIO成功音与SEND旋转应按新状态证据核对关联，但本轮不把新需求倒灌到R12。preview worker的online／offline／reconnecting和send场景仅是本地演示证据，不能作为真实WebSocket或服务在线证明。

所有旧报告及版本评分保留，其他已签项不重审。本次唯一写入本报告，未改生产代码、未操作浏览器、未运行测试或Git。

## R14用户覆盖指令：紧凑气泡、内置时间及自己的状态图标

本节记录最新用户决定，替代前述STATUS“沿用原回执位置”的排版方案。本审本轮没有读取新的Telegram参考截图或R14最终图，**不提前评分，也不把旧分直接签给新布局**。

- incoming不呈现任何发送／送达／已读等状态；状态图标只用于自己的outgoing。
- 气泡更紧凑，时间与自己的状态图标收进气泡右下；outgoing的项目主题渐变按下节澄清理解为跨气泡、按屏幕位置形成，不能在单条内部使用渐变。
- MSG-01原“来信右侧／外发左侧”的外置状态排版及其9.3分保持历史，当前新位置重新待评。原回执色在旧背景上的对比计算也不能代替新渐变上的可读性检查。
- TIME-01旧逐条时间外排被部分替代；首条／跨日／相邻至少5分钟分隔、三语日期和24小时HH:mm语义继续保留。新气泡高度、内置元信息与历史前插锚点需按R14重新观察，原9.3不自动覆盖。
- 失败图标直接重试与可访问名称、真实pending／failed／unknown投影、12s确认＋最多3s原命令读回的主动等待上限仍属于后续验收；unknown不得因超时被伪装为失败。新视觉要求不取消这些生命周期约束。

R14重点目检320三语的短／长消息、换行及附件场景中，正文与时间／图标是否重叠，单行气泡是否被元信息不必要地撑宽，incoming是否彻底无状态，暗／浅渐变下时间和图标是否可读，以及失败图标是否有可用触区而不遮住正文。待冻结实景后按实际覆盖范围给分，不要求原外排规则复原。

**SEND-01的R12已测材质／正常与reduced子范围9.2继续保留；它不涵盖R14新消息气泡、状态位置或重试生命周期。CHAT-TOP-01的R11限定9.2及其他旧签项仍按原版本／范围成立，不冒称已验R14。AUDIO-01仍待运行评分。** 本次只更新本报告的当前状态及覆盖关系，未改生产源码、未重哈希旧清单、未操作浏览器或Git。

### R14进一步澄清：单条纯色，整屏跨消息渐变

用户明确：消息气泡磨砂半透明；**每条发送气泡内部必须是单一纯色，颜色按当前屏幕位置从下到上逐条变化，整体形成主题渐变。禁止在单个气泡内部绘制渐变。** 浅色沿用blue，深色为lime／green。此前任何含糊的“outgoing主题渐变”均按本澄清验收，不据此认可单条linear-gradient。

后续冻结证据需逐条提供：消息ID、CSS视口与聊天可见区域、实际取样屏幕坐标／映射范围、气泡rect、computed background-color及background-image。按冻结方案的取样点计算预期颜色，不在本预审中擅自指定中心点或插值算法。滚动位置改变后应按新的屏幕位置重新取色，不能只按消息序号、创建时颜色或文档绝对位置保持一套旧色。

| 检核 | 通过依据 |
|---|---|
| 单条内部纯色 | 气泡实际填色层background-image为none、background-color为单一颜色；会影响填色的before／after或内部覆盖层也无渐变图像，不能只检查外壳。正文中的附件图片不与背景图像混淆。 |
| 磨砂半透明 | 记录填色alpha与backdrop-filter等实际渲染值，并目检磨砂层次、文字／时间／状态清晰度。半透明模糊会反映背后内容，不能要求最终截图每个像素完全相同，也不能仅凭alpha参数就签质感。 |
| 位置与颜色对应 | 同帧可见outgoing逐条按屏幕坐标排序，computed颜色与映射一致，暗lime／green及浅blue各有证据。不同颜色本身不算已证明位置映射；色阶量化误差按实测值记录。 |
| 滚动后整屏色序 | 同一消息滚动前后位置改变，颜色随位置更新；对照上／中／下可见区域保持预期色序，检查无明显跳色、残留旧色或反序。补长文本／附件改变高度及窗口尺寸变化后的重采样。 |
| 新气泡可读性 | 在色带上下端及中段检查正文、内置时间和状态图标；320三语不重叠，incoming仍无状态。旧R3单一背景的回执对比值不能替代此检查。 |

本次仅记录验收澄清，未检查新实现或新截图，不新增分数。原SEND-01的R12 9.2继续只限其材质／动效scope；MSG-01、TIME-01受覆盖的排版及STATUS-01等待新证据。唯一修改为本报告，未改源码、未重哈希旧清单、未使用浏览器或Git。

## R14草稿预审与R14e历史色序基准（2026-10-27，未最终签核；浅色随后被蓝紫方案覆盖）

本轮实际使用view_image original查看 [初版暗390短消息](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r14-first-draft-zh-dark-390.png) 和 [初版暗390长消息](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r14-long-zh-dark-390.png)，并读取runtime-r14.json的初始、长消息、live incoming布局与滚动几何记录，以及当前conversation-thread.vue、conversation-bubble-layout.ts和时间戳规范。源码仍在调整；这些初版PNG及JSON没有改称R14e。

`app-r14-long-vi-light-320.png`由主代理明确为浅色selector失效的失败草稿，本轮不计通过，也不借用其结果签浅色。主代理说明用户另见的navy浅色截图为R14c旧版，同样不能代表R14e。未重哈希旧manifest、未运行测试或浏览器。

### 最新颜色方向及已读源码

用户最终方向为**顶部浅、底部深**；每个气泡只有一份纯色填充，跨气泡按当前聊天视口位置形成色序。当前源码已读到：

- 暗色上端rgba(95,123,12,.84)，下端rgba(22,88,66,.84)。
- 浅色上端为主题`--v5-brand`（#0E48E6）90% alpha；下端为`--v5-brand-deep`（#0833B8）与#020B34按65%／35%混色后，再取90% alpha。下端原始RGB约(5.9,37,137.8)，不是先前自拟navy端点。
- 浅色使用完整`:global([data-theme="light"] .nx-conv-thread)`选择器；incoming为white alpha .76配主题ink。源码可确认写法已变，编译后选择器实际命中仍需R14e的data-theme／computed读回与稳定图。

`conversation-bubble-layout.ts:4`按气泡中心相对聊天视口计算0至1的位置并取三位小数；`conversation-thread.vue:499`起合并滚动测量，消息变动、显示恢复、图片load与DOM ResizeObserver均有重测路径。`:551`把结果传入局部CSS变量，`:683`起用color-mix求单个background-color，气泡本体background-image:none。当前所读气泡样式没有另加渐变覆盖层；发送按钮既有玻璃渐变不属于单气泡填色限制。

### 已观察结果与一个待修P2

**未发现已证实的P1。发现一个P2规范偏差，未修改生产文件：**

| 优先级／位置 | 问题与影响 | 最小修改／复验 |
|---|---|---|
| P2，TIME-01；[conversation-thread.vue:632](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:632) | 居中的日期／5分钟分隔目前为font-size:11px；已经纳入R14紧凑布局的[时间戳规范:7](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/PRD/UVEL_IM时间戳显示规范_20261026.md:7)仍明确要求12px辅助文字。逐条时间改10px没有同步授权把居中分隔缩至11px；小屏分层也更弱。 | 只将`.nx-conv-time-divider`恢复12px，保留正文14px、气泡内HH:mm为10px与当前紧凑间距。复验320三语的日期分隔computed font-size和稳定图，确认不截断。 |

其余当前可确认的观察：

- 两张暗390图中的短消息高度为33.333px；长消息75.333px，正文完整换行，时间／自己的状态位于气泡内右下。目检未见正文与footer相互遮挡、气泡外漏时间或横溢。可见footer的rect均处于气泡rect内；长文整段Range包围盒本身会跨行，不能仅以它与footer矩形相交判为文字重叠。
- 当前间距源码为不同组10px、同组3px；组边界包括换方向、换显示作者、系统消息与时间分隔。截图只证明已显示的普通文字场景，不能代签附件／推荐CTA／失败重试等高度变化。
- 初始、长消息、live incoming和滚动四条布局记录均为externalMeta=0、incomingStatus=0、horizontalOverflow=false；全部气泡背景图none、blur(16px) saturate(1.25)。旧图能辨出半透明暗灰incoming及绿系outgoing，但单靠blur参数不能证明所有内容背景下的磨砂观感。
- 初版旧色序的computed RGB与其当时端点及position插值吻合，最大差约0.00013／255。初始、live与滚动帧的位置读回匹配气泡中心；长消息帧最多差0.001归一化位置，约0.69px，不能包装成完全静止的零误差。
- 同一`nx-conv-message-38`在live记录中y=77.125、position=3.8%，滚动记录中y=461.792、position=59.6%，computed填色随之改变。这是初版重采样机制的实际读回；旧端点方向相反，不能据此声称最新“底深顶浅”已运行通过。

### 对比度计算与最小待补矩阵

按当前源码端点、黑色暗主题底和#F4F1E9浅主题底进行独立alpha合成计算：暗色最浅端正文约6.07:1、元信息约4.96:1；浅色最浅电光蓝端白字约5.75:1、元信息约4.89:1，R14e更深下端约10.14:1／8.62:1。沿插值采样未得到更低值。以上是**固定背景假设下的源码计算**，不是R14e截图测量、浏览器渲染证明或全面可访问性签核；描边、文字抗锯齿及真实磨砂背后内容仍以实景为准。不能用这些比值代替用户要求的上下色差目检。

| 后续最小证据 | 核查要点 |
|---|---|
| R14e浅320越文／暗390中文，稳定主题各一组上中下可见outgoing | data-theme与实际主题token一致；单条填色及填色伪元素无渐变；正文／时间／状态清楚；顶部浅、底部深肉眼可辨。记录气泡ID、rect、position、RGBA和footer rect。 |
| 同一批消息的滚动前后稳定帧 | 同一ID随屏幕位置重新取色；至少上中下各有样本，颜色顺序正确；记录最终scroll位置，避免动画中间帧冒充静止误差。 |
| 320的长越／英文本、显式换行、长链接、图片／CTA各代表样本 | footer不盖正文、不横溢；图片load或内容高度变化后重新采样；CTA仍能操作。不要因一个长中文通过而扩成全语种／内容通过。 |
| failed／unknown的最窄气泡及重试恢复 | 44px图标操作区域处于本气泡内，不压邻行、不吞正文点击；动作和a11y名称符合真实状态。当前两张图只出现sent／read，尚未覆盖此项。 |
| 首条／跨日／5分钟分隔在320三语 | 12px居中辅助文字，无背景；日期不断字裁切，历史前插后的分隔变化不破坏滚动锚点。 |

**结论：本轮为草稿预审，不给R14最终分数。P2分隔字号待修；R14e浅色上下差异、最终方向及剩余矩阵待新证据。** 原MSG-01／TIME-01布局分不代签R14；SEND-01既有R12已观察材质／动效9.2仍只在原scope保留。真实服务、新原生安装、设备触摸及设备出声未验。唯一写入本报告，未改生产源码、未运行测试、未操作浏览器或Git。

### 后续覆盖：最终待构建浅色蓝紫palette

用户最新允许蓝紫／蓝绿择优，主线程选定**上紫下蓝、整体底深顶浅**。本审再次只读核对`conversation-thread.vue:588–594`，当前源码已是上端rgba(130,59,191,.9)，下端`--v5-brand` 75%与`--v5-brand-deep` 25%混色再取.9 alpha，meta为#EEF2FF；暗色lime→forest不变。这取代上节R14e blue-only配色基准，旧navy、电光蓝单色系截图与对比结果均不用于此palette最终签核。

在相同#F4F1E9平底假设下重新计算，上端合成RGB(141.4,77.2,195.2)，相对亮度约.149828，白字／meta约5.25:1／4.70:1；下端合成RGB(35.65,84.175,219.95)，相对亮度约.119013，白字／meta约6.21:1／5.56:1。该静态模型没有新增已证实的对比度P2，仍不能代替10px时间在新实景中的可读性及磨砂观感。

单看端点不足以证明严格逐条变暗：此sRGB插值在归一化位置约.916处亮度最低约.118796，最后一小段到下端回升约.000217。此幅度不足以据此认定肉眼可见缺陷，本审**不把它列作P2或要求为此立即改色**；最终仍以按屏幕位置的稳定采样及图像确认无可见反序。若把全程数学单调性写成严格验收条件，应同时核对中间值，不只比较两个端点。

当前重新读取的居中分隔仍是11px，前述TIME-01 P2继续待修。上一节的紧凑布局观察、两张暗色草稿范围和待补矩阵继续有效，浅色各格统一改用此蓝紫方案重新取证。**新palette尚无本审已目检的冻结截图，不评分、不最终签核。** 本次追加仅改本报告。

## R14冻结蓝紫三图限定复审及日期字号修复分账（2026-10-27）

采用主线程提供的APP冻结引用`fd28d620422b2bf775aee71d8952265642d53079`与H5镜像短引用`12ad170`；本审未执行Git，不猜补H5完整引用，也未等待通用manifest。双端网页／tsc／APP原生资源编译绿为主线程通知，不写成本审执行或原生设备运行。随后独立提交`fix(im): retain readable date divider typography`只修日期字号，其新构建／实景与下述修前图片分开记录。

本次实际view_image original目检以下三张，不使用初稿、r14c或r14e图片代签：

| 截图 | SHA256 |
|---|---|
| [APP中文浅390](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r14-final-zh-light-390.png) | `6b55af46c36daa3e50af093039d331c63546b9b90507a55e4c9b405588a207c9` |
| [APP越文浅320](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r14-final-vi-light-320.png) | `262c56b230b5746146731740eeecd7117e59e3f5000049d6d83b7cc139aa198d` |
| [APP失败样图浅390](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r14-final-failed-light-390.png) | `12bc710fa25e3cdd9b3dd5c670505e809ac52c3c8dc66fc7d58910966c8643ba` |

对应采用runtime-r14中的`final-zh-light-390`、`final-failure-icon-retry-success`、`final-vi-light-320`。本轮读取间运行文件继续追加了其他final滚动／暗色条目；本节只给已明确交付且实际目检的三图分数，不把新增JSON存在等同于已经看图验收。也不将整个runtime文件称为本轮封档不再变化。

### 逐项分数，不取平均

| 项目／本次范围 | 分数／判定 | 判断依据与限制 |
|---|---|---|
| MSG-01：APP两组浅色普通文字的紧凑布局、内置时间／状态可读性 | **9.2，限定通过** | 短文不被元信息撑成大卡片；中文长文及越文长文完整换行，footer保持内置且未盖字。中文来信在390单行、320自然给时间另起一行，没有为压高度造成重叠。incoming无状态。仅签已显示普通文字和语种尺寸，不扩为全部内容类型。 |
| STATUS-01：APP浅色单条纯色蓝紫、sent／read与失败图标外观 | **9.1，视觉子范围限定通过** | 上紫下蓝在新图中明显可辨；单个气泡色面统一、边缘清楚，白字／状态不被底色吞没。失败样图中的图标与时间完整处于本气泡内。此分不包含尚缺失败态DOM读回的44px命中结论或业务重试生命周期。 |
| TIME-01：本批图的居中日期分隔 | **修前8.8；12px修复运行待复验** | 本批图仍对应11px源码，而R14更新规范仍为12px。用户通知独立修复后本审重读`:632`，已确认font-size:12px；P2状态改为“源码已修，待新构建实景关闭”。旧图和8.8不删除，也不称当前源码仍是11px。气泡内10px时间没有要求改大。 |

蓝紫图未发现新的可确认P1／P2。上述TIME-01修前偏差单独保留，不把它平均进另两项，也不因源码已经修了就提前改签12px实景。

### 几何、颜色及失败触区证据界线

三条采用记录均为light、externalMeta=0、incomingStatus=0、horizontalOverflow=false；背景图均none、blur(16px) saturate(1.25)。气泡中心相对视口的归一化position与读回一致；实际sRGB颜色与最终端点插值相符，简单直插计算最大通道偏差小于.07／255（端点alpha量化与颜色计算精度不同），未发现误套旧navy或暗色变量。

中文长文75.333px、越文长文96.333px；越文末条rect为x44.563／y490.458／宽263.438／高96.333，footer右边297.333小于气泡右边308，底部581.125小于586.792。三条记录的可见footer均在气泡rect内，结合实际图片未见遮挡；不将多行正文的整体包围盒相交误判成真实文字相交。

按记录中的实际RGBA与#F4F1E9底合成，三组可见outgoing的白字最低约5.27:1、元信息最低约4.72:1。这是computed值的平底合成估算；观感判断来自PNG，不把数字替代原生渲染、系统放大字体或任意图片背景下的可读性。初版关于蓝紫末段极小亮度回升的数学备注保留，本批图未见足以构成缺陷的视觉反序，不增列P2。

失败44×44完全包含在约52.3px气泡内，是父线程报告的实际量测，源码也明确给action宽高44px。**本批final记录没有failed态rect或点击坐标**；`final-failure-icon-retry-success`保存的是恢复sent之后的33.333px气泡和17×18非操作状态图标。因此本审确认的是失败样图外观，以及恢复记录确为sent；不能把恢复后的17×18误判为失败按钮不足44，也不能倒推出失败前44px的独立DOM闭环。后续若补该状态读回即可缩小这个界线，不需为此重跑整套或等待通用manifest。

### 明确未覆盖，不作为范围外扣分

本轮分数不覆盖：最终暗色截图、最终滚动前后视觉连续性、图片／CTA、英文320、unknown／sending及键盘重试、H5新气泡实景、12px新构建与历史前插锚点。它们可继续以增量图和局部geometry审查，旧草稿不代签。原SEND-01及其他历史签项按原证据与范围继续保留，本轮未重测。

真实服务、真实后台消息、native新安装／真机触摸、扬声器或耳机实际音效听感均是本轮范围之外；**不要求冒签，也不据其缺席扣减本轮已观察本地视觉分数**。本次只修改本报告，未改生产代码、未执行测试／构建、未操作浏览器或Git。

## R15新增三条待证：实际气泡色面、online绿色与滑入恢复

用户最新截图指出长气泡内部疑似出现两块颜色，父线程正在核对实际像素。此处**重开单气泡材质结论**：前节9.1和“色面统一”保留为当时有限观察的历史，当前不能据此签R15，也不能仅凭单一computed background-color／background-image:none关闭用户指出的问题。本轮没有取得并独立量测该新用户截图，不将疑似现象提前写成已证实P1／P2或指定某个渲染根因。

新增三条分别挂到现有STATUS-01、CHAT-TOP-01、MSG-02，均为**待R15运行证据，未评分**；不改写原历史评分，不凭新需求虚构已经验过：

| 待证项 | R15最小验收证据 | 通过边界 |
|---|---|---|
| 单个长气泡实际色面（STATUS-01重开） | 最终构建的双主题长文本／多行footer稳定PNG；标明同一气泡rect与采样坐标，避开字形、时间图标、圆角和边框，比较上／中／下及疑似分界两侧的内部像素。同步查看实际填色层、子层和伪元素background、opacity、filter／backdrop合成，而非只读父元素一个属性。 | 平坦背景下不得出现意外的两块填色或单条内部渐变；非平坦背景允许合理透射／模糊差异，不能要求所有最终像素绝对同色。仍须按当前屏幕位置为每条气泡取单一填色，滚动后保持底深顶浅；不以换色掩盖渲染分块。 |
| online圆点与文字绿色（CHAT-TOP-01增量） | 浅／暗主题的稳定online截图，分别记录圆点实际填色与文字color；至少含320，确认绿色文字可读、原身份居中与44px轨道不受影响。 | 两者均为绿色且保留可读状态文字；其他offline／reconnecting状态按各自语义，不能因一个全局选择器也被误染为online绿色。旧R11居中布局分保留，但不代签此新颜色。 |
| 左右消息滑入恢复（MSG-02重开） | R15实际live incoming及outgoing各一次事件与位移帧，核对原0.18s linear约定；再给reduced静态、历史前插及返回不重播的局部运行记录。 | 不仅存在动画类名或animationstart，还要看到正确方向和最终落位，无正文／时间错层或跳位；历史与重访不冒充新消息。颜色采样应在动画后稳定，不能以过渡帧代替气泡材质验收。 |

日期分隔独立修复按用户提供的短引用`5c2f2a85`登记；本审本轮再次读取`conversation-thread.vue:632`为12px。状态仍是“源码已修，待新构建实景关闭”，修前11px三图及8.8不被重标。可随R15局部补证一起复验，不要求重新提交通用manifest或重跑已无关的整套历史项目。

R14的普通文字排版9.2仅继续覆盖已目检图中的换行、footer位置与无横溢；新背景下的可读性及实际像素一致性重新看R15，不能用原静态对比估算兜底。失败触区、图片／CTA、最终暗色／滚动等已有未覆盖条目继续保留。本次没有新增真机或实际音效听感门槛，没有改生产代码、执行Git／测试／构建或使用浏览器；唯一修改为本报告。

### R15冻结源码登记与修前动画记录核对（未运行签核）

主线程通知APP冻结引用为`03c7e8e7d95e571a24e9c433ad4751bcc41d30bc`，正在构建；114项相关测试通过采用其通知，本审未执行Git、测试或构建。本节只核对当前相关源码与`r15-entrance-before.json`，没有把R14 PNG改称R15，也没有新增R15分数。

只读源码确认：

- `conversation-thread.vue:632`的居中日期分隔为12px。`5c2f2a85`为此前独立字号修复引用，R15已包含对应样式；最终computed字号／实际分隔与历史锚点仍待新构建证据。
- `conversation-thread.vue:666–699`让气泡容器透明并建立isolation，由绝对定位、inset:0、z-index:-1且pointer-events:none的`::before`承担唯一填色与blur16px。文字／footer的局部样式没有新增填色，位置取色变量仍在气泡上计算。**R15取证应读取`getComputedStyle(bubble, '::before')`的背景、alpha、blur及覆盖范围**；父气泡透明属于设计结果，不是缺失背景，也不能用父元素none代替实际像素检查。伪元素方式是否消除可见分块，仍须稳定图与采样，源码结构本身不算关闭。
- `pages/support/chat.vue`为人类online文字增加专用class，圆点和online文字消费同一个`--nx-presence-green`，暗色#37C96A、浅色#177D3B；unknown／reconnecting／offline继续走中性圆点守卫。这里只确认所读条件和token，实际主题命中、状态切换及对比观感仍待R15图。
- 消息行`:key`已由消息id改为`messageKey(m)`；`conversation-entrance.ts`在同一可见、ready身份中，对满足唯一尾部替换条件的local→canonical映射保留render key、原入场记录和剩余到期时间。此改动的目标是让确认到达后继续既有动画，不据正文相等推断送达，也不把确认延迟到动画结束。实际DOM是否复用、是否连续播放，仍以新帧证据确认。

修前文件共136帧；659ms第一次出现pending消息行，带`nx-conv-enter-right`、opacity:0、matrix(.98,0,0,.98,12,0)；671ms记录已换为正式消息ID、animation:none、opacity:1、transform:none，间隔12ms。它直接证明修前采样中“身份／动画状态快速切换”，结合旧`:key="m.id"`和主线程定位支持动画被快速确认替换截断的判断。该JSON没有后端ACK时间戳或DOM对象引用，因此不独自证明真实网络往返恰为12ms，也不作为R15修后成功证据。

后续R15动画采样须串起pending→canonical同一DOM、同一入场动画的位移／opacity全过程；保留最终落位、reduced静态及历史／返回不重播范围。当前三条新增要求与日期字号均维持待运行复验，不因114项测试绿自动升分。其余旧版本限定结论保留，本次唯一写入本报告。

## R16源码与暗390草稿复审（未冻结最终评分）

本节采用用户最新R16指令：Telegram式多行输入框、中央身份玻璃pill、左右44px返回／客服头像、online绿色、单气泡literal RGBA与paint containment，以及相邻有效消息满24小时的分隔。R15冻结引用不移用为R16；本轮源码仍在补修，新build／浅色最终图未交付。本审只读源码／本地依赖／runtime-r16.json，实际view_image original查看 [暗390初始草稿](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r16-draft-dark-390.png) 与 [暗390多行草稿](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r16-dark-390-multiline.png)，并在内存中读取像素；未编辑图像、源码或其他文件。

### 新旧要求与源码核对

- 时间规则：本轮第一次读取时仍是旧5分钟／跨日条件，收尾复读时父线程已将源码、测试与PRD更新。当前`conversation-time.ts`的阈值是DAY=86400000ms，首次有效消息定位，此后只比较相邻有效时间戳；跨午夜短间隔不分隔、持续多日但相邻均不足24h不累计分隔。无效时间跳过、负间隔不满足门槛，气泡HH:mm保留。**不把施工中的初读状态当作最终P2，也不再按旧5分钟规则要求实现。** 12px在R16 draft computed中已出现，但所录首条分隔在屏幕外，可见日期及新边界运行仍待最终样本。
- 输入：textarea使用`confirm-type="return"`，没有沿用Enter发送；height按linechange夹在24至144px，清空draft恢复24；超限保留输入、禁用发送并给提示。本地UniApp H5依赖明确在autoHeight=false时仍触发linechange，并将textarea overflowY设为auto，不能据auto-height=false误判无法增长。CSS另有`max-height:min(144px,34dvh)`，较矮视口会在不足六行时先内滚，后续以实测clientHeight为准，不宣称任意视口都固定显示六行。
- 头部：中间pill改为独立玻璃区域，右侧人类客服头像为装饰、aria-hidden且pointer-events:none，不存在伪造右侧动作。旧R11头部9.2不直接签新布局。新pill、输入框的主题映色不属于“每条消息气泡内部禁止渐变”的限制；消息自身仍需单一填色。
- 气泡：`bubbleFill`把屏幕中心位置插值成单个整数RGB＋固定alpha，深浅两份literal值绑定到同一消息，伪元素绘制并增加`contain:paint`。这改变合成方式，**不是实景无竖条的证明**；其新增裁切边界也必须检查子控件和焦点。

### 草稿中已观察到的局部事实

`dark-390-initial`与`dark-390-eight-lines`读回textarea由24px长到144px；8行原文length=47、scrollHeight=192、overflow=auto，发送框仍44×44。后者scrollTop=0，截图显示前六行：已证明有内部溢出空间，**尚未证明真实滚到第八行及编辑末行光标可见**。输入玻璃外框从55.333px长到175.333px，宽314px；这些是外框尺寸，不能误写为textarea高度。

`overlength-2001`为length=2001、disabled=true，提示“2001 / 2000请缩短到 2000 个字符以内”；原文保留策略的源码与该长度读回一致。所录textarea仍144px、scrollHeight3024。全量字符和本地键盘／IME操作没有在本审逐字符回放。

暗390两侧返回／头像均44×44，中间pill rect为x143.270844、宽103.458336，中心约195，处于390视口中心；高度50.885px。online文字与圆点均rgb(55,201,106)。此样本中文字／图标没有重叠或偏心，不外推浅色320、长名称、越文长状态或真实状态切换。

### 两张“PNG”实际为JPEG：像素观察不能关闭无损竖条问题

独立检查文件头均为`FF-D8-FF-E0-00-10-4A-46`，System.Drawing确认IsJpeg=true、IsPng=false，尺寸均390×844。扩展名不改变编码；本审未转换、覆盖或重命名这些文件。肉眼未见长气泡内明显的两大色块，但有损压缩会带来行间／字边色差，不能据这两张图判定用户真实PNG中的竖条已经消失，也不能反向把JPEG小幅差异当成实现缺陷。

在两条长气泡的行间空白选取左／中／右24×2px小块（x=76、200、332）读取RGB中位数；初始中文长气泡y=314得到(57,92,26)、(59,91,24)、(57,92,28)，越文长气泡y=479得到(39,85,37.5)、(42.5,85.5,39)、(40,85,39)。另复核中文y=335、越文y=500及多行输入后的同位置小块，未出现明显的大幅双区跳色；观察到的是数个8位色阶的差异。**这些抽样仅描述所提供JPEG像素，不是无损整幅均匀性检验。** 最终应使用真正无损PNG，在同一气泡的字形／圆角之外取样并查看疑似竖条两侧，结合实际填色层／背景，而不是只看computed。

### 问题、补修与待验状态

| 项目 | 证据／影响 | 当前处理与最小复验 |
|---|---|---|
| P2草稿：输入框展开后会话尾部被挤出 | 初始图最新“123213 00:48”在底部可见，输入框从55.333升至175.333px后，最新00:36／00:42／00:48退出可见区，多行图底部只剩较早00:29；同时可见旧分隔／留白形成的黑横带。 | 父线程随后补修，收尾源码已看到原near-tail≤24px才`scrollToEnd(false)`的高度／计数watch；读历史不跟随。composer去边框与背景、input-row去顶padding、列表底padding0而anchor8保留；两情况行为测试绿采用主线程通知。本审状态为**源码已修、待新build focus＋gap／尾部坐标复验**，不继续列作当前未修代码。 |
| 用户已指出的输入绿色focus框 | 多行草稿中有明显绿色矩形边框，不能被“输入玻璃样式已写”掩盖。 | 当前源码已局部取消compose-field内textarea／输入宿主outline；尚未目检新构建去框图。保留原草稿为修前证据，不反标为已去框。 |
| P2源级裁切风险：失败重试按钮外置焦点框 | [conversation-thread.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:700)新增contain:paint；失败footer仍44px并有margin-bottom:-4px，action有margin-right:-6px。而[message-family.css:7](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/styles/message-family.css:7)的role=button focus-visible使用2px outline＋3px offset，向外伸5px，超过此按钮在紧凑气泡底／右侧的剩余空间。 | 这是源码可定位的风险，本轮未有失败按钮focus实景，不声称已经拍到裁边。建议**仅对该按钮把焦点框内收或改为内侧可见描边**，保留44px操作区与全局焦点样式，不为修复输入框而取消其他按钮焦点。需最窄failed／unknown气泡的Tab焦点与Enter／Space局部图／读回。 |

本轮没有新发现可证实的P1。输入框变高、超限提示增高／消失、发送清空收缩及原本读历史四类情况下，最终都应记录末条／锚点与composer的相对位置；不能只凭单次scrollTop变化认定没有遮挡。

### 滑入：采用正确节点的运行证据

只采用`fast-ack-bubble-entrance`，明确排除误采外row的`fast-ack-entrance`。有效记录110帧sameNode全部true：161ms为pending，171ms已为canonical但同一DOM、同一动画仍在；194／232／280／315ms的X位移约10.226／7.553／4.893／2.226，opacity同步增长；353ms为X=0、opacity=1，366ms清除动画。活动帧duration均0.18s、timing均linear。这关闭了**这条本地暗390快确认样本**中“换节点立即无动画”的观察缺口，不能把帧采样时刻差当成精确CSS时长。

新增`incoming-entrance`120帧从25ms的matrix(.98,0,0,.98,-12,0)、opacity0，到223ms的matrix(1,0,0,1,0,0)、opacity1；活动帧同为0.18s linear，结束后animation:none。当前双向轨迹已有实际读回；本轮不把它直接改成R16完整最终评分，reduced／历史前插／返回不重播及最终构建仍分别按对应证据确认。运行文件继续增长，本节仅使用列明记录，不把未检查的新条目算作通过。

### 最终有限范围待验矩阵

| 范围 | 最小补证 |
|---|---|
| 输入框与底部间距 | 最终浅320／390及暗390代表图；1→6→8行、内部滚至末行、2001超限提示／恢复、发送清空；原贴底和读历史分别看尾部／锚点，确认无绿色focus框、黑横带或发送44px挤压。只按实际本地输入／视口操作表述，不写成原生键盘已验。 |
| 新header | 双主题稳定pill／左右44，长名称与状态在320换行；online点和文字绿色，非online不误染。不借旧R11完整矩阵签新布局。 |
| 气泡材质及子控件 | 真正无损PNG的长中／英／越文本、footer及疑似分界像素；滚动后同ID重新取色；失败／unknown焦点和图文CTA无contain裁切。 |
| 12px与24h时间规则 | 可见三语日期；相邻24h−1ms／恰好24h／24h＋1ms，跨午夜短间隔不分隔，跨多日但逐段不足24h不累计；历史前插页缝与原锚点。已有源码／测试作为逻辑证据，不冒称本审重跑或全部运行覆盖。 |
| 动画补充 | 保留本轮左右有效轨迹；最终reduced静态、历史与返回不重播按局部读回补齐，排除错误外row记录。 |

当前不新增最终分数。旧R14／R15材料各留原标签，R16草稿不冒充去focus与尾部补修后的新构建。真实服务、原生新安装／物理键盘、设备触摸与实际音效听感仍是范围之外，不设置假签门槛。唯一写入为本报告。

## R17 final有限视觉复审与R18邻近映色预审

本节以2026-10-27最新用户指令为准：顶部和底部整层透明，单个控件保留Liquid Glass，右侧人类客服头像移除；R18再把固定主题光带改为随邻近气泡变化。R17初步图中标题受背后文字干扰的判定保留，不据新图倒改旧图。H5同步已由用户暂停，先完成APP；本节不签H5发布，不要求为本次APP结论先补H5矩阵。

### 实际使用的证据与编码边界

本次已用`view_image`的original模式实际目检以下六张APP图：

- [暗390 final](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r17-final-dark-390.png)、[暗390滚动](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r17-final-dark-390-scrolled.png)。
- [浅320 final](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r17-final-light-320.png)、[浅320多行](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r17-final-light-320-multiline.png)。
- [浅320越文界面](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r17-final-light-320-vi.png)、[浅390越文界面](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r17-final-light-390-vi.png)。

运行材料仍存于[runtime-r16.json](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/runtime-r16.json)，**按记录标签区分版本，不按文件名推断版本**。本次读取到20条；采用`r17-final-*`、`r17-history-grow-before/after`。`r17-dark-390-overlay`与`r17-dark-390-multiline-overlay`为局部磨砂补修前材料，不用于标题可读性通过。R17清单元数据的APP sourceRef为`226249e2fc64e89c32ee54b520a304e0127ee383`；H5为`cd94809a1d2a4b6541915f86f36659009c5c645e`，仅记录该初步产物身份。本节没有重做旧清单的全量哈希审计；R18新增源代码不冒充上述截图中已运行。

用户明确捕获使用CUA JPEG，因此本节按**可观察的视觉质量**评估。六张图未出现可见的大块竖向分色，足以支持本批普通气泡的有限视觉分数；不因扩展名为PNG而声称它们无损，也不把JPEG数个色阶差异判为生产分色。R16节“最终应使用真正无损PNG”的原文保留为历史建议，**不再作为所有 scoped UI 审批的前置门槛**。本节不声称同用户原设备PNG逐像素一致、所有合成器均无缝或真机已复现闭环。

### 独立分数：逐项限定，不平均

| 本次范围 | 分数／结论 | 实际支持与限制 |
|---|---|---|
| CHAT-TOP-01：普通态居中身份、返回和移除右头像 | **9.2，限定接受** | 暗390、浅320／390均可读；局部16px磨砂后，背后消息不再与标题笔画混在一起。pill宽103.458px，中心约195／160；返回44px，avatar=0，右侧44px为无绘制占位而非伪动作。未把长名称／错误提示增高或关闭的Nova分支算作通过。 |
| online点／文字绿色 | **9.2，限定接受** | 所见中文／越文界面深浅主题均有可辨绿色点与文字；暗390记录两者均rgb(55,201,106)。源码只对人类online角色加该色，不据此声称offline／reconnecting切换已经运行。 |
| 顶部／底部透明浮层与局部玻璃 | **9.2，限定接受** | 两整层记录position:absolute、background rgba(0,0,0,0)、backdrop:none；暗色滚动图直接显示历史气泡继续到输入框背后，输入框随背后内容泛绿，左右空白未被整条黑板封住。标题16px／输入24px局部磨砂与内缘保留，外观不是只有DOM组件名称。R17固定彩色顶缘不包含在这一签项中，已由R18新要求重开。 |
| MSG-01／STATUS-01：普通长短文字、内置元信息、单条色面 | **9.2，限定接受** | 六图的中越长句、短消息及HH:mm／sent-read图标没有交叠、横溢或显著竖向双区；暗色上lime下forest、浅色上紫下蓝可辨。滚动记录externalMeta=0、incomingStatus=0、overflow=false。失败焦点、附件／CTA及业务状态全过程不借此代签。 |
| TIME-01：可见日期12px排版 | **9.1，限定接受** | 暗390滚动图的“昨天22:07”可见，记录12px、y84.885px、height38px；居中辅助色无底座。该分关闭所见样本的字号问题，不覆盖新24h分隔语义及三语长日期边界。 |
| 输入框普通态／多行／超限／收回的外观和本次留位 | **9.2，限定接受** | 浅320 textarea为24→144→24px，144px时外框175.333px；focus=true图中无绿色矩形框。2001保留、发送disabled=true并给提示，计数区使composer由205.333增至225.333px，content底留位同步。增长／超限／收回末条间隔均7.7812px；暗390为8.1146px。本分不证明已真实滚到第八行或原生键盘联动。 |
| 动态高度／输入区重建后的留位可靠性 | **8.8，不接受完整签核** | 下面两条源级P2仍存在。普通增长和历史阅读样本不能覆盖节点重建、权限行随后出现或顶部提示增减；需局部修复及对应本地复验，不用上面的9.2平均抵消。 |
| R18邻近气泡顶缘映色 | **未评分** | 已读helper、绑定、采样和CSS；未在本次截点看到R18运行图／距离读回，不能把R17固定色带的外观当作R18通过，也不因主线程测试绿强给9分。 |

越文320的`r17-final-light-320-vi`四个玻璃记录策略为`frosted`，不是`svg`；该图的磨砂可读性可接受，但只按实际fallback评分。暗390、浅320多行／收回及越文390记录为`svg`。本审未由此认定fallback是缺陷，也未把320越文写成SVG光学已测。

### 留位与位置采样的实际读回

- `r17-final-dark-390-scroll-before/after`共有31个相同ID；共同可见节点向下移动约670.6667px，表示滚回较早历史。以`nx-conv-message-31-35`为例，y从−18.1146变为652.5521px，位置从0.0%变为87.0%，填色从rgba(95,123,12,.84)变为rgba(31,93,59,.84)。这支持**同一气泡随屏幕位置重新取纯色**，不是只比两个不同气泡的computed。截图同时支持整屏上浅下深，没有在单条内部画渐变。
- `r17-history-grow-before/after`共有31个相同ID；19个共同可见节点Y差范围是0..0px。两条记录的矩形支持本次读历史时输入增高没有拉回尾部。它们自身没有textarea／composer高度字段，六行操作过程采用主线程说明，不能把该记录扩为任意高度变化均已验证。
- 浅320多行／超限／收回的composer实测205.333／225.333／85.333px，对应content底留位同值；末条到field上缘均7.7812px。视图高度约693.333px，不能写成320×568设备测试。暗390为390×844。

### 未闭环的具体问题与最小修法

| 级别／文件位置 | 源码事实与用户影响 | 最小修复及本地验收 |
|---|---|---|
| **P2：输入区重建后未重绑ResizeObserver**；[conversation-thread.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:555) | observer只在onMounted绑定当时composerHost。`failedSendLabel && canDiscardSend`分支会移除该节点；恢复后只是measureComposer一次，observer仍对应旧节点。此后attachRetry行出现或文案换行增高，不在inputHeight／90%计数阈值／composerVisible三项watch内，absolute输入区的高度可以超过旧底留位。首次挂载时没有composer也有同类缺口。**这是可定位的源码风险，未声称本轮已实拍复现遮挡。** | 对实际composerHost节点做post-flush监听，先断旧observer，再观察新节点并量测；没有DOM observer的路径补相同布局内容变化触发。局部验收：失败→恢复→再出现／消失权限retry，先贴尾再读历史，比较末条间隔与同ID锚点，勿只读scrollTop。 |
| **P2：topInset变化只改padding与颜色采样，缺少显式滚动保持**；[conversation-thread.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:18)、[采样watch](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:622) | [chat.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:1694)会量得顶部错误／历史提示和长状态的新高度，但thread对topInset变化只重取色。没有在消息ID不变时保持尾部或历史锚点的处理；透明绝对头部不会通过缩短列表自动补偿。不能用固定头高的历史输入增长记录证明该路径，浏览器默认scroll anchoring也未在该路径给出证据。 | 变更前记录是否贴尾和可见锚点；新高度落定后，原贴尾者无动画贴尾，历史阅读者按同ID相对位置补偿，和已有prepend事务协调避免双重位移。只需本地模拟顶部提示出现／消失，分别验证尾部与历史，不必依赖真服务。 |
| **此前失败图标焦点裁边：源码已补修，运行待局部复核**；[局部focus规则](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:1050) | 收尾读到`.message-family .nx-conv-receipt[role="button"]:focus-visible { outline-offset:-3px; border-radius:8px }`，把原外伸框移入44px操作区；保留contain:paint与全局焦点样式。 | 不继续列为未修生产问题，也不根据源码直接声称看过新焦点图。用最窄failed／unknown气泡Tab聚焦、Enter或Space的一组局部图／命中读回即可补齐。 |

未观察到可证实的P1。输入行透明空隙是否允许拖动下方消息可作为顺手检查：composer本体pointer-events:none，但input-row仍auto；本审没有把未执行的空隙拖动猜成新增P2。

### R18预审与剩余最小本地矩阵

[composerReflection](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-bubble-layout.ts:17)读取输入框及非system气泡矩形，要求横向相交，选择上方／穿过顶缘的最近气泡。gap≥72px返回strength0；0..72px用smoothstep平滑衰减。发送气泡用与当前位置填色相同的RGB插值再适度提亮，来信采用中性色；反射中心和宽度来自实际重叠区。输入框before／after的opacity受strength控制，已经没有“无论距离永远显示”的固定主题光带。该渐变属于**输入玻璃反射**，不违反单条消息内部纯色要求。

源码采样沿用滚动、输入高度与content尺寸触发；新增helper测试内容已读，44项通过为主线程提供，本审未运行测试。源级暂未发现可以独立确认的新P1／P2，但以下局部运行不能省成“函数存在即通过”：

| 补证范围 | 最小矩阵与观察点 |
|---|---|
| R18距离、颜色、左右位置 | APP暗390／浅320各一组：最近气泡约8px、36px、≥72px或空会话；读gap／strength并看近亮、渐弱、远处无彩带。至少包含一条左侧来信与一条右侧发送，反射横向位置／颜色随之变化，不把来信映成固定荧光绿或紫色。 |
| R18滚动与多行 | 同ID滚动经过输入顶缘，再把输入24→144→24px；检查反射跟随实际新距离，原气泡色序仍随viewport更新；远处或无气泡后不残留上一个颜色。跨越72px边界及最近气泡切换时观察有无明显闪跳。无需以每个像素精确相等为门槛。 |
| 两条留位P2 | 失败恢复后再增加／移除retry行；顶部错误／历史提示增减。每类各取原贴尾与读历史状态，读末条／锚点及field/header矩形。此项是8.8未通过的实际补修范围。 |
| 输入与小屏余项 | 已覆盖320多行／超限／收回和390普通态；尚未见真实内部滚至第八行末尾的光标读回。长名称或非online长状态至少在320验证一次，不需要重做所有旧R11矩阵。 |
| TIME-01新语义 | 相邻24h−1ms、恰好24h、24h＋1ms，以及跨午夜但不足24h；一次历史前插页缝／锚点即可覆盖本次规则变化重点。三语长日期和fresh时钟按各自证据标版本，不能沿用旧5分钟运行结果。 |
| 焦点与动画边界 | 失败图标局部内收焦点图；R16有效双向180ms linear及sameNode轨迹保留原版身份，旧错误外row记录继续排除。R18若没有改动画可沿已有证据说明，不必为了本次反射重复整套测试，但不能冒称新native／设备触摸已测。 |

R17普通视觉已给出独立有限分，动态留位8.8和R18未评分分别保留，不把缺口平均掉。真实后端、原生新安装／键盘／手指触摸、真实音效听感、完整运营Banner均不在本节评分范围，也不要求假签。H5暂停期间不追加H5必做门槛。本轮只更新此报告，未写生产代码、未开浏览器、未执行Git或测试。

## 重启暂停检查点（2026-10-27，用户明确要求停止）

本节是暂停时最新状态，覆盖上一节“仍未补修／R18运行未到”的施工中描述；原发现、评分和取证顺序保留。用户要求之后不再继续源码检查、浏览器操作或测试，本次仅保存本报告。

| 项目 | 暂停时结论 | 恢复后最小剩余项 |
|---|---|---|
| R17已观察视觉 | CHAT-TOP-01 **9.2**；online绿色 **9.2**；透明浮层 **9.2**；普通文字／单条色面 **9.2**；输入已测外观／增长收回 **9.2**；可见12px日期外观 **9.1**。均仅限前节列出的APP图和记录，不平均为全站总分。 | 保留这些限定签项，不重做旧完整矩阵，也不把原证据改标R18。 |
| P2输入区重建后监听丢失 | **最后读源码已见修复，运行未闭环。** `observeComposer()`先断旧observer，再量测／绑定新节点；`watch(composerHost, …, {flush:'post'})`已加入。内容watch补入attachRetry、retryPolicy、inputLimitHint和timeLocale，fallback留位计入44px retry。修前8.8保留，不能因源码补丁自动升分。 | 修后构建：失败→恢复→权限retry出现／消失，贴尾与历史各一次；读末条间隔和同ID锚点。 |
| P2顶部高度变化后位置保持 | **最后读源码已见修复，运行未闭环。** 新topInset watch读取原滚动位置与贴尾状态，按高度delta补偿；已准备prepend的prefix同步加delta，避免同一高度变化被计算两次；带generation／owner／可见性检查。此处只是补丁读回，不代Noether交互签核。 | 顶部提示增加／移除，分别贴尾／读历史；另一次与前插交错的锚点读回。 |
| P2失败状态焦点裁边 | **局部源码已修，焦点实景未验。** `.nx-conv-receipt[role="button"]:focus-visible`使用outline-offset:-3px，保留44px操作区。 | 最窄failed／unknown气泡的Tab焦点与实际键盘触发局部图／读回。 |
| R18邻近映色 | **未签通过，已见一条失败近距记录。** 实际目检[浅390近距图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-light-390-rim-near.png)，并读取runtime-r16.json新增第21条`r18-rim-light-390-near`。气泡bottom750.5521、field.top758.6667，gap8.1146px，却strength=0、opacity=0、dark/light均transparent。因此曾在commentary中将淡蓝边视为新反射的描述已明确更正：该图不能证明新反射生效。 | 暂停前最后源码已把`{...DOMRect}`改为显式拷贝top／left／width／height，避免原型访问器属性丢失。修后实景仍未见：优先同一近距记录确认非零，再看暗390／浅320的中距、≥72px、左来信／右发送、滚动和多行增长。不要覆盖这条失败记录。 |
| 优惠券／试用卡局部排版 | **仅登记，未评分。** 用户指出浅色越文优惠券空白过大；主线程通知voucher-banner的金额／副文案与meta/footer排布、窄屏82px图，以及trial-hero-banner长文与插图尺寸调整。按照用户要求，只在新实景到齐后审这两张卡，本审没有把通知当已验证。 | APP浅色越文320及390并排卡片截图／矩形，观察多余留白、金额层次、完整文案、同栅格高度与底部入口；动效保留按主线程实际运行证据说明。暂不扩为商城全站／H5验收。 |

其余本地范围缺口仍为：textarea真实内滚到第八行末尾、长名称／非online长状态320、24小时新分隔边界与历史页缝。真实服务／设备相关范围继续排除，不要求为了本轮局部视觉签分作假确认。H5同步维持用户暂停状态。恢复后从以上修后局部证据继续，不删除历史报告，不重新执行完整旧审查；本审未启动任何后台等待或测试。

## 恢复后R18局部复审（2026-10-27）

用户恢复后，本审只读券／试用卡、IM几何补丁、对应测试代码和运行JSON，实际用`view_image` original查看下列七张新图。仅修改本报告，没有浏览器、Git、测试／构建或生产代码操作。测试源码存在不写成我执行通过；本节不重审全部旧矩阵，也不把APP浏览器预览称作原生安装实景。

### 本次独立视觉分数

| 范围 | 分数／结论 | 证据与实际覆盖 |
|---|---|---|
| R18券卡排版 | **9.2，限定接受** | [浅色越文390](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-benefits-light-390-vi.png)与[浅色越文320完整卡片](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-benefits-light-320-vi-visible.png)均已目检。金额／说明形成清晰的中部组合，顶部标题与数量、底部入口各有位置，未见原先不成比例的空白或文字截断。320运行记录：券卡138×225.333px、金额组112.667×71.333px、footer高52px，底部越文两行完整；390只作图像目检，不虚构其DOM量测。 |
| R18试用卡排版 | **9.2，限定接受** | 同两图中，标题、免费说明、无需付款文案完整；320最后一句自然换行，设备主体与“Nhận”入口未互相盖字。320两卡均138×225.333px，top224.333、bottom449.667，对齐有实际读回；入口视觉高32px，真实操作承载者仍为整个有role/button的卡片，不能误称内层装饰CTA本身44px。 |
| R18近距顶缘映色 | **9.1，限定接受** | [当前浅390近距](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-current-light-390-rim-near.png)确为聊天画面，蓝色近距映光可见；[当前暗320近距](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-current-dark-320-rim-near.png)为与下方气泡同色系的绿色映光。浅色gap8.1146px、strength/opacity0.965、light rgba(32,77,219,.66)，最近填色rgba(18,66,217,.9)；暗色gap7.7812px、strength/opacity0.967、dark rgba(78,127,104,.78)，最近填色rgba(28,91,61,.84)。源码显式拷贝DOMRect字段后的近距路径已有实际闭环，旧strength0失败记录保留。 |
| 暗320多行输入末端可见性 | **9.2，限定接受** | 只采用[第八行末尾有效图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-dark-320-eighth-line-end-verified.png)和`r18-dark-320-eighth-line-end-verified`。末尾第7／8条显式行的软换行内容完整可见；length207、selection[207,207]、scrollTop430、scrollHeight576、clientHeight144，已在底部约2px内。外框175.333px、textarea144px、发送触区44×44，末条到field约7.7812px；增长后映色仍为strength0.967。主线程说明实际用了ControlHome→ControlEnd，本审核对结果，不冒称亲自按键或原生IME已验。 |
| 浅色首页顶部阴影 | **9.2，限定接受** | [首页390修后图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-light-top-shadow-home-390.png)中搜索／消息按钮已无旧大块暗晕，边缘和玻璃层次仍清楚，角标未被吞没；对应记录两按钮44×44、strategy=svg。底部Liquid Glass在图中仍保留。 |
| 浅色消息页顶部阴影 | **9.2，限定接受** | [消息390修后图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-light-top-shadow-messages-390.png)中返回／设置均可辨，阴影短而轻，没有取消淡灰玻璃实体；记录两按钮44×44、strategy=svg、内缘仍在。这里只签两页390外观，不把旧home-320误标签记作320已测。 |

上述评分独立按观察范围接受，不因其他矩阵尚缺而撤销，也不平均为整个R18全部通过。券卡／试用卡的暗色、英文及各种资格异常未在本批实景重跑；映色远距／左右切换另列；阴影的其他sub-page-header消费者只核源码，未逐页实景。

### 源码复核：卡片与阴影

- [voucher-banner.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/voucher-banner.vue:58)：embedded meta用`calc(100% - 52px)`分配上部空间，金额与副文案装入同一组并用auto margin居中，footer单独至少52px；320装饰图82px。实际320等高和footer读回已支持这条普通布局路径。未改为省略越文来凑高度。
- [trial-hero-banner.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/trial-hero-banner.vue:125)：长文案采用flex顺排，meta在前、设备图在后，min-height200px，插图102px／窄屏92px。源码仍保留4.2s浮动及reduced-motion关闭；券图4.6s浮动也保留。**这是动画保留的源码判断，静态截图不证明本次实际动过。** 两卡通过同一grid行拉齐，320已测等高；没有发现需要阻断所示普通态的新增P1／P2。
- [tokens.css](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/styles/tokens.css:1048)：仅light下`.nx-header`、`.spv`和`.message-nav`的`.nx-design-glass`覆盖外影变量为`0 2px 6px rgba(23,31,45,.12)`；`.spv`属于sub-page-header，不是全页容器。tint的三层inset与rim/specular规则保留，未一刀切关闭全站卡片／底部玻璃。运行computed同时保留三层inset及新外影，和两张修后图一致。

### IM旧P2是否解决：源码状态与残余竞态

| 项目 | 独立结论 | 依据／最小剩余处理 |
|---|---|---|
| 输入区重建后observer仍绑旧节点 | **旧源码缺口已修；修后重建实景未验** | [observeComposer](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:574)先disconnect旧observer，再读当前host并绑定；post-flush监听composerHost，首次无节点后出现也能覆盖；attachRetry／文案／locale等变化补入量测watch。已阅读对应行为测试的旧节点→null→新节点→再次增高用例，未执行。普通多行和末行实景通过不能冒充“失败恢复后再出现retry行”已经点过。 |
| 单独topInset增减导致尾部／历史错位 | **单独路径源码已修；与前插交错仍有P2** | 新watch读取旧滚动位置、按delta补偿，原贴尾者无动画贴尾，preparedHistory.prefix随delta调整；现有测试覆盖先完成顶部变化、再开始前插，以及尚在前测时顶部变化使旧测量失效。它们没有覆盖下面“前插后测等待中再变顶高”的顺序。 |
| R18 DOMRect展开导致近距映色为0 | **所示双主题近距路径已闭环** | 已改为显式top/left/width/height拷贝，并有原型访问器样本测试代码；本次实际near读回0.965／0.967，不再只以helper纯对象测试推断DOM路径成功。 |
| 失败图标focus裁边 | **局部源码已修，焦点图仍未验** | `outline-offset:-3px`仍在，只内收该44px状态按钮；本批没有Tab焦点截图，不作运行签核。 |

**残余P2：topInset可以取消已经开始的异步前插补偿。** [preserveHistoryPosition](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:495)在开始时清空preparedHistory、取得scrollGeneration ticket，再等待后测；[topInset watch](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:529)调用同一cancelScroll，旧后测返回时被ticket检查丢弃。此时preparedHistory已null，因此prefix += delta也无法补救。随后只应用顶部delta，新增历史的高度没有补入滚动位置。

这是静态时序推导，**未声称已经在截图／真机复现**：例如原top120、前插增加200px，后测等待时header再增106px，当前流程可能只到226而非保持原锚点所需的426，旧消息下移200px。现有`does not count a header adjustment twice...`用例在topInset后先`await flush()`，再前插，覆盖的是另一顺序。最小修法是合并同一owner的锚点事务，或在顶部变化取消旧补偿后重新测原ID／保留完整位移；不能简单删除generation／owner守卫。用本地延迟selector回调即可复核，不要求真服务或真机作为本轮视觉门槛。动态留位8.8保持未签，已通过的普通视觉分数不受此异步边界外推否定。

### 有效证据、勘误与未测范围

- `app-r18-current-light-390-rim-near.png`按本次读取确认为聊天图；父线程说明它在交付前覆盖过瞬时列表误图。本审只评价当前看到的图，不假称见过或验过被覆盖版本。早先`app-r18-light-390-rim-near.png`及strength0记录保留原失败身份。
- `r18-rim-light-390-empty`记录strength=0、opacity=0、dark/light=transparent，支持空会话不残留彩带；本审本轮没有对应空会话截图，因此这是DOM读回结论，不是另一次截图目检。它也不等于有气泡但距离≥72px时的完整衰减已验。中距、远距、左来信位置及最近源切换仍未测，不阻止本批近距9.1。
- 只采用`r18-dark-320-eighth-line-end-verified`的末端证据。最初`eighth-caret/end`两张不能冒充已滚到末行；此前“内滚末端未见”缺口在**这条暗320键盘操作样本**中关闭。减少动态／原生键盘不由它代签。
- `r18-light-top-shadow-home-320`经父线程说明且rect x278／330读回可知实际为390；采用后续明确viewport390的home-390与messages-390记录，不累计虚假的320覆盖。
- 剩余局部待验优先级：先解决topInset与前插后测交错；再按原范围补observer重建／retry行及失败焦点。长名称／非online长状态320、24h日期新边界继续按专项证据处理；无须为券卡／近距反射／两页顶部阴影强制重跑全部旧矩阵。

本次只签以上列明的APP本地视觉范围；Noether交互审查独立，不代其打分。H5仍按用户要求暂停，真实服务、新原生安装、设备触摸／键盘与听感保持未覆盖。未修改生产文件或执行测试。

## 用户PNG色割裂：STATUS-01重开与合成路径预审（2026-10-27）

**当前未通过，不沿用旧色面9.2关闭。** 用户提供的[原始截图](C:/Users/FL/AppData/Local/Temp/codex-clipboard-61a2dba9-02e5-40ca-a91b-c04be2d26572.png)已经original目检，System.Drawing只读确认504×301、实际编码PNG。长蓝气泡与输入玻璃都在图像x约351px出现竖向断面；这不是只有computed变化，也不是此前JPEG数个色阶差异的争议。此PNG未附构建fingerprint，本审不武断给它指定R17或R18源码身份；它足以否定“用户看到的割裂已完成关闭”，当前源码据此追查。

本审没有浏览器操作／运行A/B／修改生产源码；以下是已读取实现支持的根因候选和供父线程执行的隔离方案，不把候选写成已证实的浏览器缺陷。scroll／reflection竞态继续由父线程处理，不在此重复审查。

### 确定事实

图像空白区的相邻像素抽样如下，坐标均为**该裁图像素**，不是未经换算的CSS坐标：

| 位置 | x350 RGB | x351 RGB | 观察 |
|---|---|---|---|
| 长气泡底部内侧，y108 | (41,76,218) | (50,84,217) | 气泡颜色在同一竖线跳变，右边数个像素保持同值。 |
| 输入框内部，y265 | (202,217,255) | (177,198,255) | 输入框向另一方向突变，且不是输入右圆角或发送圆按钮边缘。 |
| 气泡上部空白，y10 | (42,77,218) | (49,83,217) | 同一x线还出现在气泡不同高度，不能只解释为某一行文字或footer。 |

气泡填色由`bubbleFill(position)`按**纵向**位置生成单个RGBA；普通文字气泡内没有LiquidGlass组件。输入框内确有LiquidGlass，且它盖在消息内容上。这使“共享合成／采样边界”成为优先排查方向；单条颜色采样函数、时间float或某一SVG贴图自身都不足以独自解释两处同x断面。尚未证明该线固定在屏幕坐标，移动／缩放复验才能区分屏幕边界和元素内部边界。

### 根因候选：按排查优先级排序

| 候选与可定位源码 | 证据／推断强度 | 最小修法方向，须先A/B验证 |
|---|---|---|
| **1. 多层backdrop与局部裁切组合造成不连续合成**；[气泡层](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:783)、[气泡before](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:803)、[输入层](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:977) | 当前气泡是`isolation:isolate + contain:paint`，内部`z-index:-1`的半透明填色伪元素再做blur16/saturate125。输入框父元素做blur24/saturate135，其LiquidGlass子元素又由renderer设置SVG backdrop；fallback子层也再做blur24。**组合确实存在，导致本截图的因果尚待隔离。** 两个无共同文字布局的区域同x割裂，比“某条消息内有两个CSS背景”更符合合成路径嫌疑。 | 气泡先验证把单一填色留在稳定的背景层，避免负z滤镜与整体paint containment共同承担绘制；若重构，玻璃底层与正文／footer分层，保持原float、尺寸、颜色和44px触区，裁切仅作用于视觉底层。输入框优先收敛为一个负责采样的材质根：将所需磨砂和SVG折射合入同一filter链，避免父blur后子SVG再次采样；保留独立tint/rim/specular和发送按钮，不全局取消LiquidGlass。 |
| **2. 预览iframe缩放与上述滤镜相互影响**；[prototype-preview.html](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/scripts/prototype-preview.html:4)、[fitPhone](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/scripts/prototype-preview.html:14) | 预览以`transform:scale(--phone-scale)`缩放iframe，scale由stage尺寸计算，可能是小数。截图跨独立元素同x割裂，使外层共同变换值得检查。**尚未知道用户这张裁图的实际scale/DPR或是否来自该预览壳，不能直接归责预览或GPU。** | 同一会话、同滚动位置先比较当前scale与1:1 iframe／同源裸页。如果仅缩放壳失败，再针对壳的渲染策略／尺寸取整做局部修复；不能用“裸页正常”掩盖用户仍使用的预览场景，也不先改全站主题色。 |
| **3. SVG滤镜区域、采样尺寸与光学图尺寸不一致**；[renderer](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/liquid-glass-renderer.ts:42)、[SVG构造](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/liquid-glass-renderer.ts:67)、[geometry](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/liquid-glass-core.ts:20) | renderer使用offsetWidth/Height、`filter x0 y0 width100% height100%`，feImage为数值宽高；光学生成又把height限到160，再把图片铺到原宿主。DPR参与生成但不在geometryKey中。它们是**可检查的尺寸／裁切风险，不是本次同x色界已证实原因**；特别是160高限制不能直接解释这张单行输入截图，也不能独自解释不含SVG的普通气泡。 | 若隔离确认SVG分支相关，再让filter/primitive单位、逻辑光学尺寸和目标宿主一致，给blur/displacement所需的采样范围并用单独圆角层裁切；检查effective DPR变化是否触发重建。不要在未验证前凭“GPU问题”盲加translateZ或扩大所有滤镜区域。 |

已读[liquid-glass-view.ts的adapter](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/liquid-glass-view.ts:304)：按hostId定位节点，以实例WeakMap维护controller，正常update不把不同宿主合成同一块图。`mountSegments`的弹簧／横向lens变换不是普通输入框所用controller，当前没有证据指向它。renderer的`filterId`由模块serial递增；本次未读到重复ID实景，因此不把ID冲突列为已发现缺陷。优先查实际分层，而不是重写整套LiquidGlass生命周期。

### 父线程最小实景隔离清单

1. **保留一张能复现的基线。** 同时保留消息ID、滚动位置、bubble／field矩形、strategy、相关祖先transform／filter、iframe scale与DPR。以图像可见断面为基准；`background-image:none`、strength或某个测试绿不能代替本次像素证据。
2. **一次只改变一个采样层，随后恢复。** 先临时关气泡`::before`两种前缀的backdrop-filter，RGBA／圆角／尺寸不变，观察气泡线与输入线是否同时消失。然后分别测试：只去输入父层blur、保留子SVG；只把输入子SVG backdrop替换为简单磨砂、保留父层。这只是父线程诊断A/B，不能把去玻璃版本当最终交付。renderer写了inline URL，单改`data-glass-strategy`不足以确认滤镜真的关闭，须读回实际computed与inline。
3. **区分共同边界和局部边界。** 同一场景用当前缩放与1:1呈现；轻微改变预览宽度／位置，再滚动使另一条长气泡经过原色界。若线固定在显示坐标而不随元素移动，增强共同合成边界嫌疑；若固定于某节点局部位置，再查该节点的滤镜区域／子层。避免同时重载主题、换数据、改CSS导致失去可比性。
4. **只修验证命中的路径。** 输入采用单一采样材质根时保留真实折射、高光、内缘；气泡保持每条单色与当前纵向色序，正文／状态透明且排版不变。不能用提高不透明度、换蓝紫色或隐藏发送按钮把色差盖住，也不建议全局关闭卡片／底部LiquidGlass。
5. **修后用触发场景关闭。** 至少重现用户浅色长气泡在上、输入框覆盖另一条消息的同一组合；另验暗色代表场景及输入24→144px后滚动。保留静止、滚动中与停止后的帧，在字形／圆角之外横跨原色界检查。此处关注的是明显断层，不要求所有像素完全相等；真实玻璃允许连续的反射变化，不允许本图这种内部直线断面。旧正常静帧不能代替这些局部复验。

**签项边界：** STATUS-01色面和输入框材质完整性保持未通过，本轮不重新给≥9分。先前近距反射的距离／颜色响应及输入末行可见性仍是各自有效事实，但不证明没有割裂。券卡9.2、试用卡9.2、浅色首页／消息顶部阴影390各9.2保持独立，不因本次缺陷平均扣分或反过来拉高色面。未操作浏览器、未执行测试、未改生产文件；本次仅更新本附录与当前状态。

## 无损A/B、候选源码与修后overlap局部复评（2026-10-27）

本节追加新证据，不删除前节原PNG失败事实。父线程执行浏览器与构建，本审只读文件、view_image original目检、内存像素取样并更新本报告；未运行测试或修改源码。

### A/B/D能证明什么

本审实际查看[baseline](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-split-baseline-lossless.png)、[A仅气泡before blur off](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-split-A-lossless.png)、[B仅composer父blur off](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-split-B-lossless.png)、[C仅composer子SVG off](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-split-C-lossless.png)。独立确认四张均真实PNG、390×844；父线程说明CDP captureScreenshot(format png)、同位置1:1。四张在y601／665、x90..316各自的相邻RGB**单通道最大跳变均0**；这两个位置避开正文／footer及圆角，不能代替整幅逐像素检验。

**baseline本身没有复现原图的竖向断面，因此A/B/C不是“某项关掉后修复”的因果证据。** 原图仍然失败，新图只能说明本次场景未复现。B图另有明确视觉副作用：父blur关闭后，背后越文消息穿入输入框，干扰占位文字；不能直接交付“删父blur但保留原0.35 SVG模糊”的版本。C仍有父blur，所以可读性较好，也不证明子SVG就是原根因。

[D-single-sample-lossless](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-split-D-single-sample-lossless.png)同样已目检、确认为390×844 PNG，两条相同气泡采样行均0跳变。输入仍有磨砂、蓝色反光和清楚的发送轮廓，未出现B中背后文字直接穿入的问题。**D只是临时DOM实验，不是构建产物签核图。**

### 候选生产源码：局部合成简化可接受，不能当作根因已证

- [conversation-thread.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:802)：bubble改为root直接绘制原RGBA并backdrop blur16/saturate125，删除负z伪元素、contain:paint及原isolation；flow-root、内边距、圆角、border、HH:mm／float footer仍保留。普通文字表面不再走负层级过滤绘制，符合减少合成边界的局部方向。需继续看图片／CTA和状态焦点，但没有理由据本次修改要求重做全站卡片。
- 输入父field不再backdrop blur；仅其[LiquidGlass调用](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:139)显式传`blur=24`，其他调用本次检索未见新增blur。真实tint/rim/specular及近距反射伪层仍在，不能把反射伪层的filter blur误认为再次采样页面backdrop。
- [liquid-glass.vue](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/liquid-glass.vue:18)可选参数经computed传给renderjs，有限值夹在0..32，fallback通过实例CSS变量设置。未传参数仍维持fallback .75px；[renderer](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/liquid-glass-renderer.ts:45)SVG默认.35、saturation1.05，WebGL默认blur0，未把24px改成全局默认。blur与saturation已进入geometryKey，同尺寸参数变化可触发重建；既有异步generation／release防过期资产流程保留。
- 显式blur当前同时使SVG/WebGL saturation变为1.35；composer frosted局部CSS仍是blur24/saturate135，和本实例意图对应。**“blur参数”实际上也选择了饱和度，这个契约应明确**；当前只有composer显式调用，不据此列新增阻断或要求改底部调用。以后泛化使用时，避免把显式0误理解为只改模糊、不改饱和度。
- 保留两项局部风险：一是SVG filter仍为x0/y0/100%范围，GaussianBlur从.35升至24后要看边缘／圆角是否被截出暗线；二是光学geometry仍将height限160，而六行输入材质高度约174px，需多行样图确认rim/specular没有拉伸异常。它们是待观察点，不是已确认本次断层原因。
- **参数传递一致不等于不同引擎像素强度一致。** 本地WebGL依赖调用uploadAndBlur时会使用传入blur/5，SVG则直接stdDeviation；不声称原生／WebGL与SVG已经实际等效。当前composer没有独立backdrop源，非SVG通常走frosted fallback，所以这一点不阻止当前SVG局部评价，也不扩大为必须现在重测所有平台。

未发现必须阻断这个候选方向的新确定P1／P2；这不改变STATUS待运行闭环的状态。建议只围绕上述局部变化补证，避免全局取消玻璃、提高气泡不透明度遮盖差异，或无依据添加translateZ。

### 真正修后构建：浅390 overlap限定9.1

实际目检[app-r18-resume-light390-overlap.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-resume-light390-overlap.png)，并读取[r18-resume-light390-overlap.json](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-resume-light390-overlap.json)。独立确认PNG390×844；frame scale为matrix(1,0,0,1,0,0)，真正滚动内层scrollTop175.333，另一个content容器0不误作未滚动。bundle记录为`index-ZH_dY96U.js`。父线程说明此时没有temporary style，parent backdrop none、child SVG blur24；这三项不在overlap JSON字段内，因此注明来源为主线程操作读回，不能写成本审从该JSON独立读得。

所见长中文气泡连续均匀，正文／时间状态完整；输入覆盖下方另一条蓝色消息，背后文字被散开，占位文案可读，圆角、折射轮廓和蓝色顶缘光仍存在，未见原用户图中贯穿bubble/composer的同x直线断面。**这个已展示的浅390长气泡＋输入覆盖场景给9.1，限定接受。**

对应bubble `nx-conv-message-31-39`为x52.2604、y622.5521、w325.7396、h75.3333，root fill rgba(29,66,215,.9)、filter blur16/saturate1.25。独立在y627／694、x77..315采样，两行相邻RGB差值和最大均0，支持这条长气泡的所取空白色面连续；不把它写成整个输入玻璃都应RGB不变，玻璃真实映光本来允许平滑颜色变化。

`single-surface.png`／对应JSON是初始scroll0场景；本节没有用它代替长消息覆盖组合。A/B/C/D均是实验材料，不能改标为此修后bundle的证据。由于旧baseline本次本就正常，修后正常图不能倒推出“负z／contain／双采样已被证明是原根因”。**STATUS整体仍未闭环，原PNG失败证据保留，旧9.2不恢复为全项通过。**

最小后续只需父线程正在补的暗320、多行及滚动／停止代表样本，继续观察原同x断面、输入可读性和玻璃边缘；源级参数默认值／fallback范围已核，不要求重复所有旧矩阵。券卡、试用卡、顶部阴影及末行编辑已签范围保持独立。

## 最新用户PNG再现与显式frosted候选审查（2026-10-27）

**结论：STATUS-01未通过，不恢复旧9.2，不把浅390单帧9.1升级为修复完成。** 本节覆盖此前“待暗320／滚动补图即可”的后续建议：新用户失败发生后，必须回到实际触发场景验证。父线程随后落盘的显式frosted方案是新的候选；本审仅核源码，没有新构建连续帧，也没有为其评分。

### 两张最新用户图：已实际目检，静态事实与动态反馈分开

本审用`view_image` original分别查看[最新输入局部图](C:/Users/FL/AppData/Local/Temp/codex-clipboard-2442cde8-489b-4e94-a344-fb3a334c96c7.png)和[最新整页图](C:/Users/FL/AppData/Local/Temp/codex-clipboard-28dc6549-639a-4839-b2e9-2263ea227182.png)。独立读得尺寸分别540×135、562×1159，格式均PNG。本次没有重新编码图片或生成替代图。

- 局部图的输入右端出现矩形亮带，亮带的直边不随输入圆角收束；这不是正常的细圆弧rim外观。x507在y42／60／97／109均为RGB(66,67,70)，同一行到x509均变为(9,9,10)，支持这个明显竖向边界确实存在于图片中。该边缘不用于直接定位某个CSS节点，仍需父线程实际坐标映射。
- 整页图在图片x约406处可见竖直色界，多条宽消息与底部输入同轴；例如长越文气泡和下方长中文气泡都没有保持内部连续色面。尾部清楚显示“R18 恢复检查：新会话首条消息。”及03:15状态，不能把该图当作R14旧内容。用户明确其来自当前新build；单张图本身没有完整产物哈希，本审不捏造精确构建对应关系。
- **“不停闪烁”按用户运行反馈保留，当前未关闭。** 两张静图能证明断面，不能证明其频率、持续时间或是哪个循环造成。本审未操作浏览器、未观看动态录制，不冒称亲见闪烁。

以下仅为只读取样，坐标属于562×1159用户PNG，不是CSS坐标；两像素宽的过渡也不能据此判定浏览器内部tile尺寸。

| 图片位置 | x405 RGB | x407 RGB | 独立观察 |
|---|---|---|---|
| 越文气泡空白附近，y312 | 68,104,25 | 62,95,23 | 同一条气泡在竖界两侧发生色阶变化 |
| 同气泡下部，y428 | 67,103,24 | 62,95,23 | 边界持续到同一气泡另一高度 |
| 下方中文长气泡，y902 | 31,88,55 | 28,78,49 | 不同消息仍在相同x发生变化 |
| 输入内部，y1094 | 23,27,25 | 18,20,19 | 输入材质在相同x出现色阶 |

前一批实际构建的`app-r18-resume-light390-scroll-0..3.png`及JSON、暗320 eight-lines／caret／tail图、created-message-visible图此前已目检；浅色记录确有内层scrollTop246→316→386→316。它们只是当时干净的样本，**不能抵消本次用户失败**。本次暗320 caret图仍显示前段，父线程读回scrollTop0，不能用旧“eighth-line-end-verified”替代。created-message图只能独立证明新句及可见状态存在，没有对应JSON就不由图推出CID唯一性或真实送达链。本节不追加这些样本的整体通过分。

### 对原SVG路径的判断：合成／裁切最可疑，尚未证实自反馈

本轮先读了原路径，后收到frosted改动通知再重新读取候选源码。原路径和新候选分账，不把候选源码说成失败截图已经使用。

1. **共同的backdrop合成／裁切路径，比逐条填色函数更符合现象。** 普通消息并无自己的SVG，单色RGBA仍出现同一x竖界；输入属于另一个独立区域。原[renderer SVG分支](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/liquid-glass-renderer.ts:73)把filter定义放进被过滤的host内，再给host写`backdrop-filter:url(#id)`；filter区域是x0/y0/100%，包含GaussianBlur、feImage、displacement和saturation。材质又有specular混合层，外层预览iframe可带小数scale。这些共同合成条件值得优先隔离，但源码本身不能证明浏览器把输出递归采回输入，更不能直接断言某个GPU或SVG规范实现有bug。
2. **原路径还有明确的嵌套采样。** [chat.vue顶部](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:1793)的back／ticket／identity父层blur16，内部LiquidGlass原为SVG backdrop。此前只去composer父blur并未清掉这条路径；先前C实验只关输入子SVG且baseline本就正常，不能排除标题／返回／发送等其他玻璃实例。将所有聊天直接调用一起隔离，比反复改某条气泡颜色更有针对性。
3. **没有源码证据证明SVG分支自己每帧重抓页面。** renderer有geometryKey去重，SVG分支安装后返回；WebGL的MutationObserver／refresh循环在另一分支，不能移花接木归为当前SVG反馈。若要区分闪烁来自持续重建还是浏览器合成，应由父线程记录静止期间实际`render/release`次数、宿主尺寸、strategy和filterId变化。只看到一个`requestAnimationFrame`函数不足以定性循环。
4. filter紧贴100%边界、blur24、元素缩放及圆角clip仍是原路线的风险，但局部定义位于host中不等于已经证明循环。新的frosted方案是绕开这一整组条件的工程修正，不提供对原故障单一根因的证明。若新构建仍闪烁，下一步优先隔离剩余CSS backdrop／祖先变换，不能继续声称已经移除的SVG仍是该新场景原因。scroll／reflection数据竞态由父线程负责，本审不重复。

### 最新frosted候选：范围正确，但仍有两处源级注意点

实际只读核到[LiquidGlass配置](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/liquid-glass.vue:18)默认`rendering=refractive`，chat.vue四个、conversation-thread.vue十七个直接调用均显式`rendering=frosted`。[renderer](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/liquid-glass-renderer.ts:52)先处理系统不透明偏好，再在生成任何光学资源前进入frosted分支：默认CSS blur18/saturate135，输入显式24；原SVG／WebGL分支和默认导航调用未改成frosted。配置进入geometryKey；release会清理已有SVG、WebGL、blob资产和specular inline背景。CSS仅给显式frosted类关闭specular的mix-blend/filter、加入渐光与圆角裁切。

[普通气泡](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:802)现为单RGBA＋border、没有backdrop-filter，也没有负z／contain伪层。对于本场景的单色会话底，去掉每条滚动气泡的独立采样合理，保留半透明填色和既定纵向色序；不能因为少了blur属性就自动判定视觉不符。反过来，也不能因为只有一个computed填色就保证最终像素连续。

| 源级发现 | 影响及最小处理建议 |
|---|---|
| **P2：模式更新到下一RAF之间，旧异步折射结果仍可能写回。** 本次读到[update](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/liquid-glass-renderer.ts:196)只赋config再schedule；generation到render才增加。 | 可构造时序为：refractive资产未返回→update(frosted)→下一RAF之前旧资产返回。旧continuation的generation检查仍可能通过并装回SVG，直到新RAF清除。此时是共享renderer模式切换边界，不是全新加载后固定frosted聊天仍持续闪烁的已证原因。建议在有效渲染意图变化时立即使旧异步意图失效，或在提交光学结果前比较捕获的有效配置；同时保留相同配置去重，不能无条件取消后又因geometryKey相同而跳过恢复。测试文件已写有before-frame／after-frame覆盖，本审未执行，不宣称其已绿。 |
| **顶部仍有父blur16＋子CSS blur18，尚未完全收敛。** [chat.vue:1793](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:1793)在最新候选仍存在。 | SVG已退出，但顶部依旧双层采样，可能过度磨砂并增加合成负担。建议将顶部所需模糊只交给其显式frosted LiquidGlass，移除本地父blur；不改全局导航。保留标题清晰度、原色与rim后再看实际效果。这是待处理的合成风险，不把它当作新图断面已证根因。 |

另有较小的首帧一致性风险：[frosted CSS](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/liquid-glass.vue:44)当前只设置overflow，默认base仍blur.75；未显式blur的发送／附件等控件要等renderjs写入18。顶部和输入有各自局部兜底，但其他控件初始帧可能短暂更透明。建议显式frosted类的CSS默认值就与renderer的18/135一致，仍允许实例变量24覆盖、系统solid优先；这不是持续闪烁已复现的证明。

### 审美退化与最小新构建验收范围

**这次从折射变成磨砂，是实际材质改变，不是视觉等价替换。** 局部方案没有把全站LiquidGlass关闭，tint／rim／内缘／CSS高光仍保留；但SVG位移折射和生成的specular已退出聊天。SEND-01旧9.2不自动覆盖新实现，不能把“还有LiquidGlass组件”当作通过。当前没有新构建候选图，所以既不先给9，也不先凭属性认定材质失败。

- 最需看发送ready／disabled：ready保持原82%主题色，新渐光应有上缘亮面与下缘暗部，不能退回单块实心圆；disabled应可辨认而非消失。overflow只在材质子层，不应裁44px外层触区或飞机；CSS渐光的力度和原生成高光不同，必须看实际图。
- 输入显式blur24应保住占位／输入文字可读性，背景消息仍能形成柔和映色；不能出现矩形亮片、接缝、清晰背字穿透，也不能为掩盖断面加黑底板。原附近反射伪层仍独立存在，其filter是自身光晕，不等于再次backdrop采样。
- 标题／返回保持独立圆角磨砂，不恢复整条黑背板；去重复blur时尤其核标题与背后消息重合的帧。新frosted的overflow会截掉材质子层外投影，当前局部目标允许保留内缘；须看轮廓是否因此变平，不要求恢复被用户否定的重外投影。

父线程最小补证不需要重跑整套旧矩阵：

1. **reload真正新构建，确认临时style已经清除。** 记录当前URL、bundle、viewer实际scale/DPR；聊天材质读回为CSS blur、无SVG url backdrop／WebGL canvas／旧blob specular，普通气泡backdrop为none。导航保留默认路线，不能由聊天opt-in误改全局。
2. **用用户实际展示比例重现整页长消息＋底部输入组合，保留连续帧。** 至少覆盖静止、实际滚动、停止后和输入由单行长到144px，检查原x界两侧以及输入右圆角。连续帧需能观察用户所说的持续闪烁；1:1裸页和单张静止PNG只作对照，不代替实际viewer。
3. **补一个浅320代表画面和发送ready／disabled。** 看气泡纯色／文字对比、标题清晰度、玻璃层次、44px触区及末尾约8px间隔；原按压／reduced规则若未改，不要求重新完整R8矩阵。当前八行caret末尾仍未证，不借旧构建签本次。
4. **若原比例恢复稳定，只签实际观察的子范围。** 记录未复现／已消除于哪些连续场景，不倒推唯一根因，不外推真实APP安装、系统键盘、全局导航或H5新版本。若仍见断面或闪烁，STATUS继续未通过，保留该次实际失败帧。

本轮只更新此报告，未改生产源码、测试、图片或其他文档，未操作浏览器／Git，未运行任何测试或构建。券卡、试用卡及浅色首页／消息顶部阴影各自限定9.2保持独立，不通过平均分抵消STATUS失败。

## 实际zoom1.1暗390样本与renderer意图修正分账（2026-10-27）

### 正确的新运行证据

本审逐张original目检[全窗口无损图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-stable-window-raw.png)、[正确全手机裁图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-stable-dark390-tail-native-zoom.jpg)，以及`app-r18-stable-dark390-motion-0.png`至`-5.png`全部六张。raw和motion为1716×1683 PNG；正确裁图为390×844 JPEG，只作整体视觉辅助，像素取样用无损全窗口图。**裁偏的`app-r18-stable-dark390-tail.png`与`app-r18-stable-dark390-tail-native.jpg`未采用。**

读取[r18-stable-dark390-motion.json](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-stable-dark390-motion.json)：六条统一指向`index-CWzS4Rnd.js`，browser zoom为1.1000000238，iframe transform为matrix(1,0,0,1,0,0)。二者是不同层级，不能用iframe的matrix1把用户实际浏览器缩放写成100%。所有已记录气泡filter为none，输入top759.0435／height55.2083稳定。父线程另提供五个可见玻璃均为frosted／scrolling-surface、CSS blur18或24、无临时A/Bstyle的DOM读回；这些字段不在motion JSON中，本审注明为父线程证据，不伪称从该JSON独立读得。

| 帧 | 时间（UTC 18:28） | 实际内层scrollTop | 长中文／越文气泡top | 观察 |
|---|---|---:|---|---|
| 0 | 36.699 | 655.1515 | 140.3882／305.0189 | 输入覆盖下方消息，色面连续 |
| 1 | 37.098 | 572.1212 | 223.4185／388.0492 | 顶部及输入背后均有内容，文字可读 |
| 2 | 37.537 | 488.4848 | 307.0549／471.6856 | 长消息移至中下方，未见竖向分块 |
| 3 | 37.915 | 572.1212 | 223.4185／388.0492 | 返回同位置，色值和布局对应 |
| 4 | 38.331 | 655.1515 | 140.3882／305.0189 | 返回帧0位置，未见新增接缝 |
| 5 | 38.706 | 738.7878 | 56.7519／221.3826 | 滚到底部，R18新句可见，输入与尾部留隙 |

### 本批所见外观：限定9.1，STATUS整体仍未通过

这些实际zoom1.1画面没有出现用户24／28图中的同x直线断面，也没有输入右端矩形亮片。长泡内部为单色，顶部lime至底部forest色序保留；短消息、时间及状态没有被新增材质盖住。标题仍是独立磨砂pill，输入在消息从背后经过时呈柔和绿／灰映色，占位文字仍可读；空态发送圆的轮廓与内缘清楚。当前dark空态未见不可接受的平面化或黑背板回归。

**暗390、实际zoom1.1、所列静态滚动位置的色面及输入／空态玻璃外观给9.1，限定接受。** 这不是STATUS全项通过，也不是SEND ready新材质通过；截图中输入为空，没有有输入的强调色发送按钮可供本轮目检。

辅助取样在每张全窗口图中选择两条长泡内部空白行，横向x431..827；六帧两条气泡的有效采样行相邻RGB差值和最大均0。帧5中文泡的初选y276与浮动标题重叠，测到42，不能混作气泡色阶；已改取该泡下部无遮挡y390，结果0。输入内部y1504／x450..827的相邻RGB差值和最大依次为4、3、3、3、4、3，符合所见平滑映色；不要求真实玻璃逐像素恒定，也不由有限采样断言全图无任何像素差。

六帧间隔约375–439ms，总跨度2.007秒，覆盖实际滚动位置，**不是足以排除帧间闪烁的高密度连续播放证据**。因此用户“持续闪烁”仍待后续连续帧；浅色／多行也按已通知计划单列未测，不要求重做无关旧矩阵。24／28失败事实及旧正常样本全部保留。

### renderer意图P2：源码修正已确认，运行未改版

父线程随后修正了[renderer update](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/liquid-glass-renderer.ts:196)：先拒绝disposed，比较radius／tone／backdrop／blur／rendering；配置变化时立即generation++并清geometryKey，再排队下一RAF。[preferenceChanged](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/liquid-glass-renderer.ts:183)也同步失效。旧资产完成后的generation检查因此会在下一RAF之前拒绝旧结果；清key避免取消后同key直接跳过恢复。相同原始配置不失效，默认rendering仍为refractive，未给导航添加显式frosted。

**原“intent→下一RAF旧资产可能装回”P2在源码层已针对性修正；本审未执行worker测试，未声称运行闭环。** `index-CWzS4Rnd.js`及上述八张图仍是修正前renderer快照，其页面为常量frosted，所以可保留本批静态视觉结论，不能重标为模式切换补丁已运行。

一个小边界交测试worker核验即可：update比较原始blur，geometryKey比较夹限后的blur。例如-8→-1都渲染为0，但当前会先清key导致重建；既有等效参数去重用例可能需要按有效配置比较恢复。此点不影响固定18／24的本批聊天外观，不把它列成同x断面根因或本批视觉阻断。前节顶部双层CSS blur和frosted初始CSS值建议仍保留；当前静态图没有证实这两处产生新的可见缺陷。

只写本报告，未浏览器操作、未改生产文件、未执行Git／构建／测试。接下来只需按实际触发条件补连续稳定性、浅色／多行及ready材质，并对统一新构建标清版本；不以本次正常帧否认用户失败。

## 外部pointermove触发与不采样材质建议（2026-10-27）

**STATUS仍未通过。** 用户再次确认当前frosted原生CSS blur版本输入仍出现断面，尤其在鼠标移到原型APP屏幕外后不断闪烁。本次新增触发条件来自用户运行反馈，没有新的失败图片可供本轮目检；本审不把旧24／28图改标为这次frosted版本，也不据先前正常帧否定反馈。

父线程提供隐藏QA tab3静止约3.6秒／12帧、仅online脉冲区域约172像素变化的分析。本轮没有独立重算这组PNG，因此数字注明为父线程提供。即使该分析完全成立，它也只覆盖该tab静止场景；没有覆盖外部pointermove，更不能证明用户可见窗口最终合成稳定。当前[cp-dot](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:1824)确有1.6秒周期脉冲，不能把这处预期动画当作整页断面根因，也不能通过删除online状态来宣称修复。

### 当前采样与外部合成风险

- **frosted仍是实时backdrop路径。** [renderer分支](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/liquid-glass-renderer.ts:56)直接写入CSS blur18／显式24及saturate135；退出SVG只是更换采样实现，不是取消实时背景依赖。[输入局部规则](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:1029)也保留24px。SVG已为none不能单独作为本问题关闭依据。
- **DOM静止不等于绘制静止。** CSS动画、hover和浏览器合成不必修改DOM。预览外层[button:hover](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/scripts/prototype-preview.html:4)会换背景；iframe具有圆角、阴影及transform scale，stage有overflow裁切。先前记录中iframe matrix1与浏览器zoom1.1并存，因此不能只看一个scale字段排除显示路径。外部指针触发共享合成／裁切异常是当前高优先级候选，尚无依据指认具体GPU、tile或浏览器内部实现。
- **不把“外部合成”说成CSS在读取操作系统屏幕。** 本案需要区分页面内背景采样与整个可见窗口的合成输出；外部鼠标可能伴随重新合成，但仅凭触发相关性不能证明滤镜采到了iframe之外的桌面像素。
- 所查chat、thread、preview和普通glass renderer未见跟随外部鼠标更新材质的pointermove／mousemove处理。liquid-glass-view中的pointermove属于[mountSegments](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/liquid-glass-view.ts:17)控件根，普通LiquidGlass走独立mountLiquidGlass adapter，不能把导航拖动监听当作当前输入框的鼠标追光。邻近映色当前从消息位置数据计算；scroll／reflection竞态仍由父线程处理，本审不重复其审计。
- **源码时序澄清：** 本轮后一次读取已见chat.vue原父blur16规则移除，顶部保留子材质18px；上一节“双层blur仍存在”属于当时源码快照，不继续把它列为当前未修。去重修正及几何补丁仍待统一构建，不能反写先前runtime版本。剩余的CSS backdrop本身仍是本次隔离对象。

### 建议：聊天局部可采用不采样的稳定材质，需明示设计取舍

**建议作为优先候选，而非已经证明有效的最终修复。** 使用独立、显式的聊天材质模式，让材质本身不依赖实时backdrop；默认导航继续走原refractive，不悄悄改全站frosted或系统solid语义。

| 层 | 应保留／调整 | 视觉与稳定性边界 |
|---|---|---|
| 控件局部雾面底层 | 使用主题匹配的确定底色，底层最终不透明；其上的原tint可以半透明 | 保证文字背后没有未模糊的历史正文。不要只去blur、保留原薄tint，重现此前B图背字干扰；也不要给整个header／composer容器铺黑白底板。 |
| tint／内缘／高光 | 保留既有主题色、上缘亮面、下缘暗部、细rim和圆角；装饰用本地渐变与inset边缘 | 不透明底层不意味着只能画实心圆，但它**不再提供真实背景折射／透视**。应称为稳定磨砂外观，不能声称光学等价。不要降低整个控件opacity来伪造透明，连文字一起变淡。 |
| 邻近映色 | 继续由已知气泡颜色／距离／横向位置驱动，远处强度归零，近处平滑增强 | 这是数据驱动的环境映色，不是屏幕抓取。可优先用平滑radial-gradient形成软过渡，避免为此重新引入backdrop、截图回采或全局pointer追踪。当前自身光晕filter blur不等于backdrop；若也纳入合成隔离，应单独标明，不能偷换原因。 |
| 文本与动作 | 正文、placeholder、飞机和状态在装饰层之上，44px触区、原按压／回正／reduced规则保留 | 当前输入清晰度不能下降；ready仍保持原主题强调色与明显层次，disabled仍可辨。不得用加重颜色或移除按钮来藏接缝。 |

这会牺牲真实背景折射，但可以保留局部玻璃的层次、柔和映色与轮廓；是否达到用户要求必须看新图，不能仅凭“还叫LiquidGlass”签9分。顶部／输入之间的空隙和整条容器仍应透明，保持消息从浮动控件后方经过的空间关系。普通气泡已经单RGBA且无backdrop，不需要再改颜色来追这个问题。

实现时需同时核对标准／webkit两种backdrop、renderer inline声明、组件base以及chat/thread局部兜底；只改dataset或一处CSS可能仍被inline blur覆盖。新模式应从首帧就使用一致底色，不先闪过原透明采样材质；退出旧模式时沿用已修的意图失效和资源清理。以上仅为源级建议，本审不编写实现。

### 父线程最小因果验证与审美复验

1. **先在实际触发环境复现。** 保持用户的zoom／主题／会话／滚动位置，用iframe外的空白区移动、外层可hover控件移动、跨iframe边界分别取样。CDP Input.mouseMoved按外层CSS坐标定位，不能拿1716×1683 PNG像素直接当CSS坐标。隐藏tab未复现只能说明该tab未复现；若与用户可见窗口不同，仍保留这个差异。
2. **对比时只隔离背景采样。** 先保留颜色和几何，临时去聊天各可见玻璃的两种backdrop，读回确认none，比较相同外部指针轨迹；该诊断帧可能透背字，不能作为交付。随后再加确定雾面底层形成可交付候选。不要用改主题／滚动位置／全局导航替换来混淆原因；必要时单独对照iframe transform与浏览器zoom，不能把缩放恢复100%当作用户现用110%已修。
3. **若取样方式变化仍不能复现用户失败，结论保持未复现。** 同时记录采样期间材质策略、computed blur、消息／输入几何和反射变量有无变化；若这些不变而可见输出变动，再加强合成路径假设，不由DOM计数直接宣称稳定。
4. **最终局部矩阵只需覆盖新路径。** 在外部指针移动期间及停止后看输入、长泡和圆角；另看浅色小屏、144px多行，以及发送ready／disabled。重点是无断面／闪烁、文字清楚、没有整条背板、没有退回平面实心按钮、远近映色不变成固定彩条。其余旧项不重跑；真实设备／H5仍未验证。

本轮不新增通过分。暗390先前9.1保留为那些静态画面的历史事实，STATUS及新稳定材质仍开放。仅更新review-visual.md；未操作浏览器／CDP、未运行测试、未修改生产源码或其他文件。

## DF0ikPda浅320多行有限复审（2026-10-27）

父线程确认新构建为`index-DF0ikPda.js`，本审只读核当前源码并original目检[全窗口PNG](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-qa-final-light320-multiline.png)与[正确phone裁图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-qa-final-light320-multiline-crop.jpg)，读取[同名JSON](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-qa-final-light320-multiline.json)。PNG SHA256与JSON的`a4b3f983e392b2cd2aa9ecd5acd4fc9876fa0b344ae29620d224c65649ddf338`一致；这个hash是图片对应证据，不冒充源码或构建指纹。JSON没有scripts字段，bundle归属来源为父线程本次明确通知。

### 有限评分

| 观察范围 | 分数／结论 | 直接证据及边界 |
|---|---|---|
| 浅320多行输入、末行及尾泡布局 | **9.2，所见范围通过** | 图中可见第6／7／8逻辑行及末尾光标，长内容在输入内滚动；不是宣称8行同时全部可见。尾泡完整在输入之上，无黑条或焦点绿框，没有横向溢出。JSON独立计算gap为487.528381−479.659061＝7.869320px，field高175.2083／宽244.0151。 |
| 浅色输入与发送ready静态材质 | **9.1，所见范围通过** | 浅色输入底清楚、顶部有柔和蓝色映光，圆角和细内缘保留；蓝色发送圆有上缘亮面及下缘暗部，白色飞机清晰，未退化为无层次实心圆。本图没见原同x断面或矩形亮片；这是静态外观结论，不排除帧间闪烁。 |
| STATUS-01断面／外部鼠标闪烁 | **继续开放，不给全项通过分** | 用户最新仍反馈真实操作问题。两张新图、早先隐藏QA正常帧和CDP同页移动均不覆盖该物理触发路径；本轮没有复现或消除该动态缺陷的独立运行证据。 |

JSON为light，browser zoom约1.1，DPR约1.65，phone frame约320×693。五个可见玻璃均记录frosted／scrolling-surface：back、identity、attach、send为blur18，field为blur24；已列气泡filter为none。textarea的144px／scrollHeight336／scrollTop189.09／selection211和ArrowLeft后typing来自父线程操作读回，该JSON的state没有textarea字段，本审不写成自己从JSON读得。末行和光标的可见性则由本审直接看图确认。这里的浏览器原生键盘操作不等于真机系统键盘验收。

当前源码已移除cp-back／identity等父层blur，顶部保留子材质18；LiquidGlass显式frosted类首帧默认也为18／135，输入实例仍24，修正了上一节的初值不一致风险。renderer已按effectiveBlur比较等效参数，并区分undefined与显式值对应的材质差异；先前−8→−1去重边界不再列为当前待修源码项。本审未执行worker测试，不以源码复核代替运行测试。

### 早先QA像素记录与最新物理反馈不能合并

本轮读取`r18-qa-stable-dark390-idle-index.json`的12条（时间差3.593秒）、`r18-qa-pointer-outside-index.json`的6条，并读取[r18-qa-stable-pixel-diff.json](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-qa-stable-pixel-diff.json)。本审核的是报告及索引，没有把父线程像素计算冒称本审重新逐像素重算。

diff报告中，通常变化落在online区域x588..601／y248..261；pointer-outside-3和native-pointer-outside-2的bounds扩大为x588..602／y248..262，各有12个像素超出原小框。应准确记为online周边右／下多1像素，不能把`changedPhoneExceptOnlinePulse=12`误读为正文或输入框闪烁，也不能笼统写所有帧严格只有14×14。记录支持这些已取样帧没有报告到body变化，不证明帧间或另一显示路径没有异常。

这组静止、CDP同页外部指针位置与若干原生click终帧，均不等同用户在桌面可见窗口中移动真实鼠标的连续触发验证。此前父线程说明一轮失败反馈早于去父blur的DF0ikPda；最新续报仍称问题存在。本报告保留两次反馈，不在缺少对应动态证据时自行把任何旧失败图片改标为DF0ikPda，也不反向宣布fresh版已经解决。

尚未覆盖的必要局部范围是：用户物理鼠标触发路径及连续帧、统一新构建的暗色代表画面和发送动效／长文本动态过程。本图可关闭“当前浅320末行是否可见”的静态缺口，但不代签整个滚动／历史锚点链。后续由父线程在隔离QA5240取证，用户5237状态保留。本审未进入任一浏览器页；未测试真机、H5新版本或真实服务。

不采样的稳定材质仍只是需要时采用的局部备选，不把实施该方案设为当前验收的硬性前提，也不预先保证它能解决物理指针场景。本次仅更新本报告，保留所有旧分与失败证据，未修改源码／测试／截图、未执行Git或浏览器操作。

## 布局zoom取样、新用户c01失败图与根层绘制候选（2026-10-27）

### 最新用户图：矩形暗片仍是明确失败

已用view_image original直接查看[用户c01 PNG](C:/Users/FL/AppData/Local/Temp/codex-clipboard-c01de40c-e991-47c0-abc5-1b073e6a7a87.png)，实际580×157。输入内部左部较暗区域在x约366形成直立右界，在y约127形成水平下界；这不是应有的连续圆角映光。用户称范围减小，本裁图能证明局部缺陷仍存在，不能独立量化全页改善或证明其他区域均已正常。

独立读取PNG像素：y115、x365→366为RGB(34,64,52)→(38,73,60)；x250、y126→127为(24,43,36)→(35,57,48)。该横竖转折支持矩形分块确实在图中，不是仅由computed颜色推断。坐标只属于用户裁图，不能直接对应CSS像素或宣称某个GPU tile大小。持续闪烁仍按用户动态反馈保留，本审没有从静图冒称看见运动。

**STATUS继续OPEN，不以“范围小了”或“输入背景更平了”签过。** 色面／动态稳定与玻璃外观是两项同时要满足的条件；通过压平、变成不透明素色矩形掩盖接缝，不等于完成用户要求。

### 布局zoom方案：局部方向合理，当前证据有清楚边界

[prototype-preview.html](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/scripts/prototype-preview.html:6)已把iframe的transform scale移除，改为`zoom:var(--phone-scale,1)`。[fitPhone](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/scripts/prototype-preview.html:16)仍按stage可用尺寸计算scale，外壳宽高为逻辑机型尺寸×scale，iframe自身width／height维持所选390×844或320×693等。它没有用已缩放的iframe尺寸反复回算scale；当前源码未见必须认定为双重缩放的直接依据。

去掉iframe祖先transform路径是合理的局部隔离，但用户c01失败证明它尚不是充分修复。用户5237只原地应用外层，QA5240刷新实际HTML的执行信息来自父线程；本审没有操作这两个页面。浏览器zoom1.1、CSS布局zoom、DPR及iframe内部CSS视口是不同量，不能混写。

本审original目检`app-r18-layoutzoom-dark390-outside-0.png`／`-7.png`、`app-r18-layoutzoom-light320-outside-0.png`／`-7.png`四张首尾代表图；其余帧使用独立PNG字节比较，没有冒称16张都逐张目检。所见首尾图没有新的正文遮挡或明显横溢，但不因此重给全项分。

两个索引各8条：dark390跨度0.990秒，light320跨度0.920秒，实际帧间约119–145ms。浏览器zoom均约1.1，frame外框分别约390×844／320×693，滚动位置和输入几何不变。这些样本没有证明CSS布局zoom小于1时的内部视口、命中坐标和裁切正确；最小后续如需覆盖适配，仅补一个真实缩小的QA尺寸，并读内部innerWidth／innerHeight与外框即可，不要求重跑全部旧矩阵。不能把截图物理坐标直接当作CDP CSS坐标，也不要为验证擅自切用户前台。

### 16张PNG独立比较：不要把头部状态变化写成材质闪烁

本审以每组帧1为基线，通过pngjs在内存解码、逐RGBA字节比较phone矩形内所有像素，并核了全部16张文件SHA256，均与索引匹配。没有写入或重编码图片。这与父线程[r18-layoutzoom-outside-pixel-diff.json](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-layoutzoom-outside-pixel-diff.json)的精确计数略有区别；父记录未写明基线／阈值，本审不猜测其算法，也不覆盖原报告。

| 组／比较 | 本审严格比较结果 | 解释边界 |
|---|---|---|
| 暗390帧0、2–7相对帧1 | 168–172像素变化，范围始终x595..608／y248..261；phone其余像素相同 | 位置位于online小圆点，未发现这些取样帧的输入色块变化。不是对真实鼠标全过程的替代。 |
| 浅320帧1–6 | 完全相同 | 只签字节一致这一事实，不排除帧间或其他环境异常。 |
| 浅320帧0相对帧1 | 108像素变化，全在四个手机外圆角，各通道最大差仅1 | 不宜笼统写“0–6绝对相同”，也不能把这一边缘微差说成输入闪烁。 |
| 浅320帧7相对帧1 | 1467像素变化，范围x541..712／y373..391 | 直接看图可见灰点“Đang kết nối lại…”变成绿点“online”。这是头部状态文案／圆点变化，不能仅凭图片把原因确定为locale异步，也不是输入材质闪烁证据。 |

这些受控PNG没有复现c01的局部暗片，结论就是该组未复现。不得把“QA帧没有变化”改写成“用户反馈不存在”；CDP同页指针、若干离散帧与真实桌面可见窗口中的物理鼠标路径仍分账。

### 新根层绘制与发送取消二次采样：已核源码，未签运行

本轮读取时该候选正在落盘，以下为最后一次读取状态，不把它当作c01或layoutzoom取样已使用的代码。

- [LiquidGlass frosted规则](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/liquid-glass.vue:44)把tint、渐光与inset rim画到host上，原optics／tint／specular／rim子元素隐藏；默认refractive仍保留原路径。这减少了重叠的装饰绘制，但**一个DOM绘制目标不等于已证明GPU只有一次合成**。根层仍有18／24px实时CSS backdrop，不能由合并层数直接证明断面或闪烁已消失。
- [发送局部规则](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:1108)已写标准／webkit两种`backdrop-filter:none !important`，限定compose-field内部的send frosted材质，能在样式优先级上覆盖renderer inline blur。这不是把blur参数设为0；后者仍会留下saturate采样。最终需在新构建读回computed none。DOM上发送材质与输入材质不是父子filter节点，但发送在视觉上覆盖输入玻璃，仍存在再次过滤已绘制输入表面的风险；这一描述不等于已锁定c01根因。
- 初读发现旧ready增强仍指向已隐藏tint／specular子层，已即时提醒；随后复读已见[ready根层渐变](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:1122)及solid分支补齐。该源级遗漏已处理，不继续列为当前待修P2。原82%主题tint、上亮下暗参数、外44px触区、内层按压和飞机回正规则保留；最终层次是否足够仍须新图，不继承旧9.1。

最小后续建议：在隔离QA同一复现位置记录field材质、实际textarea／wrapper、发送材质的矩形，与c01横竖边界做坐标映射；不要只凭rect相似就定因。若需A/B，可短暂隐藏某装饰层或textarea视觉同时保留布局，以区分文本控件覆盖层与材质采样，实验后恢复，不能将隐藏输入作为交付。保留原用户会话／草稿，不切前台。合并根层并去掉发送二次采样后，至少检查空态、ready、滚动内容从输入背后经过、外部指针移动与停止；圆角／映光应连续，输入文字清晰，不能用平面底色遮盖缺陷。

本轮没有新增≥9签项。原各局部评分保持对应版本；新候选必须同时满足稳定性和玻璃层次，STATUS继续OPEN。只写本报告，未改生产源码、未操作浏览器／CDP／Git、未运行构建或测试、未修改截图。

## DYMJD5Wv singlepaint：14张新图的有限复审（2026-10-27）

本轮接续上一节的待运行候选，**未发现新增确定P1／P2；不改旧版本评分，也不关闭STATUS**。下表是新样本自身的限定质量评分，不作总分平均或整个APP已通过的声明。c01及此前24／28用户失败图继续有效；父线程尚未收到新反馈不等于用户确认修复。

### 实际查看与版本边界

本审用view_image original逐张查看`app-r18-singlepaint-light390-overlap-0..5.png`、`app-r18-singlepaint-dark320-overlap-0..5.png`及[暗320多行初态](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-singlepaint-dark320-multiline.png)、[末尾输入态](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-singlepaint-dark320-multiline-caret.png)，共14张真实1716×1683 PNG。读取各图JSON与[浅390索引](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-singlepaint-light390-overlap-index.json)、[暗320索引](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-singlepaint-dark320-overlap-index.json)。独立SHA256核对14图均匹配，12条索引的state均与各图独立JSON相同。

构建标记DYMJD5Wv来自父线程本轮通知；这些截图JSON没有script／artifact字段，本审没有把图片哈希匹配写成独立确认浏览器加载脚本或重验完整构建。此次不使用旧CBcr／DF0ikPda图替代新图。画面为越文界面、混合语言fixture；不是三语全矩阵。

### 限定评分

| 子范围 | 本轮分数／结论 | 直接证据与边界 |
|---|---|---|
| 浅390输入、气泡色面及禁用发送材质 | **9.1／10，所见范围通过** | [浅390帧0](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-singlepaint-light390-overlap-0.png)至帧5：输入有蓝色透色、柔和模糊和连续圆角内缘；背后蓝色内容仍影响材质，没有变成整块不透明底板。未见c01式硬直矩形暗片；灰色飞机与中性发送圆清楚。这组为空输入，不代签浅色ready材质或发送动作。 |
| 暗320输入、气泡色面及ready／禁用发送材质 | **9.2／10，所见范围通过** | [暗320帧0](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-singlepaint-dark320-overlap-0.png)至帧5及多行两图：绿色透色连续，上缘高光与下部暗面仍在；多行ready圆保留lime强调色、上亮下暗和清楚飞机，禁用态中性，未退化为平面纯色圆。本轮只签外观，不重签按压、旋转、reduced或真实发送生命周期。 |
| 暗320多行可读性、末尾与阅读位置保留 | **9.2／10，所见范围通过** | 初图显示开头三条逻辑行，末图显示第六至第八条及末尾“Kiểm tra.”；长行可在输入内继续显示，没有焦点绿框、黑横条或横溢。输入升高120px且阅读内容坐标不动，见下文独立几何核对。这是阅读历史状态，不签near-tail间隔或手机系统键盘。 |
| 明暗固定重叠位置、同页phone外指针取样稳定性 | **9.0／10，仅该组取样通过** | 两组六帧的输入底面及消息区域没有块状像素变化；变化可定位到在线圆点和浅色光标。跨度分别只有0.729／0.693秒，采样不是连续视频，也没有覆盖帧间、长时间或用户真实桌面物理鼠标路径。此分不能用于关闭STATUS。 |
| STATUS-01用户实际断面／闪烁 | **OPEN，不给全项通过分** | 新样本未复现不等于用户失败已消除；native／物理指针显示路径仍待实际取证。旧9.2／9.1和本表局部分均不抵消该开放项。 |

### 逐像素比较与多行几何

使用pngjs只在内存读取，无重编码、无新图片写入。每组以帧0为基线，按context.frame×DPR换算phone矩形，逐RGBA字节严格比较。两组DPR均约1.65、浏览器zoom约1.1，frame分别约390×844／320×693。六个指针坐标位于同页手机外；不把CDP坐标当作真实桌面鼠标轨迹。

| 组 | 独立比较结果 | 解释 |
|---|---|---|
| 浅390帧1–4相对帧0 | 总变化163／203／203／220像素，其中每帧31像素为x435、y1459..1489的竖线；其余132／172／172／189像素位于在线圆点，最大范围x588..602、y248..262 | 竖线与直接目检的输入光标出现对应，不是输入材质接缝。不能写成输入区域完全没有任何像素变化。 |
| 浅390帧5相对帧0 | 172像素，仅在线圆点；field区域0变化 | 这些取样帧的输入底面一致；不外推为全过程不闪。 |
| 暗320帧1–5相对帧0 | 120／128／172／172／172像素，仅在线圆点，最大范围x588..601、y373..386；field区域均0变化 | 消息与输入底面未发现受指针影响的块状变化。 |

浅组时间跨度729ms，间隔124–187ms，列表scrollTop一直458.181793；暗组跨度693ms，间隔120–182ms，scrollTop一直710.302979。画面与bubble／field矩形确认内容确已位于输入背后，但**这是滚到重叠位置后取样，不是正在滚动的连续帧**。当前CTA玻璃处于列表中部，没有位于输入背后，不能据此关闭“玻璃CTA实际滚入固定输入后方”的交叉采样取证点。

暗320从单行到多行，field为244.0151px宽，高55.2083→175.2083，top607.528381→487.528381，bottom始终662.736710；列表scrollTop不变，全部所列bubble rect逐项相同。multiline与caret两次的bubble位置也相同，支持在这次阅读历史状态下输入升高没有抢走阅读位置。因为当前就是重叠历史场景，不误报为尾泡被遮挡缺陷，也不写成尾泡8px留位通过。

textarea高144、初始fill后scrollTop0、ControlEnd后逐字输入至scrollTop237.576／scrollHeight384及caret258，是父线程本轮提供的操作读回；本轮两个multiline JSON的state没有textarea／selection字段。报告据图确认末尾文本可见，但不把这些数值冒称本审从JSON独立读得，也不把初始fill图当作末尾已经出现。

### 源级复核与仍有价值的局部取证

[frosted根规则](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/liquid-glass.vue:46)把背景、高光与内缘合到host，四个装饰子节点隐藏；基础CSS、局部CSS及renderer inline是同一节点上的级联声明，不能按声明数认定多次采样。当前JSON列出back／identity／CTA／attach各18px、field24px、send none；所有列出气泡filter均none。发送[双前缀none覆盖](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:1108)与[ready根层增强](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:1122)都仍在，本轮暗色实景没有发现相应材质退化。

未新增确定源码缺陷，也不为降低层数泛加GPU hacks。剩余可定位的点仅作必要时的局部验证：输入顶缘[两个伪元素](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:1032)仍分别自模糊4／0.6px，是额外装饰filter层而非backdrop采样；若实际断面再次出现，可在固定位置只切这两层做A/B，不动父线程负责的reflection竞态逻辑。[CTA／图片重试](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:43)自身玻璃经过固定输入后方仍可能形成不同控件的顺序采样，本组未覆盖该相交位置。根层自己的外投影与此前被父裁切的子层投影可有显示差异，但本轮头部／返回及输入所见没有新增重阴影问题，不以此立P2或要求取消全局玻璃。

下一步只针对尚未闭环的真实触发路径和必要的移动中样本补证，不要求重跑整套历史矩阵。真机系统键盘、新原生安装、真实服务及新H5未验。本轮唯一写入本报告；未操作浏览器／CDP／Git、未改生产源码／测试／截图，未运行测试或构建。

## 映光距离、浅色在线三态与bare-route消息页（2026-10-27）

本轮仅增量目检指定新证据，**无新增确定视觉P2；STATUS仍OPEN，固定重叠的旧判定不重做、不升级**。用view_image original实际查看六张`app-r18-rim-*.png`、三张`app-r18-presence-light390-*.png`及`app-r18-bare-route-messages.png`，共10张。前九张PNG的SHA256均独立核对为匹配各自JSON；bare-route运行记录无图片hash，不声称有该项配对校验。

| 本轮子范围 | 限定评分 | 所见与验收边界 |
|---|---|---|
| 映光距离／颜色：暗320远、中、近；浅390中、相交、近尾 | **9.2／10，所见范围通过** | [暗远](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-rim-dark320-distant.png)为中性输入玻璃，没有固定绿／紫彩条；[暗近](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-rim-dark320-near.png)上缘绿色、[浅近尾](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-rim-light390-tail-near.png)上缘蓝色，均柔和且未遮盖文字。中距与相交图也已逐张查看，几何／strength见下表。这是各距离状态的外观与读回核对，不是滚动中逐帧平滑性或反射竞态签核。 |
| 在线／离线／重连：浅390 | **9.2／10，所见范围通过** | 三图中的离线“Ngoại tuyến”和重连“Đang kết nối lại…”为灰色，在线“online”的圆点及文字为绿色；文字明确区分状态，非只靠颜色。最长重连文案完整呈现既定省略号，身份pill居中，无返回挤位、横溢或额外右侧头像。仅签本地状态投影及视觉，不代签真实WS连接、断线恢复或动画过程。 |
| bare-route消息页呈现：kzT9o2ox | **9.1／10，所见范围通过** | [消息页截图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-bare-route-messages.png)实际显示“Tin nhắn”、一条会话、预览省略、时间、隐藏操作及历史保留说明；布局清楚，没有误带聊天输入框或横向裁切。只签此浅390单会话画面与路由读回，未点击返回／通知／会话／隐藏，也不签所有直接入口或多会话矩阵。 |

### 距离与材质应分开判断

读取[r18-rim-distance-runtime.json](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-rim-distance-runtime.json)的五条记录，独立按`max(0, field.top − nearest.bottom)`复算gap，均与记录一致：

| 样本 | gap（CSS px） | strength | 最近气泡／上缘颜色 |
|---|---:|---:|---|
| dark320-mid | 36.278419 | 0.494 | 中性深灰气泡，中性灰映光 |
| dark320-near | 8.219704 | 0.964 | rgba(28,91,61,.84)，暗色映光rgba(78,127,104,.78) |
| light390-near | 0（相交） | 1 | 白色气泡，中性灰映光；不是蓝色近尾样本 |
| light390-mid | 36.193214 | 0.496 | 白色气泡，中性灰映光 |
| light390-tail-near | 7.926125 | 0.966 | rgba(19,66,217,.9)，浅色映光rgba(33,77,219,.66) |

暗远图对应独立JSON的最近泡bottom156.079533、field.top607.528381，相距451.448849px；图中未见固定彩条。父线程通知的远距strength=0按其读回保留，但当前五条汇总不含distant，远图JSON也没有strength字段，本审不把0冒称独立从文件读得。这个记录边界不妨碍签所见远距外观。

暗／浅mid图的输入背后另有绿色／蓝色气泡，基础backdrop会给整个输入透色；因此不能拿整块输入的明暗或色浓度直接证明rim强度单调变化。上缘距离控制、基础玻璃采样是不同效果，近尾图与JSON足以支持当前局部外观，尚未证明运动过程全程无跳变。

### 在线三态与路由证据

读取[r18-presence-runtime.json](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-presence-runtime.json)：离线／重连文字rgb(106,110,119)、圆点rgb(164,168,176)；在线文字及圆点均rgb(23,125,59)。三态avatarCount均0、header背景透明；返回尺寸均43.9962×43.9962px（约44×44），header高均72.8788px。对应三张实际截图的状态、颜色与结构相符；状态名及文案是本地模拟内容，不冒称真实客服在线。

[r18-bare-route-runtime.json](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-bare-route-runtime.json)记录URL为带`nx_device=off&nx_build=kzT9o2ox`的`#/pages/support/messages`，script为`index-kzT9o2ox.js`，composer=0，四个动作名称与截图的返回／通知／会话／隐藏相符。它证明该条记录落在messages页，并非无cid聊天输入；动作名称不等于动作已被执行。本审没有打开该URL。

版本分账：映光汇总五条明确记录`index-DYMJD5Wv.js`；远图及presence三个独立截图JSON没有script字段，不自行补写版本；bare-route记录才明确为kzT9o2ox。不得把整批旧截图改标为kzT9o2ox，也不把预览外壳的越文选择等同所有fixture文案已本地化。新增分数不平均进STATUS，c01及既有用户失败证据不变。

仅更新本审review-visual.md；未操作浏览器／CDP／Git，未改生产源码、测试或截图，未跑构建／测试。真实物理指针路径、新原生安装及真实服务仍未覆盖。

## 真实桌面backdrop对照与DEQmPjoi sampled候选（2026-10-27）

### 旧方案失败与新方向分账

本审用view_image original直接目检[r18-native-diagnostic-comparison.png](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-native-diagnostic-comparison.png)四格对照：singlepaint-residual在输入内部靠右出现竖直明暗界；diagnostic-no-backdrop没有同样硬界；恢复backdrop后硬界重现；own-layer／父线程说明的translateZ仍保留硬界。这是同一桌面诊断组内可见的开／关／恢复差异，进一步支持**原singlepaint真实桌面路径仍失败，既有STATUS P2保留**。

旧固定重叠六帧“未复现”的限定结论不需删除，但不能外推为物理显示路径稳定。对照优先指向输入live backdrop及其合成关系，尚不能唯一证明浏览器内部某个tile、clip源、textarea层或宿主缩放实现就是根因。translateZ没有消除所见问题，不建议泛加同类GPU层提示。

另直接目检[临时显式采样诊断](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-native-diagnostic-sampled.png)：可见5237页面，输入未见同样矩形硬界，仍有绿色上缘、圆角内缘和暗面。它只支持修复方向，属于临时诊断，不给予正式交付通过分，不混入后续5240构建证据。

### native操作后结果图的限定评分

实际逐张目检[浅390 outside](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-native-sampled-light390-outside.png)、[暗390 overlap](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-native-sampled-dark390-overlap.png)、[暗390 outside](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-native-sampled-dark390-outside.png)，均为可见桌面窗口中的5240预览。

| 范围 | 本轮评分／结论 | 实际观察与边界 |
|---|---|---|
| 原singlepaint真实桌面断面 | **不通过，P2保留** | before／restore／translateZ仍见硬直分界；不因诊断none平整就认可取消玻璃作为交付。 |
| DEQmPjoi浅390、native外部操作后所见材质 | **9.1／10，所见范围通过** | 蓝色近距映光为柔和横向过渡，浅色雾面、高光、圆角和中性发送圆仍可辨，未见原直立矩形边界或不透明素色底板替代。仅空输入近尾状态，不签浅色ready或移动全过程。 |
| DEQmPjoi暗390重叠及native外部操作后所见材质 | **9.2／10，所见范围通过** | 两图输入上部承接背后绿色消息的模糊色面，下方保持暗面、细边及飞机清晰度；未见对照板中的竖向硬界，也未见清楚的消息文字副本穿透。只签这两个操作结果状态，非每一运动帧或所有重叠内容。 |
| STATUS整项／后续final候选 | **OPEN，暂不签整体通过** | 最终候选的行为、320及多行尚待增量运行证据；native drag后静图不覆盖拖动每一帧、长时间及所有原用户触发位置。旧失败不删除。 |

父线程明确本次使用真实桌面native鼠标drag，在手机右侧灰空白移动后capture，而非CDP合成鼠标。本审从图中看到桌面窗口、5240地址及右侧灰区指针；操作方式和完整运动路径来自父线程执行说明。本审未亲自执行动作，静图本身也不能证明中间每一帧。因此此前“物理路径未覆盖”的边界已增量补到**native外部操作后结果图**，不再笼统视为CDP取样，但不冒称已独立观看连续运动。桌面原生输入事件不等于APP真机安装验收。

本审读取文件签名确认：四格对照板为750×720 PNG；临时诊断与三张构建桌面图虽以`.png`命名，内容实际为2307×1269 JPEG。这不妨碍目检明显矩形边界和玻璃层次，也不把另交无损图设为有限评分的前提；本轮不据此声称像素级无缝或逐帧稳定性。未改动这些文件。

### 显式采样的源码与版本边界

只读核到[输入实例](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:139)使用`rendering="sampled"`与`.nx-conv-list`源；[renderer分支](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/liquid-glass-renderer.ts:55)限定同一cp-root内独立source，源不可用时不退回先前失败的live backdrop。[CSS](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/liquid-glass.vue:69)关闭输入host两种backdrop属性；[sample辅助层](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/conversation-glass-sample.ts:15)对有界会话副本做普通filter blur，并保留tint、高光和内缘。它改变采样来源，不是把输入悄悄改成完全不透明纯色；仍有装饰合成层，不能据此宣称只有一个paint或零合成风险。

读取时[clone](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/lib/conversation-glass-sample.ts:25)已移除副本的`nx-conv-bubble`测量class，改用`nx-liquid-sample-bubble`。这符合隔离真实消息测量的方向；父线程说明DEQmPjoi是初版sample，之后仅有这一补丁。本审把三张构建图限定为DEQmPjoi，不声称它们已验后续补丁，也不把源码意图当作行为测试已通过。

与本项直接相关的final缺口是：副本随滚动／内容变化更新、320及多行增长后的采样位置、测量不被副本影响。由父线程与行为审查完成，视觉审查不重复代签。此前映光距离9.2、浅色在线三态9.2、bare-route9.1继续保留各自版本边界，不自动继承给新采样路径。

本轮实际查看一张四格对照及四张桌面图；只写本报告，未操作浏览器、桌面鼠标、CDP或Git，未改生产源码、测试或证据，未运行测试／构建。

## DEQmPjoi反馈事件补录：动画与音频证据边界（2026-10-27）

本轮仅读取[r18-sampled-feedback-runtime.json](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-sampled-feedback-runtime.json)，不重查旧截图。文件顶层及feedback.build均为5240的`index-DEQmPjoi.js`，仍是初版sample证据，不改标成正在构建的final版本。

| 记录 | 本审确认内容 | 不外推的范围 |
|---|---|---|
| 出站消息`nx-conv-message-32-36` | enter-right有一对animationstart／animationend，end.elapsed=0.18，timing=linear | 支持这一次右侧入场事件为180ms linear，不等于独立看过180ms连续可见帧。 |
| 入站消息`nx-conv-message-32-37` | enter-left有一对animationstart／animationend，end.elapsed=0.18，timing=linear | 支持这一次左侧入场事件；不涵盖历史补页、reduced、快速确认替换或所有重播边界。 |
| 发送按压反馈 | send-tap有一对start／end，end.elapsed=0.2，timing=`cubic-bezier(0.2, 0.8, 0.3, 1)` | 仅事件证据，不新增native触摸或44px命中验收。 |

180／200ms按AnimationEvent的elapsed读回记录；`t`是记录回调的时间，不把两次回调时间差当作逐帧视觉时长。文件另记draft为空、plane为单位矩阵，并含本次出站复核文本及入站回复文本，支持该次动作的记录终态；没有飞机旋转中间帧，不能单靠终态证明转角、等待或失败／取消回正规则。

音频数组有四条记录，context均为running，附频率及调度时间。**这里只证明浏览器AudioContext在运行及存在这组调度记录，不证明扬声器实际出声、音量／听感、原生WAV播放或真实设备听觉验收。** 本审未耳听，不据此新增AUDIO通过分，也不单凭这些事件代签成功／历史／前后台声效门控。

本轮父线程新通知的final差异包括：clone测量class去除、图片子style／load更新、source replacement及Chrome offscreen清理。上一节“后续仅class补丁”保留为当时版本说明，不再作为当前最终候选的差异全集。这些新增修正尚不能由DEQmPjoi反馈记录证明，后续final320多行与native采样证据另行复评。

现有浅390材质9.1／暗390材质9.2及其他历史限定分不变，STATUS继续OPEN。本轮只更新本报告，未查看旧图、未操作浏览器／桌面／Git，未改生产代码或执行测试／构建。

## C2xTeVme最终本地视觉签核与最小未覆盖清单（2026-10-27）

### 本轮实际覆盖及评分

本审用view_image original逐张目检13个新文件：dark390 baseline／outside／overlap三图，dark320 multiline初态／caret／tail三图，light320 multiline／outside两图，light390 overlap／outside两图，用户5237原会话／outside两图，以及light390 solid-ready一图。未用DEQmPjoi旧图替代final；只读核对本轮multiline、user5237、scroll、return、transparency五份runtime JSON。

**本轮所列APP本地视觉范围可以签核，未发现需要把当前材质／小屏／多行判到9分以下的确定布局缺陷。** 这不是整个产品、真实服务或所有客户端全通过声明；下表分别给分，不以平均值掩盖未覆盖项。Noether sampled行为9.1／18项新测通过、Averroes源码9.1来自父线程转述，不冒称本审执行了这些测试，也不用他人分数推导视觉分。

| 当前限定子项 | 独立分数 | 新证据与所见结论 |
|---|---|---|
| 暗色材质，390及320多行 | **9.2／10，通过** | 三张dark390和三张dark320：输入背景连续，背后内容的模糊色面、高光、细内缘和圆角仍可辨；未见旧同x矩形硬界或清楚的副本文字穿透。暗色ready圆保持lime强调、清楚飞机及立体亮暗。 |
| 浅色材质，390重叠及320多行 | **9.1／10，通过** | 两张light390 overlap和两张light320：蓝色重叠区域为柔和透色，浅底输入及蓝色ready圆清楚，没有以全宽不透明底板替代常规玻璃。仅签各图外观，色序变化另列观察项，不声称两图全部像素一致。 |
| 320小屏输入与控制布局 | **9.2／10，通过** | 暗／浅320均无横向溢出，发送圆与六行输入区共存，文字不被发送圆覆盖，无绿色焦点框或新增黑横条。截图是320×693本地预览，不扩写为所有小屏或系统键盘。 |
| 多行内滚、末尾可见及tail留位 | **9.2／10，通过** | [暗320 caret](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-sampled-final-dark320-multiline-caret.png)及浅320两图可见第3至第8行与“第8行末尾”；[dark320 tail](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-sampled-final-dark320-multiline-tail.png)中最后回复完整位于输入上方。历史阅读时图文继续从输入背后经过是已授权scroll underlay，不据此报遮挡。 |
| 用户5237原会话及native外部操作后结果 | **9.2／10，通过** | [原会话图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-sampled-final-user5237.png)与[outside图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-sampled-final-user5237-outside.png)未见旧矩形断面，绿色映光／雾面仍在；原内容与阅读位置的当前读回见下文。只签native操作后的结果状态，不冒称观看完整运动录像。 |
| 降低透明偏好，浅390 solid-ready及恢复 | **9.2／10，通过** | [solid-ready图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-sampled-final-light390-solid-ready.png)白底输入、黑字、蓝色ready和白色飞机清楚；约44×44触区读回成立，恢复sampled后只一副本层。该偏好主动选择solid，不按常规玻璃退化处理；不再扩展偏好矩阵。 |

### 几何、原会话与新增运行记录

[multiline runtime](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-sampled-final-multiline-runtime.json)明确C2xTeVme、light、width320；textarea高144px、scrollHeight192、scrollTop45.454544、length=selection=61，outline样式为none。144px对应六行可见区，与末尾图相符；不是宣称八行同时显示。field为244.0151×175.2083px，top487.528381／bottom662.736710；inputBackground为透明，sampled的backdrop为none、clone1。记录未逐个给出祖先composer背景，本审以截图确认未新增全宽背板，不把字段名扩大解释。列表scrollTop527.878784、总高1209、视口681，距理论最大528约0.1212px，支持本次近尾状态。

tail图中的最后回复与输入之间确有可见空隙。精确8px来自父线程量测通知，该JSON没有最后气泡rect，本审不冒称重新从这份JSON计算到8px；也不以JPEG屏幕像素倒推CSS精确间距。

[user5237 runtime](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-sampled-final-user5237-runtime.json)明确`index-C2xTeVme.js`、`cid=DEMO-SUPPORT-2`、count33、draftLength0、dark、width390、scrollTop738.787841796875；输入sampled为none／sample1，另一个frosted控件为none／sample0。当前数值由文件独立读得；“与更新前一致”来自父线程保留状态的前后比较说明，本审未另查旧截图或重做该操作。

父线程报告QA的native drag为(1875,450)→(1875,1050)、(1850,1040)→(1925,400)，原会话为(1855,450)→(1930,1020)。本审从结果图看到桌面及手机外指针位置；实际操作路径按父线程说明记录，不混称CDP合成鼠标，也不把结果图当连续录像。检查的前12张文件实际为JPEG内容、2307×1269，故只作所见外观判定，不冒称无损逐像素全程无闪；不要求以格式重拍来阻止这些局部评分。

[scroll runtime](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-sampled-final-scroll-runtime.json)记录C2xTeVme浅390、24条图文、240个rAF样本、3195.7ms，中位13.3ms、p95 13.4ms、maxGap13.5ms、longTasks为空，clone范围1..4。这是本次运行汇总，不是本审从原始逐帧数据重算，也不是GPU FPS、视频或每个像素的连续稳定证明。

[return runtime](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-sampled-final-return-runtime.json)记录实际离开后sampleLayers0／inputs0；返回CID1后sourceBubbles24、allMeasuredBubbles24、clones3、samples1，animations为空。支持本次返回后的清理、重建及副本未额外进入测量计数；该次采集没有历史入场事件。**返回清理、测量class隔离及这组滚动运行不再列为缺口**，不扩写成所有生命周期均已实景覆盖。

[transparency runtime](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-sampled-final-transparency-runtime.json)记录同一构建：solid输入rgb(255,255,255)、ready rgb(14,72,230)，两者backdrop none，samples0；按钮43.9962×43.9962px。恢复后输入strategy sampled／透明背景／backdrop none，samples1；另一个frosted控件也为backdrop none。视觉图只覆盖solid状态，恢复部分按运行读回签，不声称另有恢复截图。

父线程已报告type-check、APP浏览器构建及`npm run build:custom -- app`完成；本审未重跑命令，编译完成不写成物理手机安装或真机渲染已验。

### IM18当前最小本地未覆盖清单

补录状态：下表保留当时缺口；2026-10-27文末“C2xTeVme两项最小补证复核”已分别补足稳定取色与受控尺寸变化，不再把它们列为缺少这两类本地证据。旧图原因和真实网络加载不作外推。

下列仅是两项具体的补证边界，**不是已确认的整体材质／排版P2，不撤销上表局部签核，也不要求重跑旧矩阵**。若收尾声明仅限上表已给范围，可以据此完成本地视觉签核；若要同时宣称动态色序与图片后加载都闭环，则分别补最小证据即可。

| 本地UI点 | 已有具体依据／缺口 | 最小可补内容 |
|---|---|---|
| 浅320前后两图的整体气泡色相差异 | `light320-multiline.png`与`-outside.png`中，同位置发送气泡由偏蓝变偏紫；独立只读抽样同一屏幕点(1730,708)为RGB(37,82,223)→(83,80,211)，(1460,715)为(42,86,209)→(90,89,209)。JPEG数值仅佐证目见差异，不作精密色彩测量。它是整泡色相变化，不是输入内矩形断面；当前没有两时点的bubble fill／position读回，不能归因于native drag。 | 仅对这一个场景在主题／布局稳定后，记录同一bubble的rect、viewport／composer高度、`--nx-bubble-position`和computed fill，再做一次外部操作后读回。若首图属测量尚未稳定，注明其时序即可，不先要求改renderer；若稳定条件相同仍变化，再作为具体新问题处理。 |
| 图片后加载／尺寸变化时采样同步的可视结果 | final截图和滚动记录已有图文，但没有展示同一张图片在输入后方从未加载／旧尺寸变为已加载／新尺寸的前后可视过程。父线程转述的相关行为测试通过是独立证据，本审不把它冒称视觉实景。 | 一组图片位于输入后方、完成加载或尺寸变化的前后画面，加源／副本尺寸或采样读回；只需确认模糊内容同步、无旧图残影，不需重做SKU／全站图片矩阵。 |

Noether与Averroes的独立行为／源码结论由各自报告负责；上述视觉边界不改写其测试结果。本轮不再把320／390、双主题、多行末尾、5237原会话native结果、返回清理或透明偏好列为“尚无证据”。

### 外部边界：不阻止上述本地范围收尾

- **物理手机／系统环境**：未安装到Android或iOS设备；系统键盘、实际安全区、真机WebView／GPU与声效扬声器听感未验。桌面native鼠标和APP原生编译不能替代这些边界。
- **真实服务**：当前为本地模拟会话；真实鉴权、WS连接、服务端送达／已读及失败恢复等不由本轮截图证明。此前AudioContext running只保留浏览器运行／调度范围，不扩写成实际音频输出。

这些是发布／外部环境边界，不作为无限挂起当前APP本地材质、排版和操作后结果签核的条件。旧c01／24／28及singlepaint诊断失败原样保留，结论只是新C2xTeVme样本在已审范围未再出现同类硬界，绝非声称历史失败不存在或全站、全时段全部通过。

本轮只更新本报告；未操作浏览器、桌面鼠标、CDP或Git，未改生产源码、测试、截图，未运行构建／测试。

## C2xTeVme header历史加载区叠字P2（2026-10-27增量）

收到父线程定位后，本审重新用view_image original直接目检[dark390-overlap](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-sampled-final-dark390-overlap.png)和[light390-overlap](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-sampled-final-light390-overlap.png)。两图均能看到顶部“Tải tin nhắn cũ hơn”与滚动经过的“Hôm qua 00:07”占据同一狭窄区域，文字互相挤叠；浅色尤其明确。这是实际header可读性问题，不是输入框矩形断面，也不是已授权的composer背后滚动本身。

**该子项独立评8.6／10，P2，未达到9分验收门槛。** 已签的composer材质、小屏输入、多行、原会话和透明偏好分不变；不以这些通过项代签全部header。此处仍需本地修复，不能把它仅归入真机／真实服务外部边界。

源码定位与机制：

- [chat.vue:69](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:69)的人类“加载更早”控件仍在[cp-top-overlay](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:24)内；其容器[absolute／z-index4／透明背景](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:1765)固定在页面顶部。[cp-history-text-action](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:1870)本身也是透明背景，min-height44px，文字前景没有局部遮挡背景内容的材质。
- [ConversationThread内容](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/support/conversation-thread.vue:18)只用paddingTop接收topInset，日期分隔在消息滚动流内。测量topOverlay实际高度解决起始留位，**不构成滚动过程中固定控件区域的裁切**；日期仍可在任意后续scroll位置经过加载文字下面。单加起始padding、提高z-index、减小日期字号或继续猜固定高度，都不能可靠解决这次碰撞。
- Nova“加载更早”[同结构分支](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/support/chat.vue:62)有相同源码风险，但本次两张失败图是人类会话，不写成Nova已实景复现，也不撤销其其他独立签项。共享class不代表其他页面所有文字重试均有同一缺陷。

最小修法建议：只把历史加载及对应loading／错误重试反馈移入消息scroll content的正常流，在首个日期之前保留独立44px控件行；保持文字居中、无背景的既定要求和现有click／Enter／Space／busy语义。顶部返回与身份玻璃继续保留原浮层，topInset仅量实际仍固定的部分。补页时继续按真实消息锚点保留阅读位置，不通过隐藏日期或全宽实色顶板掩盖叠字。本审没有修改实现。

最小复验只覆盖这项：390明暗停在本次日期穿越位置各一图；320越文一张确认长文案／日期不叠字、44px触区仍在；同一会话实际加载一页或重试一次，确认反馈不覆盖日期且补页锚点不跳。若共用Nova分支也随布局调整，仅按同一结构核对，不展开全站矩阵。composer无需因此重跑整套。

本地清单更新：首位新增这一确定P2；前节浅320色序观察与图片后加载视觉补证仍是两个独立、尚非确定P2的取证点。此前“无需要判材质／小屏输入／多行到9以下的确定缺陷”保留其限定含义，不扩写成header全部通过。仅追加／更新本报告，未改生产源码、未操作浏览器／Git或执行测试。

## C2xTeVme两项最小补证复核（2026-10-27增量）

本轮仅用view_image original目检新增四张截图，并只读核对两份runtime；两组构建均明确为5240的`index-C2xTeVme.js`。不重跑旧矩阵，不将当前证据改标成Jason尚在修复header／counter的新包。

### 浅320稳定状态取色

直接目检[color320-before](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-sampled-color320-before.png)和[color320-after](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-sampled-color320-after.png)：同位置发送气泡均呈蓝色，输入顶部映光及六行输入区外观一致，未见本次操作后整泡变紫或新增矩形硬界。画面可见第一至第六行，这组不是新增“末尾光标已见”的证据，也无需替代此前caret样本。

[color320 runtime](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-sampled-color320-runtime.json)记录native手机外drag `(1860,430)→(1935,1035)`。本审对解析后的before／after字段逐项比对，bubbles、build、field、scroll、theme、viewport、width均完全相同，时间字段不参与比较。消息均为`nx-conv-message-35-31`，position为89.0%，fill为`rgba(25, 66, 215, 0.9)`；气泡top404.469666／高75.217796，field高175.208328，实际列表scrollTop1830.302979均未变。

**结论：这次稳定条件下的操作前后未复现色相变化，满足此前要求的最小本地补证。** native操作路径依据记录及父线程说明，不冒称本审执行，也不把两张结果图写成连续录像。旧`light320-multiline`双图的可见差异仍保留：不能用新结果倒推其测量时序、将旧图重新标为稳定态，或猜测差异根因。

### 图片受控尺寸变化与采样同步

直接目检[image-before](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-sampled-image-before.png)和[image-resized](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-sampled-image-resized.png)：输入后方图片缩小，左缘露出的产品及其下方“Xem ảnh”位置随之变化；输入内仍为柔和模糊内容，所见未出现明显旧尺寸图像残影或新的硬分割。该场景是已授权的历史内容经过输入背后，不把历史图片尚在输入下方判为tail遮挡。

[image-resize runtime](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-sampled-image-resize-runtime.json)明确为QA受控修改source `uni-image`的width，由约186改为110px，再由uni-image尺寸机制更新height。成功resized记录中source、clone元素及内部IMG宽高均为109.999992px，top均为510.085205px；本审计算源／副本top差0，left仅差约0.04735px，不能写成整个rect逐字段完全相同。field的rect和style前后相同。该读回与截图共同支持这一次源图片尺寸变化已同步到采样副本。

首次仅改height的`ineffectiveHeightAttempt`中，源／副本高度仍约185.9943px且style回到186px，**明确不计为成功验证**。有效证据来自后续width驱动的尺寸链路。本轮不宣称触发或验证了真实网络加载、冷缓存、图片解码时序，也不据此改写load事件的测试覆盖。父线程说明QA改动已还原；此JSON没有还原快照，本审不冒称独立读回过还原状态，不因此扩展新的矩阵。

**结论：此前最小清单中的“尺寸变化前后画面＋源／副本尺寸读回”已补足，可关闭这一受控尺寸同步的视觉取证缺口。** 真实网络加载保留为未覆盖路径，不将其升级成当前已签材质范围的必过条件。

本轮没有发现这两组证据中的新确定P2，不新增或上调总分；浅色材质9.1及其余已签限定分维持。header历史加载叠字仍为8.6未通过，counter叠字按父线程新通知等待新包独立复审；本轮不因两个补证满足而关闭header／counter。旧失败、旧色相观察及历史评分全部保留。仅更新本报告，未操作浏览器／桌面／Git，未修改生产、测试、截图，未运行构建或测试。

## 3jJgdd29 header／counter局部复评（2026-10-27）

仅目检本次五张代表帧，并读取[r18-closure-layout-runtime.json](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-closure-layout-runtime.json)：构建`index-3jJgdd29.js`，记录sourceHash为`5f78d1cc47445f6a4d41ba5f439e5340d6af11a710e355249a7f0840e1acbf3e`。不重跑旧矩阵，不重评sampled材质。

| 局部项目 | 分数／结论 | 所见与读回 |
|---|---|---|
| 历史加载入口与日期叠字 | **9.2／10，通过** | [浅320](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-closure-light320-history.png)、[浅390](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-closure-light390-history.png)、[暗390](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-closure-dark390-history.png)均可清楚区分加载文字和日期，无旧叠字。buttonInFlow=true、背景透明、高43.9962px，按钮与日期框间距约10px。native分页读回8→16条，原锚点`nx-conv-message-34-34`的top仅变0.07576px；加载入口随滚动离开，而非继续固定压住日期。 |
| counter超限提示覆盖历史消息 | **9.1／10，通过** | [浅320](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-closure-light320-overlimit.png)、[暗390](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-closure-dark390-overlimit.png)中的计数／越文提示完整容纳在输入区域内，不压住上方历史文字，不与发送圆叠字。320提示分两行，2001→2000读回field高215.2083→195.2083、hint高40→20、gap均7.9356px，禁发true→false；暗390提示一行，高20px，gap8.2102px。恢复到2000只按读回确认，不冒称有第六张恢复截图。 |

这两项原叠字P2在所列范围可关闭；无新增局部视觉P2。仅签历史入口／日期及counter，不借五帧代签policy retry全部状态、全部header或整体tail。**明确保留独立未完：light320Reentry的scrollTop=0，视口高681、内容高1131，末条bottom1049.8958，已在视口外；初始约8px留位不能证明清稿后的真实重入正确。** 该项由父线程／Jason继续修，本轮不扩大矩阵。只更新本报告，未操作浏览器、Git、生产文件或测试。

## PR5b0C9J清稿重入tail局部复评（2026-10-27）

**9.2／10，受理，通过本次浅320越文清稿重入路径的末条可见性验收。** 仅用view_image original目检[重入native桌面结果图](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/app-r18-tail-final-light320-reentry.png)，末条蓝色气泡正文、时间及状态完整可见，位于空输入框上方，有清楚间隔，未见底部裁切。

[r18-final-tail-runtime.json](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/docs/audit/2026-10-26-message-theme/r18-final-tail-runtime.json)记录构建`index-PR5b0C9J.js`、sourceHash `4c339e53ce0999d74e98575bd5ea63a07c94093a7f1b0da352d4cdc301458b2c`，路径为2001→2000→clear→返回列表→reopen→再次返回／reopen，无发送。afterBackflow与secondReentry均为scrollTop450.303009、末条bottom599.592735、field.top607.528381；差值为**7.935646px**，8条消息一致。旧0.3秒结束后采集这一时序来自父线程说明；JSON是终态读回，不写成逐帧录像。新截图及两次终态共同支持该回归在当前路径已关闭，旧scroll0失败记录保留。

Header9.2、counter9.1及sampled原签继承；180ms消息／200ms发送动效本轮未重新测量，也不因程序scroll修正推定其已重测。public-phone文件按浏览器phoneclip分类，未作为native证据。无新矩阵；仅更新本报告，未操作浏览器、Git、生产文件或测试。
