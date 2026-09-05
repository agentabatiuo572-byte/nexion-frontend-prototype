# NexGrid 全局改名 + 新设计系统对齐 · Change Proposal

- **工作线**:④ uniapp(dev:h5 即 H5 端,双端同源一次覆盖)
- **日期**:2026-07-22
- **状态**:Aligned(2026-07-22 主人签字:按此执行,R→B 连续推进)
- **定级**:L

## Why
产品品牌从 Nexion 更名 NexGrid,uniapp/H5 先行;同时以 `UI/规范/` 11 册新设计系统为基线,启动「规范先行·代码渐进」拍板中悬置的代码对齐(00-索引已点名 radius/space/line-height 阶梯与 reduced-motion 两项欠账)。

## What changes

### 批次 R · 全局改名(主人已拍板的映射)
| 旧 | 新 | 备注 |
|---|---|---|
| Nexion(三语文案/标题/logo/图) | NexGrid | 全镜像 |
| NexionBox S1 / Pro / Pro v2 | NexGridBox S1 / Pro / Pro v2 | 显示名 |
| NexionRack P1 / P2 | NexGridRack P1 / P2 | 显示名 |
| nexion.ai(短链/官网/下载 mock 域) | nexgrid.ai | |
| @demo.nexion.ai(账号标识域) | @demo.nexgrid.ai | 演示数据作废重建 |
| NEXION-*(邀请码样例) | NEXGRID-* | |
| 存储键 `nexion-*-vN` | `nexgrid-*-vN` | 🔴 主人拍板改;**无迁移垫片**,本地演示数据作废重建 |
| `__nexionAuthDev` / `--nexion-header-h` 等运行时标识 | `__nexgridAuthDev` / `--nexgrid-header-h` | 同批去 Nexion |
| NEX 代币 / $NEX / wallet-nex 路由 | **不变** | 主人拍板,NexGrid 仍含 Nex 词根 |
| 含 Nexion 字样图片(logo×3 + 产品渲染图等) | gen:image 重做 / logo 评估 SVG 文本化 | 主人拍板生图管线 |

**白名单(不改)**:内部设备 id `stellarbox-*/stellarrack-*`(不含 nexion,上轮改名前例保留);仓库/目录名 `Nexion-uniapp`;repo 内 PRD 副本(push 脚本 root→repo 单向覆盖,直接改会被冲掉);历史文档(docs/changes/*、PORT-LEDGER、PORT-PITFALLS、更新日志存量条目)与溯源注释("Ported from Nexion-prototype");图片文件名(路径级标识)。

### 批次 B · 设计系统对齐(全量分批,批间可停)
- **B0 基建**:tokens.css 落 radius/space/line-height 阶梯 token + 全局 reduced-motion 降级 + 字号 9 档→14 档映射表落盘(经主人过目再铺开)。
- **B1 五 tab 主链路** → **B2..B8 子页分组**(~10 页/批,共 90 页):每批按 11 册 rubric 审查 → 整改 → 独立走查评分 ≥95。

### Out of scope(明确不做)
- admin 工程 / 根 PRD 正文 / janus / 运营文档 / 根 CLAUDE.md 路由表的改名 —— 后续批次;PRD 品牌词替换在 P7 收尾单独请示。
- NEX 币名、目录/仓库名、内部设备 id。
- admin 全量改名;若跨仓镜像哨兵(sku-field-mirror 类)比对显示名而变红,只外科同步 admin 侧镜像值。

## Impact
- **页面/路由**:改名内联触达 ~30 页/组件;设计批覆盖全部 90 页。
- **Store/model**:~40 个 store 持久键改名(结构不变,mock 仍 100% backend-replaceable);无迁移垫片。
- **i18n**:zh/vi/en 三语 ~334 处品牌词;键名含品牌词的连同调用点改,三语同序镜像不破。
- **scripts/哨兵**:uniapp 全部走查/verify 脚本重焊(键名 + 文案断言 needle);admin 跨仓哨兵见 out-of-scope 条。
- **设计**:B 批以 `UI/规范/` 11 册 + V5 token 为准;实现前置 nexion-design + v5 SKILL。
- **PRD 章节**:品牌词全文替换,P7 请示后走 nexion-prd-sync。
- **不变量风险**:三语镜像 / mock 可接真 / 0 meta / on-brand 文字色 / 数字可信(改名不碰数值口径)。

## Done-when(P6 逐条回测)
- [ ] R:运行时三语全站(全部注册路由)DOM 文本扫描 `nexion` 命中 = 0(大小写不敏感);肉眼抽查五 tab + 关键子页无残留。
- [ ] R:`grep -ri nexion src/ scripts/` 仅剩白名单(溯源注释);tsc 0 + `bash scripts/verify.sh` 全绿;注册→购买→重进全链在新存储键下自洽。
- [x] R:标题/manifest/logo/产品图全部呈 NexGrid,0 张在用图片含 Nexion 字样。(2026-07-23 收口:最后 2 张设备渲染图本地合成重制,见 plan R6)
- [ ] B0:tokens.css 阶梯 token + 全局 reduced-motion 落地,verify 全绿,字号映射表主人过目。
- [ ] B1..B8:每批 11 册 rubric 逐维证据齐 + 独立走查评分 ≥95 + console 0(逐批打勾,见 plan.md)。
