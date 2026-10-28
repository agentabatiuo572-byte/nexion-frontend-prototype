# R22 提交前有界源码复核

2026-10-28 JST。对象：`D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate` 的实际 index 与 worktree。仅核对暂存范围、合并保留、源树一致性及最新验收记录；未重跑测试、构建或历史截图矩阵。

**结论：未发现本轮提交内容遗漏、合并丢失或禁止文件混入。R21 的 11 个未暂存文件问题已解除，R22 共 13 个 owned 文件均已入 index。仍有已明确记录的旧验收边界，不签全部 APP 队列关闭或 H5 放行。**

| 核对项 | 实际结果 |
| --- | --- |
| 合并父提交 | HEAD `ddcea906d62e8242815e5af104ac1574bfa486a2`；MERGE_HEAD 与本地 origin/test 均为 `55075a492acc8cd1db03e7045967d71ddf3a8983`；合并仍未提交 |
| 暂存范围 | 657 个变更路径：595 docs、58 src、4 scripts；恰为钱包 50 路径、本任务 13 路径及授权文档归档的并集，无额外非文档路径 |
| 完整性 | 13 个 owned 全部暂存，四份主文档齐备；无未解决 stage、无 unstaged、无 untracked |
| 原 APP 一致性 | 实跑 `git diff --no-index --ignore-space-at-eol`，原 APP 与 integration 的 src、scripts 两组均 exit 0；13 个 owned 的 index blob 也与原 APP 工作副本 Git 规范化内容一致 |
| 钱包/本地双方保留 | 钱包 50 路径无缺漏；42 个非重叠路径与远端一致，7 个组合文件与原 APP 一致，旧 wallet.vue 按授权保持删除；其余未被本轮 owned/docs 修改的本地既有源码无 blob 漂移 |
| 禁止内容 | 整个 index 无根目录 `.cache/`、`evidence/`、`.verify-cache/`、`dist/`、`node_modules/`、`.trash/`；暂存路径无 state 备份、密钥/备份扩展名匹配 |
| state 补充检查 | 53 份本次归档 JSON 的有界结构/导出键检查未发现完整 demo state；两份仓外 R22 state 备份的原始及 LF 规范化 blob 均未出现在 index；前后备份逐字节相同 |
| diff 检查 | `git diff --cached --check -- src scripts` 无错误；没有为历史归档截图重做视觉审查 |

## R22 精确增量

- [tech-money-card.vue](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/src/components/home/tech-money-card.vue) 仅将角标消费键从 `techStreaming` 改为 `techEarningsCurrency`；[home-real-copy.test.ts](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/src/components/home/home-real-copy.test.ts) 更新对应既有断言。
- index 中 en/zh/vi 的 `techEarningsCurrency` 均为 `USDT`。组件金额、未知值、刷新及样式未随此增量改动。
- 7 个钱包重叠文件继续保持已签组合：prototype-preview、daily、wallet-bills、wallet-cards、wallet-repurchase、search、support/chat。360×780 预览选项及本地重试修订未丢失，钱包入口退役与新返回目标未被回退。

## 既有证据与仍未闭合范围

- 已读取 [R22 验证记录](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/docs/audit/2026-10-27-small-screen/validation-r22.md)、[视觉 A](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/docs/audit/2026-10-27-small-screen/r22-visual-a/review-r22-frozen-visual-a.md)、[交互 B](D:/WORKS/PLAN/.wt/uvel-design-20261028-integrate/docs/audit/2026-10-27-small-screen/r22-interaction-b/review-r22-interaction-b.md)：本轮限定评分分别 9.2/9.3。R22 1 文件 6 项、types/web/native 通过；R21 7 文件 116 项单列，不累加冒称一次全量测试。本次未重跑。
- `index-C1VSW6rq.js` 的 5237 读回来自已归档记录；本次仅核对仓外前后 state 备份相等，没有访问或操作用户服务。
- **钱包读取恢复字体旧 8.8 仍 OPEN**：新 `wallet-overview.vue` 范围尚待指定增量验收，A/B 本轮均未签钱包，不以旧钱包截图替代。
- 验证记录保留 intro-public-stats-authority 旧字符串断言批次 4 pass / 1 fail，后续需按当前组件契约维护；本次未复跑，不能据此新增声称当前失败或已关闭。
- 正式 TEST、真实换机、系统大字/原生键盘和物理 APP 安装等仍按原报告限定。H5 继续 hold；普通提交的内容复核通过不等于最终全队列验收完成。

本轮唯一写入为此仓外报告；未修改原 APP 或 integration 源码/index，未 commit/push、未启动/停止服务、未操作 H5。推送前仍由主线程重新核对远端，当前 remote-tracking ref 不替代届时的远端检查。
