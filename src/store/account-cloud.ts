import type { Device, EarningsState, UserState, Withdrawal } from "@/store/types";
import type { EntrySurface } from "@/lib/entry-surface";

const STORAGE_KEY = "nexgrid-account-cloud-v1";

export interface AccountCloudSnapshot {
  schema: 1;
  accountKey: string;
  entrySurface: EntrySurface;
  updatedAt: number;
  user: UserState;
  devices: Device[];
  earnings: EarningsState;
  /**
   * 🔴 提现单**列表**,不是「最新一条」。
   * 真后端 GET /api/withdrawals 返回的就是列表;此前只存最新一条(单槽)是与真后端
   * 不同构的 mock 简化,直接导致两个 P0:① 第二笔建单把第一笔整个顶掉(钱已扣、单据
   * 从此不可达、到账推进也永不再碰它)② 为兜这个洞加的「在途不许再提」闸,在人工审核
   * 单没有出口时把用户永久锁死。改成列表后两个问题从根上消失,也满足项目铁律
   * 「Mock 必须 100% 真后台结构、随时可接真后台零重写」。
   */
  withdrawals: Withdrawal[];
}

export interface AccountSnapshotWriteResult {
  snapshot: AccountCloudSnapshot;
  persisted: boolean;
}

type AccountCloudTable = Record<string, AccountCloudSnapshot>;
type JsonRecord = Record<string, unknown>;

const ADDITIVE_NUMBER_KEYS = new Set([
  "usdtBalance",
  "nexBalance",
  "pendingEarnings",
  "withdrawableUsdt",
  "pendingReviewUsdt",
  "bonusLockedUsdt",
  "lockedNex",
  "cumulativeDepositUsdt",
  "today",
  "todayNEX",
  "thisWeek",
  "thisMonth",
  "total",
  "todayEarnings",
  "todayEarningsNEX",
  // FEAT-DEV02: per-device lifetime output — additive three-way-diff merge,
  // same mechanics as todayEarnings (carrier deltas add, no double count).
  "cumulativeEarningsUsdt",
]);

const TIME_ANCHOR_KEYS = new Set([
  "joinedAt",
  "purchasedAt",
  "activatedAt",
  "lastSettledAt",
  "miningSince",
  // R7 heartbeat is a time anchor: concurrent carrier snapshots keep the
  // freshest beat so an older write cannot incorrectly mark a device stale.
  "onlineHeartbeatAt",
  "interruptedAt",
  "startedAt",
  "completedAt",
  "submittedAt",
  "estimatedCompletion",
  // FEAT-WD01b 实际到账时刻。漏加会让 merge 退化成 last-write-wins 而非取最新
  // (踩过:R7 心跳字段就是这么漏的),两端并发时到账时间会被旧快照写回。
  "confirmedAt",
  "lastBucketedAt",
]);

const WITHDRAWAL_STATUS_RANK: Record<Withdrawal["status"], number> = {
  submitted: 0,
  "review-pending": 1,
  "review-passed": 2,
  processing: 3,
  sent: 4,
  confirmed: 5,
  // 异常态视为服务端最终结论,合并时胜过主链中间态。
  // ⚠️ 括号里原本写着「同一单不会两异常态互比」—— **那句话是错的**,而且正是三条 P0 的入口:
  // frozen 与四个终态同档,而 frozen 是**在途**态(不在 TERMINAL_STATUSES 里),
  // 「冻结 → 人工处置成拒绝/退款」是 D2 的正常流程,天天在两异常态之间互比。
  // 同档位的两份快照现按**字段**合并(mergeSameStatusWithdrawal),不再整行择一;
  // 但同档位互转(frozen→终态)这条边仍走不通 —— 那需要真时序判据,已独立立卡。
  "review-rejected": 6,
  frozen: 6,
  "address-invalid": 6,
  "tx-failed": 6,
  refunded: 6,
};

export function normalizeAccountKey(raw: string): string {
  const key = (raw || "default").trim().toLowerCase();
  return key || "default";
}

function readTable(): AccountCloudTable {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY) as AccountCloudTable | "";
    if (raw && typeof raw === "object") return raw;
  } catch {
    // storage unavailable
  }
  return {};
}

