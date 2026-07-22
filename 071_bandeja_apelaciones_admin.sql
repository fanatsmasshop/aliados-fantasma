-- ALIADOS FANTASMA v2.6.1
-- Bandeja administrativa y resolución segura de apelaciones.
-- Ejecutar una sola vez después de 070_notificaciones_moderacion.sql.

begin;

create or replace function public.admin_marcar_apelacion_revision(p_apelacion_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.es_administrador() then
    raise exception 'Acceso no autorizado';
  end if;

  update public.apelaciones_suspension
  set estado='en_revision'
  where id=p_apelacion_id
    and estado='pendiente';

  if not found then
    raise exception 'La apelación ya fue procesada o no existe';
  end if;
end;
$$;

create or replace function public.admin_resolver_apelacion(
  p_apelacion_id uuid,
  p_decision text,
  p_respuesta text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_apelacion public.apelaciones_suspension%rowtype;
  v_titulo text;
  v_mensaje text;
begin
  if not public.es_administrador() then
    raise exception 'Acceso no autorizado';
  end if;

  if p_decision not in ('aceptada','rechazada') then
    raise exception 'Decisión no válida';
  end if;

  if char_length(coalesce(trim(p_respuesta),'')) < 15 then
    raise exception 'La respuesta debe tener al menos 15 caracteres';
  end if;

  select * into v_apelacion
  from public.apelaciones_suspension
  where id=p_apelacion_id
  for update;

  if not found then
    raise exception 'La apelación no existe';
  end if;

  if v_apelacion.estado not in ('pendiente','en_revision') then
    raise exception 'La apelación ya fue resuelta';
  end if;

  update public.apelaciones_suspension
  set estado=p_decision,
      respuesta_admin=trim(p_respuesta),
      resolved_at=now()
  where id=p_apelacion_id;

  if p_decision='aceptada' then
    update public.negocios
    set estado_operativo='activo',
        activo=true,
        suspendido_at=null,
        suspendido_hasta=null,
        motivo_suspension=null,
        suspendido_por=null
    where id=v_apelacion.negocio_id;

    insert into public.historial_negocio(negocio_id,tipo,detalle,actor_id)
    values(v_apelacion.negocio_id,'apelacion_aceptada',trim(p_respuesta),auth.uid());

    v_titulo:='Tu apelación fue aceptada';
    v_mensaje:='Tu negocio fue reactivado. Respuesta de administración: '||trim(p_respuesta);
  else
    insert into public.historial_negocio(negocio_id,tipo,detalle,actor_id)
    values(v_apelacion.negocio_id,'apelacion_rechazada',trim(p_respuesta),auth.uid());

    v_titulo:='Tu apelación fue rechazada';
    v_mensaje:='La suspensión continúa. Respuesta de administración: '||trim(p_respuesta);
  end if;

  insert into public.notificaciones_plataforma(
    usuario_id,negocio_id,tipo,titulo,mensaje
  ) values (
    v_apelacion.usuario_id,
    v_apelacion.negocio_id,
    'apelacion_'||p_decision,
    v_titulo,
    v_mensaje
  );
end;
$$;

revoke all on function public.admin_marcar_apelacion_revision(uuid) from public;
revoke all on function public.admin_resolver_apelacion(uuid,text,text) from public;
grant execute on function public.admin_marcar_apelacion_revision(uuid) to authenticated;
grant execute on function public.admin_resolver_apelacion(uuid,text,text) to authenticated;

commit;
