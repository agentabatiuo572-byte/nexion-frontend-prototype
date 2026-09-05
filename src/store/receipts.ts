import { defineStore } from "pinia";
import { ref } from "vue";
import type { Receipt, ReceiptCategory } from "@/mock/receipt";
import { normalizeAccountKey } from "./account-cloud";
import { readAccountRow, writeAccountRow } from "./account-scoped-storage";

// Ported from Nexion-prototype/lib/store/receipts.ts (zustand → Pinia).
// Proof-of-Compute receipts (design doc §6.9), newest-first, capped + persisted.
const MAX_RECEIPTS = 200;
// 旧设备级单键 "nexgrid-receipts-v1" 废弃(存量无账号归属,mock 可重建);算力凭证按账号分行。
const ACCOUNTS_KEY = "nexgrid-receipts-accounts-v1"; // { [accountKey]: { receipts: Receipt[] } }

function hydrate(accountKey: string): Receipt[] {
  const row = readAccountRow<{ receipts?: Receipt[] }>(ACCOUNTS_KEY, accountKey);
  if (row && Array.isArray(row.receipts) && row.receipts.length) return row.receipts;
  return [];
}

export const useReceipts = defineStore("receipts", () => {
  // 账号维度:boot 期落 "default",账号确定后由 lib/account-scope 统一重绑。
  let boundKey = "default";
  const receipts = ref<Receipt[]>(hydrate(boundKey));

  function persist() {
    writeAccountRow<{ receipts: Receipt[] }>(ACCOUNTS_KEY, boundKey, { receipts: receipts.value });
  }

  /** 账号切换重绑:装载该账号的算力凭证(P2-8 设备级泄漏修复)。 */
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    receipts.value = hydrate(boundKey);
  }
  function add(receipt: Receipt) {
    receipts.value = [receipt, ...receipts.value].slice(0, MAX_RECEIPTS);
    persist();
  }
  function byId(id: string): Receipt | undefined {
    return receipts.value.find((r) => r.id === id);
  }
  function clear() {
    receipts.value = [];
    persist();
  }

  return { receipts, add, byId, clear, bindAccount };
});

// Convenience selector for the Me → Receipts page tabs.
export function filterByCategory(receipts: Receipt[], category: ReceiptCategory | "ALL"): Receipt[] {
  if (category === "ALL") return receipts;
  return receipts.filter((r) => r.category === category);
}
