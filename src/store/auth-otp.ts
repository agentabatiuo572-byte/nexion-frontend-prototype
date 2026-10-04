// FEAT-AUTH01 OTP 发送闸门与生命周期(PRD §4.6.2 / §16.2.1;规格
// PRD/specs/FEAT-AUTH01-otp-antibomb-gate.md)。
// FEAT-AUTH03 注册场景滑块前置:otpSend 的滑块判定按场景强制
// (规格 PRD/specs/FEAT-AUTH03-register-captcha-always.md)。
//
// ⚠️ MOCK-ONLY: 本文件模拟 PRD 已列的 `POST /api/auth/otp/send`、
// `POST /api/auth/otp/verify` 与 CAPTCHA provider adapter —— 判定走“服务端”规则
// (冷却 / 24h 限频 / ticket / TTL / attemptsLeft / 一码一),client 只消费
// discriminated union 结论。注册 reserve/finalize 是注册事务的本地拆分；PRD 只在
// 高层列出 `POST /api/auth/{register,login}`，注册 endpoint/回执契约仍 TBD。PROD
// 接入时本文件的 storage/内存状态整体废弃，由认证服务原子执行并返回结论。
import { useConfig } from "@/store/config";
import {
  activateReservedAuthAccount,
  authAccountKeyForPhone,
  inspectAuthAccounts,
  reserveAuthAccount,
  resolveAuthAccount,
  type AuthRegistrationContext,
} from "@/store/auth-account";
import { normalizeRefCode } from "@/store/sponsorship";
import type { EarningBucketRoute } from "@/store/types";

// payout-address:提现地址添加/更换的 step-up 短信确认。
// 复用同一套生命周期(冷却 / 24h 限频滑块 / TTL / 次数上限),不另造第二套 OTP。
export type OtpScene = "login" | "register" | "reset" | "payout-address";

export type OtpSendResult =
  | { ok: true; requestId: string; resendAfterSec: number; expiresInSec: number }
  | { ok: false; error: "captcha_required" }
  | { ok: false; error: "rate_limited"; retryAfterSec: number }
  // 预留:§4.6.2 密码锁定期间拒发。mock 无密码错误计数器,不触发。
  | { ok: false; error: "locked"; lockedUntil: number };

export type CaptchaChallenge = { challengeId: string; targetRatio: number };

export type CaptchaVerifyResult =
  | { ok: true; ticket: string; expiresInSec: number }
  | { ok: false; error: "captcha_failed"; failCount: number }
  | { ok: false; error: "captcha_throttled" };

export type OtpVerifyResult =
  | { ok: true; verifyToken: string; nextAction: OtpNextAction }
  | { ok: false; error: "otp_invalid"; attemptsLeft: number }
  | { ok: false; error: "otp_expired" }
  | { ok: false; error: "otp_attempts_exceeded" }
  | { ok: false; error: "otp_not_found" }
  | { ok: false; error: "account_lookup_failed" };

export type OtpNextAction = "continue_registration" | "sign_in" | "reset_password" | "step_up";

export type VerifiedRegistrationResult =
  | { ok: true; accountId: string; alreadyCommitted: boolean; registration: AuthRegistrationContext | null }
  | { ok: false; error: "account_exists"; accountId: string; onboardingComplete: boolean }
  | { ok: false; error: "verify_token_invalid" | "account_directory_unavailable" | "registration_blocked" };

export type VerifiedRegistrationCommitResult =
  | { ok: true; accountId: string; alreadyCommitted: boolean }
  | { ok: false; error: "verify_token_invalid" | "account_directory_unavailable" };

export type VerifiedSignInResult =
  | { ok: true; accountId: string; signInIdempotencyKey: string; onboardingComplete: boolean }
  | { ok: false; error: "verify_token_invalid" | "account_not_found" | "account_directory_unavailable" };

