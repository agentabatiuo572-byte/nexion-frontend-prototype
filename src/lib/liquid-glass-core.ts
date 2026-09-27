export type GlassTone = "navigation" | "selection" | "control";

/** Optical dimensions are CSS pixels; text never enters this rendering layer. */
export function glassGeometry(width: number, height: number, radius: number, tone: GlassTone) {
  const w = Math.max(1, Math.min(1024, Math.round(Number.isFinite(width) ? width : 1)));
  const h = Math.max(1, Math.min(160, Math.round(Number.isFinite(height) ? height : 1)));
  const r = Math.max(.5, Math.min(Number.isFinite(radius) ? radius : 24, w / 2, h / 2));
  return {
    width: w, height: h, radius: r,
    bezelWidth: Math.min(r, tone === "navigation" ? 16 : 11),
    glassThickness: tone === "navigation" ? 28 : 18,
    refractiveIndex: 1.5, magnify: false, bezelType: "convex_squircle" as const,
  };
}

let navigationMotion: { from: string; to: string; at: number } | undefined;

export function rememberGlassNavigation(from: string, to: string, now = Date.now()) {
  navigationMotion = from === to ? undefined : { from, to, at: now };
}

/** A transition belongs to one destination, never to a cold open or a later back. */
export function consumeGlassNavigation(to: string, now = Date.now()): string | undefined {
  const motion = navigationMotion;
  if (!motion) return undefined;
  if (now - motion.at > 1800 || now < motion.at) { navigationMotion = undefined; return undefined; }
  if (motion.to !== to) return undefined;
  navigationMotion = undefined;
  return motion.from;
}
