# Pull request: agenda nativa (independiente de Acuity)

Rama: `agenda-nativa` sobre el `main` de `charliesbarbershop-app/agendaos` (commit base `43edb69e`).
Un solo commit, 85 archivos, aditivo. **Subir este código no cambia la tienda a nativo**: la tienda sigue en Acuity hasta el paso 7 de abajo.

---

## Texto para pegar en el pull request

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

---

## Pasos para quien tenga acceso a la base (en orden)

Regla: **no pasar al siguiente paso si el anterior falló.** Nada de esto cambia la tienda a nativo hasta el paso 7.

### 0. Antes de empezar
- Ventana acordada con Charlie, preferible fuera de horario.
- **Respaldo / punto de restauración de Supabase** justo antes del paso 3.
- Decidir los correos duplicados (ver paso 8).

### 1. Comparar el esquema (solo lectura)
En el editor SQL, exportar CSV de:
```sql
select table_name t, column_name c from information_schema.columns where table_schema='public';
select distinct proname p from pg_proc where pronamespace='public'::regnamespace;
```
y correr `node scripts/compare-schema.mjs columnas.csv funciones.csv`. Debe decir "ninguna / ninguna / ninguna" salvo las columnas que agregan 0022 y 0027.

Comprobar también que existen: una sola fila activa en `shops`, `current_shop_id()`, `resolve_single_active_shop()`, `shop_memberships`, `get_internal_job_secret()`.

### 2. Ensayo (recomendado)
Restaurar el respaldo en un proyecto Supabase vacío y aplicar allí los pasos 3 a 6. Si falla, producción no se toca.

### 3. Aplicar migraciones, una por una
Pegar cada archivo de `drizzle/migrations` en el editor SQL, en el orden 0022 → 0027, y comprobar que termina sin error antes de seguir.
Después de cada una: `select count(*) from public.appointments;` debe dar el mismo número que antes.

### 4. Desplegar funciones
`native-scheduling`, `availability`, `public-booking-create`, `pay-then-book`, `seat-walkin`, `client-booking-refund`, `filho-agent`, `create-booking-checkout`, `athmovil-create-payment`, `acuity-sync`, `acuity-webhook`, `acuity-block-sync`, `acuity-sync-services`, `outbound-webhook-dispatch`.
`availability` y `outbound-webhook-dispatch` van con `verify_jwt = false` (ya en `supabase/config.toml`). Con la tienda aún en Acuity todo se comporta como antes.

### 5. Publicar el frontend
Fusionar el pull request. Con la tienda en Acuity la app se ve igual.

### 6. Webhooks hacia GoHighLevel (opcional, independiente del corte)
```sql
UPDATE public.outbound_webhook_config SET functions_base_url = 'https://<ref-produccion>.supabase.co/functions/v1';
INSERT INTO public.outbound_webhook_endpoints (name, url, event_types) VALUES ('GHL', '<url-de-ghl>', '{*}');
```
Mejor cargar el destino cuando la tienda ya sea nativa (mientras siga en Acuity, el sync de citas también dispararía eventos).

### 7. Corte de la tienda (solo con aprobación expresa de Charlie)
1. En el admin revisar servicios, complementos y horarios por barbero (hoy hay 6 filas repetidas por día; el editor las une al guardar). Cargar almuerzo y feriados.
2. Intervalo en 30 min: `UPDATE public.booking_rules SET slot_interval_minutes = 30 WHERE scope = 'global';`
3. `select native_cutover_check('<shop_id>');` debe dar `ready: true`.
4. Probar en otro navegador: reserva pública, pago de prueba, admin crear / mover / cancelar.
5. `select switch_shop_to_native('<shop_id>', '<user_id>');`
6. Cerrar el link público y los webhooks en Acuity.
7. Vigilar unos días: citas nuevas, pagos, correos, `outbound_webhook_events` (pendientes / fallidos).

**Reversa:** `select switch_shop_to_acuity('<shop_id>', '<user_id>');` (informa cuántas citas nativas futuras hay que pasar a mano a Acuity).

### 8. Correos duplicados
Si GoHighLevel envía confirmación y recordatorio: `UPDATE public.outbound_webhook_config SET app_booking_emails = false;` (para encender: `= true`).

### Pruebas obligatorias antes y después del corte
El pago bloquea al barbero correcto; 30 min + 1 h de complemento bloquean 1 h 30; sin dobles reservas; cancelar y reagendar liberan y bloquean bien; notificaciones, nómina, métricas del home y transacciones pendientes siguen funcionando; admin, barbero y cliente ven solo lo suyo. **PayPal y ATH Móvil se prueban en producción con importes mínimos antes del corte.**