// ── storage(mock server 侧状态;ms epoch;独立 key,不进 account-cloud)──
const SEND_LOG_KEY = "nx_otp_send_log_v1"; // Record<phone, number[]> 仅成功 send
const ACTIVE_KEY = "nx_otp_active_v1"; // Record<phone, ActiveOtp>
const CAPTCHA_KEY = "nx_otp_captcha_v1"; // Record<phone, CaptchaState>

interface ActiveOtp {
  requestId: string;
  scene: OtpScene;
  code: string; // PROD: server 持有,永不下发;mock 生成后仅按测试码规则判定
  issuedAt: number;
  expiresAt: number;
  attemptsLeft: number;
  status: "active" | "consumed" | "expired" | "exhausted";
}

interface CaptchaState {
  challengeId: string | null;
  targetRatio: number;
  fails: number;
  ticket: string | null;
  ticketExpiresAt: number;
  ticketUsed: boolean;
}

interface VerifyTokenRecord {
  phone: string;
  scene: OtpScene;
  requestId: string;
  nextAction: OtpNextAction;
  issuedAt: number;
  expiresAt: number;
  consumedAt: number | null;
  consumedFor: "register" | "sign_in" | null;
  outcomeAccountId: string | null;
  outcomeIdempotencyKey: string | null;
}

// bearer verifyToken 只存在于当前 JS 上下文与页面 ref，不写 localStorage。
// Map 代表 mock server 的短时 verifier state；整页刷新即失效，符合 client
// 不持久化验证凭证的契约。
const verifyTokens = new Map<string, VerifyTokenRecord>();

const DAY_MS = 24 * 60 * 60 * 1000;
// ponytail: 拼图容差按轨道宽度比例判定(±2% ≈ 300px 区宽下 ±6px)。
const CAPTCHA_TOLERANCE_RATIO = 0.02;
// 单一来源:滑块失败上限,组件展示 n/max 与节流判定共用(勿在组件重复定义)。
export const MAX_CAPTCHA_FAILS = 5;
const MOCK_LATENCY_MS = 300;

function readMap<T>(key: string): Record<string, T> {
  try {
    const raw = uni.getStorageSync(key);
    return raw ? (JSON.parse(raw) as Record<string, T>) : {};
  } catch {
    return {};
  }
}
function writeMap<T>(key: string, map: Record<string, T>) {
  uni.setStorageSync(key, JSON.stringify(map));
}

/** Mock account deletion cleanup; production OTP state is server-owned. */
export function clearAuthOtpStateForPhone(phone: string): void {
  try {
    for (const key of [SEND_LOG_KEY, ACTIVE_KEY, CAPTCHA_KEY]) {
      const map = readMap<unknown>(key);
      delete map[phone];
      writeMap(key, map);
    }
  } catch {
    // Account deletion remains best-effort when local storage is unavailable;
    // the auth registry and in-memory verifier are still consumed below.
  }
  for (const [token, record] of verifyTokens) {
    if (record.phone === phone) verifyTokens.delete(token);
  }
}

function mint(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}
function delay(): Promise<void> {
  return new Promise((r) => setTimeout(r, MOCK_LATENCY_MS));
}
function gate() {
  return useConfig().config.otpGate;
}

function recentSends(phone: string, now: number): number[] {
  const log = readMap<number[]>(SEND_LOG_KEY);
  return (log[phone] ?? []).filter((ts) => now - ts < DAY_MS);
}
function captchaState(phone: string): CaptchaState {
  const map = readMap<CaptchaState>(CAPTCHA_KEY);
  return (
    map[phone] ?? { challengeId: null, targetRatio: 0, fails: 0, ticket: null, ticketExpiresAt: 0, ticketUsed: true }
  );
}
function saveCaptchaState(phone: string, st: CaptchaState) {
  const map = readMap<CaptchaState>(CAPTCHA_KEY);
  writeMap(CAPTCHA_KEY, { ...map, [phone]: st });
}
function hasValidTicket(st: CaptchaState, now: number): boolean {
  return !!st.ticket && !st.ticketUsed && st.ticketExpiresAt > now;
}

