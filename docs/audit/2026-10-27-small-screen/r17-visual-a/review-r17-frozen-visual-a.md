# R17 独立视觉 A：冻结总表

**READY，允许父线程构建 R18；停止旧包采样。** 实际 APP 入口 **index-BQJ7beyl.js / index-DPMvPy7r.css**，每条原始读回保留实际 lazy CSS。官方 CUA Chrome4、自有5254/5274；未操作用户5237/5251，未改产品、构建、测试或提交。

[完整冻结读回](runtime-r17-frozen-visual-a.json)：64条，32张原图，其中1张误落首页已排除，31张可用。既有[优先阶段](priority-nav-capacity-r17.md)、[三生命周期补证](lifecycle-supplement-r17.md)及旧失败全部保留。下表独立逐项评分，不平均、不借源码或B评分。

| 实际完成项 | 分数/10 | 证据及限定 |
| --- | --- | --- |
| R17小屏导航及五路由切换 | 9.2 | 320/390×中越×明暗；旧SVG约25.96px、56条高/46命中，390保留68条高及文字。实际260ms事件、LiquidGlass/indicator保留。**仅旧26px候选，新24px未验。** |
| 容量满320VI浅暗、390VI浅 | 9.1 | 短说明、右下Quản lý、双卡等高、118图；实际管理入口到me/devices。原型容量reason与fleet不作为正式业务一致性签核。 |
| **容量满390ZH暗** | **8.8／P2 OPEN** | [旧中文孤字位。](r17-capacity-full-zh-dark-390.png)。父已改短句但R17未构建，不能追认通过。 |
| grace／ended／converted，320VI浅 | 9.2／9.1／9.2 | 双卡等高、118图、无独立CTA，copy/金额/倒计时未遮挡；只补指定三帧，未逐个点击整卡目的地。 |
| 钱包390ZH暗：零／无快照未知／原按钮恢复 | 9.2 | [零](r17-wallet-zero-zh-dark-390.png)、[稳定未知—](r17-wallet-unknown-zh-dark-390.png)，36px；原retry后恢复52,800.64，无错误卡。不是沿用旧320帧。 |
| Ref已登录正常、紧凑copy/CTA | 9.1 | 390ZH暗及[320VI浅](r17-ref-authed-vi-light-320-valid.png)；实际CTA44高，短文自然折行；平台统计仍—，未代签该后台汇总。 |
| Ref读取错误→原按钮恢复、灰条修复 | 9.2 | [错误](r17-ref-error-vi-light-320-valid.png)→[恢复](r17-ref-retry-restored-vi-light-320.png)，32面/44命中、13/600/20。390×420短屏真实下滚0→135.33→上滚0，[底部](r17-ref-short-light-bottom.png)可达，body scrollbar none／webkit0，未锁死overflow。 |
| **Ref未登录登录入口** | **8.7／P2 OPEN** | [320VI浅](r17-ref-unauthed-vi-light-320.png)整体无溢出，但Tiếp tục实际44.42×16，padding0、无伪层扩大。最小修法：保留12px外观，给所属按钮根至少44px高命中。实际点到login?ref=UVELDEMO，未注册或同意协议。 |
| Staking FAQ只读错误及原retry恢复 | 9.2 | [390ZH暗](r17-readonly-staking-faq-zh-dark-390.png)；修正后的caps精确GET503→200，32面/44命中、13/600/20。未点击质押主CTA。 |
| 充值历史错误及原retry恢复 | 9.2 | [320VI浅](r17-deposit-history-error-vi-light-320.png)，vietqr/receipts503→200，地址/Cregis保持正常；未创建订单或转账。 |
| 网络页／关系树错误及恢复 | 9.1／9.1 | 各自[网络](r17-network-error-vi-light-320.png)、[树](r17-tree-error-vi-light-320.png)，320VI浅，32面/44命中、13/600/20，原retry503→200、8成员恢复。 |
| 安全页错误及原retry恢复 | 9.0 | [320VI浅](r17-security-error-vi-light-320.png)，32面/44命中。长说明右缘与按钮根相接但无交叠，留白余量有限；未改任何安全设置，原读取恢复。 |
| 钱包收益overview错误及最终恢复 | 9.2 | [错误](r17-wallet-earnings-error-vi-light-320.png)→[恢复](r17-wallet-earnings-restored-vi-light-320.png)，320VI浅，32面/44命中，overview503→200；今日16.24／累计266.24读回，余额52,800.64保持。**不代签独立commissions失败。** |

## 确切剩余与下一包最小增量

1. 中文容量满8.8保留：R18只补390/320ZH短句完整帧及原管理入口。
2. 用户新24px导航要求：R17约26px旧分不迁移；R18补320实际图标及一次选中切换，390不变读回。保留56条高/命中/260ms/玻璃。
3. Ref未登录Tiếp tục命中16px的8.7保留；如修复，仅补320VI实际44命中及登录路由，勿扩注册业务。
4. **N/T：独立wallet-commissions故障**本次未单独重测；overview恢复不能覆盖它。**wallet-repurchase historyError**无合法只读状态入口；**旧wallet-cards读取页**原入口重定向新绑定页，未以新页冒签旧消费者；**nextPage**原型为null，未造业务分页。保留这些明确分支，不泛化为所有钱包/恢复卡未验。
5. 三生命周期整卡各目的地未逐个点击；当前只签新增布局帧。正式Java、物理APP安装/键盘/原生触摸及真实服务外部边界未验，不阻断已完成的本地视觉范围，也不冒签。

## 证据纠偏与收尾

- r17-ref-authed-vi-light-320.png及对应root=null记录实际为语言/主题异步重载后的首页，明确排除；正确图带-valid及-retry-restored。wallet未知仅用-settled稳定读回；未触发的Ref缓存正常200记录不算错误分支。
- 本地一次性合成账户通过原Me退出确认后观察未登录Ref；随后用原演示首页入口恢复Alex。未操作用户会话、未接受条款、未填写新账户。
- 5274故障已显式off（2026-10-27T15:19:13.371Z）；5254/5264/5274服务不停止。仅关闭本人当前旧包审查标签，不再取样，等待父线程R18。