function writeTable(table: AccountCloudTable): boolean {
  try {
    uni.setStorageSync(STORAGE_KEY, table);
    return true;
  } catch {
    // storage unavailable
    return false;
  }
}

// NOTE (FEAT-DEV02): this module stays VALUE-IMPORT-FREE on purpose — the
// SPEC-4 merge sentinel transpiles it into a bare node VM where Vite aliases
// don't resolve. Legacy-snapshot backfill of the trade-in economics fields
// (cumulativeEarningsUsdt / paidPriceUsdt) therefore lives in
// device-types.ts backfillDeviceEconomics(), applied by app.ts at the two
// snapshot consumption points (boot + account switch). Merge handles missing
// fields gracefully (last-write), and the live state is always backfilled.
export function readAccountSnapshot(accountKey: string): AccountCloudSnapshot | null {
  const key = normalizeAccountKey(accountKey);
  const row = readTable()[key];
  if (!row || row.schema !== 1) return null;
  const upgraded = upgradeLegacyWithdrawals(row);
  // 读时升级(同 upgradeLegacyWithdrawals 的「只补形不迁移」纪律):user.email 只承载联系
  // 身份。旧 bindAccount 曾把账号内部 key("default")当 email 落盘,profile 会把它当邮箱
  // 渲出来(2026-08-15 T1 验收发现#2);非邮箱形一律归一成 mock demo 身份(与 app.ts boot
  // 种子同源)。这里是全部存储读(boot / bind / 幂等复读 / merge 的 latest 视图)的唯一
  // 入口 —— 归一化必须整体住在这:若只折叠成空串、把补值留给个别消费者,三路 merge 会把
  // 空串当 latest 差异反噬回治过的内存值(实测)。判据取「含 @」而非枚举 key 形状 ——
  // key 形状是开放集合,枚举必漏。
  return upgraded.user.email?.includes("@") ? upgraded : { ...upgraded, user: { ...upgraded.user, email: "alex@nexgrid.ai" } };
}

/**
 * 老快照升级(读时升级,schema 不升版 —— 只补形,不做破坏性迁移;老用户的历史单不丢):
 *  ① 单条 latestWithdrawal → withdrawals 列表(2026-08-01 单槽→列表迁移);
 *  ② FEAT-WD02:数字 fee → 结构化快照 { networkConfirmUsd, nexBurned, actualFeeUsd }。
 *     🔴 归一必须对「已是列表」的行也做 —— ①已上线,存量行**全部**带 withdrawals 数组,
 *     归一只嵌在单槽分支里就对所有真实存量行失效(tracking 读 fee.actualFeeUsd → undefined 崩)。
 *     旧数字只承载实收费:actualFeeUsd = 旧数字;networkConfirmUsd/nexBurned 不可考记 0,
 *     🔴 禁按新规则重算(展示层只读 actualFeeUsd,无信息损失)。
 */
function upgradeLegacyWithdrawals(row: AccountCloudSnapshot): AccountCloudSnapshot {
  const legacy = (row as unknown as { latestWithdrawal?: Withdrawal | null }).latestWithdrawal;
  const list: Withdrawal[] = Array.isArray(row.withdrawals) ? row.withdrawals : legacy ? [legacy] : [];
  const needsUpgrade =
    !Array.isArray(row.withdrawals) || list.some((wd) => typeof (wd as { fee?: unknown }).fee === "number");
  if (!needsUpgrade) return row;
  const withdrawals = list.map((wd) => {
    const feeRaw = (wd as { fee?: unknown }).fee;
    return typeof feeRaw === "number"
      ? { ...wd, fee: { networkConfirmUsd: 0, nexBurned: 0, actualFeeUsd: feeRaw } }
      : wd;
  });
  return { ...row, withdrawals };
}

