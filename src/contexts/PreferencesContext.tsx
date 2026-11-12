import { createContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Theme = "dark" | "light" | "system";
type ResolvedTheme = "dark" | "light";
type Language = "es" | "en";

interface PreferencesContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  language: Language;
  setTheme: (t: Theme) => void;
  setLanguage: (l: Language) => void;
  loading: boolean;
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const PreferencesContext = createContext<PreferencesContextValue>({
  theme: "system",
  resolvedTheme: getSystemTheme(),
  language: "es",
  setTheme: () => {},
  setLanguage: () => {},
  loading: true,
});

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [theme, setThemeState] = useState<Theme>(() => {
    try { return (localStorage.getItem("pref_theme") as Theme) || "system"; } catch { return "system"; }
  });
  const [language, setLanguageState] = useState<Language>(() => {
    try { return (localStorage.getItem("pref_language") as Language) || "es"; } catch { return "es"; }
  });
  const [loading, setLoading] = useState(true);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme;

  // Listen for system theme changes
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Apply theme class to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [resolvedTheme]);

  // Load preferences from DB (authenticated users only)
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    supabase
      .from("user_preferences")
      .select("theme, language")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setThemeState((data.theme as Theme) || "system");
          setLanguageState((data.language as Language) || "es");
        }
        setLoading(false);
      });
  }, [user]);

  const persist = useCallback(
    async (updates: { theme?: string; language?: string }) => {
      // Always persist to localStorage (works for anonymous visitors)
      if (updates.theme) try { localStorage.setItem("pref_theme", updates.theme); } catch {}
      if (updates.language) try { localStorage.setItem("pref_language", updates.language); } catch {}

      // Also persist to DB for authenticated users
      if (!user) return;
      await supabase
        .from("user_preferences")
        .upsert({ id: user.id, ...updates }, { onConflict: "id" });
    },
    [user]
  );

  const setTheme = useCallback(
    (t: Theme) => {
      setThemeState(t);
      persist({ theme: t });
    },
    [persist]
  );

  const setLanguage = useCallback(
    (l: Language) => {
      setLanguageState(l);
      persist({ language: l });
    },
    [persist]
  );

  return (
    <PreferencesContext.Provider value={{ theme, resolvedTheme, language, setTheme, setLanguage, loading }}>
      {children}
    </PreferencesContext.Provider>
  );
}
