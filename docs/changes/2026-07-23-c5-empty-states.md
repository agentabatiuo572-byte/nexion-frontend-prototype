# C5 · 缺省页 / 空状态体系(全站横切)

> 工作线 ④ uniapp · 定级 M · 状态 **Draft**
> 依据:《06 缺省页规范》· 上游工单 `docs/changes/2026-07-23-crosscut-batches-prompt.md` C5 节

## Why

《06》定义了 7 种缺省状态(插画 + 标题 + 说明 + 可选 CTA),**落地率约 0%**。
现状是 22 处空态各写各的:一行灰字("暂无数据" / "还没有记录"),没有插画、没有引导、没有 CTA。

两个真实代价,不是洁癖:
1. **新用户第一印象**:刚注册的账号打开钱包账单 / 订单 / 奖励页,看到的都是一行灰字,像半成品。
2. **漏斗漏水**:《06》§3 明写 `no-owned-asset` 是转化型状态 —— 「你还没有设备 / 插上设备就能开始赚 / [去看看设备]」。
   现在 `me/devices`、`staking` 无持仓这两处只有一行字,**白白丢掉一个漏斗入口**。

## 前置事实(已核)

- 7 种插画 × 双主题 = 14 张,**已存在**于 `D:/WORKS/PLAN/UI/缺省页/assets/{dark,light}/`,V5 配色,可直接引用。
- uniapp 的 `src/static/img/` 下**没有**这批资产(只有 brand / devices / marketing / products)→ 需要复制进来。
- 全站 22 处明确的空态分支(`v-if="xxx.length === 0"` 一类),分布在 20 个文件。

## What changes

### 1. 资产落地
`UI/缺省页/assets/{dark,light}/*.png`(7×2)→ `src/static/img/empty/{dark,light}/`。

### 2. 新增 `components/empty-state.vue`

按《06》§1 通用结构,一个组件覆盖 7 种状态:

```
props: kind        7 种之一(empty-list / no-search-results / no-filter-results /
                   no-owned-asset / locked-or-no-permission / network-offline / recoverable-error)
       title       一句话标题(必填,口语化第二人称)
       desc        说明(可选,最多 2 行)
       ctaLabel    CTA 文案(可选)
       @cta        CTA 点击
```

- 插画 112–160px 居中,按 `data-theme` 切 dark/light 两版
- 标题 20/28 `--v5-ink`;说明 13/18 `--v5-ink-3`
- CTA 是 pill button(不是文字链),转化型状态不弱化
- 文案全部走 i18n(三语镜像),**不接受硬编码**

### 3. 22 处落点 → 状态映射

| 页面 | 场景 | 状态 | CTA |
|---|---|---|---|
| `me/devices` 无设备 | 无持有资产 | `no-owned-asset` | 🔵 **去看看设备**(转化) |
| `staking` 无持仓 | 无持有资产 | `no-owned-asset` | 🔵 **去质押**(转化) |
| `me/wallet-cards` 无卡 | 空列表 | `empty-list` | 添加银行卡 |
| `store/orders` 无订单 | 空列表 | `empty-list` | 去逛逛(已有,改成规范形态) |
| `search` 无结果 | 无搜索结果 | `no-search-results` | 清除搜索 |
| `me/help` 搜索无命中 | 无搜索结果 | `no-search-results` | 清除搜索 |
| `events` / `market` / `team/unilevel` / `me/support-tickets` 筛选后空 | 无筛选结果 | `no-filter-results` | 重置筛选 |
| `me/notifications` / `me/receipts` / `me/rewards-list`(2 处) / `me/wallet-bills` / `me/wallet-exchange` 历史 / `me/wallet-nex` 活动 / `daily` 历史 / `team/commissions` / `support/messages` / `store/bundle` | 空列表 | `empty-list` | 视场景(多数无 CTA) |
| `earn/device-detail` 找不到设备 | 可恢复错误 | `recoverable-error` | 重试 / 返回 |

### 4. 文案:新建 `empty` namespace(三语镜像)

现状的空态文案是说明书腔且散在各 namespace:`"No results — try different keywords."` /
`"No activity yet"` / `"No positions yet · Choose a plan above to start earning"`。
《06》§3 要求**口语化 + 第二人称**:「这里还空着」而非「暂无数据」,「你还没有设备」而非「无持有资产」。

新建 `empty` namespace 放 7 种状态的通用文案 + 场景特化文案(约 28 个 key × 3 语言):

| key 组 | 用途 |
|---|---|
| `list.*` / `search.*` / `filter.*` / `error.*` | 通用兜底,多数列表直接用 |
| `devices.*` / `staking.*` | 🔵 转化型(`no-owned-asset`),CTA 明确引导 |
| `cards.*` / `orders.*` / `bills.*` … | 场景特化,盖过通用文案 |

旧的散落 key(`tickets.emptyList` / `daily.noActivity` / `stakingV3.noPositions` / `search.noResults`)
**保留不动** —— 它们还被别处引用,C5 只是不再用它们渲染空态;清理归后续批次,避免本批 diff 膨胀。

### 5. Out of scope(明确不做)

- **加载态 skeleton**:《06》§3 要求 skeleton 匹配真实布局,那是逐页定制,不是一个组件能覆盖的 → 单独批次。
- **断网整页态**:已有 `global-ui.vue` 的 netError 覆盖层,本批不动它。
- **表单 inline 校验错误**:《06》§4 明确不升整页缺省页,现状正确,不动。

## Done-when(可证伪)

1. 22 处空态全部渲染出插画 + 标题 + 说明(运行时截图为证,不是 grep 到组件名)
2. 双主题各自加载对应的插画文件(dark/light 两个路径都实际命中,不是同一张图两边用)
3. 文案零硬编码:`i18n-key-mirror.mjs` 三语镜像通过
4. `no-owned-asset` 两处的 CTA 真的能跳到设备/质押页(真点验证)
5. 无新增横向溢出;`dom-qa` 的 img-broken 探针 0 命中(插画路径写错会被它抓到)
6. 空态出现时不再有「白屏 / 只有一行灰字」的页面 —— 逐页截图核对

## 风险

- ~~图片体积~~ **已核**:7 张单张 23–42KB,双主题合计约 480KB,按需加载不上首屏 → 无需压缩。
  ⚠️ 目录里还有 `contact-sheet.png`(263KB,是 7 张的拼版预览)和一堆 macOS 资源分叉文件 `._*.png` —— **都不复制**。
- **暗色/亮色路径切换**:uni 的 `<image>` 不支持 CSS `prefers-color-scheme`,得在组件里读 `data-theme` 算 src —— 主题切换时要能实时换图(不是只在挂载时算一次)。这条要专门验。
