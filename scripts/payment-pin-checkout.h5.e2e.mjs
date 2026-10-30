import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createPaymentPinFlowFixture} from './lib/payment-pin-flow-fixture.mjs';
const base=process.env.PAYMENT_PIN_UI_BASE_URL||'http://127.0.0.1:5598';
const output=new URL('../output/payment-pin-20261030/checkout/',import.meta.url);await mkdir(output,{recursive:true});
const fixture=createPaymentPinFlowFixture(), browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844}});await context.addInitScript(()=>performance.setResourceTimingBufferSize(10000));
const page=await context.newPage(),errors=[],paths=[];page.on('pageerror',error=>errors.push(error.message));
try {
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==new URL(base).origin||(!url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/auth/')))return route.continue();
    paths.push(request.method()+' '+url.pathname);
    const wrapped={method:()=>request.method(),headers:()=>request.headers(),postDataJSON:()=>request.postData()?request.postDataJSON():{}};
    const response=fixture.handle(url,wrapped);
    if(response.drop)return route.abort('failed');
    return route.fulfill({status:response.status,contentType:'application/json',body:JSON.stringify({code:response.status===200?0:response.status,message:response.message,data:response.data})});
  });
  await page.goto(base+'/?nx_device=off#/pages/login/login');
  await page.locator('.lg-phone__in input, input.lg-phone__in').fill('13800138001');
  await page.locator('.lg-field--flex input, input.lg-field--flex').first().fill('frontend-fixture-password');await page.locator('.lg-cta').click();
  await page.waitForURL(url=>url.hash==='#/'||url.hash.includes('/pages/index/index'));
  await page.evaluate(async()=>{
    const resource=performance.getEntriesByType('resource').find(item=>new URL(item.name).pathname==='/src/lib/route.ts');
    const localeResource=performance.getEntriesByType('resource').find(item=>new URL(item.name).pathname==='/src/store/locale.ts');
    const {useLocaleStore}=await import(localeResource?.name||'/src/store/locale.ts');useLocaleStore().setLocale('zh');
    const {navTo}=await import(resource?.name||'/src/lib/route.ts');
    await navTo('/pages/store/checkout?items='+encodeURIComponent(JSON.stringify([{productNo:'stellarbox-s1',quantity:2}])));
  });
  await page.locator('.promotion').waitFor();
  await page.screenshot({path:new URL('01-order-review.png',output).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  for(const item of await page.locator('.promotion [role="checkbox"]').all())if(await item.getAttribute('aria-checked')!=='true')await item.click();
  await page.getByText('确认订单',{exact:true}).last().click();
  await page.getByText('确认并支付',{exact:true}).last().click();
  await page.getByRole('button',{name:'确认支付',exact:true}).click();
  const mask=page.locator('.payment-pin-mask'),input=mask.locator('.payment-pin-input input');
  await mask.getByText('您暂未设置支付密码，这是初次设置，设置成功后请牢记。',{exact:true}).waitFor();
  assert.equal(fixture.state.payWrites,0);
  await input.fill('039417');await mask.locator('.payment-pin-primary').click();
  await input.fill('039417');await mask.locator('.payment-pin-primary').click();
  await mask.getByText('支付密码已设置，请牢记。请再次输入，完成本笔支付。',{exact:true}).waitFor();
  assert.equal(fixture.state.setupWrites,1);assert.equal(fixture.state.payWrites,0);assert.equal(await input.inputValue(),'');
  await page.screenshot({path:new URL('03-setup-complete-awaiting-payment.png',output).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  await input.fill('735190');
  await mask.getByText(/还可尝试.*4/).waitFor();assert.equal(fixture.state.payWrites,0);
  await input.fill('039417');await mask.waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('.promotion-title')?.textContent?.includes('已'));
  assert.equal(fixture.state.payWrites,1);assert.equal(fixture.state.balance,7402);
  assert.equal([...fixture.orders.values()][0].paymentStatus,'PAID');
  await page.screenshot({path:new URL('04-first-order-paid.png',output).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  await page.getByText('再买一单',{exact:true}).click();
  await page.getByText('确认订单',{exact:true}).last().click();
  await page.getByText('确认并支付',{exact:true}).last().click();
  await page.getByRole('button',{name:'确认支付',exact:true}).click();
  await mask.getByText('输入支付密码',{exact:true}).waitFor();
  fixture.state.dropNextPayment=true;
  await input.fill('039417');await mask.waitFor({state:'hidden'});
  await page.locator('.promotion-flat[role="status"]').waitFor();
  assert.equal(fixture.state.payWrites,2);
  await page.getByText('查询原订单',{exact:true}).first().click();
  await page.getByText('已支付',{exact:true}).waitFor();
  assert.equal(fixture.state.payWrites,2,'a lost payment response must be recovered without a second debit');
  assert.ok(paths.some(path=>path.startsWith('GET /api/app/payment-commands/order-pay/')));
  await page.getByText('查看关联订单',{exact:true}).click();
  await page.getByText('已激活',{exact:true}).first().waitFor();
  assert.equal([...fixture.orders.values()][1].quantity,2);
  await page.screenshot({path:new URL('05-recovered-order-activated.png',output).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  await page.screenshot({path:new URL('02-confirm-payment.png',output).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  console.log('CHECKPOINT',JSON.stringify({text:(await page.locator('body').innerText()).slice(-2200),paths:paths.slice(-12),payWrites:fixture.state.payWrites}));
  await writeFile(new URL('checkpoint.json',output),JSON.stringify({text:await page.locator('body').innerText(),paths,errors},null,2));
  assert.equal(errors.length,0);
  const steps=[{id:'checkout-first-setup',status:'pass',evidence:['Actual quantity-two checkout created an original order, showed amount confirmation, required two setup entries and a fresh third entry before any payment.']},
    {id:'checkout-wrong-pin',status:'pass',evidence:['An incorrect PIN showed four remaining attempts; payment side effects remained zero until a fresh correct entry.']},
    {id:'checkout-unknown-result',status:'pass',evidence:['Dropped the second order payment response after fixture settlement; original-command GET recovered the receipt with exactly two total paid orders and no duplicate debit.']},
    {id:'checkout-activation',status:'pass',evidence:['Opened the associated canonical order and rendered its activated result.']}];
  await writeFile(new URL('runtime-report.json',output),JSON.stringify({capability:'runtime',verdict:'pass',mode:'full',treeMoved:false,
    taskId:process.env.WORKFLOW_TASK_ID||'payment-pin-frontend-20261030',stepId:process.env.WORKFLOW_STEP_ID||'standalone',checkId:process.env.WORKFLOW_CHECK_ID||'standalone',runId:process.env.WORKFLOW_RUN_ID||'standalone',repo:process.env.WORKFLOW_REPO||process.cwd(),snapshotHash:process.env.WORKFLOW_SNAPSHOT_HASH||'standalone',timestamp:new Date().toISOString(),source:'frontend network fixture, not a real backend payment',steps,innerSkipped:0},null,2));
} catch(error){await page.screenshot({path:new URL('failure.png',output).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});console.error(JSON.stringify({text:(await page.locator('body').innerText()).slice(-2200),paths:paths.slice(-16),errors}));throw error;}
finally {await context.close();await browser.close();}
