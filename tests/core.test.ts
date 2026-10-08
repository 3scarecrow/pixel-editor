import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync, inflateSync } from "node:zlib";
import {
  EditorStore,
  createImage,
  line,
  LIMITS,
  type RGBA,
} from "../src/core/model";
import {
  decodePNG,
  encodePNG,
  encodeZIP,
  exportNames,
  inspectPNG,
  unzipSync,
} from "../src/core/codec";
function crc(data: Uint8Array) {
  let c = 0xffffffff;
  for (const b of data) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const b = Buffer.alloc(data.length + 12);
  b.writeUInt32BE(data.length);
  b.write(type, 4);
  b.set(data, 8);
  b.writeUInt32BE(crc(b.subarray(4, 8 + data.length)), 8 + data.length);
  return b;
}
function fixture(
  w: number,
  h: number,
  depth: number,
  color: number,
  raw: number[],
  extra: { type: string; data: number[] }[] = [],
  interlace = 0,
) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = depth;
  ihdr[9] = color;
  ihdr[12] = interlace;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    ...extra.map((c) => chunk(c.type, new Uint8Array(c.data))),
    chunk("IDAT", deflateSync(new Uint8Array(raw))),
    chunk("IEND", new Uint8Array()),
  ]);
}
// Read encoded RGBA scanlines independently with node:zlib, not fast-png.
function readRGBA(bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  const parts: Buffer[] = [];
  for (let at = 8; at < b.length; ) {
    const n = b.readUInt32BE(at),
      type = b.toString("ascii", at + 4, at + 8);
    if (type === "IDAT") parts.push(b.subarray(at + 8, at + 8 + n));
    at += n + 12;
  }
  const w = b.readUInt32BE(16),
    h = b.readUInt32BE(20),
    raw = inflateSync(Buffer.concat(parts)),
    result = new Uint8Array(w * h * 4);
  let offset = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[offset++];
    for (let x = 0; x < w * 4; x++) {
      const i = y * w * 4 + x,
        a = x >= 4 ? result[i - 4] : 0,
        up = y ? result[i - w * 4] : 0,
        c = y && x >= 4 ? result[i - w * 4 - 4] : 0,
        p = a + up - c,
        pa = Math.abs(p - a),
        pb = Math.abs(p - up),
        pc = Math.abs(p - c);
      const pred =
        filter === 0
          ? 0
          : filter === 1
            ? a
            : filter === 2
              ? up
              : filter === 3
                ? Math.floor((a + up) / 2)
                : pa <= pb && pa <= pc
                  ? a
                  : pb <= pc
                    ? up
                    : c;
      result[i] = (raw[offset++] + pred) & 255;
    }
  }
  return { w, h, result };
}
test("transparent RGB and semi-transparent channels survive independent PNG read", () => {
  const pixels = new Uint8ClampedArray([
    17, 34, 51, 0, 3, 127, 254, 128, 255, 0, 1, 255,
  ]);
  const png = encodePNG({ width: 3, height: 1, pixels });
  const result = readRGBA(png);
  assert.equal(result.w, 3);
  assert.deepEqual([...result.result], [...pixels]);
  assert.deepEqual([...decodePNG(png).pixels], [...pixels]);
});
test("RGB tRNS and grey alpha preserve channels", () => {
  assert.deepEqual(
    [
      ...decodePNG(
        fixture(
          2,
          1,
          8,
          2,
          [0, 1, 2, 3, 4, 5, 6],
          [{ type: "tRNS", data: [0, 1, 0, 2, 0, 3] }],
        ),
      ).pixels,
    ],
    [1, 2, 3, 0, 4, 5, 6, 255],
  );
  assert.deepEqual(
    [...decodePNG(fixture(2, 1, 8, 4, [0, 88, 0, 77, 128])).pixels],
    [88, 88, 88, 0, 77, 77, 77, 128],
  );
});
test("packed grey 1/2/4-bit and transparency", () => {
  assert.deepEqual(
    [...decodePNG(fixture(3, 1, 1, 0, [0, 0b10100000])).pixels],
    [255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255],
  );
  assert.deepEqual(
    [
      ...decodePNG(
        fixture(2, 1, 2, 0, [0, 0b01100000], [{ type: "tRNS", data: [0, 1] }]),
      ).pixels,
    ],
    [85, 85, 85, 0, 170, 170, 170, 255],
  );
  assert.deepEqual(
    [...decodePNG(fixture(2, 1, 4, 0, [0, 0x38])).pixels],
    [51, 51, 51, 255, 136, 136, 136, 255],
  );
});
test("indexed palette preserves hidden RGB and alpha", () => {
  assert.deepEqual(
    [
      ...decodePNG(
        fixture(
          3,
          1,
          2,
          3,
          [0, 0b00011000],
          [
            { type: "PLTE", data: [17, 34, 51, 100, 101, 102, 201, 202, 203] },
            { type: "tRNS", data: [0, 128, 255] },
          ],
        ),
      ).pixels,
    ],
    [17, 34, 51, 0, 100, 101, 102, 128, 201, 202, 203, 255],
  );
});
test("low-bit Adam7 is explicitly unpacked", () => {
  assert.deepEqual(
    [
      ...decodePNG(fixture(2, 2, 1, 0, [0, 0x80, 0, 0x00, 0, 0x80], [], 1))
        .pixels,
    ],
    [255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255],
  );
});
test("16bit APNG corruption and dimensions are rejected", () => {
  assert.throws(
    () => decodePNG(fixture(1, 1, 16, 6, [0, ...Array(8).fill(0)])),
    /16 位/,
  );
  assert.throws(
    () =>
      inspectPNG(
        fixture(
          1,
          1,
          8,
          6,
          [0, 0, 0, 0, 0],
          [{ type: "acTL", data: Array(8).fill(0) }],
        ),
      ),
    /APNG/,
  );
  const bad = fixture(1, 1, 8, 6, [0, 1, 2, 3, 4]);
  bad[29] ^= 1;
  assert.throws(() => decodePNG(bad), /CRC|crc/);
  assert.throws(() => inspectPNG(fixture(1025, 1, 8, 6, [0])), /1024/);
  assert.throws(() => decodePNG(new Uint8Array([1, 2, 3])), /PNG/);
});
test("ZIP filenames are safe unique and content is faithful", () => {
  const images = ["../A.png", "a.png", "A-2.png"].map((name) => ({
    name,
    width: 1,
    height: 1,
    pixels: new Uint8ClampedArray([1, 2, 3, 0]),
  }));
  assert.equal(
    new Set(exportNames(images, false).map((n) => n.toLowerCase())).size,
    3,
  );
  const zip = unzipSync(encodeZIP(images, true));
  assert.deepEqual(Object.keys(zip), [
    "frame-001.png",
    "frame-002.png",
    "frame-003.png",
  ]);
  Object.values(zip).forEach((p) =>
    assert.deepEqual([...readRGBA(p).result], [1, 2, 3, 0]),
  );
});
test("pixel line connects fast sparse samples without repeats", () => {
  const points: string[] = [];
  line(1, 1, 6, 1, (x, y) => points.push(`${x},${y}`));
  assert.deepEqual(points, ["1,1", "2,1", "3,1", "4,1", "5,1", "6,1"]);
});
test("mixed dimensions accepted independently; conversion is atomic", () => {
  const s = new EditorStore();
  s.import([createImage("a", 32, 32), createImage("b", 64, 64)]);
  const before = s.project;
  assert.throws(() => s.changeMode("animation"), /尺寸不一致/);
  assert.equal(s.project, before);
  assert.equal(s.project.mode, "images");
});
test("subset sequence references images and preserves other pictures", () => {
  const s = new EditorStore(),
    a = createImage("a", 32, 32),
    b = createImage("b", 32, 32),
    c = createImage("c", 64, 64);
  s.import([a, b, c]);
  s.changeMode("animation", [a.id, b.id]);
  assert.deepEqual(s.project.animation?.frameIds, [a.id, b.id]);
  assert.equal(s.project.images.length, 3);
  s.changeMode("images");
  s.import([createImage("d", 16, 16)]);
  assert.deepEqual(s.project.animation?.frameIds, [a.id, b.id]);
  s.undo();
  s.undo();
  assert.equal(s.project.mode, "animation");
});
test("single stroke undo/redo returns exact RGBA and clears redo on branch", () => {
  const s = new EditorStore(),
    i = createImage("a", 4, 4);
  i.pixels.set([17, 34, 51, 0], 0);
  s.import([i]);
  const before = [17, 34, 51, 0] as RGBA,
    after = [2, 3, 4, 128] as RGBA;
  i.pixels.set(after, 0);
  s.stroke(i, new Map([[0, { before, after }]]));
  assert.equal(s.dirty, true);
  s.undo();
  assert.deepEqual([...i.pixels.slice(0, 4)], before);
  assert.equal(s.dirty, false);
  s.redo();
  assert.deepEqual([...i.pixels.slice(0, 4)], after);
  s.undo();
  s.copy();
  assert.equal(s.canRedo, false);
});
test("delete source reference and undo are consistent; last frame protected", () => {
  const s = new EditorStore(),
    a = createImage("a", 2, 2),
    b = createImage("b", 2, 2);
  s.import([a, b]);
  s.changeMode("animation");
  s.changeMode("images");
  s.select(a.id);
  s.remove();
  assert.deepEqual(s.project.animation?.frameIds, [b.id]);
  s.undo();
  assert.deepEqual(s.project.animation?.frameIds, [a.id, b.id]);
  s.changeMode("animation");
  s.remove();
  assert.equal(s.project.images.length, 2);
  assert.equal(s.project.animation?.frameIds.length, 1);
  assert.throws(() => s.remove(), /至少保留/);
});
test("copy has independent pixels and ordering is reversible", () => {
  const s = new EditorStore(),
    i = createImage("a", 2, 2),
    b = createImage("b", 2, 2);
  s.import([i, b]);
  s.copy();
  const copy = s.current!;
  copy.pixels[0] = 255;
  assert.equal(i.pixels[0], 0);
  s.reorder(copy.id, i.id);
  assert.equal(s.project.images[0].id, copy.id);
  s.undo();
  assert.equal(s.project.images[0].id, i.id);
});
test("animation import mismatch and capacity limits do not mutate state", () => {
  const s = new EditorStore();
  s.import([createImage("a", 2, 2)]);
  s.changeMode("animation");
  const n = s.project.images.length;
  assert.throws(() => s.import([createImage("b", 3, 3)]), /尺寸不一致/);
  assert.equal(s.project.images.length, n);
  assert.throws(
    () =>
      s.import(
        Array.from({ length: LIMITS.images }, () => createImage("x", 2, 2)),
      ),
    /100/,
  );
  assert.equal(s.project.images.length, n);
});
test("export snapshots do not clear newer edits and undo restores exported revision", () => {
  const s = new EditorStore(),
    i = createImage("a", 2, 2);
  s.import([i]);
  const paint = (r: number) => {
    const before = [...i.pixels.slice(0, 4)] as RGBA,
      after = [r, 0, 0, 255] as RGBA;
    i.pixels.set(after, 0);
    s.stroke(i, new Map([[0, { before, after }]]));
  };
  paint(1);
  const exported = { id: i.id, revision: i.revision };
  paint(2);
  s.markExported([exported]);
  assert.equal(s.dirty, true);
  s.undo();
  assert.equal(s.dirty, false);
});
test("empty modes and history do not lose data", () => {
  const s = new EditorStore();
  s.changeMode("animation");
  assert.equal(s.current, null);
  s.undo();
  assert.equal(s.project.mode, "images");
  s.redo();
  s.import([createImage("one", 1, 1)]);
  assert.equal(s.project.animation?.frameIds.length, 1);
  s.addBlank();
  assert.equal(s.project.animation?.frameIds.length, 2);
  s.undo();
  assert.equal(s.project.animation?.frameIds.length, 1);
});
test("valid CRC cannot disguise truncated or inflated pixel payload", () => {
  assert.throws(() => decodePNG(fixture(1, 1, 8, 6, [0, 1, 2, 3])), /不完整/);
  assert.throws(
    () => decodePNG(fixture(1, 1, 8, 6, [0, 1, 2, 3, 4, 5])),
    /超过声明尺寸/,
  );
});
test("FPS is view configuration and is not reverted by frame history", () => {
  const s = new EditorStore();
  s.import([createImage("a", 2, 2)]);
  s.changeMode("animation");
  s.addBlank();
  s.fps(20);
  s.undo();
  assert.equal(s.project.animation?.fps, 20);
  s.redo();
  assert.equal(s.project.animation?.fps, 20);
});
test("8-bit Adam7 RGBA preserves all samples", () => {
  const raw = [0, 1, 2, 3, 4, 0, 5, 6, 7, 8, 0, 9, 10, 11, 12, 13, 14, 15, 16];
  assert.deepEqual(
    [...decodePNG(fixture(2, 2, 8, 6, raw, [], 1)).pixels],
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  );
});
test("4-bit Adam7 and indexed 2-bit Adam7 preserve scanline padding", () => {
  assert.deepEqual(
    [
      ...decodePNG(fixture(2, 2, 4, 0, [0, 0x30, 0, 0x80, 0, 0xf0], [], 1))
        .pixels,
    ],
    [51, 51, 51, 255, 136, 136, 136, 255, 255, 255, 255, 255, 0, 0, 0, 255],
  );
  const extras = [
    {
      type: "PLTE",
      data: [17, 34, 51, 77, 88, 99, 101, 102, 103, 201, 202, 203],
    },
    { type: "tRNS", data: [0, 128, 255, 255] },
  ];
  assert.deepEqual(
    [
      ...decodePNG(fixture(2, 2, 2, 3, [0, 0x00, 0, 0x40, 0, 0xb0], extras, 1))
        .pixels,
    ],
    [17, 34, 51, 0, 77, 88, 99, 128, 101, 102, 103, 255, 201, 202, 203, 255],
  );
});
test("history evicts old commands within 64 MiB while last undo still works", () => {
  const s = new EditorStore();
  s.import([createImage("base", 512, 512)]);
  for (let n = 0; n < 40; n++) {
    s.copy();
    s.remove();
  }
  assert.ok(s.historyBytes <= LIMITS.history);
  assert.match(s.notice, /最早/);
  s.undo();
  assert.equal(s.project.images.length, 2);
});
