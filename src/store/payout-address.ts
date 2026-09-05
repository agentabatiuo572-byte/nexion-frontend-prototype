import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { payoutAddressApi, payoutAddressServerEnabled } from "@/api/runtime";
import type { PayoutAddressNetwork, PayoutAddressSnapshot } from "@/api/payout-address-api";
import type { ChainDepositChannel } from "./types";
import { normalizeAccountKey } from "./account-cloud";
import { readAccountRow, writeAccountRow } from "./account-scoped-storage";
import { mockServerNow } from "./server-time";
import { useApp } from "./app";
import { useConfig } from "./config";
import { recordWithdrawAddressUse } from "./risk-identity";
import { postMoneyBillsOnce } from "@/lib/money-receipt";
import {
  applyAddAddress,
  applyChangeAddress,
  CHAIN_TO_WITHDRAW_NETWORK,
  emptyBook,
  emptyNetworkState,
  eligibilityBindingFor,
  isChainAddressValid,
  migrateFromPairing,
  PAYOUT_NETWORKS,
  payoutChangeBlockReason,
  type LegacyPairingRow,
  type NetworkPayoutState,
  type PayoutAddressBook,
  type PayoutChangeBlockReason,
} from "./payout-address-core";

// 提现地址直管。每网络至多一个当前地址,用户直填 + OTP 确认;存量配对地址由
// migrateFromPairing 一次性自动迁移(source=migrated,无需重验、无新地址保护期)。
//
// server-canonical:PROD = GET /api/payout-addresses + POST(添加)/ PUT(更换,
// 服务端在事务内做 OTP 核验、在途单拦截、频控与冻结落库),本 store 整体被替换;
// client 只消费快照。按账号作用域存储(规格 ② 异常5:换号不继承)。
// 服务端接口与后端 payout-addresses 资源保持一致。

const ACCOUNTS_KEY = "nexgrid-payout-address-accounts-v1"; // { [accountKey]: PayoutAddressBook }
// 旧配对行只读消费(一次性迁移来源)。历史台账数据保留只读,不回写、不清洗、不删除。
const LEGACY_PAIRING_KEY = "nexgrid-wallet-pairing-accounts-v1";

const TO_SERVER_NETWORK: Record<ChainDepositChannel, PayoutAddressNetwork> = {
  "usdt-trc20": "USDT-TRC20",
  "usdt-bep20": "USDT-BEP20",
  "usdt-erc20": "USDT-ERC20",
};

function remoteBook(snapshot: PayoutAddressSnapshot): PayoutAddressBook {
  const result = emptyBook();
  for (const row of snapshot.addresses) {
    const network = PAYOUT_NETWORKS.find((candidate) => TO_SERVER_NETWORK[candidate] === row.network);
    if (!network) continue;
    const createdAt = Date.parse(row.createdAt);
    const effectiveAt = Date.parse(row.effectiveAt);
    result[network] = {
      current: {
        address: row.address,
        addedAt: createdAt,
        // Compatibility-imported addresses carry an effective time no later than their
        // import row; user-managed addresses always have a future effective time.
        source: effectiveAt <= createdAt ? "migrated" : "user",
      },
      history: [],
      freezeUntil: row.changePending ? effectiveAt : null,
      nextChangeAt: Date.parse(row.nextChangeAllowedAt),
    };
  }
  return result;
}

/** 频控天数(后台 D5 可配;boot 早期 config store 不可用时回落种子同值 7)。 */
function cooldownDaysNow(): number {
  try {
    return useConfig().config.withdrawRules.rebindCooldownDays;
  } catch {
    return 7;
  }
}

function normalizeBook(row: Partial<PayoutAddressBook>): PayoutAddressBook {
  const book = emptyBook();
  for (const network of PAYOUT_NETWORKS) {
    const r = row[network];
    if (r && typeof r === "object") {
      book[network] = {
        current: r.current ?? null,
        history: Array.isArray(r.history) ? r.history : [],
        freezeUntil: typeof r.freezeUntil === "number" ? r.freezeUntil : null,
        nextChangeAt: typeof r.nextChangeAt === "number" ? r.nextChangeAt : null,
      };
    }
  }
  return book;
}