// ── POST /api/auth/otp/send ───────────────────────────────────────────────
// 闸门判定顺序(规格 ④):① 冷却 → ② 滑块判定(场景强制 ∨ 24h 限频;无有效
// ticket 即拒)→ ③ 放行。冷却优先于凭证:冷却分支先返回,不触碰 captcha state。
export async function otpSend(phone: string, scene: OtpScene, captchaTicket?: string): Promise<OtpSendResult> {
  await delay();
  const cfg = gate();
  const now = Date.now();

  const sends = recentSends(phone, now);
  const lastSentAt = sends.length ? Math.max(...sends) : 0;
  const cooldownEndsAt = lastSentAt + cfg.resendSeconds * 1000;
  if (cooldownEndsAt > now) {
    // rate_limited 不生成新码、不失效现有码、不计 SendLog(规格 ④ 禁止动作)。
    return { ok: false, error: "rate_limited", retryAfterSec: Math.ceil((cooldownEndsAt - now) / 1000) };
  }

  // FEAT-AUTH03 判定规则(纯函数,server 与 mock 同构):
  // 需要滑块 = captchaAlwaysScenes.includes(scene) || 该手机号24h成功发码数 >= captchaAfterSends。
  const captchaRequired = cfg.captchaAlwaysScenes.includes(scene) || sends.length >= cfg.captchaAfterSends;
  if (captchaRequired) {
    const st = captchaState(phone);
    // ticket 必须显式出示且与签发一致(规格 ④ 单次使用):未出示视同无票,
    // 不隐式复用 storage 里的存票——防"滑块成功但未消费的孤儿票"被后续
    // 无参 send 静默用掉(audit P0)。
    const ticketOk = !!captchaTicket && hasValidTicket(st, now) && captchaTicket === st.ticket;
    if (!ticketOk) return { ok: false, error: "captcha_required" };
    // ticket 单次使用:放行即消费。
    saveCaptchaState(phone, { ...st, ticketUsed: true });
  }

  // 放行:新码覆盖旧码(一码一机制,§4.6.2)。
  const record: ActiveOtp = {
    requestId: mint("OTP"),
    scene,
    code: String(Math.floor(100000 + Math.random() * 900000)),
    issuedAt: now,
    expiresAt: now + cfg.otpTtlSeconds * 1000,
    attemptsLeft: cfg.maxVerifyAttempts,
    status: "active",
  };
  const active = readMap<ActiveOtp>(ACTIVE_KEY);
  writeMap(ACTIVE_KEY, { ...active, [phone]: record });
  const log = readMap<number[]>(SEND_LOG_KEY);
  writeMap(SEND_LOG_KEY, { ...log, [phone]: [...sends, now] });

  return { ok: true, requestId: record.requestId, resendAfterSec: cfg.resendSeconds, expiresInSec: cfg.otpTtlSeconds };
}

// ── CAPTCHA provider adapter (PROD 由供应商 SDK / 认证服务托管，无公开 endpoint) ──
// server 出题:目标缺口在 40%–85% 区间随机;失败计数保留在 phone 维度。
// ⚠️ PROD 差异(与 otpSend/otpVerify 的"函数体无痛替换"不同):真实滑块验证
// server 不下发 targetRatio(答案),challenge 为加密拼图资源;verify 的 proof
// 也不是位置比例,而是完整拖动轨迹(时间序列),server 做行为分析判定。
// mock 明文下发 target 是"前端要渲染缺口"的固有限制,接真后台时这两个函数的
// 入参/返回 shape 需按厂商 SDK(极验类)整体重设计,client 渲染层随之替换。
export async function captchaChallenge(phone: string): Promise<CaptchaChallenge> {
  await delay();
  const st = captchaState(phone);
  const challenge: CaptchaChallenge = { challengeId: mint("CH"), targetRatio: 0.4 + Math.random() * 0.45 };
  saveCaptchaState(phone, { ...st, challengeId: challenge.challengeId, targetRatio: challenge.targetRatio });
  return challenge;
}

