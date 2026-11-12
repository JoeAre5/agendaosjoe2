# Cobro con un toque (tarjeta guardada) para staff

## Objetivo
Desde el detalle de una cita, admin o barbero cobra el saldo pendiente con la tarjeta guardada del cliente, con propina opcional, en un toque y con confirmación.

## Punto de partida (verificado antes)
- Japhed Riestra tiene marca/últimos 4 dígitos de Acuity, pero no tiene cliente de Stripe: esas etiquetas no se pueden cobrar.
- Pagar con Apple Pay no deja una tarjeta reutilizable.
- Hoy, el pago de citas existentes se confirma con `record_stripe_appointment_payment`, identificado por el pago de Stripe.

## Fase 1: Guardar tarjetas con consentimiento (de aquí en adelante)
- En los pagos que hace el cliente (app y sitio público), añadir una casilla opcional: "Guardar mi tarjeta para pagos futuros en Charlie's Barbershop".
- Si la marca, crear o reutilizar su cliente de Stripe y guardar la tarjeta para cobros posteriores sin el cliente presente (`setup_future_usage: off_session`).
- Guardar en el perfil solo la referencia de Stripe, la marca, los últimos 4 dígitos y la fecha de vencimiento, nunca el número de la tarjeta.
- Las etiquetas viejas de Acuity se muestran como "No cobrable" para no confundir.

## Fase 2: Botón de cobro en la cita
- En el detalle de la cita, si hay saldo y tarjeta válida: botón "Cobrar $X a Amex •••• 2009".
- Hoja de confirmación: saldo, opciones de propina (0/15/20/otra), total y botón para confirmar el cobro.
- Resultados: éxito (saldo $0), rechazada (sugerir otro método) y "requiere autenticación" (enviar un enlace de pago al cliente; no se reintenta automáticamente).
- Si no hay tarjeta guardada, el botón no aparece.

## Fase 3: Seguridad y registro
- Nueva función `staff-charge-saved-card`: solo admin/barbero autenticado de la misma tienda; el saldo se recalcula en el servidor y nunca se confía en el monto enviado por la app.
- Una clave de idempotencia por intento evita cobros dobles si alguien toca dos veces o la conexión falla.
- El pago se confirma a través del mismo `record_stripe_appointment_payment` (webhook como respaldo), así que contabilidad, producción y nómina no cambian.
- Se registra qué miembro del staff cobró, cuándo y cuánto.
- Sin reembolsos automáticos (siguen siendo manuales).
- El cliente puede eliminar su tarjeta guardada desde su perfil en la app.

## Validación
- Stripe en modo de prueba con tarjetas de prueba: éxito, rechazo, autenticación requerida, doble toque y barbero de otra tienda (bloqueado).
- Pruebas aisladas antes de tocar producción; sin draft salvo que lo autorices.
- Un cobro real solo con tu aprobación explícita.

## Fuera de alcance
- Cobrar las tarjetas viejas de Acuity (no se puede).
- Cambios en contabilidad, nómina, Acuity o en cómo se hacen las reservas.

## Riesgos
- Japhed y los demás clientes actuales necesitarán un primer pago con la casilla marcada antes de poder usar el cobro con un toque.
- Algunos bancos pedirán autenticación: en esos casos se usa el enlace de pago.
