# 钱包错误恢复与网络入口：独立行为 B 最终报告

**READY，限定本轮钱包恢复／金额及network范围，各项均≥9，无未修P2。** 旧320长额8.6保留为历史，已在终包实景关闭。用户新增的个人中心下半屏主题/语言、帮助与支持列表字号 **另列OPEN，等待新包，不由本轮分数覆盖**。

## 候选及方法

- 源码初审基线adce68e84033e15a1559d087c8ae701855018732＋父线程WIP；终检只读看到HEAD312b10fb89a326dc6b0f14a8aa223e38ba3ef7de＋三组件WIP。分数绑定下面的实际运行资源，不声称工作树干净或等同发布commit。
- 旧固定包 **index-BpZnWN6Z.js** 完成全部指定来源故障；终包 **index-CZ5ylXPm.js** 完成指定增量。发布目录web与web-closed中该JS字节相同，SHA256 **24AEB6A2EC24699BDDF93E29C4B0E140ADA1E037554D9ABD8D7F3543E64FD22B**。
- 官方CUA Chrome4本人5294→5293；不操作5237/A5291。指定CLI精确GET503/只读余额响应覆盖，其他透传、业务写405；用原页面控件点击/Enter/Space及UI导航，未造store/DOM。无产品修改、构建、提交或测试执行。
- [旧包行为证据](./runtime-old-fixed-r25.json)、[旧分项与8.6历史](./old-fixed-wallet-results.md)、[终包证据与图片SHA256](./runtime-final-r25.json)。旧六来源未在终包无故重跑；处理器源码未变，终包另做一次真正失败恢复并复核指定金额/网络增量。

## 逐项分数（不平均）

| 项目 | 分数/10 | 独立结论 |
| --- | --- | --- |
| fleet原重试与来源隔离 | **9.2** | 旧包真实点击：fleet＋其既有tasks/assignments配套读取200，无release/home/commission/orders被该动作刷新。终包再做无快照503→off→原Enter，恢复52,800.64，ResourceTiming读回fleet503→200。 |
| release原重试 | **9.2** | 旧包Enter仅GET release-status200，确认中/待释放从—恢复12.50/50.00，余额及累计保持。 |
| 累计收益home来源失败 | **9.2** | 旧包算力与累计未知、团队250保留；Space原重试home＋commission均200，恢复266.24。 |
| 累计收益commission来源失败 | **9.2** | 旧包保留16.24算力、团队/累计未知；原点击读取累计所需两来源200，恢复266.24，不波及余额/release。 |
| 提现列表重试 | **9.1，限定** | 旧包实际原按钮恢复，GETwithdrawals200，错误卡消除；该页有定时轮询，捕获窗两次同源请求，不宣称恰好一次。被轮询抢先恢复的两次尝试明确排除。 |
| 本页订单重试 | **9.1，限定** | 英文Retry/Enter实际GETorders200、卡消除，route保持Me。窗口另有已知withdrawals轮询；源码订单处理器只调用订单刷新，不把轮询误归按钮。 |
| 字体/面/触区、a11y、键盘 | **9.2** | 旧各卡及终包funds均13px/600/20px、before32/top6/bottom6；VI65×44、ZH50×44、EN58.06×44，文字子节点一致，位于所属卡内，无挤压。Enter/Space真实触发，完整retry aria/tabindex保留。 |
| 未知和已有余额失败语义 | **9.2** | 冷首次失败为—，不回退0；有快照52,800.64失败时保留并显示“最近已确认余额”过期提示，不冒充最新值。终包冷失败再次证实。 |
| 普通／零额320 | **9.2** | 终包正常52,800.64及0.00均单行、36px，未知—与真实0.00区分正确；零额只为GET副本覆盖，不写上游。390零额旧证据保留。 |
| 长额320／390 | **9.2，关闭旧8.6** | 终包1,234,567,890.12分别以23.5294px/30.3922px完整单行，文本精度/逗号/小数保留，横溢0；Range的重复wrapper/text矩形在同一y，不是两行。源改法只按完整格式长度缩放币种/金额并nowrap，不改余额来源。 |
| network团队入口 | **9.2** | 320VI原Enter实际进入/pages/team/team。 |
| network邀请入口 | **9.2** | 320VI原点击实际进入/pages/team/team，与既有href/handler相符；不虚构新邀请路由，未点击分享/发出邀请。 |
| network佣金入口 | **9.2** | 320VI原Space实际进入/pages/team/commissions，正文为佣金页。 |
| network等级入口 | **9.2** | 320VI原点击实际进入/pages/team/rank，正文为等级页。四次均返回Me。 |
| network320长越文布局 | **9.2** | 四项138×52，标题12px/500/16、说明12px/400/16；稳定实景完整，无互相覆盖或横溢。390源码/读回标题13/18，不扩展新完整矩阵。 |