function hydrate(accountKey: string): PayoutAddressBook {
  const row = readAccountRow<Partial<PayoutAddressBook>>(ACCOUNTS_KEY, accountKey);
  if (row && typeof row === "object") return normalizeBook(row);

  // 新行缺席 → 尝试从旧配对行一次性迁移(幂等:成功即写新行,下次直接走上面分支)。
  const legacy = readAccountRow<LegacyPairingRow>(LEGACY_PAIRING_KEY, accountKey);
  const migrated = migrateFromPairing(legacy, cooldownDaysNow());
  if (migrated.status === "migrated") {
    // 🔴 中途换绑单的 $1 返还先于写行(规格 RM01b ② 异常3 + 主人 2026-08-05 拍板第 3 条:
    // 一律返还)。真后台差异:server 迁移事务按链上侦测区分「已转出照常返还 / 未转出无事发生」;
    // mock 没有链上侦测、无法区分,一律按已转出返还 —— 宁可多还,不吞在途资金。
    // 幂等靠 ref 判重(postMoneyBillsOnce);返还失败只留痕不阻断迁移(地址迁移优先级
    // 高于 $1;PROD 由服务端事务保证两者原子,此处为 mock 存储层的诚实边界)。
    if (migrated.inFlightRebindRefund) {
      try {
        const outcome = postMoneyBillsOnce([
          {
            type: "bonus",
            symbol: "USDT",
            amount: 1,
            status: "posted",
            memoKey: "legacyRebindRefund",
            memo: "Verification transfer refund (flow retired)",
            ref: `legacy-rebind-refund:${accountKey}`,
          },
        ]);
        if (outcome !== "ok") console.error(`[payout-address] legacy rebind $1 refund not posted: ${outcome}`);
      } catch (e) {
        console.error("[payout-address] legacy rebind $1 refund failed", e);
      }
    }
    // persist-verdict-ok: 地址簿迁移写:失败下次启动重迁(非资金)
    writeAccountRow<PayoutAddressBook>(ACCOUNTS_KEY, accountKey, migrated.book);
    // 迁移地址按**原验证时刻**登记风控首见 —— 既有「新地址持有期」信号看到的是老地址,
    // 不产生新保护期(规格 ② 异常6:可直接提现、无需重验)。
    for (const network of PAYOUT_NETWORKS) {
      const current = migrated.book[network].current;
      if (current) {
        recordWithdrawAddressUse(accountKey, CHAIN_TO_WITHDRAW_NETWORK[network], current.address, current.addedAt);
      }
    }
    return migrated.book;
  }
  if (migrated.status === "corrupt") {
    // 🔴 有配对痕迹但取不出地址:不写空行(写了 = 把用户地址静默清掉且永不再重试)。
    // 内存维持空态,留痕;旧行原样保留,修复后的版本可重迁。
    console.error("[payout-address] legacy pairing row unmigratable — keeping in-memory empty, legacy row untouched");
  }
  return emptyBook();
}

