# 2026-08-15 · 全站焦虑文案收口（pkg/zk-anxiety-copy）

状态：**Shipped**（主人 2026-08-15 拍板：范围 A + 机器门 A；两点修正 ① 作弊风控类用严肃文案不软化 ② 文案从简、排版无孤字断行；补充修正：侦测类不点名具体原因，用「行为异常，提现失败」式笼统严肃表述。已合入主线 56d46fa；PRD 已同步 8 处用户话术表述，机制描述保留）

## Why

2026-08-11 commit `34eee7f` 只在提现域改了「保护你」口吻（三语 47 处）。本次全站扫描（4 agent 三语词典全量 + 硬编码 + mock，主会话回源抽验）发现同性质残留 11 族：约 95 个 i18n key ×3 语 + 9 处代码收口点 + 2 个死文件，集中在注册礼、充值域、风控话术、「合规审查」词族。另有结构性问题：提现页 `riskNoticeBody` 优先渲染风控原因码表，已批安抚文案仅是空码表时的兜底。完整清单：会话附件 `2026-08-15-anxiety-copy-scan.md`（11 族总表）。

## What changes（范围 A）

1. **T1 机器门先行**：`scripts/anxiety-copy-gate.mjs`（照 `i18n-copy-residue-gate.mjs` 惯例：剥注释、只扫字符串值、候选下限判红、`anxiety-exempt: <理由>` 行内豁免）+ 挂 verify.sh；对存量先红，随族收敛到绿；收尾变异红测。
2. **T2 族1 风控话术**（严肃笼统版）：侦测类原因（dim-*/cluster/line/score/shared-address）归并为「行为异常」式严肃句，不点名侦测细节，带客服出口；`riskReasonLines` 消费侧去重（多码命中同句不重复拼接）；保留 new-address-hold / first-withdrawal-review / unbound-free-slot / bare-identity 保护性好句；statusFrozen /「risk-hit」措辞去内部术语。
3. **T3 族2 注册礼**、**T4 族3 钱包提现残留**、**T5 族4 合规词族+族7 兑换**、**T6 族5 充值域+族6 换地址**、**T7 族8 工程话直出+族10 杂项**：按清单三语改写。正常用户路径 = 简洁安抚（时限从配置插值）；法务威慑条款（terms.s7/s8、riskDisclosure.s6）保留原语气只换内部术语词。
4. **T8 族9 代码收口 9 处**：失败兜底一律走 i18n 人话（新增 serviceUnavailable 类 key），原始 message/错误码只进日志；download.vue 判断顺序修正；order-detail 取消 toast、support-tickets 6 处英文硬编码进三语词典。
5. **T9 族11 死内容**：`mock/faq.ts`、`mock/tickets.ts`（连带 `conversations.ts`、`weekly-quests.ts`）Move `.trash`；`complianceBanner.*` 三语死 key 删除。
6. **文案纪律（全部改写共用）**：状态标签 ≤6-8 字；正文尽量一句话；数字+单位原子不断行；改动面实景查孤字/两字尾行。

## Out of scope

- 不改状态机/路由/风控判定逻辑（仅 riskReasonLines 展示去重属显示层）；不改后台 admin 文案（运营面允许内部术语）；不动破坏性动作的刻意摩擦（注销/解绑确认）；不动绑卡 commit 流程内的法务披露结构。

## Impact

- 面：注册完成页、钱包、提现表单/追踪、充值三通道、兑换、换地址、套餐结算、商城错误态、会话踢出、工单、通知推送。
- store/逻辑：`lib/risk-reason-text.ts`（去重）、族9 的 9 个文件错误兜底路径。
- PRD：纯口吻改写，功能契约/参数/状态机不变 → 收尾按流程问主人是否同步（预计极小 diff）。
- 跨仓：admin D2 拒绝原因码表同源但运营面文案独立，不动。

## Done-when（P6 逐条回测）

