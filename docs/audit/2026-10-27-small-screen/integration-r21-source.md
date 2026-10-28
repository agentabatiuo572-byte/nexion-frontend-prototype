# R21 APP 正常合并候选 · 源码保留审查

核对时间：2026-10-28 01:24–01:26 JST。仅只读核对 Git/index/文件及既有日志；本次唯一写入为本报告。

**结论：本轮合并保留核对通过，未发现本地已提交内容漏合。当前 worktree 与源树的 src/scripts 一致；当前 index 尚未包含 11 个 owned 文件，不能把现有暂存树当成完整 r21 发布树。**

| 项目 | 实读结果 |
| --- | --- |
| 集成工作树 | `D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate`，detached、合并未提交 |
| HEAD / 第一父提交 | `ddcea906d62e8242815e5af104ac1574bfa486a2` |
| MERGE_HEAD / 第二父提交 | `55075a492acc8cd1db03e7045967d71ddf3a8983`，等于当前本地 `origin/test` |
| 共同祖先 | `27f8f2938367b4e0408924069e535f9d7f9a72d2` |
| index | 无未解决冲突；恰好 50 个钱包提交路径，无额外暂存路径、无遗漏钱包路径 |
| 本地已提交修订 | 相对共同祖先共 190 个净变更路径；其中 182 个非钱包重叠路径的 index blob 全部保持 HEAD 原值 |
| 钱包路径构成 | 42 个非重叠路径与远端 blob 相同；7 个重叠文件保留双方内容；旧钱包页按明确决定删除 |
| worktree 对 index | 恰好 11 个 owned 文件未暂存；集成工作树无未跟踪文件 |
| 源树一致性 | 实跑两组 `git diff --no-index --ignore-space-at-eol`，源工作树与集成工作树的 `src`、`scripts` 均 exit 0；允许行尾差异，不声明逐字节相同 |

## 7 个重叠文件

下列文件均满足：**集成 index = 集成 worktree = 原 APP worktree（Git 规范化内容）**；相对 `ddcea906` 的增量与钱包提交相对其父提交的增量一致。因此并未用远端旧基线整文件覆盖本地修订。

| 文件 | 两侧修订均保留 |
| --- | --- |
| [prototype-preview.html](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/scripts/prototype-preview.html) | 本地 360×780 尺寸选项；钱包任务移除旧钱包/复投选择项；既有客服 start 路由仍保留 |
| [daily.vue](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/src/pages/daily/daily.vue) | 本地重试样式；返回个人中心的新目标 |
| [wallet-bills.vue](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/src/pages/me/wallet-bills.vue) | 本地刷新/分页重试样式；钱包返回目标更新，活动账单分支仍保留 |
| [wallet-cards.vue](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/src/pages/me/wallet-cards.vue) | 本地失败重试样式；页头及 returnToWallet 返回目标更新 |
| [wallet-repurchase.vue](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/src/pages/me/wallet-repurchase.vue) | 本地重试样式；返回目标更新；不恢复已退役的注册入口 |
| [search.vue](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/src/pages/search/search.vue) | 本地搜索恢复控件修订；钱包目标调整 |
| [chat.vue](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/src/pages/support/chat.vue) | 本地历史错误行及 44px 重试布局；WALLET 推荐转到个人中心 |

`src/pages/me/wallet.vue` 在 index、集成和源 worktree 均不存在，是已授权的修改/删除冲突决议，不属于漏合。新 [wallet-overview.vue](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/src/components/me/wallet-overview.vue) 已随远端进入 index，不应恢复旧钱包页。

## 验证与收尾边界

- 已读取 [app-integration-r21.log](D:/WORKS/PLAN/.wt/uvel-design-preview/r20-backend-test/app-integration-r21.log)：运行目录为本 integration 工作树，**7 个文件、116 项通过**，01:22:33 开始；主线程报告 exit 0。本次没有重跑 Vitest，也不把读日志计作新增测试。
- 本次 `git diff --cached --check` 与 `git diff --check` 无错误；仅出现行尾转换提示。
- 11 个未暂存 owned 文件属于导航两文件、首页签到及其行为测试、试用卡、三语 messages、trial-lifecycle 文案、onboarding、ref。最终提交前需按冻结清单纳入；不能只提交当前 50 文件 index 就称包含完整 r21。
- 本任务当前 docs 尚未搬入，符合本轮安排；钱包任务的 consolidation 文档已随 merge 暂存。待主线程补齐明确选定的本任务文档/证据，不夹带 `.cache` 或用户状态文件。
- 该核对证明当前源码合并与源 worktree 一致；r21 构建产物关联及 5268/5269 双审由主线程收口，本报告不另签实景/全站通过。
- 未改产品源码、index 或 Git refs，未 commit/push/build，未操作任何预览服务；H5 继续 hold。后续 push 前仍需重新核对远端，不能将此时的本地 remote-tracking ref 当作未来远端状态。
