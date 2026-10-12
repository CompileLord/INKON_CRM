import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const fixture = JSON.parse(input);
const api = 'http://127.0.0.1:18080/api/v1';
const origin = process.env.KITOB_PREVIEW_ORIGIN ?? 'http://127.0.0.1:5174';
const directory = resolve('../docs/redesign-execution/group-01/task-11');
await mkdir(directory + '/screenshots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true });
const manifest = [], probes = [], errors = [];
const translations = Object.fromEntries(await Promise.all(['en', 'ru', 'tg'].map(async locale => [locale, JSON.parse(await readFile('src/i18n/locales/' + locale + '/dashboard.json', 'utf8'))])));
async function login(role) {
  const identity = fixture.identities.find(identity => identity.role === role && !identity.forced);
  const response = await fetch(api + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: identity.email, password: fixture.password }) });
  assert.equal(response.status, 200); return response.json();
}
async function request(tokens, path, payload, expected = 200) {
  const response = await fetch(api + path, { method: payload ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + tokens.access_token, 'Content-Type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
  assert.equal(response.status, expected, path); return response.json();
}
async function open({ width = 1440, theme = 'light', locale = 'en', enlarge = false, simulation = null, reduced = false } = {}) {
  const tokens = await login('accountant');
  const context = await browser.newContext({ viewport: { width, height: width <= 390 ? 844 : 1000 }, colorScheme: theme, timezoneId: 'America/New_York', reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await context.addInitScript(({ refreshToken, theme, locale, enlarge }) => {
    if (!localStorage.getItem('imkon-refresh-token')) localStorage.setItem('imkon-refresh-token', refreshToken);
    localStorage.setItem('imkon_theme', theme); localStorage.setItem('i18nextLng', locale);
    if (enlarge) addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%'; });
  }, { refreshToken: tokens.refresh_token, theme, locale, enlarge });
  if (simulation) await context.route(simulation.pattern, simulation.handler);
  const page = await context.newPage();
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().startsWith(api)) requests.push({ method: request.method(), path: request.url().slice(api.length) }); });
  await page.goto(origin + '/'); await page.getByRole('heading', { name: translations[locale].financialOverview, exact: true }).waitFor();
  return { context, page, requests, tokens };
}
async function capture(page, name, metadata = {}) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
  });
  await page.screenshot({ path: directory + '/screenshots/' + name + '.png' }); manifest.push({ file: name + '.png', ...metadata });
}
async function fits(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  const clipped = await page.locator('main').evaluate(element => [...element.querySelectorAll('h1,h2,h3,p,button,th,td')].filter(node => {
    const rect = node.getBoundingClientRect();
    return rect.width && rect.height && (rect.left < -1 || rect.right > innerWidth + 1 || node.scrollWidth > node.clientWidth + 2);
  }).map(node => node.textContent));
  assert.deepEqual(clipped, []);
}
try {
  for (const theme of ['light', 'dark']) {
    const { context, page } = await open({ width: 390, theme });
    await page.getByText(translations.en.noPaymentsHelp, { exact: true }).waitFor(); await fits(page);
    await capture(page, '390-' + theme + '-real-empty', { theme, width: 390, realSeeded: true });
    await context.close();
  }
  const accountant = await login('accountant'), admin = await login('superadmin');
  const student = fixture.identities.find(identity => identity.email === 'student@kitob.example.com');
  const profile = await request(accountant, '/students/' + student.id + '/profile');
  const schoolDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dushanbe', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const previousDate = new Date(schoolDate + 'T00:00:00Z'); previousDate.setUTCDate(0);
  const amounts = ['250.25', '135.50', '99.99', '10.00', '0.01'];
  const created = [];
  for (let index = 0; index < amounts.length; index++) created.push(await request(accountant, '/finance/payments/', {
    student_id: student.id, course_id: profile.courses[0].course.id, amount: amounts[index], method: index % 2 ? 'transfer' : 'cash',
    paid_at: (index === 0 ? previousDate.toISOString().slice(0, 10) : schoolDate) + 'T12:00:00+05:00', comment: 'Isolated accountant dashboard fixture'
  }, 201));
  await request(accountant, '/finance/payments/' + created[2].id + '/void', { reason_code: 'isolated_fixture' });
  await request(admin, '/finance/payments/' + created[1].id + '/refund', { amount: '12.50', to_wallet: false, reason_code: 'isolated_fixture' });
  const ledger = await request(accountant, '/finance/payments/?page=1&page_size=5');
  assert.equal(ledger.items.length, 5);
  for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
    const { context, page, requests } = await open({ width, theme });
    await page.getByRole('button', { name: 'View payment #' + ledger.items[0].id, exact: true }).filter({ visible: true }).waitFor();
    await fits(page);
    assert.equal(await page.getByRole('button', { name: /^View payment #/ }).filter({ visible: true }).count(), 5);
    assert.equal(requests.some(request => /\/students\/\d+\/profile/.test(request.path)), false);
    assert.ok(requests.some(request => request.path.startsWith('/finance/analytics/?') && request.path.includes('date_from=') && request.path.includes('date_to=')));
    assert.ok(requests.some(request => request.path === '/finance/payments/?page=1&page_size=5'));
    if (width === 390) {
      const button = await page.getByRole('button', { name: translations.en.acceptPayment, exact: true }).boundingBox();
      assert.ok(button.y + button.height < 760);
      const first = await page.getByRole('article', { name: 'Payment #' + ledger.items[0].id, exact: true }).boundingBox();
      assert.ok(first.y < 760, 'First ledger row must be visible above bottom navigation');
    }
    await capture(page, width + '-' + theme + '-loaded', { width, theme, realSeeded: true, paymentIds: ledger.items.map(payment => payment.id) });
    await page.getByRole('button', { name: 'View payment #' + created[1].id, exact: true }).filter({ visible: true }).click();
    await page.getByRole('dialog').getByText('Receipt reference', { exact: true }).waitFor();
    assert.ok((await page.getByRole('dialog').innerText()).includes('12.50'));
    await capture(page, width + '-' + theme + '-payment-detail', { width, theme, realSeeded: true, paymentId: created[1].id });
    await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('button', { name: 'View payment #' + created[1].id, exact: true }).filter({ visible: true }).evaluate(element => element === document.activeElement), true);
    probes.push({ test: width + '-' + theme + '-loaded-five-decimal-records-detail-focus-period-and-permitted-queries', status: 'pass' }); await context.close();
  }
  for (const [width, locale, enlarge] of [[320, 'ru', false], [320, 'tg', false], [768, 'en', false], [1024, 'en', false], [1440, 'en', true]]) {
    const { context, page } = await open({ width, locale, enlarge });
    await page.getByRole('button', { name: translations[locale].viewPaymentReference.replace('{{id}}', String(ledger.items[0].id)), exact: true }).filter({ visible: true }).waitFor();
    await fits(page); await capture(page, width + '-' + locale + (enlarge ? '-text-200' : ''), { width, locale, textEnlargement: enlarge ? '200%' : '100%', realSeeded: true });
    probes.push({ test: width + '-' + locale + '-layout-' + enlarge, status: 'pass' }); await context.close();
  }
  for (const kind of ['analytics', 'payments']) {
    const pattern = '**/api/v1/finance/' + kind + '/**';
    const { context, page } = await open({ width: 390, simulation: { pattern, handler: route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"simulated independent query failure"}' }) } });
    await page.getByText(translations.en[kind === 'analytics' ? 'errorLoadingSummary' : 'errorLoadingPayments'], { exact: true }).waitFor();
    await capture(page, '390-simulated-' + kind + '-error', { simulation: kind + ' initial HTTP500', width: 390 });
    await context.unroute(pattern); await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('button', { name: 'View payment #' + ledger.items[0].id, exact: true }).filter({ visible: true }).waitFor();
    await page.getByText(translations.en.netCashCollected, { exact: true }).waitFor();
    await fits(page); probes.push({ test: kind + '-independent-error-real-retry', status: 'pass' }); await context.close();
  }
  {
    const { context, page } = await open({ width: 390, theme: 'dark' });
    await page.getByRole('button', { name: 'View payment #' + ledger.items[0].id, exact: true }).filter({ visible: true }).waitFor();
    const pattern = '**/api/v1/finance/payments/**';
    await context.route(pattern, route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"simulated refresh failure"}' }));
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await page.getByText(translations.en.staleFailedNotice, { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /^View payment #/ }).filter({ visible: true }).count(), 5);
    await capture(page, '390-dark-simulated-refresh-failure-retained', { simulation: 'HTTP500 after genuine five-payment loaded response', width: 390, theme: 'dark' });
    await context.unroute(pattern); await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByText(translations.en.staleFailedNotice, { exact: true }).waitFor({ state: 'hidden' });
    probes.push({ test: 'loaded-five-records-retained-on-refresh-failure-and-real-retry', status: 'pass' }); await context.close();
  }
  for (const width of [1440, 390]) {
    let release; const held = new Promise(resolve => { release = resolve; });
    const { context, page } = await open({ width, reduced: true, simulation: { pattern: '**/api/v1/finance/**', handler: async route => { await held; return route.continue(); } } });
    await page.getByText(translations.en.loadingOperations, { exact: true }).waitFor();
    const animations = await page.locator('main [aria-busy="true"]').evaluateAll(elements => elements.flatMap(element => [element, ...element.querySelectorAll('*')]).map(element => getComputedStyle(element).animationName).filter(name => name !== 'none'));
    assert.deepEqual(animations, []);
    assert.equal(await page.locator('main [data-indicator-kind="loop"]').isVisible(), false);
    assert.equal(await page.locator('main [data-indicator-kind="static"]').isVisible(), true);
    await capture(page, width + '-simulated-held-loading-reduced-motion', { simulation: 'held real analytics/payments GET before genuine backend response', width, reducedMotion: true });
    release(); await page.getByRole('button', { name: 'View payment #' + ledger.items[0].id, exact: true }).filter({ visible: true }).waitFor();
    probes.push({ test: width + '-matching-loading-and-reduced-motion-real-response', status: 'pass' }); await context.close();
  }
  const large = await request(accountant, '/finance/payments/', {
    student_id: student.id, course_id: profile.courses[0].course.id, amount: '99999999.99', method: 'cash',
    paid_at: schoolDate + 'T12:00:00+05:00', comment: 'Isolated largest supported ledger amount fixture'
  }, 201);
  assert.equal(large.amount, '99999999.99');
  for (const [width, locale, theme] of [[320, 'ru', 'light'], [320, 'tg', 'dark'], [390, 'en', 'dark']]) {
    const { context, page } = await open({ width, locale, theme });
    await page.getByRole('button', { name: translations[locale].viewPaymentReference.replace('{{id}}', String(large.id)), exact: true }).filter({ visible: true }).waitFor();
    await fits(page);
    assert.ok((await page.getByRole('article').filter({ visible: true }).first().innerText()).includes('99 999 999.99'));
    await capture(page, width + '-' + locale + '-' + theme + '-large-supported-amount', { width, locale, theme, realSeeded: true, amount: large.amount, paymentId: large.id });
    probes.push({ test: width + '-' + locale + '-largest-supported-ledger-amount-no-clipping', status: 'pass' }); await context.close();
  }
  for (const role of ['student', 'mentor']) {
    const tokens = await login(role);
    for (const path of ['/finance/analytics/', '/finance/payments/', '/finance/payments/' + created[0].id + '/receipt']) await request(tokens, path, null, 403);
    probes.push({ test: role + '-actual-finance-authorization-denial', status: 'pass' });
  }
} finally { await browser.close(); }
assert.deepEqual(errors, []);
await writeFile(directory + '/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
await writeFile(directory + '/probes.json', JSON.stringify(probes, null, 2) + '\n');
console.log(JSON.stringify({ probes: probes.length, screenshots: manifest.length, pageErrors: errors.length, isolatedFixturePayments: 6, isolatedFixtureReversals: 2 }));
