import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { fundsServerEnabled, paymentApi, remoteApiEnabled } from "@/api/runtime";
import { createAccountRowCommit } from "./account-scoped-storage";
import { normalizeAccountKey } from "./account-cloud";
import { ONE_MINUTE_MS, mockServerNow } from "./server-time";
import { useApp } from "./app";
import { postReceiptOnce, reportStuckFunds } from "@/lib/money-receipt";
import { useFx } from "./fx";
import { vndForUsdt } from "./fx-core";
import {
  BANK_MAX_DEPOSIT_USDT,
  BANK_RECEIVE_ACCOUNTS,
  BANK_VND_TOLERANCE,
  CARD_DECLINE_RATE,
  CHAIN_REQUIRED_CONFIRMATIONS,
  MAX_CARD_DEPOSIT_USDT,
  MIN_CARD_DEPOSIT_USDT,
  MIN_DEPOSIT_USDT,
  cardChargeUsd,
  cardFeeUsd,
  chainDepositFeeUsdt,
  computeCreditedUsdt,
  deriveDepositAddress,
  isDuplicateAuthCode,
  isDuplicateTxHash,
  mockCardAuthCode,
  mockChainTxHash,
  mockDepositId,
  mockMemoCode,
  pickBankAccount,
  type BankReceiveAccount,
} from "./deposits-core";
import type { ChainDepositChannel, DepositChannel, DepositIntent, DepositRecord } from "./types";
import type { VietQrIntentSnapshot, VietQrIntentStatus } from "@/api/payment-api";
import { isAmbiguousOutcome } from "@/api/errors";
import {
  isPayableVietQrCreateStatus,
  remoteGenerationMatches,
} from "@/lib/vietqr-remote-safety";
import {
  beginVietQrReceiptPageRead,
  createVietQrReceiptPageState,
  failVietQrReceiptPageRead,
  invalidateVietQrReceiptPageReads,
  succeedVietQrReceiptPageRead,
} from "@/lib/vietqr-receipt-pagination";
import {
  bindVietQrIntent,
  finishVietQrCommand,
  finishVietQrCommandByIntent,
  vietQrCommandKey,
  type VietQrCommandIdentity,
} from "@/lib/vietqr-command-key";

/** Receipt-list fields proven by the canonical VietQR service. */
export interface ServerReceiptListItem {
  receiptNo: string;
  intentNo: string;
  viewType: string;
  status: string;
  creditedUsdt: number;
  createdAt: string;
}

// 入金 store(PAY-规格 [FEAT-PAY01] 链上三网络;[FEAT-PAY02] 银行轨意向单
// 生命周期:createBankIntent → 回调匹配/超时/取消;锁价语义见 [FEAT-PAY03])。
//
// MOCK 铁律:status server-canonical——状态推进(链上侦测 → 确认数 → 入账、
// 银行轨回单匹配、卡轨授权结果)一律由本文件扮演的「服务端」裁定,页面只提交意图、
// 只读结果,不自己算状态。client 可发起的写入口恰好三个,均为「用户动作」而非
// 「状态推进」:createBankIntent(下单)/ cancelBankIntent(撤单)/ submitCardPayment(付款)。
// PROD 切换:到账引擎与授权模拟整体删除,client 改为轮询收敛状态;那三个用户动作
// 各接一个 endpoint;入账(余额 + 账单)由 server 在 credited 落库事务内完成。
//
// ⚠️ 本文件注释里的 `/api/...` 全部是**候选命名**:PAY 规格未定义 API 层(全文 0 个
// /api/),PRD v3.7 也尚未同步入金新架构的接口章节。接后台时以届时的接口契约为准,
// 勿把这些路径当既定契约引用(规则:注释 endpoint 必在 PRD 有据,否则标候选)。

const ACCOUNTS_KEY = "nexgrid-deposits-accounts-v1"; // { [accountKey]: { records, intents } }

interface DepositsRow {
  records: DepositRecord[];
  intents: DepositIntent[];
}

/** 磁盘行 → 入金账本。行不存在 → null(调用方退回空账本 / 内存态)。 */
function parseRow(raw: unknown): DepositsRow | null {
  const row = raw as Partial<DepositsRow> | null;
  if (!row) return null;
  return {
    records: Array.isArray(row.records) ? row.records : [],
    // 🔴 读时升级(照 account-cloud 的 upgradeLegacyWithdrawals 范式,只补形不做破坏性迁移):
    // createdAt 是 2026-08-04 才加的字段,存量在途单没有它 —— 不补的话入账时透传出去就是
    // undefined,后台对账拿到一个空时刻。不可考的值**不臆造**:用 expireAt 减去锁价窗口
    // 会引入一个假的精确值,这里退而取 expireAt 本身(一定晚于真实下单时刻,但至少是真数据,
    // 且只影响这批老单的耗时统计,不影响任何判定)。
    intents: (Array.isArray(row.intents) ? row.intents : []).map((i) =>
      typeof i.createdAt === "number" ? i : { ...i, createdAt: i.expireAt },
    ),
  };
}

/** 链上通道 → tx 页网络短码(大写白名单键)。法币轨无映射:非链上转账,账单不落 network。 */
export const CHAIN_NET_SHORT: Partial<Record<DepositChannel, "TRC20" | "ERC20" | "BEP20">> = {
  "usdt-trc20": "TRC20",
  "usdt-erc20": "ERC20",
  "usdt-bep20": "BEP20",
};

/** bills memo 用通道标签(账单 memo 与既有 seed "Top-up · USDT-TRC20" 同款式)。 */
const CHANNEL_MEMO: Record<DepositChannel, string> = {
  "usdt-trc20": "USDT-TRC20",
  "usdt-erc20": "USDT-ERC20",
  "usdt-bep20": "USDT-BEP20",
  "bank-vietqr": "Bank VietQR",
  "card-intl": "Card",
};

// 确认推进节奏(演示压缩;真链 TRC20 分钟级)。detected → 1.2s → confirming,
// 之后按 requiredConfirmations 均分 ~10s 逐一推进 → 全程 ~11s 落 credited。
const DETECT_TO_CONFIRM_MS = 1200;
const CONFIRM_WINDOW_MS = 10_000;

