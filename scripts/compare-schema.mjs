// Compara el esquema REAL de una base con lo que espera la app (src/integrations/supabase/types.ts).
// Sirve para ensayar el corte a produccion sin sorpresas: detecta tablas, columnas y funciones que la
// app usa y la base no tiene (como pasó con transactions.gateway_fee_cents).
//
// Uso:
//   1) Exportar columnas y funciones de la base (solo lectura):
//        npx supabase db query --read-only --remote=<ref> -o json \
//          "select table_name t, column_name c from information_schema.columns where table_schema='public'" > cols.json
//        npx supabase db query --read-only --remote=<ref> -o json \
//          "select distinct proname p from pg_proc where pronamespace='public'::regnamespace" > funcs.json
//   2) node scripts/compare-schema.mjs cols.json funcs.json
//
// Sale con codigo 1 si falta algo. Solo lee archivos locales: no se conecta a ninguna base.
import fs from "node:fs";

const [, , colsFile, funcsFile, typesFile = "src/integrations/supabase/types.ts"] = process.argv;
if (!colsFile || !funcsFile) {
  console.error("Uso: node scripts/compare-schema.mjs cols.json funcs.json [types.ts]");
  process.exit(2);
}

function readRows(file) {
  const raw = fs.readFileSync(file, "utf8");
  const json = JSON.parse(raw.slice(raw.indexOf("{")));
  return json.rows ?? json;
}

const types = fs.readFileSync(typesFile, "utf8");

/** Tablas y columnas que declara la app (bloque Row de cada tabla de public). */
function typedTables() {
  const start = types.indexOf("    Tables: {");
  const end = types.indexOf("    Views: {", start);
  const out = {};
  let cur = null;
  let inRow = false;
  for (const line of types.slice(start, end).split("\n")) {
    const t = line.match(/^      ([a-z_0-9]+): \{$/);
    if (t) { cur = t[1]; out[cur] = []; continue; }
    if (/^        Row: \{$/.test(line)) { inRow = true; continue; }
    if (inRow && /^        \}$/.test(line)) { inRow = false; continue; }
    if (inRow && cur) {
      const c = line.match(/^          ([a-z_0-9]+)\??: /);
      if (c) out[cur].push(c[1]);
    }
  }
  return out;
}

/** Funciones (RPC) que declara la app. */
function typedFunctions() {
  const a = types.indexOf("    Functions: {");
  const b = types.indexOf("    Enums: {", a);
  return [...types.slice(a, b).matchAll(/^      ([a-z_0-9]+): \{$/gm)].map((m) => m[1]);
}

const db = {};
for (const r of readRows(colsFile)) (db[r.t] ??= new Set()).add(r.c);
const dbFuncs = new Set(readRows(funcsFile).map((r) => r.p));

const missingTables = [];
const missingColumns = [];
for (const [table, cols] of Object.entries(typedTables())) {
  if (!db[table]) { missingTables.push(table); continue; }
  for (const c of cols) if (!db[table].has(c)) missingColumns.push(`${table}.${c}`);
}
const missingFunctions = typedFunctions().filter((f) => !dbFuncs.has(f));

console.log(`Tablas que faltan:    ${missingTables.length ? missingTables.join(", ") : "ninguna"}`);
console.log(`Columnas que faltan:  ${missingColumns.length ? "\n  " + missingColumns.join("\n  ") : "ninguna"}`);
console.log(`Funciones que faltan: ${missingFunctions.length ? missingFunctions.join(", ") : "ninguna"}`);
process.exit(missingTables.length + missingColumns.length + missingFunctions.length > 0 ? 1 : 0);
