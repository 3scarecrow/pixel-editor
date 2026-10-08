"use client";
import { useLanguage } from "@/i18n/LanguageProvider";
import { useState } from "react";
import { ArrowLeftRight, RotateCcw, Check } from "lucide-react";
const fish = [
  "..........oo........",
  ".........ocoo.......",
  "..oo....occcoo......",
  ".occo..occccccoo....",
  ".occcooccccccccwo...",
  "..occccccccccccwooo.",
  "...occcccccccccccco.",
  "..occcccccccccccoo..",
  ".occcoocccccccoo....",
  ".occo..ooaccoo......",
  "..oo.....oooo.......",
];
const colors: Record<string, string> = {
  o: "#211e18",
  c: "#ff942e",
  a: "#ffca76",
  w: "#fff3d6",
};
export function PixelFish({ broken = false }: { broken?: boolean }) {
  const { t } = useLanguage();
  return (
    <svg
      viewBox="0 0 24 16"
      shapeRendering="crispEdges"
      aria-label={broken ? t("带有错误颜色的像素鱼") : t("修整后的像素鱼")}
    >
      {fish.flatMap((row, y) =>
        [...row].map((c, x) =>
          colors[c] ? (
            <rect
              key={`${x}-${y}`}
              x={x + 2}
              y={y + 2}
              width="1"
              height="1"
              fill={
                broken && ((x === 11 && y === 4) || (x === 9 && y === 7))
                  ? y === 4
                    ? "#ed36ff"
                    : "#3195ff"
                  : colors[c]
              }
            />
          ) : null,
        ),
      )}
    </svg>
  );
}
export default function RepairDemo() {
  const { t } = useLanguage();
  const [position, setPosition] = useState(50),
    [fixed, setFixed] = useState(false);
  return (
    <section
      className="repair-demo"
      id="repair-example"
      aria-label={t("交互式像素修整示例")}
    >
      <div className="comparison checker">
        <div className="comparison-image">
          <PixelFish />
        </div>
        <div
          className="comparison-original"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          <PixelFish broken={!fixed} />
        </div>
        <span className="compare-label before">
          {fixed ? t("原图已修整") : t("原图")}
        </span>
        <span className="compare-label after">{t("修整后")}</span>
        <div className="compare-divider" style={{ left: `${position}%` }}>
          <span>
            <ArrowLeftRight size={18} />
          </span>
        </div>
        <input
          className="compare-range"
          type="range"
          min="5"
          max="95"
          value={position}
          aria-label={t("修整前后对比滑杆")}
          onChange={(e) => setPosition(+e.target.value)}
        />
      </div>
      <div className="pixel-details">
        <div>
          <span>{t("错误像素")}</span>
          <button
            className={`pixel-patch ${fixed ? "fixed" : ""}`}
            aria-label={t("修正示例中的错误像素")}
            onClick={() => setFixed(true)}
            title={t("点击修正两个错误像素")}
          >
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </button>
        </div>
        <div>
          <span>{t("精准修正")}</span>
          <div className="pixel-patch fixed">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>
      <div className="demo-controls">
        <span aria-live="polite">
          {fixed ? (
            <>
              <Check size={14} />
              {t("错误像素已修正")}
            </>
          ) : (
            t("拖动对比 · 点击错误像素体验修整")
          )}
        </span>
        <button
          onClick={() => {
            setFixed(false);
            setPosition(50);
          }}
          aria-label={t("重置修整示例")}
        >
          <RotateCcw size={14} />
          {t("重置")}
        </button>
        <small>{t("示例 · PNG")}</small>
      </div>
    </section>
  );
}