export const usePayoutAddress = defineStore("payoutAddress", () => {
  // 账号维度。boot 期落 "default";账号确定后由 lib/account-scope 统一重绑。
  // 🔴 地址簿必按账号:设备级存储会让换号继承他人提现地址(资格旁路,规格 ② 异常5)。
  let boundKey = "default";
  const book = ref<PayoutAddressBook>(payoutAddressServerEnabled ? emptyBook() : hydrate(boundKey));
  const remoteChangeCooldownDays = ref<number | null>(payoutAddressServerEnabled ? null : cooldownDaysNow());
  const remoteEffectiveDelayHours = ref<number | null>(payoutAddressServerEnabled ? null : 24);
  let remoteLoadVersion = 0;

  function persist(): boolean {
    if (payoutAddressServerEnabled) return false;
    return writeAccountRow<PayoutAddressBook>(ACCOUNTS_KEY, boundKey, book.value);
  }

  /** Remote mode is fail-closed: only a validated server snapshot may populate the book.
   *  权威不可达自吞返 false(resilience 门);被更新调用顶替(superseded)不是失败事实,返 true。 */
  async function refreshRemote(): Promise<boolean> {
    if (!payoutAddressServerEnabled) return true;
    const version = ++remoteLoadVersion;
    try {
      const snapshot = await payoutAddressApi.list();
      if (version !== remoteLoadVersion) return true;
      book.value = remoteBook(snapshot);
      remoteChangeCooldownDays.value = snapshot.changeCooldownDays;
      remoteEffectiveDelayHours.value = snapshot.effectiveDelayHours;
      return true;
    } catch {
      return false;
    }
  }

  async function sendRemoteOtp() {
    if (!payoutAddressServerEnabled) throw new Error("PAYOUT_ADDRESS_SERVER_DISABLED_IN_SANDBOX");
    return payoutAddressApi.sendOtp();
  }

  async function saveRemoteAddress(input: {
    network: ChainDepositChannel;
    address: string;
    challengeNo: string;
    code: string;
    idempotencyKey: string;
  }): Promise<void> {
    if (!payoutAddressServerEnabled) throw new Error("PAYOUT_ADDRESS_SERVER_DISABLED_IN_SANDBOX");
    if (!isChainAddressValid(input.network, input.address)) throw new Error("PAYOUT_ADDRESS_FORMAT_INVALID");
    await payoutAddressApi.save({
      network: TO_SERVER_NETWORK[input.network],
      address: input.address.trim(),
      challengeNo: input.challengeNo,
      code: input.code,
      idempotencyKey: input.idempotencyKey,
    });
    // save 是动作路径:服务端已收单但回读失败必须冒给调用方(rebind 页 catch 展示错误)。
    // 🔴 readback 直读服务端,不复用 refreshRemote(z6 审计 P1:并发后台刷新抢 version 会让
    //    superseded→true 造成假成功)。readback 在写之后、单调最新:++version 作废一切
    //    在飞旧读后直接应用。
    let snapshot: Awaited<ReturnType<typeof payoutAddressApi.list>>;
    try {
      snapshot = await payoutAddressApi.list();
    } catch {
      throw new Error("PAYOUT_ADDRESS_READBACK_UNAVAILABLE");
    }
    remoteLoadVersion += 1;
    book.value = remoteBook(snapshot);
  }

  /** 账号切换重绑:装载该账号的地址簿(防跨账号继承地址与历史)。 */
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    remoteLoadVersion += 1;
    if (payoutAddressServerEnabled) {
      book.value = emptyBook();
      remoteChangeCooldownDays.value = null;
      remoteEffectiveDelayHours.value = null;
      void refreshRemote();
    } else {
      book.value = hydrate(boundKey);
      remoteChangeCooldownDays.value = cooldownDaysNow();
      remoteEffectiveDelayHours.value = 24;
    }
  }

  /** 单网络状态(缺省网络回落空态,不抛)。 */
  function stateFor(network: ChainDepositChannel): NetworkPayoutState {
    return book.value[network] ?? emptyNetworkState();
  }

  /** 当前地址(null = 未设置 → 提现页空态引导卡)。 */
  function currentFor(network: ChainDepositChannel) {
    return stateFor(network).current;
  }

  /** 喂风控判定的绑定快照(加工在 core 的 eligibilityBindingFor,行为哨兵覆盖)。 */
  function bindingFor(network: ChainDepositChannel) {
    return eligibilityBindingFor(stateFor(network));
  }

  /** 任一网络已设地址(钱包面「管理」入口态)。 */
  const hasAnyAddress = computed(() => PAYOUT_NETWORKS.some((network) => book.value[network]?.current));

  /**
   * 该网络是否有在途提现单。
   * 🔴 问**整张在途列表**(occupiesWithdrawalSlot 筛出的非终态集合)再按网络过滤,
   * 不读 latestWithdrawal —— 只看最新一笔时,一张在途单 + 一张更新的已到账单
   * 会把闸静默架空,收款地址能在放款前被换掉(2026-08-01 审计,资金安全级)。
   */
  function hasInFlightWithdrawalOn(network: ChainDepositChannel): boolean {
    return useApp().inFlightWithdrawals.some((w) => w.network === CHAIN_TO_WITHDRAW_NETWORK[network]);
  }

  /** 更换前的禁止动作判定(null = 可更换;页面与提交动作共用同一判据)。 */
  function changeBlockReason(network: ChainDepositChannel): PayoutChangeBlockReason | null {
    return payoutChangeBlockReason({
      now: mockServerNow(),
      hasInFlightWithdrawal: hasInFlightWithdrawalOn(network),
      nextChangeAt: stateFor(network).nextChangeAt,
    });
  }

  /**
   * Mock-only 首次添加。Remote mode 必须走 saveRemoteAddress,以服务端为唯一权威。
   * 添加后设置 24h 安全冻结与更换频控,与后端事务后置条件一致。
   */
  function addAddress(
    network: ChainDepositChannel,
    address: string,
  ): { ok: true } | { ok: false; reason: "invalid-address" | "already-set" | "persist-failed" } {
    if (payoutAddressServerEnabled) return { ok: false, reason: "persist-failed" };
    if (!isChainAddressValid(network, address)) return { ok: false, reason: "invalid-address" };
    const now = mockServerNow();
    const next = applyAddAddress(stateFor(network), address, now, cooldownDaysNow());
    if (!next) return { ok: false, reason: "already-set" };
    const prev = book.value;
    book.value = { ...prev, [network]: next };
    if (!persist()) {
      book.value = prev; // 持久化失败回滚内存态(同 deposits.patchRecord 先例)
      return { ok: false, reason: "persist-failed" };
    }
    recordWithdrawAddressUse(boundKey, CHAIN_TO_WITHDRAW_NETWORK[network], next.current!.address, now);
    return { ok: true };
  }

  /**
   * 原子更换(OTP + 二次确认已在页面侧完成;PROD = PUT /api/payout-addresses/{network}(TBD 候选命名)。
   * 拦截优先级:在途单 > 频控;成功后旧址入历史、24h 冻结、频控锚点落库 —— 同一次
   * persist = 同事务,失败整体回滚。
   */
  function changeAddress(
    network: ChainDepositChannel,
    address: string,
  ):
    | { ok: true }
    | { ok: false; reason: PayoutChangeBlockReason | "invalid-address" | "no-current" | "same-address" | "persist-failed" } {
    if (payoutAddressServerEnabled) return { ok: false, reason: "persist-failed" };
    const blocked = changeBlockReason(network);
    if (blocked) return { ok: false, reason: blocked };
    if (!isChainAddressValid(network, address)) return { ok: false, reason: "invalid-address" };
    const state = stateFor(network);
    if (!state.current) return { ok: false, reason: "no-current" };
    if (state.current.address === address.trim()) return { ok: false, reason: "same-address" };
    const now = mockServerNow();
    const next = applyChangeAddress(state, address, now, cooldownDaysNow());
    if (!next) return { ok: false, reason: "no-current" };
    const prev = book.value;
    book.value = { ...prev, [network]: next };
    if (!persist()) {
      book.value = prev;
      return { ok: false, reason: "persist-failed" };
    }
    recordWithdrawAddressUse(boundKey, CHAIN_TO_WITHDRAW_NETWORK[network], next.current!.address, now);
    return { ok: true };
  }

  /** ⚠️ DEV/DEMO-ONLY:tester 复位 —— 清除全部网络的冻结与频控(不动地址本身)。 */
  function _devClearRestrictions(): boolean {
    if (import.meta.env.PROD || payoutAddressServerEnabled) return false; // dev-only local reset, store-layer second guard
    const next = { ...book.value };
    for (const network of PAYOUT_NETWORKS) {
      next[network] = { ...next[network], freezeUntil: null, nextChangeAt: null };
    }
    book.value = next;
    // persist-verdict-ok: 提现地址簿落盘:失败时内存与磁盘分叉到下次重绑(非资金;提现真伪由服务端校验)
    persist();
    return true;
  }

  /** ⚠️ DEV/DEMO-ONLY:tester 复位 —— 清空当前账号地址簿(回到未设置空态)。 */
  function _devResetAddresses(): boolean {
    if (import.meta.env.PROD || payoutAddressServerEnabled) return false;
    book.value = emptyBook();
    // persist-verdict-ok: 提现地址簿落盘:失败时内存与磁盘分叉到下次重绑(非资金;提现真伪由服务端校验)
    persist();
    return true;
  }

  // tester 驱动通道:DEV 挂 globalThis.__nxDev(PROD 不挂 —— guard 双层之外层)。
  if (!import.meta.env.PROD) {
    const g = globalThis as unknown as { __nxDev?: Record<string, unknown> };
    g.__nxDev = {
      ...(g.__nxDev ?? {}),
      payoutClearRestrictions: _devClearRestrictions,
      payoutResetAddresses: _devResetAddresses,
    };
  }

  return {
    book,
    changeCooldownDays: computed(() => remoteChangeCooldownDays.value),
    effectiveDelayHours: computed(() => remoteEffectiveDelayHours.value),
    hasAnyAddress,
    stateFor,
    currentFor,
    bindingFor,
    changeBlockReason,
    addAddress,
    changeAddress,
    refreshRemote,
    sendRemoteOtp,
    saveRemoteAddress,
    bindAccount,
    _devClearRestrictions,
    _devResetAddresses,
  };
});
