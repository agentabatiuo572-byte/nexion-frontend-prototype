interface TimeCopy {
  timeJustNow: string;
  timeMinutesAgo: string;
  timeHoursAgo: string;
  timeDaysAgo: string;
}

export function taskRelativeTime(timestamp: number, now: number, copy: TimeCopy): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(now)) return "—";
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes < 1) return copy.timeJustNow;
  if (minutes < 60) return copy.timeMinutesAgo.replace("{n}", String(minutes));
  if (minutes < 1440) return copy.timeHoursAgo.replace("{n}", String(Math.floor(minutes / 60)));
  return copy.timeDaysAgo.replace("{n}", String(Math.floor(minutes / 1440)));
}
