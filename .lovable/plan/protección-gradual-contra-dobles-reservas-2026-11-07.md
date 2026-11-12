# Protección gradual contra dobles reservas

## Objetivo y límites
Evitar que dos clientes inicien pagos por turnos incompatibles y detectar cualquier reserva que no pueda confirmarse, sin cambiar ahora la fuente de agenda ni alterar contabilidad, nómina, pagos de balance, propinas o identidades.

Este documento es para aprobación. No aplica cambios a producción, no crea otro draft y no publica funciones. Las pruebas usarán una base separada cuya separación se verifique antes de escribir. Acuity seguirá funcionando hasta un cambio de autoridad autorizado expresamente.

## Discover → Connect → Challenge

| Área | Estado | Hallazgo o propuesta |
|---|---|---|
| A. Problema | VERIFICADO en código | Una comprobación al preparar la reserva no asegura que el turno siga libre cuando termina el pago. |
| B. Evidencia | VERIFICADO en código | `prepare-draft` comprueba traslapes locales; `commitDraft` todavía crea en Acuity antes del guardado local y usa `admin=true`. Stripe permite renovar borradores vencidos sin una nueva comprobación del turno en ese tramo. |
| C. Causa y brecha | VERIFICADO / NO VERIFICADO | La consulta y la reserva no son una operación atómica. La prueba anterior informó cinco casos aprobados, pero usó duración de respaldo de 30 minutos. Servicio real con adicionales, carreras de pago y despliegue actual no están verificados aquí. |
| D. Solución mínima | PROPUESTO | Unificar la comprobación, añadir reserva temporal atómica y recuperar fallos mediante el registro y atención administrativa existentes. |
| E. Alternativas | PROPUESTO | Solo consultar de nuevo reduce errores, pero no cierra carreras. Cambiar ahora a AgendaOS como autoridad implica una migración mayor y queda excluido. |
| F. Impacto | PROPUESTO | Web pública, app cliente, preparación de reservas, inicio de pago, confirmación compartida y entrada Acuity comparten el control. Se reutilizan sus contratos; no se reescriben informes financieros. |
| G. Riesgos | NO VERIFICADO hasta pruebas | Pagos tardíos, duración incorrecta, reserva externa en Acuity, callbacks duplicados y fallos entre los dos sistemas. Una reserva local temporal no impide por sí sola que alguien reserve directamente en Acuity. |
| H. Validación | PROPUESTO | Pruebas de contratos, concurrencia y recorrido completo en un entorno separado, sin cargos reales ni escrituras al Acuity operativo. |
| I. Autorización | PENDIENTE | Aprobar estas etapas permite implementarlas y probarlas; producción y publicación requieren autorización posterior basada en resultados. |

## Repair: etapas de implementación

### 1. Confirmar la línea base y el entorno seguro
1. Comparar fuente actual, funciones desplegadas y esquema sin mutar producción. Separar claramente «preparado», «probado» y «activo».
2. Verificar que la base de pruebas no comparte conexión ni datos operativos con producción. Reutilizar un entorno aislado disponible; no crear otro draft por defecto.
3. Reproducir con datos sintéticos la carrera entre dos reservas del mismo barbero. Registrar resultados antes de modificar código.
4. Comprobar servicios, adicionales, duraciones, reglas, bloqueos y permisos reales. Si no hay duración confiable, impedir el pago en vez de aceptar 30 minutos por defecto.

### 2. Reutilizar un control de disponibilidad combinado
1. Centralizar el control existente de traslapes, siempre en el servidor y limitado a la barbería y barbero autorizados.
2. Combinar turnos ofrecidos por Acuity con citas locales no canceladas, bloqueos y reservas temporales vigentes. Consultar rangos completos, incluso citas que empiezan el día anterior y cruzan medianoche. Conservar anticipación, intervalos, márgenes y límites existentes.
3. Web pública y app cliente consumen la misma respuesta segura, sin descargar datos personales de citas ajenas. No limitar el filtro local a servicios con adicionales.
4. Revalidar al preparar una reserva y antes de iniciar o renovar el pago. Si la consulta falla, no ofrecer el turno como libre.

### 3. Reservar temporalmente el turno de forma atómica
1. Reutilizar `booking_drafts` como referencia de la reserva; no crear otra fuente de citas ni otro motor de reglas.
2. Crear o extender únicamente la estructura necesaria para una reserva temporal con barbería, barbero, rango, borrador y vencimiento.
3. En una sola operación protegida contra concurrencia: comprobar citas y reservas vigentes, adquirir el turno y asociarlo al borrador. Dos solicitudes simultáneas incompatibles no pueden obtenerlo.
4. Los escritores locales de citas deben participar en la misma coordinación; una tabla de reservas temporales aislada del guardado de citas no basta. Mantener las excepciones de staff expresamente autorizadas y auditadas, nunca disponibles para clientes.
5. Proponer 10 minutos como ventana inicial, ajustada a los límites de Stripe, PayPal y ATH antes de activarla; si el método no permite ese vencimiento, usar una ventana compatible y explicitarla. No renovar silenciosamente una reserva vencida: volver a adquirir y comprobar.
6. Liberar reservas abandonadas o fallidas de manera idempotente. No usar condiciones dependientes de `now()` en una restricción inmutable.

