# Correos opcionales y revisión segura de duplicados

## A. Problema
Los correos ficticios deben quedar vacíos y no reaparecer al reservar o sincronizar. La revisión de posibles duplicados debe permitir editar, posponer, conservar personas distintas y eliminar un perfil sin forzar una combinación.

## B. Evidencia, VERIFICADO
- Lectura actual: 73 perfiles y 127 citas contienen `@placeholder.local` o `@placeholders.local`. Los campos de correo admiten ausencia de valor. En borradores de reserva y las otras tablas de correo revisadas no apareció ninguno.
- Varias entradas de reserva todavía fabrican un correo: reservas de empleados, clientes, reserva pública, walk-in y confirmación de borradores. Algunas rutas filtran el resultado antes de guardarlo, otras no. Las protecciones actuales no cubren uniformemente mayúsculas ni ambos dominios.
- La función de duplicados instalada detecta nombre, teléfono y correo. Página y badges usan esa misma función. Son sugerencias, nunca prueba de identidad.
- El editor de contacto existente modifica el perfil, sus citas y Acuity, incluso citas antiguas sin vínculo cuyo nombre coincide. No es seguro reutilizar esa operación para corregir solo un perfil.
- La eliminación existente borra también citas, transacciones y otros registros; puede incluir perfiles adicionales del mismo nombre/contacto. La definición instalada no comprueba el rol del solicitante y concede ejecución a usuarios anónimos. No se ha intentado ejecutarla.

## C. Causa o brecha
Hay filtros de correo duplicados e incompletos. No existen decisiones persistentes de revisión de duplicados. Editar o eliminar con las acciones actuales tiene un alcance mayor que el solicitado.

## D. Solución mínima, PROPUESTO

### 1. Correo vacío y protección contra reaparición
- Tratar ambos dominios, sin distinguir mayúsculas y eliminando espacios externos, como ausencia de correo. Conservar todos los correos reales.
- Guardar la ausencia como `NULL`, mostrado como vacío, no inventar otro correo.
- Reutilizar una normalización común en todas las rutas pertinentes de reserva y entrada de Acuity. No cambiar nombres, teléfonos ni vínculos de clientes.
- Añadir protección de escritura en los campos operativos de perfiles, citas y borradores para impedir que una sincronización o versión antigua vuelva a guardar esos dominios. No reinterpretar correo vacío como identidad coincidente.
- Validar primero que Acuity acepta crear y actualizar citas sin correo en las modalidades usadas. Si no lo acepta, detener esa parte y presentar la limitación, sin introducir silenciosamente otro correo ficticio.
- No modificar los requisitos de correo real para registro de cuentas o pago alojado, ni enviar confirmaciones a direcciones ficticias. Sin correo no habrá confirmación por email; reserva/calendario deben continuar cuando su modalidad admita correo opcional.
- Tras aprobar y validar de forma aislada, limpiar únicamente los correos ficticios de perfiles y citas mediante una operación controlada. No editar auth, registros históricos de pagos, importaciones, auditorías o mensajes anteriores.

### 2. Acciones de revisión manual, solo administrador
- **Editar perfil:** lápiz en cada fila abre nombre, teléfono y correo. Guardado validado y autorizado, limitado al perfil elegido. No propagar por nombre, no modificar citas/pagos ni escribir a Acuity. Mostrar claramente que se corrigió el perfil local; no prometer que un cambio de nombre se mantenga ante sincronización hasta verificar su comportamiento.
- **Combinar:** conservar la acción existente y una confirmación que identifica exactamente los perfiles elegidos. No combinar por defecto solo porque los nombres coinciden.
- **Posponer hasta próxima sincronización:** ocultar temporalmente esa comparación de la lista y sus badges. Expira tras la siguiente sincronización completa y exitosa de Acuity de la barbería, no al refrescar la página ni por un webhook aislado. Si falla, sigue pospuesta. Reutilizar un indicador existente si es fiable; añadir una marca mínima si no existe.
- **Conservar ambos:** registrar una decisión reversible por pareja de perfiles, indicando que son personas distintas. Evitar que esa misma pareja reaparezca por el mismo nombre; no silenciar otros perfiles nuevos ni grupos completos. Permitir revisar/restaurar decisiones.
- **Eliminar perfil:** acción secundaria en rojo y confirmación explícita. Nueva operación limitada a un único perfil, bloqueada si está ligado a cuenta, citas, pagos u otras dependencias. No utilizar la eliminación actual que borra historial. Para perfiles con historial, conservar o combinar es la alternativa segura.
- Guardar quién/cuándo tomó cada decisión, con autorización de la barbería en el servidor. Página y los tres badges deben usar las mismas exclusiones, sin crear otro motor de detección.