export const useDeposits = defineStore("deposits", () => {
  // 账号维度。boot 期落 "default";账号确定后由 lib/account-scope 的
  // rebindAccountScopedStores 统一重绑(P-031 store 不互 import 的编排收口)。
  const records = ref<DepositRecord[]>([]);
  const intents = ref<DepositIntent[]>([]);
  const serverStatus = ref<"idle" | "loading" | "ready" | "error">("ready");
  const serverError = ref("");
  const remoteReceiptPage = createVietQrReceiptPageState<ServerReceiptListItem>();
  const remoteReceipts = ref<ServerReceiptListItem[]>(remoteReceiptPage.items);
  const remoteReceiptNextOffset = ref<number | null>(remoteReceiptPage.nextOffset);
  const remoteReceiptInitialStatus = ref(remoteReceiptPage.initial.status);
  const remoteReceiptInitialError = ref(remoteReceiptPage.initial.error);
  const remoteReceiptMoreStatus = ref(remoteReceiptPage.more.status);
  const remoteReceiptMoreError = ref(remoteReceiptPage.more.error);
  let remotePollTimer: ReturnType<typeof setInterval> | undefined;
  let remoteGeneration = 0;
  let remotePollingActive = false;
  let remoteRefreshInFlight = false;
  let remoteRefreshQueued = false;

  function syncRemoteReceiptPage(): void {
    remoteReceipts.value = remoteReceiptPage.items;
    remoteReceiptNextOffset.value = remoteReceiptPage.nextOffset;
    remoteReceiptInitialStatus.value = remoteReceiptPage.initial.status;
    remoteReceiptInitialError.value = remoteReceiptPage.initial.error;
    remoteReceiptMoreStatus.value = remoteReceiptPage.more.status;
    remoteReceiptMoreError.value = remoteReceiptPage.more.error;
  }

  function resetRemoteReceiptPage(): void {
    invalidateVietQrReceiptPageReads(remoteReceiptPage);
    remoteReceiptPage.items = [];
    remoteReceiptPage.nextOffset = null;
    remoteReceiptPage.initial = { status: "idle", error: "" };
    remoteReceiptPage.more = { status: "idle", error: "" };
    syncRemoteReceiptPage();
  }

  /** A hidden receipt page must not let its late response overwrite the next view. */
  function invalidateRemoteVietQrReceiptReads(): void {
    invalidateVietQrReceiptPageReads(remoteReceiptPage);
    syncRemoteReceiptPage();
  }

  // mock 到账引擎的在途定时器(depositId → timer)。账号切换即停:引擎跑在
  // client,跨账号继续推进会把钱记进新绑账号;PROD 服务端持续推进,
  // client 重新拉取即收敛(切回账号后记录停在 confirming,属 mock 已知边界)。
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let mockEngineRunning = false;
  let serverAccountKey = "default";

  /** App 生命周期的集中停机口：静态评审页、登出、会话失效和后台态都必须清空在途推进。 */
  function pauseMockEngine(): void {
    mockEngineRunning = false;
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
  }

  /**
   * App 生命周期的集中恢复口。只从已通过认证/会话门的业务循环出口调用；恢复时从持久态
   * 重建链上确认与银行意向单定时器，因此暂停期间不写状态，返回业务页后仍可收敛。
   */
  function resumeMockEngine(): void {
    // 🔴 远端模式一步都不推:本文件顶部那条「MOCK 铁律」说状态由本文件扮演的服务端裁定 ——
    // 远端模式下那个「服务端」是真的存在的,再扮演一次就是伪造。两条到账引擎(链上确认数
    // 推进 → settleCredited、银行意向单)都靠 mockEngineRunning 起停,这里关掉即整体停摆。
    // PROD 读回路:paymentApi 的 VietQR 意向单族(listVietQrIntents / getVietQrIntent,
    // 见 api 目录下的 payment-api 模块)已实现但全站零调用点 —— 接线是独立一件事。
    // (远端线在此处焊的是 `fundsServerEnabled` —— 与 `remoteApiEnabled` 是同一个谓词
    //  `mode !== "mock"`;资金域统一用前者,本文件其余几道闸同此。)
    if (fundsServerEnabled) return;
    if (mockEngineRunning) return;
    mockEngineRunning = true;
    syncBankIntents();
    syncChainDeposits();
  }

  /**
   * 落盘唯一出口:乐观并发提交器(存量 P1 · 跨标签页竞态重复入账)。
   *
   * 此前每条路径都是「现读内存 → 改 → writeAccountRow 覆盖式落盘」。H5 端 uni storage
   * 就是 localStorage,同源多标签页共享同一份,而全仓没有任何 storage 事件重新水合入金
   * 账本 —— 两个标签页只要都打开过充值页,状态就**永久不同步**。落到状态推进上:
   * 两端各自把同一笔 confirming 单推成 credited,各调一次 recordDeposit,而 usdtBalance
   * 是 account-cloud 的 ADDITIVE_NUMBER_KEYS(按增量三路合并)→ 两次入账都记 = 真·双花。
   *
   * 三条入账路径(链上 settleCredited / 银行轨 settleBankIntent / 卡轨 submitCardPayment)
   * 现在统一是「状态先 CAS 落盘,过了才动钱」,前置条件一律在**磁盘最新**账本上复核。
   */
  const rows = createAccountRowCommit<DepositsRow>({
    tableKey: ACCOUNTS_KEY,
    parse: parseRow,
    snapshot: () => ({ records: records.value, intents: intents.value }),
    sync: (row) => {
      records.value = row.records;
      intents.value = row.intents;
    },
  });
  const commit = rows.commit;
  /** 当前绑定账号键。 */
  function boundKey(): string {
    return fundsServerEnabled ? serverAccountKey : rows.accountKey();
  }

  /** 账号切换重绑:装载该账号分行,停掉上一账号的在途引擎定时器,
   *  再对新账号在途意向单做一次 server 状态收敛(过期落地 + 定时器重武装)。 */
  function bindAccount(rawAccountKey: string) {
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
    if (fundsServerEnabled) {
      remoteGeneration += 1;
      if (remotePollTimer) clearInterval(remotePollTimer);
      remotePollTimer = undefined;
      serverAccountKey = normalizeAccountKey(rawAccountKey);
      // (这里原有一行 `const expectedAccountKey = serverAccountKey;` —— 它只服务于调用点侧
      //  那个已删的 .catch 闭包,闭包没了就成了死变量。账号一致性判断落在两条刷新缝**内部**,
      //  不依赖这行。tsconfig 没开 noUnusedLocals,机器门抓不到,是独立审计逐行读出来的。)
      records.value = [];
      intents.value = [];
      resetRemoteReceiptPage();
      // 开发与生产统一读取服务端 VietQR provider。
      serverStatus.value = "idle";
      serverError.value = "";
      // 🔴 两支**各自显式调用**,不要经局部变量转发。
      //   韧性门是靠「void <函数名>(」这种裸发调用点来发现刷新缝的;写成
      //   `const refresh = 条件 ? A : B; void refresh()` 之后,A 和 B **一起从门的视野里消失**,
      //   缝数当场从 27 掉到 26(台账抓住了)。功能一模一样,但覆盖面少了两条。
      //   多两行换回可见性,顺带让新增的 VietQR 缝也进覆盖。
      // 🔴 这里**不再挂 .catch**:两条缝现在都按 ADR 自吞降级,失败态落在
      //   serverStatus / serverError 上。挂了也永远打不到,是死代码 ——
      //   (合并时我一度把远端那半 .catch 原样粘了回来,而它在本地这侧前一天刚被删掉,
      //    理由正是「缝内已自吞」;独立审计逐行比对两个父提交后指出来的。)
      void refreshRemoteVietQrDeposits();
      if (remotePollingActive) startRemoteVietQrPolling();
      return;
    }
    const row = rows.bind(rawAccountKey) ?? { records: [], intents: [] };
    records.value = row.records;
    intents.value = row.intents;
    if (mockEngineRunning) {
      syncBankIntents();
      syncChainDeposits();
    }
  }

  /** 🔴 链上入金的确认引擎重武装。
   *
   *  没有这一步的话:`scheduleConfirmations` 全仓**只在首次探测到入金时调用一次**(见下方
   *  唯一调用点),而定时器只活在内存里。于是用户**刷新一次页面 / 重新登录**,任何还停在
   *  detected|confirming 的单就再也没人推进 —— 永久卡住,页面上是「确认中」转到天荒地老。
   *  这与 syncBankIntents 对意向单做的事是同一件,只是链上轨一直漏了。
   *
   *  与 mock 引擎的「账号切换即停」不冲突:那条是防止旧账号的定时器往新账号身上写,
   *  而这里是给**新绑定的这个账号**重新武装它自己的在途单。
   *  PROD:整块删掉,状态由链上 watcher / webhook 推。 */
  function syncChainDeposits() {
    if (!mockEngineRunning) return;
    for (const rec of records.value) {
      if (rec.status !== "detected" && rec.status !== "confirming") continue; // 终态 / dust_hold 不重排
      if (timers.has(rec.depositId)) continue;
      scheduleConfirmations(rec.depositId);
    }
  }

  /** 专属充值地址:同账号同网络恒定(mock 确定性派生;PROD server 派发)。 */
  function depositAddress(network: ChainDepositChannel): string {
    // 🔴 远端模式返空串,**不返一个假地址**。deriveDepositAddress 是本地伪随机派生 ——
    // 形状像 TRON/EVM 地址,但没有任何人持有它的私钥。真后端未接线时把它显示出来
    // (页面还带一键复制),用户往那儿打 USDT 就是**永久丢币**。
    // 闸放在 store 而不是只放页面:页面那道是用户看得见的空态,这道是能被 node 直跑
    // 断言的不变量 —— 只焊在模板上的话,机器守不住(见 remote-authority-simulation)。
    if (fundsServerEnabled) return "";
    return deriveDepositAddress(boundKey(), network);
  }

  /** 当前绑定账号键(只读)。组件发起「跨延迟」的资金动作时先捕获,回调时传回校验 ——
   *  与两条 mock 引擎的 `const key = boundKey(); … if (boundKey() !== key) return;` 同形。 */
  function currentAccountKey(): string {
    return boundKey();
  }

  /** 单号铸造(server mint 形态)。🔴 必须查重:`DP-YYYYMMDD-NNNN` 同日仅 9000 种,
   *  而 depositId 是三轨共享主键 —— 撞号会让 `records.find(depositId)` 命中错记录,
   *  链上单被判成终态后引擎直接 return 且定时器已释放,那笔钱永久停在 confirming。
   *  次要标识(memoCode / authCode / txHash)本就有查重,主键反而没有,此处补齐。
   *  查重域 = records ∪ intents(两者共用同一号段:意向单入账时 intentId 即 depositId)。
   *
   *  🔴 查重域取**入参那份账本**(commit 里传的是磁盘最新态),不是内存副本:CAS 之前
   *  两个标签页撞号会被 last-write-wins 掩盖(其中一笔本来就会被顶掉),现在两笔都留得住,
   *  撞号就成了真事故 —— 与质押 `stk-${Date.now()}` 那条同型(见 staking.ts 的 mockServerId)。 */
  function mintDepositId(now: number, ledger: DepositsRow): string {
    let id = mockDepositId(now);
    // 重摇设上界:9000 号段被占满(或 mock 随机源被钉死)时无界 while 会转死页面。
    // 兜底返回带序号后缀的唯一串,宁可号形略异也不挂死(PROD 由 server 保证唯一)。
    for (let i = 0; i < 50; i++) {
      const taken =
        ledger.records.some((r) => r.depositId === id) ||
        ledger.intents.some((i2) => i2.intentId === id);
      if (!taken) return id;
      id = mockDepositId(now);
    }
    return `${id}-${ledger.records.length + ledger.intents.length}`;
  }

  // 通道启停位(server 配置非用户态,不入账号分行;mock 种子全启用。
  // PROD:GET /api/config/deposit-channels 的 enabled 字段,本段被拉取结果替换)。
  const chainChannelEnabled = ref<Record<ChainDepositChannel, boolean>>({
    "usdt-trc20": true,
    "usdt-bep20": true,
    "usdt-erc20": true,
  });

  /** ⚠️ DEV/DEMO-ONLY:后台启停链上通道(D1 通道配置形态)。 */
  function _devSetChannelEnabled(network: ChainDepositChannel, enabled: boolean): boolean {
    if (import.meta.env.PROD) return false;
    if (!(network in chainChannelEnabled.value)) return false; // console 驱动,入参不可信
    chainChannelEnabled.value = { ...chainChannelEnabled.value, [network]: enabled === true };
    return true;
  }

  // 收款账户池镜像(server 配置非用户态,不入账号分行;种子 = deposits-core 池,
  // 停用/熔断统一 enabled=false。PROD:GET /api/config/bank-accounts 下发,本段被替换)。
  const bankAccounts = ref<BankReceiveAccount[]>(BANK_RECEIVE_ACCOUNTS.map((a) => ({ ...a })));
  /** 池内还有可用户?否 → 银行转账通道置灰([FEAT-PAY02] ⑤ 空状态)。 */
  const bankRailAvailable = computed(() => bankAccounts.value.some((a) => a.enabled));

  /** ⚠️ DEV/DEMO-ONLY:按账号尾 4 位启停收款账户(admin bank-rail 启停/熔断形态)。 */
  function _devSetBankAccountEnabled(tail4: string, enabled: boolean): boolean {
    if (import.meta.env.PROD) return false;
    const tail = String(tail4).trim();
    if (!/^\d{4}$/.test(tail)) return false; // console 驱动,入参不可信
    if (!bankAccounts.value.some((a) => a.accountNumber.replace(/\s/g, "").endsWith(tail))) return false;
    bankAccounts.value = bankAccounts.value.map((a) =>
      a.accountNumber.replace(/\s/g, "").endsWith(tail) ? { ...a, enabled: enabled === true } : a,
    );
    return true;
  }

  /** 延迟回调禁 stale 闭包:一律现读**磁盘最新**账本现改现写
   *  (feedback_delayed_callback_stale_closure + 跨标签页 CAS)。
   *  失败不写盘也不改内存,防内存/存储分叉(同 bills.add 先例);跨 store
   *  的余额/账单原子性归 PROD server 事务,mock 已在文件头声明边界。 */
  function patchRecord(depositId: string, patch: Partial<DepositRecord>): DepositRecord | null {
    const r = commit((cur) => {
      let next: DepositRecord | null = null;
      const records2 = cur.records.map((x) => {
        if (x.depositId !== depositId) return x;
        next = { ...x, ...patch };
        return next;
      });
      if (!next) return null;
      return { next: { records: records2, intents: cur.intents }, result: next };
    });
    return r.ok ? r.result : null;
  }

  /** 入账(mock server 内部;confirming 走满 / dust 人工核销两条边共用)。
   *  幂等四重:状态机边界(仅 confirming|dust_hold 可入)在**磁盘最新**记录上复核 +
   *  CAS 落盘 + recordDeposit 原子入账 + postReceiptOnce 以 txHash 为 ref 判重。
   *  PROD:server 在同一事务内置 credited + 记账 + 写账单(复式分录见规格 §5)。
   *
   *  🔴 顺序是「先落状态,过了才动钱」—— 与 submitCardPayment 同一条铁律。原先是
   *  「先入账、再 patch 状态」:两个标签页各拿自己陈旧的内存副本判状态门,两次
   *  recordDeposit 都过,ADDITIVE 的 usdtBalance 把两笔都记上 = 同一笔充值入账两次。 */
  function settleCredited(depositId: string): boolean {
    if (fundsServerEnabled) return false; // 入账 = 加钱,远端模式只归服务端(引擎已停,这是二层闸)
    const now = mockServerNow();
    const r = commit((cur) => {
      const rec = cur.records.find((x) => x.depositId === depositId);
      if (!rec) return null;
      // credited/returned 终态禁再处置(server 409 形态);detected 不可直接入账。
      if (rec.status !== "confirming" && rec.status !== "dust_hold") return null;
      if (rec.creditedUsdt <= 0) return null; // gross ≤ fee 的 dust 不可核销入账,只能退回
      return {
        next: {
          records: cur.records.map((x) =>
            x.depositId === depositId ? { ...x, status: "credited" as const, creditedAt: now } : x,
          ),
          intents: cur.intents,
        },
        result: rec,
      };
    });
    if (!r.ok) return false;
    const rec = r.result;
    if (!useApp().recordDeposit(rec.creditedUsdt)) {
      // 钱没加成:把状态退回去。否则单据写着「已到账」而余额没动,且状态已是终态 ——
      // 引擎再也不会推进这一笔,那笔钱就人间蒸发了。
      const undone = commit((cur) => ({
        next: {
          records: cur.records.map((x) =>
            x.depositId === depositId ? { ...x, status: rec.status, creditedAt: rec.creditedAt } : x,
          ),
          intents: cur.intents,
        },
        result: true as const,
      }));
      // 🔴 回滚自己也会失败,返回值必须被消费:失败时单据停在 credited 而余额没加,
      // 引擎不会再推进这一笔 —— 静默吞掉等于让这笔钱悄无声息地卡死。走与收口点同一套
      // 响亮终态(交易号 + 待对账队列 + 明确文案),把它交到用户和后台手上。
      if (!undone.ok) reportStuckFunds(useApp().captureMoney(), depositId);
      return false;
    }
    // 记账走收口点的幂等变体(以 txHash 为 ref 判重),不再裸调 bills.addOnce ——
    // 「钱动了、账没记上」那一族的收口纪律,入金轨同样适用。
    // 入金已落定(recordDeposit 不回滚),收据没写上 = 「钱动了账没记」:同 R6 结算页处置 —— 登记待对账 + 交易号(收口点已弹提示)。
    if (!postReceiptOnce({
      type: "topup",
      symbol: "USDT",
      amount: rec.creditedUsdt,
      status: "posted",
      memo: `Top-up · ${CHANNEL_MEMO[rec.channel]}`,
      ref: rec.txHash ?? rec.depositId,
      // 链上通道落网络码位(法币轨为 undefined 不落);账单详情跳转不再依赖 memo 文案正则
      network: CHAIN_NET_SHORT[rec.channel],
    })) reportStuckFunds(useApp().captureMoney(), String(rec.txHash ?? rec.depositId), "receipt");
    return true;
  }

  /** mock 到账引擎:detected → confirming(或 dust_hold 停住)→ 逐步推进
   *  确认数 → 走满调 settleCredited。每步回源读当前记录,终态即停。 */
  function scheduleConfirmations(depositId: string) {
    if (!mockEngineRunning) return;
    const key = boundKey();
    function queue(ms: number) {
      if (!mockEngineRunning) return;
      timers.set(depositId, setTimeout(step, ms));
    }
    function step() {
      timers.delete(depositId);
      if (!mockEngineRunning) return;
      if (boundKey() !== key) return; // 账号已切换,mock 引擎停(见顶部注释)
      const rec = records.value.find((r) => r.depositId === depositId);
      if (!rec) return;
      if (rec.status === "detected") {
        if (rec.grossAmountUsdt < MIN_DEPOSIT_USDT) {
          // 🔴 落盘失败要重排,不能就地 return:dust_hold 是**终态**,这一步没写进去
          // 就再也没人来推第二次(confirming 那支因为会重入尚能自愈,这支不能)。
          if (!patchRecord(depositId, { status: "dust_hold" })) queue(stepDelay(1));
          return;
        }
        if (!patchRecord(depositId, { status: "confirming" })) {
          queue(stepDelay(rec.requiredConfirmations ?? 1));
          return;
        }
        queue(stepDelay(rec.requiredConfirmations ?? 1));
        return;
      }
      if (rec.status !== "confirming") return; // 终态/dust_hold 不再推进
      const required = rec.requiredConfirmations ?? 1;
      const confs = Math.min(required, (rec.confirmations ?? 0) + 1);
      // persist-verdict-ok: 到账确认数进度,失败下一次轮询重放同一值
      patchRecord(depositId, { confirmations: confs });
      if (confs >= required) {
        // 🔴 接返回值再重排:settleCredited 会因 CAS 冲突耗尽 / 落盘失败 / recordDeposit
        // 拒绝而返 false,而定时器在 step 开头就已经 delete 掉了 —— 不重排 = 这笔永久卡 confirming。
        if (!settleCredited(depositId)) queue(stepDelay(required));
        return;
      }
      queue(stepDelay(required));
    }
    function stepDelay(required: number): number {
      return Math.max(400, Math.round(CONFIRM_WINDOW_MS / Math.max(1, required)));
    }
    queue(DETECT_TO_CONFIRM_MS);
  }

  /** ⚠️ DEV/DEMO-ONLY:模拟「链上侦测到入账转账」(tester 驱动通道)。
   *  双层 guard 同 _devSetEligibilityTimeout 模式(globalThis 挂载层 + 本层)。
   *  同 txHash 重复上报 no-op 返 null([FEAT-PAY01] ④ 幂等)。
   *  PROD 无此入口:真实链路 = 链上侦测服务回报,server 推进状态。 */
  function _devSimulateIncomingTransfer(
    network: ChainDepositChannel,
    amountUsdt: number,
    txHash?: string,
  ): DepositRecord | null {
    // 🔴 这里**故意不焊**服务端档闸(远端线合并前焊过,本次合并撤掉,理由如下):
    // 登记只写一条 detected 行,一分钱不动 —— 加钱在 settleCredited、推进在 mock 引擎,
    // 两处都已按服务端档关死。而 remote-authority-simulation ⑦ 要证的正是「引擎停了」:
    // 登记这一步若在远端档也返 null,那条断言变成恒真(记录都建不出来,当然不推进)——
    // 那正是该门头注点名要防的假绿。本函数只在 DEV 构建导出,下一行再兜一次 PROD。
    if (import.meta.env.PROD) return null;
    if (!(network in CHAIN_REQUIRED_CONFIRMATIONS)) return null; // console 驱动,入参不可信
    if (!Number.isFinite(amountUsdt) || amountUsdt <= 0 || amountUsdt > 1e9) return null;
    const hash = txHash && txHash.trim() ? txHash.trim() : mockChainTxHash();
    if (isDuplicateTxHash(records.value, hash)) return null; // no-op
    const now = mockServerNow();
    const gross = +amountUsdt.toFixed(2);
    const fee = chainDepositFeeUsdt(network);
    // 追加型:单号与 txHash 判重都跑在磁盘最新账本上,冲突时整段在最新账本上重放。
    const r = commit((cur) => {
      if (isDuplicateTxHash(cur.records, hash)) return null; // no-op(别处已登记同一笔)
      const rec: DepositRecord = {
        depositId: mintDepositId(now, cur),
        channel: network,
        grossAmountUsdt: gross,
        feeUsdt: fee,
        creditedUsdt: computeCreditedUsdt(gross, fee),
        address: depositAddress(network),
        txHash: hash,
        confirmations: 0,
        requiredConfirmations: CHAIN_REQUIRED_CONFIRMATIONS[network],
        status: "detected",
        createdAt: now,
      };
      return { next: { records: [rec, ...cur.records], intents: cur.intents }, result: rec };
    });
    if (!r.ok) return null;
    scheduleConfirmations(r.result.depositId);
    return r.result;
  }

  /** ⚠️ DEV/DEMO-ONLY(后台动作形态):dust_hold 人工处置——核销入账或登记退回。
   *  仅 dust_hold 可处置,终态拒绝(server 409 形态)。PROD:后台 D1 高敏动作
   *  (确认 + 理由 + 审计 + 失败态),endpoint 形态
   *  POST /api/admin/deposits/:id/resolve { action: "credit"|"return", reason };client 无入口。 */
  function _devResolveDustHold(depositId: string, resolution: "credit" | "return"): boolean {
    if (import.meta.env.PROD) return false;
    const rec = records.value.find((r) => r.depositId === depositId);
    if (!rec || rec.status !== "dust_hold") return false;
    if (resolution === "credit") return settleCredited(depositId);
    return patchRecord(depositId, { status: "returned" }) !== null;
  }

  // ════════ 银行轨意向单生命周期([FEAT-PAY02] ③④;mock 扮演 server)════════

  /** 意向单补丁(同 patchRecord:基准取磁盘最新,CAS 落盘,失败不写盘不改内存)。 */
  function patchIntent(intentId: string, patch: Partial<DepositIntent>): DepositIntent | null {
    const r = commit((cur) => {
      let next: DepositIntent | null = null;
      const intents2 = cur.intents.map((i) => {
        if (i.intentId !== intentId) return i;
        next = { ...i, ...patch };
        return next;
      });
      if (!next) return null;
      return { next: { records: cur.records, intents: intents2 }, result: next };
    });
    return r.ok ? r.result : null;
  }

  function clearIntentTimer(intentId: string) {
    const timer = timers.get(intentId);
    if (timer) {
      clearTimeout(timer);
      timers.delete(intentId);
    }
  }

  /** 锁价窗到点置 expired(mock server 侧推进)。回调现读 intents.value 现改,
   *  禁 stale 闭包(feedback_delayed_callback_stale_closure);账号切换即停。 */
  function scheduleIntentExpiry(intentId: string) {
    if (!mockEngineRunning) return;
    const key = boundKey();
    const intent = intents.value.find((i) => i.intentId === intentId);
    if (!intent || intent.status !== "awaiting_payment") return;
    clearIntentTimer(intentId);
    timers.set(
      intentId,
      setTimeout(
        () => {
          timers.delete(intentId);
          if (!mockEngineRunning) return;
          if (boundKey() !== key) return; // 账号已切换,mock 引擎停(见顶部注释)
          const cur = intents.value.find((i) => i.intentId === intentId);
          if (!cur || cur.status !== "awaiting_payment") return;
          // persist-verdict-ok: 意向单过期标记,失败下一次扫描重放
          patchIntent(intentId, { status: "expired" });
        },
        Math.max(0, intent.expireAt - mockServerNow()),
      ),
    );
  }

  /** server 状态收敛(启动/换号即跑):已过锁价窗的在途单落 expired,未过期的重新武装
   *  超时定时器。PROD:server 持续推进,client 拉取即收敛,本函数删除。 */
  function syncBankIntents() {
    if (!mockEngineRunning) return;
    const now = mockServerNow();
    intents.value
      .filter((i) => i.status === "awaiting_payment")
      .forEach((i) => {
        // persist-verdict-ok: 意向单过期标记,失败下一次扫描重放
        if (i.expireAt <= now) patchIntent(i.intentId, { status: "expired" });
        else scheduleIntentExpiry(i.intentId);
      });
  }

  /** 生成付款单(PROD = POST /api/deposits/bank-intents;校验失败即 422 形态返 null)。
   *  锁价:fxRate/vndAmount/expireAt 均在此刻定格,后续调价不影响本单(规格 ② 异常2)。 */
  function createBankIntent(usdtAmount: number): DepositIntent | null {
    // 🔴 同 depositAddress:付款单会把收款账号 + 附言码摆出来(都带一键复制),而收款
    // 账户来自本地常量表 BANK_RECEIVE_ACCOUNTS,远端模式下没有任何服务端在对账 ——
    // 用户照着转了,钱就打进一个没人认领的账户。不发钱不等于无害:这条轨的伤害
    // 发生在**链外**。返 null = 既有的 422 形态,调用方已有分支。
    if (fundsServerEnabled) return null;
    if (!Number.isFinite(usdtAmount)) return null;
    const amt = +usdtAmount.toFixed(2);
    if (amt < MIN_DEPOSIT_USDT || amt > BANK_MAX_DEPOSIT_USDT) return null;
    const fx = useFx();
    // 牌价不可用禁下单([FEAT-PAY03] ② 异常1);锁价窗缺失同视为配置不可用(禁写死回退)。
    if (!fx.fxAvailable || fx.lockWindowMin <= 0) return null;
    // 收款账户池无可用户(全部停用/熔断)禁下单([FEAT-PAY02] ⑤ 空状态)
    const bankAccount = pickBankAccount(intents.value.length, bankAccounts.value);
    if (!bankAccount) return null;
    const now = mockServerNow();
    const fxRate = fx.quoteRate;
    // 追加型:单号与附言码判重都跑在磁盘最新账本上(两个标签页同时下单不许撞号 ——
    // depositId 是三轨共享主键,撞号会让 find() 命中错单据,那笔钱永久卡住)。
    const r = commit((cur) => {
      // 附言码在途期内唯一(mock 域 = 本账号在途单;PROD server 全局唯一)
      let memoCode = mockMemoCode();
      while (cur.intents.some((i) => i.status === "awaiting_payment" && i.memoCode === memoCode)) {
        memoCode = mockMemoCode();
      }
      const intent: DepositIntent = {
        intentId: mintDepositId(now, cur),
        usdtAmount: amt,
        fxRate,
        vndAmount: vndForUsdt(amt, fxRate),
        memoCode,
        bankAccount,
        status: "awaiting_payment",
        createdAt: now,
        expireAt: now + fx.lockWindowMin * ONE_MINUTE_MS,
      };
      return { next: { records: cur.records, intents: [intent, ...cur.intents] }, result: intent };
    });
    if (!r.ok) return null;
    scheduleIntentExpiry(r.result.intentId);
    return r.result;
  }

  /** 取消付款单:client 仅可对 awaiting_payment 执行;终态再处置拒绝(server 409 形态)。
   *  状态门在**磁盘最新**意向单上复核:别处刚付款/刚超时的单不会被这边撤掉。 */
  function cancelBankIntent(intentId: string): { ok: boolean; conflict?: boolean } {
    const r = commit((cur) => {
      const intent = cur.intents.find((i) => i.intentId === intentId);
      if (!intent || intent.status !== "awaiting_payment") return null;
      return {
        next: {
          records: cur.records,
          intents: cur.intents.map((i) => (i.intentId === intentId ? { ...i, status: "cancelled" as const } : i)),
        },
        result: true as const,
      };
    });
    if (!r.ok) return { ok: false, conflict: r.conflict };
    clearIntentTimer(intentId);
    return { ok: true };
  }

  /** 银行轨入账(mock server 内部;精确匹配 / 差额按实收核销两条边共用)。
   *  幂等三重同链上 settleCredited:状态机边界(调用方把关)+ 记录判重(depositId=intentId)
   *  + postReceiptOnce(ref=intentId)。0 手续费;PROD 同事务置 credited + 记账 + 写账单(§5 分录)。 */
  function settleBankIntent(intentId: string, creditedUsdt: number, receivedVnd: number): boolean {
    if (fundsServerEnabled) return false; // 同 settleCredited:银行轨入账也是加钱
    const credited = +creditedUsdt.toFixed(2);
    if (credited <= 0) return false;
    const now = mockServerNow();
    // 🔴 同 settleCredited:先把「意向单置 credited + 关联入金单落账」CAS 落盘,过了才动钱。
    // 新增的 credited 终态门是双花的闸 —— 原先本函数没有任何状态门(全靠三个调用方各自
    // 把关自己那条边),两端并发回报同一张单时两次 recordDeposit 都会过。
    const r = commit((cur) => {
      const intent = cur.intents.find((i) => i.intentId === intentId);
      if (!intent) return null;
      // 🔴 白名单不是黑名单(2026-08-04 对抗审计 P0-3)。原来只挡 `credited`,于是
      // 磁盘上已 cancelled(用户刚撤单)/ return_pending(正在退回)/ expired 的单,
      // 都能从这个口被入账 —— 撤单与退回的意图被静默抹掉,与退回并发时还是双付。
      // 三个调用方各自的门跑在**内存** `intents.value` 上,另一个标签页刚改的状态它们看不见;
      // 这里是最后一道、也是唯一一道跑在**磁盘最新**上的门,必须穷举「谁可以入账」而不是
      // 「谁不可以」—— 与链上轨 settleCredited 和 cancelBankIntent 同构(那两处本来就是白名单)。
      if (intent.status !== "awaiting_payment" && intent.status !== "mismatch_review" && intent.status !== "expired") {
        return null;
      }
      // DepositRecord 与意向单同号互相关联([FEAT-PAY02] ③);银行轨无链上字段。
      const rec: DepositRecord = {
        depositId: intent.intentId,
        channel: "bank-vietqr",
        grossAmountUsdt: credited,
        feeUsdt: 0,
        creditedUsdt: credited,
        status: "credited",
        // 🔴 createdAt 是**下单时刻**不是入账时刻(2026-08-04 对抗审计 P2-4):
        // 原来两者都写 now,后台对账里银行轨的「创建 → 到账」耗时恒为 0,
        // 那正是这条轨最该被看见的指标(用户等了多久银行才到账)。
        createdAt: intent.createdAt,
        creditedAt: now,
      };
      const appended = !cur.records.some((x) => x.depositId === intent.intentId);
      return {
        next: {
          records: appended ? [rec, ...cur.records] : cur.records,
          intents: cur.intents.map((i) =>
            i.intentId === intentId ? { ...i, status: "credited" as const, receivedVnd, matchedAt: now } : i,
          ),
        },
        result: { intent, appended },
      };
    });
    if (!r.ok) return false;
    if (!useApp().recordDeposit(credited)) {
      // 钱没加成:单据回滚到入账前(否则单子写着已到账、余额没动,且终态门从此挡住重试)。
      const { intent, appended } = r.result;
      const undone = commit((cur) => ({
        next: {
          records: appended ? cur.records.filter((x) => x.depositId !== intentId) : cur.records,
          intents: cur.intents.map((i) => (i.intentId === intentId ? intent : i)),
        },
        result: true as const,
      }));
      // 🔴 同链上轨:回滚失败不许静默 —— 意向单停在 credited、终态门从此挡住一切重试,
      // 而余额没加。走响亮终态交给用户与后台,不假装什么都没发生。
      if (!undone.ok) reportStuckFunds(useApp().captureMoney(), intentId);
      return false;
    }
    // 与链上轨同口径:记账走收口点的幂等变体(ref=intentId 判重),不裸调账单写入。
    // 入金已落定(recordDeposit 不回滚),收据没写上 = 「钱动了账没记」:同 R6 结算页处置 —— 登记待对账 + 交易号(收口点已弹提示)。
    if (!postReceiptOnce({
      type: "topup",
      symbol: "USDT",
      amount: credited,
      status: "posted",
      memo: `Top-up · ${CHANNEL_MEMO["bank-vietqr"]}`,
      ref: intentId,
    })) reportStuckFunds(useApp().captureMoney(), String(intentId), "receipt");
    return true;
  }

  /** ⚠️ DEV/DEMO-ONLY:模拟「银行回单到达」(tester 驱动通道)。省参 = 命中最新在途单、
   *  金额精确 → credited;差额超容差 ±1,000₫ → mismatch_review;对 expired 单调用 =
   *  迟到转账(只登记回单进人工核对,不自动入账,[FEAT-PAY02] ② 异常1)。
   *  同单重复回报 no-op;credited/cancelled/return_pending 终态拒(server 409 形态)。
   *  PROD 无此入口:真实链路 = PSP 回单回调,server 匹配推进。 */
  function _devBankCallback(intentId?: string, receivedVnd?: number): DepositIntent | null {
    if (import.meta.env.PROD) return null;
    const target = intentId
      ? intents.value.find((i) => i.intentId === intentId)
      : intents.value.find((i) => i.status === "awaiting_payment");
    if (!target) return null;
    if (target.status === "credited" || target.status === "cancelled" || target.status === "return_pending") return null;
    // console 驱动,入参不可信:非法金额回落为精确金额
    const received =
      typeof receivedVnd === "number" && Number.isFinite(receivedVnd) && receivedVnd > 0
        ? Math.round(receivedVnd)
        : target.vndAmount;
    if (target.status === "expired") {
      // ponytail: 过期后宽限期(10min)内按锁定价自动入账属真后台回单时间戳匹配,mock 统一走人工核对展示。
      return patchIntent(target.intentId, { receivedVnd: received, matchedAt: mockServerNow() });
    }
    if (target.status === "mismatch_review") return null; // 已在人工核对,重复回单 no-op
    clearIntentTimer(target.intentId);
    if (Math.abs(received - target.vndAmount) > BANK_VND_TOLERANCE) {
      return patchIntent(target.intentId, {
        status: "mismatch_review",
        receivedVnd: received,
        matchedAt: mockServerNow(),
      });
    }
    // 容差内按锁定牌价足额入账(规格阳光路径)
    if (!settleBankIntent(target.intentId, target.usdtAmount, received)) return null;
    return intents.value.find((i) => i.intentId === target.intentId) ?? null;
  }

  /** ⚠️ DEV/DEMO-ONLY:直接催熟超时(tester 驱动;省参 = 最新在途单)。 */
  function _devBankExpire(intentId?: string): boolean {
    if (import.meta.env.PROD) return false;
    const target = intentId
      ? intents.value.find((i) => i.intentId === intentId)
      : intents.value.find((i) => i.status === "awaiting_payment");
    if (!target || target.status !== "awaiting_payment") return false;
    clearIntentTimer(target.intentId);
    return patchIntent(target.intentId, { status: "expired" }) !== null;
  }

  /** ⚠️ DEV/DEMO-ONLY(后台动作形态):mismatch_review 人工处置——按实收核销入账或
   *  登记退回。仅 mismatch_review 可处置,其余拒绝(server 409 形态)。PROD:后台 D1
   *  高敏动作(确认 + 理由 + 审计 + 失败态),endpoint 形态
   *  POST /api/admin/deposits/bank-intents/:id/resolve { action: "credit"|"return", reason };client 无入口。 */
  function _devResolveBankMismatch(intentId: string, resolution: "credit" | "return"): boolean {
    if (import.meta.env.PROD) return false;
    const intent = intents.value.find((i) => i.intentId === intentId);
    if (!intent || intent.status !== "mismatch_review") return false;
    if (resolution === "return") return patchIntent(intentId, { status: "return_pending" }) !== null;
    // 按实收核销:实收 VND 按本单锁定牌价折 USDT(0 费;fxRate > 0 由下单校验保证)
    const receivedVnd = intent.receivedVnd ?? intent.vndAmount;
    return settleBankIntent(intentId, receivedVnd / intent.fxRate, receivedVnd);
  }

  /** ⚠️ DEV/DEMO-ONLY(后台动作形态):过期单迟到转账人工匹配补入账(孤儿队列,
   *  [FEAT-PAY02] ④ expired → credited 边)。仅「expired 且已登记回单(bankCallback
   *  对过期单调用过)」可走,按实收 × 锁定牌价折 USDT 入账;其余拒绝(server 409 形态)。
   *  PROD:后台 D1 孤儿队列高敏动作(确认 + 理由 + 审计 + 失败态);client 无入口。 */
  function _devResolveLateBankTransfer(intentId: string): boolean {
    if (import.meta.env.PROD) return false;
    const intent = intents.value.find((i) => i.intentId === intentId);
    if (!intent || intent.status !== "expired" || !intent.receivedVnd) return false;
    return settleBankIntent(intentId, intent.receivedVnd / intent.fxRate, intent.receivedVnd);
  }

  // ════════ 卡通道(国际卡辅助轨;同步授权,无确认数推进)════════

  /** 卡支付。本函数扮演「client 提交 → 收单方 3DS 授权 → server 入账」三步:
   *  PROD = POST /api/deposits/card 提交,收单方授权后 server webhook 落库入账,
   *  client 轮询 GET /api/deposits 收敛;本层的授权模拟整体删除。
   *  返回 null = 未入账(账号已切走 / 入参越界 / 拒付 / 落盘失败),调用方展示拒付态并允许重试。
   *  🔴 副作用顺序:先落单 + persist,过了才动钱 —— 「失败」必须等于「什么都没发生」。
   *     反过来(先动钱、落盘失败再回滚单据)会让 UI 那颗重试按钮把「已扣款」变成可重复刷余额:
   *     余额加了 N 次、账单 N 条、入金单 0 条,正是本次改动要消灭的对账黑洞。
   *  🔴 幂等域:mock 只保证「一次提交内」(授权号由本次提交现铸,跨提交无从判重);
   *     跨提交幂等归 PROD 的 Idempotency-Key(收单方 + server 侧),mock 不承诺。
   *  🔴 计费方向:卡费另收在用户卡上 → gross = 实扣额、credited = 用户输入额。 */
  function submitCardPayment(creditedUsdt: number, expectedAccountKey: string): DepositRecord | null {
    // 🔴 三条入金轨里唯一**不经定时器、当场加钱**的一条:下面那行 `Math.random() < CARD_DECLINE_RATE`
    // 就是本地扮演的收单方授权。远端模式下这等于自己给自己批一笔卡支付并即刻加余额
    // (实测:remote 模式下调一次 → usdtBalance +$50)。返 null = 既有的拒付态,页面已有处理。
    if (fundsServerEnabled) return null;
    // 账号守卫:授权等待期(组件侧 ~3.8s)内账号可能被切走(会话被踢/登出会 rebind 到
    // default),此时入账必须作废,否则钱记进别人账上、还白送对方入金资格进度。
    // 与两条 mock 引擎的 `const key = boundKey; … if (boundKey !== key) return;` 同形 ——
    // 差别只在这段延迟活在组件里,store 够不着,故由调用方捕获并回传。
    if (expectedAccountKey !== boundKey()) return null;
    const credited = +creditedUsdt.toFixed(2);
    // 信任边界:金额来自输入框,NaN/±Infinity/越界一律拒(server 422 形态)
    if (!Number.isFinite(credited)) return null;
    if (credited < MIN_CARD_DEPOSIT_USDT || credited > MAX_CARD_DEPOSIT_USDT) return null;
    // ⚠️ MOCK-ONLY:扮演收单方 3DS 授权。PROD:收单方回调带真实授权结果。
    if (Math.random() < CARD_DECLINE_RATE) return null;
    let authCode = mockCardAuthCode();
    // 同 mintDepositId:重摇设上界,避免号段占满/随机源异常时死循环转死页面。
    for (let i = 0; i < 50 && isDuplicateAuthCode(records.value, authCode); i++) {
      authCode = mockCardAuthCode();
    }
    if (isDuplicateAuthCode(records.value, authCode)) return null; // 摇不出新号:拒绝入账,不冒重复风险
    const now = mockServerNow();
    // ① 先落单 + CAS 落盘:此刻零跨 store 副作用,失败即干净返回,用户重试安全。
    //    授权号判重与单号铸造都移到磁盘最新账本上 —— 别的标签页刚落的单这边也看得见。
    const r = commit((cur) => {
      if (isDuplicateAuthCode(cur.records, authCode)) return null;
      const rec: DepositRecord = {
        depositId: mintDepositId(now, cur),
        channel: "card-intl",
        grossAmountUsdt: cardChargeUsd(credited),
        feeUsdt: cardFeeUsd(credited),
        creditedUsdt: credited,
        authCode,
        status: "credited",
        createdAt: now,
        creditedAt: now,
      };
      return { next: { records: [rec, ...cur.records], intents: cur.intents }, result: rec };
    });
    if (!r.ok) return null;
    const rec = r.result;
    // ② 落盘过了才动钱。credited 已过 [MIN, MAX] 双门,recordDeposit 只拒 NaN/≤0/>1e9,
    //    此处恒真;万一失败则回滚单据,宁可「无单无钱」也不留「有单无钱」。
    if (!useApp().recordDeposit(credited)) {
      const undone = commit((cur) => ({
        next: { records: cur.records.filter((x) => x.depositId !== rec.depositId), intents: cur.intents },
        result: true as const,
      }));
      // 🔴 同前两轨:删单失败时盘上留着一张「有单无钱」的 credited 记录 —— 静默吞掉
      // 就是让它永远挂在那儿。走响亮终态,把交易号交出去。
      if (!undone.ok) reportStuckFunds(useApp().captureMoney(), rec.depositId);
      return null;
    }
    // 入金已落定(recordDeposit 不回滚),收据没写上 = 「钱动了账没记」:同 R6 结算页处置 —— 登记待对账 + 交易号(收口点已弹提示)。
    if (!postReceiptOnce({
      type: "topup",
      symbol: "USDT",
      amount: credited,
      status: "posted",
      memo: `Top-up · ${CHANNEL_MEMO["card-intl"]}`,
      ref: authCode,
    })) reportStuckFunds(useApp().captureMoney(), String(authCode), "receipt");
    return rec;
  }

  function remoteIntentStatus(status: VietQrIntentStatus): DepositIntent["status"] {
    if (status === "credited") return "credited";
    if (status === "expired") return "expired";
    if (status === "cancelled" || status === "returned") return "cancelled";
    if (status === "return_pending") return "return_pending";
    if (status === "receipt_review" || status === "mismatch_review" || status === "late_review") {
      return "mismatch_review";
    }
    return "awaiting_payment";
  }

  function remoteVietQrIntent(snapshot: VietQrIntentSnapshot): DepositIntent {
    const createdAt = snapshot.createdAt ? Date.parse(snapshot.createdAt) : Date.parse(snapshot.expiresAt);
    return {
      intentId: snapshot.intentNo,
      usdtAmount: snapshot.usdtAmount,
      fxRate: snapshot.fxRate,
      vndAmount: snapshot.vndAmount,
      ...(snapshot.memoCode ? { memoCode: snapshot.memoCode } : {}),
      ...(snapshot.bankAccount ? { bankAccount: snapshot.bankAccount } : {}),
      ...(snapshot.qrPayload ? { qrPayload: snapshot.qrPayload } : {}),
      status: remoteIntentStatus(snapshot.status),
      createdAt,
      expireAt: Date.parse(snapshot.expiresAt),
      ...(snapshot.receivedVnd === undefined ? {} : { receivedVnd: snapshot.receivedVnd }),
      ...(snapshot.matchedAt ? { matchedAt: Date.parse(snapshot.matchedAt) } : {}),
      ...(snapshot.paymentMode ? { paymentMode: snapshot.paymentMode } : {}),
      ...(snapshot.paymentUrl ? { paymentUrl: snapshot.paymentUrl } : {}),
      ...(snapshot.providerStatus ? { providerStatus: snapshot.providerStatus } : {}),
    };
  }

  function remoteVietQrRecord(snapshot: VietQrIntentSnapshot): DepositRecord | null {
    if (snapshot.status !== "credited") return null;
    const createdAt = snapshot.createdAt ? Date.parse(snapshot.createdAt) : Date.parse(snapshot.expiresAt);
    return {
      depositId: snapshot.intentNo,
      channel: "bank-vietqr",
      grossAmountUsdt: snapshot.usdtAmount,
      feeUsdt: snapshot.feeUsdt,
      creditedUsdt: snapshot.creditedUsdt,
      status: "credited",
      createdAt,
      creditedAt: snapshot.matchedAt ? Date.parse(snapshot.matchedAt) : createdAt,
    };
  }

  async function refreshRemoteVietQrDeposits(): Promise<void> {
    if (!remoteApiEnabled) return;
    if (remoteRefreshInFlight) {
      // Account rebinds and a visible retry may arrive while an older account
      // read is still unwinding. Run one fresh pass afterward; its page epoch
      // prevents the old response from committing into the new view.
      remoteRefreshQueued = true;
      return;
    }
    remoteRefreshInFlight = true;
    const expectedAccountKey = serverAccountKey;
    const expectedGeneration = remoteGeneration;
    const receiptRead = beginVietQrReceiptPageRead(remoteReceiptPage, "initial");
    if (!receiptRead) {
      remoteRefreshInFlight = false;
      return;
    }
    syncRemoteReceiptPage();
    serverStatus.value = "loading";
    serverError.value = "";
    try {
      const snapshots = await paymentApi.listVietQrIntents(50);
      if (!remoteGenerationMatches(expectedAccountKey, expectedGeneration, serverAccountKey, remoteGeneration)) {
        return;
      }
      intents.value = snapshots.map(remoteVietQrIntent);
      records.value = snapshots.map(remoteVietQrRecord).filter((item): item is DepositRecord => item !== null);
      const receiptPage = await paymentApi.listVietQrReceipts(50, 0);
      if (!remoteGenerationMatches(expectedAccountKey, expectedGeneration, serverAccountKey, remoteGeneration)) {
        return;
      }
      if (!succeedVietQrReceiptPageRead(remoteReceiptPage, receiptRead, receiptPage.items, receiptPage.nextOffset)) return;
      syncRemoteReceiptPage();
      snapshots.forEach((snapshot) => {
        if (snapshot.status !== "awaiting_payment" && snapshot.status !== "receipt_review") {
          finishVietQrCommandByIntent(expectedAccountKey, snapshot.intentNo);
        }
      });
      serverStatus.value = "ready";
    } catch (cause) {
      const receiptReadIsCurrent = failVietQrReceiptPageRead(remoteReceiptPage, receiptRead, cause);
      syncRemoteReceiptPage();
      if (receiptReadIsCurrent && remoteGenerationMatches(expectedAccountKey, expectedGeneration, serverAccountKey, remoteGeneration)) {
        serverStatus.value = "error";
        serverError.value = cause instanceof Error ? cause.message : "VIETQR_DEPOSIT_REFRESH_FAILED";
      }
      // 权威不可达是常态输入,**不 reject**。
      //   原来这里 `throw cause`,靠每个调用点各写一个 .catch 撑着 —— 而那正是
      //   docs/changes/2026-08-13-remote-refresh-resilience.md 明确否决的做法:
      //   每新增一个裸 void 调用点就漏一个,漏了就是生产环境的 unhandled rejection。
      //   需要失败信号的消费方改读 serverStatus / serverError(deposit-bank-pane.vue 已改)。
    } finally {
      remoteRefreshInFlight = false;
      if (remoteRefreshQueued) {
        remoteRefreshQueued = false;
        void refreshRemoteVietQrDeposits();
      }
    }
  }

  async function loadMoreRemoteVietQrReceipts(): Promise<void> {
    if (!remoteApiEnabled || remoteRefreshInFlight) return;
    const receiptRead = beginVietQrReceiptPageRead(remoteReceiptPage, "more");
    if (!receiptRead) return;
    syncRemoteReceiptPage();
    remoteRefreshInFlight = true;
    const expectedAccountKey = serverAccountKey;
    const expectedGeneration = remoteGeneration;
    serverStatus.value = "loading";
    serverError.value = "";
    try {
      const page = await paymentApi.listVietQrReceipts(50, receiptRead.offset);
      if (!remoteGenerationMatches(expectedAccountKey, expectedGeneration, serverAccountKey, remoteGeneration)) {
        return;
      }
      if (!succeedVietQrReceiptPageRead(remoteReceiptPage, receiptRead, page.items, page.nextOffset)) return;
      syncRemoteReceiptPage();
      serverStatus.value = "ready";
    } catch (cause) {
      const receiptReadIsCurrent = failVietQrReceiptPageRead(remoteReceiptPage, receiptRead, cause);
      syncRemoteReceiptPage();
      if (receiptReadIsCurrent && remoteGenerationMatches(expectedAccountKey, expectedGeneration, serverAccountKey, remoteGeneration)) {
        serverStatus.value = "error";
        serverError.value = cause instanceof Error ? cause.message : "VIETQR_RECEIPT_REFRESH_FAILED";
      }
    } finally {
      remoteRefreshInFlight = false;
      if (remoteRefreshQueued) {
        remoteRefreshQueued = false;
        void refreshRemoteVietQrDeposits();
      }
    }
  }

  function startRemoteVietQrPolling(): void {
    if (!remoteApiEnabled) return;
    remotePollingActive = true;
    if (remotePollTimer) return;
    const generation = remoteGeneration;
    const accountKey = serverAccountKey;
    remotePollTimer = setInterval(() => {
      if (!remoteGenerationMatches(accountKey, generation, serverAccountKey, remoteGeneration)) return;
      void refreshRemoteVietQrDeposits();
    }, 3000);
  }

  function stopRemoteVietQrPolling(): void {
    remotePollingActive = false;
    if (remotePollTimer) clearInterval(remotePollTimer);
    remotePollTimer = undefined;
  }

  async function createRemoteBankIntent(amount: number, rawExpectedAccountKey: string): Promise<DepositIntent | null> {
    if (!remoteApiEnabled) return null;
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const expectedAccountKey = serverAccountKey;
    const expectedGeneration = remoteGeneration;
    if (normalizeAccountKey(rawExpectedAccountKey) !== expectedAccountKey) throw new Error("VIETQR_ACCOUNT_CHANGED");
    const mutation: VietQrCommandIdentity = {
      accountKey: expectedAccountKey,
      action: "CREATE",
      fingerprint: amount.toFixed(6),
    };
    for (let createAttempt = 0; createAttempt < 2; createAttempt += 1) {
      if (!remoteGenerationMatches(expectedAccountKey, expectedGeneration, serverAccountKey, remoteGeneration)) {
        throw new Error("VIETQR_ACCOUNT_CHANGED");
      }
      const idempotencyKey = vietQrCommandKey(mutation);
      let snapshot: VietQrIntentSnapshot;
      try {
        snapshot = await paymentApi.createVietQrIntent(amount, idempotencyKey);
        if (!remoteGenerationMatches(expectedAccountKey, expectedGeneration, serverAccountKey, remoteGeneration)) {
          throw new Error("VIETQR_ACCOUNT_CHANGED");
        }
      } catch (cause) {
        if (!isAmbiguousOutcome(cause)) finishVietQrCommand(mutation, idempotencyKey);
        throw cause;
      }
      bindVietQrIntent(mutation, idempotencyKey, snapshot.intentNo);
      if (!isPayableVietQrCreateStatus(snapshot.status)) {
        // A prior unknown response may have left this command unbound locally even though
        // the server already completed, cancelled or returned its intent. Resolve that
        // generation, then mint exactly one fresh command for the user's current click.
        finishVietQrCommand(mutation, idempotencyKey);
        if (createAttempt === 0) continue;
        throw new Error("VIETQR_CREATE_REPLAY_NOT_PAYABLE");
      }
      const intent = remoteVietQrIntent(snapshot);
      intents.value = [intent, ...intents.value.filter((item) => item.intentId !== intent.intentId)];
      return intent;
    }
    throw new Error("VIETQR_CREATE_RETRY_EXHAUSTED");
  }

  async function cancelRemoteBankIntent(intentId: string): Promise<{ ok: boolean; conflict?: boolean }> {
    if (!remoteApiEnabled) return { ok: false };
    const current = intents.value.find((item) => item.intentId === intentId);
    if (!current || current.status !== "awaiting_payment") return { ok: false, conflict: true };
    const expectedAccountKey = serverAccountKey;
    const mutation: VietQrCommandIdentity = {
      accountKey: expectedAccountKey,
      action: "CANCEL",
      fingerprint: intentId,
    };
    const idempotencyKey = vietQrCommandKey(mutation);
    try {
      const authoritative = await paymentApi.getVietQrIntent(intentId);
      if (expectedAccountKey !== serverAccountKey) throw new Error("VIETQR_ACCOUNT_CHANGED");
      if (authoritative.status !== "awaiting_payment") {
        const next = remoteVietQrIntent(authoritative);
        intents.value = intents.value.map((item) => item.intentId === intentId ? next : item);
        finishVietQrCommand(mutation, idempotencyKey);
        return { ok: false, conflict: true };
      }
      const snapshot = await paymentApi.cancelVietQrIntent(intentId, authoritative.version, idempotencyKey);
      if (expectedAccountKey !== serverAccountKey) throw new Error("VIETQR_ACCOUNT_CHANGED");
      const next = remoteVietQrIntent(snapshot);
      intents.value = intents.value.map((item) => item.intentId === intentId ? next : item);
      finishVietQrCommand(mutation, idempotencyKey);
      return { ok: snapshot.status === "cancelled" };
    } catch (cause) {
      // Unknown outcomes keep the durable command key. A later list/readback
      // reconciles the authoritative state instead of minting another command.
      if (!isAmbiguousOutcome(cause)) finishVietQrCommand(mutation, idempotencyKey);
      throw cause;
    }
  }

  // 启动即装载 "default" 行 + 收敛一次(在途单:过期落 expired / 未过期重新武装定时器)。
  bindAccount("default");

  // tester 驱动通道:DEV 挂 globalThis.__nxDev(PROD 不挂 —— guard 双层之外层)。
  // store 在 rebindAccountScopedStores(App 启动恢复/login/register)首次实例化时挂上。
  if (!import.meta.env.PROD) {
    const g = globalThis as unknown as { __nxDev?: Record<string, unknown> };
    g.__nxDev = {
      ...(g.__nxDev ?? {}),
      simulateIncomingTransfer: _devSimulateIncomingTransfer,
      depositStatus: (depositId: string) => records.value.find((row) => row.depositId === depositId)?.status ?? null,
      resolveDustHold: _devResolveDustHold,
      setChannelEnabled: _devSetChannelEnabled,
      bankCallback: _devBankCallback,
      bankExpire: _devBankExpire,
      resolveBankMismatch: _devResolveBankMismatch,
      resolveLateBankTransfer: _devResolveLateBankTransfer,
      setBankAccountEnabled: _devSetBankAccountEnabled,
    };
  }

  return {
    records,
    intents,
    serverStatus,
    serverError,
    remoteReceipts,
    remoteReceiptNextOffset,
    remoteReceiptInitialStatus,
    remoteReceiptInitialError,
    remoteReceiptMoreStatus,
    remoteReceiptMoreError,
    chainChannelEnabled,
    bankAccounts,
    bankRailAvailable,
    bindAccount,
    pauseMockEngine,
    resumeMockEngine,
    depositAddress,
    currentAccountKey,
    createBankIntent,
    cancelBankIntent,
    submitCardPayment,
    refreshRemoteVietQrDeposits,
    loadMoreRemoteVietQrReceipts,
    invalidateRemoteVietQrReceiptReads,
    startRemoteVietQrPolling,
    stopRemoteVietQrPolling,
    createRemoteBankIntent,
    cancelRemoteBankIntent,
    _devSimulateIncomingTransfer,
    _devResolveDustHold,
    _devSetChannelEnabled,
    _devBankCallback,
    _devBankExpire,
    _devResolveBankMismatch,
    _devResolveLateBankTransfer,
    _devSetBankAccountEnabled,
  };
});