### 4. Proteger pago y confirmación sin invertir la autoridad
1. Solo iniciar un pago nuevo con una reserva temporal válida. Adaptar los tres métodos reutilizando preparación y confirmación compartidas. Añadir idempotencia a la creación de sesiones y al cierre local completo, no solo a la llamada Acuity.
2. Antes de crear la cita en Acuity, comprobar propiedad y vigencia de la reserva y estado real del pago. Conservar deduplicación por borrador, referencia de pago y Acuity ID.
3. Para reservas ordinarias de clientes, probar Acuity sin `admin=true`; no retirar el mecanismo administrativo de staff. Si las reglas normales rechazan servicios válidos, detener esta etapa y presentar la incompatibilidad.
4. Mantener la secuencia con Acuity activa durante esta fase. No confirmar al cliente una cita solamente local si Acuity aún no la ha aceptado.
5. Si el pago llega después del vencimiento, intentar readquirir el turno atómicamente. Si ya está ocupado, registrar pago confirmado y reserva no confirmada para atención manual, sin crear un traslape ni cobrar otra vez.
6. Si Acuity acepta y falla el guardado local, conservar sus identificadores y registrar una excepción recuperable; reintentar solo si es seguro. No cancelar ni borrar automáticamente una cita Acuity.
7. Todos los reembolsos serán manuales. Se encontraron ramas automáticas ATH en `commitDraft` y Stripe/PayPal en `pay-then-book`, contrarias a esa regla: validar su alcance y sustituir las de reservas por excepción y aviso manual, sin marcar «reembolsado» un pago no devuelto. No modificar importes ni mecanismos financieros fuera de estas rutas de recuperación aprobadas.

### 5. Resolver entradas y fallos de sincronización
1. Reutilizar los registros de conflictos, excepciones y avisos administrativos existentes antes de añadir estructuras nuevas.
2. Detectar traslapes reales en la entrada Acuity, no solo igualdad exacta de inicio y fin. Preservar la información del evento y de las citas en conflicto sin crear duplicados.
3. Definir reintentos idempotentes y respuesta del webhook según el registro durable del conflicto; no ocultar un fallo como sincronización completada. Cubrir también `acuity-sync`: un conflicto en un lote no debe perder las citas válidas ni borrar los ajustes itemizados locales.
4. El administrador decide reprogramación, cancelación o reembolso. No resolver conflictos automáticamente alterando citas pagadas, identidades o importes.
5. Mostrar confirmación, calendario y reseña únicamente cuando la reserva esté comprometida; un pago recibido con conflicto no equivale a confirmación de cita.

## Verify: criterios de aceptación

| Prueba en base separada | Resultado exigido |
|---|---|
| Mismo barbero, misma hora o traslape parcial | Bloquear antes de abrir pago. |
| Turno contiguo | Permitir si los márgenes configurados lo permiten. |
| Cita cancelada / otro barbero | No bloquear por esa cita; respetar otras reglas. |
| Servicio real con adicionales largos | Bloquear todo el rango configurado, no una duración de respaldo. |
| Cruce de medianoche y bloqueos | Detectar todo el traslape y los márgenes, aunque el inicio sea del día anterior. |
| Dos solicitudes simultáneas | Una sola adquiere el turno; la otra recibe conflicto sin pago nuevo. |
| Cita de staff o webhook durante una reserva temporal | Resultado coordinado y excepción explícita, nunca éxito silencioso para ambos. |
| Reserva vencida, abandonada o renovada | Liberación correcta y nueva comprobación antes del pago. |
| Stripe, PayPal y ATH, callbacks repetidos | Una sola cita y registro de cobro por la misma operación. |
| Pago tardío con turno ocupado | Excepción administrativa visible, sin doble reserva ni reembolso automático. |
| Acuity acepta y guardado local falla | Identificadores conservados, excepción registrada y recuperación segura. |
| Fallo de disponibilidad o acceso no autorizado | No aceptar reserva ni exponer citas ajenas. |
| Recorrido web y app cliente | Elegir, pagar en modo prueba, confirmar y leer la cita en el calendario; con conflicto no mostrar confirmación, calendario ni reseña de éxito. |
| Aislamiento | Sin cambios en producción, sin cargo real y sin escritura al Acuity operativo; importes, propinas, contabilidad y nómina conservan sus contratos. |

Acuity se simulará para fallos y concurrencia. Compatibilidad real con sus servicios requiere un calendario de prueba autorizado; si no existe, se reportará NO VERIFICADO y no se activará el cambio correspondiente.

## Detalles técnicos y salida segura
- Puntos principales: `pay-then-book`, `_shared/commitDraft.ts`, `create-booking-checkout`, iniciadores/callbacks de los tres métodos, disponibilidad pública/cliente y entrada Acuity. Revisar staff únicamente para la coordinación del turno y conservar su override auditado.
- Reutilizar `appointments_no_barber_overlap`, `booking_drafts`, control existente de intentos e identificadores, `acuity_sync_conflicts`, `payment_exceptions` y avisos al owner según su esquema y permisos verificados. Leer la definición instalada de la restricción y sus excepciones antes de diseñar la coordinación; las referencias del código no prueban su instalación.
- Toda estructura nueva será aditiva, con GRANT, RLS y operaciones autorizadas. Invitados prueban acceso al borrador; conocer un UUID no basta. Horas de Puerto Rico con offset explícito `-04:00`.
- No aplicar migraciones al backend compartido del preview. No aceptar drafts, desplegar funciones o publicar como consecuencia automática de pruebas aprobadas.
- Entrega: informe de casos aprobados/fallidos, límites no verificados y propuesta de activación reversible. No prometer eliminación total de conflictos externos mientras Acuity permita reservas por otros canales.