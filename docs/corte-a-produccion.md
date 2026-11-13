# Corte a producción: agenda nativa + webhooks (procedimiento)

**Estado: nada de esto se ha ejecutado en producción.** Es el procedimiento para quien tenga acceso a la base de Charlie (por ejemplo Moisés). Se ensayó contra un proyecto de prueba con el esquema reconstruido (ver `docs/entorno-de-prueba.md`), que es una **aproximación**, no una copia de producción. Por eso el paso 1 es obligatorio.

Regla: nada se aplica a producción sin ensayo previo y sin aprobación expresa del cliente. Cada paso tiene reversa.

## 0. Antes de empezar
- Acordar una ventana con Charlie (mejor fuera de horario de atención) y confirmar quién puede deshacer cambios.
- Respaldo de la base (punto de restauración de Supabase) justo antes del paso 3.
- Decisión tomada sobre los correos duplicados (ver sección final).

## 1. Comparar el esquema real con lo que espera la app (solo lectura)
Con acceso de lectura a la base de producción:
```bash
npx supabase db query --read-only --remote=<ref-produccion> -o json "select table_name t, column_name c from information_schema.columns where table_schema='public'" > cols.json
npx supabase db query --read-only --remote=<ref-produccion> -o json "select distinct proname p from pg_proc where pronamespace='public'::regnamespace" > funcs.json
node scripts/compare-schema.mjs cols.json funcs.json
```
Debe terminar con "ninguna / ninguna / ninguna". Si falta algo, **no seguir**: corregir primero (por ejemplo, en el proyecto de prueba faltaba `transactions.gateway_fee_cents`, que producción sí tiene).

Comprobar también, con una consulta de lectura, que existen `shops` (una sola fila activa), `current_shop_id()`, `resolve_single_active_shop()`, `shop_memberships` y `get_internal_job_secret()`; las migraciones nuevas dependen de ellas.

## 2. Ensayo en un proyecto de prueba cargado con el volcado real
Idealmente con `supabase db dump --schema-only` de producción en un proyecto vacío, y aplicar allí los pasos 3 a 7. Si el ensayo falla, producción no se toca.

## 3. Aplicar migraciones (en orden, una por una, comprobando cada resultado)
`drizzle/migrations`: `0022`, `0023`, `0024`, `0025`, `0026`, `0027`. Todas son aditivas: no borran ni cambian datos y **no cambian ninguna tienda a nativo**.
- `0022` ids de Acuity opcionales y referencias nativas. `0023` funciones de reservar/reprogramar/cancelar. `0024` herramientas de corte y `get_shop_booking_provider()`.
- `0025` webhooks de salida (no envía nada mientras no haya destinos). `0026` interruptor de correos (encendido).
- `0027` excepciones de horario por fecha (tabla `schedule_exceptions`) y 30 min como valor por defecto de reglas nuevas.
Reversa de cada una: ver su comentario "Rollback" en el archivo.

## 4. Desplegar funciones
`native-scheduling`, `availability`, `public-booking-create`, `pay-then-book`, `seat-walkin`, `client-booking-refund`, `filho-agent`, `acuity-sync`, `acuity-webhook`, `acuity-block-sync`, `acuity-sync-services`, `outbound-webhook-dispatch` (`verify_jwt=false`, ya en `config.toml`). **No** desplegar `webhook-echo`. Con la tienda aún en Acuity, todo se comporta como antes.

## 5. Frontend
Publicar el commit actual de `main`. Con la tienda en Acuity la app no cambia. **Cuidado:** el `.env` del repo apunta a producción; los entornos de prueba deben usar sus propias variables.

## 6. Webhooks de salida (opcional, independiente del corte)
```sql
UPDATE public.outbound_webhook_config SET functions_base_url = 'https://<ref-produccion>.supabase.co/functions/v1';
INSERT INTO public.outbound_webhook_endpoints (name, url, event_types) VALUES ('GHL', '<url-de-ghl>', '{*}');
```
Aviso: **mientras la tienda siga en Acuity**, la sincronización escribe citas en la base y cada una dispararía eventos hacia GoHighLevel (incluidas ediciones que hace el sync). Recomendación: cargar el destino cuando la tienda pase a nativo, o filtrar `event_types` a lo que interese. Detalle en `docs/webhooks-gohighlevel.md`.

## 7. Corte de la tienda (solo con aprobación expresa)
1. Revisar el catálogo en el admin: servicios, complementos y horarios por barbero y de la tienda (hoy es lo que sincronizó Acuity). Definir ahí el **horario partido** (almuerzo, por ejemplo 9:00–12:00 y 13:00–17:00) y las **excepciones por fecha** (feriados, días libres).
   Poner el **intervalo de horas en 30 minutos**: las reglas ya guardadas conservan su valor (en producción puede ser 15). Se cambia desde Reglas de Reserva o con `UPDATE public.booking_rules SET slot_interval_minutes = 30 WHERE scope = 'global';`.
2. `select native_cutover_check('<shop_id>');` debe dar `ready: true`.
3. Probar en un navegador aparte (reserva pública con y sin pago de prueba, admin crear/mover/cancelar) **antes** de cortar, con una tienda de ensayo si es posible.
4. `select switch_shop_to_native('<shop_id>', '<user_id>');` (enlaza las citas futuras de Acuity y queda en `audit_log`).
5. Cerrar en Acuity el link público y los webhooks (las funciones ya los ignoran, pero conviene cerrarlos).
6. Vigilar: citas nuevas, pagos, correos, notificaciones y `outbound_webhook_events` (pendientes / fallidos).

