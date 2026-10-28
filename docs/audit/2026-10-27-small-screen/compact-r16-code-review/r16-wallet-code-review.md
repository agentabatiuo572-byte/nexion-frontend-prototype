# R16 钱包余额字号：独立源码复核

2026-10-27 13:23 UTC，Averroes。仅审 APP `src/pages/me/wallet.vue` 新余额增量；HEAD `ff01591fb40a9add42b961199e1ab4cc5bc3a735`，文件 SHA256 `43039aebc84e3ad9bae60724777a797d2880f5b21d4ab6b6add4458e936b1b29`。

**有限源码评分9.2/10；未发现新增P2或必须修改的阻塞项。** r16尚未构建，本人未运行测试、浏览器或构建。此分仅评价余额展示增量；同文件已有的r15恢复按钮不重审、不改签，r15报告保持原样。

## 源码结论

- [wallet.vue:246](../../../../src/pages/me/wallet.vue#L246) 的 `usdtBalanceLabel` 与原模板表达式等价。仍由180行 `fundsReadable || remoteWalletReceiptHasSnapshot` 判定可读，没有权威快照时显示 `—`，已确认0仍显示 `$0.00`；没有放宽账号/快照读取条件。computed同时供模板和字号计算使用，有实际复用。
- 124行仍导入 `formatFinanceAmount as formatAmount`，调用路径仍为 `app.user.usdtBalance → formatFinanceAmount → 原两位小数/分组格式`。美元符号、分隔符、负号和小数文本未截断或替换为K/M；USDT标题、UVT次行及读取/资金操作入口均未改，也没有写回原金额。精度规则仍由已有formatter负责，本次不新增金额舍入。
- [heroStyle:336](../../../../src/pages/me/wallet.vue#L336) 左右margin16px、padding2px，合计36px；当前AppChassis固定铺满viewport、内容无额外横向padding，所以 `100vw - 36px` 与现有余额内容宽度一致。仅此页面使用该公式，无需为未出现的窄容器提前引入测量或共享抽象。
- [heroNumStyle:347](../../../../src/pages/me/wallet.vue#L347) 保持原600字重、字体、颜色、tabular数字和字距；56px改为响应式字号，line-height为1.15且不换行。没有新增固定文本高度、ellipsis、overflow隐藏或缩放transform。原AppChassis自身仍横向裁剪，因此不能把“文本节点完整”误当“任意金额均已实景完整可见”。

## 公式边界与有限建议

以下仅按源码算术推导，不是DOM或原生测量：

| viewport | 常规短金额字号 | 17字符金额（如 `$1,234,567,890.12`）字号 |
| --- | --- | --- |
| 320px | 30px | 约25.70px |
| 360px | 33.30px | 约29.32px |
| 390px | 36px | 约32.04px |

外层 `min()` 允许长金额低于30px；30px不是所有金额的硬下限。这符合本次“完整金额按剩余宽度收紧”的实现意图，不建议未经实际失败就加硬下限、删小数或引入省略。`label.length × 0.65` 是含符号/逗号/小数点的字宽预算，不是实际字体测量；字体加载/回退与原生文字缩放仍属运行边界。

建议下一构建只补本项必要实景：320/390的常用余额与一条足以触发收紧的长余额，读回字号和左右边界；保留一个无快照 `—` / 已确认0的语义对照。复用父线程现有明暗审查即可，不要求重复历史矩阵或扩展其他金额页面。无实际溢出证据前，不建议加ResizeObserver、自动截断或额外金额校验。

已有 `wallet-held-authority.behavior.test.ts` 采用真实SFC并断言金额、舍入及原数据不变；本轮只读其相关部分，未运行，不能宣称新绿。原生APP字体/放大设置及本轮视觉分尚未覆盖。

只新增本仓外报告；未改产品、r15报告、测试、提交或推送。
