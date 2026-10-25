import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import source from "./notifications.vue?raw";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";

// Execute the page's actual date functions with a controlled clock, including
// midnight/month/year boundaries. No copied formatting implementation.
const script = source.split('<script setup lang="ts">')[1].split('</script>')[0];
const ast = ts.createSourceFile('notifications.ts', script, ts.ScriptTarget.Latest, true);
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node)
  && ['timeAgo', 'dateHeading'].includes(node.name?.text ?? '')).map(node => node.getText(ast)).join('\n');
const output = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
function formatter(translations: typeof zh | typeof en | typeof vietnamese, code: string) {
  return new Function('t', 'locale', 'fmt', output + '; return { timeAgo, dateHeading };')(
    { value: translations }, { code }, fmt,
  ) as { timeAgo(ts: number): string; dateHeading(ts: number): string };
}
afterEach(() => { vi.useRealTimers(); });

describe('notification calendar-day timestamps', () => {
  for (const [code, translations] of [['zh', zh], ['en', en], ['vi', vietnamese]] as const) {
    for (const [name, now, sent, clock] of [
      ['midnight with less than 24 hours elapsed', new Date(2026, 9, 25, 0, 5), new Date(2026, 9, 24, 23, 59), '23:59'],
      ['yesterday with more than 24 hours elapsed', new Date(2026, 9, 25, 23, 50), new Date(2026, 9, 24, 0, 5), '00:05'],
      ['year boundary', new Date(2027, 0, 1, 9), new Date(2026, 11, 31, 21), '21:00'],
      ['leap-day month boundary', new Date(2024, 2, 1, 12), new Date(2024, 1, 29, 8, 7), '08:07'],
    ] as const) {
      it(`${code}: labels ${name} as yesterday plus local HH:mm`, () => {
        vi.useFakeTimers(); vi.setSystemTime(now);
        const page = formatter(translations, code);
        expect(page.timeAgo(sent.getTime())).toBe(`${translations.notifs.yesterday} ${clock}`);
        expect(page.dateHeading(sent.getTime())).toBe(translations.notifs.yesterday);
      });
    }
    it(`${code}: retains today's relative time and uses calendar days for older messages`, () => {
      vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 25, 12));
      const page = formatter(translations, code);
      expect(page.timeAgo(new Date(2026, 9, 25, 11, 58).getTime())).toBe(fmt(translations.tickets.timeMinutesAgo, { n: 2 }));
      expect(page.timeAgo(new Date(2026, 9, 25, 9).getTime())).toBe(fmt(translations.tickets.timeHoursAgo, { n: 3 }));
      expect(page.dateHeading(new Date(2026, 9, 25, 9).getTime())).toBe(translations.notifs.today);
      // Only 36 hours elapsed, but the message belongs to two calendar days ago.
      expect(page.timeAgo(new Date(2026, 9, 23, 23, 59).getTime())).toBe(fmt(translations.tickets.timeDaysAgo, { n: 2 }));
      expect(page.dateHeading(new Date(2026, 9, 23, 23, 59).getTime())).not.toBe(translations.notifs.yesterday);
    });
  }
});
