import { supabase } from "@/integrations/supabase/client";

/** Owner-only CMS helper: reads live + draft website settings via a secure RPC. */
export async function loadWebsiteDraftAssets(): Promise<any> {
  const { data, error } = await supabase.rpc("website_draft_assets" as any);
  if (error) throw error;
  return data || {};
}