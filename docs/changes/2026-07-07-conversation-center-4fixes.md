# 会话中心体验四连修 · Change Proposal

- **工作线**:④ uniapp(主)+ ② admin(M3 客服域联动)
- **日期**:2026-07-07
- **状态**:Draft(主人已在需求里直接给定语义,按判断力条款走轻量提案,收尾时请主人 review)

## Why(问题 / 动机)

主人实测会话中心(`/pages/support/messages`)提出 4 项:①发送无频率限制可刷屏;②进入/发送后不自动定位到最新消息;③前后台消息都没有已读/未读/输入中状态;④App 二级页返回后上层页面滚动位置丢失(全站性)。

## What changes(改动点)

1. **发送频率限制**(advisor/support/AI 三通道,含 AI 快捷 chip):滑动窗口 **15 秒内最多 5 条**,超限消息不发出,弹 warn toast「发送太频繁 · {n} 秒后再试」。常量集中在 `chat.vue` 顶部,主人可一句话改档。
2. **自动定位最新消息**:修复 `scroll-into-view` 时序坑(固定锚点 + 清空-重设触发);进入聊天页、发出消息、收到回复、出现输入中气泡时都滚到底。
3. **已读/未读/输入中**:
   - 前端:自己发出的最后一条消息尾部显「未读」,对方读后变「已读」;对方回复前显三点「输入中」气泡,聊天页头部副标与会话列表预览同步显「正在输入…」。
   - 后台 M3 即时会话台:坐席回复后消息显「未读」→ 模拟用户已读变「已读」;用户回复前线程/列表行/会话头显「正在输入…」,随后到达一条模拟用户短回执(未选中会话未读 +1)。
4. **返回恢复滚动位置**:AppChassis 滚动容器持续记录 scrollTop(按页面 fullPath 建模块级 Map),`onActivated`/`onMounted` 时还原——一处修复覆盖全部 chassis 包裹页(~56 个子页 + 5 tab)。
- **Out of scope(明确不做)**:后台坐席侧不加发送限频(内部员工,已有 550ms 防抖);M2 工单(异步信箱,无「输入中」概念)不加三态;chat 页自身(fixed 布局无页面滚动)不参与滚动恢复。

## Impact(影响面)

- **页面 / 路由**:`pages/support/chat.vue`、`pages/support/messages.vue`、`components/app-chassis.vue`、`components/support/conversation-thread.vue`
- **Store / model**:`store/conversations.ts`(typing map + markUserRead)、`store/nova.ts`(同)、`mock/conversations.ts`(`ConvMessage.status?: "sent"|"read"`)—— 🔴 backend-replaceable:status 是真后台消息回执枚举,typing 对应 WS typing 事件
- **后台**:`m-tabs/data.ts`(`SessionMsg.status` + 用户回执池)、`m3-sessions.tsx`(模拟已读/输入中/回执循环)、`design-kit.tsx`(`ThreadMessage.receipt` + typing 气泡)、`m-domain.css`
- **i18n**:`conversations` namespace 加 `receiptSent/receiptRead/rateLimited/rateLimitedRetry`,复用已有 `agentTyping` —— 🔴 en/zh 同序镜像
- **设计**:全用 `--v5-*` token;后台用 `--m-*`/`--ink-*` 既有 token;禁硬编码 hex
- **PRD 章节**:前端「会话中心」节(nexion-prd-sync);后台 M3(nexion-admin-prd)—— P7 主人确认后同步
- **不变量风险**:双语镜像 / mock 可接真 / 0 meta(「模拟」字眼只进代码注释不进 UI 文案)/ walkthrough needle(`MessageThread`、`data-proof=session-*` 全保留)

## Done-when(行为级判据,P6 逐条回测)

- [ ] 聊天页 15 秒内第 6 次发送被拦:消息不进列表 + warn toast 出现;窗口滑过后恢复可发(三通道一致)
- [ ] 打开 advisor 长会话直接落在最后一条;发送/回复/typing 气泡出现时自动滚到底(运行时实测)
- [ ] 前端:发送后消息尾「未读」→ 约 0.6s 变「已读」→ 三点气泡 → 回复到达;后台 M3:坐席回复 →「未读」→「已读」→「正在输入…」→ 用户回执到达,未选中会话未读 +1
- [ ] me 页滚到中部 → 进会话中心再返回,me 恢复原滚动位置;会话中心滚动后进聊天页返回同样恢复;console error = 0
- [ ] 机器门:uniapp `type-check`+`verify.sh` 全绿;admin `tsc`+`verify` 全绿(M3 needle 不破)

---

## 实施结果(2026-07-07 收尾)

- **状态**:已实现 + 实景验证,待主人确认后同步 PRD(届时标 `Shipped`)。
- **对抗审查**(双 agent 互相证伪 + 墨菲):
  - 一致性/不变量 agent → P0=0 P1=0(1 个 P2:后台 echo 已读态纯瞬态,切会话再切回「已读」会倒退——代码注释已声明的设计 ceiling,非阻断)。
  - 正确性/时序 agent → 揪出 **2 个 P1**(均实景复现):
    - Nova 未读永久压制(前进离开 AI 聊天页 `isOpen` 卡 true,后续 push 未读全被吃)→ `chat.vue` 加 `onShow`/`onHide` 生命周期修复。
    - 返回后消息列表跳顶(隐藏态 scrollTop 清零 + watch 不触发)→ `revealTick` 修复。
- **额外修复**:item② 自动滚到底其实**没到底**(uni 双层 `.uni-scroll-view` 选错元素 + 声明式滚动对布局前高度算);且此前验证查错元素(外壳 max=0)**假通过**。改 H5 DOM 按实际溢出找真滚层。
- **实景**:vue-tsc 0 · `verify.sh` 171/0 · i18n mirror PASS · Playwright 四项 + 两个 P1 + item② 全绿 · console 0。
- **踩坑已转**:`PORT-PITFALLS` P-060(滚动元素/假通过)· P-061(navigateTo 隐藏态)· P-062(bare 页 GlobalUi 宿主)。
