import { BrandMark } from "@/components/BrandMark";
import Link from "next/link";
import {
  ArrowUpRight,
  MousePointer2,
  Layers3,
  Film,
  Image,
  Grid2X2,
  FileImage,
  ArrowRight,
} from "lucide-react";
import RepairDemo, { PixelFish } from "@/components/RepairDemo";
import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "https://dianxiu.top/" },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "点修",
    title: "点修 · 在线像素图片编辑",
    description: "逐点修改像素颜色，支持多图编辑、逐帧预览与无损 PNG 导出。",
    url: "https://dianxiu.top/",
  },
};
export default function Home() {
  return (
    <main className="home">
      <nav className="home-nav">
        <Link className="brand" href="/">
          <BrandMark />
          <strong>点修</strong>
        </Link>
        <a className="primary nav-cta" href="/editor/">
          打开编辑器 <ArrowUpRight size={18} />
        </a>
      </nav>
      <section className="home-hero">
        <div className="hero-copy">
          <h1>
            逐点修整，
            <br />
            让像素<span>更准确</span>。
          </h1>
          <p>逐点修改颜色，保留原尺寸与透明度。</p>
          <div className="hero-actions">
            <a className="primary hero-cta" href="/editor/">
              开始修整 <ArrowUpRight size={21} />
            </a>
            <a className="secondary-cta" href="#repair-example">
              查看修整示例
            </a>
          </div>
          <div className="hero-promises">
            无需登录 · 图片不上传 · PNG 原尺寸导出
          </div>
        </div>
        <RepairDemo />
      </section>
      <section className="home-steps" aria-label="使用步骤">
        {[
          {
            title: "导入图片",
            description: "打开本地的像素图，开始修整。",
            icon: Image,
          },
          {
            title: "放大并修整",
            description: "放大查看，逐点修改不需要的颜色。",
            icon: Grid2X2,
          },
          {
            title: "导出 PNG",
            description: "保留原尺寸与透明度，导出修整后的图片。",
            icon: FileImage,
          },
        ].map((step, i) => (
          <article key={step.title}>
            <h2>
              <span>0{i + 1}</span>
              {step.title}
            </h2>
            <div className="step-scene" aria-hidden="true">
              {i === 0 ? (
                <div className="step-file">
                  <PixelFish />
                  <span>image.png</span>
                </div>
              ) : i === 1 ? (
                <div className="step-grid">
                  {Array.from({ length: 16 }, (_, n) => (
                    <i key={n} />
                  ))}
                  <MousePointer2 size={24} />
                </div>
              ) : (
                <div className="step-download">
                  <FileImage size={36} />
                  <span>PNG</span>
                  <span className="step-check">✓</span>
                </div>
              )}
            </div>
            <div className="step-description">
              <step.icon size={42} strokeWidth={1.4} />
              <p>{step.description}</p>
            </div>
            {i < 2 && <ArrowRight className="step-arrow" size={19} />}
          </article>
        ))}
      </section>
      <section className="home-features">
        <h2 className="feature-heading">
          像素编辑，
          <br />
          <span>多图与逐帧预览。</span>
        </h2>
        <article>
          <MousePointer2 size={27} />
          <h2>精确到一个像素</h2>
          <p>
            放大图像，逐点修改颜色，
            <br />
            保留每一个细节。
          </p>
          <div className="feature-pixels">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </article>
        <article>
          <Layers3 size={27} />
          <h2>多张图片，独立编辑</h2>
          <p>
            同时处理多张像素图，
            <br />
            每张独立编辑，互不影响。
          </p>
          <div className="feature-assets">
            <span>
              <PixelFish />
            </span>
            <span>🌳</span>
            <span>🍄</span>
          </div>
        </article>
        <article>
          <Film size={27} />
          <h2>需要时，再预览动画</h2>
          <p>
            将同尺寸图片组成连续帧，
            <br />
            调整顺序与帧率，实时预览。
          </p>
          <div className="feature-frames">
            {[0, 1, 2].map((i) => (
              <span key={i}>
                <PixelFish />
              </span>
            ))}
          </div>
        </article>
      </section>
      <footer className="home-footer">
        © {new Date().getFullYear()} 点修. All rights reserved.
      </footer>
    </main>
  );
}
