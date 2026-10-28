# R23 推送前远端试用功能合并记录

2026-10-28。本任务R22已提交b3fdfd5f，尚未推送时发现远端test从55075a49更新至80e18f8f；采用正常merge，保留两条提交历史，没有force push。只有前端更新日志冲突，两方新增条目完整保留；trial-lifecycle与trial详情源码自动合并。

## 实际验证

| 检查 | 结果及边界 |
| --- | --- |
| 定向Vitest | 4文件107/107：trial-api、free-trial.remote-errors、trial-benefits-lifecycle、home-real-copy。 |
| 类型检查 | npm run type-check退出0。 |
| 浏览器生产构建 | 退出0，固定输出r23-frozen-web，入口index-D78ONfqM.js / index-DPMvPy7r.css。 |
| APP资源编译 | 退出0，固定输出r23-frozen-native；不代表物理设备安装。 |
| 旧Node契约补查 | final-commerce-closure-contract和h2-trial-remote-api共12项，10通过、2失败；没有改成全绿。 |
| 首页最终入口增量复核 | [独立视觉A](compact-r23-visual-a.md) 9.2，[独立交互B](compact-r23-interaction-b.md) 9.3；分别390中文暗色、320越文浅色及英文切换，限定USDT/今天字号与主题光影。 |

两条红项分别在bundle中匹配`const successBody = t.value.bundle.checkoutSuccessBody`、在earn中匹配`<TrialHeroBanner class="w-full"`失败。这两个产品文件在本次合并前后没有变更，旧测试仍绑定旧结构；没有通过恢复旧布局、删断言或跳过用例使其变绿。后续需结合当前交互契约维护。日志仅本机保留，报告如实记录。

## 指纹与未覆盖

- JS SHA256：D176E742E93D728543B0FE2880030F9B5CFD0C5E92C47DB3C424FD420037E20A。
- 主CSS、签到daily-check-in-row-BoXMjQFA.css及intro-CIkBy_3L.css与R22逐字节一致，详见R22指纹；本轮未重新签全套intro矩阵。
- 正常合入的FEAT-TRIAL05新增业务及PRD来自远端80e18f8f；本轮没有重做正式后端报价、真实付款/退款、早购完整业务验收。其页面不能借本轮首页角标分数算已通过。
- 用户5237现有演示进程与聊天状态保留；资源编译与真实服务联调不同。钱包恢复字体旧8.8、旧intro统计契约、最终H5同步及正式TEST/真机边界继续记录为未完成或未覆盖。
- 5237已实际读取index-D78ONfqM.js及相同JS哈希；更新前后演示state逐字节相同。原标签恢复320中文暗色，USDT12px、今天10.5px/14px。[用户原入口图](r23-user-5237.png)与[DOM](r23-user-5237-dom.json)。保留原演示服务，未扩展验证其早购报价场景。
- [独立合并源码复核](integration-r23-final.md)确认13个远端路径完整、双方紧凑文案/样式保留，两条旧红项的产品blob和失败断言未由本次合并改变。
