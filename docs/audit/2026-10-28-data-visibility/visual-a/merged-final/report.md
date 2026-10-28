# 合并影响定向实景复验 · Visual A

2026-10-28。**本次已测范围均达到9分，未发现合并新增阻塞。** 仅复验5291上的合并影响，不重跑旧完整矩阵，也不把本次局部结果扩展成全站或原生签核。

## 同一构建与取证归属

- 实际入口：`index-CFxCm3fm.js` / `index-H57LADHv.css`。
- 发布HTML SHA256：`723EE370587FE219A3C5D3B2A010A5851362AB12EA0ACC851646F883C3E80B5D`。本人用发布根文件哈希核对，并从每条页面DOM读回实际入口。
- 父线程提供的远端基线为 `78c1cb3d`；本人未重新执行Git整合、构建、测试或修改源码／测试fixture。
- 本人使用官方CUA操作自己的Chrome标签，**只使用5291**；没有使用B的5294证据，也未触碰用户5237。
- A重点为 **320×693 越语暗色、390×844 中文浅色**。共29条DOM记录、17张截图；截图已实际目检。所有记录入口相同，已测页面未出现 `scrollWidth > viewport.width`，四处眼睛实际均44×44px。

见[构建指纹](build-a.json)、[运行记录](runtime-a.json)、[量测摘要](summary-a.json)、[截图索引](evidence-index.md)。旧报告、低分历史及其原包证据保持不变。

## 分项评分

| 项目 | 分数 / 10 | 本次实际覆盖 |
|---|---:|---|
| 四入口隐私与共享、回来／刷新保持 | **9.2** | 四页眼睛均实际操作；底导航往返、真实刷新、隐藏与恢复；两组布局。 |
| warm缓存往返与遮罩不漏值 | **9.2** | 四页先显示加载基线，再隐藏进入已有缓存页；正常读取样本下的DOM变化和定时观察，没有发现所监测金额／排名回露。 |
| 火箭连续动作与减少动态 | **9.2** | 合并包实际运动样本、循环事件、reduce静止及恢复；44px入口／22px SVG保持。 |
| 原详情弹层及44px关闭 | **9.2** | 两组实际打开原说明，根44×44、视觉面30×30；透明边缘实际点击关闭并返回赚取页。 |
| 磨砂虚线空槽、添加入口和返回 | **9.2** | 两宽外观；实际点“添加设备”进入商城，再通过底导航返回赚取；不包含真实设备绑定／购买。 |
| 商城自动错峰扫光 | **9.3** | 两组可见网格；390浅色实际无hover连续观察，6.8秒循环与四个错峰延迟仍有效。 |
| passive读取失败／超时／离线时的缓存保留 | **N/T** | 本次没有额外注入这些故障；正常warm样本不能代签故障路径。 |
| App原生／物理设备／正式登录与服务 | **N/T** | 本次仅本地浏览器演示原型。 |

各项独立评分，不用平均分覆盖N/T。旧未覆盖业务状态、完整错误矩阵、跨账号／跨设备、系统字体放大、读屏、硬件返回键与真实购买／绑定仍保持原边界。

## 隐私、warm与布局

先通过实际底导航依次加载首页、赚取、团队、我的钱包的显示基线。再由首页眼睛隐藏，经过已有缓存的赚取→团队→钱包→首页；实际截图分别为 [320首页](320-vi-dark-home-hidden.png)、[赚取](320-vi-dark-earn-warm-hidden.png)、[团队](320-vi-dark-team-warm-hidden.png)、[钱包](320-vi-dark-wallet-warm-hidden.png)。四页均 `aria-pressed=true`，金额／数量呈遮罩，首页个人排名无 `#184` 回露；首页任务环只剩一个底轨circle，没有数值弧 `stroke-dasharray`。

[warm隐藏观察](warm-hidden-observation-a.json)记录56.802秒、142次DOM采样（72次mutation、70次rAF），覆盖四条路由。监测值来自先前实际显示的演示金额／排名，包括16.24、52,800.64、1,280.00、163.84、266.24、#184及设备／团队金额；未发现这些值回露，也没有观察到眼睛重新变为false。该观察不等同逐显示帧或全部统计字段证明，亦未向页面store/storage写入数据。

随后实际刷新浏览器；预览外壳默认恢复390宽，但隐私仍为隐藏。只通过预览尺寸控件恢复320后，[刷新截图](320-vi-dark-refresh-hidden.png)仍隐藏。没有通过重新点击眼睛制造持久化结果。

