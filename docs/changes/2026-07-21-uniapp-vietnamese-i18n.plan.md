# UniApp 越南语 i18n — 实施拆解 (plan)

**工作线** ④ uniapp · **定级** L · **日期** 2026-07-21 · **状态** Aligned(大纲三决策已确认)

## Why
项目运营重心 = 越南单一市场,但 i18n 无越南语(选单 10 语言仅 en/zh 有真字典,余 8 种 fallback 英文)。补 vi 为 P0 推荐语言,越南设备自动切;全量翻译 105 namespace / 4607 行,地道口语(bạn 人称,去官腔)。

## 决策(主人 AskUserQuestion 确认)
- **定位**: vi 进 P0 Recommended + 越南设备自动切;DEFAULT_LOCALE 保持 en 兜底。
- **范围**: 全量 105 namespace 译透,内部分批实现/验收。
- **质量**: 直接全量 + AI 双轮校(translator 产出 + 独立 reviewer 校),不先出样例。
- **语域**(2026-07-21 二次确认): 专业得体档——保留 bạn 友好,去语气词(nhé/nha)/俚语,换规范金融词;不官腔不冷。4 批初译后各派 refine agent 统一校准到此档。标尺:报错=Chưa chính xác, vui lòng thử lại. / CTA=Xác nhận / 卖点=Nhận lợi nhuận ngay cả khi đang ngủ.

## Done-when (P6 逐条回测)
1. LocaleCode 含 vi;LOCALES vi(priority 0);language.vue vi 行在 Recommended 组。
2. use-t DICTS 注册 vi;navigator.language=vi 自动显示越南语;手动切 vi 后 useHasTranslation(vi)=true。
3. vi.ts `const vi: Messages`,vue-tsc 0 错(结构逐 key = en)。
4. i18n mirror en/zh/vi 三方 key 全等 PASS(红测:删 vi 一 key → 门红)。
5. 占位符 {x} / 品牌词 NEX·USDT·Nexion / 合规数字(5%·15%·30%·50% 等)在 vi 完整保留。
6. 地道口语,无官腔无直译腔,reviewer 双轮过。
7. verify.sh all 全绿(现有 en/zh 内容哨兵不被破坏)。

## out-of-scope
- 不改产品功能 / 规则 / UI 布局(纯加一门语言)。
- 其余 8 种占位语言(ja/ko/ru/es/pt/ar/de/fr)不动。
- RTL 不涉及(vi 非 RTL)。

## 拆解 (TaskCreate #1-9 镜像;MD 为准)
- [x] T3 vi.ts 骨架(=en 结构,value 占位)→ tsc 绿  ← 先行(T1 DICTS 依赖它)
- [x] T1 index.ts(vi union + LOCALES P0) + use-t DICTS 注册 vi
- [x] T2 mirror 门三方化(en/zh/vi)+ 红测
- [ ] T4 翻译批 A 核心漏斗(登录/注册/引导/首页/赚钱)
- [ ] T5 翻译批 B 钱包/我的/设备/交易
- [ ] T6 翻译批 C store/trial/活动/抽奖/创世
- [ ] T7 翻译批 D howItWorks 说明类 + 其余散块
- [ ] T4.5-7.5 语域校准 A/B/C/D → 专业得体档(refine agent,只改语气用词,不动 key/占位符/结构)
- [ ] T8 全量拼装 + 三方 mirror + tsc + verify 全绿
- [ ] T9 reviewer 双轮 + 实景切 vi 截图 + done-review + 收尾

## 门
tsc 0 · mirror 三方 PASS · verify all · reviewer(地道性/占位符/合规数字) · language 切 vi 实景截图无英文夹杂无溢出

## 翻译纪律(每 translator agent 必带)
- key 一字不改,只翻 value。结构照 en 骨架,不增删不重排。
- 占位符 `{usd}{nex}{amount}{n}{filter}...` 原样保留;品牌词 NEX/USDT/Nexion 不译;数字/百分比/货币符原样。
- 人称用 **bạn**(友好口语),禁 quý khách(官腔);自然口语,禁 Google 直译腔。
- 禁 meta/庞氏词(项目不变量);`<text>` 渲染 raw,禁 markdown `**`/反引号/`/path` 字面量。
