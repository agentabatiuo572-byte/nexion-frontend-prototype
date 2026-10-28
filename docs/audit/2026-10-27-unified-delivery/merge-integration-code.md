# APP 合并交叉点独立源码审查

## 最终附注：e58039e5

已只读核实 `e58039e57c9cc5192cc3fe5642b9ecac5564dce9` 直接继承已审合并 `a3bc695f`；两者差异仅为 [trial.vue:353](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/me/trial.vue:353) 的 `.trial-read-retry` 增加 `font:600 13px/20px var(--font-v5)`。该规则作用于原重试按钮，其文本继承字体；44px 最小高度、颜色、布局、显示条件和刷新处理均未改变。原报告排除的这一行 WIP 现已按提交纳入，**评分维持 9.2/10，无新增 P2+ 或阻塞项**。

父线程提供的冻结构建为 **`index-Dj39Z2mj.js` / `index-8t-HDpGw.css`**，并报告 **8 个测试文件、109 项通过，类型检查及 native 验证通过**。这些运行结果按父线程提供记录，本审查未重跑或独立读取原始日志/截图；仅核对上述一行增量并更新本外部报告。审查至此结束，未扩大源码范围。

## 合并主体记录：a3bc695f（保留）

2026-10-27 · Averroes · **9.2/10；本次交叉点未发现 P2+，阻塞项：无。** 仅签限定源码合并结果，不代替合并后构建或实景验收。

核实 HEAD 为 `a3bc695fc8fce43fb9318835ecbe2607885f7db3`，父提交依次为恢复 UI 的 `a842e025850bfcf5a6a7e05aada73f7fcf07b393` 和试用子会话的 `3b4d6dab09b4ae1a1bf0f204efbfdbafdb28f4a3`。审查四个指定组件/页面，仅沿赚取页接线读取 `empty-slots-hint.vue`，并核对共享样式、键盘激活层、两方更新日志及提案边界。

| 交叉点 | 核对结果 |
|---|---|
| [trial-device-row.vue:19](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/components/trial-device-row.vue:19) | 相对试用父提交，仅加入恢复 root/copy/action 类及 grid 覆盖；compact 标题和 expanded body 完整保留。局部 `.notice.nx-inline-recovery` 覆盖旧 flex；右侧按钮匹配全局 `600 13px/20px`，min-width/min-height 均至少 44px。相邻 actions 区的 13px/18px 不会覆盖重试。 |
| 展开与操作 | home 标题仍导航到现有试用详情；earn 通过 `EmptySlotsHint` 的 toggleTrial 传回 [earn.vue:99](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/earn/earn.vue:99)，与普通设备共享唯一 expandedId；inventory 使用组件本地展开。重试、详情、购机、取消位于标题的兄弟 body 中，不会冒泡触发标题展开。 |
| 首页与设备/收益页恢复 | my-fleet 保留 `variant="home"` 和故障时的管理入口；devices 的 inventoryStale 横排、完整 EmptyState、retryInventory 同时刷新机队和试用的处理均保留；earn 的 fleet/summary 重试仍分别调用原读取入口。共享 CSS 和 main.ts 导入与恢复 UI 父提交逐字一致。 |
| 点击、键盘和禁用 | 四个指定文件及 empty-slots-hint 的 script、事件绑定、显示/禁用门控与试用父提交一致。role/tabindex 继续使用既有全局 Enter/Space 激活层；购机仍检查 actionsReady，取消仍检查 busy/readiness，并由 [devices.vue:541](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/src/pages/me/devices.vue:541) 在确认前后校验账号及 binding epoch。未因冲突处理放开操作。 |

**日志及提案：**两方 `前端产品更新日志.md` 顶部各自章节都完整保留，已作文本包含核对。[提前转购提案](D:/WORKS/PLAN/.wt/uvel-design-20261025-app/PRD/proposals/UVEL_试用提前转购权益衔接_20261027.md:3) 明确写明政策待确认、尚未实施；此合并未改 src/api、store、lib、composables，trial 行 goBuy 仍只进入既有详情，不新增报价或权益补齐计算。`3b4d6dab` 明确删除 `PRD/prototypes/trial-early-purchase.html`，当前 Git 跟踪清单及该实际路径均不存在此提案配套可点 HTML。

执行边界：未运行测试、构建或浏览器，未审后端、未提交或改产品；合并前两侧已有通过结果不冒充本次合并树的实跑。结束时 HEAD 未变，所审源码、提案和日志相对 HEAD 均无差异；另有范围外 `src/pages/me/trial.vue` WIP，未读取、未修改，也不纳入本次评分或“提案未实施”的合并提交结论。唯一写入为本外部报告，不新增全量复查矩阵。
