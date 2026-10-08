"use client";
import { useLanguage } from "@/i18n/LanguageProvider";
import { forwardRef, useImperativeHandle, useState } from "react";
import type { RGBA } from "@/core/model";
export interface StatusHandle {
  hover: (
    pixel: {
      x: number;
      y: number;
      color: RGBA;
    } | null,
  ) => void;
}
export const StatusBar = forwardRef<
  StatusHandle,
  {
    hasImage: boolean;
  }
>(function StatusBar({ hasImage }, ref) {
  const { t } = useLanguage();
  const [pixel, setPixel] = useState<{
    x: number;
    y: number;
    color: RGBA;
  } | null>(null);
  useImperativeHandle(ref, () => ({
    hover: (next) =>
      setPixel((previous) =>
        previous &&
        next &&
        previous.x === next.x &&
        previous.y === next.y &&
        previous.color.every((v, i) => v === next.color[i])
          ? previous
          : next,
      ),
  }));
  if (!pixel || !hasImage) return null;
  return (
    <div className="pixel-readout" aria-label={t("当前像素信息")}>
      <span>
        X: {pixel.x}　Y: {pixel.y}
      </span>
      <span>RGBA: {pixel.color.join(", ")}</span>
    </div>
  );
});
