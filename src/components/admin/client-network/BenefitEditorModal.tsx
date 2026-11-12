// Create / edit benefit modal.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { StandardToggle } from "@/components/ui/StandardToggle";
import { supabase } from "@/integrations/supabase/client";
import { BENEFIT_ICONS, BENEFIT_ICON_KEYS } from "@/lib/benefitIcons";

interface Props {
  open: boolean;
  benefit: any | null;
  isEs: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const ICONS = BENEFIT_ICONS;
const ICON_KEYS = BENEFIT_ICON_KEYS;

const inputStyle = { background: "var(--bg-elevated)", color: "var(--text-primary)" } as any;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase font-bold mb-1" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const emptyForm = {
  title_es: "", title_en: "", description_es: "", description_en: "",
  required_points: 100, icon: "gift", is_active: true, sort_order: 0, internal_notes: "",
};

export default function BenefitEditorModal({ open, benefit, isEs, onClose, onSaved }: Props) {
  const editing = !!benefit;
  const [form, setForm] = useState<any>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (benefit) setForm({ ...emptyForm, ...benefit });
    else setForm(emptyForm);
  }, [benefit, open]);

  const save = async () => {
    if (!form.title_es?.trim() || !form.title_en?.trim()) {
      toast.error(isEs ? "Títulos requeridos." : "Titles required."); return;
    }
    if (!form.required_points || Number(form.required_points) <= 0) {
      toast.error(isEs ? "Puntos inválidos." : "Invalid points."); return;
    }
    setSaving(true);
    const payload = {
      title_es: form.title_es.trim(),
      title_en: form.title_en.trim(),
      description_es: form.description_es || null,
      description_en: form.description_en || null,
      required_points: Number(form.required_points),
      icon: form.icon || "gift",
      is_active: !!form.is_active,
      sort_order: Number(form.sort_order) || 0,
      internal_notes: form.internal_notes || null,
    };
    const { error } = editing
      ? await supabase.from("rewards_benefits").update(payload).eq("id", benefit.id)
      : await supabase.from("rewards_benefits").insert(payload);
    setSaving(false);
    if (error) { console.warn(error); toast.error(isEs ? "Error al guardar." : "Unable to save."); return; }
    toast.success(isEs ? "Beneficio guardado." : "Benefit saved.");
    onSaved();
  };

  const selectedIcon = ICONS[form.icon as string] ? form.icon : "gift";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md p-0 max-h-[90vh] overflow-y-auto" style={{ background: "var(--bg-base)" }}>
        <div className="p-5">
          <div className="text-[16px] font-bold" style={{ color: "var(--text-primary)" }}>
            {editing ? (isEs ? "Editar beneficio" : "Edit Benefit") : (isEs ? "Crear beneficio" : "Create Benefit")}
          </div>
          <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
            {isEs ? "Aparece en el tab de Beneficios del cliente." : "Shown to clients in their Benefits tab."}
          </div>

          <div className="mt-4 space-y-3">
            <Field label={isEs ? "Título (Español)" : "Title (Spanish)"}>
              <input
                value={form.title_es}
                onChange={(e) => setForm((f: any) => ({ ...f, title_es: e.target.value }))}
                placeholder="Ej: Recorte clásico gratis"
                className="w-full h-10 rounded-lg px-3 text-[14px] outline-none"
                style={inputStyle}
              />
            </Field>
            <Field label={isEs ? "Título (Inglés)" : "Title (English)"}>
              <input
                value={form.title_en}
                onChange={(e) => setForm((f: any) => ({ ...f, title_en: e.target.value }))}
                placeholder="Free Classic Haircut"
                className="w-full h-10 rounded-lg px-3 text-[14px] outline-none"
                style={inputStyle}
              />
            </Field>
            <Field label={isEs ? "Descripción (Español)" : "Description (Spanish)"}>
              <textarea
                value={form.description_es || ""}
                onChange={(e) => setForm((f: any) => ({ ...f, description_es: e.target.value }))}
                rows={2}
                className="w-full rounded-lg px-3 py-2 text-[13px] outline-none resize-none"
                style={inputStyle}
              />
            </Field>
            <Field label={isEs ? "Descripción (Inglés)" : "Description (English)"}>
              <textarea
                value={form.description_en || ""}
                onChange={(e) => setForm((f: any) => ({ ...f, description_en: e.target.value }))}
                rows={2}
                className="w-full rounded-lg px-3 py-2 text-[13px] outline-none resize-none"
                style={inputStyle}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={isEs ? "Puntos requeridos" : "Required Points"}>
                <input
                  type="number"
                  value={form.required_points}
                  onChange={(e) => setForm((f: any) => ({ ...f, required_points: e.target.value }))}
                  className="w-full h-10 rounded-lg px-3 text-[14px] outline-none"
                  style={inputStyle}
                />
              </Field>
              <Field label={isEs ? "Orden" : "Sort Order"}>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f: any) => ({ ...f, sort_order: e.target.value }))}
                  className="w-full h-10 rounded-lg px-3 text-[14px] outline-none"
                  style={inputStyle}
                />
              </Field>
            </div>

            <Field label={isEs ? "Icono" : "Icon"}>
              <div
                className="grid grid-cols-8 gap-1.5 p-2 rounded-lg"
                style={{ background: "var(--bg-elevated)" }}
              >
                {ICON_KEYS.map((key) => {
                  const Cmp = ICONS[key];
                  const active = key === selectedIcon;
                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={() => setForm((f: any) => ({ ...f, icon: key }))}
                      title={key}
                      className="aspect-square rounded-md flex items-center justify-center transition-colors"
                      style={{
                        background: active ? "var(--accent-color)" : "var(--bg-base)",
                        color: active ? "var(--bg-base)" : "var(--text-primary)",
                      }}
                    >
                      <Cmp size={15} />
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label={isEs ? "Notas internas" : "Internal Notes"}>
              <textarea
                value={form.internal_notes || ""}
                onChange={(e) => setForm((f: any) => ({ ...f, internal_notes: e.target.value }))}
                rows={2}
                placeholder={isEs ? "Solo admin." : "Admin only."}
                className="w-full rounded-lg px-3 py-2 text-[12px] outline-none resize-none"
                style={inputStyle}
              />
            </Field>

            <div className="flex items-center justify-between gap-2 py-1">
              <span className="text-[12px]" style={{ color: "var(--text-primary)" }}>
                {isEs ? "Activo (visible para clientes)" : "Active (visible to clients)"}
              </span>
              <StandardToggle
                checked={!!form.is_active}
                onChange={(next) => setForm((f: any) => ({ ...f, is_active: next }))}
                ariaLabel={isEs ? "Activar beneficio" : "Toggle benefit active"}
              />
            </div>
          </div>

          <div className="mt-5 flex gap-2">
            <button onClick={onClose} className="flex-1 h-10 rounded-lg text-[12px] font-bold" style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }}>
              {isEs ? "Cancelar" : "Cancel"}
            </button>
            <button onClick={save} disabled={saving} className="flex-1 h-10 rounded-lg text-[12px] font-bold disabled:opacity-60"
              style={{ background: "var(--accent-color)", color: "var(--bg-base)" }}>
              {saving ? "..." : (isEs ? "Guardar" : "Save Benefit")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
