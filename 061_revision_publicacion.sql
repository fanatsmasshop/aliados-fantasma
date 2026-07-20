-- ALIADOS FANTASMA — SPRINT 3.2 · REVISIÓN Y PUBLICACIÓN
-- Ejecuta este archivo completo en Supabase > SQL Editor después de 060_onboarding_perfil.sql.

begin;

alter table public.perfiles_borrador add column if not exists negocio_id uuid references public.negocios(id) on delete set null;
alter table public.perfiles_borrador add column if not exists comentario_administrador text;
alter table public.perfiles_borrador add column if not exists revisado_por uuid references auth.users(id) on delete set null;
alter table public.perfiles_borrador add column if not exists revisado_at timestamptz;
alter table public.perfiles_borrador add column if not exists publicado_at timestamptz;

alter table public.perfiles_borrador drop constraint if exists perfiles_borrador_estado_check;
alter table public.perfiles_borrador add constraint perfiles_borrador_estado_check
check (estado in ('borrador','en_revision','cambios_solicitados','aprobado','publicado','rechazado'));

create table if not exists public.galeria_negocio (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) on delete cascade,
  imagen_url text not null,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.galeria_negocio enable row level security;
drop policy if exists "Galeria publica de negocios activos" on public.galeria_negocio;
create policy "Galeria publica de negocios activos" on public.galeria_negocio
for select using (exists(select 1 from public.negocios n where n.id=negocio_id and n.activo=true) or public.es_administrador());
drop policy if exists "Administradores gestionan galeria" on public.galeria_negocio;
create policy "Administradores gestionan galeria" on public.galeria_negocio
for all to authenticated using (public.es_administrador()) with check (public.es_administrador());

create or replace function public.af_slug(texto text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(
    translate(lower(coalesce(texto,'')), 'áéíóúüñ', 'aeiouun'),
    '[^a-z0-9]+','-','g'
  ));
$$;

