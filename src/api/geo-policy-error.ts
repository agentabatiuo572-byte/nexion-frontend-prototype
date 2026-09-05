/**
 * 地区策略拒绝 → 用户可读文案。
 *
 * 🔴 现状交底(2026-08-07 实测,别误以为它已经在生效):
 * 六个界面(登录/注册/提现/兑换/复购/试用)已接上本函数,写法也验过
 * (47 条运行时探针:7 种地区码 × 3 语全部翻译正确;22 种无关错误全部返回 null 原样放行)。
 * **但今天这条链一次都不会触发** —— 全仓没有任何代码会产生 `GEO_*` 形态的错误:
 * 这些 token 只出现在本文件,以及 `exchange-api.ts` 的一个**成功响应状态字段**里
 * (不是 Error.message,本函数看不到)。六个界面跑在 Pinia mock store 上,
 * 其错误类型是写死的本地字面量联合,不含地区码。
 *
 * 所以:守卫是**先放好的位**,真正生效要等接口层接通、那些错误联合放宽之后。
 * 届时请一并考虑把守卫上移到**接口层统一做一道**:
 * 「哪些界面会显示后端错误」是开放集合,逐页加守卫必然漏。
 */
export type GeoPolicyErrorKind = "blocked" | "limited" | "endpoint" | "unavailable";

export interface GeoPolicyCopy {
  blocked: string;
  limited: string;
  endpoint: string;
  unavailable: string;
}

const GEO_POLICY_KIND: Readonly<Record<string, GeoPolicyErrorKind>> = Object.freeze({
  GEO_BLOCKED: "blocked",
  GEO_LIMITED: "limited",
  GEO_ENDPOINT_BLOCKED: "endpoint",
  GEO_COUNTRY_UNRESOLVED: "unavailable",
  GEO_COUNTRY_INVALID: "unavailable",
  GEO_EDGE_TRUST_REQUIRED: "unavailable",
  GEO_EDGE_SOURCE_INVALID: "unavailable",
});

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

export function geoPolicyErrorKind(error: unknown): GeoPolicyErrorKind | null {
  const message = errorMessage(error);
  const token = message.match(/\bGEO_[A-Z_]+\b/)?.[0];
  return token ? GEO_POLICY_KIND[token] ?? null : null;
}

export function geoPolicyUserMessage(error: unknown, copy: GeoPolicyCopy): string | null {
  const kind = geoPolicyErrorKind(error);
  return kind ? copy[kind] : null;
}
