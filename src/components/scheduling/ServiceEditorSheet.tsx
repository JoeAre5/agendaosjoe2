// Native scheduler (Phase B7): create / edit services and add-ons directly in
// this database. Only shown for shops whose booking_provider is `native`;
// Acuity shops keep syncing their catalogue from Acuity.
//
// Writes go through the browser client under RLS ("Owner full access");
// shop_id is stamped server-side by the a00_resolve_shop_context trigger.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export interface EditorBarber {
  id: string;
  name: string;
}

export interface EditableService {
  id?: string;
  name: string;
  description: string | null;
  category: string | null;
  duration_minutes: number;
  price_cents: number;
  padding_before_minutes?: number | null;
  padding_after_minutes?: number | null;
  barber_id: string | null;
  is_public: boolean;
}

export interface EditableAddon {
  id?: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
  barber_id: string | null;
}

type Lang = "es" | "en";
const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const t = (language: Lang, es: string, en: string) => (language === "es" ? es : en);

function BarberSelect({
  language,
  barbers,
  value,
  onChange,
}: {
  language: Lang;
  barbers: EditorBarber[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full h-10 rounded-md border px-3 text-sm"
      style={{ background: "var(--bg-elevated, transparent)", color: "var(--text-primary)", borderColor: "var(--border-color, #444)" }}
    >
      <option value="">{t(language, "Todos los barberos", "All barbers")}</option>
      {barbers.map((b) => (
        <option key={b.id} value={b.id}>{b.name}</option>
      ))}
    </select>
  );
}

const num = (v: string, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/* ─────────────────────────────── Service ─────────────────────────────── */
export function ServiceEditorSheet({
  open,
  onOpenChange,
  language,
  barbers,
  service,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  language: Lang;
  barbers: EditorBarber[];
  /** null → create */
  service: EditableService | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("30");
  const [price, setPrice] = useState("25.00");
  const [padBefore, setPadBefore] = useState("0");
  const [padAfter, setPadAfter] = useState("0");
  const [barberId, setBarberId] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);
  // Horario propio: una ventana (inicio-fin) en los dias marcados. Sin activarlo, vale el horario normal.
  const [ownHours, setOwnHours] = useState(false);
  const [ownStart, setOwnStart] = useState("07:00");
  const [ownEnd, setOwnEnd] = useState("19:00");
  const [ownDays, setOwnDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);

  useEffect(() => {
    if (!open) return;
    setOwnHours(false);
    setOwnStart("07:00");
    setOwnEnd("19:00");
    setOwnDays([1, 2, 3, 4, 5, 6]);
    if (service?.id) {
      void supabase
        .from("service_hours")
        .select("day_of_week,start_time,end_time")
        .eq("service_id", service.id)
        .eq("is_active", true)
        .then(({ data }) => {
          if (!data || data.length === 0) return;
          setOwnHours(true);
          setOwnStart(String(data[0].start_time).slice(0, 5));
          setOwnEnd(String(data[0].end_time).slice(0, 5));
          setOwnDays(data.map((r) => r.day_of_week));
        });
    }
    setName(service?.name ?? "");
    setCategory(service?.category ?? "");
    setDescription(service?.description ?? "");
    setDuration(String(service?.duration_minutes ?? 30));
    setPrice(((service?.price_cents ?? 2500) / 100).toFixed(2));
    setPadBefore(String(service?.padding_before_minutes ?? 0));
    setPadAfter(String(service?.padding_after_minutes ?? 0));
    setBarberId(service?.barber_id ?? null);
    setIsPublic(service?.is_public ?? true);
  }, [open, service]);

  const save = async () => {
    const dur = Math.round(num(duration));
    const cents = Math.round(num(price) * 100);
    if (!name.trim() || dur <= 0 || cents < 0) {
      toast.error(t(language, "Nombre, duración y precio son obligatorios", "Name, duration and price are required"));
      return;
    }
    if (ownHours && (ownDays.length === 0 || ownEnd <= ownStart)) {
      toast.error(t(language, "Horario propio: elige dias y una hora de fin posterior al inicio", "Own hours: pick days and an end time after the start"));
      return;
    }
    setSaving(true);
    const row = {
      name: name.trim(),
      category: category.trim() || null,
      description: description.trim() || null,
      duration_minutes: dur,
      price_cents: cents,
      padding_before_minutes: Math.max(0, Math.round(num(padBefore))),
      padding_after_minutes: Math.max(0, Math.round(num(padAfter))),
      barber_id: barberId,
      is_public: isPublic,
      is_active: true,
      locally_edited: true,
    };
    const { data: saved, error } = service?.id
      ? await supabase.from("services").update(row).eq("id", service.id).select("id").single()
      : await supabase.from("services").insert(row).select("id").single();
    if (error || !saved) {
      setSaving(false);
      toast.error(t(language, "No se pudo guardar el servicio", "Could not save the service") + `: ${error?.message ?? ""}`);
      return;
    }
    // Horario propio: se reemplazan las filas del servicio por las marcadas (o ninguna).
    const del = await supabase.from("service_hours").delete().eq("service_id", saved.id);
    let hoursError = del.error;
    if (!hoursError && ownHours) {
      const ins = await supabase.from("service_hours").insert(
        ownDays.map((d) => ({ service_id: saved.id, day_of_week: d, start_time: ownStart, end_time: ownEnd, is_active: true })),
      );
      hoursError = ins.error;
    }
    setSaving(false);
    if (hoursError) {
      toast.error(t(language, "El servicio se guardo, pero no su horario propio", "Service saved, but not its own hours") + `: ${hoursError.message}`);
      onSaved();
      return;
    }
    toast.success(service?.id ? t(language, "Servicio actualizado", "Service updated") : t(language, "Servicio creado", "Service created"));
    onOpenChange(false);
    onSaved();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{service?.id ? t(language, "Editar servicio", "Edit service") : t(language, "Nuevo servicio", "New service")}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label>{t(language, "Nombre", "Name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t(language, "Corte clásico", "Classic cut")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t(language, "Duración (min)", "Duration (min)")}</Label>
              <Input type="number" inputMode="numeric" min={5} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t(language, "Precio ($)", "Price ($)")}</Label>
              <Input type="number" inputMode="decimal" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t(language, "Categoría", "Category")}</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t(language, "Cortes", "Haircuts")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t(language, "Descripción", "Description")}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t(language, "Margen antes (min)", "Padding before (min)")}</Label>
              <Input type="number" inputMode="numeric" min={0} step={5} value={padBefore} onChange={(e) => setPadBefore(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t(language, "Margen después (min)", "Padding after (min)")}</Label>
              <Input type="number" inputMode="numeric" min={0} step={5} value={padAfter} onChange={(e) => setPadAfter(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t(language, "Barbero", "Barber")}</Label>
            <BarberSelect language={language} barbers={barbers} value={barberId} onChange={setBarberId} />
          </div>
          <div className="flex items-center justify-between rounded-lg px-3 py-2 card-elevated">
            <div>
              <p className="text-sm font-medium">{t(language, "Visible para clientes", "Visible to clients")}</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {t(language, "Los servicios privados solo los agenda el personal.", "Private services can only be booked by staff.")}
              </p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
          <div className="rounded-lg px-3 py-2 card-elevated space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{t(language, "Horario propio del servicio", "Own hours for this service")}</p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {t(
                    language,
                    "Si lo activas, este servicio se ofrece solo en estas horas (reemplaza el horario normal del barbero y de la tienda). Los cierres por fecha siguen aplicando.",
                    "When on, this service is offered only in these hours (replaces the barber and shop normal hours). Date closures still apply.",
                  )}
                </p>
              </div>
              <Switch checked={ownHours} onCheckedChange={setOwnHours} />
            </div>
            {ownHours && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t(language, "Desde", "From")}</Label>
                    <Input type="time" value={ownStart} onChange={(e) => setOwnStart(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t(language, "Hasta", "To")}</Label>
                    <Input type="time" value={ownEnd} onChange={(e) => setOwnEnd(e.target.value)} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(language === "es" ? DAYS_ES : DAYS_EN).map((label, d) => {
                    const on = ownDays.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setOwnDays((cur) => (on ? cur.filter((x) => x !== d) : [...cur, d]))}
                        className="h-9 min-w-[3rem] rounded-md border px-3 text-sm"
                        style={{
                          background: on ? "var(--accent, #2563eb)" : "transparent",
                          color: on ? "#fff" : "var(--text-primary)",
                          borderColor: "var(--border-color, #444)",
                        }}
                        aria-pressed={on}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <Button className="w-full" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : t(language, "Guardar", "Save")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ─────────────────────────────── Add-on ─────────────────────────────── */
export function AddonEditorSheet({
  open,
  onOpenChange,
  language,
  barbers,
  addon,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  language: Lang;
  barbers: EditorBarber[];
  addon: EditableAddon | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("10");
  const [price, setPrice] = useState("5.00");
  const [barberId, setBarberId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(addon?.name ?? "");
    setDuration(String(addon?.duration_minutes ?? 10));
    setPrice(((addon?.price_cents ?? 500) / 100).toFixed(2));
    setBarberId(addon?.barber_id ?? null);
  }, [open, addon]);

  const save = async () => {
    const dur = Math.max(0, Math.round(num(duration)));
    const cents = Math.round(num(price) * 100);
    if (!name.trim() || cents < 0) {
      toast.error(t(language, "Nombre y precio son obligatorios", "Name and price are required"));
      return;
    }
    setSaving(true);
    const row = { name: name.trim(), duration_minutes: dur, price_cents: cents, barber_id: barberId, is_active: true };
    const { error } = addon?.id
      ? await supabase.from("service_addons").update(row).eq("id", addon.id)
      : await supabase.from("service_addons").insert(row);
    setSaving(false);
    if (error) {
      toast.error(t(language, "No se pudo guardar el adicional", "Could not save the add-on") + `: ${error.message}`);
      return;
    }
    toast.success(addon?.id ? t(language, "Adicional actualizado", "Add-on updated") : t(language, "Adicional creado", "Add-on created"));
    onOpenChange(false);
    onSaved();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{addon?.id ? t(language, "Editar adicional", "Edit add-on") : t(language, "Nuevo adicional", "New add-on")}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label>{t(language, "Nombre", "Name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t(language, "Perfilado de cejas", "Eyebrow line-up")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t(language, "Duración extra (min)", "Extra minutes")}</Label>
              <Input type="number" inputMode="numeric" min={0} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t(language, "Precio ($)", "Price ($)")}</Label>
              <Input type="number" inputMode="decimal" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t(language, "Barbero", "Barber")}</Label>
            <BarberSelect language={language} barbers={barbers} value={barberId} onChange={setBarberId} />
          </div>
          <Button className="w-full" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : t(language, "Guardar", "Save")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
