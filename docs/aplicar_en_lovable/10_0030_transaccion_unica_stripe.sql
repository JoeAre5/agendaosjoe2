-- 0030 — Un cobro de Stripe no puede guardarse dos veces para la misma cita.
--
-- Caso real (17-nov-2026): una reserva pagada con Stripe Link quedo con DOS transacciones de servicio
-- iguales (mismo payment intent, 1.3 s de diferencia). Dos llamadas casi simultaneas de commitDraft
-- (pantalla de confirmacion + webhook) reutilizaban la misma cita y cada una insertaba su transaccion.
-- Stripe cobro una vez; la app mostraba el doble y los reportes sumaban el doble.
-- El codigo ahora comprueba antes de insertar (recordServiceTransactionOnce); este indice es la red de
-- seguridad: si dos llamadas pasan la comprobacion a la vez, la segunda falla (23505) y se trata como "ya existia".
--
-- Es por (payment intent, cita), no solo por payment intent, a proposito: un mismo pago puede cubrir varias
-- citas y cada una lleva su propia transaccion. Solo cuenta lo COMPLETADO de tipo servicio; los reembolsos
-- (que comparten el payment intent del cobro original) y las filas pendientes quedan fuera.
--
-- Antes de aplicar, comprobar que no quedan duplicados (debe dar 0 filas):
--   SELECT stripe_payment_id, appointment_id, count(*) FROM public.transactions
--    WHERE type = 'service' AND status = 'completed' AND stripe_payment_id IS NOT NULL AND appointment_id IS NOT NULL
--    GROUP BY 1, 2 HAVING count(*) > 1;
--
-- Rollback:
--   DROP INDEX IF EXISTS public.uq_transactions_stripe_service_completed;

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_stripe_service_completed
  ON public.transactions (stripe_payment_id, appointment_id)
  WHERE type = 'service'
    AND status = 'completed'
    AND stripe_payment_id IS NOT NULL
    AND appointment_id IS NOT NULL;
