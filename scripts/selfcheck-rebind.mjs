#!/usr/bin/env node
// 提现地址直管纯逻辑自检 — node 直跑,不起 Vue/uni:
//   node scripts/selfcheck-rebind.mjs
// 被测对象:src/store/payout-address-core.ts（提现地址直管 ③④）。
// 用 esbuild(vite 传递依赖)现场转译后 import,断言:
//   链地址校验(单源)/ 在途单集合 / 更换禁止动作优先级(在途单 > 7 天频控)/
//   原子更换后置条件(新址生效 + 旧址同事务入历史 + 24h 冻结 + 频控锚点)/
//   首次添加 24h 冻结与频控 / 冻结剩余与倒计时排版 / 掩码中段 /
//   存量迁移三态(empty / migrated / corrupt —— 配对老数据不得静默变成空地址)。
//
// ⚠️ 2026-08-05 包 E:本文件从「wallet-pairing-core($1 配对换绑)」整体改写为
// 「payout-address-core(地址直管)」。改写顺序是**判据先行**:先让本哨兵指向新机制
// (新 core 缺席时 readFileSync 直接抛错 = 红),再实现机制、再删旧配对 store ——
// 绝不允许出现「机制删了、哨兵还盯着旧对象空转假绿」的窗口。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { transformSync } from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(path.join(root, "src", "store", "payout-address-core.ts"), "utf8");
const { code } = transformSync(src, { loader: "ts", format: "esm" });
const core = await import(
  "data:text/javascript;base64," + Buffer.from(code, "utf8").toString("base64")
);
// 「这张单还占着槽吗」的唯一判据住在 arrival-core(非终态即占用)。
// 换址闸此前挂在 pairing-core 的一份白名单上,漏了 sent / frozen —— 白名单已删,这里直接测正主。
const arrivalSrc = readFileSync(path.join(root, "src", "store", "withdrawal-arrival-core.ts"), "utf8");
const { occupiesWithdrawalSlot } = await import(
  "data:text/javascript;base64," +
    Buffer.from(transformSync(arrivalSrc, { loader: "ts", format: "esm" }).code, "utf8").toString("base64")
);

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

const {
  PAYOUT_FREEZE_MS,
  isChainAddressValid,
  payoutChangeBlockReason,
  applyAddAddress,
  applyChangeAddress,
  emptyNetworkState,
  eligibilityBindingFor,
  freezeRemainingMs,
  isPayoutFrozen,
  formatClock,
  maskAddressMid,
  migrateFromPairing,
  CHAIN_TO_WITHDRAW_NETWORK,
  fromWithdrawNetwork,
} = core;

console.log("selfcheck-rebind — payout-address-core 纯逻辑断言(提现地址直管)");

const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;

// 1) 链地址格式校验(TRC20 = T+33;EVM = 0x+40hex)—— 单源迁移自旧 pairing-core,契约不变
{
  const tron = "T" + "A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E"; // T + 33 位字母数字
  check("TRC20 合法地址通过", isChainAddressValid("usdt-trc20", tron) && tron.length === 34);
  check("TRC20 拒 0x 形态", !isChainAddressValid("usdt-trc20", "0x" + "a".repeat(40)));
  check("TRC20 拒短地址", !isChainAddressValid("usdt-trc20", "TABC"));
  check("EVM 合法地址通过(erc20/bep20 共形)", isChainAddressValid("usdt-erc20", "0x" + "a1".repeat(20)) && isChainAddressValid("usdt-bep20", "0x" + "F0".repeat(20)));
  check("EVM 拒非 hex", !isChainAddressValid("usdt-erc20", "0x" + "zz".repeat(20)));
  check("EVM 拒 TRON 形态", !isChainAddressValid("usdt-bep20", tron));
  check("首尾空白 trim 后判定", isChainAddressValid("usdt-erc20", "  0x" + "ab".repeat(20) + "  "));
}

