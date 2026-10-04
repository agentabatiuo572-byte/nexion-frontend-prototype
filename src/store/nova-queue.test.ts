import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useNova } from "./nova";

beforeEach(() => setActivePinia(createPinia()));
const setup = () => {
  const nova = useNova();
  nova.bindRemoteAccount("a");
  return nova;
};
const add = (nova: ReturnType<typeof useNova>, id: string, text = id) => nova.enqueueRemote(id, text, "zh");

describe("Nova serial pending turns", () => {
  it("allows one active and three waiting turns, rejecting overflow without adding a bubble", () => {
    const nova = setup();
    expect(add(nova, "a")).toBe(true);
    expect(nova.claimRemote()?.turnId).toBe("a");
    for (const id of ["b", "c", "d"]) expect(add(nova, id)).toBe(true);
    expect(add(nova, "e")).toBe(false);
    expect(nova.pendingRemote).toHaveLength(4);
    expect(nova.claimRemote()).toBeUndefined();
  });

  it("anchors each answer to its question and starts the next only after completion", () => {
    const nova = setup();
    add(nova, "a"); add(nova, "b");
    nova.claimRemote();
    nova.completeRemote("a", "answer-a");
    expect(nova.messages.map(m => m.text)).toEqual(["a", "answer-a", "b"]);
    expect(nova.claimRemote()?.turnId).toBe("b");
    nova.completeRemote("b", "answer-b");
    expect(nova.messages.map(m => m.text)).toEqual(["a", "answer-a", "b", "answer-b"]);
    expect(nova.pendingRemote).toEqual([]);
  });

  it("pauses following turns after a failure and retries the same turn without duplicate messages", () => {
    const nova = setup();
    add(nova, "a"); add(nova, "b"); nova.claimRemote();
    nova.failRemote("a", "timeout");
    expect(nova.claimRemote()).toBeUndefined();
    expect(nova.retryRemote("b")).toBe(false);
    expect(nova.retryRemote("a")).toBe(true);
    expect(nova.editRemote("a")).toBe(false);
    expect(nova.cancelRemote("a")).toBe(false);
    expect(nova.claimRemote()).toMatchObject({ turnId: "a", text: "a", language: "zh" });
    nova.completeRemote("a", "answer");
    nova.completeRemote("a", "duplicate answer");
    expect(nova.messages).toHaveLength(3);
  });

  it("tracks an ambiguously timed-out turn with the same id instead of exposing a retry", () => {
    const nova = setup();
    add(nova, "a"); add(nova, "b");
    expect(nova.claimRemote()).toMatchObject({ turnId: "a", tracking: false });

    expect(nova.trackRemote("a")).toBe(true);
    expect(nova.pendingRemote[0]).toMatchObject({ delivery: "tracking", serverPending: true });
    expect(nova.retryRemote("a")).toBe(false);
    expect(nova.claimRemote()).toMatchObject({ turnId: "a", tracking: true });

    nova.completeRemote("a", "one authoritative answer");
    nova.completeRemote("a", "duplicate answer");
    expect(nova.messages.map(message => message.text)).toEqual(["a", "one authoritative answer", "b"]);
    expect(nova.claimRemote()).toMatchObject({ turnId: "b", tracking: false });
  });

  it("reserves an editing turn until saved and allows cancelling only unsent turns", () => {
    const nova = setup();
    add(nova, "a"); add(nova, "b"); nova.claimRemote();
    expect(nova.editRemote("a")).toBe(false);
    expect(nova.cancelRemote("a")).toBe(false);
    expect(nova.editRemote("b")).toBe(true);
    nova.completeRemote("a", "answer");
    expect(nova.claimRemote()).toBeUndefined();
    expect(nova.saveRemoteEdit("b", "  changed  ")).toBe(true);
    expect(nova.claimRemote()?.text).toBe("changed");
    add(nova, "c");
    expect(nova.cancelRemote("c")).toBe(true);
    expect(nova.messages.some(m => m.text === "c")).toBe(false);
  });

  it("keeps interrupted requests under server authority and does not hydrate over pending questions", () => {
    const nova = setup();
    const conversationId = nova.conversationId;
    add(nova, "a"); add(nova, "b"); nova.claimRemote();
    nova.interruptRemote();
    nova.hydrateRemote("a", "other-conversation", []);
    expect(nova.conversationId).toBe(conversationId);
    expect(nova.pendingRemote[0]).toMatchObject({ delivery: "tracking", serverPending: true });
    nova.completeRemote("a", "late answer");
    expect(nova.messages.map(m => m.text)).toEqual(["a", "b"]);
    expect(nova.claimRemote()).toMatchObject({ turnId: "a", tracking: true });
  });

  it("clears pending turns on account change, reset and explicit new conversation", () => {
    const nova = setup();
    add(nova, "a"); nova.claimRemote();
    nova.bindRemoteAccount("b");
    nova.completeRemote("a", "wrong account");
    expect(nova.messages).toEqual([]);
    add(nova, "b"); nova.startNewConversation();
    expect(nova.pendingRemote).toEqual([]);
    add(nova, "c"); nova.reset();
    expect(nova.pendingRemote).toEqual([]);
  });

  it("rejects duplicate IDs and invalid input before admission or edit", () => {
    const nova = setup();
    expect(add(nova, "a", " ")).toBe(false);
    expect(add(nova, "a", "x".repeat(2001))).toBe(false);
    add(nova, "a");
    expect(add(nova, "a")).toBe(false);
    nova.editRemote("a");
    expect(nova.saveRemoteEdit("a", " ")).toBe(false);
    expect(nova.saveRemoteEdit("a", "x".repeat(2001))).toBe(false);
    expect(nova.cancelRemoteEdit("a")).toBe(true);
    expect(nova.claimRemote()?.text).toBe("a");
  });

  it("does not let stale actions mutate a different or already completed turn", () => {
    const nova = setup();
    for (const action of [nova.retryRemote, nova.editRemote, nova.cancelRemote, nova.cancelRemoteEdit]) {
      expect(action("missing")).toBe(false);
    }
    expect(nova.saveRemoteEdit("missing", "text")).toBe(false);
    nova.failRemote("missing", "network");
    add(nova, "a"); nova.claimRemote(); nova.failRemote("other", "network");
    expect(nova.pendingRemote[0].delivery).toBe("processing");
    nova.completeRemote("a", "answer");
    nova.failRemote("a", "network");
    expect(nova.pendingRemote).toHaveLength(0);
    add(nova, "b"); nova.editRemote("b"); nova.interruptRemote();
    expect(nova.pendingRemote[0].delivery).toBe("queued");
    nova.hydrateRemote("other-account", "other-conversation", []);
    expect(nova.messages).toHaveLength(3);
  });
});
