# Crear perfil primero (onboarding antes de la cuenta)

## Hallazgo clave (reusar, no construir)
Ya existe una pantalla de bienvenida (`/bienvenido`) que pide nombre, apellido, teléfono, correo y contraseña, y crea la cuenta con validación estricta en el servidor (nombre y teléfono obligatorios). El problema es que el botón "Mi Perfil" lleva a `/citas/acceso`, que crea cuentas solo con correo y contraseña (de ahí los nombres tipo "franquiabdiel7").

## Cambios
1. **"Mi Perfil" → elección simple**: en `/citas/acceso`, quitar la creación de cuenta automática. La pantalla queda solo para **Iniciar sesión**, con un enlace/botón **"Crear perfil"** que lleva a `/bienvenido` (conservando el correo si viene en el enlace).
2. **Onboarding = registro**: el botón final de `/bienvenido` pasa de "Crear cuenta" a **"Crear perfil"**. Al terminar ya inicia sesión con los datos creados (comportamiento actual, sin cambios).
3. **Cerrar la puerta débil en el servidor**: `pwa-signup` exige nombre y teléfono para todo registro nuevo (no solo `source=welcome`). Así ninguna otra entrada puede volver a crear perfiles sin nombre.
4. **Quitar el apellido duplicado**: en la reserva del portal, no rellenar el apellido vacío con el nombre.

## Fuera de alcance (omitido a propósito)
- Corregir los 6 perfiles afectados (se hace aparte, con tu confirmación).
- Quitar el nombre derivado del correo en la función de base de datos de enlace (queda inofensivo tras el punto 3; se revisa luego).
- Cambios a cuentas de staff, Acuity, pagos o contabilidad.

## Validación
- Probar en base de datos separada: registro sin nombre/teléfono es rechazado; registro completo crea perfil con nombre real.
- Playwright móvil: Mi Perfil → Iniciar sesión funciona; Crear perfil → bienvenida → portal.

## Riesgo
- Clientes que llegan desde el popup post-reserva (`/citas/acceso?email=`) ahora pasan por la bienvenida completa: un paso más, pero datos correctos.
