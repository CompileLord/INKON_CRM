import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const fixture = JSON.parse(input);
const origin = process.env.KITOB_PREVIEW_ORIGIN ?? 'http://127.0.0.1:5188';
const api = 'http://127.0.0.1:18080/api/v1';
const directory = resolve('../docs/redesign-execution/group-02/task-02/attempt6');
await mkdir(directory + '/screenshots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true });
const probes = [], screenshots = [], pageErrors = [];

const admin = fixture.identities.find(item => item.role === 'superadmin' && !item.forced);
const mentor = fixture.identities.find(item => item.role === 'mentor' && !item.forced && !item.tag);
const unassigned = fixture.identities.find(item => item.tag === 'empty');
const student = fixture.identities.find(item => item.role === 'student' && !item.forced && !item.tag);

async function probe(name, operation) {
  try {
    const evidence = await operation();
    probes.push({ name, passed: true, evidence });
  } catch (error) {
    probes.push({ name, passed: false, error: error.message });
  }
}

async function capture(page, name, metadata = {}) {
  await page.evaluate(async () =>
    Promise.all(
      document
        .getAnimations()
        .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map(animation => animation.finished.catch(() => {})),
    ),
  );
  await page.screenshot({ path: directory + '/screenshots/' + name + '.png' });
  const entryState = metadata.state ?? (metadata.simulated ? 'loading' : 'loaded');
  screenshots.push({ file: name + '.png', ...metadata, state: entryState });
}

async function authenticate(identity, width = 1440, theme = 'light', locale = 'en') {
  const context = await browser.newContext({
    viewport: { width, height: width < 768 ? 844 : 1000 },
    isMobile: width < 768,
    hasTouch: width < 768,
    colorScheme: theme,
    reducedMotion: 'reduce',
  });
  await context.addInitScript(
    ({ theme, locale }) => {
      localStorage.setItem('imkon_theme', theme);
      localStorage.setItem('i18nextLng', locale);
    },
    { theme, locale },
  );
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
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
    true,
  );
  assert.equal(
    await page.locator('main').evaluate(element => element.scrollWidth <= element.clientWidth + 1),
    true,
  );
}