// 2) 🔴 「这张单还占着槽吗」—— 只许有一份判据,且必须是「非终态即占用」
//
// 白名单与黑名单的**失败方向相反**:白名单漏一个新状态 = 默认「不在途」= 闸放行(危险);
// 黑名单终态漏一个 = 默认「在途」= 闸拦住(保守)。涉及钱的判据一律取保守那一侧。
// (2026-08-01 审计:白名单版漏 sent/frozen → 风控冻结中、钱已扣的账户能改收款地址。)
{
  const TERMINAL = ["confirmed", "review-rejected", "address-invalid", "tx-failed", "refunded"];
  const NON_TERMINAL = ["submitted", "review-pending", "review-passed", "processing", "sent", "frozen"];
  check("非终态一律判「占着槽」(含 sent / frozen —— 白名单版漏的正是这两个)",
    NON_TERMINAL.every((s) => occupiesWithdrawalSlot(s)),
    NON_TERMINAL.filter((s) => !occupiesWithdrawalSlot(s)).join(",") || "");
  check("终态一律判「不占槽」", TERMINAL.every((s) => !occupiesWithdrawalSlot(s)),
    TERMINAL.filter((s) => occupiesWithdrawalSlot(s)).join(",") || "");
  check("undefined 判不占槽(没有单据)", !occupiesWithdrawalSlot(undefined));
  check("🔴 新增未知状态默认按「在途」处理(黑名单的保守方向)",
    occupiesWithdrawalSlot("some-future-status"));
}

// 3) 更换禁止动作优先级:在途单 > 7 天频控(RM01a ② 异常2/异常3)
{
  const now = 1_000_000_000_000;
  check("在途提现单 → withdrawal-in-flight(压过频控)",
    payoutChangeBlockReason({ now, hasInFlightWithdrawal: true, nextChangeAt: now + 6 * DAY }) === "withdrawal-in-flight");
  check("频控窗口内 → cooldown",
    payoutChangeBlockReason({ now, hasInFlightWithdrawal: false, nextChangeAt: now + 1 }) === "cooldown");
  check("恰到 nextChangeAt → 放行",
    payoutChangeBlockReason({ now, hasInFlightWithdrawal: false, nextChangeAt: now }) === null);
  check("无频控锚点(null)→ 放行",
    payoutChangeBlockReason({ now, hasInFlightWithdrawal: false, nextChangeAt: null }) === null);
}

// 4) 首次添加:登记 current,同时进入 24h 安全冻结与 7 天更换频控
{
  const now = 1_700_000_000_000;
  const s0 = emptyNetworkState();
  const s1 = applyAddAddress(s0, "  0x" + "ab".repeat(20) + "  ", now, 7);
  check("空槽添加成功", s1 !== null);
  check("current 生效(地址 trim,addedAt=now,source=user)",
    s1.current?.address === "0x" + "ab".repeat(20) && s1.current?.addedAt === now && s1.current?.source === "user");
  check("首次添加设置 24h 提现冻结", s1.freezeUntil === now + DAY);
  check("首次添加设置 7 天频控锚点", s1.nextChangeAt === now + 7 * DAY);
  check("历史不受影响", s1.history.length === 0);
  check("已有 current 时 applyAddAddress 拒绝(更换必须走显式 change)", applyAddAddress(s1, "0x" + "cd".repeat(20), now, 7) === null);
  check("入参 state 未被原地修改(immutability)", s0.current === null && s0.history.length === 0);
}

// 5) 原子更换(RM01a ② 阳光2 / ④):新址生效 + 旧址同事务入历史 + 冻结 + 频控,一步完成
{
  const now = 1_700_000_000_000;
  const s0 = applyAddAddress(emptyNetworkState(), "0x" + "ab".repeat(20), now - 30 * DAY, 7);
  const s1 = applyChangeAddress(s0, "0x" + "cd".repeat(20), now, 7);
  check("有 current 时更换成功", s1 !== null);
  check("新址成为唯一 current(addedAt=now,source=user)",
    s1.current?.address === "0x" + "cd".repeat(20) && s1.current?.addedAt === now && s1.current?.source === "user");
  check("旧址同事务入历史(replacedAt=now,原 addedAt 保留)",
    s1.history.length === 1 && s1.history[0].address === "0x" + "ab".repeat(20)
      && s1.history[0].replacedAt === now && s1.history[0].addedAt === now - 30 * DAY);
  check("freezeUntil = now + 24h", s1.freezeUntil === now + PAYOUT_FREEZE_MS && PAYOUT_FREEZE_MS === 24 * HOUR);
  check("nextChangeAt = now + 7d(cooldownDays 入参生效)", s1.nextChangeAt === now + 7 * DAY);
  check("cooldownDays=3 → nextChangeAt 跟着变(参数不写死)",
    applyChangeAddress(s0, "0x" + "cd".repeat(20), now, 3)?.nextChangeAt === now + 3 * DAY);
  check("空槽不可「更换」(必须走添加)", applyChangeAddress(emptyNetworkState(), "0x" + "cd".repeat(20), now, 7) === null);
  check("再换一次:历史累积为 2,current 仍唯一",
    (() => {
      const s2 = applyChangeAddress(s1, "0x" + "ef".repeat(20), now + 8 * DAY, 7);
      return s2 !== null && s2.history.length === 2 && s2.current?.address === "0x" + "ef".repeat(20);
    })());
  check("入参 state 未被原地修改(immutability)", s0.current?.address === "0x" + "ab".repeat(20) && s0.history.length === 0);
}

