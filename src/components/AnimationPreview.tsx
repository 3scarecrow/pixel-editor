"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronFirst, ChevronLast, Play, Pause, Info } from "lucide-react";
import { EditorStore } from "@/core/model";
import { Thumbnail } from "./Thumbnail";
export function AnimationPreview({ store }: { store: EditorStore }) {
  const images = store.visibleImages,
    a = store.project.animation;
  const [playing, setPlaying] = useState(false),
    [index, setIndex] = useState(0),
    [loop, setLoop] = useState(true);
  const timer = useRef(0);
  const ids = a?.frameIds.join(",") ?? "";
  useEffect(() => {
    setPlaying(false);
    setIndex(0);
  }, [ids]);
  useEffect(() => {
    if (!playing || images.length < 2) return;
    let start = performance.now() - (index * 1000) / (a?.fps ?? 8),
      pausedAt: number | null = null;
    const tick = (time: number) => {
      const n = Math.floor(((time - start) * (a?.fps ?? 8)) / 1000);
      if (!loop && n >= images.length) {
        setIndex(images.length - 1);
        setPlaying(false);
        return;
      }
      setIndex(n % images.length);
      timer.current = requestAnimationFrame(tick);
    };
    timer.current = requestAnimationFrame(tick);
    const visibility = () => {
      if (document.hidden) {
        pausedAt = performance.now();
        cancelAnimationFrame(timer.current);
      } else {
        if (pausedAt !== null) start += performance.now() - pausedAt;
        pausedAt = null;
        timer.current = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(timer.current);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [playing, a?.fps, loop, ids]);
  const current = images[Math.min(index, images.length - 1)];
  return (
    <aside className="preview-panel">
      <h2>
        动画预览 <span className="live-tag">PREVIEW</span>
      </h2>
      <div className="preview-image checker">
        {current ? <Thumbnail image={current} /> : <span>等待导入帧</span>}
      </div>
      <div className="playback">
        <button
          aria-label="上一帧"
          disabled={!images.length}
          onClick={() => {
            setPlaying(false);
            setIndex((index - 1 + images.length) % images.length);
          }}
        >
          <ChevronFirst size={18} />
        </button>
        <button
          className="play-button"
          aria-label={playing ? "暂停" : "播放"}
          disabled={images.length < 2}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? <Pause size={21} /> : <Play size={21} />}
        </button>
        <button
          aria-label="下一帧"
          disabled={!images.length}
          onClick={() => {
            setPlaying(false);
            setIndex((index + 1) % images.length);
          }}
        >
          <ChevronLast size={18} />
        </button>
      </div>
      <div className="preview-settings">
        <label>
          <input
            type="checkbox"
            checked={loop}
            onChange={(e) => setLoop(e.target.checked)}
          />{" "}
          循环播放
        </label>
        <label className="fps-input">
          <input
            aria-label="帧率"
            type="number"
            min={1}
            max={30}
            value={a?.fps ?? 8}
            disabled={!a}
            onChange={(e) => store.fps(+e.target.value)}
          />{" "}
          FPS
        </label>
      </div>
      {images.length === 1 && (
        <p className="single-frame-hint">添加更多帧后可预览动画</p>
      )}
      <div className="preview-details">
        <div>
          <span>帧尺寸</span>
          <span>{a ? `${a.width} × ${a.height}` : "—"}</span>
        </div>
        <div>
          <span>帧数</span>
          <span>{images.length}</span>
        </div>
        <div>
          <span>当前预览</span>
          <span data-testid="preview-index">
            {images.length
              ? `${Math.min(index + 1, images.length)} / ${images.length}`
              : "—"}
          </span>
        </div>
      </div>
      <p className="panel-note">
        <Info size={14} /> 切回图片编辑会保留所有修改
      </p>
    </aside>
  );
}
