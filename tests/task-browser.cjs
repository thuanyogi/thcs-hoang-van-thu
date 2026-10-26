/* Read-only browser smoke for the live website. No emails, credentials or writes. */
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(process.env.FR02_URL||'http://localhost:3000/code.html',{waitUntil:'domcontentloaded'});
await page.locator('#auth-status').filter({hasText:'Đăng nhập bằng'}).waitFor();
assert.equal(await page.locator('#auth-email').inputValue(),'');assert.equal(await page.locator('#task-rows tr').count(),0);assert.equal(await page.locator('[data-create-task]:visible').count(),0);
for(const width of [320,375,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
for(const pathname of ['/plans/reports/website-import-map-261023.json','/supabase/functions/school-tasks/index.ts','/../docs/progress.md']){const r=await page.request.get('http://localhost:3000'+pathname);assert.equal(r.status(),404);}
await page.screenshot({path:'plans/reports/supabase-login.png',fullPage:true});assert.deepEqual(errors,[]);console.log('PASS signed-out UI, 4 responsive widths, private paths blocked, no JS errors');
}finally{await browser.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
