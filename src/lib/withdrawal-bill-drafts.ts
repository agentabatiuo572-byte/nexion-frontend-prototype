/**
 * 提现 → 账单分录 —— **唯一**的构造处(z4 R2)。
 *
 * 🔴 为什么必须收成一个纯函数:这组分录有**两个**生产点 ——
 *   ① 提现页建单成功后当场写(`wallet-withdraw.vue`);
 *   ② App.vue 的对账在「单据在、账单缺」时补写(自愈)。
 * 两处各拼一份的话必然漂移:金额口径、memoKey、状态映射、NEX 腿要不要写,
 * 任何一项在一处改了另一处没跟,账本上就会出现两种形状的同类分录。
 * 本仓刚因为「同一个概念两处各自推导」栽过(费用减免额),不再重演。
 *
 * 🔴 为什么要有自愈那一路(R2 completeness critic 的 P0):
 * 账单表是**裸写整行、无 CAS**(2026-08-05 主人拍板不在前端修),跨标签页并发写会把
 * 刚落盘的分录整行覆盖掉。冲正行(下方退还分录)的存在性判据取自账本自身,
 * 丢了下一拍就补回来;而提现主行一旦被抹掉就**永久消失**,
 * 用户回到的正是本包要修的那个原状态,而所有门仍然全绿(门守的是「有没有生产者」,
 * 不是「那一行此刻在不在」)。把判据同样改成「从数据推出该有什么」,这一族才补齐。
 *
 * ⚠️ 这里原本写着「资金分录里**只有这一族**没有自愈路径」——**那句话不成立,已删**
 * (2026-08-13 同形全扫实测:入金三轨与购买/组合同样没有自愈,收据写入失败即永久缺分录)。
 * 留着它的代价已经实测过:z6 扣款自愈包正是照着那句话把提现当孤例来修,整包做到全绿才被
 * 独立审计推翻。全站族的清单与治法见 docs/changes/2026-08-13-card-funds-failure-family.md。
 *
 * 不碰 store、不依赖 i18n 运行时:memo 是英文兜底,渲染时以 memoKey 为准。
 * ⚠️ 但它**不是引用透明的**:退还分录拿不到服务端时刻时会读一次共用时钟(见 `nexRefundAtMs`),
 * 同一张单在不同时刻构造可能得到不同的 `atMs`。判重按「单号+币种+方向」,落盘后不再重取。
 * PRODUCTION:整个文件消失 —— 分录由服务端在建单同一事务里写,client 只消费 GET /api/bills。
 */
import type { ReceiptDraft } from "@/lib/money-receipt";
import { mockServerNow } from "@/store/server-time";
import type { Withdrawal } from "@/store/types";

