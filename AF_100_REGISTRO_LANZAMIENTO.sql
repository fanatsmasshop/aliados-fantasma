-- ============================================================
-- ALIADOS FANTASMA — AF-100 REGISTRO PARA LANZAMIENTO
-- Versión: 2026-07-24 RC1
-- Idempotente. Ejecutar una sola vez en Supabase > SQL Editor.
-- No elimina negocios, solicitudes, perfiles ni información existente.
-- ============================================================

begin;

-- 1) Estructura mínima y compatible del pre-registro.
create table if not exists public.pre_registros (
  id uuid primary key references auth.users(id) on delete cascade,
  correo text not null,
  nombre_responsable text not null,
  nombre_negocio text not null,
  categoria text,
  whatsapp text,
  municipio text,
  colonia text,
  correo_verificado boolean not null default false,
  estado text not null default 'pendiente' check (estado in ('pendiente','contactado','aprobado','rechazado')),
  notas_admin text,
  revisado_at timestamptz,
  revisado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pre_registros add column if not exists notas_admin text;
alter table public.pre_registros add column if not exists revisado_at timestamptz;
alter table public.pre_registros add column if not exists revisado_por uuid;
alter table public.pre_registros enable row level security;

-- 2) RLS explícito: cada usuario ve sólo su solicitud y administración gestiona todas.
drop policy if exists "Usuario consulta su pre registro" on public.pre_registros;
create policy "Usuario consulta su pre registro"
on public.pre_registros for select to authenticated
using (id = auth.uid() or public.es_administrador());

drop policy if exists "Administradores consultan pre registros" on public.pre_registros;
create policy "Administradores consultan pre registros"
on public.pre_registros for select to authenticated
using (public.es_administrador());

drop policy if exists "Administradores actualizan pre registros" on public.pre_registros;
create policy "Administradores actualizan pre registros"
on public.pre_registros for update to authenticated
using (public.es_administrador())
with check (public.es_administrador());

grant select, update on public.pre_registros to authenticated;

-- 3) Sincronización segura desde Supabase Auth al crear la cuenta.
create or replace function public.registrar_pre_registro_desde_auth()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'tipo_registro', '') = 'pre_registro_negocio' then
    insert into public.pre_registros (
      id, correo, nombre_responsable, nombre_negocio, categoria,
      whatsapp, municipio, colonia, correo_verificado, estado
    ) values (
      new.id,
      coalesce(new.email, ''),
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre_responsable'), ''), split_part(coalesce(new.email,''), '@', 1)),
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre_negocio'), ''), 'Negocio por completar'),
      nullif(trim(new.raw_user_meta_data ->> 'categoria'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'whatsapp'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'municipio'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'colonia'), ''),
      new.email_confirmed_at is not null,
      'pendiente'
    )
    on conflict (id) do update set
      correo = excluded.correo,
      nombre_responsable = excluded.nombre_responsable,
      nombre_negocio = excluded.nombre_negocio,
      categoria = coalesce(excluded.categoria, public.pre_registros.categoria),
      whatsapp = coalesce(excluded.whatsapp, public.pre_registros.whatsapp),
      municipio = coalesce(excluded.municipio, public.pre_registros.municipio),
      colonia = coalesce(excluded.colonia, public.pre_registros.colonia),
      correo_verificado = excluded.correo_verificado,
      updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists crear_pre_registro_al_registrarse on auth.users;
create trigger crear_pre_registro_al_registrarse
after insert on auth.users
for each row execute function public.registrar_pre_registro_desde_auth();

-- 4) Mantiene sincronizada la confirmación de correo.
create or replace function public.actualizar_verificacion_pre_registro()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if old.email_confirmed_at is distinct from new.email_confirmed_at then
    update public.pre_registros
       set correo = coalesce(new.email, correo),
           correo_verificado = new.email_confirmed_at is not null,
           updated_at = now()
     where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists actualizar_verificacion_pre_registro on auth.users;
create trigger actualizar_verificacion_pre_registro
after update of email_confirmed_at on auth.users
for each row execute function public.actualizar_verificacion_pre_registro();

-- 5) Reparación de autoservicio para cuentas creadas cuando el trigger no estaba activo.
create or replace function public.usuario_sincronizar_mi_pre_registro()
returns public.pre_registros
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user auth.users%rowtype;
  v_resultado public.pre_registros;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;

  select * into v_user from auth.users where id = auth.uid();
  if v_user.id is null then raise exception 'Usuario no encontrado'; end if;

  if coalesce(v_user.raw_user_meta_data ->> 'tipo_registro', '') = 'pre_registro_negocio' then
    insert into public.pre_registros (
      id, correo, nombre_responsable, nombre_negocio, categoria,
      whatsapp, municipio, colonia, correo_verificado, estado
    ) values (
      v_user.id,
      coalesce(v_user.email, ''),
      coalesce(nullif(trim(v_user.raw_user_meta_data ->> 'nombre_responsable'), ''), split_part(coalesce(v_user.email,''), '@', 1)),
      coalesce(nullif(trim(v_user.raw_user_meta_data ->> 'nombre_negocio'), ''), 'Negocio por completar'),
      nullif(trim(v_user.raw_user_meta_data ->> 'categoria'), ''),
      nullif(trim(v_user.raw_user_meta_data ->> 'whatsapp'), ''),
      nullif(trim(v_user.raw_user_meta_data ->> 'municipio'), ''),
      nullif(trim(v_user.raw_user_meta_data ->> 'colonia'), ''),
      v_user.email_confirmed_at is not null,
      'pendiente'
    )
    on conflict (id) do update set
      correo = excluded.correo,
      correo_verificado = excluded.correo_verificado,
      updated_at = now();
  end if;

  select * into v_resultado from public.pre_registros where id = v_user.id;
  return v_resultado;