// 6) 冻结剩余 + 倒计时排版(评估层硬闸与 UI 共用同一判据)
{
  check("冻结剩余 = until - now(正向)", freezeRemainingMs(2000, 500) === 1500);
  check("冻结过期 clamp 0", freezeRemainingMs(500, 2000) === 0);
  check("无冻结(null/undefined)→ 0", freezeRemainingMs(null, 2000) === 0 && freezeRemainingMs(undefined, 2000) === 0);
  const t0 = 1_700_000_000_000;
  check("冻结窗口内 isPayoutFrozen=true", isPayoutFrozen(t0 + PAYOUT_FREEZE_MS, t0 + PAYOUT_FREEZE_MS - 1) === true);
  check("窗口过/无冻结 isPayoutFrozen=false", isPayoutFrozen(t0, t0) === false && isPayoutFrozen(null, t0) === false);
  check("hh:mm:ss 排版(23:59:41)", formatClock((23 * 3600 + 59 * 60 + 41) * 1000, { hours: true }) === "23:59:41");
  check("mm:ss 排版(29:59)", formatClock(30 * 60 * 1000 - 1000) === "29:59");
  check("负值 clamp 00:00", formatClock(-5000) === "00:00");
}

// 7) 掩码中段(RM01a ⑤ 默认态:提现页/地址管理页共用同一实现,不各写一份)
{
  const long = "T" + "A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E";
  const masked = maskAddressMid(long);
  check("长地址:保头尾、遮中段", masked.startsWith(long.slice(0, 6)) && masked.endsWith(long.slice(-4)) && masked.length < long.length);
  check("掩码不含中段明文", !masked.includes(long.slice(8, 28)));
  check("短地址原样返回(不产生比原文还长的掩码)", maskAddressMid("TXabc") === "TXabc");
  check("空串安全", maskAddressMid("") === "");
}

// 8) 网络枚举双向映射(payout 收窄枚举 ↔ 提现单大写形态)
{
  check("chain → withdraw 网络映射", CHAIN_TO_WITHDRAW_NETWORK["usdt-trc20"] === "USDT-TRC20" && CHAIN_TO_WITHDRAW_NETWORK["usdt-bep20"] === "USDT-BEP20");
  check("withdraw → chain 反向映射", fromWithdrawNetwork("USDT-ERC20") === "usdt-erc20" && fromWithdrawNetwork("USDT-TRC20") === "usdt-trc20");
}

// 9) 喂风控判定的绑定形态(withdrawal-eligibility 消费面;冻结 + 账龄两信号)
{
  const now = 1_700_000_000_000;
  check("无地址 → null(资格层跳过绑定相关闸)", eligibilityBindingFor(emptyNetworkState()) === null && eligibilityBindingFor(undefined) === null);
  const s = applyChangeAddress(applyAddAddress(emptyNetworkState(), "0x" + "ab".repeat(20), now - 30 * DAY, 7), "0x" + "cd".repeat(20), now, 7);
  const b = eligibilityBindingFor(s);
  check("verifiedAt = current.addedAt(大额账龄闸的账龄起点)", b?.verifiedAt === now);
  check("freezeUntil 透传(rebind-freeze 闸输入)", b?.freezeUntil === now + PAYOUT_FREEZE_MS);
  check("首次添加冻结透传给资格层",
    eligibilityBindingFor(applyAddAddress(emptyNetworkState(), "0x" + "ab".repeat(20), now, 7))?.freezeUntil === now + PAYOUT_FREEZE_MS);
}

