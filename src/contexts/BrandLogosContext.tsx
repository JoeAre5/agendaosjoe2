import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type BrandLogos = {
  headerLogoUrl: string | null;
  sidebarLogoUrl: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const Ctx = createContext<BrandLogos>({
  headerLogoUrl: null,
  sidebarLogoUrl: null,
  loading: true,
  refresh: async () => {},
});

export function BrandLogosProvider({ children }: { children: ReactNode }) {
  const [headerLogoUrl, setHeader] = useState<string | null>(null);
  const [sidebarLogoUrl, setSidebar] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("shop_settings_public" as any)
      .select("header_logo_url, sidebar_logo_url")
      .limit(1)
      .maybeSingle();
    const row = data as unknown as { header_logo_url: string | null; sidebar_logo_url: string | null } | null;
    setHeader(row?.header_logo_url ?? null);
    setSidebar(row?.sidebar_logo_url ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("brand-logos-updated", handler);
    return () => window.removeEventListener("brand-logos-updated", handler);
  }, [refresh]);

  return (
    <Ctx.Provider value={{ headerLogoUrl, sidebarLogoUrl, loading, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useBrandLogos() {
  return useContext(Ctx);
}

/** Fire after upload/removal so all consumers re-fetch. */
export function notifyBrandLogosUpdated() {
  window.dispatchEvent(new Event("brand-logos-updated"));
}
