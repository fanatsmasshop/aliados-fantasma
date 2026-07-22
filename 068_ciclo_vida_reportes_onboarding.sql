-- ALIADOS FANTASMA — v2.4
-- Ciclo de vida, reportes, apelaciones y aceptación legal.
-- Ejecutar completo en Supabase SQL Editor después de 067_directorio_inteligente.sql.

begin;

alter table public.negocios add column if not exists estado_operativo text not null default 'activo';
alter table public.negocios add column if not exists cerrado_temporal_at timestamptz;
alter table public.negocios add column if not exists suspendido_at timestamptz;
alter table public.negocios add column if not exists suspendido_hasta timestamptz;
alter table public.negocios add column if not exists motivo_suspension text;
alter table public.negocios add column if not exists suspendido_por uuid references auth.users(id) on delete set null;
alter table public.negocios add column if not exists eliminacion_solicitada_at timestamptz;
alter table public.negocios add column if not exists eliminacion_programada_at timestamptz;
alter table public.negocios add column if not exists eliminacion_solicitada_por uuid references auth.users(id) on delete set null;

alter table public.negocios drop constraint if exists negocios_estado_operativo_check;
alter table public.negocios add constraint negocios_estado_operativo_check
check (estado_operativo in ('activo','cerrado_temporalmente','suspendido','eliminacion_programada'));

