// Nova reply + push templates — focused port of
// Nexion-prototype/lib/mock/nova-templates.ts (design doc §6.8).
//
// NOT LLM-generated. Each function takes an app-state snapshot and returns a
// pre-formatted message string. Ported subset: the welcome push + the 4
// quick-prompt replies the drawer offers. ctaHref keeps the prototype's
// logical web path; the drawer maps it to a uni route at tap time.
//
// Copy lives in t.nova.reply, passed in as `t` rather than read from a store —
// same convention as mock/conversations.ts and mock/card-notifications.ts.
// Callers read t.value inside the reply callback so a locale switch applies to
// the next push; already-sent messages keep the language they were sent in,
// which is what a real chat log does.
//
// Workload names come from t.market.workloads via workloadLabel(), so Nova
// names a pool exactly as the market board and task center do. Model, client
// and device names are proper nouns and stay untranslated.

import type { NovaMessage } from "@/store/nova";
import type { Device } from "@/store/types";
import type { Messages } from "@/i18n/messages/en";
import { fmt } from "@/i18n/format";
import { workloadLabel } from "@/lib/workload-label";
import { isDeviceOnline } from "@/lib/hashpower";
import { getLockedTeasers } from "./tasks";

export type QuickPromptKey =
  | "explain-today"
  | "how-to-boost"
  | "whats-hot"
  | "show-top-jobs";

type PushBody = Omit<NovaMessage, "id" | "ts" | "sender">;

// ───── Reply builders (user quick-prompt → Nova reply) ─────

export function replyToQuickPrompt(
  t: Messages,
  key: QuickPromptKey,
  ctx: { earningsToday: number; devices: Device[]; onlineCount: number },
): PushBody {
  const r = t.nova.reply;
  switch (key) {
    case "explain-today": {
      const top = topDevice(ctx.devices);
      const topLine = top
        ? fmt(r.todayTop, {
            name: top.name,
            gpu: top.gpu,
            amount: top.todayEarnings.toFixed(2),
          })
        : r.todayNoDevice;
      const devices =
        ctx.onlineCount === 1
          ? r.deviceOne
          : fmt(r.deviceMany, { n: ctx.onlineCount });
      return {
        kind: "nova-reply",
        text: fmt(r.todayBody, {
          amount: ctx.earningsToday.toFixed(2),
          devices,
          topLine,
          poolA: workloadLabel(t, "IG"),
          poolB: workloadLabel(t, "SP"),
          poolC: workloadLabel(t, "LL"),
        }),
      };
    }
    case "how-to-boost": {
      const maxVram = Math.max(0, ...ctx.devices.map((d) => d.vramTotal));
      const teaser = getLockedTeasers(maxVram, 1)[0];
      if (teaser) {
        return {
          kind: "nova-reply",
          text: fmt(r.boostLocked, {
            pool: workloadLabel(t, "LL"),
            vram: maxVram,
            tier: teaser.unlockTier,
            model: teaser.model,
            type: workloadLabel(t, teaser.category),
            reward: teaser.rewardHint,
          }),
          ctaLabel: r.ctaBrowseStore,
          ctaHref: "/store",
        };
      }
      return {
        kind: "nova-reply",
        text: r.boostMaxed,
        ctaLabel: r.ctaOpenTeam,
        ctaHref: "/team",
      };
    }
    case "whats-hot": {
      const events = [
        fmt(r.hotLlm, { pool: workloadLabel(t, "LL") }),
        fmt(r.hotVideo, { pool: workloadLabel(t, "VG") }),
        fmt(r.hotFineTune, { pool: workloadLabel(t, "FT") }),
      ];
      return {
        kind: "nova-reply",
        text: events[Math.floor(Math.random() * events.length)],
        ctaLabel: r.ctaOpenMarket,
        ctaHref: "/earn",
      };
    }
    case "show-top-jobs": {
      const maxVram = Math.max(0, ...ctx.devices.map((d) => d.vramTotal));
      const lockedTop = getLockedTeasers(maxVram, 3);
      if (lockedTop.length === 0) {
        return { kind: "nova-reply", text: r.topJobsOpen };
      }
      const lines = lockedTop
        .map((teaser) =>
          fmt(r.topJobsLockedLine, {
            model: teaser.model,
            type: workloadLabel(t, teaser.category),
            reward: teaser.rewardHint,
            tier: teaser.unlockTier,
          }),
        )
        .join("\n");
      return {
        kind: "nova-reply",
        text: fmt(r.topJobsLocked, { vram: maxVram, lines }),
        ctaLabel: r.ctaBrowseStore,
        ctaHref: "/store",
      };
    }
  }
}

function topDevice(devices: Device[]): Device | undefined {
  const now = Date.now();
  const online = devices.filter((d) => d.activatedAt !== null && isDeviceOnline(d, now));
  if (online.length === 0) return undefined;
  return online.reduce((best, d) => (d.todayEarnings > best.todayEarnings ? d : best));
}

// ───── Auto-push template (proactive welcome) ─────

export function welcomeMessage(t: Messages): PushBody {
  return {
    kind: "welcome",
    text: t.nova.reply.welcome,
    ctaLabel: t.nova.reply.ctaBrowseStore,
    ctaHref: "/store",
  };
}
