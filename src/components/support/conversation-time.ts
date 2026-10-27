export interface ConversationTimeOptions {
  locale: "zh" | "en" | "vi";
  now: number;
  timeZone?: string;
}

export interface ConversationTimeLabels {
  clock: string;
  full: string;
  group: string;
}

type CalendarTime = {
  year: number; month: number; day: number;
  hour: number; minute: number; second: number;
  offsetMinutes: number;
};

const MINUTE = 60_000;
const DAY = 86_400_000;
export const CONVERSATION_TIME_GROUP_GAP_MS = DAY;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COPY = {
  zh: { today: "今天", yesterday: "昨天", weekdays: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"] },
  en: { today: "Today", yesterday: "Yesterday", weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] },
  vi: { today: "Hôm nay", yesterday: "Hôm qua", weekdays: ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"] },
};
const pad = (value: number) => String(value).padStart(2, "0");

/** Epoch milliseconds only: a small positive value is not guessed to be seconds. */
function validDate(timestamp: number | undefined): Date | null {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp <= 0) return null;
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) && date.getTime() > 0 ? date : null;
}

function localCalendar(date: Date): CalendarTime {
  return {
    year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(),
    hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds(),
    offsetMinutes: -date.getTimezoneOffset(),
  };
}

/** Unsupported Intl/time-zone options fall back to the device calendar and offset. */
function calendarReader(timeZone?: string): (date: Date) => CalendarTime {
  if (!timeZone || typeof Intl === "undefined" || typeof Intl.DateTimeFormat !== "function") return localCalendar;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone, calendar: "gregory", numberingSystem: "latn", hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    if (typeof formatter.formatToParts !== "function") return localCalendar;
    return date => {
      try {
        const parts = formatter.formatToParts(date);
        const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(value => value.type === type)?.value);
        const year = part("year"), month = part("month"), day = part("day");
        // Some native engines use h24 despite hour12:false; 24 belongs to the same date.
        const rawHour = part("hour"), hour = rawHour === 24 ? 0 : rawHour;
        const minute = part("minute"), second = part("second");
        if (![year, month, day, hour, minute, second].every(Number.isInteger)
            || month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23
            || minute < 0 || minute > 59 || second < 0 || second > 59
            || parts.some(value => value.type === "dayPeriod")) return localCalendar(date);
        const wallTime = Date.UTC(year, month - 1, day, hour, minute, second);
        const offsetMinutes = Math.round((wallTime - Math.floor(date.getTime() / 1000) * 1000) / MINUTE);
        if (!Number.isFinite(offsetMinutes)) return localCalendar(date);
        return { year, month, day, hour, minute, second, offsetMinutes };
      } catch { return localCalendar(date); }
    };
  } catch { return localCalendar; }
}

// UTC is only a ruler for calendar dates here; elapsed local days can be 23/25 hours.
function calendarDay(value: CalendarTime): number {
  return Date.UTC(value.year, value.month - 1, value.day) / DAY;
}

function dateLabel(value: CalendarTime, locale: ConversationTimeOptions["locale"]): string {
  const { year, month, day } = value;
  if (locale === "zh") return `${year}/${pad(month)}/${pad(day)}`;
  if (locale === "vi") return `${pad(day)}/${pad(month)}/${year}`;
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

function offsetLabel(offsetMinutes: number): string {
  const absolute = Math.abs(offsetMinutes);
  return `GMT${offsetMinutes < 0 ? "-" : "+"}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

function timeFormatter(options: ConversationTimeOptions) {
  const read = calendarReader(options.timeZone), now = validDate(options.now);
  const current = now ? read(now) : null;
  return (date: Date) => {
    const value = read(date), clock = `${pad(value.hour)}:${pad(value.minute)}`;
    const day = calendarDay(value);
    let groupDate = dateLabel(value, options.locale);
    // Future instants and other years remain explicit, including around New Year.
    if (current && now && date.getTime() <= now.getTime() && value.year === current.year) {
      const daysAgo = calendarDay(current) - day, copy = COPY[options.locale];
      if (daysAgo === 0) groupDate = copy.today;
      else if (daysAgo === 1) groupDate = copy.yesterday;
      else if (daysAgo >= 2 && daysAgo <= 6) groupDate = copy.weekdays[new Date(day * DAY).getUTCDay()];
      else groupDate = dateLabel(value, options.locale);
    }
    return {
      day,
      labels: {
        clock,
        full: `${dateLabel(value, options.locale)} ${clock}:${pad(value.second)} ${offsetLabel(value.offsetMinutes)}`,
        group: `${groupDate} ${clock}`,
      },
    };
  };
}

export function formatConversationTime(timestamp: number | undefined, options: ConversationTimeOptions): ConversationTimeLabels | null {
  const date = validDate(timestamp);
  return date ? timeFormatter(options)(date).labels : null;
}

/** Rereads replace same-ID data at its existing position; timestamps never reorder it. */
export function buildConversationTimeGroups(
  messages: ReadonlyArray<{ id: string; timestamp?: number }>,
  options: ConversationTimeOptions,
): Record<string, string> {
  const groups: Record<string, string> = Object.create(null);
  const format = timeFormatter(options);
  const unique = new Map(messages.map(message => [message.id, message]));
  let previous: number | undefined;
  for (const message of unique.values()) {
    const date = validDate(message.timestamp);
    if (!date) continue;
    const { labels } = format(date), timestamp = date.getTime();
    // A calendar change alone is not a 24-hour pause. Unknown timestamps do
    // not invent a divider; every bubble retains its own precise clock.
    if (previous === undefined || timestamp - previous >= CONVERSATION_TIME_GROUP_GAP_MS) {
      groups[message.id] = labels.group;
    }
    previous = timestamp;
  }
  return groups;
}
