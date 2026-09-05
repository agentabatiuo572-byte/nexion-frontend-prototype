# intro 页信任数据口径改造:日流水 → 累计发放

状态:Shipped(2026-07-24 主人拍板方案 A → 实现 → T1/T1b/T1c 验收 + 审计收敛 → PRD 已同步)

## Why

intro 首屏 stats 胶囊原展示「今日已付 $1,247,893 + 28,432 台设备」:

- 日支付流水 ÷ 设备数 = $43.9/台/日,高于公布可信档 ~$24/台/日,首屏自曝虚高收益;
- 跳动速率外推 ~$9.8M/天,与标称 $1.25M/日矛盾;设备 +0~2/1.8s 外推一天净增 4.8 万台;
- 「日付款流水」是内部财务口径,赚钱类 app / DePIN 行业落地页惯例为**累计支付**或工作量口径。

设备在线数为行业标配信任资产(Helium/io.net 同例),保留,仅措辞补「在线」。

## What changes

- `src/pages/onboarding/intro.vue`:
  - `paid` 种子 1,247,893(日)→ 127,438,905(累计口径;量级 = 校准日产出 $682k/日 × 按增长曲线积分的等效 ~187 天,非「当前机队 × 全部历史」直乘,带零头);
  - 累计值**时间锚单源派生**(anchor 2026-07-24 + $682,368/日速率重算,非随机累加):跨访问/跨会话永不倒退,tick 每 1.8s 重算 ≈ +$14;
  - 设备数 ±1 对称抖动(P=0.25/0.25,在线数自然波动),不再单调猛涨;
  - `.intro-stats` 补 flex-wrap + justify-content:center + 4px row-gap(窄屏/长语言两行兜底);`.intro-hero` 加 text-wrap:pretty(防标题孤字尾行)。
- i18n en/zh/vi:`statsPaidToday` 更名 `statsPaidTotal`(语义对齐);文案 今日已付→累计已发放 / paid today→total paid out / đã trả hôm nay→tổng đã chi trả;statsDevices 补「在线」。

Out-of-scope:`home.paidToCreators`、`home.deviceOnline` 等同口径死 key(全站无引用)本次不动,待主人点头另清。

## Done-when

1. intro 运行时不再出现「今日已付/paid today」,出现累计口径文案,数值 $1.27 亿量级带零头。
2. 跳动外推日支付 ≈ $0.68M(时间锚速率 $682,368/日),与 28.4k 台 × $24/日 校准档一致;单步 ≈ +$14/1.8s;刷新/重访累计值不小于此前(时间锚单调);设备数可观察到 ±1 双向波动。
3. `vue-tsc` 0 错;`verify.sh` 全绿(含 i18n 三语 key 镜像);全站 grep `statsPaidToday` = 0。
4. 5173 实景:intro 渲染正常、console error 0、375px 下胶囊不溢出。

## Impact

页面:onboarding/intro 一处。store:无。PRD:§onboarding intro 文案(待 nexion-prd-sync)。不变量:数字可信档(强化)、i18n 三语镜像(维持)。

## 验收与审计记录(2026-07-24)

- 机器门:vue-tsc 0 错;verify.sh 328 pass / 0 fail(skeptic 独立复跑 tsc 亦 0 错)。
- T1 独立黑盒验收 7/7 PASS + T1b 追验 3/3 PASS:`2026-07-24-intro-stats-cumulative-t1-test.md`。
- skeptic 审计(小修档):P0=0。P1-3(累计口径固定种子跨访问倒退)属本次引入,已修(时间锚派生,见上);P2-3(抖动上行偏置)已对称化;P2-4(本文档两处漂移)已修正。
- **上报待拍板(存量,非本次引入,不扩权自改)**:P1-1 首页 `home.networkPaidToday`「Paid today $1.24M」为**活的**日流水口径残留(此前"同类均死 key"判断有误,特此修正),且全站资金流水存在四个互斥锚(intro 隐含 $0.68M/日、首页 $1.24M/日、首页 +$215/sec ⇒ $18.6M/日、ref 页 $1.2M/月)+ 设备数两套模型(28.4k vs 1.42M);P1-2 store `activeDevices` 每秒 +0~3(globe/trust 页活渲染,外推 +13 万台/日)。建议另开「全平台展示数字单源锚」任务统一派生(倾向以 28.4k × $24/日 为锚,置信度 HIGH);死 key(P2-1)与 store 死字段 `paidToday`(P2-2)并入该任务清理。
