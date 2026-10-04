import { describe, expect, it } from "vitest";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";

const marketplace = (import.meta.glob("./marketplace.vue", {
  query: "?raw", import: "default", eager: true,
})["./marketplace.vue"] ?? "") as string;
const tokenCard = (import.meta.glob("../../components/genesis/my-token-card.vue", {
  query: "?raw", import: "default", eager: true,
})["../../components/genesis/my-token-card.vue"] ?? "") as string;

describe("Genesis marketplace recovery contract", () => {
  it("keeps unavailable public facts separate from a verified empty market and registers pull refresh", () => {
    expect(marketplace).toContain("genesis.remotePublicReadState");
    expect(marketplace).toContain("retryMarketplaceFacts");
    expect(marketplace).toContain("registerActivePageRefresh");
  });

  it("keeps an unavailable holder projection separate from no holdings", () => {
    expect(marketplace).toContain("genesis.remoteAccountReadState");
    expect(marketplace).toContain("accountUnavailable");
  });

  it("uses a read-only retry path instead of replaying the weekly observation", () => {
    const retry = marketplace.slice(
      marketplace.indexOf("async function retryMarketplaceFacts"),
      marketplace.indexOf("// 页面每次露出重读配置"),
    );
    expect(retry).toContain("await genesis.syncRemote()");
    expect(retry).not.toContain("refreshMarketplaceFacts()");
  });

  it("does not report a market view when the public market projection is unavailable", () => {
    expect(marketplace).toContain('if (!loaded || genesis.remotePublicReadState !== "ready") return;');
  });

  it.each([zh, en, vi])("does not append a currency suffix to an unknown floor", (messages) => {
    expect(messages.marketplace.confirmListMsg).not.toContain("${floor}K");
    expect(messages.marketplace.confirmListMsgRoyaltyUnavailable).not.toContain("${floor}K");
  });

  it("formats the full floor text before inserting it into the listing confirmation", () => {
    expect(tokenCard).toContain("floorConfirmationText");
    expect(tokenCard).toContain("floor: floorConfirmationText.value");
  });

  it.each([zh, en, vi])("has recovery and invalid-price copy in every supported locale", (messages) => {
    expect(messages.marketplace.marketLoading).toBeTruthy();
    expect(messages.marketplace.marketUnavailable).toBeTruthy();
    expect(messages.marketplace.accountUnavailable).toBeTruthy();
    expect(messages.marketplace.listingPriceInvalid).toBeTruthy();
  });
});
