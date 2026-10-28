import assert from 'node:assert/strict';
import test from 'node:test';
import {demoDefaults,demoFixture,demoProducts} from './lib/prototype-demo-data.mjs';

const read=(path,state)=>demoFixture(new URL(path,'http://127.0.0.1:5230'),'zh',state,{headers:()=>({}),method:()=> 'GET',postDataJSON:()=>({})});
test('preview configuration changes activity models and the owned upgrade base together',()=>{
  const state={...structuredClone(demoDefaults),machineImageState:'alternate'};
  const activity=read('/api/promotions/demo-promo-0',state);
  assert.equal(activity.rewardRules[0].productNo,'stellarbox-pro');
  assert.equal(activity.rewardRules[0].buyerReward.giftProductNo,'stellarbox-s1');
  assert.deepEqual(activity.productNos,['stellarbox-pro']);
  assert.equal(read('/api/promotions/demo-promo-2',state).rewardRules[0].productNo,'stellarrack-p1');
  assert.ok(read('/api/devices/earnings',state).devices.some(row=>row.productCode==='STELLARRACK-P1'));
});
test('missing primary images retain the gift catalog entry; recovery keeps the canonical URLs',()=>{
  const normal=demoProducts(demoDefaults),missing=demoProducts({...demoDefaults,machineImageState:'missing-main'});
  assert.equal(missing.find(row=>row.id==='stellarbox-s1').imageUrl,undefined);
  assert.equal(missing.find(row=>row.id==='cloud-share').imageUrl,normal.find(row=>row.id==='cloud-share').imageUrl);
  assert.deepEqual(demoProducts({...demoDefaults,machineImageState:'normal'}),normal);
  assert.ok(demoProducts({...demoDefaults,machineImageState:'missing'}).every(row=>!row.imageUrl));
  assert.ok(demoProducts({...demoDefaults,machineImageState:'broken'}).every(row=>row.imageUrl.includes('/static/demo-missing-')));
});

test('published banner preview follows the activity id/version contract and excludes inactive activities',()=>{
  const state={...structuredClone(demoDefaults),machineImageState:'banner'};
  const activity=read('/api/promotions/demo-promo-0',state);
  assert.equal(activity.bannerImageUrl,`/api/promotions/${activity.activityId}/banner/${activity.version}`);
  for(const eventState of ['upcoming','ended'])assert.ok(!read('/api/promotions/demo-promo-0',{...state,eventState}).bannerImageUrl);
  assert.ok(!read('/api/promotions/demo-promo-0',demoDefaults).bannerImageUrl);
});
