import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve("../docs/redesign-execution/group-01/task-01/codex-screenshots");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const records = [];
const fixture = "http://127.0.0.1:5173/scripts/fixtures/foundation.html";

try {
  for (const width of [320, 390, 768, 1024, 1440]) {
    for (const theme of ["light", "dark"]) {
      for (const locale of ["en", "ru", "tg"]) {
        const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 }, colorScheme: theme });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${fixture}?locale=${locale}`);
        await page.locator('[data-fixture="actual-react-components"]').waitFor();
        await page.locator('[data-testid="brand-logo"] img').first().waitFor();
        await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-testid="brand-logo"] img')).every((img) => img.complete && img.naturalWidth > 0));
        const probe = await page.evaluate(() => {
          const brands = Array.from(document.querySelectorAll('[data-testid="brand-logo"]')).map((container) => {
            const img = container.querySelector("img");
            const outer = container.getBoundingClientRect();
            const art = img.getBoundingClientRect();
            return {
              variant: container.dataset.variant,
              size: container.dataset.size,
              requiredMargin: art.height * 211 / 598,
              margins: [art.left - outer.left, outer.right - art.right, art.top - outer.top, outer.bottom - art.bottom],
              ratio: art.width / art.height,
              intrinsicRatio: img.naturalWidth / img.naturalHeight,
            };
          });
          const targets = Array.from(document.querySelectorAll("button,input")).map((element) => {
            const rect = element.getBoundingClientRect();
            return { width: rect.width, height: rect.height };
          });
          const input = document.getElementById("invalid");
          const rootStyle = getComputedStyle(document.documentElement);
          const luminance = (role) => {
            const hex = rootStyle.getPropertyValue(`--imkon-${role}`).trim().replace("#", "");
            const channels = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
            return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
          };
          const pairs = [
            ["ink", "card", 4.5], ["muted", "card", 4.5], ["label", "cream", 4.5],
            ["muted", "beige", 4.5], ["muted", "strip", 4.5],
            ["on-primary", "maroon", 4.5], ["on-primary", "maroon-dark", 4.5],
            ["on-accent", "accent", 4.5], ["on-accent", "accent-dark", 4.5],
            ["on-destructive", "destructive", 4.5], ["destructive", "card", 4.5],
            ["control-border", "card", 3], ["control-border", "cream", 3],
            ["ring", "card", 3], ["ring", "cream", 3],
            ["success", "success-surface", 4.5], ["warning", "warning-surface", 4.5],
            ["info", "info-surface", 4.5], ["destructive", "danger-surface", 4.5],
          ];
          const contrast = pairs.map(([foreground, background, required]) => {
            const a = luminance(foreground), b = luminance(background);
            return { foreground, background, required, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
          });
          return { overflow: document.documentElement.scrollWidth - innerWidth, brands, targets, contrast, description: input.getAttribute("aria-describedby"), theme: document.documentElement.dataset.theme };
        });
        assert.equal(probe.overflow, 0, `${width}/${theme}/${locale} page overflow`);
        assert.equal(probe.theme, theme);
        assert.equal(probe.description, "external-help invalid-error");
        assert.deepEqual(errors, []);
        const disabledReadability = await page.locator('[data-action="disabled"]').evaluate((el) => {
          const reference = document.createElement("span");
          reference.style.color = "var(--imkon-muted)";
          reference.style.backgroundColor = "var(--imkon-beige)";
          document.body.append(reference);
          const actual = getComputedStyle(el), expected = getComputedStyle(reference);
          const matches = actual.color === expected.color && actual.backgroundColor === expected.backgroundColor && actual.opacity === "1";
          reference.remove();
          return matches;
        });
        assert.equal(disabledReadability, true, "Disabled controls must retain readable semantic foregrounds");
        for (const brand of probe.brands) {
          assert.ok(brand.margins.every((value) => value >= brand.requiredMargin), JSON.stringify(brand));
          assert.ok(Math.abs(brand.ratio - brand.intrinsicRatio) < 0.005, "Brand proportions changed");
        }
        for (const target of probe.targets) assert.ok(target.width >= 44 && target.height >= 44, JSON.stringify(target));
        for (const pair of probe.contrast) assert.ok(pair.ratio >= pair.required, JSON.stringify(pair));
        records.push({ width, theme, locale, ...probe });
        if ((width === 390 || width === 1440) && locale === "en") {
          await page.screenshot({ path: `${output}/fixture-${width}-${theme}.png` });
          await page.screenshot({ path: `${output}/fixture-${width}-${theme}-full.png`, fullPage: true });
        }
        if (width === 390 && locale !== "en") await page.screenshot({ path: `${output}/fixture-${width}-${theme}-${locale}-full.png`, fullPage: true });
        await page.getByRole("switch").first().focus();
        await page.keyboard.press("Space");
        assert.equal(await page.getByRole("switch").first().getAttribute("aria-checked"), "true");
        await page.keyboard.press("Enter");
        assert.equal(await page.getByRole("switch").first().getAttribute("aria-checked"), "false");
        await page.locator('label[for="email"]').click();
        assert.equal(await page.evaluate(() => document.activeElement.id), "email");
        await page.locator('[data-action="save"]').focus();
        await page.keyboard.press("Enter");
        assert.equal(await page.locator("output").getAttribute("data-action-count"), "1");
        assert.equal(await page.locator('[data-action="save"]').evaluate((el) => el.matches(":focus-visible")), true);
        assert.notEqual(await page.locator('[data-action="save"]').evaluate((el) => getComputedStyle(el).boxShadow), "none");
        if (width === 390 && locale === "en") await page.locator('[data-section="buttons"]').screenshot({ path: `${output}/keyboard-focus-${theme}.png` });
        await page.emulateMedia({ reducedMotion: "reduce" });
        assert.equal(await page.locator('[data-action="loading"] span').evaluate((el) => getComputedStyle(el).animationName), "none");
        assert.equal(await page.locator('[data-action="save"]').evaluate((el) => getComputedStyle(el).transitionDuration), "0s");
        await page.addStyleTag({ content: "html { font-size: 200%; }" });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `${width}/${theme}/${locale} text enlargement overflow`);
        if (width === 390 && locale === "tg") await page.screenshot({ path: `${output}/fixture-390-${theme}-tg-enlarged.png`, fullPage: true });
        await context.close();
      }
    }
  }

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(fixture);
  await page.locator('[data-theme-choice="system"]').click();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  assert.equal(await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content.toLowerCase()), await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--imkon-cream").trim()));
  await page.locator('[data-theme-choice="light"]').click();
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");
  await context.close();

  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, colorScheme: theme });
    const page = await context.newPage();
    await page.goto(fixture);
    await page.locator('[data-section="brand"] img').first().waitFor();
    await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-section="brand"] img')).every((img) => img.complete && img.naturalWidth > 0));
    await page.locator('[data-section="brand"]').screenshot({ path: `${output}/artwork-${theme}-2x.png` });
    await context.close();
  }

  for (const width of [390, 1440]) {
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 }, colorScheme: theme });
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:5173/login");
      await page.locator('input[type="password"]').waitFor();
      await page.screenshot({ path: `${output}/existing-login-${width}-${theme}.png` });
      await context.close();
    }
  }
  await writeFile(`${output}/probes.json`, JSON.stringify({ fixtureOnly: true, productionPageRedesign: false, records, hardwareVerified: false }, null, 2));
  console.log(`PASS: ${records.length} actual-component viewport/theme/locale combinations; keyboard, associations, targets, artwork geometry, enlargement, reduced motion and System theme. ${output}`);
} finally {
  await browser.close();
}
