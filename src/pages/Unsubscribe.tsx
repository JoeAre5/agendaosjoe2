import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle, MailX } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const FN_URL = `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe`;

type State =
  | { kind: 'loading' }
  | { kind: 'valid' }
  | { kind: 'already' }
  | { kind: 'invalid' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({ kind: 'invalid' });
      return;
    }
    const validate = async () => {
      try {
        const res = await fetch(`${FN_URL}?token=${encodeURIComponent(token)}`, {
          headers: { apikey: SUPABASE_ANON_KEY },
        });
        const data = await res.json();
        if (!res.ok) {
          setState({ kind: 'invalid' });
          return;
        }
        if (data?.valid === false && data?.reason === 'already_unsubscribed') {
          setState({ kind: 'already' });
          return;
        }
        if (data?.valid === true) {
          setState({ kind: 'valid' });
          return;
        }
        setState({ kind: 'invalid' });
      } catch {
        setState({ kind: 'error', message: 'No pudimos validar el enlace.' });
      }
    };
    validate();
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setState({ kind: 'submitting' });
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (res.ok && data?.success) {
        setState({ kind: 'success' });
      } else if (data?.reason === 'already_unsubscribed') {
        setState({ kind: 'already' });
      } else {
        setState({ kind: 'error', message: data?.error || 'No se pudo procesar.' });
      }
    } catch {
      setState({ kind: 'error', message: 'Error de red.' });
    }
  };

  return (
    <>
      <SEOHead
        title="Cancelar suscripción | Charlie's Barbershop"
        description="Gestiona tus preferencias de correo de Charlie's Barbershop."
      />
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.02] p-8 backdrop-blur">
          {state.kind === 'loading' && (
            <div className="flex flex-col items-center text-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-white/60" />
              <p className="text-sm text-white/60">Validando enlace…</p>
            </div>
          )}

          {state.kind === 'valid' && (
            <div className="text-center">
              <MailX className="h-10 w-10 mx-auto mb-4 text-white/80" />
              <h1 className="text-xl font-semibold mb-2">Cancelar suscripción</h1>
              <p className="text-sm text-white/60 mb-6">
                ¿Confirmas que ya no deseas recibir correos de Charlie's Barbershop?
              </p>
              <button
                onClick={confirm}
                className="w-full rounded-xl bg-white text-black font-medium py-3 hover:bg-white/90 transition"
              >
                Confirmar cancelación
              </button>
              <Link
                to="/"
                className="block mt-4 text-xs text-white/50 hover:text-white/80"
              >
                Volver al inicio
              </Link>
            </div>
          )}

          {state.kind === 'submitting' && (
            <div className="flex flex-col items-center text-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-white/60" />
              <p className="text-sm text-white/60">Procesando…</p>
            </div>
          )}

          {state.kind === 'success' && (
            <div className="text-center">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-4 text-emerald-400" />
              <h1 className="text-xl font-semibold mb-2">Suscripción cancelada</h1>
              <p className="text-sm text-white/60 mb-6">
                No recibirás más correos de marketing. Las notificaciones de citas y
                pagos se mantendrán activas.
              </p>
              <Link
                to="/"
                className="inline-block rounded-xl border border-white/15 px-5 py-2.5 text-sm hover:bg-white/5"
              >
                Volver al inicio
              </Link>
            </div>
          )}

          {state.kind === 'already' && (
            <div className="text-center">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-4 text-white/60" />
              <h1 className="text-xl font-semibold mb-2">Ya estás cancelado</h1>
              <p className="text-sm text-white/60 mb-6">
                Esta dirección ya fue dada de baja anteriormente.
              </p>
              <Link
                to="/"
                className="inline-block rounded-xl border border-white/15 px-5 py-2.5 text-sm hover:bg-white/5"
              >
                Volver al inicio
              </Link>
            </div>
          )}

          {state.kind === 'invalid' && (
            <div className="text-center">
              <AlertCircle className="h-10 w-10 mx-auto mb-4 text-amber-400" />
              <h1 className="text-xl font-semibold mb-2">Enlace inválido</h1>
              <p className="text-sm text-white/60 mb-6">
                Este enlace de cancelación no es válido o ha expirado.
              </p>
              <Link
                to="/"
                className="inline-block rounded-xl border border-white/15 px-5 py-2.5 text-sm hover:bg-white/5"
              >
                Volver al inicio
              </Link>
            </div>
          )}

          {state.kind === 'error' && (
            <div className="text-center">
              <AlertCircle className="h-10 w-10 mx-auto mb-4 text-red-400" />
              <h1 className="text-xl font-semibold mb-2">Algo salió mal</h1>
              <p className="text-sm text-white/60 mb-6">{state.message}</p>
              <button
                onClick={() => window.location.reload()}
                className="inline-block rounded-xl border border-white/15 px-5 py-2.5 text-sm hover:bg-white/5"
              >
                Reintentar
              </button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
