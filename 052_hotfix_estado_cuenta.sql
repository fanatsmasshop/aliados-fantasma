-- ALIADOS FANTASMA — HOTFIX ESTADO DE CUENTA v1.3
-- Ejecuta TODO en Supabase > SQL Editor.
-- Permite que cada usuario consulte exclusivamente su propio pre-registro,
-- incluso si un registro antiguo quedó asociado por correo y no por UUID.

begin;

create or replace function public.usuario_obtener_mi_pre_registro()
returns public.pre_registros
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user auth.users%rowtype;
  v_resultado public.pre_registros;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida';
  end if;

  select * into v_user
  from auth.users
  where id = auth.uid();

  if v_user.id is null then
    raise exception 'Usuario no encontrado';
  end if;

  -- Primero busca por UUID, que es la asociación correcta.
  select p.* into v_resultado
  from public.pre_registros p
  where p.id = v_user.id
  limit 1;

  -- Compatibilidad con registros creados por versiones anteriores.
  if v_resultado.id is null and v_user.email is not null then
    select p.* into v_resultado
    from public.pre_registros p
    where lower(trim(p.correo)) = lower(trim(v_user.email))
    order by p.created_at desc
    limit 1;
  end if;

  if v_resultado.id is null then
    return null;
  end if;

  -- Mantiene actualizado el estado real de verificación del correo.
  if v_resultado.correo_verificado is distinct from (v_user.email_confirmed_at is not null) then
    update public.pre_registros
    set correo_verificado = (v_user.email_confirmed_at is not null),
        updated_at = now()
    where id = v_resultado.id
    returning * into v_resultado;
  end if;

  return v_resultado;
end;
$$;

grant execute on function public.usuario_obtener_mi_pre_registro() to authenticated;

commit;

-- Comprobación administrativa opcional.
select id, nombre_negocio, nombre_responsable, correo, correo_verificado, estado
from public.pre_registros
order by created_at desc;
