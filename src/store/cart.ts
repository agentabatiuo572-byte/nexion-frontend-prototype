/**
 * Bundle cart — ported from Nexion-prototype/lib/store/cart.ts
 * (zustand persist → Pinia + uni storage).
 *
 * Lets the user add multiple Store products into a single bundle for tiered
 * discounts:
 *   2 items  → 5% off total
 *   3 items  → 8% off total
 *   4+ items → 12% off total
 *
 * Cart is persisted (uni storage) so users can compose bundles across sessions.
 * Backend-replaceable: items[] is a plain serializable string[] of product ids.
 */

import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { normalizeAccountKey } from "./account-cloud";
import { readAccountRow, writeAccountRow } from "./account-scoped-storage";

export interface BundleDiscountTier {
  minItems: number;
  pct: number;
}

export const BUNDLE_DISCOUNT_TIERS: ReadonlyArray<BundleDiscountTier> = [
  { minItems: 4, pct: 0.12 },
  { minItems: 3, pct: 0.08 },
  { minItems: 2, pct: 0.05 },
];

export function bundleDiscountForCount(count: number): number {
  for (const tier of BUNDLE_DISCOUNT_TIERS) {
    if (count >= tier.minItems) return tier.pct;
  }
  return 0;
}

// 旧设备级单键 "nexgrid-cart-v1" 废弃(存量无账号归属,mock 可重建);购物车按账号分行。
const ACCOUNTS_KEY = "nexgrid-cart-accounts-v1"; // { [accountKey]: { items: string[] } }

function hydrate(accountKey: string): string[] {
  const row = readAccountRow<{ items?: string[] }>(ACCOUNTS_KEY, accountKey);
  if (row && Array.isArray(row.items)) return row.items;
  return [];
}

export const useCart = defineStore("cart", () => {
  // 账号维度:boot 期落 "default",账号确定后由 lib/account-scope 统一重绑。
  let boundKey = "default";
  const items = ref<string[]>(hydrate(boundKey));

  function persist() {
    writeAccountRow<{ items: string[] }>(ACCOUNTS_KEY, boundKey, { items: items.value });
  }
  watch(items, persist, { deep: true });

  /** 账号切换重绑:装载该账号的购物车。boundKey 先行,赋值触发 watch 幂等写回本账号行。 */
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    items.value = hydrate(boundKey);
  }

  function add(id: string) {
    if (!items.value.includes(id)) items.value = [...items.value, id];
  }
  function remove(id: string) {
    items.value = items.value.filter((x) => x !== id);
  }
  function clear() {
    items.value = [];
  }
  function has(id: string): boolean {
    return items.value.includes(id);
  }

  return { items, add, remove, clear, has, bindAccount };
});
