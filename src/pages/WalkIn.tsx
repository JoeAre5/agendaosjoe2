import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { backToCalendar } from "@/lib/navHelpers";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "sonner";
import {
  ChevronLeft,
  Loader2,
  Check,
  CheckCircle,
  User,
  Scissors,
  Clock,
  UserPlus,
} from "lucide-react";
import { format, addMinutes, isBefore, isAfter, parseISO } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { getShopTimezone, toAcuityDatetimeInTz } from "@/lib/timezone";
import { motion, AnimatePresence } from "motion/react";
import { Input } from "@/components/ui/input";
import { hasMinimumStaffClientInfo, validateStaffClientInput } from "@/lib/appointmentValidation";
import { BookingProgress, type BookingProgressChip } from "@/components/site/booking/BookingProgress";
import { findMatchingClient, type ClientMatch } from "@/lib/clientMatching";
import { SubpageHeader } from "@/components/SubpageHeader";
import { ClientMatchConfirmDialog } from "@/components/ClientMatchConfirmDialog";
import { schedulingProxy as acuityProxy, calendarBarber } from "@/lib/scheduling";


/* ─── types ─── */
interface AcuityCalendar { id: number; name: string; barberId?: string | null; avatarUrl?: string | null; barberName?: string }
interface AcuityType { id: number; name: string; duration: number; price: string; calendarIDs: number[]; category: string }
interface SlotResult { barberId: string; barberName: string; calendarId: number; appointmentTypeId: number; datetime: Date; avatarUrl: string | null }

/* ─── barber colors ─── */
const BARBER_COLORS: Record<string, string> = { charlie: "#c9a882", pito: "#8aaec9", joseph: "#7ab893" };
function getBarberColor(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, color] of Object.entries(BARBER_COLORS)) if (lower.includes(key)) return color;
  return "var(--accent-color)";
}

/* ─── allowed walk-in service names (normalized) ─── */
const ALLOWED_SERVICES = ["corte", "corte & barba", "corte de niño", "corte de nino"];
function normalizeServiceName(n: string) { return n.toLowerCase().trim().replace(/\s+/g, " ").replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "").trim(); }
function isAllowedService(n: string) { return ALLOWED_SERVICES.includes(normalizeServiceName(n)); }

/* ─── acuity proxy ─── */

type Step = "client" | "service" | "slot";

