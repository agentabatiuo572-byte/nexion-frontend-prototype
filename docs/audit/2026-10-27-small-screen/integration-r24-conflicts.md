# R24 四处冲突决议 · 有界读回

2026-10-28 JST。仅核对 integration 的前端日志与 zh/en/vi 三份语言文件；未审其余远端文件、未运行测试或构建。

**结论：四处冲突决议未发现关键内容丢失。本地短文、USDT、homeClaimShort 保留；远端手机 App/iPhone 文案完整进入候选；相关引导不再限定 Android。**

- 工作树：`D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate`。
- HEAD：`78e81a1e396d567eea4467edb0b805e66f929a2d`；MERGE_HEAD / 本地 origin/test：`e10f682590350882d65dbdcd150db540b3a07f08`；共同祖先：`80e18f8f6772a63ad3a5c2421f7b1cd17227a517`。
- 四个文件均已解冲突且无未暂存差异；三语 index 与 worktree 内容一致。限定四文件的 `git diff --cached --check` 无错误。

| 核对项 | 实际结果 |
| --- | --- |
| [前端产品更新日志](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/docs/前端产品更新日志.md) | 本地 HEAD 的 2476 个非空行、远端的 2450 个非空行均按各自原顺序保留。首页/签到、小屏历史、FEAT-TRIAL05 与新增 iPhone 支持段均存在，无整段择一覆盖。 |
| `phoneActivationAppOnlyTitle` | zh「手机本机算力」、en「On-device phone compute」、vi「Tính toán ngay trên điện thoại」均与本地 HEAD 相同。 |
| `techEarningsCurrency` / `homeClaimShort` | 三语币种均为 `USDT`；短领取标签分别为「领取 / Claim / Nhận」，均与本地 HEAD 相同。 |
| 邀请 perks 短文 | `always`、`sponsor` 三语均保留本地短文；`day1` 保持精简，并将 Android 指向改为手机 App，不恢复远端较长句式。 |
| 远端手机 App 含义 | `webSetupDefer`、`webSetupNote`、`webSetupReadOnly`、`phoneActivationAppOnlyBody` 三语均与远端对应字段完全一致；这些字段及 `perks.day1` 中均无 Android 限定。 |
| 新 iPhone 校准字段 | 每语言 17 个 iOS 校准/待核验相关字段均与远端一致，无缺项或值漂移，包括识别机型、校准结果、稍后激活及未成功不产生算力/收益的提示。 |

三语来源：[zh.ts](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/src/i18n/messages/zh.ts)、[en.ts](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/src/i18n/messages/en.ts)、[vi.ts](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/src/i18n/messages/vi.ts)。

`perks.day1` 最终读回：

- zh：在手机 App 校准并激活手机算力。
- en：Calibrate and activate phone compute in the phone app。
- vi：Hiệu chỉnh và bật tính toán trên ứng dụng điện thoại。

上述核对只证明四文件冲突合并保留正确，不签 iPhone 原生实现、全站或业务评分。主线程通报 7 文件 111/111 已通过、type/build 进行中；本次未复跑或更新其运行状态。未修改源文件、index、Git refs，未 commit/push；唯一写入为本仓外报告。
