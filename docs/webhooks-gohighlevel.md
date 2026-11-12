# Webhooks de salida (GoHighLevel u otro CRM)

Cada cambio importante de citas y del catálogo se envía por POST a las URL que se configuren. El destino típico es el webhook de entrada de un flujo de GoHighLevel, que luego envía los correos y mensajes de confirmación y recordatorio.

Los disparadores viven en la **base de datos** (`drizzle/migrations/0025_outbound_webhooks.sql`), así que cubren todos los caminos: admin, cliente, web pública, pagos y las funciones nativas de reservar, reprogramar y cancelar. Ningún disparador puede romper una reserva.

## Eventos
| Evento | Cuándo |
|---|---|
| `booking.created` | Se crea una cita (no cancelada) |
| `booking.rescheduled` | Cambia la hora o el barbero (incluye `previous`) |
| `booking.updated` | Cambia servicio, precio, duración, complementos, ítems, notas, etiqueta o datos del cliente (incluye `changed`) |
| `booking.cancelled` | La cita pasa a cancelada |
| `booking.no_show` | La cita pasa a no se presentó |
| `booking.paid` | La cita pasa a pagada |
| `service.created` / `service.updated` / `service.deleted` | Cambios en servicios (`changed` en las ediciones) |
| `addon.created` / `addon.updated` / `addon.deleted` | Cambios en complementos |

## Configuración (SQL, desde el editor SQL de Supabase o con service_role)
1. Decir a la base dónde están las funciones de **este** entorno (cada entorno su URL; no hay ninguna escrita a mano):
```sql
UPDATE public.outbound_webhook_config
   SET functions_base_url = 'https://<ref-del-proyecto>.supabase.co/functions/v1';
```
2. Agregar destinos. `event_types` puede ser `{*}` (todos) o una lista; `secret` es opcional y activa la firma:
```sql
INSERT INTO public.outbound_webhook_endpoints (name, url, event_types, secret) VALUES
  ('GHL - citas',    'https://services.leadconnectorhq.com/hooks/AAAA', '{booking.created,booking.rescheduled,booking.updated,booking.cancelled}', NULL),
  ('GHL - pagos',    'https://services.leadconnectorhq.com/hooks/BBBB', '{booking.paid}', NULL),
  ('GHL - catalogo', 'https://services.leadconnectorhq.com/hooks/CCCC', '{service.created,service.updated,service.deleted}', NULL);
```
Se puede usar una sola URL para todo o una por evento. Sin destinos activos no se guarda nada. Para pausar uno: `UPDATE ... SET is_active = false`.
3. Desplegar la función `outbound-webhook-dispatch` (`verify_jwt = false`, ya está en `config.toml`). **No** desplegar `webhook-echo` en producción: es solo para pruebas.

## Qué recibe el destino
Un POST JSON con los encabezados `X-Webhook-Event`, `X-Webhook-Id` (id único del evento, sirve para no procesarlo dos veces) y, si el destino tiene `secret`, `X-Webhook-Signature: sha256=<HMAC-SHA256 hex del cuerpo exacto>`.

```json
{
  "id": "id-del-evento",
  "event_type": "booking.rescheduled",
  "occurred_at": "2027-01-08T14:28:10Z",
  "shop_id": "913015e7-...",
  "entity_type": "appointment",
  "entity_id": "353339f5-...",
  "data": {
    "appointment_id": "353339f5-...",
    "status": "scheduled",
    "starts_at": "2027-01-08T15:00:00+00:00",
    "ends_at": "2027-01-08T15:30:00+00:00",
    "duration_minutes": 30,
    "service": { "id": "e1d242f2-...", "name": "Corte" },
    "addons": [],
    "barber": { "id": "fcafc4bc-...", "name": "Ana Prueba" },
    "client": { "id": "...", "name": "Webhook Prueba", "first_name": "Webhook", "last_name": "Prueba", "email": "webhook@example.com", "phone": "7875550155" },
    "price_cents": 2500, "paid": false, "payment_method": null, "amount_paid_cents": 0, "tip_cents": 0,
    "booking_source": "admin_manual", "created_by_role": "admin",
    "is_recurring": false, "recurring_group_id": null, "label": null, "notes": null,
    "cancelled_at": null, "cancelled_by_role": null, "refund_status": null,
    "created_at": "...", "updated_at": "...",
    "previous": { "starts_at": "2027-01-08T14:00:00+00:00", "ends_at": "2027-01-08T14:30:00+00:00", "barber": { "id": "...", "name": "Ana Prueba" } }
  }
}
```
Los eventos de servicio llevan `service_id`, `name`, `description`, `category`, `duration_minutes`, `price_cents`, `padding_*`, `barber_id`, `is_active`, `is_public`, `sort_order` y, en ediciones, `changed` (por ejemplo `["price"]`). Los de complemento: `addon_id`, `name`, `duration_minutes`, `price_cents`, `barber_id`, `is_active`. Un correo `@placeholder.local` se envía como `null`.

## Entrega y reintentos
Los eventos salen unos segundos después de guardarse. Si el destino no responde 2xx se reintenta con espera creciente (1, 4, 9... min, máximo 60) hasta 8 intentos; una tarea cada 5 minutos (`outbound-webhook-retry`) barre los pendientes. Un destino que ya recibió un evento no lo recibe de nuevo. El estado queda en `outbound_webhook_events` (`pending`, `sent`, `failed`, con `deliveries` y `last_error`). La entrega es **al menos una vez**: el flujo receptor debe tolerar un duplicado usando `X-Webhook-Id`.

El dueño puede enviar un evento de ejemplo a un destino llamando a `outbound-webhook-dispatch` con `{"test":{"endpoint_id":"..."}}` y su JWT.

## Verificado (12-nov-2026, proyecto de prueba)
Citas reales creadas, reprogramadas, editadas, pagadas y canceladas con las funciones nativas, más cambios de servicio y complemento: los 7 eventos llegaron con HTTP 200 por la cadena completa (disparador, pg_net, función, destino), con firma HMAC válida de punta a punta. Un destino que responde 500 deja el evento `pending` con reintento programado, y la tarea de cada 5 minutos lo entregó al volver a funcionar (intento 2). Pruebas unitarias de firma, espera y filtro de destinos en `supabase/functions/outbound-webhook-dispatch/index_test.ts`.

## Lo que NO cubre / a tener en cuenta
- **Correos duplicados:** la app sigue enviando sus propios correos de confirmación y recordatorio. Si GoHighLevel se encarga de ellos, hay que apagar los de la app por tipo, o el cliente recibirá dos. No se tocó.
- **No hay pantalla** para administrar destinos; se hace por SQL. Se puede añadir después.
- **Clientes:** no hay eventos `client.*` (altas y cambios de clientes). Se pueden añadir.
- **Horarios y bloqueos** no generan eventos.
- **Integración heredada de GoHighLevel** (`ghl_sync_queue`, `ghl-sync-dispatch`, `GHL_WEBHOOK_URL`), sin tocar: su función SQL tiene escrita la URL de producción y llama a `extensions.http_post`, que no existe en el proyecto de prueba (solo `net.http_post`); el error se traga en silencio, así que **conviene comprobar en producción si realmente está enviando**. Si se usan ambas a la vez, las citas se enviarían por las dos vías.
- En producción hay que aplicar `0025`, configurar `functions_base_url` y desplegar la función; nada de eso se ha hecho.
