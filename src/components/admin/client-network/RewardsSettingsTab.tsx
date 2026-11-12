// Rewards Settings tab — read-only display of global rules (v1).
import { Calculator, Gift, RotateCcw, Link as LinkIcon } from "lucide-react";

export default function RewardsSettingsTab({ isEs }: { isEs: boolean }) {
  const cards = [
    {
      icon: Calculator,
      title: isEs ? "Cálculo de puntos" : "Points Calculation",
      value: isEs ? "1 punto por dólar" : "1 point per dollar",
      hint: isEs ? "Los clientes ganan 1 punto por cada dólar elegible." : "Clients earn 1 point for every eligible dollar.",
    },
    {
      icon: RotateCcw,
      title: isEs ? "Regla de redondeo" : "Rounding Rule",
      value: isEs ? "Redondea hacia arriba solo si los centavos son mayores de 50." : "Round up only when cents are greater than 50.",
      hint: "$34.50 = 34 pts · $34.51 = 35 pts",
    },
    {
      icon: Gift,
      title: isEs ? "Bono de referido" : "Referral Bonus",
      value: isEs ? "Bono por Referir" : "Matching Bonus",
      hint: isEs ? "Solo en la primera transacción completada del referido." : "Applied only on the referred client's first completed transaction.",
    },
    {
      icon: LinkIcon,
      title: isEs ? "Límite de cambio de enlace" : "Slug Change Limit",
      value: isEs ? "Una vez cada 30 días" : "Once every 30 days",
      hint: isEs ? "Evita que los clientes cambien el enlace muy seguido." : "Prevents clients from changing links too often.",
    },
  ];

  return (
    <div className="pt-4 px-4 sm:px-6 space-y-2">
      <div className="text-[11px] mb-2" style={{ color: "var(--text-tertiary)" }}>
        {isEs ? "Estas reglas se aplican al cálculo de puntos futuros." : "These rules apply to future point calculations."}
      </div>
      {cards.map(({ icon: Icon, title, value, hint }) => (
        <div key={title} className="rounded-xl p-4 card-elevated">
          <div className="flex items-center gap-2">
            <Icon size={14} style={{ color: "var(--accent-color)" }} />
            <div className="text-[10px] uppercase font-bold" style={{ color: "var(--text-tertiary)" }}>{title}</div>
          </div>
          <div className="text-[14px] font-bold mt-1.5" style={{ color: "var(--text-primary)" }}>{value}</div>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{hint}</div>
        </div>
      ))}
    </div>
  );
}
