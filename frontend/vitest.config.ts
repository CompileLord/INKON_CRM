import { defineConfig } from "vitest/config";

process.env.TZ = "Asia/Dushanbe";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