## 关键实景与准确边界

| 证据 | 文件 |
| --- | --- |
| 旧首次无快照— | [图](./funds-cold-no-snapshot-vi320-light.png) |
| 旧余额已过期提示 | [图](./funds-warm-stale-vi320-light.png) |
| release／home／commission失败 | [release](./release-error-vi320-light.png) / [home](./earnings-home-error-vi320-light.png) / [commission](./earnings-commission-error-zh390-dark.png) |
| 提现／英文订单失败 | [提现有效帧](./withdrawals-error-zh390-dark-focused-valid.png) / [订单](./orders-error-en320-light.png) |
| 旧长额断行8.6 | [失败历史](./balance-long-vi320-light.png) |
| 终包未知→原Enter恢复 | [未知](./final-cold-funds-unknown-vi320-light.png) / [普通余额](./final-normal-balance-vi320-light.png) |
| 终包零额／320长额／390长额 | [零](./final-zero-vi320-light.png) / [320长额](./final-long-vi320-light.png) / [390长额](./final-long-zh390-dark.png) |
| 终包四入口稳定布局 | [图](./final-network-layout-vi320-light-settled.png) |

旧withdrawals-error-zh390-dark.png为滚动过冲的设置帧，排除；终包network不带-settled的首帧为入场淡入过渡，最终可见性仅采用-settled。Commission初读余额—及订单初读—为页面加载过渡，未作为稳定余额断言。

旧来源隔离用官方CDPNetwork游标窗口，只存URL/方法/status等必要字段，不存认证headers。终包reload后该stream尚未重新启用时得到空窗，**空窗不等于没有请求**；此次原Enter恢复另以明确ResourceTiming503/200及UI读回证明。最终增量7条读回、5条路由记录、7图（1淡入过渡排除）；旧21读回/7网络窗口/12图（1错误取景排除）独立保留。

## 源码与测试说明

[wallet-overview.vue](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/src/components/me/wallet-overview.vue)中四重试继续分别调用fleet/release/累计双来源/withdrawals；[me.vue](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/src/pages/me/me.vue)订单继续refreshRemoteOrders，network继续navTo(item.href)。样式及t.ui.retry接入未变这些处理器。长额修复仅[wallet-card.vue](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/src/components/me/wallet-card.vue)的长度适配CSS变量/nowrap，数值与authority契约不变。

B未运行/删改测试。父报告的wallet-card-layout.behavior三语compact pending三失败，B在初审以git show核实既有矛盾：测试compact:true期待pending挂载，HEAD组件已用!compact&&pendingLine。该测试当时工作树和HEAD blob均0a8de40674a327468d10facb77de8e79f725e497；不把它算作新重试样式引入，也不伪称B测试绿。

## 状态备份、清理与未覆盖

运行状态备份已依主人要求移出repo至仓外wallet-r25运行目录，**不作为交付证据**。仅保留SHA256 **DEDBF17C5199209230BCFF0518C18E532387ADFF8DCF589D1CF8CE8F9C78E5EC**、搬移前后哈希相等、以及静态发布后/终包增量开始前上游state与备份相等的结果。仓内完整备份已移除，历史报告引用已更新；不发布状态内容。

此前重启被审批拦住，仅保留为历史；没有通过其他工具绕过。父线程以资源先、index最后发布闭环，B没有停止/重启5293或5294。收尾5294为off，只关闭本人1733373074标签，其他服务/用户端口保持。

仅签本轮钱包恢复/金额与network入口。新增业务、H5、正式后端/真实资金、物理真机未测；新增320下半屏主题/语言和帮助支持列表字体OPEN，等待下一包仅做该增量，不借本表宣称整个个人中心或全站通过。冻结2026-10-27T18:30:23.394Z，READY。
