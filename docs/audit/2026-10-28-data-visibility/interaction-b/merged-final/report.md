# 合并最终增量实景复验 · Interaction B

结论：本次限定 smoke 六项均达到9分，未发现新增P2。仅签下列本地模拟界面及实际操作，不代表全站、正式后端或物理APP通过。旧报告及历史失败保留，不以本报告重写旧矩阵。

## 冻结构建与方法

- QA：仅本人新建 Chrome 标签1733373187，经官方CUA操作 http://127.0.0.1:5294/preview。未操作5237或A5291。
- 实际加载入口：**index-CFxCm3fm.js**；主CSS：**index-H57LADHv.css**。开始、结束读回一致。
- HTML SHA256：**723EE370587FE219A3C5D3B2A010A5851362AB12EA0ACC851646F883C3E80B5D**，前后文件复核一致。
- JS SHA256：82CCA558C8D8AF2FB366F79240CABEAAC0FE83C3B05D404FA865056A079EDEF7。
- 代表：390×844中文暗色、320×693越文浅色。真实底栏点击、Click/Enter/Space、原页面刷新、原生浏览器滚动和透明边缘指针命中；只读CDP观察DOM、ARIA及实际动画。未改产品、构建或业务数据。
- 原始读回：[runtime.json](runtime.json)。先前完整矩阵及N/T继续见[原报告](../report.md)。

## 逐项评分

| 项目 | 分数/10 | 本次独立实景证据及边界 |
|---|---:|---|
| 四入口隐私同步、返回及刷新持久 | **9.2** | 390ZH暗先真实访问Home/Earn/Team/Me建立缓存，从Home隐藏后逐页仍pressed=true。320VI浅亦同步；Me按Space显示，Team按Enter隐藏，均未改变所在业务路由。刷新仍隐藏。外层preview整页刷新会把尺寸重置390，原始记录实际width390，未冒称320尺寸刷新。 |
| warm/passive与遮罩共存 | **9.1** | warm返回时Home金额/结算数及个人rank、Earn设备收益、Team金额/人数/等级、Me余额及四项收益保持••••；Me隐藏ARIA不含余额数字。回到显示状态后恢复原读数。Team/Me/Earn切换的只读MutationObserver分别2/9/8个快照，所列个人字段数字泄漏样本0。属于这些短观察窗口，不能证明任意请求竞态或物理屏幕连续无闪。 |
| 火箭循环与减少动态 | **9.2** | 390暗settled窗口实际捕获hop/flame/exhaust共5条iteration；currentTime41371.393→43467.923ms。三组1.6/.72/.9s infinite；reduce=true时实际火箭动画0、transform none、exhaust opacity0。恢复false。 |
| 原详情入口与44关闭 | **9.2** | 390ZH暗Click及reduce下Enter仍打开原说明；320VI浅Space同样打开。两种读回关闭根44×44、视觉面30×30。390在根左缘内1.5px、视觉面外5.5px实点，trusted click明确命中“关闭”按钮，弹层移除、仍Earn且焦点回火箭。320亦实际关闭。继承C5历史完整边缘矩阵，本次未重跑八点。 |
| 磨砂空槽添加原流程 | **9.1** | 320VI浅原Add根260×60、blur12px、半透明背景；实际点击到/pages/store/store。当前无未激活库存，直接进商城符合原流程；未制造库存或尝试激活。 |
| 商城自动错峰扫光 | **9.2** | 320VI浅滚动落定后前4张in-view/running、后2张offscreen/paused。6.8s，delay .6/1.7/2.8/3.9s；1100ms观察实际推进约1106.416ms，离屏两张time保持0。reduce后实际扫光动画0、伪层display none，随后恢复。完整循环错峰事件沿用原独立矩阵，本次仅合并定向smoke。 |

## 代表帧

- [390ZH暗·隐藏首页](390-zh-dark-home-hidden.png)、[刷新后仍隐藏](390-zh-dark-hidden-after-reload.png)
- [320VI浅·隐藏首页](320-vi-light-home-hidden.png)、[钱包及ARIA对应隐藏态](320-vi-light-wallet-hidden.png)
- [390ZH暗·原说明](390-zh-dark-capacity-sheet.png)、[320VI浅·原说明及关闭](320-vi-light-capacity-sheet.png)
- [320VI浅·商城可见商品](320-vi-light-store-sheen.png)

## 保留的N/T与证据限制

- 不同周期任务数的差异值：现fixture四周期同为10；本次未造数。未激活库存选择/激活分支N/T。
- 四页全部失败、长额、零额及缓存请求任意交错组合未重跑；本次正常模拟数据的warm返回和隐藏状态不能替代这些分支。
- 前几个RAF窗口仅0/1帧，不作为连续抗闪证明；另用上述MutationObserver记录已发生的DOM更新。它也不等于设备视频或GPU帧率。
- 初次火箭短窗口未捕获事件；只采用后续settled实际iteration证据。滚动后首个商城读回早于落定，采用后续in-view及时间推进读回，不把瞬时paused误报为运行。
- 真实后端、真实资金、物理手机APP安装、跨设备隐私同步、系统级减少动态、任意后台/切前台竞态不在本次签项范围。5294只读代理业务写405不计产品缺陷；本次未发起业务写入。

## 清理与冻结

已恢复开始时的显示个人数据(hidden=false)、VI浅色、390尺寸和首页；prefers-reduced-motion=false；5294 proxy off已命令读回。观察监听均限时解除，无DOM/style/store注入。本人新增标签已关闭，QA服务未重启或停止。其它用户页面与状态未操作。报告及本目录证据冻结，可进行父线程后续合并流程。
