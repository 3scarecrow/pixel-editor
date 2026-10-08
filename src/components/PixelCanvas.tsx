"use client";
import { useLanguage } from "@/i18n/LanguageProvider";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { ImagePlus } from "lucide-react";
import {
  EditorStore,
  line,
  type PixelImage,
  type RGBA,
  type View,
} from "@/core/model";
import { Canvas2DRenderer } from "@/rendering/canvas2d";
export interface CanvasHandle {
  fit: () => void;
  zoom: (factor: number) => void;
  finish: () => void;
}
type Props = {
  store: EditorStore;
  image: PixelImage | null;
  tool: string;
  color: RGBA;
  grid: boolean;
  onHover: (
    p: {
      x: number;
      y: number;
      color: RGBA;
    } | null,
  ) => void;
  onView: (zoom: number) => void;
  onPick: (color: RGBA) => void;
  onImport: () => void;
  onDrop: (files: File[]) => void;
};
export const PixelCanvas = forwardRef<CanvasHandle, Props>(
  function PixelCanvas(props, ref) {
    const { t } = useLanguage();
    const host = useRef<HTMLDivElement>(null),
      canvas = useRef<HTMLCanvasElement>(null),
      overlay = useRef<HTMLCanvasElement>(null);
    const latest = useRef(props);
    latest.current = props;
    const renderer = useRef<Canvas2DRenderer | null>(null),
      view = useRef<View>({ zoom: 8, panX: 0, panY: 0 }),
      hover = useRef<{
        x: number;
        y: number;
      } | null>(null),
      raf = useRef(0),
      space = useRef(false),
      viewImageId = useRef<string | null>(null),
      autoFit = useRef(false);
    const gesture = useRef<{
      pointer: number;
      image: PixelImage;
      tool: string;
      color: RGBA;
      previous: {
        x: number;
        y: number;
      };
      changes: Map<
        number,
        {
          before: RGBA;
          after: RGBA;
        }
      >;
      pan?: {
        x: number;
        y: number;
        view: View;
      };
    } | null>(null);
    const cursor = () => {
      const c = overlay.current;
      if (!c) return;
      const ctx = c.getContext("2d")!,
        dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, c.width / dpr, c.height / dpr);
      const p = hover.current,
        i = latest.current.image;
      if (
        !p ||
        !i ||
        p.x < 0 ||
        p.y < 0 ||
        p.x >= i.width ||
        p.y >= i.height ||
        latest.current.tool === "pan"
      )
        return;
      const v = view.current;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        v.panX + p.x * v.zoom + 0.5,
        v.panY + p.y * v.zoom + 0.5,
        v.zoom - 1,
        v.zoom - 1,
      );
      ctx.strokeStyle = "rgba(0,0,0,.75)";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(
        v.panX + p.x * v.zoom + 2,
        v.panY + p.y * v.zoom + 2,
        Math.max(1, v.zoom - 4),
        Math.max(1, v.zoom - 4),
      );
    };
    const draw = () => {
      if (canvas.current)
        renderer.current?.render(
          canvas.current,
          view.current,
          latest.current.grid,
        );
      cursor();
    };
    const schedule = () => {
      if (raf.current) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        draw();
      });
    };
    const saveView = (fitted = false) => {
      autoFit.current = fitted;
      const i = latest.current.image;
      if (i) latest.current.store.views.set(i.id, { ...view.current });
      latest.current.onView(view.current.zoom);
      schedule();
    };
    const fit = () => {
      const i = latest.current.image,
        h = host.current;
      if (!i || !h) return;
      const z = Math.max(
        0.125,
        Math.min(
          16,
          (h.clientWidth - 96) / i.width,
          (h.clientHeight - 64) / i.height,
        ),
      );
      view.current = {
        zoom: z,
        panX: (h.clientWidth - i.width * z) / 2,
        panY: (h.clientHeight - i.height * z) / 2,
      };
      saveView(true);
    };
    const zoom = (
      factor: number,
      x = host.current!.clientWidth / 2,
      y = host.current!.clientHeight / 2,
    ) => {
      if (!latest.current.image) return;
      const v = view.current,
        z = Math.max(0.125, Math.min(64, v.zoom * factor));
      view.current = {
        zoom: z,
        panX: x - ((x - v.panX) * z) / v.zoom,
        panY: y - ((y - v.panY) * z) / v.zoom,
      };
      saveView();
    };
    const finish = () => {
      const g = gesture.current;
      if (!g) return;
      gesture.current = null;
      if (overlay.current?.hasPointerCapture(g.pointer))
        overlay.current.releasePointerCapture(g.pointer);
      if (!g.pan) latest.current.store.stroke(g.image, g.changes);
      schedule();
    };
    useImperativeHandle(ref, () => ({ fit, zoom, finish }));
    useEffect(() => {
      renderer.current = new Canvas2DRenderer();
      let previousSize: {
        width: number;
        height: number;
      } | null = null;
      const resize = () => {
        const h = host.current;
        if (!h) return;
        if (
          previousSize &&
          latest.current.image &&
          viewImageId.current === latest.current.image.id
        ) {
          if (autoFit.current) fit();
          else {
            view.current.panX += (h.clientWidth - previousSize.width) / 2;
            view.current.panY += (h.clientHeight - previousSize.height) / 2;
            latest.current.store.views.set(latest.current.image.id, {
              ...view.current,
            });
          }
        }
        previousSize = { width: h.clientWidth, height: h.clientHeight };
        for (const c of [canvas.current, overlay.current]) {
          if (!c) continue;
          c.width = Math.round(h.clientWidth * window.devicePixelRatio);
          c.height = Math.round(h.clientHeight * window.devicePixelRatio);
        }
        draw();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(host.current!);
      resize();
      const wheel = (e: WheelEvent) => {
        e.preventDefault();
        if (!latest.current.image) return;
        const rect = host.current!.getBoundingClientRect();
        if (e.shiftKey) {
          view.current.panX -= e.deltaX || e.deltaY;
          view.current.panY -= e.deltaX ? e.deltaY : 0;
          saveView();
        } else
          zoom(
            Math.exp(-e.deltaY * 0.002),
            e.clientX - rect.left,
            e.clientY - rect.top,
          );
      };
      host.current!.addEventListener("wheel", wheel, { passive: false });
      const blur = () => {
        space.current = false;
        finish();
      };
      const key = (e: KeyboardEvent) => {
        if (
          e.code === "Space" &&
          !(e.target instanceof HTMLInputElement) &&
          !(e.target instanceof HTMLSelectElement) &&
          !(e.target instanceof HTMLButtonElement) &&
          !(e.target instanceof HTMLAnchorElement)
        ) {
          space.current = e.type === "keydown";
          e.preventDefault();
        }
      };
      window.addEventListener("blur", blur);
      window.addEventListener("keydown", key);
      window.addEventListener("keyup", key);
      return () => {
        ro.disconnect();
        host.current?.removeEventListener("wheel", wheel);
        window.removeEventListener("blur", blur);
        window.removeEventListener("keydown", key);
        window.removeEventListener("keyup", key);
        cancelAnimationFrame(raf.current);
        renderer.current?.destroy();
      };
    }, []);
    useEffect(() => {
      finish();
      renderer.current?.setImage(props.image);
      hover.current = null;
      props.onHover(null);
      viewImageId.current = props.image?.id ?? null;
      autoFit.current = false;
      if (props.image) {
        const saved = props.store.views.get(props.image.id);
        if (saved) {
          view.current = { ...saved };
          props.onView(saved.zoom);
          schedule();
        } else fit();
      } else schedule();
    }, [props.image?.id]);
    useEffect(() => {
      renderer.current?.setImage(props.image);
      schedule();
    }, [props.image?.revision]);
    useEffect(schedule, [props.grid]);
    const coordinates = (e: React.PointerEvent) => {
      const rect = host.current!.getBoundingClientRect();
      return {
        x: Math.floor(
          (e.clientX - rect.left - view.current.panX) / view.current.zoom,
        ),
        y: Math.floor(
          (e.clientY - rect.top - view.current.panY) / view.current.zoom,
        ),
      };
    };
    const apply = (p: { x: number; y: number }) => {
      const g = gesture.current;
      if (!g || g.pan) return;
      const i = g.image;
      const bounded = {
        x: Math.max(-1, Math.min(i.width, p.x)),
        y: Math.max(-1, Math.min(i.height, p.y)),
      };
      let minX = i.width,
        minY = i.height,
        maxX = -1,
        maxY = -1;
      line(g.previous.x, g.previous.y, bounded.x, bounded.y, (x, y) => {
        if (x < 0 || y < 0 || x >= i.width || y >= i.height) return;
        const at = (y * i.width + x) * 4;
        if (!g.changes.has(at))
          g.changes.set(at, {
            before: [...i.pixels.slice(at, at + 4)] as RGBA,
            after: g.color,
          });
        g.changes.get(at)!.after = g.color;
        i.pixels.set(g.color, at);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      });
      g.previous = bounded;
      if (maxX >= 0)
        renderer.current?.updateRegion(
          minX,
          minY,
          maxX - minX + 1,
          maxY - minY + 1,
        );
      if (p.x >= 0 && p.y >= 0 && p.x < i.width && p.y < i.height)
        latest.current.onHover({
          x: p.x,
          y: p.y,
          color: [
            ...i.pixels.slice(
              (p.y * i.width + p.x) * 4,
              (p.y * i.width + p.x) * 4 + 4,
            ),
          ] as RGBA,
        });
      schedule();
    };
    return (
      <div
        className={`canvas-host tool-${props.tool}`}
        ref={host}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          props.onDrop([...e.dataTransfer.files]);
        }}
      >
        <canvas ref={canvas} className="pixel-canvas" aria-hidden="true" />
        <canvas
          ref={overlay}
          className="pixel-overlay"
          data-testid="pixel-canvas"
          aria-label={t("像素编辑画布")}
          tabIndex={0}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            const i = props.image;
            if (
              !i ||
              !["pencil", "eraser", "picker", "pan"].includes(props.tool)
            )
              return;
            overlay.current?.focus({ preventScroll: true });
            const p = coordinates(e),
              inBounds =
                p.x >= 0 && p.y >= 0 && p.x < i.width && p.y < i.height;
            const pan = props.tool === "pan" || e.button === 1 || space.current;
            if (!pan && e.button !== 0) return;
            if (props.tool === "picker" && !pan) {
              if (inBounds)
                props.onPick([
                  ...i.pixels.slice(
                    (p.y * i.width + p.x) * 4,
                    (p.y * i.width + p.x) * 4 + 4,
                  ),
                ] as RGBA);
              return;
            }
            if (!pan && !inBounds) return;
            e.preventDefault();
            overlay.current!.setPointerCapture(e.pointerId);
            gesture.current = {
              pointer: e.pointerId,
              image: i,
              tool: props.tool,
              color: props.tool === "eraser" ? [0, 0, 0, 0] : [...props.color],
              previous: p,
              changes: new Map(),
              pan: pan
                ? { x: e.clientX, y: e.clientY, view: { ...view.current } }
                : undefined,
            };
            if (!pan) apply(p);
          }}
          onPointerMove={(e) => {
            const i = props.image;
            if (!i) return;
            const p = coordinates(e);
            hover.current = p;
            if (p.x >= 0 && p.y >= 0 && p.x < i.width && p.y < i.height)
              props.onHover({
                ...p,
                color: [
                  ...i.pixels.slice(
                    (p.y * i.width + p.x) * 4,
                    (p.y * i.width + p.x) * 4 + 4,
                  ),
                ] as RGBA,
              });
            else props.onHover(null);
            const g = gesture.current;
            if (g?.pan) {
              view.current = {
                ...g.pan.view,
                panX: g.pan.view.panX + e.clientX - g.pan.x,
                panY: g.pan.view.panY + e.clientY - g.pan.y,
              };
              saveView();
            } else if (g) apply(p);
            else cursor();
          }}
          onPointerUp={finish}
          onPointerCancel={finish}
          onLostPointerCapture={finish}
          onPointerLeave={() => {
            if (!gesture.current) {
              hover.current = null;
              props.onHover(null);
              cursor();
            }
          }}
        />
        {!props.image && (
          <div className="empty-canvas">
            <p>
              {t("导入 PNG，放大画布，修整细节。")}
              <br />
              {t("图片仅在你的设备上处理。")}
            </p>
            <button className="primary" onClick={props.onImport}>
              <ImagePlus size={16} />{" "}
              {props.store.project.mode === "animation"
                ? t("导入动画帧")
                : t("导入图片")}
            </button>
            <span className="empty-hint">
              {t("或将 PNG 拖到这里 · 支持多张图片")}
            </span>
          </div>
        )}
        {props.image && (
          <div className="canvas-hint">{t("滚轮缩放 · 空格拖动平移")}</div>
        )}
      </div>
    );
  },
);
