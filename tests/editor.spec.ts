import { test, expect, type Page } from "@playwright/test";
import { encode, decode } from "fast-png";
import { unzipSync } from "fflate";
const rgba = [17, 34, 51, 0, 77, 88, 99, 128];
function file(name = "test.png", w = 16, h = 16) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set([30, 60, 90, 255], i);
  data.set(rgba, 0);
  return {
    name,
    mimeType: "image/png",
    buffer: Buffer.from(
      encode({ width: w, height: h, channels: 4, depth: 8, data }),
    ),
  };
}
async function upload(page: Page, files: ReturnType<typeof file>[]) {
  await page.getByTestId("file-input").setInputFiles(files);
  await expect(
    page.getByRole("status").filter({ hasText: "已导入" }),
  ).toBeVisible();
}
async function exported(page: Page) {
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 PNG", exact: true }).click();
  const download = await dl;
  const path = await download.path();
  return {
    png: decode(await (await import("node:fs/promises")).readFile(path!)),
    filename: download.suggestedFilename(),
  };
}
async function point(page: Page, w: number, h: number, x: number, y: number) {
  const box = (await page.getByTestId("pixel-canvas").boundingBox())!;
  const z = Math.max(
    0.125,
    Math.min(16, (box.width - 96) / w, (box.height - 64) / h),
  );
  return {
    x: box.x + (box.width - w * z) / 2 + (x + 0.5) * z,
    y: box.y + (box.height - h * z) / 2 + (y + 0.5) * z,
  };
}
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const e: string[] = [];
  errors.set(page, e);
  page.on("pageerror", (error) => e.push(error.message));
  await page.goto("/editor");
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});
test("single image hides list and preview; worker roundtrip preserves all RGBA", async ({
  page,
}) => {
  await upload(page, [file()]);
  await expect(page.getByRole("heading", { name: "图片列表" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "动画预览" })).toHaveCount(0);
  const p = await exported(page);
  expect(p.png.width).toBe(16);
  expect([...p.png.data.slice(0, 8)]).toEqual(rgba);
});
test("native brush interpolation, undo/redo, picker and alpha eraser", async ({
  page,
}) => {
  await upload(page, [file()]);
  await page.getByRole("textbox", { name: "HEX 颜色" }).fill("#FF0000");
  await page.getByRole("textbox", { name: "HEX 颜色" }).press("Enter");
  const a = await point(page, 16, 16, 2, 2),
    b = await point(page, 16, 16, 8, 2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y);
  await page.mouse.up();
  let p = await exported(page);
  for (let x = 2; x <= 8; x++)
    expect([
      ...p.png.data.slice((2 * 16 + x) * 4, (2 * 16 + x) * 4 + 4),
    ]).toEqual([255, 0, 0, 255]);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  p = await exported(page);
  expect([...p.png.data.slice((2 * 16 + 2) * 4, (2 * 16 + 2) * 4 + 4)]).toEqual(
    [30, 60, 90, 255],
  );
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await page.getByRole("button", { name: "吸管", exact: true }).click();
  const transparent = await point(page, 16, 16, 0, 0);
  await page.mouse.click(transparent.x, transparent.y);
  await expect(page.getByRole("textbox", { name: "HEX 颜色" })).toHaveValue(
    "#112233",
  );
  await expect(page.getByLabel("透明度", { exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "橡皮擦", exact: true }).click();
  await page.mouse.click(a.x, a.y);
  p = await exported(page);
  expect([...p.png.data.slice((2 * 16 + 2) * 4, (2 * 16 + 2) * 4 + 4)]).toEqual(
    [0, 0, 0, 0],
  );
  expect([...p.png.data.slice(0, 4)]).toEqual([17, 34, 51, 0]);
});
test("mixed independent images; conversion mismatch preserves state", async ({
  page,
}) => {
  await upload(page, [file("fish.png", 16, 16), file("flower.png", 32, 32)]);
  await expect(page.getByRole("heading", { name: "图片列表" })).toBeVisible();
  await page.getByRole("button", { name: "作为动画帧编辑" }).click();
  await expect(page.getByRole("dialog")).toContainText("尺寸不一致");
  await expect(
    page.getByRole("button", { name: "进入动画编辑" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByRole("heading", { name: "动画预览" })).toHaveCount(0);
  await page
    .getByRole("button", { name: "编辑 flower.png", exact: true })
    .click();
  expect((await exported(page)).png.width).toBe(32);
});
test("subset conversion, animation playback, mode restoration and ordered ZIP", async ({
  page,
}) => {
  await upload(page, [
    file("fish01.png"),
    file("fish02.png"),
    file("flower.png", 32, 32),
  ]);
  await page
    .getByRole("button", { name: "选择 fish01.png", exact: true })
    .click({ force: true });
  await page
    .getByRole("button", { name: "选择 fish02.png", exact: true })
    .click({ force: true });
  await page.getByRole("button", { name: /作为动画帧编辑/ }).click();
  await page.getByRole("button", { name: "进入动画编辑" }).click();
  await expect(page.getByRole("heading", { name: "动画预览" })).toBeVisible();
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "暂停", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "图片编辑", exact: true }).click();
  await expect(page.getByRole("heading", { name: "动画预览" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "编辑 flower.png", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "动画编辑", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "播放", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "更多导出选项" }).click();
  const wait = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "全部帧 PNG / ZIP", exact: true })
    .click();
  const path = await (await wait).path();
  const zip = unzipSync(
    await (await import("node:fs/promises")).readFile(path!),
  );
  expect(Object.keys(zip)).toEqual(["frame-001.png", "frame-002.png"]);
});
test("one animation frame disables playback, blank frame and undo work", async ({
  page,
}) => {
  await page.getByRole("button", { name: "动画编辑", exact: true }).click();
  await upload(page, [file("one.png")]);
  await expect(
    page.getByRole("button", { name: "播放", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("添加更多帧后可预览动画")).toBeVisible();
  await page.getByRole("button", { name: "添加帧", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "播放", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "播放", exact: true }),
  ).toBeDisabled();
});
test("damaged batch is atomic and shows filename", async ({ page }) => {
  await page.getByTestId("file-input").setInputFiles([
    file("valid.png"),
    {
      name: "broken.png",
      mimeType: "image/png",
      buffer: Buffer.from("broken"),
    },
  ]);
  await expect(
    page.getByRole("alert").filter({ hasText: "broken.png" }),
  ).toContainText("broken.png");
  await expect(
    page.getByText("或将 PNG 拖到这里 · 支持多张图片"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "导出 PNG", exact: true }),
  ).toBeDisabled();
});
test("zoom and pan preserve source coordinates and exact single-pixel edit", async ({
  page,
}) => {
  await upload(page, [file()]);
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await page.getByRole("button", { name: "放大", exact: true }).click();
  const box = (await page.getByTestId("pixel-canvas").boundingBox())!,
    z = 25,
    origin = {
      x: box.x + (box.width - 16 * z) / 2,
      y: box.y + (box.height - 16 * z) / 2,
    };
  await page.getByRole("button", { name: "平移", exact: true }).click();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 23,
    box.y + box.height / 2 + 17,
  );
  await page.mouse.up();
  await page.getByRole("button", { name: "画笔", exact: true }).click();
  await page.mouse.click(origin.x + 23 + 5.5 * z, origin.y + 17 + 5.5 * z);
  const png = (await exported(page)).png;
  let changed = 0;
  const original = decode(file().buffer).data;
  for (let at = 0; at < original.length; at += 4)
    if (original.slice(at, at + 4).some((v, k) => v !== png.data[at + k])) {
      changed++;
      expect(at).toBe((5 * 16 + 5) * 4);
    }
  expect(changed).toBe(1);
});
test("copies, ordering, deletion and undo are coherent", async ({ page }) => {
  await upload(page, [file("a.png"), file("b.png")]);
  await page.getByRole("button", { name: "复制", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "编辑 a-副本.png", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "向前移动" }).click();
  const names = await page.locator(".asset-select > strong").allTextContents();
  expect(names[0]).toBe("a-副本.png");
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "编辑 a-副本.png", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "编辑 a-副本.png", exact: true }),
  ).toBeVisible();
});
test("pointer cancellation commits one stroke; view is preserved across pictures", async ({
  page,
}) => {
  await upload(page, [file("a.png"), file("b.png")]);
  const a = await point(page, 16, 16, 3, 3);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.up();
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect([
    ...(await exported(page)).png.data.slice(
      (3 * 16 + 3) * 4,
      (3 * 16 + 3) * 4 + 4,
    ),
  ]).toEqual([30, 60, 90, 255]);
  await page.getByRole("button", { name: "放大", exact: true }).click();
  const zoom = await page.getByTestId("zoom").textContent();
  await page.getByRole("button", { name: "编辑 b.png", exact: true }).click();
  await page.getByRole("button", { name: "编辑 a.png", exact: true }).click();
  await expect(page.getByTestId("zoom")).toHaveText(zoom!);
});
test("animation import mismatch is rejected without partial append", async ({
  page,
}) => {
  await page.getByRole("button", { name: "动画编辑", exact: true }).click();
  await upload(page, [file("a.png")]);
  await page
    .getByTestId("file-input")
    .setInputFiles([file("b.png"), file("wrong.png", 32, 32)]);
  await expect(
    page.getByRole("alert").filter({ hasText: "wrong.png" }),
  ).toBeVisible();
  await expect(page.locator(".asset-card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "播放", exact: true }),
  ).toBeDisabled();
});
test("animation clock advances without changing selected editing frame", async ({
  page,
}) => {
  await upload(page, [file("a.png"), file("b.png")]);
  await page.getByRole("button", { name: "动画编辑", exact: true }).click();
  await page.getByRole("button", { name: "进入动画编辑" }).click();
  await page.getByRole("spinbutton", { name: "帧率" }).fill("2");
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect(page.getByTestId("preview-index")).toHaveText("2 / 2");
  await expect(page.locator(".canvas-title > strong")).toHaveText("第 1 帧");
  await page.getByRole("button", { name: "暂停", exact: true }).click();
});

test("首页修整示例支持对比、修正和重置", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "查看修整示例" }).click();
  await expect(page).toHaveURL(/#repair-example$/);
  const slider = page.getByRole("slider", { name: "修整前后对比滑杆" });
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("51");
  await page.getByRole("button", { name: "修正示例中的错误像素" }).click();
  await expect(page.getByText("错误像素已修正", { exact: true })).toBeVisible();
  await expect(
    page.locator(".comparison-original rect[fill='#ed36ff']"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "重置修整示例" }).click();
  await expect(slider).toHaveValue("50");
  await expect(
    page.locator(".comparison-original rect[fill='#ed36ff']"),
  ).toHaveCount(1);
});

