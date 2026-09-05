import { normalizeAccountKey } from "@/store/account-cloud";

/**
 * 按账号分行的 uni storage 表(P2-8 存储作用域债修复)。
 * 设备级单键 → `{ [accountKey]: row }` 表,行随账号走,账号切换互不继承。
 * 写入走「现读现改现写」,与 account-cloud 表同款语义(窄竞态,多端各写各行)。
 * 真后台:行数据即 per-user 服务端资源,accountKey 即用户主键 —— 结构 backend-replaceable。
 */
export function readAccountRow<T>(tableKey: string, accountKey: string): T | null {
  try {
    const table = uni.getStorageSync(tableKey) as Record<string, T> | "";
    if (table && typeof table === "object") {
      const row = table[normalizeAccountKey(accountKey)];
      if (row && typeof row === "object") return row;
    }
  } catch {
    // storage unavailable
  }
  return null;
}

export function writeAccountRow<T>(tableKey: string, accountKey: string, row: T): boolean {
  try {
    const raw = uni.getStorageSync(tableKey) as Record<string, T> | "";
    const table = raw && typeof raw === "object" ? { ...raw } : ({} as Record<string, T>);
    table[normalizeAccountKey(accountKey)] = row;
    uni.setStorageSync(tableKey, table);
    return true;
  } catch {
    // storage unavailable
    return false;
  }
}

/**
 * Remove every local row owned by one mock account.  This is deliberately a
 * best-effort, key-scoped cleanup: remote mode never calls it, and unrelated
 * accounts/ device preferences remain intact.  Keeping the sweep here makes
 * account deletion resilient when a new account-row store is added without
 * having to remember a second deletion call site.
 */
export function removeAccountScopedPersistentState(rawAccountKey: string): boolean {
  const accountKey = normalizeAccountKey(rawAccountKey);
  let ok = true;
  try {
    const keys = typeof uni.getStorageInfoSync === "function"
      ? (uni.getStorageInfoSync().keys ?? [])
      : [];
    for (const tableKey of keys) {
      const raw = uni.getStorageSync(tableKey) as unknown;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const value = raw as Record<string, unknown>;

      if (tableKey === "nexgrid-auth-v1" && value.accountId === accountKey) {
        uni.removeStorageSync(tableKey);
        continue;
      }

      // All account-row stores and the account-cloud table use the account key
      // as a direct map key.  Do not remove the complete table when another
      // account still has a row.
      if (tableKey.endsWith("-accounts-v1") || tableKey === "nexgrid-account-cloud-v1") {
        if (!(accountKey in value)) continue;
        const next = { ...value };
        delete next[accountKey];
        uni.setStorageSync(tableKey, next);
        continue;
      }

      if (tableKey === "nexgrid-account-sessions-v1" && value.schema === 1 && value.sessions && typeof value.sessions === "object") {
        const sessions = Object.fromEntries(
          Object.entries(value.sessions as Record<string, unknown>)
            .filter(([, session]) => !session || typeof session !== "object" || (session as { accountKey?: unknown }).accountKey !== accountKey),
        );
        uni.setStorageSync(tableKey, { ...value, sessions });
        continue;
      }

      if (tableKey === "nexgrid-calibrated-device-v1" && accountKey in value) {
        const next = { ...value };
        delete next[accountKey];
        uni.setStorageSync(tableKey, next);
        continue;
      }

      if (tableKey === "nexgrid-risk-registry-v1" && value.accounts && typeof value.accounts === "object") {
        const accounts = { ...(value.accounts as Record<string, unknown>) };
        if (!(accountKey in accounts)) continue;
        delete accounts[accountKey];
        uni.setStorageSync(tableKey, { ...value, accounts });
        continue;
      }

      if (tableKey === "nexgrid-cluster-override-v1" && value.byAccount && typeof value.byAccount === "object") {
        const byAccount = { ...(value.byAccount as Record<string, unknown>) };
        if (!(accountKey in byAccount)) continue;
        delete byAccount[accountKey];
        uni.setStorageSync(tableKey, { ...value, byAccount });
        continue;
      }

      if (tableKey === "nexgrid-sponsorship-v1" && value.bindingsByAccount && typeof value.bindingsByAccount === "object") {
        const bindingsByAccount = { ...(value.bindingsByAccount as Record<string, unknown>) };
        if (!(accountKey in bindingsByAccount)) continue;
        delete bindingsByAccount[accountKey];
        uni.setStorageSync(tableKey, { ...value, bindingsByAccount });
      }
    }
  } catch {
    ok = false;
  }
  return ok;
}

