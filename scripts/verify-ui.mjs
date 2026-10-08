import { chromium } from "@playwright/test";
import { encode } from "fast-png";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = process.env.PREVIEW_URL || "http://127.0.0.1:3102";
const shape = [
  "....................",
  "..........oo........",
  ".........oaoo.......",
  "..oo....oaaaoo......",
  ".occo..occccccoo....",
  ".occcooccccccccwo...",
  "..occccccccccccwooo.",
  "...occcccccccccccco.",
  "..occcccccccccccoo..",
  ".occcoocccccccoo....",
  ".occo..ooaccoo......",
  "..oo.....oooo.......",
];
const palette = {
  o: [18, 38, 49, 255],
  c: [88, 200, 178, 255],
  a: [255, 174, 82, 255],
  w: [244, 241, 217, 255],
};
function fish(frame = 0) {
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < shape.length; y++)
    for (let x = 0; x < shape[y].length; x++) {
      const c = palette[shape[y][x]];
      if (!c) continue;
      for (let yy = 0; yy < 2; yy++)
        for (let xx = 0; xx < 2; xx++) {
          const px = 12 + x * 2 + xx,
            py = 20 + y * 2 + yy + (x < 5 ? frame : 0);
          pixels.set(c, (py * 64 + px) * 4);
        }
    }
  return encode({ width: 64, height: 64, channels: 4, depth: 8, data: pixels });
}
function tile(w, color) {
  const pixels = new Uint8Array(w * w * 4);
  for (let y = w / 4; y < (w * 3) / 4; y++)
    for (let x = w / 4; x < (w * 3) / 4; x++)
      pixels.set(color, (y * w + x) * 4);
  return encode({ width: w, height: w, channels: 4, depth: 8, data: pixels });
}
async function upload(files) {
  await page.getByTestId("file-input").setInputFiles(
    files.map(([name, bytes]) => ({
      name,
      mimeType: "image/png",
      buffer: Buffer.from(bytes),
    })),
  );
  await page.getByRole("status").filter({ hasText: "已导入" }).waitFor();
}
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/fish-demo.png", fish());
await page.goto(base);
await page.screenshot({ path: "artifacts/home.png", fullPage: true });
await page.goto(base + "/editor/");
await page.screenshot({ path: "artifacts/editor-empty.png" });
await upload([
  ["fish.png", fish()],
  ["flower.png", tile(32, [255, 106, 145, 255])],
  ["chest.png", tile(48, [64, 147, 221, 255])],
]);
await page.getByRole("button", { name: "编辑 fish.png", exact: true }).click();
await page.getByRole("button", { name: "关闭提示" }).click();
await page.screenshot({ path: "artifacts/editor-images.png" });
await page.goto(base + "/editor/");
await upload([
  ["fish01.png", fish(0)],
  ["fish02.png", fish(1)],
  ["fish03.png", fish(0)],
  ["fish04.png", fish(-1)],
]);
await page.getByRole("button", { name: "作为动画帧编辑" }).click();
await page.getByRole("button", { name: "进入动画编辑" }).click();
await page
  .getByRole("button", { name: "编辑 fish02.png", exact: true })
  .click();
await page.getByRole("button", { name: "关闭提示" }).click();
await page.screenshot({ path: "artifacts/editor-animation.png" });
const metrics = [];
for (const size of [64, 256, 1024]) {
  await page.goto(base + "/editor/");
  const pixels = new Uint8Array(size * size * 4);
  for (let at = 0; at < pixels.length; at += 4)
    pixels.set([30, 60, 90, 255], at);
  await upload([
    [
      `benchmark-${size}.png`,
      encode({
        width: size,
        height: size,
        channels: 4,
        depth: 8,
        data: pixels,
      }),
    ],
  ]);
  await page.evaluate(() => {
    window.measure = { down: [], up: [], paint: [], starts: {} };
    for (const type of ["pointerdown", "pointerup"]) {
      document.addEventListener(
        type,
        (e) => {
          if (e.target.getAttribute("data-testid") === "pixel-canvas")
            window.measure.starts[type] = performance.now();
        },
        true,
      );
      document.addEventListener(type, (e) => {
        if (e.target.getAttribute("data-testid") !== "pixel-canvas") return;
        const start = window.measure.starts[type];
        window.measure[type === "pointerdown" ? "down" : "up"].push(
          performance.now() - start,
        );
        if (type === "pointerup")
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              window.measure.paint.push(performance.now() - start),
            ),
          );
      });
    }
  });
  const box = await page.getByTestId("pixel-canvas").boundingBox();
  for (let n = 0; n < 3; n++) {
    await page
      .getByRole("button", { name: n % 2 ? "橡皮擦" : "画笔", exact: true })
      .click();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(60);
  }
  const measured = await page.evaluate(() => window.measure);
  metrics.push({
    size,
    downHandlerMs: measured.down,
    upHandlerMs: measured.up,
    secondRafMs: measured.paint,
  });
}
await writeFile(
  "artifacts/performance.json",
  JSON.stringify(
    {
      browser: await browser.version(),
      viewport: { width: 1440, height: 960 },
      dpr: 1,
      errors,
      metrics,
    },
    null,
    2,
  ),
);
await browser.close();
console.log(JSON.stringify({ errors, metrics }, null, 2));
