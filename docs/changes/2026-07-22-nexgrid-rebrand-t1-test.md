# NexGrid 改名验收报告 — R1(i18n 三语)+ R3(组件模板内联)

- 日期:2026-07-22 · 角色:独立黑盒 tester(未参与实现)
- 结论:**R1 全过;R3 一过一不过** — AC-R3-1 按 AC 字面 FAIL(8 处非注释资产路径命中),AC-R3-2 运行时 0 残留 PASS。

| AC | 结论 | 一句话 |
|---|---|---|
| AC-R1-1 | ✅ PASS | 三语文件 `grep -i nexion` 0/0/0;独立词 NEX 205/213/211(均 ≥150) |
| AC-R1-2 | ✅ PASS | 顶层 namespace 105/105/105 同名;叶子 key 3842 三语零缺零多;10 key 抽样三语语言正确 |
| AC-R3-1 | ❌ FAIL(字面) | 125 命中里 117 是合法溯源注释;**8 处是 live code 资产路径**(nexionbox/nexionrack png),非注释非溯源 |
| AC-R3-2 | ✅ PASS | 5 页面 innerText `/nexion/i` 全 0;NexGrid 正证据 12/5/9/1/10 次;`inIframe:false` 排除 shell 假象 |

## AC-R1-1 证据

```
=== zh.ts === nexion(-i): 0  standalone \bNEX\b: 205  NexGrid: 104
=== vi.ts === nexion(-i): 0  standalone \bNEX\b: 213  NexGrid: 109
=== en.ts === nexion(-i): 0  standalone \bNEX\b: 211  NexGrid: 109
```

NEX 代币词未被误改(词边界计数,case-sensitive)。

## AC-R1-2 证据

解析方式:用工程自带 typescript `transpileModule` 真实求值三文件(非正则猜测),另跑工程原生 `node scripts/i18n-key-mirror.mjs` 交叉验证。

- 顶层 namespace:en 105 / zh 105 / vi 105,名称集合完全一致。
- 叶子 key:三语各 3842,zh/vi 对 en 缺失 0、多余 0。
- 工程原生镜像脚本:`uniapp i18n mirror PASS: en/zh/vi 4063 keys`(口径含数组元素,同判 PASS)。
- 解析后值层 nexion 残留:en/zh/vi 均 0(与 grep 双重确认)。
- 全量 NexGrid 值语言体检:zh 中 >25 字符且零 CJK(疑英文整句混入)= 0;vi 中 >25 字符且与 en 完全相同(疑未翻)= 0。

10 key 三语抽样(NexGrid 承载 key 交集 104 个,等距抽 10):`intro.title1`、`register.doneSubSolo`、`earn.boostS1Label`、`kycExpress.flow.depositCreditHint`、`trial.confirmPurchaseMessage`、`team.inviteShareText`、`help.askBot`、`bills.subtitle`、`walletV3.complianceHoldBody`、`marketplace.openSeaBack` — 三语内容均语言正确(zh 自然中文、vi 有越语变音符),示例:

```
intro.title1
  en: NexGrid. Compute flows.
  zh: NexGrid,让算力流动。
  vi: NexGrid. Sức mạnh tính toán luân chuyển.
```

NexGrid 承载 key 数 en 109 / zh 104 / vi 109:zh 少的 5 个(`register.doneOfficialDownloadLink`、`riskDisclosure.s2Body`、`milestones.earn1000`、`genesisHowItWorks.perk3Body`、`weeklyQuest.tier1_buy_first_box_cta`)逐条核对为中文措辞合法省略品牌词(如 en "Shop NexGridBox" → zh「去商城」),且 zh 值层 nexion=0,排除漏改可能。

## AC-R3-1 证据(FAIL 定性)

`grep -rniE "nexion" src/ --include="*.vue"` 共 125 命中:

- 117 处 = 注释里的 `Nexion-prototype` 溯源引用(AC 允许)。
- **8 处 = 非注释 live code**,全部是商品图片资产路径(AC 字面只允许溯源注释 → FAIL):

```
src/components/store/product-card.vue:139-143   PRODUCT_PHOTO 映射
src/components/store/product-render.vue:84-86   PHOTO_MAP 映射
  → "/static/img/products/nexionbox-s1-v4.png" / "nexionbox-pro-v2.png" / "nexionrack-p1-v2.png"
```

定性(非环境假阴,回源核实):

- 磁盘物理文件确实仍名 `nexionbox-*/nexionrack-*`(`static/img/products/` 6 个 png,含 2 个 ranking 图),路径字符串是 load-bearing——只改字符串不改文件名会 404。
- 不是模板字符串/显示文案:仅作 `:src` 图片 URL,不渲染为文字;AC-R3-2 运行时 innerText 0 命中佐证。用户仅在 devtools/network 可见 URL,泄露面低。
- 工程 CLAUDE.md 2026-07-22 注记「内部存量标识沿用 Nexion 前缀属白名单」可涵盖资产文件名,但**本次下发 AC 未含该豁免**,故按字面判 FAIL,留上级仲裁。

处置二选一(待实现方/主人裁决):① 重命名 6 个 png + 同步 8 处引用(全量引用面已 grep 全 src 确认就是上述两文件;2 个 ranking 图在 src/ 零引用,唯一引用在 `.trash/` 历史归档里,属 dead asset 可一并改名或不动);② 把资产路径纳入 AC 白名单(与 CLAUDE.md 注记对齐),本条改判 PASS。

## AC-R3-2 证据

- 探活:`curl http://localhost:5173/` 与 `http://[::1]:5173/` 均 200,未重启 server。
- Playwright(工程 node_modules)访问 5 页,URL 均带 `?nx_device=off`(直渲 app 本体),每页确认 `inIframe:false` 且 textLen 665–1821(真实渲染,非白屏假阴):

| 路由 | nexion 命中 | NexGrid 命中 | 正证据摘录 |
|---|---|---|---|
| /pages/index/index | 0 | 12 | 「激活 NexGridRack P2 即可领取 $75.00/d 获取 NexGridBox →」 |
| /pages/me/help | 0 | 5 | 「What exactly does NexGrid do?」 |
| /pages/store/store | 0 | 9 | 「NexGridBox S1 $7.00/天 +40 NEX/天 升级置换」 |
| /pages/me/me | 0 | 1 | 「NexGrid · v3.2.0 · build 6824」 |
| /pages/earn/earn | 0 | 10 | 「限时免费 NexGridBox S1 免费试用 3 天」 |

登录态:默认即已登录(auth-guard-verify.mjs 口径),未注入。

## 清理

- 4 个 `chrome-headless-shell` 孤儿进程已定点清除(0 remaining;桌面 chrome 未触碰)。
- 临时脚本(scratchpad `i18n-check.mjs` / `runtime-check.mjs`)已删除,工程目录未留任何测试产物。
