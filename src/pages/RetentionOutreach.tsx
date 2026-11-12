import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, Copy, Loader2, MessageCircle, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { SubpageHeader } from "@/components/SubpageHeader";
import { HomePeriodBanner } from "@/components/reports/HomePeriodBanner";
import { OutreachProfileDialog } from "@/components/reports/OutreachProfileDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useHomePeriod } from "@/hooks/useHomePeriod";
import { usePreferences } from "@/hooks/usePreferences";
import { useOutreachData } from "@/hooks/useOutreachData";
import { firstNameOf, outreachState, suggestedMessage, whatsappUrl, type ClientOutreachState, type PendingClient } from "@/lib/outreach";

type Filter = "all" | "ambiguous" | string;

const fmtTime = (d: Date, es: boolean) =>
  d.toLocaleString(es ? "es-PR" : "en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Puerto_Rico" });

export default function RetentionOutreach() {
  const navigate = useNavigate();
  const { isOwner } = useAuth();
  const { language } = usePreferences();
  const es = language === "es";
  const selection = useHomePeriod();
  const data = useOutreachData(selection);
  const [filter, setFilter] = useState<Filter>("all");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [event, setEvent] = useState(() => localStorage.getItem("outreach_event") ?? "Acción de Gracias");
  const changeEvent = (v: string) => { setEvent(v); localStorage.setItem("outreach_event", v); };
  const barberName = useMemo(() => new Map(data.barbers.map((b) => [b.id, b.name])), [data.barbers]);

  const rows = useMemo(() => data.pending
    .map((p) => ({ p, aff: data.affinity.get(p.history.clientId) ?? null, state: outreachState(p.history.clientId, data.copies, data.credits, data.now) }))
    .filter(({ aff }) => filter === "all" || (filter === "ambiguous" ? aff === null : aff === filter)),
  [data.pending, data.affinity, data.copies, data.credits, data.now, filter]);

  // Reactivated clients are no longer pending (they have a future booking); list credits separately.
  const activeCopies = rows.filter((r) => r.state.stage === "copied").length;

  const filterTabs = [
    { id: "all", label: es ? "Todos" : "All" },
    ...data.barbers.filter((b) => [...data.affinity.values()].includes(b.id)).map((b) => ({ id: b.id, label: b.name.split(" ")[0] })),
    { id: "ambiguous", label: es ? "Ambiguos" : "Ambiguous" },
  ];

  const teamActivity = useMemo(() => {
    const m = new Map<string, { name: string; copies: number; credits: number }>();
    for (const c of data.copies) {
      const e = m.get(c.actor_user_id) ?? { name: c.actor_name, copies: 0, credits: 0 };
      e.copies++; m.set(c.actor_user_id, e);
    }
    for (const c of data.credits) {
      const e = m.get(c.actor_user_id) ?? { name: c.actor_name, copies: 0, credits: 0 };
      e.credits++; m.set(c.actor_user_id, e);
    }
    return [...m.values()];
  }, [data.copies, data.credits]);

  return (
    <div className="min-h-screen pb-24" style={{ background: "var(--bg-base)" }}>
      <div className="sticky top-0 z-30" style={{ background: "var(--bg-base)" }}>
        <SubpageHeader title={es ? "Reactivación" : "Reactivation"} onBack={() => navigate(isOwner ? `/admin?${new URLSearchParams({ homePeriod: selection.period, homeDate: ymd(selection.date) })}` : "/admin?tab=menu")} />
        <HomePeriodBanner selection={selection} es={es} spacious />
      </div>

      <div className="px-4 pt-6 max-w-[560px] mx-auto">
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Metric label={es ? "Pendientes" : "Pending"} value={rows.length} />
          <Metric label={es ? "Copiados (72h)" : "Copied (72h)"} value={activeCopies} />
          <Metric label={es ? "Reactivados" : "Reactivated"} value={data.credits.length} green />
        </div>

        <label className="mb-6 block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{es ? "Fecha especial o evento" : "Holiday or event"}</span>
          <Input value={event} onChange={(e) => changeEvent(e.target.value)} maxLength={60} placeholder="Acción de Gracias" />
        </label>

        {isOwner && filterTabs.length > 2 && (
          <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-1" role="group" aria-label={es ? "Filtrar por afinidad" : "Filter by affinity"}>
            {filterTabs.map((tab) => (
              <Button key={tab.id} type="button" variant="ghost" aria-pressed={filter === tab.id}
                onClick={() => setFilter(tab.id)}
                className={`h-11 rounded-none bg-transparent px-0 text-sm font-semibold shadow-none hover:bg-transparent focus-visible:ring-ring ${filter === tab.id ? "text-[var(--accent-color)] hover:text-[var(--accent-color)]" : "text-muted-foreground hover:text-[var(--accent-color)]"}`}>
                {tab.label}
              </Button>
            ))}
          </div>
        )}

        {data.loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin" style={{ color: "var(--accent-color)" }} /></div>
        ) : data.error ? (
          <p className="text-sm text-muted-foreground text-center py-10">{es ? "No se pudo cargar. Intenta de nuevo." : "Could not load. Try again."}</p>
        ) : (
          <>
            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-10">{es ? "No hay clientes pendientes en este período." : "No pending clients in this period."}</p>
            )}
            <div className="space-y-5">
              {rows.map(({ p, aff, state }) => (
                <ClientCard key={`${p.history.clientId}:${event}`} pending={p} state={state} es={es} event={event}
                  barberName={aff ? barberName.get(aff) ?? null : null} ambiguous={aff === null}
                  onCopied={data.refresh} onViewProfile={() => setProfileId(p.history.clientId)} />
              ))}
            </div>

            {data.credits.length > 0 && (
              <section className="mt-6">
                <h2 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>{es ? "Reactivados en el período" : "Reactivated this period"}</h2>
                <div className="rounded-xl card-elevated divide-y divide-border">
                  {data.credits.map((c) => (
                    <div key={c.appointment_id} className="px-4 py-3 text-sm flex justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <p className="font-semibold text-foreground break-words">{data.clientNames.get(c.client_id) ?? (es ? "Cliente" : "Client")}</p>
                          <ProfilePill es={es} name={data.clientNames.get(c.client_id) ?? ""} onClick={() => setProfileId(c.client_id)} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {es ? "Copió" : "Copied by"} {c.actor_name} · {es ? "cita con" : "booked with"} {barberName.get(c.appointment_barber_id) ?? "-"}
                        </p>
                      </div>
                      <span className="text-xs font-semibold whitespace-nowrap" style={{ color: "var(--green)" }}>{fmtTime(new Date(c.appointment_starts_at), es)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {isOwner && teamActivity.length > 0 && (
              <section className="mt-6">
                <h2 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>{es ? "Actividad del equipo" : "Team activity"}</h2>
                <div className="rounded-xl card-elevated divide-y divide-border">
                  {teamActivity.map((t) => (
                    <div key={t.name} className="px-4 py-3 text-sm flex justify-between">
                      <span className="text-foreground font-semibold">{t.name}</span>
                      <span className="text-xs text-muted-foreground">{t.copies} {es ? "copias" : "copies"} · <span style={{ color: "var(--green)" }}>{t.credits} {es ? "reactivados" : "reactivated"}</span></span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <p className="text-[11px] text-muted-foreground mt-6">
              {es
                ? "Copiar no significa enviado. Solo una cita nueva válida creada dentro de 72 horas de la última copia cuenta como reactivación; si se cancela, el crédito se anula."
                : "Copying does not mean sent. Only a valid new booking created within 72 hours of the latest copy counts; a cancellation voids the credit."}
            </p>
          </>
        )}
      </div>
      {profileId && <OutreachProfileDialog key={profileId} clientId={profileId} es={es} barbers={data.barbers} onClose={() => setProfileId(null)} />}
    </div>
  );
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Metric({ label, value, green }: { label: string; value: number; green?: boolean }) {
  return (
    <div className="rounded-xl card-elevated px-3 py-3 text-center">
      <p className="text-xl font-black" style={{ color: green && value > 0 ? "var(--green)" : "var(--text-primary)" }}>{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>{label}</p>
    </div>
  );
}

const STAGES = ["pending", "copied", "reactivated"] as const;

const fmtDay = (d: Date, es: boolean) =>
  d.toLocaleDateString(es ? "es-PR" : "en-US", { day: "numeric", month: "long", timeZone: "America/Puerto_Rico" });

function ProfilePill({ es, name, onClick }: { es: boolean; name: string; onClick: () => void }) {
  return <Button type="button" variant="outline" onClick={onClick}
    aria-label={`${es ? "Ver perfil de" : "View profile of"} ${name}`}
    className="h-7 shrink-0 rounded-full px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-transparent hover:text-muted-foreground">
    {es ? "Ver perfil" : "View profile"}
  </Button>;
}

function ClientCard({ pending, state, es, event, barberName, ambiguous, onCopied, onViewProfile }: {
  pending: PendingClient; state: ClientOutreachState; es: boolean; event: string; barberName: string | null; ambiguous: boolean; onCopied: () => void; onViewProfile: () => void;
}) {
  const h = pending.history;
  const reduce = useReducedMotion();
  const [text, setText] = useState(() => suggestedMessage(firstNameOf(h.clientName), event));
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState(false);
  const wa = whatsappUrl(pending.phone, text);
  const stageIdx = STAGES.indexOf(state.stage);
  const labels = es ? ["Pendiente", "Mensaje copiado", "Reactivado"] : ["Pending", "Message copied", "Reactivated"];
  const late = Math.max(0, h.daysFromExpected);
  const reveal = reduce ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.18 } };

  const record = async (action: "copy" | "whatsapp") => {
    setBusy(true);
    try {
      if (action === "copy") await navigator.clipboard.writeText(text);
      const { data, error } = await supabase.rpc("record_outreach_copy", { p_client_id: h.clientId, p_action: action });
      if (error) throw error;
      const prev = (data as { previous_actor_name: string | null; previous_copied_at: string | null }[] | null)?.[0];
      toast.success(es ? "Mensaje copiado. Ventana de 72 horas iniciada." : "Message copied. 72-hour window started.", {
        description: prev?.previous_actor_name && prev.previous_copied_at
          ? `${es ? "Copia anterior" : "Previous copy"}: ${prev.previous_actor_name}, ${fmtTime(new Date(prev.previous_copied_at), es)}` : undefined,
      });
      onCopied();
    } catch {
      toast.error(es ? "No se pudo registrar la copia." : "Could not record the copy.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.article {...(reduce ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } })} className="rounded-2xl card-elevated p-5">
      <header className="space-y-3">
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-lg leading-relaxed font-semibold text-foreground break-words">{h.clientName}</p>
          <ProfilePill es={es} name={h.clientName} onClick={onViewProfile} />
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{ambiguous ? (es ? "Afinidad ambigua" : "Ambiguous affinity") : barberName}</p>
      </header>

      <dl className="mt-6 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm leading-relaxed">
        <dt className="text-muted-foreground">{es ? "Última visita" : "Last visit"}</dt>
        <dd className="text-right text-foreground break-words">{h.lastVisit ? fmtDay(h.lastVisit, es) : "-"}</dd>
        <dt className="text-muted-foreground">{es ? "Retraso" : "Overdue"}</dt>
        <dd className="text-right text-foreground">{late} {es ? (late === 1 ? "día" : "días") : (late === 1 ? "day" : "days")}</dd>
      </dl>

      <div className="mt-6">
        <Button type="button" variant="ghost" onClick={() => setDetails((v) => !v)} aria-expanded={details}
          className="min-h-11 h-auto w-full justify-between rounded-none px-0 py-3 text-sm text-muted-foreground whitespace-normal hover:bg-transparent hover:text-muted-foreground">
          {es ? "Detalles de tendencia" : "Trend details"}
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${details ? "rotate-180" : ""}`} />
        </Button>
        <AnimatePresence initial={false}>
          {details && (
            <motion.p {...reveal} className="pt-2 pb-3 text-sm leading-relaxed text-muted-foreground">
              {es ? "Tendencia" : "Trend"}: {es ? "cada" : "every"} {Math.round(h.cadence)} {es ? "días" : "days"} · {h.lifetimeVisits} {es ? "visitas" : "visits"}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence initial={false}>
        {editing && (
          <motion.div {...reveal} className="mt-6">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6}
              className="text-base leading-relaxed min-h-48" aria-label={es ? "Mensaje sugerido" : "Suggested message"} />
            <p className="text-xs text-muted-foreground mt-2">{es ? "Revisa y edita antes de enviar. Nada se envía solo." : "Review and edit before sending. Nothing is sent automatically."}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-6 pt-5 border-t border-border space-y-4">
        <Button type="button" variant="outline" className="w-full min-h-12 h-auto py-3 justify-center whitespace-normal text-center hover:bg-background hover:text-foreground" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
          <PencilLine className="h-4 w-4" />
          {editing ? (es ? "Ocultar mensaje" : "Hide message") : (es ? "Ver y editar mensaje" : "View and edit message")}
        </Button>
        <div className={`grid gap-3 ${wa ? "grid-cols-2" : "grid-cols-1"}`}>
          <Button type="button" className="min-h-12 h-auto py-3 px-3 whitespace-normal text-center hover:bg-primary hover:text-primary-foreground" disabled={busy || !text.trim()} onClick={() => record("copy")}>
            {state.stage === "copied" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {state.stage === "copied" ? (es ? "Copiar de nuevo" : "Copy again") : (es ? "Copiar" : "Copy")}
          </Button>
          {wa && (
            <Button variant="outline" className="min-h-12 h-auto py-3 px-3 whitespace-normal text-center hover:bg-background hover:text-foreground" asChild>
              <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => { void record("whatsapp"); }}>
                <MessageCircle className="h-4 w-4" />WhatsApp
              </a>
            </Button>
          )}
        </div>
      </div>
      <section className="mt-6 pt-5 border-t border-border" aria-label={es ? "Estado de reactivación" : "Reactivation status"}>
        <p className="text-xs font-semibold text-muted-foreground mb-4">{es ? "Estado actual" : "Current status"}</p>
        <ol className="space-y-0">
          {STAGES.map((stage, i) => (
            <li key={stage} className="relative flex gap-4 min-h-12 pb-4 last:pb-0" aria-current={i === stageIdx ? "step" : undefined}>
              {i < 2 && <span aria-hidden="true" className="absolute left-[5px] top-3 bottom-0 w-px bg-border" />}
              <span aria-hidden="true" className="relative mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: i <= stageIdx ? (i === 2 ? "var(--green)" : "var(--accent-color)") : "var(--bg-surface-2)" }} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className={`text-sm leading-relaxed ${i === stageIdx ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{labels[i]}</p>
                  {i === stageIdx && <span className="text-xs font-semibold" style={{ color: state.stage === "reactivated" ? "var(--green)" : "var(--accent-color)" }}>{es ? "Actual" : "Current"}</span>}
                </div>
                {i === 1 && state.lastCopy && (
                  <div className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground">
                    <p>{es ? "Copió" : "Copied by"} <span className="text-foreground">{state.lastCopy.actor_name}</span> · {fmtTime(new Date(state.lastCopy.copied_at), es)}</p>
                    {state.stage === "copied" && state.windowEndsAt && <p>{es ? "Ventana hasta" : "Window until"} {fmtTime(state.windowEndsAt, es)}</p>}
                  </div>
                )}
                {i === 2 && state.credit && <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--green)" }}>{es ? "Cita nueva" : "New booking"} {fmtTime(new Date(state.credit.appointment_starts_at), es)} · {state.credit.actor_name}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>

    </motion.article>
  );
}
