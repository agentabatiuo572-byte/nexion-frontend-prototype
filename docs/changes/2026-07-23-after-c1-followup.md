# C1 跑完后的续做工单 —— ✅ 三项已全部执行完毕(2026-07-23)

> **执行结果**(C1 收口后落地,判据逐条核过:allowlist 0 pending · selftest 全过 · verify 绿):
>
> | 项 | 结果 | 关键证据 |
> |---|---|---|
> | **A 哨兵去硬编码设计值** | ✅ 完成 | selftest 全部改为**动态取样 + 关系式断言**(从 tokens.css 反查亮暗异值 token,现算 hex/rgb/rgba/hsl 四种语料);`isAllowed` 加空值保护(取样失败 → probe FAIL 并说明,**不再崩溃**)。🔴 **关键红测**:临时改 3 个 token 值 → selftest 仍 **29/29 全过**(改造前直接崩);种真违规 → 仍 exit 1 抓到,主功能未削弱 |
> | **B 亮色语义色达 AA** | ✅ 完成(**改用 C1 的分档模式**) | 未动 base 值,另立文字档 `--v5-{warning,success,tech-cyan,brand-2}-ink`;B1 闭包内 **140 处前景**(color/stroke/stop-color)改走 -ink,填充/描边/混色保持 base。实测亮色 4.50–4.51(原 1.88–3.73)· 暗色 6.0–13.9 · **填充档色值零变化 → 视觉零回归** |
> | **C 根字号锁定** | ✅ 完成 | `html { font-size: 16px !important }`(uni 注入的是 inline style,必须 important)。实测 375/390/414 三视口 `rounded-2xl` 恒 16px、`mt-3` 恒 12px、`px-4` 恒 16px(原 16 / 16.64 / 17.664);487px 实景复核仍恒定。溢出 diff **新增 0 · 消失 2** |
>
> **机器门**:vue-tsc 0 · verify **323 pass / 0 fail** · token-copy selftest 29/29 · console 0。
> **方案变更说明**:B 项原计划直接加深 base 值,改为沿用 C1 的「填充档 + 文字档」分档 —— 视觉零回归且与设计系统内部模式一致,优于原方案。

---

## 原工单(留档备查)

# C1 跑完后的续做工单(主人 2026-07-23 拍板:等 C1 收口再做)

> 本会话(B1 批次)做到两条架构级时撞上并发的 C1(硬编码颜色 token 化)session,按主人指示**全部暂缓**。
> 分析结论与方案已算好并验证过,本文件是**可直接执行的续做单**——C1 收口后照做即可,不需要回读历史会话。

## 0 · 前置:怎么确认 C1 已经跑完

三条都满足才算收口:

1. `docs/TOKEN-COPY-ALLOWLIST.json` 里**没有 `pending` 字段**的条目(当前有 2 条标着 `pending: "C1 待拍板项 1 — V 军衔色阶是否随主题"`,说明还在等主人裁决)。
2. `git -C D:/WORKS/PLAN/Nexion-uniapp status --short` 里 `scripts/token-copy-sentinel.mjs` 与 `docs/TOKEN-COPY-ALLOWLIST.json` **不再是 untracked/修改中**(已提交或已定稿)。
3. `bash scripts/verify.sh` 全绿,且 `node scripts/token-copy-sentinel.mjs --selftest` 全过。

---

## A · 先改哨兵(主人点名:让颜色值重新可改)

**问题**:`scripts/token-copy-sentinel.mjs` 的自测把**当前设计值写死**在 fixture 里 ——
```js
p("--v5-success@light(#0E8E4A) 入表", true, (table.get("14,142,74") || []).some(...))
p("--v5-warning@light(#C68316) 入表", true, (table.get("198,131,22") || []).some(...))
const hit = scanText(`color: "#0E8E4A";`, "src/a.vue", table)[0];   // ← 改值后返回 undefined
```
后果:**任何人改这些 token 的值,自测立刻崩**(`isAllowed(undefined)` 抛 TypeError),等于把设计值焊死。这与哨兵本意(防"token 值被抄成字面量")无关。

**改法**(保持断言强度不变,只去掉对具体色值的依赖):
1. 自测**从 `tokens.css` 动态读**一个"已知亮暗异值"的 token 名(如 `--v5-success`),取其**当前实际**亮/暗两个值来构造 fixture,而不是硬写 `#0E8E4A`。
2. 断言改成**关系式**:「该 token 的亮色值能被扫出」「其暗色值也能被扫出」「两值不相等」「同值 token(如 `--v5-on-brand-2`)不入表」——这些关系在改值后依然成立。
3. `const hit = scanText(...)[0]` 处加空值保护:取不到就让该条 probe 直接 FAIL 并打印原因,**不要让整个自测崩**(崩溃 ≠ 失败,崩溃会掩盖真实结论)。
4. 改完跑双向红测:①改一个 token 值 → 自测仍全过 ②真种一处字面量违规 → 哨兵仍抓得到。

