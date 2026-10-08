import type { Metadata } from "next";
import Editor from "@/components/Editor";
export const metadata: Metadata = { title: "像素编辑器" };
export default function EditorPage() {
  return <Editor />;
}
