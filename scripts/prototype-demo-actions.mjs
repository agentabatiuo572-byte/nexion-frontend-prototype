// UI actions against loopback demo data only; no real payments or accounts.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const base=process.env.DESIGN_BASE||'http://127.0.0.1:5190';
if(new URL(base).hostname!=='127.0.0.1')throw new Error('Use the isolated loopback demo only');
const out=path.resolve('../uvel-design-preview/evidence/demo-actions');await mkdir(out,{recursive:true});
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),checks=[];
let sceneId=0;
const scene=async(route,state={})=>{await page.request.post(base+'/__demo/state',{data:{reset:true,...state}});if(page.url().startsWith(base))await page.evaluate(()=>localStorage.clear());await page.goto(base+'/?nx_device=off&demoScene='+(++sceneId)+'#/pages/'+route,{waitUntil:'networkidle'});};
const state=async()=> (await (await page.request.get(base+'/__demo/state')).json()).state;
const snapshot=async(name)=>{await page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'});checks.push(name);await writeFile(path.join(out,'report.json'),JSON.stringify(checks,null,2));};
try{
  await page.request.get(base+'/preview-language?code=zh');
  await scene('me/notifications?section=notifications');
  await page.getByRole('button',{name:'全部标为已读',exact:true}).click();
  await page.waitForFunction(()=>!document.body.innerText.includes('3 条未读'));
  assert.equal((await state()).read,true);await snapshot('notifications-read-all');
  await scene('index/index');await page.locator('.vb-card').first().click();
  await page.locator('.vcs-cta-claim').click();await page.locator('.vcs-cta-use').waitFor();
  assert.equal((await state()).voucherClaimed,true);await snapshot('voucher-claimed');
  await scene('missions/missions',{taskState:'complete'});
  await page.locator('.newcomer-task__claim').click();
  await page.getByText('奖励已领取',{exact:true}).waitFor();assert.equal((await state()).dayOneClaimed,true);await snapshot('tasks-claimed');
  await scene('store/checkout?product=stellarbox-s1',{catalogState:'available'});
  await page.getByText(/USDT 余额 · \$52,800.64/).waitFor();
  await page.getByRole('button',{name:'立即支付',exact:true}).click();
  await page.getByRole('button',{name:'确认支付',exact:true}).click();
  await page.getByRole('button',{name:/查看订单|追踪订单/}).first().waitFor();
  const paid=await state();assert.ok(paid.createdOrders.some(order=>order.canonicalStatus==='activated'));assert.equal(paid.walletBalance,52800.64-1299);await snapshot('purchase-paid');
  await scene('store/store',{dataState:'error'});await page.getByText(/暂时无法|加载失败|重试/).first().waitFor();await snapshot('store-error');
  await scene('store/store',{catalogState:'available'});await page.getByText('Cloud Share',{exact:true}).first().waitFor();await snapshot('store-recovered');
  await scene('me/goals');await page.getByText('$1000.00',{exact:false}).first().waitFor();await snapshot('goals');
  await scene('me/receipts');await page.getByText('DEMO-RECEIPT-1',{exact:true}).click();await page.getByText('Demo Studio',{exact:true}).first().waitFor();await snapshot('receipt-detail');
  console.log('PASS demo UI actions:',checks.join(', '));
}finally{await writeFile(path.join(out,'last-page.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(out,'last-page.png')});await page.request.post(base+'/__demo/state',{data:{reset:true}});await browser.close();}
