import type { ChainDepositChannel, Withdrawal } from "./types";

// 提现地址直管纯逻辑。零依赖(vue/pinia/uni 均不引),
// payout-address store 与 scripts/selfcheck-rebind.mjs 共用同一实现。
//
// 用户按网络直接维护提现地址。
// 每网络至多一个当前提现地址,用户直填自管;更换 = 原子替换 + 24h 提现冻结 + 频控;
// 首次添加与更换都进入 24h 安全冻结;每次设置同时落下次可更换时间。

// ── 参数(MOCK 单源常量)────────────────────────────────────────────
// 频控天数走 config.withdrawRules.rebindCooldownDays(后台 D5 可配,调用方传入);
// 其余为服务端侧参数,mock 以常量表达。PROD:server 下发,本段被配置拉取替换。

/** 更换地址生效后提现冻结时长(freezeUntil = 更换时刻 + 24h)。 */
export const PAYOUT_FREEZE_MS = 24 * 3600 * 1000;
/** K3 地址账龄信号:账龄阈值 7 天(大额账龄闸)。 */
export const NEW_ADDRESS_AGE_DAYS = 7;
/** 账龄不足 + ≥此额 → manual(大额账龄闸)。 */
export const NEW_ADDRESS_LARGE_AMOUNT_USDT = 1000;

// ── 模型(规格 ③ 数据字典;server-canonical,按账号作用域存储)──────────

export type PayoutAddressSource = "user" | "migrated";

/** 当前生效的提现地址(每网络至多一个)。 */
export interface PayoutAddressEntry {
  address: string;
  /** 生效时间。user = 添加/更换时刻;migrated = 原配对验证时刻(账龄延续)。 */
  addedAt: number;
  source: PayoutAddressSource;
}

/** 历史地址(被替换后仅可查不可用)。 */
export interface PayoutHistoryEntry extends PayoutAddressEntry {
  replacedAt: number;
}

/** 单网络的地址状态。 */
export interface NetworkPayoutState {
  current: PayoutAddressEntry | null;
  history: PayoutHistoryEntry[];
  /** 更换成功即 now + 24h;冻结期内该网络提现提交禁用。null = 无冻结。 */
  freezeUntil: number | null;
  /** = 添加/更换成功时刻 + 频控天数。null = 可随时更换。 */
  nextChangeAt: number | null;
}

/** 全部网络的地址簿(持久化形态)。 */
export type PayoutAddressBook = Record<ChainDepositChannel, NetworkPayoutState>;

export const PAYOUT_NETWORKS: ChainDepositChannel[] = ["usdt-trc20", "usdt-erc20", "usdt-bep20"];

export function emptyNetworkState(): NetworkPayoutState {
  return { current: null, history: [], freezeUntil: null, nextChangeAt: null };
}

export function emptyBook(): PayoutAddressBook {
  return {
    "usdt-trc20": emptyNetworkState(),
    "usdt-erc20": emptyNetworkState(),
    "usdt-bep20": emptyNetworkState(),
  };
}

// ── 网络枚举映射(payout 收窄枚举 ↔ 提现单大写形态)────────────────────

export const CHAIN_TO_WITHDRAW_NETWORK: Record<ChainDepositChannel, Withdrawal["network"]> = {
  "usdt-trc20": "USDT-TRC20",
  "usdt-erc20": "USDT-ERC20",
  "usdt-bep20": "USDT-BEP20",
};

export function fromWithdrawNetwork(network: Withdrawal["network"]): ChainDepositChannel {
  const entry = (Object.entries(CHAIN_TO_WITHDRAW_NETWORK) as [ChainDepositChannel, Withdrawal["network"]][]).find(
    ([, v]) => v === network,
  );
  return entry ? entry[0] : "usdt-trc20";
}

// ── 校验 / 展示 ────────────────────────────────────────────────────

/**
 * 链地址格式校验(全站单源,禁两套正则)。TRC20 = T + 33 字符;ERC20/BEP20 = 0x + 40 hex。
 * ponytail: mock 派生地址是「近似 base58 大写」形态,故 TRON 位用宽松字母数字而非严格
 * base58;PROD 换链上校验库。永不做静默截断或自动纠正(规格 ② 异常1)。
 */
export function isChainAddressValid(network: ChainDepositChannel, address: string): boolean {
  const a = address.trim();
  if (network === "usdt-trc20") return /^T[A-Za-z0-9]{33}$/.test(a);
  return /^0x[0-9a-fA-F]{40}$/.test(a);
}