test("清空项目保留未导出修改确认，侧栏在较矮窗口可完整显示", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/editor/");
  await upload(page, [file()]);
  const p = await point(page, 16, 16, 4, 4);
  await page.mouse.click(p.x, p.y);
  await page.getByRole("button", { name: "清空", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "清空当前项目？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "继续编辑" }).click();
  await expect(page.getByTestId("pixel-canvas")).toBeVisible();
  expect(
    await page
      .locator(".tools-panel")
      .evaluate((el) => el.scrollHeight <= el.clientHeight),
  ).toBe(true);
  await expect(page.locator(".tools-grid kbd")).toHaveCount(0);
  await page.getByRole("button", { name: "清空", exact: true }).click();
  await page.getByRole("button", { name: "确认清空" }).click();
  await expect(
    page.getByRole("button", { name: "清空", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("或将 PNG 拖到这里 · 支持多张图片"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "导出 PNG", exact: true }),
  ).toBeDisabled();
});

test("导入成功提示在顶部自动消失，空画布和底栏保持简洁", async ({ page }) => {
  await page.goto("/editor/");
  await expect(
    page.locator(".empty-icon, .empty-canvas h2, .status-bar"),
  ).toHaveCount(0);
  await upload(page, [file()]);
  const toast = page.getByRole("status").filter({ hasText: "已导入" });
  expect((await toast.boundingBox())!.y).toBeLessThan(120);
  await expect(toast.getByRole("button")).toHaveCount(0);
  await expect(toast).toHaveCount(0, { timeout: 3500 });
});

async function enterDirtyEditor(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "打开编辑器", exact: true }).click();
  await upload(page, [file()]);
  const p = await point(page, 16, 16, 4, 4);
  await page.mouse.click(p.x, p.y);
  await expect(
    page.getByRole("button", { name: "撤销", exact: true }),
  ).toBeEnabled();
}