end;
$$;

-- 6) Consulta propia oficial.
create or replace function public.usuario_obtener_mi_pre_registro()
returns public.pre_registros
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_resultado public.pre_registros;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;

  select * into v_resultado
  from public.pre_registros
  where id = auth.uid()
  limit 1;

  return v_resultado;
end;
$$;

-- 7) Decisión administrativa: aprobar habilita al propietario para completar onboarding.
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
  if not public.es_administrador() then raise exception 'No autorizado'; end if;
  if p_estado not in ('pendiente','contactado','aprobado','rechazado') then
    raise exception 'Estado no permitido';
  end if;

  select * into resultado from public.pre_registros where id = p_id for update;
  if resultado.id is null then raise exception 'Pre-registro no encontrado'; end if;
  if p_estado = 'aprobado' and resultado.correo_verificado is not true then
    raise exception 'No se puede aprobar: el correo todavía no está verificado';
  end if;

  update public.pre_registros
     set estado = p_estado,
         notas_admin = nullif(trim(coalesce(p_notas,'')),''),
         revisado_at = now(),
         revisado_por = auth.uid(),
         updated_at = now()
   where id = p_id
   returning * into resultado;

  if p_estado = 'aprobado' then
    insert into public.perfiles (id,nombre,correo,telefono,rol,estado,activo,updated_at)
    values (resultado.id,resultado.nombre_responsable,resultado.correo,resultado.whatsapp,'propietario','activo',true,now())
    on conflict (id) do update set
      nombre = excluded.nombre,
      correo = excluded.correo,
      telefono = excluded.telefono,
      rol = 'propietario',
      estado = 'activo',
      activo = true,
      updated_at = now();

    insert into public.perfiles_borrador (usuario_id,datos,estado,porcentaje,updated_at)
    values (
      resultado.id,
      jsonb_build_object(
        'nombre', resultado.nombre_negocio,
        'categoria', coalesce(resultado.categoria,''),
        'whatsapp', coalesce(resultado.whatsapp,''),
        'municipio', coalesce(resultado.municipio,''),
        'colonia', coalesce(resultado.colonia,''),
        'galeria', '[]'::jsonb,
        'promociones', '[]'::jsonb,
        'horarios', '[]'::jsonb
      ),
      'borrador', 0, now()
    )
    on conflict (usuario_id) do nothing;
  elsif p_estado = 'rechazado' then
    update public.perfiles
       set estado = 'suspendido', activo = false, updated_at = now()
     where id = resultado.id and rol <> 'administrador';
  end if;

  return resultado;
end;
$$;

-- 8) Recupera usuarios existentes del flujo oficial sin sobreescribir decisiones administrativas.
insert into public.pre_registros (
  id, correo, nombre_responsable, nombre_negocio, categoria,
  whatsapp, municipio, colonia, correo_verificado, estado
)
select
  u.id,
  coalesce(u.email,''),
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'nombre_responsable'),''),split_part(coalesce(u.email,''),'@',1)),
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'nombre_negocio'),''),'Negocio por completar'),
  nullif(trim(u.raw_user_meta_data ->> 'categoria'),''),
  nullif(trim(u.raw_user_meta_data ->> 'whatsapp'),''),
  nullif(trim(u.raw_user_meta_data ->> 'municipio'),''),
  nullif(trim(u.raw_user_meta_data ->> 'colonia'),''),
  u.email_confirmed_at is not null,
  'pendiente'
from auth.users u
where coalesce(u.raw_user_meta_data ->> 'tipo_registro','') = 'pre_registro_negocio'
on conflict (id) do update set
  correo = excluded.correo,
  correo_verificado = excluded.correo_verificado,
  updated_at = now();

revoke all on function public.usuario_sincronizar_mi_pre_registro() from public;
revoke all on function public.usuario_obtener_mi_pre_registro() from public;
revoke all on function public.admin_actualizar_pre_registro(uuid,text,text) from public;
grant execute on function public.usuario_sincronizar_mi_pre_registro() to authenticated;
grant execute on function public.usuario_obtener_mi_pre_registro() to authenticated;
grant execute on function public.admin_actualizar_pre_registro(uuid,text,text) to authenticated;

commit;

-- Verificación final (sólo muestra datos; no modifica nada).
select
  count(*) as total_pre_registros,
  count(*) filter (where correo_verificado) as correos_verificados,
  count(*) filter (where estado='pendiente') as pendientes,
  count(*) filter (where estado='aprobado') as aprobados
from public.pre_registros;