// 10) 🔴 存量迁移三态(RM01b/E-2:配对老数据 → 地址直管;失败不得静默变成空地址)
{
  const now = 1_700_000_000_000;
  const paired = now - 60 * DAY;
  // a) 换绑上线后的完整台账行:active + revoked
  const row = {
    walletPaired: true,
    pairedWalletAddress: "0x" + "cd".repeat(20),
    pairedNetwork: "USDT-ERC20",
    pairedAt: paired,
    bindings: [
      { bindingId: "AB-OLD", address: "T" + "A".repeat(33), network: "usdt-trc20", status: "revoked", createdAt: paired, verifiedAt: paired },
      { bindingId: "AB-NEW", address: "0x" + "cd".repeat(20), network: "usdt-erc20", status: "active", createdAt: paired + 10 * DAY, verifiedAt: paired + 10 * DAY, freezeUntil: paired + 10 * DAY + 24 * HOUR },
    ],
    lastRebindAt: paired + 10 * DAY,
  };
  const r = migrateFromPairing(row, 7);
  check("配对行 → status=migrated", r.status === "migrated");
  const erc = r.status === "migrated" ? r.book["usdt-erc20"] : null;
  check("active 绑定 → 对应网络 current(地址原样保留)", erc?.current?.address === "0x" + "cd".repeat(20));
  check("🔴 source=migrated(地址管理页可见来源标记)", erc?.current?.source === "migrated");
  check("🔴 addedAt = 原 verifiedAt(账龄延续 —— 大额账龄闸不因迁移重置)", erc?.current?.addedAt === paired + 10 * DAY);
  check("原冻结窗口原样携带(迁移不放宽在途安全措施)", erc?.freezeUntil === paired + 10 * DAY + 24 * HOUR);
  check("lastRebindAt → nextChangeAt 换算(锚点 + 频控天数)", erc?.nextChangeAt === paired + 10 * DAY + 7 * DAY);
  check("revoked 绑定 → 其网络的历史行(带 replacedAt)",
    (() => {
      if (r.status !== "migrated") return false;
      const trc = r.book["usdt-trc20"];
      return trc.current === null && trc.history.length === 1
        && trc.history[0].address === "T" + "A".repeat(33)
        && Number.isFinite(trc.history[0].replacedAt);
    })());
  // b) 台账化之前的最老行:只有 pairedWalletAddress
  const legacy = { walletPaired: true, pairedWalletAddress: "T" + "B".repeat(33), pairedNetwork: "USDT-TRC20", pairedAt: paired };
  const r2 = migrateFromPairing(legacy, 7);
  check("前台账时代旧行也能迁移(pairedWalletAddress 合成 current)",
    r2.status === "migrated" && r2.book["usdt-trc20"].current?.address === "T" + "B".repeat(33)
      && r2.book["usdt-trc20"].current?.source === "migrated"
      && r2.book["usdt-trc20"].current?.addedAt === paired);
  // c) 未配对 → empty(正常空,新用户直接进新模型)
  check("未配对行 → status=empty", migrateFromPairing({ walletPaired: false }, 7).status === "empty");
  check("无旧数据(null/undefined)→ status=empty",
    migrateFromPairing(null, 7).status === "empty" && migrateFromPairing(undefined, 7).status === "empty");
  // d) 🔴 corrupt:有配对痕迹但取不出任何地址 —— 必须显式报 corrupt,
  //    绝不允许返回 empty 让调用方把「空书」当成功写盘(那等于把用户地址静默清掉)。
  check("🔴 配对=true 但无任何地址 → status=corrupt(不得静默变空)",
    migrateFromPairing({ walletPaired: true, pairedAt: paired }, 7).status === "corrupt");
  check("🔴 配对=true 但地址是空串 → status=corrupt",
    migrateFromPairing({ walletPaired: true, pairedWalletAddress: "  ", pairedAt: paired }, 7).status === "corrupt");
  // e) 🔴 中途换绑单一律返还(主人 2026-08-05 拍板第 3 条;审计 P1 回归门)。
  //    真后台按链上侦测区分,mock 无法区分 → initiated/verifying 一律标返还;
  //    终态单(active/expired/cancelled)不返还。
  check("🔴 切换时刻停在 verifying 的换绑单 → 标记返还 $1",
    (() => { const rr = migrateFromPairing({ ...legacy, rebindOrder: { status: "verifying" } }, 7); return rr.status === "migrated" && rr.inFlightRebindRefund === true; })());
  check("🔴 initiated 中途单同样标返还",
    (() => { const rr = migrateFromPairing({ ...legacy, rebindOrder: { status: "initiated" } }, 7); return rr.status === "migrated" && rr.inFlightRebindRefund === true; })());
  check("终态换绑单(expired)不返还",
    (() => { const rr = migrateFromPairing({ ...legacy, rebindOrder: { status: "expired" } }, 7); return rr.status === "migrated" && rr.inFlightRebindRefund === false; })());
  check("无换绑单 → 不返还",
    (() => { const rr = migrateFromPairing(legacy, 7); return rr.status === "migrated" && rr.inFlightRebindRefund === false; })());
}

console.log(`\nselfcheck-rebind: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