**Reversa:** `select switch_shop_to_acuity('<shop_id>', '<user_id>');` vuelve al modo Acuity e informa cuántas citas futuras creadas de forma nativa no existen en Acuity (hay que pasarlas a mano).

## Pruebas obligatorias antes y después del corte
El pago bloquea al barbero correcto; el cobro marca el servicio correcto; 30 min + 1 h de complemento bloquean 1 h 30; sin dobles reservas; cancelar y reprogramar liberan y bloquean bien; notificaciones, nómina, métricas del home y transacciones pendientes siguen funcionando; admin, barbero y cliente ven solo lo suyo. **Los pagos con Stripe, PayPal y ATH Móvil no se han probado** y deben probarse en modo prueba antes del corte.

## Correos duplicados (decisión pendiente)
- La app envía un correo: `booking-confirmation` (reserva pública, reserva pagada). Los **recordatorios de la app son notificaciones push**, no correos, con interruptor por plantilla (`notification_templates.is_enabled`).
- Si GoHighLevel envía la confirmación y el recordatorio por correo o SMS, apagar el correo de la app para no duplicarlo:
```sql
UPDATE public.outbound_webhook_config SET app_booking_emails = false;   -- encender: = true
```
- Las notificaciones push de la app pueden convivir con los correos y SMS de GoHighLevel (otro canal); si no se quieren, desactivar sus plantillas.

## Riesgos conocidos
- El esquema reconstruido puede diferir de producción en políticas RLS y funciones creadas desde el panel (paso 1 y 2 lo reducen, no lo eliminan).
- "Reservar de todos modos" (solape confirmado por el staff) podría chocar con restricciones reales de la base (`trg_guard_overlap_exempt`, índice de `0018`); verlo en el ensayo.
- La integración heredada de GoHighLevel (`ghl_sync_queue`) tiene la URL de producción escrita a mano y llama a `extensions.http_post`; comprobar si realmente envía antes de usar ambas vías.
- `filho-agent` solo se adaptó en cancelar y reagendar; `cancel-appointments-bulk` y `consolidate-recurring` siguen basados en ids de Acuity.

## Hallazgos en la base real de Charlie (lectura, 13-nov-2026)
Tomados con consultas de solo lectura desde el editor SQL de su proyecto en Lovable.
- **Tienda:** una sola fila en `shops`, activa, `charlies-barbershop`, zona `America/Puerto_Rico`, `booking_provider = 'acuity'`. Es lo que la agenda nativa necesita.
- **Extensiones:** `pg_net`, `pg_cron` y `supabase_vault`. Solo existe `net.http_post` (no `extensions.http_post`): la integración heredada de GoHighLevel (`enqueue_ghl_event`) falla en silencio también en producción; los webhooks nuevos (0025) usan `net.http_post`.
- **Esquema:** 1.342 columnas y 178 funciones (mi reconstrucción de prueba, sin las migraciones propias, es muy parecida). Pendiente el detalle nombre por nombre con `scripts/compare-schema.mjs`.
- **Horarios:** 4 barberos, de los cuales 3 tienen horario martes a sábado, 9:00–17:00, con **6 filas repetidas por día** (90 filas de barbero y 30 de tienda). El editor de horarios las muestra como un solo rango y, al guardar, borra las sobrantes. Sin almuerzo configurado.
- **Reglas de reserva:** hay **3 filas globales idénticas** (intervalo 15 min, anticipación mínima 60 min, 90 días). Para pasar a 30 minutos hay que actualizar las tres: `UPDATE public.booking_rules SET slot_interval_minutes = 30 WHERE scope = 'global';`
- **Citas:** 206 citas futuras, todas con `acuity_id`. Al cortar se enlazan con su servicio local (`native_backfill_service_refs`); falta comprobar cuántas no encuentran su servicio.
- **Estado "no-show":** la base de Charlie solo admite `scheduled, confirmed, in-progress, completed, cancelled, no-show` (trigger `validate_appointment_status`; con guion). Mis migraciones/cargador filtraban `no_show` (guion bajo); ahora aceptan ambas grafías y el evento `booking.no_show` se emite con cualquiera de las dos. El proyecto de prueba ya tiene ese trigger de validación para que los ensayos se parezcan a producción.
- **Borrado:** `prevent_appointment_delete` impide borrar citas; la agenda nativa solo cambia estados (nunca borra).
- **Pendiente de ver (definiciones reales):** `enforce_acuity_booking_source` (puede rechazar citas nativas sin `acuity_id`), `guard_overlap_exempt`, `apply_overlap_preauth`, `serialize_barber_slot_writes`, `resolve_shop_context`, `ensure_client_exists`.
- **Migración 0028 (toca objetos de Charlie, requiere su aprobación):** hace que una cita `no-show` libere el horario. Reemplaza la función `serialize_barber_slot_writes` y, solo si aún filtran `no_show`, recrea la restricción `appointments_no_barber_overlap` y el índice único `appointments_one_active_exact_slot`. Probado en el proyecto de prueba (una cita no-show y otra agendada en la misma hora conviven). Pendiente ver en la base real: restricciones CHECK de `appointments` (en la reconstrucción `appointments_status_check` solo admite `scheduled, completed, cancelled, no_show` y contradice al trigger de Charlie; en producción probablemente ya no existe) y las definiciones de esos dos objetos.
