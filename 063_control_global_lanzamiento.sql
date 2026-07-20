-- Aliados Fantasma v1.8.0
-- Control global y seguro del lanzamiento.

create table if not exists public.configuracion_sistema (
  id smallint primary key default 1 check (id = 1),
  modo_lanzamiento text not null default 'automatico'
    check (modo_lanzamiento in ('automatico','cerrado','abierto')),
  lanzamiento_at timestamptz not null default '2026-08-24 20:30:00+00',
  actualizado_at timestamptz not null default now(),
  actualizado_por uuid references auth.users(id)
);

insert into public.configuracion_sistema (id, modo_lanzamiento, lanzamiento_at)
values (1, 'automatico', '2026-08-24 20:30:00+00')
on conflict (id) do nothing;

alter table public.configuracion_sistema enable row level security;

drop policy if exists "configuracion lanzamiento lectura publica" on public.configuracion_sistema;
create policy "configuracion lanzamiento lectura publica"
on public.configuracion_sistema for select
to anon, authenticated
using (id = 1);

drop policy if exists "configuracion lanzamiento administradores" on public.configuracion_sistema;
create policy "configuracion lanzamiento administradores"
on public.configuracion_sistema for update
to authenticated
using (
  exists (
    select 1 from public.perfiles p
    where p.id = auth.uid() and p.rol = 'administrador' and p.activo = true
  )
)
with check (
  id = 1 and exists (
    select 1 from public.perfiles p
    where p.id = auth.uid() and p.rol = 'administrador' and p.activo = true
  )
);

grant select on public.configuracion_sistema to anon, authenticated;
grant update on public.configuracion_sistema to authenticated;

create or replace function public.admin_actualizar_modo_lanzamiento(p_modo text)
returns public.configuracion_sistema
language plpgsql
security definer
set search_path = public
as $$
declare
  resultado public.configuracion_sistema;
begin
  if not exists (
    select 1 from public.perfiles p
    where p.id = auth.uid() and p.rol = 'administrador' and p.activo = true
  ) then
    raise exception 'Acceso administrativo requerido';
  end if;

  if p_modo not in ('automatico','cerrado','abierto') then
    raise exception 'Modo de lanzamiento no válido';
  end if;

  update public.configuracion_sistema
  set modo_lanzamiento = p_modo,
      actualizado_at = now(),
      actualizado_por = auth.uid()
  where id = 1
  returning * into resultado;

  return resultado;
end;
$$;

grant execute on function public.admin_actualizar_modo_lanzamiento(text) to authenticated;
