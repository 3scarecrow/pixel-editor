"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { translate, type Language } from "./translate";
const LanguageContext = createContext({
  language: "zh" as Language,
  setLanguage: (_language: Language) => {},
  t: (text: string, ...values: unknown[]) => translate("zh", text, ...values),
});
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("zh");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("dianxiu-language");
    } catch {}
    setLanguage(
      saved === "en" || saved === "zh"
        ? saved
        : navigator.language.toLowerCase().startsWith("zh")
          ? "zh"
          : "en",
    );
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
    document.title = translate(language, "点修 · 在线像素图片编辑");
    const description = document.querySelector('meta[name="description"]');
    description?.setAttribute(
      "content",
      translate(
        language,
        "逐点修改像素颜色，支持多图编辑、逐帧预览与无损 PNG 导出。",
      ),
    );
    try {
      localStorage.setItem("dianxiu-language", language);
    } catch {}
  }, [language, ready]);
  const t = useCallback(
    (text: string, ...values: unknown[]) =>
      translate(language, text, ...values),
    [language],
  );
  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
export function useLanguage() {
  return useContext(LanguageContext);
}
export function LanguageSwitch() {
  const { language, setLanguage } = useLanguage();
  return (
    <select
      className="language-switch"
      aria-label={language === "zh" ? "界面语言" : "Interface language"}
      value={language}
      onChange={(event) => setLanguage(event.target.value as Language)}
    >
      <option value="zh">中文</option>
      <option value="en">English</option>
    </select>
  );
}
