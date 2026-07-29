-- ALIADOS FANTASMA — AF-120
-- Repara el ciclo Marketing -> Login -> Panel.
-- Crea la membresía faltante para negocios ya vinculados a un borrador
-- y asegura que las publicaciones futuras la creen automáticamente.
-- Idempotente: puede ejecutarse más de una vez.

begin;

create or replace function public.af_asegurar_membresia_propietario()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.negocio_id is null then
    return new;
  end if;

  -- Solo vincula usuarios que ya existen como perfiles de la plataforma.
  if exists (select 1 from public.perfiles p where p.id = new.usuario_id) then
    insert into public.miembros_negocio (
      negocio_id, perfil_id, rol, activo, invitado_por, updated_at
    ) values (
      new.negocio_id,
      new.usuario_id,
      'propietario',
      true,
      new.revisado_por,
      now()
    )
    on conflict (negocio_id, perfil_id) do update set
      rol = 'propietario',
      activo = true,
      updated_at = now();
  end if;

  return new;
end;
$$;

revoke all on function public.af_asegurar_membresia_propietario() from public;

drop trigger if exists trg_af_asegurar_membresia_propietario
on public.perfiles_borrador;

create trigger trg_af_asegurar_membresia_propietario
after insert or update of negocio_id, estado
on public.perfiles_borrador
for each row
when (new.negocio_id is not null)
execute function public.af_asegurar_membresia_propietario();

-- Repara negocios existentes cuya publicación no creó membresía.
insert into public.miembros_negocio (
  negocio_id, perfil_id, rol, activo, invitado_por, updated_at
)
select
  pb.negocio_id,
  pb.usuario_id,
  'propietario',
  true,
  pb.revisado_por,
  now()
from public.perfiles_borrador pb
join public.perfiles p on p.id = pb.usuario_id
join public.negocios n on n.id = pb.negocio_id
where pb.negocio_id is not null
on conflict (negocio_id, perfil_id) do update set
  rol = 'propietario',
  activo = true,
  updated_at = now();

-- Mantiene propietario_principal_id cuando esa columna existe.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='negocios'
      and column_name='propietario_principal_id'
  ) then
    execute $q$
      update public.negocios n
      set propietario_principal_id = coalesce(n.propietario_principal_id, pb.usuario_id),
          updated_at = now()
      from public.perfiles_borrador pb
      where pb.negocio_id = n.id
        and pb.negocio_id is not null
    $q$;
  end if;
end;
$$;

commit;

select
  'AF-120 VINCULACIÓN DE PROPIETARIOS INSTALADA' as resultado,
  count(*) as membresias_propietarias
from public.miembros_negocio
where rol::text = 'propietario' and activo = true;
