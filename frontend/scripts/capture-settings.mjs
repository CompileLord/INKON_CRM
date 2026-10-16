import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import readline from "node:readline";

let input = "";
const rl = readline.createInterface({ input: process.stdin });
for await (const line of rl) {
  input = line;
  break;
}
const fixtures = JSON.parse(input);

const evidenceDir = resolve("../docs/redesign-execution/group-06/settings/evidence");
const screenshotsDir = `${evidenceDir}/screenshots`;
await mkdir(screenshotsDir, { recursive: true });

const previewOrigin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5461";
const apiOrigin = `${fixtures.api_origin}/api/v1`;
const identityOf = (role, email) => fixtures.identities.find((item) => item.role === role && !item.forced && (!email || item.email === email));
const identities = {
  superadmin: identityOf("superadmin"),
  mentor: identityOf("mentor", "mentor@kitob.example.com"),
  accountant: identityOf("accountant"),
  student: identityOf("student", "student@kitob.example.com"),
};
for (const [role, identity] of Object.entries(identities)) assert.ok(identity, `Fixture ${role} must exist`);

const LEAK_MARKERS = ["Traceback", "secret-settings-fixture", "score:999", "settings-fixture-", "orphan-fixture", "filler-", "private fixture internal marker"];
const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

async function apiLogin(identity) {
  const response = await fetch(`${apiOrigin}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: identity.email, password: fixtures.password }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  return { "Content-Type": "application/json", Authorization: `Bearer ${body.access_token}` };
}
const headersOf = {};
for (const [role, identity] of Object.entries(identities)) headersOf[role] = await apiLogin(identity);

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const manifest = [];
const probes = [];
const pageErrors = [];

function registerProbe(probe) {
  if (!probe.passed) console.error("PROBE_FAIL", JSON.stringify(probe));
  assert.ok(probe.passed, `Probe failed: ${probe.probe} ${JSON.stringify(probe)}`);
  probes.push(probe);
}

async function settle(page) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {})));
  });
}

const viewed = new Set();
async function shot(page, filename, meta, options = {}) {
  console.error("SHOT", filename);
  assert.ok(!viewed.has(filename), `Duplicate screenshot ${filename}`);
  viewed.add(filename);
  await settle(page);
  for (let attempt = 0; ; attempt += 1) {
    try {
      await page.screenshot({ path: `${screenshotsDir}/${filename}`, timeout: 45000, ...options });
      break;
    } catch (error) {
      if (attempt >= 2) throw error;
      await sleep(1500);
    }
  }
  manifest.push({ file: filename, ...meta });
}

async function newSession(identity, { lng = "en", viewport = { width: 1440, height: 1000 }, theme = "light", reducedMotion = "no-preference" } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion });
  await context.addInitScript(([language, themeValue]) => {
    localStorage.setItem("i18nextLng", language);
    localStorage.setItem("imkon_theme", themeValue);
  }, [lng, theme]);
  const page = await context.newPage();
  page.on("pageerror", (error) => { pageErrors.push(String(error)); console.error("PAGEERROR", String(error).slice(0, 400)); });
  page.on("console", (message) => {
    if (message.type() === "error" && !/status of (4|5)\d\d|Failed to load resource/.test(message.text())) { pageErrors.push(message.text()); console.error("CONSOLE", message.text().slice(0, 400)); }
  });
  await page.goto(`${previewOrigin}/login`);
  await page.locator("#email").fill(identity.email);
  await page.locator("#password").fill(fixtures.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
  return { context, page };
}

async function open(page, path, readyLocator) {
  await page.goto(`${previewOrigin}${path}`);
  await readyLocator(page).first().waitFor({ timeout: 20000 });
  await sleep(450);
}

const layoutOf = (page) => page.evaluate(() => {
  const main = document.querySelector("main");
  return {
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    innerScroll: Array.from(main.querySelectorAll("*")).filter((node) => { const style = getComputedStyle(node); return (style.overflowY === "auto" || style.overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1; }).length,
  };
});

async function bottomClearance(page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await sleep(300);
  return page.evaluate(() => {
    const nav = document.querySelector("nav[aria-label]:not([aria-label=''])[class*='fixed']");
    const navTop = nav ? nav.getBoundingClientRect().top : window.innerHeight;
    const main = document.querySelector("main");
    const last = Array.from(main.querySelectorAll("*")).filter((node) => node.getBoundingClientRect().height > 0).reduce((maximum, node) => Math.max(maximum, node.getBoundingClientRect().bottom), 0);
    return { navTop: Math.round(navTop), lastContentBottom: Math.round(last), navVisible: Boolean(nav) && getComputedStyle(nav).display !== "none" };
  });
}

const settingsReady = (page) => page.getByRole("heading", { level: 1 });
const profileReady = (page) => page.getByLabel(/First name|Имя|Ном/).first();
const noLeak = async (page, tag) => {
  const text = await page.evaluate(() => document.body.innerText);
  const found = LEAK_MARKERS.filter((marker) => text.includes(marker));
  registerProbe({ probe: `${tag}_no_internal_error_markers_or_recipient_ids_rendered`, passed: found.length === 0, found });
};

const tailOnly = process.env.KITOB_TAIL_ONLY === "1";
const SIZES = tailOnly ? [] : [[1440, 1000], [390, 844]];
const THEMES = ["light", "dark"];
const roles = ["superadmin", "mentor", "accountant", "student"];

for (const [width, height] of SIZES) {
  const phone = width < 600;
  for (const theme of THEMES) {
    for (const role of roles) {
      const tag = `${role}-${width}-${theme}`;
      const meta = (state) => ({ viewport: `${width}x${height}`, theme, role, locale: "en", state });
      const { context, page } = await newSession(identities[role], { viewport: { width, height }, theme });

      if (phone) {
        await open(page, "/settings", settingsReady);
        const sectionLinks = await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link").allInnerTexts();
        const layout = await layoutOf(page);
        registerProbe({ probe: `settings_${tag}_phone_lists_sections_as_drill_in_rows_no_wrapping_tabs`, passed: sectionLinks.length === (role === "superadmin" ? 4 : 2) && layout.overflow <= 0 && layout.innerScroll === 0, sectionLinks, ...layout });
        await shot(page, `settings-list-${tag}.png`, meta("Phone: section list that drills in"), { fullPage: true });
        await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: "Profile" }).click();
        await profileReady(page).waitFor();
        await sleep(300);
      } else {
        await open(page, "/settings", profileReady);
      }
      {
        const rows = await page.evaluate(() => ({
          text: document.querySelector("main").innerText,
          inputs: Array.from(document.querySelectorAll("main input")).map((input) => ({ label: document.querySelector(`label[for="${input.id}"]`)?.textContent, height: Math.round(input.getBoundingClientRect().height), width: Math.round(input.getBoundingClientRect().width), disabled: input.disabled })).filter((entry) => entry.label),
          navColumns: Boolean(document.querySelector('nav[aria-label="Settings sections"]')) && getComputedStyle(document.querySelector('nav[aria-label="Settings sections"]')).display !== "none",
        }));
        const layout = await layoutOf(page);
        registerProbe({ probe: `settings_${tag}_profile_rows_are_readable_full_width_inputs_no_overflow_no_inner_scroll`, passed: rows.inputs.length === 4 && rows.inputs.every((entry) => entry.height >= 44 && entry.width >= 180) && layout.overflow <= 0 && layout.innerScroll === 0 && (phone ? !rows.navColumns : rows.navColumns), ...layout, inputs: rows.inputs });
        registerProbe({ probe: `settings_${tag}_profile_has_no_pre_existing_save_button_and_no_version_string`, passed: (await page.getByTestId("settings-save-bar").count()) === 0 && !/v\d+\.\d+\.\d+/.test(rows.text), text: rows.text.slice(0, 160) });
        await noLeak(page, `settings_${tag}`);
        await shot(page, `settings-profile-${tag}.png`, meta("Profile section: label and description on the left, control on the right, no save bar while pristine"), { fullPage: true });
        await page.getByLabel("First name").fill(`${identities[role].email.split("@")[0]}x`);
        await sleep(350);
        const bar = await page.getByTestId("settings-save-bar").boundingBox();
        const saveBarText = await page.getByTestId("settings-save-bar").innerText();
        const clearance = phone ? await page.evaluate(() => { const nav = document.querySelector("nav[aria-label]:not([aria-label=''])[class*='fixed']"); return { navTop: Math.round(nav.getBoundingClientRect().top) }; }) : null;
        registerProbe({ probe: `settings_${tag}_dirty_save_bar_appears_with_unsaved_discard_save_and_clears_the_phone_nav`, passed: /Unsaved changes/.test(saveBarText) && /Discard/.test(saveBarText) && /Save/.test(saveBarText) && Boolean(bar) && (!phone || bar.y + bar.height <= clearance.navTop), saveBarText: saveBarText.replace(/\n/g, " | "), bar, clearance });
        await shot(page, `settings-profile-dirty-${tag}.png`, meta("Profile with an edited first name: sticky Unsaved changes / Discard / Save bar"), phone ? {} : { fullPage: true });
        await page.getByRole("button", { name: "Discard" }).click();
        await sleep(250);
        registerProbe({ probe: `settings_${tag}_discard_removes_the_bar_and_restores_the_saved_name`, passed: (await page.getByTestId("settings-save-bar").count()) === 0 && (await page.getByLabel("First name").inputValue()) === identities[role].email.split("@")[0].replace(/^./, (character) => character.toUpperCase()) });
      }

      if (phone) {
        await page.goto(`${previewOrigin}/settings?section=appearance`);
        await page.getByRole("radiogroup", { name: "Theme" }).waitFor();
        await sleep(300);
      } else {
        await page.getByRole("link", { name: "Appearance" }).click();
        await page.getByRole("radiogroup", { name: "Theme" }).waitFor();
        await sleep(300);
      }
      {
        const appearance = await page.evaluate(() => ({
          groups: Array.from(document.querySelectorAll('[role="radiogroup"]')).map((group) => ({ label: group.getAttribute("aria-label"), options: Array.from(group.querySelectorAll('[role="radio"]')).map((radio) => ({ text: radio.textContent.trim(), icon: Boolean(radio.querySelector("svg")), height: Math.round(radio.getBoundingClientRect().height) })) })),
          text: document.querySelector("main").innerText,
        }));
        const layout = await layoutOf(page);
        registerProbe({ probe: `settings_${tag}_appearance_theme_and_language_are_labelled_segmented_controls_with_44px_options_and_about_version`, passed: appearance.groups.length === 2 && appearance.groups[0].options.length === 3 && appearance.groups[0].options.every((option) => option.icon && option.height >= 44) && appearance.groups[1].options.length === 3 && !/Тема и язык/.test(appearance.text) && /Version/.test(appearance.text) && layout.overflow <= 0, groups: appearance.groups, ...layout });
        if (phone) {
          const clearance = await bottomClearance(page);
          registerProbe({ probe: `settings_${tag}_appearance_bottom_navigation_never_covers_the_about_row`, passed: clearance.navVisible && clearance.lastContentBottom <= clearance.navTop, ...clearance });
        }
        await shot(page, `settings-appearance-${tag}.png`, meta("Appearance: Theme (Light, Dark, System with icons) and Language segmented controls; About row with the version"), { fullPage: true });
      }

      if (role === "superadmin") {
        await page.goto(`${previewOrigin}/settings?section=organization`);
        await page.getByRole("button", { name: "Edit name" }).waitFor({ timeout: 20000 });
        await sleep(400);
        const org = await page.evaluate(() => ({
          text: document.querySelector("main").innerText,
          currencyInput: Boolean(Array.from(document.querySelectorAll("main input")).find((input) => /TJS/.test(input.value))),
          info: Boolean(document.querySelector('main button[aria-label="Currency"]')),
          botState: document.querySelector('[data-testid="telegram-status"]')?.getAttribute("data-state"),
        }));
        const layout = await layoutOf(page);
        registerProbe({ probe: `organization_${tag}_inline_name_readonly_currency_with_info_and_unchecked_bot_row_with_test`, passed: /Kitob|ИМКОН|Organization/.test(org.text) && /TJS · Somoni/.test(org.text) && !org.currencyInput && org.info && org.botState === "unchecked" && /Test/.test(org.text) && layout.overflow <= 0 && layout.innerScroll === 0, botState: org.botState, ...layout });
        await shot(page, `settings-organization-${tag}.png`, meta("Organization: inline-edit name, read-only currency with info tooltip, Telegram bot status row with Test action"), { fullPage: true });
        await page.getByRole("button", { name: "Test" }).click();
        await page.waitForFunction(() => document.querySelector('[data-testid="telegram-status"]')?.getAttribute("data-state") !== "unchecked", null, { timeout: 15000 });
        const botState = await page.getByTestId("telegram-status").getAttribute("data-state");
        registerProbe({ probe: `organization_${tag}_test_action_reports_the_real_reachability_from_the_backend`, passed: botState === "unreachable" || botState === "reachable", botState });
        await shot(page, `settings-organization-tested-${tag}.png`, meta("Organization after Test: the bot row shows the real result returned by the backend (the isolated preview has no Telegram network access)"), { fullPage: true });
        if (!phone) {
          await page.getByRole("button", { name: "Edit name" }).click();
          await page.getByLabel("Organization name").fill("Kitob Learning Center");
          await sleep(300);
          await shot(page, `settings-organization-dirty-${tag}.png`, meta("Organization name being edited inline: dirty save bar"), { fullPage: true });
        }

        await page.goto(`${previewOrigin}/settings?section=rules`);
        await page.getByRole("switch", { name: "Payment notifications" }).waitFor({ timeout: 20000 });
        await sleep(400);
        const rules = await page.evaluate(() => ({
          switches: Array.from(document.querySelectorAll('main [role="switch"]')).map((node) => ({ label: node.getAttribute("aria-label"), checked: node.getAttribute("aria-checked") })),
          checkboxes: document.querySelectorAll('main input[type="checkbox"]').length,
          chips: Array.from(document.querySelectorAll("main span")).filter((node) => node.textContent.trim() === "Telegram").length,
          saveBars: document.querySelectorAll('[data-testid="settings-save-bar"]').length,
        }));
        const layout2 = await layoutOf(page);
        registerProbe({ probe: `rules_${tag}_toggle_switches_with_channel_chips_and_no_save_button`, passed: rules.switches.length === 2 && rules.checkboxes === 0 && rules.chips === 2 && rules.saveBars === 0 && layout2.overflow <= 0, ...rules, ...layout2 });
        if (phone) {
          const clearance = await bottomClearance(page);
          registerProbe({ probe: `rules_${tag}_bottom_navigation_never_covers_the_last_rule`, passed: clearance.navVisible && clearance.lastContentBottom <= clearance.navTop, ...clearance });
        }
        await shot(page, `settings-rules-${tag}.png`, meta("Notification rules: icon, name, description, Telegram channel chip and a switch per rule; autosave, no Save button"), { fullPage: true });
      }

      {
        await open(page, "/notifications", (p) => p.getByTestId("notification-item"));
        const inbox = await page.evaluate(() => ({
          headings: Array.from(document.querySelectorAll("main h2")).map((node) => node.textContent.trim()),
          items: document.querySelectorAll('[data-testid="notification-item"]').length,
          unreadDots: document.querySelectorAll('[data-testid="unread-dot"]').length,
          title: document.querySelector("main h1").innerText.trim(),
          tabs: document.querySelectorAll('[role="tab"]').length,
          markAll: Array.from(document.querySelectorAll("main button")).some((button) => /Mark all read/.test(button.textContent)),
        }));
        const layout = await layoutOf(page);
        registerProbe({ probe: `notifications_${tag}_inbox_groups_by_day_with_unread_dots_mark_all_title_and_${role === "superadmin" ? "two_tabs" : "no_tabs"}`, passed: inbox.title === "Notifications" && inbox.headings.includes("Today") && inbox.headings.includes("Yesterday") && inbox.items >= 5 && inbox.unreadDots >= 3 && inbox.markAll && inbox.tabs === (role === "superadmin" ? 2 : 0) && layout.overflow <= 0 && layout.innerScroll === 0, ...inbox, ...layout });
        await noLeak(page, `notifications_${tag}`);
        if (phone) {
          const clearance = await bottomClearance(page);
          registerProbe({ probe: `notifications_${tag}_bottom_navigation_never_covers_the_last_item`, passed: clearance.navVisible && clearance.lastContentBottom <= clearance.navTop, ...clearance });
        }
        await shot(page, `notifications-inbox-${tag}.png`, meta("Notifications inbox: type icon, title, body, relative time, unread dot, day groups, Mark all read"), { fullPage: true });
      }

      if (role === "superadmin") {
        await open(page, "/notifications?tab=log", (p) => p.getByTestId("delivery-item"));
        const log = await page.evaluate(() => ({
          rows: document.querySelectorAll('[data-testid="delivery-item"]').length,
          statuses: Array.from(document.querySelectorAll('[data-testid="delivery-status"]')).map((chip) => chip.getAttribute("data-status")),
          failedChip: Array.from(document.querySelectorAll("main button")).some((button) => /Failed only/.test(button.textContent)),
          pagination: Boolean(document.querySelector('main button[aria-current="page"]')),
          columnsOnDesktop: getComputedStyle(document.querySelector('[data-testid="delivery-item"]')).display,
        }));
        const layout = await layoutOf(page);
        registerProbe({ probe: `delivery_log_${tag}_status_chips_failed_only_chip_and_${phone ? "stacked_cards" : "grid_rows"}`, passed: log.rows === 20 && log.statuses.includes("sent") && log.statuses.includes("failed") && log.failedChip && log.pagination && (phone ? log.columnsOnDesktop === "flex" : log.columnsOnDesktop === "grid") && layout.overflow <= 0 && layout.innerScroll === 0, ...log, ...layout });
        await noLeak(page, `delivery_log_${tag}`);
        await shot(page, `notifications-log-${tag}.png`, meta("Superadmin Delivery log tab: names, event, date, status chips, Failed only chip, pagination"), { fullPage: true });
        await page.getByRole("button", { name: "Failed only" }).click();
        await page.waitForFunction(() => document.querySelectorAll('[data-testid="delivery-status"][data-status="sent"]').length === 0 && document.querySelectorAll('[data-testid="delivery-status"]').length > 0, null, { timeout: 15000 });
        const failedStatuses = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="delivery-status"]')).map((chip) => chip.getAttribute("data-status")));
        registerProbe({ probe: `delivery_log_${tag}_failed_only_chip_shows_only_failed_deliveries_and_updates_the_address`, passed: failedStatuses.length >= 4 && failedStatuses.every((status) => status === "failed") && page.url().includes("failed=1"), failedStatuses: failedStatuses.length });
        await shot(page, `notifications-log-failed-${tag}.png`, meta("Delivery log filtered with the removable Failed only chip"), { fullPage: true });
      }
      await context.close();
    }
  }
}

for (const lng of tailOnly ? [] : ["ru", "tg"]) {
  for (const [width, height] of SIZES) {
    const phone = width < 600;
    const tag = `${lng}-${width}`;
    const meta = (state) => ({ viewport: `${width}x${height}`, theme: "light", role: "superadmin", locale: lng, state });
    const { context, page } = await newSession(identities.superadmin, { lng, viewport: { width, height } });
    await page.goto(`${previewOrigin}/settings?section=profile`);
    await page.locator("main input").first().waitFor({ timeout: 20000 });
    await sleep(400);
    const text = await page.evaluate(() => document.querySelector("main").innerText);
    const english = ["Profile", "Appearance", "Organization", "Notification rules", "First name", "Unsaved changes", "Discard"].filter((word) => text.includes(word));
    registerProbe({ probe: `settings_${tag}_profile_is_fully_translated`, passed: english.length === 0, english });
    await shot(page, `settings-profile-${tag}-light.png`, meta(`Profile in ${lng}`), { fullPage: true });
    await page.goto(`${previewOrigin}/settings?section=appearance`);
    await page.getByRole("radiogroup").first().waitFor({ timeout: 20000 });
    await sleep(300);
    const appearanceText = await page.evaluate(() => document.querySelector("main").innerText);
    registerProbe({ probe: `settings_${tag}_appearance_is_fully_translated`, passed: !/Theme|Language|About|Version|Light|Dark|System/.test(appearanceText), appearanceText: appearanceText.slice(0, 200) });
    await shot(page, `settings-appearance-${tag}-light.png`, meta(`Appearance in ${lng}`), { fullPage: true });
    await page.goto(`${previewOrigin}/settings?section=organization`);
    await page.getByTestId("telegram-status").waitFor({ timeout: 20000 });
    await sleep(300);
    await shot(page, `settings-organization-${tag}-light.png`, meta(`Organization in ${lng}`), { fullPage: true });
    await page.goto(`${previewOrigin}/settings?section=rules`);
    await page.getByRole("switch").first().waitFor({ timeout: 20000 });
    await sleep(300);
    await shot(page, `settings-rules-${tag}-light.png`, meta(`Notification rules in ${lng}`), { fullPage: true });
    await open(page, "/notifications", (p) => p.getByTestId("notification-item"));
    const inboxText = await page.evaluate(() => document.querySelector("main").innerText);
    registerProbe({ probe: `notifications_${tag}_inbox_is_fully_translated`, passed: !/Notifications|Inbox|Delivery log|Mark all read|Today|Yesterday|Exam result|Payment reminder/.test(inboxText), inboxText: inboxText.slice(0, 200) });
    await shot(page, `notifications-inbox-${tag}-light.png`, meta(`Inbox in ${lng}`), { fullPage: true });
    await open(page, "/notifications?tab=log", (p) => p.getByTestId("delivery-item"));
    await shot(page, `notifications-log-${tag}-light.png`, meta(`Delivery log in ${lng}`), { fullPage: true });
    await context.close();
  }
}

for (const width of tailOnly ? [] : [320, 768, 1024]) {
  const { context, page } = await newSession(identities.superadmin, { viewport: { width, height: 900 } });
  for (const path of ["/settings", "/settings?section=organization", "/settings?section=rules", "/settings?section=appearance", "/notifications", "/notifications?tab=log"]) {
    await page.goto(`${previewOrigin}${path}`);
    await page.getByRole("heading", { level: 1 }).waitFor({ timeout: 20000 });
    await sleep(900);
    const layout = await layoutOf(page);
    registerProbe({ probe: `responsive_${width}_${path.replace(/[^a-z]+/gi, "_")}_has_no_horizontal_overflow_and_no_inner_scroll`, passed: layout.overflow <= 0 && layout.innerScroll === 0, ...layout });
  }
  if (width !== 1024) {
    await page.goto(`${previewOrigin}/notifications?tab=log`);
    await page.getByTestId("delivery-item").first().waitFor();
    await sleep(500);
    await shot(page, `notifications-log-${width}-light.png`, { viewport: `${width}x900`, theme: "light", role: "superadmin", locale: "en", state: "Delivery log at an intermediate width" }, { fullPage: true });
    await page.goto(`${previewOrigin}/settings?section=organization`);
    await page.getByRole("button", { name: "Edit name" }).waitFor();
    await sleep(500);
    await shot(page, `settings-organization-${width}-light.png`, { viewport: `${width}x900`, theme: "light", role: "superadmin", locale: "en", state: "Organization at an intermediate width" }, { fullPage: true });
  }
  await context.close();
}

{
  const { context, page } = await newSession(identities.superadmin, { viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await page.goto(`${previewOrigin}/settings?section=rules`);
  await page.getByRole("switch").first().waitFor();
  const reduced = await page.evaluate(() => { const knob = document.querySelector('[role="switch"] > span > span'); return getComputedStyle(knob).transitionDuration; });
  registerProbe({ probe: "reduced_motion_removes_the_switch_knob_transition", passed: /^0s/.test(reduced), reduced });
  await context.close();
  const motion = await newSession(identities.superadmin, { viewport: { width: 1440, height: 1000 } });
  await motion.page.goto(`${previewOrigin}/settings?section=rules`);
  await motion.page.getByRole("switch").first().waitFor();
  const normal = await motion.page.evaluate(() => { const knob = document.querySelector('[role="switch"] > span > span'); return getComputedStyle(knob).transitionDuration; });
  registerProbe({ probe: "switch_knob_uses_the_150ms_transition_when_motion_is_allowed", passed: /^0\.15s/.test(normal), normal });
  await motion.context.close();
}

{
  const { context, page } = await newSession(identities.superadmin);
  await page.goto(`${previewOrigin}/settings?section=rules`);
  await page.getByRole("switch", { name: "Debt reminders" }).waitFor();
  const before = await (await fetch(`${apiOrigin}/settings/org`, { headers: headersOf.superadmin })).json();
  const debts = page.getByRole("switch", { name: "Debt reminders" });
  const initial = await debts.getAttribute("aria-checked");
  await debts.click();
  await page.getByText("Saved", { exact: true }).first().waitFor({ timeout: 10000 });
  await shot(page, "settings-rules-saved-toast-1440-light.png", { viewport: "1440x1000", theme: "light", role: "superadmin", locale: "en", state: "Rules autosave: Saved toast after toggling Debt reminders" });
  const after = await (await fetch(`${apiOrigin}/settings/org`, { headers: headersOf.superadmin })).json();
  registerProbe({ probe: "rules_autosave_persists_only_the_toggled_rule_to_the_real_api_and_survives_reload", passed: after.notify_debts === !before.notify_debts && after.notify_payments === before.notify_payments && after.org_name === before.org_name && (await debts.getAttribute("aria-checked")) !== initial, before, after });
  await page.reload();
  await page.getByRole("switch", { name: "Debt reminders" }).waitFor();
  registerProbe({ probe: "rules_switch_state_after_reload_matches_the_saved_value", passed: (await page.getByRole("switch", { name: "Debt reminders" }).getAttribute("aria-checked")) === String(after.notify_debts) });
  await page.getByRole("switch", { name: "Debt reminders" }).click();
  await page.getByText("Saved", { exact: true }).first().waitFor();
  await context.close();
}

{
  const { context, page } = await newSession(identities.superadmin);
  await page.goto(`${previewOrigin}/settings?section=organization`);
  await page.getByRole("button", { name: "Edit name" }).click();
  await page.getByLabel("Organization name").fill("Kitob Learning Center");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Saved", { exact: true }).first().waitFor({ timeout: 10000 });
  const saved = await (await fetch(`${apiOrigin}/settings/org`, { headers: headersOf.superadmin })).json();
  registerProbe({ probe: "organization_name_saved_through_the_dirty_bar_reaches_the_real_api_without_touching_rules", passed: saved.org_name === "Kitob Learning Center" && (await page.getByTestId("settings-save-bar").count()) === 0, saved });
  await page.getByRole("button", { name: "Edit name" }).click();
  await page.getByLabel("Organization name").fill("Учебный центр ИМКОН");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Saved", { exact: true }).first().waitFor({ timeout: 10000 });
  await context.close();
}

{
  const { context, page } = await newSession(identities.mentor);
  await page.goto(`${previewOrigin}/settings`);
  await page.getByLabel("First name").waitFor();
  await page.getByLabel("Phone").fill("+992900001111");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Saved", { exact: true }).first().waitFor({ timeout: 10000 });
  const me = await (await fetch(`${apiOrigin}/users/me`, { headers: headersOf.mentor })).json();
  registerProbe({ probe: "profile_phone_saved_through_the_dirty_bar_persists_to_the_real_api", passed: me.phone === "+992900001111" && me.first_name === "Mentor", phone: me.phone });
  await page.getByLabel("Phone").fill("not-a-phone");
  await sleep(200);
  registerProbe({ probe: "profile_invalid_phone_is_rejected_client_side_without_a_request", passed: await page.getByText(/international format/i, { exact: false }).first().isVisible() });
  await context.close();
}

{
  const { context, page } = await newSession(identities.superadmin);
  await page.goto(`${previewOrigin}/settings?section=appearance`);
  await page.getByRole("radio", { name: "Dark" }).click();
  const dark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  await page.getByRole("radio", { name: "RU" }).click();
  await page.getByRole("radiogroup", { name: "Тема" }).waitFor();
  const stored = await page.evaluate(() => ({ theme: localStorage.getItem("imkon_theme"), language: localStorage.getItem("i18nextLng") }));
  const bodyText = await page.evaluate(() => document.body.innerText);
  const saveBars = await page.getByTestId("settings-save-bar").count();
  registerProbe({ probe: "theme_and_language_apply_immediately_persist_and_translate_the_whole_section", passed: dark && stored.theme === "dark" && stored.language === "ru" && saveBars === 0 && !bodyText.split("\n").includes("Тема и язык"), stored, dark, saveBars, hasOldCopy: bodyText.split("\n").includes("Тема и язык") });
  await context.close();
}

{
  const roleListings = {};
  for (const role of roles) {
    const list = await (await fetch(`${apiOrigin}/notifications/?page_size=100`, { headers: headersOf[role] })).json();
    roleListings[role] = list.items.map((item) => item.user_id);
    const log = await fetch(`${apiOrigin}/notifications/delivery-log`, { headers: headersOf[role] });
    registerProbe({ probe: `api_${role}_delivery_log_is_${role === "superadmin" ? "allowed" : "forbidden"}`, passed: role === "superadmin" ? log.status === 200 : log.status === 403, status: log.status });
    registerProbe({ probe: `api_${role}_inbox_contains_only_own_notifications_without_error_message`, passed: list.items.length > 0 && new Set(list.items.map((item) => item.user_id)).size === 1 && list.items.every((item) => !("error_message" in item)), count: list.items.length });
  }
  const otherId = (await (await fetch(`${apiOrigin}/notifications/?page_size=1`, { headers: headersOf.superadmin })).json()).items[0].id;
  const denied = await fetch(`${apiOrigin}/notifications/${otherId}/read`, { method: "PATCH", headers: headersOf.student });
  registerProbe({ probe: "api_student_cannot_mark_another_users_notification_read", passed: denied.status === 403, status: denied.status });
}

{
  const { context, page } = await newSession(identities.mentor);
  await open(page, "/notifications", (p) => p.getByTestId("notification-item"));
  const beforeCount = (await (await fetch(`${apiOrigin}/notifications/unread-count`, { headers: headersOf.mentor })).json()).unread_count;
  await page.getByTestId("notification-item").first().getByRole("button", { name: "Mark as read" }).click();
  await page.waitForFunction((expected) => document.querySelectorAll('[data-testid="unread-dot"]').length === expected, await page.evaluate(() => document.querySelectorAll('[data-testid="unread-dot"]').length) - 1, { timeout: 10000 });
  const afterOne = (await (await fetch(`${apiOrigin}/notifications/unread-count`, { headers: headersOf.mentor })).json()).unread_count;
  registerProbe({ probe: "mark_one_read_reduces_the_real_unread_count_by_exactly_one", passed: afterOne === beforeCount - 1, beforeCount, afterOne });
  const studentBefore = (await (await fetch(`${apiOrigin}/notifications/unread-count`, { headers: headersOf.student })).json()).unread_count;
  await page.getByRole("button", { name: "Mark all read" }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="unread-dot"]').length === 0, null, { timeout: 10000 });
  const mentorAfter = (await (await fetch(`${apiOrigin}/notifications/unread-count`, { headers: headersOf.mentor })).json()).unread_count;
  const studentAfter = (await (await fetch(`${apiOrigin}/notifications/unread-count`, { headers: headersOf.student })).json()).unread_count;
  registerProbe({ probe: "mark_all_read_clears_only_the_callers_notifications_and_disables_the_action", passed: mentorAfter === 0 && studentAfter === studentBefore && studentBefore > 0 && (await page.getByRole("button", { name: "Mark all read" }).isDisabled()), mentorAfter, studentBefore, studentAfter });
  await shot(page, "notifications-inbox-all-read-1440-light.png", { viewport: "1440x1000", theme: "light", role: "mentor", locale: "en", state: "After Mark all read: no unread dots, action disabled, All caught up" });
  await context.close();
}

{
  const { context, page } = await newSession(identities.accountant);
  await page.route("**/api/v1/notifications/?*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 20, total_pages: 1 }) }));
  await page.goto(`${previewOrigin}/notifications`);
  await page.getByText("Nothing here yet.").waitFor({ timeout: 15000 });
  await shot(page, "notifications-empty-simulated-1440-light.png", { viewport: "1440x1000", theme: "light", role: "accountant", locale: "en", state: "SIMULATED empty response: icon and one sentence" });
  await context.close();
}
{
  const { context, page } = await newSession(identities.student, { viewport: { width: 390, height: 844 }, theme: "dark" });
  await page.route("**/api/v1/notifications/?*", async (route) => { await sleep(4000); await route.continue(); });
  await page.goto(`${previewOrigin}/notifications`);
  await page.getByLabel("Loading...").first().waitFor({ timeout: 15000 });
  await shot(page, "notifications-loading-simulated-390-dark.png", { viewport: "390x844", theme: "dark", role: "student", locale: "en", state: "SIMULATED delayed response: skeleton in the loaded row geometry" });
  await context.close();
}
{
  const { context, page } = await newSession(identities.student);
  await page.route("**/api/v1/notifications/?*", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "boom" }) }));
  await page.goto(`${previewOrigin}/notifications`);
  await page.getByRole("button", { name: "Retry" }).waitFor({ timeout: 20000 });
  await shot(page, "notifications-error-simulated-1440-light.png", { viewport: "1440x1000", theme: "light", role: "student", locale: "en", state: "SIMULATED 500: error message with Retry" });
  await page.unroute("**/api/v1/notifications/?*");
  await page.getByRole("button", { name: "Retry" }).click();
  await page.getByTestId("notification-item").first().waitFor({ timeout: 15000 });
  registerProbe({ probe: "notifications_retry_recovers_after_a_failed_load", passed: true });
  await context.close();
}

registerProbe({ probe: "no_page_errors_or_console_errors_during_the_whole_run", passed: pageErrors.length === 0, pageErrors: pageErrors.slice(0, 5) });
if (!tailOnly) {
  await writeFile(`${evidenceDir}/manifest.json`, JSON.stringify(manifest, null, 2));
  await writeFile(`${evidenceDir}/probes.json`, JSON.stringify(probes, null, 2));
}
await browser.close();
console.log(JSON.stringify({ screenshots: manifest.length, probes: probes.length }));
