# Gastos completos y separados

## Lo encontrado
- La tarjeta de Inicio muestra los gastos manuales por concepto, pero agrupa los fijos en una sola cifra.
- En Ajustes, Gastos y Mantenimiento de citas recurrentes están dentro del mismo contenedor. Se separarán completamente.
- Hay tres fuentes distintas: una cifra semanal general en Información del Shop, una lista antigua de gastos semanales y los gastos manuales fechados. La cifra general también participa en Cuadre y en la distribución del negocio, por lo que reemplazarla sin coordinación puede cambiar resultados o duplicar gastos.
- Los controles Desde/Hasta comparten dos columnas estrechas, sin suficiente espacio para la fecha completa en móviles.

## Cambios propuestos
### 1. Espacio y separación
- Aumentar el espacio inferior de la tarjeta de gastos de Inicio, conservando el botón en su posición y dejando su borde inferior completamente visible.
- Dar a Gastos y Mantenimiento sus propios contenedores en Ajustes, sin cambiar las acciones de mantenimiento.
- Presentar Desde/Hasta con etiquetas separadas, dimensiones estables y espacio suficiente. Apilarlos cuando dos columnas no permitan mostrar ambas fechas completas.

### 2. Un formulario para los nuevos gastos
- Título, cantidad en dólares, descripción opcional, fecha y frecuencia: Una sola vez, Semanal o Mensual.
- La fecha representa el día del gasto único o el inicio del gasto recurrente.
- Guardado individual desde Inicio o Ajustes. Ambas pantallas muestran los mismos registros.
- Permitir editar gastos únicos y detener los recurrentes con una fecha final, en vez de borrar su historial.

### 3. Desglose con nombres en Inicio
- Mostrar cada gasto aplicable al día, semana o mes con título, frecuencia, descripción cuando exista y cantidad imputada al período.
- Identificar los recurrentes como prorrateados y los únicos con su fecha.
- Los únicos se contabilizan íntegros en su fecha.
- Los semanales se distribuyen entre los cinco días operativos del ciclo sábado-viernes.
- Los mensuales se distribuyen entre los días operativos del mes correspondiente. Un mes completo suma la cantidad mensual; un mes parcial incluye solo los días aplicables después del inicio y antes del fin.
- Calcular el total y el desglose con la misma función para evitar diferencias entre las filas y Profit & Loss.

### 4. Transición sin duplicados
- Mover la presentación de la cifra semanal general desde Información del Shop al área de Gastos, identificándola como configuración contable existente. No inventar títulos o descripciones para sus partidas.
- Mantener intactos Cuadre, Nómina y sus reglas históricas. La configuración anterior continúa disponible allí.
- En Inicio, conservar el gasto fijo anterior como una partida identificada mientras no se sustituya explícitamente.
- Añadir una confirmación para sustituir en Inicio el presupuesto fijo anterior por gastos recurrentes detallados. Nunca sumar el presupuesto anterior y sus reemplazos a la vez. Los gastos únicos existentes se conservan.
- No reactivar gastos antiguos inactivos ni convertirlos automáticamente en gastos nuevos.
- Cambiar importes o fechas de un recurrente puede actualizar las estimaciones históricas de Inicio, pero no modifica nóminas finalizadas. Para conservar una tarifa anterior, detener ese gasto y crear otro con su nueva fecha de inicio.

## Detalles técnicos
- Ampliar de forma aditiva `operational_expenses` con descripción, frecuencia y fecha final opcional, dejando los registros existentes como gastos únicos.
- Guardar por barbería la selección explícita de la fuente de gastos recurrentes para Inicio, sin reutilizar ni alterar la configuración contable anterior.
- Mantener permisos de dueño/super_owner por barbería, validación de importes/fechas/frecuencias y consultas paginadas que no presenten cargas incompletas como cero.
- Compartir validación y cálculo de partidas entre Inicio y Ajustes. No generar filas duplicadas por cada repetición ni añadir tareas programadas.
- No cambiar reservas, pagos, Acuity ni mantenimiento de citas.

## Validación
- Probar gastos únicos, semanales y mensuales con cantidades concretas; domingos/lunes excluidos, meses de distintas longitudes, fechas de inicio y fin y redondeo en centavos.
- Confirmar que sustituir el presupuesto anterior no duplica gastos y que el total coincide con el desglose.
- Crear, recargar, editar y detener gastos desde una sesión autorizada; comprobar que Inicio y Ajustes coinciden en Diario/Semanal/Mensual.
- Comprobar aislamiento entre barberías y rechazo a clientes/barberos no autorizados.
- Revisar móvil de 440px y pantallas más estrechas: botón visible, fechas sin colisiones y tarjetas separadas.
- Ejecutar las pruebas financieras existentes para detectar cambios involuntarios en Cuadre y Nómina.

## Aprobación
Esta propuesta incluye cambios en cómo se guardan y calculan los gastos, no solo ajustes visuales. Implementar después de tu aprobación, incluida la regla de prorrateo mensual y la sustitución explícita del presupuesto anterior en Inicio.