# 首页任务卡自动轮播 · Change Proposal

- **工作线**：④ uniapp
- **日期**：2026-07-16
- **状态**：Aligned（主人已给出交互、样式与后台开关口径）

## Why

首页现有任务轮播会露出下一张卡、使用外置圆点且两张卡高度不一致，与主人给出的单张横幅参考不符；轮播也缺少自动切换、展开暂停，以及由后台决定 0 / 1 / 2 张卡片的行为。

## What changes

- 任务区改成单张满宽轮播，不露出下一张卡，不显示页码、播放控制或外置圆点；两张卡按主人确认的卡面方案统一信息层级。
- 两张卡收起态统一为 184px；移除外框边线，新手任务底部按钮保持上下等距，本周任务 CTA 使用弱化填充并留出底部呼吸空间。
- 收益大数字统一为 30px / 500 字重，颜色直接复用“我的算力列队”收益数字 token `var(--v5-warning)`；本周任务继续使用项目资产 `/static/img/marketing/trial-hero.png`，不落地 AI 预览图中的机箱。
- 两张卡时约每 5 秒自动轮播；新手任务展开即暂停，展开后继续横滑会先收起并切页，随后恢复自动轮播。
- 一张卡时保留单卡展示但禁用轮播；零张卡时整个任务区不渲染。
- 复用平台 `FeatureFlags` 增加两个只读投影开关：新手任务、首页每周活动。前端 mock 提供可替换接口面，不新增第二套后台真源。
- 补键盘切换、焦点暂停与减少动态效果偏好；自动切页不主动打扰读屏。
- **Out of scope**：不新增真实前后台 API、不把 H3 Weekly Quest T1 / T2 误接到首页、不扩展固定 `QuestTaskId`、不改任务奖励或完成规则。

## Impact

- **页面 / 路由**：首页 `/pages/index/index`。
- **组件**：`day-one-quest-card.vue` 受控展开并按确认稿重排摘要 / 底部按钮；`conversion-banner.vue` 保留现有机箱资产并重排 CTA 与收益层级。
- **Store / model**：`FeatureFlags` 增加 `homeNewcomerTasksEnabled`、`homeWeeklyPromoEnabled`。
- **i18n**：增加轮播区域标签与隐藏读屏播报，中英镜像。
- **后台映射**：新手任务取 `H3.dayOne.tasks` 是否存在 `active` 项；首页每周活动取 `H3.promoBanner.config.status === "active"`。
- **不变量风险**：0 / 1 / 2 张热切换、展开态与自动轮播冲突、H5 / App swiper 行为、短屏和中英文高度。

## Done-when

- [x] 两个开关全关时任务区不存在；仅开一个时只显示单卡且 11 秒内不切页、不显示轮播控制。
- [x] 两个开关全开时两张卡折叠高度一致，并以约 5 秒间隔循环；320×568 与 440×956 的标题 / 倒计时无覆盖、页面无横向溢出，本周卡仅保留约定的底部裁剪。
- [x] 新手任务展开后超过 10 秒不切页；继续横滑时自动收起并切到另一张，之后恢复自动轮播。
- [x] 中英文、键盘左右键、焦点暂停、读屏标签均可用；类型检查、全量 verify 与浏览器多状态矩阵通过。

---

#### [FEAT-HOME02] 首页任务卡自动轮播

**① 用户故事**
- 作为首页访问者，我想在一个紧凑且不跳高的横幅区域轮流看到新手任务和每周活动，以便快速发现当前可做的任务。
- 作为正在查看新手任务详情的访问者，我想让轮播停住，以便不被自动切页打断；继续滑动时则明确表示我要离开详情。
- 作为运营人员，我想沿用后台已有的任务 / 活动启停状态控制首页卡片，以便不用维护第二套开关真源。

**② 验收(GWT)**
- 阳光路径：Given 两个投影开关均开启且新手任务收起，When 首页任务区进入视口，Then 首屏显示新手任务，约 5 秒后切到每周活动，再约 5 秒循环回来；两卡外框尺寸一致。
- 异常1(零卡)：Given 两个开关均为 `false`，When 首页渲染，Then 不创建任务轮播 region / swiper，不留空白占位。
- 异常2(单卡)：Given 仅一个开关为 `true`，When 首页持续停留至少 11 秒并尝试横滑，Then 卡片保持原位，不显示页码或播放控制。
- 异常3(展开中)：Given 新手任务已展开，When 停留超过 10 秒，Then 不自动换页；When 随后继续横向滑动，Then 新手任务先收起、切到目标卡，并重新进入自动轮播。
- 异常4(配置热变更)：Given 当前为第 2 张，When 可见卡片从 2 张变为 1 张或 0 张，Then 当前索引重置为 0、无陈旧克隆页或空白页；恢复为 2 张时从首卡重新计时。
- 异常5(配置同步失败)：Given 平台配置同步失败，When 首页渲染，Then 两张运营卡均按关闭处理，不用陈旧数据强行展示。

