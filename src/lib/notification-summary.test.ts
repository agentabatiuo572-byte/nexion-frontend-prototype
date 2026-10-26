import { describe, expect, it } from 'vitest';
import { parse } from 'acorn';
import ts from 'typescript';
import { isDirectNotificationSummary } from './notification-summary';
import source from './notification-summary.ts?raw';
import nativeRegexSource from './native-unicode-regex.ts?raw';

describe('conservative notification reading budget', () => {
  it('loads on an engine that rejects Unicode property escapes', () => {
    const parserOptions = { ecmaVersion: 2017 as const };
    expect(() => parse(String.raw`/\p{Mark}/u`, parserOptions)).toThrow();
    const [summaryJs, regexJs] = [source, nativeRegexSource].map(content =>
      ts.transpileModule(content, { compilerOptions: {
        target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS,
      } }).outputText);
    for (const js of [summaryJs, regexJs]) {
      expect(() => parse(js, parserOptions)).not.toThrow();
    }
    const legacyRegExp = function(pattern: string, flags = '') {
      parse(`/${pattern.replace(/\//g, '\\/')}/${flags}`, parserOptions);
      return new RegExp(pattern, flags);
    };
    const regexExports = {}, summaryExports = {} as { isDirectNotificationSummary: typeof isDirectNotificationSummary };
    new Function('RegExp', 'exports', regexJs)(legacyRegExp, regexExports);
    new Function('require', 'exports', summaryJs)(() => regexExports, summaryExports);
    for (const body of ['已到账。', 'View order.', 'Xem đơn.'.normalize('NFD')]) {
      expect(summaryExports.isDirectNotificationSummary(body)).toBe(true);
    }
    expect(summaryExports.isDirectNotificationSummary('通知'.repeat(40))).toBe(false);
  });
  it.each(['\u0301', '\u031b', '\u0323', '\ufe0f', '\u20dd', '\u{1d165}'])('retains zero width for combining mark %s', mark => {
    expect(isDirectNotificationSummary(('a' + mark).repeat(24))).toBe(true);
    expect(isDirectNotificationSummary(('a' + mark).repeat(25))).toBe(false);
  });
  it.each(['汉'.repeat(12), 'W'.repeat(24), 'Xem đơn.'.normalize('NFD')])('retains supported-locale reading boundaries: %s', body => {
    expect(isDirectNotificationSummary(body)).toBe(true);
  });
  it('keeps longer CJK tokens expandable', () => {
    expect(isDirectNotificationSummary('汉'.repeat(13))).toBe(false);
  });
  it.each([undefined, '', '已到账。', 'View order.', 'Xem đơn.'])('permits a brief summary: %s', body => {
    expect(isDirectNotificationSummary(body)).toBe(true);
  });
  it.each(['汉'.repeat(80), '汉'.repeat(100), 'W'.repeat(25), 'A detailed notification needs to be read before opening the linked order.', 'Thông báo này chứa thông tin chi tiết cần đọc trước khi mở đơn hàng.', '短文\n正文', '短文\r正文', 'text\u2028body', '🔔'.repeat(20)])('keeps longer or multiline text expandable: %s', body => {
    expect(isDirectNotificationSummary(body)).toBe(false);
  });
});
