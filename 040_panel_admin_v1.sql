-- ALIADOS FANTASMA — PANEL ADMINISTRATIVO V1.0
-- Ejecuta TODO este archivo una sola vez en Supabase > SQL Editor.
-- Es idempotente: puedes volver a ejecutarlo si necesitas reparar funciones/políticas.

begin;

alter table public.pre_registros
  add column if not exists negocio_id uuid references public.negocios(id) on delete set null;

alter table public.pre_registros
  add column if not exists notas_admin text;

alter table public.pre_registros
  add column if not exists revisado_at timestamptz;

-- Devuelve pre-registros al administrador sin depender de políticas RLS frágiles.
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

-- Cambia un pre-registro a pendiente, contactado o rechazado.
create or replace function public.admin_cambiar_estado_pre_registro(
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

  if p_estado not in ('pendiente', 'contactado', 'rechazado') then
    raise exception 'Estado no permitido';
  end if;

  update public.pre_registros
  set estado = p_estado,
      notas_admin = nullif(trim(coalesce(p_notas, '')), ''),
      revisado_at = now(),
      updated_at = now()
  where id = p_id
  returning * into resultado;

  if resultado.id is null then
    raise exception 'Pre-registro no encontrado';
  end if;

  if p_estado = 'rechazado' then
    update public.perfiles
    set estado = 'suspendido', activo = false, updated_at = now()
    where id = p_id and rol <> 'administrador';
  end if;

  return resultado;
end;
$$;

-- Aprueba en una sola transacción: activa usuario, crea negocio y asigna propietario.
create or replace function public.admin_aprobar_pre_registro(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  solicitud public.pre_registros;
  nuevo_negocio_id uuid;
  categoria_encontrada uuid;
  slug_base text;
  slug_final text;
  intento integer := 0;
begin
  if not public.es_administrador() then
    raise exception 'No autorizado';
  end if;

  select * into solicitud
  from public.pre_registros
  where id = p_id
  for update;

  if solicitud.id is null then
    raise exception 'Pre-registro no encontrado';
  end if;

  if not solicitud.correo_verificado then
    raise exception 'El correo todavía no está verificado';
  end if;

  if solicitud.negocio_id is not null then
    nuevo_negocio_id := solicitud.negocio_id;
  else
    select c.id into categoria_encontrada
    from public.categorias c
    where lower(trim(c.nombre)) = lower(trim(coalesce(solicitud.categoria, '')))
       or lower(c.slug) = lower(public.normalizar_slug(coalesce(solicitud.categoria, '')))
    limit 1;

    slug_base := public.normalizar_slug(coalesce(nullif(trim(solicitud.nombre_negocio), ''), 'negocio'));
    if slug_base = '' then slug_base := 'negocio'; end if;
    slug_final := slug_base;

    while exists (select 1 from public.negocios n where n.slug = slug_final) loop
      intento := intento + 1;
      slug_final := slug_base || '-' || (intento + 1)::text;
    end loop;

    insert into public.negocios (
      slug, nombre, categoria_id, correo, whatsapp, colonia, municipio,
      estado_region, pais, estado, activo, creado_por, actualizado_por
    ) values (
      slug_final,
      solicitud.nombre_negocio,
      categoria_encontrada,
      solicitud.correo,
      solicitud.whatsapp,
      solicitud.colonia,
      solicitud.municipio,
      'Estado de México',
      'México',
      'borrador',
      false,
      auth.uid(),
      auth.uid()
    ) returning id into nuevo_negocio_id;
  end if;

  insert into public.perfiles (id, nombre, correo, telefono, rol, estado, activo, updated_at)
  values (
    solicitud.id,
    solicitud.nombre_responsable,
    solicitud.correo,
    solicitud.whatsapp,
    'propietario',
    'activo',
    true,
    now()
  )
  on conflict (id) do update set
    nombre = excluded.nombre,
    correo = excluded.correo,
    telefono = excluded.telefono,
    rol = 'propietario',
    estado = 'activo',
    activo = true,
    updated_at = now();

  insert into public.miembros_negocio (negocio_id, perfil_id, rol, activo, invitado_por, updated_at)
  values (nuevo_negocio_id, solicitud.id, 'propietario', true, auth.uid(), now())
  on conflict (negocio_id, perfil_id) do update set
    rol = 'propietario',
    activo = true,
    updated_at = now();

  update public.pre_registros
  set estado = 'aprobado',
      negocio_id = nuevo_negocio_id,
      revisado_at = now(),
      updated_at = now()
  where id = solicitud.id;

  return jsonb_build_object(
    'ok', true,
    'pre_registro_id', solicitud.id,
    'negocio_id', nuevo_negocio_id,
    'nombre_negocio', solicitud.nombre_negocio,
    'mensaje', 'Negocio aprobado y cuenta activada'
  );
end;
$$;

create or replace function public.admin_resumen_panel()
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
    'pre_registros_pendientes', (select count(*) from public.pre_registros where estado = 'pendiente'),
    'pre_registros_contactados', (select count(*) from public.pre_registros where estado = 'contactado'),
    'pre_registros_aprobados', (select count(*) from public.pre_registros where estado = 'aprobado'),
    'negocios_total', (select count(*) from public.negocios),
    'negocios_activos', (select count(*) from public.negocios where activo = true),
    'solicitudes_pendientes', (select count(*) from public.solicitudes_cambio where estado = 'pendiente'),
    'promociones_activas', (select count(*) from public.promociones where activa = true),
    'categorias_total', (select count(*) from public.categorias)
  );
end;
$$;

grant execute on function public.admin_listar_pre_registros() to authenticated;
grant execute on function public.admin_cambiar_estado_pre_registro(uuid, text, text) to authenticated;
grant execute on function public.admin_aprobar_pre_registro(uuid) to authenticated;
grant execute on function public.admin_resumen_panel() to authenticated;

commit;

-- Comprobación: debe devolver la fila de tu cuenta administradora.
select id, nombre, correo, rol, estado, activo
from public.perfiles
where id = auth.uid() or rol = 'administrador'
order by updated_at desc;
