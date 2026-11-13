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

// Acepta la salida de la CLI ({ ..., "rows": [...] }) y tambien un arreglo JSON exportado desde el
// editor SQL de Supabase ("Copy as JSON" / descarga JSON): [ { "t": "...", "c": "..." }, ... ].
function readRows(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  if (/\.csv$/i.test(file)) return parseCsv(raw);
  const json = JSON.parse(raw.slice(raw.search(/[[{]/)));
  return Array.isArray(json) ? json : (json.rows ?? json);
}

// CSV del boton "Export CSV" del editor SQL: primera fila = nombres de columna (t,c o p).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.some((c) => c !== "")) rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const types = fs.readFileSync(typesFile, "utf8");

/** Tablas y vistas (con sus columnas) que declara la app: bloques Tables y Views de public, campo Row. */
function typedTables() {
  const out = {};
  const sections = [["    Tables: {", "    Views: {"], ["    Views: {", "    Functions: {"]];
  for (const [from, to] of sections) {
    const start = types.indexOf(from);
    const end = types.indexOf(to, start);
    if (start < 0 || end < 0) continue;
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

console.log(`Tablas/vistas que faltan: ${missingTables.length ? missingTables.join(", ") : "ninguna"}`);
console.log(`Columnas que faltan:  ${missingColumns.length ? "\n  " + missingColumns.join("\n  ") : "ninguna"}`);
console.log(`Funciones que faltan: ${missingFunctions.length ? missingFunctions.join(", ") : "ninguna"}`);
process.exit(missingTables.length + missingColumns.length + missingFunctions.length > 0 ? 1 : 0);
