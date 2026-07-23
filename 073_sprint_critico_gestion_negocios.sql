-- ALIADOS FANTASMA v4.3 — SPRINT CRÍTICO DE GESTIÓN DE NEGOCIOS
-- Ejecutar una sola vez después de 072_centro_notificaciones_CORREGIDO.sql.
-- Añade: modos de gestión, propietarios/invitaciones, acceso administrativo,
-- porcentaje de perfil y auditoría centralizada.

begin;

alter table public.negocios add column if not exists modo_gestion text not null default 'aliados'
  check (modo_gestion in ('aliados','compartido','autoadministrado'));
alter table public.negocios add column if not exists porcentaje_perfil integer not null default 0
  check (porcentaje_perfil between 0 and 100);
alter table public.negocios add column if not exists archivado_at timestamptz;
alter table public.negocios add column if not exists propietario_principal_id uuid references public.perfiles(id) on delete set null;

create table if not exists public.invitaciones_negocio (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  correo text not null,
  rol text not null default 'propietario' check (rol in ('propietario','administrador','colaborador')),
  token uuid not null default gen_random_uuid() unique,
  estado text not null default 'pendiente' check (estado in ('pendiente','aceptada','cancelada','vencida')),
  vence_at timestamptz not null default (now() + interval '7 days'),
  aceptada_at timestamptz,
  creada_por uuid references public.perfiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invitaciones_negocio_negocio_idx on public.invitaciones_negocio(negocio_id,created_at desc);
create index if not exists invitaciones_negocio_correo_idx on public.invitaciones_negocio(lower(correo),estado);

create table if not exists public.auditoria_plataforma (
  id bigint generated always as identity primary key,
  actor_id uuid references public.perfiles(id) on delete set null,
  negocio_id uuid references public.negocios(id) on delete set null,
  accion text not null,
  entidad text not null default 'negocio',
  entidad_id text,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists auditoria_plataforma_negocio_idx on public.auditoria_plataforma(negocio_id,created_at desc);

alter table public.invitaciones_negocio enable row level security;
alter table public.auditoria_plataforma enable row level security;

drop policy if exists "Admin consulta invitaciones" on public.invitaciones_negocio;
create policy "Admin consulta invitaciones" on public.invitaciones_negocio for select to authenticated
using (public.es_administrador() or lower(correo)=lower(coalesce(auth.jwt()->>'email','')));

drop policy if exists "Admin gestiona invitaciones" on public.invitaciones_negocio;
create policy "Admin gestiona invitaciones" on public.invitaciones_negocio for all to authenticated
using (public.es_administrador()) with check (public.es_administrador());

drop policy if exists "Admin consulta auditoria" on public.auditoria_plataforma;
create policy "Admin consulta auditoria" on public.auditoria_plataforma for select to authenticated
using (public.es_administrador());

create or replace function public.af_calcular_porcentaje_negocio(p_negocio_id uuid)
returns integer language sql stable security definer set search_path=public,auth,pg_temp as $$
  select least(100, round((
    (case when nullif(trim(n.nombre),'') is not null then 1 else 0 end) +
    (case when n.categoria_id is not null then 1 else 0 end) +
    (case when nullif(trim(n.descripcion_corta),'') is not null then 1 else 0 end) +
    (case when nullif(trim(n.whatsapp),'') is not null then 1 else 0 end) +
    (case when nullif(trim(n.direccion),'') is not null then 1 else 0 end) +
    (case when nullif(trim(n.municipio),'') is not null then 1 else 0 end) +
    (case when nullif(trim(n.logo_url),'') is not null then 1 else 0 end) +
    (case when nullif(trim(n.portada_url),'') is not null then 1 else 0 end)
  )::numeric / 8 * 100)::integer) from public.negocios n where n.id=p_negocio_id;
$$;

create or replace function public.admin_actualizar_gestion_negocio(
  p_negocio_id uuid,
  p_modo_gestion text,
  p_activo boolean default null
) returns public.negocios language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare r public.negocios;
begin
  if not public.es_administrador() then raise exception 'No autorizado'; end if;
  if p_modo_gestion not in ('aliados','compartido','autoadministrado') then raise exception 'Modo no permitido'; end if;
  update public.negocios set modo_gestion=p_modo_gestion,
    activo=coalesce(p_activo,activo), porcentaje_perfil=coalesce(public.af_calcular_porcentaje_negocio(id),0),
    actualizado_por=auth.uid(), updated_at=now()
  where id=p_negocio_id returning * into r;
  if r.id is null then raise exception 'Negocio no encontrado'; end if;
  insert into public.auditoria_plataforma(actor_id,negocio_id,accion,entidad_id,detalle)
  values(auth.uid(),p_negocio_id,'gestion_actualizada',p_negocio_id::text,jsonb_build_object('modo_gestion',p_modo_gestion,'activo',r.activo));
  return r;
end; $$;

create or replace function public.admin_crear_invitacion_negocio(p_negocio_id uuid,p_correo text,p_rol text default 'propietario')
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare r public.invitaciones_negocio;
begin
  if not public.es_administrador() then raise exception 'No autorizado'; end if;
  if nullif(trim(p_correo),'') is null then raise exception 'Correo requerido'; end if;
  if p_rol not in ('propietario','administrador','colaborador') then raise exception 'Rol no permitido'; end if;
  update public.invitaciones_negocio set estado='cancelada',updated_at=now()
    where negocio_id=p_negocio_id and lower(correo)=lower(trim(p_correo)) and estado='pendiente';
  insert into public.invitaciones_negocio(negocio_id,correo,rol,creada_por)
  values(p_negocio_id,lower(trim(p_correo)),p_rol,auth.uid()) returning * into r;
  insert into public.auditoria_plataforma(actor_id,negocio_id,accion,entidad_id,detalle)
  values(auth.uid(),p_negocio_id,'invitacion_creada',r.id::text,jsonb_build_object('correo',r.correo,'rol',r.rol));
  return jsonb_build_object('id',r.id,'token',r.token,'correo',r.correo,'rol',r.rol,'vence_at',r.vence_at);
end; $$;

create or replace function public.admin_cancelar_invitacion_negocio(p_invitacion_id uuid)
returns void language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare n uuid;
begin
  if not public.es_administrador() then raise exception 'No autorizado'; end if;
  update public.invitaciones_negocio set estado='cancelada',updated_at=now()
  where id=p_invitacion_id and estado='pendiente' returning negocio_id into n;
  if n is null then raise exception 'Invitación no disponible'; end if;
  insert into public.auditoria_plataforma(actor_id,negocio_id,accion,entidad_id) values(auth.uid(),n,'invitacion_cancelada',p_invitacion_id::text);
end; $$;

create or replace function public.aceptar_invitacion_negocio(p_token uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare i public.invitaciones_negocio; p public.perfiles;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  select * into i from public.invitaciones_negocio where token=p_token for update;
  if i.id is null or i.estado<>'pendiente' then raise exception 'Invitación no disponible'; end if;
  if i.vence_at < now() then update public.invitaciones_negocio set estado='vencida' where id=i.id; raise exception 'La invitación venció'; end if;
  if lower(i.correo)<>lower(coalesce(auth.jwt()->>'email','')) then raise exception 'La invitación pertenece a otro correo'; end if;
  select * into p from public.perfiles where id=auth.uid();
  if p.id is null then
    insert into public.perfiles(id,nombre,correo,rol,estado,activo,updated_at)
    values(auth.uid(),coalesce(auth.jwt()->>'name',split_part(i.correo,'@',1)),i.correo,'propietario','activo',true,now());
  end if;
  insert into public.miembros_negocio(negocio_id,perfil_id,rol,activo,invitado_por,updated_at)
  values(i.negocio_id,auth.uid(),i.rol,true,i.creada_por,now())
  on conflict(negocio_id,perfil_id) do update set rol=excluded.rol,activo=true,updated_at=now();
  update public.negocios set propietario_principal_id=case when i.rol='propietario' then auth.uid() else propietario_principal_id end,
    modo_gestion=case when modo_gestion='aliados' then 'compartido' else modo_gestion end,updated_at=now()
  where id=i.negocio_id;
  update public.invitaciones_negocio set estado='aceptada',aceptada_at=now(),updated_at=now() where id=i.id;
  insert into public.auditoria_plataforma(actor_id,negocio_id,accion,entidad_id,detalle)
  values(auth.uid(),i.negocio_id,'invitacion_aceptada',i.id::text,jsonb_build_object('rol',i.rol));
  return jsonb_build_object('ok',true,'negocio_id',i.negocio_id,'rol',i.rol);
end; $$;

create or replace function public.admin_obtener_contexto_negocio(p_negocio_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare n public.negocios; owner_id uuid; d public.perfiles_borrador;
begin
  if not public.es_administrador() then raise exception 'No autorizado'; end if;
  select * into n from public.negocios where id=p_negocio_id;
  if n.id is null then raise exception 'Negocio no encontrado'; end if;
  select mn.perfil_id into owner_id from public.miembros_negocio mn
    where mn.negocio_id=n.id and mn.activo=true order by case mn.rol when 'propietario' then 1 else 2 end limit 1;
  select * into d from public.perfiles_borrador where negocio_id=n.id order by updated_at desc limit 1;
  insert into public.auditoria_plataforma(actor_id,negocio_id,accion,entidad_id)
  values(auth.uid(),n.id,'acceso_como_negocio',n.id::text);
  return jsonb_build_object('negocio',to_jsonb(n),'propietario_id',owner_id,'borrador',to_jsonb(d));
end; $$;

create or replace function public.admin_listar_invitaciones_negocio(p_negocio_id uuid)
returns setof public.invitaciones_negocio language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
 if not public.es_administrador() then raise exception 'No autorizado'; end if;
 return query select * from public.invitaciones_negocio where negocio_id=p_negocio_id order by created_at desc;
end; $$;

grant execute on function public.af_calcular_porcentaje_negocio(uuid) to authenticated;
grant execute on function public.admin_actualizar_gestion_negocio(uuid,text,boolean) to authenticated;
grant execute on function public.admin_crear_invitacion_negocio(uuid,text,text) to authenticated;
grant execute on function public.admin_cancelar_invitacion_negocio(uuid) to authenticated;
grant execute on function public.aceptar_invitacion_negocio(uuid) to authenticated;
grant execute on function public.admin_obtener_contexto_negocio(uuid) to authenticated;
grant execute on function public.admin_listar_invitaciones_negocio(uuid) to authenticated;

commit;
