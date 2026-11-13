-- REVISION DE CATALOGO (solo lectura): servicios, complementos y avisos antes del corte a nativo.
-- Se corre en el editor SQL de Lovable y se exporta el CSV (columnas: tipo;nombre;detalle).
-- No cambia nada.

-- 1) Servicios activos con su barbero, duracion y precio
select 'servicio' as tipo,
       s.name as nombre,
       'barbero=' || coalesce(b.name, '(todos)') ||
       ' | min=' || coalesce(s.duration_minutes::text, 'NULL') ||
       ' | precio=$' || coalesce((s.price_cents / 100.0)::numeric(10,2)::text, 'NULL') ||
       ' | activo=' || s.is_active::text ||
       ' | acuity_type_id=' || coalesce(s.acuity_type_id::text, 'NULL') as detalle
  from public.services s
  left join public.barbers b on b.id = s.barber_id
 where s.is_active
union all
-- 2) Complementos
select 'complemento', a.name,
       'min=' || coalesce(a.duration_minutes::text, 'NULL') ||
       ' | precio=$' || coalesce((a.price_cents / 100.0)::numeric(10,2)::text, 'NULL') ||
       ' | activo=' || a.is_active::text
  from public.service_addons a
union all
-- 3) Barberos activos y cuantos servicios activos tienen (si es 0, no podran recibir citas nativas)
select 'barbero', b.name,
       'activo=' || b.is_active::text ||
       ' | servicios_activos=' || (select count(*) from public.services s where s.barber_id = b.id and s.is_active)::text ||
       ' | horas_semanales_filas=' || (select count(*) from public.working_hours w where w.barber_id = b.id and w.is_active)::text
  from public.barbers b
 where b.is_active
union all
-- 4) Avisos: datos que impedirian reservar
select 'AVISO', 'servicio sin duracion o precio', count(*)::text
  from public.services where is_active and (duration_minutes is null or duration_minutes <= 0 or price_cents is null)
union all
select 'AVISO', 'servicios duplicados (mismo nombre y barbero)', count(*)::text
  from (select name, barber_id from public.services where is_active group by 1, 2 having count(*) > 1) d
union all
select 'AVISO', 'duraciones que no son multiplo de 15 min', count(*)::text
  from public.services where is_active and duration_minutes % 15 <> 0
order by 1, 2;
