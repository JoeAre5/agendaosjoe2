# Cobro por QR ligado a la cita

Cada cita sin pagar tendra un boton "Cobrar con QR". Al tocarlo se muestra un codigo QR (y el enlace) que apunta a la pagina de pago de esa cita en especifico. El cliente escanea, paga, y el pago queda amarrado a esa cita por el codigo, sin depender del nombre ni del telefono.

## Lo que vera el usuario

En la pantalla de la cita, cuando hay balance pendiente:

- Boton "Cobrar con QR" junto al boton "Pagar" actual.
- Se abre una hoja con:
  - El QR grande para que el cliente lo escanee con su camara.
  - El monto pendiente y el nombre del servicio.
  - Botones "Copiar enlace" y "Enviar por WhatsApp".
- Cuando el cliente completa el pago, la cita se marca pagada sola y la hoja muestra "Pago confirmado" (ya hay actualizacion en tiempo real en esa pantalla).

En la pagina que abre el QR (la pagina de pago publica que ya existe), el cliente vera:

- Resumen de la cita, selector de propina y total.
- ATH Movil (boton naranja): escribe su celular una vez y aprueba el aviso en su app.
- Tarjeta (Apple Pay / Link incluidos) y PayPal, como hoy.

## Por que esto resuelve las ventas pendientes

Hoy un pago de ATH hecho por fuera llega sin referencia de cita y hay que adivinar por nombre o telefono. Con el QR el pago nace con el id de la cita, asi que se aplica directo a esa cita y nunca cae en pendientes.

## Detalles tecnicos

1. **Pagina de pago** (`src/pages/site/Pay.tsx`): ya carga la cita por id en `/pay/:token`. Cambios: usar el balance real (`price_cents - amount_paid_cents`) en vez del precio total, y pasar un `primaryAction` con el boton ATH.
2. **Boton ATH publico**: nuevo componente ligero (basado en `AdminAthMovilRestButton`) con campo de celular del cliente, que invoca una nueva edge function `appointment-ath-pay-public`.
3. **Nueva edge function** `appointment-ath-pay-public`: sin rol requerido; valida que la cita exista, no este cancelada y tenga balance; calcula el monto en el servidor (nunca confia en el cliente), limita por rate limit e inserta la transaccion pendiente igual que `admin-appointment-ath-pay`, pasando `metadata1 = transactionId`. El `athmovil-webhook` ya tiene la rama que confirma esa transaccion y la cita (Step 0.5), asi que no se toca la logica de matching.
4. **Hoja QR**: nuevo componente `PayQrSheet` usando `qrcode.react` (dependencia nueva) con la URL publica `https://charliesbarbershop.co/pay/<appointmentId>`, mas copiar enlace y `wa.me` con mensaje en el idioma del cliente.
5. **Punto de entrada**: `src/pages/AppointmentDetail.tsx`, visible solo si `!payment_confirmed` o hay balance.

No se modifica el flujo de reservas publico ni la logica actual de emparejamiento de ATH.
