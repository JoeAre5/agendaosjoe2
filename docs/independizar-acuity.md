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
| Motor de disponibilidad y catálogo nativo (`_shared/availability`, `_shared/native`) | **Hecho.** Lee `booking_draft_holds`, respeta `overlap_exempt`. 26 pruebas. |
| Esquema (`drizzle/migrations/0022`) | **Hecho, sin aplicar.** Ids de Acuity opcionales, referencias nativas, índices. |
| Funciones SQL de escritura (`0023`): reservar, reprogramar, cancelar | **Hecho, sin aplicar.** Solo service_role, mismo candado por barbero que las reservas temporales; "reservar de todos modos" (solape confirmado por staff) y citas heredadas de Acuity manejables una vez la tienda es nativa. |
| Herramientas de corte por tienda (`0024`): `native_cutover_check`, `switch_shop_to_native`, `switch_shop_to_acuity`, `native_backfill_service_refs` | **Hecho, sin aplicar.** Nada cambia solo; cada llamada se registra en `audit_log`. |
| Pruebas de SQL (Postgres en memoria, esquema mínimo) | **76 comprobaciones en verde.** No es el esquema real. |
| Servidor: `native-scheduling`, `availability`, `public-booking-create` (catálogo, horarios y reserva nativos), `seat-walkin`, `client-booking-refund`, `filho-agent` (cancelar) | **Hecho.** `deno check` sin errores nuevos. Sin desplegar. |
| Reservas pagadas: `pay-then-book` (precio desde el catálogo local), `_shared/commitDraft` (rama nativa con `book_native_slot`, idempotente por pago), ATH Móvil y Stripe (etiquetas) | **Hecho en código, sin probar contra pasarelas.** Pagos fallidos o con horario ya tomado quedan como excepción manual; reembolsos siempre manuales. |
| Sincronización con Acuity (`acuity-sync`, `acuity-webhook`, `acuity-block-sync`, `acuity-sync-services`) | **Hecho.** Se apagan solas cuando la tienda es nativa; con Acuity siguen igual. |
| Frontend: capa de proveedor (`src/lib/scheduling`), 10 pantallas con flujo nativo, editores de servicios/complementos y horarios | **Hecho.** Con Acuity (por defecto) se comporta igual. 273 pruebas, tipos y build en verde. |
| Probar contra un Supabase de prueba con el esquema real, pasarelas en modo prueba | **Pendiente. Bloquea el corte.** |
| Corte real de la tienda | **Pendiente, requiere aprobación expresa.** |

## Pedidos del cliente tras su primera prueba (12-nov-2026)
- **Horario partido / almuerzo:** cada día admite varios rangos; lo que queda fuera de los rangos está cerrado (9:00–12:00 y 13:00–17:00). El editor tiene atajos "Almuerzo 12–1" y "Copiar a los demás días".
- **Intervalos de 30 minutos:** valor por defecto de la agenda nativa y de las reglas nuevas; las reglas existentes se cambian en Reglas de Reserva.
- **Excepciones por fecha** (`0027`, `schedule_exceptions`): cerrar un día o darle otro horario, para todos o para un barbero. Reemplaza el horario semanal de esa fecha; no cancela citas ya existentes (la pantalla avisa cuántas hay).

## Instructivo de corte (solo cuando se autorice)
Todo esto se hace en un **proyecto de prueba** primero. En producción solo tras ensayo completo y con Charlie enterado.

1. Aplicar `0022`, `0023` y `0024` (en ese orden) y desplegar las funciones (`native-scheduling`, `availability`, `public-booking-create`, `pay-then-book`, `seat-walkin`, `client-booking-refund`, `filho-agent`, y las cuatro `acuity-*` que ahora se apagan solas). La tienda sigue en `acuity`: nada cambia para nadie.
2. Revisar el catálogo en el admin (servicios, complementos, horarios por barbero y de la tienda): hoy es el que sincronizó Acuity y pasa a ser la fuente de verdad.
3. Chequeo previo (solo lectura), con service_role: `select native_cutover_check('<shop_id>');` — debe dar `ready: true` (barberos reservables con horario, servicios públicos, sin borradores abiertos).
4. Ensayar el recorrido completo (ver "Pruebas obligatorias") en el proyecto de prueba con la tienda en nativo.
5. Corte: `select switch_shop_to_native('<shop_id>', '<user_id>');` — comprueba, enlaza las citas futuras de Acuity con su servicio local y cambia el proveedor. Queda en `audit_log`.
6. En Acuity: desactivar el link público de reservas y los webhooks (las funciones ya los ignoran, pero conviene cerrarlos).
7. **Reversa:** `select switch_shop_to_acuity('<shop_id>', '<user_id>');` vuelve al modo Acuity y avisa cuántas citas futuras creadas de forma nativa no existen en Acuity (hay que pasarlas a mano).

## Límites conocidos (sin ocultar nada)
- Nada se ha aplicado a ninguna base ni desplegado. Todo se verificó con tipos, pruebas unitarias, `deno check` y un Postgres en memoria con esquema mínimo.
- Los disparadores y restricciones reales de producción (por ejemplo `trg_guard_overlap_exempt`, el índice de solape exacto de `0018`) no se probaron contra la base real: "reservar de todos modos" podría chocar con ellos y hay que verlo en el ensayo.
- Pagos (Stripe, ATH Móvil, PayPal) no se probaron contra las pasarelas; solo se adaptó el código que confirma la cita.
- `filho-agent` (asistente) solo se adaptó en cancelar y reagendar; sus herramientas de catálogo están desactivadas en el código actual.
- `cancel-appointments-bulk` y `consolidate-recurring` siguen siendo herramientas puntuales basadas en ids de Acuity.
- La nómina, métricas del home y notificaciones se leen de las mismas tablas, pero hay que confirmarlo en el ensayo.

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
