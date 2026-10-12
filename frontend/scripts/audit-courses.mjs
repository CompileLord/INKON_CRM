import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const fixture = JSON.parse(input);
const origin = process.env.KITOB_PREVIEW_ORIGIN ?? 'http://127.0.0.1:5188';
const api = 'http://127.0.0.1:18080/api/v1';
const directory = resolve('../docs/redesign-execution/group-02/task-01/independent');
await mkdir(directory + '/screenshots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true });
const probes = [], manifest = [], errors = [];
const admin = fixture.identities.find(item => item.role === 'superadmin' && !item.forced);
const mentor = fixture.identities.find(item => item.role === 'mentor' && !item.forced && !item.tag);
let currentPage;

async function probe(name, operation) {
  try {
    const evidence = await operation();
    probes.push({ name, passed: true, evidence });
  } catch (error) {
    probes.push({ name, passed: false, error: error.message });
  }
}

async function capture(page, name, data = {}) {
  await page.evaluate(async () => Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
  await page.screenshot({ path: directory + '/screenshots/' + name + '.png' });
  manifest.push({ file: name + '.png', ...data });
}

async function login(identity, width = 1440, theme = 'light', locale = 'en') {
  const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 1000 }, isMobile: width < 768, hasTouch: width < 768, colorScheme: theme, reducedMotion: 'reduce', timezoneId: 'America/New_York' });
  await context.addInitScript(({ theme, locale }) => { localStorage.setItem('imkon_theme', theme); localStorage.setItem('i18nextLng', locale); }, { theme, locale });
  const page = await context.newPage();
  currentPage = page;
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/login');
  await page.locator('#email').waitFor();
  await page.waitForLoadState('networkidle');
  await page.locator('#email').fill(identity.email);
  await page.locator('#password').fill(fixture.password);
  assert.equal(await page.locator('#email').inputValue(), identity.email, 'Login email must remain entered');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url => url.pathname === (identity.role === 'mentor' ? '/mentors/' + identity.id : '/'));
  await page.goto(origin + '/courses');
  await loaded(page);
  return { context, page };
}

async function loaded(page) {
  await page.locator('main h1').waitFor();
  await page.waitForFunction(() => !document.querySelector('main [data-testid="brand-activity-indicator"], main [class*="animate-pulse"]'));
  await page.locator('main a[href^="/courses/"]').first().waitFor();
}

async function fits(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true, 'Document overflows');
  assert.equal(await page.locator('main').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true, 'Main overflows');
}

