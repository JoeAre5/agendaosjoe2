# Prueba SQL de la agenda nativa (migraciones 0016 + 0022 + 0023)

Ejecuta las migraciones reales sobre un Postgres en memoria (PGlite, WebAssembly) con un esquema **mínimo**
y comprueba reservas, choques, bloqueos, reservas temporales, reprogramar, cancelar y permisos.

**Qué NO es:** no usa el esquema real de producción ni prueba concurrencia real (una sola conexión).
Sirve para validar la lógica del SQL antes de llevarlo a una base de prueba de verdad.

## Cómo correrla
Fuera del proyecto, en una carpeta temporal:

```bash
mkdir pgtest && cd pgtest && npm init -y && npm install @electric-sql/pglite@0.2.17
cp RUTA_DEL_REPO/supabase/tests/native_sql/native_sql_test.mjs .
node native_sql_test.mjs RUTA_DEL_REPO
```

Resultado esperado: `RESUMEN: 53 ok, 0 fallas`.
