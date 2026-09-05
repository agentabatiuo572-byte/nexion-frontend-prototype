<!--
  HostedCardField — 单个托管卡字段的输入框。必须放在 <HostedCardVault> 内。

  只渲染 <input> 本身,外框 / 标签 / 布局全归调用方 —— 与真实收单方 SDK 一致
  (SDK 只在你给的容器里挂 iframe,周围的壳是你自己的)。自身不持状态:值读写
  都过 vault,所以明文不会在本组件外留下副本。

  PROD 切换:本文件换成 SDK element 的挂载点(`elements.create('cardNumber')`
  → mount 到此处),调用方模板不动。
-->
<template>
  <input
    :style="inputStyle"
    type="text"
    inputmode="numeric"
    :placeholder="placeholder"
    :placeholder-style="placeholderStyle"
    :value="vault.display(kind)"
    :aria-label="ariaLabel"
    :autocomplete="AUTOCOMPLETE[kind]"
    confirm-type="done"
    cursor-spacing="28"
    @input="onInput"
    @focus="emit('focus')"
    @blur="emit('blur')"
  />
</template>

<script setup lang="ts">
import { inject, type StyleValue } from "vue";
import { HOSTED_CARD_VAULT, type HostedCardKind } from "./hosted-card-vault-key";

const props = defineProps<{
  kind: HostedCardKind;
  /** 调用方原样传自己的 input 样式 —— 视觉零变化靠这个,不在组件内复刻。
   *  用 StyleValue 而非 CSSProperties:调用方有传 [base, override] 数组的写法。 */
  inputStyle?: StyleValue;
  placeholder?: string;
  placeholderStyle?: string;
  ariaLabel?: string;
}>();

const emit = defineEmits<{ focus: []; blur: [] }>();

/** 卡字段的自动填充提示(真实收单方表单同样声明)。 */
const AUTOCOMPLETE: Record<HostedCardKind, string> = {
  pan: "cc-number",
  expiry: "cc-exp",
  cvv: "cc-csc",
};

const injected = inject(HOSTED_CARD_VAULT);
// 抛出串取英文错误码,与本仓既有码风一致(NOTIFICATION_UNAVAILABLE / SESSION_EXPIRED …):
// 抛出串是工程内部话,不该长得像用户文案,也不该落进「注释外中文」的判定面。
// 约束本身:必须放在 <HostedCardVault> 内。
if (!injected) throw new Error("HOSTED_CARD_FIELD_REQUIRES_VAULT");
// 收窄后再给模板用:模板作用域拿不到 if 里的类型收窄。
const vault = injected;

function onInput(e: Event) {
  vault.write(props.kind, (e as unknown as { detail: { value: string } }).detail.value);
}
</script>
