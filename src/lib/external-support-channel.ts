export type ExternalSupportChannel = "telegram" | "discord" | "email";

const TARGETS: Record<ExternalSupportChannel, string> = {
  telegram: "https://t.me/nexgrid_official",
  discord: "https://discord.gg/nexgrid",
  email: "mailto:support@nexgrid.ai",
};

export function supportChannelTarget(channel: string): string | null {
  return Object.prototype.hasOwnProperty.call(TARGETS, channel)
    ? TARGETS[channel as ExternalSupportChannel]
    : null;
}

export function openExternalSupportChannel(
  channel: string,
  deps?: { open?: (target: string) => unknown },
): boolean {
  const target = supportChannelTarget(channel);
  if (!target) return false;
  if (deps?.open) {
    deps.open(target);
    return true;
  }
  const runtime = globalThis as typeof globalThis & {
    plus?: { runtime?: { openURL?: (target: string) => void } };
    window?: Window;
  };
  if (typeof runtime.plus?.runtime?.openURL === "function") {
    runtime.plus.runtime.openURL(target);
    return true;
  }
  if (runtime.window) {
    if (target.startsWith("mailto:")) runtime.window.location.href = target;
    else runtime.window.open(target, "_blank", "noopener,noreferrer");
    return true;
  }
  return false;
}
