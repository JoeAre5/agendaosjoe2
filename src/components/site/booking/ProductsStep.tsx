import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Minus, ChevronDown, Gift, Package, Candy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

/** Resolve a product `image_url` (stored as a relative path in `product-images` bucket) to a full public URL. */
function resolveProductImage(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
}

export interface PublicProduct {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price_cents: number;
  image_url: string | null;
  stock_count: number;
}

export type ProductCart = Record<string, number>; // productId → qty

export interface ProductLineItem {
  id: string;
  name: string;
  qty: number;
  price_cents: number;
  line_total_cents: number;
}

interface Props {
  cart: ProductCart;
  onChange: (next: ProductCart) => void;
  onContinue: () => void;
  accent: string;
  isEs: boolean;
  /** Emits whenever cart or product list changes — gives parent total + line items for summary/payment */
  onTotalChange?: (totalCents: number, items: ProductLineItem[]) => void;
  /** When true, suppress the internal Continue button (parent owns a sticky CTA). */
  hideContinue?: boolean;
}

const SNACK_CATEGORIES = ["Dulce", "Snack", "Snacks", "Bebida"];

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ProductsStep({ cart, onChange, onContinue, accent, isEs, onTotalChange, hideContinue = false }: Props) {
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [snacksOpen, setSnacksOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.functions
      .invoke("public-booking-create", { body: { action: "list-products" } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !Array.isArray(data)) {
          setProducts([]);
        } else {
          setProducts(data as PublicProduct[]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { beauty, snacks } = useMemo(() => {
    const b: PublicProduct[] = [];
    const s: PublicProduct[] = [];
    for (const p of products) {
      if (SNACK_CATEGORIES.includes(p.category || "")) s.push(p);
      else b.push(p);
    }
    return { beauty: b, snacks: s };
  }, [products]);

  // Top 2 beauty products (already sorted by sort_order from the edge function) =
  // hero cards. Single source of truth: admin reorders in Inventory tab → applies here.
  const heroBeauty = useMemo(() => beauty.slice(0, 2), [beauty]);
  const restBeauty = useMemo(() => beauty.slice(2), [beauty]);
  const [moreOpen, setMoreOpen] = useState(false);

  const lineItems = useMemo<ProductLineItem[]>(() => {
    return products
      .filter((p) => (cart[p.id] || 0) > 0)
      .map((p) => {
        const qty = cart[p.id] || 0;
        return {
          id: p.id,
          name: p.name,
          qty,
          price_cents: p.price_cents,
          line_total_cents: p.price_cents * qty,
        };
      });
  }, [cart, products]);

  const subtotalCents = useMemo(
    () => lineItems.reduce((acc, l) => acc + l.line_total_cents, 0),
    [lineItems]
  );

  // Notify parent so summary / payment / draft can include products
  useEffect(() => {
    onTotalChange?.(subtotalCents, lineItems);
  }, [subtotalCents, lineItems, onTotalChange]);

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  const setQty = (id: string, qty: number, max: number) => {
    const next = { ...cart };
    const clamped = Math.max(0, Math.min(qty, max));
    if (clamped <= 0) delete next[id];
    else next[id] = clamped;
    onChange(next);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 size={22} className="animate-spin" style={{ color: accent }} />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="space-y-5">
        <p className="text-center py-8 text-sm" style={{ color: "var(--text-secondary)" }}>
          {isEs ? "Sin productos disponibles ahora mismo" : "No products available right now"}
        </p>
        {!hideContinue && (
          <button
            onClick={onContinue}
            className="w-full py-3.5 rounded-xl text-sm font-bold active:scale-[0.97]"
            style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
            {isEs ? "Continuar" : "Continue"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Framed pitch — Apple/Sephora style */}
      <div
        className="rounded-xl px-4 py-3 flex items-center gap-3"
        style={{ background: `${accent}10`, border: `1px solid ${accent}25` }}>
        <Gift size={18} style={{ color: accent }} className="shrink-0 icon-bold" />
        <p className="text-[12px] leading-snug" style={{ color: "var(--text-primary)" }}>
          <strong>{isEs ? "Recoge en tu cita." : "Pick up at your appointment."}</strong>{" "}
          <span style={{ color: "var(--text-secondary)" }}>
            {isEs ? "Sin envíos, sin esperas." : "No shipping, no waiting."}
          </span>
        </p>
      </div>

      {/* Top 2 hero products — full cards, mirror inventory sort_order */}
      {heroBeauty.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {heroBeauty.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              qty={cart[p.id] || 0}
              accent={accent}
              isEs={isEs}
              onSet={(q) => setQty(p.id, q, p.stock_count)} />
          ))}
        </div>
      )}

      {/* "Ver más productos" — rest of beauty in an accordion (same pattern as snacks) */}
      {restBeauty.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface-2)" }}>
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left">
            <span className="inline-flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
              <Package size={14} className="icon-bold shrink-0" style={{ color: "var(--text-secondary)" }} />
              {isEs ? "Ver más productos" : "More products"} ({restBeauty.length})
            </span>
            <ChevronDown
              size={16}
              style={{
                color: "var(--text-tertiary)",
                transform: moreOpen ? "rotate(180deg)" : "rotate(0)",
                transition: "transform 0.2s",
              }} />
          </button>
          {moreOpen && (
              <div
                
                
                className="overflow-hidden">
                <div className="grid grid-cols-2 gap-3 px-3 pb-3">
                  {restBeauty.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      qty={cart[p.id] || 0}
                      accent={accent}
                      isEs={isEs}
                      onSet={(q) => setQty(p.id, q, p.stock_count)} />
                  ))}
                </div>
              </div>
            )}
        </div>
      )}

      {/* Snacks accordion — collapsed by default to not compete with high-margin upsell */}
      {snacks.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface-2)" }}>
          <button
            onClick={() => setSnacksOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left">
            <span className="inline-flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
              <Candy size={14} className="icon-bold shrink-0" style={{ color: "var(--text-secondary)" }} />
              {isEs ? "Snacks y dulces" : "Snacks & treats"} ({snacks.length})
            </span>
            <ChevronDown
              size={16}
              style={{
                color: "var(--text-tertiary)",
                transform: snacksOpen ? "rotate(180deg)" : "rotate(0)",
                transition: "transform 0.2s",
              }} />
          </button>
          {snacksOpen && (
              <div
                
                
                className="overflow-hidden">
                <div className="grid grid-cols-2 gap-3 px-3 pb-3">
                  {snacks.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      qty={cart[p.id] || 0}
                      accent={accent}
                      isEs={isEs}
                      onSet={(q) => setQty(p.id, q, p.stock_count)} />
                  ))}
                </div>
              </div>
            )}
        </div>
      )}

      {/* Sticky-ish CTA footer */}
      <div className="pt-2 space-y-2">
        {cartCount > 0 && (
          <div
            className="flex items-center justify-between px-4 py-3 rounded-xl"
            style={{ background: `${accent}12` }}>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {isEs ? "Productos en tu orden" : "Products in your order"} ({cartCount})
            </span>
            <span className="text-[15px] font-extrabold" style={{ color: accent }}>
              {fmt(subtotalCents)}
            </span>
          </div>
        )}
        {!hideContinue && (
          <button
            onClick={onContinue}
            className="w-full py-3.5 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
            style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
            {cartCount > 0
              ? isEs ? `Continuar · ${fmt(subtotalCents)}` : `Continue · ${fmt(subtotalCents)}`
              : isEs ? "Continuar" : "Continue"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Card ─── */
function ProductCard({
  product: p,
  qty,
  accent,
  isEs,
  onSet,
}: {
  product: PublicProduct;
  qty: number;
  accent: string;
  isEs: boolean;
  onSet: (qty: number) => void;
}) {
  const inCart = qty > 0;
  const atMax = qty >= p.stock_count;
  const lowStock = p.stock_count <= 3;

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{
        background: "var(--bg-surface)",
        border: inCart ? `1.5px solid var(--cta-bg)` : `1.5px solid var(--divider)`,
        transition: "border-color 0.2s",
      }}>
      {/* Image (1:1) */}
      <div
        className="aspect-square w-full flex items-center justify-center"
        style={{ background: "var(--bg-surface)" }}>
        {p.image_url ? (
          <img
            src={resolveProductImage(p.image_url) || ""}
            alt={p.name}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async" />
        ) : (
          <Package size={28} style={{ color: "var(--text-tertiary)", opacity: 0.5 }} />
        )}
      </div>

      {/* Body */}
      <div className="px-3 pt-2 pb-3 flex-1 flex flex-col justify-between gap-2">
        <div>
          <p
            className="text-[13px] font-bold leading-tight"
            style={{
              color: "var(--text-primary)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}>
            {p.name}
          </p>
          <p className="text-[13px] font-extrabold mt-1" style={{ color: "var(--text-primary)" }}>
            ${(p.price_cents / 100).toFixed(2)}
          </p>
          {lowStock && !inCart && (
            <p className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>
              {isEs ? `Solo ${p.stock_count} disp.` : `Only ${p.stock_count} left`}
            </p>
          )}
        </div>

        {/* CTA / stepper — theme CTA tokens (black on light, beige on dark) */}
        {!inCart ? (
          <button
            onClick={() => onSet(1)}
            className="w-full py-2 rounded-lg text-[12px] font-bold active:scale-[0.97] transition-transform flex items-center justify-center gap-1"
            style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
            <Plus size={14} className="icon-extrabold" />
            {isEs ? "Añadir" : "Add"}
          </button>
        ) : (
          <div
            className="w-full flex items-center justify-between rounded-lg overflow-hidden"
            style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
            <button
              onClick={() => onSet(qty - 1)}
              className="px-3 py-2 active:opacity-70"
              aria-label={isEs ? "Quitar" : "Remove"}>
              <Minus size={14} className="icon-extrabold" />
            </button>
            <span className="text-[13px] font-extrabold tabular-nums">{qty}</span>
            <button
              onClick={() => onSet(qty + 1)}
              disabled={atMax}
              className="px-3 py-2 active:opacity-70 disabled:opacity-40"
              aria-label={isEs ? "Añadir" : "Add"}>
              <Plus size={14} className="icon-extrabold" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
