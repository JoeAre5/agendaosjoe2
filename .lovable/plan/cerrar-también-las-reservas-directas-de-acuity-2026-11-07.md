# Cerrar también las reservas directas de Acuity

## A. Problema
Evitar que un cliente reserve un horario ocupado, incluso entrando directamente a Acuity, conservando la confirmación explícita de solapamiento para administrador/barberos. El desglose queda fuera.

## B. Evidencia, VERIFICADO
- Consulta de solo lectura a Acuity realizada el 7 de noviembre de 2026: tres calendarios accesibles, todos en Puerto Rico.
- En una cita futura por calendario, Acuity no ofreció inicios dentro del intervalo ocupado: Charlie, 14/nov, 60 minutos; Joseph, 14/nov, 60 minutos; Pito, 12/nov, 30 minutos.
- La aplicación añade `admin=true` también a solicitudes de clientes hacia Acuity, lo que permite saltarse su validación de disponibilidad.
- La edición conserva duraciones locales que Acuity no permite cambiar mediante la actualización de una cita existente.

Estas muestras no demuestran todas las combinaciones de servicios, capacidad ni dos solicitudes simultáneas. La afirmación anterior de que Acuity desconoce sus citas y de protección al 100% no estaba justificada.

## C. Causa y alcance, VERIFICADO / NO VERIFICADO
**Verificado:** las protecciones de la base local no controlan la página externa de Acuity; existen rutas de clientes con bypass de disponibilidad.

**No verificado:** qué citas concretas tienen tiempo local sin cobertura en Acuity y si algún grupo de servicios permite múltiples reservas públicas. Inspeccionar antes de crear bloqueos.

## D. Solución mínima, PROPUESTO
1. Comparar intervalos locales y de Acuity y revisar la disponibilidad de sus servicios, sin cambiar datos.
2. Mantener el bypass exclusivamente para operaciones autorizadas del personal. Las reservas y reprogramaciones de clientes usarán las protecciones existentes con duración completa; no aceptar permisos de excepción enviados por el cliente.
3. No duplicar bloqueos donde la cita de Acuity ya cubre todo el tiempo.
4. Solo si hay tiempo local descubierto, proteger ese tramo mediante los bloqueos existentes de Acuity, con seguimiento durable y sin confundirlo con un bloqueo manual.
5. Actualizar esa protección al mover, cancelar o cambiar de barbero. Nunca eliminar bloqueos manuales ni cancelar citas automáticamente.
6. Ante un fallo, conservar el seguimiento para reintentar y avisar al dueño, sin afirmar que el horario quedó protegido.

## E. Alternativas
- Si basta la ocupación nativa de Acuity, no añadir bloqueos automáticos.
- Si un límite permite reservas públicas múltiples, proponer ajustar solo ese límite tras verificar su alcance, sin cambiarlo silenciosamente.
- Rechazado: bloquear indiscriminadamente cada cita o cada solapamiento, porque puede duplicar cierres y obstaculizar al personal.

## F. Conexiones e impacto
Reservas nuevas, reprogramación y cancelación; disponibilidad pública; reservas temporales existentes; sincronización y registro de acciones de Acuity. Conservar las tarjetas lado a lado y confirmaciones del personal.

No cambiar selección ni desglose de servicios, precios, recibos, contabilidad, nómina o reglas de pago. Los fallos posteriores a un pago siguen su protocolo existente de reconciliación manual.

## G. Riesgos y límites
La aplicación y Acuity no comparten una transacción atómica. Reintentos y respuestas ambiguas pueden duplicar bloqueos sin seguimiento adecuado; una cancelación no debe liberar tiempo aún ocupado por otra cita. Los bloqueos gestionados no deben impedir editar su propia cita.

No prometer protección universal frente a cambios externos de administradores o configuraciones no verificadas.

## H. Validación antes de producción
- Base separada: clientes sin excepción, personal con confirmación, duración completa, horas contiguas y solicitudes simultáneas.
- Pruebas de bloqueos: repetición, movimiento, cambio de barbero, cancelación, fallo de creación/eliminación y preservación de bloqueos manuales.
- Calendario Acuity de prueba autorizado: comprobar que el enlace público no ofrece el tramo protegido, que el personal puede confirmar solapamientos y que mover/cancelar libera únicamente el tiempo correcto.
- No crear otro draft sin autorización ni usar citas reales para pruebas de escritura.

**Pendiente externo:** los calendarios consultados son de producción; falta un calendario Acuity de prueba autorizado. Las consultas de lectura no sustituyen esa validación.

## I. Autorización y entrega
Charlie solicitó cerrar también Acuity. Esta propuesta concreta se presenta antes de cambiar el flujo de reservas, siguiendo su regla de aprobación de cambios de lógica.

Tras aprobar, preparar y probar la solución mínima; no activarla en producción hasta completar la validación separada y de Acuity de prueba. No se modificaron reservas, funciones operativas ni configuración de Acuity durante esta revisión.

## Detalles técnicos
Reutilizar `acquire_booking_hold`, `get_busy_intervals`, el control de sesión/rol de `acuity-proxy` y la API de bloques. Cubrir rutas directas/legacy y reprogramaciones, no solo la pantalla actual. Si se necesitan bloques gestionados, registrar propiedad, intervalo/revisión, estado y ID remoto con autorización por barbería; reconciliar de forma idempotente y conservar el ID tras fallos de eliminación. Registrar actor y resultado en `acuity_operator_log`; los trabajos internos requieren la autenticación interna existente. Revisar los importadores de bloques para preservar esa propiedad y no tratarlos como cierres manuales.