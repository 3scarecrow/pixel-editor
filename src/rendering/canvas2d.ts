import type { PixelImage, View } from "../core/model";
export class Canvas2DRenderer {
  private source: HTMLCanvasElement;
  private data: ImageData | null = null;
  private image: PixelImage | null = null;
  constructor() {
    this.source = document.createElement("canvas");
  }
  setImage(image: PixelImage | null) {
    this.image = image;
    if (!image) {
      this.data = null;
      return;
    }
    this.source.width = image.width;
    this.source.height = image.height;
    this.data = new ImageData(
      image.pixels as Uint8ClampedArray<ArrayBuffer>,
      image.width,
      image.height,
    );
    this.source.getContext("2d")!.putImageData(this.data, 0, 0);
  }
  updateRegion(x: number, y: number, w: number, h: number) {
    if (this.data)
      this.source.getContext("2d")!.putImageData(this.data, 0, 0, x, y, w, h);
  }
  render(canvas: HTMLCanvasElement, view: View, grid: boolean) {
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1,
      w = canvas.width / dpr,
      h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!this.image) return;
    const { zoom, panX, panY } = view;
    const iw = this.image.width * zoom,
      ih = this.image.height * zoom;
    ctx.save();
    ctx.beginPath();
    ctx.rect(panX, panY, iw, ih);
    ctx.clip();
    ctx.fillStyle = "#a2a7ac";
    ctx.fillRect(panX, panY, iw, ih);
    ctx.fillStyle = "#bbc0c4";
    const step = 12;
    const xStart = Math.max(0, Math.floor(-panX / step)),
      yStart = Math.max(0, Math.floor(-panY / step));
    for (
      let y = yStart;
      y < Math.min(Math.ceil(ih / step), Math.ceil((h - panY) / step));
      y++
    )
      for (
        let x = xStart;
        x < Math.min(Math.ceil(iw / step), Math.ceil((w - panX) / step));
        x++
      )
        if ((x + y) % 2 === 0)
          ctx.fillRect(panX + x * step, panY + y * step, step, step);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.source, panX, panY, iw, ih);
    ctx.restore();
    ctx.strokeStyle = "#657179";
    ctx.lineWidth = 1;
    ctx.strokeRect(panX - 0.5, panY - 0.5, iw + 1, ih + 1);
    if (grid && zoom >= 6) {
      ctx.strokeStyle = "rgba(17,27,32,.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const sx = Math.max(0, Math.ceil(-panX / zoom)),
        ex = Math.min(this.image.width, Math.floor((w - panX) / zoom)),
        sy = Math.max(0, Math.ceil(-panY / zoom)),
        ey = Math.min(this.image.height, Math.floor((h - panY) / zoom));
      for (let x = sx; x <= ex; x++) {
        const p = panX + x * zoom;
        ctx.moveTo(p, Math.max(0, panY));
        ctx.lineTo(p, Math.min(h, panY + ih));
      }
      for (let y = sy; y <= ey; y++) {
        const p = panY + y * zoom;
        ctx.moveTo(Math.max(0, panX), p);
        ctx.lineTo(Math.min(w, panX + iw), p);
      }
      ctx.stroke();
    }
  }
  destroy() {
    this.source.width = 0;
    this.source.height = 0;
    this.image = null;
    this.data = null;
  }
}
