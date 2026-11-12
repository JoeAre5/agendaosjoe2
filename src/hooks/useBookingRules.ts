import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface BookingRuleRow {
  scope: string;
  service_id: string | null;
  min_advance_minutes: number;
  max_advance_days: number;
  cancel_window_hours: number;
}

interface ServiceMapping {
  id: string;
  acuity_type_id: number | null;
  name: string;
}

/**
 * Fetches global + service-scoped booking rules and provides
 * getMinAdvance(acuityTypeId) that returns the effective min_advance_minutes.
 * Service-scoped rules override the global rule.
 */
export function useBookingRules() {
  const [globalRule, setGlobalRule] = useState<BookingRuleRow | null>(null);
  const [serviceRules, setServiceRules] = useState<(BookingRuleRow & { acuity_type_id: number | null })[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [rulesRes, servicesRes] = await Promise.all([
        supabase.from("booking_rules")
          .select("scope,service_id,min_advance_minutes,max_advance_days,cancel_window_hours")
          .eq("is_active", true)
          .in("scope", ["global", "service"]),
        supabase.from("services")
          .select("id,acuity_type_id,name")
          .eq("is_active", true),
      ]);

      const rules = (rulesRes.data as BookingRuleRow[]) || [];
      const services = (servicesRes.data as ServiceMapping[]) || [];

      const global = rules.find((r) => r.scope === "global") || null;
      setGlobalRule(global);

      // Map service-scoped rules to acuity_type_id (native services have none: keyed by id)
      const svcRules = rules
        .filter((r) => r.scope === "service" && r.service_id)
        .map((r) => {
          const svc = services.find((s) => s.id === r.service_id);
          return svc ? { ...r, acuity_type_id: svc.acuity_type_id ?? null } : null;
        })
        .filter(Boolean) as (BookingRuleRow & { acuity_type_id: number | null })[];

      setServiceRules(svcRules);
      setLoaded(true);
    })();
  }, []);

  /** Effective min_advance_minutes for a service: Acuity type id, or services.id (native). */
  const getMinAdvance = useCallback(
    (serviceKey: number | string | null): number => {
      if (serviceKey !== null && serviceKey !== undefined && serviceKey !== "") {
        const svcRule = serviceRules.find(
          (r) => r.service_id === String(serviceKey) || (r.acuity_type_id !== null && String(r.acuity_type_id) === String(serviceKey)),
        );
        if (svcRule) return svcRule.min_advance_minutes;
      }
      // No rules row: the booking_rules column default, kept at the Acuity-era default.
      return globalRule?.min_advance_minutes ?? 120;
    },
    [globalRule, serviceRules]
  );

  /** Get effective max_advance_days (always global) */
  const maxAdvanceDays = globalRule?.max_advance_days ?? 90;

  /** Get cancel window hours (always global) */
  const cancelWindowHours = globalRule?.cancel_window_hours ?? 24;

  return { getMinAdvance, maxAdvanceDays, cancelWindowHours, loaded };
}
