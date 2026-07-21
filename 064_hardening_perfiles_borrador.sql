-- ALIADOS FANTASMA v1.8.1 — HARDENING DE ESTADOS DEL PERFIL
-- Ejecutar después de 063_control_global_lanzamiento.sql.
-- Impide que un propietario se autoapruebe, se publique o altere datos de revisión.

begin;

create or replace function public.af_proteger_revision_perfil()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_es_admin boolean := public.es_administrador();
begin
  if v_es_admin then
    return new;
  end if;

  if auth.uid() is null or new.usuario_id <> auth.uid() then
    raise exception 'No autorizado';
  end if;

  if tg_op = 'INSERT' then
    if new.estado not in ('borrador','en_revision') then
      raise exception 'Estado de perfil no permitido';
    end if;
    if new.negocio_id is not null
       or new.comentario_administrador is not null
       or new.revisado_por is not null
       or new.revisado_at is not null
       or new.publicado_at is not null then
      raise exception 'No puedes establecer datos administrativos';
    end if;
    return new;
  end if;

  if new.usuario_id is distinct from old.usuario_id then
    raise exception 'No puedes cambiar el propietario del perfil';
  end if;

  if new.estado not in ('borrador','en_revision') then
    raise exception 'Estado de perfil no permitido';
  end if;

  if new.negocio_id is distinct from old.negocio_id
     or new.comentario_administrador is distinct from old.comentario_administrador
     or new.revisado_por is distinct from old.revisado_por
     or new.revisado_at is distinct from old.revisado_at
     or new.publicado_at is distinct from old.publicado_at then
    raise exception 'No puedes modificar datos administrativos';
  end if;

  return new;
end;
$$;

drop trigger if exists proteger_revision_perfil on public.perfiles_borrador;
create trigger proteger_revision_perfil
before insert or update on public.perfiles_borrador
for each row execute function public.af_proteger_revision_perfil();

revoke all on function public.af_proteger_revision_perfil() from public;

commit;
