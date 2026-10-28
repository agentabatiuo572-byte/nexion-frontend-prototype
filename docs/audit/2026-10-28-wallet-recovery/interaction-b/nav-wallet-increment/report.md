# 导航纯图标与钱包层级：独立增量审查 B

**READY，以下已实测限定项均≥9，无未修P2；不代表全站、真实后端或物理APP通过。** 旧字体报告已完成；developer-loading仍N/T，见末尾。

## 运行版本与继承

| 证据包 | 实际入口 / 主CSS | 绑定范围 |
| --- | --- | --- |
| 原导航包 | index-B_6NMEBX.js / index-H57LADHv.css | 五宽导航、点击/动画/reduce、小屏钱包明暗、长额/零值/冷失败未知、UVT入口 |
| 最终550包 | **index-DQPnbcrO.js / index-H57LADHv.css** | 375/390/430正常余额双主题、320仍500、390长额明暗；结束时重新加载仍为此入口 |

- 终包HTML SHA256 **A0E8A98F80207ED78C1209AA0D2D12118C7D156C25AFD1DA2BC28C7E63CB6073**；固定web-wallet-weight与5293实际服务web目录index相同。终包JS SHA256 **A9538D76E32D5F8B50EE8396628FAC2023E8B3AF5DA859B345ABC7FE1CB9690D**。
- 原包HTML 08A91A4F…35CA175，JS C991310B…E1DD986；完整值见[runtime-nav-base.json](./runtime-nav-base.json)。终包详见[runtime-final-weight.json](./runtime-final-weight.json)。
- 主CSS相同不足以证明未变：实际读取old me-CRcXWIqs.css与final me-l-IteFiy.css。将**仅钱包Vue scope/keyframe哈希**66f55062/6eb5586e归一后，新CSS恰比旧CSS多≥375的font-weight550一条，删除该规则后文本完全相等。app-chassis-C3XxXU7l.css两包字节哈希相等。原导航/小屏/零未知证据因此有界继承，**没有改称终包逐项重测**。
- 官方CUA Chrome4，本人5294→5293；不动5237/A5291。不改产品、不构建、不执行测试、不提交；HEAD312b10fb…＋父线程WIP不当成独立发布commit。源码指纹已另存。

## 逐项评分（不平均）

| 项目 | 分数/10 | 实景与行为结论 |
| --- | --- | --- |
| 五宽纯图标布局 | **9.2** | 320/360/375/390/430各五项innerText为空；主体均56px，稳定图标约23.98px。触区均46px高，宽约55.59/63.59/66.67/69.59/77.59px，全部≥44。横溢0，未压扁图形。 |
| aria与正常导航 | **9.2** | 中/越/英代表均有完整5个aria名；选中项aria-current=page。实际点击Home、Earn、Me、Store、Team均到对应页且选中更新；Home使用既有#/根路由，其余实际/pages路径。未以文本消失牺牲可访问名称。 |
| LiquidGlass与底部区域 | **9.1** | 两主题实际目检仍有透明折射、内缘与选中玻璃层；运行strategy=svg、specular blob/rim存在，且没有只凭DOM给分。五档nav下缘距视口底均22px，既有indicator区域保留；这是本地CSS几何，不是真机safe-area实测。滚动正文可透过玻璃，未把穿透正文误记为导航label。 |
| 正常选中回弹 | **9.2** | 原点击Me→Store实际animationstart/end：nx-tab-select-d84abd90、duration0.26s、end.elapsed0.26、cubic-bezier(.2,.8,.2,1)。实际页面完成切换。 |
| 减少动态 | **9.2** | 本标签官方媒体模拟readback=true后实际Store→Team，1.4s观测窗内无nx-tab-select事件，导航仍生效；还原后matchMedia=false。未代签系统设置/原生触摸。 |
| 钱包小屏500 | **9.2** | 320/360越文两主题原包正常余额weight500，36px；终包320再次确认仍500。500小屏证据不因标准屏新550重跑或重标版本。 |
| 钱包标准550 | **9.1** | 终包375/390/430均实际两主题完整正常余额52,800.64，font-weight550、36px，无断数/溢出；375边界命中550，320仍500。实际字形层次比前500更突出，币种/小数仍连续。 |
| 图标与层级 | **9.2** | 钱包紫glyph24×24，UVT圆标20×20、内glyph16×16；各代表主题读回一致，图标未再抢金额层级。 |
| 小数颜色及精度 | **9.2** | 正常.64、长额.12、零值.00完整；浅rgb106,110,119、暗rgb155,163,181，实际等于相应ink3。分色不改变全额aria。未知为—，fraction节点0，不显示残留.64/.undefined或伪零。 |
| 20/12间距与UVT入口 | **9.2** | compact total margin上下20px；UVT根44px高，后方折算details padding-top12px。实际UVT整行Enter→/pages/me/wallet-nex，无购买/兑换。 |
| 少量长额／零／未知回归 | **9.2，限定** | 原包320长额23.5294px500；终包390长额30.3922px550，明暗两图完整1,234,567,890.12，Range各片段同y、横溢0。原包320真实0.00与冷GET503未知—区别正确；未知稳定错误提示及503资源记录留证。终包只550媒体规则，未重跑六来源错误矩阵，也未伪称零/未知为DQP重新实测。 |

