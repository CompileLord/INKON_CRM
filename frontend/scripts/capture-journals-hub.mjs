import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const fixtures = JSON.parse(input);

const evidenceDir = resolve("../docs/redesign-execution/group-04/hub/evidence");
const screenshotsDir = `${evidenceDir}/screenshots`;
await mkdir(screenshotsDir, { recursive: true });

const previewOrigin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5210";
const apiOrigin = `${fixtures.api_origin}/api/v1`;
const superadmin = fixtures.identities.find((item) => item.role === "superadmin" && !item.forced);
const mentor = fixtures.identities.find((item) => item.role === "mentor" && !item.forced && !item.tag);
const emptyMentor = fixtures.identities.find((item) => item.role === "mentor" && item.tag === "empty");
assert.ok(superadmin && mentor && emptyMentor, "superadmin, mentor and empty mentor fixtures are required");

const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

async function apiLogin(identity) {
  const response = await fetch(`${apiOrigin}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: identity.email, password: fixtures.password }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  return { "Content-Type": "application/json", Authorization: `Bearer ${body.access_token}` };
}

const adminHeaders = await apiLogin(superadmin);
const mentorHeaders = await apiLogin(mentor);

async function createFixtureData() {
  const longFirst = "Bartholomew-Alexandrovich";
  const longLast = "Khodjaev-Abdurakhmonzoda-Yusupov";
  const created = await fetch(`${apiOrigin}/users/`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      email: "long-name-mentor@kitob.example.com",
      first_name: longFirst,
      last_name: longLast,
      role: "mentor",
    }),
  });
  assert.equal(created.status, 201, "long-named mentor must be created");
  const longMentor = await created.json();
  const schedules = [{ day_of_week: 1, time_start: "10:00:00", time_end: "11:30:00" }];
  const base = { description: "Hub capture fixture", start_date: "2026-02-02", end_date: "2026-11-30", price: "700.00", schedules };
  const longTitle =
    "Extraordinarily comprehensive interdisciplinary preparatory programme for international certification examinations and advanced academic writing";
  const definitions = [
    { ...base, title: longTitle, exam_type: "monthly", mentor_id: mentor.id },
    { ...base, title: `${longTitle} (evening cohort)`, exam_type: "weekly", mentor_id: longMentor.id },
    ...Array.from({ length: 8 }, (_, index) => ({
      ...base,
      title: `Capture filler course ${index + 1}`,
      exam_type: index % 2 === 0 ? "weekly" : "monthly",
      mentor_id: longMentor.id,
    })),
  ];
  for (const definition of definitions) {
    const response = await fetch(`${apiOrigin}/courses/`, { method: "POST", headers: adminHeaders, body: JSON.stringify(definition) });
    assert.equal(response.status, 201, `course ${definition.title} must be created: ${response.status}`);
  }
  return { longTitle, longMentorName: `${longFirst} ${longLast}` };
}
const { longMentorName } = await createFixtureData();

const adminList = await (await fetch(`${apiOrigin}/courses/?page_size=100`, { headers: adminHeaders })).json();
const mentorList = await (await fetch(`${apiOrigin}/courses/?page_size=100`, { headers: mentorHeaders })).json();
const emptyHeaders = await apiLogin(emptyMentor);
const emptyList = await (await fetch(`${apiOrigin}/courses/?page_size=100`, { headers: emptyHeaders })).json();
assert.ok(adminList.total > 20, "superadmin catalog must span two pages");
assert.ok(mentorList.total < adminList.total && mentorList.total > 0, "mentor sees a strict subset");
assert.equal(emptyList.total, 0, "empty mentor has no courses");

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const manifest = [];
const probes = [];
const pageErrors = [];

function probe(name, passed, details = {}) {
  const record = { probe: name, passed: Boolean(passed), ...details };
  if (!record.passed) console.error("PROBE_FAIL", JSON.stringify(record));
  probes.push(record);
  assert.ok(record.passed, `Probe failed: ${name} ${JSON.stringify(details)}`);
}

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  await sleep(150);
}

async function shot(page, filename, meta) {
  await settle(page);
  await page.screenshot({ path: `${screenshotsDir}/${filename}`, fullPage: false });
  manifest.push({ file: filename, ...meta });
}

async function applyTheme(page, theme) {
  await page.evaluate((value) => {
    document.documentElement.classList.toggle("dark", value === "dark");
    document.documentElement.setAttribute("data-theme", value);
    localStorage.setItem("imkon_theme", value);
  }, theme);
}

async function session(identity, { lng = "en", viewport = { width: 1440, height: 1000 }, theme = "light" } = {}) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(
    ([language, mode]) => {
      localStorage.setItem("i18nextLng", language);
      localStorage.setItem("imkon_theme", mode);
    },
    [lng, theme],
  );
  const page = await context.newPage();
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !/status of (4|5)|Failed to load resource|ERR_FAILED/.test(message.text())) {
      pageErrors.push(message.text());
    }
  });
  await page.goto(`${previewOrigin}/login`);
  await page.locator("#email").fill(identity.email);
  await page.locator("#password").fill(fixtures.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
  await applyTheme(page, theme);
  await page.waitForLoadState("networkidle");
  requests.length = 0;
  return { context, page, requests };
}

async function openHub(page, search = "") {
  await page.goto(`${previewOrigin}/journals${search}`);
  await waitHubSettled(page);
}

async function waitHubSettled(page) {
  await page.waitForFunction(
    () =>
      !document.querySelector('[aria-busy="true"]') &&
      (document.querySelector('a[href^="/journals/"]') || document.querySelector("main h2") || document.querySelector('[role="alert"]')),
    undefined,
    { timeout: 20000 },
  );
}

async function metrics(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('main li > a[href^="/journals/"]')];
    const search = document.querySelector("main input[type='text']");
    const main = document.querySelector("main");
    return {
      rowCount: rows.length,
      minRowHeight: rows.length ? Math.min(...rows.map((row) => row.getBoundingClientRect().height)) : null,
      searchHeight: search ? search.getBoundingClientRect().height : null,
      searchWidth: search ? search.getBoundingClientRect().width : null,
      mainWidth: main ? main.getBoundingClientRect().width - parseFloat(getComputedStyle(main).paddingLeft) - parseFloat(getComputedStyle(main).paddingRight) : null,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      scrollY: window.scrollY,
    };
  });
}

const viewportLabel = ({ width, height }) => `${width}x${height}`;
const DESKTOP = { width: 1440, height: 1000 };
const PHONE = { width: 390, height: 844 };

for (const [role, identity] of [["superadmin", superadmin], ["mentor", mentor]]) {
  for (const [viewport, tag] of [[DESKTOP, "desktop"], [PHONE, "phone"]]) {
    for (const theme of ["light", "dark"]) {
      const { context, page, requests } = await session(identity, { viewport, theme });
      await openHub(page);
      const m = await metrics(page);
      const expectedTotal = role === "superadmin" ? adminList.total : mentorList.total;
      probe(`${role} ${tag} ${theme}: rows are real links of at least 80px`, m.rowCount > 0 && m.minRowHeight >= 80, m);
      probe(`${role} ${tag} ${theme}: no horizontal overflow`, m.horizontalOverflow <= 0, m);
      probe(`${role} ${tag} ${theme}: search is at least 48px high`, m.searchHeight >= 47.5, m);
      if (tag === "phone") probe(`${role} phone: search sits on its own full-width line`, m.searchWidth >= m.mainWidth - 1, m);
      const stat = await page.locator("main").innerText();
      probe(`${role} ${tag} ${theme}: stat preamble removed`, !/My Students|Needs Grading|Total Journals/.test(stat));
      probe(`${role} ${tag} ${theme}: result count describes server total`, new RegExp(`${expectedTotal} journals`).test(stat), { expectedTotal });
      const mentorRequests = requests.filter((url) => /\/mentors\/?(\?|$)/.test(url));
      const profileRequests = requests.filter((url) => /\/(users|mentors)\/\d+/.test(url));
      if (role === "mentor") {
        probe("mentor: no mentor directory request", mentorRequests.length === 0, { mentorRequests });
        probe("mentor: no mentor identity rendered on rows", !(await page.locator("main").innerText()).includes(longMentorName));
      } else {
        probe("superadmin: exactly one mentor directory request", mentorRequests.length === 1, { mentorRequests });
      }
      probe(`${role} ${tag} ${theme}: no per-row profile request`, profileRequests.length === 0, { profileRequests });
      await shot(page, `${role}-hub-${tag}-${theme}.png`, { role, viewport: viewportLabel(viewport), theme, state: "loaded", locale: "en" });
      await context.close();
    }
  }
}

{
  const { context, page } = await session(superadmin, { viewport: DESKTOP });
  await openHub(page);
  const nested = await page.evaluate(() =>
    [...document.querySelectorAll('main li > a[href^="/journals/"]')].map(
      (row) => row.querySelectorAll("a, button, input, select, textarea, [tabindex]").length,
    ),
  );
  probe("rows contain no nested interactive controls", nested.every((count) => count === 0), { nested });
  const firstRow = page.locator('main li > a[href^="/journals/"]').first();
  const restBackground = await firstRow.evaluate((node) => getComputedStyle(node).backgroundColor);
  await firstRow.hover();
  await sleep(300);
  const hovered = await firstRow.evaluate((node) => ({ background: getComputedStyle(node).backgroundColor, transform: getComputedStyle(node).transform, shadow: getComputedStyle(node).boxShadow }));
  probe("row hover changes background only (no lift, no shadow)", hovered.background !== restBackground && hovered.transform === "none" && hovered.shadow === "none", { restBackground, hovered });
  await shot(page, "superadmin-hub-desktop-row-hover.png", { role: "superadmin", viewport: viewportLabel(DESKTOP), theme: "light", state: "row hover", locale: "en" });
  await page.mouse.move(2, 2);
  await page.locator("main input[type='text']").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    return { href: el?.getAttribute("href"), shadow: el ? getComputedStyle(el).boxShadow : "" };
  });
  probe("keyboard focus reaches a row link with a visible ring", Boolean(focused.href?.startsWith("/journals/")) && focused.shadow !== "none", focused);
  await shot(page, "superadmin-hub-desktop-row-focus.png", { role: "superadmin", viewport: viewportLabel(DESKTOP), theme: "light", state: "keyboard focus on first row", locale: "en" });
  await context.close();
}

for (const width of [320, 768, 1024]) {
  const { context, page } = await session(superadmin, { viewport: { width, height: width === 320 ? 700 : 900 } });
  await openHub(page);
  const m = await metrics(page);
  probe(`superadmin ${width}px: no horizontal overflow`, m.horizontalOverflow <= 0, m);
  probe(`superadmin ${width}px: rows at least 80px`, m.minRowHeight >= 80, m);
  const touch = await page.evaluate(() =>
    [...document.querySelectorAll("main button")].filter((button) => button.offsetParent !== null).map((button) => Math.round(button.getBoundingClientRect().height)),
  );
  probe(`superadmin ${width}px: toolbar buttons are at least 44px`, touch.every((height) => height >= 44), { touch });
  if (width < 1024) probe(`superadmin ${width}px: search on its own line`, m.searchWidth >= m.mainWidth - 1, m);
  else probe("superadmin 1024px: search sits beside the filters", m.searchWidth < m.mainWidth - 100, m);
  await shot(page, `superadmin-hub-${width}.png`, { role: "superadmin", viewport: `${width}`, theme: "light", state: "loaded", locale: "en" });
  await context.close();
}

for (const viewport of [DESKTOP, PHONE]) {
  const tag = viewport.width === 1440 ? "desktop" : "phone";
  const { context, page } = await session(superadmin, { viewport });
  await openHub(page);
  await page.locator("main input[type='text']").fill("Extraordinarily");
  await waitHubSettled(page);
  const text = await page.locator("main").innerText();
  probe(`long names ${tag}: loaded-page scope label shown`, /Found on this page: \d+ of \d+/.test(text) && text.includes("not the whole catalog"));
  probe(`long names ${tag}: long mentor name rendered in full`, text.includes(longMentorName));
  const m = await metrics(page);
  probe(`long names ${tag}: no horizontal overflow`, m.horizontalOverflow <= 0, m);
  await shot(page, `superadmin-hub-${tag}-long-names-search.png`, { role: "superadmin", viewport: viewportLabel(viewport), theme: "light", state: "long course and mentor names with search scope label", locale: "en" });
  await context.close();
}

{
  const { context, page } = await session(superadmin, { viewport: DESKTOP });
  await openHub(page);
  await page.locator('nav[aria-label] button[aria-label="Next page"]').first().click().catch(async () => {
    await page.getByRole("button", { name: "Next page" }).click();
  });
  await page.waitForURL(/page=2/);
  await waitHubSettled(page);
  const m = await metrics(page);
  probe("superadmin page 2 loads remaining rows from the server", m.rowCount === adminList.total - 20, { ...m, expected: adminList.total - 20 });
  await shot(page, "superadmin-hub-desktop-page-2.png", { role: "superadmin", viewport: viewportLabel(DESKTOP), theme: "light", state: "server page 2", locale: "en" });
  await page.getByRole("button", { name: "Archived" }).click();
  await page.waitForFunction(() => !location.search.includes("page="));
  probe("changing the status filter drops the page offset", !page.url().includes("page="), { url: page.url() });
  await page.goto(`${previewOrigin}/journals?page=9`);
  await page.waitForFunction(() => location.search === "?page=2", undefined, { timeout: 15000 });
  probe("an out-of-range page is normalized to the last real page", page.url().endsWith("?page=2"), { url: page.url() });
  await context.close();
}

{
  const { context, page } = await session(emptyMentor, { viewport: DESKTOP });
  await openHub(page);
  await shot(page, "mentor-hub-desktop-empty-catalog.png", { role: "mentor (real mentor with no assigned courses)", viewport: viewportLabel(DESKTOP), theme: "light", state: "empty catalog", locale: "en" });
  probe("empty catalog explains permitted courses and has no clear action", (await page.locator("main").innerText()).includes("permitted to open") && (await page.getByRole("button", { name: "Clear search and filters" }).count()) === 0 && (await page.locator("main input[type='text']").count()) === 0 && !(await page.locator("main").innerText()).includes("0 journals"));
  await page.setViewportSize(PHONE);
  await shot(page, "mentor-hub-phone-empty-catalog.png", { role: "mentor (real mentor with no assigned courses)", viewport: viewportLabel(PHONE), theme: "light", state: "empty catalog", locale: "en" });
  await context.close();
}

for (const viewport of [DESKTOP, PHONE]) {
  const tag = viewport.width === 1440 ? "desktop" : "phone";
  const { context, page } = await session(mentor, { viewport });
  await openHub(page);
  await page.locator("main input[type='text']").fill("zzzz-no-such-course");
  await page.waitForFunction(() => document.body.innerText.includes("No journals match"));
  probe(`no-match ${tag}: distinct no-match state with clear action`, (await page.getByRole("button", { name: "Clear search and filters" }).count()) === 1 && !(await page.locator("main").innerText()).includes("No journals yet"));
  await shot(page, `mentor-hub-${tag}-no-match.png`, { role: "mentor", viewport: viewportLabel(viewport), theme: "light", state: "no match", locale: "en" });
  await page.getByRole("button", { name: "Clear search and filters" }).click();
  await waitHubSettled(page);
  probe(`no-match ${tag}: Clear restores the list`, (await metrics(page)).rowCount === mentorList.total && page.url().endsWith("/journals"));
  await context.close();
}

{
  const { context, page } = await session(mentor, { viewport: DESKTOP });
  await page.route(/\/api\/v1\/courses\/\?/, () => new Promise(() => {}));
  await page.goto(`${previewOrigin}/journals`);
  await page.waitForSelector('[aria-busy="true"]');
  const skeleton = await page.evaluate(() => ({
    rows: document.querySelectorAll('main ul[aria-busy="true"] > li').length,
    height: Math.round(document.querySelector('main ul[aria-busy="true"] > li').getBoundingClientRect().height),
  }));
  probe("skeleton rows share the 80px row geometry", skeleton.rows >= 4 && skeleton.height >= 80, skeleton);
  await shot(page, "mentor-hub-desktop-skeleton-simulated.png", { role: "mentor", viewport: viewportLabel(DESKTOP), theme: "light", state: "loading skeleton (SIMULATION: course request held open)", locale: "en", simulation: true });
  await context.close();
}

{
  const { context, page } = await session(mentor, { viewport: PHONE });
  await page.route(/\/api\/v1\/courses\/\?/, (route) => route.abort());
  await page.goto(`${previewOrigin}/journals`);
  await page.waitForFunction(() => document.body.innerText.includes("Failed to load journals"), undefined, { timeout: 30000 });
  await shot(page, "mentor-hub-phone-error-simulated.png", { role: "mentor", viewport: viewportLabel(PHONE), theme: "light", state: "error with Retry (SIMULATION: course request aborted)", locale: "en", simulation: true });
  await page.unroute(/\/api\/v1\/courses\/\?/);
  await page.getByRole("button", { name: "Retry" }).click();
  await waitHubSettled(page);
  probe("Retry refetches and replaces the error with rows", (await metrics(page)).rowCount === mentorList.total);
  await context.close();
}

{
  const { context, page } = await session(mentor, { viewport: DESKTOP });
  await openHub(page);
  await page.route(/\/api\/v1\/courses\/\?/, (route) => route.abort());
  await page.evaluate(() => {
    window.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForSelector('[role="alert"]', { timeout: 30000 });
  const m = await metrics(page);
  probe("background refresh failure keeps rows and shows a local alert", m.rowCount === mentorList.total && !(await page.locator('[aria-busy="true"]').count()));
  await shot(page, "mentor-hub-desktop-refresh-failed-simulated.png", { role: "mentor", viewport: viewportLabel(DESKTOP), theme: "light", state: "background refresh failure keeps rows (SIMULATION: refetch aborted)", locale: "en", simulation: true });
  await context.close();
}

{
  const { context, page } = await session(mentor, { viewport: PHONE });
  await openHub(page);
  await page.locator("main input[type='text']").fill("module");
  await waitHubSettled(page);
  const filteredCount = (await metrics(page)).rowCount;
  await page.evaluate(() => window.scrollTo({ top: 360, behavior: "instant" }));
  await sleep(200);
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const target = page.locator('main li > a[href^="/journals/"]').nth(4);
  const targetTitle = (await target.innerText()).split("\n")[0];
  await target.click();
  await page.waitForURL(/\/journals\/\d+$/);
  await page.getByRole("link", { name: "Journals" }).first().click();
  await page.waitForURL(/\/journals\?/);
  await waitHubSettled(page);
  await sleep(500);
  const after = await metrics(page);
  const restoredQuery = await page.locator("main input[type='text']").inputValue();
  probe("return from a journal restores the query", restoredQuery === "module" && page.url().includes("q=module"), { url: page.url(), restoredQuery });
  probe("return from a journal restores the filtered rows", after.rowCount === filteredCount, { filteredCount, after });
  probe("return from a journal restores scroll position", Math.abs(after.scrollY - scrollBefore) <= 2 && scrollBefore > 0, { scrollBefore, after: after.scrollY });
  await shot(page, "mentor-hub-phone-returned-from-journal.png", { role: "mentor", viewport: viewportLabel(PHONE), theme: "light", state: `returned from journal "${targetTitle}" via plain Back to Journals link; query module and scroll ${scrollBefore} restored`, locale: "en" });
  await context.close();
}

{
  const { context, page } = await session(superadmin, { viewport: DESKTOP });
  await openHub(page, "?page=2");
  await page.locator('main li > a[href^="/journals/"]').first().click();
  await page.waitForURL(/\/journals\/\d+$/);
  await page.getByRole("link", { name: "Journals" }).first().click();
  await page.waitForURL(/\/journals\?page=2/);
  probe("return from a journal keeps the server page", page.url().endsWith("?page=2"), { url: page.url() });
  await context.close();
}

for (const [lng, label] of [["ru", "Russian"], ["tg", "Tajik"]]) {
  for (const [identity, role, viewport, tag] of [[superadmin, "superadmin", DESKTOP, "desktop"], [mentor, "mentor", PHONE, "phone"]]) {
    const { context, page } = await session(identity, { lng, viewport });
    await openHub(page);
    const m = await metrics(page);
    probe(`${lng} ${role} ${tag}: no horizontal overflow`, m.horizontalOverflow <= 0, m);
    await shot(page, `${role}-hub-${tag}-${lng}.png`, { role, viewport: viewportLabel(viewport), theme: "light", state: "loaded", locale: lng, note: label });
    await context.close();
  }
}

{
  const { context, page } = await session(superadmin, { lng: "ru", viewport: PHONE, theme: "dark" });
  await openHub(page);
  await page.locator("main input[type='text']").fill("Extraordinarily");
  await waitHubSettled(page);
  await shot(page, "superadmin-hub-phone-ru-dark-search-scope.png", { role: "superadmin", viewport: viewportLabel(PHONE), theme: "dark", state: "search scope label", locale: "ru" });
  await context.close();
}

probe("no unexpected page or console errors", pageErrors.length === 0, { pageErrors: pageErrors.slice(0, 5) });
await browser.close();
await writeFile(`${evidenceDir}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
await writeFile(`${evidenceDir}/probes.json`, JSON.stringify(probes, null, 2) + "\n");
console.log(JSON.stringify({ screenshots: manifest.length, probes: probes.length, passed: probes.filter((p) => p.passed).length }));
