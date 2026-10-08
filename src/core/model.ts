export type RGBA = [number, number, number, number];
export type Mode = "images" | "animation";
export interface PixelImage {
  id: string;
  name: string;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  revision: number;
}
export interface AnimationSequence {
  width: number;
  height: number;
  frameIds: string[];
  activeFrameId: string;
  fps: number;
}
export interface Project {
  id: string;
  mode: Mode;
  images: PixelImage[];
  activeImageId: string | null;
  animation: AnimationSequence | null;
  revision: number;
}
export interface View {
  zoom: number;
  panX: number;
  panY: number;
}
export const LIMITS = {
  side: 1024,
  pixels: 16_000_000,
  images: 100,
  bytes: 50 * 1024 * 1024,
  history: 64 * 1024 * 1024,
};
let serial = 0;
const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `image-${Date.now()}-${++serial}`;
export const createImage = (
  name: string,
  width: number,
  height: number,
  pixels: Uint8ClampedArray = new Uint8ClampedArray(width * height * 4),
): PixelImage => ({ id: uid(), name, width, height, pixels, revision: 0 });
const empty = (): Project => ({
  id: uid(),
  mode: "images",
  images: [],
  activeImageId: null,
  animation: null,
  revision: 0,
});
const snapshot = (p: Project): Project => ({
  ...p,
  images: [...p.images],
  animation: p.animation
    ? { ...p.animation, frameIds: [...p.animation.frameIds] }
    : null,
});
export function capacity(images: PixelImage[]) {
  if (images.length > LIMITS.images)
    throw Error(`最多导入 ${LIMITS.images} 张图片`);
  if (
    images.some(
      (i) =>
        !Number.isInteger(i.width) ||
        !Number.isInteger(i.height) ||
        i.width < 1 ||
        i.height < 1 ||
        i.width > LIMITS.side ||
        i.height > LIMITS.side,
    )
  )
    throw Error(`图片宽高须在 1–${LIMITS.side} 像素内`);
  if (images.reduce((n, i) => n + i.width * i.height, 0) > LIMITS.pixels)
    throw Error("项目总像素超过 1600 万，请减少图片");
  if (images.some((i) => i.pixels.length !== i.width * i.height * 4))
    throw Error("像素数据长度不正确");
}
export function sameSize(
  images: PixelImage[],
  sequence?: AnimationSequence | null,
) {
  const ref = sequence ?? images[0];
  if (!ref) return;
  const wrong = images.filter(
    (i) => i.width !== ref.width || i.height !== ref.height,
  );
  if (wrong.length)
    throw Error(
      `动画帧须为 ${ref.width} × ${ref.height}。尺寸不一致：${wrong.map((i) => `${i.name} (${i.width} × ${i.height})`).join("、")}`,
    );
}
export function line(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  visit: (x: number, y: number) => void,
) {
  const dx = Math.abs(x1 - x0),
    sx = x0 < x1 ? 1 : -1,
    dy = -Math.abs(y1 - y0),
    sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    visit(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e = err * 2;
    if (e >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}
export const hex = (c: RGBA) =>
  "#" +
  c
    .slice(0, 3)
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
export function parseHex(s: string, alpha: number): RGBA | null {
  const m = /^#?([\da-f]{6})$/i.exec(s.trim());
  return m
    ? [
        parseInt(m[1].slice(0, 2), 16),
        parseInt(m[1].slice(2, 4), 16),
        parseInt(m[1].slice(4, 6), 16),
        alpha,
      ]
    : null;
}
interface Command {
  undo: () => void;
  redo: () => void;
  bytes: number;
}
export class EditorStore {
  project = empty();
  views = new Map<string, View>();
  notice = "";
  exported = new Map<string, number>();
  private listeners = new Set<() => void>();
  private version = 0;
  private revision = 0;
  private past: Command[] = [];
  private future: Command[] = [];
  private used = 0;
  getVersion = () => this.version;
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };
  private emit() {
    this.project.revision++;
    this.version++;
    this.listeners.forEach((f) => f());
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  get current() {
    const id =
      this.project.mode === "animation"
        ? this.project.animation?.activeFrameId
        : this.project.activeImageId;
    return this.project.images.find((i) => i.id === id) ?? null;
  }
  get visibleImages() {
    const p = this.project;
    return p.mode === "animation"
      ? (p.animation?.frameIds ?? []).map(
          (id) => p.images.find((i) => i.id === id)!,
        )
      : p.images;
  }
  isDirty(i: PixelImage) {
    return (this.exported.get(i.id) ?? 0) !== i.revision;
  }
  get dirty() {
    return this.project.images.some((i) => this.isDirty(i));
  }
  get historyBytes() {
    return this.used;
  }
  private record(cmd: Command) {
    if (cmd.bytes > LIMITS.history) throw Error("此操作超过历史内存预算");
    this.used -= this.future.reduce((n, c) => n + c.bytes, 0);
    this.future = [];
    this.past.push(cmd);
    this.used += cmd.bytes;
    while (this.used > LIMITS.history && this.past.length > 1) {
      this.used -= this.past.shift()!.bytes;
      this.notice = "历史内存已达上限，最早的操作已释放";
    }
    this.emit();
  }
  private structural(change: (p: Project) => void) {
    const before = snapshot(this.project),
      after = snapshot(this.project);
    change(after);
    capacity(after.images);
    if (after.animation) {
      const frames = after.animation.frameIds.map(
        (id) => after.images.find((i) => i.id === id)!,
      );
      if (!frames.length || frames.some((i) => !i))
        throw Error("动画须至少保留一帧");
      sameSize(frames, after.animation);
    }
    const beforeIds = new Set(before.images.map((i) => i.id)),
      afterIds = new Set(after.images.map((i) => i.id));
    const bytes =
      1024 +
      [
        ...before.images.filter((i) => !afterIds.has(i.id)),
        ...after.images.filter((i) => !beforeIds.has(i.id)),
      ].reduce((n, i) => n + i.pixels.byteLength, 0);
    if (bytes > LIMITS.history) throw Error("此操作超过历史内存预算");
    const restore = (state: Project) => {
      const fps = this.project.animation?.fps;
      this.project = snapshot(state);
      if (fps !== undefined && this.project.animation)
        this.project.animation.fps = fps;
    };
    this.project = after;
    this.record({
      bytes,
      undo: () => restore(before),
      redo: () => restore(after),
    });
  }
  select(id: string) {
    if (!this.project.images.some((i) => i.id === id)) return;
    if (
      this.project.mode === "animation" &&
      this.project.animation?.frameIds.includes(id)
    )
      this.project.animation.activeFrameId = id;
    else this.project.activeImageId = id;
    this.emit();
  }
  import(images: PixelImage[]) {
    if (this.project.mode === "animation")
      sameSize(images, this.project.animation);
    this.structural((p) => {
      p.images.push(...images);
      p.activeImageId = images[0]?.id ?? p.activeImageId;
      if (p.mode === "animation" && images.length) {
        if (p.animation) {
          p.animation.frameIds.push(...images.map((i) => i.id));
          p.animation.activeFrameId = images[0].id;
        } else
          p.animation = {
            width: images[0].width,
            height: images[0].height,
            frameIds: images.map((i) => i.id),
            activeFrameId: images[0].id,
            fps: 8,
          };
      }
    });
  }
  changeMode(mode: Mode, ids?: string[], append = false) {
    if (mode === this.project.mode && !append) return;
    if (mode === "animation" && (!this.project.animation || append)) {
      const candidates = this.project.images.filter(
        (i) => !ids?.length || ids.includes(i.id),
      );
      sameSize(candidates, this.project.animation);
      this.structural((p) => {
        if (candidates.length) {
          if (p.animation)
            p.animation.frameIds.push(
              ...candidates
                .map((i) => i.id)
                .filter((id) => !p.animation!.frameIds.includes(id)),
            );
          else
            p.animation = {
              width: candidates[0].width,
              height: candidates[0].height,
              frameIds: candidates.map((i) => i.id),
              activeFrameId: candidates[0].id,
              fps: 8,
            };
        }
        p.mode = mode;
      });
    } else
      this.structural((p) => {
        p.mode = mode;
      });
  }
  copy(suffix = "-副本.png") {
    const i = this.current;
    if (!i) return;
    const c = createImage(
      i.name.replace(/\.png$/i, "") + suffix,
      i.width,
      i.height,
      i.pixels.slice(),
    );
    c.revision = ++this.revision;
    this.structural((p) => {
      const at = p.images.findIndex((x) => x.id === i.id);
      p.images.splice(at + 1, 0, c);
      p.activeImageId = c.id;
      if (p.mode === "animation" && p.animation) {
        const n = p.animation.frameIds.indexOf(i.id);
        p.animation.frameIds.splice(n + 1, 0, c.id);
        p.animation.activeFrameId = c.id;
      }
    });
  }
  addBlank(name = "空白帧.png") {
    const a = this.project.animation;
    if (!a) throw Error("请先导入至少一帧以确定尺寸");
    const i = createImage(name, a.width, a.height);
    i.revision = ++this.revision;
    this.import([i]);
  }
  remove() {
    const i = this.current;
    if (!i) return;
    this.structural((p) => {
      if (p.mode === "animation" && p.animation) {
        if (p.animation.frameIds.length === 1)
          throw Error("动画须至少保留一帧");
        const at = p.animation.frameIds.indexOf(i.id);
        p.animation.frameIds.splice(at, 1);
        p.animation.activeFrameId =
          p.animation.frameIds[Math.min(at, p.animation.frameIds.length - 1)];
      } else {
        const at = p.images.findIndex((x) => x.id === i.id);
        p.images.splice(at, 1);
        p.activeImageId =
          p.images[Math.min(at, p.images.length - 1)]?.id ?? null;
        if (p.animation) {
          p.animation.frameIds = p.animation.frameIds.filter(
            (id) => id !== i.id,
          );
          if (!p.animation.frameIds.length)
            throw Error("此图片是动画的最后一帧，请保留");
          if (p.animation.activeFrameId === i.id)
            p.animation.activeFrameId = p.animation.frameIds[0];
        }
      }
    });
  }
  reorder(id: string, targetId: string) {
    if (id === targetId) return;
    this.structural((p) => {
      if (p.mode === "animation" && p.animation) {
        const ids = p.animation.frameIds;
        const from = ids.indexOf(id),
          to = ids.indexOf(targetId);
        if (from < 0 || to < 0) return;
        ids.splice(from, 1);
        ids.splice(to, 0, id);
      } else {
        const from = p.images.findIndex((i) => i.id === id),
          to = p.images.findIndex((i) => i.id === targetId);
        if (from < 0 || to < 0) return;
        const [i] = p.images.splice(from, 1);
        p.images.splice(to, 0, i);
      }
    });
  }
  fps(value: number) {
    if (this.project.animation) {
      this.project.animation.fps = Math.max(
        1,
        Math.min(30, Math.round(value) || 8),
      );
      this.emit();
    }
  }
  stroke(
    image: PixelImage,
    changes: Map<number, { before: RGBA; after: RGBA }>,
  ) {
    const effective = [...changes].filter(([, c]) =>
      c.before.some((v, k) => v !== c.after[k]),
    );
    if (!effective.length) return;
    const indices = new Uint32Array(effective.length),
      oldPixels = new Uint8Array(effective.length * 4),
      newPixels = new Uint8Array(effective.length * 4);
    effective.forEach(([at, c], n) => {
      indices[n] = at;
      oldPixels.set(c.before, n * 4);
      newPixels.set(c.after, n * 4);
    });
    const before = image.revision,
      after = ++this.revision;
    image.revision = after;
    const restore = (pixels: Uint8Array, revision: number) => {
      indices.forEach((at, n) =>
        image.pixels.set(pixels.subarray(n * 4, n * 4 + 4), at),
      );
      image.revision = revision;
      this.focus(image.id);
    };
    this.record({
      bytes:
        indices.byteLength + oldPixels.byteLength + newPixels.byteLength + 64,
      undo: () => restore(oldPixels, before),
      redo: () => restore(newPixels, after),
    });
  }
  private focus(id: string) {
    this.project.activeImageId = id;
    if (
      this.project.mode === "animation" &&
      this.project.animation &&
      !this.project.animation.frameIds.includes(id)
    )
      this.project.mode = "images";
    else if (this.project.mode === "animation" && this.project.animation)
      this.project.animation.activeFrameId = id;
  }
  undo() {
    const c = this.past.pop();
    if (!c) return;
    c.undo();
    this.future.push(c);
    this.emit();
  }
  redo() {
    const c = this.future.pop();
    if (!c) return;
    c.redo();
    this.past.push(c);
    this.emit();
  }
  markExported(images: { id: string; revision: number }[]) {
    images.forEach((i) => this.exported.set(i.id, i.revision));
    this.emit();
  }
  reset() {
    this.project = empty();
    this.views.clear();
    this.past = [];
    this.future = [];
    this.used = 0;
    this.exported.clear();
    this.notice = "";
    this.emit();
  }
}
