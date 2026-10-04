// @ts-expect-error Node is used only by the test runner.
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {en} from '@/i18n/messages/en';
import {zh} from '@/i18n/messages/zh';
import {vi} from '@/i18n/messages/vi';
import {fmt} from '@/i18n/format';
describe('staking risk copy uses current policy and evidenced claims',()=>{
  for(const [locale,messages] of Object.entries({en,zh,vi})){
    it(`${locale} does not promise an unsupported execution mechanism or duration`,()=>{
      const copy=messages.stakingHowItWorks;
      expect(copy.heroTitle).not.toMatch(/链上|on-chain|blockchain/i);
      expect(copy.s3Intro).not.toMatch(/30\s*(秒|seconds|giây)/i);
      expect(copy.s1Para2).not.toMatch(/锁得越久.*利率越高|longer you lock.*higher the rate|Khóa càng lâu.*lãi suất càng cao/i);
    });
    it(`${locale} renders nondefault penalties`,()=>{
      const penalties='7% (30d), 17% (90d), 29% (180d), 43% (365d)';
      const result=fmt(messages.stakingHowItWorks.r2Body,{penalties});
      expect(result).toContain(penalties);
      // Appending the live placeholder to an obsolete fixed list must fail too.
      expect(messages.stakingHowItWorks.r2Body).not.toMatch(/\d+(?:[.,]\d+)?\s*[%％]/);
    });
    it(`${locale} explains early exit without promising direct use of locked funds`,()=>{
      const {r1Body,r2Label,r2Body}=messages.stakingHowItWorks;
      expect(r1Body).toMatch(/不能直接|cannot be withdrawn|không thể rút trực tiếp/i);
      expect(r1Body).toMatch(/提前赎回|early withdrawal|rút sớm/i);
      expect(r2Label).toMatch(/本金.*利息|principal.*interest|gốc.*lãi/i);
      expect(r2Body).toMatch(/已有持仓|existing positions|vị thế hiện có/i);
      expect(r1Body).not.toMatch(/到期日前无法用作任何事|cannot be used for anything else until|không thể dùng vào việc gì khác cho tới/i);
    });
    it(`${locale} does not retain the unapproved reserve guarantee`,()=>{
      expect(JSON.stringify(messages.stakingHowItWorks)).not.toContain('102.4');
    });
  }
  it('does not render a local safety guarantee card',()=>{
    const page=readFileSync(new URL('./how-it-works.vue',import.meta.url),'utf8');
    expect(page).not.toContain('w.s4SafetyBody');
  });
});
