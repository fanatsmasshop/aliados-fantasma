-- ALIADOS FANTASMA v1.8.2 — VERIFICACIÓN DE PREPRODUCCIÓN
-- Este archivo NO modifica datos. Ejecuta cada bloque después del 064 y 065.

-- 1. Confirmar que RLS está activa en todas las tablas públicas.
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- 2. Detectar tablas públicas sin políticas RLS.
select t.tablename
from pg_tables t
left join pg_policies p
  on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public'
  and t.rowsecurity = true
  and p.tablename is null
order by t.tablename;

-- 3. Confirmar que ya no quedan triggers duplicados de updated_at.
select event_object_schema, event_object_table, trigger_name, action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and trigger_name ilike '%updated_at%'
order by event_object_table, trigger_name;

-- 4. Confirmar permisos de las RPC administrativas.
select
  p.proname as function_name,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_puede_ejecutar,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_puede_ejecutar
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'admin\_%' escape '\'
order by p.proname;

-- 5. Revisar el control global de lanzamiento.
select *
from public.configuracion_sistema
where id = 1;

-- 6. Detectar duplicados por correo en pre-registros.
select lower(trim(correo)) as correo_normalizado, count(*)
from public.pre_registros
where correo is not null
  and trim(correo) <> ''
group by lower(trim(correo))
having count(*) > 1;

-- 7. Detectar perfiles borrador asociados a más de un negocio o sin usuario válido.
select pb.usuario_id, pb.negocio_id, pb.estado
from public.perfiles_borrador pb
left join auth.users u on u.id = pb.usuario_id
where u.id is null;

-- 8. Negocios activos sin slug o con slug duplicado.
select slug, count(*)
from public.negocios
where activo = true
group by slug
having slug is null or trim(slug) = '' or count(*) > 1;
