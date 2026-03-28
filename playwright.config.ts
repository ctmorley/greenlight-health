import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "smoke",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /smoke\.spec\.ts/,
    },
    {
      name: "sprint4",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /sprint4-wizard\.spec\.ts/,
    },
    {
      name: "sprint5",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /sprint5-detail-status\.spec\.ts/,
    },
    {
      name: "sprint6",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /sprint6-denials-appeals\.spec\.ts/,
    },
    {
      name: "sprint7",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /sprint7-analytics-settings\.spec\.ts/,
    },
    {
      name: "sprint8",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /sprint8-ehr-launch\.spec\.ts/,
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
