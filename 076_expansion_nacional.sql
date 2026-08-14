-- ============================================================
-- ALIADOS FANTASMA — EXPANSIÓN NACIONAL MÉXICO
-- Versión: 2026-08-14 NACIONAL1
-- Idempotente. Ejecutar en Supabase > SQL Editor.
-- Conserva los negocios y pre-registros existentes.
-- ============================================================

begin;

-- 1) Geografía nacional compatible con datos existentes.
alter table public.pre_registros add column if not exists estado_region text;
alter table public.pre_registros add column if not exists pais text default 'México';

alter table public.negocios add column if not exists estado_region text;
alter table public.negocios add column if not exists pais text default 'México';
alter table public.negocios add column if not exists localidad text;
alter table public.negocios add column if not exists codigo_postal text;

update public.pre_registros
   set estado_region = 'Estado de México',
       pais = coalesce(nullif(pais,''),'México'),
       updated_at = now()
 where coalesce(nullif(estado_region,''),'') = ''
   and lower(coalesce(municipio,'')) like '%ecatepec%';

update public.pre_registros
   set pais = 'México', updated_at = now()
 where coalesce(nullif(pais,''),'') = '';

update public.negocios
   set estado_region = 'Estado de México',
       pais = coalesce(nullif(pais,''),'México')
 where coalesce(nullif(estado_region,''),'') = ''
   and lower(coalesce(municipio,'')) like '%ecatepec%';

update public.negocios
   set pais = 'México'
 where coalesce(nullif(pais,''),'') = '';

-- Los borradores existentes NO se modifican directamente.
-- El trigger de seguridad proteger_revision_perfil se conserva intacto.
-- Los datos nacionales se incorporan al editar/aprobar/publicar el perfil.

create index if not exists idx_negocios_region_municipio
  on public.negocios (estado_region, municipio)
  where activo = true;

create index if not exists idx_pre_registros_region_municipio
  on public.pre_registros (estado_region, municipio);

-- 2) Alta desde Auth: ahora guarda estado y país además de municipio/colonia.
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
      whatsapp, estado_region, pais, municipio, colonia, correo_verificado, estado
    ) values (
      new.id,
      coalesce(new.email, ''),
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre_responsable'), ''), split_part(coalesce(new.email,''), '@', 1)),
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre_negocio'), ''), 'Negocio por completar'),
      nullif(trim(new.raw_user_meta_data ->> 'categoria'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'whatsapp'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'estado_region'), ''),
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'pais'), ''), 'México'),
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
      estado_region = coalesce(excluded.estado_region, public.pre_registros.estado_region),
      pais = coalesce(excluded.pais, public.pre_registros.pais, 'México'),
      municipio = coalesce(excluded.municipio, public.pre_registros.municipio),
      colonia = coalesce(excluded.colonia, public.pre_registros.colonia),
      correo_verificado = excluded.correo_verificado,
      updated_at = now();
  end if;
  return new;
end;
$$;

-- 3) Reparación/autosincronización de cuentas existentes y nuevas.
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
      whatsapp, estado_region, pais, municipio, colonia, correo_verificado, estado
    ) values (
      v_user.id,
      coalesce(v_user.email, ''),
      coalesce(nullif(trim(v_user.raw_user_meta_data ->> 'nombre_responsable'), ''), split_part(coalesce(v_user.email,''), '@', 1)),
      coalesce(nullif(trim(v_user.raw_user_meta_data ->> 'nombre_negocio'), ''), 'Negocio por completar'),
      nullif(trim(v_user.raw_user_meta_data ->> 'categoria'), ''),
      nullif(trim(v_user.raw_user_meta_data ->> 'whatsapp'), ''),
      nullif(trim(v_user.raw_user_meta_data ->> 'estado_region'), ''),
      coalesce(nullif(trim(v_user.raw_user_meta_data ->> 'pais'), ''), 'México'),
      nullif(trim(v_user.raw_user_meta_data ->> 'municipio'), ''),
      nullif(trim(v_user.raw_user_meta_data ->> 'colonia'), ''),
      v_user.email_confirmed_at is not null,
      'pendiente'
    )
    on conflict (id) do update set
      correo = excluded.correo,
      estado_region = coalesce(excluded.estado_region, public.pre_registros.estado_region),
      pais = coalesce(excluded.pais, public.pre_registros.pais, 'México'),
      municipio = coalesce(excluded.municipio, public.pre_registros.municipio),
      colonia = coalesce(excluded.colonia, public.pre_registros.colonia),
      correo_verificado = excluded.correo_verificado,
      updated_at = now();
  end if;

  select * into v_resultado from public.pre_registros where id = v_user.id;
  return v_resultado;
end;
$$;