// ── CAPTCHA provider verification (SDK/endpoint TBD) ──────────────────────
// 判定权在 server(mock 同构):client 只上报释放位置比例。
export async function captchaVerify(
  phone: string,
  proof: { challengeId: string; offsetRatio: number },
): Promise<CaptchaVerifyResult> {
  await delay();
  const cfg = gate();
  const st = captchaState(phone);
  const now = Date.now();

  const hit = st.challengeId === proof.challengeId && Math.abs(proof.offsetRatio - st.targetRatio) <= CAPTCHA_TOLERANCE_RATIO;
  if (hit) {
    const ticket = mint("CT");
    saveCaptchaState(phone, {
      ...st,
      challengeId: null,
      fails: 0,
      ticket,
      ticketExpiresAt: now + cfg.captchaTicketTtlSeconds * 1000,
      ticketUsed: false,
    });
    return { ok: true, ticket, expiresInSec: cfg.captchaTicketTtlSeconds };
  }

  const fails = st.fails + 1;
  if (fails >= MAX_CAPTCHA_FAILS) {
    // 连续 5 次失败:关闭并要求稍后再试;计数清零,下次重新拉起再来。
    // ponytail: mock 不做跨轮冷却(规格 ④ 显式认领);PROD 由 server 风控
    // 对高频 throttled 升级处置(更长冷却/设备封禁),预留。
    saveCaptchaState(phone, { ...st, challengeId: null, fails: 0 });
    return { ok: false, error: "captcha_throttled" };
  }
  saveCaptchaState(phone, { ...st, challengeId: null, fails });
  return { ok: false, error: "captcha_failed", failCount: fails };
}

// ── POST /api/auth/otp/verify ─────────────────────────────────────────────
export async function otpVerify(phone: string, scene: OtpScene, requestId: string, code: string): Promise<OtpVerifyResult> {
  await delay();
  const map = readMap<ActiveOtp>(ACTIVE_KEY);
  const rec = map[phone];
  const now = Date.now();

  // 请求必须同时绑定 phone + scene + requestId。跨场景/旧请求不扣次数、
  // 不消费当前有效验证码，统一返回 not_found 防内部状态泄漏。
  if (!rec || rec.scene !== scene || rec.requestId !== requestId || rec.status === "consumed") {
    return { ok: false, error: "otp_not_found" };
  }
  if (rec.status === "exhausted") return { ok: false, error: "otp_attempts_exceeded" };
  if (rec.status === "expired" || rec.expiresAt <= now) {
    writeMap(ACTIVE_KEY, { ...map, [phone]: { ...rec, status: "expired" } });
    return { ok: false, error: "otp_expired" };
  }

  // MOCK 判定规则(Stripe 测试卡模式,规格 ③):000000=invalid · 999999=expired
  // · 其它 6 位=通过。PROD: 替换为 `code === rec.code` 的 server 权威比对。
  if (code === "999999") {
    writeMap(ACTIVE_KEY, { ...map, [phone]: { ...rec, status: "expired" } });
    return { ok: false, error: "otp_expired" };
  }
  if (code === "000000") {
    const attemptsLeft = rec.attemptsLeft - 1;
    if (attemptsLeft <= 0) {
      writeMap(ACTIVE_KEY, { ...map, [phone]: { ...rec, attemptsLeft: 0, status: "exhausted" } });
      return { ok: false, error: "otp_attempts_exceeded" };
    }
    writeMap(ACTIVE_KEY, { ...map, [phone]: { ...rec, attemptsLeft } });
    return { ok: false, error: "otp_invalid", attemptsLeft };
  }

  let nextAction: OtpNextAction;
  if (scene === "register") {
    const account = resolveAuthAccount(phone);
    if (!account.ok) return { ok: false, error: "account_lookup_failed" };
    nextAction = account.account ? "sign_in" : "continue_registration";
  } else if (scene === "payout-address") {
    nextAction = "step_up"; // 已登录账号的敏感操作确认,不产生登录/重置后续动作
  } else {
    nextAction = scene === "login" ? "sign_in" : "reset_password";
  }

  const verifyToken = mint("VT");
  pruneVerifyTokens(now);
  verifyTokens.set(verifyToken, {
    phone,
    scene,
    requestId,
    nextAction,
    issuedAt: now,
    expiresAt: now + gate().otpTtlSeconds * 1000,
    consumedAt: null,
    consumedFor: null,
    outcomeAccountId: null,
    outcomeIdempotencyKey: null,
  });
  writeMap(ACTIVE_KEY, { ...map, [phone]: { ...rec, status: "consumed" } });
  return { ok: true, verifyToken, nextAction };
}

