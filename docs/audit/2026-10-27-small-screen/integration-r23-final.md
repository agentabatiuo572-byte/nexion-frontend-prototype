# R23 FEAT-TRIAL05 合并保留复核

2026-10-28 JST。只读核对 `D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate` 的实际 index/worktree、提交对象及现有验证日志；不扩大提前购买功能审查。

**结论：13 个远端路径已完整合入，未发现本地提交增量丢失。三语短文、试用页紧凑重试字体及双方日志均保留。两项 Node contract 红项可确认为合并前已存在的旧源码字符串断言不匹配，仍记录为红，不修改测试换绿。**

## 合并保留

| 项目 | 实际证据 |
| --- | --- |
| 父提交 | HEAD `b3fdfd5f09deef7326ea1ac82a890b01f53d72b6`；MERGE_HEAD / 本地 origin/test `80e18f8f6772a63ad3a5c2421f7b1cd17227a517`；共同祖先 `55075a492acc8cd1db03e7045967d71ddf3a8983` |
| 13 路径 | staged 改动恰为远端 13 路径，无缺漏或额外路径：2 PRD、1 产品日志、3 scripts、2 API、1 i18n、2 pages、2 store |
| 无重叠部分 | 9 个远端独有路径的 index blob 与远端相同；本地 783 个净变更路径中的 779 个非重叠路径全部保留 HEAD blob |
| 4 个重叠路径 | 试用生命周期 PRD、前端产品更新日志、trial-lifecycle.ts、trial.vue；前三方内容逐项核对见下文，无未解决 stage |
| 静态检查 | `git diff --cached --check` 无错误；没有运行新测试、构建或浏览器操作 |

- [trial-lifecycle.ts](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/src/i18n/trial-lifecycle.ts)：本地三语 `cardActiveTitle/cardGraceTitle/cardCapacityFull/cardManage` 保留，包括“队列已满，先腾出1位”；远端早购文案完整加入。双方相对共同祖先的增删行，与合并后各自增量逐项一致。
- [trial.vue](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/src/pages/me/trial.vue)：本地 `.trial-read-retry` 的 `font:600 13px/20px var(--font-v5)` 及 44px 触区保留；远端新增早购展示/读回相关增量保留。该文件双方增删行同样完整一致；不对新增功能作额外正确性签核。
- [试用生命周期 PRD](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/PRD/UVEL_试用生命周期与队列_20261027.md)：双方增删行完整保留。
- [前端产品更新日志](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/docs/前端产品更新日志.md)：手工解冲突后，HEAD 的 2471 个非空行及远端的 2446 个非空行均按各自原顺序保留；FEAT-TRIAL05 标题出现一次。不存在整块选 ours/theirs 导致另一方消失。

## 两项旧 Node contract 红项

| 失败点 | 合并前后确认 | 分类 |
| --- | --- | --- |
| [final-commerce-closure-contract.test.mjs:56](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/scripts/final-commerce-closure-contract.test.mjs:56) 要求 `const successBody = t.value.bundle.checkoutSuccessBody` | [bundle.vue](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/src/pages/store/bundle.vue) 的 HEAD/index blob 均为 `4d234eed90b4c76b7b4628b5a78ba25c721b1b67`。该断言合并前后完全相同，预期旧串两边均不存在；现代码使用 `fmt(t.value.bundle.checkoutSuccessBody, ...)` | 既有静态断言漂移；本次 merge 未引入 |
| [h2-trial-remote-api.test.mjs:159](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/scripts/h2-trial-remote-api.test.mjs:159) 要求 `<TrialHeroBanner class="w-full"` | [earn.vue](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/src/pages/earn/earn.vue) 的 HEAD/index blob 均为 `03c2d479b11c8324155955f82dc4c647838c84eb`。断言从旧行155移至159，文本未变；预期旧串两边均不存在，当前设备区使用 EmptySlotsHint | 既有静态断言漂移；本次 merge 未引入 |

这里只静态核对同一断言与同一产品 blob，不重新执行测试，也不据此签整个 bundle/earn 功能通过。

## 已有验证和剩余事项

- 已读 [app-remote-merge-r23.log](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-backend-test/app-remote-merge-r23.log) 及 exit 文件：4 文件、107 项通过，exit 0。
- type/web 的对应 exit 文件均为 0；[app-native-r23.log](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-backend-test/app-native-r23.log) 已出现 `DONE Build complete`，对应 exit 文件也为 0，读取时已不再是运行中。仅资源编译，不代表真机验收。
- [app-contract-r23.log](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-backend-test/app-contract-r23.log)：12 项，10 pass / 2 fail，exit 1；以上两红真实保留。不能将此批次报成全绿，也不与 107 项相加伪称单次全量。
- 复核开始时 worktree 与 index 一致；复核末尾观察到 `docs/audit/2026-10-27-restart-handoff.md`、`docs/audit/2026-10-27-unified-delivery.md` 两份文档有并行未暂存修改。无新增产品差异或冲突；主线程提交前应确认这两份文档是否纳入，不能把本报告的 index 内容结论扩展为包含其尚未暂存版本。
- 未发现本次合并新增阻断问题；两项旧 contract 红项及此前限定的实景/H5边界继续保留。本轮未改变原 APP、integration 产品/index/Git refs，未 commit/push；唯一写入为本仓外报告。
