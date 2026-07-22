-- ALIADOS FANTASMA v2.6
-- Notificaciones visibles para propietarios y administración.
-- Ejecutar una sola vez después de 068 y 069.

begin;

create table if not exists public.notificaciones_plataforma (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references auth.users(id) on delete cascade,
  para_administracion boolean not null default false,
  negocio_id uuid references public.negocios(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  mensaje text not null,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notificaciones_usuario_fecha
on public.notificaciones_plataforma(usuario_id,created_at desc);
create index if not exists idx_notificaciones_admin_fecha
on public.notificaciones_plataforma(para_administracion,created_at desc);

alter table public.notificaciones_plataforma enable row level security;

drop policy if exists "Usuario consulta sus notificaciones" on public.notificaciones_plataforma;
create policy "Usuario consulta sus notificaciones"
on public.notificaciones_plataforma for select to authenticated
using (usuario_id=auth.uid() or (para_administracion and public.es_administrador()));

drop policy if exists "Usuario marca sus notificaciones" on public.notificaciones_plataforma;
create policy "Usuario marca sus notificaciones"
on public.notificaciones_plataforma for update to authenticated
using (usuario_id=auth.uid() or (para_administracion and public.es_administrador()))
with check (usuario_id=auth.uid() or (para_administracion and public.es_administrador()));

create or replace function public.usuario_propietario_negocio(p_negocio_id uuid)
returns uuid language sql stable security definer set search_path=public as $$
  select usuario_id from public.perfiles_borrador
  where negocio_id=p_negocio_id
  order by updated_at desc nulls last
  limit 1;
$$;

create or replace function public.notificar_nuevo_reporte()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_owner uuid;
begin
  v_owner:=public.usuario_propietario_negocio(new.negocio_id);
  insert into public.notificaciones_plataforma(usuario_id,para_administracion,negocio_id,tipo,titulo,mensaje)
  values(null,true,new.negocio_id,'reporte_nuevo','Nuevo reporte recibido','Se recibió un reporte que requiere revisión administrativa.');
  if v_owner is not null then
    insert into public.notificaciones_plataforma(usuario_id,negocio_id,tipo,titulo,mensaje)
    values(v_owner,new.negocio_id,'reporte_recibido','Tu negocio recibió un reporte','Administración revisará el reporte. Esto no representa una suspensión automática.');
  end if;
  return new;
end; $$;

drop trigger if exists trg_notificar_nuevo_reporte on public.reportes_negocio;
create trigger trg_notificar_nuevo_reporte
after insert on public.reportes_negocio
for each row execute function public.notificar_nuevo_reporte();

create or replace function public.notificar_nueva_apelacion()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.notificaciones_plataforma(usuario_id,para_administracion,negocio_id,tipo,titulo,mensaje)
  values(null,true,new.negocio_id,'apelacion_nueva','Nueva apelación recibida','Un negocio suspendido presentó una apelación y requiere revisión.');
  return new;
end; $$;

drop trigger if exists trg_notificar_nueva_apelacion on public.apelaciones_suspension;
create trigger trg_notificar_nueva_apelacion
after insert on public.apelaciones_suspension
for each row execute function public.notificar_nueva_apelacion();

create or replace function public.admin_suspender_negocio(p_negocio_id uuid,p_motivo text,p_hasta timestamptz default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_owner uuid;
begin
  if not public.es_administrador() then raise exception 'Acceso no autorizado'; end if;
  if char_length(coalesce(trim(p_motivo),''))<15 then raise exception 'El motivo debe tener al menos 15 caracteres'; end if;
  update public.negocios set estado_operativo='suspendido',activo=false,destacado=false,suspendido_at=now(),suspendido_hasta=p_hasta,motivo_suspension=trim(p_motivo),suspendido_por=auth.uid() where id=p_negocio_id;
  insert into public.historial_negocio(negocio_id,tipo,detalle,actor_id) values(p_negocio_id,'suspension',trim(p_motivo),auth.uid());
  v_owner:=public.usuario_propietario_negocio(p_negocio_id);
  if v_owner is not null then
    insert into public.notificaciones_plataforma(usuario_id,negocio_id,tipo,titulo,mensaje)
    values(v_owner,p_negocio_id,'suspension','Tu negocio fue suspendido','Motivo: '||trim(p_motivo)||'. Puedes presentar una apelación desde tu panel.');
  end if;
end; $$;

create or replace function public.admin_levantar_suspension(p_negocio_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_owner uuid;
begin
  if not public.es_administrador() then raise exception 'Acceso no autorizado'; end if;
  update public.negocios set estado_operativo='activo',activo=true,suspendido_at=null,suspendido_hasta=null,motivo_suspension=null,suspendido_por=null where id=p_negocio_id;
  insert into public.historial_negocio(negocio_id,tipo,detalle,actor_id) values(p_negocio_id,'suspension_levantada','Suspensión levantada por administración',auth.uid());
  v_owner:=public.usuario_propietario_negocio(p_negocio_id);
  if v_owner is not null then
    insert into public.notificaciones_plataforma(usuario_id,negocio_id,tipo,titulo,mensaje)
    values(v_owner,p_negocio_id,'suspension_levantada','Suspensión levantada','Tu negocio volvió a estar activo y visible.');
  end if;
end; $$;

revoke all on function public.usuario_propietario_negocio(uuid) from public;
grant execute on function public.usuario_propietario_negocio(uuid) to authenticated;

commit;