function pruneVerifyTokens(now = Date.now()): void {
  for (const [token, rec] of verifyTokens) {
    if (rec.expiresAt <= now) verifyTokens.delete(token);
  }
}

function matchingVerifyToken(token: string, phone: string, scene: OtpScene): VerifyTokenRecord | null {
  pruneVerifyTokens();
  const rec = verifyTokens.get(token);
  if (!rec || rec.phone !== phone || rec.scene !== scene || rec.expiresAt <= Date.now()) return null;
  return rec;
}

function consumeVerifyToken(
  token: string,
  rec: VerifyTokenRecord,
  consumedFor: "register" | "sign_in",
  outcomeAccountId: string,
  outcomeIdempotencyKey: string | null = null,
): void {
  verifyTokens.set(token, { ...rec, consumedAt: Date.now(), consumedFor, outcomeAccountId, outcomeIdempotencyKey });
}

/**
 * 注册事务（endpoint/回执契约 TBD）的 mock reserve 阶段：校验凭证并写 pending。
 * pending 不是已注册账号；风险/推荐/礼包/账单补齐后才 finalize，onboarding 仍保持
 * false，直到 connect 最终步骤完成。
 */
export function registerVerifiedPhone(
  phone: string,
  verifyToken: string,
  input: { sponsorCode: string | null; giftRoute: EarningBucketRoute; allowCreate?: boolean },
): VerifiedRegistrationResult {
  const matching = matchingVerifyToken(verifyToken, phone, "register");
  if (matching?.consumedFor === "register" && matching.outcomeAccountId) {
    const account = resolveAuthAccount(phone);
    if (!account.ok || !account.account || account.account.accountId !== matching.outcomeAccountId) {
      return { ok: false, error: "account_directory_unavailable" };
    }
    return {
      ok: true,
      accountId: matching.outcomeAccountId,
      alreadyCommitted: true,
      registration: account.account.registration,
    };
  }
  const token = matching?.consumedAt === null ? matching : null;
  if (!token || token.nextAction !== "continue_registration") return { ok: false, error: "verify_token_invalid" };
  const accountId = authAccountKeyForPhone(phone);
  if (!accountId) return { ok: false, error: "account_directory_unavailable" };
  const rewards = useConfig().config.rewards;
  const gift = rewards.enabled
    ? rewards.welcomeGift
    : { lockMode: "risk_bucket" as const, usdtAmount: 0, nexAmount: 0 };
  // 不信任页面调用方：冻结到 pending 目录前再次裁掉任意字符串邀请码。
  const sponsorCode = normalizeRefCode(input.sponsorCode);
  const result = reserveAuthAccount(phone, {
    sponsorCode,
    giftRoute: input.giftRoute,
    giftUsdt: gift.usdtAmount,
    giftNex: gift.nexAmount,
    giftRef: `GIFT-${accountId}`,
  }, input.allowCreate ?? true);
  if (!result.ok) {
    if (result.error === "account_exists") {
      // 验码后发生并发建号：保留凭证给 exchangeVerifiedSignIn 转登录。
      return {
        ok: false,
        error: "account_exists",
        accountId: result.account.accountId,
        onboardingComplete: result.account.onboardingComplete,
      };
    }
    return { ok: false, error: result.error === "registration_blocked" ? "registration_blocked" : "account_directory_unavailable" };
  }
  verifyTokens.set(verifyToken, { ...token, outcomeAccountId: result.account.accountId });
  return {
    ok: true,
    accountId: result.account.accountId,
    alreadyCommitted: false,
    registration: result.account.registration,
  };
}

