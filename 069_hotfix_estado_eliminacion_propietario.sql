-- ALIADOS FANTASMA — v2.5.1
-- Permite al propietario consultar el estado de su negocio aunque esté oculto
-- por eliminación programada o suspensión.

begin;

create or replace function public.propietario_obtener_estado_negocio(p_negocio_id uuid)
returns table (
  id uuid,
  nombre text,
  estado_operativo text,
  motivo_suspension text,
  suspendido_hasta timestamptz,
  eliminacion_solicitada_at timestamptz,
  eliminacion_programada_at timestamptz,
  activo boolean
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists (
    select 1
    from public.perfiles_borrador p
    where p.negocio_id=p_negocio_id
      and p.usuario_id=auth.uid()
  ) and not public.es_administrador() then
    raise exception 'No autorizado';
  end if;

  return query
  select n.id,n.nombre,n.estado_operativo,n.motivo_suspension,n.suspendido_hasta,
         n.eliminacion_solicitada_at,n.eliminacion_programada_at,n.activo
  from public.negocios n
  where n.id=p_negocio_id;
end;
$$;

revoke all on function public.propietario_obtener_estado_negocio(uuid) from public;
grant execute on function public.propietario_obtener_estado_negocio(uuid) to authenticated;

commit;
