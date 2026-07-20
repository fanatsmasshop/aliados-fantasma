-- ALIADOS FANTASMA — v1.7.1 HOTFIX
-- Redes sociales, aprobación en espera de lanzamiento y baja controlada de negocios.
-- Ejecuta este archivo completo en Supabase > SQL Editor después de 061_revision_publicacion.sql.

begin;

-- 1) Redes: acepta todas las plataformas usadas por el configurador.
alter table public.redes_sociales drop constraint if exists redes_plataforma_permitida;
alter table public.redes_sociales add constraint redes_plataforma_permitida
check (lower(trim(plataforma)) in ('facebook','instagram','tiktok','youtube','sitio web','web','whatsapp'));

-- 2) Baja administrativa reversible. No elimina datos ni rompe relaciones.
alter table public.negocios add column if not exists baja_at timestamptz;
alter table public.negocios add column if not exists motivo_baja text;
alter table public.negocios add column if not exists baja_por uuid references auth.users(id) on delete set null;

create or replace function public.admin_dar_baja_negocio(p_negocio_id uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.es_administrador() then raise exception 'Acceso no autorizado'; end if;
  update public.negocios
     set activo=false,
         destacado=false,
         baja_at=now(),
         motivo_baja=nullif(trim(coalesce(p_motivo,'')),''),
         baja_por=auth.uid()
   where id=p_negocio_id;
  if not found then raise exception 'Negocio no encontrado'; end if;
end; $$;

create or replace function public.admin_reactivar_negocio(p_negocio_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.es_administrador() then raise exception 'Acceso no autorizado'; end if;
  update public.negocios
     set activo=true,
         baja_at=null,
         motivo_baja=null,
         baja_por=null
   where id=p_negocio_id;
  if not found then raise exception 'Negocio no encontrado'; end if;
end; $$;

revoke all on function public.admin_dar_baja_negocio(uuid,text) from public;
revoke all on function public.admin_reactivar_negocio(uuid) from public;
grant execute on function public.admin_dar_baja_negocio(uuid,text) to authenticated;
grant execute on function public.admin_reactivar_negocio(uuid) to authenticated;

-- 3) Publicación administrativa: prepara el negocio y lo deja aprobado/en espera.
-- La visibilidad pública sigue bloqueada por la fecha global del lanzamiento.
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
    insert into public.negocios(nombre,slug,categoria_id,whatsapp,telefono,descripcion_corta,descripcion,direccion,colonia,municipio,enlace_maps,logo_url,portada_url,activo,destacado,baja_at,motivo_baja,baja_por)
    values(coalesce(d.datos->>'nombre','Negocio aliado'),v_slug,v_categoria,nullif(d.datos->>'whatsapp',''),nullif(d.datos->>'telefono',''),nullif(d.datos->>'descripcion_corta',''),nullif(d.datos->>'descripcion',''),nullif(d.datos->>'direccion',''),nullif(d.datos->>'colonia',''),nullif(d.datos->>'municipio',''),nullif(d.datos->>'maps',''),nullif(d.datos->>'logo_url',''),nullif(d.datos->>'portada_url',''),true,false,null,null,null)
    returning id into v_negocio;
  else
    v_negocio:=d.negocio_id;
    select slug into v_slug from public.negocios where id=v_negocio;
    update public.negocios set nombre=coalesce(d.datos->>'nombre',nombre),categoria_id=v_categoria,
      whatsapp=nullif(d.datos->>'whatsapp',''),telefono=nullif(d.datos->>'telefono',''),descripcion_corta=nullif(d.datos->>'descripcion_corta',''),descripcion=nullif(d.datos->>'descripcion',''),direccion=nullif(d.datos->>'direccion',''),colonia=nullif(d.datos->>'colonia',''),municipio=nullif(d.datos->>'municipio',''),enlace_maps=nullif(d.datos->>'maps',''),logo_url=nullif(d.datos->>'logo_url',''),portada_url=nullif(d.datos->>'portada_url',''),activo=true,baja_at=null,motivo_baja=null,baja_por=null
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
  if coalesce(d.datos->>'facebook','')<>'' then insert into public.redes_sociales(negocio_id,plataforma,url,activa) values(v_negocio,'facebook','https://facebook.com/'||(d.datos->>'facebook'),true); end if;
  if coalesce(d.datos->>'instagram','')<>'' then insert into public.redes_sociales(negocio_id,plataforma,url,activa) values(v_negocio,'instagram','https://instagram.com/'||(d.datos->>'instagram'),true); end if;
  if coalesce(d.datos->>'tiktok','')<>'' then insert into public.redes_sociales(negocio_id,plataforma,url,activa) values(v_negocio,'tiktok','https://tiktok.com/@'||(d.datos->>'tiktok'),true); end if;
  if coalesce(d.datos->>'youtube','')<>'' then insert into public.redes_sociales(negocio_id,plataforma,url,activa) values(v_negocio,'youtube','https://youtube.com/@'||(d.datos->>'youtube'),true); end if;
  if coalesce(d.datos->>'web','')<>'' then insert into public.redes_sociales(negocio_id,plataforma,url,activa) values(v_negocio,'sitio web',d.datos->>'web',true); end if;

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
    idx:=idx+1;
    insert into public.galeria_negocio(negocio_id,imagen_url,orden) values(v_negocio,trim(both '"' from x::text),idx);
  end loop;

  update public.perfiles_borrador
     set negocio_id=v_negocio,
         estado='aprobado',
         comentario_administrador=nullif(trim(p_comentario),''),
         revisado_por=auth.uid(),
         revisado_at=now(),
         publicado_at=null,
         updated_at=now()
   where usuario_id=p_usuario_id;

  return jsonb_build_object('negocio_id',v_negocio,'slug',v_slug,'url','perfil.html?slug='||v_slug,'estado','aprobado');
end; $$;

revoke all on function public.admin_publicar_perfil(uuid,text) from public;
grant execute on function public.admin_publicar_perfil(uuid,text) to authenticated;

commit;
