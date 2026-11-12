// Identificador del servicio de una cita para armar enlaces (reagendar, repetir cita).
// Una cita de Acuity guarda el id numerico del tipo de cita (service_id); una cita de la agenda
// nativa no tiene ese id y guarda el uuid del servicio local (service_ref_id). Si el enlace sale con
// el id vacio, la pantalla de reagendar no pide ninguna hora ("no veo disponibilidad").
export function serviceKey(a: { service_id?: number | null; service_ref_id?: string | null }): string {
  return String(a.service_id || a.service_ref_id || "");
}
