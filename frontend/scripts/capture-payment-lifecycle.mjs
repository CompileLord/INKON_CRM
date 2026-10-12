import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const fixture = JSON.parse(input);
const api = 'http://127.0.0.1:18080/api/v1';
const origin = 'http://127.0.0.1:5174';
const directory = resolve('../docs/redesign-execution/group-01/payment-lifecycle');
await mkdir(directory + '/screenshots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true });
const manifest = [], probes = [], errors = [];
const translations = Object.fromEntries(await Promise.all(['en', 'ru', 'tg'].map(async locale => [locale, JSON.parse(await readFile('src/i18n/locales/' + locale + '/finance.json', 'utf8'))])));
let writes = 0;
const student = fixture.identities.find(identity => identity.email === 'student@kitob.example.com');
assert.ok(student);
async function login(identity) {
  const response = await fetch(api + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: identity.email, password: fixture.password }) });
  assert.equal(response.status, 200); return response.json();
}
async function open({ role = 'accountant', width = 1440, height = 1000, theme = 'light', locale = 'en', enlarge = false, prefill = false } = {}) {
  const identity = fixture.identities.find(identity => identity.role === role && !identity.forced); assert.ok(identity);
  const tokens = await login(identity);
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, timezoneId: 'America/New_York' });
  await context.addInitScript(({ refreshToken, theme, locale, enlarge }) => {
    if (!localStorage.getItem('imkon-refresh-token')) localStorage.setItem('imkon-refresh-token', refreshToken);
    localStorage.setItem('imkon_theme', theme); localStorage.setItem('i18nextLng', locale);
    if (enlarge) addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%'; });
  }, { refreshToken: tokens.refresh_token, theme, locale, enlarge });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/finance/payments/') writes++; });
  await page.goto(origin + '/finance');
  if (prefill) await page.getByRole('button', { name: translations[locale].tabs.debtors, exact: true }).click();
  await page.getByRole('button', { name: translations[locale].paymentModal.acceptPayment, exact: true }).first().click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.locator(prefill ? '#payment-amount' : '#payment-student').evaluate(element => element === document.activeElement), true);
  return { context, page, identity, tokens };
}
async function fill(page, tokens) {
  const response = await fetch(api + '/students/' + student.id + '/profile', { headers: { Authorization: 'Bearer ' + tokens.access_token } });
  assert.equal(response.status, 200); const profile = await response.json();
  await page.locator('#payment-student').fill(student.email);
  const escapedEmail = student.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const result = page.locator('#payment-student-results button').filter({ hasText: new RegExp(' · ' + escapedEmail + '$') }); await result.waitFor();
  await page.locator('#payment-student').press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await result.click();
  await page.locator('#payment-course option[value="' + profile.courses[0].course.id + '"]').waitFor({ state: 'attached' });
  await page.locator('#payment-course').selectOption(String(profile.courses[0].course.id));
  await page.locator('#payment-amount').fill('750,50'); await page.locator('#payment-comment').fill('Isolated browser fixture');
  return profile.courses[0].course;
}
async function capture(page, name, metadata = {}) {
  await page.screenshot({ path: directory + '/screenshots/' + name + '.png' }); manifest.push({ file: name + '.png', ...metadata });
}
async function fits(page) {
  const dialog = page.getByRole('dialog');
  assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  for (const selector of ['#payment-amount', '#payment-date', '#payment-comment']) assert.equal(await page.locator(selector).evaluate(element => element.getBoundingClientRect().right <= element.closest('[role="dialog"]').getBoundingClientRect().right), true);
}
try {
  for (const role of ['accountant', 'superadmin']) for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
    const { context, page, tokens } = await open({ role, width, height: width === 390 ? 844 : 1000, theme }); await fill(page, tokens); await fits(page);
    if (width === 390) {
      assert.equal((await page.getByRole('dialog').boundingBox()).height, 844);
      const footer = page.getByRole('button', { name: 'Accept Payment', exact: true }).last(); const box = await footer.boundingBox(); assert.ok(box.y + box.height <= 844);
    }
    await capture(page, role + '-' + width + '-' + theme + '-form', { role, width, theme, realSeeded: true });
    await page.setViewportSize({ width: width === 390 ? 768 : 1024, height: 844 });
    assert.equal(await page.locator('#payment-amount').inputValue(), '750,50'); assert.equal(await page.locator('#payment-comment').inputValue(), 'Isolated browser fixture');
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Keep editing', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Keep editing', exact: true }).evaluate(element => element === document.activeElement), true);
    await capture(page, role + '-' + width + '-' + theme + '-discard', { role, simulation: false, openedSurface: 'unsaved decision' });
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click(); assert.equal(await page.locator('#payment-amount').inputValue(), '750,50');
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Discard changes', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    probes.push({ test: role + '-' + width + '-' + theme + '-form-resize-dirty-discard', status: 'pass' }); await context.close();
  }
  for (const role of ['accountant', 'superadmin']) for (const theme of ['light', 'dark']) {
    const { context, page, tokens } = await open({ role, width: 390, height: 844, theme, prefill: true });
    const debts = await fetch(api + '/finance/debts/?page=1&page_size=20', { headers: { Authorization: 'Bearer ' + tokens.access_token } }); assert.equal(debts.status, 200); const first = (await debts.json()).items[0]; assert.ok(first);
    const dialog = page.getByRole('dialog'); assert.equal(await page.locator('#payment-student').count(), 0); assert.equal(await page.locator('#payment-course').count(), 0); assert.ok((await dialog.innerText()).includes(first.student.first_name + ' ' + first.student.last_name)); assert.ok((await dialog.innerText()).includes(first.course.title)); assert.equal(await page.locator('#payment-amount').inputValue(), '');
    await capture(page, role + '-prefilled-' + theme, { role, theme, width: 390, source: 'actual first course-balance row', studentId: first.student.id, courseId: first.course.id });
    await dialog.getByRole('button', { name: 'Close', exact: true }).click(); await dialog.waitFor({ state: 'hidden' }); probes.push({ test: role + '-prefilled-context-' + theme, status: 'pass' }); await context.close();
  }
  assert.equal(writes, 0, 'All cancelled forms must be read-only');
  for (const locale of ['ru', 'tg']) {
    const { context, page, tokens } = await open({ width: 320, height: 844, locale }); await fill(page, tokens); await fits(page); await capture(page, 'form-320-' + locale, { locale, width: 320 }); await context.close();
  }
  {
    const { context, page, tokens } = await open({ enlarge: true }); await fill(page, tokens); await fits(page); await capture(page, 'form-text-200', { textEnlargement: '200%' }); await context.close();
  }
  for (const role of ['accountant', 'superadmin']) {
    const { context, page, tokens } = await open({ role, width: 390, height: 844 }); const course = await fill(page, tokens);
    const selectedDate = await page.locator('#payment-date').inputValue();
    let release; const waiting = new Promise(resolve => { release = resolve; }); let refreshFailed = false; let returned;
    await context.route('**/api/v1/finance/analytics/**', route => refreshFailed ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"simulated analytics refresh failure"}' }) : route.continue());
    await context.route('**/api/v1/finance/payments/**', async route => {
      if (route.request().method() === 'POST') { await waiting; const response = await route.fetch(); assert.equal(response.status(), 201); returned = await response.json(); refreshFailed = true; return route.fulfill({ response }); }
      if (refreshFailed && !route.request().url().includes('/receipt')) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"simulated list refresh failure"}' });
      return route.continue();
    });
    await page.getByRole('button', { name: 'Accept Payment', exact: true }).last().click(); await page.getByRole('button', { name: 'Recording payment…', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Cancel', exact: true }).isDisabled(), true); await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 1);
    await capture(page, role + '-simulated-held-request-pending', { simulation: 'held payment request before real backend mutation' }); release();
    await page.getByRole('dialog').waitFor({ state: 'hidden' }); const success = page.getByRole('status', { name: 'Recorded payment', exact: true }); await success.waitFor();
    assert.ok(returned); assert.equal(returned.amount, '750.50'); assert.ok(returned.allocations.some(allocation => allocation.course_id === course.id));
    assert.equal(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dushanbe', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(returned.paid_at)), selectedDate);
    assert.ok((await success.innerText()).includes('Payment #' + returned.id)); await capture(page, role + '-real-success-with-simulated-refresh-failure', { simulation: 'analytics/list refresh 500 after real 201', paymentId: returned.id });
    await context.route('**/api/v1/finance/payments/*/receipt', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"simulated receipt failure"}' }));
    await success.getByRole('button', { name: 'View payment', exact: true }).click(); await page.getByRole('dialog').getByRole('alert').waitFor();
    assert.equal(await page.getByRole('dialog').getByRole('button', { name: 'Accept Payment', exact: true }).count(), 0);
    await capture(page, role + '-real-payment-with-simulated-receipt-failure', { simulation: 'receipt lookup 500 after real payment success', paymentId: returned.id });
    await context.unroute('**/api/v1/finance/payments/*/receipt'); await page.getByRole('dialog').getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('dialog').getByText('Receipt reference', { exact: true }).waitFor(); await capture(page, role + '-real-payment-detail-receipt', { seeded: true, paymentId: returned.id });
    for (const width of [390, 1440]) for (const theme of ['light', 'dark']) { await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 }); await page.evaluate(async theme => (await import('/src/lib/theme.ts')).applyTheme(theme), theme); await capture(page, role + '-payment-detail-' + width + '-' + theme, { role, width, theme, paymentId: returned.id, realSeeded: true }); }
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click(); assert.equal(writes, role === 'accountant' ? 1 : 2); await success.waitFor();
    probes.push({ test: role + '-real-payment-pending-success-retained-and-independent-receipt-retry', status: 'pass', actualPaymentId: returned.id, writes }); await context.close();
  }
} finally { await browser.close(); }
assert.deepEqual(errors, []);
await writeFile(directory + '/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
await writeFile(directory + '/probes.json', JSON.stringify(probes, null, 2) + '\n');
console.log(JSON.stringify({ probes: probes.length, screenshots: manifest.length, writes, pageErrors: errors.length }));
