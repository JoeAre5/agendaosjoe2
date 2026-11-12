import { formatInTimeZone } from "date-fns-tz";

export function puertoRicoDate(value: Date | string = new Date()): string {
  return formatInTimeZone(value, "America/Puerto_Rico", "yyyy-MM-dd");
}

export function isBirthdayOn(dateOfBirth: string | null | undefined, appointmentDate: string): boolean {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return false;
  try {
    return dateOfBirth.slice(5) === puertoRicoDate(appointmentDate).slice(5);
  } catch { return false; }
}

export function birthdayLabel(dateOfBirth: string, language: string): string {
  return new Intl.DateTimeFormat(language === "es" ? "es-PR" : "en-US", {
    month: "long", day: "numeric", timeZone: "America/Puerto_Rico",
  }).format(new Date(`${dateOfBirth}T12:00:00-04:00`));
}