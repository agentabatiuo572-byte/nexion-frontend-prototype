/**
 * 待支付会话 store —— 结算扫码步开出的「发票」(金额 / 地址 / 截止)按账号持久,
 * 用户离开再回来仍是同一笔;到点作废。浮动条(pending-checkout-bar)与结算页共同消费。
 *
 * 🔴 不变量(store 自守,不靠调用点):**同账号同一时刻至多一张在窗内的发票**,且**一张发票至多被结算一次**。
 * 花钱前必须先 `consume(id)`:CAS 在磁盘最新行上要求这张票仍在册且在窗内,删成功才返 true ——
 * 谁抢到谁结算;别的页面实例 / 标签页 / 已取消的票拿到 false,一律拒单回报价步(审计 R2 P0 族:
 * 支付时刻只验「过期」不验「还在不在」,同一张票被两处各结算一次、取消后仍能扣)。
 * `begin()` / `consume()` 经 CAS 提交器在磁盘最新行上复核(storage 读不出时退回内存态,见 account-scoped-storage
 * 的诚实边界):除调用方明示要替换的那张(`replaceId`,撞单确认框已问过用户)
 * 外若还有别的活票 → 拒开(返 null,并把最新行同步进内存让浮动条露出那张票)。
 * 曾经的形状:调用点判「不是本页手里那张才问」+ store 纯追加 → 支付时刻守卫回弹后再点 Pay now
 * 直接铸出第二张活票、两个地址同时催付、落单后旧票成孤儿继续拉人二次付款(独立审计 P0 族)。
 *
 * 落盘走 account-scoped-storage 的 CAS 提交器(同 deposits):基准取磁盘最新行 —— H5 多标签页
 * 共享 localStorage、各自内存副本永久不同步,纯覆盖写会让 B 页复活/抹掉 A 页的发票。
 *
 * 真后台:一行 = 一张 PENDING_PAYMENT 服务端订单 + 支付指令(orderNo / amountUsdt / address /
 * paymentDeadline);hydrate → GET /api/orders(status=PENDING_PAYMENT),begin → 现有
 * POST /api/orders 路径,完成腿 = 服务端支付回读(sandbox `POST /api/orders/{orderNo}/pay`,
 * 生产 = 支付服务商回调后的 canonicalStatus)。远端模式(fundsServerEnabled)本 store
 * **不建行也不读行**:服务端契约尚无付款截止字段,客户端不得自造 30 分钟并宣称过期;也不许铸
 * 一个没人持有私钥的假地址(与 deposits.depositAddress 同一条闸)。
 */
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { fundsServerEnabled } from "@/api/runtime";
import { createAccountRowCommit } from "./account-scoped-storage";
import { deriveDepositAddress } from "./deposits-core";
import { mockServerNow, ONE_MINUTE_MS } from "./server-time";
import {
  firstLiveSession,
  isSessionLive,
  normalizeSessions,
  PENDING_CHECKOUT_WINDOW_MIN,
  pruneExpiredSessions,
  sessionSecondsLeft,
  type PendingCheckoutMethod,
  type PendingCheckoutQuote,
  type PendingCheckoutSession,
} from "./pending-checkout-core";

const ACCOUNTS_KEY = "nexgrid-pending-checkout-accounts-v1"; // { [accountKey]: { sessions: PendingCheckoutSession[], rev } }
const CHAIN_METHODS: readonly PendingCheckoutMethod[] = ["usdt-trc20", "usdt-bep20", "usdt-erc20"];

type PendingRow = { sessions: PendingCheckoutSession[] };

function mintSessionId(): string {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `pc-${suffix}`;
}

export interface BeginPendingCheckoutInput {
  productId: string;
  method: PendingCheckoutMethod;
  amountUsdt: number;
  quote: PendingCheckoutQuote;
  /** 撞单确认框里用户明示放弃的那张旧票 —— 与开新票同一次提交(先销后开不再有半执行窗口)。 */
  replaceId?: string | null;
}

