在 `D:\WORKS\PLAN\Nexion-uniapp`(uni-app Vue3 前端,`npm run dev:h5` → 5173)执行「**C2 零-border 铁律 · 第二轮**」。

先加载 `nexion-workflow` 判线定级,再加载 `nexion-design`(UI 铁律)与 `nexion-uniapp-port`(本工程四阶段闭环)。

## 背景(不必重读历史会话)

横切专项批次:C1(硬编码颜色 token 化)已收官;C2 第一轮做完了**五个主 tab + 几个关键子页**,独立验收 82.7 不通过,已按验收 findings 修完并把机器门补全。**第二轮 = 消化全站剩余 78 处。**

**必读证据(按顺序)**:
- `docs/changes/2026-07-23-c2-verdicts.md` —— C2 裁决台账(口径、第一轮已修 13 处、验收 findings 逐条裁决、未完成清单)
- `docs/changes/2026-07-23-c2-acceptance.md` —— 独立验收报告(它找到的问题比台账更狠,重点看 B3/B4/C2/E1)
- `D:\WORKS\PLAN\UI\规范\03-空间圆角边框分层规范.md` §3/§4 —— **唯一判据来源,自己回源读,别信转述**
- `docs/ZERO-BORDER-BASELINE.json` —— 78 条 full 就是你的工作清单(标注「存量,C2 第二轮消化」= **不是批准保留**)

## 现成的工具(已建好,直接用)

`scripts/zero-border-gate.mjs`(已接 `scripts/verify.sh`):
- **运行时**判定,扫 `pages.json` 全量 88 路由 × 双主题
- 违例 = 元素**自身有可见填充**(bg alpha ≥0.03 或有渐变)**且有可见描边**(`border` / `box-shadow` 的 `0 0 0 Npx` 环 / `outline`)
- 分级:`full`(≥3 边或 ring/outline)进硬门;`partial`(1-2 边)只记录**不做合规断言**
- 三条内建豁免,**判据均出自规范原文**:① chrome 身份(TabBar/Header/浮层)② dashed/dotted(empty-state 虚线)③ ≤16px 圆形「隔离描边环」
- `--selftest` 26 条双向红测 · `--list` 看清单 · `--update-baseline` 重建基线

用法:
```bash
node scripts/zero-border-gate.mjs --selftest    # 先确认门本身没坏
node scripts/zero-border-gate.mjs --list        # 出工作清单
```

## 任务

把基线里 **78 条 full** 逐个判「真问题 vs 规范教条」并整改,目标是基线**只缩不涨**。
按组件去重后的高频形态:`.nx-vbadge` 军衔徽章 · 状态角标(`WITHDRAWN`/`UNLOCKED`/`COOLING`)· `.entry-action--ghost` 入口按钮 · 各类圆形头像/图标容器 · `.ks-card` · 欢迎礼卡。涉及 **39 条路由**。

改法就一条:**带 bg 填充的容器删掉 border**(层级靠 surface 微差色)。个别需要保留边界感的,用「加厚底色差 / 内阴影」替代描边,不要靠描边。

## 🔴 已知待拍板(别自己动,主人未裁)

**创世「金-曜石」域**:genesis hero(357×232)+ Claim seat 吸底 CTA(358×54),暗曜石底 + 金色描边。
组件文件头自称设计例外,但那句写于 2026-07-09「有条件例外一律收回」终裁之前。删金边会改变 $11,999 旗舰品主视觉身份 = 设计决策。**保持现状,在收尾汇报里再向主人要一次裁决。**

## 🔴 硬性纪律(上一轮就是栽在这几条上,逐条看)

1. **防洁癖**:每条违例先自问「真影响用户,还是规范教条」。判为教条的**单列一节不修**,别为凑数改。
2. **🔴 门是用来量的,不是用来配合结论的**。上一轮我把一个真违例(实底+标准描边的圆片)加进 chrome 豁免正则让它过门——**这是最严重的失误**。发现某处过不了门,先问「是它错还是门错」,回源规范定,**绝不为放行改判据**。真要豁免 → 写进 `docs/ZERO-BORDER-ALLOWLIST.json` 并附 reason(selftest 校验 reason 必填),留痕不是绕过。
3. **🔴 改颜色/底色前必须先实测对比度**。上一轮我把一个按钮从「白底红字」改成「浅红底红字」,自以为更规范,实际对比度从 4.71 掉到 3.73(反而不达标)。**零 border 是删描边,不是换底色——别做多余动作。**
4. **验证工具自身要先证伪**:跑任何结论前先跑已知答案探针(黑白对比度应 = 21.00)。算「有效背景」时两个坑:①渐变底在 `background-image` 里,`backgroundColor` 是透明 ②半透明层要**逐层 alpha 合成**。这两个坑上一轮各踩一次,都产出过假结论。
5. **判门结论禁用管道**:`cmd > log 2>&1; echo exit=$?`,不要 `cmd | head` 后读 `$?`(会拿到 head 的退出码,真失败会显示通过)。
6. **改前采基线**:`node scripts/overflow-probe.mjs --out docs/OVERFLOW-BASELINE.json`,改完 `node scripts/overflow-probe.mjs --out /tmp/a.json --diff docs/OVERFLOW-BASELINE.json` 判有无新增溢出。删 border 最可能的副作用是**卡片糊进背景**,必须双主题实景看。
7. **机器门**:`npm run type-check` 0 错 + `bash scripts/verify.sh` 全绿(当前基准 **323 pass / 0 fail**);**verify 绿 ≠ 渲染 OK**,必须 browser 实景 + 干净上下文看 console。
8. **验收独立性**:实现方≠验收方,完成后派独立 agent 验收打分(≥95 才算过)。

## ⚠️ 并发会话

**另有会话正在同一个仓库工作**(在做亮主题文字对比度/on-color 那条线,已新增 `--v5-on-quest` / `--v5-success-ink` / `--v5-warning-ink` 等 token)。
纪律:**用内容匹配的局部 Edit,禁整文件 Write**;改 `tokens.css` 前先读最新内容;`git diff` 里拿不准归属的改动标「归属存疑」,别算到自己头上,也别覆盖对方的。

## 已知盲区(门抓不到,靠人看)

`::before` / `::after` 伪元素画的边框 —— 独立验收注入测试确认门漏。第二轮遇到「看着有边但门没报」的,往这里查。