/** CAS 写结果。conflict 区分「版本被别处推进了」与「storage 根本写不进去」——调用方对这两种
 *  失败的处置不同(前者要重读/提示,后者是环境故障)。 */
export interface AccountRowCasResult {
  ok: boolean;
  conflict: boolean;
  /** 成功=落盘后的新版本;冲突=磁盘上的当前版本;storage 故障=原样回传 expectedRev。 */
  rev: number;
}

/** 读一行的版本号。行不存在、或是 CAS 上线前写的老行 → 0(老行天然从 0 起步,不需要迁移)。 */
export function accountRowRev(row: unknown): number {
  const rev = (row as { rev?: unknown } | null)?.rev;
  return typeof rev === "number" && Number.isFinite(rev) ? rev : 0;
}

/**
 * 乐观并发(CAS)写:磁盘上该行的 rev 仍等于 expectedRev 才落盘,落盘后 rev+1。
 *
 * 为什么需要:H5 端 uni storage 就是 localStorage,同源多标签页共享同一份;每个标签页的
 * store 是各自的内存副本,全仓又没有任何 storage 事件重新水合 —— 两个标签页只要都打开过
 * 同一个页面,状态就**永久不同步**(不是几毫秒的传播延迟)。谁后写,谁就用自己那份陈旧
 * 数组整个覆盖对方。落到涉钱链路上 = 同一笔资产被两个标签页各领一次,而 account-cloud 的
 * usdtBalance 是 ADDITIVE_NUMBER_KEYS(按增量三路合并)→ 两次入账都记 = 真·双花。
 *
 * 🔴 诚实边界:localStorage 没有锁,「比 rev」与「写回」终究是两步,亚毫秒级插队窗口无法
 * 在客户端消除(Web Locks 只有 H5 有,uni 多端不可用)。本机制根治的是真正会发生的那个
 * 窗口 ——「状态永久陈旧」;残余窗口要靠真后端单事务(接后端时本函数随 mock 一起退役)。
 *
 * 老调用方零影响:writeAccountRow 不读 rev、不写 rev,行为与 CAS 上线前逐字节一致。
 * 只有走 CAS 的表才带 rev 字段,且 rev 由本函数独占维护(调用方不要自己塞 rev)。
 */
export function writeAccountRowCas<T extends object>(
  tableKey: string,
  accountKey: string,
  row: T,
  expectedRev: number,
): AccountRowCasResult {
  try {
    const raw = uni.getStorageSync(tableKey) as Record<string, T> | "";
    const table = raw && typeof raw === "object" ? { ...raw } : ({} as Record<string, T>);
    const key = normalizeAccountKey(accountKey);
    const currentRev = accountRowRev(table[key]);
    if (currentRev !== expectedRev) return { ok: false, conflict: true, rev: currentRev };
    const nextRev = currentRev + 1;
    table[key] = { ...row, rev: nextRev };
    uni.setStorageSync(tableKey, table);
    return { ok: true, conflict: false, rev: nextRev };
  } catch {
    // storage unavailable
    return { ok: false, conflict: false, rev: expectedRev };
  }
}

/** commit 的结果:成了带 result,没成分「被别处改过」与「本来就不该成交」两类。 */
export type AccountRowCommitResult<R> = { ok: true; result: R } | { ok: false; conflict: boolean };

/** 一次变更。返回 null = 在**磁盘最新状态**上复核,前置条件不成立(不写盘、不改内存)。 */
export type AccountRowApply<Row, R> = (current: Row) => { next: Row; result: R } | null;

export interface AccountRowCommitter<Row extends object> {
  /** 账号切换重绑:记住该账号行的版本,返回磁盘上的业务状态(null = 该账号还没有行)。 */
  bind(rawAccountKey: string): Row | null;
  commit<R>(apply: AccountRowApply<Row, R>): AccountRowCommitResult<R>;
  /** 当前绑定的账号键(只读)。 */
  accountKey(): string;
}

