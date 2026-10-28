# 福利双卡 r12 独立源码复核

历史范围提示：用户已用r13整卡入口新规则替代此处r12福利方案，生产四文件方案已撤回，旧fixture修复保留。本页9.1仅代表下述旧快照，不适用于最新Hero；当前独立结论见[福利/Online r13源码复核](benefits-online-r13-code-review.md)。

当前补充：旧夹具修复已独立只读复核，未削弱金额或轮询断言、未复制生产逻辑代替调用；无新增P2，生产四文件评分仍 **9.1/10**。Noether执行记录已更新为 **3文件36/36通过**，本人未重跑。父线程提供r12构建 `CNOH4xg3 / 64PWOPxR`，实景由A/B进行；Jason的Online英文/绿点不纳入本报告。下文31/36是修复前历史，详见末节。

2026-10-27 · Averroes · **9.1/10，无新增P2或源码阻塞项。** 仅审 [实现说明](benefits-r12-implementation.md) 指定四文件的当前diff；独立读回四份SHA-256均与READY记录相同。不继承旧视觉分，也不将实现者测试算作本人执行。

## 保护边界与结果

| 用户关注项 | 独立核对结论 |
|---|---|
| 390ZHdark未领取 | [trial-hero-banner.vue:3](../../../src/components/trial-hero-banner.vue#L3) 的compact条件仅embedded且非中文/已有生命周期/满队列；中文未领取、非满队列不命中。390不命中≤374规则，保留184px原卡、原完整文案、118px机型图与CTA样式；新增说明wrapper无390专属布局，新增同素材图display:none。grid改align-items:start、券卡恢复自身184px，在原两卡184px场景不要求拉长任一卡。此为源码保持结论，未复看5237。 |
| unknown `-` | [trial-hero-banner.vue:74](../../../src/components/trial-hero-banner.vue#L74) 的估计抵扣、实际抵扣和原时间null分支不变；新增compactRemainingText也先判null返回`-`，没有改成0或制造倒计时。原`formatTrialRemaining`函数字节不变，仅传入新的日/小时短模板。 |
| 机型和金额完整 | 机型仍读`trialView.deviceName ?? 原fallback`，未替换成泛称；标题保留overflow-wrap:anywhere，无ellipsis/line-clamp。`creditText`及原金额格式化不变，新增样式没有金额省略逻辑。compact卡为height:auto/min-height200，自然增长；大金额的实际窄屏边界未测，不能仅以文本保留代签任意金额均视觉容纳。 |
| compact三语 | active/grace/ended/converted标题、时间/抵扣标签和CTA均有zh/en/vi字段；全称仍在对应aria-label，主CTA仍一个控件。未领取仅小屏/长文案范围缩写，非embedded不启用compact。核对过原`heroProductUnavailable`三语本来就是“试用设备暂时缺货”，新outOfStock没有将其改成另一类业务原因。读屏实际读法未测。 |
| 试用状态及资格 | 试用script只增加三份展示computed；删除这三段后与HEAD script完全一致。`canRestart/canClaim/canOpen/visible`、authority/retained-offer判断、retry与onClick均未改。ended仅原eligibility.ok时可再次打开领取；其余状态沿原详情/设备入口；capacity-full进入设备管理，禁领仍受原守卫控制。没有自动重领、自动购买、改有效期或抵扣规则。 |
| 券卡及领取后保留 | [home-benefits.vue:20](../../../src/components/home/home-benefits.vue#L20) 的hasTrial/hasVoucher及单卡判断不变。voucher完整template/script与HEAD相同，金额/百分比/未知值、claim/view入口均保留；只将embedded高度从继承相邻卡改为自身184px、≤350为200px，避免试用长文案把券拉高。 |
| 图层、CTA与动画 | lifecycle图移到状态右侧留位，完整机型独占可换行行；未领取小屏图进入说明行，原大图隐藏，非两张同时叠加。CTA min-height44、原role/tabindex/aria-disabled/click.stop保持；新图沿用原浮动节奏并有reduced-motion覆盖。Glass按钮配置、主题token及券图素材不变。无新的业务触发层。 |

## 真实验证归属及未覆盖

实现者记录：改前/改后均36项中31通过、5失败；21项生命周期与4项voucher通过，trial-offer-stability有6通过/5旧source-extraction依赖失败。**本次未运行这些测试，不报告全绿**；相同基线失败仍须由其拥有者维护。轻量renderer的textContent包含隐藏文案，不能用它替代compact CSS可见性、真实宽度或读屏验证。

父线程后续实景只需承接当前要求的390ZHdark未领取保护、320VI紧凑生命周期/未知值及实际CTA边界；此报告不新建全主题×语言×状态矩阵。正式试用服务、APP安装/原生字体、实际支付与读屏未覆盖。没有构建、浏览器、测试、生产修改或提交推送。

## 冻结证据

基线 `e58039e57c9cc5192cc3fe5642b9ecac5564dce9`。四文件分别为：

- trial-hero-banner.vue：`be27535e147ed90057811cf7bb3170d4a974de353d2cd489456b8781802672af`
- voucher-banner.vue：`e524781d849bd04eda0092b7e284502e7b5609d1480a36c5d3d498e0cc8fe829`
- home/home-benefits.vue：`9882800f6b4522338c1044b1059301f927105e3e5af958a2b194e375d1d549d0`
- trial-lifecycle.ts：`f3875d49138669959d1c2ac1ad1aa934f0199b61900f47dbe6c42e23af9dea29`

按排序路径/NUL/原始字节/NUL合并SHA-256：`9dfa44a6e6af445088ba4b74f4312de1e0ab5e0adb8123529ddc03f893c6ea2d`。同轮签到NativeSVG及三个sheet触区闭环另见 [合并源码报告](compact-r10-code-review.md)，不与本四文件的独立结论混为视觉签署。

## 追加：trial-offer旧夹具修复独立复核

2026-10-27。只读 [trial-offer-stability.test.ts](../../../src/components/trial-offer-stability.test.ts) 当前diff及其实际生产调用链，**未发现削弱或镜像实现，未发现新增P2**。

- [heroCredit:74](../../../src/components/trial-offer-stability.test.ts#L74) 经模拟API响应进入真实`refreshRemote`、`applyAuthoritative`和`useTrialPresentation`，再执行从当前组件提取的`estimateText/creditBasisText`声明。替身仅隔离网络、账号上下文和时钟，没有用自制presentation替换生产计算；`Math.min(days × rate, cap)`是简明业务期望，实际被测计算仍由生产helper执行。
- 原11项均保留，无skip/todo。115.56原始累计、50上限、五档日收益和49.99小数上限继续精确断言，新增`$50.00/$49.99/$3.00`实际文本检查。未封顶日收益行从旧夹具自拼的`$1.00/d × 3`改为真实声明输出`1.00/d × 3`，同时保留单独的货币单位及总金额断言，不是移除币种要求来过绿。
- [poll用例:144](../../../src/components/trial-offer-stability.test.ts#L144) 使用真实store和受控未完成Promise，检查ready→loading→ready、两次GET、两处CTA原文案稳定、等待期间禁领、完成后恢复及无start请求；比旧夹具增加了中间/恢复状态断言。真实presentation的effect scope逐例停止，避免观察器泄漏。

已读Noether[实现说明末节](benefits-r12-implementation.md)：20:35:29原三文件复跑，生命周期21、稳定性11、券卡4，共36/36，退出0。此为实现者执行记录，本人没有运行测试或独立核验原始终端日志；前述两轮31/36、5个旧失败完整保留为历史。测试修复不覆盖DOM可见性、实际窄屏字号、读屏或正式服务。当前测试文件SHA-256为`72486a5f1787e6be58a1df7af0ea620a94ab8ec8140642d27ee910561c89c495`。
