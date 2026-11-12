# Independizar el calendario de Acuity

Pedido del cliente: que los servicios, los horarios y la disponibilidad dejen de depender de Acuity y vivan en la base propia, hasta quedar completamente independientes.

**Enfoque acordado:** usar como base el diseño de agenda nativa de la rama `Hasib` (pre-borrado de Acuity, commit `6dba04fd`), copiando solo esas piezas a este `main`, **sin hacer merge de ramas**.

## Principios
1. **Acuity sigue funcionando** hasta que se autorice expresamente el corte. La agenda nativa convive con Acuity, activada por tienda (`shops.booking_provider`, por defecto Acuity).
2. **Nada se aplica a producción ni a ninguna base** sin aprobación. Todo se prueba en un backend de prueba aislado.
3. **No se rompen las reglas de `AGENTS.md`** (ver "Compatibilidad").
4. Cada etapa deja el proyecto compilando, con tests en verde, y se puede revertir sola.

## Estado de partida (12-nov-2026)
`tsc` sin errores, 261 tests, build correcto. Las tablas de catálogo ya existen (`services`, `service_addons`, `working_hours`, `shop_hours`, `block_times`), hoy sincronizadas desde Acuity.

## Avance (12-nov-2026)
| Pieza | Estado |
|---|---|
| Motor de disponibilidad y catálogo nativo (`_shared/availability`, `_shared/native`) | **Hecho.** Lee `booking_draft_holds` y respeta `overlap_exempt`. 26 pruebas. |
| Esquema (`drizzle/migrations/0022`) | **Hecho, sin aplicar.** Ids de Acuity opcionales, referencias nativas, índices. |
| Funciones SQL de escritura (`0023`: `book_native_slot`, `reschedule_native_appointment`, `cancel_native_appointment`) | **Hecho, sin aplicar.** Solo service_role, mismo candado por barbero que las reservas temporales. **53 pruebas** sobre un Postgres en memoria (esquema mínimo, no el real). |
| Servidor: `native-scheduling`, `availability`, `_shared/nativeBooking.ts`, `_shared/singleShop.ts` | **Hecho.** `deno check` sin errores. Sin desplegar. |
| Frontend: capa de proveedor (`src/lib/scheduling`) y 10 pantallas conectadas a ella | **Hecho.** Con Acuity (por defecto) se comporta igual. 271 tests, tipos y build en verde. |
| Pantallas con flujo nativo completo (crear, editar, walk-in, bloqueos, reserva del cliente) | **Pendiente.** Hoy las rutas con `acuity_id` ya usan `appointmentRef`, pero crear/editar cita siguen creando el espejo local pensado para Acuity. |
| Editores de servicios y horarios (`ServiceEditorSheet`, `HoursEditor`, cambios en `Services` y `Availability`) | **Pendiente.** |
| Pagos: reserva en línea nativa (`pay-then-book`, `commitDraft`, ATH, Stripe, PayPal) respetando saldo restante y `edit_line_items` | **Pendiente.** |
| Sincronización con Acuity en modo nativo (`acuity-sync`, `acuity-webhook`, `useCalendarData`) | **Pendiente:** hay que apagarla por tienda. |
| Migrar citas futuras y corte | **Pendiente**, con aprobación. |

## Adaptaciones necesarias (lo que no se puede copiar tal cual)
- **Contexto de tienda.** El código de Hasib usa `withShopScope`, `resolveRequestShop` y las funciones SQL `request_shop_id()` e `is_service_context()`, que vienen de su capa multi-tienda (`a1`) y **no existen aquí**. No se trae esa capa entera (es un RLS restrictivo sobre todas las tablas, demasiado riesgoso). Se crea un adaptador de una sola tienda: resuelve la tienda única de Charlie y devuelve el cliente tal cual. Mantiene la puerta abierta al multi-tienda futuro.
- **Dónde van las migraciones.** Este proyecto ya usa `drizzle/migrations` (0000 a 0021) además de `supabase/migrations`. Hay que decidir el lugar y respetar el diario de drizzle antes de añadir SQL.
- **Archivos que faltan:** `_shared/overlapConflict.ts` (lo usa `bookingProvider`) y las columnas/funciones que este proyecto cambió después de la base de Hasib.

## Compatibilidad con las reglas del proyecto (`AGENTS.md`)
La agenda nativa **debe respetar**, y hoy el código de Hasib no lo hace por sí solo:
- **`edit_line_items`:** las ediciones del staff guardan instantáneas explícitas de precio y duración. El `update` nativo de Hasib sobrescribe precio y duración desde el catálogo, y eso borraría los extras. Hay que corregirlo.
- **Pago por saldo restante** y `record_stripe_appointment_payment` (confirmación idempotente por intento de pago).
- **Reservas temporales:** `acquire_booking_hold`, `booking_draft_holds` y `get_busy_intervals`. El motor nativo debe usar el mismo mecanismo, no uno paralelo, para no abrir carreras entre los dos.
- **Solapamientos de staff** (`staffOverlap`, `appointment_overlap_preauth`) y las excepciones autorizadas.
- **Registro de acciones del staff:** hoy `acuity-proxy` guarda quién hizo cada cambio en `acuity_operator_log`. Sin Acuity la propia base debe atribuir al usuario real.
- **Reembolsos siempre manuales.**
- **Ingresos unificados:** la suma de transacciones completadas por cita sigue igual.

## Etapas
1. **Catálogo propio.** Servicios, complementos y horarios por barbero editables desde el admin, sin Acuity. Esquema `b1` adaptado. *Verificación:* el catálogo nativo se lee y se edita; Acuity sigue intacto.
2. **Disponibilidad y reserva nativas**, con la guarda contra solapamientos en la base y el mismo mecanismo de reservas temporales. *Verificación:* los tests del motor, y el recorrido de reserva con duración de complementos.
3. **Pagos, cancelaciones y reprogramaciones** conectados al motor nativo (Stripe, PayPal, ATH Móvil, efectivo), respetando saldo restante, propinas y `edit_line_items`.
4. **Migrar las citas futuras** de Acuity a la base propia, coordinado con Charlie y sin cambiar los links de reserva hasta el corte.
5. **Corte:** desactivar webhooks, sincronización y llamadas a Acuity, **solo con aprobación expresa** y con plan de reversa.

## Pruebas obligatorias (heredadas del proyecto)
Antes de cualquier corte: el pago bloquea al barbero correcto; el cobro marca el servicio correcto; 30 min + 1 h de complemento bloquea 1 h 30; sin dobles reservas; cancelar y reprogramar liberan y bloquean bien; notificaciones, nómina, métricas del home y transacciones pendientes siguen funcionando; admin, barbero y cliente ven solo lo suyo.

## Requisito previo
Un **proyecto Supabase de prueba propio con el esquema real** de producción. Sin él no se puede probar nada de lo anterior sin tocar la base de Charlie. Hoy el `.env` de este repo apunta a esa base de producción.

## Riesgos
- El esquema real de producción puede diferir del de los archivos del repo (ya vimos funciones que existen solo en la base).
- La reserva por tarjeta con Stripe tiene su propia ventana de vencimiento que interactúa con las reservas temporales.
- Cambiar la fuente de verdad con una barbería operando: por eso el corte es la última etapa y se activa por tienda.
