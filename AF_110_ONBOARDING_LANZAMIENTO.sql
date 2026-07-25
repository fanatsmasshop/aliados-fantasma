-- ALIADOS FANTASMA — AF-110 ONBOARDING RC2
-- Ejecutar UNA VEZ en Supabase > SQL Editor antes de subir panel.html/panel.js.
-- Idempotente. No elimina negocios, usuarios ni perfiles existentes.

begin;

create table if not exists public.perfiles_borrador (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  datos jsonb not null default '{}'::jsonb,
  estado text not null default 'borrador',
  porcentaje integer not null default 0,
  enviado_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.perfiles_borrador add column if not exists negocio_id uuid references public.negocios(id) on delete set null;
alter table public.perfiles_borrador add column if not exists comentario_administrador text;
alter table public.perfiles_borrador add column if not exists revisado_por uuid references auth.users(id) on delete set null;
alter table public.perfiles_borrador add column if not exists revisado_at timestamptz;
alter table public.perfiles_borrador add column if not exists publicado_at timestamptz;

alter table public.perfiles_borrador drop constraint if exists perfiles_borrador_estado_check;
alter table public.perfiles_borrador add constraint perfiles_borrador_estado_check
check (estado in ('borrador','en_revision','cambios_solicitados','aprobado','publicado','rechazado'));

alter table public.perfiles_borrador drop constraint if exists perfiles_borrador_porcentaje_check;
alter table public.perfiles_borrador add constraint perfiles_borrador_porcentaje_check check (porcentaje between 0 and 100);

alter table public.perfiles_borrador enable row level security;

drop policy if exists "Usuarios consultan su borrador" on public.perfiles_borrador;
create policy "Usuarios consultan su borrador" on public.perfiles_borrador
for select to authenticated
using (usuario_id = auth.uid() or public.es_administrador());

drop policy if exists "Usuarios crean su borrador" on public.perfiles_borrador;
create policy "Usuarios crean su borrador" on public.perfiles_borrador
for insert to authenticated
with check (usuario_id = auth.uid() or public.es_administrador());

drop policy if exists "Usuarios actualizan su borrador" on public.perfiles_borrador;
create policy "Usuarios actualizan su borrador" on public.perfiles_borrador
for update to authenticated
using (usuario_id = auth.uid() or public.es_administrador())
with check (usuario_id = auth.uid() or public.es_administrador());

-- Protege campos administrativos y permite el ciclo real:
-- borrador/correcciones/rechazo/publicado -> borrador -> en_revision.
create or replace function public.af_proteger_revision_perfil()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_es_admin boolean := public.es_administrador();
begin
  if v_es_admin then return new; end if;
  if auth.uid() is null or new.usuario_id <> auth.uid() then raise exception 'No autorizado'; end if;

  if tg_op = 'INSERT' then
    if new.estado not in ('borrador','en_revision') then raise exception 'Estado de perfil no permitido'; end if;
    if new.negocio_id is not null or new.comentario_administrador is not null
       or new.revisado_por is not null or new.revisado_at is not null or new.publicado_at is not null then
      raise exception 'No puedes establecer datos administrativos';
    end if;
    return new;
  end if;

  if new.usuario_id is distinct from old.usuario_id then raise exception 'No puedes cambiar el propietario del perfil'; end if;
  if new.negocio_id is distinct from old.negocio_id
     or new.comentario_administrador is distinct from old.comentario_administrador
     or new.revisado_por is distinct from old.revisado_por
     or new.revisado_at is distinct from old.revisado_at
     or new.publicado_at is distinct from old.publicado_at then
    raise exception 'No puedes modificar datos administrativos';
  end if;

  if new.estado not in ('borrador','en_revision') then raise exception 'Estado de perfil no permitido'; end if;
  if new.estado = 'en_revision' and coalesce(new.porcentaje,0) < 60 then
    raise exception 'Completa al menos 60%% del perfil antes de enviarlo';
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_revision_perfil on public.perfiles_borrador;
create trigger proteger_revision_perfil
before insert or update on public.perfiles_borrador
for each row execute function public.af_proteger_revision_perfil();

revoke all on function public.af_proteger_revision_perfil() from public;

-- Bucket de medios. Mantiene archivos públicos para perfiles públicos,
-- pero cada propietario solo puede escribir en su carpeta UID/.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('negocios-media','negocios-media',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public=true,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Medios publicos de negocios" on storage.objects;
create policy "Medios publicos de negocios" on storage.objects
for select using (bucket_id='negocios-media');

drop policy if exists "Propietarios suben sus imagenes" on storage.objects;
create policy "Propietarios suben sus imagenes" on storage.objects
for insert to authenticated with check (
  bucket_id='negocios-media' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Propietarios actualizan sus imagenes" on storage.objects;
create policy "Propietarios actualizan sus imagenes" on storage.objects
for update to authenticated using (
  bucket_id='negocios-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_administrador())
) with check (
  bucket_id='negocios-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_administrador())
);

drop policy if exists "Propietarios eliminan sus imagenes" on storage.objects;
create policy "Propietarios eliminan sus imagenes" on storage.objects
for delete to authenticated using (
  bucket_id='negocios-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_administrador())
);

create index if not exists perfiles_borrador_estado_idx on public.perfiles_borrador(estado);
create index if not exists perfiles_borrador_negocio_idx on public.perfiles_borrador(negocio_id);
create index if not exists perfiles_borrador_updated_idx on public.perfiles_borrador(updated_at desc);

commit;

select 'AF-110 ONBOARDING RC2 INSTALADO' as resultado;