/** 全部注册副作用成功后的唯一 active/consume 点；重复响应返回同一业务结果。 */
export function finalizeVerifiedRegistration(phone: string, verifyToken: string): VerifiedRegistrationCommitResult {
  const matching = matchingVerifyToken(verifyToken, phone, "register");
  if (!matching) return { ok: false, error: "verify_token_invalid" };
  if (matching.consumedAt !== null) {
    return matching.consumedFor === "register" && matching.outcomeAccountId
      ? { ok: true, accountId: matching.outcomeAccountId, alreadyCommitted: true }
      : { ok: false, error: "verify_token_invalid" };
  }
  if (matching.nextAction !== "continue_registration") return { ok: false, error: "verify_token_invalid" };
  const accountId = matching.outcomeAccountId;
  if (!accountId) return { ok: false, error: "account_directory_unavailable" };
  const activated = activateReservedAuthAccount(phone, accountId);
  if (!activated.ok) return { ok: false, error: "account_directory_unavailable" };
  consumeVerifyToken(verifyToken, matching, "register", activated.account.accountId);
  return { ok: true, accountId: activated.account.accountId, alreadyCommitted: activated.alreadyActive };
}

/**
 * ⚠️ MOCK-ONLY: OTP 验证后的 session exchange。PROD 不新增公开 endpoint：
 * canonical `POST /api/auth/otp/verify` 应原子完成账号分流、session 创建与
 * sponsor first-wins；本地 token 只模拟“verify 凭证必须被 session 消费”。
 */
export function exchangeVerifiedOtpSignIn(
  phone: string,
  verifyToken: string,
  scene: Extract<OtpScene, "register" | "login">,
): VerifiedSignInResult {
  const token = matchingVerifyToken(verifyToken, phone, scene);
  if (!token) return { ok: false, error: "verify_token_invalid" };
  if (token.consumedAt !== null) {
    if (token.consumedFor !== "sign_in" || !token.outcomeAccountId || !token.outcomeIdempotencyKey) {
      return { ok: false, error: "verify_token_invalid" };
    }
    const resolved = resolveAuthAccount(phone);
    if (!resolved.ok) return { ok: false, error: "account_directory_unavailable" };
    if (!resolved.account) return { ok: false, error: "account_not_found" };
    if (resolved.account.accountId !== token.outcomeAccountId) return { ok: false, error: "account_directory_unavailable" };
    return {
      ok: true,
      accountId: token.outcomeAccountId,
      signInIdempotencyKey: token.outcomeIdempotencyKey,
      onboardingComplete: resolved.account.onboardingComplete,
    };
  }
  if (token.nextAction !== "sign_in") return { ok: false, error: "verify_token_invalid" };
  const account = resolveAuthAccount(phone);
  if (!account.ok) return { ok: false, error: "account_directory_unavailable" };
  if (!account.account) return { ok: false, error: "account_not_found" };
  const signInIdempotencyKey = mint("SI");
  consumeVerifyToken(verifyToken, token, "sign_in", account.account.accountId, signInIdempotencyKey);
  return {
    ok: true,
    accountId: account.account.accountId,
    signInIdempotencyKey,
    onboardingComplete: account.account.onboardingComplete,
  };
}

/** 注册入口老号分流兼容封装。 */
export function exchangeVerifiedSignIn(phone: string, verifyToken: string): VerifiedSignInResult {
  return exchangeVerifiedOtpSignIn(phone, verifyToken, "register");
}

