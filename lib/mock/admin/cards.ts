/**
 * C1 用户 360 · 支付方式 mock(FEAT-CARDS01/02,确定性)。
 * PSP token 化:平台不存 PAN/CVV,仅有 PSP token;tokenId 界面只显尾 8 位,复制完整值须落 A2 读凭证审计。
 * 服务端权威、admin 只读缓存 —— PRODUCTION:
 *   GET  /api/admin/users/:id/cards                  → AdminCardRecord[](含 unbound;接口失败前端区内 inline 报错 + 重试)
 *   POST /api/admin/users/:id/cards/:token/actions   → { actionType: "unbind"|"rebind_notice", reason, idempotencyKey }(24h 幂等;409/422 语义见规格 ②③④)
 * 事件(A4 注册后 H3/L 消费):card.unbound / card.rebind_notified / card.revoke_failed。
 * 运行时覆盖层(解绑/换绑通知处置)在 user-ops-store cardOps,本文件只出种子。
 */

export type CardBrand = "visa" | "mastercard" | "amex" | "unionpay" | "unknown";
export type PspRevokeStatus = "pending" | "revoked" | "retry_queued";
/** 前端 PRD §9.11 TrialStatus;占用担保 = active / grace / extended,其余为已释放。 */
export type TrialRefStatus = "active" | "grace" | "extended" | "redeemed" | "failed" | "cancelled";

export interface AdminCardRecord {
  /** PSP 侧 mint(Checkout.com/Stripe token),禁平台自造;界面仅显尾 8 位缩略。 */
  tokenId: string;
  brand: CardBrand;
  /** PAN 末 4 位(PSP 回传;PAN 全量平台不存在)。 */
  last4: string;
  /** MM/YY(PSP 回传)。 */
  expiry: string;
  /** 持卡人姓名大写(用户输入,PSP 校验)。 */
  holder: string;
  /** ms epoch,服务端时间戳。 */
  boundAt: number;
  /** 用户侧默认卡指针;服务端权威(解绑默认卡时服务端切指针)。 */
  isDefault: boolean;
  /** 派生:free-trial 单 cardTokenId==tokenId 且试用状态 ∈ {active,grace,extended}。列表值为服务端缓存,提交时刻按 trialRef 重判(CARDS02 ② 异常 3 漂移)。 */
  trialGuard: boolean;
  /** 担保派生源:关联试用单。担保卡/漂移样例携带;chip 跳 H2 免费试用引擎。 */
  trialRef?: { trialId: string; trialStatus: TrialRefStatus };
  /** active → unbound(终态);服务端权威,client 绝不本地推进。 */
  status: "active" | "unbound";
  unboundAt?: number;
  /** admin 工号 或 "user"(用户侧自解绑)。 */
  unboundBy?: string;
  unboundReason?: string;
  /** PSP 注销子状态(仅 unbound 行有意义):pending/retry_queued 显「PSP 注销待重试」badge,不影响业务态。 */
  pspRevokeStatus?: PspRevokeStatus;
}

const ts = (d: string) => Date.parse(`${d}T08:00:00Z`);

function card(
  tokenId: string, brand: CardBrand, last4: string, expiry: string, holder: string, bound: string,
  extra?: Partial<AdminCardRecord>,
): AdminCardRecord {
  return { tokenId, brand, last4, expiry, holder, boundAt: ts(bound), isDefault: false, trialGuard: false, status: "active", ...extra };
}

/**
 * 样例覆盖(实施步骤 T1 要求):默认卡 / 试用担保卡 / 已解绑(处置三字段齐)/ >10 张分页 / retry_queued。
 * userId 对齐 C1 检索列表(design-data USERS)+ 权威 USERS(U-*);无条目用户(usr_90F0、U-30771「未绑卡」)= 空态。
 */
