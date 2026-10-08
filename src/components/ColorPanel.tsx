"use client";
import { useLanguage } from "@/i18n/LanguageProvider";
import { useEffect, useRef, useState } from "react";
import { hex, parseHex, type RGBA } from "@/core/model";
import { hsvToRgb, rgbToHsv } from "@/core/color";
const palette = [
  "#10191F",
  "#505A62",
  "#88929C",
  "#FFFFFF",
  "#FF6569",
  "#FFAB49",
  "#FFD866",
  "#A5D66D",
  "#58C8B2",
  "#53B7E8",
  "#8B8AFF",
  "#C68AED",
];
export function ColorPanel({
  color,
  onChange,
}: {
  color: RGBA;
  onChange: (c: RGBA) => void;
}) {
  const { t } = useLanguage();
  const hsv = rgbToHsv(color),
    [text, setText] = useState(hex(color)),
    [invalid, setInvalid] = useState(false),
    area = useRef<HTMLDivElement>(null);
  const hue = useRef(hsv.h);
  if (hsv.s > 0) hue.current = hsv.h;
  useEffect(() => {
    setText(hex(color));
    setInvalid(false);
  }, [color]);
  const select = (e: React.PointerEvent) => {
    const rect = area.current!.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      v = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onChange(hsvToRgb(hue.current, s, v, color[3]));
  };
  const commit = () => {
    const c = parseHex(text, color[3]);
    setInvalid(!c);
    if (c) onChange(c);
  };
  return (
    <section className="color-panel">
      <div className="section-title">
        <h2>{t("颜色")}</h2>
        <span>COLOR</span>
      </div>
      <div className="color-picker">
        <div
          className="sv-area"
          ref={area}
          role="slider"
          tabIndex={0}
          aria-label={t("颜色饱和度与明度")}
          aria-valuetext={`${Math.round(hsv.s * 100)}%, ${Math.round(hsv.v * 100)}%`}
          style={{ backgroundColor: `hsl(${hue.current},100%,50%)` }}
          onKeyDown={(e) => {
            if (
              ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                e.key,
              )
            ) {
              e.preventDefault();
              onChange(
                hsvToRgb(
                  hue.current,
                  Math.max(
                    0,
                    Math.min(
                      1,
                      hsv.s +
                        (e.key === "ArrowLeft"
                          ? -0.02
                          : e.key === "ArrowRight"
                            ? 0.02
                            : 0),
                    ),
                  ),
                  Math.max(
                    0,
                    Math.min(
                      1,
                      hsv.v +
                        (e.key === "ArrowDown"
                          ? -0.02
                          : e.key === "ArrowUp"
                            ? 0.02
                            : 0),
                    ),
                  ),
                  color[3],
                ),
              );
            }
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            select(e);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) select(e);
          }}
        >
          <span
            className="sv-marker"
            style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
          />
        </div>
        <input
          className="hue-slider"
          type="range"
          min={0}
          max={359}
          value={Math.round(hue.current)}
          aria-label={t("色相")}
          onChange={(e) => {
            hue.current = +e.target.value;
            onChange(hsvToRgb(+e.target.value, hsv.s, hsv.v, color[3]));
          }}
        />
      </div>
      <div className="hex-row">
        <label
          className="native-color"
          style={{ background: hex(color) }}
          title={t("打开系统颜色选择器")}
        >
          <input
            aria-label={t("系统颜色选择器")}
            type="color"
            value={hex(color)}
            onChange={(e) => onChange(parseHex(e.target.value, color[3])!)}
          />
        </label>
        <input
          className={invalid ? "invalid" : ""}
          aria-label={t("HEX 颜色")}
          value={text}
          maxLength={7}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
        />
      </div>
      {invalid && (
        <span className="field-error">{t("请输入 6 位 HEX 颜色")}</span>
      )}
      <div className="alpha-label">
        <label htmlFor="alpha-number">{t("透明度")}</label>
        <div>
          <input
            id="alpha-number"
            type="number"
            min={0}
            max={100}
            value={Math.round((color[3] / 255) * 100)}
            onChange={(e) =>
              onChange([
                color[0],
                color[1],
                color[2],
                Math.round(
                  (Math.max(0, Math.min(100, +e.target.value)) * 255) / 100,
                ),
              ])
            }
          />
          <span>%</span>
        </div>
      </div>
      <input
        className="alpha-slider"
        aria-label={t("透明度滑块")}
        type="range"
        min={0}
        max={255}
        value={color[3]}
        onChange={(e) =>
          onChange([color[0], color[1], color[2], +e.target.value])
        }
      />
      <div className="palette">
        {palette.map((p) => (
          <button
            key={p}
            title={p}
            aria-label={t("选择颜色 {0}", p)}
            className={hex(color) === p ? "active" : ""}
            style={{ background: p }}
            onClick={() => onChange(parseHex(p, color[3])!)}
          />
        ))}
      </div>
    </section>
  );
}