test("离开确认：Logo 取消保留修改，确认后返回首页", async ({ page }) => {
  await enterDirtyEditor(page);
  const cancel = page.waitForEvent("dialog");
  const click = page
    .getByRole("link", { name: "点修首页" })
    .click({ noWaitAfter: true });
  const dialog = await cancel;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await click;
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(
    page.getByRole("button", { name: "撤销", exact: true }),
  ).toBeEnabled();
  const png = await exported(page);
  expect([
    ...png.png.data.slice((4 * 16 + 4) * 4, (4 * 16 + 4) * 4 + 4),
  ]).toEqual([163, 255, 71, 255]);
  const p = await point(page, 16, 16, 5, 5);
  await page.mouse.click(p.x, p.y);
  const confirm = page.waitForEvent("dialog");
  const leave = page
    .getByRole("link", { name: "点修首页" })
    .click({ noWaitAfter: true });
  await (await confirm).accept();
  await leave;
  await expect(page).toHaveURL("http://127.0.0.1:3102/");
});

test("离开确认：浏览器后退取消保留修改", async ({ page }) => {
  await enterDirtyEditor(page);
  const cancel = page.waitForEvent("dialog");
  await page.evaluate(() => history.back());
  const dialog = await cancel;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(
    page.getByRole("button", { name: "撤销", exact: true }),
  ).toBeEnabled();
  const png = await exported(page);
  expect([
    ...png.png.data.slice((4 * 16 + 4) * 4, (4 * 16 + 4) * 4 + 4),
  ]).toEqual([163, 255, 71, 255]);
});

