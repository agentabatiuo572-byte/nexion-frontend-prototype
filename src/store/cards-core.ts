// 卡纯逻辑(零依赖 —— 不引 vue/pinia/uni)。
// cards.ts、hosted-card-vault.vue 与 scripts/selfcheck-cards.mjs 共用同一实现,
// 同 deposits-core.ts 的惯例:能 node 直跑的部分不藏在 SFC 里。

export type CardBrand = "visa" | "mastercard" | "amex" | "unionpay" | "unknown";

/** 卡组织判定(前缀区间,非穷举)。全站唯一一份 —— 展示与落库必须同判。 */
export function detectBrand(digits: string): CardBrand {
  if (/^4/.test(digits)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "mastercard";
  if (/^3[47]/.test(digits)) return "amex";
  if (/^62/.test(digits)) return "unionpay";
  return "unknown";
}

export function brandLabel(brand: CardBrand): string {
  switch (brand) {
    case "visa":
      return "Visa";
    case "mastercard":
      return "Mastercard";
    case "amex":
      return "American Express";
    case "unionpay":
      return "UnionPay";
    default:
      return "Card";
  }
}

// ── 托管卡字段(hosted-card-vault)的规范化与完备判定 ──────────────────
// 真实现里这两件事发生在收单方 iframe 内;此处是它的 mock 对等物,
// 抽成纯函数是为了能被 selfcheck 脚本直接断言。

export type HostedCardKind = "pan" | "expiry" | "cvv";

/** 按字段种类规范化用户输入(卡号四位分组 / MM per YY / CVV 纯数字)。 */
export function normalizeCardField(kind: HostedCardKind, raw: string): string {
  if (kind === "pan") {
    return raw
      .replace(/\D/g, "")
      .slice(0, 19)
      .replace(/(.{4})/g, "$1 ")
      .trim();
  }
  if (kind === "expiry") {
    const d = raw.replace(/\D/g, "").slice(0, 4);
    return d.length <= 2 ? d : `${d.slice(0, 2)}/${d.slice(2)}`;
  }
  return raw.replace(/\D/g, "").slice(0, 4);
}

export function panDigits(pan: string): string {
  return pan.replace(/\D/g, "");
}

/** 可提交判定(对齐 Stripe Elements 的 complete)。cvv-only 只校 CVV。 */
export function isCardComplete(
  mode: "full" | "cvv-only",
  fields: { pan: string; expiry: string; cvv: string },
): boolean {
  const cvvOk = /^\d{3,4}$/.test(fields.cvv);
  if (mode === "cvv-only") return cvvOk;
  return panDigits(fields.pan).length >= 13 && /^\d{2}\/\d{2}$/.test(fields.expiry) && cvvOk;
}
