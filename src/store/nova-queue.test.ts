import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useNova } from "./nova";
import type { NovaFailure } from '@/lib/nova-failure';
import * as secureId from '@/lib/secure-command-id';

beforeEach(() => setActivePinia(createPinia()));
const setup = () => {
  const nova = useNova();
  nova.bindRemoteAccount("a");
  return nova;
};
const add = (nova: ReturnType<typeof useNova>, id: string, text = id) => nova.enqueueRemote(id, text, "zh");

describe('Nova confirmed input rejection recovery', () => {
  function rejected() {
    const nova = setup(); add(nova, 'original', 'Original text'); add(nova, 'next', 'Next question');
    nova.claimRemote(); nova.failRemote('original', 'input-rejected');
    return nova;
  }

  it('edits a rejected head under a fresh turn id, ignores old completions and continues in order', () => {
    const nova = rejected();
    expect(nova.canEditRemote('original')).toBe(true);
    expect(nova.editRemote('original')).toBe(true);
    expect(nova.claimRemote()).toBeUndefined();
    expect(nova.saveRemoteEdit('original', 'Corrected text')).toBe(true);
    const revised = nova.pendingRemote[0];
    expect(revised.turnId).not.toBe('original'); expect(revised.id).toBe(`${revised.turnId}:user`);
    expect(revised.attempted).toBeUndefined(); expect(revised.replyDeadlineAt).toBeUndefined();
    expect(nova.claimRemote()).toMatchObject({ turnId: revised.turnId, text: 'Corrected text', language: 'zh' });
    nova.completeRemote('original', 'Stale answer'); nova.failRemote('original', 'input-rejected');
    expect(nova.pendingRemote[0].delivery).toBe('processing');
    nova.completeRemote(revised.turnId!, 'Corrected answer');
    expect(nova.claimRemote()?.turnId).toBe('next');
    expect(nova.messages.map(row => row.text)).toEqual(['Corrected text', 'Corrected answer', 'Next question']);
  });

  it('removes a definitely rejected head without removing the waiting question', () => {
    const nova = rejected();
    expect(nova.cancelRemote('original')).toBe(true);
    expect(nova.claimRemote()?.turnId).toBe('next');
    expect(nova.messages.map(row => row.text)).toEqual(['Next question']);
  });

  it('cancels edits and hides without retrying; an unchanged save and explicit retry retain the original id', () => {
    const nova = rejected();
    expect(nova.editRemote('original')).toBe(true);
    expect(nova.cancelRemoteEdit('original')).toBe(true);
    expect(nova.pendingRemote[0].delivery).toBe('failed');
    nova.editRemote('original'); nova.interruptRemote();
    expect(nova.pendingRemote[0]).toMatchObject({ delivery: 'failed', failure: 'input-rejected' });
    nova.editRemote('original'); expect(nova.saveRemoteEdit('original', ' Original text ')).toBe(true);
    expect(nova.claimRemote()).toBeUndefined();
    expect(nova.retryRemote('original')).toBe(true);
    expect(nova.claimRemote()).toMatchObject({ turnId: 'original', text: 'Original text' });
    nova.failRemote('original', 'input-rejected');
    expect(nova.canEditRemote('original')).toBe(true);
  });

  it.each<NovaFailure>(['failed', 'timeout', 'network', 'busy', 'unavailable', 'auth', 'interrupted'])(
    'never unlocks a head after %s even if a later replay receives the input rejection', previous => {
      const nova = setup(); add(nova, 'original'); add(nova, 'next'); nova.claimRemote();
      nova.failRemote('original', previous);
      expect(nova.canEditRemote('original')).toBe(false);
      expect(nova.editRemote('original')).toBe(false); expect(nova.cancelRemote('original')).toBe(false);
      nova.retryRemote('original'); nova.claimRemote(); nova.failRemote('original', 'input-rejected');
      expect(nova.canEditRemote('original')).toBe(false);
      expect(nova.editRemote('original')).toBe(false); expect(nova.cancelRemote('original')).toBe(false);
      expect(nova.saveRemoteEdit('original', 'Changed')).toBe(false);
      expect(nova.pendingRemote.map(row => row.turnId)).toEqual(['original', 'next']);
      nova.retryRemote('original'); expect(nova.claimRemote()).toMatchObject({ turnId: 'original', text: 'original' });
    },
  );

  it('retains uncertainty through tracking and later validation before replay', () => {
    const nova = setup(); add(nova, 'original'); nova.claimRemote(); nova.trackRemote('original');
    expect(nova.editRemote('original')).toBe(false); expect(nova.cancelRemote('original')).toBe(false);
    nova.claimRemote(); nova.failRemote('original', 'input-rejected');
    expect(nova.canEditRemote('original')).toBe(false);
    expect(nova.cancelRemote('original')).toBe(false);
  });

  it('invalidates rejection and edit actions across account boundaries', () => {
    const nova = rejected(); nova.editRemote('original'); nova.bindRemoteAccount('other');
    add(nova, 'other-turn'); nova.claimRemote();
    nova.failRemote('original', 'input-rejected');
    expect(nova.saveRemoteEdit('original', 'Old private edit')).toBe(false);
    expect(nova.cancelRemote('original')).toBe(false);
    expect(nova.pendingRemote[0]).toMatchObject({ turnId: 'other-turn', delivery: 'processing' });
    expect(nova.messages.map(row => row.text)).toEqual(['other-turn']);
  });

  it.each(['unavailable', 'duplicate'])('keeps the original rejected edit when a fresh UUID is %s', reason => {
    const nova = rejected(); nova.editRemote('original');
    const generate = vi.spyOn(secureId, 'requireCryptoUuid').mockImplementation(() => {
      if (reason === 'unavailable') throw new Error('CRYPTO_RANDOM_UUID_UNAVAILABLE');
      return 'original';
    });
    try {
      expect(nova.saveRemoteEdit('original', 'Corrected text')).toBe(false);
      expect(nova.pendingRemote[0]).toMatchObject({ turnId: 'original', text: 'Original text', delivery: 'editing', failure: 'input-rejected' });
      expect(nova.claimRemote()).toBeUndefined();
    } finally { generate.mockRestore(); }
  });
});

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
    expect(nova.pendingRemote[0].turnId).not.toBe('b');
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
