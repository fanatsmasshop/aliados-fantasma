-- Aliados Fantasma v2.1 — Etapa 6: Directorio inteligente
-- Ejecutar después de 066_verificacion_preproduccion.sql.

begin;

create table if not exists public.eventos_directorio (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('vista_directorio','busqueda','profile','whatsapp','maps','telefono','red_social','promocion')),
  negocio_id uuid null references public.negocios(id) on delete set null,
  consulta text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists eventos_directorio_created_at_idx on public.eventos_directorio(created_at desc);
create index if not exists eventos_directorio_negocio_tipo_idx on public.eventos_directorio(negocio_id,tipo,created_at desc);
create index if not exists eventos_directorio_tipo_idx on public.eventos_directorio(tipo,created_at desc);

alter table public.eventos_directorio enable row level security;

revoke all on public.eventos_directorio from anon, authenticated;
grant select on public.eventos_directorio to authenticated;

drop policy if exists "Administradores consultan eventos del directorio" on public.eventos_directorio;
create policy "Administradores consultan eventos del directorio"
on public.eventos_directorio for select
to authenticated
using (public.es_administrador());

create or replace function public.registrar_evento_directorio(
  p_tipo text,
  p_negocio_id uuid default null,
  p_consulta text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_tipo not in ('vista_directorio','busqueda','profile','whatsapp','maps','telefono','red_social','promocion') then
    raise exception 'Tipo de evento no válido';
  end if;

  if p_consulta is not null then
    p_consulta := left(trim(p_consulta),120);
  end if;

  insert into public.eventos_directorio(tipo,negocio_id,consulta,metadata)
  values (p_tipo,p_negocio_id,p_consulta,coalesce(p_metadata,'{}'::jsonb));
end;
$$;

revoke all on function public.registrar_evento_directorio(text,uuid,text,jsonb) from public;
grant execute on function public.registrar_evento_directorio(text,uuid,text,jsonb) to anon, authenticated;

commit;