/** NEX 数量展示:整数不带小数点,非整数保留一位(与提现页报价同口径)。 */
function fmtNex(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** 风控路由 → 账单摘要码位。显式穷举,不做动态拼串:漏一种会静默拿到 undefined,
 *  而 memoKey 落空只会**静默回落**成写入时那句英文(tsc 与 i18n 镜像门都抓不到)。 */
const WITHDRAW_MEMO_BY_ROUTE: Record<NonNullable<Withdrawal["riskRoute"]>, string> = {
  pass: "withdrawPass",
  delay: "withdrawReview",
  manual: "withdrawReview",
  freeze: "withdrawFrozen",
  // `reject` **构造上到不了这里**:它是客户端准入引擎的裁决,被拒的请求根本不会发出去;
  // 而服务端回执经 `canonicalRiskRoute` 只会产出 pass/delay/manual/freeze 四种(见 withdrawal-api.ts)。
  // 仍然显式列出而不是用 `Partial` + 兜底 —— tsc 的穷举检查正是靠它;
  // 万一哪天服务端真回了这一路,渲染成「审核中」也比静默回落成英文原文强。
  reject: "withdrawReview",
};

/**
 * 冲正行的事件时刻 —— 🔴 **退款发生那一刻,不是提现提交那一刻**。
 *
 * 两者可以差几个月(7 月提交、8 月才判失败并退还),而账单页按分录的 `ts` 分月分组:
 * 盖成提交时刻,「退回 N NEX」就落进 7 月那一组、贴在当初「烧掉 N NEX」那行旁边 ——
 * 用户在 8 月的账单里找不到钱回来的记录,而钱包里的 NEX 确实是 8 月变的,两个口径对不上。
 * 同一族的另外两行(USDT 主行 / NEX 抵扣费行)**确实**发生在提交那一刻,所以修法是
 * 「这一条分录带自己的时刻」(`ReceiptDraft.atMs`),不是「整批换一个时刻」。
 *
 * 🔴 **回落规则(显式定,不许静默沿用提交时刻)**:拿不到 `nexRefundedAt` 时(存量单 /
 * 后端还没上该字段)盖**本次构造的此刻**。理由:
 *   · 真值一定落在 `[submittedAt, now]` 里,而客户端只知道这两个端点;
 *   · 取 now = 「客户端**得知**退款的时刻」——正常轮询下晚一拍,自愈/离线/存量单路径下可晚数月(如实说);取 submittedAt 可以早几个月,
 *     且会让冲正行与被它冲正的那行**同刻同组** —— 正是本函数要修掉的那个形态;
 *   · 冲正行只在第一次落盘时定 `ts`(此后按「单号+币种+方向」判重跳过),不会每拍漂移。
 *
 * 🔴 **双向越界都当它没给**(2026-08-12 独立审计:上一版只卡了下界,五份报告独立命中):
 *   · 早于提交 —— 退款不可能发生在下单之前;
 *   · **晚于此刻** —— 退款也不可能发生在未来。少了这一侧,后端错发 `"2099-01-01"` 会让这行按
 *     `ts` 倒序**永久钉在账单首位**、落进一个还没到的月份组,且落盘后判重跳过、永不自愈 ——
 *     比「早一个月」错得更远。同批的 `nexRefunded` 有 `<= nexBurned` 上界,它的时刻孪生兄弟
 *     原本一个上界都没有,同一批里两个字段一有一无。
 * (与 `refunded > nexBurned` 同一条纪律:已知是错的数不拿来写一条看着合理的分录。)
 *
 * 🔴 回落值**不做 `Math.max(now, submittedAt)` 钳位**(2026-08-12 修法证伪结论):那正是
 * 「把已知是错的数钳成看着合理的」——而钳完的结果恰好是**提交时刻**,即本函数存在的理由要修掉的形态。
 * 时钟被拨回时 `submittedAt`(同为本机时钟)一样不可信;真要治,该在 `mockServerNow` 一处做单调钟,
 * 不是在这一个调用点钳。**已知边界,不假装修了。**
 *
 * 🔴 **已知边界二(本次引入的,如实登记)**:回落走的是「构造此刻」,所以这一行**不是数据的纯函数** ——
 * 账单表裸写无 CAS,跨标签页覆盖后由 5s 自愈重建时会取到一个新的「此刻」,日期随之推移。
 * z8 之前这一行盖 `wd.submittedAt`,重写是幂等的。修法候选(观测值单独落一个字段、服务端值永远压过它)
 * 尚未过证伪,不在本轮落盘 —— 宁可留一个写明白的缺口,也不塞一个没被证伪过的新存储字段。
 * 咬人窗口:行丢失与自愈重建之间恰好跨月。
 *
 * 时钟不做成入参:那等于把「盖哪个时刻」的决定权交回调用方,而本卡的缺陷**正是**调用方
 * (App.vue ⓪)用 `wd.submittedAt` 盖住了整批。决定留在这个唯一构造处。
 */
/**
 * 「这个退款时刻消费方认不认」—— **单源谓词**,合并层与本文件共用(2026-08-12 修法证伪:
 * 两处各写一份必然漂移,而漂移的后果是合法时刻在一层被留下、在另一层被丢弃,准确日期掉进缝里)。
 *
 * 🔴 合并层**只拿它排序**(优先选消费方会接受的那份),**不拿它置 undefined** ——
 * 合并层写 undefined 是把值从盘上抹掉(不可恢复),而消费方的丢弃每次构造重算(可恢复)。
 */
export function isUsableRefundInstant(at: unknown, submittedAt: number, nowMs: number): boolean {
  return typeof at === "number" && Number.isFinite(at) && at > 0
    // submittedAt 在存量脏单上可能缺失 —— 缺失时不拿它当尺(否则 `at >= undefined` 恒假,合法值被全丢)。
    && (!Number.isFinite(submittedAt) || at >= submittedAt)
    && at <= nowMs;
}

function nexRefundAtMs(wd: Withdrawal): number {
  const now = mockServerNow();
  return isUsableRefundInstant(wd.nexRefundedAt, wd.submittedAt, now) ? wd.nexRefundedAt as number : now;
}

/** 单据终态 → 账单行状态。非终态一律在途,由 App.vue 的对账推进。 */
const FAILED_STATUSES: readonly Withdrawal["status"][] = [
  "review-rejected", "address-invalid", "tx-failed", "refunded",
];
export function billStatusForWithdrawal(status: Withdrawal["status"]): "posted" | "pending" | "failed" {
  if (status === "confirmed") return "posted";
  if (FAILED_STATUSES.includes(status)) return "failed";
  return "pending";
}

/**
 * 一笔提现应有的全部账单分录。
 *
 * - USDT 主行:负额 = 用户「提了多少钱」的唯一凭据;状态跟单据当前态(自愈补写时可能
 *   已经是终态了,写 pending 再等下一拍结算是多余的一步,也会让账单短暂说谎)。
 * - NEX 抵扣费行:只在服务端真烧了 NEX 时才有;恒 `posted` —— 烧是既成事实,
 *   提现失败时补一条 +N 的反向分录冲正(下一条),**不改写**这一条。
 * - NEX 退还行(冲正):只在服务端说「已经退了」时才有。判据是线上字段 `wd.nexRefunded`,
 *   而它的**日期**跟 `wd.nexRefundedAt` 走(这一族里唯一不发生在提交时刻的一行,见 `nexRefundAtMs`)。
 *
 * 🔴 每个数字都取自单据(服务端回执),不接受调用方另传 —— 本仓禁令:显示的钱必须指到单源。
 */
export function withdrawalBillDrafts(wd: Withdrawal): ReceiptDraft[] {
  // 🔴 存量单的 `fee` 可能整个缺失(旧 schema / 半写)。同批的 App.vue 与 app.ts 对这个字段
  // 一律用可选链,这里直读会抛 —— 而调用点之一是 5s 轮询里的对账,一抛就把整轮打停
  // (z4 R3 独立审计 P1)。给个零值兜底:数字不编造(全 0 = 没有费用信息),行照样记得下。
  const fee = wd.fee ?? { networkConfirmUsd: 0, nexBurned: 0, actualFeeUsd: 0 };
  const drafts: ReceiptDraft[] = [{
    type: "withdraw",
    symbol: "USDT",
    amount: -wd.amount,
    status: billStatusForWithdrawal(wd.status),
    memo: `Withdraw to ${wd.network} · fee $${fee.actualFeeUsd.toFixed(2)}`,
    // 风控路由取**服务端裁决**(wd.riskRoute),不取客户端预检结果:两者可以不同,
    // 而账本该记的是服务端实际怎么判的。缺省(历史单无该字段)按 pass 渲染。
    // 🔴 三种结局三句话,不合成一句(R2 completeness critic):`freeze` 是**冻结**、
    // `delay` 是延迟放行、`manual` 才是人工审核 —— 上一版把三种都写成「追加审核」,
    // 账本用一句话盖住三种不同结局,而被冻结的用户最需要知道自己是被冻结了。
    // 每句都带网络与手续费:被审核的那笔恰恰是用户最想核对手续费的那笔。
    memoKey: WITHDRAW_MEMO_BY_ROUTE[wd.riskRoute ?? "pass"],
    memoParams: { network: wd.network, fee: fee.actualFeeUsd.toFixed(2) },
    ref: wd.id,
  }];
  if (fee.nexBurned > 0) {
    drafts.push({
      type: "withdraw",
      symbol: "NEX",
      amount: -fee.nexBurned,
      status: "posted",
      memo: `Fee offset · ${fmtNex(fee.nexBurned)} NEX used`,
      memoKey: "withdrawNexFee",
      memoParams: {
        nex: fmtNex(fee.nexBurned),
        // 🔴 减免额优先取服务端直接下发的 `feeWaivedUsd`,不用「毛费 − 实付」重建
        // (R2 P1-3:重建出来的数指的是三个源,不是一个源;而服务端契约里
        //  `grossFee − feeWaived == actualFee` 是已被 parseSubmission 校验过的等式)。
        //
        // 🔴 但**存量单据没有这个字段**,直接 `?? 0` 会把老单真实的减免显示成 $0.00 ——
        // 那比重建**更差**(重建对老单是对的)。所以取不到才回落到等价推导:
        // `feeWaived = grossFee − actualFee`,而 `grossFee = networkConfirmUsd + penaltyUsd`。
        // 这不是「两个源并列」,是「权威源 + 存量兼容路径」,回落这一支随存量单消失而消失。
        fee: (fee.feeWaivedUsd
          ?? Math.max(0, fee.networkConfirmUsd + (fee.penaltyUsd ?? 0) - fee.actualFeeUsd)
        ).toFixed(2),
      },
      ref: wd.id,
    });
  }
  // 🔴 NEX 退还 → 冲正分录(原 App.vue ②b,2026-08-11 迁来本处)。
  //
  // 为什么冲正靠**反向分录**而不是改写上面那条 −N:烧确实发生过,改写 = 账本说没烧。
  // 复式账本的规矩是同单号补一条 +N,两行相抵 = 钱包净变化。
  //
  // 🔴 判据是**服务端说退了**(`wd.nexRefunded`),不是「单据是失败终态所以大概退了」。
  // z4 R2 按终态写过一版,R3 独立审计判定为「账本单方面宣布一笔没有任何证据的退款」并回滚:
  // 少一条冲正是漏记(可自愈),凭空写一条是造假(不可逆)。原判据锚在一个**本地**幂等键上,
  // 而写那个键的函数在 remote 模式下恒 no-op、mock 模式下压根建不出提现单 —— 两头落空,
  // 这条冲正在任何真实配置下都不可达。现在锚到服务端事实,这是本次修复的全部要点。
  //
  // 🔴 金额取 `nexRefunded` 而不是 `nexBurned`:两者可以不等(将来若改成部分退还),
  // 拿 burned 当退还额 = 显示的钱指到了另一个源(本仓禁令)。
  //
  // 🔴 `refunded > nexBurned` 一律不认:退得比烧的多 = 账本凭空造 NEX。此时**不夹到 nexBurned**
  // 而是整条不写 —— 夹了会拿一个已知是错的数去写一条看着合理的分录,比缺一条坏。
  // 这也是 `fee` 整个缺失(存量脏单)时的行为:不知道烧了多少,就无从验证退了多少。
  const refunded = wd.nexRefunded;
  if (typeof refunded === "number" && refunded > 0 && refunded <= fee.nexBurned) {
    drafts.push({
      type: "withdraw",
      symbol: "NEX",
      amount: refunded,
      status: "posted",
      // memoKey = 渲染时才翻译(切语言不留旧语);memo 只作兜底,与 bills.ts 的约定一致。
      memo: `Fee offset refunded · ${fmtNex(refunded)} NEX returned`,
      memoKey: "withdrawNexRefund",
      memoParams: { nex: fmtNex(refunded) },
      ref: wd.id,
      // 🔴 这一条**不跟整批的时刻**:它发生在退款那一刻,不是提交那一刻(见 nexRefundAtMs)。
      atMs: nexRefundAtMs(wd),
    });
  }
  return drafts;
}
