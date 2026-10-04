/**
 * Course duration arrives from the learning API as the backend-synthesized
 * English string "<n> min" (MybatisI18nLearningRepository.toCourseView appends
 * the literal unit). The number is the authoritative runtime value; the unit is
 * locale-owned copy, so the display layer reformats it through
 * `learning.durationMinutes` instead of printing the server's English unit.
 *
 * A value with no readable minutes degrades to the neutral em-dash the rest of
 * the App uses for an unknown quantity, never to the raw server string.
 */
const DURATION_PATTERN = /^(\d+)\s*(?:min|mins|minute|minutes)$/i;
export const UNKNOWN_DURATION = "—";

export function courseDurationMinutes(duration: string | null | undefined): number | null {
  const match = DURATION_PATTERN.exec((duration ?? "").trim());
  if (!match) return null;
  const minutes = Number(match[1]);
  return Number.isSafeInteger(minutes) ? minutes : null;
}

export function courseDurationText(
  duration: string | null | undefined,
  minutesLabel: string,
): string {
  const minutes = courseDurationMinutes(duration);
  return minutes === null ? UNKNOWN_DURATION : minutesLabel.replace(/\{n\}/g, String(minutes));
}
