import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const fixture = JSON.parse(input);
const directory = resolve('../docs/redesign-execution/group-01/task-10/takeover');
await mkdir(directory + '/screenshots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true });
const api = 'http://127.0.0.1:18080/api/v1';
const origin = 'http://127.0.0.1:5174';
const student = fixture.identities.find(identity => identity.email === 'student@kitob.example.com');
const admin = fixture.identities.find(identity => identity.role === 'superadmin' && !identity.forced);
assert.ok(student && admin);
const probes = [];
const manifest = [];
const errors = [];
async function session(identity) {
  const response = await fetch(api + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: identity.email, password: fixture.password }) });
  assert.equal(response.status, 200);
  return response.json();
}
const studentToken = (await session(student)).access_token;
const adminToken = (await session(admin)).access_token;
async function json(path, bearer = studentToken, method = 'GET', body) {
  const response = await fetch(api + path, { method, headers: { Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal(response.status, 200, method + ' ' + path);
  return response.json();
}
const profile = await json('/students/me/profile');
const periods = await json('/students/me/journals');
const earliest = profile.courses.filter(entry => entry.bucket === 'active' && entry.next_lesson_at).sort((a, b) => Date.parse(a.next_lesson_at) - Date.parse(b.next_lesson_at))[0];
assert.ok(earliest);
async function open({ width = 1440, height = 1000, theme = 'light', locale = 'ru', timezoneId = 'UTC', reducedMotion = 'no-preference', identity = student, before, enlarge = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, timezoneId, reducedMotion });
  const authenticated = await session(identity);
  await context.addInitScript(({ theme, locale, enlarge, refreshToken }) => {
    if (!localStorage.getItem('imkon-refresh-token')) localStorage.setItem('imkon-refresh-token', refreshToken);
    localStorage.setItem('imkon_theme', theme);
    localStorage.setItem('i18nextLng', locale);
    if (enlarge) addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%'; });
  }, { theme, locale, enlarge, refreshToken: authenticated.refresh_token });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && !response.url().includes('/storage/')) console.error(JSON.stringify({ path: new URL(response.url()).pathname, status: response.status() })); });
  if (before) await before(context, page);
  await page.goto(origin + '/');
  await page.waitForURL(url => url.pathname === '/');
  return { context, page };
}
async function loaded(page) {
  await page.locator('#courses-heading').waitFor().catch(async error => { console.error(JSON.stringify({ url: page.url(), headings: await page.locator('h1').allTextContents() })); await screenshot(page, 'diagnostic-incomplete-render', { diagnostic: true }); throw error; });
  await page.locator('section[aria-labelledby="courses-heading"] a[href^="/my/courses/"]').first().waitFor();
  await page.locator('section[aria-labelledby="result-heading"] details').waitFor();
  await page.locator('section[aria-labelledby="result-heading"] dd').first().waitFor();
}
async function screenshot(page, name, meta = {}) {
  const file = name + '.png';
  await page.screenshot({ path: directory + '/screenshots/' + file, fullPage: false });
  manifest.push({ file, ...meta });
}
async function noOverflow(page) {
  const labelsFit = await page.locator('section[aria-labelledby="metrics-heading"] span.uppercase').evaluateAll(labels => labels.every(label => label.scrollWidth <= label.clientWidth + 1));
  assert.equal(labelsFit, true, 'metric labels must fit inside their own cards');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
}
async function assertLesson(page, locale) {
  const locales = { ru: 'ru-RU', en: 'en-US', tg: 'tg-TJ' };
  const expected = await page.evaluate(({ language, instant }) => new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dushanbe' }).format(new Date(instant)), { language: locales[locale], instant: earliest.next_lesson_at });
  const lesson = page.locator('section[aria-labelledby="next-lesson-heading"]');
  assert.equal((await lesson.locator('div.text-2xl').innerText()).trim(), expected);
  assert.equal((await lesson.locator('h3').innerText()).trim(), earliest.course.title);
  assert.equal(await lesson.locator('a').getAttribute('href'), '/my/courses/' + earliest.course.id);
}
try {
  for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
    const { context, page } = await open({ width, height: width === 390 ? 844 : 1000, theme });
    await loaded(page);
    await assertLesson(page, 'ru');
    assert.equal(await page.locator('header button[aria-label="Уведомления"]:visible').count(), width === 390 ? 0 : 1);
    await noOverflow(page);
    const result = page.locator('section[aria-labelledby="result-heading"]');
    assert.equal(await result.locator('dd').count(), 4);
    assert.deepEqual(await result.locator('dd').allTextContents(), ['0', '0', '0', '0']);
    await screenshot(page, 'student-' + width + '-' + theme, { width, theme, seeded: true });
    if (width === 390) {
      const boxes = await Promise.all(['header', 'section[aria-labelledby="next-lesson-heading"]', 'section[aria-labelledby="metrics-heading"]', 'section[aria-labelledby="courses-heading"]', 'section[aria-labelledby="result-heading"]'].map(selector => page.locator('main ' + selector).first().boundingBox()));
      for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i].y >= boxes[i - 1].y + boxes[i - 1].height - 1);
      const course = page.locator('section[aria-labelledby="courses-heading"] h3').first();
      assert.ok((await course.boundingBox()).y < 779);
      const action = result.locator('a');
      await action.scrollIntoViewIfNeeded();
      const actionBox = await action.boundingBox();
      const nav = page.locator('nav[aria-label]').last();
      const navBox = await nav.boundingBox();
      assert.ok(navBox && actionBox.y + actionBox.height <= navBox.y);
      await screenshot(page, 'student-scrollend-' + theme, { width, theme });
    }
    const firstImage = page.locator('section[aria-labelledby="courses-heading"] img').first();
    await firstImage.waitFor();
    await page.waitForFunction(() => document.querySelector('section[aria-labelledby="courses-heading"] img')?.naturalWidth > 0);
    assert.equal(await firstImage.evaluate(image => image.naturalWidth), 128);
    const fallback = page.locator('section[aria-labelledby="courses-heading"] a[href^="/my/courses/"]').nth(1).locator('[role="img"]');
    await fallback.waitFor();
    assert.equal(await fallback.locator('svg').count(), 1);
    assert.ok(await fallback.getAttribute('aria-label'));
    assert.equal((await fallback.boundingBox()).width, 62);
    const details = result.locator('details');
    await details.locator('summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await details.evaluate(element => element.open), true);
    await screenshot(page, 'student-disclosure-' + width + '-' + theme, { width, theme });
    const settings = page.locator('[data-shell-settings]'); await settings.click(); await page.getByRole('dialog').waitFor(); await screenshot(page, 'student-settings-' + width + '-' + theme, { width, theme, openedSurface: 'settings' }); await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' }); assert.equal(await settings.evaluate(element => element === document.activeElement), true);
    probes.push({ test: 'real-loaded-' + width + '-' + theme, status: 'pass', imageWidth: 128 });
    await context.close();
  }
  for (const width of [320, 768, 1024]) {
    const { context, page } = await open({ width, height: 844 });
    await loaded(page); await noOverflow(page);
    const lesson = await page.locator('section[aria-labelledby="next-lesson-heading"]').boundingBox();
    const result = await page.locator('section[aria-labelledby="result-heading"]').boundingBox();
    assert.ok(result.y > lesson.y);
    await screenshot(page, 'student-width-' + width, { width });
    probes.push({ test: 'responsive-stack-' + width, status: 'pass' });
    await context.close();
  }
  for (const locale of ['en', 'tg']) {
    const { context, page } = await open({ locale }); await loaded(page); await assertLesson(page, locale); await noOverflow(page);
    await screenshot(page, 'student-' + locale, { locale }); await context.close();
  }
  for (const timezoneId of ['America/New_York', 'UTC']) {
    const { context, page } = await open({ timezoneId }); await loaded(page); await assertLesson(page, 'ru');
    const journalDestination = await page.locator('section[aria-labelledby="result-heading"] a').getAttribute('href');
    const latest = periods.find(period => period.journal_id === Number(journalDestination.split('/').at(-1))); assert.ok(latest);
    const expectedDates = await page.evaluate(period => [period.period_start, period.period_end].map(date => new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Dushanbe' }).format(new Date(date))).join(' – '), latest);
    assert.equal(await page.locator('section[aria-labelledby="result-heading"] header p').last().innerText(), expectedDates);
    probes.push({ test: 'exact-school-time-' + timezoneId, status: 'pass' }); await context.close();
  }
  {
    const { context, page } = await open({ enlarge: true }); await loaded(page); await noOverflow(page);
    assert.equal(await page.locator('h1').evaluate(element => parseFloat(getComputedStyle(element).fontSize)), 56);
    const enlargedResult = await page.locator('section[aria-labelledby="result-heading"]').boundingBox(); const enlargedCourses = await page.locator('section[aria-labelledby="courses-heading"]').boundingBox(); assert.ok(enlargedResult.y >= enlargedCourses.y + enlargedCourses.height - 1);
    await screenshot(page, 'student-text-200', { textEnlargement: '200%' }); await context.close();
  }
  for (const email of ['empty.student@kitob.example.com', 'malika@kitob.example.com']) {
    const identity = fixture.identities.find(item => item.email === email); assert.ok(identity);
    const { context, page } = await open({ identity, width: 390, height: 844 });
    await page.locator('section[aria-labelledby="next-lesson-heading"] a[href="/my/courses"]').waitFor();
    await page.locator('section[aria-labelledby="result-heading"] h3').waitFor();
    if (email.startsWith('empty.')) assert.equal(await page.locator('section[aria-labelledby="courses-heading"] a[href^="/my/courses/"]').count(), 0);
    await screenshot(page, email.startsWith('empty.') ? 'student-real-empty' : 'student-real-no-eligible-lesson', { seeded: true });
    probes.push({ test: 'real-state-' + email.split('@')[0], status: 'pass' }); await context.close();
  }
  {
    const peer = fixture.identities.find(item => item.email.includes('zara')); assert.ok(peer);
    const denial = await fetch(api + '/students/' + peer.id + '/profile', { headers: { Authorization: 'Bearer ' + studentToken } });
    assert.equal(denial.status, 403);
    const journal = periods.find(period => period.course_title === 'English IELTS Master'); assert.ok(journal);
    const detail = await json('/journals/' + journal.journal_id);
    assert.equal(detail.students.length, 1);
    assert.equal(detail.students[0].student_id ?? detail.students[0].id, student.id);
    assert.equal(JSON.stringify(detail).includes('private-peer-comment-must-not-leak'), false);
    probes.push({ test: 'actual-authenticated-peer-and-journal-privacy', status: 'pass' });
  }
  {
    const { context, page } = await open({ before: async context => context.route('**/api/v1/students/me/profile', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"simulated failure"}' })) });
    await page.locator('section[aria-labelledby="next-lesson-heading"] button').waitFor();
    await page.locator('section[aria-labelledby="result-heading"] details').waitFor();
    assert.equal(await page.locator('section[aria-labelledby="courses-heading"] h3').count(), 0);
    const metrics = await page.locator('section[aria-labelledby="metrics-heading"]').innerText(); assert.equal(/\b0\b/.test(metrics), false);
    await screenshot(page, 'student-simulated-profile-error', { simulation: 'profile 500' });
    await context.unroute('**/api/v1/students/me/profile');
    await page.locator('section[aria-labelledby="next-lesson-heading"] button').click(); await loaded(page);
    probes.push({ test: 'independent-profile-failure-and-real-retry', status: 'pass' }); await context.close();
  }
  {
    const { context, page } = await open(); await loaded(page);
    let failures = 0;
    await context.route('**/api/v1/students/me/journals**', route => { failures++; return route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"simulated failure"}' }); });
    await page.evaluate(() => window.__queryClient.refetchQueries({ queryKey: ['users', 'students', 'journals', 'me'], exact: false }));
    const result = page.locator('section[aria-labelledby="result-heading"]'); await result.locator('[role="alert"] button').waitFor();
    assert.ok(failures > 0); assert.equal(await result.locator('dd').count(), 4);
    await screenshot(page, 'student-simulated-retained-result', { simulation: 'journal refresh 500' });
    await context.unroute('**/api/v1/students/me/journals**'); await result.locator('[role="alert"] button').click(); await result.locator('[role="alert"]').waitFor({ state: 'hidden' });
    probes.push({ test: 'retained-result-and-real-retry', status: 'pass' }); await context.close();
  }
  {
    const { context, page } = await open({ before: async context => context.route('**/api/v1/students/me/journals**', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"simulated failure"}' })) });
    const result = page.locator('section[aria-labelledby="result-heading"]'); await result.locator('[role="alert"] button').waitFor();
    await assertLesson(page, 'ru'); assert.equal(await result.locator('h3').count(), 0);
    await screenshot(page, 'student-simulated-initial-result-error', { simulation: 'initial journals 500' });
    await context.unroute('**/api/v1/students/me/journals**'); await result.locator('button').click(); await loaded(page);
    probes.push({ test: 'initial-result-error-and-real-retry', status: 'pass' }); await context.close();
  }
  {
    const identity = fixture.identities.find(item => item.email === 'empty.student@kitob.example.com');
    const { context, page } = await open({ identity }); const result = page.locator('section[aria-labelledby="result-heading"]'); await result.locator('h3').waitFor();
    const previousTitle = await result.locator('h3').innerText(); let failures = 0;
    await context.route('**/api/v1/students/me/journals**', route => { failures++; return route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"simulated failure"}' }); });
    await page.evaluate(() => window.__queryClient.refetchQueries({ queryKey: ['users', 'students', 'journals', 'me'], exact: false })); await result.locator('[role="alert"] button').waitFor();
    assert.ok(failures > 0); assert.equal(await result.locator('h3').innerText(), previousTitle);
    await screenshot(page, 'student-simulated-retained-empty', { simulation: 'refresh 500 after genuine empty response' });
    await context.unroute('**/api/v1/students/me/journals**'); await result.locator('button').click(); await result.locator('[role="alert"]').waitFor({ state: 'hidden' });
    probes.push({ test: 'cached-empty-survives-failed-refresh-and-retry', status: 'pass' }); await context.close();
  }
  {
    const { context, page } = await open({ before: async context => context.route('**/api/v1/mentors/*/profile', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"simulated failure"}' })) });
    await loaded(page); await assertLesson(page, 'ru'); await page.getByText('Информация о преподавателе недоступна', { exact: true }).waitFor();
    await screenshot(page, 'student-simulated-mentor-unavailable', { simulation: 'mentor 500' }); probes.push({ test: 'mentor-only-error-preserves-lesson', status: 'pass' }); await context.close();
  }
  {
    const { context, page } = await open(); await loaded(page);
    const result = page.locator('section[aria-labelledby="result-heading"]'); const destination = await result.locator('a').getAttribute('href'); await result.locator('a').click(); await page.waitForURL(url => url.pathname === destination);
    await page.goBack(); await loaded(page); await page.locator('section[aria-labelledby="next-lesson-heading"] a').click(); await page.waitForURL(url => url.pathname === '/my/courses/' + earliest.course.id);
    probes.push({ test: 'permitted-journal-and-course-navigation', status: 'pass' }); await context.close();
  }
  {
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    const { context, page } = await open({ reducedMotion: 'reduce', before: async context => context.route('**/api/v1/students/me/profile', async route => { await waiting; await route.continue(); }) });
    const skeleton = page.locator('section[aria-labelledby="next-lesson-heading"] [role="status"]'); await skeleton.waitFor();
    assert.equal(await skeleton.evaluate(element => getComputedStyle(element).animationName), 'none');
    await screenshot(page, 'student-simulated-loading-reduced-motion', { simulation: 'held profile request', reducedMotion: true });
    release(); await loaded(page); probes.push({ test: 'loading-reduced-motion-computed', status: 'pass' }); await context.close();
  }
} finally { await browser.close(); }
assert.deepEqual(errors, []);
await writeFile(directory + '/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
await writeFile(directory + '/probes.json', JSON.stringify(probes, null, 2) + '\n');
console.log(JSON.stringify({ probes: probes.length, screenshots: manifest.length, pageErrors: errors.length }));
