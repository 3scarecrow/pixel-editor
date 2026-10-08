"use client";
import { useLanguage } from "@/i18n/LanguageProvider";
import { BrandMark } from "@/components/BrandMark";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  Download,
  FolderOpen,
  Grid2X2,
  Hand,
  ImagePlus,
  Info,
  LoaderCircle,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  Undo2,
  Trash2,
  X,
  Pencil,
  Pipette,
  Eraser,
  Film,
  CheckSquare,
  Square,
  GripVertical,
} from "lucide-react";
import {
  EditorStore,
  createImage,
  hex,
  LIMITS,
  type RGBA,
  type Mode,
} from "@/core/model";
import { exportNames, type DecodedImage } from "@/core/codec";
import { CodecClient } from "@/services/worker-client";
import { PixelCanvas, type CanvasHandle } from "./PixelCanvas";
import { StatusBar, type StatusHandle } from "./StatusBar";
import { ColorPanel } from "./ColorPanel";
import { Thumbnail } from "./Thumbnail";
import { AnimationPreview } from "./AnimationPreview";
export default function Editor() {
  const { t, language } = useLanguage();
  const tools = [
    { id: "pencil", label: t("画笔"), key: "B", icon: Pencil },
    { id: "picker", label: t("吸管"), key: "I", icon: Pipette },
    { id: "eraser", label: t("橡皮擦"), key: "E", icon: Eraser },
    { id: "pan", label: t("平移"), key: "H", icon: Hand },
  ];

  const [store] = useState(() => new EditorStore());
  useSyncExternalStore(store.subscribe, store.getVersion, () => 0);
  const project = store.project,
    current = store.current,
    images = store.visibleImages,
    mode = project.mode;
  const [tool, setTool] = useState("pencil"),
    [color, setColor] = useState<RGBA>([163, 255, 71, 255]),
    [grid, setGrid] = useState(true),
    [zoom, setZoom] = useState(8),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [message, setMessage] = useState<{
      text: string;
      error: boolean;
    } | null>(null),
    [busy, setBusy] = useState(""),
    [progress, setProgress] = useState(0),
    [exportMenu, setExportMenu] = useState(false),
    [conversion, setConversion] = useState<string[] | null>(null),
    [resetDialog, setResetDialog] = useState(false);
  const status = useRef<StatusHandle>(null);
  const client = useRef<CodecClient | null>(null),
    canvas = useRef<CanvasHandle>(null),
    input = useRef<HTMLInputElement>(null),
    dragId = useRef<string | null>(null),
    busyRef = useRef("");
  const notify = useCallback(
    (text: string, error = true) => setMessage({ text: t(text), error }),
    [t],
  );
  const action = useCallback(
    (fn: () => void) => {
      canvas.current?.finish();
      try {
        fn();
      } catch (e) {
        notify((e as Error).message);
      }
    },
    [notify],
  );
  useEffect(() => {
    if (!message || message.error) return;
    const timer = window.setTimeout(() => setMessage(null), 2000);
    return () => window.clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    client.current = new CodecClient();
    return () => {
      client.current?.destroy();
      client.current = null;
    };
  }, []);
  useEffect(() => {
    if (store.notice) {
      notify(store.notice, false);
      store.notice = "";
    }
  }, [project.revision, notify, store]);
  useEffect(() => {
    setSelected(
      (s) =>
        new Set([...s].filter((id) => project.images.some((i) => i.id === id))),
    );
  }, [project.images]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      canvas.current?.finish();
      if (store.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [store]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target as HTMLElement).isContentEditable
      )
        return;
      if (conversion || resetDialog) return;
      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (!busyRef.current)
            action(() => (e.shiftKey ? store.redo() : store.undo()));
        }
        if (e.key.toLowerCase() === "y") {
          e.preventDefault();
          if (!busyRef.current) action(() => store.redo());
        }
        return;
      }
      const t = tools.find((t) => t.key.toLowerCase() === e.key.toLowerCase());
      if (t) {
        canvas.current?.finish();
        setTool(t.id);
      }
      if (e.key === "Escape") {
        setExportMenu(false);
        canvas.current?.finish();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [store, action, conversion, resetDialog]);
  useEffect(() => {
    if (!conversion && !resetDialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>("[role=dialog]");
    const controls = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),[tabindex="0"]',
        ) ?? [],
      );
    controls()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConversion(null);
        setResetDialog(false);
        e.preventDefault();
      }
      if (e.key === "Tab") {
        const items = controls(),
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [conversion, resetDialog]);
  const setTask = (task: string) => {
    busyRef.current = task;
    setBusy(task);
    setProgress(0);
  };
  const importFiles = async (files: File[]) => {
    if (!files.length) return;
    if (busyRef.current) {
      notify(t("请等待当前任务完成"));
      return;
    }
    canvas.current?.finish();
    const id = project.id,
      originMode = mode,
      sequence = project.animation?.frameIds.join(",") ?? "";
    try {
      if (files.reduce((n, f) => n + f.size, 0) > LIMITS.bytes)
        throw Error(t("一次导入文件总大小不能超过 50 MiB"));
      if (files.length + project.images.length > LIMITS.images)
        throw Error(t("最多导入 100 张图片"));
      setTask(t("导入图片"));
      const sorted = [...files].sort((a, b) =>
        a.name.localeCompare(b.name, language === "en" ? "en" : "zh-CN", {
          numeric: true,
        }),
      );
      const payload = await Promise.all(
        sorted.map(async (f) => ({
          name: f.name,
          bytes: new Uint8Array(await f.arrayBuffer()),
        })),
      );
      const decoded = await client.current!.request<DecodedImage[]>(
        "decode",
        {
          files: payload,
          mode: originMode,
          sequence: project.animation,
          existingPixels: project.images.reduce(
            (n, i) => n + i.width * i.height,
            0,
          ),
        },
        payload.map((f) => f.bytes.buffer),
        setProgress,
      );
      if (
        store.project.id !== id ||
        store.project.mode !== originMode ||
        (store.project.animation?.frameIds.join(",") ?? "") !== sequence
      )
        throw Error(t("工作区已改变，请重新导入"));
      store.import(
        decoded.map((i) => createImage(i.name, i.width, i.height, i.pixels)),
      );
      notify(
        t(
          originMode === "animation"
            ? "已导入 {0} 张动画帧"
            : "已导入 {0} 张图片",
          decoded.length,
        ),
        false,
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setTask("");
      if (input.current) input.current.value = "";
    }
  };
  const exportImages = async (all: boolean) => {
    canvas.current?.finish();
    setExportMenu(false);
    const list = all
      ? store.visibleImages
      : store.current
        ? [store.current]
        : [];
    if (!list.length) return;
    const originalId = store.project.id;
    try {
      setTask(all ? t("打包导出") : t("导出 PNG"));
      const snapshots = list.map((i) => ({ ...i, pixels: i.pixels.slice() }));
      const bytes = await client.current!.request<Uint8Array>(
        all ? "zip" : "png",
        { images: snapshots, animation: mode === "animation" },
        snapshots.map((i) => i.pixels.buffer),
      );
      const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], {
          type: all ? "application/zip" : "image/png",
        }),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = all
        ? mode === "animation"
          ? t("点修-动画帧.zip")
          : t("点修-图片.zip")
        : mode === "animation"
          ? `frame-${String(images.findIndex((i) => i.id === list[0].id) + 1).padStart(3, "0")}.png`
          : exportNames(list, false)[0];
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      if (store.project.id === originalId) store.markExported(snapshots);
      notify(t("已生成文件，请在浏览器下载记录中查看"), false);
    } catch (e) {
      notify(t("导出失败：{0}", t((e as Error).message)));
    } finally {
      setTask("");
    }
  };
  const switchMode = (target: Mode) => {
    if (target === mode) return;
    if (target === "images" || project.animation || !project.images.length)
      action(() => store.changeMode(target));
    else
      setConversion(
        project.images
          .filter((i) => !selected.size || selected.has(i.id))
          .map((i) => i.id),
      );
  };
  const convert = () => {
    const ids = project.images
      .filter((i) => !selected.size || selected.has(i.id))
      .map((i) => i.id);
    setConversion(ids);
  };
  const confirmConvert = () =>
    action(() => {
      store.changeMode("animation", conversion ?? [], !!project.animation);
      setConversion(null);
      setSelected(new Set());
    });
  const requestReset = () => {
    canvas.current?.finish();
    if (store.dirty) setResetDialog(true);
    else {
      store.reset();
      setSelected(new Set());
    }
  };
  const move = (delta: number) => {
    if (!current) return;
    const at = images.findIndex((i) => i.id === current.id),
      target = images[at + delta];
    if (target) action(() => store.reorder(current.id, target.id));
  };
  const candidateImages = project.images.filter((i) =>
    conversion?.includes(i.id),
  );
  const sizes = new Set(candidateImages.map((i) => `${i.width} × ${i.height}`));
  const conversionMismatch =
    sizes.size > 1 ||
    (project.animation &&
      candidateImages.some(
        (i) =>
          i.width !== project.animation!.width ||
          i.height !== project.animation!.height,
      ));
  return (
    <main className="editor-shell" data-mode={mode}>
      <header className="app-bar">
        <a href="/" className="brand" aria-label={t("点修首页")}>
          <BrandMark />
          <strong>{t("点修")}</strong>
        </a>
        <div
          className="mode-switch"
          data-mode={mode}
          role="group"
          aria-label={t("编辑模式")}
        >
          <button
            className={mode === "images" ? "active" : ""}
            onClick={() => switchMode("images")}
            disabled={!!busy}
          >
            {t("图片编辑")}
          </button>
          <button
            className={mode === "animation" ? "active" : ""}
            onClick={() => switchMode("animation")}
            disabled={!!busy}
          >
            {t("动画编辑")}
          </button>
        </div>
        <button
          className="clear-project"
          onClick={requestReset}
          disabled={!!busy || !project.images.length}
          title={t("清空当前项目的图片与历史")}
        >
          <Trash2 size={15} />
          {t("清空")}
        </button>
        <div className="bar-spacer" />
        <button
          className="import-button"
          onClick={() => input.current?.click()}
          disabled={!!busy}
        >
          <FolderOpen size={17} />
          <span>{mode === "animation" ? t("导入帧") : t("导入图片")}</span>
        </button>
        <div className="history-buttons">
          <button
            className="icon-button"
            title={t("撤销 ⌘/Ctrl Z")}
            aria-label={t("撤销")}
            disabled={!store.canUndo || !!busy}
            onClick={() => action(() => store.undo())}
          >
            <Undo2 size={21} />
          </button>
          <button
            className="icon-button"
            title={t("重做 ⌘/Ctrl Shift Z")}
            aria-label={t("重做")}
            disabled={!store.canRedo || !!busy}
            onClick={() => action(() => store.redo())}
          >
            <Redo2 size={21} />
          </button>
        </div>
        <div className="export-control">
          <button
            className="primary export-main"
            onClick={() => exportImages(false)}
            disabled={!current || !!busy}
          >
            <Download size={16} />
            <span>{t("导出 PNG")}</span>
          </button>
          <button
            className="primary export-toggle"
            aria-label={t("更多导出选项")}
            onClick={() => setExportMenu(!exportMenu)}
            disabled={!images.length || !!busy}
          >
            <ChevronDown size={15} />
          </button>
          {exportMenu && (
            <div className="dropdown export-dropdown">
              <button onClick={() => exportImages(false)}>
                {t(mode === "animation" ? "当前帧 PNG" : "当前图片 PNG")}
              </button>
              <button onClick={() => exportImages(true)}>
                {t(
                  mode === "animation"
                    ? "全部帧 PNG / ZIP"
                    : "全部图片 PNG / ZIP",
                )}
              </button>
              <span>{t("保留原尺寸与透明度")}</span>
            </div>
          )}
        </div>
      </header>
      <input
        ref={input}
        type="file"
        accept="image/png,.png"
        multiple
        className="sr-only"
        aria-label={t("导入 PNG 文件")}
        data-testid="file-input"
        onChange={(e) => importFiles([...(e.target.files ?? [])])}
      />
      <div className="workspace">
        <aside className="tools-panel">
          <div className="section-title">
            <h2>{t("绘图工具")}</h2>
            <span>TOOLS</span>
          </div>
          <div className="tools-grid">
            {tools.map((t) => (
              <button
                key={t.id}
                className={tool === t.id ? "active" : ""}
                title={`${t.label} (${t.key})`}
                aria-label={t.label}
                onClick={() => {
                  canvas.current?.finish();
                  setTool(t.id);
                }}
              >
                <t.icon size={22} />
              </button>
            ))}
          </div>
          <ColorPanel color={color} onChange={setColor} />
          <div className="sidebar-tip">
            <MousePointer2 size={15} />
            <span>{t("点击或拖动，修整每个像素")}</span>
          </div>
        </aside>
        <section className="main-workspace">
          <div className="canvas-toolbar">
            <div className="canvas-title">
              <span className="asset-icon">
                {mode === "animation" ? (
                  <Film size={15} />
                ) : (
                  <Grid2X2 size={15} />
                )}
              </span>
              <strong>
                {current
                  ? mode === "animation"
                    ? t(
                        "第 {0} 帧",
                        images.findIndex((i) => i.id === current.id) + 1,
                      )
                    : current.name
                  : t("工作画布")}
              </strong>
              {current && (
                <span>
                  {current.width} × {current.height}
                </span>
              )}
              {current && store.isDirty(current) && (
                <span className="modified-dot" title={t("有未导出的修改")} />
              )}
            </div>
            <div className="canvas-actions">
              <label className="grid-toggle">
                <input
                  type="checkbox"
                  checked={grid}
                  onChange={(e) => setGrid(e.target.checked)}
                />
                <Grid2X2 size={14} />
                {t("网格")}
              </label>
              <div className="zoom-control">
                <button
                  aria-label={t("缩小")}
                  disabled={!current}
                  onClick={() => canvas.current?.zoom(0.8)}
                >
                  <Minus size={15} />
                </button>
                <span data-testid="zoom">{Math.round(zoom * 100)}%</span>
                <button
                  aria-label={t("放大")}
                  disabled={!current}
                  onClick={() => canvas.current?.zoom(1.25)}
                >
                  <Plus size={15} />
                </button>
              </div>
              <button
                className="fit-button"
                disabled={!current}
                onClick={() => canvas.current?.fit()}
              >
                {t("适应画布")}
              </button>
            </div>
          </div>
          <div className="canvas-row">
            <StatusBar ref={status} hasImage={!!current} />
            <PixelCanvas
              ref={canvas}
              store={store}
              image={current}
              tool={tool}
              color={color}
              grid={grid}
              onHover={(p) => status.current?.hover(p)}
              onView={setZoom}
              onPick={(c) => {
                setColor(c);
                setTool("pencil");
              }}
              onImport={() => input.current?.click()}
              onDrop={importFiles}
            />
            <div
              className={`preview-transition ${mode === "animation" ? "open" : ""}`}
              aria-hidden={mode !== "animation"}
            >
              {mode === "animation" && <AnimationPreview store={store} />}
            </div>
          </div>
          {(mode === "animation" || project.images.length > 1) && (
            <section className="asset-strip">
              <div className="strip-header">
                <h2>
                  {mode === "animation" ? t("动画帧") : t("图片列表")}{" "}
                  <span>
                    {t(
                      mode === "animation" ? "{0} 帧" : "{0} 张图片",
                      images.length,
                    )}
                  </span>
                </h2>
                <div className="strip-actions">
                  {mode === "animation" ? (
                    <button
                      onClick={() =>
                        action(() => store.addBlank(t("空白帧.png")))
                      }
                      disabled={!project.animation || !!busy}
                    >
                      <Plus size={14} />
                      {t("添加帧")}
                    </button>
                  ) : (
                    <button
                      onClick={() => input.current?.click()}
                      disabled={!!busy}
                    >
                      <Plus size={14} />
                      {t("导入")}
                    </button>
                  )}
                  <button
                    onClick={() => action(() => store.copy(t("-副本.png")))}
                    disabled={!current || !!busy}
                  >
                    <Copy size={14} />
                    {t("复制")}
                  </button>
                  <button
                    onClick={() => action(() => store.remove())}
                    disabled={!current || !!busy}
                  >
                    <Trash2 size={14} />
                    {t("删除")}
                  </button>
                  <button
                    className="icon-button"
                    aria-label={t("向前移动")}
                    disabled={
                      !current || images[0]?.id === current.id || !!busy
                    }
                    onClick={() => move(-1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={t("向后移动")}
                    disabled={
                      !current || images.at(-1)?.id === current.id || !!busy
                    }
                    onClick={() => move(1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                  {mode === "images" && (
                    <button
                      className="convert-button"
                      onClick={convert}
                      disabled={!!busy}
                    >
                      <Film size={14} />
                      {project.animation
                        ? t("加入动画帧")
                        : t("作为动画帧编辑")}
                      {selected.size > 0 && ` (${selected.size})`}
                    </button>
                  )}
                </div>
              </div>
              <div className="assets-scroll">
                {images.map((image, index) => (
                  <div
                    key={image.id}
                    draggable={!busy}
                    onDragStart={(e) => {
                      dragId.current = image.id;
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", image.id);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragId.current) {
                        action(() => store.reorder(dragId.current!, image.id));
                        dragId.current = null;
                      }
                    }}
                    onDragEnd={() => {
                      dragId.current = null;
                    }}
                    className={`asset-card ${current?.id === image.id ? "active" : ""} ${selected.has(image.id) ? "selected" : ""}`}
                  >
                    <button
                      className="asset-select"
                      aria-label={t("编辑 {0}", image.name)}
                      onClick={() => action(() => store.select(image.id))}
                    >
                      <div className="asset-thumbnail checker">
                        <Thumbnail image={image} />
                        {store.isDirty(image) && (
                          <span className="modified-dot" />
                        )}
                        <GripVertical className="drag-handle" size={13} />
                      </div>
                      <strong>
                        {mode === "animation"
                          ? String(index + 1).padStart(2, "0")
                          : image.name}
                      </strong>
                      {mode === "images" && (
                        <span>
                          {image.width} × {image.height}
                        </span>
                      )}
                    </button>
                    {mode === "images" && (
                      <button
                        className="multi-check"
                        aria-label={`${selected.has(image.id) ? t("取消选择") : t("选择")} ${image.name}`}
                        onClick={() =>
                          setSelected((s) => {
                            const n = new Set(s);
                            if (n.has(image.id)) n.delete(image.id);
                            else n.add(image.id);
                            return n;
                          })
                        }
                      >
                        {selected.has(image.id) ? (
                          <CheckSquare size={15} />
                        ) : (
                          <Square size={15} />
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {mode === "images" && (
                <p className="strip-tip">
                  {t("勾选图片可只将所选图片组成动画 · 拖动调整顺序")}
                </p>
              )}
            </section>
          )}
        </section>
      </div>
      {message && (
        <div
          className={`toast ${message.error ? "error" : "success"}`}
          role={message.error ? "alert" : "status"}
        >
          <Info size={17} />
          <span>{message.text}</span>
          {message.error && (
            <button aria-label={t("关闭提示")} onClick={() => setMessage(null)}>
              <X size={15} />
            </button>
          )}
        </div>
      )}
      {!!busy && (
        <div className="task-badge" role="status">
          <LoaderCircle size={16} className="spin" />
          {busy}
          {progress > 0 && ` ${Math.round(progress * 100)}%`}
        </div>
      )}
      {conversion && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="conversion-title"
          >
            <div className="modal-icon">
              <Film size={25} />
            </div>
            <h2 id="conversion-title">
              {project.animation ? t("加入动画帧") : t("将图片作为动画帧编辑")}
            </h2>
            <p>
              {t("按当前列表顺序使用 {0} 张图片。", candidateImages.length)}
              <br />
              {t("保留所有像素修改，未参与的图片仍在图片列表中。")}
            </p>
            <div className="conversion-list">
              {candidateImages.map((i) => (
                <div key={i.id}>
                  <span>{i.name}</span>
                  <span>
                    {i.width} × {i.height}
                  </span>
                </div>
              ))}
            </div>
            {conversionMismatch && (
              <p className="conversion-error">
                {t("尺寸不一致。请选择相同尺寸的图片，不会自动裁切或缩放。")}
                {project.animation &&
                  t(
                    "现有帧尺寸为 {0} × {1}。",
                    project.animation.width,
                    project.animation.height,
                  )}
              </p>
            )}
            <div className="modal-actions">
              <button onClick={() => setConversion(null)}>{t("取消")}</button>
              <button
                className="primary"
                disabled={!!conversionMismatch || !candidateImages.length}
                onClick={confirmConvert}
              >
                <Check size={15} />{" "}
                {project.animation ? t("加入动画") : t("进入动画编辑")}
              </button>
            </div>
          </section>
        </div>
      )}
      {resetDialog && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
          >
            <h2 id="reset-title">{t("清空当前项目？")}</h2>
            <p>
              {t(
                "当前还有未导出的像素修改。清空操作将移除图片与历史，请先导出需要保留的图片。",
              )}
            </p>
            <div className="modal-actions">
              <button className="primary" onClick={() => setResetDialog(false)}>
                {t("继续编辑")}
              </button>
              <button
                className="danger-button"
                onClick={() => {
                  store.reset();
                  setSelected(new Set());
                  setResetDialog(false);
                }}
              >
                {t("确认清空")}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
