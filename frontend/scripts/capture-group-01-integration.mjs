import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const fixture = JSON.parse(input);
const origin = process.env.KITOB_PREVIEW_ORIGIN ?? 'http://127.0.0.1:5174';
const directory = resolve('../docs/redesign-execution/group-01/task-12');
await mkdir(directory + '/screenshots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true });
const manifest = [], probes = [], errors = [];
let currentPage, currentCase;
async function capture(page, name, data = {}) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
  });
  await page.screenshot({ path: directory + '/screenshots/' + name + '.png' });
  manifest.push({ file: name + '.png', ...data });
}
async function fits(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.equal(await page.locator('main').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
}
try {
  for (const role of ['superadmin', 'mentor', 'student', 'accountant']) for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
    const identity = fixture.identities.find(identity => identity.role === role && !identity.forced);
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, colorScheme: theme, reducedMotion: 'reduce' });
    await context.addInitScript(({ theme }) => { if (!localStorage.getItem('i18nextLng')) localStorage.setItem('i18nextLng', 'en'); if (!localStorage.getItem('imkon_theme')) localStorage.setItem('imkon_theme', theme); }, { theme });
    const page = await context.newPage(); page.on('pageerror', error => errors.push({ role, width, theme, error: error.message }));
    currentPage = page; currentCase = { role, width, theme };
    await page.goto(origin + '/login');
    await page.locator('#email').fill(identity.email); await page.locator('#password').fill(fixture.password);
    const landing = role === 'student' ? '/students/' + identity.id : role === 'mentor' ? '/mentors/' + identity.id : '/';
    await page.locator('button[type="submit"]').click(); await page.waitForURL(url => url.pathname === landing);
    await page.locator('main h1').waitFor();
    if (landing !== '/') {
      await page.locator('a[href="/"]').filter({ visible: true }).first().click(); await page.waitForURL(url => url.pathname === '/');
    }
    await page.locator('main h1').waitFor();
    await page.waitForFunction(() => !document.querySelector('main [aria-busy="true"], main [class*="animate-pulse"]'));
    const actualIdentity = await page.evaluate(async () => {
      const store = (await import('/src/store/authStore.ts')).useAuthStore.getState();
      return { userId: store.userId, role: store.role };
    });
    assert.equal(actualIdentity.userId, identity.id); assert.equal(actualIdentity.role, role);
    const heading = await page.locator('main h1').evaluate(element => ({ size: getComputedStyle(element).fontSize, weight: getComputedStyle(element).fontWeight, lineHeight: getComputedStyle(element).lineHeight }));
    assert.deepEqual(heading, { size: width === 390 ? '24px' : '28px', weight: '600', lineHeight: width === 390 ? '32px' : '36px' });
    await fits(page); await capture(page, role + '-' + width + '-' + theme + '-home', { role, width, theme, realSeeded: true, state: 'loaded' });
    if (width === 390 && ['student', 'accountant'].includes(role)) {
      assert.equal(await page.locator('header').getByRole('button', { name: 'Notifications', exact: true }).filter({ visible: true }).count(), 0);
      const inbox = page.locator('a[href="/notifications"]').filter({ visible: true });
      assert.equal(await inbox.count(), 1); assert.ok((await inbox.innerText()).includes('Notifications'));
    }
    const settings = page.locator('[data-shell-settings]');
    await settings.hover(); await settings.focus(); assert.equal(await page.getByRole('dialog').count(), 0);
    await settings.press('Enter'); await page.getByRole('dialog').waitFor(); assert.equal(await page.getByRole('dialog').count(), 1);
    await capture(page, role + '-' + width + '-' + theme + '-settings', { role, width, theme, openedSurface: 'settings' });
    await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await settings.evaluate(element => element === document.activeElement), true);
    await settings.click(); await page.getByRole('dialog').waitFor();
    await page.setViewportSize({ width: width === 390 ? 1024 : 768, height: 844 });
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflowY !== 'hidden'), true);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const destination = role === 'student' ? '/my/courses' : role === 'accountant' ? '/finance' : '/courses';
    const link = page.locator('a[href="' + destination + '"]').filter({ visible: true }).first();
    await link.click(); await page.waitForURL(url => url.pathname === destination); await page.locator('main').waitFor();
    console.log(JSON.stringify({ ...currentCase, phase: 'before-back', path: new URL(page.url()).pathname, historyIndex: await page.evaluate(() => history.state?.idx) }));
    await page.goBack(); await page.waitForURL(url => url.pathname === '/'); await page.locator('main h1').waitFor();
    await page.reload(); await page.locator('main h1').waitFor();
    const restored = await page.evaluate(async () => {
      const store = (await import('/src/store/authStore.ts')).useAuthStore.getState();
      return { userId: store.userId, role: store.role };
    });
    assert.deepEqual(restored, actualIdentity);
    if (['student', 'mentor'].includes(role)) {
      if (width === 390) { await page.getByRole('button', { name: 'More', exact: true }).click(); await page.getByRole('dialog').waitFor(); }
      const ownPath = '/' + (role === 'student' ? 'students' : 'mentors') + '/' + identity.id;
      await page.locator('a[href="' + ownPath + '"]').filter({ visible: true }).first().click(); await page.waitForURL(url => url.pathname === ownPath);
      assert.equal(await page.getByRole('dialog').count(), 0);
      await page.waitForFunction(() => !document.querySelector('main [aria-busy="true"]'));
      assert.equal(await page.getByText('Permission denied', { exact: true }).count(), 0);
      await capture(page, role + '-' + width + '-' + theme + '-authorized-self-profile', { role, width, theme, scope: 'existing Group03 page reached through genuine canonical identity; not a Group03 redesign acceptance' });
      await page.goBack(); await page.waitForURL(url => url.pathname === '/');
    }
    for (const narrow of [320, 768, 1024]) {
      await page.setViewportSize({ width: narrow, height: 844 }); await fits(page);
    }
    await settings.click(); await page.getByRole('dialog').waitFor();
    await page.getByRole('dialog').getByRole('button', { name: theme === 'dark' ? 'Light theme' : 'Dark theme', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Русский', exact: true }).click();
    await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.reload(); await page.locator('main h1').waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('i18nextLng')), 'ru');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme !== 'dark');
    probes.push({ test: role + '-' + width + '-' + theme + '-real-login-canonical-restoration-role-navigation-overlays-and-breakpoints', status: 'pass' });
    await context.close();
  }
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    await capture(currentPage, 'FAIL-navigation', { ...currentCase, diagnostic: true });
    console.log(JSON.stringify({ verdict: 'FAIL', ...currentCase, path: new URL(currentPage.url()).pathname, historyIndex: await currentPage.evaluate(() => history.state?.idx) }));
  }
  throw error;
} finally { await browser.close(); }
assert.deepEqual(errors, []);
await writeFile(directory + '/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
await writeFile(directory + '/probes.json', JSON.stringify(probes, null, 2) + '\n');
console.log(JSON.stringify({ roleThemeViewportCases: probes.length, screenshots: manifest.length, pageErrors: errors.length, mutations: 'only real login/refresh rotations in isolated fixture database' }));