export const ADMIN_USER_CARDS: Record<string, AdminCardRecord[]> = {
  // Marcus Lee — 常规三卡:默认 + 备用 + admin 已解绑(挂失,PSP 已注销)。
  usr_84F2: [
    card("tok_ck_84f2a101c9d24e11", "visa", "4242", "09/28", "MARCUS LEE", "2026-03-12", { isDefault: true }),
    card("tok_ck_84f2b202d8e35f22", "mastercard", "8801", "01/29", "MARCUS LEE", "2026-04-02"),
    card("tok_ck_84f2c303e7f46a33", "visa", "1130", "05/27", "MARCUS LEE", "2026-03-18", {
      status: "unbound", unboundAt: ts("2026-05-21"), unboundBy: "ops·chen", unboundReason: "用户挂失来电,工单 T-8802 核实身份后处置", pspRevokeStatus: "revoked",
    }),
  ],
  // Aisha Khan — >10 张分页样例(11 active + 1 unbound = 12);含超长持卡人名(截断样例)。
  usr_19C7: [
    card("tok_ck_19c7a001f2d84b01", "visa", "4433", "09/28", "AISHA KHAN", "2026-01-30", { isDefault: true }),
    card("tok_ck_19c7a002e3c95c02", "mastercard", "7702", "11/27", "AISHA KHAN", "2026-02-01"),
    card("tok_ck_19c7a003d4ba6d03", "visa", "1904", "03/29", "AISHA BINTI ABDUL KHAN AL-RASHID", "2026-02-06"),
    card("tok_ck_19c7a004c5ab7e04", "amex", "3005", "07/28", "AISHA KHAN", "2026-02-14"),
    card("tok_ck_19c7a005b69c8f05", "unionpay", "6216", "12/28", "AISHA KHAN", "2026-02-20"),
    card("tok_ck_19c7a006a78d9a06", "visa", "5521", "04/27", "AISHA KHAN", "2026-03-01"),
    card("tok_ck_19c7a007987eab07", "mastercard", "9910", "08/29", "AISHA KHAN", "2026-03-09"),
    card("tok_ck_19c7a008896fbc08", "visa", "2287", "02/28", "AISHA KHAN", "2026-03-17"),
    card("tok_ck_19c7a0097a5fcd09", "mastercard", "4406", "10/27", "AISHA KHAN", "2026-03-25"),
    card("tok_ck_19c7a0106b4fde10", "visa", "8093", "06/29", "AISHA KHAN", "2026-04-04"),
    card("tok_ck_19c7a0115c3fef11", "amex", "1477", "01/28", "AISHA KHAN", "2026-04-12"),
    card("tok_ck_19c7a0124d2ff012", "visa", "3350", "05/28", "AISHA KHAN", "2026-02-03", {
      status: "unbound", unboundAt: ts("2026-04-19"), unboundBy: "ops·wang", unboundReason: "用户投诉误扣款,核实后应用户要求解除绑定", pspRevokeStatus: "revoked",
    }),
  ],
  // Diego Torres(冻结 · risk 91)— 欺诈涉案处置:unbound 行 PSP 注销失败进重试队列(T5 badge 样例)。
  usr_55B1: [
    card("tok_ck_55b1a501e8d13a41", "mastercard", "0091", "03/28", "DIEGO TORRES", "2026-05-19", { isDefault: true }),
    card("tok_ck_55b1b602f9e24b52", "visa", "6674", "08/27", "DIEGO TORRES", "2026-05-20", {
      status: "unbound", unboundAt: ts("2026-06-01"), unboundBy: "risk·chen", unboundReason: "K1 多账户关联涉案卡,风控阻断自动扣款与复用", pspRevokeStatus: "retry_queued",
    }),
  ],
  // Yuki Tanaka — 试用担保卡(grace 宽限期仍占担保):行尾只有「换绑通知」,无解绑入口。
  // 她的试用单不在 H2 演示样本窗(TRIAL_SESSIONS 四行)内 — 样本窗外≠矛盾,同 C4 台账窗外先例。
  usr_02A9: [
    card("tok_ck_02a9a801b3c47d61", "visa", "5210", "10/28", "YUKI TANAKA", "2026-04-02", {
      isDefault: true, trialGuard: true, trialRef: { trialId: "TRL-02A9-07", trialStatus: "grace" },
    }),
  ],
  // Omar Farouk(L2 新手)— 担保判定漂移样例:列表缓存仍标担保(trialGuard=true),但试用已取消归零
  //(与 H2 TRIAL_SESSIONS 里 usr_77D4=cancelled 同源一致)→ 提交换绑通知时服务端 409「已不担保」。
  usr_77D4: [
    card("tok_ck_77d4a901c2b58e71", "unionpay", "6230", "12/27", "OMAR FAROUK", "2026-05-30", { isDefault: true }),
    card("tok_ck_77d4ba02d1a69f82", "visa", "9038", "06/28", "OMAR FAROUK", "2026-05-31", {
      trialGuard: true, trialRef: { trialId: "TRL-77D4-01", trialStatus: "cancelled" },
    }),
  ],
  // Lena Brandt — 用户侧自解绑样例(unboundBy = "user",同终态同字段结构)。
  usr_31E8: [
    card("tok_ck_31e8aa01e4f31b91", "visa", "7745", "02/29", "LENA BRANDT", "2025-12-11", { isDefault: true }),
    card("tok_ck_31e8bb02f5e42ca2", "mastercard", "2219", "07/27", "LENA BRANDT", "2026-01-08", {
      status: "unbound", unboundAt: ts("2026-03-30"), unboundBy: "user", unboundReason: "用户端自助解绑(挽留提示后仍确认)", pspRevokeStatus: "revoked",
    }),
  ],
  // minerJoe(权威 USERS 直达路径)— 双卡常规样例。
  "U-88421": [
    card("tok_ck_u88421a1c7d92eb1", "visa", "6620", "11/28", "JOE MINER", "2026-03-14", { isDefault: true }),
    card("tok_ck_u88421b2d8ea3fc2", "mastercard", "4419", "04/29", "JOE MINER", "2026-04-20"),
  ],
};

/** PRODUCTION: GET /api/admin/users/:id/cards。未绑卡用户返回 [](C1 空态)。 */
export function getUserCards(userId: string): AdminCardRecord[] {
  return ADMIN_USER_CARDS[userId] ?? [];
}
