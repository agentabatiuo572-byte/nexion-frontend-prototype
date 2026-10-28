# R15 独立视觉 A：按要求立即冻结

冻结 2026-10-27T13:52:18.852Z。实际入口 **index-efmh8j2a.js / index-CqtM5MAW.css**；官方 CUA Chrome4，本人5264/5254/5274隔离页。未操作用户5237/5240/5249/5251，未改源码、构建、跑测试、提交或执行业务写入。源码已开始R16修改不等于当前运行包。

**READY，可统一构建R16。** 父线程要求完成手上操作后停止，本人已完成普通订单卡原重试恢复并停止旧包浏览。不为等待完整矩阵阻挡新构建；本次是已覆盖/待测冻结，绝非21项全部通过。

[冻结读回/照片索引](runtime-r15-frozen.json)，共56条原始记录、29张原始照片；误标/过渡/非目标照片在索引单列。15/21源码消费者实际到达目标卡，6项N/T。

## Slot原8.6修复

**材质、44关闭与安全区9.2。** 浅暗稳定图都有真实sheet底色，nx-glass-fill非空；16px16px0 0、close44×44、末行bottom655.33距视口底38px。实际两主题关闭、暗色再次打开遮罩取消；未点激活/购买。原失败保留。详见[slot优先冻结](slot-result-r15.md)及[浅色稳定图](r15-slot-vi-light-320-settled.png)/[暗色稳定图](r15-slot-vi-dark-320-settled.png)。仅只读代理库存响应副本，不代表激活成功或正式生命周期。

## 21消费者逐项状态，不平均

| # | 消费者 | 分数/10 | 覆盖与剩余 |
| --- | --- | --- | --- |
| 1 | pages/onboarding/terms.vue | 9.2 | 320VI浅暗；32面/44hit右下，13/600/20；解除本标签Network阻断后点原重试恢复正文，不接受协议。 [实景](r15-terms-vi-light-320.png) |
| 2 | pages/store/store.vue | 9.2 | 320VI浅暗无快照目录错误卡；32/44右下。冷启动避免把保留旧商品的纯文本恢复当实体卡；原目录重试恢复。 [实景](r15-store-cold-vi-light-320.png) |
| 3 | pages/store/bundle.vue | 9.2 | 320VI浅暗，32/44右下；目录失败实际原重试恢复；未测回执写入，未带activityId。 [实景](r15-bundle-catalog-vi-dark-320.png) |
| 4 | pages/me/wallet.vue | 9.1 | 320VI浅：资金/收益quiet卡及定向释放卡均32/44右下。资金、释放已实际恢复；收益重试最后稳定清除未补，不计全行为闭环。余额大字不在本项通过内，R16待验。 [实景](r15-wallet-release-vi-light-320.png) |
| 5 | pages/daily/daily.vue | 9.2 | 320VI浅顶部右槽、余额及定向历史三处均32/44；分别原重试恢复。未执行签到/积分兑换。 [实景](r15-daily-history-vi-light-320.png) |
| 6 | components/team/reward-published-guide.vue | 9.2 | binary-how 320VI浅HTTP读取失败，32/44玻璃+箭头右下，原内容键恢复；unilevel和语言fallback未逐一触发。 [实景](r15-reward-published-glass-vi-light-320.png) |
| 7 | components/how/how-published-content.vue | 9.2 | genesis-how 390ZH暗，32/44品牌按钮右下并恢复发布内容；不代签所有页面/语言fallback。 [实景](r15-how-published-genesis-zh-dark-390.png) |
| 8 | pages/team/commissions-how.vue | 9.2 | 390ZH暗guide-commissions失败32/44玻璃右下，正常返回主CTA未缩，原恢复成功；其他三项配置故障未逐项复跑。 [实景](r15-commissions-guide-glass-zh-dark-390.png) |
| 9 | pages/staking/how-it-works.vue | N/T | N/T：exchange-config模式暖运行中未出现目标nx-card-recovery-action；已记录实际正文/0节点，不推断通过，也未证实缓存根因。待R16冷入口再补。 |
| 10 | pages/me/wallet-cards.vue | N/T | N/T：5254及5274实际入口均重定向wallet-cards-new，无目标列表实体卡；绑定页不代签，未绑定/删除。 |
| 11 | pages/me/wallet-repurchase.vue | N/T | N/T：Jason说明目标historyError无只读UI入口；外层错误不代签，未调用store或资金命令造状态。 |
| 12 | components/me/deposit-usdt-pane.vue | N/T | N/T：父线程要求立即冻结时未进入定向receipts历史卡。R16可用deposit-history模式续补，不用其他充值错误代签。 |
| 13 | pages/me/security.vue | 9.1 | 320VI浅右槽quiet32/44，长文在左。仅视觉/热区，原读取恢复尚未补；未修改任何安全资料。 [实景](r15-security-quiet-vi-light-320.png) |
| 14 | pages/me/rewards.vue | 9.2 | 320VI浅定向summary失败quiet32/44，原重试恢复。voucher来源未单独触发。 [实景](r15-rewards-summary-vi-light-320-settled.png) |
| 15 | pages/me/rewards-list.vue | 9.2 | 320VI浅cat=usdt定向账单首次失败，quiet32/44，原重试恢复真实奖励行；cat=nex/voucher及无真实下一页的补页分支未签。 [实景](r15-rewards-list-vi-light-320.png) |
| 16 | pages/store/orders.vue | 9.2 | 320VI浅普通orders源失败，quiet32/44右槽，保留其他记录；off后原重试恢复。其他订单来源不代签，未付款/取消。 [实景](r15-orders-source-vi-light-320-settled.png) |
| 17 | pages/store/order-detail.vue | 9.2 | 先正常进入DEMO-ORDER-004保留快照，返回后定向orders失败再进入；quiet32/44、越文不压按钮，原重试恢复同ID。不是无效订单。 [实景](r15-order-detail-refresh-vi-light-320-settled.png) |
| 18 | pages/ref/code.vue | 8.6 | 整页P2 OPEN：320VI浅错误quiet控件本身9.2（32/44右槽），原码UVELDEMO重试恢复；恢复正常后HTML/BODY760>693，右侧宽灰原生条独立复现。用户追加长文/主按钮大与新紧凑要求R16待验，不被局部9.2覆盖。 [实景](r15-invite-normal-after-retry-vi-light-320.png) |
| 19 | pages/me/wallet-bills.vue | 9.2 | 320VI浅首次账单失败quiet32/44，原重试恢复6条真实账单；nextPage:null，补页错误明确未覆盖。 [实景](r15-wallet-bills-vi-light-320.png) |
| 20 | pages/team/network.vue | N/T | N/T：收到立即冻结要求时未进入network定向卡；留R16续补。 |
| 21 | pages/team/tree.vue | N/T | N/T：收到立即冻结要求时未进入tree定向卡；不同UI不借network或旧R14分数代签。 |

