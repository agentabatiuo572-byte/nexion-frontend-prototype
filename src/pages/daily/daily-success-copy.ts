import { fmt } from "@/i18n/format";

interface DailySuccessResult {
  gained: number;
  streak: number;
}

interface DailySuccessMessages {
  plusOnePoint: string;
  streakSummary: string;
}

export function dailyCheckInSuccessCopy(
  result: DailySuccessResult,
  messages: DailySuccessMessages,
): { title: string; body: string } {
  return {
    title: fmt(messages.plusOnePoint, { n: result.gained }),
    body: fmt(messages.streakSummary, { n: result.streak }),
  };
}
