import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "点修 · 在线像素图片编辑", template: "%s · 点修" },
  description:
    "在浏览器中精确修整像素图片。支持多图编辑、逐帧动画预览和无损 PNG 导出，图片仅在本地处理。",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