try {
  const session = await fetch(api + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: admin.email, password: fixture.password }) });
  assert.equal(session.status, 200);
  const tokens = await session.json();
  async function request(path, method = 'GET', body) {
    const response = await fetch(api + path, { method, headers: { Authorization: 'Bearer ' + tokens.access_token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.ok(response.ok, `${method} ${path} returned ${response.status}`);
    return response.status === 204 ? undefined : response.json();
  }
  const sourceTitle = 'Schedule precision audit — Курси омӯзиши ҷадвал бо номи хеле дароз — проверка длинного названия';
  const source = await request('/courses/', 'POST', { title: sourceTitle, description: 'Isolated verification fixture', start_date: '2026-10-01', end_date: '2026-10-31', exam_type: 'weekly', price: '99999999.99', mentor_id: mentor.id, schedules: [{ day_of_week: 1, time_start: '10:00:15', time_end: '11:30:45' }] });
  let sourcePage = 1;
  const firstPage = await request('/courses/?page=1&page_size=12');
  if (!firstPage.items.some(item => item.id === source.id)) {
    const secondPage = await request('/courses/?page=2&page_size=12');
    assert.ok(secondPage.items.some(item => item.id === source.id), 'Bounded isolated fixture must fit two pages');
    sourcePage = 2;
  }
  const { context, page } = await login(admin);
  await probe('desktop-control-radius-contract', async () => {
    const radius = await page.locator('main input[type="text"]').evaluate(element => getComputedStyle(element).borderRadius);
    assert.equal(radius, '10px');
    return { radius };
  });
  await probe('safe-page-parser-and-return-key-consistency', async () => {
    const values = await page.evaluate(async () => {
      const module = await import('/src/lib/courses/returnContext.ts');
      return ['02', '2abc', '2.5', '9007199254740992'].map(raw => ({ raw, page: module.parseSafePageParam(raw), sanitized: module.validateAndSanitizeCourseListSearch('?page=' + raw) }));
    });
    assert.deepEqual(values[0], { raw: '02', page: 2, sanitized: '?page=2' });
    assert.ok(values.slice(1).every(value => value.page === 1 && value.sanitized === ''));
    return values;
  });
  await probe('real-query-owner-change-and-retained-refetch-error', async () => {
    await page.getByText('Mentor Fixture', { exact: true }).first().waitFor();
    const loadedBox = await page.locator('main .grid > div').first().boundingBox();
    let mode = 'hold', release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/v1/courses/**', async route => {
      const url = new URL(route.request().url());
      if (route.request().method() !== 'GET' || url.pathname !== '/api/v1/courses/') return route.continue();
      if (mode === 'hold') await gate;
      if (mode === 'error') return route.fulfill({ status: 500, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' }, json: { detail: 'SIMULATION: failed refresh' } });
      return route.continue();
    });
    await page.getByRole('button', { name: 'Active', exact: true }).click();
    await page.locator('main [data-testid="brand-activity-indicator"]').waitFor();
    assert.equal(await page.locator('main a[href^="/courses/"]').count(), 0, 'Old query-owner cards remain visible');
    await probe('representative-grid-skeleton-geometry', async () => {
      const skeletonBox = await page.locator('main .grid > div').first().boundingBox();
      assert.ok(Math.abs(loadedBox.height - skeletonBox.height) <= 2, `Loaded ${loadedBox.height}px vs skeleton ${skeletonBox.height}px`);
      assert.ok(Math.abs(loadedBox.y - skeletonBox.y) <= 2, `Loaded starts ${loadedBox.y}px vs skeleton ${skeletonBox.y}px`);
      return { loadedBox, skeletonBox };
    });
    release(); mode = 'normal';
    await loaded(page);
    const before = await page.locator('main a[href^="/courses/"]').first().innerText();
    mode = 'error';
    await page.evaluate(async () => { window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online')); });
    await page.getByRole('alert').waitFor({ timeout: 20000 });
    assert.equal(await page.locator('main a[href^="/courses/"]').first().innerText(), before);
    await capture(page, 'retained-error-simulated', { simulated: true });
    mode = 'normal'; await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('alert').waitFor({ state: 'detached' });
    await page.unroute('**/api/v1/courses/**');
    return { oldOwnerHidden: true, retainedContent: before, retryRecovered: true };
  });
  await page.goto(origin + '/courses?page=' + sourcePage + '&q=Schedule%20precision%20audit'); await loaded(page);
  const writes = [];
  let copiedCourseId;
  page.on('request', request => { if (['DELETE', 'POST', 'PATCH'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/api/v1/courses/')) writes.push({ method: request.method(), path: new URL(request.url()).pathname }); });
  await probe('delete-cancel-dispatches-no-write', async () => {
    await page.getByRole('button', { name: 'Course actions: ' + sourceTitle, exact: true }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    assert.equal(writes.length, 0);
    await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal(writes.length, 0);
    assert.equal(await page.getByRole('button', { name: 'Course actions: ' + sourceTitle, exact: true }).evaluate(element => element === document.activeElement), true);
    return { writes: 0, invokerFocusReturned: true };
  });
  await probe('duplicate-schedule-failure-is-accessible-and-recoverable', async () => {
    const pattern = '**/api/v1/courses/' + source.id + '/schedule*';
    await page.route(pattern, route => route.fulfill({ status: 500, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' }, json: { detail: 'SIMULATION: schedule temporarily unavailable' } }));
    try {
      const writeCount = writes.length;
      await page.getByRole('button', { name: 'Course actions: ' + sourceTitle, exact: true }).click();
      await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Duplicate', exact: true }).click();
      await page.getByRole('dialog').getByRole('alert').filter({ hasText: 'Failed to copy course' }).waitFor({ timeout: 5000 });
      assert.equal(writes.length, writeCount);
      assert.equal(await page.getByRole('dialog').getByRole('button', { name: 'Duplicate', exact: true }).isEnabled(), true);
      assert.ok((await page.getByRole('dialog').innerText()).includes(sourceTitle));
      await capture(page, 'duplicate-schedule-failure-SIMULATED', { simulated: true, actualWriteRequests: 0 });
    } finally {
      await page.unroute(pattern);
      if (await page.getByRole('dialog').count()) {
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'detached' });
      }
    }
    assert.equal(await page.getByRole('button', { name: 'Course actions: ' + sourceTitle, exact: true }).evaluate(element => element === document.activeElement), true);
    return { accessibleError: true, retainedNamedTarget: true, canRetry: true, writes: 0, cancelFocusReturned: true };
  });
  await probe('duplicate-preserves-exact-schedule-seconds', async () => {
    await page.evaluate(() => sessionStorage.removeItem('kitob_course_list_last_url'));
    const original = await request('/courses/' + source.id + '/schedule');
    await page.getByRole('button', { name: 'Course actions: ' + sourceTitle, exact: true }).click();
    await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Duplicate', exact: true }).click();
    await page.waitForURL(url => /^\/courses\/\d+$/.test(url.pathname));
    const createdId = Number(new URL(page.url()).pathname.split('/').at(-1));
    assert.notEqual(createdId, source.id);
    copiedCourseId = createdId;
    const copy = await request('/courses/' + createdId + '/schedule');
    const normalize = rows => rows.map(row => ({ day: row.day_of_week, start: row.time_start, end: row.time_end }));
    assert.deepEqual(normalize(copy), normalize(original));
    assert.ok(!writes.some(write => write.method === 'PATCH' && write.path.endsWith('/0')));
    await probe('duplicate-result-records-safe-list-origin', async () => {
      const stored = await page.evaluate(() => sessionStorage.getItem('kitob_course_list_last_url'));
      assert.ok(stored, 'Duplicate opens detail without recording safe list origin');
      const returnUrl = new URL(stored, origin);
      assert.equal(returnUrl.pathname, '/courses');
      assert.equal(returnUrl.searchParams.get('page'), String(sourcePage));
      assert.equal(returnUrl.searchParams.get('q'), 'Schedule precision audit');
      return { safeOrigin: stored };
    });
    return { actualCopiedId: createdId, schedules: normalize(copy) };
  });
  await probe('course-scroll-owner-releases-global-policy', async () => {
    await page.goto(origin + '/courses'); await loaded(page);
    await page.locator('a[href="/settings"]').filter({ visible: true }).first().click();
    await page.waitForURL(url => url.pathname === '/settings');
    assert.equal(await page.evaluate(() => history.scrollRestoration), 'auto', 'Courses leaked manual history scroll policy into Settings');
    return { restoredPolicy: 'auto' };
  });
  await page.goto(origin + '/courses?page=' + sourcePage + '&q=Schedule%20precision%20audit'); await loaded(page);
  await probe('long-desktop-course-title-is-not-clamped', async () => {
    const metrics = await page.locator('main a[href="/courses/' + source.id + '"]').first().evaluate(element => ({ contentHeight: element.scrollHeight, visibleHeight: element.clientHeight }));
    await capture(page, 'desktop-long-name-max-money', { realSeeded: true, maximumSupportedMoney: '99999999.99' });
    assert.ok(metrics.contentHeight <= metrics.visibleHeight + 1, `Title clipped: ${JSON.stringify(metrics)}`);
    return metrics;
  });
  await probe('successful-delete-restores-surviving-directory-focus', async () => {
    assert.ok(copiedCourseId);
    const copied = await request('/courses/' + copiedCourseId);
    const beforeUrl = new URL(page.url()).pathname + new URL(page.url()).search;
    const deleteCount = writes.filter(write => write.method === 'DELETE').length;
    await page.getByRole('button', { name: 'Course actions: ' + copied.title, exact: true }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await page.locator('main a[href="/courses/' + copiedCourseId + '"]').waitFor({ state: 'detached' });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const focus = await page.evaluate(() => ({ tag: document.activeElement.tagName, inDirectory: Boolean(document.querySelector('main')?.contains(document.activeElement)), connected: document.activeElement.isConnected }));
    await capture(page, 'after-isolated-successful-delete', { realSeeded: true, isolatedMutation: true });
    assert.equal(writes.filter(write => write.method === 'DELETE').length, deleteCount + 1);
    assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, beforeUrl);
    assert.equal(focus.inDirectory, true, 'Deleted trigger must return focus to a surviving directory control: ' + JSON.stringify(focus));
    return { focus, deleteRequests: 1, preservedUrl: beforeUrl };
  });
  await context.close();
  for (const locale of ['ru', 'tg']) {
    const { context, page } = await login(admin, 390, 'dark', locale);
    await probe('phone-' + locale + '-primary-title-type-contract', async () => {
      const style = await page.locator('main a[href^="/courses/"]').first().evaluate(element => ({ size: getComputedStyle(element).fontSize, line: getComputedStyle(element).lineHeight }));
      assert.deepEqual(style, { size: '16px', line: '24px' });
      return style;
    });
    await probe('phone-' + locale + '-keyboard-breakpoint-and-enlarged-text', async () => {
      await fits(page);
      const trigger = page.locator('main button[aria-haspopup="dialog"]');
      await trigger.focus(); await page.keyboard.press('Enter');
      await page.getByRole('dialog').waitFor();
      await page.getByRole('dialog').getByRole('radio').first().focus();
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.getByRole('dialog').getByRole('radio').last().isChecked(), true);
      await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' });
      assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
      await trigger.click(); await page.setViewportSize({ width: 768, height: 1000 });
      await page.getByRole('dialog').waitFor({ state: 'detached' });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.getByRole('dialog').count(), 0);
      await page.goto(origin + '/courses?page=' + sourcePage);
      await loaded(page);
      const font = await page.locator('main h1').evaluate(element => getComputedStyle(element).fontSize);
      await page.evaluate(() => {
        const values = [...document.querySelectorAll('h1,h2,h3,p,span,button,input,select,label,a')].map(element => ({ element, size: parseFloat(getComputedStyle(element).fontSize), line: parseFloat(getComputedStyle(element).lineHeight) }));
        for (const { element, size, line } of values) { element.style.fontSize = size * 2 + 'px'; if (Number.isFinite(line)) element.style.lineHeight = line * 2 + 'px'; }
      });
      assert.equal(await page.locator('main h1').evaluate(element => getComputedStyle(element).fontSize), parseFloat(font) * 2 + 'px');
      await fits(page); await capture(page, 'phone-' + locale + '-text-200', { locale, theme: 'dark', textEnlargement: 'Computed text font sizes doubled once; layout dimensions retained', maximumSupportedMoney: '99999999.99' });
      const clipped = await page.locator('main a, main span').evaluateAll(elements => elements.filter(element => {
        const owner = element.closest('[class*="overflow-hidden"]');
        if (!owner || !element.textContent.trim()) return false;
        const rect = element.getBoundingClientRect(), boundary = owner.getBoundingClientRect();
        return rect.width > 0 && (rect.left < boundary.left - 1 || rect.right > boundary.right + 1);
      }).map(element => element.textContent));
      assert.deepEqual(clipped, [], 'Text is clipped inside a card despite no document overflow');
      return { nativeRadioArrow: true, escapeFocusReturned: true, breakpointDismissed: true, enlargedHeading: parseFloat(font) * 2 };
    });
    await context.close();
  }
} catch (error) {
  probes.push({ name: 'harness-completion', passed: false, error: error.message, pathname: currentPage ? new URL(currentPage.url()).pathname : null });
  if (currentPage && !currentPage.isClosed()) await capture(currentPage, 'failure', { state: 'failure-diagnostic' }).catch(() => {});
} finally {
  await browser.close();
  await writeFile(directory + '/probes.json', JSON.stringify({ probes, errors }, null, 2));
  await writeFile(directory + '/manifest.json', JSON.stringify(manifest, null, 2));
}
const failed = probes.filter(probe => !probe.passed);
console.log(JSON.stringify({ probes: probes.length, failed: failed.map(probe => probe.name), pageErrors: errors.length }));
if (failed.length || errors.length) process.exitCode = 1;
