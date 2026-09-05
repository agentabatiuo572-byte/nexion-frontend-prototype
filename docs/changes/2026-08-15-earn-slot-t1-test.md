# 2026-08-15 earn 槽位包 T1 独立验收报告

- 验收人:独立 tester agent(未参与实现,黑盒实测)
- 靶环境:http://localhost:5399(uni-app H5 dev,mock 模式,`?nx_device=off` 裸页)
- 靶身份核验:拉 `/src/api/runtime-config.ts` 注入 env,`VITE_ROOT_DIR = d:/works/plan/nexion-uniapp/.claude/worktrees/zk-anxiety-copy`、`VITE_NEXGRID_API_MODE = mock` —— 服务的确实是本 worktree 的 mock 树,非别树假绿。
- 手段:Playwright(工程内 playwright 包)脚本驱动;语言经 `nexgrid-locale-v1`(带 `type:"object"` 包装)切换;设备库存经 `useApp().deactivateDevice / activateDevice` 操控。

## 逐条 AC 判定

| AC | 判定 | 证据摘要 |
|---|---|---|
| AC1a 空仓 · 槽位轨道「+」格 | **PASS** | 种子态 5 台全激活 / 库存 0(store 实读 `inactive=[]`),6 格轨道 1 个空格;点击 `[role=button][aria-label=添加设备]` 后 hash 直达 `#/pages/store/store`;点击前装好的 MutationObserver 全程未见 `.sas-root`(sasSeen=false),到店后 DOM 中 `.sas-root` 计数 0 |
| AC1b 空仓 · 底部「添加设备」胶囊 | **PASS** | 同法实测:库存 0,点胶囊 → hash `#/pages/store/store`,观察器全程未捕获 `.sas-root`,到店后计数 0 |
| AC2a 有库存 · 槽位「+」 | **PASS** | `deactivateDevice(phone-1)` 后库存 1、空格变 2;点「+」→ `.sas-root` 出现;**未做任何额外点击**即测得 `.sas-list` visible、`.sas-device`=1(与 store 库存数一致);顶部主 CTA 文案「购买新设备」可见(截图确认:brand 绿胶囊在列表上方) |
| AC2b 有库存 · 胶囊按钮 | **PASS** | 再次制造库存 1,点胶囊 → `.sas-root` 出现,`.sas-list` 未点即 visible,`.sas-device`=1,CTA「购买新设备」在顶 |
| AC3 选择激活闭环 | **PASS** | 在 AC2a 弹层点设备行:`.sas-root` 关闭;toast「已激活 …」出现;store 复读 `phone-1.activatedAt` 非 null;槽位轨道空「+」格 2→1(相应格位变已用图标,截图确认)。AC2b 后二次执行同样闭环成功,终态恢复 5 台全激活 / 库存 0 |
| AC4 proof 提示三语 | **PASS** | 三语各自全量刷新实测,tip 正文行 **startsWith** 严格判:zh「把这张卡片发到你的 Telegram 群 — 每邀请一位好友，你终身获 5% 分成。」/ en "Share this card in your Telegram groups — every referral earns you 5% of their lifetime revenue." / vi "Đăng thẻ này vào nhóm Telegram của bạn — mỗi người bạn giới thiệu mang về cho bạn 5% doanh thu trọn đời.";tip 标题「提示/Tip/Mẹo」均在。禁词扫描按**整页 outerHTML**(非仅 innerText,覆盖隐藏文本/aria):「真实用户 / Real users / Người dùng thật」三语页面 0 命中 |
| AC5 无回归噪声 | **PASS** | 全程挂 console error + pageerror 监听:AC1–AC3 earn/store 流转 0 条 error 级;proof 三语三次全量加载 0 条 error 级 |

## 防自欺反证(传感器活性,全部通过)

1. **树身份**:见上,served root = 本 worktree + mock。
2. **`.sas-root` 观察器红测**:装同款观察器后强制 `sheet.show()`,观察器立即报 true —— AC1 的「没弹层」是活传感器的真阴性,不是瞎子报平安。
3. **console 监听自测**:页面内注入 `console.error("PROBE_ERR_SELFTEST_12345")` 被监听器捕获 —— AC5 的 0 是真 0。
4. **AC4 严格口径**:另跑 startsWith 探针,tip 正文行(title 元素后继 `uni-text`)三语均以要求短语开头,非仅「页面某处包含」。

## AC 外观察(不影响本包判定,建议另单处理)

- **[P2] proof 页「加入于」日期跟设备 locale 走,与应用语言脱钩**:en 页显示 "Member since 2026年7月"、vi 页显示 "Thành viên từ 2026年7月"(本机浏览器 locale zh-CN)。机制 [COMPUTED]:`proof.vue` L230 `new Date(joinedAt).toLocaleDateString(undefined, …)` 用浏览器 locale 而非应用 locale;凡应用语言 ≠ 设备语言即出现混语日期,且同字符串会画进分享海报 canvas(L348)。属既有模式,非本包改动引入。复现:任意语言下开 `/pages/me/proof`,浏览器 locale 与应用语言不一致即见。

## 复现要点(如需回归)

- 脚本:scratchpad `earn-slot-t1.cjs`(主流程)+ `earn-slot-t1-probes.cjs`(反证)+ `earn-slot-t1-startswith.cjs`(AC4 严格口径),均为临时件,未入库。
- 语言注入:`localStorage["nexgrid-locale-v1"] = JSON.stringify({type:"object",data:{code,userSet:true}})` 后**全量刷新**(仅 hash 变化的 goto 不重载)。
- 未改任何源码;设备状态与 locale 键已复位(终态 5 台全激活、库存 0、locale 键移除)。

## 总判定

**PASS**(10/10 项全过;1 条 AC 外 P2 观察项如上)
