-- ALIADOS FANTASMA — HOTFIX PRE-REGISTRO v1.2
-- Ejecuta TODO este archivo DESPUÉS de 050_pre_registro_oficial.sql.
-- Corrige la autorización administrativa sin crear negocios ni activar la plataforma oficial.

begin;

-- El administrador se reconoce por rol + cuenta activa.
-- No depende del campo estado, porque durante la fase de pre-registro puede seguir como pendiente.
create or replace function public.es_administrador()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = auth.uid()
      and p.rol = 'administrador'
      and coalesce(p.activo, false) = true
  );
$$;

revoke all on function public.es_administrador() from public;
grant execute on function public.es_administrador() to authenticated;

-- Sincroniza nuevamente el correo del administrador desde Authentication.
update public.perfiles p
set correo = u.email,
    updated_at = now()
from auth.users u
where p.id = u.id
  and p.rol = 'administrador'
  and p.correo is distinct from u.email;

-- Reinstala las funciones de lectura para que usen la autorización corregida.
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
grant execute on function public.admin_resumen_pre_registro() to authenticated;

commit;

-- Debe devolver true cuando ejecutes la comprobación desde el panel web autenticado.
-- En SQL Editor auth.uid() es NULL, por eso aquí comprobamos la configuración del perfil:
select id, nombre, correo, rol, estado, activo
from public.perfiles
where rol = 'administrador';

select nombre_negocio, nombre_responsable, correo, correo_verificado, estado
from public.pre_registros
order by created_at desc;
