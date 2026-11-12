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
  /** Local service uuid: native appointments have no Acuity service_id. */
  service_ref_id?: string | null;
  duration_minutes?: number;
}
