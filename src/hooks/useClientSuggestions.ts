import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { contactEmail } from "../../supabase/functions/_shared/contactEmail";

export interface ClientSuggestion {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  acuityClientId: number | null;
}

interface ClientRow {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  acuity_client_id: number | null;
}

function mapClient(row: ClientRow): ClientSuggestion {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name || "",
    email: contactEmail(row.email) || "",
    phone: row.phone || "",
    acuityClientId: row.acuity_client_id,
  };
}

// Quote PostgREST values and treat wildcard characters as literal input.
function searchPattern(value: string) {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[%_*]/g, " ");
  return `"%${escaped}%"`;
}

export function useClientSuggestions(sessionKey: string | null) {
  const [results, setResults] = useState<ClientSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    generation.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    controller.current?.abort();
    controller.current = null;
  }, []);

  const clear = useCallback(() => {
    cancel();
    setResults([]);
    setSearching(false);
    setFailed(false);
  }, [cancel]);

  useEffect(() => {
    clear();
    return cancel;
  }, [sessionKey, clear, cancel]);

  const search = useCallback((value: string) => {
    clear();
    const term = value.trim();
    if (!sessionKey || term.length < 2) return;
    const request = generation.current;
    timer.current = setTimeout(async () => {
      const abort = new AbortController();
      controller.current = abort;
      setSearching(true);
      try {
        // Existing staff-authorized RPC reads current public.clients, not Acuity.
        // Filtering and the ten-suggestion limit run on the server, not on a
        // truncated or cached client directory downloaded to the device.
        let query = supabase.rpc("get_clients_barber_safe")
          .select("id, first_name, last_name, email, phone, acuity_client_id")
          .order("first_name").order("last_name").order("id").limit(10);
        const digits = term.replace(/\D/g, "");
        if (/^[+\d\s().-]+$/.test(term) && digits.length >= 3) {
          query = query.ilike("phone", `%${digits.split("").join("%")}%`);
        } else {
          for (const token of term.split(/\s+/).slice(0, 8)) {
            const pattern = searchPattern(token);
            query = query.or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`);
          }
        }
        const { data, error } = await query.abortSignal(abort.signal);
        if (generation.current !== request) return;
        if (error) throw error;
        setResults((data || []).map(mapClient));
      } catch {
        if (generation.current === request) {
          setResults([]);
          setFailed(true);
        }
      } finally {
        if (generation.current === request) setSearching(false);
      }
    }, 300);
  }, [sessionKey, clear]);

  return { results, searching, failed, search, clear };
}