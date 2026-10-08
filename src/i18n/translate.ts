import english from "./en.json";
export type Language = "zh" | "en";
const dictionary: Record<string, string> = english;
const patterns = Object.entries(dictionary)
  .filter(([key]) => /\{\d+\}/.test(key))
  .map(([key, value]) => ({
    pattern: new RegExp(
      "^" +
        key
          .split(/\{\d+\}/)
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("(.*?)") +
        "$",
    ),
    value,
  }));
export function translate(
  language: Language,
  text: string,
  ...values: unknown[]
): string {
  let result = language === "en" ? (dictionary[text] ?? text) : text;
  if (language === "en" && !dictionary[text]) {
    for (const entry of patterns) {
      const match = text.match(entry.pattern);
      if (match)
        return entry.value.replace(/\{(\d+)\}/g, (_, i) =>
          translate(language, match[Number(i) + 1]),
        );
    }
    // Worker errors may prepend an original filename to the decoder message.
    const separator = text.indexOf("：");
    if (separator >= 0)
      result =
        text.slice(0, separator) +
        ": " +
        translate(language, text.slice(separator + 1));
  }
  return result.replace(/\{(\d+)\}/g, (placeholder, i) =>
    Number(i) < values.length ? String(values[Number(i)]) : placeholder,
  );
}
