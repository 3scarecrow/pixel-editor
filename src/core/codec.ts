import { decode, encode, type DecodedPng } from "fast-png";
import { unzipSync, zipSync, Unzlib } from "fflate";
import { LIMITS } from "./model";
export interface DecodedImage {
  name: string;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  return c >>> 0;
});
function crc(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes)
    value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
export function inspectPNG(bytes: Uint8Array) {
  const magic = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || !magic.every((v, i) => bytes[i] === v))
    throw Error("不是有效的 PNG 文件");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8,
    ended = false;
  const chunks: { type: string; data: Uint8Array; raw: Uint8Array }[] = [];
  while (pos + 12 <= bytes.length) {
    const size = view.getUint32(pos);
    if (size > bytes.length - pos - 12) throw Error("PNG 数据损坏或不完整");
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    if (
      crc(bytes.subarray(pos + 4, pos + 8 + size)) !==
      view.getUint32(pos + 8 + size)
    )
      throw Error(`PNG CRC 校验失败 (${type})`);
    if (type === "acTL") throw Error("暂不支持 APNG，请导入独立 PNG 帧");
    chunks.push({
      type,
      data: bytes.subarray(pos + 8, pos + 8 + size),
      raw: bytes.subarray(pos, pos + size + 12),
    });
    pos += size + 12;
    if (type === "IEND") {
      ended = true;
      break;
    }
  }
  if (
    !ended ||
    chunks[0]?.type !== "IHDR" ||
    chunks[0].data.length !== 13 ||
    chunks.filter((c) => c.type === "IHDR").length !== 1 ||
    !chunks.some((c) => c.type === "IDAT") ||
    chunks.at(-1)?.data.length !== 0
  )
    throw Error("PNG 头部或结束标记损坏");
  const width = view.getUint32(16),
    height = view.getUint32(20),
    depth = bytes[24],
    color = bytes[25],
    interlace = bytes[28];
  if (width < 1 || height < 1 || width > LIMITS.side || height > LIMITS.side)
    throw Error(`图片宽高须在 1–${LIMITS.side} 像素内`);
  if (depth === 16) throw Error("暂不支持 16 位 PNG，请先转为 8 位");
  if (
    ![1, 2, 4, 8].includes(depth) ||
    ![0, 2, 3, 4, 6].includes(color) ||
    (depth < 8 && color !== 0 && color !== 3) ||
    bytes[26] !== 0 ||
    bytes[27] !== 0 ||
    interlace > 1
  )
    throw Error("不支持的 PNG 格式");
  const palette = chunks.find((c) => c.type === "PLTE")?.data,
    trns = chunks.find((c) => c.type === "tRNS")?.data;
  if (
    color === 3 &&
    (!palette ||
      !palette.length ||
      palette.length % 3 !== 0 ||
      palette.length / 3 > 1 << depth)
  )
    throw Error("PNG 调色板不正确");
  if (
    trns &&
    ((color === 0 && trns.length !== 2) ||
      (color === 2 && trns.length !== 6) ||
      (color === 3 && trns.length > (palette?.length ?? 0) / 3) ||
      color === 4 ||
      color === 6)
  )
    throw Error("PNG 透明信息不正确");
  return { width, height, depth, color, interlace, chunks };
}
// fast-png assumes byte-sized Adam7 samples. Expand packed low-bit samples
// independently; all source chunks have already passed CRC checks.
function inflated(header: ReturnType<typeof inspectPNG>, capture: boolean) {
  const { width, height, depth, color, interlace, chunks } = header,
    channels = color === 2 ? 3 : color === 4 ? 2 : color === 6 ? 4 : 1;
  const passes = interlace
    ? [
        [0, 0, 8, 8],
        [4, 0, 8, 8],
        [0, 4, 4, 8],
        [2, 0, 4, 4],
        [0, 2, 2, 4],
        [1, 0, 2, 2],
        [0, 1, 1, 2],
      ]
    : [[0, 0, 1, 1]];
  let expected = 0;
  for (const [x, y, xs, ys] of passes) {
    const w = Math.max(0, Math.ceil((width - x) / xs)),
      h = Math.max(0, Math.ceil((height - y) / ys));
    if (w && h) expected += h * (1 + Math.ceil((w * channels * depth) / 8));
  }
  let length = 0;
  const output = capture ? new Uint8Array(expected) : null;
  const unzip = new Unzlib((bytes) => {
    if (length + bytes.length > expected)
      throw Error("PNG 解压数据超过声明尺寸");
    output?.set(bytes, length);
    length += bytes.length;
  });
  const parts = chunks.filter((c) => c.type === "IDAT");
  for (const [index, part] of parts.entries()) {
    for (let at = 0; at < part.data.length; at += 1024)
      unzip.push(
        part.data.subarray(at, at + 1024),
        index === parts.length - 1 && at + 1024 >= part.data.length,
      );
    if (part.data.length === 0 && index === parts.length - 1)
      unzip.push(new Uint8Array(), true);
  }
  if (length !== expected) throw Error("PNG 像素数据不完整");
  return output;
}
function lowBitAdam7(header: ReturnType<typeof inspectPNG>, data: Uint8Array) {
  const { width, height, depth } = header;
  const output = new Uint8Array(width * height);
  let offset = 0;
  for (const [x, y, xs, ys] of [
    [0, 0, 8, 8],
    [4, 0, 8, 8],
    [0, 4, 4, 8],
    [2, 0, 4, 4],
    [0, 2, 2, 4],
    [1, 0, 2, 2],
    [0, 1, 1, 2],
  ]) {
    const w = Math.max(0, Math.ceil((width - x) / xs)),
      h = Math.max(0, Math.ceil((height - y) / ys));
    if (!w || !h) continue;
    const rowBytes = Math.ceil((w * depth) / 8);
    let previous = new Uint8Array(rowBytes);
    for (let row = 0; row < h; row++) {
      const filter = data[offset++];
      if (filter > 4 || offset + rowBytes > data.length)
        throw Error("交错 PNG 数据不完整");
      const line = new Uint8Array(rowBytes);
      for (let j = 0; j < rowBytes; j++) {
        const a = j ? line[j - 1] : 0,
          b = previous[j],
          c = j ? previous[j - 1] : 0;
        const p = a + b - c,
          pa = Math.abs(p - a),
          pb = Math.abs(p - b),
          pc = Math.abs(p - c);
        const predictor =
          filter === 0
            ? 0
            : filter === 1
              ? a
              : filter === 2
                ? b
                : filter === 3
                  ? Math.floor((a + b) / 2)
                  : pa <= pb && pa <= pc
                    ? a
                    : pb <= pc
                      ? b
                      : c;
        line[j] = (data[offset + j] + predictor) & 255;
      }
      offset += rowBytes;
      for (let col = 0; col < w; col++)
        output[(y + row * ys) * width + x + col * xs] =
          (line[Math.floor((col * depth) / 8)] >>
            (8 - depth - ((col * depth) % 8))) &
          ((1 << depth) - 1);
      previous = line;
    }
  }
  if (offset !== data.length) throw Error("PNG 像素数据长度不正确");
  return output;
}
export function decodePNG(bytes: Uint8Array, name = "image.png"): DecodedImage {
  const h = inspectPNG(bytes);
  const packed = inflated(h, h.interlace === 1 && h.depth < 8);
  const trns = h.chunks.find((c) => c.type === "tRNS")?.data;
  let png: DecodedPng;
  if (h.interlace === 1 && h.depth < 8) {
    const plte = h.chunks.find((c) => c.type === "PLTE")?.data;
    const palette = plte
      ? Array.from({ length: plte.length / 3 }, (_, i) => [
          plte[i * 3],
          plte[i * 3 + 1],
          plte[i * 3 + 2],
          trns?.[i] ?? 255,
        ])
      : undefined;
    if (h.color === 3 && !palette) throw Error("PNG 调色板缺失");
    png = {
      width: h.width,
      height: h.height,
      depth: h.depth as 1 | 2 | 4,
      channels: 1,
      data: lowBitAdam7(h, packed!),
      text: {},
      palette,
    };
  } else {
    // The library wrongly compares RGB tRNS's 3 samples with image pixel count.
    // Read RGB/grey transparency ourselves so valid one/two-pixel PNGs work.
    if (trns && (h.color === 0 || h.color === 2)) {
      if (trns.length !== (h.color === 0 ? 2 : 6))
        throw Error("PNG 透明信息长度不正确");
      const chunks = h.chunks
        .filter((c) => c.type !== "tRNS")
        .map((c) => c.raw);
      const clean = new Uint8Array(
        8 + chunks.reduce((n, c) => n + c.length, 0),
      );
      clean.set(bytes.subarray(0, 8));
      let at = 8;
      for (const c of chunks) {
        clean.set(c, at);
        at += c.length;
      }
      png = decode(clean, { checkCrc: true });
    } else png = decode(bytes, { checkCrc: true });
  }
  const transparency =
    trns && (h.color === 0 || h.color === 2)
      ? Uint16Array.from(
          { length: trns.length / 2 },
          (_, i) => (trns[i * 2] << 8) | trns[i * 2 + 1],
        )
      : png.transparency;
  const { width, height, depth, channels, palette } = png;
  const output = new Uint8ClampedArray(width * height * 4);
  const samples = h.interlace === 1 && depth < 8 ? png.data : null;
  const stride = Math.ceil((width * channels * depth) / 8),
    mask = (1 << depth) - 1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const pos = y * width + x,
        at = pos * 4;
      const value =
        depth < 8
          ? samples
            ? samples[pos]
            : (png.data[y * stride + Math.floor((x * depth) / 8)] >>
                (8 - depth - ((x * depth) % 8))) &
              mask
          : png.data[pos * channels];
      if (palette) {
        const c = palette[value];
        if (!c) throw Error("PNG 调色板索引不正确");
        output.set([c[0], c[1], c[2], c[3] ?? 255], at);
      } else if (channels === 1 || channels === 2) {
        const g = Math.round((value * 255) / mask);
        output.set(
          [
            g,
            g,
            g,
            channels === 2
              ? png.data[pos * channels + 1]
              : transparency?.length && value === transparency[0]
                ? 0
                : 255,
          ],
          at,
        );
      } else {
        const k = pos * channels,
          r = png.data[k],
          g = png.data[k + 1],
          b = png.data[k + 2];
        output.set(
          [
            r,
            g,
            b,
            channels === 4
              ? png.data[k + 3]
              : transparency?.length === 3 &&
                  r === transparency[0] &&
                  g === transparency[1] &&
                  b === transparency[2]
                ? 0
                : 255,
          ],
          at,
        );
      }
    }
  return { name, width, height, pixels: output };
}
export function encodePNG(
  image: Pick<DecodedImage, "width" | "height" | "pixels">,
) {
  return encode({
    width: image.width,
    height: image.height,
    data: image.pixels,
    channels: 4,
    depth: 8,
  });
}
export function exportNames(images: { name: string }[], animation: boolean) {
  const used = new Set<string>();
  return images.map((image, index) => {
    if (animation) return `frame-${String(index + 1).padStart(3, "0")}.png`;
    const base = (
      image.name
        .replace(/\.png$/i, "")
        .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
        .replace(/^\.+/, "")
        .trim() || "image"
    ).slice(0, 120);
    let name = base + ".png",
      i = 2;
    while (used.has(name.toLowerCase())) name = `${base}-${i++}.png`;
    used.add(name.toLowerCase());
    return name;
  });
}
export function encodeZIP(images: DecodedImage[], animation: boolean) {
  const names = exportNames(images, animation);
  const entries: Record<string, Uint8Array> = {};
  images.forEach((image, index) => {
    entries[names[index]] = encodePNG(image);
  });
  return zipSync(entries, { level: 0 });
}
export { unzipSync };
