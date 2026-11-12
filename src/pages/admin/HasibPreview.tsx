import { useState } from "react";
import { Building2, ChevronDown, Check, Store, FileText, Palette } from "lucide-react";

// Vista previa visual de los módulos A–E de la rama de Hasib.
// Solo datos de muestra en memoria: no lee ni escribe en la base de datos.
const SHOPS = [
  { id: "1", name: "Charlie's Barbershop", city: "Camuy, PR", color: "hsl(var(--primary))", barbers: 3 },
  { id: "2", name: "Barbería Demo Norte", city: "Arecibo, PR", color: "hsl(var(--accent))", barbers: 2 },
  { id: "3", name: "Barbería Demo Sur", city: "Ponce, PR", color: "hsl(var(--muted-foreground))", barbers: 4 },
];

function Section({ letter, title, children }: { letter: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">{letter}</span>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function HasibPreview() {
  const [shop, setShop] = useState(SHOPS[0]);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: "", phone: "", address: "" });

  return (
    <div className="mx-auto max-w-[430px] min-h-screen bg-background px-4 pb-16 pt-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Vista previa: módulos de Hasib</h1>
        <p className="text-sm text-muted-foreground">Solo demostración. Datos de muestra, nada se guarda ni afecta Acuity, citas o pagos.</p>
      </header>

      <Section letter="A" title="Identidad y marca de la tienda">
        <div className="rounded-xl bg-muted p-4 flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ background: shop.color }}>
            <Palette className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <p className="font-semibold tracking-wide text-foreground uppercase">{shop.name}</p>
            <p className="text-xs text-muted-foreground">Logo y color cambian según la tienda elegida</p>
          </div>
        </div>
      </Section>

      <Section letter="B" title="Selector de tiendas">
        <div className="relative">
          <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm text-foreground">
            <span className="flex items-center gap-2"><Store className="h-4 w-4" />{shop.name}</span>
            <ChevronDown className="h-4 w-4" />
          </button>
          {open && (
            <div className="absolute z-10 mt-1 w-full rounded-xl border border-border bg-popover p-1">
              {SHOPS.map((s) => (
                <button key={s.id} onClick={() => { setShop(s); setOpen(false); }} className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm text-popover-foreground hover:bg-muted">
                  {s.name}{s.id === shop.id && <Check className="h-4 w-4" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </Section>

      <Section letter="C" title="Registro de nueva barbería">
        <p className="text-xs text-muted-foreground">Paso {step + 1} de 3</p>
        {step === 0 && <input className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground" placeholder="Nombre de la barbería" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
        {step === 1 && <input className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground" placeholder="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}
        {step === 2 && <input className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground" placeholder="Dirección" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />}
        <div className="flex gap-2">
          {step > 0 && <button onClick={() => setStep(step - 1)} className="flex-1 rounded-xl border border-border py-2.5 text-sm text-foreground">Atrás</button>}
          <button onClick={() => setStep(step < 2 ? step + 1 : 0)} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground">{step < 2 ? "Siguiente" : "Terminar (demo)"}</button>
        </div>
      </Section>

      <Section letter="D" title="Lista de sucursales">
        <div className="divide-y divide-border">
          {SHOPS.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" /><div><p className="text-sm text-foreground">{s.name}</p><p className="text-xs text-muted-foreground">{s.city}</p></div></div>
              <span className="text-xs text-muted-foreground">{s.barbers} barberos</span>
            </div>
          ))}
        </div>
      </Section>

      <Section letter="E" title="Recibo con la marca de la tienda">
        <div className="rounded-xl border border-border p-4 space-y-2 text-sm">
          <div className="flex items-center gap-2 border-b border-border pb-2"><FileText className="h-4 w-4" /><span className="font-semibold uppercase text-foreground">{shop.name}</span></div>
          <div className="flex justify-between text-foreground"><span>Cliente</span><span>Juan Bobo</span></div>
          <div className="flex justify-between text-foreground"><span>Corte</span><span>$30.00</span></div>
          <div className="flex justify-between font-semibold text-foreground border-t border-border pt-2"><span>Total</span><span>$30.00</span></div>
          <p className="text-xs text-muted-foreground">Ejemplo, no es un recibo real.</p>
        </div>
      </Section>
    </div>
  );
}
