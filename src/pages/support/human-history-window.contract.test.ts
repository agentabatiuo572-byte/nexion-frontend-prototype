import { describe, expect, it } from "vitest";
import chatSource from "./chat.vue?raw";
import ticketsSource from "../me/support-tickets.vue?raw";

describe("human support history window disclosure", () => {
  it("discloses a truncated advisor or support conversation", () => {
    expect(chatSource).toContain('conv?.historyTruncated');
    expect(chatSource).toContain('t.conversations.historyTruncated');
  });

  it("discloses a truncated ticket timeline", () => {
    expect(ticketsSource).toContain('detailTicket.historyTruncated');
    expect(ticketsSource).toContain('t.tickets.historyTruncated');
  });
});