try {
  const response = await fetch(api + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: admin.email, password: fixture.password }),
  });
  assert.equal(response.status, 200);
  const tokens = await response.json();

  async function request(path, method = 'GET', body) {
    const response = await fetch(api + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + tokens.access_token,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.ok(response.ok, method + ' ' + path + ' returned ' + response.status);
    return response.status === 204 ? undefined : response.json();
  }

  const payload = {
    title: 'Overview audit course',
    description: 'Actual isolated fixture for Overview acceptance',
    start_date: '2026-10-01',
    end_date: '2026-10-31',
    exam_type: 'weekly',
    price: '850.50',
    mentor_id: mentor.id,
    schedules: [{ day_of_week: 1, time_start: '10:00:15', time_end: '11:30:45' }],
  };
  const source = await request('/courses/', 'POST', payload);

  const brokenMediaPayload = {
    title: 'Overview failed media course',
    description: 'Fixture with declared missing media path',
    start_date: '2026-10-01',
    end_date: '2026-10-31',
    exam_type: 'weekly',
    price: '850.50',
    mentor_id: mentor.id,
    schedules: [{ day_of_week: 1, time_start: '10:00:15', time_end: '11:30:45' }],
  };
  const brokenMediaCourse = await request('/courses/', 'POST', brokenMediaPayload);

  const imageForm = new FormData();
  const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  imageForm.append('file', new Blob([pngBytes], { type: 'image/png' }), 'course_image.png');
  const uploadResponse = await fetch(api + '/courses/' + brokenMediaCourse.id + '/image/', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tokens.access_token },
    body: imageForm,
  });
  assert.equal(uploadResponse.status, 200);

  const { context, page } = await authenticate(admin, 1440, 'light');
  const reads = [];
  page.on('request', request => {
    if (request.method() === 'GET' && request.url().startsWith(api)) {
      reads.push(new URL(request.url()).pathname + new URL(request.url()).search);
    }
  });

  await loaded(page, source.id);
  await capture(page, 'desktop-admin-light-overview', { role: 'superadmin', theme: 'light', simulated: false });
  await capture(page, 'desktop-admin-no-photo-light', { role: 'superadmin', theme: 'light', simulated: false });

  {
    const brokenPage = await context.newPage();
    await brokenPage.route('**/storage/**', route => route.fulfill({ status: 404 }));
    await loaded(brokenPage, brokenMediaCourse.id);
    await brokenPage.locator('.h-20.w-20 svg').waitFor();
    await capture(brokenPage, 'desktop-admin-missing-photo-error', { role: 'superadmin', theme: 'light', state: 'loaded', simulated: false });
    await probe('desktop-missing-photo-renders-80px-fallback', async () => {
      const box = await brokenPage.locator('.h-20.w-20').boundingBox();
      assert.ok(box && Math.abs(box.width - 80) <= 2 && Math.abs(box.height - 80) <= 2, 'Fallback is not 80px: ' + JSON.stringify(box));
      assert.equal(await brokenPage.locator('.h-20.w-20 svg').count(), 1);
      return { box };
    });
    await brokenPage.close();
  }

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
    const type = await page.getByRole('heading', { level: 1 }).evaluate(element => ({
      size: getComputedStyle(element).fontSize,
      line: getComputedStyle(element).lineHeight,
    }));
    assert.deepEqual(type, { size: '28px', line: '36px' });
    return type;
  });

  await probe('primary-journal-action-desktop-right', async () => {
    const link = page.getByRole('link', { name: 'Go to journal', exact: true });
    assert.equal(await link.count(), 1);
    const box = await link.boundingBox();
    assert.ok(box && box.height >= 44, 'Primary journal action is under 44px');
    return { linkBox: box };
  });

  await probe('metric-labels-min-12px-and-wrapping', async () => {
    const labels = await page
      .getByRole('region', { name: /class average/i })
      .locator('span.uppercase')
      .evaluateAll(elements =>
        elements.map(el => ({
          text: el.innerText,
          size: parseFloat(getComputedStyle(el).fontSize),
          overflow: getComputedStyle(el).textOverflow,
        })),
      );
    assert.ok(labels.every(l => l.size >= 12), 'Label size below 12px: ' + JSON.stringify(labels));
    assert.ok(labels.every(l => l.overflow !== 'ellipsis'), 'Label truncated: ' + JSON.stringify(labels));
    return { labels };
  });

  await probe('metrics-error-retains-local-working-retry', async () => {
    const pattern = '**/api/v1/courses/' + source.id + '/journal-metrics';
    await page.route(pattern, route =>
      route.fulfill({
        status: 500,
        json: { detail: 'SIMULATION: metrics unavailable' },
        headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' },
      }),
    );
    try {
      await loaded(page, source.id);
      await capture(page, 'metrics-failure-SIMULATED', { simulated: true, state: 'error' });
      assert.ok(await page.getByRole('button', { name: 'Retry', exact: true }).count(), 'Metrics failure has no retry');
    } finally {
      await page.unroute(pattern);
    }
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
    const search = page.locator('main').getByRole('textbox').first();
    await search.waitFor();
    await search.fill('Alice');
    await page.setViewportSize({ width: 1440, height: 500 });
    await page.evaluate(() => window.scrollTo(0, 120));
    await page.getByRole('link', { name: 'Go to journal', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/journals/' + source.id);
    const raw = await page.evaluate(id => sessionStorage.getItem('kitob_course_detail_return:' + id), source.id);
    const saved = JSON.parse(raw);
    assert.equal(saved.periodId, periodId);
    assert.equal(saved.search, 'Alice');
    assert.equal(saved.scrollY, 120);
    return { saved };
  });

  await probe('return-context-restoration-protocol', async () => {
    await loaded(page, source.id, '?tab=progress&return=1');
    const search = page.locator('main').getByRole('textbox').first();
    await search.waitFor();
    assert.equal(await search.inputValue(), 'Alice');
    await page.waitForFunction(() => window.scrollY > 0, null, { timeout: 5000 });
    const currentScrollY = await page.evaluate(() => window.scrollY);
    assert.ok(currentScrollY >= 50, 'Restored scroll position is ' + currentScrollY);
    await page.setViewportSize({ width: 1440, height: 1000 });
    return { restoredQuery: 'Alice', restoredScrollY: currentScrollY };
  });

  await loaded(page, source.id);
  const writes = [];
  page.on('request', request => {
    if (['POST', 'PATCH', 'DELETE'].includes(request.method()) && request.url().startsWith(api + '/courses/')) {
      writes.push({ method: request.method(), path: new URL(request.url()).pathname });
    }
  });

  let copiedId;
  await probe('detail-duplicate-exact-schedule-and-real-id', async () => {
    await page.getByRole('button', { name: 'Course actions: ' + source.title, exact: true }).click();
    await capture(page, 'desktop-admin-menu-opened', { simulated: false });
    await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
    await capture(page, 'desktop-superadmin-duplicate-dialog', { simulated: false });
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
    await capture(page, 'desktop-superadmin-delete-dialog', { simulated: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    const focus = await page.evaluate(() => ({
      tag: document.activeElement.tagName,
      visible: document.activeElement.getBoundingClientRect().width > 0,
      inMain: Boolean(document.activeElement.closest('main')),
    }));
    assert.ok(focus.visible && focus.inMain && focus.tag !== 'BODY', JSON.stringify(focus));
    return focus;
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Mentor assignment history', exact: true }).click();
  await page.locator('#mentor-history-list').waitFor();
  await page.locator('#mentor-history-list li').first().waitFor();
  const mentorHistoryText = await page.locator('#mentor-history-list li').first().innerText();
  assert.ok(mentorHistoryText.length > 0, 'Mentor history entry is empty');
  await capture(page, 'desktop-history-opened-light', { theme: 'light', state: 'loaded', simulated: false });

  await probe('untrusted-detail-storage-fields-rejected', async () => {
    const result = await page.evaluate(async id => {
      const module = await import('/src/lib/courses/returnContext.ts');
      sessionStorage.setItem(
        'kitob_course_detail_return:' + id,
        JSON.stringify({
          courseId: id,
          tab: 'progress',
          periodId: '123bad',
          scrollY: -50,
          timestamp: 'bad',
          search: { nested: true },
          sort: 'unsupported',
          view: 'invalid_view',
        }),
      );
      return module.getSavedCourseDetailContext(id);
    }, source.id);
    assert.equal(result, null);
    return { rejected: true };
  });

  await context.close();

  {
    const adminDark = await authenticate(admin, 1440, 'dark');
    await loaded(adminDark.page, source.id);
    await capture(adminDark.page, 'desktop-admin-dark-overview', { role: 'superadmin', theme: 'dark', simulated: false });
    await adminDark.page.getByRole('button', { name: 'Mentor assignment history', exact: true }).click();
    await adminDark.page.locator('#mentor-history-list').waitFor();
    await adminDark.page.locator('#mentor-history-list li').first().waitFor();
    const darkHistoryText = await adminDark.page.locator('#mentor-history-list li').first().innerText();
    assert.ok(darkHistoryText.length > 0, 'Dark mentor history entry is empty');
    await capture(adminDark.page, 'desktop-history-opened-dark', { theme: 'dark', state: 'loaded', simulated: false });
    await adminDark.context.close();
  }

  {
    const mentorLight = await authenticate(mentor, 1440, 'light');
    await loaded(mentorLight.page, source.id);
    await capture(mentorLight.page, 'desktop-mentor-light-overview', { role: 'mentor', theme: 'light', simulated: false });
    await mentorLight.context.close();
  }

  {
    const mentorDark = await authenticate(mentor, 1440, 'dark');
    await loaded(mentorDark.page, source.id);
    await capture(mentorDark.page, 'desktop-mentor-dark-overview', { role: 'mentor', theme: 'dark', simulated: false });
    await mentorDark.context.close();
  }

  for (const width of [320, 390, 768, 1024]) {
    const session = await authenticate(admin, width, width === 390 ? 'dark' : 'light');
    await loaded(session.page, source.id);
    await capture(session.page, 'width-' + width + '-real-overview', { width, simulated: false });
    await probe('width-' + width + '-geometry', async () => {
      await fits(session.page);
      return { width };
    });
    if (width === 390) {
      await capture(session.page, 'phone-390-admin-dark-overview', { role: 'superadmin', width: 390, theme: 'dark', simulated: false });
      await probe('phone-first-screen-shows-schedule', async () => {
        const schedule = await session.page.getByRole('heading', { name: 'Schedule', exact: true }).boundingBox();
        const nav = await session.page.locator('nav').last().boundingBox();
        assert.ok(
          schedule.y + schedule.height <= (nav?.y ?? 780),
          'Schedule starts below phone navigation: ' + JSON.stringify(schedule),
        );
        return { schedule, nav };
      });
      await probe('phone-title-type-contract', async () => {
        const type = await session.page.getByRole('heading', { level: 1 }).evaluate(element => ({
          size: getComputedStyle(element).fontSize,
          line: getComputedStyle(element).lineHeight,
        }));
        assert.deepEqual(type, { size: '24px', line: '32px' });
        return type;
      });
      await probe('primary-journal-action-phone-fullwidth', async () => {
        const link = session.page.getByRole('link', { name: 'Go to journal', exact: true });
        const box = await link.boundingBox();
        assert.ok(box && box.width >= 300, 'Primary action not full width on phone: ' + JSON.stringify(box));
        assert.ok(box && box.height >= 44, 'Primary action height below 44px');
        return { phoneLinkBox: box };
      });
    }
    await session.context.close();
  }

  {
    const adminPhoneLight = await authenticate(admin, 390, 'light');
    await loaded(adminPhoneLight.page, source.id);
    await capture(adminPhoneLight.page, 'phone-390-admin-light-overview', { role: 'superadmin', width: 390, theme: 'light', state: 'loaded', simulated: false });
    await capture(adminPhoneLight.page, 'phone-390-admin-no-photo-light', { role: 'superadmin', width: 390, theme: 'light', state: 'loaded', simulated: false });
    await adminPhoneLight.page.route('**/storage/**', route => route.fulfill({ status: 404 }));
    await loaded(adminPhoneLight.page, brokenMediaCourse.id);
    await capture(adminPhoneLight.page, 'phone-390-admin-missing-photo-error', { role: 'superadmin', width: 390, theme: 'light', state: 'loaded', simulated: false });
    await probe('phone-missing-photo-thumbnail-omitted', async () => {
      assert.equal(await adminPhoneLight.page.locator('.h-20.w-20:visible').count(), 0);
      assert.equal(await adminPhoneLight.page.locator('main img:visible').count(), 0);
      return { omittedOnPhone: true };
    });
    await adminPhoneLight.context.close();
  }

  {
    const session = await authenticate(admin, 390, 'dark');
    await loaded(session.page, source.id);
    await session.page.getByRole('button', { name: 'Course actions: ' + source.title, exact: true }).click();
    await session.page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
    await session.page.getByRole('dialog').waitFor();
    await capture(session.page, 'phone-390-superadmin-duplicate-dialog-dark', { role: 'superadmin', width: 390, theme: 'dark', state: 'loaded', simulated: false });
    await session.page.keyboard.press('Escape');
    await session.page.getByRole('dialog').waitFor({ state: 'detached' });

    await session.page.getByRole('button', { name: 'Course actions: ' + source.title, exact: true }).click();
    await session.page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await session.page.getByRole('dialog').waitFor();
    await capture(session.page, 'phone-390-superadmin-delete-dialog-dark', { role: 'superadmin', width: 390, theme: 'dark', state: 'loaded', simulated: false });
    await session.page.keyboard.press('Escape');
    await session.page.getByRole('dialog').waitFor({ state: 'detached' });
    await session.context.close();
  }

  {
    const mentorPhoneLight = await authenticate(mentor, 390, 'light');
    await loaded(mentorPhoneLight.page, source.id);
    await capture(mentorPhoneLight.page, 'phone-390-mentor-light-overview', { role: 'mentor', width: 390, theme: 'light', simulated: false });
    await mentorPhoneLight.context.close();
  }

  {
    const mentorPhoneDark = await authenticate(mentor, 390, 'dark');
    await loaded(mentorPhoneDark.page, source.id);
    await capture(mentorPhoneDark.page, 'phone-390-mentor-dark-overview', { role: 'mentor', width: 390, theme: 'dark', simulated: false });
    await mentorPhoneDark.context.close();
  }

  for (const locale of ['ru', 'tg']) {
    const session = await authenticate(admin, 320, 'light', locale);
    await loaded(session.page, source.id);
    await capture(session.page, 'phone-320-' + locale, { locale, simulated: false });
    await probe('phone-320-' + locale + '-no-document-overflow', async () => {
      await fits(session.page);
      return { locale };
    });
    await session.page.evaluate(() => {
      const values = [...document.querySelectorAll('main, main *')].map(element => ({
        element,
        size: parseFloat(getComputedStyle(element).fontSize),
        line: parseFloat(getComputedStyle(element).lineHeight),
      }));
      for (const value of values) {
        value.element.style.fontSize = value.size * 2 + 'px';
        if (Number.isFinite(value.line)) value.element.style.lineHeight = value.line * 2 + 'px';
      }
    });
    await capture(session.page, 'phone-320-' + locale + '-text-doubled', { locale, textEnlarged: true, simulated: false });
    await probe('phone-320-' + locale + '-enlarged-text-no-document-overflow', async () => {
      await fits(session.page);
      return { locale, enlargement: 2 };
    });
    await session.context.close();
  }

  {
    const session = await authenticate(admin, 320);
    const pattern = '**/api/v1/courses/' + source.id;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await session.page.route(pattern, async route => {
      try {
        await gate;
        await route.continue();
      } catch {}
    });
    try {
      const navigation = session.page.goto(origin + '/courses/' + source.id);
      await session.page.locator('main [class*="animate-pulse"]:visible').first().waitFor();
      await capture(session.page, 'phone-320-loading-SIMULATED-delay', { simulated: true, state: 'loading', reducedMotion: 'reduce' });
      await probe('loading-respects-reduced-motion', async () => {
        const names = await session.page
          .locator('main [class*="animate-pulse"]')
          .evaluateAll(elements => elements.map(element => getComputedStyle(element).animationName));
        assert.ok(names.every(name => name === 'none'), JSON.stringify(names));
        return { names };
      });
      await probe('phone-320-loading-geometry-no-overflow', async () => {
        await fits(session.page);
        return { width: 320 };
      });
      release();
      await navigation;
      await session.page.locator('h1').waitFor({ timeout: 10000 });
    } finally {
      release();
      await session.page.unroute(pattern).catch(() => {});
      await session.context.close();
    }
  }

  {
    const session = await authenticate(admin, 1440);
    await loaded(session.page, source.id);
    const pattern = '**/api/v1/courses/' + source.id;
    await session.page.route(pattern, route => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Credentials': 'true',
          },
        });
      }
      return route.fulfill({
        status: 403,
        json: { detail: 'Access denied' },
        headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' },
      });
    });
    try {
      await session.page.evaluate(() => window.__queryClient?.invalidateQueries({ queryKey: ['courses', 'detail'] }));
      await session.page.getByText('Access denied', { exact: true }).waitFor({ timeout: 10000 });
      await probe('cached-course-hidden-on-refetch-403', async () => {
        assert.equal(await session.page.getByText('Access denied', { exact: true }).count(), 1);
        assert.equal(await session.page.getByText(source.title, { exact: true }).count(), 0);
        return { privacyPreserved: true };
      });
    } finally {
      await session.page.unroute(pattern);
      await session.context.close();
    }
  }

  const denied = await authenticate(unassigned);
  await denied.page.goto(origin + '/courses/' + source.id);
  await denied.page.waitForLoadState('networkidle');
  await denied.page
    .getByText('Failed to load course', { exact: true })
    .or(denied.page.getByText('Access denied', { exact: true }))
    .waitFor({ timeout: 20000 });
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
  console.log(
    JSON.stringify({
      total: probes.length,
      passed: probes.filter(item => item.passed).length,
      failed: probes.filter(item => !item.passed).map(item => item.name),
      pageErrors,
    }),
  );
}
process.exitCode = probes.some(item => !item.passed) || pageErrors.length ? 1 : 0;
