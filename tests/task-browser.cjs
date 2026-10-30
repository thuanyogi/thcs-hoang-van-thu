/* Read-only local browser smoke. Does not send Auth emails or write remote data. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({ headless: true, channel: 'chrome' });
 try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const base = process.env.FR02_URL || 'http://localhost:3000/';
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.session === 'signed-out');
  assert.equal(await page.locator('#school-app').isVisible(), false);
  assert.equal(await page.locator('#auth-email').inputValue(), '');
  await page.locator('[data-auth-mode="signup"]').click();
  assert.equal(await page.locator('#auth-sign-up').isVisible(), true);
  assert.match(await page.locator('#auth-description').textContent(), /Xác nhận email/);
  await page.locator('[data-auth-mode="link"]').click();
  assert.equal(await page.locator('#auth-password').isVisible(), false);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.session === 'signed-out');
  for (const width of [320, 375, 768, 1440]) {
   await page.setViewportSize({ width, height: 900 });
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  for (const pathname of ['/plans/reports/website-import-map-261023.json','/supabase/functions/school-tasks/index.ts','/docs/progress.md']) {
   const response = await page.request.get(new URL(pathname, base).href); assert.equal(response.status(),404);
  }
  const redirect = await page.request.get(new URL('/code.html',base).href, {maxRedirects:0});
  assert.equal(redirect.status(),308);
  assert.deepEqual(errors, []);
  await page.screenshot({path:'plans/reports/auth-new-desktop.png',fullPage:true});
  console.log('PASS signed-out auth modes, F5, 4 widths, private paths, legacy redirect, no JS errors');
 } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode=1; });
