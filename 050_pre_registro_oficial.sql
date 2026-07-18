-- ALIADOS FANTASMA — FASE DE PRE-REGISTRO v1.1
-- Ejecuta TODO este archivo en Supabase > SQL Editor.
-- Esta versión NO crea negocios, NO activa paneles y NO convierte cuentas en propietarios.

begin;

alter table public.pre_registros
  add column if not exists notas_admin text;

alter table public.pre_registros
  add column if not exists revisado_at timestamptz;

alter table public.pre_registros
  add column if not exists revisado_por uuid;

-- Desactiva automatizaciones anteriores que convertían el pre-registro en negocio.
drop trigger if exists sincronizar_aprobacion_pre_registro on public.pre_registros;
drop function if exists public.sincronizar_aprobacion_pre_registro();
drop function if exists public.admin_aprobar_pre_registro(uuid);

-- Sincroniza los datos básicos de perfiles con Authentication.
-- Corrige, entre otros casos, el correo NULL de la cuenta administradora.
update public.perfiles p
set correo = u.email,
    nombre = case
      when nullif(trim(coalesce(p.nombre, '')), '') is null then coalesce(u.raw_user_meta_data ->> 'nombre_responsable', split_part(u.email, '@', 1))
      else p.nombre
    end,
    updated_at = now()
from auth.users u
where p.id = u.id
  and (p.correo is distinct from u.email or p.correo is null);

-- Recupera registros de Authentication que correspondan al pre-registro y aún no estén en la tabla.
insert into public.pre_registros (
  id, correo, nombre_responsable, nombre_negocio, categoria,
  whatsapp, municipio, colonia, correo_verificado, estado
)
select
  u.id,
  u.email,
  coalesce(nullif(u.raw_user_meta_data ->> 'nombre_responsable', ''), split_part(u.email, '@', 1)),
  coalesce(nullif(u.raw_user_meta_data ->> 'nombre_negocio', ''), 'Negocio por completar'),
  nullif(u.raw_user_meta_data ->> 'categoria', ''),
  nullif(u.raw_user_meta_data ->> 'whatsapp', ''),
  nullif(u.raw_user_meta_data ->> 'municipio', ''),
  nullif(u.raw_user_meta_data ->> 'colonia', ''),
  u.email_confirmed_at is not null,
  'pendiente'
from auth.users u
where coalesce(u.raw_user_meta_data ->> 'tipo_registro', '') = 'pre_registro_negocio'
on conflict (id) do update set
  correo = excluded.correo,
  nombre_responsable = case when public.pre_registros.nombre_responsable = '' then excluded.nombre_responsable else public.pre_registros.nombre_responsable end,
  nombre_negocio = case when public.pre_registros.nombre_negocio = '' then excluded.nombre_negocio else public.pre_registros.nombre_negocio end,
  correo_verificado = excluded.correo_verificado,
  updated_at = now();

create or replace function public.admin_listar_pre_registros()
returns setof public.pre_registros
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.es_administrador() then
    raise exception 'No autorizado';
  end if;

  return query
  select p.*
  from public.pre_registros p
  order by
    case p.estado
      when 'pendiente' then 1
      when 'contactado' then 2
      when 'aprobado' then 3
      when 'rechazado' then 4
      else 5
    end,
    p.created_at desc;
end;
$$;

-- Única función administrativa de decisión durante esta fase.
-- Aprobar sólo cambia el estado del pre-registro y conserva los datos para contacto posterior.
create or replace function public.admin_actualizar_pre_registro(
  p_id uuid,
  p_estado text,
  p_notas text default null
)
returns public.pre_registros
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  resultado public.pre_registros;
begin
  if not public.es_administrador() then
    raise exception 'No autorizado';
  end if;

  if p_estado not in ('pendiente', 'contactado', 'aprobado', 'rechazado') then
    raise exception 'Estado no permitido';
  end if;

  if p_estado = 'aprobado' and not exists (
    select 1 from public.pre_registros p
    where p.id = p_id and p.correo_verificado = true
  ) then
    raise exception 'No se puede aprobar: el correo todavía no está verificado';
  end if;

  update public.pre_registros
  set estado = p_estado,
      notas_admin = nullif(trim(coalesce(p_notas, '')), ''),
      revisado_at = now(),
      revisado_por = auth.uid(),
      updated_at = now()
  where id = p_id
  returning * into resultado;

  if resultado.id is null then
    raise exception 'Pre-registro no encontrado';
  end if;

  return resultado;
end;
$$;

create or replace function public.admin_resumen_pre_registro()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.es_administrador() then
    raise exception 'No autorizado';
  end if;

  return jsonb_build_object(
    'pendientes', (select count(*) from public.pre_registros where estado = 'pendiente'),
    'contactados', (select count(*) from public.pre_registros where estado = 'contactado'),
    'aprobados', (select count(*) from public.pre_registros where estado = 'aprobado'),
    'rechazados', (select count(*) from public.pre_registros where estado = 'rechazado'),
    'total', (select count(*) from public.pre_registros),
    'verificados', (select count(*) from public.pre_registros where correo_verificado = true)
  );
end;
$$;

grant execute on function public.admin_listar_pre_registros() to authenticated;
grant execute on function public.admin_actualizar_pre_registro(uuid, text, text) to authenticated;
grant execute on function public.admin_resumen_pre_registro() to authenticated;

commit;

-- Comprobación final: debe mostrar tu administrador con correo y los pre-registros existentes.
select id, nombre, correo, rol, estado, activo
from public.perfiles
where rol = 'administrador'
order by updated_at desc;

select nombre_negocio, nombre_responsable, correo, correo_verificado, estado, created_at
from public.pre_registros
order by created_at desc;
