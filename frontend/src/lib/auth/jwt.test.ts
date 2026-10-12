import { describe, expect, it } from "vitest";
import { decodeAccessToken } from "./jwt";

const future = Math.floor(Date.now() / 1000) + 3600;

function token(payload: unknown): string {
  const encoded = btoa(JSON.stringify(payload)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `header.${encoded}.unit-fixture`;
}

describe("canonical backend access identity", () => {
  it.each(["superadmin", "mentor", "student", "accountant"])("normalizes signed-contract sub for %s", (role) => {
    expect(decodeAccessToken(token({ sub: "42", role, exp: future }))).toEqual({ userId: 42, role, expiresAt: future, mustSetPassword: false });
  });

  it("retains password scope independently of the response boolean", () => {
    expect(decodeAccessToken(token({ sub: "7", role: "mentor", exp: future, scope: "must_set_password" }))?.mustSetPassword).toBe(true);
  });

  it.each([
    null, [], "string", {},
    { user_id: 42, role: "student", exp: future },
    { sub: "0", role: "student", exp: future },
    { sub: "-1", role: "student", exp: future },
    { sub: "1.5", role: "student", exp: future },
    { sub: " 42", role: "student", exp: future },
    { sub: "9007199254740993", role: "student", exp: future },
    { sub: 42, role: "student", exp: future },
    { sub: "42", role: "owner", exp: future },
    { sub: "42", role: "student", exp: "later" },
    { sub: "42", role: "student", exp: 1 },
    { sub: "42", role: "student", exp: future, scope: "password_reset" },
  ])("rejects malformed or ambiguous identity %#", (payload) => {
    expect(decodeAccessToken(token(payload))).toBeNull();
  });

  it("rejects invalid token encoding without throwing", () => {
    expect(decodeAccessToken("broken")).toBeNull();
    expect(decodeAccessToken("header.!.signature")).toBeNull();
  });
});
