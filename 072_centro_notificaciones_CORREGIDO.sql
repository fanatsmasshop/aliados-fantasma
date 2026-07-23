-- ALIADOS FANTASMA v2.7
-- Centro de notificaciones: lectura, importantes, avisos obligatorios y eliminación.
-- Ejecutar una sola vez después de 070 y 071.

begin;

alter table public.notificaciones_plataforma
  add column if not exists leida_at timestamptz,
  add column if not exists importante boolean not null default false,
  add column if not exists obligatoria boolean not null default false,
  add column if not exists source_key text;

create unique index if not exists uq_notificacion_source_key
on public.notificaciones_plataforma(source_key)
where source_key is not null;

-- Los avisos de suspensión requieren confirmación de lectura antes de poder borrarse.
update public.notificaciones_plataforma
set importante=true,
    obligatoria=true
where tipo in ('suspension','terminos_actualizados','privacidad_actualizada');

update public.notificaciones_plataforma
set leida_at=coalesce(leida_at,created_at)
where leida=true and leida_at is null;

-- Un usuario puede eliminar sus propias notificaciones.
-- Los avisos obligatorios solo se pueden borrar después de haber sido leídos.
drop policy if exists "Usuario elimina sus notificaciones" on public.notificaciones_plataforma;
create policy "Usuario elimina sus notificaciones"
on public.notificaciones_plataforma for delete to authenticated
using (
  (usuario_id=auth.uid() and (not obligatoria or leida))
  or (para_administracion and public.es_administrador())
);

-- Convierte cada nuevo mensaje administrativo del perfil en una notificación única.
create or replace function public.notificar_comentario_administrador()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.comentario_administrador is not null
     and btrim(new.comentario_administrador) <> ''
     and (tg_op='INSERT' or new.comentario_administrador is distinct from old.comentario_administrador) then
    insert into public.notificaciones_plataforma(
      usuario_id,negocio_id,tipo,titulo,mensaje,importante,source_key
    ) values (
      new.usuario_id,
      new.negocio_id,
      'mensaje_administracion',
      'Mensaje del equipo de Aliados Fantasma',
      btrim(new.comentario_administrador),
      true,
      'comentario_admin:'||coalesce(new.usuario_id::text,'sin_usuario')||':'||coalesce(new.negocio_id::text,'sin_negocio')||':'||md5(btrim(new.comentario_administrador))||':'||coalesce(new.revisado_at,new.updated_at,now())::text
    ) on conflict (source_key) where source_key is not null do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notificar_comentario_administrador on public.perfiles_borrador;
create trigger trg_notificar_comentario_administrador
after insert or update of comentario_administrador on public.perfiles_borrador
for each row execute function public.notificar_comentario_administrador();

-- Migra los mensajes administrativos actuales para que dejen de permanecer fijos en el panel.
insert into public.notificaciones_plataforma(
  usuario_id,negocio_id,tipo,titulo,mensaje,importante,source_key,created_at
)
select
  pb.usuario_id,
  pb.negocio_id,
  'mensaje_administracion',
  'Mensaje del equipo de Aliados Fantasma',
  btrim(pb.comentario_administrador),
  true,
  'comentario_admin_inicial:'||coalesce(pb.usuario_id::text,'sin_usuario')||':'||coalesce(pb.negocio_id::text,'sin_negocio')||':'||md5(btrim(pb.comentario_administrador)),
  coalesce(pb.revisado_at,pb.updated_at,now())
from public.perfiles_borrador pb
where pb.comentario_administrador is not null
  and btrim(pb.comentario_administrador)<>''
on conflict (source_key) where source_key is not null do nothing;

commit;