## 本轮视觉结论

已观察的品牌/quiet/inline/glass恢复节点均为 **13px/600/20px；44px根、::before上下6px形成32px可见面**。右下采用正常流/既有右槽，320VI长文没有压按钮；glass保留渐变/内缘、16px backdrop、箭头。无填充纯文本/主CTA没有因本次缩卡而一刀切改造。本结论只属于表中实际节点，不能推广到未触发分支。

当前唯一独立复现的整页失败仍为 **Ref/code 8.6 OPEN**：错误态693高无滚动条，点原恢复后正常内容760高，右侧灰条出现；[恢复后照片](r15-invite-normal-after-retry-vi-light-320.png)。不能以错误态quiet按钮9.2或错误态无滚动条替整页通过。用户新增长文/主CTA紧凑要求属于R16，不倒写旧评分。

钱包大金额字号已由用户否定并将修R16，本轮wallet9.1仅错误卡，不签整个钱包。没有根据新source声称R15含字号修改。

## 原恢复与证据边界

- Terms解除本标签精确请求阻断后点原按钮恢复，不接受协议；5254 Network阻断已还原为空。
- Store先冷启动得到无商品快照的实体卡，原retry恢复目录；保留旧目录的纯文本恢复不代测该卡。
- Bundle无activityId，仅读目录错误，未触发retryReceiptWrite。
- 5274只用Jason白名单精确GET模式，off后原按钮恢复，未重跑verify.mjs。当前最后mode为off；前置读取保持normal。表中N/T不通过调用Vue store、伪造ID/分页或资金操作构造。
- Order-detail先正常DEMO-ORDER-004，再返回并带原快照重入读取失败，成功恢复同ID；普通orders源也完成当前最后一次恢复。其他订单来源未签。
- Wallet资金和释放恢复、Daily顶部/余额/历史恢复、published binary/genesis/commissions、rewards summary、rewards-list usdt、wallet-bills首次均有原按钮恢复记录。Wallet收益末次读回仍有错误节点，未追认为已恢复；Security本轮仅视觉/命中，不虚报业务恢复。
- 语言fallback、未逐项来源、真实下一页等边界依表保留。Wallet-repurchase historyError没有只读入口，不能用外层不可用卡冒充；mock nextPage:null，补页明确未覆盖。
- 初版store浅照片实际bundle，归属按JSON实际URL；store-confirmed照片有旧商品快照且节点0，排除实体卡签核。初版orders/rewards全局E未命中目标，排除；rewards/order-detail过渡帧均用settled替代，不覆写原照片。

## R16已接受的增量/后续最小清单

1. Wallet余额字号；Ref/code正常authed、正常unauthed、错误恢复后的滚动条/短文案/紧凑主CTA；必须保留内容滚动可达，不接受协议、不改归因/奖励/法律入口。
2. 未领取试用仍保留按钮，但缩小右下；已领取整卡入口无独立CTA；双福利缩短而机器图不缩小，投影随图容器对齐；checked签到长越文紧凑check。
3. 剩余6消费者：staking目标FAQ、wallet-cards旧列表路由、wallet-repurchase history、deposit历史、network/tree；继续基于合法fixture和新指纹，N/T不强签。另补表内必要恢复/来源边界，不重开已过完整历史矩阵。

本地原型范围；正式Java服务、原生手机安装/键盘及H5最终均不代签。本人临时标签关闭，5274已off，代理进程留主线程统一管理，不停止他人服务。
