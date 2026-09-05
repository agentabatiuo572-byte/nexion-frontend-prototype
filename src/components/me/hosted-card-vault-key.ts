import type { InjectionKey } from "vue";
import type { CardBrand, HostedCardKind } from "@/store/cards-core";

// 托管卡字段的共享契约(hosted-card-vault.vue 提供 / hosted-card-field.vue 消费)。
// 单独成文件是因为三个调用方(充值 / 绑卡 / 结账)要 import token 类型,
// 而 <script setup> 导不出额外绑定。
// 字段种类住 cards-core(对齐 Stripe Elements 的 cardNumber/cardExpiry/cardCvc),此处透出。

export type { HostedCardKind };

/** tokenize() 的产物 —— 调用方能拿到的**全部**卡信息。明文卡号 / CVV 不在其中。 */
export interface HostedCardToken {
  /** 收单方 token(mock 生成;PROD = SDK createToken 返回的 id)。 */
  token: string;
  /** 本地 vault 只会生成显式 sandbox token，服务端生产边界必须拒绝。 */
  source: "mock";
  /** 卡号后四位,供 `•••• 1234` 展示。 */
  last4: string;
  brand: CardBrand;
  /** "MM/YY" */
  expiry: string;
}

/** 已存卡复验(结账时重输 CVV)的产物。同样不含明文。 */
export interface HostedCvvToken {
  cvvToken: string;
}

/** vault 向 field 暴露的读写口。field 自己不持状态,读写都过 vault。 */
export interface HostedCardVaultCtx {
  /** 该字段当前应显示的(已格式化)串。 */
  display(kind: HostedCardKind): string;
  /** 写入原始输入,vault 内部按 kind 规范化;返回值仅用于满足调用形式。 */
  write(kind: HostedCardKind, raw: string): void;
}

export const HOSTED_CARD_VAULT: InjectionKey<HostedCardVaultCtx> = Symbol("hosted-card-vault");