### 3. Presentación según Apple Design
Aplicación web móvil y escritorio, tomando las convenciones de iOS/iPadOS: comparación legible por filas dentro de cada grupo, nombres y contactos separados, coincidencia como badge neutral, indicadores de cuenta discretos y espacio entre grupos.
- Editar con lápiz por perfil; Combinar y Conservar ambos visibles, con igual altura y diferente énfasis visual.
- Menú de más opciones para posponer y eliminación específica, sin esconder las acciones principales.
- Controles cómodos de al menos 44 × 44, etiquetas accesibles, confirmaciones con cancelar, estados de guardado/error, foco visible y movimiento reducido.
- Usar colores y controles existentes de la app, sin efectos de hover que cambien fondos; no anidar tarjetas.

## E. Alternativas
- Limpiar solo los datos sería más corto, pero los correos reaparecerían. Descartes solo en el dispositivo no serían consistentes entre sesiones y badges.
- Reutilizar la eliminación/editor actuales sería menos código, pero alcanzaría citas, pagos, otras personas y Acuity. Se rechaza para este flujo.

## F. Impacto y conexiones
Se conectan reserva, entrada de sincronización, reconocimiento de contactos, permisos de perfiles, detección y badges. No se cambian cálculos ni registros financieros, nómina, precios, recompensas o autenticación. Acuity sigue siendo la agenda vigente. Limpiar correos no debe cambiar `client_id` ni provocar combinaciones automáticas.

## G. Riesgos y límites, NO VERIFICADO
- Compatibilidad real de Acuity con correo omitido y efectos en cada modalidad de reserva.
- Señal fiable de sincronización completa para caducar una decisión.
- Persistencia de ediciones locales de nombre ante sincronizaciones posteriores, especialmente identidades compartidas.
- Seguridad de borrado debe comprobar todas las dependencias y carreras de escritura; el bloqueo no puede depender solo de la pantalla.
- La función de eliminación instalada presenta un riesgo independiente: se propone restringirla a administradores autorizados antes de exponer nuevas acciones, conservando su resultado para el flujo existente. Requiere pruebas aisladas.

## H. Validación
1. Pruebas concretas para ambos dominios, mayúsculas, espacios, correo real y nulo; creación y sincronización repetidas no reintroducen ficticios.
2. Probar todas las entradas de reserva aplicables con y sin correo, sin cobros reales ni cambios a citas de clientes.
3. Comprobar que la limpieza solo cambia correo y que IDs, citas, importes y pagos permanecen iguales.
4. Verificar rechazo a anónimos/barberos/otra barbería en acciones administrativas.
5. Editar, recargar, conservar ambos, deshacer y comprobar los tres badges; no esconder un tercer perfil nuevo.
6. Posponer: refrescar no restaura; sync fallida no restaura; siguiente sync completa sí restaura.
7. Eliminar un perfil de prueba vacío; rechazar perfil con cita, pago o cuenta y confirmar que ningún historial se borra.
8. Revisar móvil 360/440 px y escritorio, teclado y estados de error.

## I. Autorización y ejecución
No se han limpiado datos, aplicado cambios de permisos ni modificado pantallas. Este plan requiere aprobación por sus conexiones de identidad, sincronización y eliminación.
No crear drafts, según la preferencia de Charlie. Preparar y probar código localmente; las modificaciones de la base compartida y el despliegue quedan bloqueados hasta contar con validación en una base separada ya disponible y autorización para aplicar. Si no existe ese entorno, informar el bloqueo sin crear uno ni tocar producción.