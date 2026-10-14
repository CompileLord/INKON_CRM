import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const fixture = JSON.parse(input);
const administrator = fixture.identities.find(item => item.role === "superadmin" && !item.forced);
const students = fixture.identities.filter(item => item.role === "student" && !item.forced);
const mentors = fixture.identities.filter(item => item.role === "mentor" && !item.forced);
const student = students[0];
const mentor = mentors[0];
const emptyMentor = mentors[mentors.length - 1];
assert.ok(administrator && student && mentor && emptyMentor && mentor.id !== emptyMentor.id);
const api = `${fixture.api_origin}/api/v1`;
const origin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5208";
const evidence = resolve("../docs/redesign-execution/group-03/integration/evidence");
await mkdir(resolve(evidence, "screenshots"), { recursive: true });
const manifest = [];
const probes = [];
const errors = [];
const failedRequests = [];

const authentication = await fetch(`${api}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: administrator.email, password: fixture.password }) });
assert.equal(authentication.status, 200);
const token = (await authentication.json()).access_token;
const pdf = "%PDF-1.7\nisolated fixture";
async function seed(ownerType, ownerId, name) {
  const form = new FormData();
  form.append("file", new Blob([pdf], { type: "application/pdf" }), name);
  form.append("owner_type", ownerType);
  form.append("owner_id", String(ownerId));
  const response = await fetch(`${api}/documents/`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  assert.equal(response.status, 201, `${name}: ${response.status}`);
}
const probeStudents = [];
for (let index = 1; index <= 12; index++) {
  const created = await fetch(`${api}/users/`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ email: `directory-probe-${index}@kitob.example.com`, first_name: `Directoryprobe${String(index).padStart(2, "0")}`, last_name: "Student", role: "student" }) });
  assert.equal(created.status, 201, `student create ${index}: ${created.status}`);
  probeStudents.push(await created.json());
}
for (let index = 1; index <= 22; index++) await seed("student", student.id, `integration-student-${String(index).padStart(2, "0")}.pdf`);
for (let index = 1; index <= 3; index++) await seed("mentor", mentor.id, `integration-mentor-${index}.pdf`);

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });

async function open(options = {}) {
  const { width = 1440, height = 1000, theme = "light", locale = "en" } = options;
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
  await context.addInitScript(({ theme, locale }) => {
    localStorage.setItem("imkon_theme", theme);
    localStorage.setItem("i18nextLng", locale);
  }, { theme, locale });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(`${JSON.stringify(options)} ${error.message}`));
  page.on("response", response => {
    if (response.status() >= 400 && response.url().includes("/api/v1/")) failedRequests.push({ scenario: currentScenario, url: new URL(response.url()).pathname + new URL(response.url()).search, status: response.status() });
  });
  return { context, page, options: { width, height, theme, locale } };
}
let currentScenario = "setup";

async function enter(page, account, path) {
  await page.goto(`${origin}/login?redirect=${encodeURIComponent(path)}`);
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(fixture.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url => url.pathname === path.split("?")[0]);
}

async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => undefined))));
  await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"]')].every(element => {
    let node = element;
    while (node) { if (Number(getComputedStyle(node).opacity) < 1) return false; node = node.parentElement; }
    return true;
  }));
  await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
}

async function capture(page, name, metadata = {}) {
  await settle(page);
  const geometry = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(geometry.scroll <= geometry.client + 1, `${name}: horizontal overflow ${JSON.stringify(geometry)}`);
  await page.screenshot({ path: resolve(evidence, "screenshots", `${name}.png`) });
  manifest.push({ file: `${name}.png`, ...metadata });
  probes.push({ probe: `${name}-horizontal-fit`, passed: true, ...geometry });
}

function probe(name, passed, detail = {}) {
  probes.push({ probe: name, passed, ...detail });
  assert.ok(passed, `${name} ${JSON.stringify(detail)}`);
}

const documentsLabel = { en: "Documents", ru: "Документы", tg: "Ҳуҷҷатҳо" };
async function openDocuments(page, locale = "en") {
  await page.getByRole("tab", { name: documentsLabel[locale], exact: true }).click();
  await page.getByRole("heading", { level: 2, name: documentsLabel[locale], exact: true }).waitFor();
}
const pathOf = page => {
  const url = new URL(page.url());
  const parameters = new URLSearchParams();
  if (url.searchParams.get("q")) parameters.set("q", url.searchParams.get("q"));
  parameters.set("page", url.searchParams.get("page") ?? "1");
  parameters.set("pageSize", url.searchParams.get("pageSize") ?? "20");
  return `${url.pathname}?${parameters}`;
};

try {
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    for (const theme of ["light", "dark"]) {
      currentScenario = `students-directory-roundtrip-${width}-${theme}`;
      const session = await open({ width, height, theme });
      const { page } = session;
      await enter(page, administrator, "/students?pageSize=10");
      await page.locator("a[href^='/students/']:visible").first().waitFor();
      const search = page.getByPlaceholder(/./).first();
      await search.fill("directoryprobe");
      await page.waitForURL(url => url.searchParams.get("q") === "directoryprobe");
      await page.locator("a[href^='/students/']:visible").first().waitFor();
      const hasSecondPage = await page.getByRole("button", { name: "2", exact: true }).count() > 0;
      if (hasSecondPage) {
        await page.getByRole("button", { name: "2", exact: true }).click();
        await page.waitForURL(url => url.searchParams.get("page") === "2");
        await page.waitForFunction(() => [...document.querySelectorAll("a[href^='/students/']")].filter(element => element.getClientRects().length > 0).length === 2);
      }
      const links = page.locator("a[href^='/students/']:visible");
      const targetIndex = Math.min(2, (await links.count()) - 1);
      const directoryPath = pathOf(page);
      await page.evaluate(() => window.scrollTo(0, Math.min(document.documentElement.scrollHeight, 300)));
      const directoryScroll = await page.evaluate(() => window.scrollY);
      const targetHref = await links.nth(targetIndex).getAttribute("href");
      const targetName = (await links.nth(targetIndex).innerText()).trim();
      await capture(page, `students-directory-before-${width}-${theme}`, { ...session.options, description: `Directory q=directoryprobe ${hasSecondPage ? "page 2 " : ""}before opening ${targetName}` });
      await links.nth(targetIndex).click();
      await page.waitForURL(url => url.pathname === targetHref);
      await page.getByRole("tab").first().waitFor();
      await openDocuments(page);
      await capture(page, `student-profile-documents-from-directory-${width}-${theme}`, { ...session.options, description: "Profile opened from filtered directory, Documents tab selected" });
      await page.locator("a", { hasText: /Back to Students/ }).click();
      await page.waitForURL(url => url.pathname === "/students");
      await page.locator("a[href^='/students/']:visible").first().waitFor();
      probe(`students-back-restores-url-${width}-${theme}`, pathOf(page) === directoryPath, { expected: directoryPath, actual: pathOf(page) });
      probe(`students-back-restores-search-input-${width}-${theme}`, (await page.getByPlaceholder(/./).first().inputValue()) === "directoryprobe");
      await page.waitForTimeout(400);
      const restoredScroll = await page.evaluate(() => window.scrollY);
      probe(`students-back-restores-scroll-${width}-${theme}`, Math.abs(restoredScroll - directoryScroll) < 120 || directoryScroll === 0, { directoryScroll, restoredScroll });
      await capture(page, `students-directory-restored-${width}-${theme}`, { ...session.options, description: "Back from profile restores query, page and scroll" });
      const otherHref = await page.locator("a[href^='/students/']:visible").nth(targetIndex === 0 ? 1 : 0).getAttribute("href");
      await page.locator("a[href^='/students/']:visible").nth(targetIndex === 0 ? 1 : 0).click();
      await page.waitForURL(url => url.pathname === otherHref);
      await page.getByRole("tab", { name: "Courses", exact: true }).waitFor();
      probe(`students-other-profile-starts-on-courses-${width}-${theme}`, (await page.getByRole("tab", { name: "Courses", exact: true }).getAttribute("aria-selected")) === "true");
      await session.context.close();
    }
  }

  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    for (const theme of ["light", "dark"]) {
      currentScenario = `mentors-directory-roundtrip-${width}-${theme}`;
      const session = await open({ width, height, theme });
      const { page } = session;
      await enter(page, administrator, "/mentors?pageSize=10");
      await page.locator("a[href^='/mentors/']:visible").first().waitFor();
      await page.getByPlaceholder(/./).first().fill("fixture");
      await page.waitForURL(url => url.searchParams.get("q") === "fixture");
      await page.locator("a[href^='/mentors/']:visible").first().waitFor();
      const directoryPath = pathOf(page);
      await capture(page, `mentors-directory-before-${width}-${theme}`, { ...session.options, description: "Mentors directory filtered by fixture" });
      const link = page.locator("a[href^='/mentors/']:visible").first();
      const href = await link.getAttribute("href");
      await link.click();
      await page.waitForURL(url => url.pathname === href);
      await page.getByRole("tab", { name: "Performance", exact: true }).click();
      await page.locator("a", { hasText: /Back to Teachers/ }).click();
      await page.waitForURL(url => url.pathname === "/mentors");
      await page.locator("a[href^='/mentors/']:visible").first().waitFor();
      probe(`mentors-back-restores-url-${width}-${theme}`, pathOf(page) === directoryPath, { expected: directoryPath, actual: pathOf(page) });
      probe(`mentors-back-restores-search-input-${width}-${theme}`, (await page.getByPlaceholder(/./).first().inputValue()) === "fixture");
      await capture(page, `mentors-directory-restored-${width}-${theme}`, { ...session.options, description: "Back from mentor profile restores the filter" });
      const secondLink = page.locator("a[href^='/mentors/']:visible").nth(1);
      if (await secondLink.count()) {
        const secondHref = await secondLink.getAttribute("href");
        await secondLink.click();
        await page.waitForURL(url => url.pathname === secondHref);
        await page.getByRole("tab", { name: "Courses", exact: true }).waitFor();
        probe(`mentors-other-profile-starts-on-courses-${width}-${theme}`, (await page.getByRole("tab", { name: "Courses", exact: true }).getAttribute("aria-selected")) === "true");
      }
      await session.context.close();
    }
  }

  currentScenario = "owner-leak-student-to-mentor-documents";
  {
    const session = await open({});
    const { page } = session;
    await enter(page, administrator, `/students/${student.id}`);
    await openDocuments(page);
    await page.getByRole("button", { name: "2", exact: true }).click();
    await page.getByRole("button", { name: "2", exact: true }).and(page.locator('[aria-current="page"]')).waitFor();
    await page.goto(`${origin}/mentors/${mentor.id}`);
    await page.getByRole("tab", { name: "Documents", exact: true }).waitFor();
    probe("mentor-profile-opens-on-courses", (await page.getByRole("tab", { name: "Courses", exact: true }).getAttribute("aria-selected")) === "true");
    await openDocuments(page);
    await page.locator("li").first().waitFor();
    probe("mentor-documents-first-page-after-student-page-2", (await page.getByRole("button", { name: "2", exact: true }).and(page.locator('[aria-current="page"]')).count()) === 0);
    probe("mentor-documents-show-only-mentor-files", (await page.locator("li").filter({ hasText: "integration-student" }).count()) === 0);
    await session.context.close();
  }

  currentScenario = "spa-navigation-student-to-student-documents";
  {
    const session = await open({});
    const { page } = session;
    await enter(page, administrator, `/students/${student.id}`);
    await openDocuments(page);
    await page.getByRole("button", { name: "2", exact: true }).click();
    await page.getByRole("button", { name: "2", exact: true }).and(page.locator('[aria-current="page"]')).waitFor();
    await page.locator("a", { hasText: /Back to Students/ }).click();
    await page.waitForURL(url => url.pathname === "/students");
    await page.locator("a[href^='/students/']:visible").first().waitFor();
    const other = students.find(item => item.id !== student.id);
    await page.locator(`a[href="/students/${other.id}"]:visible`).first().click();
    await page.getByRole("tab", { name: "Courses", exact: true }).waitFor();
    probe("student-other-via-directory-tab-courses", (await page.getByRole("tab", { name: "Courses", exact: true }).getAttribute("aria-selected")) === "true");
    await openDocuments(page);
    await page.waitForTimeout(500);
    probe("student-other-documents-no-prior-owner-files", (await page.locator("li").filter({ hasText: "integration-student" }).count()) === 0);
    await session.context.close();
  }

  const roleViews = [
    { key: "mentor-assigned-student", account: mentor, path: `/students/${student.id}`, expectName: /Student Fixture/ },
    { key: "mentor-self", account: mentor, path: `/mentors/${mentor.id}`, expectName: /Mentor Fixture/ },
    { key: "student-self", account: student, path: `/students/${student.id}`, expectName: /Student Fixture/ },
  ];
  for (const view of roleViews) {
    for (const [width, height] of [[1440, 1000], [390, 844]]) {
      for (const theme of ["light", "dark"]) {
        currentScenario = `${view.key}-${width}-${theme}`;
        const session = await open({ width, height, theme });
        const { page } = session;
        await enter(page, view.account, view.path);
        await page.getByRole("heading", { level: 1, name: view.expectName }).waitFor();
        probe(`${view.key}-${width}-${theme}-no-mutation-controls`, (await page.getByRole("button", { name: /^(Edit|Edit Teacher|Delete|Upload Document)$/ }).count()) === 0);
        await openDocuments(page);
        await page.locator("li").first().waitFor();
        probe(`${view.key}-${width}-${theme}-documents-read-only`, (await page.getByRole("button", { name: /^Actions for/ }).count()) === 0 && (await page.getByRole("button", { name: "Upload Document", exact: true }).count()) === 0);
        await capture(page, `${view.key}-documents-${width}-${theme}`, { ...session.options, description: `${view.key} documents pane, read only` });
        await session.context.close();
      }
    }
  }

  currentScenario = "mentor-forbidden-pages";
  {
    const session = await open({});
    const { page } = session;
    await enter(page, mentor, `/mentors/${mentor.id}`);
    const failedBefore = failedRequests.length;
    await page.goto(`${origin}/mentors/${emptyMentor.id}`);
    await page.waitForTimeout(1200);
    probe("mentor-other-mentor-profile-no-data-requests", failedRequests.length === failedBefore && !(await page.locator("body").innerText()).includes("Davron"), { path: pathOf(page) });
    await capture(page, "mentor-other-mentor-denied", { ...session.options, description: "Mentor opening another mentor profile is denied without leaking data" });
    await page.goto(`${origin}/students`);
    await page.waitForTimeout(800);
    probe("mentor-students-directory-redirected", new URL(page.url()).pathname !== "/students", { path: pathOf(page) });
    await page.goto(`${origin}/mentors`);
    await page.waitForTimeout(800);
    probe("mentor-mentors-directory-redirected", new URL(page.url()).pathname !== "/mentors", { path: pathOf(page) });
    await session.context.close();
  }
  currentScenario = "student-forbidden-pages";
  {
    const session = await open({});
    const { page } = session;
    await enter(page, student, `/students/${student.id}`);
    const other = students.find(item => item.id !== student.id);
    await page.goto(`${origin}/students/${other.id}`);
    await page.waitForTimeout(1200);
    probe("student-other-student-denied", new URL(page.url()).pathname !== `/students/${other.id}` || !(await page.locator("body").innerText()).includes(other.email), { path: pathOf(page) });
    await page.goto(`${origin}/mentors/${mentor.id}`);
    await page.waitForTimeout(800);
    probe("student-mentor-profile-denied", new URL(page.url()).pathname !== `/mentors/${mentor.id}`, { path: pathOf(page) });
    await capture(page, "student-mentor-profile-denied", { ...session.options, description: "Student opening a mentor profile is redirected" });
    await session.context.close();
  }

  for (const locale of ["ru", "tg"]) {
    currentScenario = `locale-${locale}`;
    const session = await open({ width: 390, height: 844, theme: "dark", locale });
    const { page } = session;
    await enter(page, administrator, "/students?pageSize=10");
    await page.locator("a[href^='/students/']:visible").first().waitFor();
    await capture(page, `students-directory-${locale}-390-dark`, { ...session.options, description: `Students directory in ${locale}` });
    await page.locator("a[href^='/students/']:visible").first().click();
    await page.getByRole("tab").first().waitFor();
    await openDocuments(page, locale);
    await capture(page, `student-profile-documents-${locale}-390-dark`, { ...session.options, description: `Student documents in ${locale}` });
    await page.goto(`${origin}/mentors/${mentor.id}`);
    await page.getByRole("tab", { name: documentsLabel[locale], exact: true }).click();
    await page.locator("li").first().waitFor();
    await capture(page, `mentor-profile-documents-${locale}-390-dark`, { ...session.options, description: `Mentor documents in ${locale}` });
    await session.context.close();
  }

  currentScenario = "upload-then-directory-roundtrip";
  for (const [width, height, theme] of [[1440, 1000, "light"], [390, 844, "dark"]]) {
    const session = await open({ width, height, theme });
    const { page } = session;
    await enter(page, administrator, `/mentors/${mentor.id}`);
    await openDocuments(page);
    await page.locator("li").first().waitFor();
    const name = `integration-upload-${width}.pdf`;
    await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "application/pdf", buffer: Buffer.from(pdf) });
    await page.getByText(/Saved\./).waitFor();
    await page.locator("li").filter({ hasText: name }).first().waitFor();
    probe(`upload-${width}-new-file-first-row`, (await page.locator("li").first().innerText()).includes(name));
    await capture(page, `mentor-documents-after-upload-${width}-${theme}`, { ...session.options, description: "Admin upload shows the new file first in the profile pane" });
    await page.locator("a", { hasText: /Back to Teachers/ }).click();
    await page.waitForURL(url => url.pathname === "/mentors");
    await page.locator(`a[href="/mentors/${mentor.id}"]:visible`).first().click();
    await page.getByRole("tab", { name: "Documents", exact: true }).waitFor();
    probe(`upload-${width}-reopened-profile-on-courses`, (await page.getByRole("tab", { name: "Courses", exact: true }).getAttribute("aria-selected")) === "true");
    await openDocuments(page);
    await page.locator("li").filter({ hasText: name }).first().waitFor();
    probe(`upload-${width}-persisted-after-reopen`, true);
    await session.context.close();
  }

  currentScenario = "edit-refreshes-directory-and-profile";
  for (const kind of ["students", "mentors"]) {
    const session = await open({});
    const { page } = session;
    const target = kind === "students" ? students.find(item => item.id !== student.id) : mentor;
    await enter(page, administrator, "/" + kind);
    await page.locator(`a[href="/${kind}/${target.id}"]:visible`).first().waitFor();
    await page.locator(`a[href="/${kind}/${target.id}"]:visible`).first().click();
    await page.waitForURL(url => url.pathname === `/${kind}/${target.id}`);
    await page.getByRole("button", { name: kind === "students" ? /^Edit$/ : /^Edit Teacher$/ }).first().click();
    const renamed = `Renamed${kind === "students" ? "Student" : "Mentor"}`;
    const field = page.getByLabel(/^First Name/);
    await field.fill(renamed);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("heading", { level: 1, name: new RegExp(renamed) }).waitFor();
    probe(`${kind}-edit-refreshes-profile-identity`, true);
    await page.locator("a", { hasText: kind === "students" ? /Back to Students/ : /Back to Teachers/ }).click();
    await page.waitForURL(url => url.pathname === "/" + kind);
    await page.locator(`a[href="/${kind}/${target.id}"]:visible`).first().waitFor();
    probe(`${kind}-edit-refreshes-directory-row`, (await page.locator(`a[href="/${kind}/${target.id}"]:visible`).first().innerText()).includes(renamed), { text: await page.locator(`a[href="/${kind}/${target.id}"]:visible`).first().innerText() });
    await session.context.close();
  }

  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    currentScenario = `mentor-unassigned-student-${width}`;
    const session = await open({ width, height, theme: "light" });
    const { page } = session;
    const unassigned = probeStudents[probeStudents.length - 1];
    await enter(page, mentor, `/mentors/${mentor.id}`);
    await page.goto(`${origin}/students/${unassigned.id}`);
    await page.getByRole("heading", { level: 1, name: "No access to this profile" }).waitFor({ timeout: 4000 });
    const bodyText = await page.locator("body").innerText();
    probe(`mentor-unassigned-student-${width}-single-403`, failedRequests.filter(item => item.scenario === currentScenario).length === 1, { requests: failedRequests.filter(item => item.scenario === currentScenario) });
    probe(`mentor-unassigned-student-${width}-no-identity-and-no-retry`, !bodyText.includes(unassigned.email) && !bodyText.includes("Directoryprobe") && (await page.getByRole("button", { name: "Retry" }).count()) === 0);
    probe(`mentor-unassigned-student-${width}-return-link`, (await page.locator("main a, a").filter({ hasText: /Back to Dashboard/ }).count()) > 0);
    await capture(page, `profile-forbidden-student-${width}`, { ...session.options, description: "403 profile state: no-access heading and one line, return link only" });
    await session.context.close();

    currentScenario = `profile-not-found-${width}`;
    const missing = await open({ width, height, theme: "dark" });
    await enter(missing.page, administrator, "/students");
    await missing.page.goto(`${origin}/students/987654`);
    await missing.page.getByRole("heading", { level: 1, name: "Profile not found" }).waitFor({ timeout: 4000 });
    probe(`student-404-${width}-state-without-retry`, (await missing.page.getByRole("button", { name: "Retry" }).count()) === 0 && failedRequests.filter(item => item.scenario === currentScenario).length === 1, { requests: failedRequests.filter(item => item.scenario === currentScenario) });
    await capture(missing.page, `profile-not-found-student-${width}`, { ...missing.options, description: "404 student profile state, return link only" });
    await missing.page.goto(`${origin}/mentors/987654`);
    await missing.page.getByRole("heading", { level: 1, name: "Profile not found" }).waitFor({ timeout: 4000 });
    probe(`mentor-404-${width}-state-without-retry`, (await missing.page.getByRole("button", { name: "Retry" }).count()) === 0);
    await capture(missing.page, `profile-not-found-mentor-${width}`, { ...missing.options, description: "404 mentor profile state, return link only" });
    await missing.context.close();

    currentScenario = `profile-5xx-${width}`;
    const failing = await open({ width, height, theme: "light" });
    let fail = true;
    await failing.page.route(new RegExp(`/api/v1/students/${student.id}/profile`), route => fail ? route.fulfill({ status: 503, json: { detail: "Labeled isolated unavailable simulation" } }) : route.continue());
    await enter(failing.page, administrator, "/students");
    await failing.page.goto(`${origin}/students/${student.id}`);
    await failing.page.getByRole("heading", { level: 1, name: "Could not load the profile" }).waitFor({ timeout: 20000 });
    probe(`student-5xx-${width}-retry-and-return-link`, (await failing.page.getByRole("button", { name: "Retry" }).count()) === 1 && (await failing.page.locator("a", { hasText: /Back to Students/ }).count()) > 0);
    await capture(failing.page, `profile-load-failed-student-${width}`, { ...failing.options, simulation: true, description: "Simulated 503 profile state: heading, line, Retry and return link" });
    fail = false;
    await failing.page.getByRole("button", { name: "Retry" }).click();
    await failing.page.getByRole("heading", { level: 1, name: /Student Fixture/ }).waitFor();
    probe(`student-5xx-${width}-retry-recovers`, true);
    await failing.context.close();
  }

  for (const [width, height, theme] of [[1440, 1000, "light"], [390, 844, "dark"]]) {
    currentScenario = `tajik-formats-${width}`;
    const session = await open({ width, height, theme, locale: "tg" });
    const { page } = session;
    await enter(page, administrator, `/students/${student.id}`);
    await page.getByRole("heading", { level: 1, name: /Student Fixture/ }).waitFor();
    await openDocuments(page, "tg");
    await page.locator("li").first().waitFor();
    const text = await page.locator("main").innerText().catch(() => page.locator("body").innerText());
    probe(`tg-${width}-day-first-numeric-dates`, /\b\d{2}[./]\d{2}[./]\d{4}\b/.test(text) && !/\b10\/15\/2026\b/.test(text), { sample: (text.match(/\b\d{2}[./]\d{2}[./]\d{4}\b/) ?? [""])[0] });
    probe(`tg-${width}-decimal-comma-average`, /37,5/.test(text) && !/37\.5/.test(text));
    await capture(page, `profile-tajik-formats-${width}`, { ...session.options, description: "Tajik student profile: day-first dates and decimal comma average" });
    await session.context.close();
  }

  currentScenario = "delete-from-profile-updates-directory";
  {
    const session = await open({});
    const { page } = session;
    await enter(page, administrator, "/students?pageSize=10&q=directoryprobe");
    await page.locator("a[href^='/students/']:visible").first().waitFor();
    const link = page.locator("a[href^='/students/']:visible").first();
    const href = await link.getAttribute("href");
    await link.click();
    await page.waitForURL(url => url.pathname === href);
    await page.getByRole("button", { name: /^Student actions/ }).first().click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
    await page.waitForURL(url => url.pathname === "/students");
    await page.waitForFunction(id => !document.querySelector(`a[href="${id}"]`), href);
    probe("delete-from-profile-returns-to-directory-without-row", true, { href, path: pathOf(page) });
    await session.context.close();
  }

  currentScenario = "overlays";
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    const session = await open({ width, height, theme: "light" });
    const { page } = session;
    await enter(page, administrator, `/students/${student.id}`);
    if (width >= 768) await page.getByRole("button", { name: /^Edit$/ }).first().click();
    else {
      await page.getByRole("button", { name: /^Student actions/ }).first().click();
      await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
    }
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    const inertSibling = await page.evaluate(() => { const main = document.querySelector("main"); return main ? (main.hasAttribute("inert") || main.closest("[inert]") !== null || main.closest("[aria-hidden='true']") !== null) : null; });
    await capture(page, `student-edit-overlay-${width}`, { ...session.options, description: "Edit panel over the profile", inertSibling });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    const focusReturned = await page.evaluate(() => document.activeElement?.textContent?.trim());
    probe(`student-edit-overlay-${width}-focus-returns-to-trigger`, width >= 768 ? focusReturned === "Edit" : /Student actions/.test(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "")), { focusReturned });
    await openDocuments(page);
    await page.locator("li").first().waitFor();
    await page.getByRole("button", { name: /^Actions for/ }).first().click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("menuitem", { name: "Delete", exact: true }).waitFor({ state: "hidden" });
    const menuFocus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
    probe(`documents-menu-${width}-escape-returns-focus`, /^Actions for/.test(menuFocus), { menuFocus });
    await session.context.close();
  }

  currentScenario = "states";
  {
    const session = await open({ width: 390, height: 844, theme: "dark" });
    const { page } = session;
    let fail = true;
    await page.route(/\/api\/v1\/students\/\?/, async route => fail ? route.fulfill({ status: 503, json: { detail: "Labeled isolated unavailable simulation" } }) : route.continue());
    await enter(page, administrator, "/students");
    await page.getByRole("button", { name: "Retry", exact: true }).first().waitFor();
    await capture(page, "simulated-students-directory-error", { ...session.options, simulation: true, description: "Students directory 503 simulation with Retry" });
    fail = false;
    await page.getByRole("button", { name: "Retry", exact: true }).first().click();
    await page.locator("a[href^='/students/']:visible").first().waitFor();
    probe("students-directory-retry-works", true);
    await session.context.close();
  }

  currentScenario = "final";
  assert.deepEqual(errors, []);
  probes.push({ probe: "unexpected-http-failures", passed: true, failedRequests });
  await writeFile(resolve(evidence, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(resolve(evidence, "probes.json"), JSON.stringify({ probes, browserErrors: errors, failedRequests }, null, 2) + "\n");
  process.stdout.write(`PASS: ${manifest.length} captures, ${probes.length} probes, ${failedRequests.length} http>=400 responses, no browser errors\n`);
} catch (error) {
  await writeFile("/tmp/kitob0307-failure.json", JSON.stringify({ message: String(error), scenario: currentScenario, probes, failedRequests }, null, 2));
  throw error;
} finally {
  await browser.close();
}
