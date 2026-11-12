# Papelera para todos los gastos

## Cambio propuesto
- Añadir una papelera a cada gasto, incluidos los recurrentes activos o pausados, conservando Editar y Pausar/Reactivar.
- Pedir confirmación con el nombre del gasto y advertir que la eliminación es permanente, sin opción de deshacer.
- Al confirmar, eliminar el gasto guardado, no solo ocultarlo o pausarlo. Actualizar la lista y su total después de verificar que la eliminación terminó.
- Si falla, mantener el gasto visible y mostrar el error.

## Alcance e impacto
- VERIFICADO: cada gasto de esta sección se guarda en una única tabla. No existen referencias desde otras tablas ni procesos de eliminación que deban encadenarse.
- VERIFICADO: la eliminación ya está autorizada únicamente para administradores de la barbería; se conservarán esas restricciones.
- El gasto eliminado dejará de contribuir a Inicio y a futuras exportaciones de P&L, incluso para períodos anteriores donde se utilizaba esa definición. Los archivos exportados previamente no cambian.
- No se tocarán citas, pagos, Acuity, reportes de barberos ni nóminas finalizadas. No se borrarán otras tablas ni gastos distintos.

## Validación
- Probar eliminación de gastos únicos, diarios, semanales y mensuales, incluidos pausados; cancelar debe conservarlos y un fallo no debe ocultarlos.
- Verificar los tres controles en pantalla móvil.
- No eliminar gastos reales durante las pruebas ni crear un draft sin autorización. Una prueba real de persistencia requiere una base separada autorizada; mientras tanto, verificar con pruebas aisladas sin escrituras en producción.

## Detalles técnicos
- Separar explícitamente la acción de eliminar de la acción de cambiar estado en `OperationalExpensesManager.tsx`.
- Reutilizar la eliminación existente, limitada por `id` y `shop_id`, con confirmación de la fila eliminada. No se necesita modificar el esquema ni los permisos.