import type { Metadata } from "next";
import Editor from "@/components/Editor";
export const metadata: Metadata = {
  title: "像素编辑器",
  alternates: { canonical: "https://dianxiu.top/editor/" },
};
export default function EditorPage() {
  return <Editor />;
}
