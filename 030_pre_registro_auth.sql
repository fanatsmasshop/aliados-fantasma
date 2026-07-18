-- ALIADOS FANTASMA — PRE-REGISTRO, VERIFICACIÓN Y REVISIÓN
-- Ejecutar una sola vez en Supabase > SQL Editor.

create table if not exists public.pre_registros (
  id uuid primary key references auth.users(id) on delete cascade,
  correo text not null,
  nombre_responsable text not null,
  nombre_negocio text not null,
  categoria text,
  whatsapp text,
  municipio text,
  colonia text,
  correo_verificado boolean not null default false,
  estado text not null default 'pendiente' check (estado in ('pendiente','contactado','aprobado','rechazado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pre_registros enable row level security;

drop policy if exists "Administradores consultan pre registros" on public.pre_registros;
drop policy if exists "Administradores actualizan pre registros" on public.pre_registros;

create policy "Administradores consultan pre registros"
on public.pre_registros for select
to authenticated
using (public.es_administrador());

create policy "Administradores actualizan pre registros"
on public.pre_registros for update
to authenticated
using (public.es_administrador())
with check (public.es_administrador());

grant select, update on public.pre_registros to authenticated;

create or replace function public.registrar_pre_registro_desde_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'tipo_registro', '') = 'pre_registro_negocio' then
    insert into public.pre_registros (
      id, correo, nombre_responsable, nombre_negocio, categoria,
      whatsapp, municipio, colonia, correo_verificado
    ) values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data ->> 'nombre_responsable', ''),
      coalesce(new.raw_user_meta_data ->> 'nombre_negocio', ''),
      new.raw_user_meta_data ->> 'categoria',
      new.raw_user_meta_data ->> 'whatsapp',
      new.raw_user_meta_data ->> 'municipio',
      new.raw_user_meta_data ->> 'colonia',
      new.email_confirmed_at is not null
    )
    on conflict (id) do update set
      correo = excluded.correo,
      nombre_responsable = excluded.nombre_responsable,
      nombre_negocio = excluded.nombre_negocio,
      categoria = excluded.categoria,
      whatsapp = excluded.whatsapp,
      municipio = excluded.municipio,
      colonia = excluded.colonia,
      correo_verificado = excluded.correo_verificado,
      updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists crear_pre_registro_al_registrarse on auth.users;
create trigger crear_pre_registro_al_registrarse
after insert on auth.users
for each row execute function public.registrar_pre_registro_desde_auth();

create or replace function public.actualizar_verificacion_pre_registro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.email_confirmed_at is distinct from new.email_confirmed_at
     and new.email_confirmed_at is not null then
    update public.pre_registros
    set correo_verificado = true, updated_at = now()
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists actualizar_verificacion_pre_registro on auth.users;
create trigger actualizar_verificacion_pre_registro
after update of email_confirmed_at on auth.users
for each row execute function public.actualizar_verificacion_pre_registro();