## 五宽及钱包代表图

| 宽度 | 导航 / 钱包证据 |
| --- | --- |
| 320×693 | [原包浅](./normal-320-vi-light.png) / [原包暗](./normal-320-vi-dark.png)；[长额500](./long-320-vi-light.png) / [零值](./zero-320-vi-dark.png) / [冷未知](./unknown-cold-320-vi-dark.png) |
| 360×780 | [原包浅](./normal-360-vi-light.png) / [原包暗](./normal-360-vi-dark.png) |
| 375×812 | [原包导航](./nav-375-en-dark-direct.png)；终包[550暗](./weight550-normal-375-en-dark.png) / [550浅](./weight550-normal-375-en-light.png) |
| 390×844 | 终包[550中文暗](./weight550-normal-390-zh-dark.png) / [550中文浅](./weight550-normal-390-zh-light.png)；[长额暗](./weight550-long-390-vi-dark.png) / [长额浅](./weight550-long-390-vi-light.png) |
| 430×932 | [原包导航](./nav-430-en-dark.png)；终包[550英文暗](./weight550-normal-430-en-dark.png) / [550英文浅](./weight550-normal-430-en-light.png) |

## 取证限制与纠正

- 375不在preview尺寸菜单：本人另开同源裸页nx_device=off，用官方CDP仅对该标签设置375×812，实读innerWidth375；两次375临时标签已clearDeviceMetricsOverride并关闭。未改iframe/style/store或全局浏览器尺寸。
- 原始严格动画名筛选遗漏Vue scoped后缀，三个空事件样本已明确排除，不能用来声称无动画。改为前缀观测后取得上述真实260ms及reduce结果。临时DOM事件listener只观测并按时移除，无持久global日志/业务状态改写；raw CDP Animation.enable不支持未绕过其他工具。
- 明暗切换中短暂缺nav的读取失败未入分。长额一张原计划light名称，实际DOM/image是dark，已在封档前改名dark并保留说明，另实拍真正light；不凭文件计划名判主题。
- 375浅色字号读回发生在原生向上滚动尚未结束时，所以y为负；后续照片已见完整钱包，只用稳定font/weight/尺寸，不谎称读回与照片同帧y。
- 零/未知、旧source恢复已按版本保留；正式资金/Java、新业务、H5部署、物理安装/真机、系统无障碍环境不在本地本轮签核内。父线程编译/测试绿不当成本人执行测试。

## 既有字体与收尾

[字体增量报告](../type-increment/report.md)已冻结：已实测项9.1–9.2，首页待办320/360为9.2；developer-loading仍N/T，不因本报告代签，也不重跑钱包来源矩阵。[更早钱包恢复](../report.md)仍按原证据范围。

结束重新载入终包，实际52,800.64、390浅色550、reduced=false。5294代理off，无业务写入/存储清理，不停任何服务；本人3126/3136/3141标签关闭结果见cleanup.json。
