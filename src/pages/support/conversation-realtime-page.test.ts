import { describe, expect, it } from "vitest";
import {
  createHumanConversationCreationRecovery,
  createHumanThreadRealtimeLifecycle,
  humanConversationPresence,
} from "./conversation-realtime-page";

describe("human conversation realtime page contract", () => {
  it("does not let a hidden or replaced conversation revive its realtime watch", () => {
    let id = "CV-1";
    let ai = false;
    const calls: Array<["typing" | "watch", boolean | string | null]> = [];
    const lifecycle = createHumanThreadRealtimeLifecycle({
      currentId: () => id,
      isAi: () => ai,
      setTyping: active => calls.push(["typing", active]),
      watch: target => calls.push(["watch", target]),
    });

    const firstEpoch = lifecycle.show();
    lifecycle.watchIfCurrent(firstEpoch, "CV-1");
    const oldHistoryScope = lifecycle.capture("CV-1");
    lifecycle.stop();
    lifecycle.watchIfCurrent(firstEpoch, "CV-1");
    const secondEpoch = lifecycle.show();
    expect(lifecycle.isCurrent(oldHistoryScope!.epoch, oldHistoryScope!.id)).toBe(false);
    id = "CV-2";
    lifecycle.watchIfCurrent(secondEpoch, "CV-1");
    ai = true;
    lifecycle.watchIfCurrent(secondEpoch, "CV-2");

    expect(calls).toEqual([["watch", "CV-1"], ["typing", false], ["watch", null]]);
  });

  it("stops typing before unwatch and derives online and muted-dot states from the active mode", () => {
    const calls: string[] = [];
    const lifecycle = createHumanThreadRealtimeLifecycle({ currentId: () => "CV-1", isAi: () => false, setTyping: () => calls.push("typing"), watch: () => calls.push("watch") });
    lifecycle.show();
    lifecycle.stop();
    expect(calls).toEqual(["typing", "watch"]);
    expect(humanConversationPresence({ remote: true, isAi: false, ready: true, conversationId: "CV-1", online: true, closed: false })).toEqual({ showOnline: true, mutedDot: false });
    expect(humanConversationPresence({ remote: true, isAi: false, ready: true, conversationId: "CV-1", online: false, closed: false })).toEqual({ showOnline: false, mutedDot: true });
    expect(humanConversationPresence({ remote: true, isAi: true, ready: true, conversationId: "CV-1", online: true, closed: false })).toEqual({ showOnline: false, mutedDot: false });
    expect(humanConversationPresence({ remote: true, isAi: true, ready: true, conversationId: "CV-1", online: false, closed: false })).toEqual({ showOnline: false, mutedDot: false });
    expect(humanConversationPresence({ remote: true, isAi: false, ready: false, conversationId: "CV-1", online: true, closed: false })).toEqual({ showOnline: false, mutedDot: true });
    expect(humanConversationPresence({ remote: false, isAi: false, ready: false, conversationId: "CV-1", online: false, closed: false })).toEqual({ showOnline: false, mutedDot: false });
    expect(humanConversationPresence({ remote: true, isAi: false, ready: true, conversationId: "CV-1", online: true, closed: true })).toEqual({ showOnline: false, mutedDot: true });
  });

  it("activates a newly-created human thread only while its page is current", () => {
    let id = "";
    let ai = false;
    const calls: Array<["typing" | "watch", boolean | string | null]> = [];
    const lifecycle = createHumanThreadRealtimeLifecycle({
      currentId: () => id,
      isAi: () => ai,
      setTyping: active => calls.push(["typing", active]),
      watch: target => calls.push(["watch", target]),
    });

    lifecycle.show();
    id = "CV-created";
    expect(lifecycle.activateIfCurrent(id)).toBe(true);

    lifecycle.stop();
    expect(lifecycle.activateIfCurrent(id)).toBe(false);

    lifecycle.show();
    ai = true;
    expect(lifecycle.activateIfCurrent(id)).toBe(false);
    expect(calls).toEqual([["watch", "CV-created"], ["typing", false], ["watch", null]]);
  });

  it("serializes creation and restores a completed thread only for its visible account scope", () => {
    let visible = true;
    let account = "user:1";
    let binding = 1;
    let id = "";
    let type: "advisor" | "support" | null = "advisor";
    const restored: string[] = [];
    const recovery = createHumanConversationCreationRecovery({
      visible: () => visible,
      account: () => account,
      binding: () => binding,
      currentId: () => id,
      startType: () => type,
      restore: createdId => { id = createdId; type = null; restored.push(createdId); },
    });

    const first = recovery.begin("advisor");
    expect(first).not.toBeNull();
    expect(recovery.begin("advisor")).toBeNull();
    expect(recovery.isCurrent(first!)).toBe(true);
    recovery.complete("CV-visible", first!);
    expect(recovery.restore()).toBe("CV-visible");
    recovery.finish();

    id = "";
    type = "support";
    const hidden = recovery.begin("support")!;
    recovery.complete("CV-hidden", hidden);
    visible = false;
    expect(recovery.restore()).toBeNull();
    expect(id).toBe("");
    visible = true;
    expect(recovery.restore()).toBe("CV-hidden");
    recovery.finish();

    id = "";
    type = "advisor";
    const stale = recovery.begin("advisor")!;
    recovery.complete("CV-stale", stale);
    account = "user:2";
    expect(recovery.restore()).toBeNull();
    recovery.finish();

    const sameAccount = recovery.begin("advisor")!;
    visible = false;
    recovery.complete("CV-old-binding", sameAccount);
    binding += 1;
    visible = true;
    expect(recovery.isCurrent(sameAccount)).toBe(false);
    expect(recovery.restore()).toBeNull();
    expect(restored).toEqual(["CV-visible", "CV-hidden"]);
  });
});