-- 4) Aprobar un pre-registro crea el borrador con geografía nacional.
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
        'estado_region', coalesce(resultado.estado_region,''),
        'pais', coalesce(resultado.pais,'México'),
        'municipio', coalesce(resultado.municipio,''),
        'colonia', coalesce(resultado.colonia,''),
        'galeria', '[]'::jsonb,
        'promociones', '[]'::jsonb,
        'horarios', '[]'::jsonb
      ),
      'borrador', 0, now()
    )
    on conflict (usuario_id) do update set
      datos = coalesce(public.perfiles_borrador.datos,'{}'::jsonb)
        || jsonb_build_object(
          'estado_region', coalesce(nullif(public.perfiles_borrador.datos->>'estado_region',''),resultado.estado_region,''),
          'pais', coalesce(nullif(public.perfiles_borrador.datos->>'pais',''),resultado.pais,'México')
        ),
      updated_at = now();
  elsif p_estado = 'rechazado' then
    update public.perfiles
       set estado = 'suspendido', activo = false, updated_at = now()
     where id = resultado.id and rol <> 'administrador';
  end if;

  return resultado;
end;
$$;

-- 5) Publicación: persiste estado, municipio/alcaldía, localidad y CP en el negocio público.
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

  if coalesce(nullif(trim(d.datos->>'estado_region'),''),'') = '' then raise exception 'Falta seleccionar el estado del negocio'; end if;
  if coalesce(nullif(trim(d.datos->>'municipio'),''),'') = '' then raise exception 'Falta municipio o alcaldía'; end if;

  select id into v_categoria from public.categorias where lower(nombre)=lower(coalesce(d.datos->>'categoria','')) limit 1;
  v_base:=public.af_slug(coalesce(d.datos->>'nombre','negocio'));
  if v_base='' then v_base:='negocio'; end if;

  if d.negocio_id is null then
    v_slug:=v_base;
    while exists(select 1 from public.negocios where slug=v_slug) loop v_i:=v_i+1; v_slug:=v_base||'-'||v_i; end loop;
    insert into public.negocios(
      nombre,slug,categoria_id,whatsapp,telefono,descripcion_corta,descripcion,direccion,colonia,localidad,municipio,
      estado_region,pais,codigo_postal,enlace_maps,logo_url,portada_url,activo,destacado,baja_at,motivo_baja,baja_por
    )
    values(
      coalesce(d.datos->>'nombre','Negocio aliado'),v_slug,v_categoria,nullif(d.datos->>'whatsapp',''),nullif(d.datos->>'telefono',''),
      nullif(d.datos->>'descripcion_corta',''),nullif(d.datos->>'descripcion',''),nullif(d.datos->>'direccion',''),nullif(d.datos->>'colonia',''),
      nullif(d.datos->>'localidad',''),nullif(d.datos->>'municipio',''),nullif(d.datos->>'estado_region',''),
      coalesce(nullif(d.datos->>'pais',''),'México'),nullif(d.datos->>'codigo_postal',''),nullif(d.datos->>'maps',''),
      nullif(d.datos->>'logo_url',''),nullif(d.datos->>'portada_url',''),true,false,null,null,null
    ) returning id into v_negocio;
  else
    v_negocio:=d.negocio_id;
    select slug into v_slug from public.negocios where id=v_negocio;
    update public.negocios set
      nombre=coalesce(d.datos->>'nombre',nombre),categoria_id=v_categoria,
      whatsapp=nullif(d.datos->>'whatsapp',''),telefono=nullif(d.datos->>'telefono',''),
      descripcion_corta=nullif(d.datos->>'descripcion_corta',''),descripcion=nullif(d.datos->>'descripcion',''),
      direccion=nullif(d.datos->>'direccion',''),colonia=nullif(d.datos->>'colonia',''),localidad=nullif(d.datos->>'localidad',''),
      municipio=nullif(d.datos->>'municipio',''),estado_region=nullif(d.datos->>'estado_region',''),
      pais=coalesce(nullif(d.datos->>'pais',''),'México'),codigo_postal=nullif(d.datos->>'codigo_postal',''),
      enlace_maps=nullif(d.datos->>'maps',''),logo_url=nullif(d.datos->>'logo_url',''),portada_url=nullif(d.datos->>'portada_url',''),
      activo=true,baja_at=null,motivo_baja=null,baja_por=null
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

revoke all on function public.usuario_sincronizar_mi_pre_registro() from public;
revoke all on function public.usuario_sincronizar_mi_pre_registro() from anon;
revoke all on function public.admin_actualizar_pre_registro(uuid,text,text) from public;
revoke all on function public.admin_publicar_perfil(uuid,text) from public;
grant execute on function public.usuario_sincronizar_mi_pre_registro() to authenticated;
grant execute on function public.admin_actualizar_pre_registro(uuid,text,text) to authenticated;
grant execute on function public.admin_publicar_perfil(uuid,text) to authenticated;

commit;

-- Comprobación rápida
select 'expansion_nacional_ok' as estado,
       count(*) filter (where coalesce(estado_region,'') <> '') as negocios_con_estado,
       count(*) as negocios_totales
from public.negocios;