另外实际操作赚取眼睛恢复→钱包继承显示→钱包眼睛隐藏→团队继承隐藏→团队眼睛恢复→首页继承显示。记录中的 `earn-eye-restores-values`、`wallet-inherits-earn-visible`、`wallet-eye-hides-values`、`team-inherits-wallet-hidden`、`team-eye-restores-values`、`home-inherits-team-visible` 保存这条真实操作链。

390中文浅色补点：[首页](390-zh-light-home-hidden.png)、[赚取](390-zh-light-earn-hidden.png)、[团队](390-zh-light-team-hidden.png)、[钱包隐藏](390-zh-light-wallet-hidden.png)与[钱包恢复](390-zh-light-wallet-restored.png)。眼睛、队列标题与下方任务数、右侧团队明细均未拥挤或横溢；钱包恢复为原来的52,800.64 USDT／1,280.00 UVT。公开商品价格、日期、活动定额和兑换单价保留。本次没有重复展开旧全套详情／图表状态。

## 火箭、reduce与原详情

[有效运动取样](rocket-normal-corrected-a.json)采用同一iframe时钟，4.112秒取得29组真实样式样本。火箭transform、尾焰scale／opacity及喷射transform／opacity随时间变化；computed duration为1.6s／0.72s／0.9s。实际 `animationiteration` 的火箭elapsedTime 59.2→60.8→62.4；尾焰／喷射也有连续迭代。浏览器部分事件批次合并，不把wall回调间距冒称为精确帧率。29组中外围热区始终44×44px、SVG始终22×22px。

[减少动态](rocket-reduced-a.json)连续观察2.021秒，三部件animation-name和transform均为none，喷射opacity=0，事件为空；随后恢复正常媒体。首次观察的[旧采样记录](rocket-normal-a.json)混用了外层与iframe时间原点，产生0个样式样本，**不用于运动幅度证明**；其原始记录保留，已用上述同一时钟记录修正取证方法，没有改产品。

实际打开说明：[320越语暗色](320-vi-dark-explainer.png)、[390中文浅色](390-zh-light-explainer.png)。关闭控件根均44×44px、`flex:0 0 auto`，内部视觉面30×30px。分别点击左边缘(260,238.74)和右边缘(370,523.43)，均处在视觉面之外而在根内；实际指针按下／抬起后dialog从1变0，原赚取路由保持。见[320边缘命中](explainer-close-edge-320-a.json)、[390边缘命中](explainer-close-edge-a.json)。

## 空槽与商城

空槽实测60px高、32px“+”底座、12px背景模糊与虚线边框：[320布局数据](empty-slot-layout-320-a.json)、[390布局数据](empty-slot-layout-a.json)、[320暗色返回图](320-vi-dark-empty-slot-return.png)。390实际点“添加设备”进入 `/pages/store/store`，[实际到达图](empty-slot-opens-store-390-zh-light.png)记录完整商品入口；随后通过真实底导航回赚取，槽位仍在，没有新增设备或触发交易。

[商城连续观察](store-sheen-a.json)14.2秒，96组四卡样本全部hover=false。四卡delay为0.6／1.7／2.8／3.9秒；真实迭代elapsedTime如第一卡61.2→68、第三卡20.4→27.2，差均6.8秒。各卡opacity峰值约0.7445～0.8274，证明离开指针后仍自动变化。wall事件交付存在批次延迟，因此只据elapsedTime、实际样式变化及图像确认循环，不推导GPU性能。

[390浅色商品网格](390-zh-light-store-sheen.png)、[320越语暗色稳定网格](320-vi-dark-store-sheen-settled.png)均已目检，标题、价格、说明无横向挤出。早先[320接近网格的过程图](320-vi-dark-store-sheen.png)商品大部分仍在折叠线下，只保留导航过程记录，**不作为商品扫光视觉依据**。首次390首页截图命令超时，重读稳定DOM后重新捕获；工具超时不记为产品失败。

## 收尾

[清理记录](cleanup-a.json)：恢复初始中文／390／暗色／首页、隐私显示（aria-pressed=false）、媒体reduce=false。观察器、临时记录属性、计时器及事件监听已清除，本人标签关闭；5291代理off，预览服务保留，5237与5294未触碰。没有改产品源码、构建、跑测试或提交。

**结论仅针对本指纹的上述定向smoke：无需新增修复；已验项9.2～9.3，N/T单独保留。**
