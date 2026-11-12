# Personalizar las tarjetas de Inicio admin

## Experiencia propuesta
- Mantener presionada una tarjeta durante unos 500 ms activa el modo edición, con una vibración visual suave tipo iPhone. Deslizar para hacer scroll no debe activar la edición.
- Arrastrar las tarjetas para cambiar su orden, conservando su tamaño y contenido. Incluir desplazamiento automático al acercarse a los extremos de la pantalla.
- Mostrar **Listo / Done** únicamente durante la edición. Guardar el orden y salir del modo edición al pulsarlo.
- Cada tarjeta principal muestra un círculo con **−** en la esquina superior derecha durante la edición. Pulsarlo mueve esa tarjeta al final de **Detalles operativos**, sin borrar datos ni cambiar sus cifras.
- En Detalles operativos, permitir ordenar las tarjetas y devolverlas a Inicio mediante **+** durante la edición. Abrir esta sección automáticamente al trasladar una tarjeta para que siga localizable.
- Mantener el encabezado y el selector Diario/Semanal/Mensual fijos, fuera del orden editable. El mismo orden se aplica a los tres períodos.
- Fuera del modo edición, mantener todas las acciones actuales. Durante la edición, impedir que arrastrar o mantener presionada una tarjeta abra Reactivación o active sus controles por accidente.

## Alcance y conexiones
**VERIFICADO:** Inicio admin móvil y escritorio comparten las mismas tarjetas. Detalles operativos ya contiene Cobros por método, Ranking de barberos y Servicios. El proyecto ya tiene herramientas de arrastre y preferencias locales.

**PROPUESTO:** Personalizar las nueve tarjetas existentes: P&L, Gastos, Reactivación, Producción, Nómina estimada, Citas, Cobros por método, Ranking y Servicios. Conservar exactamente sus cálculos y consultas; cambiar solo su presentación y ubicación.

**PROPUESTO:** Guardar la configuración por administrador en este navegador/dispositivo, solo al pulsar Listo. No crear tablas, no escribir en producción, no crear drafts ni publicar. Si se abandona Inicio sin guardar, descartar los cambios pendientes.

**NO VERIFICADO:** Sincronización del orden entre dispositivos. No forma parte de esta propuesta; requeriría almacenamiento adicional y autorización independiente.

No modificar Inicio de barberos, reportes, El Cuadre, exportación, nómina real, pagos, citas, Acuity ni autenticación.

## Detalles técnicos
- Reutilizar `@dnd-kit/core` y `@dnd-kit/sortable`, con soporte táctil, ratón y teclado; no instalar paquetes nuevos.
- Usar identificadores estables para ordenar las tarjetas y separar las listas principal y operativa. Validar la configuración guardada, ignorar identificadores desconocidos y recuperar tarjetas faltantes en su ubicación predeterminada.
- Mantener un estado de edición separado del estado guardado, limitado al usuario administrador. Las preferencias nunca contienen cifras financieras ni datos de clientes.
- Encapsular el contenedor editable sin duplicar los componentes ni los cálculos actuales. Respetar movimiento reducido, áreas táctiles y controles accesibles.
- Si el navegador no permite guardar, mantener la edición abierta y mostrar un error, sin afirmar que se guardó.

## Validación antes de concluir
- Pruebas del orden, traslado al final de Detalles, devolución a Inicio, configuración inválida, aislamiento por usuario y guardado únicamente con Listo.
- Verificar con una sesión admin real: mantener presionado, arrastrar, trasladar, devolver, guardar y recargar para leer el resultado.
- Comprobar móvil y escritorio, scroll táctil normal, teclado y movimiento reducido.
- Confirmar que las cifras y acciones originales siguen iguales y que no se producen escrituras a registros del negocio.

## Autorización
Aprobar este plan autoriza únicamente la personalización visual local descrita, sin cambios de datos del negocio ni sincronización entre dispositivos.