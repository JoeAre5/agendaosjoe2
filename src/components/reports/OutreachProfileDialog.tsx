import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, PencilLine } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { readAllRowsBounded } from "@/lib/retentionPagination";
import { selectVisitAppointments, type VisitAppointment } from "@/lib/clientRankings";
import { contactEmail } from "../../../supabase/functions/_shared/contactEmail";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Appointment = VisitAppointment & { service_name: string | null };
type Props = {
  clientId: string;
  es: boolean;
  barbers: { id: string; name: string }[];
  onClose: () => void;
};

/** Read-only, on-demand inspection by local UUID, never inferred identity or financial statistics. */
export function OutreachProfileDialog({ clientId, es, barbers, onClose }: Props) {
  const { user, role, isOwner } = useAuth();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["outreach", "profile-preview", user?.id, role, clientId],
    enabled: !!user,
    staleTime: 0,
    queryFn: async () => {
      const [profile, history] = await Promise.all([
        supabase.from("clients")
          .select("id,first_name,last_name,phone,email,notes,preferred_barber_id,date_of_birth")
          .eq("id", clientId).single(),
        readAllRowsBounded<Appointment>(
          () => supabase.from("appointments").select("id", { count: "exact", head: true }).eq("client_id", clientId),
          (from, to) => supabase.from("appointments")
            .select("id,starts_at,status,barber_id,service_name")
            .eq("client_id", clientId).order("starts_at", { ascending: false }).order("id")
            .range(from, to).returns<Appointment[]>(),
        ),
      ]);
      if (profile.error || !profile.data || history.error) throw new Error("profile_unavailable");
      return { profile: profile.data, appointments: history.data };
    },
  });
  const profile = query.data?.profile;
  const visits = selectVisitAppointments(query.data?.appointments ?? []);
  const name = profile ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") : (es ? "Perfil del cliente" : "Client profile");
  const email = contactEmail(profile?.email);
  const barberName = (id: string) => barbers.find((b) => b.id === id)?.name ?? (es ? "Barbero" : "Barber");
  const formatDate = (date: string) => new Date(date).toLocaleDateString(es ? "es-PR" : "en-US", {
    day: "numeric", month: "short", year: "numeric", timeZone: "America/Puerto_Rico",
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md max-h-[85dvh] overflow-y-auto rounded-lg">
        <DialogHeader className="text-left pr-6">
          <DialogTitle className="leading-normal break-words tracking-normal">{name}</DialogTitle>
          <DialogDescription>{es ? "Resumen del perfil" : "Profile summary"}</DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <div role="status" aria-label={es ? "Cargando perfil" : "Loading profile"} className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : query.isError ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-muted-foreground">{es ? "No se pudo cargar el perfil completo." : "Could not load the complete profile."}</p>
            <Button variant="outline" onClick={() => void query.refetch()}>{es ? "Reintentar" : "Retry"}</Button>
          </div>
        ) : profile ? (
          <>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-3 text-sm">
              <dt className="text-muted-foreground">{es ? "Teléfono" : "Phone"}</dt>
              <dd className="text-right break-words">{profile.phone || (es ? "Sin teléfono" : "No phone")}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="text-right break-all">{email || (es ? "Sin email" : "No email")}</dd>
              <dt className="text-muted-foreground">{es ? "Visitas pasadas" : "Past visits"}</dt>
              <dd className="text-right tabular-nums">{visits.length}</dd>
              <dt className="text-muted-foreground">{es ? "Última visita" : "Last visit"}</dt>
              <dd className="text-right">{visits[0] ? formatDate(visits[0].starts_at) : (es ? "Sin visitas" : "No visits")}</dd>
              {profile.preferred_barber_id && <>
                <dt className="text-muted-foreground">{es ? "Preferencia" : "Preferred barber"}</dt>
                <dd className="text-right break-words">{barberName(profile.preferred_barber_id)}</dd>
              </>}
              {profile.date_of_birth && <>
                <dt className="text-muted-foreground">{es ? "Cumpleaños" : "Birthday"}</dt>
                <dd className="text-right">{formatDate(`${profile.date_of_birth}T12:00:00-04:00`)}</dd>
              </>}
            </dl>
            <section className="border-t border-border pt-4 space-y-2">
              <h3 className="text-sm font-semibold">{es ? "Notas" : "Notes"}</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{profile.notes || (es ? "Sin notas" : "No notes")}</p>
            </section>
            <section className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold mb-3">{es ? "Visitas recientes" : "Recent visits"}</h3>
              <ul className="space-y-3">
                {visits.slice(0, 5).map((appointment) => (
                  <li key={appointment.id} className="flex items-start justify-between gap-4 text-sm">
                    <div className="min-w-0"><p className="break-words">{appointment.service_name || (es ? "Cita" : "Appointment")}</p><p className="text-xs text-muted-foreground">{barberName(appointment.barber_id)}</p></div>
                    <time className="shrink-0 text-xs text-muted-foreground" dateTime={appointment.starts_at}>{formatDate(appointment.starts_at)}</time>
                  </li>
                ))}
              </ul>
            </section>
            {isOwner && <Button variant="outline" className="w-full" onClick={() => { onClose(); navigate(`/admin/clients?client=${encodeURIComponent(clientId)}`); }}>
              <PencilLine className="h-4 w-4" />{es ? "Editar perfil" : "Edit profile"}
            </Button>}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}