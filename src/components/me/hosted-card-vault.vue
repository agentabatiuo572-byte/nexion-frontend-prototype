<!--
  HostedCardVault — 收单方托管卡字段的上下文容器。

  🔴 信任边界(逐字段说清,别笼统写「卡信息不外泄」):
    · **卡号 / CVV** —— 明文在前端只存在于本组件与 <HostedCardField> 之内,
      任何调用方在代码上都拿不到。这是模块边界,不是视觉声明。
    · **有效期** —— tokenize() **会**原样返回(见 HostedCardToken.expiry)。
      这是有意的:卡列表要显示「有效期 09/30」,且真实收单方(Stripe 的
      exp_month/exp_year、Checkout.com 的 expiry_month/year)同样随 token 返回。
      有效期属持卡人数据但不属敏感认证数据(SAD),与 PAN/CVV 不同级。
      ⚠️ 曾把它写进「只存在于组件内」的列表里 —— 过度声明,会让人误以为它像
      卡号一样不可见。审计已纠(2026-07-28)。
  产品文案承诺的也正是这个范围(充值页 trustFootnote「NexGrid 不会接触你的完整
  卡号」· 绑卡页 formSecurityNote「PCI DSS Level 1 token 化」——都只承诺卡号)。

  形状照 Stripe Elements:一个 elements 容器 + 若干 element 子项,容器负责
  createToken,change 事件带 complete + brand。渲染 <slot/>(零 DOM),
  调用方的布局 / 标签 / 样式**一行不动** —— 视觉零变化因此是结构保证,
  不靠改完再肉眼比对。

  PROD 切换:本文件与 hosted-card-field.vue 内部换成收单方 SDK 挂载(文案已点名
  Checkout.com;Stripe / Adyen 同形)。**调用方基本零改动,但有一个已知例外**:
  change 事件里的 cvvLength 是 mock 才给得出的信号(真 SDK 的 CVV 活在跨域
  iframe 里,change 只吐 complete / empty / error,不吐逐键位数)。结账页
  card-payment.vue 的「n/4」计数器依赖它 —— 接真 SDK 时那个计数器要么改成
  complete 的二态呈现,要么去掉。别把「零改动」当成绝对承诺。
  MOCK-ONLY:token 本地合成;真实现由 SDK 在收单方域内生成,卡号/CVV 永不到达本前端。
-->
<template>
  <slot />
</template>

<script setup lang="ts">
import { computed, provide, ref, watch } from "vue";
import {
  detectBrand,
  isCardComplete,
  normalizeCardField,
  panDigits,
  type CardBrand,
} from "@/store/cards-core";
import {
  HOSTED_CARD_VAULT,
  type HostedCardKind,
  type HostedCardToken,
  type HostedCvvToken,
} from "./hosted-card-vault-key";

const props = withDefaults(defineProps<{ mode?: "full" | "cvv-only" }>(), { mode: "full" });

/** change 与 Stripe Elements 的 change 同义:ready = complete(可提交)。
 *  cvvLength 是「填了几位」不是值本身(同 complete 一样属填写进度),
 *  结账页的 n/4 计数器要它;明文仍不出组件。 */
const emit = defineEmits<{ change: [{ ready: boolean; brand: CardBrand; cvvLength: number }] }>();

// 明文只活在这三个 ref 里,不 expose、不 emit、不进 props 回传。
const pan = ref("");
const expiry = ref("");
const cvv = ref("");

/** 卡组织判定走 cards-core 的单源 detectBrand:此前充值页自带一份更宽松的前缀
 *  判断(2 开头一律算 Mastercard),与绑卡落库用的那份不一致,展示与落库会打架。 */
const brand = computed<CardBrand>(() => detectBrand(panDigits(pan.value)));
const ready = computed(() =>
  isCardComplete(props.mode, { pan: pan.value, expiry: expiry.value, cvv: cvv.value }),
);

watch(
  [ready, brand, cvv],
  () => emit("change", { ready: ready.value, brand: brand.value, cvvLength: cvv.value.length }),
  { immediate: true },
);

const cell = { pan, expiry, cvv } as const;

provide(HOSTED_CARD_VAULT, {
  display: (kind: HostedCardKind) => cell[kind].value,
  // 格式化在真实现里发生于收单方 iframe 内;此处是它的 mock 对等物。
  write: (kind: HostedCardKind, raw: string) => {
    cell[kind].value = normalizeCardField(kind, raw);
  },
});

/** MOCK-ONLY:PSP token 形状(`tok_` + 24 hex)。PROD 由 SDK 返回,本函数删除。 */
function mintToken(prefix: "tok" | "cvv"): string {
  let hex = "";
  for (let i = 0; i < 24; i++) hex += "0123456789abcdef"[Math.floor(Math.random() * 16)];
  return `${prefix}_${hex}`;
}

/** 未填全返回 null(对齐 SDK createToken 的 incomplete 错误),调用方据此不提交。 */
function tokenize(): HostedCardToken | null {
  if (props.mode !== "full" || !ready.value) return null;
  return {
    token: mintToken("tok"),
    source: "mock",
    last4: panDigits(pan.value).slice(-4),
    brand: brand.value,
    expiry: expiry.value,
  };
}

function tokenizeCvv(): HostedCvvToken | null {
  if (!ready.value) return null;
  return { cvvToken: mintToken("cvv") };
}

// 只暴露这两个 —— 明文没有任何出口。
defineExpose({ tokenize, tokenizeCvv });
</script>
