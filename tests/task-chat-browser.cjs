/* Browser test uses an existing permitted synthetic teacher account; no DB writes. */
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const fixture=JSON.parse(fs.readFileSync('plans/private-test-credentials.json'));
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.name));
  await page.goto(process.env.CHAT_TEST_URL||'http://localhost:3000/');
  await page.waitForFunction(()=>document.body.dataset.session==='signed-out');
  assert.equal(await page.locator('#task-chat-launcher').isVisible(),false);
  const u=fixture.users.teacherA;
  await page.locator('#auth-email').fill(u.email);await page.locator('#auth-password').fill(u.password);
  await page.locator('#auth-form').evaluate(f=>f.requestSubmit());
  await page.locator('#task-chat-launcher').waitFor({state:'visible',timeout:60000});
  await page.locator('#task-chat-launcher').click();
  const taskId=await page.evaluate(()=>SchoolData.store.list(SchoolData.actor.id)[0].id);
  await page.locator('#task-chat-question').fill('Tóm tắt nội dung công việc mã '+taskId+' và dẫn nguồn công việc này.');
  await page.locator('.chat-send').click();
  await page.waitForFunction(()=>{const p=document.querySelector('.chat-answer p');return p&&!p.textContent.includes('Đang tìm');},null,{timeout:60000});
  assert.equal(await page.locator('.chat-error').count(),0);
  assert.ok((await page.locator('.chat-answer').textContent()).length>20);
  for(const width of [320,375,768,1440]){
   await page.setViewportSize({width,height:900});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await page.locator('#task-chat-dialog').evaluate(el=>el.scrollWidth>el.clientWidth),false);
  }
  await page.screenshot({path:'plans/reports/task-chat-desktop-261030.png',fullPage:true});
  assert.ok(await page.locator('.chat-source').count());
  await page.locator('.chat-source').first().click();
  await page.locator('#detail-title').filter({hasNotText:'Đang tải'}).waitFor({timeout:30000});
  assert.equal(await page.locator('#task-detail-dialog').isVisible(),true);
  await page.locator('#detail-close').click();
  await page.locator('#task-chat-launcher').click();
  await page.keyboard.press('Escape');assert.equal(await page.locator('#task-chat-dialog').isVisible(),false);
  await page.locator('#auth-sign-out').click();
  await page.waitForFunction(()=>document.body.dataset.session==='signed-out');
  assert.equal(await page.locator('#task-chat-launcher').isVisible(),false);assert.equal(await page.locator('.chat-answer').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS real teacher login, Gemini question, four widths, task source detail, Escape, logout clears answers, no pageerror');
 }finally{await browser.close();}
})().catch(e=>{console.error('FAIL '+e.name+': '+e.message.replace(/(?:eyJ|AIza)[A-Za-z0-9._-]+/g,'[redacted]'));process.exitCode=1;});
