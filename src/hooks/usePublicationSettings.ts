/**
 * usePublicationSettings — fetches the single-row blog_publication_settings.
 * Public-safe: uses the get_publication_settings_public RPC which excludes
 * personal contact fields (e.g. social_email). For the admin editor that
 * needs the full row including social_email, query the table directly as
 * the signed-in owner.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PublicationSettings = {
  id: string;
  author_first_name: string | null;
  author_last_name: string | null;
  author_bio_es: string | null;
  author_bio_en: string | null;
  author_role_es: string | null;
  author_role_en: string | null;
  author_avatar_url: string | null;
  social_whatsapp: string | null;
  social_facebook: string | null;
  social_instagram: string | null;
  social_youtube: string | null;
  social_email: string | null;
  share_whatsapp_enabled: boolean;
  share_facebook_enabled: boolean;
  share_instagram_enabled: boolean;
  share_youtube_enabled: boolean;
  share_email_enabled: boolean;
  share_copy_enabled: boolean;
};

let cache: PublicationSettings | null = null;

export function usePublicationSettings() {
  const [data, setData] = useState<PublicationSettings | null>(cache);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    supabase
      .rpc("get_publication_settings_public")
      .then(({ data: rows }) => {
        if (cancelled) return;
        const row = Array.isArray(rows) ? rows[0] : rows;
        if (row) {
          cache = { ...(row as any), social_email: null } as PublicationSettings;
          setData(cache);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return {
    data,
    loading,
    refresh: async () => {
      const { data: rows } = await supabase.rpc("get_publication_settings_public");
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (row) {
        cache = { ...(row as any), social_email: null } as PublicationSettings;
        setData(cache);
      }
    },
  };
}
