export function homeEarningsSubtitle(
  remote: boolean,
  status: "idle" | "loading" | "ready" | "error",
  todayUsdt: number | null,
  jobCount: number | null,
  todayVsYesterdayPct: number | null,
  mockComparison: string,
  loading: string,
  unavailable: string,
  empty: string,
  settled: string,
): string {
  if (!remote) return mockComparison;
  if (status === "idle" || status === "loading") return loading;
  if (status === "error") return unavailable;
  if (todayUsdt === null || jobCount === null || jobCount < 1) return empty;
  const arrow = todayVsYesterdayPct === null
    ? "—"
    : todayVsYesterdayPct > 0
      ? "↑"
      : todayVsYesterdayPct < 0
        ? "↓"
        : "→";
  const delta = todayVsYesterdayPct === null
    ? ""
    : `${todayVsYesterdayPct > 0 ? "+" : ""}${todayVsYesterdayPct.toFixed(1)}%`;
  return settled
    .replace(/\{arrow\}/g, arrow)
    .replace(/\{delta\}/g, delta)
    .replace(/\{count\}/g, String(jobCount))
    .replace(/\s{2,}/g, " ")
    .trim();
}
