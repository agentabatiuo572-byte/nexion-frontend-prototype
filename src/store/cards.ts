import { defineStore } from "pinia";
import { ref } from "vue";
import { normalizeAccountKey } from "./account-cloud";
import { readAccountRow, writeAccountRow } from "./account-scoped-storage";
import { paymentMethodApi, remoteApiEnabled } from "@/api/runtime";

// Ported from Nexion-prototype/lib/store/cards.ts (zustand → Pinia).
// Bank/credit card binding — saved-cards repository for the Card payment
// method in checkout. User binds a card once (via /me/wallet/cards/new), then
// reuses it across orders with just a CVV re-entry. The full PAN is NEVER
// stored — only last4 + brand + expiry + holder name, matching how PSPs
// (Stripe, Adyen) tokenize cards.
// MOCK-ONLY: real PSP returns a token id; here we generate a uuid as `tokenId`.
// 卡组织判定/标签是零依赖纯逻辑,住 cards-core.ts(node 自检脚本要直跑);
// 存量调用方仍按 `from "@/store/cards"` 引用,此处原样透出。
import { detectBrand, brandLabel, type CardBrand } from "./cards-core";
export { detectBrand, brandLabel };
export type { CardBrand };

export interface SavedCard {
  /** Mock PSP token id — never the real PAN */
  tokenId: string;
  brand: CardBrand;
  /** Last 4 of PAN — for masked display `•••• 1234` */
  last4: string;
  /** "MM/YY" */
  expiry: string;
  /** Cardholder uppercase */
  holder: string;
  /** epoch ms of binding */
  boundAt: number;
  /** Server lifecycle state. Present only in the remote projection. */
  status?: "BOUND";
  /** Optimistic-concurrency version supplied by the server. */
  version?: number;
}

// 旧设备级单键 "nexgrid-cards-v1" 废弃(存量无账号归属,mock 可重建);绑卡按账号分行。
const ACCOUNTS_KEY = "nexgrid-cards-accounts-v1"; // { [accountKey]: PersistShape }

function uuid(): string {
  if (typeof crypto !== "undefined" && (crypto as Crypto).randomUUID) {
    return (crypto as Crypto).randomUUID();
  }
  return `card_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

interface PersistShape {
  cards: SavedCard[];
  defaultTokenId: string | null;
}

function hydrate(accountKey: string): PersistShape {
  const row = readAccountRow<Partial<PersistShape>>(ACCOUNTS_KEY, accountKey);
  if (row && Array.isArray(row.cards)) {
    return { cards: row.cards, defaultTokenId: row.defaultTokenId ?? null };
  }
  return { cards: [], defaultTokenId: null };
}

export const useCards = defineStore("cards", () => {
  // 账号维度。boot 期落 "default";账号确定后由 lib/account-scope 统一重绑(P-031 store 不互 import)。
  let boundKey = "default";
  const init = remoteApiEnabled ? { cards: [], defaultTokenId: null } : hydrate(boundKey);
  const cards = ref<SavedCard[]>(init.cards);
  const defaultTokenId = ref<string | null>(init.defaultTokenId);

  function persist() {
    if (remoteApiEnabled) return;
    writeAccountRow<PersistShape>(ACCOUNTS_KEY, boundKey, { cards: cards.value, defaultTokenId: defaultTokenId.value });
  }

  function clearRemoteFacts() { cards.value = []; defaultTokenId.value = null; }
  async function refreshRemote(): Promise<boolean> {
    if (!remoteApiEnabled) return true;
    try {
      const remote = await paymentMethodApi.list();
      const nextCards = remote.map((card) => ({ tokenId: card.tokenId, brand: card.brand, last4: card.last4, expiry: "--/--", holder: card.holder, boundAt: Date.parse(card.boundAt), status: card.status, version: card.version }));
      const nextDefaultTokenId = remote.find((card) => card.isDefault)?.tokenId ?? null;
      cards.value = nextCards;
      defaultTokenId.value = nextDefaultTokenId;
      return true;
    } catch { return false; }
  }

  /** 账号切换重绑:装载该账号绑定的银行卡(P2-8 设备级泄漏修复;绑卡=金融凭证,必按账号)。 */
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    if (remoteApiEnabled) { clearRemoteFacts(); void refreshRemote(); return; }
    const next = hydrate(boundKey);
    cards.value = next.cards;
    defaultTokenId.value = next.defaultTokenId;
  }

  /** tokenId 由收单方 tokenize 产出(见 hosted-card-vault),调用方传入;
   *  未传时退回本地 uuid —— PROD 只留前者,后者随 mock 一起删。 */
  function add(
    input: Omit<SavedCard, "tokenId" | "boundAt"> & { tokenId?: string },
    opts: { makeDefault?: boolean } = {},
  ): string {
    if (remoteApiEnabled) return "";
    const tokenId = input.tokenId ?? uuid();
    const card: SavedCard = { ...input, tokenId, boundAt: Date.now() };
    // 同 token 去重:真实收单方对**同一张卡**返回同一个 token,同卡再绑一次不该落两行
    // (会一个列表两条、remove 一次删俩、find 只命中头一条)。语义 = 重绑即更新展示字段。
    const dup = cards.value.findIndex((c) => c.tokenId === tokenId);
    cards.value =
      dup >= 0
        ? cards.value.map((c, i) => (i === dup ? card : c))
        : [...cards.value, card];
    // First card auto-defaults unless the binding form explicitly opts out.
    if (opts.makeDefault === true || (defaultTokenId.value === null && opts.makeDefault !== false)) {
      defaultTokenId.value = tokenId;
    }
    persist();
    return tokenId;
  }

  async function remove(tokenId: string): Promise<void> {
    if (remoteApiEnabled) {
      const card = cards.value.find((item) => item.tokenId === tokenId);
      if (!card || card.version === undefined) throw new Error("PAYMENT_METHOD_VERSION_REQUIRED");
      await paymentMethodApi.unbind({ tokenId, expectedVersion: card.version, idempotencyKey: `app-card-unbind-${tokenId}-${card.version}` });
      if (!(await refreshRemote())) throw new Error("PAYMENT_METHOD_READBACK_FAILED");
      return;
    }
    const next = cards.value.filter((c) => c.tokenId !== tokenId);
    if (defaultTokenId.value === tokenId) {
      defaultTokenId.value = next[0]?.tokenId ?? null;
    }
    cards.value = next;
    persist();
  }

  async function setDefault(tokenId: string): Promise<void> {
    if (remoteApiEnabled) {
      const card = cards.value.find((item) => item.tokenId === tokenId);
      if (!card || card.version === undefined) throw new Error("PAYMENT_METHOD_VERSION_REQUIRED");
      await paymentMethodApi.setDefault({ tokenId, expectedVersion: card.version, idempotencyKey: `app-card-default-${tokenId}-${card.version}` });
      if (!(await refreshRemote())) throw new Error("PAYMENT_METHOD_READBACK_FAILED");
      return;
    }
    if (cards.value.some((c) => c.tokenId === tokenId)) {
      defaultTokenId.value = tokenId;
      persist();
    }
  }

  function getCard(tokenId: string): SavedCard | null {
    return cards.value.find((c) => c.tokenId === tokenId) ?? null;
  }

  if (remoteApiEnabled) void refreshRemote();
  return { cards, defaultTokenId, add, remove, setDefault, getCard, bindAccount, refreshRemote };
});
