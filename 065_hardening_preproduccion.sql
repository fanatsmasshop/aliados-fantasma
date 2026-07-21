-- ALIADOS FANTASMA v1.8.2 — HARDENING DE PREPRODUCCIÓN
-- Ejecutar después de 064_hardening_perfiles_borrador.sql.
-- Objetivos:
-- 1) retirar triggers duplicados de updated_at;
-- 2) restringir RPC administrativas al rol authenticated;
-- 3) reforzar search_path de funciones sensibles;
-- 4) añadir índices seguros para los flujos más usados.

begin;

-- =========================================================
-- 1. LIMPIEZA DE TRIGGERS DUPLICADOS
-- Se conserva actualizar_updated_at_trigger en tablas generales.
-- En negocios/promociones se conserva el trigger de sincronización,
-- porque ya actualiza updated_at por sí mismo.
-- =========================================================

drop trigger if exists actualizar_categorias_updated_at on public.categorias;
drop trigger if exists actualizar_perfiles_updated_at on public.perfiles;
drop trigger if exists actualizar_solicitudes_updated_at on public.solicitudes_cambio;
drop trigger if exists actualizar_negocios_updated_at on public.negocios;
drop trigger if exists actualizar_promociones_updated_at on public.promociones;

-- La función antigua queda sin uso después de retirar esos triggers.
drop function if exists public.actualizar_fecha_modificacion();

-- =========================================================
-- 2. SEARCH_PATH EXPLÍCITO EN FUNCIONES SENSIBLES
-- =========================================================

alter function public.actualizar_verificacion_pre_registro()
  set search_path = public, auth, pg_temp;

alter function public.registrar_pre_registro_desde_auth()
  set search_path = public, auth, pg_temp;

alter function public.admin_actualizar_modo_lanzamiento(text)
  set search_path = public, auth, pg_temp;

alter function public.admin_dar_baja_negocio(uuid, text)
  set search_path = public, auth, pg_temp;

-- =========================================================
-- 3. PERMISOS DE FUNCIONES
-- Las RPC admin siguen validando internamente es_administrador(),
-- pero además dejan de ser ejecutables por anon o PUBLIC.
-- =========================================================

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as firma
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'admin\_%' escape '\'
  loop
    execute format('revoke execute on function %s from public', r.firma);
    execute format('revoke execute on function %s from anon', r.firma);
    execute format('grant execute on function %s to authenticated', r.firma);
  end loop;
end;
$$;

-- Las funciones de trigger no necesitan ejecución directa desde la API.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as firma
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public', r.firma);
    execute format('revoke execute on function %s from anon', r.firma);
    execute format('revoke execute on function %s from authenticated', r.firma);
  end loop;
end;
$$;

-- =========================================================
-- 4. ÍNDICES DE APOYO
-- IF NOT EXISTS evita errores si ya existe un índice con este nombre.
-- =========================================================

create index if not exists idx_af_pre_registros_estado_created
  on public.pre_registros (estado, created_at desc);

create index if not exists idx_af_pre_registros_correo_normalizado
  on public.pre_registros (lower(trim(correo)));

create index if not exists idx_af_perfiles_borrador_usuario
  on public.perfiles_borrador (usuario_id);

create index if not exists idx_af_perfiles_borrador_estado
  on public.perfiles_borrador (estado);

create index if not exists idx_af_perfiles_borrador_negocio
  on public.perfiles_borrador (negocio_id)
  where negocio_id is not null;

create index if not exists idx_af_negocios_activo_slug
  on public.negocios (activo, slug);

create index if not exists idx_af_miembros_perfil_negocio_activo
  on public.miembros_negocio (perfil_id, negocio_id)
  where activo = true;

create index if not exists idx_af_galeria_negocio_orden
  on public.galeria_negocio (negocio_id, orden);

commit;
