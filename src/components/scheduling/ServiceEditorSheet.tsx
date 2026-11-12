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

  useEffect(() => {
    if (!open) return;
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
    const { error } = service?.id
      ? await supabase.from("services").update(row).eq("id", service.id)
      : await supabase.from("services").insert(row);
    setSaving(false);
    if (error) {
      toast.error(t(language, "No se pudo guardar el servicio", "Could not save the service") + `: ${error.message}`);
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
