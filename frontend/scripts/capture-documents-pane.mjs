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
const origin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5207";
const evidence = resolve("../docs/redesign-execution/group-03/documents/pane/evidence");
await mkdir(resolve(evidence, "screenshots"), { recursive: true });
const manifest = [];
const probes = [];
const errors = [];

const authentication = await fetch(`${api}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: administrator.email, password: fixture.password }) });
assert.equal(authentication.status, 200);
const token = (await authentication.json()).access_token;

async function seed(ownerType, ownerId, name, type, content) {
  const form = new FormData();
  form.append("file", new Blob([content], { type }), name);
  form.append("owner_type", ownerType);
  form.append("owner_id", String(ownerId));
  const response = await fetch(`${api}/documents/`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  assert.equal(response.status, 201, `${name}: ${response.status}`);
}

const pdf = "%PDF-1.7\nisolated fixture";
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);
const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40)]);
for (let index = 1; index <= 22; index++) await seed("student", student.id, `attendance-report-${String(index).padStart(2, "0")}.pdf`, "application/pdf", pdf + "x".repeat(index * 700));
await seed("student", student.id, "photo-of-signed-parental-consent-form.png", "image/png", png);
await seed("student", student.id, "pronunciation-recording-unit-4.mp3", "audio/mpeg", Buffer.concat([Buffer.from("ID3"), Buffer.alloc(3 * 1024 * 1024 + 300000)]));
await seed("student", student.id, "notes.txt", "text/plain", "plain text notes");
await seed("student", student.id, "quarterly-attendance-and-grade-summary-for-the-intermediate-english-group-final-reviewed-version-two.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx);
for (const name of ["teaching-certificate.pdf", "contract-2026.pdf", "id-scan.pdf"]) await seed("mentor", mentor.id, name, "application/pdf", pdf);
await seed("mentor", mentor.id, "classroom-photo.png", "image/png", png);

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });

async function open(options = {}) {
  const { width = 1440, height = 1000, theme = "light", locale = "en", enlarged = false } = options;
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
  await context.addInitScript(({ theme, locale, enlarged }) => {
    localStorage.setItem("imkon_theme", theme);
    localStorage.setItem("i18nextLng", locale);
    if (enlarged) new MutationObserver((_records, observer) => { if (document.documentElement) { document.documentElement.style.fontSize = "32px"; observer.disconnect(); } }).observe(document, { childList: true });
  }, { theme, locale, enlarged });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(`${JSON.stringify(options)} ${error.message}`));
  return { context, page, options: { width, height, theme, locale, enlarged } };
}

async function enter(page, account, path) {
  await page.goto(`${origin}/login?redirect=${encodeURIComponent(path)}`);
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(fixture.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url => url.pathname === path);
}

async function openDocuments(page, locale = "en") {
  const label = { en: "Documents", ru: "Документы", tg: "Ҳуҷҷатҳо" }[locale];
  await page.getByRole("tab", { name: label, exact: true }).click();
  await page.getByRole("heading", { level: 2, name: label, exact: true }).waitFor();
}

async function centerOn(page, selector) {
  await page.evaluate(target => document.querySelector(target).scrollIntoView({ block: "center" }), selector);
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
  await page.screenshot({ path: resolve(evidence, "screenshots", `${name}.png`), fullPage: Boolean(metadata.fullPage) });
  manifest.push({ file: `${name}.png`, ...metadata });
  probes.push({ probe: `${name}-horizontal-fit`, passed: true, ...geometry });
}

async function assertTouchTargets(page, name) {
  const small = await page.evaluate(() => [...document.querySelectorAll("li button, li [role=button]")].map(element => element.getBoundingClientRect()).filter(box => box.width > 0 && (box.width < 43.5 || box.height < 43.5)).length);
  assert.equal(small, 0, `${name}: row controls smaller than 44px`);
  probes.push({ probe: `${name}-row-controls-44px`, passed: true });
}

try {
  const roles = [
    { key: "admin-student", account: administrator, path: `/students/${student.id}`, manage: true },
    { key: "admin-mentor", account: administrator, path: `/mentors/${mentor.id}`, manage: true },
    { key: "student-self", account: student, path: `/students/${student.id}`, manage: false },
    { key: "mentor-self", account: mentor, path: `/mentors/${mentor.id}`, manage: false },
  ];
  for (const role of roles) {
    for (const theme of ["light", "dark"]) {
      for (const [width, height] of [[1440, 1000], [390, 844]]) {
        const session = await open({ width, height, theme });
        await enter(session.page, role.account, role.path);
        await openDocuments(session.page);
        await session.page.locator("li").first().waitFor();
        const name = `${role.key}-${width}-${theme}`;
        assert.equal(await session.page.getByRole("button", { name: "Upload Document", exact: true }).count(), role.manage ? 1 : 0);
        assert.equal(await session.page.getByRole("button", { name: /^Actions for/ }).count() > 0, role.manage);
        await assertTouchTargets(session.page, name);
        await capture(session.page, name, { ...session.options, role: role.key, seeded: true });
        probes.push({ probe: `${name}-role-controls`, passed: true, manage: role.manage });
        if (width === 390) {
          await session.page.evaluate(() => document.querySelector("li").scrollIntoView({ block: "start" }));
          await capture(session.page, `${name}-rows`, { ...session.options, role: role.key, seeded: true, description: "Rows scrolled into view" });
        }
        await session.context.close();
      }
    }
  }

  for (const options of [{ width: 320 }, { width: 768 }, { width: 1024 }, { width: 390, locale: "ru" }, { width: 1440, locale: "tg", theme: "dark" }, { width: 390, locale: "tg" }, { width: 390, enlarged: true }]) {
    const session = await open(options);
    await enter(session.page, administrator, `/students/${student.id}`);
    await openDocuments(session.page, options.locale ?? "en");
    await session.page.locator("li").first().waitFor();
    const name = `admin-student-stress-${options.width}${options.locale ? `-${options.locale}` : ""}${options.theme ? `-${options.theme}` : ""}${options.enlarged ? "-text200" : ""}`;
    if (options.enlarged) await session.page.evaluate(() => document.querySelector("h2").scrollIntoView({ block: "start" }));
    await capture(session.page, name, { ...session.options, seeded: true });
    await session.context.close();
  }

  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    const session = await open({ width, height, theme: "light" });
    await enter(session.page, administrator, `/students/${student.id}`);
    await openDocuments(session.page);
    await session.page.locator("li").first().waitFor();
    const suffix = `${width}`;
    const long = session.page.getByText(".docx", { exact: true });
    await long.scrollIntoViewIfNeeded();
    assert.ok(await long.isVisible());
    await capture(session.page, `admin-student-long-filename-${suffix}`, { ...session.options, seeded: true, description: "Long basename wraps; .docx stays visible" });
    await session.page.getByRole("button", { name: "2", exact: true }).click();
    await session.page.getByRole("button", { name: "2", exact: true }).and(session.page.locator('[aria-current="page"]')).waitFor();
    await session.page.locator("li").first().waitFor();
    await capture(session.page, `admin-student-page2-${suffix}`, { ...session.options, seeded: true, description: "Pagination page 2" });
    await session.page.getByRole("button", { name: "1", exact: true }).click();
    await session.page.getByRole("button", { name: /^Actions for/ }).first().click();
    await session.page.getByRole("menuitem", { name: "Delete", exact: true }).waitFor();
    await capture(session.page, `admin-student-delete-menu-${suffix}`, { ...session.options, seeded: true });
    await session.page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    const dialog = session.page.getByRole("dialog");
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /Delete "[^"]+"\?/);
    await capture(session.page, `admin-student-delete-confirmation-${suffix}`, { ...session.options, seeded: true, description: "Named confirmation; not confirmed" });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    probes.push({ probe: `delete-confirmation-${suffix}-cancelled`, passed: true });
    await session.context.close();
  }

  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    for (const mode of ["empty-admin", "empty-read-only"]) {
      const session = await open({ width, height, theme: "dark" });
      if (mode === "empty-admin") await enter(session.page, administrator, `/mentors/${emptyMentor.id}`);
      else await enter(session.page, emptyMentor, `/mentors/${emptyMentor.id}`);
      await openDocuments(session.page);
      await session.page.getByText("No attached documents", { exact: true }).waitFor();
      const copy = await session.page.locator("main").innerText().catch(() => session.page.locator("body").innerText());
      if (mode === "empty-admin") assert.match(copy, /Upload the first file/);
      else { assert.match(copy, /Files added by the administration will appear here/); assert.doesNotMatch(copy, /Upload the first file/); }
      await capture(session.page, `${mode}-${width}`, { ...session.options, seeded: true });
      probes.push({ probe: `${mode}-${width}-distinct-copy`, passed: true });
      await session.context.close();
    }
  }

  for (const state of ["loading", "error"]) {
    const session = await open({ width: 390, height: 844, theme: "dark" });
    let release;
    const pending = new Promise(resolveRelease => { release = resolveRelease; });
    let fail = state === "error";
    await session.page.route(/\/api\/v1\/documents\/\?/, async route => {
      if (state === "loading") await pending;
      if (fail) return route.fulfill({ status: 503, json: { detail: "Labeled isolated unavailable simulation" } });
      return route.continue();
    });
    await enter(session.page, administrator, `/students/${student.id}`);
    await session.page.getByRole("tab", { name: "Documents", exact: true }).click();
    if (state === "loading") await session.page.locator('[role="status"][aria-busy="true"]').waitFor();
    else await session.page.getByRole("button", { name: "Retry", exact: true }).waitFor();
    await centerOn(session.page, state === "loading" ? '[role="status"][aria-busy="true"]' : '[role="alert"]');
    await capture(session.page, `simulated-${state}`, { ...session.options, simulation: true, description: state });
    release();
    if (state === "error") {
      fail = false;
      await session.page.getByRole("button", { name: "Retry", exact: true }).click();
      await session.page.locator("li").first().waitFor();
      probes.push({ probe: "error-working-retry", passed: true });
    } else {
      await session.page.locator("li").first().waitFor();
    }
    await session.context.close();
  }

  {
    const session = await open({ width: 390, height: 844, theme: "light" });
    let release;
    const pending = new Promise(resolveRelease => { release = resolveRelease; });
    let uploadRequests = 0;
    let holding = true;
    await session.page.route(/\/api\/v1\/documents\/$/, async route => {
      if (route.request().method() !== "POST") return route.fallback();
      uploadRequests++;
      if (holding) { await pending; return route.fulfill({ status: 503, json: { detail: "Labeled isolated upload failure simulation" } }); }
      return route.continue();
    });
    await enter(session.page, administrator, `/mentors/${mentor.id}`);
    await openDocuments(session.page);
    await session.page.locator("li").first().waitFor();
    const picker = session.page.locator('input[type="file"]');
    const file = { name: "new-contract-scan.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdf) };
    await picker.setInputFiles(file);
    await session.page.getByText("Uploading. The file is saved when this finishes.").waitFor();
    assert.equal(await session.page.getByRole("button", { name: "Upload Document", exact: true }).isDisabled(), true);
    await centerOn(session.page, '[role="status"][aria-busy="true"]');
    await capture(session.page, "simulated-upload-in-progress", { ...session.options, simulation: true, description: "Upload request held by the capture" });
    release();
    await session.page.getByRole("alert").getByRole("button", { name: "Retry", exact: true }).waitFor();
    await centerOn(session.page, '[role="alert"]');
    await capture(session.page, "simulated-upload-error-retry", { ...session.options, simulation: true, description: "Server failure simulated with 503; Retry and Choose another file visible" });
    holding = false;
    await session.page.getByRole("alert").getByRole("button", { name: "Retry", exact: true }).click();
    await session.page.getByText(/Saved\./).waitFor();
    assert.equal(uploadRequests, 2);
    await session.page.locator("li").filter({ hasText: "new-contract-scan" }).first().waitFor();
    assert.equal(await session.page.locator("li").first().innerText().then(text => text.includes("new-contract-scan")), true);
    await capture(session.page, "upload-success-page1", { ...session.options, seeded: true, description: "Real upload through the isolated API after Retry; new file first on page 1" });
    probes.push({ probe: "upload-retry-reuses-file-and-lands-on-page-1", passed: true, uploadRequests });
    await session.context.close();
  }

  {
    const session = await open({ width: 390, height: 844, theme: "light" });
    await enter(session.page, administrator, `/mentors/${mentor.id}`);
    await openDocuments(session.page);
    await session.page.locator("li").first().waitFor();
    const picker = session.page.locator('input[type="file"]');
    await picker.setInputFiles({ name: "legacy.zip", mimeType: "application/zip", buffer: Buffer.from("PK") });
    await session.page.getByRole("alert").getByText(/This file type is not accepted/).waitFor();
    await centerOn(session.page, '[role="alert"]');
    await capture(session.page, "upload-rejected-zip", { ...session.options, seeded: true, description: "Client rejection of ZIP; Choose another file only" });
    await session.page.getByRole("button", { name: "Close", exact: true }).click();
    await picker.setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not really a png") });
    await session.page.getByRole("alert").getByText(/do not match its type/).waitFor();
    await centerOn(session.page, '[role="alert"]');
    await capture(session.page, "upload-error-invalid-content", { ...session.options, seeded: true, description: "Real server rejection of invalid image bytes" });
    probes.push({ probe: "client-and-server-rejections-distinct", passed: true });
    await session.context.close();
  }

  assert.deepEqual(errors, []);
  await writeFile(resolve(evidence, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(resolve(evidence, "probes.json"), JSON.stringify({ probes, browserErrors: errors }, null, 2) + "\n");
  process.stdout.write(`PASS: ${manifest.length} captures, ${probes.length} probes, no browser errors\n`);
} finally {
  await browser.close();
}
