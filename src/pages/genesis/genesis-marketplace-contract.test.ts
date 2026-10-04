import { describe, expect, it } from "vitest";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";

const marketplace = (import.meta.glob("./marketplace.vue", {
  query: "?raw", import: "default", eager: true,
})["./marketplace.vue"] ?? "") as string;
const genesis = (import.meta.glob("./genesis.vue", {
  query: "?raw", import: "default", eager: true,
})["./genesis.vue"] ?? "") as string;
const tokenCard = (import.meta.glob("../../components/genesis/my-token-card.vue", {
  query: "?raw", import: "default", eager: true,
})["../../components/genesis/my-token-card.vue"] ?? "") as string;

describe("Genesis internal-market contract", () => {
  it("does not expose the removed fake external-market path", () => {
    expect(marketplace).not.toContain("OpenSeaModal");
    expect(marketplace).not.toContain("openSeaOpen");
    expect(marketplace).not.toContain("viewOpenSea");
  });

  it("uses the current remote royalty for each displayed royalty explanation", () => {
    expect(marketplace).toContain("genesis.remoteRoyaltyPct");
    expect(genesis).toContain("genesis.remoteRoyaltyPct");
    expect(tokenCard).toContain("genesis.remoteRoyaltyPct");
  });

  it("renders a specific neutral, up, down, or flat floor state", () => {
    expect(marketplace).toContain("floorDelta.state === 'unavailable'");
    expect(marketplace).toContain("floorDelta.state === 'up'");
    expect(marketplace).toContain("floorDelta.state === 'down'");
    expect(marketplace).toContain("floorDelta.state === 'flat'");
  });

  it.each([zh, en, vi])("keeps its internal-market and royalty copy tied to the same contract", (messages) => {
    expect(messages.marketplace.internalMarketLine).not.toMatch(/OpenSea|ERC-721|Ethereum/i);
    expect(messages.marketplace.royaltyFooter).toContain("{royalty}");
    expect(messages.marketplace.confirmListMsg).toContain("{royalty}");
    expect(messages.genesis.faq.a2).toContain("{royalty}");
  });

  it.each([zh, en, vi])("supplies public labels for each server transaction kind and its quantity", (messages) => {
    expect(messages.marketplace.activityPrimary).toBeTruthy();
    expect(messages.marketplace.activitySecondary).toBeTruthy();
    expect(messages.marketplace.activityNodeOne).toContain("{n}");
    expect(messages.marketplace.activityNodeMany).toContain("{n}");
  });

  it("does not concatenate internal transaction enums into the activity description", () => {
    expect(marketplace).toContain("presentGenesisMarketplaceActivityDescription");
    expect(marketplace).not.toContain("`${tx.orderType} · ${tx.quantity} node");
  });
});
