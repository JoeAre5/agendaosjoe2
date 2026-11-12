/**
 * IconPicker — pick a primary (and optional secondary) lucide icon for the
 * post cover. Tap a slot to make it the active target, then tap a chip in
 * the row to assign. Long-tap chips to delete (in edit mode). AI prompt
 * adds new icons to the row.
 *
 * Storage:
 *   ls("titulares.iconPicker.v1") = { added: string[], removed: string[] }
 */
import { useEffect, useRef, useState } from "react";
import { Plus, X, Loader2, Wand2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CoverIcon, getIconComponent } from "@/components/blog/CoverIcon";

const DEFAULT_ICONS = [
  "newspaper", "scissors", "sparkles", "star", "flame", "crown",
  "calendar", "clock", "trophy", "heart", "zap", "trending-up",
  "droplet", "droplets", "cloud", "cloud-rain", "cloud-sun", "sun",
  "wind", "umbrella", "thermometer", "leaf", "music",
  "armchair", "store", "landmark", "palette", "coffee", "award",
];

const LS_KEY = "titulares.iconPicker.v1";
type State = { added: string[]; removed: string[] };

function loadState(): State {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { added: [], removed: [] };
    const v = JSON.parse(raw);
    return { added: Array.isArray(v.added) ? v.added : [], removed: Array.isArray(v.removed) ? v.removed : [] };
  } catch { return { added: [], removed: [] }; }
}
function saveState(s: State) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}

interface Props {
  value: string | null;
  valueSecondary?: string | null;
  fallback: string;
  es: boolean;
  onChange: (icon: string) => void;
  onChangeSecondary?: (icon: string | null) => void;
}

type Slot = "primary" | "secondary";

