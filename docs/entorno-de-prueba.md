# Entorno de prueba (esquema reconstruido)

Proyecto Supabase de prueba: `roncjrkutkcjfwdnvmhu` ("agendaosjoe2"). **No es producción.** Su `.env` nunca debe mezclarse con el del cliente (`zskjtfpiohvsgwvbbxnc`).

## Cómo se reconstruyó el esquema (sin volcado de producción)
El repo no define `shops`, `current_shop_id()` ni `resolve_single_active_shop()` (viven en producción). Se tomaron de las migraciones de la rama de Hasib (septiembre, anteriores a su aislamiento RLS) y se aplicó, en orden de fecha:

1. Las 290 migraciones de `supabase/migrations` + las migraciones de Hasib que faltan aquí hasta `20260906015438`.
   Se **excluyeron** las de Hasib `a1`–`a6` (RLS restrictivo multi-tienda), `b1`/`b4`/`b5` (su agenda nativa; la de este repo es `0022`–`0024`), `c1`/`c2` y las de marca.
2. `drizzle/migrations` `0000`–`0024` (incluye la agenda nativa).

## Ajustes hechos para poder aplicarlas (diferencias con producción)
- Omitidas por ser **correcciones de datos reales** (no esquema): relleno de un cliente de prueba de Charlie, limpieza de auditoría (2), asignación de referido, ajuste de una tarea programada por id numérico y otra por nombre.
- Quitadas las políticas de `realtime.messages` (Supabase hospedado no permite tocarlas).
- `COMMIT` tras los `ALTER TYPE ... ADD VALUE` (un valor nuevo de enum no se puede usar en la misma transacción).
- Todas las `CREATE POLICY` se hicieron idempotentes (`DROP POLICY IF EXISTS` antes), porque el repo define algunas dos veces.
- `INSERT` de buckets con `ON CONFLICT DO NOTHING`.

## Hallazgo de esta prueba
`audit_log.user_id` es **NOT NULL** en el esquema real. Las funciones de `0023`/`0024` pasaban `NULL` cuando no había usuario; ahora usan el UUID de ceros que usan otras migraciones del proyecto.

## Qué NO prueba este entorno
Es una aproximación. Puede diferir de producción en políticas RLS, funciones creadas desde el panel y datos. Hay que contrastarlo con un `supabase db dump --schema-only` real cuando exista.