/** 掩码中段(规格 ⑤ 默认态)。提现页与地址管理页共用同一实现,不各写一份。 */
export function maskAddressMid(address: string): string {
  const a = address.trim();
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}····${a.slice(-4)}`;
}

// ── 禁止动作(规格 ④:在途单 > 频控;冻结只锁提现提交,不锁更换本身)──────

export type PayoutChangeBlockReason = "withdrawal-in-flight" | "cooldown";

/**
 * 更换地址前的禁止动作判定(null = 可发起)。
 * 优先级:该网络在途提现单 > 7 天频控(最硬的先报,与页面提示一致)。
 * 「在途」的唯一判据 = withdrawal-arrival-core 的 occupiesWithdrawalSlot(非终态即占用),
 * hasInFlightWithdrawal 由调用方从整张在途列表派生。
 */
export function payoutChangeBlockReason(input: {
  now: number;
  hasInFlightWithdrawal: boolean;
  nextChangeAt: number | null;
}): PayoutChangeBlockReason | null {
  if (input.hasInFlightWithdrawal) return "withdrawal-in-flight";
  if (input.nextChangeAt !== null && input.now < input.nextChangeAt) return "cooldown";
  return null;
}

// ── 原子操作(纯函数事务体;持久化归调用方,同一次写 = 同事务)─────────────

/**
 * 首次添加:空槽 → current 登记,同时设置 24h 提现冻结和更换频控。
 * addedAt 仍是既有新地址账龄信号的唯一首见时间。
 * 已有 current 时拒绝(更换必须走 applyChangeAddress 的显式确认链)→ null。
 */
export function applyAddAddress(
  state: NetworkPayoutState,
  address: string,
  now: number,
  cooldownDays: number,
): NetworkPayoutState | null {
  if (state.current !== null) return null;
  return {
    ...state,
    current: { address: address.trim(), addedAt: now, source: "user" },
    history: [...state.history],
    freezeUntil: now + PAYOUT_FREEZE_MS,
    nextChangeAt: now + cooldownDays * 24 * 3600 * 1000,
  };
}

/**
 * 原子更换(规格 ② 阳光2 / ④):旧址同事务入历史(replacedAt=now,不可再收款),
 * 新址成为唯一 current(addedAt=now),freezeUntil = now + 24h,
 * nextChangeAt = now + cooldownDays 天。空槽禁「更换」(必须走添加)→ null。
 */
export function applyChangeAddress(
  state: NetworkPayoutState,
  address: string,
  now: number,
  cooldownDays: number,
): NetworkPayoutState | null {
  if (state.current === null) return null;
  return {
    current: { address: address.trim(), addedAt: now, source: "user" },
    history: [...state.history, { ...state.current, replacedAt: now }],
    freezeUntil: now + PAYOUT_FREEZE_MS,
    nextChangeAt: now + cooldownDays * 24 * 3600 * 1000,
  };
}

// ── 冻结 / 倒计时(UI 置灰与 K3 评估层共用同一判据)───────────────────────

export function freezeRemainingMs(freezeUntil: number | null | undefined, now: number): number {
  if (freezeUntil === null || freezeUntil === undefined) return 0;
  return Math.max(0, freezeUntil - now);
}

export function isPayoutFrozen(freezeUntil: number | null | undefined, now: number): boolean {
  return freezeRemainingMs(freezeUntil, now) > 0;
}

/** 倒计时排版:hours=true → hh:mm:ss(冻结横幅),false → mm:ss。 */
export function formatClock(ms: number, opts?: { hours?: boolean }): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const two = (n: number) => String(n).padStart(2, "0");
  if (opts?.hours) {
    return `${two(Math.floor(total / 3600))}:${two(Math.floor((total % 3600) / 60))}:${two(total % 60)}`;
  }
  return `${two(Math.floor(total / 60))}:${two(total % 60)}`;
}

// ── 喂风控判定的绑定形态(withdrawal-eligibility 消费面)────────────────

/**
 * 单网络地址状态 → 资格判定的 binding 快照({freezeUntil?, verifiedAt?})。
 * verifiedAt = current.addedAt:大额账龄闸的账龄起点(migrated 保留原验证时刻,账龄延续)。
 * 无地址 → null(资格层跳过绑定相关闸)。这里是唯一的取数加工点,行为由
 * selfcheck-rebind 直接覆盖 —— 外壳(withdrawal-eligibility.ts)仍然只转发。
 */
export function eligibilityBindingFor(
  state: NetworkPayoutState | null | undefined,
): { freezeUntil?: number; verifiedAt?: number } | null {
  if (!state || !state.current) return null;
  return {
    freezeUntil: state.freezeUntil ?? undefined,
    verifiedAt: state.current.addedAt,
  };
}

// ── 存量迁移(规格 迁移总则 + RM01b ③;E-2)────────────────────────────

/** 旧 wallet-pairing 持久行(只读消费,不回写不清洗;字段全部宽松可缺)。 */
export interface LegacyPairingRow {
  walletPaired?: boolean;
  pairedWalletAddress?: string;
  pairedNetwork?: Withdrawal["network"];
  pairedAt?: number;
  bindings?: Array<{
    address?: string;
    network?: ChainDepositChannel;
    status?: string;
    createdAt?: number;
    verifiedAt?: number;
    freezeUntil?: number;
  }>;
  /** 旧换绑单(改版前发起的 $1 重验证;initiated/verifying = 切换时刻停在中途)。 */
  rebindOrder?: { status?: string } | null;
  lastRebindAt?: number;
}

export type PairingMigrationResult =
  | { status: "empty" }
  | {
      status: "migrated";
      book: PayoutAddressBook;
      count: number;
      /**
       * 🔴 切换时刻停在中途的换绑验证单($1 已可能转出、尚未被侦测)。
       * 主人 2026-08-05 拍板(plan 第 3 条):**一律返还** —— 真后台按链上侦测区分
       * 「已转出/未转出」,mock 没有真的链上侦测、无法区分,写死一个「假装能区分」的
       * 判断比老实承认更危险,故本地一律按已转出返还 $1(消费点走幂等资金收口点)。
       */
      inFlightRebindRefund: boolean;
    }
  | { status: "corrupt" };

/**
 * 配对老数据 → 地址直管地址簿。三态:
 *  - empty:无配对痕迹(新用户/未配对)→ 正常空书;
 *  - migrated:active 绑定 → 对应网络 current(source=migrated,addedAt=原验证时刻,
 *    账龄延续、无新地址保护期、无需重验);revoked → 历史;原冻结窗口与频控锚点原样携带;
 *  - corrupt:有配对痕迹但取不出任何地址 —— 🔴 显式报错,调用方**不得**把空书当成功
 *    写盘(那等于把用户地址静默清掉,E-2 固定靶)。
 */
export function migrateFromPairing(
  row: LegacyPairingRow | null | undefined,
  cooldownDays: number,
): PairingMigrationResult {
  if (!row || typeof row !== "object") return { status: "empty" };
  const bindings = Array.isArray(row.bindings) ? row.bindings : [];
  const hasSignal = row.walletPaired === true || bindings.some((b) => b?.status === "active");
  if (!hasSignal) return { status: "empty" };

  const book = emptyBook();
  let count = 0;
  const isNetwork = (n: unknown): n is ChainDepositChannel =>
    n === "usdt-trc20" || n === "usdt-erc20" || n === "usdt-bep20";
  const ts = (...candidates: Array<number | undefined>): number => {
    for (const c of candidates) if (typeof c === "number" && Number.isFinite(c)) return c;
    return 0;
  };

  for (let i = 0; i < bindings.length; i++) {
    const b = bindings[i];
    const address = typeof b?.address === "string" ? b.address.trim() : "";
    if (!address || !isNetwork(b?.network)) continue;
    const network = b.network;
    const effectiveAt = ts(b.verifiedAt, b.createdAt, row.pairedAt);
    if (b.status === "active") {
      book[network] = {
        ...book[network],
        current: { address, addedAt: effectiveAt, source: "migrated" },
        // 原冻结窗口原样携带 —— 迁移不放宽在途安全措施(已过期的窗口 remaining 自然为 0)。
        freezeUntil: typeof b.freezeUntil === "number" && Number.isFinite(b.freezeUntil) ? b.freezeUntil : null,
      };
      count++;
    } else if (b.status === "revoked") {
      const successor = bindings.slice(i + 1).find((n) => n?.status === "active" || n?.status === "revoked");
      book[network] = {
        ...book[network],
        history: [
          ...book[network].history,
          {
            address,
            addedAt: effectiveAt,
            source: "migrated",
            replacedAt: ts(successor?.verifiedAt, successor?.createdAt, row.lastRebindAt, b.verifiedAt, b.createdAt),
          },
        ],
      };
    }
  }

  // 台账化之前的最老行:只有 pairedWalletAddress,无 bindings。
  if (count === 0) {
    const address = typeof row.pairedWalletAddress === "string" ? row.pairedWalletAddress.trim() : "";
    if (address) {
      const network = fromWithdrawNetwork(row.pairedNetwork ?? "USDT-TRC20");
      book[network] = {
        ...book[network],
        current: { address, addedAt: ts(row.pairedAt), source: "migrated" },
      };
      count++;
    }
  }

  if (count === 0) return { status: "corrupt" };

  // 频控锚点换算:挂在持有 current 的网络上(旧模型单绑定,active 网络即锚点归属)。
  if (typeof row.lastRebindAt === "number" && Number.isFinite(row.lastRebindAt)) {
    for (const network of PAYOUT_NETWORKS) {
      if (book[network].current) {
        book[network] = { ...book[network], nextChangeAt: row.lastRebindAt + cooldownDays * 24 * 3600 * 1000 };
      }
    }
  }

  // 中途换绑单侦测(见 PairingMigrationResult.inFlightRebindRefund 的决议注释)。
  // 终态单(active/expired/cancelled)不返还:active 已生效、expired/cancelled 未转出。
  const orderStatus = row.rebindOrder?.status;
  const inFlightRebindRefund = orderStatus === "initiated" || orderStatus === "verifying";

  return { status: "migrated", book, count, inFlightRebindRefund };
}