export function writeAccountSnapshot(snapshot: AccountCloudSnapshot): boolean {
  const key = normalizeAccountKey(snapshot.accountKey);
  const table = readTable();
  table[key] = { ...snapshot, accountKey: key, updatedAt: Date.now() };
  return writeTable(table);
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function identityKey(value: unknown): string | null {
  if (!isJsonRecord(value)) return null;
  const id = value.id;
  if (typeof id === "string" || typeof id === "number") return `id:${id}`;
  const ts = value.ts;
  if (typeof ts === "string" || typeof ts === "number") return `ts:${ts}`;
  return null;
}

function resolveIdentityValue(
  base: unknown,
  next: unknown,
  latest: unknown,
): { value: unknown } | null {
  const beforeId = identityKey(base);
  const afterId = identityKey(next);
  const currentId = identityKey(latest);
  if (!beforeId && !afterId && !currentId) return null;
  if (!beforeId && afterId && currentId && afterId === currentId) return { value: latest };
  if (afterId && currentId && afterId === currentId) return null;
  if (currentId && currentId !== beforeId && afterId !== currentId) return { value: latest };
  if (afterId && afterId !== beforeId && currentId === beforeId) return { value: next };
  if (beforeId && !currentId && afterId) return { value: latest };
  if (beforeId && !afterId && currentId === beforeId) return { value: next };
  return null;
}

function mergeArrayByIdentity(base: unknown[], next: unknown[], latest: unknown[]): unknown[] | null {
  const rows = [...base, ...next, ...latest];
  if (!rows.length || rows.some((row) => !identityKey(row))) return null;

  const baseByKey = new Map(base.map((row) => [identityKey(row) as string, row]));
  const mergedByKey = new Map(latest.map((row) => [identityKey(row) as string, row]));
  const order = latest.map((row) => identityKey(row) as string);

  next.forEach((row) => {
    const key = identityKey(row) as string;
    const hasBefore = baseByKey.has(key);
    const before = baseByKey.get(key);
    if (hasBefore && sameValue(before, row)) return;
    const hasCurrent = mergedByKey.has(key);
    const current = mergedByKey.get(key);
    if (!hasBefore && hasCurrent) return;
    if (hasBefore && !hasCurrent) return;
    if (isJsonRecord(before) && isJsonRecord(row) && isJsonRecord(current)) {
      mergedByKey.set(key, mergeFieldByDiff(before, row, current));
    } else {
      mergedByKey.set(key, row);
    }
    if (!order.includes(key)) order.push(key);
  });

  return order.map((key) => mergedByKey.get(key));
}

function mergeFieldByDiff<T extends JsonRecord>(base: T, next: T, latest: T): T {
  const merged: JsonRecord = { ...latest };
  Object.keys(next).forEach((key) => {
    const before = base[key];
    const after = next[key];
    if (sameValue(before, after)) return;

    const current = latest[key];
    if (Array.isArray(before) && Array.isArray(after) && Array.isArray(current)) {
      const mergedArray = mergeArrayByIdentity(before, after, current);
      if (mergedArray) {
        merged[key] = mergedArray;
        return;
      }
    }
    const identityResolution = resolveIdentityValue(before, after, current);
    if (identityResolution) {
      merged[key] = identityResolution.value;
      return;
    }
    if (isJsonRecord(before) && isJsonRecord(after) && isJsonRecord(current)) {
      merged[key] = mergeFieldByDiff(before, after, current);
      return;
    }
    // A future heartbeat is invalid (clock rollback/skew poison). If one carrier
    // writes a valid beat while another snapshot still holds a future value, the
    // valid beat must recover the account instead of losing to Math.max forever.
    if (key === "onlineHeartbeatAt" && typeof after === "number") {
      const mergeNow = Date.now();
      const valid = [after, current].filter(
        (value): value is number => typeof value === "number" && value <= mergeNow,
      );
      merged[key] = valid.length > 0 ? Math.max(...valid) : null;
      return;
    }
    // A newly introduced anchor often transitions from undefined/null to a
    // number on two carriers at once. Freshest-wins must also cover that first
    // write, not only the number→number case below.
    if (TIME_ANCHOR_KEYS.has(key) && typeof after === "number") {
      merged[key] = typeof current === "number" ? Math.max(current, after) : after;
      return;
    }
    if (typeof before === "number" && typeof after === "number" && typeof current === "number") {
      if (!ADDITIVE_NUMBER_KEYS.has(key)) {
        merged[key] = after;
        return;
      }
      const delta = after - before;
      merged[key] = +(current + delta).toFixed(6);
      return;
    }
    merged[key] = after;
  });
  return merged as T;
}

function mergeDeviceByDiff(base: Device | undefined, next: Device, latest: Device | undefined): Device {
  if (!base || !latest) return next;
  const merged = mergeFieldByDiff(
    base as unknown as JsonRecord,
    next as unknown as JsonRecord,
    latest as unknown as JsonRecord,
  ) as unknown as Device;

  if (next.todayEarnings !== base.todayEarnings && latest.todayEarnings !== base.todayEarnings) {
    merged.todayEarnings = Math.max(latest.todayEarnings, next.todayEarnings);
  }
  if (next.todayEarningsNEX !== base.todayEarningsNEX && latest.todayEarningsNEX !== base.todayEarningsNEX) {
    merged.todayEarningsNEX = Math.max(latest.todayEarningsNEX, next.todayEarningsNEX);
  }
  return merged;
}

function mergeDevicesByDiff(base: Device[], next: Device[], latest: Device[]): Device[] {
  const baseById = new Map(base.map((d) => [d.id, d]));
  const nextById = new Map(next.map((d) => [d.id, d]));
  const latestById = new Map(latest.map((d) => [d.id, d]));
  const order = latest.map((d) => d.id);

  base.forEach((device) => {
    if (!nextById.has(device.id)) {
      latestById.delete(device.id);
      const idx = order.indexOf(device.id);
      if (idx >= 0) order.splice(idx, 1);
    }
  });

  next.forEach((device) => {
    const baseDevice = baseById.get(device.id);
    if (!baseDevice && !order.includes(device.id)) order.push(device.id);
    if (!baseDevice || !sameValue(baseDevice, device)) {
      latestById.set(device.id, mergeDeviceByDiff(baseDevice, device, latestById.get(device.id)));
    }
  });

  return order.map((id) => latestById.get(id)).filter((d): d is Device => !!d);
}

/**
 * 提现单列表三路合并:**按单号取并集**,同一单的状态取 rank 更靠后的那份。
 *
 * 关键性质(单条版没有的):两端各自新建的单**都会保留**,不再互相顶掉。
 * 状态用 rank 单调而不是 last-write —— 跨渲染进程「读最新」可能读到旧值,
 * last-write 会把已到账的单退回处理中。
 */
/** 合并用的安全取值:存量单 / 脏盘上它可能是 undefined 或任何东西,非法一律当 0(= 没退)。 */
function numericRefunded(w: Withdrawal): number {
  const v = (w as { nexRefunded?: unknown }).nexRefunded;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

/** 同上,时刻面。非法 / 缺失 = `undefined`,与消费方 `isUsableRefundInstant` 的值域对齐(0 会被它判越界)。 */
function numericRefundedAt(w: Withdrawal): number | undefined {
  const v = (w as { nexRefundedAt?: unknown }).nexRefundedAt;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}

/**
 * 🔴 退款事实 = **金额 + 发生时刻**,必须整对取自**同一份**快照。
 *
 * 为什么不能各取各的:两边各按自己的规则挑(金额取大、时刻取大/取胜者)会拼出一份
 * **不存在于任何一端**的事实 —— 比如 A 份「退 3 · 8 月 2 日」、B 份「退 0 · 无时刻」,
 * 分开取会得到「退 3 · 无时刻」,冲正行于是回落到观测时刻,而准确日期本来就在 A 份里。
 * 金额面 z6 已经栽过一次(整对象按状态 rank 取胜,平局把退款事实整份丢弃);
 * 时刻面是同一个丢失面的另一半,一并按事实整对取。
 *
 * 取法:金额大的那份胜(退款单调不减,大的是更新的证据);金额相同(含都为 0)时,
 * 优先**消费方会接受**的那份,再退到「带时刻的那份更完整」。
 *
 * 🔴 **已知缺口,本轮不修,理由是架构约束不是遗漏**(2026-08-12):
 * 独立审计报出「本层放行了消费方会拒绝的时刻(如早于提交的值),于是合法时刻可能被非法值顶掉、
 * 再被消费方丢弃 —— 准确日期掉进两次判据的缝里」。证伪结论:方向对,应当**用消费方的谓词排序**
 * (只排序,绝不拿它把值置 `undefined` —— 本层写 undefined 是把值从盘上抹掉,不可恢复)。
 *
 * 但本文件头注写明它**必须保持 value-import-free**:SPEC-4 的合并哨兵会把它转译进一个裸 node VM,
 * Vite 别名在那里解析不了。实测:从 `lib/withdrawal-bill-drafts` import 那个谓词 →
 * `Cannot find module '@/lib/withdrawal-bill-drafts'`,SPEC-4 门当场判红。
 * 而在这里复制第二份谓词,又正是「同一概念两处各自推导」——本仓明令要配逐键 parity 哨兵才许做。
 * 故本轮**不做**,登记为待办:要么给哨兵补别名解析,要么把谓词降到一个双方都能 import 的无依赖模块。
 * 残余风险在解析层收紧(整串锚定 + 双向值域)之后已明显变窄,但没有归零。
 */
function pickRefundEvidence(a: Withdrawal, b: Withdrawal): Withdrawal {
  const ra = numericRefunded(a);
  const rb = numericRefunded(b);
  if (ra !== rb) return ra > rb ? a : b;
  return numericRefundedAt(a) !== undefined ? a : b;
}

/**
 * 🔴 把退款事实盖回合并结果 —— **与「谁赢」这件事解耦**(2026-08-12 包 z8 并入主线时做的语义并集)。
 *
 * 两条支线在同一个缺陷上各修了一半,二选一都会丢东西,故合成一条:
 *  · 主线修的是「同档位赢家通吃 → 输家独有的字段整拍丢失」,解法是同档位逐字段派生合并;
 *  · 包 z8 修的是「退款事实随整对象一起被淘汰」,解法是金额取大 + 金额与时刻整对取。
 *
 * 为什么退款事实不能交给逐字段合并处理:那条规则是「内存这一拍为准」,而退款**单调不减** ——
 * 内存的 0 只可能是这一端还没看到,不该把磁盘上已知的 3 抹回去。
 * 为什么档位不同也要过这一道:输家可能是**唯一**带着退款证据的那份(状态先变、退款后补,
 * 或反之),整行择一会把它连同证据一起丢掉;而冲正分录的唯一判据就是这个字段。
 */
function applyRefundEvidence(base: Withdrawal, a: Withdrawal, b: Withdrawal): Withdrawal {
  const evidence = pickRefundEvidence(a, b);
  const refunded = numericRefunded(evidence);
  if (refunded <= 0) return base;
  const refundedAt = numericRefundedAt(evidence);
  if (numericRefunded(base) === refunded && numericRefundedAt(base) === refundedAt) return base;
  return { ...base, nexRefunded: refunded, nexRefundedAt: refundedAt };
}

/**
 * 同一状态的两份提现单快照 → 逐字段合并(不是二选一)。
 *
 * 只合并**可选信息字段**:它们是「服务端某一拍才补上」的东西,谁有值就该留下。
 * 身份与钱面(id / amount / network / address / fee / submittedAt / estimatedCompletion)
 * 同状态下两份快照本就相等,不参与合并 —— 真出现分歧属服务端串号,那是另一道闸的事。
 */
function mergeSameStatusWithdrawal(disk: Withdrawal, memory: Withdrawal): Withdrawal {
  // 🔴 判据**派生,不枚举**(2026-08-12 并入主线时自查抓到):上一版手写了一份
  // 「要合并哪些字段」的清单,而 `Withdrawal` 的可选字段是**会长的** —— 当场就已经漏了
  // `riskRoute`(7 个可选字段只列了 6 个)。手写清单必漏且静默失效,是本仓记过的族
  // (docs/PORT-PITFALLS.md P-082 同族);清单一漏,漏掉的那个字段就回到「整行择一」的老坏法。
  //
  // 改成对**实际存在的键**做派生:内存这份没给值的位置,用磁盘那份补上。
  // `{...disk, ...memory}` 本身已能处理「内存缺这个键」;补的是「内存**显式给了 undefined**」
  // 那一种(展开时会把磁盘的值覆盖掉)。提现单没有任何「把字段清空」的合法路径,
  // 所以「内存是 undefined」一律解释成「这一拍没带」,不解释成「要清掉」。
  //
  // ⚠️ 退款事实(nexRefunded / nexRefundedAt)是本规则的**唯一例外**,由调用方统一走
  // applyRefundEvidence 盖回:那两个字段单调不减且必须整对同源,不适用「内存为准」。
  const merged = { ...disk, ...memory } as unknown as Record<string, unknown>;
  const from = disk as unknown as Record<string, unknown>;
  for (const key of Object.keys(from)) {
    if (merged[key] === undefined && from[key] !== undefined) merged[key] = from[key];
  }
  return merged as unknown as Withdrawal;
}

function mergeWithdrawals(
  base: Withdrawal[],
  next: Withdrawal[],
  latest: Withdrawal[],
): Withdrawal[] {
  const byId = new Map<string, Withdrawal>();
  for (const w of [...latest, ...next]) {
    const prev = byId.get(w.id);
    if (!prev) {
      byId.set(w.id, w);
      continue;
    }
    const a = WITHDRAWAL_STATUS_RANK[prev.status] ?? 0;
    const c = WITHDRAWAL_STATUS_RANK[w.status] ?? 0;
    // 状态档位决定胜负(遍历序 `[...latest, ...next]` 让磁盘行先入 map,内存行是挑战方)。
    //
    // 🔴 **同档位不是平局,是「同一状态的两份快照」** —— 必须按字段合并,不能整行择一。
    // 缺陷(2026-08-11 R1 审计,包 z7 立案的直接原因):服务端这一拍只补了终态原因
    // (状态没变),整行择一时磁盘旧行赢 → 那条原因整拍丢失,而终态单不再被回查 = 永久丢。
    // 反向也坏:内存行赢时会把磁盘上已落盘的原因抹掉(R3 审计探针实测)。
    // 两种坏法同一个根:**赢家通吃会丢掉输家独有的字段**,而这些字段正是客服唯一的线索。
    //
    // 判据:同档位时逐字段取「有值的那个」,双方都有值以内存(本端刚写入的)为准。
    // 只处理提现单的可选信息字段,不碰 status/金额/地址等身份与钱面(它们同档位下本就相等)。
    //
    // 🔴 退款事实(金额 + 时刻)**两条支线都要过** applyRefundEvidence,与档位无关:
    // 它单调不减且必须整对同源,档位不同的那一支里输家可能是唯一带着证据的那份
    // (实测 `tx-failed→tx-failed`、`tx-failed→refunded`、重复投递三种情形合并后 nexRefunded 全变 0),
    // 而冲正分录的唯一判据就是这个字段 —— 丢了就等于退款从没发生过,且所有静态门全绿。
    //
    // ⚠️ 本包**刻意不引入**「谁更新」的时序字段来做仲裁:那需要可信时钟、
    // 跨端协调与字段级冲突规则,是一次独立的仲裁重构(主人 2026-08-12 拍板拆成独立卡),
    // 不该由一张契约卡附带。**因此「frozen 与四个终态同档 → 冻结单收不到最终结论」
    // 这条主线既有缺陷在本包内仍然存在**,已独立立卡,证据见该卡。
    const decided = c !== a ? (c > a ? w : prev) : mergeSameStatusWithdrawal(prev, w);
    byId.set(w.id, applyRefundEvidence(decided, prev, w));
  }
  // base 里有、两边都没有的 = 被某一端显式删除;当前无删除路径,留此语义防将来复活死单
  const deleted = new Set(base.filter((w) => !byId.has(w.id)).map((w) => w.id));
  return [...byId.values()]
    .filter((w) => !deleted.has(w.id))
    .sort((x, y) => y.submittedAt - x.submittedAt);
}

export function mergeAccountSnapshots(
  base: AccountCloudSnapshot,
  next: AccountCloudSnapshot,
  latest: AccountCloudSnapshot,
): AccountCloudSnapshot {
  return {
    schema: 1,
    accountKey: normalizeAccountKey(next.accountKey),
    entrySurface: next.entrySurface,
    updatedAt: Date.now(),
    user: mergeFieldByDiff(
      base.user as unknown as JsonRecord,
      next.user as unknown as JsonRecord,
      latest.user as unknown as JsonRecord,
    ) as unknown as UserState,
    devices: mergeDevicesByDiff(base.devices, next.devices, latest.devices),
    earnings: mergeFieldByDiff(
      base.earnings as unknown as JsonRecord,
      next.earnings as unknown as JsonRecord,
      latest.earnings as unknown as JsonRecord,
    ) as unknown as EarningsState,
    withdrawals: mergeWithdrawals(base.withdrawals ?? [], next.withdrawals ?? [], latest.withdrawals ?? []),
  };
}

/** 资金不变量收口:余额类字段 clamp ≥0,且 withdrawableUsdt ≤ usdtBalance(可提额度 ⊆
 *  总余额)。ADDITIVE_NUMBER_KEYS 把余额字段当独立计数器做三路累加,多端并发扣款(各自
 *  本地合法)合并时两笔扣款都累加 → 总余额被扣穿为负 / 可提额度虚高于总余额(超卖)。真后端
 *  单事务天然不会;mock 层在写盘前统一收口,storage 与内存都不落负余额/虚高可提额度
 *  (与单会话 debitBalance clamp 同一不变量,补住 merge 层这条旁路)。 */
function clampAccountFundInvariants(snapshot: AccountCloudSnapshot): AccountCloudSnapshot {
  const u = snapshot.user;
  const usdtBalance = Math.max(0, u.usdtBalance);
  const nexBalance = Math.max(0, u.nexBalance);
  const b = u.earningBuckets;
  if (!b) return { ...snapshot, user: { ...u, usdtBalance, nexBalance } };
  return {
    ...snapshot,
    user: {
      ...u,
      usdtBalance,
      nexBalance,
      earningBuckets: {
        ...b,
        withdrawableUsdt: Math.min(Math.max(0, b.withdrawableUsdt), usdtBalance),
        pendingReviewUsdt: Math.max(0, b.pendingReviewUsdt),
        bonusLockedUsdt: Math.max(0, b.bonusLockedUsdt),
        lockedNex: Math.max(0, b.lockedNex),
      },
    },
  };
}

export function mergeAndWriteAccountSnapshot(
  base: AccountCloudSnapshot | null,
  next: AccountCloudSnapshot,
): AccountCloudSnapshot {
  return mergeAndWriteAccountSnapshotResult(base, next).snapshot;
}

/** Fail-aware variant used by money/reward flows that may not acknowledge a lost write. */

export function mergeAndWriteAccountSnapshotResult(
  base: AccountCloudSnapshot | null,
  next: AccountCloudSnapshot,
): AccountSnapshotWriteResult {
  const key = normalizeAccountKey(next.accountKey);
  const latest = readAccountSnapshot(key);
  const rawMerged = base && latest ? mergeAccountSnapshots(base, next, latest) : { ...next, accountKey: key, updatedAt: Date.now() };
  const merged = clampAccountFundInvariants(rawMerged);
  // 🔴 **无条件写盘**。曾经在这里加过「内容没变就跳过」的脏检查(2026-08-04,已撤),
  // 别再加回来 —— 撤销理由是**实测**,不是风格偏好:
  //
  //   真浏览器、真 105KB 账户表:`setItem` 102µs · `JSON.stringify` 74µs
  //   → 跳过一次写盘只省 ~177µs,而能跳的只有 1/3 的拍,折合 **59µs**;
  //   而「内容变没变」的判据本身(键排序稳定序列化,每次要跑两遍)要 **1126µs**。
  //   **判据花掉的是它省下的约 19 倍。** 写盘从来不是贵的那头。
  //
  // 独立证伪还查出:跳过写等于**连内存里的新值一起回退**(`stored = latest` 会被
  // adopt 回去),而判据的安全性压在两条没写下来、也没有任何机器门守的不变量上 ——
  // 红测把 `todayEarnings` 塞进排除名单,钱当场少算(10 而非 25),全部哨兵照样绿。
  //
  // 真要降写盘成本,先量「贵在哪」再动手,别再从「少写几次」这个方向猜。
  // 台账:docs/changes/2026-08-04-design-v2.md;门:scripts/selfcheck-snapshot-write.mjs
  const writeSucceeded = writeAccountSnapshot(merged);
  const stored = readAccountSnapshot(key);
  return {
    snapshot: stored ?? merged,
    persisted: writeSucceeded && stored !== null,
  };
}
