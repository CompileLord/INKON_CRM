import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const output = resolve("../docs/redesign-execution/group-01/task-03/auth-frame-fixture");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const records = [];
try {
  for (const theme of ["light", "dark"]) for (const locale of ["en", "ru", "tg"]) for (const width of [320,390,768,1024,1440]) {
    const context = await browser.newContext({ viewport: { width, height: width >= 1024 ? 1000 : 844 }, colorScheme: theme, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:5174/scripts/fixtures/auth-frame.html?locale=${locale}`);
    await page.locator("h1").waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${theme}/${locale}/${width}`);
    const panels = await page.locator("section,aside").evaluateAll((elements) => elements.map((element) => ({ width: element.getBoundingClientRect().width, display: getComputedStyle(element).display })));
    if (width >= 1024) {
      assert.equal(panels[0].width, width / 2); assert.equal(panels[1].width, width / 2);
      const visible = await page.locator('aside img').evaluate((image) => image.getBoundingClientRect().width);
      assert.ok(Math.abs(visible - (width === 1440 ? 320 : 240)) < 2);
    } else assert.equal(panels[1].display, "none");
    await page.locator('input[type="email"]').fill("retained@fixture.example");
    await page.getByRole("button", { name: /settings|настройки|танзимот/i }).click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator('input[type="email"]').inputValue(), "retained@fixture.example");
    if (locale === "en" && [390,1440].includes(width)) await page.screenshot({ path: `${output}/${width}-${theme}.png` });
    await page.evaluate(() => document.documentElement.style.fontSize = "200%");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${theme}/${locale}/${width}`);
    records.push({ theme, locale, width, enlargedOverflow: false, protectedArtwork: true, fixtureOnly: true });
    await context.close();
  }
  await writeFile(`${output}/probes.json`, JSON.stringify({ records, fixtureOnly: true }, null, 2));
  console.log(`PASS ${records.length} shared auth frame fixture combinations.`);
} finally { await browser.close(); }