---

## B · 亮色语义色加深到无障碍达标(值已算好,直接用)

**判据**:vs 亮色三种背景(页面底 `#F4F1E9` / 卡片 `#FFFFFF` / 二层 `#FAF7F0`)取**最差**;二分压 HSL 明度,**锁死色相与饱和度**。

| token | 现值 | 现最差 | → 目标值 | 新最差 | 色相偏移 |
|---|---|---:|---|---:|---:|
| `--v5-tech-cyan` | `#0CC4D6` | 1.88 | `#077A85` | 4.50 | 0.1° |
| `--v5-brand-2` | `#FF5A1F` | 2.76 | `#CD3600` | 4.51 | 0.0° |
| `--v5-warning` | `#C68316` | 2.79 | `#966411` | 4.51 | 0.3° |
| `--v5-success` | `#0E8E4A` | 3.73 | `#0D7F42` | 4.50 | 0.2° |
| `--v5-ink-3` | `#6A6F78` | 4.47 | `#6A6E77` | 4.53 | 3.0° |

- **只改 `:root`(亮色)段,`html[data-theme="dark"]` 块不动**(暗色已全部达标)。
- 🔴 **`--v5-ink-4` 不加深**:禁用/最弱占位层,WCAG 2.1 §1.4.3 对 disabled 文本明确豁免;实算压到 4.5 会得 `#696E79`,与 ink-3 的 `#6A6E77` 几乎重合 → **文字层级体系被摧毁**。它的真问题是「被拿来承载正文」的**用法错**(全站约 106 处),归横切批次逐处改用法为 ink-3。此结论已写进 `tokens.css` ink-4 上方注释。
- **用途影响已评估**(文字/填充各约一半):填充变深 → 其上白字对比度**提高**,无害;`*-soft` 变体是浅 tint 不受影响。
- **验证**:改后浏览器实测双主题对比度(算法先用 `#000/#fff=21`、`#767676/#fff=4.54` 双基准自检)+ 五 tab 截图对比 + `verify.sh` 全绿。

---

## C · 修「间距圆角随屏幕拉伸」(方案已验证前提)

**现象**(main 亲测三视口):uni-app H5 运行时在 `<html>` 注入 `font-size: 16 × 视口宽 / 375`;UnoCSS 预设刻度类输出 rem → **全站间距/圆角随视口线性拉伸**。

| 视口 | 根字号 | `rounded-2xl` 实测 | 规范意图 |
|---|---|---|---|
| 375 | 16px | 16px | 16px |
| 390 | 16.64px | 16.64px | 16px |
| 414 | 17.664px | 17.664px | 16px |

后果:规范的 8pt grid / 圆角阶梯**只在 375px 视口成立**;且同屏两套单位并存(inline `16px` 与工具类 `16.64px`),是**当前已存在的视觉不一致**。波及 ~550 处工具类。

**前提已证实**:该 rem 适配机制服务的单位在本项目 **0 处使用**(`grep -rn "rpx" src/` = 0),纯属副作用。
**字号不受影响**(UnoCSS 字号任意值输出 px 字面量,且全站仅 14 处)。

**改法(ponytail 阶梯:能一行别加依赖)**:全局 CSS 固定 `html { font-size: 16px }`。
- 代价:非 375 视口下全站间距/圆角**收紧约 10%**(回到规范值),视觉更紧凑。
- 备选(不推荐):装 `@unocss/preset-rem-to-px` —— 精准但新增依赖。

**🔴 受控实验步骤(必须做,这是全站 88 页的改动)**:
1. 改前采基线:`node scripts/overflow-probe.mjs --out docs/OVERFLOW-BASELINE.json`,并对五 tab 双主题截图存档。
2. 改一行 → 实测三视口(375/390/414)下 `rounded-2xl`/`mt-3`/`px-4` 是否恒定。
3. `node scripts/overflow-probe.mjs --diff docs/OVERFLOW-BASELINE.json` 判无新增溢出。
4. 五 tab 双主题重截图,与步骤 1 并排对比 → **给主人过目再定是否保留**。
5. `verify.sh` 全绿 + console 0(干净上下文,避开热更新中间态假错误)。

---

## 执行纪律(三项通用)

1. 判门结论**禁用管道**:`cmd > log 2>&1; echo exit=$?`(用 `| head` 会拿到 head 的退出码,真失败显示通过)。
2. 察觉异常先跑**已知答案探针**证伪自己的工具,再下结论。
3. 改前采基线、改后 diff;**verify 绿 ≠ 渲染 OK**,必须浏览器实景 + 干净上下文看 console。