create or replace function public.admin_solicitar_cambios_perfil(p_usuario_id uuid, p_comentario text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.es_administrador() then raise exception 'Acceso no autorizado'; end if;
  if coalesce(trim(p_comentario),'')='' then raise exception 'Escribe las correcciones solicitadas'; end if;
  update public.perfiles_borrador set estado='cambios_solicitados', comentario_administrador=trim(p_comentario),
    revisado_por=auth.uid(), revisado_at=now(), updated_at=now()
  where usuario_id=p_usuario_id;
  if not found then raise exception 'Perfil no encontrado'; end if;
end; $$;

create or replace function public.admin_rechazar_perfil(p_usuario_id uuid, p_comentario text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.es_administrador() then raise exception 'Acceso no autorizado'; end if;
  if coalesce(trim(p_comentario),'')='' then raise exception 'Escribe el motivo del rechazo'; end if;
  update public.perfiles_borrador set estado='rechazado', comentario_administrador=trim(p_comentario),
    revisado_por=auth.uid(), revisado_at=now(), updated_at=now()
  where usuario_id=p_usuario_id;
  if not found then raise exception 'Perfil no encontrado'; end if;
end; $$;

create or replace function public.admin_publicar_perfil(p_usuario_id uuid, p_comentario text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  d public.perfiles_borrador%rowtype;
  v_negocio uuid;
  v_categoria uuid;
  v_slug text;
  v_base text;
  v_i integer:=1;
  x jsonb;
  idx integer:=0;
  dias text[]:=array['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
begin
  if not public.es_administrador() then raise exception 'Acceso no autorizado'; end if;
  select * into d from public.perfiles_borrador where usuario_id=p_usuario_id for update;
  if not found then raise exception 'Perfil no encontrado'; end if;
  if d.estado not in ('en_revision','cambios_solicitados','aprobado','publicado') then raise exception 'El perfil todavía no fue enviado a revisión'; end if;

  select id into v_categoria from public.categorias where lower(nombre)=lower(coalesce(d.datos->>'categoria','')) limit 1;
  v_base:=public.af_slug(coalesce(d.datos->>'nombre','negocio'));
  if v_base='' then v_base:='negocio'; end if;

  if d.negocio_id is null then
    v_slug:=v_base;
    while exists(select 1 from public.negocios where slug=v_slug) loop v_i:=v_i+1; v_slug:=v_base||'-'||v_i; end loop;
    insert into public.negocios(nombre,slug,categoria_id,whatsapp,telefono,descripcion_corta,descripcion,direccion,colonia,municipio,enlace_maps,logo_url,portada_url,activo,destacado)
    values(coalesce(d.datos->>'nombre','Negocio aliado'),v_slug,v_categoria,nullif(d.datos->>'whatsapp',''),nullif(d.datos->>'telefono',''),nullif(d.datos->>'descripcion_corta',''),nullif(d.datos->>'descripcion',''),nullif(d.datos->>'direccion',''),nullif(d.datos->>'colonia',''),nullif(d.datos->>'municipio',''),nullif(d.datos->>'maps',''),nullif(d.datos->>'logo_url',''),nullif(d.datos->>'portada_url',''),true,false)
    returning id into v_negocio;
  else
    v_negocio:=d.negocio_id;
    select slug into v_slug from public.negocios where id=v_negocio;
    update public.negocios set nombre=coalesce(d.datos->>'nombre',nombre),categoria_id=v_categoria,
      whatsapp=nullif(d.datos->>'whatsapp',''),telefono=nullif(d.datos->>'telefono',''),descripcion_corta=nullif(d.datos->>'descripcion_corta',''),descripcion=nullif(d.datos->>'descripcion',''),direccion=nullif(d.datos->>'direccion',''),colonia=nullif(d.datos->>'colonia',''),municipio=nullif(d.datos->>'municipio',''),enlace_maps=nullif(d.datos->>'maps',''),logo_url=nullif(d.datos->>'logo_url',''),portada_url=nullif(d.datos->>'portada_url',''),activo=true
    where id=v_negocio;
  end if;

  delete from public.horarios_negocio where negocio_id=v_negocio;
  idx:=0;
  for x in select * from jsonb_array_elements(coalesce(d.datos->'horarios','[]'::jsonb)) loop
    idx:=idx+1;
    insert into public.horarios_negocio(negocio_id,dia_semana,hora_apertura,hora_cierre,cerrado)
    values(v_negocio,idx,nullif(x->>'abre','')::time,nullif(x->>'cierra','')::time,coalesce((x->>'cerrado')::boolean,false));
  end loop;

  delete from public.redes_sociales where negocio_id=v_negocio;
  if coalesce(d.datos->>'facebook','')<>'' then insert into public.redes_sociales(negocio_id,plataforma,url,activa) values(v_negocio,'Facebook','https://facebook.com/'||(d.datos->>'facebook'),true); end if;
  if coalesce(d.datos->>'instagram','')<>'' then insert into public.redes_sociales(negocio_id,plataforma,url,activa) values(v_negocio,'Instagram','https://instagram.com/'||(d.datos->>'instagram'),true); end if;
  if coalesce(d.datos->>'tiktok','')<>'' then insert into public.redes_sociales(negocio_id,plataforma,url,activa) values(v_negocio,'TikTok','https://tiktok.com/@'||(d.datos->>'tiktok'),true); end if;
  if coalesce(d.datos->>'youtube','')<>'' then insert into public.redes_sociales(negocio_id,plataforma,url,activa) values(v_negocio,'YouTube','https://youtube.com/@'||(d.datos->>'youtube'),true); end if;
  if coalesce(d.datos->>'web','')<>'' then insert into public.redes_sociales(negocio_id,plataforma,url,activa) values(v_negocio,'Sitio web',d.datos->>'web',true); end if;

  delete from public.promociones where negocio_id=v_negocio;
  for x in select * from jsonb_array_elements(coalesce(d.datos->'promociones','[]'::jsonb)) loop
    if coalesce(x->>'titulo','')<>'' then
      insert into public.promociones(negocio_id,titulo,descripcion,fecha_fin,activa,destacada)
      values(v_negocio,x->>'titulo',nullif(x->>'descripcion',''),nullif(x->>'vigencia','')::timestamptz,true,false);
    end if;
  end loop;

  delete from public.galeria_negocio where negocio_id=v_negocio;
  idx:=0;
  for x in select * from jsonb_array_elements(coalesce(d.datos->'galeria','[]'::jsonb)) loop
    idx:=idx+1; insert into public.galeria_negocio(negocio_id,imagen_url,orden) values(v_negocio,trim(both '"' from x::text),idx);
  end loop;

  update public.perfiles_borrador set negocio_id=v_negocio,estado='publicado',comentario_administrador=nullif(trim(p_comentario),''),revisado_por=auth.uid(),revisado_at=now(),publicado_at=now(),updated_at=now() where usuario_id=p_usuario_id;
  return jsonb_build_object('negocio_id',v_negocio,'slug',v_slug,'url','perfil.html?slug='||v_slug);
end; $$;

revoke all on function public.admin_solicitar_cambios_perfil(uuid,text) from public;
revoke all on function public.admin_rechazar_perfil(uuid,text) from public;
revoke all on function public.admin_publicar_perfil(uuid,text) from public;
grant execute on function public.admin_solicitar_cambios_perfil(uuid,text) to authenticated;
grant execute on function public.admin_rechazar_perfil(uuid,text) to authenticated;
grant execute on function public.admin_publicar_perfil(uuid,text) to authenticated;

commit;
