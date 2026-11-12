import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { usePreferences } from "@/hooks/usePreferences";
import {
  PackagePlus,
  Search,
  Package,
  Trash2,
  X,
  ImagePlus,
  Loader2,
  ArrowUpDown,
  GripVertical,
  Eye,
  EyeOff,
  Check,
} from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  cost_cents: number | null;
  commission_rate: number;
  stock_count: number;
  low_stock_threshold: number;
  category: string | null;
  image_url: string | null;
  is_active: boolean;
  show_in_checkout: boolean;
  eligible_for_commission: boolean;
  sort_order: number;
  updated_at: string;
}

type FormData = {
  name: string;
  price: string;
  cost: string;
  commission: string;
  stock: string;
  category: string;
  description: string;
  eligibleForCommission: boolean;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export default function Inventory() {
  const { t } = useTranslation();
  const { language } = usePreferences();
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [reorderMode, setReorderMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  // Form state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<FormData>({
    name: "",
    price: "",
    cost: "",
    commission: "0",
    stock: "0",
    category: "",
    description: "",
    eligibleForCommission: true,
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (data) setProducts(data as Product[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const filtered = reorderMode
    ? products
    : products.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          (p.category || "").toLowerCase().includes(search.toLowerCase())
      );

  const openAdd = () => {
    setEditingProduct(null);
    setForm({ name: "", price: "", cost: "", commission: "0", stock: "0", category: "", description: "", eligibleForCommission: true });
    setImageFile(null);
    setImagePreview(null);
    setSheetOpen(true);
  };

  const openEdit = (p: Product) => {
    if (reorderMode) return;
    setEditingProduct(p);
    setForm({
      name: p.name,
      price: (p.price_cents / 100).toFixed(2),
      cost: p.cost_cents != null ? (p.cost_cents / 100).toFixed(2) : "",
      commission: String(p.commission_rate ?? 0),
      stock: String(p.stock_count),
      category: p.category || "",
      description: p.description || "",
      eligibleForCommission: p.eligible_for_commission !== false,
    });
    setImageFile(null);
    setImagePreview(p.image_url ? `${SUPABASE_URL}/storage/v1/object/public/product-images/${p.image_url}?t=${new Date(p.updated_at).getTime()}` : null);
    setSheetOpen(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.price.trim() || !form.cost.trim()) {
      toast.error(t("inventory.requiredFields"));
      return;
    }
    setSaving(true);

    try {
      let imagePath = editingProduct?.image_url || null;

      if (imageFile) {
        const ext = imageFile.name.split(".").pop();
        const fileName = `${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(fileName, imageFile, { upsert: true });
        if (uploadError) throw uploadError;
        imagePath = fileName;
      }

      const row = {
        name: form.name.trim(),
        price_cents: Math.round(parseFloat(form.price) * 100),
        cost_cents: Math.round(parseFloat(form.cost) * 100),
        commission_rate: form.commission.trim() ? parseFloat(form.commission) : 0,
        stock_count: parseInt(form.stock) || 0,
        category: form.category.trim() || null,
        description: form.description.trim() || null,
        image_url: imagePath,
        is_active: true,
        eligible_for_commission: form.eligibleForCommission,
      };

      if (editingProduct) {
        const { error } = await supabase
          .from("products")
          .update(row)
          .eq("id", editingProduct.id);
        if (error) throw error;
      } else {
        // Place new product at the end
        const maxOrder = products.reduce((m, p) => Math.max(m, p.sort_order ?? 0), 0);
        const { error } = await supabase
          .from("products")
          .insert({ ...row, sort_order: maxOrder + 10 });
        if (error) throw error;
      }

      toast.success(t("common.save") + " ✓");
      setSheetOpen(false);
      fetchProducts();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingProduct) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("products")
        .update({ is_active: false })
        .eq("id", editingProduct.id);
      if (error) throw error;
      toast.success(t("common.delete") + " ✓");
      setSheetOpen(false);
      fetchProducts();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const toggleVisibility = async (p: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !p.show_in_checkout;
    setProducts((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, show_in_checkout: next } : x))
    );
    const { error } = await supabase
      .from("products")
      .update({ show_in_checkout: next })
      .eq("id", p.id);
    if (error) {
      toast.error(error.message);
      setProducts((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, show_in_checkout: !next } : x))
      );
    } else {
      toast.success(
        next
          ? language === "es" ? "Visible en checkout" : "Visible in checkout"
          : language === "es" ? "Oculto en checkout" : "Hidden from checkout"
      );
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = products.findIndex((p) => p.id === active.id);
    const newIdx = products.findIndex((p) => p.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    setProducts((prev) => arrayMove(prev, oldIdx, newIdx));
  };

  const saveOrder = async () => {
    setSavingOrder(true);
    try {
      const updates = products.map((p, i) => ({ id: p.id, sort_order: (i + 1) * 10 }));
      // Sequential updates (RLS-safe; products table has no upsert-friendly unique key besides id)
      for (const u of updates) {
        const { error } = await supabase
          .from("products")
          .update({ sort_order: u.sort_order })
          .eq("id", u.id);
        if (error) throw error;
      }
      toast.success(language === "es" ? "Orden guardado ✓" : "Order saved ✓");
      setReorderMode(false);
      fetchProducts();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingOrder(false);
    }
  };

  const stockColor = (p: Product) => {
    if (p.stock_count === 0) return "var(--red)";
    if (p.stock_count <= p.low_stock_threshold) return "var(--yellow)";
    return "var(--green)";
  };

  const stockBg = (p: Product) => {
    if (p.stock_count === 0) return "rgba(248,113,113,0.12)";
    if (p.stock_count <= p.low_stock_threshold) return "rgba(251,191,36,0.12)";
    return "rgba(126,200,164,0.12)";
  };

  return (
    <div
      className="min-h-screen pb-8 mx-auto w-full"
      style={{ maxWidth: 430, background: "var(--bg-base)", paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {/* Header */}
      <div className="sticky top-0 z-10" style={{ background: "var(--bg-base)" }}>
        <SubpageHeader
          title={t("inventory.title")}
          onBack={() => navigate("/admin?tab=menu")}
          actions={reorderMode ? (
            <button
              onClick={saveOrder}
              disabled={savingOrder}
              className="px-3 py-2 rounded-xl flex items-center gap-1.5 text-xs font-bold"
              style={{ background: "var(--accent-color)", color: "var(--cta-fg)", opacity: savingOrder ? 0.6 : 1 }}
            >
              {savingOrder ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {language === "es" ? "Guardar" : "Save"}
            </button>
          ) : (
            <>
              <button
                onClick={() => setReorderMode(true)}
                className="p-2 rounded-xl mr-1"
                style={{ background: "var(--bg-surface-2)" }}
                title={language === "es" ? "Reordenar" : "Reorder"}
              >
                <ArrowUpDown size={20} style={{ color: "var(--text-primary)" }} />
              </button>
              <button
                onClick={openAdd}
                className="p-2 rounded-xl"
                style={{ background: "var(--accent-dim)" }}
              >
                <PackagePlus size={22} style={{ color: "var(--accent-color)" }} />
              </button>
            </>
          )}
        />

        <div className="px-4 pb-3">
        {reorderMode ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              {language === "es"
                ? "Arrastra para reordenar. Usa el ojo para mostrar/ocultar."
                : "Drag to reorder. Tap the eye to show/hide."}
            </p>
            <button
              onClick={() => { setReorderMode(false); fetchProducts(); }}
              className="text-[12px] font-medium px-2 py-1"
              style={{ color: "var(--text-tertiary)" }}
            >
              {language === "es" ? "Cancelar" : "Cancel"}
            </button>
          </div>
        ) : (
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: "var(--bg-surface-2)" }}
          >
            <Search size={16} style={{ color: "var(--text-tertiary)" }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("common.search") + "..."}
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: "var(--text-primary)" }}
            />
          </div>
        )}
        </div>
      </div>

      {/* Product list */}
      <div className="px-4 mt-2">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent-color)" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Package size={48} style={{ color: "var(--text-tertiary)" }} />
            <p className="text-sm text-center" style={{ color: "var(--text-secondary)" }}>
              {search ? t("common.noResults") : t("inventory.empty")}
            </p>
          </div>
        ) : reorderMode ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={filtered.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <div className="rounded-xl overflow-hidden card-elevated">
                {filtered.map((p, i) => (
                  <SortableRow
                    key={p.id}
                    p={p}
                    isLast={i === filtered.length - 1}
                    stockColor={stockColor(p)}
                    stockBg={stockBg(p)}
                    onToggleVisibility={(e) => toggleVisibility(p, e)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="rounded-xl overflow-hidden card-elevated">
            {filtered.map((p, i) => (
              <button
                key={p.id}
                onClick={() => openEdit(p)}
                className="flex items-center w-full px-4 py-3 gap-3 text-left transition-colors"
                style={{
                  borderBottom: i < filtered.length - 1 ? "1px solid var(--divider)" : "none",
                  opacity: p.show_in_checkout ? 1 : 0.55,
                }}
              >
                <div
                  className="w-11 h-11 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0"
                  style={{ background: "var(--bg-surface-2)" }}
                >
                  {p.image_url ? (
                    <img loading="lazy" decoding="async"
                      src={`${SUPABASE_URL}/storage/v1/object/public/product-images/${p.image_url}?t=${new Date(p.updated_at).getTime()}`}
                      alt={p.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package size={18} style={{ color: "var(--text-tertiary)" }} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                      {p.name}
                    </span>
                    {!p.show_in_checkout && (
                      <EyeOff size={12} style={{ color: "var(--text-tertiary)" }} />
                    )}
                    {p.category && (
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-md flex-shrink-0"
                        style={{ background: "var(--accent-dim)", color: "var(--accent-color)" }}
                      >
                        {p.category}
                      </span>
                    )}
                    {p.eligible_for_commission === false && (
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-md flex-shrink-0"
                        style={{ background: "var(--bg-surface-2)", color: "var(--text-tertiary)" }}
                        title="Este producto no genera comisión al barbero"
                      >
                        Sin comisión
                      </span>
                    )}
                  </div>
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    ${(p.price_cents / 100).toFixed(2)}
                  </span>
                </div>

                <div
                  className="px-2 py-1 rounded-md text-xs font-bold flex-shrink-0"
                  style={{ background: stockBg(p), color: stockColor(p) }}
                >
                  {p.stock_count}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Centered Popup */}
      <AnimatePresence>
        {sheetOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50"
              style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
              onClick={() => setSheetOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: "spring", damping: 28, stiffness: 340 }}
              className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-6"
            >
              <div
                className="pointer-events-auto w-full max-w-[340px] max-h-[85vh] overflow-y-auto"
                style={{ background: "#ffffff", borderRadius: 28, boxShadow: "0 25px 60px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.08)", padding: "28px 24px 24px" }}
              >
                <div className="flex justify-end mb-2">
                  <button onClick={() => setSheetOpen(false)} className="p-1">
                    <X size={20} style={{ color: "rgba(0,0,0,0.3)" }} />
                  </button>
                </div>
                <div className="flex justify-center mb-4">
                  <span className="text-[11px] font-semibold tracking-wide px-3.5 py-1" style={{ borderRadius: 10, background: "rgba(201,168,130,0.15)", color: "rgba(160,128,96,1)" }}>
                    {editingProduct ? t("common.edit") : t("common.add")}
                  </span>
                </div>
                <h2 className="text-center uppercase mb-1" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-1px", lineHeight: 1.2, color: "#111111" }}>
                  {t("inventory.title")}
                </h2>
                <p className="text-[13px] text-center mb-5" style={{ color: "rgba(0,0,0,0.45)" }}>
                  {editingProduct
                    ? (t("inventory.description") || "Update product details")
                    : (language === "es" ? "Añade un nuevo producto" : "Add a new product")}
                </p>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-32 rounded-xl mb-4 flex flex-col items-center justify-center gap-2 overflow-hidden"
                  style={{ background: "rgba(0,0,0,0.04)", border: "1px dashed rgba(0,0,0,0.15)" }}
                >
                  {imagePreview ? (
                    <img loading="lazy" decoding="async" src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <ImagePlus size={28} style={{ color: "rgba(0,0,0,0.3)" }} />
                      <span className="text-xs" style={{ color: "rgba(0,0,0,0.3)" }}>
                        {t("inventory.addImage")}
                      </span>
                    </>
                  )}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />

                <div className="space-y-3">
                  <Field label={t("inventory.name") + " *"} value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t("inventory.price") + " *"} value={form.price} onChange={(v) => setForm({ ...form, price: v })} type="number" prefix="$" />
                    <Field label={t("inventory.stock") + " *"} value={form.stock} onChange={(v) => setForm({ ...form, stock: v })} type="number" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t("inventory.cost") + " *"} value={form.cost} onChange={(v) => setForm({ ...form, cost: v })} type="number" prefix="$" />
                    <Field label={t("inventory.commission")} value={form.commission} onChange={(v) => setForm({ ...form, commission: v })} type="number" suffix="%" />
                  </div>
                  <Field label={t("inventory.category")} value={form.category} onChange={(v) => setForm({ ...form, category: v })} />
                  <Field label={t("inventory.description")} value={form.description} onChange={(v) => setForm({ ...form, description: v })} multiline />

                  {/* Commission eligibility toggle — barber gets commission ONLY when ON.
                      Use OFF for passive items like snacks/drinks that the client picks up themselves. */}
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, eligibleForCommission: !form.eligibleForCommission })}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left"
                    style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.08)" }}
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold" style={{ color: "#111111" }}>
                        Comisión al barbero
                      </div>
                      <div className="text-[11px] leading-tight mt-0.5" style={{ color: "rgba(0,0,0,0.5)" }}>
                        Apaga para dulces, refrescos o consumo pasivo en sala de espera.
                      </div>
                    </div>
                    <span
                      className="relative flex-shrink-0 transition-colors"
                      style={{
                        width: 38, height: 22, borderRadius: 999,
                        background: form.eligibleForCommission ? "#16a34a" : "rgba(0,0,0,0.2)",
                      }}
                    >
                      <span
                        className="absolute top-[2px] transition-all"
                        style={{
                          width: 18, height: 18, borderRadius: 999, background: "#fff",
                          left: form.eligibleForCommission ? 18 : 2,
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                        }}
                      />
                    </span>
                  </button>
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full mt-5 text-center font-semibold transition-all active:scale-[0.97] flex items-center justify-center gap-2"
                  style={{ background: "#111111", color: "#ffffff", fontSize: 13, padding: "10px 0", borderRadius: "var(--radius-control)", opacity: saving ? 0.6 : 1 }}
                >
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  {t("common.save")}
                </button>

                {editingProduct && (
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="w-full mt-3 text-center font-semibold transition-all active:scale-[0.97] flex items-center justify-center gap-2"
                    style={{ background: "transparent", color: "#ef4444", fontSize: 13, padding: "10px 0", borderRadius: "var(--radius-control)", opacity: deleting ? 0.6 : 1 }}
                  >
                    {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    {t("common.delete")}
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Sortable row used in reorder mode ─── */
function SortableRow({
  p,
  isLast,
  stockColor,
  stockBg,
  onToggleVisibility,
}: {
  p: Product;
  isLast: boolean;
  stockColor: string;
  stockBg: string;
  onToggleVisibility: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    borderBottom: isLast ? "none" : "1px solid var(--divider)",
    background: isDragging ? "var(--bg-surface-2)" : "transparent",
    opacity: isDragging ? 0.85 : p.show_in_checkout ? 1 : 0.55,
    zIndex: isDragging ? 10 : "auto",
    position: "relative",
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center w-full px-2 py-3 gap-2">
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="p-2 touch-none cursor-grab active:cursor-grabbing"
        aria-label="Drag"
      >
        <GripVertical size={18} style={{ color: "var(--text-tertiary)" }} />
      </button>

      {/* Thumbnail */}
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0"
        style={{ background: "var(--bg-surface-2)" }}
      >
        {p.image_url ? (
          <img loading="lazy" decoding="async"
            src={`${SUPABASE_URL}/storage/v1/object/public/product-images/${p.image_url}?t=${new Date(p.updated_at).getTime()}`}
            alt={p.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <Package size={16} style={{ color: "var(--text-tertiary)" }} />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold truncate block" style={{ color: "var(--text-primary)" }}>
          {p.name}
        </span>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          ${(p.price_cents / 100).toFixed(2)}
        </span>
      </div>

      {/* Stock badge */}
      <div
        className="px-2 py-1 rounded-md text-xs font-bold flex-shrink-0"
        style={{ background: stockBg, color: stockColor }}
      >
        {p.stock_count}
      </div>

      {/* Visibility toggle */}
      <button
        onClick={onToggleVisibility}
        className="p-2 rounded-lg flex-shrink-0"
        style={{
          background: p.show_in_checkout ? "var(--accent-dim)" : "var(--bg-surface-2)",
        }}
        aria-label={p.show_in_checkout ? "Hide from checkout" : "Show in checkout"}
      >
        {p.show_in_checkout ? (
          <Eye size={16} style={{ color: "var(--accent-color)" }} />
        ) : (
          <EyeOff size={16} style={{ color: "var(--text-tertiary)" }} />
        )}
      </button>
    </div>
  );
}

/* Reusable field */
function Field({
  label,
  value,
  onChange,
  type = "text",
  prefix,
  suffix,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  prefix?: string;
  suffix?: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
        {label}
      </label>
      <div
        className="flex items-center rounded-xl px-3"
        style={{ background: "var(--bg-surface-2)" }}
      >
        {prefix && (
          <span className="text-sm mr-1" style={{ color: "var(--text-tertiary)" }}>
            {prefix}
          </span>
        )}
        {multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={2}
            className="flex-1 bg-transparent text-sm py-2 outline-none resize-none"
            style={{ color: "var(--text-primary)" }}
          />
        ) : (
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 bg-transparent text-sm py-2 outline-none"
            style={{ color: "var(--text-primary)" }}
          />
        )}
        {suffix && (
          <span className="text-sm ml-1" style={{ color: "var(--text-tertiary)" }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
