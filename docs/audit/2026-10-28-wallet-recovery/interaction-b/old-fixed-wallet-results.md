# 钱包R25独立行为B：旧固定包阶段

实际入口 **index-BpZnWN6Z.js**，源码基线adce68e84033e15a1559d087c8ae701855018732＋父线程钱包重试样式WIP。仅官方CUA本人5294→5293，320VI浅/390ZH暗及EN320代表；无产品改动/构建/测试/提交，未动5237或A5291。**本文件非最终全项签核：network最终包未加载、320长额仍OPEN。**

| 项目 | 独立分/10 | 证据结论 |
| --- | --- | --- |
| fleet原重试及未知/过期余额 | 9.2 | 冷首次503时余额—、不变0；已有52,800.64后503保留最近已确认余额且给准确过期提示。真实原点击恢复200，仅fleet＋所属assignments配套读取。 |
| release原重试 | 9.2 | 失败时两桶—，其他金额保持；Enter原地仅GET release-status200，恢复12.50/50.00。 |
| 累计home来源失败 | 9.2 | 算力和累计未知，团队250保留；Space原重试读取home＋commissions200，累计恢复266.24。 |
| 累计commission来源失败 | 9.2 | 今日/算力16.24保留、团队和累计未知；原点击仅两累计来源200，余额和release未被改写。 |
| withdrawals原重试 | 9.1，限定 | 实际失败提示→off→原按钮→200并消除卡。窗口内存在自动轮询，两次同源GET，不冒称恰好一次请求或把自动恢复当按钮成功。 |
| 本页orders/英文 | 9.1，限定 | EN Retry原Enter读取orders200、错误消除，route保持Me；窗口另见已知withdrawals定时轮询，结合源码orders处理器核隔离，不把其误记为按钮额外业务读取。 |
| 13/600/20、32面/44触区、Enter/Space | 9.2 | 各卡实测root13px/600/20，子文字一致；before32/top6/bottom6，命中VI65×44、ZH50×44、EN58.06×44，均在所属卡内，无挤压。Enter已验release/orders，Space已验累计。 |
| 零额320VI浅/390ZH暗 | 9.2 | 仅GET响应副本overlay0，显示真实0.00且无故障卡；与未知—明确不同，无业务写入。 |
| 长额390ZH暗 | 9.1 | 1,234,567,890.12完整一行、无横溢。 |
| **长额320VI浅** | **8.6／P2 OPEN** | [独立实景](./balance-long-vi320-light.png)：整数及小数点在首行，12被折至下一行。不是精度丢失，但金额阅读受破坏；父已委托局部修复，待最终补包仅复验该值。 |
| web-final钱包不回退＋network四入口 | N/T，待环境切换 | 不能用旧入口或源码CSS代替最终包实景。 |

[旧包原始21读回/网络窗口/12图](./runtime-old-fixed-r25.json)。图withdrawals-error-zh390-dark.png为滚动过冲到设置，排除；正确图为withdrawals-error-zh390-dark-focused-valid.png。首次资金off后自动刷新、两个提现off后抢先消失的尝试均未记手动通过。后续通过是在同一步使用指定CLI off后紧接官方CUA原按钮；无DOM/Store注入。

源码映射：wallet-overview的funds→refreshRemoteFleet（含assignments）、release→refreshEarningsReleaseStatus、累计→refreshHomeTruth＋refreshCanonicalEvents、withdrawals→refreshRemoteWithdrawalList；me订单→refreshRemoteOrders。样式diff未改变这些处理器。

## 测试基线

B未运行/删改测试。父报告wallet-card-layout.behavior旧3失败；git show确认HEAD测试即compact:true却期待pending挂载，而HEAD组件已经有!compact&&pendingLine。该测试工作树与HEAD blob同为0a8de40674a327468d10facb77de8e79f725e497，不能归因本次重试样式。

## 当时环境阻塞（后由父线程静态发布解除）

5293监听已核为本人旧PID32284、Node脚本prototype-preview-server.mjs；5294为PID13036，未改变。自动审批在执行前拒绝停止32284并启动新服务的组合命令，返回blocked by policy，无更具体理由；**没有进程被本agent停止或重启**，不会换工具绕过。

状态备份已按主人要求移至仓外wallet-r25运行目录，不作为交付证据。仅保留SHA256 DEDBF17C5199209230BCFF0518C18E532387ADFF8DCF589D1CF8CE8F9C78E5EC；搬移前后字节哈希相等，静态发布后且终包增量实操前，上游state与备份相等。父线程采用静态资源先、index最后发布，未通过本agent重启进程；实际闭环入口index-CZ5ylXPm.js。旧8.6与当时N/T保留为历史，最终复评见[最终报告](./report.md)。

代理现off。新增业务、H5、正式后端/真实资金/原生真机未验。此旧包阶段冻结于2026-10-27T18:10:03.225Z，最终全项尚未签。
