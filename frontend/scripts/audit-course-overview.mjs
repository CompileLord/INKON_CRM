import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const fixture = JSON.parse(input);
const origin = process.env.KITOB_PREVIEW_ORIGIN ?? 'http://127.0.0.1:5188';
const api = 'http://127.0.0.1:18080/api/v1';
const directory = resolve('../docs/redesign-execution/group-02/task-02/independent');
await mkdir(directory + '/screenshots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true });
const probes = [], screenshots = [], pageErrors = [];
const admin = fixture.identities.find(item => item.role === 'superadmin' && !item.forced);
const mentor = fixture.identities.find(item => item.role === 'mentor' && !item.forced && !item.tag);
const unassigned = fixture.identities.find(item => item.tag === 'empty');
const student = fixture.identities.find(item => item.role === 'student' && !item.forced && !item.tag);
async function probe(name, operation) {
  try { probes.push({ name, passed: true, evidence: await operation() }); }
  catch (error) { probes.push({ name, passed: false, error: error.message }); }
}
async function capture(page, name, metadata = {}) {
  await page.evaluate(async () => Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
  await page.screenshot({ path: directory + '/screenshots/' + name + '.png' });
  screenshots.push({ file: name + '.png', ...metadata });
}
async function authenticate(identity, width = 1440, theme = 'light', locale = 'en') {
  const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 1000 }, isMobile: width < 768, hasTouch: width < 768, colorScheme: theme, reducedMotion: 'reduce' });
  await context.addInitScript(({ theme, locale }) => { localStorage.setItem('imkon_theme', theme); localStorage.setItem('i18nextLng', locale); }, { theme, locale });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(origin + '/login');
  await page.waitForLoadState('networkidle');
  await page.locator('#email').fill(identity.email);
  await page.locator('#password').fill(fixture.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url => url.pathname === (identity.role === 'mentor' ? '/mentors/' + identity.id : '/'));
  return { context, page };
}
async function loaded(page, id, query = '') {
  await page.goto(origin + '/courses/' + id + query);
  await page.getByRole('tablist').waitFor();
  await page.waitForFunction(() => !document.querySelector('main [class*="animate-pulse"]'));
  await page.waitForLoadState('networkidle');
}
async function fits(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
  assert.equal(await page.locator('main').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
}
try {
  const response = await fetch(api + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: admin.email, password: fixture.password }) });
  assert.equal(response.status, 200);
  const tokens = await response.json();
  async function request(path, method = 'GET', body) {
    const response = await fetch(api + path, { method, headers: { Authorization: 'Bearer ' + tokens.access_token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.ok(response.ok, method + ' ' + path + ' returned ' + response.status);
    return response.status === 204 ? undefined : response.json();
  }
  const payload = { title: 'Overview audit course', description: 'Actual isolated fixture for Overview acceptance', start_date: '2026-10-01', end_date: '2026-10-31', exam_type: 'weekly', price: '850.50', mentor_id: mentor.id, schedules: [{ day_of_week: 1, time_start: '10:00:15', time_end: '11:30:45' }] };
  const source = await request('/courses/', 'POST', payload);
  const { context, page } = await authenticate(admin);
  const reads = [];
  page.on('request', request => { if (request.method() === 'GET' && request.url().startsWith(api)) reads.push(new URL(request.url()).pathname + new URL(request.url()).search); });
  await loaded(page, source.id);
  await capture(page, 'desktop-real-scheduled-ungraded', { role: 'superadmin', simulated: false });
  await probe('overview-lazy-reads-and-bounded-count', async () => {
    const own = reads.filter(url => url.includes('/courses/' + source.id) || url.includes('/enrollments/'));
    assert.ok(own.some(url => url.includes('course_id=' + source.id) && url.includes('page_size=1')));
    assert.equal(own.filter(url => /progress-chart|mentor-history|students/.test(url)).length, 0);
    return { reads: own };
  });
  await probe('scheduled-period-count-does-not-establish-grade-availability', async () => {
    const data = await request('/courses/' + source.id + '/journal-metrics');
    assert.ok(data.periods_total > 0);
    assert.equal((await request('/enrollments/?course_id=' + source.id + '&page_size=1')).total, 0);
    const metrics = page.getByRole('region', { name: /class average/i });
    assert.equal((await metrics.innerText()).includes('0%'), false, 'Period count alone makes ungraded/no-summary metrics appear as 0%');
    return { canonical: data, gradedStateAbsent: true };
  });
  await probe('journal-context-written-only-on-departure', async () => {
    const saved = await page.evaluate(id => sessionStorage.getItem('kitob_course_detail_return:' + id), source.id);
    assert.equal(saved, null, 'Journal URL construction writes return context during ordinary render');
    return { saved };
  });
  await probe('desktop-title-type-contract', async () => {
    const type = await page.getByRole('heading', { level: 1 }).evaluate(element => ({ size: getComputedStyle(element).fontSize, line: getComputedStyle(element).lineHeight }));
    assert.deepEqual(type, { size: '28px', line: '36px' });
    return type;
  });
  await probe('metrics-error-retains-local-working-retry', async () => {
    const pattern = '**/api/v1/courses/' + source.id + '/journal-metrics';
    await page.route(pattern, route => route.fulfill({ status: 500, json: { detail: 'SIMULATION: metrics unavailable' }, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' } }));
    try {
      await loaded(page, source.id);
      await capture(page, 'metrics-failure-SIMULATED', { simulated: true });
      assert.ok(await page.getByRole('button', { name: 'Retry', exact: true }).count(), 'Metrics failure has no retry');
    } finally { await page.unroute(pattern); }
  });
  await loaded(page, source.id);
  await probe('progress-search-survives-tab-switch', async () => {
    await request('/enrollments/', 'POST', { course_id: source.id, student_id: student.id });
    await loaded(page, source.id, '?tab=progress');
    const search = page.locator('main').getByRole('textbox').first();
    await search.waitFor();
    await search.fill('Alice');
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    await page.getByRole('tab', { name: 'Progress', exact: true }).click();
    assert.equal(await page.locator('main').getByRole('textbox').first().inputValue(), 'Alice');
    return { queryRetained: true };
  });
  await probe('journal-return-preserves-period-and-filter-state', async () => {
    const periods = await request('/courses/' + source.id + '/journals');
    const periodId = periods.at(-1).id;
    await loaded(page, source.id, '?tab=progress&period=' + periodId);
    await page.evaluate(() => window.scrollTo(0, 120));
    await page.getByRole('link', { name: 'Go to journal', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/journals/' + source.id);
    const raw = await page.evaluate(id => sessionStorage.getItem('kitob_course_detail_return:' + id), source.id);
    const saved = JSON.parse(raw);
    assert.equal(saved.periodId, periodId);
    return { saved };
  });
  await loaded(page, source.id);
  const writes = [];
  page.on('request', request => { if (['POST', 'PATCH', 'DELETE'].includes(request.method()) && request.url().startsWith(api + '/courses/')) writes.push({ method: request.method(), path: new URL(request.url()).pathname }); });
  let copiedId;
  await probe('detail-duplicate-exact-schedule-and-real-id', async () => {
    await page.getByRole('button', { name: 'Course actions: ' + source.title, exact: true }).click();
    await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Duplicate', exact: true }).click();
    await page.waitForURL(url => /^\/courses\/\d+$/.test(url.pathname) && url.pathname !== '/courses/' + source.id);
    copiedId = Number(new URL(page.url()).pathname.split('/').at(-1));
    const rows = await request('/courses/' + copiedId + '/schedule');
    assert.equal(rows[0].time_start, '10:00:15');
    assert.equal(rows[0].time_end, '11:30:45');
    return { copiedId, writes: writes.filter(item => item.method === 'POST') };
  });
  await loaded(page, source.id);
  await probe('cancel-after-breakpoint-focuses-surviving-control', async () => {
    await page.getByRole('button', { name: 'Course actions: ' + source.title, exact: true }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    const focus = await page.evaluate(() => ({ tag: document.activeElement.tagName, visible: document.activeElement.getBoundingClientRect().width > 0, inMain: Boolean(document.activeElement.closest('main')) }));
    assert.ok(focus.visible && focus.inMain && focus.tag !== 'BODY', JSON.stringify(focus));
    return focus;
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await probe('untrusted-detail-storage-fields-rejected', async () => {
    const result = await page.evaluate(async id => {
      const module = await import('/src/lib/courses/returnContext.ts');
      sessionStorage.setItem('kitob_course_detail_return:' + id, JSON.stringify({ courseId: id, tab: 'progress', periodId: '123bad', scrollY: -50, timestamp: 'bad', search: { nested: true }, sort: 'unsupported' }));
      return module.getSavedCourseDetailContext(id);
    }, source.id);
    assert.equal(result, null);
    return { rejected: true };
  });
  await context.close();
  for (const width of [320, 390, 768, 1024]) {
    const session = await authenticate(admin, width, width === 390 ? 'dark' : 'light');
    await loaded(session.page, source.id);
    await capture(session.page, 'width-' + width + '-real-overview', { width, simulated: false });
    await probe('width-' + width + '-geometry', async () => { await fits(session.page); return { width }; });
    if (width === 390) {
      await probe('phone-first-screen-shows-schedule', async () => {
        const schedule = await session.page.getByRole('heading', { name: 'Schedule', exact: true }).boundingBox();
        const nav = await session.page.locator('nav').last().boundingBox();
        assert.ok(schedule.y + schedule.height <= (nav?.y ?? 780), 'Schedule starts below phone navigation: ' + JSON.stringify(schedule));
        return { schedule, nav };
      });
      await probe('phone-title-type-contract', async () => {
        const type = await session.page.getByRole('heading', { level: 1 }).evaluate(element => ({ size: getComputedStyle(element).fontSize, line: getComputedStyle(element).lineHeight }));
        assert.deepEqual(type, { size: '24px', line: '32px' });
        return type;
      });
    }
    await session.context.close();
  }
  for (const locale of ['ru', 'tg']) {
    const session = await authenticate(admin, 320, 'light', locale);
    await loaded(session.page, source.id);
    await capture(session.page, 'phone-320-' + locale, { locale, simulated: false });
    await probe('phone-320-' + locale + '-no-document-overflow', async () => { await fits(session.page); return { locale }; });
    await session.page.evaluate(() => {
      const values = [...document.querySelectorAll('main, main *')].map(element => ({ element, size: parseFloat(getComputedStyle(element).fontSize), line: parseFloat(getComputedStyle(element).lineHeight) }));
      for (const value of values) { value.element.style.fontSize = value.size * 2 + 'px'; if (Number.isFinite(value.line)) value.element.style.lineHeight = value.line * 2 + 'px'; }
    });
    await capture(session.page, 'phone-320-' + locale + '-text-doubled', { locale, textEnlarged: true, simulated: false });
    await probe('phone-320-' + locale + '-enlarged-text-no-document-overflow', async () => { await fits(session.page); return { locale, enlargement: 2 }; });
    await session.context.close();
  }
  {
    const session = await authenticate(admin, 320);
    const pattern = '**/api/v1/courses/' + source.id;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await session.page.route(pattern, async route => { await gate; await route.continue(); });
    try {
      const navigation = session.page.goto(origin + '/courses/' + source.id);
      await session.page.locator('main [class*="animate-pulse"]').first().waitFor();
      await capture(session.page, 'phone-320-loading-SIMULATED-delay', { simulated: true, reducedMotion: 'reduce' });
      await probe('loading-respects-reduced-motion', async () => {
        const names = await session.page.locator('main [class*="animate-pulse"]').evaluateAll(elements => elements.map(element => getComputedStyle(element).animationName));
        assert.ok(names.every(name => name === 'none'), JSON.stringify(names));
        return { names };
      });
      await probe('phone-320-loading-geometry-no-overflow', async () => { await fits(session.page); return { width: 320 }; });
      release(); await navigation;
    } finally { release(); await session.page.unroute(pattern); await session.context.close(); }
  }
  const denied = await authenticate(unassigned);
  await denied.page.goto(origin + '/courses/' + source.id);
  await denied.page.waitForLoadState('networkidle');
  await denied.page.getByText('Failed to load course', { exact: true }).or(denied.page.getByText('Access denied', { exact: true })).waitFor({ timeout: 20000 });
  await capture(denied.page, 'actual-unassigned-mentor-denial', { status: 403, simulated: false });
  await probe('actual-403-classified-with-auth-api-error', async () => {
    assert.equal(await denied.page.getByText('Access denied', { exact: true }).count(), 1);
    assert.equal(await denied.page.getByText(source.title, { exact: true }).count(), 0);
    return { actualDenied: true };
  });
  await denied.context.close();
} finally {
  await browser.close();
  await writeFile(directory + '/probes.json', JSON.stringify({ probes, pageErrors }, null, 2));
  await writeFile(directory + '/manifest.json', JSON.stringify(screenshots, null, 2));
  console.log(JSON.stringify({ total: probes.length, failed: probes.filter(item => !item.passed).map(item => item.name), pageErrors }));
}
process.exitCode = probes.some(item => !item.passed) || pageErrors.length ? 1 : 0;