/**
 * 乐观并发提交器 —— staking.ts 那个 `commit()` 的共用引擎。
 *
 * read-modify-write 三步收在一个地方:
 *   ① 基准取**磁盘最新**行,而不是本标签页可能已经陈旧几小时的内存副本;
 *   ② apply 在新鲜状态上重新校验前置条件 —— 别处已经领走/消费掉的返回 null,
 *      调用方拿到 ok:false,绝不会第二次入账(这是双花的根);
 *   ③ 带 rev 做 CAS 落盘;rev 被推进过说明 ①→③ 之间又被插了一脚,重跑一轮(有界 3 次)。
 *
 * conflict=true 专指「期间被别处改过」,与「本来就不满足条件」分开,页面据此提示
 * 「数据已更新」而不是点了没反应。任何一种失败都不写盘、不改内存 = 绝不静默覆盖。
 *
 * 🔴 为什么抽成共用件而不是每个 store 抄一遍:重试上界、conflict 归因、「失败也要把磁盘
 * 最新态刷进内存」这三条都是**错了不会报错、只会静默双花**的细节。抄 N 份 = N 个各自
 * 长歪的机会。staking.ts 保留它自己那份内联实现(它的机器门按行文 pin 了实现细节,
 * 本轮不动它 —— 见 docs/changes/2026-08-04-money-cas-p1.md)。
 */
export function createAccountRowCommit<Row extends object>(opts: {
  tableKey: string;
  /** 磁盘行 → 业务状态。行不存在 / 格式不认识 → null。 */
  parse: (raw: unknown) => Row | null;
  /** 当前内存态 —— 磁盘读不出来时的基准(storage 不可用时保持 CAS 上线前的行为)。 */
  snapshot: () => Row;
  /** 把基准 / 结果刷进内存 ref。成功与「前置条件不成立」两条路都会调 —— 后者让本标签页
   *  立刻看到别处的最新结果,不再永久陈旧。 */
  sync: (row: Row) => void;
}): AccountRowCommitter<Row> {
  let boundKey = "default";
  let knownRev = 0;

  function readDisk(): { row: Row | null; rev: number } {
    const raw = readAccountRow<object>(opts.tableKey, boundKey);
    return { row: raw === null ? null : opts.parse(raw), rev: accountRowRev(raw) };
  }

  return {
    bind(rawAccountKey: string): Row | null {
      boundKey = normalizeAccountKey(rawAccountKey);
      const disk = readDisk();
      knownRev = disk.rev;
      return disk.row;
    },

    accountKey(): string {
      return boundKey;
    },

    commit<R>(apply: AccountRowApply<Row, R>): AccountRowCommitResult<R> {
      let raced = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const disk = readDisk();
        // 读不出行 = 该账号还没写过 / storage 不可用 → 退回内存态当基准(保持既有行为)。
        // 🔴 诚实边界(2026-08-04 对抗审计 P2-6):各 store 注释里写的「前置条件一律在
        // **磁盘最新**账本上复核」,在这两种情形下**不成立** —— 此刻复核的是内存态。
        // 后果有限(storage 读不出来时紧接着的写也会失败,commit 返 ok:false),
        // 但那句话是绝对措辞,读的人会当成无条件保证。写在这里,别让它当保证。
        const base = disk.row ?? opts.snapshot();
        const baseRev = disk.row ? disk.rev : knownRev;
        raced = raced || baseRev !== knownRev;
        const applied = apply(base);
        if (!applied) {
          opts.sync(base); // 前置条件不成立:把别处的最新结果同步到 UI,再回报失败
          knownRev = baseRev;
          return { ok: false, conflict: raced };
        }
        const w = writeAccountRowCas<Row>(opts.tableKey, boundKey, applied.next, baseRev);
        if (w.ok) {
          opts.sync(applied.next);
          knownRev = w.rev;
          return { ok: true, result: applied.result };
        }
        if (!w.conflict) return { ok: false, conflict: false }; // storage 写不进去:内存不动,按失败处理
        raced = true;
      }
      return { ok: false, conflict: true };
    },
  };
}
