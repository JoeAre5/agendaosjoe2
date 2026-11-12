import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ShoppingBag } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import type { PortalAppointment } from "./types";
import AppointmentCard from "./AppointmentCard";
import { NAV_PILL_INSET } from "@/components/GlobalBottomNavShell";
import { PortalBrandLogo } from "@/components/PortalBrandLogo";

interface CitasTabProps {
  upcoming: PortalAppointment[];
  past: PortalAppointment[];
  cancelWindowHours: number;
  onCancel: (appt: PortalAppointment) => void;
  productPurchases?: ProductPurchase[];
}

interface ProductPurchase {
  id: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  purchased_at: string;
}

type SubTab = "todas" | "futuras" | "anteriores" | "productos";

export default function CitasTab({ upcoming, past, cancelWindowHours, onCancel, productPurchases = [] }: CitasTabProps) {
  const [activeTab, setActiveTab] = useState<SubTab>("todas");
  const navigate = useNavigate();
  const { t, language } = useTranslation();
  const localeTag = language === "en" ? "en-US" : "es-PR";

  const allAppointments = [...upcoming, ...past].sort(
    (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()
  );

  const tabs: { id: SubTab; label: string }[] = [
    { id: "todas", label: t("portal.citas.tabAll") },
    { id: "futuras", label: t("portal.citas.tabUpcoming") },
    { id: "anteriores", label: t("portal.citas.tabPast") },
    { id: "productos", label: t("portal.citas.tabProducts") },
  ];

  return (
    <div className="px-4 pt-14 pb-4">
      <PortalBrandLogo />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl" style={{ fontWeight: 900, letterSpacing: "-1px", color: "var(--text-primary)" }}>
          {t("portal.citas.title")}
        </h1>
        <button
          onClick={() => navigate("/app/cliente/nueva-cita")}
          className="text-xs font-semibold"
          style={{ color: "var(--accent-color)" }}
        >
          {t("portal.citas.newShort")}
        </button>
      </div>

      {/* Segmented tabs — mirrors GlobalBottomNavShell tokens */}
      {(() => {
        const inset = NAV_PILL_INSET;
        const totalInset = inset * 2;
        const activeIdx = Math.max(0, tabs.findIndex((tt) => tt.id === activeTab));
        const pillWidth = `calc((100% - ${totalInset}px) / ${tabs.length})`;
        const pillLeft = `calc(${inset}px + ${activeIdx} * ((100% - ${totalInset}px) / ${tabs.length}))`;
        return (
          <div className="mb-6">
            <div
              className="relative flex items-center w-full"
              style={{
                height: 44,
                padding: `0 ${inset}px`,
                borderRadius: "var(--radius-pill)",
                border: "0.5px solid var(--nav-border-color)",
                boxSizing: "border-box",
                backdropFilter: "blur(32px)",
                WebkitBackdropFilter: "blur(32px)",
                background: "var(--nav-bg)",
                boxShadow: "var(--nav-shadow)",
              }}
            >
              <motion.div
                className="absolute rounded-full"
                style={{
                  left: pillLeft,
                  top: inset,
                  bottom: inset,
                  width: pillWidth,
                  background: "var(--nav-pill-bg)",
                  border: "var(--nav-pill-border)",
                  boxShadow: "var(--nav-pill-shadow)",
                  boxSizing: "border-box",
                  zIndex: 0,
                }}
                animate={{ left: pillLeft }}
                transition={{ type: "spring", damping: 26, stiffness: 520, mass: 0.6 }}
              />
              {tabs.map(({ id, label }) => {
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className="relative flex items-center justify-center flex-1 h-full"
                    style={{ zIndex: 1 }}
                  >
                    <span
                      className="text-xs font-semibold whitespace-nowrap"
                      style={{ color: active ? "var(--nav-accent)" : "var(--nav-icon-inactive)" }}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {activeTab === "todas" && (
        <>
          {allAppointments.length === 0 ? (
            <div className="rounded-xl p-8 text-center" style={{ background: "var(--bg-surface)" }}>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {t("portal.citas.emptyAll")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {allAppointments.map((a) => {
                const isUpcoming = ["scheduled", "confirmed"].includes(a.status) && new Date(a.starts_at).getTime() > Date.now();
                return (
                  <AppointmentCard key={a.id} appt={a} cancelWindowHours={cancelWindowHours} onCancel={isUpcoming ? () => onCancel(a) : undefined} showStatus />
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === "futuras" && (
        <>
          {upcoming.length === 0 ? (
            <div className="rounded-xl p-8 text-center" style={{ background: "var(--bg-surface)" }}>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {t("portal.citas.emptyUpcoming")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map((a) => (
                <AppointmentCard key={a.id} appt={a} cancelWindowHours={cancelWindowHours} onCancel={() => onCancel(a)} showStatus />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === "anteriores" && (
        <>
          {past.length === 0 ? (
            <div className="rounded-xl p-8 text-center" style={{ background: "var(--bg-surface)" }}>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {t("portal.citas.emptyPast")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {past.map((a) => (
                <AppointmentCard key={a.id} appt={a} cancelWindowHours={cancelWindowHours} showStatus />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === "productos" && (
        <div>
          {productPurchases.length === 0 ? (
            <div className="rounded-xl p-8 text-center" style={{ background: "var(--bg-surface)" }}>
              <ShoppingBag size={32} className="mx-auto mb-3" style={{ color: "var(--text-secondary)", opacity: 0.5 }} />
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {t("portal.citas.emptyProducts")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {productPurchases.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl p-4"
                  style={{ background: "var(--bg-surface)", border: "1px solid var(--divider)" }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {p.name}
                    </span>
                    <span className="text-sm font-bold" style={{ color: "var(--accent-color)" }}>
                      ${(p.total_cents / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {t("portal.citas.qty")}: {p.quantity} × ${(p.unit_price_cents / 100).toFixed(2)}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {new Date(p.purchased_at).toLocaleDateString(localeTag, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