create table if not exists public.historial_negocio (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  tipo text not null,
  detalle text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.historial_negocio enable row level security;
drop policy if exists "Propietario y admin consultan historial" on public.historial_negocio;
create policy "Propietario y admin consultan historial" on public.historial_negocio for select to authenticated using (
  public.es_administrador() or exists(select 1 from public.perfiles_borrador p where p.negocio_id=historial_negocio.negocio_id and p.usuario_id=auth.uid())
);

create table if not exists public.aceptaciones_legales (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  version_terminos text not null,
  version_privacidad text not null,
  aceptado_at timestamptz not null default now(),
  unique(usuario_id,version_terminos,version_privacidad)
);
alter table public.aceptaciones_legales enable row level security;
drop policy if exists "Usuario consulta sus aceptaciones" on public.aceptaciones_legales;
create policy "Usuario consulta sus aceptaciones" on public.aceptaciones_legales for select to authenticated using (usuario_id=auth.uid() or public.es_administrador());
drop policy if exists "Usuario registra su aceptacion" on public.aceptaciones_legales;
create policy "Usuario registra su aceptacion" on public.aceptaciones_legales for insert to authenticated with check (usuario_id=auth.uid());

create table if not exists public.reportes_negocio (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  reportante_id uuid references auth.users(id) on delete set null,
  correo_reportante text,
  motivo text not null,
  descripcion text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','en_revision','resuelto','descartado')),
  respuesta_negocio text,
  respuesta_admin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.reportes_negocio enable row level security;
drop policy if exists "Publico crea reportes" on public.reportes_negocio;
create policy "Publico crea reportes" on public.reportes_negocio for insert to anon,authenticated with check (char_length(trim(descripcion)) between 10 and 1500);
drop policy if exists "Admin y propietario consultan reportes" on public.reportes_negocio;
create policy "Admin y propietario consultan reportes" on public.reportes_negocio for select to authenticated using (
  public.es_administrador() or exists(select 1 from public.perfiles_borrador p where p.negocio_id=reportes_negocio.negocio_id and p.usuario_id=auth.uid())
);
drop policy if exists "Admin actualiza reportes" on public.reportes_negocio;
create policy "Admin actualiza reportes" on public.reportes_negocio for update to authenticated using (public.es_administrador()) with check (public.es_administrador());

create table if not exists public.apelaciones_suspension (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  explicacion text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','en_revision','aceptada','rechazada')),
  respuesta_admin text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.apelaciones_suspension enable row level security;
drop policy if exists "Propietario crea apelacion" on public.apelaciones_suspension;
create policy "Propietario crea apelacion" on public.apelaciones_suspension for insert to authenticated with check (
  usuario_id=auth.uid() and exists(select 1 from public.perfiles_borrador p where p.negocio_id=apelaciones_suspension.negocio_id and p.usuario_id=auth.uid())
);
drop policy if exists "Propietario y admin consultan apelaciones" on public.apelaciones_suspension;
create policy "Propietario y admin consultan apelaciones" on public.apelaciones_suspension for select to authenticated using (usuario_id=auth.uid() or public.es_administrador());
drop policy if exists "Admin resuelve apelaciones" on public.apelaciones_suspension;
create policy "Admin resuelve apelaciones" on public.apelaciones_suspension for update to authenticated using (public.es_administrador()) with check (public.es_administrador());

create or replace function public.propietario_cerrar_temporalmente(p_negocio_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.perfiles_borrador where negocio_id=p_negocio_id and usuario_id=auth.uid()) then raise exception 'No autorizado'; end if;
  update public.negocios set estado_operativo='cerrado_temporalmente', cerrado_temporal_at=now(), activo=true where id=p_negocio_id and estado_operativo<>'suspendido';
  insert into public.historial_negocio(negocio_id,tipo,detalle,actor_id) values(p_negocio_id,'cierre_temporal','Cierre temporal solicitado por el propietario',auth.uid());
end; $$;

create or replace function public.propietario_reabrir_negocio(p_negocio_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.perfiles_borrador where negocio_id=p_negocio_id and usuario_id=auth.uid()) then raise exception 'No autorizado'; end if;
  if exists(select 1 from public.negocios where id=p_negocio_id and estado_operativo='suspendido') then raise exception 'El negocio está suspendido por administración'; end if;
  update public.negocios set estado_operativo='activo', cerrado_temporal_at=null, activo=true where id=p_negocio_id;
  insert into public.historial_negocio(negocio_id,tipo,detalle,actor_id) values(p_negocio_id,'reapertura','Negocio reabierto por el propietario',auth.uid());
end; $$;

create or replace function public.propietario_solicitar_eliminacion(p_negocio_id uuid)
returns timestamptz language plpgsql security definer set search_path=public as $$
declare v_fecha timestamptz:=now()+interval '30 days';
begin
  if not exists(select 1 from public.perfiles_borrador where negocio_id=p_negocio_id and usuario_id=auth.uid()) then raise exception 'No autorizado'; end if;
  update public.negocios set estado_operativo='eliminacion_programada', activo=false, destacado=false, eliminacion_solicitada_at=now(), eliminacion_programada_at=v_fecha, eliminacion_solicitada_por=auth.uid() where id=p_negocio_id;
  insert into public.historial_negocio(negocio_id,tipo,detalle,actor_id) values(p_negocio_id,'eliminacion_programada','Eliminación definitiva programada a 30 días',auth.uid());
  return v_fecha;
end; $$;

create or replace function public.propietario_cancelar_eliminacion(p_negocio_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.perfiles_borrador where negocio_id=p_negocio_id and usuario_id=auth.uid()) then raise exception 'No autorizado'; end if;
  update public.negocios set estado_operativo='activo', activo=true, eliminacion_solicitada_at=null, eliminacion_programada_at=null, eliminacion_solicitada_por=null where id=p_negocio_id and estado_operativo='eliminacion_programada';
  insert into public.historial_negocio(negocio_id,tipo,detalle,actor_id) values(p_negocio_id,'eliminacion_cancelada','El propietario canceló la eliminación',auth.uid());
end; $$;

create or replace function public.admin_suspender_negocio(p_negocio_id uuid,p_motivo text,p_hasta timestamptz default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.es_administrador() then raise exception 'Acceso no autorizado'; end if;
  if coalesce(trim(p_motivo),'')='' then raise exception 'Escribe el motivo de la suspensión'; end if;
  update public.negocios set estado_operativo='suspendido',activo=false,destacado=false,suspendido_at=now(),suspendido_hasta=p_hasta,motivo_suspension=trim(p_motivo),suspendido_por=auth.uid() where id=p_negocio_id;
  insert into public.historial_negocio(negocio_id,tipo,detalle,actor_id) values(p_negocio_id,'suspension',trim(p_motivo),auth.uid());
end; $$;

create or replace function public.admin_levantar_suspension(p_negocio_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.es_administrador() then raise exception 'Acceso no autorizado'; end if;
  update public.negocios set estado_operativo='activo',activo=true,suspendido_at=null,suspendido_hasta=null,motivo_suspension=null,suspendido_por=null where id=p_negocio_id;
  insert into public.historial_negocio(negocio_id,tipo,detalle,actor_id) values(p_negocio_id,'suspension_levantada','Suspensión levantada por administración',auth.uid());
end; $$;

create or replace function public.purgar_negocios_eliminados()
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  if auth.uid() is not null and not public.es_administrador() then raise exception 'Acceso no autorizado'; end if;
  with eliminados as (
    delete from public.negocios where estado_operativo='eliminacion_programada' and eliminacion_programada_at<=now() returning id
  ) select count(*) into v_count from eliminados;
  return v_count;
end; $$;

revoke all on function public.propietario_cerrar_temporalmente(uuid) from public;
revoke all on function public.propietario_reabrir_negocio(uuid) from public;
revoke all on function public.propietario_solicitar_eliminacion(uuid) from public;
revoke all on function public.propietario_cancelar_eliminacion(uuid) from public;
revoke all on function public.admin_suspender_negocio(uuid,text,timestamptz) from public;
revoke all on function public.admin_levantar_suspension(uuid) from public;
revoke all on function public.purgar_negocios_eliminados() from public;
grant execute on function public.propietario_cerrar_temporalmente(uuid) to authenticated;
grant execute on function public.propietario_reabrir_negocio(uuid) to authenticated;
grant execute on function public.propietario_solicitar_eliminacion(uuid) to authenticated;
grant execute on function public.propietario_cancelar_eliminacion(uuid) to authenticated;
grant execute on function public.admin_suspender_negocio(uuid,text,timestamptz) to authenticated;
grant execute on function public.admin_levantar_suspension(uuid) to authenticated;
grant execute on function public.purgar_negocios_eliminados() to authenticated;

commit;