/** 登录页 OTP 凭证交换封装，确保 verifyToken 必经一次消费。 */
export function exchangeVerifiedLogin(phone: string, verifyToken: string): VerifiedSignInResult {
  return exchangeVerifiedOtpSignIn(phone, verifyToken, "login");
}

// ── DEV/DEMO bridge(spec7-dev-bridge 同模式;PROD 不挂载)──────────────
export function mountAuthOtpDevBridge(): void {
  if (!import.meta.env.DEV) return;
  if (typeof window === "undefined") return;
  (window as unknown as Record<string, unknown>).__nexgridAuthDev = {
    /** 预填 n 条 24h 内 send 记录:免等 2 轮冷却即可演示滑块闸门。 */
    seedSendLog(phone: string, n: number) {
      const now = Date.now();
      const log = readMap<number[]>(SEND_LOG_KEY);
      // 记录落在冷却窗之外(-2h 起、每条隔 1h),只推高 24h 计数、不触发 rate_limited。
      const stamps = Array.from({ length: n }, (_, i) => now - (i + 2) * 60 * 60 * 1000);
      writeMap(SEND_LOG_KEY, { ...log, [phone]: stamps });
    },
    /** 清空该手机号的全部闸门状态(send log / active code / captcha / 内存 verifier)。 */
    reset(phone: string) {
      const log = readMap<number[]>(SEND_LOG_KEY);
      delete log[phone];
      writeMap(SEND_LOG_KEY, log);
      const active = readMap<ActiveOtp>(ACTIVE_KEY);
      delete active[phone];
      writeMap(ACTIVE_KEY, active);
      const cap = readMap<CaptchaState>(CAPTCHA_KEY);
      delete cap[phone];
      writeMap(CAPTCHA_KEY, cap);
      for (const [token, rec] of verifyTokens) {
        if (rec.phone === phone) verifyTokens.delete(token);
      }
    },
    /** 只读观测口。 */
    inspect(phone: string) {
      return {
        sendLog: readMap<number[]>(SEND_LOG_KEY)[phone] ?? [],
        active: readMap<ActiveOtp>(ACTIVE_KEY)[phone] ?? null,
        captcha: readMap<CaptchaState>(CAPTCHA_KEY)[phone] ?? null,
        verifyTokens: [...verifyTokens.values()]
          .filter((rec) => rec.phone === phone)
          .map((rec) => ({ ...rec })),
        account: resolveAuthAccount(phone),
      };
    },
    /** 运行时验收透传(绕 UI 直打"服务端",走页面主链模块实例)。 */
    send(phone: string, scene: OtpScene, captchaTicket?: string) {
      return otpSend(phone, scene, captchaTicket);
    },
    verify(phone: string, scene: OtpScene, requestId: string, code: string) {
      return otpVerify(phone, scene, requestId, code);
    },
    reserveRegistration(
      phone: string,
      verifyToken: string,
      input: { sponsorCode?: string | null; giftRoute?: EarningBucketRoute } = {},
    ) {
      return registerVerifiedPhone(phone, verifyToken, {
        sponsorCode: input.sponsorCode ?? null,
        giftRoute: input.giftRoute ?? "pending_review",
      });
    },
    retryLastExchange(phone: string) {
      const latest = [...verifyTokens.entries()]
        .filter(([, rec]) => rec.phone === phone && rec.scene === "register")
        .sort((a, b) => b[1].issuedAt - a[1].issuedAt)[0];
      return latest ? exchangeVerifiedSignIn(phone, latest[0]) : { ok: false, error: "verify_token_invalid" };
    },
    retryLastFinalize(phone: string) {
      const latest = [...verifyTokens.entries()]
        .filter(([, rec]) => rec.phone === phone && rec.scene === "register")
        .sort((a, b) => b[1].issuedAt - a[1].issuedAt)[0];
      return latest ? finalizeVerifiedRegistration(phone, latest[0]) : { ok: false, error: "verify_token_invalid" };
    },
    accounts() { return inspectAuthAccounts(); },
  };
}
