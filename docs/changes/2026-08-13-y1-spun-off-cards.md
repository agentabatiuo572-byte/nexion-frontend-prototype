# 包 y1 拆出去的卡 —— i18n 收口时确证、但不属于「把中文搬进词典」这张卡的问题（主人 2026-08-13 拍板：立卡）

> 包 y1（硬编码中文门首批命中收口，已并入主线 `f718a92`）在做「把可见中文搬进三语词典」时
> **顺带暴露**的问题。它不是 y1 引入的，y1 也没有修 —— 但 y1 让它从「只有中文用户看得到」
> 变成「三种语言的用户都看得到」，所以必须写下来。
> 本文件是立卡依据与证据存档：**「不修」不等于「没看见」。**

---

## 卡 1 🔴 以旧换新在真后台档下，把文案塞进了为数字设计的插值槽

**缺陷**：`src/components/tradein-sheets.vue` 在真后台档（`remoteApiEnabled`）下，
往两个**本来只该放数字**的插值槽里填了一个词：

| 位置 | 槽的模板 | 真后台档下填进去的值 |
|---|---|---|
| `tradein-sheets.vue:317` | `choiceTradeInOption` —— zh `用 {name} 置换 · 抵扣 ${credit}` / en `Trade in {name} · ${credit} credit`（槽前**自带一个 `$`**） | `tradein.remoteQuoteCreditLabel`（zh「服务端报价」/ en `server quote`） |
| `tradein-sheets.vue:454` | `sheetBandText` —— zh `第 {band} 档 · 抵原价 {pct}%` / en `Band {band} · {pct}% of price`（`{band}` 原本是**档位序号**） | `tradein.remoteQuoteBandLabel`（zh「服务端」/ en `server`） |

本地档下这两个槽填的分别是 `previewCredit(...).toFixed(2)`（金额）和 `ladderBandFor(...).band`（档位号），
形状对得上；**只有真后台档这条分支把词当成了数字/档位**。

**后果**（渲染实测，非推算 —— 在 dev server 上把真模板与真值代进 `fmt()` 得到）：

```
zh  用 Rig A 置换 · 抵扣 $服务端报价      第 服务端 档 · 抵原价 12%
en  Trade in Rig A · $server quote credit  Band server · 12% of price
vi  Đổi Rig A · trừ $báo giá máy chủ       Bậc máy chủ · 12% giá máy
```

美元符号后面跟着一个词组；「第 __ 档」里装着「服务端」。三种语言一样别扭。

**y1 之前是什么样**：这两处原本是**硬编码中文**（`"服务端报价"` / `"服务端"`），
所以英文与越南文用户看到的**也是这两个中文词**。y1 把它们收进词典后，别扭从
「一种语言别扭 + 两种语言串语言」变成「三种语言各自别扭」——**可读性其实是变好的**，
但槽位错配这个根问题原样保留。

**为什么不在 y1 修**：y1 那张卡的判据是「这句话是给用户看的，还是给机器比对的」，
处理动作只有三种（进词典 / 改英文技术串 / 加豁免）。而这处要修的不是「用哪种语言说」，
是**句子结构**：得让真后台档走自己的整句文案，而不是往数字槽里塞词。那属于产品文案设计，
不是 i18n 搬家；混在 i18n 收口里改，会让「纯文案层收口、业务规则一字未动」这个结论不再成立。

**建议修法**（留给接手的人，不是已决议）：给真后台档单独的整句 key，例如
`tradein.choiceTradeInOptionRemote`（zh 形如「用 {name} 置换 · 抵扣以服务端报价为准」）与
`tradein.sheetBandTextRemote`（zh 形如「抵原价 {pct}%（服务端报价）」），
在 `remoteApiEnabled` 分支里整句替换，而不是复用带 `$` 前缀 / 带「第 __ 档」的模板。
注意 `sheetBandText` 的本地档分支仍要保留 `{band}`，两条分支的占位符集合不同，
改完要过 `i18n-key-mirror` 的占位符对齐门。

**开工前必读**：`docs/changes/2026-08-12-...` 同批次卡片的写法约定；
以及本仓 `i18n-hardcoded-cjk-sentinel.mjs` 失败提示里的三条出路 —— 这张卡属于**三条之外**的
第四种情况：文案已经在词典里了、语言也对，错的是**它被放进了哪个句子**。
