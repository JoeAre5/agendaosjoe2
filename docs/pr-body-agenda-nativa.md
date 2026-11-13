### Qué hace
Agrega un calendario propio dentro de la base y la app, para que reservar, reagendar, cancelar y cobrar no dependa de Acuity:

- Servicios, complementos, horarios (con almuerzo/horario partido) y excepciones por fecha (feriados, días libres) administrables desde el admin.
- Motor de disponibilidad (`availability`) con intervalo de 30 minutos por defecto.
- Reserva pública, reserva pagada (Stripe, PayPal, ATH Móvil), walk-in, reagendar y cancelar contra la base propia (`book_native_slot`, `reschedule_native_appointment`, `cancel_native_appointment`).
- Webhooks de salida (`outbound-webhook-dispatch`) con firma HMAC y reintentos, para que GoHighLevel envíe confirmaciones y recordatorios. Eventos: `booking.created / rescheduled / updated / cancelled / paid`, `service.*`, `addon.*`.
- Interruptor de correos de la app (`outbound_webhook_config.app_booking_emails`) para no duplicar los de GoHighLevel.
- Herramientas de corte por tienda: `native_cutover_check`, `switch_shop_to_native`, `switch_shop_to_acuity` (reversa).

### Qué NO hace
- No cambia ninguna tienda a nativo al aplicarse. `shops.booking_provider` sigue en `acuity`.
- No borra ni modifica datos existentes: las migraciones solo agregan.
- No toca triggers, restricciones ni funciones existentes de `appointments`.

### Migraciones (`drizzle/migrations`, en este orden)
| # | Contenido |
|---|---|
| 0022 | `acuity_id` opcional, referencias nativas en citas, índices, tablas de servicios/horarios/reglas nativas |
| 0023 | funciones de reservar / reprogramar / cancelar |
| 0024 | herramientas de corte y `get_shop_booking_provider()` |
| 0025 | webhooks de salida (no envía nada mientras no haya destinos) |
| 0026 | interruptor de correos de la app (encendido por defecto) |
| 0027 | `schedule_exceptions` y 30 min por defecto en reglas nuevas |

Cada una trae su "Rollback" en el encabezado.

### Pruebas
vitest 290 ✔, `vite build` ✔, `tsc` ✔, Deno (`_shared`) 38 ✔. Probado de punta a punta con Stripe en un proyecto de prueba que Charlie revisó.

### Riesgos conocidos
- Las migraciones se ensayaron sobre una reconstrucción de este esquema, no sobre una copia real: por eso el paso 2.
- Estados de cita: la base solo admite hoy `scheduled`, `completed`, `cancelled` (el CHECK y el trigger `validate_appointment_status` se contradicen para `no-show`); el código acepta ambas grafías y no depende de eso.
- `cancel-appointments-bulk` y `consolidate-recurring` siguen basadas en ids de Acuity; `filho-agent` solo se adaptó en cancelar y reagendar.
- La integración heredada `ghl_sync_queue` usa `extensions.http_post`, que no existe en esta base; los webhooks nuevos usan `net.http_post`.

### Cómo aplicarlo
Orden y comandos paso a paso en `docs/corte-a-produccion.md` (respaldo, migraciones una por una, funciones, corte y reversa). **No fusionar sin respaldo previo de la base.**
