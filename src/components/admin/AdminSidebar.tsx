import { useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Home, Calendar, Package, Users, BarChart3, ShoppingBag,
  Bell, Settings, ChevronsLeft, ChevronsRight, LogOut, Moon, Sun,
  FileText, Megaphone, Inbox, Hourglass, Store, Images, Globe,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { useTranslation } from "@/hooks/useTranslation";
import { useBrandLogos } from "@/contexts/BrandLogosContext";
import type { TabId } from "@/components/BottomNav";

export type SidebarItem =
  | { kind: "tab"; id: TabId; labelEs: string; labelEn: string; icon: LucideIcon }
  | { kind: "route"; to: string; labelEs: string; labelEn: string; icon: LucideIcon };

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  pendingCount?: number;
  clientDuplicateCount?: number | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function AdminSidebar({ activeTab, onTabChange, pendingCount = 0, clientDuplicateCount = null, collapsed, onToggleCollapsed }: Props) {
  const { signOut, role } = useAuth();
  const { theme, setTheme, language } = usePreferences();
  const { t } = useTranslation();
  const { sidebarLogoUrl } = useBrandLogos();
  const navigate = useNavigate();
  const location = useLocation();
  const isEs = language === "es";
  const isOwner = role === "owner";

  const primary: SidebarItem[] = useMemo(() => {
    const items: SidebarItem[] = [];
    if (isOwner) items.push({ kind: "tab", id: "home", labelEs: "Inicio", labelEn: "Home", icon: Home });
    items.push({ kind: "tab", id: "calendar", labelEs: "Calendario", labelEn: "Calendar", icon: Calendar });
    items.push({ kind: "tab", id: "checkout", labelEs: "Checkout", labelEn: "Checkout", icon: Package });
    items.push({ kind: "route", to: "/admin/media", labelEs: "Media", labelEn: "Media", icon: Images });
    return items;
  }, [isOwner]);

  const ownerLinks: SidebarItem[] = [
    { kind: "route", to: "/admin/reports", labelEs: "Reportes", labelEn: "Reports", icon: BarChart3 },
    { kind: "route", to: "/admin/contable", labelEs: "Contable", labelEn: "Accounting", icon: FileText },
    { kind: "route", to: "/admin/clients", labelEs: "Clientes", labelEn: "Clients", icon: Users },
    { kind: "route", to: "/admin/sales", labelEs: "Ventas", labelEn: "Sales", icon: ShoppingBag },
    { kind: "route", to: "/admin/inventory", labelEs: "Inventario", labelEn: "Inventory", icon: Store },
    { kind: "route", to: "/admin/waitlist", labelEs: "Lista de espera", labelEn: "Waitlist", icon: Hourglass },
    { kind: "route", to: "/admin/bandeja", labelEs: "Bandeja", labelEn: "Inbox", icon: Inbox },
    { kind: "route", to: "/admin/broadcasts", labelEs: "Difusiones", labelEn: "Broadcasts", icon: Megaphone },
    { kind: "route", to: "/admin/notifications", labelEs: "Notificaciones", labelEn: "Notifications", icon: Bell },
    { kind: "route", to: "/admin/website", labelEs: "Página Web", labelEn: "Website", icon: Globe },
    { kind: "route", to: "/admin/settings", labelEs: "Ajustes", labelEn: "Settings", icon: Settings },
  ];

  const isRouteActive = (to: string) => location.pathname === to;

  const width = collapsed ? 64 : 232;

  const renderItem = (item: SidebarItem, isActive: boolean, onClick: () => void, badge?: number) => {
    const Icon = item.icon;
    const label = isEs ? item.labelEs : item.labelEn;
    return (
      <button
        key={item.kind === "tab" ? `tab-${item.id}` : `route-${item.to}`}
        onClick={onClick}
        title={collapsed ? label : undefined}
        className="group relative flex items-center w-full rounded-[6px] transition-colors"
        style={{
          height: 32,
          padding: collapsed ? "0" : "0 8px",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 10,
          color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
          background: isActive ? "var(--bg-surface-2)" : "transparent",
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = "var(--accent-dim)";
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = "transparent";
        }}
      >
        <span className="relative flex items-center justify-center" style={{ width: 18, height: 18 }}>
          <Icon size={16} strokeWidth={1.75} />
          {badge && badge > 0 ? (
            <span
              style={{
                position: "absolute",
                top: -4,
                right: -6,
                minWidth: 14,
                height: 14,
                borderRadius: 7,
                background: "var(--pending-badge-bg)",
                color: "var(--pending-badge-fg)",
                fontSize: 9,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 3px",
              }}
            >
              {badge}
            </span>
          ) : null}
        </span>
        {!collapsed && (
          <span
            style={{
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {label}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      className="hidden md:flex flex-col shrink-0 h-screen sticky top-0 select-none"
      style={{
        width,
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
        transition: "width 180ms cubic-bezier(0.4, 0, 0.2, 1)",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      {/* Brand */}
      <div
        className="flex items-center"
        style={{
          height: 52,
          padding: collapsed ? "0" : "0 14px",
          justifyContent: collapsed ? "center" : "space-between",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {!collapsed && (
          sidebarLogoUrl ? (
            <img
              src={sidebarLogoUrl}
              alt="Brand"
              style={{ height: 22, width: "auto", objectFit: "contain" }}
              loading="eager"
              decoding="async"
            />
          ) : (
            <div className="flex items-center gap-1" style={{ lineHeight: 1.15 }}>
              <span className="font-black tracking-tight" style={{ fontSize: 11, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>
                CHARLIE'S
              </span>
              <span className="font-light" style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                BARBERSHOP
              </span>
            </div>
          )
        )}
        <button
          onClick={onToggleCollapsed}
          className="flex items-center justify-center rounded-[6px]"
          style={{
            width: 26, height: 26,
            color: "var(--text-tertiary)",
            background: "transparent",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-dim)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          title={collapsed ? (isEs ? "Expandir" : "Expand") : (isEs ? "Colapsar" : "Collapse")}
        >
          {collapsed ? <ChevronsRight size={14} strokeWidth={2} /> : <ChevronsLeft size={14} strokeWidth={2} />}
        </button>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto" style={{ padding: collapsed ? "10px 8px" : "10px 10px" }}>
        {!collapsed && (
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", padding: "8px 8px 6px" }}>
            {isEs ? "Principal" : "Main"}
          </div>
        )}
        <div className="flex flex-col" style={{ gap: 2 }}>
          {primary.map((item) =>
            renderItem(
              item,
              item.kind === "tab" ? activeTab === item.id : isRouteActive(item.to),
              () => item.kind === "tab" ? onTabChange(item.id) : navigate(item.to),
              undefined
            )
          )}
        </div>

        {isOwner && (
          <>
            <div style={{ height: 1, background: "var(--divider-hairline)", margin: "12px 4px" }} />
            {!collapsed && (
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", padding: "4px 8px 6px" }}>
                {isEs ? "Gestión" : "Manage"}
              </div>
            )}
            <div className="flex flex-col" style={{ gap: 2 }}>
              {ownerLinks.map((item) =>
                renderItem(
                  item,
                  item.kind === "route" && isRouteActive(item.to),
                  () => item.kind === "route" && navigate(item.to),
                  item.kind === "route" && item.to === "/admin/bandeja" ? pendingCount : item.kind === "route" && item.to === "/admin/clients" ? clientDuplicateCount ?? undefined : undefined
                )
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer actions */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: collapsed ? "8px" : "8px 10px",
          paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex items-center rounded-[6px]"
          style={{
            height: 32,
            padding: collapsed ? "0" : "0 8px",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: 10,
            color: "var(--text-secondary)",
            background: "transparent",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-dim)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          title={collapsed ? (theme === "dark" ? (isEs ? "Modo claro" : "Light mode") : (isEs ? "Modo oscuro" : "Dark mode")) : undefined}
        >
          <span className="flex items-center justify-center" style={{ width: 18, height: 18 }}>
            {theme === "dark" ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
          </span>
          {!collapsed && (
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              {theme === "dark" ? (isEs ? "Modo claro" : "Light") : (isEs ? "Modo oscuro" : "Dark")}
            </span>
          )}
        </button>
        <button
          onClick={() => signOut()}
          className="flex items-center rounded-[6px]"
          style={{
            height: 32,
            padding: collapsed ? "0" : "0 8px",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: 10,
            color: "var(--text-secondary)",
            background: "transparent",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-dim)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          title={collapsed ? (isEs ? "Cerrar sesión" : "Sign out") : undefined}
        >
          <span className="flex items-center justify-center" style={{ width: 18, height: 18 }}>
            <LogOut size={16} strokeWidth={1.75} />
          </span>
          {!collapsed && (
            <span style={{ fontSize: 13, fontWeight: 500 }}>{isEs ? "Cerrar sesión" : "Sign out"}</span>
          )}
        </button>
      </div>
    </aside>
  );
}