export function IconPicker({ value, valueSecondary, fallback, es, onChange, onChangeSecondary }: Props) {
  const [state, setState] = useState<State>(() => loadState());
  const [editMode, setEditMode] = useState(false);
  const [activeSlot, setActiveSlot] = useState<Slot>("primary");
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => { saveState(state); }, [state]);

  const icons = [...DEFAULT_ICONS.filter((i) => !state.removed.includes(i)), ...state.added];

  function remove(icon: string) {
    setState((s) => {
      const isDefault = DEFAULT_ICONS.includes(icon);
      return {
        added: s.added.filter((i) => i !== icon),
        removed: isDefault ? Array.from(new Set([...s.removed, icon])) : s.removed,
      };
    });
  }

  function assign(icon: string) {
    if (activeSlot === "primary") onChange(icon);
    else onChangeSecondary?.(icon);
  }

  async function generate() {
    const p = prompt.trim();
    if (!p) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("blog-icon-suggest", { body: { prompt: p } });
      if (error) throw error;
      const icon = String(data?.icon || "").trim();
      if (!icon) throw new Error("no_icon");
      const Comp = getIconComponent(icon);
      const Fallback = getIconComponent("__nope__");
      if (Comp === Fallback && icon !== "newspaper") {
        toast.error(es ? `No existe "${icon}" en Lucide` : `"${icon}" not found in Lucide`);
        return;
      }
      setState((s) => ({
        ...s,
        added: s.added.includes(icon) ? s.added : [...s.added, icon],
        removed: s.removed.filter((i) => i !== icon),
      }));
      assign(icon);
      setPrompt("");
      toast.success(es ? `Ícono "${icon}" agregado` : `Icon "${icon}" added`);
    } catch (e: any) {
      const code = e?.context?.body?.error || e?.message || "";
      if (String(code).includes("rate_limited")) toast.error(es ? "Muchas solicitudes" : "Rate limited");
      else if (String(code).includes("credits_exhausted")) toast.error(es ? "Créditos agotados" : "Credits exhausted");
      else toast.error(es ? "No se pudo generar" : "Could not generate");
    } finally {
      setGenerating(false);
    }
  }

  const primaryIcon = value || fallback;
  const secondaryIcon = valueSecondary || null;

  function SlotChip({ slot, label, iconName, canClear }: { slot: Slot; label: string; iconName: string | null; canClear?: boolean }) {
    const active = activeSlot === slot;
    return (
      <button
        onClick={() => setActiveSlot(slot)}
        className="relative flex-1 flex items-center gap-2 px-2.5 py-2 rounded-lg"
        style={{
          background: active ? "var(--bg-surface-2)" : "transparent",
          border: `1px solid ${active ? "var(--accent-color)" : "var(--divider)"}`,
        }}
      >
        <div className="w-9 h-9 rounded-md overflow-hidden flex items-center justify-center" style={{ background: "var(--bg-base)", border: "1px solid var(--divider)" }}>
          {iconName ? <CoverIcon icon={iconName} bgPreset="dark-gradient" size="sm" /> : (
            <Plus size={14} style={{ color: "var(--text-tertiary)" }} />
          )}
        </div>
        <div className="text-left">
          <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-tertiary)" }}>{label}</p>
          <p className="text-[11px]" style={{ color: "var(--text-primary)" }}>{iconName || (es ? "Ninguno" : "None")}</p>
        </div>
        {canClear && iconName && onChangeSecondary && (
          <button
            onClick={(e) => { e.stopPropagation(); onChangeSecondary(null); }}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow"
            style={{ background: "var(--bg-base)", border: "1px solid var(--divider)", color: "var(--text-primary)" }}
            aria-label={es ? "Quitar" : "Clear"}
          >
            <X size={11} className="icon-bold" />
          </button>
        )}
      </button>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-tertiary)" }}>
          {es ? "Íconos" : "Icons"}
        </p>
        <button
          onClick={() => setEditMode((v) => !v)}
          className="text-[10px] font-semibold flex items-center gap-1 px-2 py-1 rounded-md"
          style={{ color: editMode ? "var(--accent-color)" : "var(--text-tertiary)" }}
        >
          <Pencil size={10} className="icon-bold" />
          {editMode ? (es ? "Listo" : "Done") : (es ? "Editar" : "Edit")}
        </button>
      </div>

      {/* Slots */}
      {onChangeSecondary ? (
        <div className="flex gap-2 mb-3">
          <SlotChip slot="primary" label={es ? "Principal" : "Primary"} iconName={primaryIcon} />
          <SlotChip slot="secondary" label={es ? "Secundario" : "Secondary"} iconName={secondaryIcon} canClear />
        </div>
      ) : null}

      {/* Horizontal scroll row */}
      <div
        className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-1 px-1"
        style={{ scrollbarWidth: "thin" }}
      >
        {icons.map((iconName) => {
          const isPrimary = primaryIcon === iconName;
          const isSecondary = secondaryIcon === iconName;
          const active = activeSlot === "primary" ? isPrimary : isSecondary;
          return (
            <div key={iconName} className="relative shrink-0">
              <button
                onClick={() => assign(iconName)}
                className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center"
                style={{
                  background: active ? "var(--accent-color)" : "var(--bg-surface-2)",
                  border: active ? "none" : "1px solid var(--divider)",
                }}
              >
                <CoverIcon icon={iconName} bgPreset="dark-gradient" size="sm" />
              </button>
              {editMode && (
                <button
                  onClick={(e) => { e.stopPropagation(); remove(iconName); }}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow"
                  style={{ background: "var(--bg-base)", border: "1px solid var(--divider)", color: "var(--text-primary)" }}
                  aria-label={es ? "Eliminar ícono" : "Remove icon"}
                >
                  <X size={11} className="icon-bold" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* AI generate row */}
      <div className="flex gap-1.5">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); generate(); } }}
          disabled={generating}
          placeholder={es ? "Describe un ícono (ej: gota de agua)" : "Describe an icon (e.g. water drop)"}
          className="flex-1 px-3 py-2 rounded-lg text-xs outline-none"
          style={{
            background: "var(--bg-surface-2)",
            color: "var(--text-primary)",
            border: "1px solid var(--divider)",
          }}
        />
        <button
          onClick={generate}
          disabled={generating || !prompt.trim()}
          className="px-3 rounded-lg text-xs font-bold flex items-center gap-1 disabled:opacity-50"
          style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
        >
          {generating
            ? <Loader2 size={12} className="animate-spin" />
            : <><Wand2 size={12} className="icon-bold" /> {es ? "Generar" : "Generate"}</>}
        </button>
      </div>
      <p className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>
        {es
          ? "Toca un slot arriba y luego un ícono para asignarlo. Se asigna al slot activo."
          : "Tap a slot above, then tap an icon to assign it to the active slot."}
      </p>
    </div>
  );
}
