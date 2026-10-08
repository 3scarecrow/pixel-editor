import type { Metadata } from "next";
import Home from "@/components/Home";

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
export default function HomePage() {
  return <Home />;
}
