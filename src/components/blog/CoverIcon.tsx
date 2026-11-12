import { icons, Newspaper, Plus, type LucideIcon } from "lucide-react";

/**
 * CoverIcon — primary (and optional secondary) lucide icon over a fade-to-bg
 * gradient. When `iconSecondary` is set we render two icons side-by-side
 * Supabase-blog style: primary on the right (slightly larger), secondary on
 * the left (slightly smaller, dimmer).
 */
const PRESETS: Record<string, { seed: string; iconColor: string }> = {
  "primary-gradient": { seed: "var(--accent-color)", iconColor: "#fff" },
  "accent-solid":     { seed: "var(--accent-color)", iconColor: "#fff" },
  "dark-gradient":    { seed: "#1a1a1a",             iconColor: "var(--accent-color)" },
  "warm-gradient":    { seed: "#d97706",             iconColor: "#fff" },
  "cool-gradient":    { seed: "#0ea5e9",             iconColor: "#fff" },
};

function kebabToPascal(name: string): string {
  return name.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}

export function getIconComponent(iconName: string | null | undefined): LucideIcon {
  if (!iconName) return Newspaper;
  const pascal = kebabToPascal(iconName);
  return ((icons as Record<string, LucideIcon>)[pascal] as LucideIcon) || Newspaper;
}

export function getCoverPreset(preset: string | null | undefined) {
  return PRESETS[preset || "primary-gradient"] || PRESETS["primary-gradient"];
}

interface CoverIconProps {
  icon: string | null | undefined;
  iconSecondary?: string | null | undefined;
  bgPreset: string | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function CoverIcon({ icon, iconSecondary, bgPreset: _bgPreset, size = "md", className = "" }: CoverIconProps) {
  const Icon = getIconComponent(icon);
  const Secondary = iconSecondary ? getIconComponent(iconSecondary) : null;
  const baseSize = size === "lg" ? 96 : size === "md" ? 64 : 40;
  // When dual: same size for both, slightly shrunk to fit with the plus.
  const dualSize = Secondary ? Math.round(baseSize * 0.75) : baseSize;
  const plusSize = Math.round(dualSize * 0.45);

  const background =
    "radial-gradient(120% 90% at 0% 0%, var(--bg-surface-2) 0%, var(--bg-surface-2) 30%, var(--bg-base) 75%, var(--bg-base) 100%)";

  return (
    <div
      className={`w-full h-full flex items-center justify-center ${className}`}
      style={{ background }}
    >
      {Secondary ? (
        <div className="flex items-center justify-center" style={{ gap: Math.round(baseSize * 0.12) }}>
          <Icon
            size={dualSize}
            strokeWidth={1.5}
            style={{ color: "var(--gradient-accent)", opacity: 0.95 }}
          />
          <Plus
            size={plusSize}
            strokeWidth={1.5}
            style={{ color: "var(--gradient-accent)", opacity: 0.6 }}
          />
          <Secondary
            size={dualSize}
            strokeWidth={1.5}
            style={{ color: "var(--gradient-accent)", opacity: 0.95 }}
          />
        </div>
      ) : (
        <Icon
          size={baseSize}
          strokeWidth={1.5}
          style={{ color: "var(--gradient-accent)", opacity: 0.95 }}
        />
      )}
    </div>
  );
}