export const usePendingCheckout = defineStore("pendingCheckout", () => {
  const sessions = ref<PendingCheckoutSession[]>([]);
  /** 结算页正在展示的会话 id(内存态)—— 浮动条对它不重复显示。 */
  const viewingId = ref<string | null>(null);
  /** 浮动条倒计时读它(1s 心跳,只在有会话时跑;前后台切换即时重同步)。 */
  const clock = ref(mockServerNow());

  const rows = createAccountRowCommit<PendingRow>({
    tableKey: ACCOUNTS_KEY,
    parse: (raw) => ({ sessions: normalizeSessions((raw as { sessions?: unknown } | null)?.sessions, mockServerNow()) }),
    snapshot: () => ({ sessions: sessions.value }),
    sync: (row) => { sessions.value = row.sessions; },
  });

  function commitSessions<R>(apply: (cur: PendingCheckoutSession[]) => { next: PendingCheckoutSession[]; result: R } | null): R | null {
    if (fundsServerEnabled) return null;
    const outcome = rows.commit<R>((cur) => {
      const applied = apply(cur.sessions);
      return applied ? { next: { sessions: applied.next }, result: applied.result } : null;
    });
    return outcome.ok ? outcome.result : null;
  }

  // 1s 心跳:推进 clock;到点的票剪掉(经 CAS 提交,顺带把别的标签页的最新行刷进内存)。
  let ticker: ReturnType<typeof setInterval> | undefined;
  function tick() {
    clock.value = mockServerNow();
    if (sessions.value.some((s) => !isSessionLive(s, clock.value))) {
      const now = clock.value;
      // persist-verdict-ok: 读入面自愈 / 到点剪除是尽力而为的整理:没落盘 = 磁盘行原样、内存已回灌;下一 tick / 下一次回灌重试,不影响 begin/consume 的 CAS 判决
      commitSessions((cur) => {
        const live = pruneExpiredSessions(cur, now);
        return live.length === cur.length ? null : { next: live, result: true };
      });
    }
  }
  watch(() => sessions.value.length, (n) => {
    if (n > 0 && !ticker) ticker = setInterval(tick, 1000);
    else if (n === 0 && ticker) { clearInterval(ticker); ticker = undefined; }
  }, { immediate: true });
  /**
   * 回灌:把磁盘最新行同步进内存。别的标签页开票 / 结算 / 取消后,本页据此刷新。
   * 读入面同时守不变量(与 bindAccount 同一条):过期行剪掉、多张活票只留最早那张 —— 行已经正常时是
   * 只读同步(apply 返 null,不写盘);不正常才写一次把它治好,否则 begin() 会对着两张陈旧活票永久拒开。
   */
  function refreshFromDisk() {
    if (fundsServerEnabled) return;
    const now = mockServerNow();
    // persist-verdict-ok: 读入面自愈 / 到点剪除是尽力而为的整理:没落盘 = 磁盘行原样、内存已回灌;下一 tick / 下一次回灌重试,不影响 begin/consume 的 CAS 判决
    commitSessions((cur) => {
      const live = pruneExpiredSessions(cur, now);
      return live.length === cur.length && live.length <= 1 ? null : { next: live.slice(0, 1), result: true };
    });
  }
  // 后台标签页的定时器会被浏览器节流;回到前台先把时钟拨准 + 回灌磁盘,别让浮动条展示一张其实已死的票。
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { tick(); refreshFromDisk(); } });
  }
  // H5 同源多标签页:别的标签页写了这张表,本页立刻回灌(App webview 单上下文,事件不触发也无妨)。
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("storage", (e) => { if (e.key === ACCOUNTS_KEY) { clock.value = mockServerNow(); refreshFromDisk(); } });
  }

  /** 账号切换重绑:装载该账号的会话行(过期行读入即剪);正在展示的会话属于旧账号,一并放手。 */
  function bindAccount(rawAccountKey: string) {
    viewingId.value = null;
    clock.value = mockServerNow();
    if (fundsServerEnabled) { sessions.value = []; return; }
    const row = rows.bind(rawAccountKey);
    const live = pruneExpiredSessions(row?.sessions ?? [], clock.value);
    // 读入面也守不变量:磁盘上若有多张活票(老版本纯追加写下的行 / 手改 storage),只留最早那张 ——
    // 否则 begin() 永远拒开、浮动条只露一张、用户 30 分钟内下不了任何链上单。
    sessions.value = live.slice(0, 1);
    // persist-verdict-ok: 读入面自愈 / 到点剪除是尽力而为的整理:没落盘 = 磁盘行原样、内存已回灌;下一 tick / 下一次回灌重试,不影响 begin/consume 的 CAS 判决
    if (live.length > 1) commitSessions((cur) => ({ next: pruneExpiredSessions(cur, clock.value).slice(0, 1), result: true }));
  }

  const current = computed(() => firstLiveSession(sessions.value, clock.value));
  /** 浮动条要展示的那一笔:有在途会话,且结算页此刻没有在展示它(不重复提醒)。 */
  const barSession = computed(() => (current.value && current.value.id !== viewingId.value ? current.value : null));

  function get(id: string): PendingCheckoutSession | null {
    return sessions.value.find((s) => s.id === id) ?? null;
  }

  function isLive(session: PendingCheckoutSession | null | undefined): boolean {
    return !!session && isSessionLive(session, mockServerNow());
  }

  function secondsLeft(session: PendingCheckoutSession): number {
    return sessionSecondsLeft(session, clock.value);
  }

  /**
   * 开票:进入扫码步那一刻冻结金额 / 地址 / 截止。
   * 返 null 的三种情况:远端模式(见文件头)/ 入参非法 / 磁盘最新行里还有别的活票
   * (多标签页各开一张、或调用方没先问用户)—— 此时内存已同步成磁盘最新态,浮动条会露出那张票。
   */
  function begin(input: BeginPendingCheckoutInput): PendingCheckoutSession | null {
    if (fundsServerEnabled) return null;
    if (!CHAIN_METHODS.includes(input.method)) return null;
    if (!Number.isFinite(input.amountUsdt) || input.amountUsdt < 0) return null;
    if (!input.quote || !Number.isFinite(input.quote.total) || input.quote.total < 0) return null;
    const now = mockServerNow();
    const id = mintSessionId();
    const session: PendingCheckoutSession = {
      id,
      kind: "purchase",
      orderNo: null,
      productId: input.productId,
      method: input.method,
      amountUsdt: input.amountUsdt,
      // 每单专属地址:以会话 id 为种子派生(与充值地址同一形态函数,不同种子)。
      address: deriveDepositAddress(id, input.method),
      createdAt: now,
      expiresAt: now + PENDING_CHECKOUT_WINDOW_MIN * ONE_MINUTE_MS,
      quote: input.quote,
      leftNoticeShown: false,
    };
    return commitSessions((cur) => {
      const live = pruneExpiredSessions(cur, now).filter((s) => s.id !== input.replaceId);
      if (live.length > 0) return null; // 不变量:至多一张活票 —— 别的活票在,拒开
      return { next: [session], result: session };
    });
  }

  /**
   * 结算前的原子消费:磁盘最新行里这张票仍在册且在窗内 → 删掉并返 true(本调用方抢到了结算权);
   * 已被别处结算 / 取消 / 过期 → false,调用方必须拒单。花钱动作只许排在它之后。
   */
  function consume(id: string): "consumed" | "absent" | "failed" {
    if (fundsServerEnabled) return "failed";
    if (viewingId.value === id) viewingId.value = null;
    const now = mockServerNow();
    // 三态而不是布尔(审计 R9 P1):「票不在册 / 过期 = 别处已结算或取消」与「在册但写不进去 = storage 故障,票还活着」
    // 对调用方是两件事 —— 后者不许告诉已转账用户「已在别处结算」,该让他重试。
    const r = rows.commit<true>((cur) => (cur.sessions.some((s) => s.id === id && isSessionLive(s, now))
      ? { next: { sessions: cur.sessions.filter((s) => s.id !== id) }, result: true }
      : null));
    if (r.ok) return "consumed";
    // 提交器对「前置不成立」会把磁盘最新行同步进内存(票已不在);对「写失败」内存不动(票仍在)—— 用内存里
    // 这张票还在不在把两种失败分开。
    return sessions.value.some((s) => s.id === id && isSessionLive(s, now)) ? "failed" : "absent";
  }

  /**
   * 用户放弃 / 支付时刻守卫回弹作废 —— 这张发票不再有任何可恢复动作(结算走 consume,不走这里)。
   * 返回「磁盘上还有没有这张票」:true = 已删或本就不在;false = 在册但删不掉(storage 写失败)——
   * 调用方不许把它当已取消(审计 R8 P1:此前返回 void,取消可静默失败,票还活着还催付)。
   */
  function remove(id: string): boolean {
    if (viewingId.value === id) viewingId.value = null;
    // 不按内存早退:内存可能陈旧,磁盘上那张才是要删的(删不到也顺带把最新行回灌进来)。
    const r = commitSessions((cur) => (cur.some((s) => s.id === id)
      ? { next: cur.filter((s) => s.id !== id), result: true }
      : null));
    return r === true || !sessions.value.some((s) => s.id === id);
  }

  /**
   * 一次成交的购买意图已兑现 → 同账号该商品的在窗发票作废(不论这一单是链上、卡还是 $0 直付)。
   * 否则卡支付付完款,链上开的那张旧票仍在磁盘上、浮动条继续催第二笔(审计 R8 P0)。链上腿的票已在
   * 结算前 consume,这里是 no-op;返回同 remove 语义。
   */
  function settleProduct(productId: string): boolean {
    const now = mockServerNow();
    const r = commitSessions((cur) => {
      const next = cur.filter((s) => !(s.productId === productId && isSessionLive(s, now)));
      return next.length === cur.length ? null : { next, result: true };
    });
    if (viewingId.value && !sessions.value.some((s) => s.id === viewingId.value)) viewingId.value = null;
    return r === true || !sessions.value.some((s) => s.productId === productId && isSessionLive(s, now));
  }

  /** 首次离开时返回 true(调用方据此给一次性提示);之后恒 false。 */
  function markLeftNotice(id: string): boolean {
    return commitSessions((cur) => {
      const s = cur.find((x) => x.id === id);
      if (!s || s.leftNoticeShown) return null;
      return { next: cur.map((x) => (x.id === id ? { ...x, leftNoticeShown: true } : x)), result: true };
    }) === true;
  }

  function setViewing(id: string | null) {
    viewingId.value = id;
  }

  return { sessions, current, barSession, viewingId, clock, bindAccount, refreshFromDisk, get, isLive, secondsLeft, begin, consume, remove, settleProduct, markLeftNotice, setViewing };
});
