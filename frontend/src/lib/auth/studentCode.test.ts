import { describe, expect, it } from "vitest";
import { normalizeStudentCode } from "./studentCode";

describe("normalizeStudentCode", () => {
  it("uppercases a five digit plus one letter code", () => {
    expect(normalizeStudentCode("12345a")).toBe("12345A");
    expect(normalizeStudentCode("98765z")).toBe("98765Z");
  });

  it("leaves an already uppercase code unchanged", () => {
    expect(normalizeStudentCode("12345A")).toBe("12345A");
  });

  it("never alters staff or custom passwords that do not have the code shape", () => {
    expect(normalizeStudentCode("secret123")).toBe("secret123");
    expect(normalizeStudentCode("12345abc")).toBe("12345abc");
    expect(normalizeStudentCode("1234ab")).toBe("1234ab");
    expect(normalizeStudentCode("123456")).toBe("123456");
  });
});
