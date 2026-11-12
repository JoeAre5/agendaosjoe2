import { Calendar, Package, Menu, Home } from "lucide-react";
import { GlobalBottomNavShell } from "@/components/GlobalBottomNavShell";

export type TabId = "home" | "calendar" | "checkout" | "menu";

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  pendingCount?: number;
  availableTabs?: TabId[];
}

const allTabs = [
  { id: "home" as TabId, icon: Home },
  { id: "calendar" as TabId, icon: Calendar },
  { id: "checkout" as TabId, icon: Package },
  { id: "menu" as TabId, icon: Menu },
];

export function BottomNav({ activeTab, onTabChange, pendingCount = 0, availableTabs }: BottomNavProps) {
  const tabs = availableTabs
    ? allTabs.filter((t) => availableTabs.includes(t.id))
    : allTabs;
  const activeIndex = Math.max(0, tabs.findIndex(({ id }) => id === activeTab));

  return (
    <GlobalBottomNavShell tabsCount={tabs.length} activeIndex={activeIndex}>
      {tabs.map(({ id, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className="relative flex items-center justify-center flex-1"
              style={{ height: 46 }}
            >
              <Icon
                size={24}
                strokeWidth={1.5}
                style={{
                  color: isActive ? "var(--nav-accent)" : "var(--nav-icon-inactive)",
                  position: "relative",
                  zIndex: 1,
                }}
              />
              {id === "menu" && pendingCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 10,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    background: "var(--pending-badge-bg)",
                    color: "var(--pending-badge-fg)",
                    fontSize: 9,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 4px",
                    zIndex: 2,
                  }}
                >
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
    </GlobalBottomNavShell>
  );
}
