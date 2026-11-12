export interface PortalAppointment {
  id: string;
  service_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  barber_id: string;
  barber_name: string;
  barber_color: string | null;
  acuity_id: number;
  service_id?: number | null;
  duration_minutes?: number;
}
