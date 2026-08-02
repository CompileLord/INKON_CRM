#!/usr/bin/env node
/**
 * Walks the auth API's happy path against a live server:
 *   login -> [resend-code -> verify-code, only with --code] -> refresh -> logout
 *
 * verify-code isn't chained after every login in this API (see the OpenAPI
 * spec: TokenPair.must_set_password is the only signal login gives; there's
 * no separate "verification required" flag). It's exercised here only when
 * --code is passed, for testing the activation path against an unverified
 * account. Otherwise the script goes straight from login to refresh/logout.
 *
 * Usage:
 *   node scripts/smoke-test.mjs --email you@example.com --password secret
 *   node scripts/smoke-test.mjs --email you@example.com --password secret --code 123456
 *   node scripts/smoke-test.mjs --email you@example.com --password secret --new-password NewSecret123
 *   node scripts/smoke-test.mjs --email you@example.com --password secret --base-url http://localhost:8001/api/v1
 *
 * Never prints tokens, passwords, or verification codes — only status codes
 * and booleans.
 */
import { parseArgs } from "node:util";
import axios from "axios";

const DEFAULT_BASE_URL = "http://localhost:8000/api/v1";

const { values: args } = parseArgs({
  options: {
    email: { type: "string" },
    password: { type: "string" },
    code: { type: "string" },
    "new-password": { type: "string" },
    "base-url": { type: "string" },
  },
});

if (!args.email || !args.password) {
  console.error(
    "Usage: node scripts/smoke-test.mjs --email <email> --password <password> " +
      "[--code <6-digit code>] [--new-password <password>] [--base-url <url>]",
  );
  process.exit(1);
}

const baseURL = args["base-url"] ?? process.env.API_BASE_URL ?? DEFAULT_BASE_URL;

const client = axios.create({
  baseURL,
  timeout: 15_000,
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  validateStatus: () => true,
});

function logStep(title) {
  console.log(`\n== ${title} ==`);
}

function logResult(response, description) {
  const passed = response.status >= 200 && response.status < 300;
  console.log(`${passed ? "OK" : "FAIL"}: ${description} -> HTTP ${response.status}`);
  if (!passed) {
    const detail = response.data?.detail;
    console.log(`  detail: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
  return passed;
}

function requireOk(response, description) {
  if (!logResult(response, description)) {
    console.error(`\nSmoke test aborted: "${description}" did not succeed.`);
    process.exit(1);
  }
}

async function main() {
  console.log(`Target: ${baseURL}`);

  logStep("login");
  let res = await client.post("/auth/login", { email: args.email, password: args.password });
  requireOk(res, "POST /auth/login");
  let tokens = res.data;
  console.log(`  must_set_password: ${tokens.must_set_password}`);
  console.log(`  received access_token: ${typeof tokens.access_token === "string"}`);
  console.log(`  received refresh_token: ${tokens.refresh_token !== null}`);

  if (tokens.must_set_password) {
    if (!args["new-password"]) {
      console.log(
        "\nAccount requires set-password but no --new-password was given; skipping that step.",
      );
    } else {
      logStep("set-password");
      res = await client.post(
        "/auth/set-password",
        { new_password: args["new-password"] },
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      );
      requireOk(res, "POST /auth/set-password");
      tokens = res.data;
      console.log(`  must_set_password: ${tokens.must_set_password}`);
    }
  }

  if (args.code) {
    logStep("resend-code");
    res = await client.post("/auth/resend-code", { email: args.email });
    logResult(res, "POST /auth/resend-code");

    logStep("verify-code");
    res = await client.post("/auth/verify-code", { email: args.email, code: args.code });
    if (logResult(res, "POST /auth/verify-code")) {
      console.log(`  received access_token: ${typeof res.data.access_token === "string"}`);
    }
  } else {
    console.log("\n(--code not given: skipping resend-code/verify-code demonstration)");
  }

  logStep("refresh");
  res = await client.post("/auth/refresh", { refresh_token: tokens.refresh_token });
  requireOk(res, "POST /auth/refresh");
  const refreshed = res.data;
  console.log(`  received new access_token: ${typeof refreshed.access_token === "string"}`);
  const refreshTokenForLogout = refreshed.refresh_token ?? tokens.refresh_token;

  logStep("logout");
  res = await client.post("/auth/logout", { refresh_token: refreshTokenForLogout });
  requireOk(res, "POST /auth/logout");

  logStep("verify server-side revoke (informational, non-fatal)");
  res = await client.post("/auth/refresh", { refresh_token: refreshTokenForLogout });
  if (res.status >= 400) {
    console.log(`OK: refresh token rejected after logout -> HTTP ${res.status}, as expected`);
  } else {
    console.log(
      `WARN: refresh token still accepted after logout (HTTP ${res.status}) — server may not revoke on logout`,
    );
  }

  console.log("\nSmoke test complete: login -> refresh -> logout all succeeded.");
}

main().catch((err) => {
  console.error("\nSmoke test crashed:", err.message);
  process.exit(1);
});
