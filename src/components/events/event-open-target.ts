import type { NexEvent } from "@/mock/events";

export type EventOpenTarget =
  | { type: "route"; href: string }
  | { type: "local" };

export function eventOpenTarget(event: Pick<NexEvent, "kind" | "href" | "trackable" | "runtimeSource">): EventOpenTarget | null {
  if (event.href) return { type: "route", href: event.href };
  const localWheel = event.kind === "wheel";
  const localMockDiscount = event.kind === "discount" && event.runtimeSource === "mock";
  if (event.trackable !== true && (localWheel || localMockDiscount)) {
    return { type: "local" };
  }
  return null;
}

type JoinedProgressActionEvent = Pick<NexEvent, "kind" | "href" | "trackable" | "runtimeSource" | "joined"> & {
  _trackable: boolean;
  _done: boolean;
};

export function shouldShowJoinedProgressAction(event: JoinedProgressActionEvent): boolean {
  return event._trackable && event.joined && !event._done && eventOpenTarget(event) !== null;
}

type DecorativeActionEvent = Pick<
  NexEvent,
  "kind" | "href" | "trackable" | "runtimeSource" | "status" | "ctaLabel"
> & {
  _trackable: boolean;
  _claimed: boolean;
};

export function shouldShowDecorativeAction(event: DecorativeActionEvent): boolean {
  return !event._trackable
    && !event._claimed
    && event.status === "ongoing"
    && Boolean(event.ctaLabel)
    && eventOpenTarget(event) !== null;
}
