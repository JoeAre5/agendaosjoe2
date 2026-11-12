import { Cake } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

export function BirthdayIcon({ size = 18 }: { size?: number }) {
  const { language } = useTranslation();
  const label = language === "es" ? "Cumpleaños" : "Birthday";
  return <span className="inline-flex shrink-0 text-primary" title={label} role="img" aria-label={label}><Cake size={size} aria-hidden="true" /></span>;
}