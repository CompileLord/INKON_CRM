import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const fixture = JSON.parse(input);
const administrator = fixture.identities.find(item => item.role === "superadmin" && !item.forced);
const mentor = fixture.identities.find(item => item.role === "mentor" && !item.forced);
assert.ok(administrator && mentor);
const api = `${fixture.api_origin}/api/v1`;
const origin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5206";
const evidence = resolve("../docs/redesign-execution/group-03/mentor-profile/page/evidence");
await mkdir(resolve(evidence, "screenshots"), { recursive: true });
const manifest = [];
const probes = [];
const errors = [];
const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });

async function open(account, options = {}) {
  const { width = 1440, height = 1000, theme = "light", locale = "en", enlarged = false, reducedMotion = "no-preference" } = options;
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion });
  await context.addInitScript(({ theme, locale, enlarged }) => {
    localStorage.setItem("imkon_theme", theme);
    localStorage.setItem("i18nextLng", locale);
    if (enlarged) new MutationObserver((_records, observer) => { if (document.documentElement) { document.documentElement.style.fontSize = "32px"; observer.disconnect(); } }).observe(document, { childList: true });
  }, { theme, locale, enlarged });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(`${JSON.stringify(options)} ${error.message} ${(error.stack || "").split("\n").slice(0, 3).join(" | ")}`));
  return { context, page, options: { width, height, theme, locale, enlarged, role: account.role } };
}

async function enter(page, account) {
  await page.goto(`${origin}/login?redirect=${encodeURIComponent(`/mentors/${mentor.id}`)}`);
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(fixture.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url => url.pathname === `/mentors/${mentor.id}`);
}

async function capture(page, name, metadata = {}) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => undefined))));
  await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"]')].every(element => {
    let node = element;
    while (node) { if (Number(getComputedStyle(node).opacity) < 1) return false; node = node.parentElement; }
    return true;
  }));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const geometry = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(geometry.scroll <= geometry.client + 1, `${name}: horizontal overflow ${JSON.stringify(geometry)}`);
  await page.screenshot({ path: resolve(evidence, "screenshots", `${name}.png`), fullPage: Boolean(metadata.fullPage) });
  manifest.push({ file: `${name}.png`, ...metadata });
  probes.push({ probe: `${name}-horizontal-fit`, passed: true, ...geometry });
}

