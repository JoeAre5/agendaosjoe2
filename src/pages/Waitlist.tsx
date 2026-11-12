import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { backToCalendar } from "@/lib/navHelpers";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "sonner";
import {
  Clock,
  UserCheck,
  X,
  Loader2,
  ArrowLeft,
  AlertTriangle,
  Mail,
  CheckCircle,
} from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { formatDistanceToNow, format } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { motion, AnimatePresence } from "motion/react";

/* ─── types ─── */
interface WaitlistEntry {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  service_name: string;
  service_duration_minutes: number;
  status: string;
  requested_at: string;
  seated_at: string | null;
  cancelled_at: string | null;
  barber_id: string | null;
}

interface Barber {
  id: string;
  name: string;
  color: string | null;
  acuity_calendar_id: number | null;
  avatar_url: string | null;
}

function getBarberColor(barber: Barber | null, name?: string): string {
  if (barber?.color) return barber.color;
  return "var(--accent-color)";
}

type ModalStep = 1 | 2 | 3;

export default function Waitlist() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { language } = useTranslation();
  const dateFnsLocale = language === "es" ? es : enUS;

  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  /* ─── Modal state ─── */
  const [modalEntry, setModalEntry] = useState<WaitlistEntry | null>(null);
  const [modalStep, setModalStep] = useState<ModalStep>(1);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [seatedAtDatetime, setSeatedAtDatetime] = useState<string>("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  /* ─── Cancel confirmation modal state ─── */
  const [cancelEntry, setCancelEntry] = useState<WaitlistEntry | null>(null);
  const [cancelling, setCancelling] = useState(false);

  /* ─── Success animation state ─── */
  const [showSuccess, setShowSuccess] = useState(false);
  const [successData, setSuccessData] = useState<{ name: string; barber: string; acuitySkipped: boolean } | null>(null);

  const fetchEntries = useCallback(async () => {
    const { data, error } = await supabase
      .from("waitlist")
      .select("*")
      .eq("status", "waiting")
      .order("requested_at", { ascending: true });
    if (data) setEntries(data as WaitlistEntry[]);
    if (error) toast.error(error.message);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEntries();
    const channel = supabase
      .channel("waitlist-page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "waitlist" },
        () => fetchEntries(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchEntries]);

  /* ─── Open modal ─── */
  const openSeatModal = async (entry: WaitlistEntry) => {
    setModalEntry(entry);
    setModalStep(1);
    setSelectedBarber(null);
    setSeatedAtDatetime("");
    setEmail("");
    setEmailError("");
    setSubmitError("");
    setSubmitting(false);

    // Fetch barbers (exclude Yvette — she doesn't seat walk-ins)
    const { data } = await supabase
      .from("barbers_public")
      .select("id, name, color, acuity_calendar_id, avatar_url")
      .eq("is_active", true)
      .order("name");
    if (data) {
      const filtered = (data as Barber[]).filter(
        (b) => !b.name.toLowerCase().includes("yvette"),
      );
      setBarbers(filtered);
    }
  };

  /* ─── Close modal ─── */
  const closeModal = () => {
    // If email was entered, confirm dismiss
    if (email.trim() && modalStep >= 2) {
      if (
        !window.confirm(
          language === "es"
            ? "¿Seguro que deseas cerrar? Se perderá el email ingresado."
            : "Are you sure? The entered email will be lost.",
        )
      )
        return;
    }
    setModalEntry(null);
  };

  /* ─── Step navigation ─── */
  const goToStep2 = () => {
    if (!selectedBarber) return;
    setSeatedAtDatetime(new Date().toISOString());
    setModalStep(2);
  };

  const goToStep3 = () => {
    // Validate email if entered
    if (email.trim() && !email.includes("@")) {
      setEmailError("Email inválido");
    } else {
      setEmailError("");
    }
    setModalStep(3);
  };

  /* ─── Submit ─── */
  const handleConfirm = async () => {
    if (!modalEntry || !selectedBarber || submitting) return;
    setSubmitting(true);
    setSubmitError("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/seat-walkin`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            waitlist_id: modalEntry.id,
            barber_id: selectedBarber.id,
            email: email.trim() || null,
            seated_at_datetime: seatedAtDatetime,
          }),
        },
      );

      const data = await res.json();

      if (res.status === 409) {
        toast.info(
          language === "es"
            ? "Este cliente ya fue atendido"
            : "This client was already seated",
        );
        setModalEntry(null);
        return;
      }

      if (res.status === 502) {
        setSubmitError(
          `No se pudo crear la cita en Acuity: ${data.error || "Error desconocido"}`,
        );
        setSubmitting(false);
        return;
      }

      if (!res.ok) {
        setSubmitError(
          data.error || "Error inesperado. Intenta de nuevo.",
        );
        setSubmitting(false);
        return;
      }

      // Success — show animated popup, then auto-navigate to calendar
      const clientName = `${modalEntry.first_name}${modalEntry.last_name ? ` ${modalEntry.last_name}` : ""}`;
      setModalEntry(null);
      setSuccessData({
        name: clientName,
        barber: data.barber_name,
        acuitySkipped: !!data.acuity_skipped,
      });
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        navigate(backToCalendar(searchParams));
      }, 2000);
    } catch (err: any) {
      setSubmitError("Error inesperado. Intenta de nuevo.");
      setSubmitting(false);
    }
  };

  /* ─── Cancel entry (with confirmation) ─── */
  const handleCancelConfirmed = async () => {
    if (!cancelEntry || cancelling) return;
    setCancelling(true);

    const { data, error } = await supabase
      .from("waitlist")
      .update({
        status: "cancelled" as any,
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", cancelEntry.id)
      .eq("status", "waiting")
      .select("id");

    setCancelling(false);

    if (error) {
      toast.error(error.message);
      setCancelEntry(null);
      return;
    }

    if (!data || data.length === 0) {
      toast.info("Este cliente ya fue atendido o removido.");
    } else {
      const name = `${cancelEntry.first_name}${cancelEntry.last_name ? ` ${cancelEntry.last_name}` : ""}`;
      toast.success(`${name} fue removido de la lista.`);
    }
    setCancelEntry(null);
  };

  /* ─── Format time from ISO ─── */
  const formatTime12h = (iso: string) => {
    try {
      return format(new Date(iso), "h:mm a", { locale: dateFnsLocale });
    } catch {
      return "";
    }
  };

  const formatDateSpanish = () => {
    try {
      return format(new Date(), "EEEE d 'de' MMMM", { locale: es });
    } catch {
      return "";
    }
  };

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: "var(--bg-base)" }}
    >
      <SubpageHeader
        sticky
        title={language === "es" ? "Lista de Espera (En Tienda)" : "In-Shop Waitlist"}
        subtitle={`${entries.length} ${language === "es" ? "esperando" : "waiting"}`}
        onBack={() => navigate(-1)}
      />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2
            size={28}
            className="animate-spin"
            style={{ color: "var(--accent-color)" }}
          />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: "var(--accent-dim)" }}
          >
            <Clock
              size={28}
              style={{ color: "var(--text-tertiary)" }}
            />
          </div>
          <p
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {language === "es" ? "Nadie esperando" : "No one waiting"}
          </p>
          <p
            className="text-xs text-center"
            style={{ color: "var(--text-secondary)" }}
          >
            {language === "es"
              ? "Los clientes walk-in que prefieran esperar aparecerán aquí"
              : "Walk-in clients who prefer to wait will appear here"}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto px-4 pt-4 pb-24">
          <AnimatePresence>
            {entries.map((entry, idx) => (
              <motion.div
                key={entry.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ delay: idx * 0.05 }}
                className="mb-3 p-4 rounded-2xl"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p
                      className="text-sm font-bold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {entry.first_name} {entry.last_name || ""}
                    </p>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {entry.service_name} ·{" "}
                      {entry.service_duration_minutes} min
                    </p>
                    {entry.phone && (
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {entry.phone}
                      </p>
                    )}
                  </div>
                  <div
                    className="flex items-center gap-1 px-2 py-1 rounded-lg"
                    style={{ background: "var(--accent-dim)" }}
                  >
                    <Clock
                      size={12}
                      style={{ color: "var(--accent-color)" }}
                    />
                    <span
                      className="text-[11px] font-semibold"
                      style={{ color: "var(--accent-color)" }}
                    >
                      {formatDistanceToNow(
                        new Date(entry.requested_at),
                        { locale: dateFnsLocale, addSuffix: false },
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => openSeatModal(entry)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-semibold text-xs"
                    style={{
                      background: "var(--accent-color)",
                      color: "#fff",
                    }}
                  >
                    <UserCheck size={14} />
                    {language === "es" ? "Sentar" : "Seat"}
                  </button>
                  <button
                    onClick={() => setCancelEntry(entry)}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl font-semibold text-xs"
                    style={{
                      background: "var(--bg-base)",
                      border: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ─── SEAT MODAL ─── */}
      <AnimatePresence>
        {modalEntry && (
          <motion.div
            key="seat-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backdropFilter: "blur(8px)", background: "rgba(0,0,0,0.25)" }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-sm rounded-[28px] overflow-hidden"
              style={{
                background: "#ffffff",
                boxShadow: "0 25px 60px -12px rgba(0,0,0,0.25)",
              }}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                {modalStep > 1 ? (
                  <button
                    onClick={() => setModalStep((s) => (s - 1) as ModalStep)}
                    className="p-1"
                    disabled={submitting}
                  >
                    <ArrowLeft size={20} style={{ color: "#111" }} />
                  </button>
                ) : (
                  <div className="w-7" />
                )}
                <div
                  className="px-3 py-1 rounded-[10px] text-[11px] font-semibold"
                  style={{
                    background: "rgba(201,168,130,0.15)",
                    color: "rgba(160,128,96,1)",
                  }}
                >
                  {modalStep === 1
                    ? "Barbero"
                    : modalStep === 2
                      ? "Email"
                      : "Resumen"}
                </div>
                <button onClick={closeModal} className="p-1" disabled={submitting}>
                  <X size={20} style={{ color: "#111" }} />
                </button>
              </div>

              {/* Client name title */}
              <div className="text-center px-5 pb-1">
                <h2
                  className="text-[22px] font-black tracking-tight"
                  style={{ color: "#111", letterSpacing: "-1px" }}
                >
                  {modalEntry.first_name} {modalEntry.last_name || ""}
                </h2>
                <p className="text-[13px] mt-0.5" style={{ color: "rgba(0,0,0,0.45)" }}>
                  {modalEntry.service_name} · {modalEntry.service_duration_minutes} min
                </p>
              </div>

              <div className="px-5 pb-5 pt-3">
                <AnimatePresence mode="wait">
                  {/* ── STEP 1: BARBER SELECTOR ── */}
                  {modalStep === 1 && (
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                    >
                      <p
                        className="text-xs font-semibold uppercase tracking-wider mb-3"
                        style={{ color: "rgba(0,0,0,0.4)" }}
                      >
                        ¿Quién va a atender?
                      </p>
                      <div className="space-y-2 max-h-[240px] overflow-auto">
                        {barbers.map((b) => {
                          const bColor = getBarberColor(b);
                          const isSelected = selectedBarber?.id === b.id;
                          const noCalendar = !b.acuity_calendar_id;
                          return (
                            <button
                              key={b.id}
                              onClick={() => setSelectedBarber(b)}
                              className="w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all"
                              style={{
                                background: isSelected
                                  ? "rgba(201,168,130,0.12)"
                                  : "rgba(0,0,0,0.03)",
                                border: isSelected
                                  ? `2px solid ${bColor}`
                                  : "2px solid transparent",
                              }}
                            >
                              {b.avatar_url ? (
                                <img loading="lazy" decoding="async"
                                  src={b.avatar_url}
                                  alt={b.name}
                                  className="w-10 h-10 rounded-full object-cover shrink-0"
                                />
                              ) : (
                                <div
                                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                                  style={{ background: bColor }}
                                >
                                  {b.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p
                                  className="text-sm font-bold truncate"
                                  style={{ color: "#111" }}
                                >
                                  {b.name}
                                </p>
                                {noCalendar && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <AlertTriangle size={10} style={{ color: "#d97706" }} />
                                    <span
                                      className="text-[10px] font-medium"
                                      style={{ color: "#d97706" }}
                                    >
                                      Sin calendario Acuity
                                    </span>
                                  </div>
                                )}
                              </div>
                              {isSelected && (
                                <CheckCircle
                                  size={20}
                                  style={{ color: bColor }}
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        onClick={goToStep2}
                        disabled={!selectedBarber}
                        className="w-full mt-4 py-3 rounded-xl text-[13px] font-bold transition-opacity"
                        style={{
                          background: selectedBarber
                            ? "#111"
                            : "rgba(0,0,0,0.1)",
                          color: selectedBarber
                            ? "#fff"
                            : "rgba(0,0,0,0.3)",
                        }}
                      >
                        Continuar
                      </button>
                    </motion.div>
                  )}

                  {/* ── STEP 2: EMAIL ── */}
                  {modalStep === 2 && selectedBarber && (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                    >
                      <p
                        className="text-xs font-semibold uppercase tracking-wider mb-3"
                        style={{ color: "rgba(0,0,0,0.4)" }}
                      >
                        Confirmar cita de {modalEntry.first_name}
                      </p>

                      {/* Summary */}
                      <div
                        className="p-3 rounded-2xl mb-4 space-y-2"
                        style={{ background: "rgba(0,0,0,0.03)" }}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{
                              background: getBarberColor(selectedBarber),
                            }}
                          />
                          <span
                            className="text-xs font-semibold"
                            style={{ color: "#111" }}
                          >
                            {selectedBarber.name}
                          </span>
                        </div>
                        <p className="text-xs" style={{ color: "rgba(0,0,0,0.5)" }}>
                          {modalEntry.service_name} ·{" "}
                          {modalEntry.service_duration_minutes} min
                        </p>
                        <p className="text-xs" style={{ color: "rgba(0,0,0,0.5)" }}>
                          Hoy a las {formatTime12h(seatedAtDatetime)}
                        </p>
                      </div>

                      {/* Email input */}
                      <div className="mb-1">
                        <label
                          className="text-xs font-medium mb-1 block"
                          style={{ color: "rgba(0,0,0,0.5)" }}
                        >
                          <Mail
                            size={12}
                            className="inline mr-1"
                            style={{ color: "rgba(0,0,0,0.3)" }}
                          />
                          Email (opcional)
                        </label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            setEmailError("");
                          }}
                          placeholder="cliente@email.com"
                          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                          style={{
                            background: "rgba(0,0,0,0.03)",
                            border: "1px solid var(--border)",
                            color: "#111",
                          }}
                        />
                        {emailError && (
                          <p
                            className="text-[11px] mt-1 font-medium"
                            style={{ color: "#ef4444" }}
                          >
                            {emailError}
                          </p>
                        )}
                        <p
                          className="text-[11px] mt-1"
                          style={{ color: "rgba(0,0,0,0.35)" }}
                        >
                          El cliente recibirá una confirmación por email.
                        </p>
                      </div>

                      <button
                        onClick={goToStep3}
                        className="w-full mt-4 py-3 rounded-xl text-[13px] font-bold"
                        style={{ background: "#111", color: "#fff" }}
                      >
                        Ver Resumen
                      </button>
                    </motion.div>
                  )}

                  {/* ── STEP 3: SUMMARY + CONFIRM ── */}
                  {modalStep === 3 && selectedBarber && (
                    <motion.div
                      key="step3"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                    >
                      <div
                        className="p-4 rounded-2xl mb-4 space-y-2.5"
                        style={{ background: "rgba(0,0,0,0.03)" }}
                      >
                        <div className="flex justify-between items-center">
                          <span
                            className="text-[11px] uppercase font-semibold"
                            style={{ color: "rgba(0,0,0,0.35)" }}
                          >
                            Cliente
                          </span>
                          <span
                            className="text-[13px] font-bold"
                            style={{ color: "#111" }}
                          >
                            {modalEntry.first_name}{" "}
                            {modalEntry.last_name || ""}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span
                            className="text-[11px] uppercase font-semibold"
                            style={{ color: "rgba(0,0,0,0.35)" }}
                          >
                            Servicio
                          </span>
                          <span
                            className="text-[13px] font-medium"
                            style={{ color: "#111" }}
                          >
                            {modalEntry.service_name}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span
                            className="text-[11px] uppercase font-semibold"
                            style={{ color: "rgba(0,0,0,0.35)" }}
                          >
                            Duración
                          </span>
                          <span
                            className="text-[13px] font-medium"
                            style={{ color: "#111" }}
                          >
                            {modalEntry.service_duration_minutes} min
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span
                            className="text-[11px] uppercase font-semibold"
                            style={{ color: "rgba(0,0,0,0.35)" }}
                          >
                            Barbero
                          </span>
                          <div className="flex items-center gap-1.5">
                            <div
                              className="w-2.5 h-2.5 rounded-full"
                              style={{
                                background: getBarberColor(selectedBarber),
                              }}
                            />
                            <span
                              className="text-[13px] font-bold"
                              style={{ color: "#111" }}
                            >
                              {selectedBarber.name}
                            </span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span
                            className="text-[11px] uppercase font-semibold"
                            style={{ color: "rgba(0,0,0,0.35)" }}
                          >
                            Fecha
                          </span>
                          <span
                            className="text-[13px] font-medium capitalize"
                            style={{ color: "#111" }}
                          >
                            {formatDateSpanish()}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span
                            className="text-[11px] uppercase font-semibold"
                            style={{ color: "rgba(0,0,0,0.35)" }}
                          >
                            Hora
                          </span>
                          <span
                            className="text-[13px] font-medium"
                            style={{ color: "#111" }}
                          >
                            {formatTime12h(seatedAtDatetime)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span
                            className="text-[11px] uppercase font-semibold"
                            style={{ color: "rgba(0,0,0,0.35)" }}
                          >
                            Email
                          </span>
                          <span
                            className="text-[13px] font-medium"
                            style={{
                              color: email.trim()
                                ? "#111"
                                : "rgba(0,0,0,0.3)",
                            }}
                          >
                            {email.trim() || "Sin email"}
                          </span>
                        </div>
                      </div>

                      {!selectedBarber.acuity_calendar_id && (
                        <div
                          className="flex items-start gap-2 p-3 rounded-xl mb-3"
                          style={{ background: "rgba(217,119,6,0.08)" }}
                        >
                          <AlertTriangle
                            size={14}
                            className="shrink-0 mt-0.5"
                            style={{ color: "#d97706" }}
                          />
                          <p
                            className="text-[11px]"
                            style={{ color: "#92400e" }}
                          >
                            Este barbero no tiene calendario Acuity. La cita
                            se registrará localmente y quedará pendiente de
                            sincronización.
                          </p>
                        </div>
                      )}

                      <button
                        onClick={handleConfirm}
                        disabled={submitting}
                        className="w-full py-3 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 transition-opacity"
                        style={{
                          background: "var(--accent-color, #c9a882)",
                          color: "#fff",
                          opacity: submitting ? 0.6 : 1,
                        }}
                      >
                        {submitting ? (
                          <>
                            <Loader2
                              size={14}
                              className="animate-spin"
                            />
                            Confirmando…
                          </>
                        ) : (
                          "Confirmar Cita"
                        )}
                      </button>

                      {submitError && (
                        <p
                          className="text-[11px] mt-2 text-center font-medium"
                          style={{ color: "#ef4444" }}
                        >
                          {submitError}
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── SUCCESS ANIMATION POPUP ─── */}
      <AnimatePresence>
        {showSuccess && successData && (
          <motion.div
            key="success-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", background: "rgba(0,0,0,0.25)" }}
            onClick={() => setShowSuccess(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[340px] flex flex-col items-center gap-3 px-6 py-7"
              style={{ background: "#ffffff", borderRadius: 28, boxShadow: "0 24px 80px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.1)" }}
            >
              {/* Pill badge */}
              <span
                className="text-[11px] font-semibold tracking-wide uppercase"
                style={{ background: "rgba(201,168,130,0.15)", color: "rgba(160,128,96,1)", borderRadius: 10, padding: "4px 14px" }}
              >
                Confirmación
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
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-[22px] font-black text-center"
                style={{ color: "#111111", letterSpacing: "-1px" }}
              >
                {successData.name}
              </motion.p>

              {/* Subtitle */}
              <p className="text-[13px] text-center" style={{ color: "rgba(0,0,0,0.45)" }}>
                {successData.acuitySkipped
                  ? `Cita registrada con ${successData.barber} — pendiente de sincronizar con Acuity`
                  : `Cita confirmada con ${successData.barber}`}
              </p>

              {/* Close button */}
              <button
                onClick={() => { setShowSuccess(false); navigate(backToCalendar(searchParams)); }}
                className="w-full mt-3 py-3 font-semibold text-[13px] active:scale-[0.98] transition-transform"
                style={{ background: "#111111", color: "#ffffff", borderRadius: "var(--radius-control)" }}
              >
                Ir al Calendario
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {cancelEntry && (
          <motion.div
            key="cancel-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backdropFilter: "blur(8px)", background: "rgba(0,0,0,0.25)" }}
            onClick={() => !cancelling && setCancelEntry(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded-[28px] overflow-hidden"
              style={{
                maxWidth: "320px",
                background: "#ffffff",
                boxShadow: "0 25px 60px -12px rgba(0,0,0,0.25)",
              }}
            >
              {/* Header pill */}
              <div className="flex justify-center pt-5 pb-2">
                <div
                  className="px-3 py-1 rounded-[10px] text-[11px] font-semibold"
                  style={{
                    background: "rgba(201,168,130,0.15)",
                    color: "rgba(160,128,96,1)",
                  }}
                >
                  Confirmar
                </div>
              </div>

              {/* Client name */}
              <div className="text-center px-5 pb-1">
                <h2
                  className="text-[22px] font-black tracking-tight"
                  style={{ color: "#111", letterSpacing: "-1px" }}
                >
                  {cancelEntry.first_name} {cancelEntry.last_name || ""}
                </h2>
              </div>

              {/* Body */}
              <p
                className="text-[13px] text-center px-6 pt-2 pb-5"
                style={{ color: "rgba(0,0,0,0.45)" }}
              >
                ¿Confirmas que el cliente se fue?
              </p>

              {/* Buttons */}
              <div className="px-5 pb-5 space-y-2">
                <button
                  onClick={handleCancelConfirmed}
                  disabled={cancelling}
                  className="w-full py-3 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 transition-opacity"
                  style={{
                    background: "#ef4444",
                    color: "#fff",
                    opacity: cancelling ? 0.6 : 1,
                  }}
                >
                  {cancelling ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Removiendo…
                    </>
                  ) : (
                    "El cliente se fue"
                  )}
                </button>
                <button
                  onClick={() => setCancelEntry(null)}
                  disabled={cancelling}
                  className="w-full py-3 rounded-xl text-[13px] font-bold"
                  style={{
                    background: "transparent",
                    color: "rgba(0,0,0,0.45)",
                  }}
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
