import { decodePNG, encodePNG, encodeZIP, inspectPNG } from "../core/codec";
import { LIMITS, type AnimationSequence } from "../core/model";
import type { DecodedImage } from "../core/codec";
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (data: unknown, transfer?: Transferable[]) => void;
};
ctx.onmessage = ({ data }) => {
  const { id, type, payload } = data;
  try {
    if (type === "decode") {
      const files = payload.files as { name: string; bytes: Uint8Array }[];
      const sequence = payload.sequence as AnimationSequence | null;
      let total = payload.existingPixels as number;
      let size = sequence
        ? { width: sequence.width, height: sequence.height }
        : null;
      for (const f of files) {
        try {
          const h = inspectPNG(f.bytes);
          total += h.width * h.height;
          if (total > LIMITS.pixels) throw Error("项目总像素超过 1600 万");
          if (payload.mode === "animation") {
            if (size && (size.width !== h.width || size.height !== h.height))
              throw Error(
                `动画帧须为 ${size.width} × ${size.height}，此图片为 ${h.width} × ${h.height}`,
              );
            size ??= h;
          }
        } catch (e) {
          throw Error(`${f.name}：${(e as Error).message}`);
        }
      }
      const images = files.map((f, index) => {
        let image;
        try {
          image = decodePNG(f.bytes, f.name);
        } catch (e) {
          throw Error(`${f.name}：解码失败，${(e as Error).message}`);
        }
        ctx.postMessage({ id, progress: (index + 1) / files.length });
        return image;
      });
      ctx.postMessage(
        { id, result: images },
        images.map((i) => i.pixels.buffer),
      );
    } else {
      const images = payload.images as DecodedImage[];
      const bytes =
        type === "png"
          ? encodePNG(images[0])
          : encodeZIP(images, payload.animation);
      ctx.postMessage({ id, result: bytes }, [bytes.buffer]);
    }
  } catch (e) {
    ctx.postMessage({ id, error: (e as Error).message || "图片处理失败" });
  }
};
