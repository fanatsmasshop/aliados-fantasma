-- ALIADOS FANTASMA
-- Sprint crítico: administrar cualquier negocio y eliminarlo desde administración.
-- Ejecutar una sola vez en Supabase > SQL Editor.

create or replace function public.admin_eliminar_negocio_definitivo(p_negocio_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
begin
  if not public.es_administrador() then
    raise exception 'Acceso no autorizado';
  end if;

  select nombre into v_nombre
  from public.negocios
  where id = p_negocio_id;

  if v_nombre is null then
    raise exception 'El negocio no existe o ya fue eliminado';
  end if;

  -- El historial puede tener una llave foránea hacia negocios.
  -- Se registra primero y luego se eliminan relaciones conocidas.
  insert into public.historial_negocio (negocio_id, tipo, detalle, actor_id)
  values (p_negocio_id, 'eliminacion_definitiva', 'Eliminado definitivamente por administración: ' || v_nombre, auth.uid());

  -- Relaciones que pueden no tener ON DELETE CASCADE en instalaciones antiguas.
  delete from public.notificaciones where negocio_id = p_negocio_id;
  delete from public.apelaciones_suspension where negocio_id = p_negocio_id;
  delete from public.reportes_negocio where negocio_id = p_negocio_id;
  delete from public.miembros_negocio where negocio_id = p_negocio_id;
  delete from public.perfiles_borrador where negocio_id = p_negocio_id;

  -- Si historial_negocio no tiene cascada, se elimina al final.
  delete from public.historial_negocio where negocio_id = p_negocio_id;
  delete from public.negocios where id = p_negocio_id;

  if not found then
    raise exception 'No fue posible eliminar el negocio';
  end if;
end;
$$;

revoke all on function public.admin_eliminar_negocio_definitivo(uuid) from public;
grant execute on function public.admin_eliminar_negocio_definitivo(uuid) to authenticated;