try {
  for (const account of [administrator, mentor]) {
    for (const theme of ["light", "dark"]) {
      for (const [width, height] of [[1440, 1000], [390, 844]]) {
        const session = await open(account, { width, height, theme });
        const { page, context } = session;
        await enter(page, account);
        await page.getByRole("heading", { level: 1 }).waitFor();
        const prefix = `${account.role}-${width}-${theme}`;
        await capture(page, `${prefix}-courses`, { ...session.options, seeded: true });
        if (width === 390) {
          const geometry = await page.evaluate(() => {
            const title = document.querySelector('a[href^="/courses/"]');
            const navigation = [...document.querySelectorAll("nav")].find(element => getComputedStyle(element).position === "fixed" && element.getBoundingClientRect().top > window.innerHeight / 2);
            return { titleBottom: title ? title.getBoundingClientRect().bottom : null, navigationTop: navigation ? navigation.getBoundingClientRect().top : null };
          });
          assert.ok(geometry.titleBottom !== null && geometry.navigationTop !== null, `${prefix}: course title or bottom navigation missing`);
          assert.ok(geometry.titleBottom <= geometry.navigationTop, `${prefix}: first course title is below bottom navigation ${JSON.stringify(geometry)}`);
          assert.equal(await page.getByRole("tab", { name: "Courses", exact: true }).getAttribute("aria-selected"), "true");
          probes.push({ probe: `${prefix}-first-course-title-above-bottom-navigation`, passed: true, ...geometry });
        }
        const avatar = await page.locator("h1").locator("../..").locator("[data-loading-avatar]").count();
        assert.equal(avatar, 0);
        const summary = page.locator("[data-profile-summary]");
        assert.equal(await summary.locator(":scope > div").count(), 3);
        const coursesTab = page.getByRole("tab", { name: "Courses", exact: true });
        await coursesTab.focus();
        await page.keyboard.press("ArrowRight");
        assert.equal(await page.getByRole("tab", { name: "Courses", exact: true }).getAttribute("aria-selected"), "true");
        await page.keyboard.press("Enter");
        assert.equal(await page.getByRole("tab", { name: "Performance", exact: true }).getAttribute("aria-selected"), "true");
        await page.getByRole("heading", { name: "Course and student totals", exact: true }).waitFor();
        await page.getByText("Loading course and student totals…", { exact: true }).waitFor({ state: "hidden" });
        await capture(page, `${prefix}-performance`, { ...session.options, seeded: true });
        const course = page.getByRole("navigation", { name: "Active course context" }).locator("a").first();
        if (await course.count()) {
          await course.click();
          await page.waitForURL(url => url.pathname.startsWith("/courses/"));
          await page.goBack();
          await page.getByRole("tab", { name: "Performance", exact: true }).waitFor();
          assert.equal(await page.getByRole("tab", { name: "Performance", exact: true }).getAttribute("aria-selected"), "true");
          probes.push({ probe: `${prefix}-course-roundtrip`, passed: true });
        }
        await page.getByRole("tab", { name: "Documents", exact: true }).click();
        await page.getByRole("tabpanel", { name: "Documents", exact: true }).waitFor();
        await capture(page, `${prefix}-documents-boundary`, { ...session.options, seeded: true, description: "Existing owner-keyed Documents pane; complete pane redesign belongs to KITOB-03-06" });
        if (account.role === "mentor") {
          assert.equal(await page.getByRole("button", { name: "Edit Teacher", exact: true }).count(), 0);
          assert.equal(await page.getByText("Account access", { exact: true }).count(), 0);
          assert.equal(await page.getByRole("link", { name: "Back to Dashboard", exact: true }).getAttribute("href"), "/");
          probes.push({ probe: `${prefix}-self-actions-denied`, passed: true });
        } else {
          await page.getByText("Account access", { exact: true }).click();
          await page.getByText("Credentials are unavailable in this profile", { exact: true }).waitFor();
          await capture(page, `${prefix}-account-access`, { ...session.options, seeded: true });
          const menu = page.getByRole("button", { name: /^Teacher actions:/ });
          await menu.click();
          await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
          await page.getByRole("dialog").waitFor();
          await capture(page, `${prefix}-delete-confirmation`, { ...session.options, seeded: true, description: "confirmation only; deletion is not confirmed" });
          await page.getByRole("button", { name: "Cancel", exact: true }).click();
          await page.getByRole("dialog").waitFor({ state: "hidden" });
          await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Teacher actions:"));
          probes.push({ probe: `${prefix}-delete-cancel-restores-menu-focus`, passed: true });
          await menu.click();
          await page.getByRole("menuitem", { name: "Edit", exact: true }).waitFor();
          await capture(page, `${prefix}-menu`, { ...session.options, seeded: true });
          await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
          const dialog = page.getByRole("dialog", { name: "Edit Teacher", exact: true });
          await dialog.waitFor();
          await capture(page, `${prefix}-edit`, { ...session.options, seeded: true });
          const firstName = dialog.getByLabel(/First Name/);
          await firstName.fill((await firstName.inputValue()) + " changed");
          await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
          await page.getByRole("dialog", { name: "Discard unsaved changes?", exact: true }).waitFor();
          await capture(page, `${prefix}-discard`, { ...session.options, seeded: true });
          await page.getByRole("button", { name: "Discard", exact: true }).click();
          await dialog.waitFor({ state: "hidden" });
          await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Teacher actions:"));
          probes.push({ probe: `${prefix}-dirty-dismissal-and-menu-focus`, passed: true });
        }
        await context.close();
      }
    }
  }
  for (const options of [{ width: 320 }, { width: 768 }, { width: 1024 }, { width: 390, locale: "ru" }, { width: 390, locale: "tg", theme: "dark" }, { width: 390, enlarged: true }, { width: 390, reducedMotion: "reduce" }]) {
    const session = await open(administrator, options);
    await enter(session.page, administrator);
    await session.page.getByRole("heading", { level: 1 }).waitFor();
    await capture(session.page, `stress-${options.width}${options.locale ? `-${options.locale}` : ""}${options.theme ? `-${options.theme}` : ""}${options.enlarged ? "-text200" : ""}${options.reducedMotion ? "-reduced-motion" : ""}`, { ...session.options, seeded: true, fullPage: Boolean(options.enlarged) });
    if (options.reducedMotion === "reduce") {
      assert.equal(await session.page.evaluate(() => document.getAnimations().length), 0);
      probes.push({ probe: "reduced-motion-has-no-nonessential-animation", passed: true });
    }
    await session.context.close();
  }
  for (const state of ["loading", "error", "empty", "analytics-error", "analytics-loading", "analytics-empty", "details-open", "long-missing-media"]) {
    const session = await open(administrator, { width: 390, theme: "dark" });
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    let fail = state === "error" || state === "analytics-error";
    const pattern = state.startsWith("analytics") ? `**/api/v1/mentors/${mentor.id}/analytics` : `**/api/v1/mentors/${mentor.id}/profile`;
    await session.page.route(pattern, async route => {
      if (state === "loading" || state === "analytics-loading") await pending;
      if (state === "analytics-empty") {
        const response = await route.fetch();
        const body = await response.json();
        body.average_student_score = 0;
        body.average_student_score_summary_count = 0;
        body.average_student_score_grading_state = "missing";
        return route.fulfill({ response, json: body });
      }
      if (state === "analytics-loading") return route.fulfill({ status: 503, json: { detail: "Released after capture" } });
      if (fail) return route.fulfill({ status: 503, json: { detail: "Labeled isolated unavailable simulation" } });
      const response = await route.fetch();
      const body = await response.json();
      if (state === "empty") body.active_courses = [];
      if (state === "details-open") body.user.date_of_birth = "1984-03-12";
      if (state === "long-missing-media") {
        body.user.first_name = "Муҳаммадалишоҳ-Муҳаммадалишоҳ-Муҳаммадалишоҳ";
        body.user.last_name = "Абдураҳмонзода-Абдураҳмонзода";
        body.user.thumbnail_path = "/storage/avatar/missing.png";
        body.user.photo_path = "/storage/avatar/missing.png";
        body.avg_score_defined_ratios_mean = null;
      }
      await route.fulfill({ response, json: body });
    });
    await enter(session.page, administrator);
    if (state === "loading") {
      await session.page.locator("[data-loading-avatar]").waitFor();
      const bounds = await session.page.locator("[data-loading-avatar]").boundingBox();
      assert.equal(bounds.width, 48);
      assert.equal(bounds.height, 48);
    } else if (state === "error") await session.page.getByRole("button", { name: "Retry", exact: true }).waitFor();
    else {
      await session.page.getByRole("heading", { level: 1 }).waitFor();
      if (state.startsWith("analytics")) {
        await session.page.getByRole("tab", { name: "Performance", exact: true }).click();
        if (state === "analytics-error") await session.page.getByRole("button", { name: "Retry", exact: true }).waitFor();
        if (state === "analytics-loading") await session.page.getByText("Loading course and student totals…", { exact: true }).waitFor();
        if (state === "analytics-empty") await session.page.getByText("No period summaries have been recorded.", { exact: true }).first().waitFor();
      }
      if (state === "details-open") {
        await session.page.getByText("Personal details", { exact: true }).click();
        await session.page.getByText("Date of Birth", { exact: false }).first().waitFor();
      }
      if (state === "empty") await session.page.getByText("No active courses", { exact: true }).waitFor();
    }
    await capture(session.page, `simulated-${state}`, { ...session.options, simulation: true, description: state });
    release();
    if (state === "loading") {
      await session.page.getByRole("heading", { level: 1 }).waitFor();
      probes.push({ probe: "loading-resolves-to-identity", passed: true });
    }
    if (state === "analytics-loading") {
      await session.page.getByRole("button", { name: "Retry", exact: true }).waitFor();
      probes.push({ probe: "analytics-loading-resolves-to-independent-error-with-retry", passed: true });
    }
    if (fail) {
      fail = false;
      await session.page.getByRole("button", { name: "Retry", exact: true }).click();
      await session.page.getByRole("button", { name: "Retry", exact: true }).waitFor({ state: "hidden" });
      if (state === "error") await session.page.getByRole("heading", { level: 1 }).waitFor();
      if (state === "analytics-error") await session.page.getByText("Recorded points · unverified", { exact: true }).waitFor();
      probes.push({ probe: `${state}-working-retry`, passed: true });
    }
    await session.context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(evidence, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(resolve(evidence, "probes.json"), JSON.stringify({ probes, browserErrors: errors }, null, 2) + "\n");
  process.stdout.write(`PASS: ${manifest.length} captures, ${probes.length} probes, no browser errors\n`);
} finally {
  await browser.close();
}
