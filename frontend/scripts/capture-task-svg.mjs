import { chromium } from "playwright";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve(
  process.env.KITOB_SVG_OUTPUT_DIR || "../docs/redesign-execution/group-01/task-svg/attempt4",
);
const screenshotsDir = `${output}/screenshots`;
const animationDir = `${output}/animation-frames`;
const authFrameDir = `${output}/auth-frame-fixture`;
await mkdir(screenshotsDir, { recursive: true });
await mkdir(animationDir, { recursive: true });
await mkdir(authFrameDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const records = [];
const authFrameRecords = [];
const animationMetrics = {
  cycleDurationSeconds: 6.0,
  cyclesCaptured: 2,
  sampleTimes: [],
  rasterDifferences: [],
  loopVerified: false,
  holdDurationSeconds: 1.5,
  holdPhaseStability: false,
  reducedMotionVerified: false,
};
const probeReport = {
  scope: "Attempt 4 - verified scoped motion classes, live preference switching, compact/stable React loading button, and AuthFrame visible dimensions",
  geometry: {},
  reducedMotion: {},
  livePreference: {},
  button: {},
  mobileIsolation: {},
  records: [],
};

try {
  for (const theme of ["light", "dark"]) {
    for (const locale of ["en", "ru", "tg"]) {
      for (const width of [320, 390, 768, 1024, 1440]) {
        for (const composition of width >= 1024 ? ["animated-loop", "static-emblem"] : ["static-emblem"]) {
          const context = await browser.newContext({
            viewport: { width, height: width >= 1024 ? 1000 : 844 },
            colorScheme: theme,
          });
          const page = await context.newPage();
          await page.goto(
            `http://127.0.0.1:5174/scripts/fixtures/auth-frame.html?locale=${locale}&composition=${composition}`,
          );
          await page.locator("h1").waitFor();

          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            true,
            `Page overflow: ${theme}/${locale}/${width}/${composition}`,
          );

          const panels = await page
            .locator("section,aside")
            .evaluateAll((elements) =>
              elements.map((el) => ({
                width: el.getBoundingClientRect().width,
                display: getComputedStyle(el).display,
              })),
            );

          if (width >= 1024) {
            assert.equal(panels[0].width, width / 2);
            assert.equal(panels[1].width, width / 2);

            if (composition === "static-emblem") {
              const visible = await page.locator("aside img").evaluate((image) => image.getBoundingClientRect().width);
              const expected = width === 1440 ? 320 : 240;
              assert.ok(
                Math.abs(visible - expected) < 2,
                `Static emblem visible width must be ${expected}px at ${width}px, got ${visible}px`,
              );
            } else if (composition === "animated-loop") {
              const visible = await page
                .locator('aside [data-testid="brand-animated-logo"]')
                .evaluate((el) => el.getBoundingClientRect().width);
              assert.ok(visible <= 500, `Animated loop stage must not exceed 500px, got ${visible}px`);
              if (width === 1440) {
                assert.ok(Math.abs(visible - 500) < 2, `Animated loop stage at 1440 must be 500px, got ${visible}px`);
              }
              if (width === 1024) {
                assert.ok(Math.abs(visible - 375) < 2, `Animated loop stage at 1024 must be 375px, got ${visible}px`);
              }
            }
          } else {
            assert.equal(panels[1].display, "none");
          }

          await page.locator('input[type="email"]').fill("retained@fixture.example");
          await page.getByRole("button", { name: /settings|настройки|танзимот/i }).click();
          await page.getByRole("dialog").waitFor();
          await page.keyboard.press("Escape");
          assert.equal(
            await page.locator('input[type="email"]').inputValue(),
            "retained@fixture.example",
          );

          if (locale === "en" && width === 1440) {
            await page.screenshot({
              path: `${screenshotsDir}/desktop-1440-${theme}-${composition}.png`,
            });
          }
          if (locale === "en" && width === 390 && composition === "static-emblem") {
            await page.screenshot({
              path: `${screenshotsDir}/mobile-390-${theme}.png`,
            });
          }

          await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
          const overflow200 = await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          );
          assert.equal(
            overflow200,
            true,
            `200% font overflow: ${theme}/${locale}/${width}/${composition}`,
          );

          if (width === 320 && composition === "static-emblem") {
            await page.screenshot({
              path: `${screenshotsDir}/mobile-320-${locale}-200pct-${theme}.png`,
            });
          }

          const record = {
            theme,
            locale,
            width,
            composition,
            enlargedOverflow: false,
            protectedArtwork: true,
            fixtureOnly: true,
          };
          records.push(record);
          if (composition === "static-emblem") {
            authFrameRecords.push(record);
          }
          await context.close();
        }
      }
    }
  }

  for (const theme of ["light", "dark"]) {
    for (const dsf of [1, 2]) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: dsf,
        colorScheme: theme,
      });
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:5173/scripts/fixtures/foundation.html?locale=en");
      await page.locator('[data-fixture="actual-react-components"]').waitFor();
      await page.locator('[data-section="brand"]').waitFor();

      const fullLogoElement = page.locator(
        '[data-section="brand"] [data-testid="brand-logo"][data-variant="full"]',
      ).first();
      await fullLogoElement.screenshot({
        path: `${screenshotsDir}/static-full-${dsf}x-${theme}.png`,
      });

      const emblemElement = page.locator(
        '[data-section="brand"] [data-testid="brand-logo"][data-variant="emblem"]',
      ).first();
      await emblemElement.screenshot({
        path: `${screenshotsDir}/static-emblem-${dsf}x-${theme}.png`,
      });

      await context.close();
    }
  }

  {
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: "light",
    });
    const mobilePage = await mobileContext.newPage();
    const imageRequests = [];
    mobilePage.on("request", (req) => {
      if (req.resourceType() === "image") {
        imageRequests.push(req.url());
      }
    });
    await mobilePage.goto(
      "http://127.0.0.1:5174/scripts/fixtures/auth-frame.html?locale=en&composition=animated-loop",
    );
    await mobilePage.locator("h1").waitFor();
    await mobilePage.waitForTimeout(500);

    const loopImageRequested = imageRequests.some((url) => url.includes("loop"));
    assert.equal(loopImageRequested, false, "Loop SVG must not be fetched on phone viewport");
    probeReport.mobileIsolation = {
      viewport: "390x844",
      loopImageFetched: false,
      imageRequests,
    };
    await mobileContext.close();
  }

  {
    const contextGeo = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    const pageGeo = await contextGeo.newPage();
    await pageGeo.goto(
      "http://127.0.0.1:5174/scripts/fixtures/auth-frame.html?locale=en&composition=animated-loop",
    );
    await pageGeo.locator("h1").waitFor();

    const geo = await pageGeo.locator('[data-testid="brand-animated-logo"]').evaluate((el) => {
      const stageRect = el.getBoundingClientRect();
      const img = el.querySelector('img[data-logo-kind="loop"]') || el.querySelector("img");
      const imgRect = img.getBoundingClientRect();
      const heading = el.closest("aside")?.querySelector("h2");
      const headingRect = heading ? heading.getBoundingClientRect() : null;
      return {
        stage: { width: stageRect.width, height: stageRect.height },
        image: { width: imgRect.width, height: imgRect.height },
        margin: {
          left: imgRect.left - stageRect.left,
          right: stageRect.right - imgRect.right,
          top: imgRect.top - stageRect.top,
          bottom: stageRect.bottom - imgRect.bottom,
        },
        editorialGap: headingRect ? headingRect.top - stageRect.bottom : null,
      };
    });

    assert.equal(geo.margin.left > 50, true, "Left margin must be positive and canonical");
    assert.equal(geo.margin.top > 50, true, "Top margin must be positive and canonical");
    assert.equal(Math.abs(geo.margin.left - geo.margin.top) < 2, true, "Margins must be balanced");
    assert.equal(Math.abs(geo.editorialGap - 32) < 4, true, "Editorial gap must be 32px");
    probeReport.geometry = geo;
    await contextGeo.close();
  }

  {
    const contextMotion = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "dark",
      reducedMotion: "no-preference",
    });
    const pageMotion = await contextMotion.newPage();
    await pageMotion.goto(
      "http://127.0.0.1:5174/scripts/fixtures/auth-frame.html?locale=en&composition=animated-loop",
    );
    await pageMotion.locator("h1").waitFor();
    const animatedStage = pageMotion.locator('[data-testid="brand-animated-logo"]');
    await animatedStage.waitFor();

    const samplePlan = [
      { cycle: 1, label: "entrance", waitMs: 600, nominalSec: 0.6 },
      { cycle: 1, label: "letters-rising", waitMs: 1400, nominalSec: 2.0 },
      { cycle: 1, label: "tagline-shine", waitMs: 1200, nominalSec: 3.2 },
      { cycle: 1, label: "readable-hold-a", waitMs: 800, nominalSec: 4.0 },
      { cycle: 1, label: "readable-hold-b", waitMs: 250, nominalSec: 4.25 },
      { cycle: 1, label: "restrained-reset", waitMs: 950, nominalSec: 5.2 },
      { cycle: 2, label: "entrance", waitMs: 800, nominalSec: 6.0 },
      { cycle: 2, label: "letters-rising", waitMs: 1400, nominalSec: 7.4 },
      { cycle: 2, label: "tagline-shine", waitMs: 1200, nominalSec: 8.6 },
      { cycle: 2, label: "readable-hold", waitMs: 800, nominalSec: 9.4 },
      { cycle: 2, label: "restrained-reset", waitMs: 1200, nominalSec: 10.6 },
    ];

    const startTime = performance.now();
    const frameBuffers = [];

    for (const step of samplePlan) {
      await pageMotion.waitForTimeout(step.waitMs);
      const now = performance.now();
      const actualElapsedSec = Number(((now - startTime) / 1000).toFixed(3));
      const filename = `cycle${step.cycle}-${step.nominalSec}s-${step.label}.png`;
      const buf = await animatedStage.screenshot({ path: `${animationDir}/${filename}` });
      const hash = crypto.createHash("sha256").update(buf).digest("hex");
      frameBuffers.push({ label: step.label, cycle: step.cycle, hash, elapsed: actualElapsedSec });

      const metrics = await animatedStage.evaluate((el) => {
        const loopImg = el.querySelector('img[data-logo-kind="loop"]');
        const rect = el.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          src: loopImg?.getAttribute("src") ?? "",
          displayed: loopImg?.complete && loopImg?.naturalWidth > 0,
          naturalWidth: loopImg?.naturalWidth ?? 0,
          naturalHeight: loopImg?.naturalHeight ?? 0,
        };
      });

      assert.equal(metrics.displayed, true, "Animated artwork must be loaded with non-zero natural dimensions");

      animationMetrics.sampleTimes.push({
        cycle: step.cycle,
        label: step.label,
        nominalSec: step.nominalSec,
        measuredElapsedSec: actualElapsedSec,
        file: filename,
        hash,
        ...metrics,
      });
    }

    const entranceHashC1 = frameBuffers.find((f) => f.cycle === 1 && f.label === "entrance").hash;
    const lettersHashC1 = frameBuffers.find((f) => f.cycle === 1 && f.label === "letters-rising").hash;
    const shineHashC1 = frameBuffers.find((f) => f.cycle === 1 && f.label === "tagline-shine").hash;
    const holdAHashC1 = frameBuffers.find((f) => f.cycle === 1 && f.label === "readable-hold-a").hash;
    const holdBHashC1 = frameBuffers.find((f) => f.cycle === 1 && f.label === "readable-hold-b").hash;
    const resetHashC1 = frameBuffers.find((f) => f.cycle === 1 && f.label === "restrained-reset").hash;
    const entranceHashC2 = frameBuffers.find((f) => f.cycle === 2 && f.label === "entrance").hash;

    const distinctPhases = new Set([entranceHashC1, lettersHashC1, shineHashC1, holdAHashC1, resetHashC1]);
    assert.equal(distinctPhases.size >= 4, true, "Animation must visibly progress across distinct visual phases");

    const holdStable = holdAHashC1 === holdBHashC1;
    animationMetrics.holdPhaseStability = holdStable;
    assert.equal(holdStable, true, "Readable hold phase must be stationary and stable");

    const cycleRepeats = resetHashC1 !== holdAHashC1;
    assert.equal(cycleRepeats, true, "Animation must reset from hold");

    animationMetrics.loopVerified = distinctPhases.size >= 4 && holdStable && cycleRepeats;
    animationMetrics.rasterDifferences = [
      { comparison: "entrance vs letters", distinct: entranceHashC1 !== lettersHashC1 },
      { comparison: "letters vs shine", distinct: lettersHashC1 !== shineHashC1 },
      { comparison: "shine vs hold", distinct: shineHashC1 !== holdAHashC1 },
      { comparison: "hold-a vs hold-b", identical: holdAHashC1 === holdBHashC1 },
      { comparison: "hold vs reset", distinct: holdAHashC1 !== resetHashC1 },
      { comparison: "cycle1 vs cycle2 active", distinct: entranceHashC1 !== entranceHashC2 || lettersHashC1 !== holdAHashC1 },
    ];

    await contextMotion.close();
  }

  {
    probeReport.reducedMotion = { frames: {}, indicator: {} };

    for (const theme of ["light", "dark"]) {
      const contextReduced = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        colorScheme: theme,
        reducedMotion: "reduce",
      });
      const pageReduced = await contextReduced.newPage();
      await pageReduced.goto(
        "http://127.0.0.1:5174/scripts/fixtures/auth-frame.html?locale=en&composition=animated-loop",
      );
      await pageReduced.locator("h1").waitFor();
      const reducedLogo = pageReduced.locator('[data-testid="brand-animated-logo"]');
      await reducedLogo.waitFor();

      const reducedHashes = [];
      for (let i = 0; i < 3; i++) {
        const buf = await reducedLogo.screenshot({
          path: `${screenshotsDir}/reduced-motion-desktop-logo-static-${theme}${i > 0 ? `-${i}` : ""}.png`,
        });
        const hash = crypto.createHash("sha256").update(buf).digest("hex");
        reducedHashes.push(hash);
        if (i < 2) await pageReduced.waitForTimeout(1500);
      }

      assert.equal(reducedHashes[0], reducedHashes[1], `Static reduced logo must not change pixels over time (${theme})`);
      assert.equal(reducedHashes[1], reducedHashes[2], `Static reduced logo must stay stable across 3s (${theme})`);

      const domState = await reducedLogo.evaluate((el) => {
        const staticImg = el.querySelector('img[data-logo-kind="static"]');
        const loopImg = el.querySelector('img[data-logo-kind="loop"]');
        return {
          staticDisplay: getComputedStyle(staticImg).display,
          loopDisplay: getComputedStyle(loopImg).display,
          staticSrc: staticImg?.getAttribute("src") ?? "",
          staticNaturalWidth: staticImg?.naturalWidth ?? 0,
          staticNaturalHeight: staticImg?.naturalHeight ?? 0,
        };
      });

      assert.equal(domState.staticDisplay, "block", `Static image must be displayed under reduced motion (${theme})`);
      assert.equal(domState.loopDisplay, "none", `Loop image must be hidden under reduced motion (${theme})`);
      assert.equal(domState.staticNaturalWidth, 1394, `Static image natural width must be full vector logo (${theme})`);
      assert.equal(domState.staticNaturalHeight, 619, `Static image natural height must be full vector logo (${theme})`);

      probeReport.reducedMotion.frames[theme] = {
        hashes: reducedHashes,
        stable: true,
        domState,
      };
      await contextReduced.close();
    }

    {
      const contextInd = await browser.newContext({
        viewport: { width: 600, height: 400 },
        colorScheme: "light",
        reducedMotion: "reduce",
      });
      const pageInd = await contextInd.newPage();
      await pageInd.goto("http://127.0.0.1:5173/scripts/fixtures/foundation.html?locale=en");
      await pageInd.locator('[data-section="buttons"]').waitFor();
      const indicator = pageInd.locator('[data-action="loading"] [data-testid="brand-activity-indicator"]');
      await indicator.waitFor();

      const indHashes = [];
      for (let i = 0; i < 3; i++) {
        const buf = await indicator.screenshot({
          path: `${screenshotsDir}/reduced-motion-indicator-static${i > 0 ? `-${i}` : ""}.png`,
        });
        const hash = crypto.createHash("sha256").update(buf).digest("hex");
        indHashes.push(hash);
        if (i < 2) await pageInd.waitForTimeout(1000);
      }

      assert.equal(indHashes[0], indHashes[1], "Activity indicator must be static under reduced motion");
      assert.equal(indHashes[1], indHashes[2], "Activity indicator must remain static over time");

      const indDom = await indicator.evaluate((el) => {
        const staticImg = el.querySelector('img[data-indicator-kind="static"]');
        const loopImg = el.querySelector('img[data-indicator-kind="loop"]');
        return {
          staticDisplay: getComputedStyle(staticImg).display,
          loopDisplay: getComputedStyle(loopImg).display,
          staticNaturalWidth: staticImg?.naturalWidth ?? 0,
        };
      });

      assert.equal(indDom.staticDisplay, "block", "Static indicator must be displayed");
      assert.equal(indDom.loopDisplay, "none", "Loop indicator must be hidden");
      assert.equal(indDom.staticNaturalWidth > 0, true, "Static indicator must have loaded vector image");

      probeReport.reducedMotion.indicator = {
        hashes: indHashes,
        stable: true,
        indDom,
      };
      await contextInd.close();
    }

    animationMetrics.reducedMotionVerified = true;
  }

  {
    const liveContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
      reducedMotion: "no-preference",
    });
    const livePage = await liveContext.newPage();
    await livePage.goto(
      "http://127.0.0.1:5174/scripts/fixtures/auth-frame.html?locale=en&composition=animated-loop",
    );
    await livePage.locator("h1").waitFor();
    const emailInput = livePage.locator('input[type="email"]');
    await emailInput.fill("live-preference-test@kitob.example");

    const animatedLogo = livePage.locator('[data-testid="brand-animated-logo"]');
    const initialDisplay = await animatedLogo.evaluate((el) => {
      const staticImg = el.querySelector('img[data-logo-kind="static"]');
      const loopImg = el.querySelector('img[data-logo-kind="loop"]');
      return {
        staticDisplay: getComputedStyle(staticImg).display,
        loopDisplay: getComputedStyle(loopImg).display,
      };
    });
    assert.equal(initialDisplay.staticDisplay, "none");
    assert.equal(initialDisplay.loopDisplay, "block");

    await livePage.emulateMedia({ reducedMotion: "reduce" });
    const reducedDisplay = await animatedLogo.evaluate((el) => {
      const staticImg = el.querySelector('img[data-logo-kind="static"]');
      const loopImg = el.querySelector('img[data-logo-kind="loop"]');
      return {
        staticDisplay: getComputedStyle(staticImg).display,
        loopDisplay: getComputedStyle(loopImg).display,
      };
    });
    assert.equal(reducedDisplay.staticDisplay, "block");
    assert.equal(reducedDisplay.loopDisplay, "none");
    assert.equal(await emailInput.inputValue(), "live-preference-test@kitob.example");

    await livePage.emulateMedia({ reducedMotion: "no-preference" });
    const restoredDisplay = await animatedLogo.evaluate((el) => {
      const staticImg = el.querySelector('img[data-logo-kind="static"]');
      const loopImg = el.querySelector('img[data-logo-kind="loop"]');
      return {
        staticDisplay: getComputedStyle(staticImg).display,
        loopDisplay: getComputedStyle(loopImg).display,
      };
    });
    assert.equal(restoredDisplay.staticDisplay, "none");
    assert.equal(restoredDisplay.loopDisplay, "block");
    assert.equal(await emailInput.inputValue(), "live-preference-test@kitob.example");

    probeReport.livePreference = {
      initialDisplay,
      reducedDisplay,
      restoredDisplay,
      inputValueRetained: true,
      dynamicPreferenceSwitchingVerified: true,
    };
    await liveContext.close();
  }

  {
    const contextControls = await browser.newContext({
      viewport: { width: 1000, height: 700 },
      colorScheme: "light",
    });
    const pageControls = await contextControls.newPage();
    await pageControls.goto("http://127.0.0.1:5173/scripts/fixtures/foundation.html?locale=en");
    await pageControls.locator('[data-fixture="actual-react-components"]').waitFor();
    await pageControls.locator('[data-section="buttons"]').waitFor();

    const saveBtn = pageControls.locator('[data-action="save"]');
    const idleSaveBox = await saveBtn.boundingBox();
    const idleSlotCount = await saveBtn.locator("> span").count();
    assert.equal(idleSlotCount, 0, "Compact idle button without loading prop must have no reserved slot spans");
    assert.ok(idleSaveBox.width < 100, `Idle button must be compact, got width ${idleSaveBox.width}px`);
    await saveBtn.screenshot({ path: `${screenshotsDir}/button-compact-idle.png` });

    const idleCompoundBtn = pageControls.locator('[data-action="idle-compound"]');
    const idleCompoundBox = await idleCompoundBtn.boundingBox();
    await idleCompoundBtn.screenshot({ path: `${screenshotsDir}/button-compound-idle-omitted.png` });

    const plainInteractiveBtn = pageControls.locator('[data-action="interactive-plain-loading"]');
    const togglePlainBtn = pageControls.locator('[data-action="toggle-plain-loading"]');
    const counterOutput = pageControls.locator("[data-action-count]");

    const plainIdleBox = await plainInteractiveBtn.boundingBox();
    const plainIdleLabelBox = await plainInteractiveBtn.locator("> span").nth(1).boundingBox();
    await plainInteractiveBtn.screenshot({ path: `${screenshotsDir}/button-plain-idle.png` });

    const countBeforePlain = Number(await counterOutput.getAttribute("data-action-count"));
    await plainInteractiveBtn.click();
    await pageControls.waitForSelector('[data-action="interactive-plain-loading"][aria-busy="true"]');

    const countAfterPlainClick = Number(await counterOutput.getAttribute("data-action-count"));
    assert.equal(countAfterPlainClick, countBeforePlain + 1, "Click must increment count and initiate pending");

    const plainPendingBox = await plainInteractiveBtn.boundingBox();
    const plainPendingLabelBox = await plainInteractiveBtn.locator("> span").nth(1).boundingBox();
    const plainIndicator = plainInteractiveBtn.locator('[data-testid="brand-activity-indicator"]');
    assert.ok(await plainIndicator.isVisible(), "Brand activity indicator must be visible while pending");
    const plainIndicatorBox = await plainIndicator.boundingBox();
    assert.ok(plainIndicatorBox.width > 0 && plainIndicatorBox.height > 0);
    await plainInteractiveBtn.screenshot({ path: `${screenshotsDir}/button-plain-pending.png` });

    const plainWidthDelta = Math.abs(plainPendingBox.width - plainIdleBox.width);
    const plainLabelXDelta = Math.abs(plainPendingLabelBox.x - plainIdleLabelBox.x);
    assert.ok(plainWidthDelta < 1, `Plain button width must not shift when pending (delta: ${plainWidthDelta}px)`);
    assert.ok(plainLabelXDelta < 1, `Plain button label must not shift when pending (delta: ${plainLabelXDelta}px)`);
    assert.ok(plainPendingBox.height >= 44, "Button must maintain min 44px height");

    try {
      await plainInteractiveBtn.click({ timeout: 500 });
    } catch {}
    const countAfterDuplicateAttempt = Number(await counterOutput.getAttribute("data-action-count"));
    assert.equal(countAfterDuplicateAttempt, countAfterPlainClick, "Button must prevent duplicate clicks while pending");

    await togglePlainBtn.click();
    await pageControls.waitForSelector('[data-action="interactive-plain-loading"]:not([aria-busy="true"])');

    const plainRestoredBox = await plainInteractiveBtn.boundingBox();
    const plainRestoredLabelBox = await plainInteractiveBtn.locator("> span").nth(1).boundingBox();
    await plainInteractiveBtn.screenshot({ path: `${screenshotsDir}/button-plain-restored.png` });

    const plainRestoredWidthDelta = Math.abs(plainRestoredBox.width - plainIdleBox.width);
    const plainRestoredLabelXDelta = Math.abs(plainRestoredLabelBox.x - plainIdleLabelBox.x);
    assert.ok(plainRestoredWidthDelta < 1, `Plain button width must restore precisely (delta: ${plainRestoredWidthDelta}px)`);
    assert.ok(plainRestoredLabelXDelta < 1, `Plain button label must restore precisely (delta: ${plainRestoredLabelXDelta}px)`);

    const compoundInteractiveBtn = pageControls.locator('[data-action="interactive-compound-loading"]');
    const toggleCompoundBtn = pageControls.locator('[data-action="toggle-compound-loading"]');

    const compoundIdleBox = await compoundInteractiveBtn.boundingBox();
    const compoundIdleContentBox = await compoundInteractiveBtn.locator("> span").nth(1).boundingBox();
    await compoundInteractiveBtn.screenshot({ path: `${screenshotsDir}/button-compound-idle.png` });

    const countBeforeCompound = Number(await counterOutput.getAttribute("data-action-count"));
    await compoundInteractiveBtn.click();
    await pageControls.waitForSelector('[data-action="interactive-compound-loading"][aria-busy="true"]');

    const countAfterCompoundClick = Number(await counterOutput.getAttribute("data-action-count"));
    assert.equal(countAfterCompoundClick, countBeforeCompound + 1, "Compound click must increment count and initiate pending");

    const compoundPendingBox = await compoundInteractiveBtn.boundingBox();
    const compoundPendingContentBox = await compoundInteractiveBtn.locator("> span").nth(1).boundingBox();
    const compoundIndicator = compoundInteractiveBtn.locator('[data-testid="brand-activity-indicator"]');
    assert.ok(await compoundIndicator.isVisible(), "Compound activity indicator must be visible while pending");
    await compoundInteractiveBtn.screenshot({ path: `${screenshotsDir}/button-compound-pending.png` });

    const compoundWidthDelta = Math.abs(compoundPendingBox.width - compoundIdleBox.width);
    const compoundContentXDelta = Math.abs(compoundPendingContentBox.x - compoundIdleContentBox.x);
    assert.ok(compoundWidthDelta < 1, `Compound button width must not shift when pending (delta: ${compoundWidthDelta}px)`);
    assert.ok(compoundContentXDelta < 1, `Compound button content must not shift when pending (delta: ${compoundContentXDelta}px)`);
    assert.ok(compoundPendingBox.height >= 44, "Compound button must maintain min 44px height");

    try {
      await compoundInteractiveBtn.click({ timeout: 500 });
    } catch {}
    const countAfterCompoundDuplicate = Number(await counterOutput.getAttribute("data-action-count"));
    assert.equal(countAfterCompoundDuplicate, countAfterCompoundClick, "Compound button must prevent duplicate clicks while pending");

    await toggleCompoundBtn.click();
    await pageControls.waitForSelector('[data-action="interactive-compound-loading"]:not([aria-busy="true"])');

    const compoundRestoredBox = await compoundInteractiveBtn.boundingBox();
    const compoundRestoredContentBox = await compoundInteractiveBtn.locator("> span").nth(1).boundingBox();
    await compoundInteractiveBtn.screenshot({ path: `${screenshotsDir}/button-compound-restored.png` });

    const compoundRestoredWidthDelta = Math.abs(compoundRestoredBox.width - compoundIdleBox.width);
    const compoundRestoredContentXDelta = Math.abs(compoundRestoredContentBox.x - compoundIdleContentBox.x);
    assert.ok(compoundRestoredWidthDelta < 1, `Compound button width must restore precisely (delta: ${compoundRestoredWidthDelta}px)`);
    assert.ok(compoundRestoredContentXDelta < 1, `Compound button content must restore precisely (delta: ${compoundRestoredContentXDelta}px)`);

    probeReport.button = {
      compactIdle: {
        width: idleSaveBox.width,
        height: idleSaveBox.height,
        slotCount: idleSlotCount,
      },
      plain: {
        idle: { width: plainIdleBox.width, height: plainIdleBox.height, labelX: plainIdleLabelBox.x },
        pending: { width: plainPendingBox.width, height: plainPendingBox.height, labelX: plainPendingLabelBox.x },
        restored: { width: plainRestoredBox.width, height: plainRestoredBox.height, labelX: plainRestoredLabelBox.x },
        widthDelta: plainWidthDelta,
        labelXDelta: plainLabelXDelta,
        heightSatisfied: plainPendingBox.height >= 44,
        indicator: plainIndicatorBox,
      },
      compound: {
        idle: { width: compoundIdleBox.width, height: compoundIdleBox.height, contentX: compoundIdleContentBox.x },
        pending: { width: compoundPendingBox.width, height: compoundPendingBox.height, contentX: compoundPendingContentBox.x },
        restored: { width: compoundRestoredBox.width, height: compoundRestoredBox.height, contentX: compoundRestoredContentBox.x },
        widthDelta: compoundWidthDelta,
        contentXDelta: compoundContentXDelta,
        heightSatisfied: compoundPendingBox.height >= 44,
      },
    };

    await contextControls.close();
  }

  probeReport.records = records;

  await writeFile(
    `${output}/probes.json`,
    JSON.stringify(probeReport, null, 2),
  );
  await writeFile(
    `${authFrameDir}/probes.json`,
    JSON.stringify({ records: authFrameRecords, fixtureOnly: true }, null, 2),
  );
  await writeFile(
    `${output}/animation-metrics.json`,
    JSON.stringify(animationMetrics, null, 2),
  );

  console.log(`PASS: Captured ${records.length} combinations, 2 verified animation cycles, verified live preference switching, and measured real React button lifecycle without DOM mutation.`);
} finally {
  await browser.close();
}
