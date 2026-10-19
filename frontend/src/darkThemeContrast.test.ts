import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

class ThemeTokenContrast {
  private readonly tokens: Map<string, string>;

  constructor(blockSelector: string) {
    const css: string = readFileSync(resolve(__dirname, "index.css"), "utf8");
    const blockStart: number = css.indexOf(blockSelector);
    const blockEnd: number = css.indexOf("}", blockStart);
    const block: string = css.slice(blockStart, blockEnd);
    this.tokens = new Map<string, string>();
    for (const match of block.matchAll(/--imkon-([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
      this.tokens.set(match[1], match[2]);
    }
  }

  has(name: string): boolean {
    return this.tokens.has(name);
  }

  private luminance(name: string): number {
    const hex: string | undefined = this.tokens.get(name);
    if (hex === undefined) throw new Error(`missing token ${name}`);
    const channels: number[] = [1, 3, 5].map((offset: number): number => {
      const value: number = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  ratio(foreground: string, background: string): number {
    const first: number = this.luminance(foreground);
    const second: number = this.luminance(background);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  }
}

const dark: ThemeTokenContrast = new ThemeTokenContrast(".dark, html.dark {");
const surfaces: string[] = ["cream", "card", "beige"];

describe("dark theme contrast", () => {
  it("defines the graphite surface scale", () => {
    for (const token of ["cream", "card", "beige", "row-hover", "maroon", "maroon-text"]) {
      expect(dark.has(token)).toBe(true);
    }
  });

  for (const surface of surfaces) {
    for (const foreground of ["ink", "muted", "maroon-text", "nav", "success", "warning", "info", "destructive", "accent"]) {
      it(`${foreground} on ${surface} meets 4.5:1`, () => {
        expect(dark.ratio(foreground, surface)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("ink and muted stay readable on row hover", () => {
    expect(dark.ratio("ink", "row-hover")).toBeGreaterThanOrEqual(4.5);
    expect(dark.ratio("muted", "row-hover")).toBeGreaterThanOrEqual(4.5);
  });

  it("on-primary text on primary fill and hover fill meets 4.5:1", () => {
    expect(dark.ratio("on-primary", "maroon")).toBeGreaterThanOrEqual(4.5);
    expect(dark.ratio("on-primary", "maroon-dark")).toBeGreaterThanOrEqual(4.5);
  });

  it("on-accent and on-destructive text meets 4.5:1 on their fills", () => {
    expect(dark.ratio("on-accent", "accent")).toBeGreaterThanOrEqual(4.5);
    expect(dark.ratio("on-destructive", "destructive")).toBeGreaterThanOrEqual(4.5);
  });

  it("status text meets 4.5:1 on its surface", () => {
    expect(dark.ratio("success", "success-surface")).toBeGreaterThanOrEqual(4.5);
    expect(dark.ratio("warning", "warning-surface")).toBeGreaterThanOrEqual(4.5);
    expect(dark.ratio("info", "info-surface")).toBeGreaterThanOrEqual(4.5);
    expect(dark.ratio("destructive", "danger-surface")).toBeGreaterThanOrEqual(4.5);
  });

  it("control borders, ring and chart series meet 3:1 on card", () => {
    expect(dark.ratio("control-border", "card")).toBeGreaterThanOrEqual(3);
    expect(dark.ratio("ring", "card")).toBeGreaterThanOrEqual(3);
    for (let index: number = 1; index <= 8; index += 1) {
      expect(dark.ratio(`series-${index}`, "card")).toBeGreaterThanOrEqual(3);
    }
  });

  it("surfaces step up in lightness for elevation", () => {
    expect(dark.ratio("card", "cream")).toBeGreaterThan(1.04);
    expect(dark.ratio("beige", "card")).toBeGreaterThan(1.1);
  });
});
