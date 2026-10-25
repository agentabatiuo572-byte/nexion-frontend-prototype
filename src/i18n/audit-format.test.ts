import { expect,it } from 'vitest';
import { fmtMoney,fmtRate,fmtRelTime } from './format';
it('distinguishes missing from zero and keeps small earnings visible',()=>{for(const n of [null,undefined,NaN,Infinity])expect(fmtMoney(n)).toBe('-');expect(fmtMoney(0)).toBe('$0.00');expect(fmtMoney(.009)).toBe('<$0.01');expect(fmtMoney(.00032,true)).toBe('$0.0003');expect(fmtMoney(1234.56)).toBe('$1,234.56');});
it('localizes day units and relative time',()=>{expect(fmtRate(2,'zh')).toBe('$2.00/天');expect(fmtRate(2,'vi')).toBe('$2.00/ngày');expect(fmtRelTime(0,'zh',120000)).toBe('2分钟前');expect(fmtRelTime(0,'en',0)).toBe('Just now');});