test("离开确认：浏览器后退确认后离开", async ({ page }) => {
  await enterDirtyEditor(page);
  const confirm = page.waitForEvent("dialog");
  await page.evaluate(() => history.back());
  const dialog = await confirm;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.accept();
  await expect(page).toHaveURL("http://127.0.0.1:3102/");
});

test("离开确认：未修改或已导出的项目正常返回首页", async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", async (d) => {
    dialogs.push(d.type());
    await d.dismiss();
  });
  await page.goto("/editor/");
  await upload(page, [file()]);
  await page.getByRole("link", { name: "点修首页" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3102/");
  await enterDirtyEditor(page);
  await exported(page);
  await page.getByRole("link", { name: "点修首页" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3102/");
  expect(dialogs).toEqual([]);
});

test("Homepage language selection persists in the editor and exported pixels remain intact", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "界面语言" }).selectOption("en");
  await page.getByRole("link", { name: "Open editor" }).click();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await page.getByTestId("file-input").setInputFiles(file());
  await expect(
    page.getByRole("status").filter({ hasText: "Imported 1 images" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("button", { name: "Export PNG", exact: true }),
  ).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  const download = await downloadPromise;
  const png = decode(
    await (await import("node:fs/promises")).readFile((await download.path())!),
  );
  expect([...png.data.slice(0, 8)]).toEqual(rgba);
  await page.getByTestId("file-input").setInputFiles({
    name: "bad.png",
    mimeType: "image/png",
    buffer: Buffer.from("invalid"),
  });
  await expect(page.locator(".toast.error")).toContainText(
    "Not a valid PNG file",
  );
  await page.getByRole("link", { name: "Dianxiu home" }).click();
  await expect(page.getByRole("link", { name: "Open editor" })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page
    .getByRole("combobox", { name: "Interface language" })
    .selectOption("zh");
  await expect(page.getByRole("link", { name: "打开编辑器" })).toBeVisible();
});

test("English animation controls and size errors are translated", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "界面语言" }).selectOption("en");
  await page.getByRole("link", { name: "Open editor" }).click();
  await page
    .getByTestId("file-input")
    .setInputFiles([file("a.png"), file("b.png")]);
  await expect(
    page.getByRole("status").filter({ hasText: "Imported 2 images" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Animation", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Use 2 images in the current list order.",
  );
  await page
    .getByRole("button", { name: "Edit animation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await page.getByTestId("file-input").setInputFiles(file("wrong.png", 8, 8));
  await expect(page.locator(".toast.error")).toContainText(
    "Animation frames must be 16 × 16",
  );
});

test("first visit follows browser language and explicit choice overrides it", async ({
  page,
}) => {
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("dianxiu-language")))
    .toBe("zh");
  await page.evaluate(() => localStorage.removeItem("dianxiu-language"));
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "language", { get: () => "en-US" }),
  );
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("link", { name: "Open editor" })).toBeVisible();
  await page.screenshot({ path: "/tmp/dianxiu-english-home.png" });
  await page
    .getByRole("combobox", { name: "Interface language" })
    .selectOption("zh");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByRole("link", { name: "打开编辑器" })).toBeVisible();
});

test("animation imports fit the final canvas size, including after a manually zoomed frame", async ({
  page,
}) => {
  await page.getByRole("button", { name: "动画编辑", exact: true }).click();
  const assertFitted = async () => {
    await expect
      .poll(async () => {
        const box = (await page.getByTestId("pixel-canvas").boundingBox())!;
        const expected = Math.round(
          Math.max(
            0.125,
            Math.min(16, (box.width - 96) / 512, (box.height - 64) / 512),
          ) * 100,
        );
        return (
          (await page.getByTestId("zoom").textContent()) === `${expected}%`
        );
      })
      .toBe(true);
  };
  await upload(page, [file("first.png", 512, 512)]);
  await assertFitted();
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await upload(page, [file("second.png", 512, 512)]);
  await assertFitted();
  await page.getByRole("button", { name: "图片编辑", exact: true }).click();
  await page.getByRole("button", { name: "动画编辑", exact: true }).click();
  await expect(page.locator(".preview-transition")).toHaveCSS("opacity", "1");
  await expect(page.locator(".mode-switch")).toHaveAttribute(
    "data-mode",
    "animation",
  );
});