/* ─── main component ─── */
export default function WalkIn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const { t, language } = useTranslation();
  const dateFnsLocale = language === "es" ? es : enUS;

  const [step, setStep] = useState<Step>("client");

  // Client info
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [allClients, setAllClients] = useState<{ id: string; first_name: string; last_name: string | null; phone: string | null; email: string | null }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // Data
  const [calendars, setCalendars] = useState<AcuityCalendar[]>([]);
  const [services, setServices] = useState<AcuityType[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Service step
  const [selectedService, setSelectedService] = useState<{ name: string; duration: number } | null>(null);

  // Slot step
  const [bestSlot, setBestSlot] = useState<SlotResult | null>(null);
  const [loadingSlot, setLoadingSlot] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdApptId, setCreatedApptId] = useState<string | null>(null);
  const [showWaitlistConfirm, setShowWaitlistConfirm] = useState(false);
  const [showWaitlistSuccess, setShowWaitlistSuccess] = useState(false);
  const [addingToWaitlist, setAddingToWaitlist] = useState(false);

  // Unified client identity match prompt (partial match only)
  const [matchPrompt, setMatchPrompt] = useState<ClientMatch | null>(null);
  const [matchAck, setMatchAck] = useState(false);
  const [matchChecking, setMatchChecking] = useState(false);

  // Fetch calendars, services & clients on mount
  useEffect(() => {
    const load = async () => {
      try {
        const [calsData, typesData, barbersData, clientsRes] = await Promise.all([
          acuityProxy("/calendars"),
          acuityProxy("/appointment-types"),
          supabase.from("barbers_public").select("id, name, acuity_calendar_id, is_active, avatar_url").eq("is_active", true),
          supabase.from("clients").select("id, first_name, last_name, phone, email").order("first_name"),
        ]);

        if (clientsRes.data) setAllClients(clientsRes.data);

        const barberRows = (barbersData.data || []) as Array<{ id: string; name: string; avatar_url: string | null; acuity_calendar_id: number | null }>;

        if (Array.isArray(calsData)) {
          setCalendars(
            calsData.map((c: any) => {
              // Native calendars are barbers (barberId / id = barbers.id); Acuity ones map by calendar id, then name.
              const match = calendarBarber(c, barberRows);
              return { id: c.id, name: c.name, barberId: match?.id || null, avatarUrl: match?.avatar_url || null, barberName: match?.name || c.name };
            })
          );
        }
        if (Array.isArray(typesData)) setServices(typesData);
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setLoadingData(false);
      }
    };
    load();
  }, []);

  // Deduplicated walk-in services (group by normalized name, pick shortest duration per unique)
  const walkInServices = useMemo(() => {
    const allowed = services.filter((s) => isAllowedService(s.name));
    const map = new Map<string, { name: string; duration: number; variants: AcuityType[] }>();
    allowed.forEach((s) => {
      const key = normalizeServiceName(s.name);
      if (!map.has(key)) {
        map.set(key, { name: s.name, duration: s.duration, variants: [s] });
      } else {
        const existing = map.get(key)!;
        existing.variants.push(s);
        if (s.duration < existing.duration) existing.duration = s.duration;
      }
    });
    return Array.from(map.values());
  }, [services]);

  // Find soonest available slot for a service
  const findSoonestSlot = async (serviceName: string, durationMinutes: number) => {
    setLoadingSlot(true);
    setBestSlot(null);

    try {
      const now = new Date();
      const todayStr = format(now, "yyyy-MM-dd");
      const todayStart = format(now, "yyyy-MM-dd'T'00:00:00");
      const todayEnd = format(now, "yyyy-MM-dd'T'23:59:59");

      // Fetch today's appointments from local DB
      const { data: todayAppts } = await supabase
        .from("appointments")
        .select("barber_id, starts_at, ends_at, duration_minutes")
        .gte("starts_at", todayStart)
        .lte("starts_at", todayEnd)
        .neq("status", "cancelled");

      // Fetch today's block times
      const { data: todayBlocks } = await supabase
        .from("block_times")
        .select("barber_id, starts_at, ends_at")
        .gte("starts_at", todayStart)
        .lte("starts_at", todayEnd);

      // Find matching service variants per barber (calendar)
      const normalized = normalizeServiceName(serviceName);
      const matchingServices = services.filter((s) => normalizeServiceName(s.name) === normalized);

      // Fetch working hours for today
      const dayOfWeek = now.getDay();
      const { data: workingHours } = await supabase
        .from("working_hours")
        .select("barber_id, start_time, end_time, is_active")
        .eq("day_of_week", dayOfWeek)
        .eq("is_active", true);

      let soonest: SlotResult | null = null;

      for (const cal of calendars) {
        if (!cal.barberId) continue;

        // Find which service variant belongs to this calendar
        const variant = matchingServices.find((s) => s.calendarIDs.includes(cal.id));
        if (!variant) continue;

        const serviceDur = variant.duration;

        // Get this barber's working hours for today
        const wh = (workingHours || []).find((w) => w.barber_id === cal.barberId);
        if (!wh) continue;

        // Parse working hour boundaries
        const [startH, startM] = wh.start_time.split(":").map(Number);
        const [endH, endM] = wh.end_time.split(":").map(Number);
        const workStart = new Date(now);
        workStart.setHours(startH, startM, 0, 0);
        const workEnd = new Date(now);
        workEnd.setHours(endH, endM, 0, 0);

        // Get this barber's appointments today, sorted
        const barberAppts = (todayAppts || [])
          .filter((a) => a.barber_id === cal.barberId)
          .map((a) => ({ start: parseISO(a.starts_at), end: parseISO(a.ends_at) }))
          .sort((a, b) => a.start.getTime() - b.start.getTime());

        // Get this barber's blocks today
        const barberBlocks = (todayBlocks || [])
          .filter((b) => b.barber_id === cal.barberId)
          .map((b) => ({ start: parseISO(b.starts_at), end: parseISO(b.ends_at) }))
          .sort((a, b) => a.start.getTime() - b.start.getTime());

        // Merge appointments + blocks into busy intervals
        const busy = [...barberAppts, ...barberBlocks].sort((a, b) => a.start.getTime() - b.start.getTime());

        // Candidate start: max(now, workStart)
        let candidate = new Date(Math.max(now.getTime(), workStart.getTime()));
        // Round up to next 15-minute slot
        const mins = candidate.getMinutes();
        const remainder = mins % 15;
        if (remainder > 0) {
          candidate = addMinutes(candidate, 15 - remainder);
          candidate.setSeconds(0, 0);
        }

        // Scan for first gap that fits serviceDur
        let found = false;
        while (isBefore(candidate, workEnd)) {
          const candidateEnd = addMinutes(candidate, serviceDur);
          if (isAfter(candidateEnd, workEnd)) break;

          // Check if overlaps any busy interval
          const overlaps = busy.some(
            (b) => isBefore(candidate, b.end) && isAfter(candidateEnd, b.start)
          );

          if (!overlaps) {
            // Found a slot!
            if (!soonest || isBefore(candidate, soonest.datetime)) {
              soonest = {
                barberId: cal.barberId!,
                barberName: cal.barberName || cal.name,
                calendarId: cal.id,
                appointmentTypeId: variant.id,
                datetime: new Date(candidate),
                avatarUrl: cal.avatarUrl || null,
              };
            }
            found = true;
            break;
          }

          // Jump past the blocking interval
          const blocker = busy.find(
            (b) => isBefore(candidate, b.end) && isAfter(candidateEnd, b.start)
          );
          if (blocker) {
            candidate = new Date(blocker.end);
            // Round up to next 15-min
            const m2 = candidate.getMinutes();
            const r2 = m2 % 15;
            if (r2 > 0) {
              candidate = addMinutes(candidate, 15 - r2);
              candidate.setSeconds(0, 0);
            }
          } else {
            candidate = addMinutes(candidate, 15);
          }
        }
      }

      setBestSlot(soonest);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingSlot(false);
    }
  };

  // Client suggestions – tokenized cross-field matching
  const clientSuggestions = useMemo(() => {
    const query = `${firstName} ${lastName}`.trim().toLowerCase();
    if (query.length < 2) return [];
    const tokens = query.split(/\s+/).filter(Boolean);
    return allClients.filter((c) => {
      const full = `${c.first_name} ${c.last_name || ""}`.toLowerCase();
      return tokens.every((t) => full.includes(t));
    }).slice(0, 5);
  }, [firstName, lastName, allClients]);

  const selectClient = (c: typeof allClients[0]) => {
    setFirstName(c.first_name);
    setLastName(c.last_name || "");
    setPhone(c.phone || "");
    setSelectedClientId(c.id);
    setShowSuggestions(false);
  };

  const handleSelectService = (svc: { name: string; duration: number }) => {
    setSelectedService(svc);
    setStep("slot");
    findSoonestSlot(svc.name, svc.duration);
  };

  const handleConfirmSlot = async () => {
    if (!bestSlot || submitting) return;
    const validation = validateStaffClientInput({ firstName, lastName, phone });
    if (validation.ok === false) {
      if (validation.reason === "missing_first_name") {
        toast.error(language === "es" ? "El nombre es requerido" : "First name is required");
      } else if (validation.reason === "missing_phone") {
        toast.error(language === "es" ? "El teléfono es requerido" : "Phone number is required");
      } else if (validation.reason === "invalid_phone") {
        toast.error(language === "es" ? "Teléfono inválido" : "Invalid phone number");
      }
      setStep("client");
      return;
    }

    // Unified identity match pre-check (only when no client linked yet).
    if (!selectedClientId && !matchAck && phone.trim()) {
      setMatchChecking(true);
      try {
        const match = await findMatchingClient(phone, null);
        if (match.clientId) {
          if (match.matchType === "both" || match.matchType === "phone") {
            // Walk-in collects phone only — both/phone are effectively the same here.
            // For partial match, surface the prompt.
            if (match.matchType === "both") {
              setSelectedClientId(match.clientId);
            } else {
              setMatchPrompt(match);
              setMatchChecking(false);
              return;
            }
          }
        }
      } finally {
        setMatchChecking(false);
      }
    }

    setSubmitting(true);

    try {
      const d = bestSlot.datetime;
      const tz = await getShopTimezone();
      // Interpret wall-clock components in shop timezone, emit Acuity-format ISO with correct offset.
      const datetime = toAcuityDatetimeInTz(
        d.getFullYear(),
        d.getMonth() + 1,
        d.getDate(),
        d.getHours(),
        d.getMinutes(),
        tz,
      );

      const clientName = `${firstName.trim()} ${lastName.trim()}`.trim() || "Walk-In Client";

      const apptData = await acuityProxy("/appointments", "POST", {
        appointmentTypeID: bestSlot.appointmentTypeId,
        calendarID: bestSlot.calendarId,
        datetime,
        firstName: firstName.trim() || "Walk-In",
        lastName: lastName.trim() || "Client",
        email: "",
        phone: phone.trim(),
        notes: "Walk-in",
        admin: true,
        native: { clientId: selectedClientId || null, bookingSource: "walk_in" },
      });

      if (apptData?.provider === "native") {
        // The native scheduler already wrote the appointments row.
        setCreatedApptId(apptData.localId || apptData.id);
        setShowSuccess(true);
      } else if (apptData?.id) {
        // Claim ownership BEFORE the Acuity webhook lands so booking_source
        // stays 'walk_in' (our app gets credit) instead of being downgraded
        // to 'acuity_sync'. created_by_role doubles as a hint to the webhook.
        const startsIso = String(apptData.datetime);
        const duration = Number(apptData.duration) || (selectedService?.duration ?? 30);
        const endsIso = new Date(new Date(startsIso).getTime() + duration * 60_000).toISOString();
        const priceCents = Math.round(parseFloat(String(apptData.price || "0")) * 100);
        const callerRole =
          (session?.user?.user_metadata as Record<string, unknown> | undefined)?.role === "barber"
            ? "barber"
            : "admin";

        const { data: claimed } = await supabase
          .from("appointments")
          .upsert(
            {
              acuity_id: apptData.id,
              barber_id: bestSlot.barberId,
              client_name: clientName,
              client_phone: phone.trim() || null,
              client_id: selectedClientId || null,
              service_name: selectedService!.name,
              service_id: bestSlot.appointmentTypeId,
              starts_at: startsIso,
              ends_at: endsIso,
              duration_minutes: duration,
              price_cents: priceCents,
              status: "scheduled",
              paid: false,
              created_by_role: callerRole,
              created_by_user_id: session?.user?.id || null,
              booking_source: "walk_in",
            },
            { onConflict: "acuity_id" },
          )
          .select("id")
          .single();

        setCreatedApptId(claimed?.id || null);
        setShowSuccess(true);
      } else {
        throw new Error("No appointment ID returned");
      }

    } catch (err: any) {
      toast.error(err.message || "Error creating walk-in");
      setSubmitting(false);
    }
  };

  const handleRatherWait = async () => {
    setAddingToWaitlist(true);
    try {
      const { error } = await supabase.from("waitlist").insert({
        first_name: firstName.trim() || "Walk-In",
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
        service_name: selectedService!.name,
        service_duration_minutes: selectedService!.duration,
        status: "waiting",
        client_id: selectedClientId || null,
      } as any);
      if (error) throw error;

      setShowWaitlistConfirm(false);
      setShowWaitlistSuccess(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAddingToWaitlist(false);
    }
  };

  const canProceedToService = hasMinimumStaffClientInfo({ firstName, phone });

  const nowStr = format(new Date(), "h:mm a", { locale: dateFnsLocale });

  const flowSteps = useMemo<Step[]>(() => ["client", "service", "slot"], []);
  const progress = useMemo(() => {
    const idx = flowSteps.indexOf(step);
    if (idx < 0) return 0;
    return idx / Math.max(1, flowSteps.length - 1);
  }, [flowSteps, step]);
  const chips = useMemo<BookingProgressChip[]>(() => {
    const list: BookingProgressChip[] = [];
    if (canProceedToService) {
      list.push({ stepKey: "client", label: `${firstName.trim()} ${lastName.trim()}`.trim(), detail: phone.trim() || undefined });
    }
    if (selectedService) {
      list.push({ stepKey: "service", label: selectedService.name, detail: `${selectedService.duration} min` });
    }
    if (bestSlot) {
      list.push({ stepKey: "slot", label: bestSlot.barberName.split(" ")[0], detail: format(bestSlot.datetime, "h:mm a", { locale: dateFnsLocale }) });
    }
    return list;
  }, [canProceedToService, firstName, lastName, phone, selectedService, bestSlot, dateFnsLocale]);

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--bg-base)" }}>
      <div className="sticky top-0 z-30" style={{ background: "var(--bg-base)", borderBottom: "1px solid var(--divider)" }}>
        <SubpageHeader
          title="Walk-In"
          subtitle={`${format(new Date(), "EEEE, MMM d", { locale: dateFnsLocale })} · ${nowStr}`}
          onBack={() => step === "slot" ? setStep("service") : step === "service" ? setStep("client") : navigate(-1)}
        />
        <div className="px-4 pb-3">
          <BookingProgress
            progress={progress}
            chips={chips}
            onChipClick={(key) => setStep(key as Step)}
            accent="var(--accent-color)"
          />
        </div>
      </div>

      {loadingData ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent-color)" }} />
        </div>
      ) : (
        <div className="flex-1 overflow-auto px-4 pt-4 pb-24">
          <AnimatePresence mode="wait">
            {/* ── STEP 1: CLIENT INFO ── */}
            {step === "client" && (
              <motion.div key="client" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="flex items-center gap-2 mb-4">
                  <UserPlus size={16} style={{ color: "var(--accent-color)" }} />
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                    {language === "es" ? "Información del cliente" : "Client Information"}
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="relative">
                    <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
                      {language === "es" ? "Nombre *" : "First Name *"}
                    </label>
                    <Input
                      value={firstName}
                      onChange={(e) => { setFirstName(e.target.value); setSelectedClientId(null); setShowSuggestions(true); }}
                      placeholder={language === "es" ? "Nombre" : "First name"}
                      className="rounded-xl"
                      style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
                      {language === "es" ? "Apellido" : "Last Name"}
                    </label>
                    <Input
                      value={lastName}
                      onChange={(e) => { setLastName(e.target.value); setSelectedClientId(null); setShowSuggestions(true); }}
                      placeholder={language === "es" ? "Apellido" : "Last name"}
                      className="rounded-xl"
                      style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                    />
                  </div>

                  {/* Client suggestions dropdown */}
                  {showSuggestions && clientSuggestions.length > 0 && (
                    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                      {clientSuggestions.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => selectClient(c)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:opacity-80"
                          style={{ borderBottom: "1px solid var(--divider)" }}
                        >
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "var(--accent-dim)", color: "var(--accent-color)" }}>
                            {c.first_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                              {c.first_name} {c.last_name || ""}
                            </p>
                            {c.phone && (
                              <p className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>{c.phone}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
                      {language === "es" ? "Teléfono *" : "Phone *"}
                    </label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(787) 000-0000"
                      type="tel"
                      className="rounded-xl"
                      style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                    />
                  </div>
                </div>

                <button
                  onClick={() => setStep("service")}
                  disabled={!canProceedToService}
                  className="w-full mt-6 py-3.5 rounded-2xl font-bold text-sm transition-all"
                  style={{
                    background: canProceedToService ? "var(--accent-color)" : "var(--border)",
                    color: canProceedToService ? "#fff" : "var(--text-tertiary)",
                    opacity: canProceedToService ? 1 : 0.6,
                  }}
                >
                  {language === "es" ? "Continuar" : "Continue"}
                </button>
              </motion.div>
            )}

            {/* ── STEP 2: SERVICE ── */}
            {step === "service" && (
              <motion.div key="service" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <div className="flex items-center gap-2 mb-4">
                  <Scissors size={16} style={{ color: "var(--accent-color)" }} />
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                    {language === "es" ? "Seleccionar servicio" : "Select Service"}
                  </p>
                </div>

                <div className="space-y-2">
                  {walkInServices.map((svc) => (
                    <button
                      key={svc.name}
                      onClick={() => handleSelectService(svc)}
                      className="w-full flex items-center gap-3 p-4 rounded-2xl transition-all"
                      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
                    >
                      <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "var(--accent-dim)" }}>
                        <Scissors size={18} style={{ color: "var(--accent-color)" }} />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{svc.name}</p>
                        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                          {svc.duration} min
                        </p>
                      </div>
                      <ChevronLeft size={16} className="rotate-180" style={{ color: "var(--text-tertiary)" }} />
                    </button>
                  ))}

                  {walkInServices.length === 0 && (
                    <p className="text-sm text-center py-8" style={{ color: "var(--text-tertiary)" }}>
                      {language === "es" ? "No se encontraron servicios" : "No services found"}
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── STEP 3: SLOT ── */}
            {step === "slot" && (
              <motion.div key="slot" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={16} style={{ color: "var(--accent-color)" }} />
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                    {language === "es" ? "Turno disponible" : "Available Slot"}
                  </p>
                </div>

                {loadingSlot ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent-color)" }} />
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {language === "es" ? "Buscando disponibilidad..." : "Finding availability..."}
                    </p>
                  </div>
                ) : bestSlot ? (
                  <div className="space-y-4">
                    {/* Slot card */}
                    <div className="p-5 rounded-2xl" style={{ background: "var(--bg-surface)", border: "1.5px solid var(--accent-color)" }}>
                      <div className="flex items-center gap-4 mb-4">
                        {bestSlot.avatarUrl ? (
                          <img loading="lazy" decoding="async" src={bestSlot.avatarUrl} alt={bestSlot.barberName} className="w-14 h-14 rounded-full object-cover" />
                        ) : (
                          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: `${getBarberColor(bestSlot.barberName)}25` }}>
                            <User size={24} style={{ color: getBarberColor(bestSlot.barberName) }} />
                          </div>
                        )}
                        <div>
                          <p className="text-base font-bold" style={{ color: "var(--text-primary)" }}>{bestSlot.barberName}</p>
                          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{selectedService?.name}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "var(--accent-dim)" }}>
                        <Clock size={16} style={{ color: "var(--accent-color)" }} />
                        <p className="text-sm font-bold" style={{ color: "var(--accent-color)" }}>
                          {format(bestSlot.datetime, "h:mm a", { locale: dateFnsLocale })}
                        </p>
                        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                          · {selectedService?.duration} min
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <button
                      onClick={handleConfirmSlot}
                      disabled={submitting}
                      className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
                      style={{ background: "var(--accent-color)", color: "#fff" }}
                    >
                      {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      {language === "es" ? "Confirmar turno" : "Confirm Slot"}
                    </button>

                    <button
                      onClick={() => setShowWaitlistConfirm(true)}
                      className="w-full py-3.5 rounded-2xl font-bold text-sm"
                      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                    >
                      {language === "es" ? "Prefiero esperar" : "I'd rather wait"}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "var(--accent-dim)" }}>
                      <Clock size={28} style={{ color: "var(--text-tertiary)" }} />
                    </div>
                    <p className="text-sm text-center font-medium" style={{ color: "var(--text-primary)" }}>
                      {language === "es" ? "No hay turnos disponibles hoy" : "No slots available today"}
                    </p>
                    <button
                      onClick={() => setShowWaitlistConfirm(true)}
                      className="py-3 px-6 rounded-2xl font-bold text-sm"
                      style={{ background: "var(--accent-color)", color: "#fff" }}
                    >
                      {language === "es" ? "Añadir a lista de espera" : "Add to Waitlist"}
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Success Popup */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", background: "rgba(0,0,0,0.25)" }}
            onClick={() => { setShowSuccess(false); navigate(backToCalendar(searchParams)); }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[340px] flex flex-col items-center gap-3 px-6 py-7"
              style={{ background: "#ffffff", borderRadius: 28, boxShadow: "0 24px 80px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.1)" }}
            >
              {/* Pill badge */}
              <span className="text-[11px] font-semibold tracking-wide uppercase"
                style={{ background: "rgba(201,168,130,0.15)", color: "rgba(160,128,96,1)", borderRadius: 10, padding: "4px 14px" }}>
                {language === "es" ? "Confirmación" : "Confirmation"}
              </span>

              {/* Animated checkmark */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: [0, 1.2, 1], rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 15, duration: 0.6 }}
                className="my-2"
              >
                <CheckCircle className="icon-bold" size={56} color="#22c55e" />
              </motion.div>

              {/* Title */}
              <motion.p
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="text-[22px] font-black text-center uppercase"
                style={{ color: "#111111", letterSpacing: "-1px" }}
              >
                Walk-In
              </motion.p>

              {/* Subtitle */}
              <p className="text-[13px] text-center" style={{ color: "rgba(0,0,0,0.45)" }}>
                {language === "es" ? "Cita creada exitosamente" : "Appointment created successfully"}
              </p>

              {/* Buttons */}
              <div className="w-full flex flex-col gap-3 mt-3">
                {createdApptId && (
                  <button
                    onClick={() => { setShowSuccess(false); navigate(`/admin/appointment/${createdApptId}`); }}
                    className="w-full py-3 font-semibold text-[13px] active:scale-[0.98] transition-transform"
                    style={{ background: "#111111", color: "#ffffff", borderRadius: "var(--radius-control)" }}
                  >
                    {language === "es" ? "Ir a Cobrar" : "Go to Payment"}
                  </button>
                )}
                <button
                  onClick={() => { setShowSuccess(false); navigate(backToCalendar(searchParams)); }}
                  className="w-full py-3 font-semibold text-[13px] active:scale-[0.98] transition-transform"
                  style={{ background: "transparent", color: "#111111", borderRadius: "var(--radius-control)", border: "1px solid rgba(0,0,0,0.1)" }}
                >
                  {language === "es" ? "Volver al Calendario" : "Back to Calendar"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Waitlist Confirmation Modal */}
      <AnimatePresence>
        {showWaitlistConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", background: "rgba(0,0,0,0.25)" }}
            onClick={() => !addingToWaitlist && setShowWaitlistConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[320px] flex flex-col items-center gap-3 px-6 py-7"
              style={{ background: "#ffffff", borderRadius: 28, boxShadow: "0 24px 80px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.1)" }}
            >
              <span className="text-[11px] font-semibold tracking-wide uppercase"
                style={{ background: "rgba(201,168,130,0.15)", color: "rgba(160,128,96,1)", borderRadius: 10, padding: "4px 14px" }}>
                {language === "es" ? "Lista de espera" : "Waitlist"}
              </span>

              <p className="text-[22px] font-black text-center"
                style={{ color: "#111111", letterSpacing: "-1px" }}>
                {firstName.trim() || "Walk-In"} {lastName.trim()}
              </p>

              <p className="text-[13px] text-center" style={{ color: "rgba(0,0,0,0.45)" }}>
                {selectedService?.name} · {selectedService?.duration} min
              </p>

              <p className="text-sm text-center mt-1" style={{ color: "var(--text-primary)" }}>
                {language === "es"
                  ? "¿Añadir este cliente a la lista de espera?"
                  : "Add this client to the waitlist?"}
              </p>

              <div className="w-full flex flex-col gap-3 mt-3">
                <button
                  onClick={handleRatherWait}
                  disabled={addingToWaitlist}
                  className="w-full py-3 font-semibold text-[13px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  style={{ background: "#111111", color: "#ffffff", borderRadius: "var(--radius-control)" }}
                >
                  {addingToWaitlist ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                  {language === "es" ? "Confirmar" : "Confirm"}
                </button>
                <button
                  onClick={() => setShowWaitlistConfirm(false)}
                  disabled={addingToWaitlist}
                  className="w-full py-3 font-semibold text-[13px] active:scale-[0.98] transition-transform"
                  style={{ background: "transparent", color: "#111111", borderRadius: "var(--radius-control)", border: "1px solid rgba(0,0,0,0.1)" }}
                >
                  {language === "es" ? "Cancelar" : "Cancel"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Waitlist Success Popup */}
      <AnimatePresence>
        {showWaitlistSuccess && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", background: "rgba(0,0,0,0.25)" }}
            onClick={() => { setShowWaitlistSuccess(false); navigate(backToCalendar(searchParams)); }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[320px] flex flex-col items-center gap-3 px-6 py-7"
              style={{ background: "#ffffff", borderRadius: 28, boxShadow: "0 24px 80px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.1)" }}
            >
              <span className="text-[11px] font-semibold tracking-wide uppercase"
                style={{ background: "rgba(201,168,130,0.15)", color: "rgba(160,128,96,1)", borderRadius: 10, padding: "4px 14px" }}>
                {language === "es" ? "Lista de espera" : "Waitlist"}
              </span>

              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: [0, 1.2, 1], rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 15, duration: 0.6 }}
                className="my-2"
              >
                <CheckCircle className="icon-bold" size={56} color="#22c55e" />
              </motion.div>

              <motion.p
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="text-[22px] font-black text-center"
                style={{ color: "#111111", letterSpacing: "-1px" }}
              >
                {firstName.trim() || "Walk-In"} {lastName.trim()}
              </motion.p>

              <p className="text-[13px] text-center" style={{ color: "rgba(0,0,0,0.45)" }}>
                {language === "es" ? "Añadido a la lista de espera" : "Added to waitlist"}
              </p>

              <div className="w-full flex flex-col gap-3 mt-3">
                <button
                  onClick={() => { setShowWaitlistSuccess(false); navigate("/admin/waitlist"); }}
                  className="w-full py-3 font-semibold text-[13px] active:scale-[0.98] transition-transform"
                  style={{ background: "#111111", color: "#ffffff", borderRadius: "var(--radius-control)" }}
                >
                  {language === "es" ? "Ver lista de espera" : "View Waitlist"}
                </button>
                <button
                  onClick={() => { setShowWaitlistSuccess(false); navigate(backToCalendar(searchParams)); }}
                  className="w-full py-3 font-semibold text-[13px] active:scale-[0.98] transition-transform"
                  style={{ background: "transparent", color: "#111111", borderRadius: "var(--radius-control)", border: "1px solid rgba(0,0,0,0.1)" }}
                >
                  {language === "es" ? "Volver al Calendario" : "Back to Calendar"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <ClientMatchConfirmDialog
        open={!!matchPrompt}
        match={matchPrompt}
        busy={matchChecking || submitting}
        onConfirm={() => {
          if (matchPrompt?.clientId) setSelectedClientId(matchPrompt.clientId);
          setMatchPrompt(null);
          setMatchAck(true);
          setTimeout(() => { handleConfirmSlot(); }, 0);
        }}
        onKeepSeparate={() => {
          setMatchPrompt(null);
          setMatchAck(true);
          setTimeout(() => { handleConfirmSlot(); }, 0);
        }}
      />
    </div>
  );
}
