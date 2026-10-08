"use client";
import { useLanguage, LanguageSwitch } from "@/i18n/LanguageProvider";
import { BrandMark } from "./BrandMark";
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
import RepairDemo, { PixelFish } from "./RepairDemo";
export default function Home() {
  const { t } = useLanguage();
  return (
    <main className="home">
      <nav className="home-nav">
        <Link className="brand" href="/">
          <BrandMark />
          <strong>{t("点修")}</strong>
        </Link>
        <LanguageSwitch />
        <a className="primary nav-cta" href="/editor/">
          {t("打开编辑器")}
          <ArrowUpRight size={18} />
        </a>
      </nav>
      <section className="home-hero">
        <div className="hero-copy">
          <h1>
            {t("逐点修整，")}
            <br />
            {t("让像素")}
            <span>{t("更准确")}</span>
            {t("。")}
          </h1>
          <p>{t("逐点修改颜色，保留原尺寸与透明度。")}</p>
          <div className="hero-actions">
            <a className="primary hero-cta" href="/editor/">
              {t("开始修整")}
              <ArrowUpRight size={21} />
            </a>
            <a className="secondary-cta" href="#repair-example">
              {t("查看修整示例")}
            </a>
          </div>
          <div className="hero-promises">
            {t("无需登录 · 图片不上传 · PNG 原尺寸导出")}
          </div>
        </div>
        <RepairDemo />
      </section>
      <section className="home-steps" aria-label={t("使用步骤")}>
        {[
          {
            title: t("导入图片"),
            description: t("打开本地的像素图，开始修整。"),
            icon: Image,
          },
          {
            title: t("放大并修整"),
            description: t("放大查看，逐点修改不需要的颜色。"),
            icon: Grid2X2,
          },
          {
            title: t("导出 PNG"),
            description: t("保留原尺寸与透明度，导出修整后的图片。"),
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
          {t("像素编辑，")}
          <br />
          <span>{t("多图与逐帧预览。")}</span>
        </h2>
        <article>
          <MousePointer2 size={27} />
          <h2>{t("精确到一个像素")}</h2>
          <p>
            {t("放大图像，逐点修改颜色，")}
            <br />
            {t("保留每一个细节。")}
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
          <h2>{t("多张图片，独立编辑")}</h2>
          <p>
            {t("同时处理多张像素图，")}
            <br />
            {t("每张独立编辑，互不影响。")}
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
          <h2>{t("需要时，再预览动画")}</h2>
          <p>
            {t("将同尺寸图片组成连续帧，")}
            <br />
            {t("调整顺序与帧率，实时预览。")}
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
        © {new Date().getFullYear()}
        {t("点修. All rights reserved.")}
      </footer>
    </main>
  );
}
