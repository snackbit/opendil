import { defineConfig } from "@playwright/test";

/**
 * Browser tests for the site (apps/site). Build first: `npm run build` (with
 * SITE_BASE_PATH to test a subpath). Specs use relative URLs ("docs/") so they
 * follow the base path.
 */
const basePath = process.env.SITE_BASE_PATH?.replace(/\/+$/, "") ?? "";
const origin = "http://127.0.0.1:3101";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: origin + basePath + "/",
    viewport: { width: 1280, height: 900 },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run start -w @opendil/site",
    url: origin + basePath + "/",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
