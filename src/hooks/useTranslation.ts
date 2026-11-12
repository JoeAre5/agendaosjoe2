import { useContext, useCallback } from "react";
import { PreferencesContext } from "@/contexts/PreferencesContext";
import es from "@/locales/es.json";
import en from "@/locales/en.json";

const locales: Record<string, Record<string, any>> = { es, en };

function getNestedValue(obj: any, path: string): string {
  const v = path.split(".").reduce((acc, key) => acc?.[key], obj);
  return typeof v === "string" ? v : path;
}

function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) =>
    vars[k] !== undefined ? String(vars[k]) : `{{${k}}}`
  );
}

export function useTranslation() {
  const { language } = useContext(PreferencesContext);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const raw = getNestedValue(locales[language] || locales.es, key);
      return interpolate(raw, vars);
    },
    [language]
  );

  return { t, language };
}