1. `anxiety-copy-gate` 挂进 verify.sh，全站命中 0（豁免均带理由）；变异红测：塞回「人工审核」→ 红，恢复 → 绿；注释里塞 → 绿。
2. 三语词典 + src 字符串字面量剥注释后禁词命中 = 0。
3. 提现/充值/注册/钱包四面 browser 实景：无内部术语、console 0、无孤字断行（截图留档）。
4. 族9 至少 3 处注入失败实测：UI 显示 i18n 人话，非原始码。
5. `vue-tsc` 0 · `verify.sh` 全绿（worktree 独立端口 + 显式 BASE_URL）· i18n 三语镜像 PASS。
6. 死文件/死 key 清除后全站引用 grep = 0。
7. 多风控码同时命中时提示不重复拼接（构造多码场景实测）。

## 实施拆解

- [x] T1 焊 anxiety-copy-gate + 挂 verify.sh + 基线命中清点（基线 102→扩表 118→0；红测 3/3：值变异红/注释绿/豁免绿，基线复绿）
- [x] T2 族1 风控话术（严肃笼统「账户行为异常」，主人 2026-08-15 拍板不点名侦测原因）+ riskReasonLines 去重 + statusFrozen/risk-hit
- [x] T3 族2 注册礼三语（审核/锁定 → 确认中/自动到账）
- [x] T4 族3 钱包/提现残留三语（批次1 内完成）
- [x] T5 族4 合规词族（含 terms/riskDisclosure 词替换、合规中心→NexGrid Ltd.）+ 族7 兑换（耗尽→额度用完）
- [x] T6 族5 充值域（人工核对→核对入账；do_not_honor→人话）+ 族6 换地址（冻结→保护期 ×5）
- [x] T7 族8 工程话转人话 + 族10 杂项（绑卡推送对齐 Model A；敬语统一「你」；注销流程 4 处 anxiety-exempt 豁免）
- [x] T8 族9 代码收口 9 处（原始 message/错误码只进 console；新增 serviceUnavailable 族 4 key；wallet.vue 沙箱面按验收需要保留原始码，见 Impact 附注）
- [x] T9 族11 死内容清理（faq/tickets/conversations/weekly-quests → .trash/20260815-anxiety-copy；complianceBanner 三语删除）
- [x] T10 全量门 + 实景走查 + 独立验收（verify 445 过/1 红=基线既有 platform-anchor sed 环境差异与本包无关；独立 tester 7/7 AC 全过含孤字检测器红测；主会话三语实景抽验提现/钱包 console 0）
- [x] T11 对抗审计 + 修复（skeptic 2×P0 + 1×P1 + 7×P2：dustHoldNote 入账承诺改为「结果以账单为准」诚实版；bank pane fallback 补人话修「VIETQR_CREATE_FAILED 必弹」；addSuccessBody 三语「冻结」漏网补齐；孤字探针路由 5→10 补齐改动面；豁免正则加固 ≥6 字理由；checks/ 孤儿重复测试文件入 .trash。P2 遗留 4 条见下）+ 三处收尾记录 + 合并回主线

**审计 P2 遗留台账**（非阻塞，后续按需收）：① `security.opFailed` 跨 10 处复用致反馈精度下降（原「未创建工单」等细分信息合并为通用句）；② wallet-bills 复用「余额不受影响」文案在只读页轻微文不对题；③ topup-card-form `failureReason` ref 只写不读（死状态）；④ 三语语义等价无机器门（本次 dustHoldNote 漂移即此洞，镜像门只验 key 存在性）。

**T8 附注**：`wallet.vue` 的资金沙箱错误面（仅显式 `VITE_NEXGRID_API_MODE=sandbox` 可达，生产默认 remote 不可达）**有意保留原始错误码**——那是验收工程师的诊断面，人话反而降低排障效率。
**机器门口径**：三语禁词表含 zh（人工审核/复核/核对/处理·待审线·冻结线·风险评分·合规审查·合规中心·风控·审核·审查·核查）/ en（manual|under|pending|for|after review·reviewed·risk control|review|score·compliance review·awaiting approval·do_not_honor）/ vi（duyệt 除 trình duyệt·kiểm soát rủi ro·điểm rủi ro·rà soát tuân thủ·thủ công）。
