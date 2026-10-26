# 团队卡片与分享弹窗真机接续验收

本轮接续最新 TEST 未覆盖项，优先地图及弹窗手势安全区。地图独立结果见[地图接续验收](2026-10-26-globe-native-acceptance.md)。执行中发现远端新增团队紧凑卡片3f2c462d，保留性整合后补验当前 Android 标准基座，不以旧原型截图代替真机。

## 已完成的真实操作

- T01：2601现有登录态进入团队Tab，查看紧凑邀请卡及等高双卡。304e7基线发现V0落在六边形下方、覆盖权益说明，登记#655；d12674c9局部修复后等级居中、说明独立。实际点击等级卡进入V级头衔并返回。
- T02：邀请好友打开渠道面板，向下滚动到末尾X、奖励规则与取消入口，点击取消回到原团队位置。内容长时面板内部滚动，底部留出系统手势空间；本轮未发送消息、复制或调用外部分享。
- T03/T05：海报实际生成包含当前邀请码的二维码图片；滚动到保存图片、复制链接及Messenger末行，均可达且位于手势条上方。未保存到相册、未发送。无关收益轮询导致海报清空重生成的问题#656已修复，候选观察87.193秒，最终eeae6348资源另观察77.713秒，预览和按钮保持可用；昵称依赖增量资源另做首次生成及关闭用户名重绘，成功去除昵称。周期回执与各资源分开记录，不混用指纹。
- 邀请规则与奖励记录弹窗实际打开、互相跳转并关闭。规则页当前提示结算条件不可用，记录页真实返回累计0.00 UVT、已结算0、待结算0及空记录；本轮仅签展示、滚动和关闭，不签奖励结算或规则配置完整。
- T04：Jenkins #295 SUCCESS后通过TEST受控broker发布，回执源码eeae6348；真实网页整页重载，再实际点击团队Tab。390×844中文深色中两卡均173×176.67px，V2居中于68×78px徽章内，权益说明独立。海报真实ready、保存/链接启用；面板内滚到362px，Messenger下沿802.45px，位于844px视口内；关闭返回团队页并恢复原浏览器视口。仅操作TEST页面，不启动本地服务。

## 缺陷与证据

| 缺陷 | 结果与限定 |
|---|---|
| #655 原生等级徽章重叠 | d12674c9修复。原生SVG被转换为组件后，原直接子SVG定位失效；新增局部绝对定位图形容器，不改数据或全局SVG组件。独立审查对照前后图、源码与实际入口回执，通过后resolve/close，GET确认closed/fixed及验收标记。 |
| #656 无关轮询重绘品牌海报 | 精准订阅模板相关依赖，brand/gift不被无关home/fleet轮询清空，同链接配置复核不重绘；yield仍依赖权威状态及数值，账户/链接旧回调围栏保留，显示昵称时订阅真实昵称。先红后绿及独立43项通过；最终原生77.713秒周期稳定、开关正常重绘，独立逐图/时间/代码复核通过后关闭，GET确认closed/fixed及标记。旧现场不是永久卡死；不宣称证实离屏canvas根因。 |
| #657 原生生效日期英文串 | 中文实际显示Thu Oct 22 2026，复用现有本地日历formatter，保留原解析/无效日期隐藏。双端三语6项先红后绿，最终原生正确显示2026/10/22，独立复签后关闭，GET确认closed/fixed及标记。 |

原生资源d12674c9对应app-service SHA256：`555e4c77e29d7fb67c9041373c2259b96f9b12c826b6b7e77e744bb5a1a707fb`。

最终源码eeae6348a27528751da7666c2ea58c9a898d2633，原生app-service SHA256：`ebf8696a3a249c8f5ff2a5d5736da349ba398908a48986277e541d2b52f45c03`。补入日期前的10fcd候选周期及昵称增量B76资源仅为各自步骤证据；最终77.713秒回执另记，不把候选时间代签最终资源。

证据：

- [徽章修复前](team-native-20261026/team-native-cards.png)、[修复后](team-native-20261026/team-native-cards-fixed.png)、[等级页实际跳转](team-native-20261026/team-rank-navigation-native.png)、[#655关闭回执](team-native-20261026/team-655-closure.json)
- [邀请面板滚到末尾](team-native-20261026/team-invite-scrolled-native.png)
- [海报实际生成](team-native-20261026/team-poster-generated-native.png)、[重新生成现场](team-native-20261026/team-poster-regenerating-native.png)、[底部动作及渠道](team-native-20261026/team-poster-bottom-native.png)
- [规则弹窗](team-native-20261026/team-rules-native.png)、[奖励记录弹窗](team-native-20261026/team-rewards-native.png)
- [修复海报初始就绪](team-native-20261026/team-poster-fixed-start-native.png)、[超过一分钟后](team-native-20261026/team-poster-fixed-period-native.png)、[精确周期回执](team-native-20261026/poster-native-period.json)
- [最终日期与海报](team-native-20261026/team-poster-release-native.png)、[最终资源超过一分钟后](team-native-20261026/team-poster-release-period-native.png)、[最终周期回执](team-native-20261026/poster-native-release-period.json)、[隐藏昵称后重绘](team-native-20261026/team-poster-username-off-native.png)、[#656/#657关闭回执](team-native-20261026/team-656-657-closure.json)
- [TEST发布回执](team-native-20261026/team-deployment.json)、[网页双卡](team-native-20261026/team-h5-release.jpg)、[双卡布局与脚本入口](team-native-20261026/team-h5-runtime.json)、[网页海报](team-native-20261026/team-poster-h5-release.jpg)、[海报末尾渠道](team-native-20261026/team-poster-h5-bottom.jpg)、[海报状态与滚动](team-native-20261026/team-poster-h5-runtime.json)

日期口径未改：后台公开规则生效瞬间为2026-10-22T15:56:08.309253884Z；本机浏览器日本时区显示10/23，真机Asia/Shanghai显示10/22，均按原本地日历字段呈现，只修复英文星期串。[时区与公开配置读回](team-native-20261026/date-zone-readback.json)保留核对结果，不把两张日期不同的图解释为同一日历日。

## 验证边界

本轮原生为当前Samsung Android、中文深色、竖屏标准基座。未代签iOS、APK/IPA安装、全部三语/主题/尺寸、相册保存和真实平台分享；未生成邀请关系、订单或奖励。邀请码入口实际是复制操作，不存在独立二维码弹窗，本轮未把它记录成已验弹窗。

徽章变更的原生SVG脚本1项、行为10项、类型、双端生产构建及原生资源编译通过；独立复核额外38项通过。海报最终回归与日期helper共51项通过、类型通过。精确修正原生图标计数旧断言6→8，保留大插画排除及H5不转换断言。与本次无关的地图和资金业务不重复测试。

APP/H5共享内容2795文件强校验及远端最新pin核对通过（最终证据文档加入前的代码候选计数）。三个团队缺陷655–657均经实际复验、独立复核、resolve/close后GET确认closed/fixed。最终文档提交与运行源码eeae6348分开，文档补证不重新部署相同代码。正式目录原4文件WIP和.hbuilderx完整保留；不合并main。
