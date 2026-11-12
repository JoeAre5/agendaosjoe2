/**
 * Loads the public site copy from shop_settings.site_content (live) and
 * exposes it through useSiteContent. The CMS provides an override via
 * <SiteContentProvider value={draft}> so the Live Preview reflects pending
 * draft changes without mutating the public site.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_SITE_CONTENT, mergeSiteContent, type SiteContent } from "@/lib/siteContent";

const Ctx = createContext<SiteContent>(DEFAULT_SITE_CONTENT);

export function SiteContentProvider({
  value,
  children,
}: {
  value?: Partial<SiteContent> | null;
  children: ReactNode;
}) {
  const [remote, setRemote] = useState<any>(null);

  useEffect(() => {
    // If an explicit override is provided (CMS preview), skip the remote fetch.
    if (value) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("shop_settings_public" as any)
        .select("site_content")
        .limit(1)
        .maybeSingle();
      if (!cancelled) setRemote((data as any)?.site_content || null);
    })();
    return () => { cancelled = true; };
  }, [value]);

  const merged = useMemo(
    () => mergeSiteContent(value ?? remote),
    [value, remote],
  );

  return <Ctx.Provider value={merged}>{children}</Ctx.Provider>;
}

export function useSiteContent(): SiteContent {
  return useContext(Ctx);
}