**③ 数据字典 + 生成规则**

| 字段 | 类型 | 必填 | 默认 | 生成规则 / 约束 |
|---|---|---|---|---|
| homeNewcomerTasksEnabled | boolean | 是 | true(mock) | 服务端只读投影；`H3.dayOne.tasks.some(task.status === "active")`；client 禁止反写 H3 |
| homeWeeklyPromoEnabled | boolean | 是 | true(mock) | 服务端只读投影；`H3.promoBanner.config.status === "active"`；不是 Weekly Quest T1 / T2 |
| visibleTaskCards | `("newcomer"｜"weekly")[]` | 是 | 派生 | 按新手、每周顺序从两个开关派生；长度决定 absent / single / carousel |
| taskSlide | integer | 是 | 0 | client 临时 UI 状态；范围 `0..visibleTaskCards.length-1`，签名变化时归 0 |
| newcomerExpanded | boolean | 是 | false | client 临时 UI 状态；展开时禁止 autoplay，离开新手页时归 false |
| autoplayIntervalMs | integer | 是 | 5000 | 前端交互常量；仅卡片数 ≥2 且未展开 / 无焦点 / 非 reduce motion 时生效 |
| collapsedCardHeightPx | integer | 是 | 184 | 新手任务收起态与本周任务共同外框高度；本周任务只裁底部，不重排视觉 |

**④ 状态机 + 禁止动作**
- 状态：`absent(0卡)`；`single(1卡)`；`rotating(≥2卡)`；`expandedPaused(新手展开)`；`focusPaused(焦点 / reduce motion)`。
- 转换：`rotating → expandedPaused`(展开新手)；`expandedPaused → rotating`(横滑离开并收起)；`rotating ↔ focusPaused`(焦点进出)；任意态在卡片签名变化后先归 `taskSlide=0` 再进入对应 0 / 1 / 2 卡状态。
- 禁止动作：0 卡禁渲染容器；1 卡禁 autoplay / circular / 手滑 / 页码；展开态禁自动切页；自动切页禁写入 `aria-live`；隐藏页内部操作禁进入 Tab 顺序。

**⑤ 交互原型(4 态)**
- **默认态**：单张满宽显示，两卡收起态等高；不显示页码或暂停控件；倒计时保持可见，本周任务使用项目现有机箱资产，新手任务底部按钮上下留白一致。
- **空状态**：两开关均关时整个模块不存在，前后首页模块自然相邻，不渲染空壳或占位。
- **加载态**：当前原型只同步读取本地 mock seed，因此没有网络加载态；DEV 的配置失败模拟态会隐藏两张运营卡。未来接入真实 `GET /api/config/platform` 时再定义网络 loading / retry，不在本次虚构。
- **报错 / 极限态**：单卡不显示轮播噪声；配置热切换不留陈旧页；320px 宽、英文长文案与新手展开态不得横向溢出，展开内容完整可达。

**⑥ 点击流矩阵**

| 触发元素 | 跳转 / 响应目标 | 转场 / 反馈 |
|---|---|---|
| 新手任务「查看 / 收起任务」 | 当前卡 | 展开即暂停；收起后若无其他暂停原因则恢复约 5 秒轮播 |
| 展开态横向滑动 | 相邻任务卡 | 先收起新手任务，再切页并恢复自动轮播 |
| 键盘左 / 右方向键 | 上一 / 下一可见卡 | 循环切换；仅手动变化写入隐藏读屏播报 |
| 每周活动卡 | 商品详情 `/pages/store/detail?id=stellarbox-s1` | 点击 / Enter / Space 跳转；自动轮播本身不触发跳转 |
| 新手任务行 | 对应任务路由 | 未完成任务可点击 / 键盘进入；隐藏页不可聚焦 |

**⑦ 跨文档一致性**
- 后台唯一真源保持 `Nexion-admin-prototype` H3：`H3.dayOne.tasks` 与 `H3.promoBanner.config`；平台配置接口仅投影为两个布尔值，不新增独立运营口径。
- 首页「每周任务」当前是 H3 promo banner 的产品文案，不等同 H3 Weekly Quest T1 / T2；本规格禁止错接。
- 前端读取面沿用 `GET /api/config/platform → FeatureFlags → useConfig().isEnabled()`；当前仓库为本地 mock，真实 admin→API→uniapp 联通须另立接口任务后才能宣称端到端完成。
- 主人确认后，本变更的稳定功能契约同步至 canonical 前端 PRD；视觉细节与过程记录只留本 change / 设计实现，不写入 PRD。
