-- ALIADOS FANTASMA — ACCESO DIRECTO AL VERIFICAR CORREO
-- 2026-08-14
-- Objetivo: eliminar la aprobación manual de cuenta. La revisión se conserva únicamente para publicar perfiles.

create or replace function public.registrar_pre_registro_desde_auth()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_verified boolean := new.email_confirmed_at is not null;
begin
  if coalesce(new.raw_user_meta_data ->> 'tipo_registro','')='pre_registro_negocio' then
    insert into public.pre_registros(
      id,correo,nombre_responsable,nombre_negocio,categoria,whatsapp,
      estado_region,pais,municipio,colonia,correo_verificado,estado
    ) values(
      new.id,
      coalesce(new.email,''),
      coalesce(nullif(trim(new.raw_user_meta_data->>'nombre_responsable'),''), split_part(coalesce(new.email,''),'@',1)),
      coalesce(nullif(trim(new.raw_user_meta_data->>'nombre_negocio'),''),'Negocio por completar'),
      nullif(trim(new.raw_user_meta_data->>'categoria'),''),
      nullif(trim(new.raw_user_meta_data->>'whatsapp'),''),
      nullif(trim(new.raw_user_meta_data->>'estado_region'),''),
      coalesce(nullif(trim(new.raw_user_meta_data->>'pais'),''),'México'),
      nullif(trim(new.raw_user_meta_data->>'municipio'),''),
      nullif(trim(new.raw_user_meta_data->>'colonia'),''),
      v_verified,
      case when v_verified then 'aprobado' else 'pendiente' end
    )
    on conflict(id) do update set
      correo=excluded.correo,
      nombre_responsable=excluded.nombre_responsable,
      nombre_negocio=excluded.nombre_negocio,
      categoria=coalesce(excluded.categoria,public.pre_registros.categoria),
      whatsapp=coalesce(excluded.whatsapp,public.pre_registros.whatsapp),
      estado_region=coalesce(excluded.estado_region,public.pre_registros.estado_region),
      pais=coalesce(excluded.pais,public.pre_registros.pais,'México'),
      municipio=coalesce(excluded.municipio,public.pre_registros.municipio),
      colonia=coalesce(excluded.colonia,public.pre_registros.colonia),
      correo_verificado=excluded.correo_verificado,
      estado=case when excluded.correo_verificado then 'aprobado' else public.pre_registros.estado end,
      updated_at=now();

    if v_verified then
      update public.perfiles
         set estado='activo', activo=true,
             nombre=coalesce(nullif(trim(new.raw_user_meta_data->>'nombre_responsable'),''),nombre),
             telefono=coalesce(nullif(trim(new.raw_user_meta_data->>'whatsapp'),''),telefono),
             updated_at=now()
       where id=new.id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.actualizar_verificacion_pre_registro()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if old.email_confirmed_at is distinct from new.email_confirmed_at then
    update public.pre_registros
       set correo=coalesce(new.email,correo),
           correo_verificado=new.email_confirmed_at is not null,
           estado=case when new.email_confirmed_at is not null then 'aprobado' else 'pendiente' end,
           updated_at=now()
     where id=new.id;

    if new.email_confirmed_at is not null then
      update public.perfiles
         set estado='activo',activo=true,updated_at=now()
       where id=new.id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.usuario_sincronizar_mi_pre_registro()
