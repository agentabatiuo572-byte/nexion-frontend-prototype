# NexGrid 横切专项批次 · 新 session 起手 prompt

> 用法:主人新开一个 session,把下面 **「起手 prompt」** 整段贴进去即可。
> 背景与证据全在文中引用的报告里,新 session 不需要本次会话的上下文。

---

## 起手 prompt(整段复制)

```
在 D:\WORKS\PLAN\Nexion-uniapp(uni-app Vue3 前端,dev:h5 → 5173)执行「设计规范横切专项批次」。

先加载 nexion-workflow 判线定级,再按需加载 nexion-design(UI/文案铁律)与 nexion-uniapp-port(本工程四阶段闭环)。

## 背景(不必重读历史会话)
2026-07-22/23 已完成两件事:①产品品牌 Nexion→NexGrid 全站改名(已收口)②B1 批次:五 tab 主链路按 `D:\WORKS\PLAN\UI\规范\` 11 册做设计对齐。
B1 独立评分 81.9/100(<95 未达标),未闭合项经判定**多为全站系统性问题而非五 tab 独有**,故拆成本专项批次逐类清。

必读证据(按顺序):
- `docs/changes/2026-07-22-b1-verdicts.md` —— main 逐条回源裁决台账(含已修清单、教条项、我方失误记录)
- `docs/changes/2026-07-22-b1-score.md` —— 独立评分 6 维明细与扣分点
- `docs/changes/2026-07-22-b1-skeptic-completeness.md` —— 「修一处/全站同类」扫描,**每类的漏修位置清单在这里**
- `docs/TYPO-MIGRATION-MAP.md` —— 字号 9→14 档映射与判定线(主人已批准)

## 任务:按类横切,一类一批,批间可停

每批独立走:摸全站同类 → 逐处判「真问题 vs 规范教条」→ 整改 → 机器门 → 独立验收 → 打勾。
**不要一次全开**,按下列优先级顺序,每批做完向主人汇报再开下一批。

### C1 · 硬编码颜色 token 化(优先)
- 全站扫 `color/background/border/fill/stroke/stop-color` 直接跟 `#hex` 或 `rgba()` 字面量。
- 🔴 判定重点:**该值是否是某个 token 的字面副本**?是 → 必改(暗色主题下 token 会变、硬编码不变 → 双主题必失配,这是真 bug 不是洁癖)。
- 已知豁免:canvas 海报绘制(非 CSS)、已 token 化的 `--v5-quest-violet/-ember`。
- 配套:`scripts/verify.sh` 的硬编码色哨兵**目前只钉 4 个色号且只认 `#RRGGBB` 不认 `rgba()`**,已被绕过过(见 `purchase-ticker.vue` 注释里自陈「特意挪值以免触发哨兵」)。本批必须把哨兵补全并做双向红测。

### C2 · 零 border 铁律(带 bg 填充的容器不得描边)
- 依据《03》§6。全站同类约 77 处(清单见 completeness 报告)。
- 豁免:全局 chrome(header/tabbar/玻璃砖)、透明容器的 hairline 分隔线、empty-state 虚线、徽章的「隔离描边环」(如状态点用页面底色描边做分隔,属技法不属卡片描边)。
- 配套哨兵:现有零-border 自检**只扫 `src/pages/`,不覆盖 `src/components/` 根**——本批补全扫描面。

### C3 · 触控尺寸 ≥44pt + 按下反馈
- 依据《07》tap≥44 与《08》§2(禁 hover 做移动端反馈)。
- 🔴 方法纪律:**必须用 CDP `CSS.forcePseudoState` 实测**,不要用 `document.styleSheets` 枚举——后者在 CSS Nesting 下会漏读 `:active` 规则,曾导致「全站零按下反馈」的假 P0。
- 排除:遮罩/面板容器上的 `@click.stop`(纯阻止冒泡,无需反馈)、toast(点击只为消失)。

### C4 · 硬编码文案 i18n 化
- 全站扫代码里的中文/英文字面量兜底(`|| "..."`、placeholder、aria-label)。
- 排除注释与溯源说明。三语键必须同序镜像(`node scripts/i18n-key-mirror.mjs` 是硬门)。
- 注意:插值占位符跨语言天然不同(英文复数标记等),该脚本的占位符检查是 INFO 级不是硬门,别去「修」那些差异(理由见 `docs/PORT-PITFALLS.md` P-055)。

### C5 · 缺省页体系(《06》7 种空状态)
- 现状落地率约 0%。按《06》逐类补,优先转化链路上的空态。

## 硬性纪律(每批都适用)
1. 🔴 **防洁癖**:每条违例先自问「真影响用户,还是规范教条」。判为教条的**单列一节不修**,不要为凑数改。
2. 🔴 **验证工具自身要先证伪**:本轮多次出现「批量运行时捞取 → 大量假阳性」。察觉异常先跑「已知答案探针」,优先怀疑自己的工具而非产品。
3. 🔴 **判门结论禁用管道**:`cmd > log 2>&1; echo exit=$?`,不要 `cmd | head` 后读 `$?`(会拿到 head 的退出码,真失败会显示通过)。
4. 🔴 **改前采基线**:`node scripts/overflow-probe.mjs --out docs/OVERFLOW-BASELINE.json`,改完 `--diff` 判有无新增溢出。
5. 🔴 **哨兵 pin 的值若是违规本身**(如 pin 了硬编码 hex),要连哨兵一起升级到正确形态,不是绕过。
6. 机器门:`npm run type-check` 0 错 + `bash scripts/verify.sh` 全绿;**verify 绿 ≠ 渲染 OK**,必须 browser 实景 + 干净上下文看 console(HMR 中间态会产生假错误,用新标签页复验)。
7. 验收独立性:实现方≠验收方,每批完成派独立 agent 验收打分。
```

---

## 补充说明(给主人看,不必贴进新 session)

- 五个批次**可以独立并行开 session**,彼此不冲突(C1 改色、C2 改边框、C3 改尺寸/交互、C4 改文案、C5 加空态)。但同一批内不要并行改同一文件。
- 建议顺序:C1 → C2 → C3 → C4 → C5。C1 优先是因为它含**真 bug**(双主题失配),其余偏规范一致性。
- 每批预计规模:C1 约 18 处真违规(另 170 处判豁免)· C2 约 77 处 · C3 约 16 处尺寸 + 26 处反馈 · C4 约 41 处 · C5 全站空态体系。
