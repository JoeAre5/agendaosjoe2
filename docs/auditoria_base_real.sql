-- AUDITORIA DE SOLO LECTURA de la base real (políticas RLS, tareas programadas, permisos y funciones de apoyo).
-- Solo SELECT: no cambia nada. Se corre en el editor SQL de Lovable y se exporta el CSV (columnas: tipo;objeto;detalle).
-- Se corre igual en el proyecto de ensayo para comparar las dos bases fila por fila.
-- Nota: no exporta el texto de los comandos de las tareas programadas (podrían traer claves), solo su nombre, horario y huella.

-- 1) Políticas RLS de las tablas que toca la agenda nativa
select 'politica' as tipo,
       tablename || ' | ' || policyname as objeto,
       cmd || ' | roles=' || array_to_string(roles, ',') || ' | using=' || coalesce(left(regexp_replace(qual, '\s+', ' ', 'g'), 220), '') ||
       ' | check=' || coalesce(left(regexp_replace(with_check, '\s+', ' ', 'g'), 220), '') as detalle
  from pg_policies
 where schemaname = 'public'
   and tablename in ('appointments','services','service_addons','working_hours','shop_hours','booking_rules','booking_drafts',
                     'booking_draft_holds','barbers','shops','block_times','audit_log','clients','transactions','shop_memberships')
union all
-- 2) ¿Tienen RLS activado?
select 'rls', c.relname, case when c.relrowsecurity then 'activado' else 'DESACTIVADO' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
   and c.relname in ('appointments','services','service_addons','working_hours','shop_hours','booking_rules','booking_drafts',
                     'booking_draft_holds','barbers','shops','block_times','audit_log','clients','transactions','shop_memberships')
union all
-- 3) Tareas programadas (sin el texto del comando)
select 'cron', jobname, schedule || ' | activa=' || active::text || ' | huella=' || md5(command)
  from cron.job
union all
-- 4) Funciones de apoyo que usan las políticas y las migraciones nuevas: existencia, permisos y huella de su definición
select 'funcion_apoyo', p.proname,
       'anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')::text ||
       ' | authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text ||
       ' | service_role=' || has_function_privilege('service_role', p.oid, 'EXECUTE')::text ||
       ' | huella=' || md5(pg_get_functiondef(p.oid))
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('has_role','is_shop_member','current_shop_id','resolve_single_active_shop','get_internal_job_secret',
                     'is_owner','is_admin','update_updated_at_column')
union all
-- 5) Extensiones
select 'extension', extname, extversion from pg_extension where extname in ('pg_net','pg_cron','supabase_vault','pgcrypto','btree_gist')
union all
-- 6) Permisos por defecto sobre tablas nuevas del esquema public
select 'permisos_por_defecto', coalesce(pg_get_userbyid(defaclrole), '?'), coalesce(defaclacl::text, '')
  from pg_default_acl where defaclnamespace = 'public'::regnamespace
order by 1, 2, 3;
