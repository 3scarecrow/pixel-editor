import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const chromePath =
  process.env.CHROME_PATH ||
  (existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : undefined);
export default defineConfig({
  testDir: "./tests",
  testMatch: "editor.spec.ts",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3102",
    viewport: { width: 1440, height: 960 },
    acceptDownloads: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "python3 -m http.server 3102 --bind 127.0.0.1 --directory out",
    port: 3102,
    reuseExistingServer: true,
  },
  projects: [
    {
      name: "chrome",
      use: {
        browserName: "chromium",
        launchOptions: {
          executablePath: chromePath,
        },
      },
    },
    {
      name: "chrome-retina",
      use: {
        browserName: "chromium",
        deviceScaleFactor: 2,
        launchOptions: {
          executablePath: chromePath,
        },
      },
    },
    { name: "firefox", use: { browserName: "firefox" } },
    {
      name: "webkit",
      use: {
        browserName: "webkit",
        launchOptions: { executablePath: process.env.WEBKIT_PATH },
      },
    },
  ],
});
