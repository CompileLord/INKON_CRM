import { describe, expect, it } from "vitest";
import enCommon from "./locales/en/common.json";
import ruCommon from "./locales/ru/common.json";
import tgCommon from "./locales/tg/common.json";
import enStudents from "./locales/en/students.json";
import ruStudents from "./locales/ru/students.json";
import enMentors from "./locales/en/mentors.json";
import ruMentors from "./locales/ru/mentors.json";

describe("shared form labels", () => {
  it("defines one email label per language in common", () => {
    expect(enCommon.emailLabel).toBe("Email");
    expect(ruCommon.emailLabel).toBe("Электронная почта");
    expect(tgCommon.emailLabel.length).toBeGreaterThan(0);
  });

  it("does not keep per-module email labels that could drift", () => {
    for (const bundle of [enStudents, ruStudents, enMentors, ruMentors] as Array<Record<string, unknown>>) {
      expect(bundle).not.toHaveProperty("emailLabel");
      const form = bundle.form as Record<string, unknown>;
      expect(form).not.toHaveProperty("emailLabel");
    }
  });
});
