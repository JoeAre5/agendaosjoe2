import { useEffect, useRef, useState, type ReactNode } from "react";
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, ChevronDown, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { moveHomeCard, normalizeHomeCardLayout, readHomeCardLayout, reorderHomeCard, saveHomeCardLayout, type HomeCardId } from "@/lib/homeCardLayout";
import "./HomeCardLayout.css";

function EditableCard({ id, children, editing, es, label, section, onEdit, onMove }: {
  id: HomeCardId; children: ReactNode; editing: boolean; es: boolean; label: string;
  section: "main" | "details"; onEdit: () => void; onMove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id, disabled: !editing, transition: { duration: 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const suppressClick = useRef(false);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => cancel, []);
  return <div ref={setNodeRef} data-home-card={id} data-dragging={isDragging} className="home-card-item"
    style={{ transform: CSS.Translate.toString(transform), transition }}
    onContextMenu={event => event.preventDefault()}
    onPointerDownCapture={event => {
      suppressClick.current = false;
      if (editing || !event.isPrimary || event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, select, textarea, a, [data-home-card-control]")) return;
      // The Reactivation card is itself a button; other actions stay ordinary taps.
      const button = target.closest("button");
      if (button && id !== "retention") return;
      origin.current = { x: event.clientX, y: event.clientY };
      cancel();
      timer.current = setTimeout(() => { suppressClick.current = true; onEdit(); }, 500);
    }}
    onPointerMoveCapture={event => {
      if (Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 8) cancel();
    }}
    onPointerUpCapture={cancel} onPointerCancelCapture={cancel} onPointerLeave={cancel}
    onClickCapture={event => {
      if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }
    }}>
    <div ref={node => node?.toggleAttribute("inert", editing)} className={editing ? "home-card-editing select-none" : ""}>{children}</div>
    {editing && <>
      <div className="home-card-drag-surface" {...attributes} {...listeners}
        aria-label={`${es ? "Reordenar" : "Reorder"}: ${label}`} />
      <Button variant="secondary" size="icon" className="home-card-move rounded-full border border-border shadow-sm"
        data-home-card-control aria-label={`${section === "main" ? (es ? "Mover a Detalles operativos" : "Move to Operational details") : (es ? "Devolver a Inicio" : "Return to Home")}: ${label}`}
        title={section === "main" ? (es ? "Mover a Detalles operativos" : "Move to Operational details") : (es ? "Devolver a Inicio" : "Return to Home")}
        onClick={onMove}>{section === "main" ? <Minus /> : <Plus />}</Button>
    </>}
    {!editing && <Button variant="ghost" size="icon" className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:right-0"
      aria-label={`${es ? "Editar orden" : "Edit order"}: ${label}`} onClick={onEdit}><Check /></Button>}
  </div>;
}

export function HomeCardLayout({ cards, userId, es }: { cards: Record<HomeCardId, ReactNode>; userId: string; es: boolean }) {
  const [layout, setLayout] = useState(() => readHomeCardLayout(userId));
  const [editing, setEditing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [activeId, setActiveId] = useState<HomeCardId | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  useEffect(() => {
    const header = document.querySelector("[data-home-fixed-header]");
    if (!header) return;
    const home = header.parentElement;
    home?.classList.add("admin-home-no-selection");
    const update = () => setHeaderHeight(header.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => { observer.disconnect(); home?.classList.remove("admin-home-no-selection"); };
  }, []);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 500, tolerance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const labels: Record<HomeCardId, string> = es
    ? { profit: "Profit & Loss", expenses: "Gastos", retention: "Reactivación", production: "Producción", payroll: "Nómina estimada", appointments: "Citas", payments: "Cobros por método", ranking: "Ranking de barberos", services: "Servicios" }
    : { profit: "Profit & Loss", expenses: "Expenses", retention: "Reactivation", production: "Production", payroll: "Estimated payroll", appointments: "Appointments", payments: "Collections by method", ranking: "Barber ranking", services: "Services" };
  const render = (section: "main" | "details") => <SortableContext items={layout[section]} strategy={verticalListSortingStrategy}>
    {layout[section].map(id => <EditableCard key={id} id={id} label={labels[id]} section={section} editing={editing} es={es}
      onEdit={() => setEditing(true)} onMove={() => {
        setLayout(current => moveHomeCard(current, id, section === "main" ? "details" : "main"));
        if (section === "main") setDetailsOpen(true);
      }}>{cards[id]}</EditableCard>)}
  </SortableContext>;
  return <div className="home-card-layout" data-home-arranging={activeId !== null}>
    {editing && <div className="home-card-toolbar sticky z-40 flex justify-end py-2 mb-5" style={{ top: headerHeight }}>
      <div className="grid grid-flow-col auto-cols-fr gap-2">
      <Button variant="outline" size="sm" className="home-card-toolbar-button" onClick={() => {
        setLayout(normalizeHomeCardLayout(null)); setSaveError(false);
      }}><RotateCcw />{es ? "Restablecer" : "Reset"}</Button>
      <Button size="sm" className="home-card-toolbar-button" onClick={() => {
        if (!saveHomeCardLayout(userId, layout)) { setSaveError(true); return; }
        setSaveError(false); setEditing(false);
      }}><Check />{es ? "Listo" : "Done"}</Button>
      </div>
    </div>}
    {saveError && <p role="alert" className="text-sm text-destructive mb-4">{es ? "No se pudo guardar el orden. Intenta de nuevo." : "The order could not be saved. Try again."}</p>}
    <DndContext sensors={sensors} collisionDetection={closestCenter}
      onDragStart={({ active }) => setActiveId(active.id as HomeCardId)} onDragCancel={() => setActiveId(null)}
      onDragEnd={({ active, over }) => {
      setActiveId(null);
      if (editing && over) setLayout(current => reorderHomeCard(current, active.id as HomeCardId, over.id as HomeCardId));
    }}>
      {render("main")}
      <Button variant="ghost" className="home-operational-details-button w-full justify-between mb-4" aria-expanded={detailsOpen} aria-controls="home-operational-details"
        onClick={() => setDetailsOpen(value => !value)}>{es ? "Detalles operativos" : "Operational details"}<ChevronDown className={`h-4 w-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`} /></Button>
      {detailsOpen && <div id="home-operational-details">{render("details")}</div>}
      <DragOverlay adjustScale={false} zIndex={45} dropAnimation={{ duration: 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        {activeId && <div className="home-card-drag-overlay" ref={node => node?.setAttribute("inert", "")}>{cards[activeId]}</div>}
      </DragOverlay>
    </DndContext>
  </div>;
}