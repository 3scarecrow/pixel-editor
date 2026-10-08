"use client";
import { useEffect, useRef } from "react";
import type { PixelImage } from "@/core/model";
export function Thumbnail({
  image,
  className = "",
}: {
  image: PixelImage;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = image.width;
    c.height = image.height;
    c.getContext("2d")!.putImageData(
      new ImageData(
        image.pixels as Uint8ClampedArray<ArrayBuffer>,
        image.width,
        image.height,
      ),
      0,
      0,
    );
  }, [image.id, image.revision]);
  return (
    <canvas
      ref={ref}
      className={`thumbnail-image ${className}`}
      aria-label={image.name}
    />
  );
}
