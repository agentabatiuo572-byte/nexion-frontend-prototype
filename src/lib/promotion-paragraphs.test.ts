import { expect, it } from 'vitest';
import { uniquePromotionParagraphs } from './promotion-paragraphs';
it('removes only repeated paragraphs and preserves distinct refund consequences',()=>{
  const refund='退款后收回未使用赠品。';
  expect(uniquePromotionParagraphs('购买后发放。\n'+refund+'\n购买后发放。',[refund])).toBe('购买后发放。');
  expect(uniquePromotionParagraphs(refund+'\n已使用赠品须人工处理。',[refund])).toBe('已使用赠品须人工处理。');
});