returns public.pre_registros
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user auth.users%rowtype;
  v_resultado public.pre_registros;
  v_verified boolean;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  select * into v_user from auth.users where id=auth.uid();
  if v_user.id is null then raise exception 'Usuario no encontrado'; end if;
  v_verified := v_user.email_confirmed_at is not null;

  if coalesce(v_user.raw_user_meta_data->>'tipo_registro','')='pre_registro_negocio' then
    insert into public.pre_registros(
      id,correo,nombre_responsable,nombre_negocio,categoria,whatsapp,
      estado_region,pais,municipio,colonia,correo_verificado,estado
    ) values(
      v_user.id,
      coalesce(v_user.email,''),
      coalesce(nullif(trim(v_user.raw_user_meta_data->>'nombre_responsable'),''),split_part(coalesce(v_user.email,''),'@',1)),
      coalesce(nullif(trim(v_user.raw_user_meta_data->>'nombre_negocio'),''),'Negocio por completar'),
      nullif(trim(v_user.raw_user_meta_data->>'categoria'),''),
      nullif(trim(v_user.raw_user_meta_data->>'whatsapp'),''),
      nullif(trim(v_user.raw_user_meta_data->>'estado_region'),''),
      coalesce(nullif(trim(v_user.raw_user_meta_data->>'pais'),''),'México'),
      nullif(trim(v_user.raw_user_meta_data->>'municipio'),''),
      nullif(trim(v_user.raw_user_meta_data->>'colonia'),''),
      v_verified,
      case when v_verified then 'aprobado' else 'pendiente' end
    )
    on conflict(id) do update set
      correo=excluded.correo,
      nombre_responsable=coalesce(nullif(public.pre_registros.nombre_responsable,''),excluded.nombre_responsable),
      nombre_negocio=coalesce(nullif(public.pre_registros.nombre_negocio,''),excluded.nombre_negocio),
      categoria=coalesce(public.pre_registros.categoria,excluded.categoria),
      whatsapp=coalesce(public.pre_registros.whatsapp,excluded.whatsapp),
      estado_region=coalesce(public.pre_registros.estado_region,excluded.estado_region),
      pais=coalesce(public.pre_registros.pais,excluded.pais,'México'),
      municipio=coalesce(public.pre_registros.municipio,excluded.municipio),
      colonia=coalesce(public.pre_registros.colonia,excluded.colonia),
      correo_verificado=v_verified,
      estado=case when v_verified then 'aprobado' else 'pendiente' end,
      updated_at=now();
  end if;

  if v_verified then
    update public.perfiles
       set estado='activo',activo=true,
           nombre=coalesce(nullif(trim(v_user.raw_user_meta_data->>'nombre_responsable'),''),nombre),
           telefono=coalesce(nullif(trim(v_user.raw_user_meta_data->>'whatsapp'),''),telefono),
           correo=coalesce(v_user.email,correo),
           updated_at=now()
     where id=v_user.id;

    insert into public.perfiles_borrador(usuario_id,datos,estado,porcentaje,updated_at)
    select
      v_user.id,
      jsonb_build_object(
        'nombre',coalesce(nullif(trim(v_user.raw_user_meta_data->>'nombre_negocio'),''),'Negocio por completar'),
        'categoria',coalesce(v_user.raw_user_meta_data->>'categoria',''),
        'whatsapp',coalesce(v_user.raw_user_meta_data->>'whatsapp',''),
        'estado_region',coalesce(v_user.raw_user_meta_data->>'estado_region',''),
        'pais','México',
        'municipio',coalesce(v_user.raw_user_meta_data->>'municipio',''),
        'colonia',coalesce(v_user.raw_user_meta_data->>'colonia',''),
        'galeria','[]'::jsonb,
        'promociones','[]'::jsonb,
        'horarios','[]'::jsonb
      ),
      'borrador',0,now()
    where not exists(select 1 from public.perfiles_borrador where usuario_id=v_user.id)
    on conflict(usuario_id) do nothing;
  end if;

  select * into v_resultado from public.pre_registros where id=v_user.id;
  return v_resultado;
end;
$$;

-- La cuenta se activa automáticamente; la acción administrativa de aprobar el pre-registro deja de ser una API de usuario autenticado.
revoke execute on function public.admin_actualizar_pre_registro(uuid,text,text) from authenticated, anon, public;

create or replace function public.admin_resumen_pre_registro()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.es_administrador() then raise exception 'No autorizado'; end if;
  return jsonb_build_object(
    'pendientes',(select count(*) from public.pre_registros where correo_verificado=false),
    'contactados',0,
    'aprobados',(select count(*) from public.pre_registros where correo_verificado=true),
    'rechazados',0,
    'total',(select count(*) from public.pre_registros),
    'verificados',(select count(*) from public.pre_registros where correo_verificado=true),
    'perfiles_iniciados',(select count(*) from public.perfiles_borrador)
  );
end;
$$;

-- Normaliza las cuentas existentes sin tocar el flujo de revisión de perfiles.
update public.pre_registros
   set estado=case when correo_verificado then 'aprobado' else 'pendiente' end,
       updated_at=now()
 where estado is distinct from case when correo_verificado then 'aprobado' else 'pendiente' end;

update public.perfiles p
   set estado='activo',activo=true,updated_at=now()
 where exists(select 1 from public.pre_registros r where r.id=p.id and r.correo_verificado=true)
   and (p.estado<>'activo' or p.activo is not true);
