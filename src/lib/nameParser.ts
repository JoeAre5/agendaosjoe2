/**
 * Parser inteligente para el campo único "Nombre completo" del flujo público de reservas.
 *
 * Reglas (aprobadas por owner):
 *  - El usuario escribe UN solo input ("Charlie" o "Charlie Corchado Rivera").
 *  - greetingName = primera palabra → para saludos en push/email ("Hola Charlie").
 *  - fullName     = string completo limpio → para recibos, confirmaciones, Acuity.
 *  - firstName / lastName se derivan para mantener compat con el backend existente
 *    (`findOrCreateClient`, columnas `clients.first_name` / `clients.last_name`,
 *    Acuity API). El primer token va a `firstName`; el resto unido va a `lastName`
 *    (o `null` si solo hay una palabra).
 *
 * Ejemplos:
 *   parseName("Charlie")                     → { fullName:"Charlie",                   greetingName:"Charlie", firstName:"Charlie", lastName:null }
 *   parseName("  Charlie   Corchado  ")      → { fullName:"Charlie Corchado",          greetingName:"Charlie", firstName:"Charlie", lastName:"Corchado" }
 *   parseName("Charlie Corchado Rivera")     → { fullName:"Charlie Corchado Rivera",   greetingName:"Charlie", firstName:"Charlie", lastName:"Corchado Rivera" }
 *   parseName("")                            → { fullName:"", greetingName:"", firstName:"", lastName:null }
 */

export interface ParsedName {
  fullName: string;
  greetingName: string;
  firstName: string;
  lastName: string | null;
}

export function parseName(input: string | null | undefined): ParsedName {
  const clean = (input || "").trim().replace(/\s+/g, " ");
  if (!clean) {
    return { fullName: "", greetingName: "", firstName: "", lastName: null };
  }
  const parts = clean.split(" ");
  const firstName = parts[0];
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
  return {
    fullName: clean,
    greetingName: firstName,
    firstName,
    lastName,
  };
}
