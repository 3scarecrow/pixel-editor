import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto("http://127.0.0.1:3102/");
await page.locator(".home-features").evaluate(async (el) => {
  await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished));
});
await page.screenshot({ path: "artifacts/home-v4.png", fullPage: true });
await page.goto("http://127.0.0.1:3102/editor/");
await page.getByTestId("file-input").setInputFiles("artifacts/fish-demo.png");
await page.getByRole("status").filter({ hasText: "已导入" }).waitFor();
await page.screenshot({ path: "artifacts/editor-v4.png", fullPage: true });
await browser.close();
