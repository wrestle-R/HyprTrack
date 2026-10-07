import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3817",
    trace: "retain-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: {width:1440,height:1000} } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: {width:390,height:844} } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: "npm run start -- --port 3817",
    url: "http://127.0.0.1:3817",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
